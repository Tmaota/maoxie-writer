package com.maoxie.writer;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 桌面挂件的数据仓库（SharedPreferences + JSON）：
 * - widgets：  widgetId(String) → {bookId, bookName, targetType, targetId, title, text}
 * - pending：  刚请求放置、等待系统分配的挂件配置
 * - launch：   挂件点击带来的启动目标（网页端读取一次后即清除）
 */
public final class WidgetStore {

    private static final String PREFS = "writer_widgets";
    private static final String KEY_WIDGETS = "widgets";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_LAUNCH = "launch";
    private static final String KEY_CATALOG = "catalog";
    private static final String KEY_LAST_ACTIVE = "lastActive";

    private WidgetStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized JSONObject widgets(Context ctx) {
        return readObject(ctx, KEY_WIDGETS);
    }

    public static synchronized JSONObject entryFor(Context ctx, int widgetId) {
        return widgets(ctx).optJSONObject(String.valueOf(widgetId));
    }

    /** 放置请求发出后先记下配置；系统放置完成触发 onUpdate 时按 id 落位 */
    public static synchronized void setPending(Context ctx, JSONObject cfg) {
        prefs(ctx).edit().putString(KEY_PENDING, cfg.toString()).apply();
    }

    public static synchronized JSONObject takePending(Context ctx) {
        String raw = prefs(ctx).getString(KEY_PENDING, null);
        prefs(ctx).edit().remove(KEY_PENDING).apply();
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    public static synchronized void putWidget(Context ctx, int widgetId, JSONObject entry) {
        JSONObject all = widgets(ctx);
        try {
            all.put(String.valueOf(widgetId), entry);
        } catch (JSONException ignored) {}
        prefs(ctx).edit().putString(KEY_WIDGETS, all.toString()).apply();
    }

    public static synchronized void removeWidget(Context ctx, int widgetId) {
        JSONObject all = widgets(ctx);
        all.remove(String.valueOf(widgetId));
        prefs(ctx).edit().putString(KEY_WIDGETS, all.toString()).apply();
    }

    /** 网页端全量同步：目录（全部章节/Part，含正文）整体替换，并按 targetId 更新已有挂件 */
    public static synchronized void applyEntries(Context ctx, org.json.JSONArray entries) {
        if (entries == null) return;
        prefs(ctx).edit().putString(KEY_CATALOG, entries.toString()).apply();
        JSONObject all = widgets(ctx);
        for (int i = 0; i < entries.length(); i++) {
            JSONObject incoming = entries.optJSONObject(i);
            if (incoming == null) continue;
            String targetId = incoming.optString("targetId");
            if (targetId.isEmpty()) continue;
            java.util.Iterator<String> it = all.keys();
            while (it.hasNext()) {
                String id = it.next();
                JSONObject cur = all.optJSONObject(id);
                if (cur != null && targetId.equals(cur.optString("targetId"))
                        && incoming.optString("targetType").equals(cur.optString("targetType"))) {
                    try {
                        cur.put("title", incoming.optString("title"));
                        cur.put("text", incoming.optString("text"));
                        cur.put("bookName", incoming.optString("bookName"));
                    } catch (JSONException ignored) {}
                }
            }
        }
        prefs(ctx).edit().putString(KEY_WIDGETS, all.toString()).apply();
    }

    /** 全部可切换篇目（章节 / Part） */
    public static synchronized org.json.JSONArray catalog(Context ctx) {
        String raw = prefs(ctx).getString(KEY_CATALOG, null);
        if (raw == null) return new org.json.JSONArray();
        try {
            return new org.json.JSONArray(raw);
        } catch (JSONException e) {
            return new org.json.JSONArray();
        }
    }

    /** 记录当前正在写作的章节 / Part（新拖出的挂件默认显示它） */
    public static synchronized void setLastActive(Context ctx, JSONObject target) {
        if (target == null) return;
        prefs(ctx).edit().putString(KEY_LAST_ACTIVE, target.toString()).apply();
    }

    public static synchronized JSONObject lastActive(Context ctx) {
        String raw = prefs(ctx).getString(KEY_LAST_ACTIVE, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    public static synchronized void setLaunch(Context ctx, JSONObject target) {
        prefs(ctx).edit().putString(KEY_LAUNCH, target.toString()).apply();
    }

    /** 读取并清除启动目标（挂件点击 → 打开对应章节 / Part） */
    public static synchronized JSONObject consumeLaunch(Context ctx) {
        String raw = prefs(ctx).getString(KEY_LAUNCH, null);
        prefs(ctx).edit().remove(KEY_LAUNCH).apply();
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    private static JSONObject readObject(Context ctx, String key) {
        String raw = prefs(ctx).getString(key, null);
        if (raw == null) return new JSONObject();
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }
}
