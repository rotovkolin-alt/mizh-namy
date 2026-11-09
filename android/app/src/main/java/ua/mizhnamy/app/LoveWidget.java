package ua.mizhnamy.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;

public class LoveWidget extends AppWidgetProvider {
    private static final String[] MOODS = {"😔", "😐", "🙂", "😊", "🥰"};

    public static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, LoveWidget.class));
        if (ids.length == 0) return;
        Intent i = new Intent(ctx, LoveWidget.class);
        i.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        ctx.sendBroadcast(i);
    }

    @Override
    public void onUpdate(final Context ctx, final AppWidgetManager mgr, final int[] ids) {
        final PendingResult pr = goAsync();
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    // одразу показуємо збережене, потім пробуємо свіже з мережі
                    RemoteViews cached = build(ctx, null);
                    for (int id : ids) mgr.updateAppWidget(id, cached);
                    String fresh = fetch(ctx);
                    if (fresh != null) {
                        RemoteViews v = build(ctx, fresh);
                        for (int id : ids) mgr.updateAppWidget(id, v);
                    }
                } catch (Throwable ignored) {
                } finally {
                    pr.finish();
                }
            }
        }).start();
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        int n;
        while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        in.close();
        return bo.toString("UTF-8");
    }

    private static String fetch(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        try {
            String pj = p.getString("pair", "");
            if (pj == null || pj.isEmpty()) return null;
            JSONObject pair = new JSONObject(pj);
            String kind = pair.optString("kind"), id = pair.optString("id");
            String url = "fb".equals(kind)
                    ? pair.optString("url").replaceAll("/+$", "") + "/mizhnamy/" + id + ".json"
                    : "https://jsonblob.com/api/jsonBlob/" + id;
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestProperty("Accept", "application/json");
            if (c.getResponseCode() != 200) return null;
            String s = readAll(c.getInputStream());
            JSONObject test = new JSONObject(s);
            if (!test.has("users")) return null;
            p.edit().putString("doc", s).apply();
            return s;
        } catch (Exception e) {
            return null;
        }
    }

    private static JSONObject loadData(Context ctx) throws Exception {
        return new JSONObject(readAll(ctx.getAssets().open("tasks.json")));
    }

    static RemoteViews build(Context ctx, String docJson) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget);
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(ctx, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        SharedPreferences p = ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        try {
            if (docJson == null) docJson = p.getString("doc", null);
            String pj = p.getString("pair", "");
            String me = p.getString("role", "A");
            String them = "A".equals(me) ? "B" : "A";
            JSONObject data = loadData(ctx);
            JSONArray tasks = data.getJSONArray("tasks");
            JSONObject cats = data.getJSONObject("cats");

            String seedId = "solo";
            if (pj != null && !pj.isEmpty()) seedId = new JSONObject(pj).optString("id", "solo");

            JSONObject doc = docJson != null ? new JSONObject(docJson) : new JSONObject();
            JSONObject users = doc.optJSONObject("users");
            if (users == null) users = new JSONObject();
            JSONObject U = users.optJSONObject(me), T = users.optJSONObject(them);
            if (U == null) U = new JSONObject();
            if (T == null) T = new JSONObject();
            JSONObject days = doc.optJSONObject("days");
            if (days == null) days = new JSONObject();

            String k = TaskLogic.dkey(Calendar.getInstance());
            JSONObject dk = days.optJSONObject(k);
            JSONObject dm = dk != null && dk.optJSONObject(me) != null ? dk.optJSONObject(me) : new JSONObject();
            JSONObject dt = dk != null && dk.optJSONObject(them) != null ? dk.optJSONObject(them) : new JSONObject();
            int rer = 0;
            if (dk != null) {
                JSONObject a = dk.optJSONObject("A"), b = dk.optJSONObject("B");
                if (a != null) rer += a.optInt("reroll", 0);
                if (b != null) rer += b.optInt("reroll", 0);
            }
            JSONObject task = tasks.getJSONObject(TaskLogic.taskIndex(seedId, k, rer, tasks.length()));
            JSONObject cat = cats.optJSONObject(task.optString("c"));
            v.setTextViewText(R.id.label, (cat != null ? cat.optString("e") + " " : "") + "Завдання дня");
            v.setTextViewText(R.id.task, task.optString("t"));

            // серія днів поспіль
            int streak = 0;
            Calendar c = Calendar.getInstance();
            if (!both(days, TaskLogic.dkey(c))) c.add(Calendar.DAY_OF_MONTH, -1);
            while (streak < 3000 && both(days, TaskLogic.dkey(c))) { streak++; c.add(Calendar.DAY_OF_MONTH, -1); }

            String together = "";
            JSONObject meta = doc.optJSONObject("meta");
            String sd = meta != null ? meta.optString("startDate", "") : "";
            if (sd.length() == 10) {
                long nd = Math.max(0, Math.round((TaskLogic.utcMillis(k) - TaskLogic.utcMillis(sd)) / 86400000.0));
                together = "разом " + nd + " " + TaskLogic.plural(nd, "день", "дні", "днів");
            } else if (streak > 0) together = "🔥" + streak;
            v.setTextViewText(R.id.together, together);

            long pingAt = T.optLong("pingAt", 0);
            String tName = T.optString("name", "");
            if (tName.isEmpty()) tName = "Кохана людина";
            if (pingAt > 0 && System.currentTimeMillis() - pingAt < 24L * 3600 * 1000) {
                v.setViewVisibility(R.id.ping, View.VISIBLE);
                v.setTextViewText(R.id.ping, "💗 " + tName + " думає про тебе · " + TaskLogic.ago(pingAt));
            } else {
                v.setViewVisibility(R.id.ping, View.GONE);
            }

            String uName = U.optString("name", "");
            if (uName.isEmpty()) uName = "Я";
            StringBuilder st = new StringBuilder();
            st.append(dm.optBoolean("done") ? "✓ " : "○ ").append(uName);
            if (pj != null && !pj.isEmpty()) {
                st.append("   ").append(dt.optBoolean("done") ? "✓ " : "○ ").append(tName);
                if (k.equals(T.optString("moodDay")) && T.has("mood")) {
                    int m = T.optInt("mood", -1);
                    if (m >= 0 && m < MOODS.length) st.append("   ").append(MOODS[m]);
                }
            }
            if (streak > 0) st.append("   🔥").append(streak);
            v.setTextViewText(R.id.status, st.toString());
        } catch (Exception e) {
            v.setTextViewText(R.id.task, "Відкрий «Між нами», щоб оновити віджет");
        }
        return v;
    }

    private static boolean both(JSONObject days, String key) {
        JSONObject d = days.optJSONObject(key);
        if (d == null) return false;
        JSONObject a = d.optJSONObject("A"), b = d.optJSONObject("B");
        return a != null && b != null && a.optBoolean("done") && b.optBoolean("done");
    }
}
