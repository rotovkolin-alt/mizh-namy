package ua.mizhnamy.app;

import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.TimeZone;

/** Точний порт правил вибору завдання з app.js — щоб віджет показував те саме завдання. */
public final class TaskLogic {
    private TaskLogic() {}

    public static int hash32(String s) {
        int h = 0x811C9DC5;
        for (int i = 0; i < s.length(); i++) {
            h ^= s.charAt(i);
            h *= 16777619;
        }
        return h;
    }

    /** mulberry32 */
    static final class Rng {
        private int a;
        Rng(int seed) { a = seed; }
        double next() {
            a += 0x6D2B79F5;
            int t = (a ^ (a >>> 15)) * (1 | a);
            t = (t + ((t ^ (t >>> 7)) * (61 | t))) ^ t;
            long u = (t ^ (t >>> 14)) & 0xFFFFFFFFL;
            return u / 4294967296.0;
        }
    }

    public static int[] perm(String seed, int n) {
        Rng r = new Rng(hash32(seed));
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = i;
        for (int j = n - 1; j > 0; j--) {
            int k = (int) Math.floor(r.next() * (j + 1));
            int t = a[j]; a[j] = a[k]; a[k] = t;
        }
        return a;
    }

    public static String dkey(Calendar c) {
        return String.format(java.util.Locale.US, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    public static long utcMillis(String key) {
        String[] p = key.split("-");
        GregorianCalendar g = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        g.clear();
        g.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
        return g.getTimeInMillis();
    }

    public static int dayNum(String key) {
        return (int) Math.round((utcMillis(key) - utcMillis("2024-01-01")) / 86400000.0);
    }

    public static int taskIndex(String seedId, String key, int rerolls, int n) {
        int[] p = perm(seedId + ":t", n);
        int i = ((dayNum(key) + rerolls * 53) % n + n) % n;
        return p[i];
    }

    public static int questionIndex(String seedId, String key, int n) {
        int[] p = perm(seedId + ":q", n);
        return p[((dayNum(key) % n) + n) % n];
    }

    public static String plural(long n, String one, String few, String many) {
        long m10 = n % 10, m100 = n % 100;
        if (m10 == 1 && m100 != 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
        return many;
    }

    public static String ago(long t) {
        long s = Math.max(0, (System.currentTimeMillis() - t) / 1000);
        if (s < 60) return "щойно";
        if (s < 3600) return (s / 60) + " хв тому";
        if (s < 86400) return (s / 3600) + " год тому";
        return (s / 86400) + " дн. тому";
    }
}
