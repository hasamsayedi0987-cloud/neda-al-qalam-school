package af.nedaalqalam.school;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashSet;
import java.util.Set;

/**
 * سرویس اعلان بومی مکتب خصوصی نداالقلم — نسخهٔ ۳.۰.۰
 *
 * هدف: اعلان‌های غیبت شاگرد، نمرات و پیام‌های جدید «مثل پیام گوشی» بیایند —
 * حتی وقتی اپ کاملاً بسته است (بدون Firebase، بدون سرویس گوگل).
 *
 * کارکرد:
 *  - هر ~۹۰ ثانیه /api/notifications/poll را با کوکی نشست صدا می‌زند
 *  - اعلان‌های جدید را به‌شکل اعلان واقعی اندروید (صدا + لرزش) نشان می‌دهد
 *  - لمس اعلان → باز شدن اپ مستقیم در همان بخش (مثلاً پیام‌ها)
 *  - ۴۰۱ (خارج‌شده/بدون نشست) → فاصلهٔ بیشتر؛ هیچ اعلان نادرست نشان نمی‌دهد
 *  - اولین اجرا فقط «خط پایه» می‌گیرد تا اعلان‌های قدیمی اسپم نشوند
 *  - برگشت انترنت → پول فوری | بیدارباش هر ۳ دقیقه توسط آلارم (حفاظ)
 */
public class NotifyService extends Service {

    private static final String PREFS = "noq_prefs";
    private static final String KEY_URL = "server_url";
    private static final String KEY_LAST_SHOWN = "notif_last_shown_ms";
    private static final String KEY_SHOWN_IDS = "notif_shown_ids";
    private static final String CHANNEL_NEW = "noq_school_new";
    private static final String CHANNEL_FG = "noq_school_foreground";
    private static final int FG_ID = 1001;
    private static final long POLL_MS = 90_000L;          // واردشده و آنلاین
    private static final long BACKOFF_MS = 5 * 60_000L;   // خطای شبکه
    private static final long IDLE_MS = 10 * 60_000L;     // بدون نشست (۴۰۱)

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final java.text.SimpleDateFormat iso =
            new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US);
    private boolean polling = false;
    private ConnectivityManager.NetworkCallback netCallback;

    private final Runnable pollRun = new Runnable() {
        @Override
        public void run() {
            poll();
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        iso.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        createChannels();
        // اعلان کم‌صدای سرویس پیش‌زمینه — الزام اندروید؛ کاربر می‌داند چرا اپ زنده است
        Notification fg = buildNotification(
                "اعلان‌های مکتب فعال است",
                "حاضری، نمرات و پیام‌های جدید به‌موقع به شما خبر داده می‌شوند.",
                null, CHANNEL_FG, false);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(FG_ID, fg, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(FG_ID, fg);
        }
        registerNetworkCallback();
        scheduleAlarmWatchdog();
        handler.postDelayed(pollRun, 2500); // پول اول پس از بازشدن
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "POLL".equals(intent.getAction())) {
            handler.removeCallbacks(pollRun);
            handler.postDelayed(pollRun, 800);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        unregisterNetwork();
        super.onDestroy();
    }

    /* ─────────────── حلقهٔ نظرسنجی ─────────────── */

    private void poll() {
        final SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        final String server = prefs.getString(KEY_URL, "");
        if (server == null || server.isEmpty() || !server.startsWith("http")) {
            stopSelf(); // آدرس سرور تنظیم نشده — سرویس بی‌معناست
            return;
        }
        if (polling) {
            scheduleNext(POLL_MS);
            return;
        }
        polling = true;
        final PowerManager.WakeLock wl = acquireWakeLock();
        new Thread(new Runnable() {
            @Override
            public void run() {
                long next = POLL_MS;
                try {
                    String cookie = CookieManager.getInstance().getCookie(server);
                    String since = prefs.getString(KEY_LAST_SHOWN, "");
                    String u = server + "/api/notifications/poll";
                    if (!since.isEmpty()) {
                        u += "?since=" + URLEncoder.encode(since, "UTF-8");
                    }
                    HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
                    c.setConnectTimeout(10_000);
                    c.setReadTimeout(10_000);
                    c.setRequestProperty("Accept", "application/json");
                    if (cookie != null && !cookie.isEmpty()) c.setRequestProperty("Cookie", cookie);
                    int code = c.getResponseCode();
                    if (code == 200) {
                        StringBuilder sb = new StringBuilder();
                        BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
                        String line;
                        while ((line = r.readLine()) != null) sb.append(line);
                        r.close();
                        JSONObject o = new JSONObject(sb.toString());
                        String serverTime = o.optString("serverTime", "");
                        JSONArray arr = o.optJSONArray("notifications");
                        if (since.isEmpty()) {
                            // بار اول: فقط خط پایه — اعلان‌های قدیمی نشان داده نمی‌شوند
                            if (!serverTime.isEmpty()) {
                                prefs.edit().putString(KEY_LAST_SHOWN, serverTime).apply();
                            }
                        } else if (arr != null && arr.length() > 0) {
                            Set<String> shown = readShownIds(prefs);
                            // قدیمی‌ترین اول — ترتیب درست اعلان‌ها
                            for (int i = arr.length() - 1; i >= 0; i--) {
                                JSONObject n = arr.getJSONObject(i);
                                String id = n.optString("id", "");
                                String createdAt = n.optString("createdAt", "");
                                if (id.isEmpty() || shown.contains(id)) continue;
                                if (!createdAt.isEmpty() && since.compareTo(createdAt) >= 0) continue;
                                showNotification(prefs, server, serverUrl(server, n.optString("url", "/")),
                                        n.optString("title", "مکتب خصوصی نداالقلم"),
                                        n.optString("body", ""), id);
                                shown.add(id);
                            }
                            saveShownIds(prefs, shown);
                            if (!serverTime.isEmpty()) {
                                prefs.edit().putString(KEY_LAST_SHOWN, serverTime).apply();
                            }
                        }
                        next = POLL_MS;
                    } else if (code == 401) {
                        // نشست نیست (خارج شده/نشست منقضی) — هیچ اعلانی نشان نمی‌دهیم
                        next = IDLE_MS;
                    } else {
                        next = BACKOFF_MS;
                    }
                    c.disconnect();
                } catch (Exception e) {
                    next = BACKOFF_MS; // بی‌انترنت — بعداً دوباره
                }
                releaseWakeLock(wl);
                polling = false;
                scheduleNext(next);
            }
        }, "noq-notif-poll").start();
    }

    private void scheduleNext(long ms) {
        handler.removeCallbacks(pollRun);
        handler.postDelayed(pollRun, ms);
    }

    private static String serverUrl(String server, String path) {
        if (path == null || path.isEmpty() || path.charAt(0) != '/') return server + "/" + (path == null ? "" : path);
        return server + path;
    }

    /* ─────────────── نشان‌دادن اعلان‌ها ─────────────── */

    private void showNotification(SharedPreferences prefs, String server, String openUrl, String title, String body, String id) {
        try {
            Notification n = buildNotification(title, body, openUrl, CHANNEL_NEW, true);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            int nid = 2000 + (Math.abs(id.hashCode()) % 100000);
            nm.notify(nid, n);
        } catch (Exception ignored) { }
    }

    private Notification buildNotification(String title, String body, String openUrl, String channelId, boolean alert) {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, channelId);
        } else {
            b = new Notification.Builder(this);
            if (alert) {
                b.setPriority(Notification.PRIORITY_HIGH);
                b.setDefaults(Notification.DEFAULT_ALL);
            } else {
                b.setPriority(Notification.PRIORITY_LOW);
            }
        }
        b.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setOnlyAlertOnce(!alert)
                .setContentIntent(openIntent(openUrl));
        return b.build();
    }

    private PendingIntent openIntent(String openUrl) {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("open_url", openUrl);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 3001, i, flags);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel important = new NotificationChannel(CHANNEL_NEW,
                "اعلان‌های مکتب (حاضری، نمرات، پیام‌ها)",
                NotificationManager.IMPORTANCE_HIGH);
        important.setDescription("اعلان‌های مهم مکتب — مثل پیام گوشی، حتی وقتی اپ بسته است");
        important.enableLights(true);
        important.enableVibration(true);
        nm.createNotificationChannel(important);

        NotificationChannel fg = new NotificationChannel(CHANNEL_FG,
                "سرویس اعلان مکتب",
                NotificationManager.IMPORTANCE_MIN);
        fg.setDescription("اعلان کم‌صدای فعال‌بودن سرویس اعلان — برای قطع نشدن خبرها");
        fg.setShowBadge(false);
        nm.createNotificationChannel(fg);
    }

    /* ─────────────── شناسه‌های نشان‌داده‌شده (ضد تکرار) ─────────────── */

    private Set<String> readShownIds(SharedPreferences prefs) {
        Set<String> out = new HashSet<String>();
        try {
            JSONArray a = new JSONArray(prefs.getString(KEY_SHOWN_IDS, "[]"));
            for (int i = 0; i < a.length(); i++) out.add(a.optString(i));
        } catch (Exception ignored) { }
        return out;
    }

    private void saveShownIds(SharedPreferences prefs, Set<String> ids) {
        try {
            // فقط ۵۰ آیتم آخر — حافظه همیشه کوچک می‌ماند (بدون کندشدن با گذشت زمان)
            JSONArray a = new JSONArray();
            String[] arr = ids.toArray(new String[0]);
            int start = Math.max(0, arr.length - 50);
            for (int i = arr.length - 1; i >= start; i--) a.put(arr[i]);
            prefs.edit().putString(KEY_SHOWN_IDS, a.toString()).apply();
        } catch (Exception ignored) { }
    }

    /* ─────────────── بیدارباش و شبکه ─────────────── */

    private PowerManager.WakeLock acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "noq:poll");
            wl.setReferenceCounted(false);
            wl.acquire(15_000);
            return wl;
        } catch (Exception e) {
            return null;
        }
    }

    private void releaseWakeLock(PowerManager.WakeLock wl) {
        try {
            if (wl != null && wl.isHeld()) wl.release();
        } catch (Exception ignored) { }
    }

    /** حفاظ: حتی وقتی حلقهٔ عادی خوابیده، هر ۳ دقیقه یک پول تضمین می‌شود */
    private void scheduleAlarmWatchdog() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(this, PollReceiver.class);
            i.setAction("af.nedaalqalam.school.POLL");
            PendingIntent pi = PendingIntent.getBroadcast(this, 2001, i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.cancel(pi);
            am.setInexactRepeating(AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + 180_000L, 180_000L, pi);
        } catch (Exception ignored) { }
    }

    private void registerNetworkCallback() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;
            NetworkRequest req = new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build();
            netCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    // برگشت انترنت → پول فوری (اعلان‌های عقب‌مانده همان لحظه می‌آیند)
                    handler.removeCallbacks(pollRun);
                    handler.postDelayed(pollRun, 1500);
                }
            };
            cm.registerNetworkCallback(req, netCallback);
        } catch (Exception ignored) { }
    }

    private void unregisterNetwork() {
        if (netCallback == null) return;
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) cm.unregisterNetworkCallback(netCallback);
        } catch (Exception ignored) { }
        netCallback = null;
    }
}
