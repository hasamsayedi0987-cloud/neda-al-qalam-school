package af.nedaalqalam.school;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
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
 * مکتب خصوصی نداالقلم — اپلیکیشن اندروید (نسخهٔ ۱.۲ — سرور اختصاصی)
 * توسعه‌دهنده: حسام الدین سیدی — 0791680632 — hasamsayedi0987@gmail.com
 *
 * - هیچ توکنی لازم نیست: فقط نام کاربری و رمز عبور
 * - آدرس سرور یک بار ذخیره می‌شود و همیشه مستقیم وارد اپ می‌شوید
 * - با هر بازکردن اپ، نشست پاک می‌شود و ورود مجدد لازم است (حتی آفلاین)
 * - آنلاین: ارتباط مستقیم با سرور مکتب | آفلاین: آخرین داده‌ها از حافظه، ثبت‌ها در صف
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
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, android.webkit.WebResourceError err) {
                if (req.isForMainFrame()) {
                    view.loadData(mainFrameErrorHtml(), "text/html", "utf-8");
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
    }

    private String mainFrameErrorHtml() {
        return "<html dir='rtl'><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                + "</head>"
                + "<body style='font-family:sans-serif;text-align:center;padding:40px;background:#ecfdf5'>"
                + "<h2 style='color:#064e3b'>اتصال به سرور مکتب برقرار نشد</h2>"
                + "<p style='color:#4b5563'>اینترنت دستگاه را بررسی کنید و دوباره تلاش کنید.<br>"
                + "داده‌های قبلی پس از اتصال در دسترس خواهد بود.</p>"
                + "<button onclick='location.reload()' style='background:#047857;color:#fff;border:0;padding:12px 28px;border-radius:8px;font-size:15px;margin:8px'>تلاش مجدد</button>"
                + "</body></html>";
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
