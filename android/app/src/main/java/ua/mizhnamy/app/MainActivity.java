package ua.mizhnamy.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    public static final String PREFS = "mizhnamy";
    private WebView web;
    private String site;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        site = getString(R.string.site_url);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#FBF3EE"));
        if (Build.VERSION.SDK_INT >= 23) {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#FBF3EE"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " MizhNamyAndroid/1.0");
        web.addJavascriptInterface(new Bridge(this), "MNAndroid");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String host = Uri.parse(site).getHost();
                if (host != null && host.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(site);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.evaluateJavascript("try{document.dispatchEvent(new Event('visibilitychange'))}catch(e){}", null);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
        LoveWidget.refreshAll(this);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    /** Міст: веб-застосунок передає сюди код пари і свіжі дані для віджета. */
    static class Bridge {
        private final Context ctx;
        Bridge(Context c) { ctx = c.getApplicationContext(); }

        @JavascriptInterface
        public void setPair(String pairJson, String role) {
            SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit();
            e.putString("pair", pairJson == null ? "" : pairJson);
            e.putString("role", role == null ? "A" : role);
            e.apply();
            LoveWidget.refreshAll(ctx);
        }

        @JavascriptInterface
        public void docUpdated(String docJson) {
            ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("doc", docJson).apply();
            LoveWidget.refreshAll(ctx);
        }

        @JavascriptInterface
        public boolean hasWidget() {
            AppWidgetManager m = AppWidgetManager.getInstance(ctx);
            return m.getAppWidgetIds(new ComponentName(ctx, LoveWidget.class)).length > 0;
        }

        @JavascriptInterface
        public void pinWidget() {
            if (Build.VERSION.SDK_INT >= 26) {
                AppWidgetManager m = AppWidgetManager.getInstance(ctx);
                if (m.isRequestPinAppWidgetSupported()) {
                    m.requestPinAppWidget(new ComponentName(ctx, LoveWidget.class), null, null);
                }
            }
        }
    }
}
