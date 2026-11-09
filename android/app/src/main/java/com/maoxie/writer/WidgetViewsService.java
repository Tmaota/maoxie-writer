package com.maoxie.writer;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 挂件正文的可滑动列表：把章节 / Part 全文按段落拆成一行行，
 * 桌面挂件里的 ListView 即可上下滑动浏览全文。
 */
public class WidgetViewsService extends RemoteViewsService {

    /** 挂件 id（RemoteViewsService 无法直接拿到，由 Provider 通过 intent 传入） */
    static final String EXTRA_WIDGET_ID = "widget_id";

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new TextFactory(getApplicationContext(), intent);
    }

    static class TextFactory implements RemoteViewsFactory {

        private final Context ctx;
        private final int widgetId;
        private List<String> rows = new ArrayList<>();

        TextFactory(Context ctx, Intent intent) {
            this.ctx = ctx;
            this.widgetId = intent != null ? intent.getIntExtra(EXTRA_WIDGET_ID, -1) : -1;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            rows = new ArrayList<>();
            JSONObject entry = widgetId >= 0 ? WidgetStore.entryFor(ctx, widgetId) : null;
            String text = entry != null ? entry.optString("text") : "";
            if (text.isEmpty()) {
                rows.add(entry == null
                        ? "在码字工坊里写点什么，这里就能滑着看全文～"
                        : "（这一篇还没有内容）");
                return;
            }
            String[] paras = text.split("\n", -1);
            for (String p : paras) {
                String t = p.trim();
                rows.add(t.isEmpty() ? " " : t);
            }
        }

        @Override
        public int getCount() {
            return rows.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
            rv.setTextViewText(R.id.widget_row_text, rows.get(position));
            // 点击某一行 → 打开 APP 对应章节 / Part
            JSONObject entry = WidgetStore.entryFor(ctx, widgetId);
            Intent fill = new Intent();
            if (entry != null) {
                fill.putExtra("bookId", entry.optString("bookId"));
                fill.putExtra("targetType", entry.optString("targetType"));
                fill.putExtra("targetId", entry.optString("targetId"));
            }
            rv.setOnClickFillInIntent(R.id.widget_row_text, fill);
            return rv;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }

        @Override
        public void onDestroy() {}
    }
}
