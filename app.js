/* «Між нами» — застосунок для двох. Без фреймворків, працює офлайн, синхронізується через хмару. */
(function () {
  "use strict";
  var D = window.MN_DATA;
  var APP_VERSION = "1.0.0";

  /* ---------- утиліти ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function now() { return Date.now(); }
  function uid(n) { var a = "abcdefghjkmnpqrstuvwxyz23456789", s = ""; for (var i = 0; i < (n || 10); i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dkey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); }
  function dayNum(k) { var p = k.split("-"); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(2024, 0, 1)) / 864e5); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function other(r) { return r === "A" ? "B" : "A"; }
  function ago(t) {
    if (!t) return "";
    var s = Math.max(0, (now() - t) / 1000);
    if (s < 60) return "щойно";
    if (s < 3600) return Math.floor(s / 60) + " хв тому";
    if (s < 86400) return Math.floor(s / 3600) + " год тому";
    var d = Math.floor(s / 86400);
    return d === 1 ? "вчора" : d + " дн. тому";
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function hash32(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = seed; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var permCache = {};
  function perm(seed, n) {
    var key = seed + "|" + n; if (permCache[key]) return permCache[key];
    var r = rng(hash32(seed)), a = []; for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) { var k = Math.floor(r() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
    return (permCache[key] = a);
  }

  /* ---------- стан ---------- */
  var cfg = lsGet("mn_cfg", { me: "A", pair: null, setupDone: false, seenPing: 0 });
  var doc = normalize(lsGet("mn_doc", null));
  var ui = { tab: "today", calMonth: null, onb: "welcome", onbData: {}, sheet: null, pendingRender: false };
  var sync = { status: "off", busy: false, timer: null, pushTimer: null, lastOk: 0, error: "" };

  function emptyDoc() {
    return { v: 1, meta: { startDate: "", updatedAt: 0 }, users: { A: { name: "", rev: 0 }, B: { name: "", rev: 0 } }, days: {}, notes: {}, wishes: {} };
  }
  function normalize(d) {
    var e = emptyDoc();
    if (!d || typeof d !== "object") return e;
    d.v = 1;
    d.meta = d.meta || e.meta;
    d.users = d.users || {};
    d.users.A = d.users.A || { name: "", rev: 0 };
    d.users.B = d.users.B || { name: "", rev: 0 };
    d.users.A.rev = d.users.A.rev || 0; d.users.B.rev = d.users.B.rev || 0;
    d.days = d.days || {}; d.notes = d.notes || {}; d.wishes = d.wishes || {};
    return d;
  }
  var lastAndroidPair = null, androidTimer = null;
  function isAndroidApp() { return !!window.MNAndroid; }
  function androidSync() {
    if (!window.MNAndroid) return;
    try {
      var pj = cfg.pair ? JSON.stringify(cfg.pair) : "";
      if (pj + cfg.me !== lastAndroidPair) { window.MNAndroid.setPair(pj, cfg.me); lastAndroidPair = pj + cfg.me; }
      clearTimeout(androidTimer);
      androidTimer = setTimeout(function () { try { window.MNAndroid.docUpdated(JSON.stringify(doc)); } catch (e) {} }, 1200);
    } catch (e) {}
  }
  function save() { lsSet("mn_doc", doc); lsSet("mn_cfg", cfg); androidSync(); }
  function meU() { return doc.users[cfg.me]; }
  function themU() { return doc.users[other(cfg.me)]; }
  function paired() { return !!cfg.pair; }
  function partnerJoined() { var t = themU(); return !!(t && (t.name || t.rev)); }
  function myName() { return meU().name || "Я"; }
  function theirName() { return themU().name || "Кохана людина"; }
  function day(k, role) { var d = doc.days[k]; return (d && d[role]) || {}; }
  /* Кожна зміна моїх даних збільшує мою «ревізію» — так інший телефон знає, чия версія свіжіша */
  function touch() { meU().rev = (meU().rev || 0) + 1; meU().seen = now(); save(); schedulePush(); }
  function setDay(k, patch) {
    doc.days[k] = doc.days[k] || {};
    var cur = doc.days[k][cfg.me] || {};
    for (var p in patch) cur[p] = patch[p];
    doc.days[k][cfg.me] = cur;
    touch();
  }

  /* ---------- завдання дня ---------- */
  function seed() { return cfg.pair ? (cfg.pair.id || "solo") : "solo"; }
  function rerolls(k) { return (day(k, "A").reroll || 0) + (day(k, "B").reroll || 0); }
  function taskFor(k) {
    var n = D.tasks.length, p = perm(seed() + ":t", n);
    var i = p[((dayNum(k) + rerolls(k) * 53) % n + n) % n];
    return D.tasks[i];
  }
  function questionFor(k) {
    var n = D.questions.length, p = perm(seed() + ":q", n);
    return D.questions[p[(dayNum(k) % n + n) % n]];
  }
  function dayStatus(k) {
    var a = !!day(k, cfg.me).done, b = !!day(k, other(cfg.me)).done;
    if (!paired()) return a ? "both" : "none";
    return a && b ? "both" : (a || b ? "one" : "none");
  }
  function streak() {
    var k = dkey(), s = 0;
    if (dayStatus(k) !== "both") k = addDays(k, -1);
    while (dayStatus(k) === "both" && s < 5000) { s++; k = addDays(k, -1); }
    return s;
  }
  function bestStreak() {
    var keys = Object.keys(doc.days).filter(function (k) { return dayStatus(k) === "both"; }).sort();
    var best = 0, cur = 0, prev = null;
    keys.forEach(function (k) { cur = prev && addDays(prev, 1) === k ? cur + 1 : 1; best = Math.max(best, cur); prev = k; });
    return best;
  }
  function together() {
    if (!doc.meta.startDate) return null;
    return Math.max(0, Math.round((parseKey(dkey()) - parseKey(doc.meta.startDate)) / 864e5));
  }

  /* ---------- хмара: два варіанти сховища ---------- */
  var Store = {
    jb: {
      base: "https://jsonblob.com/api/jsonBlob",
      create: function (data) {
        return fetch(this.base, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) })
          .then(function (r) {
            if (!r.ok) throw new Error("Сервер відповів " + r.status);
            var loc = r.headers.get("Location") || r.headers.get("location") || "";
            var id = r.headers.get("X-jsonblob-id") || r.headers.get("x-jsonblob-id") || (loc ? loc.split("/").pop() : "");
            if (!id) throw new Error("Сервер не повернув код пари");
            return { kind: "jb", id: id };
          });
      },
      get: function (p) {
        return fetch(this.base + "/" + p.id + "?t=" + now(), { headers: { Accept: "application/json" }, cache: "no-store" })
          .then(function (r) { if (r.status === 404) throw new Error("Пару не знайдено"); if (!r.ok) throw new Error("Помилка " + r.status); return r.json(); });
      },
      put: function (p, data) {
        return fetch(this.base + "/" + p.id, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) })
          .then(function (r) { if (!r.ok) throw new Error("Помилка " + r.status); });
      }
    },
    fb: {
      url: function (p) { return p.url.replace(/\/+$/, "") + "/mizhnamy/" + p.id + ".json"; },
      create: function (data, url) {
        var p = { kind: "fb", url: url, id: uid(12) };
        return this.put(p, data).then(function () { return p; });
      },
      get: function (p) {
        return fetch(this.url(p) + "?t=" + now(), { cache: "no-store" })
          .then(function (r) { if (!r.ok) throw new Error(r.status === 401 ? "Доступ заборонено — перевір правила Firebase" : "Помилка " + r.status); return r.json(); })
          .then(function (j) { if (j === null) throw new Error("Пару не знайдено"); return j; });
      },
      put: function (p, data) {
        return fetch(this.url(p), { method: "PUT", body: JSON.stringify(data) })
          .then(function (r) { if (!r.ok) throw new Error(r.status === 401 ? "Доступ заборонено — перевір правила Firebase" : "Помилка " + r.status); });
      }
    }
  };
  function pairCode(p) { p = p || cfg.pair; if (!p) return ""; return p.kind === "jb" ? "MN-" + p.id : "MNF-" + p.id + "@" + p.url.replace(/^https:\/\//, "").replace(/\/+$/, ""); }
  function parseCode(s) {
    s = (s || "").trim().replace(/\s+/g, "");
    var m;
    if ((m = s.match(/^MNF-([a-z0-9]+)@(.+)$/i))) return { kind: "fb", id: m[1], url: "https://" + m[2].replace(/^https?:\/\//, "") };
    if ((m = s.match(/^MN-([A-Za-z0-9-]+)$/))) return { kind: "jb", id: m[1] };
    if ((m = s.match(/jsonBlob\/([A-Za-z0-9-]+)/))) return { kind: "jb", id: m[1] };
    return null;
  }

  /* Злиття: кожна людина — власник своїх даних (днів, імені, настрою).
     Береться та копія, у якій ревізія цієї людини вища. Записки й мрії — об'єднання за часом зміни. */
  function merge(local, remote) {
    local = normalize(clone(local)); remote = normalize(clone(remote));
    var out = emptyDoc();
    ["A", "B"].forEach(function (r) {
      var src = (local.users[r].rev || 0) >= (remote.users[r].rev || 0) ? local : remote;
      out.users[r] = src.users[r];
      Object.keys(src.days).forEach(function (k) {
        if (src.days[k] && src.days[k][r]) { out.days[k] = out.days[k] || {}; out.days[k][r] = src.days[k][r]; }
      });
    });
    out.meta = (local.meta.updatedAt || 0) >= (remote.meta.updatedAt || 0) ? local.meta : remote.meta;
    ["notes", "wishes"].forEach(function (col) {
      var ids = {}; Object.keys(local[col]).concat(Object.keys(remote[col])).forEach(function (i) { ids[i] = 1; });
      Object.keys(ids).forEach(function (i) {
        var a = local[col][i], b = remote[col][i];
        out[col][i] = !a ? b : !b ? a : ((a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b);
      });
    });
    return out;
  }

  function setSync(st, err) { sync.status = st; sync.error = err || ""; var d = $(".sync-dot"); if (d) d.className = "sync-dot " + (st === "ok" ? "ok" : st === "err" ? "err" : st === "busy" ? "busy" : ""); }
  function schedulePush() { if (!paired()) return; clearTimeout(sync.pushTimer); sync.pushTimer = setTimeout(function () { doSync(true); }, 700); }
  var syncQueued = false;
  function doSync(forcePush) {
    if (!paired()) return Promise.resolve();
    if (sync.busy) { syncQueued = true; return Promise.resolve(); }
    if (!navigator.onLine) { setSync("err", "Немає інтернету"); return Promise.resolve(); }
    sync.busy = true; setSync("busy");
    var S = Store[cfg.pair.kind], p = cfg.pair;
    var beforeTheir = JSON.stringify(themU());
    return S.get(p).then(function (remote) {
      remote = normalize(remote);
      var needPush = forcePush || (remote.users[cfg.me].rev || 0) < (meU().rev || 0) || JSON.stringify(remote.meta) !== JSON.stringify(doc.meta);
      var merged = merge(doc, remote);
      if (!needPush) {
        // перевіряємо, чи віддалена копія містить усі мої записки/мрії
        ["notes", "wishes"].forEach(function (c) { Object.keys(merged[c]).forEach(function (i) { var r = remote[c][i], m = merged[c][i]; if (!r || (r.updatedAt || 0) < (m.updatedAt || 0)) needPush = true; }); });
      }
      doc = merged; save();
      return needPush ? S.put(p, doc) : null;
    }).then(function () {
      sync.busy = false; sync.lastOk = now(); setSync("ok");
      var changed = JSON.stringify(themU()) !== beforeTheir;
      checkPing();
      if (changed || forcePush) safeRender();
      if (syncQueued) { syncQueued = false; doSync(true); }
    }).catch(function (e) {
      sync.busy = false; setSync("err", e.message || "Помилка синхронізації");
      if (syncQueued) { syncQueued = false; }
    });
  }
  function startSyncLoop() {
    clearInterval(sync.timer);
    if (!paired()) return;
    doSync(false);
    sync.timer = setInterval(function () { if (document.visibilityState === "visible") doSync(false); }, 15000);
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { doSync(false); safeRender(); } });
  window.addEventListener("online", function () { doSync(true); });

  /* ---------- «думаю про тебе» ---------- */
  function checkPing() {
    var t = themU();
    if (t.pingAt && t.pingAt > (cfg.seenPing || 0) && now() - t.pingAt < 3 * 864e5) {
      ui.showPing = t.pingAt;
    }
  }
  function sendPing() {
    var u = meU(); u.pings = (u.pings || 0) + 1; u.pingAt = now();
    touch(); hearts(10);
    toast(paired() ? theirName() + " отримає твоє 💗" : "💗 Записано! Підключи пару, щоб це бачила кохана людина");
    render();
  }

  /* ---------- візуальні ефекти ---------- */
  function toast(msg) {
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = 0; setTimeout(function () { t.remove(); }, 300); }, 2200);
  }
  function hearts(n) {
    var c = document.createElement("div"); c.className = "confetti"; var em = ["💗", "💖", "❤️", "💕", "✨", "🌸"];
    for (var i = 0; i < (n || 18); i++) { var h = document.createElement("i"); h.textContent = em[i % em.length]; h.style.left = Math.random() * 100 + "%"; h.style.animationDelay = Math.random() * .6 + "s"; h.style.fontSize = 16 + Math.random() * 18 + "px"; c.appendChild(h); }
    document.body.appendChild(c); setTimeout(function () { c.remove(); }, 3400);
  }
  function copy(text) {
    var done = function () { toast("Скопійовано"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Виділи й скопіюй вручну"); } ta.remove(); }
  }

  /* ---------- рендер ---------- */
  var root = $("#app");
  function typing() { var a = document.activeElement; return a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT") && root.contains(a); }
  function safeRender() { if (typing() || ui.sheet) { ui.pendingRender = true; return; } render(); }
  document.addEventListener("focusout", function () { setTimeout(function () { if (ui.pendingRender && !typing() && !ui.sheet) { ui.pendingRender = false; render(); } }, 50); });

  function render() {
    if (!cfg.setupDone) { root.innerHTML = renderOnb(); return; }
    var view = { today: vToday, us: vUs, dreams: vDreams, history: vHistory }[ui.tab] || vToday;
    var tg = together();
    var sub = tg !== null ? "Разом " + tg + " " + plural(tg, "день", "дні", "днів") : (paired() ? myName() + " & " + theirName() : "Для двох сердець");
    root.innerHTML =
      '<div class="wrap">' +
      '<header class="top"><div class="brand">Між нами<small>' + esc(sub) + '</small></div>' +
      '<button class="iconbtn" data-act="settings" aria-label="Налаштування">⚙️<span class="sync-dot ' + (paired() ? (sync.status === "ok" ? "ok" : sync.status === "err" ? "err" : "") : "") + '"></span></button></header>' +
      view() + '</div>' +
      '<nav class="tabs">' +
      tabBtn("today", "🌤️", "Сьогодні") + tabBtn("us", "💌", "Записки") + tabBtn("dreams", "✨", "Мрії") + tabBtn("history", "📅", "Історія") +
      '</nav>';
  }
  function tabBtn(id, i, n) { return '<button class="' + (ui.tab === id ? "on" : "") + '" data-tab="' + id + '"><span class="i">' + i + "</span>" + n + "</button>"; }

  var MOODS = ["😔", "😐", "🙂", "😊", "🥰"];
  function vToday() {
    var k = dkey(), t = taskFor(k), c = D.cats[t.c], mine = day(k, cfg.me), theirs = day(k, other(cfg.me)), q = questionFor(k);
    var h = "";
    if (ui.showPing) {
      h += '<div class="banner" data-act="ack-ping"><span class="big">💗</span><div><b>' + esc(theirName()) + ' думає про тебе</b><div class="small muted">' + ago(ui.showPing) + ' · торкнись, щоб закрити</div></div></div>';
    }
    if (!paired()) h += '<div class="banner" data-act="settings"><span>🔗</span><div><b>Підключи кохану людину</b><div class="small muted">Щоб бачити її відповіді, настрій і «думаю про тебе»</div></div></div>';
    // завдання
    h += '<div class="card hero"><div class="row"><span class="tag">' + c.e + " " + esc(c.n) + '</span><span class="spacer"></span><span class="small" style="opacity:.85">Завдання дня</span></div>' +
      '<div class="task-text">' + esc(t.t) + "</div>";
    if (mine.done) {
      h += '<div class="row wrap-row" style="position:relative;z-index:1"><button class="btn white" data-act="undo-done">✓ Виконано</button><button class="btn ghost sm" data-act="done-note">' + (mine.note ? "Змінити нотатку" : "Додати нотатку") + "</button></div>";
    } else {
      h += '<div class="row" style="position:relative;z-index:1"><button class="btn white" data-act="done">Виконали ✓</button>' +
        ((mine.reroll || 0) < 2 ? '<button class="btn ghost" data-act="reroll" title="Інше завдання">↻ Інше</button>' : "") + "</div>";
    }
    if (mine.note) h += '<div class="done-note">📝 ' + esc(mine.note) + "</div>";
    if (paired() && theirs.note) h += '<div class="done-note">💬 ' + esc(theirName()) + ": " + esc(theirs.note) + "</div>";
    h += '<div class="people"><span class="pill ' + (mine.done ? "done" : "") + '">' + (mine.done ? "✓" : "○") + " " + esc(myName()) + "</span>" +
      (paired() ? '<span class="pill ' + (theirs.done ? "done" : "") + '">' + (theirs.done ? "✓" : "○") + " " + esc(theirName()) + "</span>" : "") +
      '<span class="pill">🔥 ' + streak() + "</span></div></div>";
    // думаю про тебе
    h += '<button class="ping" data-act="ping">💗 Думаю про тебе</button>';
    // питання
    h += '<div class="card"><h3>Питання дня</h3><div class="q">' + esc(q) + "</div>";
    if (mine.answer) {
      h += '<div class="answer"><b>' + esc(myName()) + '</b>' + esc(mine.answer) + '</div>';
      if (paired()) {
        h += theirs.answer ? '<div class="answer"><b>' + esc(theirName()) + "</b>" + esc(theirs.answer) + "</div>"
          : '<div class="locked">⏳ Чекаємо відповідь від ' + esc(theirName()) + "</div>";
      }
      h += '<div style="margin-top:10px"><button class="btn line sm" data-act="edit-answer">Змінити відповідь</button></div>';
    } else {
      h += '<textarea id="ans" rows="3" placeholder="Твоя відповідь…"></textarea><div style="margin-top:10px" class="row"><button class="btn" data-act="answer">Відповісти</button>' +
        (paired() && theirs.answer ? '<span class="small muted">🔒 ' + esc(theirName()) + " уже відповідає — відкриється після тебе</span>" : "") + "</div>";
    }
    h += "</div>";
    // настрій
    var tm = themU();
    h += '<div class="card"><h3>Мій настрій</h3><div class="moods">' + MOODS.map(function (m, i) {
      var on = meU().mood === i && meU().moodDay === k;
      return '<button class="mood ' + (on ? "on" : "") + '" data-mood="' + i + '">' + m + "</button>";
    }).join("") + "</div>";
    if (paired()) {
      h += '<div class="small muted" style="margin-top:12px">' + (tm.moodDay === k && tm.mood != null ? esc(theirName()) + " сьогодні: <span style=\"font-size:20px\">" + MOODS[tm.mood] + "</span> · " + ago(tm.moodAt) : esc(theirName()) + " ще не відмітив(ла) настрій сьогодні") + "</div>";
    }
    h += "</div>";
    h += '<div class="stats"><div class="stat"><b>' + streak() + '</b><span>днів поспіль</span></div><div class="stat"><b>' + countBoth() + '</b><span>завдань разом</span></div><div class="stat"><b>' + ((meU().pings || 0) + (paired() ? (themU().pings || 0) : 0)) + "</b><span>💗 надіслано</span></div></div>";
    return h;
  }
  function countBoth() { return Object.keys(doc.days).filter(function (k) { return dayStatus(k) === "both"; }).length; }

  function vUs() {
    var notes = Object.keys(doc.notes).map(function (i) { return doc.notes[i]; }).filter(function (n) { return n && !n.deleted; }).sort(function (a, b) { return a.at - b.at; });
    var h = '<div class="section-title">Записки</div><div class="sub">Маленькі листи одне одному. Лишаються назавжди.</div>';
    h += '<div class="card"><div class="composer"><textarea id="note" rows="2" placeholder="Напиши щось тепле…"></textarea><button class="btn" data-act="note" style="height:48px">💌</button></div>' +
      '<div class="row wrap-row" style="margin-top:10px">' + ["Ти мій дім 🏡", "Сумую 🥺", "Пишаюсь тобою ✨", "Дякую за сьогодні 💗", "Обійми мене 🫂"].map(function (s) { return '<button class="btn soft sm" data-quick="' + esc(s) + '">' + esc(s) + "</button>"; }).join("") + "</div></div>";
    if (!notes.length) h += '<div class="empty-st"><span class="e">💌</span>Тут ще порожньо. Напиши першу записку!</div>';
    notes.slice().reverse().forEach(function (n) {
      var mine = n.by === cfg.me;
      h += '<div class="note ' + (mine ? "me" : "them") + '">' + esc(n.text) + '<div class="meta">' + esc(mine ? myName() : (doc.users[n.by] && doc.users[n.by].name) || theirName()) + " · " + fmtDateTime(n.at) +
        (mine ? ' · <button data-delnote="' + n.id + '" style="color:inherit;opacity:.8;text-decoration:underline">видалити</button>' : "") + "</div></div>";
    });
    return h;
  }
  function fmtDateTime(t) { var d = new Date(t); return d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" }) + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }

  function vDreams() {
    var ws = Object.keys(doc.wishes).map(function (i) { return doc.wishes[i]; }).filter(function (w) { return w && !w.deleted; }).sort(function (a, b) { return (a.done - b.done) || (b.at - a.at); });
    var done = ws.filter(function (w) { return w.done; }).length;
    var h = '<div class="section-title">Наші мрії</div><div class="sub">Спільний список: місця, пригоди, плани. ' + (ws.length ? "Здійснено " + done + " з " + ws.length + "." : "") + "</div>";
    h += '<div class="card"><div class="composer"><input type="text" id="wish" placeholder="Наприклад: зустріти світанок у горах"><button class="btn" data-act="wish">+</button></div>' +
      '<div class="row wrap-row" style="margin-top:10px">' + ["🏔️ Карпати взимку", "🌊 Море вдвох", "🎡 Парк розваг", "🍝 Курси італійської кухні", "⛺ Ніч у наметі"].map(function (s) { return '<button class="btn soft sm" data-qwish="' + esc(s) + '">' + esc(s) + "</button>"; }).join("") + "</div></div>";
    if (!ws.length) return h + '<div class="empty-st"><span class="e">✨</span>Додайте першу спільну мрію</div>';
    h += '<div class="card"><ul class="list">' + ws.map(function (w) {
      return '<li class="item ' + (w.done ? "done" : "") + '"><button class="check ' + (w.done ? "on" : "") + '" data-wtoggle="' + w.id + '">' + (w.done ? "✓" : "") + '</button><div class="spacer txt">' + esc(w.text) +
        '<div class="small muted">' + esc((doc.users[w.by] && doc.users[w.by].name) || "") + (w.done && w.doneAt ? " · здійснено " + new Date(w.doneAt).toLocaleDateString("uk-UA") : "") + '</div></div><button class="del" data-wdel="' + w.id + '">×</button></li>';
    }).join("") + "</ul></div>";
    return h;
  }

  function vHistory() {
    var base = ui.calMonth ? parseKey(ui.calMonth + "-01") : new Date();
    var y = base.getFullYear(), m = base.getMonth(), first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    var off = (first.getDay() + 6) % 7, today = dkey();
    var h = '<div class="section-title">Історія</div><div class="sub">Повне серце — обоє виконали завдання, рожеве — один із вас.</div>';
    h += '<div class="stats"><div class="stat"><b>' + streak() + '</b><span>поточна серія</span></div><div class="stat"><b>' + bestStreak() + '</b><span>рекорд</span></div><div class="stat"><b>' + countBoth() + "</b><span>усього разом</span></div></div>";
    h += '<div class="card"><div class="cal-head"><button class="iconbtn" data-cal="-1">‹</button><b>' + first.toLocaleDateString("uk-UA", { month: "long", year: "numeric" }) + '</b><button class="iconbtn" data-cal="1">›</button></div><div class="cal">' +
      ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map(function (d) { return '<div class="dow">' + d + "</div>"; }).join("");
    for (var i = 0; i < off; i++) h += '<div class="day empty"></div>';
    for (var d = 1; d <= days; d++) {
      var k = y + "-" + pad(m + 1) + "-" + pad(d), st = dayStatus(k), fut = k > today;
      var mood = day(k, cfg.me).answer || day(k, other(cfg.me)).answer ? "💬" : "";
      h += '<button class="day ' + (st !== "none" ? st : "") + (k === today ? " today" : "") + (fut ? " future" : "") + '" ' + (fut ? "disabled" : 'data-day="' + k + '"') + ">" + d + '<span class="h">' + (st === "both" ? "❤" : st === "one" ? "♡" : mood ? "·" : "") + "</span></button>";
    }
    h += "</div></div>";
    return h;
  }

  /* ---------- онбординг ---------- */
  function renderOnb() {
    var s = ui.onb, o = ui.onbData;
    if (s === "welcome") return '<div class="onb"><div><span class="heart">💞</span></div><h1>Між нами</h1><p>Щодня — нове маленьке завдання для вас двох, питання, на яке відповідаєте обоє, записки, спільні мрії та «думаю про тебе», що летить на інший телефон.</p><button class="btn block" data-onb="name">Почати</button></div>';
    if (s === "name") return '<div class="onb"><h1>Як тебе звати?</h1><p>Це ім\'я побачить твоя кохана людина.</p><input type="text" id="o-name" placeholder="Твоє ім\'я" value="' + esc(o.name || "") + '" maxlength="24"><div style="height:14px"></div><button class="btn block" data-onb="mode">Далі</button></div>';
    if (s === "mode") return '<div class="onb"><h1>Привіт, ' + esc(o.name) + '!</h1><p>Як підключимо вас двох?</p>' +
      '<button class="choice" data-onb="create"><b>💞 Створити пару</b><span>Я перший(а). Отримаю код і відправлю його коханій людині.</span></button>' +
      '<button class="choice" data-onb="join"><b>🔗 У мене є код</b><span>Кохана людина вже створила пару й надіслала код.</span></button>' +
      '<button class="choice" data-onb="solo"><b>🌱 Поки що без синхронізації</b><span>Підключитися можна будь-коли в налаштуваннях.</span></button></div>';
    if (s === "create") return '<div class="onb"><h1>Нова пара</h1><p>Де зберігати ваші спільні дані?</p>' +
      '<div class="seg"><button class="' + (o.kind !== "fb" ? "on" : "") + '" data-kind="jb">Швидко</button><button class="' + (o.kind === "fb" ? "on" : "") + '" data-kind="fb">Firebase</button></div>' +
      (o.kind === "fb" ? '<div class="field"><label>Адреса бази Firebase Realtime Database</label><input type="url" id="o-fb" placeholder="https://назва-default-rtdb.europe-west1.firebasedatabase.app" value="' + esc(o.fb || "") + '"></div><div class="hint">Як створити безкоштовну базу — в інструкції, яку я надіслав разом із застосунком.</div>'
        : '<div class="hint" style="margin-top:12px">Без реєстрації: дані зберігаються в безкоштовному сервісі jsonblob.com під секретним кодом вашої пари. Якщо не спрацює — обери Firebase.</div>') +
      '<div class="field"><label>Коли ви разом? (необов\'язково)</label><input type="date" id="o-start" value="' + esc(o.start || "") + '"></div>' +
      '<button class="btn block" data-onb="do-create" ' + (o.busy ? "disabled" : "") + ">" + (o.busy ? "Створюю…" : "Створити пару") + '</button><div style="height:8px"></div><button class="btn line block" data-onb="mode">Назад</button>' + (o.err ? '<p style="color:#D9534F;margin-top:12px">' + esc(o.err) + "</p>" : "") + "</div>";
    if (s === "created") return '<div class="onb"><span class="heart">🎉</span><h1>Пару створено</h1><p>Надішли цей код коханій людині. Вона встановить «Між нами» і вставить його на кроці «У мене є код».</p><div class="code">' + esc(pairCode()) + '</div><div style="height:12px"></div><button class="btn soft block" data-copy="' + esc(pairCode()) + '">Скопіювати код</button><div style="height:10px"></div><button class="btn block" data-onb="finish">Готово</button></div>';
    if (s === "join") return '<div class="onb"><h1>Вставте код</h1><p>Код пари починається з «MN-» або «MNF-».</p><textarea id="o-code" rows="3" placeholder="MN-…">' + esc(o.code || "") + '</textarea><div style="height:14px"></div><button class="btn block" data-onb="do-join" ' + (o.busy ? "disabled" : "") + ">" + (o.busy ? "Підключаю…" : "Підключитися") + '</button><div style="height:8px"></div><button class="btn line block" data-onb="mode">Назад</button>' + (o.err ? '<p style="color:#D9534F;margin-top:12px">' + esc(o.err) + "</p>" : "") + "</div>";
    if (s === "pick") return '<div class="onb"><h1>Хто ти?</h1><p>У цій парі вже є двоє. Обери себе, щоб відновити свої дані на цьому телефоні.</p>' +
      ["A", "B"].map(function (r) { return '<button class="choice" data-pick="' + r + '"><b>' + esc(o.remote.users[r].name || r) + "</b></button>"; }).join("") + "</div>";
    return "";
  }
  function onbAction(a) {
    var o = ui.onbData;
    var nm = $("#o-name"); if (nm) o.name = nm.value.trim();
    var fb = $("#o-fb"); if (fb) o.fb = fb.value.trim();
    var st = $("#o-start"); if (st) o.start = st.value;
    var cd = $("#o-code"); if (cd) o.code = cd.value.trim();
    o.err = "";
    if (a === "mode" && !o.name) { toast("Введи ім'я"); return; }
    if (a === "solo") { cfg.me = "A"; meU().name = o.name; finishSetup(); return; }
    if (a === "do-create") {
      if (o.kind === "fb" && !/^https:\/\/.+/.test(o.fb || "")) { o.err = "Встав адресу бази, що починається з https://"; render(); return; }
      o.busy = true; render();
      cfg.me = "A"; meU().name = o.name; if (o.start) { doc.meta = { startDate: o.start, updatedAt: now() }; } meU().rev++;
      var pr = o.kind === "fb" ? Store.fb.create(doc, o.fb) : Store.jb.create(doc);
      pr.then(function (p) { cfg.pair = p; save(); o.busy = false; ui.onb = "created"; render(); })
        .catch(function (e) { o.busy = false; o.err = "Не вдалося створити пару: " + e.message + (o.kind !== "fb" ? ". Спробуй варіант Firebase." : ""); render(); });
      return;
    }
    if (a === "do-join") {
      var p = parseCode(o.code); if (!p) { o.err = "Код не схожий на код «Між нами»"; render(); return; }
      o.busy = true; render();
      Store[p.kind].get(p).then(function (remote) {
        remote = normalize(remote); o.busy = false; o.pair = p; o.remote = remote;
        var aT = !!(remote.users.A.name || remote.users.A.rev), bT = !!(remote.users.B.name || remote.users.B.rev);
        if (aT && bT) { ui.onb = "pick"; render(); return; }
        joinAs(aT ? "B" : "A");
      }).catch(function (e) { o.busy = false; o.err = "Не вдалося підключитися: " + e.message; render(); });
      return;
    }
    if (a === "finish") { finishSetup(); return; }
    ui.onb = a; render();
  }
  function joinAs(role) {
    var o = ui.onbData;
    cfg.pair = o.pair; cfg.me = role; doc = normalize(o.remote);
    if (o.name) { meU().name = o.name; }
    meU().rev = (meU().rev || 0) + 1;
    save(); finishSetup(); doSync(true); hearts(24);
  }
  function finishSetup() { cfg.setupDone = true; save(); ui.tab = "today"; render(); startSyncLoop(); }

  /* ---------- аркуші (модальні вікна) ---------- */
  function openSheet(html) {
    closeSheet(true);
    var bg = document.createElement("div"); bg.className = "sheet-bg"; bg.innerHTML = '<div class="sheet"><div class="grab"></div>' + html + "</div>";
    bg.addEventListener("click", function (e) { if (e.target === bg) closeSheet(); });
    document.body.appendChild(bg); ui.sheet = bg;
  }
  function closeSheet(silent) { if (ui.sheet) { ui.sheet.remove(); ui.sheet = null; } if (!silent && ui.pendingRender) { ui.pendingRender = false; render(); } }

  function sheetSettings() {
    var h = '<h2>Налаштування</h2>';
    h += '<div class="field"><label>Моє ім\'я</label><input type="text" id="s-name" value="' + esc(meU().name || "") + '" maxlength="24"></div>';
    h += '<div class="field"><label>Ми разом з…</label><input type="date" id="s-start" value="' + esc(doc.meta.startDate || "") + '"></div>';
    h += '<button class="btn block" data-act="save-settings">Зберегти</button>';
    h += '<div class="card"><h3>Пара</h3>';
    if (paired()) {
      h += '<p class="small">' + (partnerJoined() ? "Підключено: <b>" + esc(theirName()) + "</b>" : "Чекаємо, поки кохана людина введе код") + '<br><span class="muted">' + (sync.status === "err" ? "⚠️ " + esc(sync.error) : sync.lastOk ? "Синхронізовано " + ago(sync.lastOk) : "") + "</span></p>" +
        '<label class="small muted">Код пари</label><div class="code">' + esc(pairCode()) + '</div><div class="row" style="margin-top:10px"><button class="btn soft sm" data-copy="' + esc(pairCode()) + '">Копіювати код</button><button class="btn line sm" data-act="sync-now">Синхронізувати</button></div>';
    } else {
      h += '<p class="small muted">Синхронізацію не підключено.</p><button class="btn soft block" data-act="connect">Підключити пару</button>';
    }
    h += "</div>";
    if (isAndroidApp()) {
      h += '<div class="card"><h3>Віджет на головному екрані</h3><p class="small">Віджет уже вбудований у застосунок: він сам знає вашу пару й оновлюється.</p><button class="btn soft block" data-act="pin-widget">Додати віджет на екран</button><p class="hint">Якщо кнопка не спрацювала: утримуй палець на головному екрані → «Віджети» → «Між нами».</p></div>';
    } else if (/Android/i.test(navigator.userAgent)) {
      h += '<div class="card"><h3>Застосунок для Android</h3><p class="small">Встанови повну версію з віджетом для головного екрана.</p><a class="btn soft block" href="install.html" style="text-decoration:none">Завантажити для Android</a></div>';
    } else if (paired()) {
      var wcode = pairCode() + "|" + cfg.me;
      h += '<div class="card"><h3>Віджет на головному екрані</h3><ol class="steps small"><li>Встанови безкоштовний застосунок <b>Scriptable</b> з App Store.</li><li>Скопіюй скрипт віджета на <a href="install.html" style="color:var(--rose);font-weight:600">сторінці встановлення</a> і встав його в Scriptable («+»), назва — <b>mizh-namy-widget</b>.</li><li>На головному екрані: утримуй палець → «+» → Scriptable → обери розмір → «Додати».</li><li>Утримуй віджет → «Редагувати віджет» → Script: <b>mizh-namy-widget</b>, When Interacting: <b>Open URL</b>, Parameter: встав код нижче.</li></ol>' +
        '<div class="code">' + esc(wcode) + '</div><div style="margin-top:10px"><button class="btn soft sm" data-copy="' + esc(wcode) + '">Копіювати код для віджета</button></div>' +
        '</div>';
    }
    h += '<div class="card"><h3>Дані</h3><div class="row wrap-row"><button class="btn line sm" data-act="backup">Копія даних</button><button class="btn line sm" data-act="restore">Відновити з копії</button></div>' +
      '<div style="margin-top:12px"><button class="btn line sm" data-act="reset" style="color:#D9534F">Вийти з пари / скинути</button></div></div>';
    h += '<p class="hint" style="text-align:center">Між нами · v' + APP_VERSION + " · " + (cfg.me === "A" ? "партнер 1" : "партнер 2") + "</p>";
    openSheet(h);
  }
  function sheetConnect() {
    openSheet('<h2>Підключити пару</h2><p class="small muted">Твої записи збережуться. Обери:</p>' +
      '<button class="choice" data-act="c-create"><b>💞 Створити пару</b><span>Отримати код і надіслати його коханій людині</span></button>' +
      '<div class="field"><label>…або ввести її код</label><textarea id="c-code" rows="2" placeholder="MN-…"></textarea></div><button class="btn block" data-act="c-join">Підключитися</button>');
  }
  function sheetDay(k) {
    var t = taskFor(k), c = D.cats[t.c], a = day(k, cfg.me), b = day(k, other(cfg.me));
    var h = '<h2>' + parseKey(k).toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" }) + "</h2>";
    h += '<div class="card"><h3>' + c.e + " Завдання</h3><div class=\"q\">" + esc(t.t) + '</div><div class="small">' + esc(myName()) + ": " + (a.done ? "✓ виконано" : "—") + (paired() ? " · " + esc(theirName()) + ": " + (b.done ? "✓ виконано" : "—") : "") + "</div>" +
      (a.note ? '<div class="answer"><b>' + esc(myName()) + "</b>" + esc(a.note) + "</div>" : "") + (b.note ? '<div class="answer"><b>' + esc(theirName()) + "</b>" + esc(b.note) + "</div>" : "") + "</div>";
    h += '<div class="card"><h3>Питання</h3><div class="q">' + esc(questionFor(k)) + "</div>" +
      (a.answer ? '<div class="answer"><b>' + esc(myName()) + "</b>" + esc(a.answer) + "</div>" : '<div class="small muted">Ти не відповідав(ла)</div>') +
      (paired() ? (b.answer ? (a.answer ? '<div class="answer"><b>' + esc(theirName()) + "</b>" + esc(b.answer) + "</div>" : '<div class="locked">🔒 Відповідь ' + esc(theirName()) + " прихована, поки ти не відповіси</div>") : "") : "") + "</div>";
    if (k !== dkey() && !a.done) h += '<button class="btn soft block" data-markday="' + k + '">Ми це виконали ✓</button>';
    openSheet(h);
  }
  function sheetText(title, val, act, ph) {
    openSheet("<h2>" + esc(title) + '</h2><textarea id="sheet-txt" rows="4" placeholder="' + esc(ph || "") + '">' + esc(val || "") + '</textarea><div style="height:12px"></div><button class="btn block" data-act="' + act + '">Зберегти</button>');
    setTimeout(function () { var t = $("#sheet-txt"); if (t) t.focus(); }, 300);
  }

  /* ---------- обробка натискань ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("button, [data-act]"); if (!el) return;
    var ds = el.dataset;
    if (ds.onb) return onbAction(ds.onb);
    if (ds.kind) { ui.onbData.kind = ds.kind; var fb = $("#o-fb"); if (fb) ui.onbData.fb = fb.value; var st = $("#o-start"); if (st) ui.onbData.start = st.value; render(); return; }
    if (ds.pick) return joinAs(ds.pick);
    if (ds.tab) { ui.tab = ds.tab; ui.calMonth = null; render(); window.scrollTo(0, 0); return; }
    if (ds.copy) return copy(ds.copy);
    if (ds.mood != null && ds.mood !== undefined && el.classList.contains("mood")) { var u = meU(); u.mood = +ds.mood; u.moodDay = dkey(); u.moodAt = now(); touch(); render(); return; }
    if (ds.quick) { var n = $("#note"); if (n) { n.value = ds.quick; } return; }
    if (ds.qwish) { var w = $("#wish"); if (w) w.value = ds.qwish; return; }
    if (ds.delnote) { var nt = doc.notes[ds.delnote]; if (nt) { nt.deleted = true; nt.updatedAt = now(); touch(); render(); } return; }
    if (ds.wtoggle) { var wi = doc.wishes[ds.wtoggle]; if (wi) { wi.done = !wi.done; wi.doneAt = wi.done ? now() : 0; wi.updatedAt = now(); touch(); if (wi.done) hearts(14); render(); } return; }
    if (ds.wdel) { var wd = doc.wishes[ds.wdel]; if (wd) { wd.deleted = true; wd.updatedAt = now(); touch(); render(); } return; }
    if (ds.cal) { var b = ui.calMonth ? parseKey(ui.calMonth + "-01") : new Date(); b = new Date(b.getFullYear(), b.getMonth() + +ds.cal, 1); ui.calMonth = b.getFullYear() + "-" + pad(b.getMonth() + 1); render(); return; }
    if (ds.day) return sheetDay(ds.day);
    if (ds.markday) { setDay(ds.markday, { done: true, doneAt: now() }); closeSheet(); render(); hearts(12); return; }
    var a = ds.act; if (!a) return;
    var k = dkey();
    switch (a) {
      case "settings": sheetSettings(); break;
      case "done": setDay(k, { done: true, doneAt: now() }); hearts(26); render();
        if (paired() && day(k, other(cfg.me)).done) toast("Ви обоє виконали! 🔥 " + streak()); else toast("Чудово! Додай нотатку, якщо хочеш");
        break;
      case "undo-done": setDay(k, { done: false }); render(); break;
      case "reroll": setDay(k, { reroll: (day(k, cfg.me).reroll || 0) + 1 }); render(); toast("Нове завдання для вас обох"); break;
      case "done-note": sheetText("Нотатка до завдання", day(k, cfg.me).note, "save-note", "Як усе пройшло?"); break;
      case "save-note": setDay(k, { note: $("#sheet-txt").value.trim() }); closeSheet(); render(); break;
      case "answer": var v = $("#ans").value.trim(); if (!v) { toast("Напиши відповідь"); return; } setDay(k, { answer: v, answerAt: now() }); $("#ans").blur(); render(); hearts(8); break;
      case "edit-answer": sheetText("Твоя відповідь", day(k, cfg.me).answer, "save-answer"); break;
      case "save-answer": var v2 = $("#sheet-txt").value.trim(); if (v2) setDay(k, { answer: v2, answerAt: now() }); closeSheet(); render(); break;
      case "ping": sendPing(); break;
      case "ack-ping": cfg.seenPing = ui.showPing; ui.showPing = 0; save(); render(); break;
      case "note": var tx = $("#note").value.trim(); if (!tx) return; var id = uid(10); doc.notes[id] = { id: id, by: cfg.me, text: tx.slice(0, 1000), at: now(), updatedAt: now() }; touch(); $("#note").blur(); render(); hearts(8); break;
      case "wish": var wt = $("#wish").value.trim(); if (!wt) return; var wid = uid(10); doc.wishes[wid] = { id: wid, by: cfg.me, text: wt.slice(0, 200), done: false, at: now(), updatedAt: now() }; touch(); $("#wish").blur(); render(); break;
      case "save-settings":
        meU().name = $("#s-name").value.trim().slice(0, 24); var sd = $("#s-start").value;
        if (sd !== (doc.meta.startDate || "")) doc.meta = { startDate: sd, updatedAt: now() };
        touch(); closeSheet(); render(); toast("Збережено"); break;
      case "sync-now": doSync(true).then(function () { closeSheet(); sheetSettings(); toast(sync.status === "ok" ? "Синхронізовано" : sync.error); }); break;
      case "connect": sheetConnect(); break;
      case "pin-widget": try { window.MNAndroid.pinWidget(); } catch (er) {} toast("Підтверди додавання віджета"); break;
      case "c-create": closeSheet(); cfg.setupDone = false; ui.onb = "create"; ui.onbData = { name: meU().name || "" }; render(); break;
      case "c-join": var code = $("#c-code").value.trim(); closeSheet(); cfg.setupDone = false; ui.onb = "join"; ui.onbData = { name: meU().name || "", code: code }; render(); if (code) onbAction("do-join"); break;
      case "backup": openSheet('<h2>Копія даних</h2><p class="small muted">Збережи цей текст у Нотатках — з нього можна відновити все.</p><textarea rows="8" readonly>' + esc(JSON.stringify({ cfg: cfg, doc: doc })) + '</textarea><div style="height:10px"></div><button class="btn block" data-copy="' + esc(JSON.stringify({ cfg: cfg, doc: doc })) + '">Копіювати</button>'); break;
      case "restore": sheetText("Встав копію даних", "", "do-restore", "{…}"); break;
      case "do-restore":
        try { var j = JSON.parse($("#sheet-txt").value); if (!j.doc || !j.cfg) throw 0; cfg = j.cfg; doc = normalize(j.doc); save(); closeSheet(); render(); startSyncLoop(); toast("Відновлено"); }
        catch (er) { toast("Це не схоже на копію «Між нами»"); }
        break;
      case "reset":
        openSheet('<h2>Скинути?</h2><p>На цьому телефоні буде видалено всі дані й код пари. У хмарі дані залишаться — повернутися можна тим самим кодом.</p>' + (paired() ? '<div class="code">' + esc(pairCode()) + "</div><div style=\"height:10px\"></div>" : "") + '<button class="btn block" data-act="do-reset" style="background:#D9534F">Так, скинути</button>');
        break;
      case "do-reset": try { localStorage.removeItem("mn_doc"); localStorage.removeItem("mn_cfg"); } catch (er) {} location.reload(); break;
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && e.target.id === "wish") { e.preventDefault(); $("[data-act=wish]").click(); }
  });

  /* ---------- старт ---------- */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  // нагадування про новий день: якщо застосунок відкритий опівночі — оновити
  var lastDay = dkey();
  setInterval(function () { if (dkey() !== lastDay) { lastDay = dkey(); safeRender(); } }, 60000);
  render();
  androidSync();
  if (cfg.setupDone) startSyncLoop();
  window.MN = { doc: function () { return doc; }, cfg: function () { return cfg; }, merge: merge, taskFor: taskFor, questionFor: questionFor };
})();
