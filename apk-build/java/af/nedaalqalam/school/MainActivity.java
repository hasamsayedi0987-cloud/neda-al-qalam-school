package af.nedaalqalam.school;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/**
 * مکتب خصوصی نداالقلم — اپلیکیشن اندروید (نسخهٔ ۱.۴ — آفلاین کامل)
 * توسعه‌دهنده: حسام الدین سیدی — 0791680632 — hasamsayedi0987@gmail.com
 *
 * - هیچ توکنی لازم نیست: فقط نام کاربری و رمز عبور
 * - آدرس سرور یک بار ذخیره می‌شود و همیشه مستقیم وارد اپ می‌شوید
 * - با هر بازکردن اپ، نشست پاک می‌شود و ورود مجدد لازم است (حتی آفلاین)
 * - آنلاین: ارتباط مستقیم با سرور مکتب | آفلاین: آخرین داده‌ها از حافظه، ثبت‌ها در صف
 * - جدید در ۱.۴: صفحهٔ خطای هوشمند با اتصال مجدد خودکار هنگام برگشت انترنت
 *   (دکمهٔ تلاش مجدد قدیمی خراب بود — location.reload روی URL داده‌ای گیر می‌کرد)
 */
public class MainActivity extends Activity {

    private static final String PREFS = "noq_prefs";
    private static final String KEY_URL = "server_url";
    // آدرس پیش‌فرض سرور مکتب — هنگام ساخت APK از فایل server-url.txt تزریق می‌شود
    private static final String DEFAULT_URL = "__DEFAULT_SERVER_URL__";

    private WebView webView;
    private ProgressBar progressBar;
    private SharedPreferences prefs;
    private String serverUrl = "";
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_REQ = 101;
    private boolean showingError = false;
    private ConnectivityManager.NetworkCallback netCallback;
    private final Handler retryHandler = new Handler(Looper.getMainLooper());

    private final Runnable retryRun = new Runnable() {
        @Override
        public void run() {
            if (showingError && webView != null) {
                webView.loadUrl(serverUrl);
                retryHandler.postDelayed(this, 8000);
            }
        }
    };

    /** پل جاوااسکریپت — دکمهٔ «تلاش مجدد» صفحهٔ خطا + ذخیرهٔ فایل‌های خروجی (Word/Excel/PDF) */
    private class Bridge {
        @JavascriptInterface
        public void retry() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    showingError = false;
                    retryHandler.removeCallbacks(retryRun);
                    if (webView != null) webView.loadUrl(serverUrl);
                }
            });
        }

        /** ذخیرهٔ فایل خروجی اپ (blob → base64 از جاوااسکریپت) در پوشهٔ Downloads گوشی */
        @JavascriptInterface
        public void saveFile(String base64, String mime, String suggestedName) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safeName = (suggestedName == null || suggestedName.trim().isEmpty())
                        ? "nedaalqalam-" + String.valueOf(System.currentTimeMillis()) : suggestedName;
                safeName = safeName.replaceAll("[\\\\/:*?\"<>|]", "-");
                String ext = mimeToExt(mime);
                if (ext != null && !safeName.toLowerCase().endsWith(ext)) safeName += ext;
                String savedPath;
                if (Build.VERSION.SDK_INT >= 29) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, safeName);
                    cv.put(android.provider.MediaStore.Downloads.MIME_TYPE, mime == null ? "application/octet-stream" : mime);
                    Uri uri = getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) throw new Exception("insert failed");
                    java.io.OutputStream os = getContentResolver().openOutputStream(uri);
                    if (os == null) throw new Exception("stream failed");
                    os.write(bytes);
                    os.close();
                    savedPath = "Downloads/" + safeName;
                } else {
                    java.io.File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) dir = getFilesDir();
                    java.io.File f = new java.io.File(dir, safeName);
                    java.io.FileOutputStream fo = new java.io.FileOutputStream(f);
                    fo.write(bytes);
                    fo.close();
                    savedPath = "Android/data/af.nedaalqalam.school/files/Download/" + safeName;
                }
                final String msg = "ذخیره شد: " + savedPath;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
                    }
                });
            } catch (final Exception e) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(MainActivity.this, "ذخیرهٔ فایل ناموفق بود: " + e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                });
            }
        }
    }

    private static String mimeToExt(String mime) {
        if (mime == null) return null;
        if (mime.contains("msword")) return ".doc";
        if (mime.contains("excel") || mime.contains("spreadsheet")) return ".xls";
        if (mime.contains("pdf")) return ".pdf";
        if (mime.contains("json")) return ".json";
        if (mime.contains("image/png")) return ".png";
        if (mime.contains("image/jpeg")) return ".jpg";
        return null;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        // پاک‌سازی نشست — با هر بازکردن اپ، ورود مجدد لازم است
        try {
            CookieManager cm = CookieManager.getInstance();
            cm.removeAllCookies(null);
            cm.flush();
        } catch (Exception ignored) { }

        String saved = prefs.getString(KEY_URL, "");
        if (!saved.isEmpty()) {
            serverUrl = saved;
        } else if (DEFAULT_URL.startsWith("https://") || DEFAULT_URL.startsWith("http://")) {
            serverUrl = DEFAULT_URL;
            prefs.edit().putString(KEY_URL, serverUrl).apply();
        } else {
            showWelcomeAndConnect();
            return;
        }
        buildWebView();
        webView.loadUrl(serverUrl);
    }

    // ───────── صفحهٔ خوش‌آمد یک‌باره — آدرس سرور (تنها بار اول) ─────────
    private void showWelcomeAndConnect() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(236, 253, 245));
        root.setPadding(dp(28), dp(60), dp(28), dp(28));

        TextView logo = new TextView(this);
        logo.setText("📚");
        logo.setTextSize(52);
        logo.setGravity(View.TEXT_ALIGNMENT_CENTER);
        root.addView(logo);

        TextView title = new TextView(this);
        title.setText("مکتب خصوصی نداالقلم");
        title.setTextSize(22);
        title.setTextColor(Color.rgb(6, 78, 59));
        title.setGravity(View.TEXT_ALIGNMENT_CENTER);
        title.setPadding(0, dp(12), 0, dp(4));
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("آدرس سیستم مکتب را یک بار وارد کنید.\nپس از این، هر بار فقط با نام کاربری و رمز وارد می‌شوید.");
        sub.setTextSize(14);
        sub.setTextColor(Color.rgb(80, 100, 95));
        sub.setGravity(View.TEXT_ALIGNMENT_CENTER);
        sub.setLineSpacing(0, 1.3f);
        sub.setPadding(0, dp(8), 0, dp(20));
        root.addView(sub);

        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setTextDirection(View.TEXT_DIRECTION_LTR);
        input.setHint("https://آدرس-سایت...");
        input.setTextSize(15);
        input.setBackgroundDrawable(makeEditBg());
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        root.addView(input);

        LinearLayout btn = new LinearLayout(this);
        btn.setOrientation(LinearLayout.VERTICAL);
        btn.setBackgroundColor(Color.rgb(4, 120, 87));
        btn.setPadding(0, dp(13), 0, dp(13));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bp.topMargin = dp(16);
        btn.setLayoutParams(bp);

        TextView btnText = new TextView(this);
        btnText.setText("اتصال به سیستم");
        btnText.setTextColor(Color.WHITE);
        btnText.setTextSize(16);
        btnText.setGravity(View.TEXT_ALIGNMENT_CENTER);
        btn.addView(btnText);
        root.addView(btn);

        setContentView(root);

        btn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String u = input.getText().toString().trim();
                if (u.isEmpty()) {
                    Toast.makeText(MainActivity.this, "آدرس را وارد کنید", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
                u = u.replaceAll("/+$", "");
                prefs.edit().putString(KEY_URL, u).apply();
                serverUrl = u;
                buildWebView();
                webView.loadUrl(serverUrl);
            }
        });
    }

    private android.graphics.drawable.GradientDrawable makeEditBg() {
        android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
        d.setColor(Color.WHITE);
        d.setCornerRadius(dp(10));
        d.setStroke(dp(1), Color.rgb(167, 216, 190));
        return d;
    }

    // ───────── ساخت WebView ─────────
    private void buildWebView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(4)));
        progressBar.getProgressDrawable().setColorFilter(Color.rgb(4, 120, 87),
                android.graphics.PorterDuff.Mode.SRC_IN);
        root.addView(progressBar);

        webView = new WebView(this);
        LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        webView.setLayoutParams(wp);
        root.addView(webView);
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        CookieManager.getInstance().setAcceptCookie(true);
        try {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        } catch (Exception ignored) { }

        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                String currentHost = Uri.parse(serverUrl).getHost() == null ? "" : Uri.parse(serverUrl).getHost();
                if (host.equals(currentHost)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri)); // لینک خارجی
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                if (url != null && url.startsWith("http")) {
                    // صفحهٔ واقعی سایت بارگذاری شد (آنلاین یا از کش سرویس‌ورکر)
                    showingError = false;
                    retryHandler.removeCallbacks(retryRun);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, android.webkit.WebResourceError err) {
                if (req.isForMainFrame() && !showingError) {
                    showingError = true;
                    view.loadData(mainFrameErrorHtml(), "text/html", "utf-8");
                    retryHandler.removeCallbacks(retryRun);
                    retryHandler.postDelayed(retryRun, 8000); // تلاش خودکار هر ۸ ثانیه
                }
            }
        });

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        // ─── دانلودهای خروجی (Word/Excel/PDF از blob:) در اپ واقعی ذخیره می‌شوند ───
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                if (url.startsWith("blob:") || url.startsWith("data:")) {
                    // blob را در صفحه به base64 تبدیل و به پل می‌فرستیم — فایل واقعی در Downloads ذخیره می‌شود
                    String mime = (mimetype == null || mimetype.isEmpty()) ? "application/octet-stream" : mimetype;
                    String js = "(function(){"
                            + "var nm=window.__noqDownloadName||'';"
                            + "window.__noqDownloadName='';"
                            + "fetch('" + url + "').then(function(r){return r.blob();}).then(function(b){"
                            + "var fr=new FileReader();fr.onload=function(){AndroidBridge.saveFile(String(fr.result).split(',')[1],'" + mime + "',nm);};"
                            + "fr.readAsDataURL(b);}).catch(function(){});})();";
                    try {
                        webView.evaluateJavascript(js, null);
                        Toast.makeText(MainActivity.this, "در حال آماده‌سازی فایل…", Toast.LENGTH_SHORT).show();
                    } catch (Exception ignored) { }
                } else if (url.startsWith("http") || url.startsWith("https")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) { }
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb,
                                             android.webkit.WebChromeClient.FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(Intent.createChooser(i, "انتخاب فایل"), FILE_REQ);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        registerNetworkCallback(); // اتصال مجدد خودکار هنگام برگشت انترنت
    }

    private String mainFrameErrorHtml() {
        return "<!doctype html><html dir='rtl'><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                + "</head>"
                + "<body style='font-family:sans-serif;text-align:center;padding:36px 22px;background:#ecfdf5'>"
                + "<div style='font-size:50px'>&#128225;</div>"
                + "<h2 style='color:#064e3b;margin:8px 0'>اتصال به سرور مکتب برقرار نشد</h2>"
                + "<p style='color:#4b5563;font-size:14px;line-height:2.1'>اینترنت دستگاه را وصل کنید — اپ خودکار دوباره وصل می‌شود.<br>"
                + "اگر قبلاً با انترنت وارد اپ شده باشید، می‌توانید با همان حساب وارد شوید.<br>"
                + "ثبت‌های آفلاین در حافظهٔ گوشی ذخیره و با اولین اتصال خودکار به سرور منتقل می‌شوند.</p>"
                + "<button onclick='AndroidBridge.retry()' style='background:#047857;color:#fff;border:0;padding:12px 30px;border-radius:10px;font-size:15px;margin-top:10px'>تلاش مجدد</button>"
                + "</body></html>";
    }

    // ───────── اتصال مجدد خودکار هنگام برگشت انترنت ─────────
    private void registerNetworkCallback() {
        try {
            ConnectivityManager cmv = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cmv == null) return;
            NetworkRequest req = new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build();
            netCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (showingError && webView != null) {
                                showingError = false;
                                retryHandler.removeCallbacks(retryRun);
                                webView.loadUrl(serverUrl);
                            }
                        }
                    });
                }
            };
            cmv.registerNetworkCallback(req, netCallback);
        } catch (Exception ignored) { }
    }

    @Override
    protected void onDestroy() {
        if (netCallback != null) {
            try {
                ConnectivityManager cmv = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cmv != null) cmv.unregisterNetworkCallback(netCallback);
            } catch (Exception ignored) { }
        }
        retryHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    // ───────── منوی گوشی: تغییر آدرس سرور (پیشرفته) ─────────
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU && webView != null) {
            promptChangeUrl();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void promptChangeUrl() {
        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setTextDirection(View.TEXT_DIRECTION_LTR);
        input.setText(serverUrl);
        new AlertDialog.Builder(this)
                .setTitle("آدرس سرور مکتب")
                .setMessage("آدرس فعلی: " + serverUrl)
                .setView(input)
                .setPositiveButton("ذخیره و بارگذاری", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface d, int w) {
                        String u = input.getText().toString().trim();
                        if (!u.isEmpty()) {
                            if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
                            u = u.replaceAll("/+$", "");
                            prefs.edit().putString(KEY_URL, u).apply();
                            serverUrl = u;
                            webView.loadUrl(serverUrl);
                        }
                    }
                })
                .setNegativeButton("انصراف", null)
                .show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_REQ && fileCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
            fileCallback.onReceiveValue(results);
            fileCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else if (webView != null) {
            new AlertDialog.Builder(this)
                    .setTitle("خروج")
                    .setMessage("آیا می‌خواهید از برنامه خارج شوید؟")
                    .setPositiveButton("بله", new android.content.DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(android.content.DialogInterface d, int w) {
                            finish();
                        }
                    })
                    .setNegativeButton("خیر", null)
                    .show();
        } else {
            super.onBackPressed();
        }
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
