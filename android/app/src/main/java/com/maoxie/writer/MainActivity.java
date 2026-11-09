package com.maoxie.writer;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    /** 顶/底安全区（CSS 像素）：通过 CSS 变量 --sat / --sab 交给网页端顶栏底栏使用 */
    private int insetTopCss = -1;
    private int insetBottomCss = -1;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleWidgetIntent(getIntent());
        watchInsets();
        // WebView 页面加载完成后重新下发一次（冷启动时首帧可能还没注入）
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                pushInsets();
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleWidgetIntent(intent);
    }

    /** 挂件点击：保存启动目标，网页端读取一次后清除 */
    private void handleWidgetIntent(Intent intent) {
        if (intent == null) return;
        String bookId = intent.getStringExtra("bookId");
        String targetType = intent.getStringExtra("targetType");
        String targetId = intent.getStringExtra("targetId");
        if (bookId == null || targetType == null || targetId == null) return;
        JSONObject target = new JSONObject();
        try {
            target.put("bookId", bookId);
            target.put("targetType", targetType);
            target.put("targetId", targetId);
        } catch (org.json.JSONException ignored) {}
        WidgetStore.setLaunch(this, target);
    }

    /** 系统资源里的真实状态栏 / 导航栏高度（设备像素） */
    private int systemDimen(String name) {
        int id = getResources().getIdentifier(name, "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) : 0;
    }

    private void watchInsets() {
        final View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            // Android 15 起强制 edge-to-edge（内容画到状态栏/导航栏下面），才需要手动补安全区；
            // 更低版本系统内容本就在状态栏下方，再补会多出一整块空白。
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                insetTopCss = 0;
                insetBottomCss = 0;
                pushInsets();
                return insets;
            }
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            // 有的系统（如 OriginOS 原子岛）会把 top inset 报得比真实状态栏大很多，
            // 用资源里的真实高度钳制；再除以屏幕密度换算成 CSS 像素（insets 是设备像素）。
            float density = getResources().getDisplayMetrics().density;
            int top = Math.min(bars.top, systemDimen("status_bar_height"));
            int bottom = Math.min(bars.bottom, systemDimen("navigation_bar_height"));
            // 兜底：状态栏不可能超过 80dp
            top = Math.min(top, Math.round(80f * density));
            bottom = Math.min(bottom, Math.round(80f * density));
            int topCss = Math.round(top / density);
            int bottomCss = Math.round(bottom / density);
            if (topCss != insetTopCss || bottomCss != insetBottomCss) {
                insetTopCss = topCss;
                insetBottomCss = bottomCss;
                pushInsets();
            }
            return insets;
        });
    }

    private void pushInsets() {
        if (insetTopCss < 0) return;
        final String js = "document.documentElement.style.setProperty('--sat','" + insetTopCss + "px');"
                + "document.documentElement.style.setProperty('--sab','" + insetBottomCss + "px');";
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(js, null);
            }
        });
    }
}
