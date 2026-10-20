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
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * مکتب خصوصی نداالقلم — اپلیکیشن اندروید (نسخهٔ ابری ۱.۱)
 * توسعه‌دهنده: حسام الدین سیدی — 0791680632 — hasamsayedi0987@gmail.com
 *
 * معماری: رابط کاربری اپ به‌صورت کامل داخل APK جاسازی شده (assets/www) و
 * داده‌ها در مخزن خصوصی گیت‌هاب ذخیره و بین همهٔ دستگاه‌ها همگام می‌شوند.
 * - بدون نیاز به آدرس IP یا سرور محلی — فقط نام کاربری و رمز عبور
 * - آنلاین: همگام‌سازی با ابر | آفلاین: رابط و آخرین داده‌ها از حافظه، ثبت‌ها در صف
 * - URL پیش‌فرض: نسخهٔ داخلی (appassets) — از منوی گوشی می‌توان آدرس سایت ابری
 *   (https://hasamsayedi0987-cloud.github.io/neda-al-qalam-school/) را هم گذاشت.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "noq_prefs";
    private static final String KEY_URL = "server_url";
    private static final String ASSET_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String ASSET_PREFIX = "/assets/";

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
        serverUrl = prefs.getString(KEY_URL, ASSET_URL);
        buildWebView();
        webView.loadUrl(serverUrl);
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

        webView.setWebViewClient(new WebViewClient() {

            // سرو کردن رابط کاربری جاسازی‌شده از assets/www
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String host = url.getHost() == null ? "" : url.getHost();
                String path = url.getPath() == null ? "" : url.getPath();
                if (ASSET_HOST.equals(host) && path.startsWith(ASSET_PREFIX)) {
                    return serveAsset(path.substring(ASSET_PREFIX.length()));
                }
                return null; // بقیهٔ درخواست‌ها عادی (گیت‌هاب از اینترنت)
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                if (ASSET_HOST.equals(host)) return false;
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

    private WebResourceResponse serveAsset(String relPath) {
        if (relPath == null || relPath.isEmpty() || "index.html".equals(relPath)) {
            relPath = "index.html";
        }
        try {
            InputStream is = getAssets().open("www/" + relPath);
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Access-Control-Allow-Origin", "*");
            WebResourceResponse resp = new WebResourceResponse(guessMime(relPath), "utf-8", is);
            resp.setResponseHeaders(headers);
            return resp;
        } catch (IOException e) {
            // fallback: index.html برای مسیرهای SPA
            try {
                InputStream is = getAssets().open("www/index.html");
                return new WebResourceResponse("text/html", "utf-8", is);
            } catch (IOException e2) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                        null, new ByteArrayInputStream("not found".getBytes()));
            }
        }
    }

    private String guessMime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".map")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private String mainFrameErrorHtml() {
        return "<html dir='rtl'><head><meta charset='utf-8'></head>"
                + "<body style='font-family:sans-serif;text-align:center;padding:40px;background:#ecfdf5'>"
                + "<h2 style='color:#064e3b'>بارگذاری ناموفق</h2>"
                + "<p style='color:#4b5563'>اتصال اینترنت را بررسی کنید و دوباره تلاش کنید. داده‌های قبلی در حافظهٔ اپ موجود است.</p>"
                + "<button onclick='location.reload()' style='background:#047857;color:#fff;border:0;padding:12px 28px;border-radius:8px;font-size:15px'>تلاش مجدد</button>"
                + "</body></html>";
    }

    // ───────── منوی گوشی: تغییر آدرس (پیشرفته) ─────────
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
                .setTitle("آدرس سیستم")
                .setMessage("آدرس فعلی: " + serverUrl + "\n\nپیش‌فرض: نسخهٔ داخلی اپ (بدون نیاز به اینترنت برای رابط کاربری)")
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
                .setNeutralButton("بازگشت به نسخهٔ داخلی", new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface d, int w) {
                        prefs.edit().putString(KEY_URL, ASSET_URL).apply();
                        serverUrl = ASSET_URL;
                        webView.loadUrl(serverUrl);
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
