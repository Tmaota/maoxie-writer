package com.maoxie.writer;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 码字工坊桌面挂件：显示某个章节 / Part 的标题与全文（可上下滑动），
 * 点击正文任意行直接打开 APP 并跳到对应章节 / Part。
 * 目标选择：优先用 App 内生成时记录的待分配配置；否则跟随「当前写作位置」；
 * 点标题栏「切换」可在全部章节 / Part 之间轮换。
 */
public class WriterWidgetProvider extends AppWidgetProvider {

    static final String ACTION_CYCLE = "com.maoxie.writer.action.WIDGET_CYCLE";

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            JSONObject entry = WidgetStore.entryFor(context, id);
            if (entry == null) {
                // App 内生成：把待分配配置落位到这个 id
                JSONObject pending = WidgetStore.takePending(context);
                if (pending != null) {
                    WidgetStore.putWidget(context, id, pending);
                    entry = pending;
                }
            }
            if (entry == null) {
                // 桌面上手动拖出：默认跟随「当前写作位置」
                entry = entryFromLastActive(context);
                if (entry != null) WidgetStore.putWidget(context, id, entry);
            }
            render(context, mgr, id, entry);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_CYCLE.equals(intent.getAction())) {
            int widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
            if (widgetId < 0) return;
            cycle(context, widgetId);
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            WidgetStore.removeWidget(context, id);
        }
        super.onDeleted(context, appWidgetIds);
    }

    /** 「切换」：在目录（全部章节/Part）里找当前目标的下一个，落位到这个挂件 */
    private void cycle(Context context, int widgetId) {
        JSONArray catalog = WidgetStore.catalog(context);
        if (catalog.length() == 0) return;
        JSONObject cur = WidgetStore.entryFor(context, widgetId);
        String curType = cur != null ? cur.optString("targetType") : "";
        String curId = cur != null ? cur.optString("targetId") : "";
        int next = 0;
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject e = catalog.optJSONObject(i);
            if (e != null && curType.equals(e.optString("targetType")) && curId.equals(e.optString("targetId"))) {
                next = (i + 1) % catalog.length();
                break;
            }
        }
        JSONObject entry = catalog.optJSONObject(next);
        if (entry == null) return;
        WidgetStore.putWidget(context, widgetId, entry);
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        render(context, mgr, widgetId, entry);
        mgr.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_list);
    }

    /** 用「当前写作位置」在目录里找到对应条目 */
    private static JSONObject entryFromLastActive(Context context) {
        JSONObject la = WidgetStore.lastActive(context);
        if (la == null) return null;
        JSONArray catalog = WidgetStore.catalog(context);
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject e = catalog.optJSONObject(i);
            if (e != null
                    && la.optString("targetType").equals(e.optString("targetType"))
                    && la.optString("targetId").equals(e.optString("targetId"))) {
                return e;
            }
        }
        return catalog.optJSONObject(0);
    }

    /** 全量刷新所有挂件（正文更新后由网页端触发） */
    static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ComponentName cn = new ComponentName(context, WriterWidgetProvider.class);
        int[] ids = mgr.getAppWidgetIds(cn);
        for (int id : ids) {
            render(context, mgr, id, WidgetStore.entryFor(context, id));
        }
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    private static void render(Context context, AppWidgetManager mgr, int widgetId, JSONObject entry) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_writer);
        String bookName = entry != null ? entry.optString("bookName") : "";
        String title = entry != null ? entry.optString("title") : "";
        boolean isCombo = entry != null && "combo".equals(entry.optString("targetType"));
        views.setTextViewText(R.id.widget_title, (title.isEmpty() ? (isCombo ? "未命名 Part" : "未命名章节") : title)
                + (bookName.isEmpty() ? "" : " · " + bookName));

        // 正文：可滑动的全文列表
        Intent svc = new Intent(context, WidgetViewsService.class);
        svc.putExtra(WidgetViewsService.EXTRA_WIDGET_ID, widgetId);
        views.setRemoteAdapter(R.id.widget_list, svc);

        // 点击正文某一行 → 打开 APP 对应章节 / Part（模板 + 每行 fill-in）
        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                context, widgetId, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        views.setPendingIntentTemplate(R.id.widget_list, pi);

        // 点击标题 → 同样打开 APP
        views.setOnClickPendingIntent(R.id.widget_title, pi);

        // 「切换」→ 轮换到下一个章节 / Part
        Intent cyc = new Intent(context, WriterWidgetProvider.class);
        cyc.setAction(ACTION_CYCLE);
        cyc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        PendingIntent cpi = PendingIntent.getBroadcast(
                context, widgetId, cyc,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_cycle, cpi);

        mgr.updateAppWidget(widgetId, views);
    }
}
