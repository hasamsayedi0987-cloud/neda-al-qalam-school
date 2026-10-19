package af.nedaalqalam.school;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/**
 * مکتب خصوصی نداالقلم — اپلیکیشن اندروید (WebView)
 * توسعه‌دهنده: حسام الدین سیدی — 0791680632 — hasamsayedi0987@gmail.com
 *
 * اولین بار: کاربر آدرس سرور مکتب را وارد می‌کند (مثلاً http://192.168.1.10:3000
 * یا آدرس اینترنتی مکتب). آدرس ذخیره می‌شود و از دفعهٔ بعد مستقیم باز می‌شود.
 * برای تغییر آدرس: دکمهٔ منوی گوشی → «تغییر آدرس سرور».
 */
public class MainActivity extends Activity {

    private static final String PREFS = "noq_prefs";
    private static final String KEY_URL = "server_url";

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout startLayout;
    private EditText startUrlInput;
    private SharedPreferences prefs;
    private String serverUrl = "";
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_REQ = 101;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String saved = prefs.getString(KEY_URL, "");
        if (saved.isEmpty()) {
            showStartScreen();
        } else {
            serverUrl = saved;
            buildWebView();
            webView.loadUrl(serverUrl);
        }
    }

    // ───────── صفحهٔ اول: گرفتن آدرس سرور ─────────
    private void showStartScreen() {
        startLayout = new LinearLayout(this);
        startLayout.setOrientation(LinearLayout.VERTICAL);
        startLayout.setGravity(Gravity.CENTER);
        startLayout.setPadding(dp(28), dp(28), dp(28), dp(28));
        startLayout.setBackgroundColor(Color.rgb(236, 253, 245));

        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("ic_launcher", "mipmap", getPackageName()));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(110), dp(110));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        logo.setLayoutParams(lp);
        startLayout.addView(logo);

        TextView title = new TextView(this);
        title.setText("مکتب خصوصی نداالقلم");
        title.setTextSize(24);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setTextColor(Color.rgb(6, 78, 59));
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(18), 0, dp(4));
        startLayout.addView(title);

        TextView sub = new TextView(this);
        sub.setText("سیستم مدیریت تعلیمی — نمرات، حاضری، کارنامه، کتابخانه");
        sub.setTextSize(13);
        sub.setTextColor(Color.rgb(77, 92, 87));
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, 0, 0, dp(24));
        startLayout.addView(sub);

        TextView lbl = new TextView(this);
        lbl.setText("آدرس سرور مکتب را وارد کنید:");
        lbl.setTextSize(14);
        lbl.setTextColor(Color.rgb(6, 78, 59));
        lbl.setGravity(Gravity.CENTER);
        startLayout.addView(lbl);

        startUrlInput = new EditText(this);
        startUrlInput.setHint("مثلاً http://192.168.1.10:3000");
        startUrlInput.setTextSize(14);
        startUrlInput.setTextDirection(View.TEXT_DIRECTION_LTR);
        startUrlInput.setGravity(Gravity.CENTER);
        startUrlInput.setSingleLine(true);
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ip.setMargins(0, dp(10), 0, dp(14));
        startUrlInput.setLayoutParams(ip);
        startLayout.addView(startUrlInput);

        Button btn = new Button(this);
        btn.setText("ورود به سیستم");
        btn.setTextColor(Color.WHITE);
        btn.setBackgroundColor(Color.rgb(4, 120, 87));
        btn.setOnClickListener(v -> {
            String u = startUrlInput.getText().toString().trim();
            if (u.isEmpty()) {
                Toast.makeText(this, "آدرس سرور را وارد کنید", Toast.LENGTH_SHORT).show();
                return;
            }
            if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
            u = u.replaceAll("/+$", "");
            prefs.edit().putString(KEY_URL, u).apply();
            serverUrl = u;
            startLayout = null;
            setContentView(new LinearLayout(this));
            buildWebView();
            webView.loadUrl(serverUrl);
        });
        startLayout.addView(btn);

        TextView hint = new TextView(this);
        hint.setText("آدرس سرور همان کامپیوتر/سروری است که سیستم مکتب روی آن اجرا است.\n"
                + "مثال شبکهٔ مکتب: http://192.168.1.10:3000\n"
                + "اگر روی اینترنت هاست شده: آدرس آن را وارد کنید.\n\n"
                + "توسعه‌دهنده: حسام الدین سیدی — 0791680632");
        hint.setTextSize(12);
        hint.setTextColor(Color.rgb(77, 92, 87));
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(24), 0, 0);
        startLayout.addView(hint);

        setContentView(startLayout);
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
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                String appHost = Uri.parse(serverUrl).getHost() == null ? "" : Uri.parse(serverUrl).getHost();
                if (host.equals(appHost)) return false; // لینک داخلی
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
        return "<html dir='rtl'><body style='font-family:sans-serif;text-align:center;padding:40px;background:#ecfdf5'>"
                + "<h2 style='color:#064e3b'>اتصال به سرور برقرار نشد</h2>"
                + "<p style='color:#4b5563'>بررسی کنید: ۱) سرور مکتب روشن است ۲) آدرس درست است ۳) به همان شبکه وصل هستید.</p>"
                + "<button onclick='location.reload()' style='background:#047857;color:#fff;border:0;padding:12px 28px;border-radius:8px;font-size:15px'>تلاش مجدد</button>"
                + "</body></html>";
    }

    // ───────── تغییر آدرس سرور ─────────
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
                .setTitle("تغییر آدرس سرور")
                .setMessage("آدرس فعلی: " + serverUrl)
                .setView(input)
                .setPositiveButton("ذخیره و بارگذاری", (d, w) -> {
                    String u = input.getText().toString().trim();
                    if (!u.isEmpty()) {
                        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
                        u = u.replaceAll("/+$", "");
                        prefs.edit().putString(KEY_URL, u).apply();
                        serverUrl = u;
                        webView.loadUrl(serverUrl);
                    }
                })
                .setNeutralButton("صفحهٔ ورود آدرس", (d, w) -> {
                    webView = null;
                    prefs.edit().remove(KEY_URL).apply();
                    showStartScreen();
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
                    .setPositiveButton("بله", (d, w) -> finish())
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
