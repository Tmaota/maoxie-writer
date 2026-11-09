package com.maoxie.writer;

import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Build;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/** 网页端 ↔ 桌面挂件桥：请求放置、全量刷新预览、读取启动目标 */
@CapacitorPlugin(name = "WriterWidget")
public class WidgetPlugin extends Plugin {

    /** 桌面选取回退时用于预分配挂件 id 的宿主 */
    private AppWidgetHost pickHost;
    private int pickId = -1;

    /** 请求把某个章节 / Part 钉到桌面：直接打开系统挂件列表，选中即放置 */
    @PluginMethod
    public void requestPin(PluginCall call) {
        JSObject cfg = call.getData();
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            ret.put("ok", false);
            ret.put("reason", "系统版本过低，不支持放置挂件");
            call.resolve(ret);
            return;
        }
        JSONObject copy = new JSONObject();
        try {
            copy.put("key", cfg.optString("key"));
            copy.put("bookId", cfg.optString("bookId"));
            copy.put("bookName", cfg.optString("bookName"));
            copy.put("targetType", cfg.optString("targetType"));
            copy.put("targetId", cfg.optString("targetId"));
            copy.put("title", cfg.optString("title"));
            copy.put("text", cfg.optString("text"));
        } catch (org.json.JSONException ignored) {}
        // 统一走「桌面选取」：弹系统挂件列表，选中码字工坊即直接放到桌面。
        // 不用 requestPinAppWidget：部分桌面（如 OriginOS）会吞掉请求只提示不弹窗。
        WidgetStore.setPending(getContext(), copy);
        pickHost = new AppWidgetHost(getContext(), 1024);
        pickId = pickHost.allocateAppWidgetId();
        Intent pick = new Intent(AppWidgetManager.ACTION_APPWIDGET_PICK);
        pick.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, pickId);
        startActivityForResult(call, pick, "onPickResult");
    }

    @ActivityCallback
    private void onPickResult(PluginCall call, ActivityResult result) {
        JSObject ret = new JSObject();
        if (result.getResultCode() == android.app.Activity.RESULT_OK) {
            ret.put("ok", true);
            ret.put("pick", true);
            // id 交给系统挂件，host 只保留引用即可
        } else {
            WidgetStore.takePending(getContext()); // 丢弃未使用的待分配配置
            if (pickHost != null && pickId != -1) pickHost.deleteAppWidgetId(pickId);
            ret.put("ok", false);
            ret.put("reason", "已取消。也可以长按桌面空白处 → 添加小组件 → 选择码字工坊，手动放置。");
            call.resolve(ret);
        }
    }

    /** 全量同步：目录（全部章节/Part，含正文）整体替换 + 记录当前写作位置 */
    @PluginMethod
    public void updateAll(PluginCall call) {
        JSArray entries = call.getArray("entries");
        WidgetStore.applyEntries(getContext(), entries);
        JSObject la = call.getObject("lastActive");
        if (la != null) {
            JSONObject t = new JSONObject();
            try {
                t.put("bookId", la.optString("bookId"));
                t.put("targetType", la.optString("targetType"));
                t.put("targetId", la.optString("targetId"));
            } catch (org.json.JSONException ignored) {}
            WidgetStore.setLastActive(getContext(), t);
        }
        WriterWidgetProvider.updateAll(getContext());
        call.resolve();
    }

    /** 读取挂件点击带来的启动目标（读一次即清除） */
    @PluginMethod
    public void getLaunchTarget(PluginCall call) {
        JSONObject raw = WidgetStore.consumeLaunch(getContext());
        JSObject ret = new JSObject();
        if (raw != null) {
            try {
                ret.put("target", new JSObject(raw.toString()));
            } catch (org.json.JSONException ignored) {}
        }
        call.resolve(ret);
    }
}
