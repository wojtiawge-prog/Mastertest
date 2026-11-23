import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Flame, Check, Plus, X, Dumbbell, Wallet, ListTodo, Sun, Pill, Timer as TimerIcon, ChevronRight, ChevronLeft, Trash2, ArrowRightLeft, Pause, Play, RotateCcw, Minus, TrendingUp, Target, MoreHorizontal, Coffee, Moon, Zap, PiggyBank, Pencil, Star, CalendarDays, BarChart3, Coins, AlertTriangle, Settings, Bell, Quote, Sparkles, ArrowDownToLine, Lightbulb, Apple, Beef, Wheat, Droplet, ShoppingCart, Store, Carrot, Utensils } from "lucide-react";
/* ───────────────────────── storage (persists across sessions) ───────────────────────── */
const mem = new Map();
const store = {
    async get(k) {
        try {
            if (typeof window !== "undefined" && window.storage) {
                const r = await window.storage.get(k);
                return r ? r.value : null;
            }
        }
        catch (e) { /* missing key throws -> treat as null */ }
        try {
            if (typeof localStorage !== "undefined") {
                const ls = localStorage.getItem(k);
                if (ls != null)
                    return ls;
            }
        }
        catch (e) { }
        return mem.has(k) ? mem.get(k) : null;
    },
    async set(k, v) {
        try {
            if (typeof window !== "undefined" && window.storage) {
                await window.storage.set(k, v);
                return;
            }
        }
        catch (e) { /* fall through */ }
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(k, v);
                return;
            }
        }
        catch (e) { /* quota/blocked -> memory */ }
        mem.set(k, v);
    },
};
const load = async (k, fb) => {
    const raw = await store.get(k);
    sync.seen(k, raw);
    if (raw == null)
        return fb;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fb;
    }
};
const save = (k, v) => { const j = JSON.stringify(v); store.set(k, j); sync.touch(k, j); };
const idb = {
    _p: null,
    open() {
        if (idb._p)
            return idb._p;
        idb._p = new Promise((res) => {
            try {
                if (typeof indexedDB === "undefined")
                    return res(null);
                const req = indexedDB.open("masterplan_db", 1);
                req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains("kv"))
                    d.createObjectStore("kv"); };
                req.onsuccess = () => res(req.result);
                req.onerror = () => res(null);
            }
            catch (e) {
                res(null);
            }
        });
        return idb._p;
    },
    async get(k) {
        const d = await idb.open();
        if (!d)
            return null;
        return new Promise((res) => { try {
            const r = d.transaction("kv", "readonly").objectStore("kv").get(k);
            r.onsuccess = () => res(r.result != null ? r.result : null);
            r.onerror = () => res(null);
        }
        catch (e) {
            res(null);
        } });
    },
    async set(k, v) {
        const d = await idb.open();
        if (!d)
            return false;
        return new Promise((res) => { try {
            const tx = d.transaction("kv", "readwrite");
            tx.objectStore("kv").put(v, k);
            tx.oncomplete = () => res(true);
            tx.onerror = () => res(false);
        }
        catch (e) {
            res(false);
        } });
    },
};
const PUSH_VAPID = "BB8NsvgZjbmkaKZKDK3dJTsNAbsjNz-XdPyqB4SfRAXh8KyXXSZVgHdcDrX7t1V473uHfWasFFI6XBgY_EMN_UM";
const getPushWorker = () => { try {
    return (localStorage.getItem("mp_worker_url") || "").replace(/\/+$/, "");
}
catch (e) {
    return "";
} };
const urlB64ToUint8 = (b64) => { const pad = "=".repeat((4 - (b64.length % 4)) % 4); const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(s); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++)
    out[i] = raw.charCodeAt(i); return out; };
const enablePush = async (timeStr) => {
    const W = getPushWorker();
    if (!W)
        throw new Error("Najpierw wpisz adres Workera ponizej.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error("To urzadzenie/przegladarka nie obsluguje push.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted")
        throw new Error("Brak zgody na powiadomienia.");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub)
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(PUSH_VAPID) });
    const parts = (timeStr || "07:00").split(":");
    const hour = parseInt(parts[0], 10) || 7, minute = parseInt(parts[1], 10) || 0;
    const res = await fetch(W + "/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub, hour, minute, tz: new Date().getTimezoneOffset() }) });
    if (!res.ok)
        throw new Error("Worker odrzucil subskrypcje (" + res.status + ").");
    return true;
};
const disablePush = async () => {
    try {
        const W = getPushWorker();
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            if (W) {
                try {
                    await fetch(W + "/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
                }
                catch (e) { }
            }
            await sub.unsubscribe();
        }
    }
    catch (e) { }
};
/* ───────────────────────── helpers ───────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const pad = (n) => String(n).padStart(2, "0");
const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monthKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const buzz = (p) => { try {
    navigator.vibrate && navigator.vibrate(p);
}
catch { } };
const eur = (n) => "€" + (Math.round(n * 100) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const PL_DAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const PL_MON = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const prettyDate = () => {
    const d = new Date();
    return `${PL_DAYS[d.getDay()]}, ${d.getDate()} ${PL_MON[d.getMonth()]}`;
};
const dayOfYear = () => {
    const d = new Date();
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
};
/* ───────────────────────── seed data (from your two Excel files) ───────────────────────── */
const SEED_HABITS = [
    { id: "h_wake", name: "Stała pora pobudki", hint: "±15 min, każdy dzień", core: true, icon: "sun", time: "06:00", period: "Rano" },
    { id: "h_cold", name: "Zimny prysznic", hint: "min. 30 sek", core: true, icon: "zap", time: "06:30", period: "Rano" },
    { id: "h_move", name: "Trening / ruch", hint: "choćby 10 min — nigdy zero", core: true, icon: "dumbbell", time: "07:00", period: "Rano" },
    { id: "h_deep", name: "Deep Work", hint: "min. 1h skupienia", core: true, icon: "target", time: "09:00", period: "Południe" },
    { id: "h_review", name: "Wieczorny review", hint: "3 rzeczy, które zrobiłeś", core: true, icon: "moon", time: "21:00", period: "Wieczór" },
    { id: "h_nico", name: "Dzień bez nikotyny", hint: "priorytet #1 — sabotuje wszystko", core: true, icon: "flame", time: "", period: "Cały dzień" },
];
const SEED_SUPPS = [
    { id: "s_d3", name: "Witamina D3 + K2", dose: "5000 IU / 200 mcg", when: "Rano" },
    { id: "s_boron", name: "Boron", dose: "10 mg", when: "Rano" },
    { id: "s_tongkat", name: "Tongkat Ali", dose: "400 mg", when: "Rano" },
    { id: "s_omega", name: "Omega-3 (EPA+DHA)", dose: "2–3 g", when: "Rano" },
    { id: "s_crea", name: "Kreatyna monohydrat", dose: "5–10 g", when: "Po treningu" },
    { id: "s_zinc", name: "Cynk pikolinian", dose: "25 mg", when: "Wieczór" },
    { id: "s_mag", name: "Magnez (glicynian)", dose: "400 mg", when: "Wieczór" },
    { id: "s_ashwa", name: "Ashwagandha KSM-66", dose: "600 mg", when: "Wieczór" },
];
const SYNC_KEYS = ["mp_profile_v1", "mp_habits_v1", "mp_supps_v1", "mp_daily_v4", "mp_tasks_v1", "mp_finance_v1", "mp_events_v1", "mp_diet_v1", "mp_shopping_v1", "mp_saas_v1", "mp_measures_v1", "mp_books_v1", "mp_prs_v1", "mp_review_v1", "mp_medi_v1", "mp_voice_v1", "mp_blood_v1", "mp_charisma_v1", "mp_journal_v1", "mp_bizplan_v1", "mp_trades_v1", "mp_rest_v1", "mp_gate_v1", "mp_fav_v1", "mp_hub_v1", "mp_alarms_v1", "mp_goal_v1", "mp_dgrep_v1"];
const SB_DEFAULT = { url: "https://rizfgnnlfdfigfyyrgon.supabase.co", key: "sb_publishable__iRIS60Qm_T3ncPD9ysKqA_7j70abEf" };
const sbNormUrl = (u) => {
  u = String(u || "").trim().replace(/^["']|["']$/g, "");
  const dash = /supabase\.com\/dashboard\/project\/([a-z0-9]+)/i.exec(u);
  if (dash) return "https://" + dash[1] + ".supabase.co";
  if (/^[a-z0-9]{15,}$/i.test(u)) return "https://" + u + ".supabase.co";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { return new URL(u).origin; } catch (e) { return u; }
};
const SYNC_SQL = `create table if not exists mp_state (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  value jsonb,
  ts bigint not null default 0,
  primary key (user_id, key)
);
alter table mp_state enable row level security;
create policy "mp_own" on mp_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant usage on schema public to authenticated;
grant select, insert, update, delete on table mp_state to authenticated;`;
const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
  }
};
const hashStr = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i) | 0;
  return s.length + ":" + h;
};
const sync = {
  cloud: null,
  user: null,
  status: "off",
  error: "",
  last: null,
  pulled: false,
  meta: (() => {
    try {
      return JSON.parse(lsGet("mp_sync_meta") || "{}");
    } catch {
      return {};
    }
  })(),
  dirty: /* @__PURE__ */ new Set(),
  timer: null,
  busy: false,
  subs: /* @__PURE__ */ new Set(),
  onRemote: null,
  emit() {
    this.subs.forEach((f) => f({ status: this.status, user: this.user, error: this.error, last: this.last }));
  },
  set(st, err) {
    this.status = st;
    this.error = err || "";
    this.emit();
  },
  saveMeta() {
    lsSet("mp_sync_meta", JSON.stringify(this.meta));
  },
  cfg() {
    let c = null;
    try {
      c = JSON.parse(lsGet("mp_sync_cfg") || "null");
    } catch {
    }
    return { ...(c || {}), url: SB_DEFAULT.url, key: SB_DEFAULT.key };
  },
  // przy wczytaniu z pamięci: wartość lokalna o nieznanym czasie = najstarsza (chmura wygrywa)
  seen(k, raw) {
    if (!SYNC_KEYS.includes(k) || raw == null || this.meta[k]) return;
    this.meta[k] = { ts: 0, h: hashStr(raw) };
    this.saveMeta();
  },
  // przy każdym zapisie
  touch(k, json) {
    if (!SYNC_KEYS.includes(k)) return;
    const h = hashStr(json);
    const m = this.meta[k];
    if (m && m.h === h) return;
    this.meta[k] = { ts: m ? Date.now() : 0, h };
    this.saveMeta();
    if (!m) return;
    this.dirty.add(k);
    this.schedule();
  },
  schedule(ms = 1500) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), ms);
  },
  async makeCloud(cfg) {
    if (typeof window !== "undefined" && window.__MP_MOCK_CLOUD) return window.__MP_MOCK_CLOUD;
    const { createClient } = await import("@supabase/supabase-js");
    const c = createClient(sbNormUrl(cfg.url), cfg.key.trim().replace(/^["']|["']$/g, ""), { auth: { persistSession: true, storageKey: "mp_sb_auth" } });
    return {
      async user() {
        const { data } = await c.auth.getSession();
        return data.session ? data.session.user : null;
      },
      async signIn(e, p) {
        const { data, error } = await c.auth.signInWithPassword({ email: e, password: p });
        if (error) throw error;
        return data.user;
      },
      async signUp(e, p) {
        const { data, error } = await c.auth.signUp({ email: e, password: p });
        if (error) throw error;
        return data.session ? data.user : null;
      },
      async signOut() {
        await c.auth.signOut();
      },
      async pull() {
        const { data, error } = await c.from("mp_state").select("key,value,ts");
        if (error) throw error;
        return data || [];
      },
      async push(rows) {
        const { error } = await c.from("mp_state").upsert(rows, { onConflict: "user_id,key" });
        if (error) throw error;
      }
    };
  },
  async init() {
    const cfg = this.cfg();
    if (!cfg || !cfg.url || !cfg.key) {
      this.set("off");
      return;
    }
    try {
      this.cloud = await this.makeCloud(cfg);
      this.user = await this.cloud.user();
      if (!this.user) {
        this.set("login");
        return;
      }
      this.set("idle");
      await this.pull();
    } catch (e) {
      this.set("error", e.message || String(e));
    }
  },
  async login(email, pw, create) {
    this.set("busy");
    try {
      const u = create ? await this.cloud.signUp(email, pw) : await this.cloud.signIn(email, pw);
      if (!u) {
        this.set("login", "Konto utworzone \u2014 potwierd\u017A e-mail z linku, potem zaloguj si\u0119.");
        return;
      }
      this.user = u;
      this.pulled = false;
      this.set("idle");
      await this.pull();
    } catch (e) {
      this.set("login", e.message || String(e));
    }
  },
  async logout() {
    try {
      await this.cloud.signOut();
    } catch {
    }
    this.user = null;
    this.pulled = false;
    this.set("login");
  },
  async pull() {
    if (!this.cloud || !this.user || this.busy) return;
    this.busy = true;
    this.set("syncing");
    try {
      const rows = await this.cloud.pull();
      const remote = /* @__PURE__ */ new Set();
      for (const r of rows) {
        if (!SYNC_KEYS.includes(r.key)) continue;
        remote.add(r.key);
        const local = this.meta[r.key] ? this.meta[r.key].ts : -1;
        const ts = Number(r.ts) || 0;
        if (ts > local) {
          const json = JSON.stringify(r.value);
          lsSet(r.key, json);
          this.meta[r.key] = { ts, h: hashStr(json) };
          this.dirty.delete(r.key);
          if (this.onRemote) this.onRemote(r.key, r.value);
        } else if (ts < local) this.dirty.add(r.key);
      }
      SYNC_KEYS.forEach((k) => {
        if (!remote.has(k) && lsGet(k) != null) this.dirty.add(k);
      });
      this.saveMeta();
      this.pulled = true;
      this.last = /* @__PURE__ */ new Date();
      this.busy = false;
      this.set("idle");
      if (this.dirty.size) await this.push();
    } catch (e) {
      this.busy = false;
      this.set("error", e.message || String(e));
    }
  },
  async push() {
    if (!this.cloud || !this.user || !this.pulled || !this.dirty.size) return;
    if (this.busy) {
      this.schedule(800);
      return;
    }
    this.busy = true;
    this.set("syncing");
    const keys = [...this.dirty];
    this.dirty.clear();
    try {
      const rows = keys.map((k) => {
        const raw = lsGet(k);
        return { user_id: this.user.id, key: k, value: raw == null ? null : JSON.parse(raw), ts: this.meta[k] && this.meta[k].ts || Date.now() };
      });
      await this.cloud.push(rows);
      this.last = /* @__PURE__ */ new Date();
      this.busy = false;
      this.set("idle");
    } catch (e) {
      keys.forEach((k) => this.dirty.add(k));
      this.busy = false;
      this.set("error", e.message || String(e));
      this.schedule(15e3);
    }
  }
};
if (typeof window !== "undefined") {
  window.__mpSync = sync;
  const again = () => {
    if (document.visibilityState === "visible") sync.pull();
  };
  document.addEventListener("visibilitychange", again);
  window.addEventListener("focus", again);
  window.addEventListener("online", again);
  setInterval(again, 45e3);
  window.addEventListener("pagehide", () => {
    if (sync.dirty.size) sync.push();
  });
}
const useSync = () => {
  const [s, setS] = useState({ status: sync.status, user: sync.user, error: sync.error, last: sync.last });
  useEffect(() => {
    sync.subs.add(setS);
    return () => sync.subs.delete(setS);
  }, []);
  return s;
};
function SyncDot() {
  const s = useSync();
  if (s.status === "off") return null;
  const c = s.status === "idle" ? "var(--green)" : s.status === "syncing" || s.status === "busy" ? "var(--amber)" : "var(--red)";
  return /* @__PURE__ */ React.createElement("span", { title: s.status, style: { position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: 9, background: c, boxShadow: `0 0 6px ${c}` } });
}
function SyncPanel() {
  const s = useSync();
  const cfg0 = sync.cfg() || {};
  const [url, setUrl] = useState(cfg0.url || "");
  const [key, setKey] = useState(cfg0.key || "");
  const [email, setEmail] = useState(cfg0.email || "");
  const [pw, setPw] = useState("");
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);
  const saveCfg = async () => {
    if (!url.trim() || !key.trim()) return;
    lsSet("mp_sync_cfg", JSON.stringify({ url: url.trim(), key: key.trim(), email }));
    await sync.init();
  };
  const doLogin = (create) => {
    if (!email || !pw) return;
    lsSet("mp_sync_cfg", JSON.stringify({ ...sync.cfg() || {}, email }));
    sync.login(email.trim(), pw, create);
  };
  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SYNC_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShowSql(true);
    }
  };
  const box = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 14, marginBottom: 14 };
  const lbl = { fontSize: 12, color: "var(--muted)", margin: "10px 0 6px", display: "block" };
  const btn = (primary) => ({ ...inputStyle, width: "100%", cursor: "pointer", fontWeight: 700, textAlign: "center", marginTop: 10, border: primary ? "none" : "1px solid var(--line2)", background: primary ? "var(--green)" : "transparent", color: primary ? "#04130a" : "var(--text)" });
  const stLabel = { off: "wy\u0142\u0105czona", login: "zaloguj si\u0119", idle: "zsynchronizowano", syncing: "synchronizuj\u0119\u2026", busy: "\u0142\u0105cz\u0119\u2026", error: "b\u0142\u0105d" }[s.status] || s.status;
  return /* @__PURE__ */ React.createElement("div", { style: box }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14.5, fontWeight: 700 } }, "Synchronizacja telefon \u2194 laptop"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, fontWeight: 700, color: s.status === "idle" ? "var(--green2)" : s.status === "error" ? "var(--red)" : "var(--muted)" } }, stLabel)), s.error && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: s.status === "error" ? "var(--red)" : "var(--amber)", marginTop: 8 } }, s.error), s.status === "off" || s.status === "error" && !sync.cloud ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", marginTop: 8, lineHeight: 1.5 } }, "Darmowy projekt Supabase \u2192 Project Settings \u2192 API. Wklej Project URL i klucz \u201Eanon public\u201D."), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Project URL"), /* @__PURE__ */ React.createElement("input", { style: inputStyle, value: url, placeholder: "https://xxxx.supabase.co", onChange: (e) => setUrl(e.target.value), autoCapitalize: "off", autoCorrect: "off" }), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Klucz anon public"), /* @__PURE__ */ React.createElement("input", { style: inputStyle, value: key, placeholder: "eyJhbGciOi\u2026", onChange: (e) => setKey(e.target.value), autoCapitalize: "off", autoCorrect: "off" }), /* @__PURE__ */ React.createElement("button", { onClick: copySql, style: btn(false) }, copied ? "\u2713 Skopiowano SQL" : "Kopiuj SQL tabeli (wklej w SQL Editor)"), showSql && /* @__PURE__ */ React.createElement("textarea", { readOnly: true, value: SYNC_SQL, style: { ...inputStyle, width: "100%", height: 150, marginTop: 8, fontSize: 11, fontFamily: "monospace" } }), /* @__PURE__ */ React.createElement("button", { onClick: saveCfg, style: btn(true) }, "Po\u0142\u0105cz")) : !s.user ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: lbl }, "E-mail"), /* @__PURE__ */ React.createElement("input", { style: inputStyle, type: "email", value: email, onChange: (e) => setEmail(e.target.value), autoCapitalize: "off" }), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Has\u0142o"), /* @__PURE__ */ React.createElement("input", { style: inputStyle, type: "password", value: pw, onChange: (e) => setPw(e.target.value) }), /* @__PURE__ */ React.createElement("button", { onClick: () => doLogin(false), style: btn(true) }, "Zaloguj"), /* @__PURE__ */ React.createElement("button", { onClick: () => doLogin(true), style: btn(false) }, "Za\u0142\xF3\u017C konto (pierwszy raz)"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    sync.cloud = null;
    sync.init();
  }, style: { ...btn(false), border: "none", color: "var(--faint)", fontSize: 12 } }, "Po\u0142\u0105cz ponownie")) : /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", marginTop: 8 } }, "Konto: ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--text)" } }, s.user.email)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", marginTop: 4 } }, "Ostatnio: ", s.last ? `${pad(s.last.getHours())}:${pad(s.last.getMinutes())}:${pad(s.last.getSeconds())}` : "\u2014", " \xB7 zmiany wysy\u0142ane od razu, pobierane przy otwarciu aplikacji i co 45 s"), /* @__PURE__ */ React.createElement("button", { onClick: () => sync.pull(), style: btn(true) }, "Synchronizuj teraz"), /* @__PURE__ */ React.createElement("button", { onClick: () => sync.logout(), style: btn(false) }, "Wyloguj")));
}

const PPL = (id, name, sub, ex) => ({ id, group: "Plan PPL", name: `${name} \u2014 ${sub}`, short: name, ex });
const E = (id, n, s, r, sug, rest, extra) => ({ id, n, s, r, sug, rest, ...extra || {} });
const WORKOUTS_PPL = [
  PPL("ppl_push", "Push", "klatka \xB7 barki \xB7 triceps \xB7 szyja prz\xF3d", [
    E("pu0", "Mobilno\u015B\u0107: barki + odcinek piersiowy", 1, "5 min", [0, 0], 0, { mode: "c", note: "Kr\u0105\u017Cenia ramion, band dislocates, rotacje T-spine, rozci\u0105ganie piersiowych przy \u015Bcianie" }),
    E("pu1", "Wyciskanie sztangi le\u017C\u0105c", 4, "4\u20136 \xB7 RPE 7\u20138", [180, 240], 210, { tag: "SI\u0141A" }),
    E("pu2", "Wyciskanie \u017Co\u0142nierskie stoj\u0105c (OHP)", 3, "6\u20138 \xB7 RPE 8", [150, 180], 150),
    E("pu3", "Wyciskanie hantli na skosie", 3, "8\u201312 \xB7 RPE 8", [120, 120], 120, { tag: "MASA" }),
    E("pu4", "Wznosy bokiem (hantle)", 3, "12\u201315 \xB7 RPE 8\u20139", [60, 90], 75),
    E("pu5", "Prostowanie ramion na wyci\u0105gu", 3, "10\u201312 \xB7 RPE 8\u20139", [60, 90], 75),
    E("pu6", "Szyja: zginanie le\u017C\u0105c na plecach (talerz na czole)", 2, "15\u201320 \xB7 wolno", [60, 60], 60, { tag: "SZYJA", note: "Lekko (g\u0142owa / 1,25\u20132,5 kg), pe\u0142na kontrola, bez szarpania" }),
    E("pu7", "Mobilno\u015B\u0107 ko\u0144cowa: klatka, triceps, pozycja dziecka", 1, "5 min", [0, 0], 0, { mode: "c" })
  ]),
  PPL("ppl_pull", "Pull", "plecy \xB7 biceps \xB7 przedramiona \xB7 szyja ty\u0142", [
    E("pl0", "Mobilno\u015B\u0107: biodra + kr\u0119gos\u0142up", 1, "5 min", [0, 0], 0, { mode: "c", note: "Cat-cow, 90/90, hip hinge z kijem, zwis na dr\u0105\u017Cku 30 s" }),
    E("pl1", "Martwy ci\u0105g (trap bar / klasyczny)", 3, "3\u20135 \xB7 RPE 7\u20138", [180, 240], 240, { tag: "SI\u0141A" }),
    E("pl2", "Podci\u0105ganie z obci\u0105\u017Ceniem", 4, "5\u20138 \xB7 RPE 8", [150, 180], 180),
    E("pl3", "Wios\u0142owanie hantlem", 3, "8\u201312 \xB7 RPE 8", [120, 120], 120, { tag: "MASA" }),
    E("pl4", "Face pull (postawa)", 3, "15 \xB7 RPE 7", [60, 60], 60),
    E("pl5", "Uginanie m\u0142otkowe", 3, "10\u201312 \xB7 RPE 8\u20139", [60, 90], 75),
    E("pl6", "Przedramiona: uginanie nadgarstk\xF3w (d\u0142onie w g\xF3r\u0119)", 2, "15\u201320", [45, 60], 60, { tag: "PRZEDRAMIONA" }),
    E("pl7", "Przedramiona: prostowanie nadgarstk\xF3w (d\u0142onie w d\xF3\u0142)", 2, "15\u201320", [45, 60], 60, { tag: "PRZEDRAMIONA" }),
    E("pl8", "Szyja: prostowanie le\u017C\u0105c na brzuchu (talerz z ty\u0142u g\u0142owy)", 2, "15\u201320 \xB7 wolno", [60, 60], 60, { tag: "SZYJA", note: "Lekko, powoli, pe\u0142na kontrola" }),
    E("pl9", "Zwis na dr\u0105\u017Cku (chwyt + rozci\u0105gni\u0119cie kr\u0119gos\u0142upa)", 2, "max s", [60, 60], 60, { tag: "CHWYT" })
  ]),
  PPL("ppl_legs", "Legs", "nogi \xB7 core \xB7 chwyt \xB7 szyja boki", [
    E("lg0", "Mobilno\u015B\u0107: kostki + biodra", 1, "5 min", [0, 0], 0, { mode: "c", note: "Kolano do \u015Bciany, couch stretch, przysiad z pauz\u0105 w dole 2\xD730 s" }),
    E("lg1", "Przysiad ze sztang\u0105", 4, "4\u20136 \xB7 RPE 7\u20138", [180, 240], 210, { tag: "SI\u0141A" }),
    E("lg2", "Rumu\u0144ski martwy ci\u0105g", 3, "6\u201310 \xB7 RPE 8", [120, 180], 150),
    E("lg3", "Przysiad bu\u0142garski (na nog\u0119)", 3, "8\u201310 \xB7 RPE 8", [120, 120], 120, { tag: "MASA" }),
    E("lg4", "Uginanie n\xF3g le\u017C\u0105c", 3, "10\u201312 \xB7 RPE 8\u20139", [90, 90], 90),
    E("lg5", "Wspi\u0119cia na palce stoj\u0105c", 4, "10\u201315 \xB7 RPE 8\u20139", [60, 60], 60),
    E("lg6", "Spacer farmera (chwyt \xB7 przedramiona \xB7 core)", 3, "40 m", [90, 90], 90, { tag: "CHWYT" }),
    E("lg7", "Unoszenie n\xF3g w zwisie", 3, "10\u201312", [60, 60], 60),
    E("lg8", "Szyja: boczne zginanie (le\u017C\u0105c na boku, na stron\u0119)", 2, "15 / strona \xB7 wolno", [60, 60], 60, { tag: "SZYJA", note: "Lekko, powoli \u2014 obie strony" }),
    E("lg9", "Mobilno\u015B\u0107 ko\u0144cowa: biodra, dwug\u0142owe, \u0142ydki", 1, "5 min", [0, 0], 0, { mode: "c" })
  ])
];
const PPL_IDS = WORKOUTS_PPL.map((w) => w.id);
const nextPPL = (daily) => {
  const ks = Object.keys(daily || {}).filter((k) => daily[k] && daily[k].workoutDone && PPL_IDS.includes(daily[k].workoutId)).sort();
  if (!ks.length) return PPL_IDS[0];
  const last = daily[ks[ks.length - 1]].workoutId;
  return PPL_IDS[(PPL_IDS.indexOf(last) + 1) % PPL_IDS.length];
};
const restStore = {
  v: {},
  subs: /* @__PURE__ */ new Set(),
  loaded: false,
  set(id, sec) {
    this.v = { ...this.v, [id]: Math.max(0, Math.min(900, sec)) };
    save("mp_rest_v1", this.v);
    this.subs.forEach((f) => f(this.v));
  },
  replace(v) {
    this.v = v || {};
    this.subs.forEach((f) => f(this.v));
  }
};
const restOf = (ex) => restStore.v[ex.id] != null ? restStore.v[ex.id] : ex.rest;
const fmtRest = (sec) => {
  if (sec <= 0) return "0 s";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m === 0 ? `${s} s` : s ? `${m}:${pad(s)} min` : `${m} min`;
};
const fmtRange = (r) => {
  if (!r) return "\u2014";
  const [a, b] = r;
  const f = (x) => x % 60 ? `${Math.floor(x / 60)}:${pad(x % 60)}` : `${x / 60}`;
  if (a >= 60) return a === b ? `${f(a)} min` : `${f(a)}\u2013${f(b)} min`;
  return a === b ? `${a} s` : `${a}\u2013${b} s`;
};
const TAG_STYLE = { "SI\u0141A": ["rgba(245,181,61,.16)", "var(--gold2)"], "MASA": ["rgba(34,197,94,.14)", "var(--green2)"] };
function ExTag({ tag }) {
  if (!tag) return null;
  const [bg, c] = TAG_STYLE[tag] || ["rgba(96,165,250,.14)", "var(--blue)"];
  return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9.5, fontWeight: 800, letterSpacing: ".06em", padding: "2px 6px", borderRadius: 6, marginRight: 6, verticalAlign: "2px", background: bg, color: c } }, tag);
}
function RestEditor({ ex }) {
  const [, force] = useState(0);
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    restStore.subs.add(f);
    return () => restStore.subs.delete(f);
  }, []);
  if (ex.mode === "c" || !ex.sug) return ex.note ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", margin: "-4px 0 10px", lineHeight: 1.4 } }, ex.note) : null;
  const r = restOf(ex);
  const custom = restStore.v[ex.id] != null;
  return /* @__PURE__ */ React.createElement("div", { style: { margin: "-2px 0 11px" } }, ex.note && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginBottom: 8, lineHeight: 1.4 } }, ex.note), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 11, background: "var(--surface2)", border: "1px solid var(--line)" } }, /* @__PURE__ */ React.createElement(TimerIcon, { size: 14, color: "var(--muted)" }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--faint)" } }, "Sugerowana przerwa: ", fmtRange(ex.sug)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: custom ? "var(--gold2)" : "var(--text)" } }, "Twoja: ", fmtRest(r))), edit ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 5 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => restStore.set(ex.id, r - 15), style: { ...timerBtn(), width: 38, height: 32 } }, /* @__PURE__ */ React.createElement(Minus, { size: 14 })), /* @__PURE__ */ React.createElement("button", { onClick: () => restStore.set(ex.id, r + 15), style: { ...timerBtn(), width: 38, height: 32 } }, /* @__PURE__ */ React.createElement(Plus, { size: 14 })), /* @__PURE__ */ React.createElement("button", { onClick: () => setEdit(false), style: { ...timerBtn(true), width: 38, height: 32 } }, /* @__PURE__ */ React.createElement(Check, { size: 14 }))) : /* @__PURE__ */ React.createElement("button", { onClick: () => setEdit(true), style: { ...timerBtn(), width: "auto", height: 32, padding: "0 10px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(Pencil, { size: 12 }), "Zmie\u0144")));
}

const WORKOUTS = WORKOUTS_PPL;
const SEED_TASKS = {
    lists: [
        { id: "l_inbox", name: "Dziś", color: "#22c55e" },
        { id: "l_saas", name: "SaaS / Aplikacje", color: "#10b981" },
        { id: "l_books", name: "Biblioteka 📚", color: "#f59e0b" },
        { id: "l_d2d", name: "Biznes D2D", color: "#f5b53d" },
        { id: "l_sales", name: "Sprzedaż & Marka", color: "#3b82f6" },
        { id: "l_health", name: "Zdrowie & Zdrowe nawyki", color: "#a78bfa" },
    ],
    items: [
        { id: uid(), list: "l_saas", title: "Zbuduj portfolio — 3 projekty demo z różnych branż", done: false, prio: 3 },
        { id: uid(), list: "l_saas", title: "Stwórz stronę/landing page z case studies i ROI", done: false, prio: 3 },
        { id: uid(), list: "l_saas", title: "LinkedIn: 30 wiadomości cold outreach / tydzień", done: false, prio: 2 },
        { id: uid(), list: "l_saas", title: "Wideo-demo 2 min — jak Twoja apka rozwiązuje problem klienta", done: false, prio: 2 },
        { id: uid(), list: "l_saas", title: "Przygotuj propozycję cenową: projekt + retainer (maintenance)", done: false, prio: 2 },
        { id: uid(), list: "l_saas", title: "Wybierz 3 nisze: logistyka / handel / usługi", done: false, prio: 1 },
        { id: uid(), list: "l_saas", title: "5 zimnych e-maili dziennie — osobisty, konkretny problem klienta", done: false, prio: 2 },
        { id: uid(), list: "l_books", title: "James Clear — Atomic Habits", done: false, prio: 3 },
        { id: uid(), list: "l_books", title: "Jocko Willink — Discipline Equals Freedom", done: false, prio: 3 },
        { id: uid(), list: "l_books", title: "Robert Cialdini — Wywieranie wpływu", done: false, prio: 3 },
        { id: uid(), list: "l_books", title: "Chris Voss — Never Split the Difference", done: false, prio: 2 },
        { id: uid(), list: "l_books", title: "Alex Hormozi — $100M Offers", done: false, prio: 3 },
        { id: uid(), list: "l_books", title: "Dale Carnegie — Jak zdobyć przyjaciół", done: false, prio: 2 },
        { id: uid(), list: "l_books", title: "David Goggins — Can't Hurt Me", done: false, prio: 2 },
        { id: uid(), list: "l_d2d", title: "Zarejestruj KvK (kvk.nl)", done: false, prio: 3 },
        { id: uid(), list: "l_d2d", title: "Otwórz konto biznesowe (Bunq / ING)", done: false, prio: 3 },
        { id: uid(), list: "l_d2d", title: "Kup / wynajmij furgonetkę", done: false, prio: 2 },
        { id: uid(), list: "l_d2d", title: "Zamów 1000 flyerów", done: false, prio: 2 },
        { id: uid(), list: "l_d2d", title: "Roznieś flyery — 3h/dzień", done: false, prio: 1 },
        { id: uid(), list: "l_d2d", title: "Ogłoszenia: Facebook + Nextdoor", done: false, prio: 1 },
        { id: uid(), list: "l_d2d", title: "Zbierz 5 opinii w Google", done: false, prio: 2 },
        { id: uid(), list: "l_sales", title: "Przeczytaj: Cialdini — Wywieranie wpływu", done: false, prio: 3 },
        { id: uid(), list: "l_sales", title: "Przeczytaj: Voss — Never Split the Difference", done: false, prio: 3 },
        { id: uid(), list: "l_sales", title: "Przeczytaj: SPIN Selling", done: false, prio: 2 },
        { id: uid(), list: "l_sales", title: "Opublikuj pierwsze 8–12 postów (LinkedIn)", done: false, prio: 2 },
        { id: uid(), list: "l_sales", title: "Zbuduj prosty lead magnet", done: false, prio: 1 },
        { id: uid(), list: "l_health", title: "Zrób badania hormonalne (pakiet podstawowy)", done: false, prio: 3 },
        { id: uid(), list: "l_health", title: "Kup filtr węglowy do wody", done: false, prio: 2 },
        { id: uid(), list: "l_health", title: "Mouth tape na noc (oddychanie nosem)", done: false, prio: 1 },
        { id: uid(), list: "l_health", title: "Mewing — nawyk 24/7", done: false, prio: 1 },
    ],
};
const SEED_FINANCE = {
    month: monthKey(),
    capital: 2600,
    d2dGoal: 2000,
    cats: [
        { id: "c_rent", name: "Mieszkanie / czynsz", pct: 38, color: "#3b82f6" },
        { id: "c_food", name: "Jedzenie & suplementy", pct: 19, color: "#22c55e" },
        { id: "c_trans", name: "Transport (paliwo / van)", pct: 10, color: "#f59e0b" },
        { id: "c_biz", name: "Biznes D2D (flyery, sprzęt)", pct: 11, color: "#f5b53d" },
        { id: "c_fun", name: "Rozrywka / inne", pct: 6, color: "#a78bfa" },
        { id: "c_save", name: "Oszczędności / inwestycje", pct: 16, color: "#10b981" },
    ],
    income: [
        { id: "i_job", name: "Wypłata (praca)" },
        { id: "i_d2d", name: "Biznes D2D" },
    ],
    tx: [],
    vault: 0,
    vaultGoal: 5000,
    vaultRoundup: 0,
    roundUp: true,
    roundTo: 1,
};
const CAT_PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#f5b53d", "#a78bfa", "#10b981", "#ec4899", "#14b8a6", "#fb7185", "#38bdf8"];
const SEED_EVENTS = [
    { id: uid(), date: "2026-06-09", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-06-10", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-06-11", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-06-12", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-06-13", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-06-14", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
    { id: uid(), date: "2026-06-19", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-06-20", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-06-21", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-06-22", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-06-23", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-06-24", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
    { id: uid(), date: "2026-06-29", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-06-30", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-07-01", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-07-02", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-07-03", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-07-04", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
    { id: uid(), date: "2026-07-09", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-07-10", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-07-11", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-07-12", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-07-13", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-07-14", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
    { id: uid(), date: "2026-07-19", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-07-20", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-07-21", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-07-22", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-07-23", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-07-24", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
    { id: uid(), date: "2026-07-29", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-07-30", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-07-31", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-08-01", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-08-02", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-08-03", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
    { id: uid(), date: "2026-08-08", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-08-09", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-08-10", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-08-11", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-08-12", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-08-13", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
    { id: uid(), date: "2026-08-18", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-08-19", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-08-20", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-08-21", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-08-22", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-08-23", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
    { id: uid(), date: "2026-08-28", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-08-29", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-08-30", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-08-31", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-09-01", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-09-02", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
    { id: uid(), date: "2026-09-07", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-09-08", title: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
    { id: uid(), date: "2026-09-09", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-09-10", title: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
    { id: uid(), date: "2026-09-11", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
    { id: uid(), date: "2026-09-12", title: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00 · Potem 4 dni LOCK IN 🔒", color: "#991b1b" },
];
const AFFIRM = [
    "LOCK IN. Dziś gram o wszystko — zero trybu połowicznego.",
    "Maksymalny grind. Robię to, co słabsi odpuszczają.",
    "Żadnego dnia na zero. Każdy dzień to ruch do przodu.",
    "Dyscyplina = wolność. Przymus teraz = wybór później.",
    "Jestem zdyscyplinowany — robię dokładnie to, co zaplanowałem.",
    "Komfort to wróg. Wybieram trudniejszą drogę, bo ona buduje.",
    "Każde powtórzenie, każdy telefon, każda linia kodu — buduje mnie.",
    "Nie negocjuję ze sobą. Plan jest planem. Wykonuję.",
    "Jestem o jeden telefon, jedną serię i jeden dzień przed wczorajszym sobą.",
    "Pełna odpowiedzialność. Zero wymówek, zero mentalności ofiary.",
    "Spokój i intensywność. Dyscyplina wojownika, nie chaos.",
    "Buduję człowieka, którym mam być — codziennie, bez litości dla lenistwa.",
    "Dzisiaj prowadzę swój dzień, nie odwrotnie.",
    "Grind teraz, wynik później. To uczciwa wymiana.",
];
const QUOTES = [
    { t: "Dyscyplina to most między celami a osiągnięciami.", a: "Jim Rohn" },
    { t: "Nie licz dni — spraw, by dni się liczyły.", a: "Muhammad Ali" },
    { t: "Sukces to suma małych wysiłków powtarzanych każdego dnia.", a: "Robert Collier" },
    { t: "Nie marnuj czasu na cudze życie.", a: "Steve Jobs" },
    { t: "Jesteś tym, co robisz codziennie.", a: "Arystoteles (parafraza)" },
    { t: "Zrobione jest lepsze niż idealne.", a: "Sheryl Sandberg" },
    { t: "Działanie pokonuje strach.", a: "—" },
    { t: "Bądź o 1% lepszy każdego dnia.", a: "James Clear" },
    { t: "Marzenia bez planu to tylko życzenia.", a: "—" },
    { t: "Ciężka praca pokonuje talent, gdy talent nie pracuje.", a: "Tim Notke" },
    { t: "Konsekwencja bije intensywność.", a: "—" },
    { t: "Komfort jest wrogiem postępu.", a: "—" },
    { t: "Zwycięzcy robią to, czego przegrani unikają.", a: "—" },
    { t: "Twoja przyszłość tworzy się dziś.", a: "—" },
    { t: "Przestań, gdy skończysz — nie gdy jesteś zmęczony.", a: "—" },
    { t: "Dyscyplina równa się wolność.", a: "Jocko Willink" },
    { t: "Bądź tak dobry, by nie dało się Cię zignorować.", a: "Steve Martin" },
    { t: "Energia i wytrwałość pokonują wszystko.", a: "Benjamin Franklin" },
    { t: "Nawyki to procent składany Twojego rozwoju.", a: "James Clear" },
    { t: "Albo rządzisz dniem, albo dzień rządzi Tobą.", a: "—" },
    { t: "Odwaga to działanie mimo strachu.", a: "—" },
    { t: "Jeden telefon więcej. Jedna seria więcej.", a: "—" },
    { t: "Wstawaj wcześnie — wygrywaj poranek, wygrasz dzień.", a: "—" },
    { t: "Trudne drogi prowadzą do pięknych miejsc.", a: "—" },
    { t: "Najpierw zarządź sobą, potem światem.", a: "—" },
    { t: "Małe kroki każdego dnia to wielkie zmiany w roku.", a: "—" },
    { t: "Najlepszy moment, by zacząć, jest teraz.", a: "—" },
    { t: "Stań się człowiekiem, którym chcesz być — przez działanie.", a: "—" },
];
const SAVING_TIPS = [
    { t: "Najpierw zapłać sobie — odkładaj, zanim cokolwiek wydasz.", a: "Zasada „pay yourself first”" },
    { t: "Nie oszczędzaj reszty po wydatkach — wydawaj resztę po oszczędzaniu.", a: "Warren Buffett" },
    { t: "Cena to to, co płacisz. Wartość to, co dostajesz.", a: "Warren Buffett" },
    { t: "Żyj poniżej swoich możliwości — zawsze.", a: "Zasada bogatych" },
    { t: "Zautomatyzuj oszczędzanie, by działo się bez decyzji.", a: "David Bach" },
    { t: "Dochód rośnie? Wydatki nie muszą. Unikaj inflacji stylu życia.", a: "Zasada FIRE" },
    { t: "Procent składany to ósmy cud świata.", a: "przypisywane Einsteinowi" },
    { t: "Zbuduj poduszkę na 3–6 miesięcy wydatków.", a: "Podstawa finansów" },
    { t: "Reguła 50/30/20: potrzeby, zachcianki, oszczędności.", a: "Elizabeth Warren" },
    { t: "Inwestuj tylko w to, co rozumiesz.", a: "Warren Buffett" },
    { t: "Bogactwo to nie zarobki, lecz to, czego nie wydajesz.", a: "Zasada bogatych" },
    { t: "Gotówka daje okazje, gdy inni ich nie mają.", a: "Inwestorzy" },
    { t: "Kupuj aktywa, nie pasywa.", a: "Robert Kiyosaki" },
    { t: "Budżet to mówienie pieniądzom, dokąd mają iść.", a: "Dave Ramsey" },
    { t: "Każde euro odłożone dziś pracuje na Ciebie jutro.", a: "Efekt kuli śnieżnej" },
];
const ICONS = { sun: Sun, zap: Zap, dumbbell: Dumbbell, target: Target, moon: Moon, flame: Flame, coffee: Coffee };
/* ───────────────────────── small UI atoms ───────────────────────── */
function Ring({ pct, size = 116, stroke = 10, color = "var(--green)", track = "rgba(255,255,255,.08)", children, glow }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
    return (React.createElement("div", { style: { position: "relative", width: size, height: size } },
        React.createElement("svg", { width: size, height: size, style: { transform: "rotate(-90deg)", filter: glow ? `drop-shadow(0 0 10px ${color})` : "none" } },
            React.createElement("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: track, strokeWidth: stroke }),
            React.createElement("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: color, strokeWidth: stroke, strokeDasharray: c, strokeDashoffset: off, strokeLinecap: "round", style: { transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" } })),
        React.createElement("div", { style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" } }, children)));
}
function Donut({ data, total, size = 96, stroke = 16 }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    let acc = 0;
    const sum = data.reduce((a, d) => a + d.value, 0) || 1;
    return (React.createElement("div", { style: { position: "relative", width: size, height: size, flexShrink: 0 } },
        React.createElement("svg", { width: size, height: size, style: { transform: "rotate(-90deg)" } },
            React.createElement("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: "rgba(255,255,255,.06)", strokeWidth: stroke }),
            data.map((d, i) => {
                const frac = d.value / sum;
                const dash = frac * c;
                const seg = (React.createElement("circle", { key: i, cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: d.color, strokeWidth: stroke, strokeDasharray: `${dash} ${c - dash}`, strokeDashoffset: -acc, style: { transition: "stroke-dasharray .6s ease" } }));
                acc += dash;
                return seg;
            })),
        React.createElement("div", { style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" } },
            React.createElement("div", null,
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 15, letterSpacing: "-.02em" } }, eur(total)),
                React.createElement("div", { style: { fontSize: 9, color: "var(--faint)" } }, "wydane")))));
}
function Bar({ pct, color = "var(--green)", h = 8, bg = "rgba(255,255,255,.07)" }) {
    return (React.createElement("div", { style: { width: "100%", height: h, borderRadius: 99, background: bg, overflow: "hidden" } },
        React.createElement("div", { style: { width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", borderRadius: 99, background: color, transition: "width .7s cubic-bezier(.2,.8,.2,1)" } })));
}
function Card({ children, style, onClick, pad = 16 }) {
    return (React.createElement("div", { onClick: onClick, style: {
            background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 22,
            padding: pad, boxShadow: "var(--shadow)",
            ...style,
        } }, children));
}
function Sheet({ open, onClose, title, children }) {
    if (!open)
        return null;
    return (React.createElement("div", { onClick: onClose, className: "mp-sheet-wrap", style: {
            position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.55)",
            backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center",
            animation: "fade .2s ease",
        } },
        React.createElement("div", { onClick: (e) => e.stopPropagation(), className: "mp-sheet", style: {
                width: "100%", maxWidth: 460, background: "var(--bg2)", borderTopLeftRadius: 26, borderTopRightRadius: 26,
                border: "1px solid var(--line)", borderBottom: "none", padding: "10px 18px 26px",
                animation: "slideUp .28s cubic-bezier(.2,.9,.2,1)", maxHeight: "85vh", overflowY: "auto",
            } },
            React.createElement("div", { style: { width: 40, height: 4, borderRadius: 99, background: "var(--line2)", margin: "6px auto 14px" } }),
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 } },
                React.createElement("h3", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" } }, title),
                React.createElement("button", { onClick: onClose, style: iconBtn },
                    React.createElement(X, { size: 18 }))),
            children)));
}
const iconBtn = {
    width: 38, height: 38, borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface2)",
    color: "var(--text)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0,
};
const inputStyle = {
    width: "100%", padding: "13px 14px", borderRadius: 13, border: "1px solid var(--line2)",
    background: "var(--surface)", color: "var(--text)", fontSize: 15, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box",
};
const btnPrimary = {
    width: "100%", padding: "14px", borderRadius: 14, border: "none", cursor: "pointer",
    background: "linear-gradient(135deg, var(--green), #15a34a)", color: "#04130a", fontWeight: 800,
    fontSize: 15.5, fontFamily: "var(--display)", letterSpacing: "-.01em", marginTop: 6,
    boxShadow: "0 8px 20px -8px var(--green-glow)",
};
const label = { fontSize: 12.5, color: "var(--muted)", fontWeight: 600, margin: "12px 0 6px", display: "block", letterSpacing: ".01em" };
const sectionTitle = { fontFamily: "var(--display)", fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", margin: "22px 4px 12px" };
const prioColor = (p) => (p === 3 ? "var(--red)" : p === 2 ? "var(--amber)" : p === 1 ? "var(--blue)" : "var(--faint)");
const prioLabel = (p) => (p === 3 ? "Wysoki" : p === 2 ? "Średni" : p === 1 ? "Niski" : "—");
function Toggle({ on, onChange }) {
    return (React.createElement("button", { onClick: () => onChange(!on), style: {
            width: 46, height: 27, borderRadius: 99, border: "none", cursor: "pointer", padding: 3, flexShrink: 0,
            background: on ? "var(--green)" : "var(--surface2)", transition: "background .2s", position: "relative",
            boxShadow: on ? "0 0 0 1px var(--green), 0 4px 12px -4px var(--green-glow)" : "0 0 0 1px var(--line2)",
        } },
        React.createElement("span", { style: { display: "block", width: 21, height: 21, borderRadius: 99, background: on ? "#04130a" : "var(--muted)", transform: on ? "translateX(19px)" : "translateX(0)", transition: "transform .2s cubic-bezier(.2,1.2,.4,1)" } })));
}
function Toast({ toast, onClose, onGo }) {
    useEffect(() => {
        if (!toast)
            return;
        const t = setTimeout(onClose, 9000);
        return () => clearTimeout(t);
    }, [toast, onClose]);
    if (!toast)
        return null;
    const Ic = toast.icon === "piggy" ? PiggyBank : Sun;
    return (React.createElement("div", { onClick: onGo, style: {
            position: "fixed", top: "max(14px, env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)",
            zIndex: 80, width: "calc(100% - 28px)", maxWidth: 432, cursor: "pointer",
            background: "var(--surface2)", border: `1px solid ${toast.color}`, borderRadius: 16, padding: "13px 14px",
            display: "flex", gap: 12, alignItems: "flex-start", boxShadow: "0 18px 40px -12px rgba(0,0,0,.7)",
            animation: "dropIn .35s cubic-bezier(.2,1,.3,1)",
        } },
        React.createElement("div", { style: { width: 36, height: 36, borderRadius: 10, background: `${toast.color}22`, display: "grid", placeItems: "center", flexShrink: 0 } },
            React.createElement(Ic, { size: 19, color: toast.color })),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 14.5, letterSpacing: "-.01em" } }, toast.title),
            React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 } }, toast.msg)),
        React.createElement("button", { onClick: (e) => { e.stopPropagation(); onClose(); }, style: { ...iconBtn, width: 28, height: 28, border: "none", background: "transparent", color: "var(--faint)" } },
            React.createElement(X, { size: 16 }))));
}
/* ───────────────────────── main app ───────────────────────── */
"use strict";
/* ═══════════════ NOWE MODUŁY v40 — trening pro + progresja + reset głowy ═══════════════ */
const E1RM = (w, r) => Math.round((+w || 0) * (1 + (+r || 0) / 30));
const bestOfLog = (log) => {
    const done = (log || []).filter((s) => s.done && s.w > 0 && s.reps > 0);
    if (!done.length)
        return null;
    return done.reduce((m, s) => (E1RM(s.w, s.reps) > E1RM(m.w, m.reps) ? s : m), done[0]);
};
const tonnageOfLog = (log) => (log || []).filter((s) => s.done).reduce((a, s) => a + (+s.w || 0) * (+s.reps || 0), 0);
// historia serii danego ćwiczenia ze wszystkich dni (bez dziś)
const exHistory = (daily, exId) => {
    return Object.keys(daily || {})
        .filter((k) => k !== todayKey())
        .map((k) => ({ date: k, log: (daily[k] && daily[k].setlog && daily[k].setlog[exId]) || null }))
        .filter((x) => x.log && x.log.some((s) => s.done))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
};
const bestEverE1RM = (daily, exId) => {
    let best = 0;
    exHistory(daily, exId).forEach((h) => { const b = bestOfLog(h.log); if (b)
        best = Math.max(best, E1RM(b.w, b.reps)); });
    return best;
};
/* ——— logger serii per ćwiczenie (kg × powt × RPE) — styl Hevy/Strong ——— */
function SetLogger({ ex, day, setDay, daily, startTimer }) {
    const [open, setOpen] = useState(false);
    const log = (day.setlog && day.setlog[ex.id]) || [];
    // ostatnia sesja tego ćwiczenia
    const hist = useMemo(() => exHistory(daily, ex.id), [daily, ex.id]);
    const lastSession = hist.length ? hist[hist.length - 1] : null;
    const lastBest = lastSession ? bestOfLog(lastSession.log) : null;
    const prE1RM = useMemo(() => bestEverE1RM(daily, ex.id), [daily, ex.id]);
    const ensureRows = () => {
        if (log.length)
            return log;
        const w0 = (lastBest && lastBest.w) || (day.lifts && day.lifts[ex.id] && day.lifts[ex.id].w) || 0;
        return Array.from({ length: ex.s }, () => ({ w: w0, reps: "", rpe: 8, done: false }));
    };
    const writeLog = (rows) => setDay((c) => {
        const sl = { ...(c.setlog || {}) };
        sl[ex.id] = rows;
        // sync z paskiem % (boolean sets)
        const cs = { ...(c.sets || {}) };
        const bar = Array(ex.s).fill(false);
        rows.forEach((r, i) => { if (i < ex.s)
            bar[i] = !!r.done; });
        cs[ex.id] = bar;
        return { ...c, setlog: sl, sets: cs, workoutId: c.workoutId };
    });
    const upd = (i, patch) => { const rows = ensureRows().map((r, j) => (j === i ? { ...r, ...patch } : r)); writeLog(rows); };
    const addRow = () => { const rows = ensureRows(); const last = rows[rows.length - 1] || { w: 0, rpe: 8 }; writeLog([...rows, { w: last.w, reps: "", rpe: last.rpe, done: false }]); };
    const delRow = (i) => writeLog(ensureRows().filter((_, j) => j !== i));
    const toggleDone = (i) => {
        const rows = ensureRows();
        const wasDone = rows[i].done;
        const nr = rows.map((r, j) => (j === i ? { ...r, done: !r.done } : r));
        writeLog(nr);
        buzz(wasDone ? 4 : 12);
        if (!wasDone && restOf(ex) > 0)
            startTimer(restOf(ex), ex.n);
    };
    const rows = open ? ensureRows() : log;
    const doneN = rows.filter((r) => r.done).length;
    const curBest = bestOfLog(rows);
    const isPR = curBest && prE1RM > 0 && E1RM(curBest.w, curBest.reps) > prE1RM;
    return (React.createElement("div", { style: { marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 } }, React.createElement("button", { onClick: () => setOpen((v) => !v), style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text)" } }, React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "var(--gold2)" } }, React.createElement(Dumbbell, { size: 14 }), open ? "Log serii" : (doneN > 0 ? `Log serii · ${doneN} zapisane` : "Zapisz serie (kg × powt × RPE)")), React.createElement("span", { style: { fontSize: 11, color: "var(--muted)" } }, open ? "▲" : "▼")), (lastBest || prE1RM > 0) && React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" } }, lastBest && React.createElement("span", null, "Ostatnio: ", React.createElement("b", { style: { color: "var(--text)" } }, `${lastBest.w}kg × ${lastBest.reps}`)), prE1RM > 0 && React.createElement("span", null, "Rekord 1RM: ", React.createElement("b", { style: { color: "var(--gold2)" } }, `${prE1RM}kg`))), open && React.createElement("div", { style: { marginTop: 10 } }, React.createElement("div", { style: { display: "flex", gap: 6, fontSize: 10.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".04em", padding: "0 2px 4px", fontWeight: 700 } }, React.createElement("span", { style: { width: 24, textAlign: "center" } }, "#"), React.createElement("span", { style: { flex: 1, textAlign: "center" } }, "kg"), React.createElement("span", { style: { flex: 1, textAlign: "center" } }, "powt"), React.createElement("span", { style: { flex: 1, textAlign: "center" } }, "RPE"), React.createElement("span", { style: { width: 40 } }, "")), rows.map((r, i) => React.createElement("div", { key: i, style: { display: "flex", gap: 6, alignItems: "center", marginBottom: 6 } }, React.createElement("span", { style: { width: 24, textAlign: "center", fontFamily: "var(--display)", fontWeight: 800, fontSize: 13, color: r.done ? "var(--green2)" : "var(--faint)" } }, i + 1), React.createElement("input", { value: r.w, onChange: (e) => upd(i, { w: e.target.value }), inputMode: "decimal", placeholder: "0", style: { ...inputStyle, flex: 1, textAlign: "center", padding: "9px 4px", opacity: r.done ? 0.6 : 1 } }), React.createElement("input", { value: r.reps, onChange: (e) => upd(i, { reps: e.target.value }), inputMode: "numeric", placeholder: "–", style: { ...inputStyle, flex: 1, textAlign: "center", padding: "9px 4px", opacity: r.done ? 0.6 : 1 } }), React.createElement("input", { value: r.rpe, onChange: (e) => upd(i, { rpe: e.target.value }), inputMode: "decimal", placeholder: "8", style: { ...inputStyle, flex: 1, textAlign: "center", padding: "9px 4px", opacity: r.done ? 0.6 : 1 } }), React.createElement("button", { onClick: () => toggleDone(i), style: { width: 34, height: 34, borderRadius: 10, flexShrink: 0, cursor: "pointer", border: r.done ? "none" : "1.5px solid var(--line2)", background: r.done ? "linear-gradient(135deg, var(--green2), var(--green))" : "var(--surface2)", color: r.done ? "#04130a" : "var(--muted)" } }, r.done ? React.createElement(Check, { size: 16, strokeWidth: 3, style: { display: "block", margin: "0 auto" } }) : "✓"), rows.length > 1 && React.createElement("button", { onClick: () => delRow(i), style: { width: 20, background: "none", border: "none", color: "var(--faint)", cursor: "pointer", fontSize: 15, flexShrink: 0 } }, "×"))), React.createElement("button", { onClick: addRow, style: { width: "100%", marginTop: 2, padding: "8px", borderRadius: 10, border: "1px dashed var(--line2)", background: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12.5, fontWeight: 600 } }, "+ Dodaj serię"), curBest && React.createElement("div", { style: { marginTop: 9, padding: "8px 11px", borderRadius: 10, background: isPR ? "rgba(245,181,61,.12)" : "rgba(34,197,94,.08)", fontSize: 12, color: isPR ? "var(--gold2)" : "var(--green2)", fontWeight: 700 } }, isPR ? `🔥 NOWY REKORD — ${curBest.w}kg × ${curBest.reps} (~${E1RM(curBest.w, curBest.reps)}kg 1RM)` : `Najlepsza dziś: ${curBest.w}kg × ${curBest.reps} · ~${E1RM(curBest.w, curBest.reps)}kg 1RM`))));
}
/* ——— progresja: wykres e1RM + tonaż + historia sesji ——— */
function Progression({ daily, prs }) {
    const [open, setOpen] = useState(false);
    // ćwiczenia które mają jakąkolwiek historię
    const exIds = useMemo(() => {
        const s = new Set();
        Object.keys(daily || {}).forEach((k) => { const sl = daily[k] && daily[k].setlog; if (sl)
            Object.keys(sl).forEach((id) => { if ((sl[id] || []).some((x) => x.done))
                s.add(id); }); });
        return [...s];
    }, [daily]);
    const nameOf = (id) => { for (const w of WORKOUTS) {
        const e = w.ex.find((x) => x.id === id);
        if (e)
            return e.n;
    } return id; };
    const [sel, setSel] = useState(null);
    const selId = sel || exIds[0] || null;
    const hist = useMemo(() => (selId ? exHistory(daily, selId) : []), [daily, selId]);
    const points = hist.map((h) => { const b = bestOfLog(h.log); return { date: h.date, e1rm: b ? E1RM(b.w, b.reps) : 0, ton: tonnageOfLog(h.log), best: b }; }).filter((p) => p.e1rm > 0);
    if (!exIds.length)
        return null;
    // svg line chart
    const chart = () => {
        if (points.length < 2)
            return React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", padding: "16px 0", textAlign: "center" } }, "Zapisz serie w co najmniej 2 sesjach, żeby zobaczyć krzywą progresji.");
        const W = 300, H = 110, pad = 6;
        const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - 2 * pad));
        const vals = points.map((p) => p.e1rm);
        const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
        const ys = vals.map((v) => H - pad - ((v - mn) / rng) * (H - 2 * pad));
        const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
        return React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", height: 120, marginTop: 6 } }, React.createElement("path", { d: path, fill: "none", stroke: "var(--gold)", strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" }), xs.map((x, i) => React.createElement("circle", { key: i, cx: x, cy: ys[i], r: 3, fill: i === xs.length - 1 ? "var(--gold2)" : "var(--gold)" })));
    };
    return (React.createElement(Card, { style: { marginTop: 14 } }, React.createElement("button", { onClick: () => setOpen((v) => !v), style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text)" } }, React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8 } }, React.createElement(TrendingUp, { size: 16, color: "var(--gold2)" }), React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Progresja i historia")), React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, open ? "▲" : "▼")), open && React.createElement("div", { style: { marginTop: 12 } }, React.createElement("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, margin: "0 -2px" }, className: "noscroll" }, exIds.map((id) => React.createElement("button", { key: id, onClick: () => setSel(id), style: { padding: "7px 11px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: selId === id ? "1.5px solid var(--gold2)" : "1px solid var(--line2)", background: selId === id ? "rgba(245,181,61,.12)" : "var(--surface2)", color: selId === id ? "var(--gold2)" : "var(--muted)" } }, nameOf(id)))), React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 12, marginBottom: 2, fontWeight: 700 } }, "Szacowany 1RM (e1RM) w czasie"), chart(), points.length > 0 && React.createElement("div", { style: { marginTop: 12 } }, React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginBottom: 6, fontWeight: 700 } }, "Ostatnie sesje"), points.slice().reverse().slice(0, 6).map((p, i) => React.createElement("div", { key: i, style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: 12.5 } }, React.createElement("span", { style: { color: "var(--muted)" } }, p.date.slice(5)), React.createElement("span", null, React.createElement("b", null, `${p.best.w}kg × ${p.best.reps}`), React.createElement("span", { style: { color: "var(--faint)", marginLeft: 8 } }, `~${p.e1rm}kg 1RM`), React.createElement("span", { style: { color: "var(--faint)", marginLeft: 8 } }, `${Math.round(p.ton)}kg tonaż`))))))));
}
/* ——— RESET GŁOWY: mental resilience + reframe przez Drugą Głowę ——— */
function Resilience({ askDG }) {
    const [thought, setThought] = useState("");
    const [loading, setLoading] = useState(false);
    const [out, setOut] = useState("");
    const [hist, setHist] = useState(() => { try {
        return JSON.parse(localStorage.getItem("mp_reframe_v1") || "[]");
    }
    catch (e) {
        return [];
    } });
    const [wins, setWins] = useState(["", "", ""]);
    const [lesson, setLesson] = useState("");
    const [logs, setLogs] = useState(() => { try {
        return JSON.parse(localStorage.getItem("mp_evlog_v1") || "[]");
    }
    catch (e) {
        return [];
    } });
    const reframe = async () => {
        if (!thought.trim() || loading)
            return;
        setLoading(true);
        setOut("");
        buzz(8);
        const prompt = `Zadanie: RESET GŁOWY. Zawodnik napisał negatywną myśl / sytuację która poszła nie tak:\n"${thought.trim()}"\n\nOdpowiedz DOKŁADNIE w 3 krótkich blokach, bez owijania, ton lock-in (zero litości, ale buduje nie dobija):\n1. NAZWANIE — jednym zdaniem nazwij automatyczną myśl (oddziel ją od faktów).\n2. FAKT — co realnie się wydarzyło i czego to dowodzi (albo NIE dowodzi). Twardo, konkretnie.\n3. NASTĘPNY KROK — jedna konkretna akcja do wykonania teraz/dziś. Max jedno zdanie.\nBez wstępu, bez podsumowania. Zwięźle.`;
        try {
            const r = await askDG(prompt, 500);
            const txt = typeof r === "string" ? r : (r && r.text) || "Brak odpowiedzi — sprawdź klucz API w Drugiej Głowie.";
            setOut(txt);
            const entry = { id: uid(), date: todayKey(), thought: thought.trim(), reframe: txt };
            const nh = [entry, ...hist].slice(0, 30);
            setHist(nh);
            localStorage.setItem("mp_reframe_v1", JSON.stringify(nh));
            setThought("");
        }
        catch (e) {
            setOut("Błąd połączenia z Drugą Głową. Sprawdź klucz API.");
        }
        setLoading(false);
    };
    const saveLog = () => {
        const w = wins.filter((x) => x.trim());
        if (!w.length && !lesson.trim())
            return;
        const entry = { id: uid(), date: todayKey(), wins: w, lesson: lesson.trim() };
        const nl = [entry, ...logs.filter((l) => l.date !== todayKey())].slice(0, 60);
        setLogs(nl);
        localStorage.setItem("mp_evlog_v1", JSON.stringify(nl));
        setWins(["", "", ""]);
        setLesson("");
        buzz(12);
    };
    const TECHS = [
        ["Nazwij, nie tłum", "Zauważ myśl („zauważam, że myślę…\") — to ją osłabia. Walka z nią ją wzmacnia."],
        ["Reguła 90 sekund", "Emocja fizjologicznie trwa ~90 s, jeśli jej nie podsycasz. Oddychaj, nie zaczynaj spirali, wróć do akcji."],
        ["Post-mortem, nie rumination", "Max 5 min analizy: co poszło źle → co zmienić → koniec. Potem świadomie zamknij temat."],
        ["Reframe faktem", "Nie „będzie dobrze\", tylko: próba się nie udała → co z tego wynika → następny krok."],
    ];
    return (React.createElement("div", null, React.createElement(DevHeader, { icon: Sparkles, tint: "var(--gold)", kicker: "Kontrola umysłu", title: "Reset g\u0142owy" }), React.createElement(Card, { style: { marginTop: 14 } }, React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, marginBottom: 4 } }, "Coś poszło nie tak? Przekształć to."), React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 } }, "Wpisz negatywną myśl albo sytuację. Druga Głowa nazwie ją, oddzieli fakty i da jeden konkretny krok. Zero wymówek."), React.createElement("textarea", { value: thought, onChange: (e) => setThought(e.target.value), placeholder: "np. „Klient nie odpisał — pewnie SkupOS jest do niczego i nikt tego nie kupi\"", rows: 3, style: { ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 } }), React.createElement("button", { onClick: reframe, disabled: loading, style: { ...btnPrimary, marginTop: 10, opacity: loading ? 0.6 : 1 } }, loading ? "Przetwarzam…" : "🧠 Reset głowy"), out && React.createElement("div", { style: { marginTop: 12, padding: "13px 15px", borderRadius: 12, background: "rgba(245,181,61,.08)", border: "1px solid rgba(245,181,61,.25)", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" } }, out)), React.createElement("div", { style: sectionTitle }, "Techniki na gorąco"), React.createElement(Card, null, TECHS.map((t, i) => React.createElement("div", { key: i, style: { padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none" } }, React.createElement("div", { style: { fontSize: 13.5, fontWeight: 700, color: "var(--gold2)" } }, t[0]), React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 2 } }, t[1])))), React.createElement("div", { style: sectionTitle }, "Log wieczorny"), React.createElement(Card, null, React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 } }, "3 rzeczy, które poszły dobrze + 1 lekcja z tego, co poszło źle. Trenuje mózg do szukania progresu zamiast katastrofy."), wins.map((w, i) => React.createElement("input", { key: i, value: w, onChange: (e) => setWins((s) => s.map((x, j) => (j === i ? e.target.value : x))), placeholder: `Dobra rzecz #${i + 1}`, style: { ...inputStyle, width: "100%", marginBottom: 7 } })), React.createElement("input", { value: lesson, onChange: (e) => setLesson(e.target.value), placeholder: "Jedna lekcja na jutro", style: { ...inputStyle, width: "100%", marginBottom: 10, borderColor: "rgba(245,181,61,.35)" } }), React.createElement("button", { onClick: saveLog, style: { ...btnPrimary, marginTop: 0 } }, "Zapisz log dnia"), logs.length > 0 && React.createElement("div", { style: { marginTop: 12 } }, logs.slice(0, 5).map((l) => React.createElement("div", { key: l.id, style: { padding: "9px 0", borderTop: "1px solid var(--line)", fontSize: 12.5 } }, React.createElement("div", { style: { color: "var(--muted)", fontWeight: 700, marginBottom: 3 } }, l.date.slice(5)), l.wins.map((w, j) => React.createElement("div", { key: j, style: { color: "var(--green2)" } }, "✓ ", w)), l.lesson && React.createElement("div", { style: { color: "var(--gold2)", marginTop: 2 } }, "→ ", l.lesson))))), hist.length > 0 && React.createElement("div", null, React.createElement("div", { style: sectionTitle }, "Historia resetów"), React.createElement(Card, null, hist.slice(0, 6).map((h, i) => React.createElement("div", { key: h.id, style: { padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none" } }, React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", fontStyle: "italic", marginBottom: 4 } }, "„", h.thought, "\""), React.createElement("div", { style: { fontSize: 12.5, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap" } }, h.reframe)))))));
}


"use strict";
/* ——— prawdziwe alarmy systemowe (Android SET_ALARM intent, SKIP_UI) ——— */
function firePhoneAlarms(alarms, onDone) {
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    if (!/Android/i.test(ua)) {
        onDone && onDone("nosupport");
        return;
    }
    let i = 0;
    const fireOne = () => {
        if (i >= alarms.length) {
            onDone && onDone("ok", alarms.length);
            return;
        }
        const a = alarms[i++];
        const url = "intent://#Intent;action=android.intent.action.SET_ALARM"
            + ";i.android.intent.extra.alarm.HOUR=" + a.h
            + ";i.android.intent.extra.alarm.MINUTES=" + a.m
            + ";S.android.intent.extra.alarm.MESSAGE=" + encodeURIComponent(a.label)
            + ";B.android.intent.extra.alarm.SKIP_UI=true;end";
        const ifr = document.createElement("iframe");
        ifr.style.display = "none";
        ifr.src = url;
        document.body.appendChild(ifr);
        setTimeout(() => { try {
            document.body.removeChild(ifr);
        }
        catch (e) { } fireOne(); }, 800);
    };
    fireOne();
}
function PhoneAlarmCard({ cfg, todayShift, setToast }) {
    const LB = { wake: "⏰ Pobudka", supl: "💊 Suplementy", biz: "💻 Deep Work", trening: "🏋️ Trening" };
    const isAndroid = /Android/i.test((typeof navigator !== "undefined" && navigator.userAgent) || "");
    const items = () => (["wake", "supl", "biz", "trening"])
        .filter((k) => cfg[todayShift] && cfg[todayShift][k])
        .map((k) => { const [h, m] = String(cfg[todayShift][k]).split(":").map(Number); return { h, m, label: LB[k].replace(/^[^ ]+ /, ""), t: cfg[todayShift][k], key: k }; });
    const list = items();
    const go = () => {
        if (!list.length) {
            setToast && setToast({ icon: "sun", title: "Brak godzin", msg: "Ten typ zmiany nie ma ustawionych alarmów.", color: "var(--amber)" });
            return;
        }
        firePhoneAlarms(list, (res, n) => {
            if (res === "nosupport")
                setToast && setToast({ icon: "sun", title: "Tylko Android", msg: "Tworzenie alarmów w zegarze działa na Androidzie. Na iOS zostają powiadomienia PWA.", color: "var(--amber)" });
            else
                setToast && setToast({ icon: "sun", title: "Alarmy ustawione", msg: `${n} alarm(y) dodane do zegara telefonu.`, color: "var(--green2)" });
        });
    };
    return (React.createElement(Card, { style: { marginTop: 14, background: "rgba(245,181,61,.06)", border: "1px solid rgba(245,181,61,.25)" } }, React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } }, React.createElement("span", { style: { fontSize: 20 } }, "📱"), React.createElement("div", { style: { fontWeight: 700, fontSize: 14.5 } }, "Alarmy w telefonie")), React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 } }, "Prawdziwe alarmy systemowe — dzwonią nawet gdy aplikacja jest zamknięta lub telefon wyciszony. Jednym tapnięciem tworzy alarmy w zegarze telefonu dla dzisiejszej zmiany ", React.createElement("b", { style: { color: "var(--text)" } }, todayShift), "."), list.length > 0 && React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 11 } }, list.map((a) => React.createElement("span", { key: a.key, style: { fontSize: 11.5, fontWeight: 700, padding: "5px 9px", borderRadius: 8, background: "var(--surface2)", color: "var(--text)" } }, `${a.label} ${a.t}`))), React.createElement("button", { onClick: go, style: { ...btnPrimary, marginTop: 0 } }, "📱 Ustaw dzisiejsze alarmy w telefonie"), !isAndroid && React.createElement("div", { style: { fontSize: 11, color: "var(--amber)", marginTop: 8, lineHeight: 1.45 } }, "Uwaga: tworzenie alarmów w zegarze działa na Androidzie. Na iPhone nie ma takiego mechanizmu — zostają powiadomienia PWA.")));
}


export default function App() {
    const [ready, setReady] = useState(false);
    const [tab, setTab] = useState("home");
    const [profile, setProfile] = useState({ name: "", weight: 78, start: 78, goal: 88, height: 198, workoutGoal: 12, reminders: { affirm: { on: false, time: "08:00" }, save: { on: false, time: "20:00" }, briefing: { on: false, time: "07:00" } } });
    const [habits, setHabits] = useState(SEED_HABITS);
    const [supps, setSupps] = useState(SEED_SUPPS);
    const [daily, setDaily] = useState({});
    const [tasks, setTasks] = useState(SEED_TASKS);
    const [finance, setFinance] = useState(SEED_FINANCE);
    const [events, setEvents] = useState(SEED_EVENTS);
    const [diet, setDiet] = useState(SEED_DIET);
    const [shopping, setShopping] = useState(SEED_SHOPPING);
    const [saasData, setSaasData] = useState({ pipeline: [], revenue: [] });
    const [measures, setMeasures] = useState([]);
    const [bloodLog, setBloodLog] = useState([]);
    const [charisma, setCharisma] = useState({ done: {}, log: [] });
    const [journal, setJournal] = useState({});
    const [bizplan, setBizplan] = useState({});
    const [trades, setTrades] = useState(SEED_TRADES);
    const [prs, setPrs] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [weekFocus, setWeekFocus] = useState([]);
    const [medi, setMedi] = useState([]);
    const [voiceLog, setVoiceLog] = useState({});
    const [books, setBooks] = useState([
        { id: "b1", title: "Atomic Habits", author: "James Clear", total: 320, read: 0, cat: "Rozwój" },
        { id: "b2", title: "Discipline Equals Freedom", author: "Jocko Willink", total: 256, read: 0, cat: "Mentalność" },
        { id: "b3", title: "Wywieranie wpływu", author: "Robert Cialdini", total: 336, read: 0, cat: "Sprzedaż" },
        { id: "b4", title: "Never Split the Difference", author: "Chris Voss", total: 288, read: 0, cat: "Negocjacje" },
        { id: "b5", title: "$100M Offers", author: "Alex Hormozi", total: 226, read: 0, cat: "Biznes" },
        { id: "b6", title: "Jak zdobyć przyjaciół", author: "Dale Carnegie", total: 288, read: 0, cat: "Charyzma" },
        { id: "b7", title: "Can't Hurt Me", author: "David Goggins", total: 364, read: 0, cat: "Mentalność" },
        { id: "b8", title: "$100M Leads", author: "Alex Hormozi", total: 236, read: 0, cat: "Marketing" },
        { id: "b9", title: "Sell or Be Sold", author: "Grant Cardone", total: 256, read: 0, cat: "Sprzedaż" },
        { id: "b10", title: "SPIN Selling", author: "Neil Rackham", total: 197, read: 0, cat: "Sprzedaż" },
        { id: "b11", title: "The Challenger Sale", author: "Matthew Dixon & Brent Adamson", total: 211, read: 0, cat: "Sprzedaż" },
        { id: "b12", title: "Fanatical Prospecting", author: "Jeb Blount", total: 304, read: 0, cat: "Sprzedaż" },
        { id: "b13", title: "Pitch Anything", author: "Oren Klaff", total: 224, read: 0, cat: "Sprzedaż" },
        { id: "b14", title: "Building a StoryBrand", author: "Donald Miller", total: 240, read: 0, cat: "Marketing" },
        { id: "b15", title: "This is Marketing", author: "Seth Godin", total: 288, read: 0, cat: "Marketing" },
        { id: "b16", title: "Expert Secrets", author: "Russell Brunson", total: 288, read: 0, cat: "Marketing" },
        { id: "b17", title: "To Sell is Human", author: "Daniel Pink", total: 240, read: 0, cat: "Sprzedaż" },
        { id: "b18", title: "Gap Selling", author: "Keenan", total: 250, read: 0, cat: "Sprzedaż" },
        { id: "b19", title: "New Sales Simplified", author: "Mike Weinberg", total: 208, read: 0, cat: "Sprzedaż" },
        { id: "b20", title: "Traction — Marketing z zasadami", author: "Gabriel Weinberg", total: 256, read: 0, cat: "Marketing" },
        { id: "b21", title: "Dotcom Secrets", author: "Russell Brunson", total: 254, read: 0, cat: "Marketing" },
        { id: "b22", title: "The 10X Rule", author: "Grant Cardone", total: 256, read: 0, cat: "Mentalność" },
        { id: "b23", title: "80/20 Sales and Marketing", author: "Perry Marshall", total: 240, read: 0, cat: "Marketing" },
        { id: "b24", title: "The Greatest Salesman in the World", "author": "Og Mandino", total: 128, read: 0, cat: "Sprzedaż" },
    ]);
    const [moreOpen, setMoreOpen] = useState(false);
    const [alarms, setAlarms] = useState(() => { try {
        const s = typeof localStorage !== "undefined" && localStorage.getItem("mp_alarms_v1");
        return s ? JSON.parse(s) : null;
    }
    catch {
        return null;
    } });
    const defaultAlarms = { Ranka: { enabled: true, wake: "05:00", supl: "05:15", biz: "15:30", trening: "15:30" }, Popołudnie: { enabled: true, wake: "07:00", supl: "07:15", biz: "08:00", trening: "12:00" }, Nocka: { enabled: true, wake: "08:00", supl: "08:15", biz: "10:00", trening: null }, Wolne: { enabled: true, wake: "06:00", supl: "06:15", biz: "06:30", trening: "09:30" } };
    const alarmCfg = alarms || defaultAlarms;
    const saveAlarms = (v) => { setAlarms(v); try {
        save("mp_alarms_v1", v);
    }
    catch { } };
    const askNotif = () => { try {
        if (typeof Notification !== "undefined")
            Notification.requestPermission();
    }
    catch { } };
    const sentToday = useRef(new Set());
    const fireAlarm = (title, body) => {
        buzz([200, 100, 200, 100, 200]);
        try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted")
                new Notification(title, { body, icon: "./icon-192.png", tag: title });
        }
        catch { }
        try {
            if (audioRef.current) {
                [0, .3, .6].forEach(dt => { const o = audioRef.current.createOscillator(), g = audioRef.current.createGain(); o.frequency.value = 880; o.type = "triangle"; o.connect(g); g.connect(audioRef.current.destination); g.gain.setValueAtTime(.0001, audioRef.current.currentTime + dt); g.gain.exponentialRampToValueAtTime(.3, audioRef.current.currentTime + dt + .03); g.gain.exponentialRampToValueAtTime(.0001, audioRef.current.currentTime + dt + .25); o.start(audioRef.current.currentTime + dt); o.stop(audioRef.current.currentTime + dt + .3); });
            }
        }
        catch { }
    };
    const tk = todayKey();
    const day = daily[tk] || { habits: {}, supps: {}, workoutDone: false, workoutId: null, sets: {}, sleep: null, food: [] };
    /* load once */
    useEffect(() => {
        (async () => {
            const [p, h, s, d, t, f, ev] = await Promise.all([
                load("mp_profile_v1", null), load("mp_habits_v1", null), load("mp_supps_v1", null),
                load("mp_daily_v4", null), load("mp_tasks_v1", null), load("mp_finance_v1", null),
                load("mp_events_v1", null),
            ]);
            const [di, sh] = await Promise.all([load("mp_diet_v1", null), load("mp_shopping_v1", null)]);
            const [sd, ms] = await Promise.all([load("mp_saas_v1", null), load("mp_measures_v1", null)]);
            const bks = await load("mp_books_v1", null);
            const [prL, phL, wfL] = await Promise.all([load("mp_prs_v1", null), load("mp_photos_v1", null), load("mp_review_v1", null)]);
            const [medL, vL] = await Promise.all([load("mp_medi_v1", null), load("mp_voice_v1", null)]);
            const blL = await load("mp_blood_v1", null);
            const chL = await load("mp_charisma_v1", null);
            const [jrL, bpL] = await Promise.all([load("mp_journal_v1", null), load("mp_bizplan_v1", null)]);
            const [trL, rsL] = await Promise.all([load("mp_trades_v1", null), load("mp_rest_v1", null)]);
            if (trL)
                setTrades({ ...SEED_TRADES, ...trL });
            if (rsL)
                restStore.replace(rsL);
            if (p) {
                const dp = { name: "", weight: 78, start: 78, goal: 88, height: 198, workoutGoal: 12, reminders: { affirm: { on: false, time: "08:00" }, save: { on: false, time: "20:00" }, briefing: { on: false, time: "07:00" } } };
                const pr = p.reminders || {};
                setProfile({
                    ...dp, ...p,
                    reminders: {
                        affirm: { ...dp.reminders.affirm, ...(pr.affirm || {}) },
                        save: { ...dp.reminders.save, ...(pr.save || {}) },
                        briefing: { ...dp.reminders.briefing, ...(pr.briefing || {}) },
                    },
                });
            }
            if (h)
                setHabits(h);
            if (s)
                setSupps(s);
            if (d)
                setDaily(d);
            if (t)
                setTasks(t);
            if (ev)
                setEvents(ev);
            if (di)
                setDiet({ ...SEED_DIET, ...di });
            if (sh)
                setShopping({ ...sh, stores: sh.stores && sh.stores.length ? sh.stores : SEED_SHOPPING.stores, items: sh.items || [] });
            if (sd)
                setSaasData(sd);
            if (ms)
                setMeasures(ms);
            if (bks)
                setBooks(bks);
            if (prL)
                setPrs(prL);
            let phStore = null;
            try {
                phStore = await idb.get("photos");
            }
            catch (e) { }
            if (phStore == null) {
                phStore = phL || [];
                if (phL && phL.length) {
                    try {
                        const ok = await idb.set("photos", phL);
                        if (ok)
                            save("mp_photos_v1", []);
                    }
                    catch (e) { }
                }
            }
            setPhotos(phStore || []);
            if (wfL)
                setWeekFocus(wfL);
            if (medL)
                setMedi(medL);
            if (vL)
                setVoiceLog(vL);
            if (blL)
                setBloodLog(blL);
            if (chL)
                setCharisma(chL);
            if (jrL)
                setJournal(jrL);
            if (bpL)
                setBizplan(bpL);
            if (f) {
                let next = { vault: 0, vaultGoal: 5000, vaultRoundup: 0, roundUp: true, roundTo: 1, ...f, month: monthKey() };
                if (!next.income)
                    next.income = SEED_FINANCE.income;
                // migrate old € limits -> capital + % model
                if (next.capital == null) {
                    const cap = (next.cats || []).reduce((a, c) => a + (c.limit || 0), 0) || 2600;
                    next.capital = cap;
                    next.cats = (next.cats || []).map((c) => ({
                        id: c.id, name: c.name, color: c.color,
                        pct: c.pct != null ? c.pct : (cap ? Math.round((c.limit || 0) / cap * 100) : 0),
                    }));
                }
                setFinance(next);
            }
            setReady(true);
        })();
    }, []);
    /* persist slices */
    useEffect(() => { if (ready)
        save("mp_profile_v1", profile); }, [profile, ready]);
    useEffect(() => { if (ready)
        save("mp_habits_v1", habits); }, [habits, ready]);
    useEffect(() => { if (ready)
        save("mp_supps_v1", supps); }, [supps, ready]);
    useEffect(() => { if (ready)
        save("mp_daily_v4", daily); }, [daily, ready]);
    useEffect(() => { if (ready)
        save("mp_tasks_v1", tasks); }, [tasks, ready]);
    useEffect(() => { if (ready)
        save("mp_finance_v1", finance); }, [finance, ready]);
    useEffect(() => {
        if (!ready) return;
        const chk = () => setFinance((f) => { const t = salaryPostFor(f); return t ? { ...f, tx: [t, ...(f.tx || [])] } : f; });
        chk();
        const iv = setInterval(chk, 30 * 60e3);
        return () => clearInterval(iv);
    }, [ready, finance.salary]);
    useEffect(() => { if (ready)
        save("mp_events_v1", events); }, [events, ready]);
    useEffect(() => { if (ready)
        save("mp_diet_v1", diet); }, [diet, ready]);
    useEffect(() => { if (ready)
        save("mp_shopping_v1", shopping); }, [shopping, ready]);
    useEffect(() => { if (ready)
        save("mp_saas_v1", saasData); }, [saasData, ready]);
    useEffect(() => { if (ready)
        save("mp_measures_v1", measures); }, [measures, ready]);
    useEffect(() => { if (ready)
        save("mp_books_v1", books); }, [books, ready]);
    useEffect(() => { if (ready)
        save("mp_prs_v1", prs); }, [prs, ready]);
    useEffect(() => { if (!ready)
        return; (async () => { let ok = false; try {
        ok = await idb.set("photos", photos);
    }
    catch (e) { } if (!ok)
        save("mp_photos_v1", photos); })(); }, [photos, ready]);
    useEffect(() => { if (ready)
        save("mp_review_v1", weekFocus); }, [weekFocus, ready]);
    useEffect(() => { if (ready)
        save("mp_medi_v1", medi); }, [medi, ready]);
    useEffect(() => { if (ready)
        save("mp_voice_v1", voiceLog); }, [voiceLog, ready]);
    useEffect(() => { if (ready)
        save("mp_blood_v1", bloodLog); }, [bloodLog, ready]);
    useEffect(() => { if (ready)
        save("mp_charisma_v1", charisma); }, [charisma, ready]);
    useEffect(() => { if (ready)
        save("mp_journal_v1", journal); }, [journal, ready]);
    useEffect(() => { if (ready)
        save("mp_bizplan_v1", bizplan); }, [bizplan, ready]);
    useEffect(() => { if (ready)
        save("mp_trades_v1", trades); }, [trades, ready]);
    useEffect(() => {
        if (!ready)
            return;
        const map = { mp_profile_v1: setProfile, mp_habits_v1: setHabits, mp_supps_v1: setSupps, mp_daily_v4: setDaily, mp_tasks_v1: setTasks, mp_finance_v1: setFinance, mp_events_v1: setEvents, mp_diet_v1: (v) => setDiet({ ...SEED_DIET, ...v }), mp_shopping_v1: setShopping, mp_saas_v1: setSaasData, mp_measures_v1: setMeasures, mp_books_v1: setBooks, mp_prs_v1: setPrs, mp_review_v1: setWeekFocus, mp_medi_v1: setMedi, mp_voice_v1: setVoiceLog, mp_blood_v1: setBloodLog, mp_charisma_v1: setCharisma, mp_journal_v1: setJournal, mp_bizplan_v1: setBizplan, mp_trades_v1: (v) => setTrades({ ...SEED_TRADES, ...v }), mp_rest_v1: (v) => restStore.replace(v), mp_gate_v1: (v) => gateStore.replace(v), mp_fav_v1: (v) => favStore.replace(v), mp_goal_v1: (v) => goalStore.replace(v), mp_hub_v1: (v) => hubStore.replace(v), mp_alarms_v1: (v) => setAlarms(v), mp_dgrep_v1: (v) => repStore.replace(v) };
        sync.onRemote = (k, v) => { if (v != null && map[k]) map[k](v); };
        sync.init();
    }, [ready]);
    const resetStats = () => {
        if (!window.confirm("Wyzerować WSZYSTKIE statystyki — historię treningów, wykonania nawyków, serie (streaki), rekordy PR, medytacje i głos? Ustawienia, finanse, kalendarz, listy oraz pomiary wagi i badania ZOSTAJĄ. Tej operacji nie da się cofnąć."))
            return;
        setDaily({});
        setPrs([]);
        setMedi([]);
        setVoiceLog({});
        setCharisma({ done: {}, log: [] });
        setProfile((p) => ({ ...p, freshStart: todayKey() }));
        buzz(25);
        if (setToast)
            setToast({ icon: "check", title: "Statystyki wyzerowane", msg: "Świeży start od dziś. Lock in. 🔒", color: "var(--green)" });
    };
    /* mutate today's record */
    const setDay = useCallback((patch) => {
        setDaily((prev) => {
            const cur = prev[tk] || { habits: {}, supps: {}, workoutDone: false, workoutId: null, sets: {} };
            const next = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
            return { ...prev, [tk]: next };
        });
    }, [tk]);
    const setDayFor = useCallback((key, fn) => {
        setDaily((prev) => {
            const cur = prev[key] || { habits: {}, supps: {}, workoutDone: false, workoutId: null, sets: {} };
            return { ...prev, [key]: fn(cur) };
        });
    }, []);
    const toggleHabit = (id) => { buzz(8); setDay((c) => ({ ...c, habits: { ...c.habits, [id]: !c.habits[id] } })); };
    const toggleSupp = (id) => { buzz(8); setDay((c) => ({ ...c, supps: { ...c.supps, [id]: !c.supps[id] } })); };
    /* ── rest timer (lives in App so it survives tab switches) ── */
    const [timer, setTimer] = useState({ dur: 90, left: 90, running: false, label: "Regeneracja" });
    const audioRef = useRef(null);
    const beep = () => {
        try {
            if (!audioRef.current)
                audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const ctx = audioRef.current;
            [0, 0.18].forEach((t, i) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.frequency.value = i === 0 ? 880 : 1175;
                o.type = "sine";
                o.connect(g);
                g.connect(ctx.destination);
                g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
                g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
                o.start(ctx.currentTime + t);
                o.stop(ctx.currentTime + t + 0.18);
            });
        }
        catch { }
    };
    useEffect(() => {
        if (!timer.running)
            return;
        const iv = setInterval(() => {
            setTimer((t) => {
                if (t.left <= 1) {
                    beep();
                    buzz([120, 60, 120]);
                    return { ...t, left: 0, running: false };
                }
                return { ...t, left: t.left - 1 };
            });
        }, 1000);
        return () => clearInterval(iv);
    }, [timer.running]);
    const startTimer = (sec, label) => { if (audioRef.current)
        audioRef.current.resume?.(); setTimer({ dur: sec, left: sec, running: true, label: label || "Regeneracja" }); };
    useEffect(() => {
        if (!("serviceWorker" in navigator))
            return;
        const h = (e) => { if (e.data && e.data.type === "open-briefing")
            setTab("ai"); };
        navigator.serviceWorker.addEventListener("message", h);
        return () => navigator.serviceWorker.removeEventListener("message", h);
    }, []);
    useEffect(() => {
        if (!ready)
            return;
        const check = () => {
            if (typeof Notification === "undefined" || Notification.permission !== "granted")
                return;
            const now = new Date();
            const p2 = n => String(n).padStart(2, "0");
            const hm = `${p2(now.getHours())}:${p2(now.getMinutes())}`;
            const tk2 = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
            const todayEv = (events || []).find(e => e.date === tk2 && (e.title.includes("Ranka") || e.title.includes("Popołudnie") || e.title.includes("Nocka")));
            const sType = todayEv ? (todayEv.title.includes("Ranka") ? "Ranka" : todayEv.title.includes("Popołudnie") ? "Popołudnie" : "Nocka") : "Wolne";
            const cfg2 = (alarmCfg || {})[sType] || {};
            if (!cfg2.enabled)
                return;
            [[cfg2.wake, "⏰ Pobudka!", `${sType} · Zimny prysznic → plan dnia`], [cfg2.supl, "💊 Suplementy", `D3+K2, magnez, kreatyna`], [cfg2.biz, "💻 Deep Work", `Wyłącz rozpraszacze. Blok skupienia.`], [cfg2.trening, "🏋️ Trening!", `Siłownia / kalistenika`]].forEach(([t, title, body]) => {
                if (!t)
                    return;
                const key = `${tk2}_${t}_${title}`;
                if (hm === t && !sentToday.current.has(key)) {
                    sentToday.current.add(key);
                    fireAlarm(title, body);
                    setToast({ icon: "sun", title, msg: body, color: "var(--green2)" });
                }
            });
        };
        check();
        const iv = setInterval(check, 30000);
        return () => clearInterval(iv);
    }, [ready, events, alarmCfg]);
    /* ── reminders (affirmation + savings) ── */
    const [toast, setToast] = useState(null);
    const notify = (title, body) => {
        try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted")
                new Notification(title, { body });
        }
        catch { }
        buzz([60, 40, 60]);
    };
    useEffect(() => {
        if (!ready)
            return;
        const check = () => {
            const rem = profile.reminders || {};
            const n = new Date();
            const hhmm = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
            const recRem = (daily[tk] && daily[tk].rem) || {};
            const due = (r) => r && r.on && r.time && hhmm >= r.time;
            if (due(rem.affirm) && !recRem.affirm) {
                const a = AFFIRM[n.getDate() % AFFIRM.length];
                setToast({ icon: "sun", title: "Afirmacja dnia", msg: a, color: "var(--gold)" });
                notify("Afirmacja dnia", a);
                setDay((c) => ({ ...c, rem: { ...(c.rem || {}), affirm: true } }));
            }
            else if (due(rem.save) && !recRem.save) {
                setToast({ icon: "piggy", title: "Czas odłożyć 💰", msg: "Dorzuć dziś coś do skarbonki — każde euro się liczy.", color: "var(--green)" });
                notify("Czas odłożyć", "Dorzuć dziś coś do skarbonki.");
                setDay((c) => ({ ...c, rem: { ...(c.rem || {}), save: true } }));
            }
            else if (due(rem.briefing) && !recRem.briefing) {
                setToast({ icon: "sun", title: "Druga Głowa 🧠", msg: "Raport dnia czeka — wejdź i sprawdź, na czym dziś się skupić.", color: "var(--gold)" });
                notify("Druga Głowa", "Raport dnia czeka — sprawdź, na czym się skupić.");
                setDay((c) => ({ ...c, rem: { ...(c.rem || {}), briefing: true } }));
            }
        };
        check();
        const iv = setInterval(check, 20000);
        return () => clearInterval(iv);
    }, [ready, profile.reminders, daily, tk, setDay]);
    if (!ready) {
        return (React.createElement("div", { style: rootBase },
            React.createElement("style", null, CSS),
            React.createElement("div", { className: "mp-root", style: { minHeight: "100vh", display: "grid", placeItems: "center" } },
                React.createElement("div", { style: { textAlign: "center", animation: "fade .4s ease" } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, letterSpacing: "-.03em" } }, "MASTER PLAN"),
                    React.createElement("div", { style: { color: "var(--muted)", marginTop: 8, fontSize: 13 } }, "\u0141adowanie\u2026")))));
    }
    const NAV = [
        { id: "home", label: "Dziś", icon: Sun },
        { id: "train", label: "Trening", icon: Dumbbell },
        { id: "diet", label: "Dieta", icon: Apple },
        { id: "habits", label: "Nawyki", icon: Check },
        { id: "money", label: "Finanse", icon: Wallet },
        { id: "trade", label: "Trading", icon: BarChart3 },
        { id: "rozwoj", label: "Rozwój", icon: TrendingUp },
    ];
    return (React.createElement("div", { style: rootBase },
        React.createElement("style", null, CSS),
        React.createElement("div", { className: "mp-root mp-shell", style: { minHeight: "100vh", maxWidth: 460, margin: "0 auto", position: "relative", paddingBottom: 96 } },
            React.createElement("div", { className: "grain" }),
            React.createElement(Toast, { toast: toast, onClose: () => setToast(null), onGo: () => { if (toast && toast.go) setTab(toast.go); else if (toast && toast.icon === "piggy")
                    setTab("money"); setToast(null); } }),
            React.createElement("div", { key: tab, className: "mp-content", style: { animation: "fade .25s ease", padding: "0 16px" } },
                !["home", "train", "diet", "habits", "money", "trade", "rozwoj"].includes(tab) && React.createElement(BackBar, { tab, setTab }),
                tab === "home" && React.createElement(Home, { profile, setProfile, habits, supps, day, daily, setDayFor, tasks, setTasks, events, setEvents, finance, setFinance, setToast, diet, toggleHabit, setTab, resetStats, journal, setJournal, setDay }),
                tab === "rozwoj" && React.createElement(DevHub, { setTab, profile, daily, habits, measures, medi, voiceLog, books, prs, diet }),
                tab === "cal" && React.createElement(Calendar, { events, setEvents, daily, habits, finance, profile, setProfile, setToast }),
                tab === "tasks" && React.createElement(Tasks, { tasks, setTasks }),
                tab === "train" && React.createElement(Train, { day, setDay, daily, timer, setTimer, startTimer, prs, setPrs }),
                tab === "diet" && React.createElement(Diet, { diet, setDiet, shopping, setShopping, day, setDay, profile, supps, finance, setFinance, setToast, daily, setDayFor }),
                tab === "habits" && React.createElement(Habits, { habits, setHabits, supps, setSupps, day, toggleHabit, toggleSupp }),
                tab === "money" && React.createElement(Money, { finance, setFinance, events, setTab }),
                tab === "testo" && React.createElement(Testo, null),
                tab === "charisma" && React.createElement(Charisma, { charisma: charisma, setCharisma: setCharisma }),
                tab === "saas" && React.createElement(SaasDashboard, { saasData: saasData, setSaasData: setSaasData }),
                tab === "books" && React.createElement(BookTracker, { books: books, setBooks: setBooks }),
                tab === "ai" && (React.createElement(React.Fragment, null,
                    React.createElement(DrugaGlowa, { profile, daily, habits, measures, finance, diet, books, prs, weekFocus, photos, events, bloodLog, journal }))),
                tab === "aitools" && React.createElement(AITools, null),
                tab === "shifts" && React.createElement(WeeklyShiftPlan, { events: events }),
                tab === "health" && React.createElement(HealthTracker, { day: day, setDay: setDay, daily: daily, profile: profile, setProfile: setProfile, events: events, setEvents: setEvents, measures: measures, setMeasures: setMeasures, photos: photos, setPhotos: setPhotos, bloodLog: bloodLog, setBloodLog: setBloodLog, setToast: setToast }),
                tab === "alarms" && React.createElement(AlarmCenter, { alarmCfg: alarmCfg, defaultAlarms: defaultAlarms, saveAlarms: saveAlarms, notifPerm: typeof Notification !== "undefined" ? Notification.permission : "denied", askNotif: askNotif, events: events, setToast: setToast, fireAlarm: fireAlarm }),
                tab === "devpath" && React.createElement(DevPath, { setTab: setTab }),
                tab === "review" && React.createElement(WeeklyReview, { daily, habits, measures, finance, weekFocus, setWeekFocus, profile }),
                tab === "medytacja" && React.createElement(Meditation, { medi: medi, setMedi: setMedi }),
                tab === "resilience" && React.createElement(Resilience, { askDG: askDG }),
                tab === "glos" && React.createElement(VoicePosture, { voiceLog: voiceLog, setVoiceLog: setVoiceLog }),
                tab === "looksmax" && React.createElement(Looksmax, null),
                tab === "bizplan" && React.createElement(BiznesPlan, { bizplan: bizplan, setBizplan: setBizplan }),
                tab === "trade" && React.createElement(Trading, { trades, setTrades }),
                tab === "brama" && React.createElement(ExitGate, { finance, setFinance, setToast }),
                tab === "cel" && React.createElement(Goal100, { finance, setFinance, setSaasData, setToast, setTab })),
            React.createElement(ReminderHost, { events, setToast }),
            React.createElement(DGReportHost, { S: { profile, daily, habits, measures, finance, diet, books, prs, weekFocus, photos, events, bloodLog, journal }, setTab }),
            timer.running && tab !== "train" && (React.createElement("div", { onClick: () => setTab("train"), style: {
                    position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", zIndex: 40,
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderRadius: 99,
                    background: "var(--surface2)", border: "1px solid var(--green)", cursor: "pointer",
                    boxShadow: "0 10px 30px -10px var(--green-glow)", animation: "fade .3s ease",
                } },
                React.createElement(TimerIcon, { size: 16, color: "var(--green2)" }),
                React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 15, fontVariantNumeric: "tabular-nums" } },
                    pad(Math.floor(timer.left / 60)),
                    ":",
                    pad(timer.left % 60)),
                React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, timer.label))),
            React.createElement(Sheet, { open: moreOpen, onClose: () => setMoreOpen(false), title: "Wi\u0119cej" },
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
                    React.createElement("button", { onClick: () => { setTab("review"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(BarChart3, { size: 24, color: "var(--gold2)" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "Przegl\u0105d tygodnia")),
                    React.createElement("button", { onClick: () => { setTab("medytacja"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement("span", { style: { fontSize: 24, lineHeight: 1 } }, "\uD83E\uDDD8"),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "Medytacja")),
                    React.createElement("button", { onClick: () => { setTab("glos"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement("span", { style: { fontSize: 24, lineHeight: 1 } }, "\uD83C\uDF99\uFE0F"),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "G\u0142os & Postawa")),
                    React.createElement("button", { onClick: () => { setTab("testo"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(Flame, { size: 24, color: "var(--gold)" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "Testosteron")),
                    React.createElement("button", { onClick: () => { setTab("charisma"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(Sparkles, { size: 24, color: "var(--green2)" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "Charyzma")),
                    React.createElement("button", { onClick: () => { setTab("saas"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(Zap, { size: 24, color: "#10b981" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "Biznes SaaS")),
                    React.createElement("button", { onClick: () => { setTab("health"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(TrendingUp, { size: 24, color: "#a78bfa" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "Zdrowie & Cia\u0142o")),
                    React.createElement("button", { onClick: () => { setTab("books"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(Quote, { size: 24, color: "#f59e0b" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "Biblioteka")),
                    React.createElement("button", { onClick: () => { setTab("shifts"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(CalendarDays, { size: 24, color: "#60a5fa" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "Plan tygodnia")),
                    React.createElement("button", { onClick: () => { setTab("ai"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(Sparkles, { size: 24, color: "#60a5fa" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "AI Tools \uD83E\uDD16")),
                    React.createElement("button", { onClick: () => { setTab("alarms"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(Bell, { size: 24, color: "var(--gold)" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "Alarmy \u23F0")),
                    React.createElement("button", { onClick: () => { setTab("devpath"); setMoreOpen(false); }, style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 10px", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 } },
                        React.createElement(TrendingUp, { size: 24, color: "var(--green2)" }),
                        React.createElement("span", { style: { fontSize: 13.5, fontWeight: 700 } }, "\u015Acie\u017Cka \uD83D\uDDFA\uFE0F")))),
            React.createElement("nav", { className: "mp-nav", style: {
                    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, maxWidth: 460, margin: "0 auto",
                    background: "rgba(16,14,21,.78)", backdropFilter: "blur(18px) saturate(1.25)", borderTop: "1px solid var(--line)",
                    display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "8px 0 calc(8px + env(safe-area-inset-bottom))",
                } }, NAV.map((n) => {
                const Ic = n.icon;
                const on = tab === n.id;
                return (React.createElement("button", { key: n.id, onClick: () => { buzz(5); setTab(n.id); }, style: {
                        background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 4, padding: "6px 0", color: on ? "var(--gold2)" : "var(--faint)",
                        transition: "color .2s", overflow: "hidden",
                    } },
                    React.createElement(Ic, { size: 19, strokeWidth: on ? 2.5 : 2 }),
                    React.createElement("span", { style: { fontSize: 9, fontWeight: on ? 700 : 500, whiteSpace: "nowrap" } }, n.label)));
            })))));
}
/* ───────────────────────── HOME / DASHBOARD ───────────────────────── */
function TodayTasksCard({ tasks, setTasks, setTab }) {
  const items = tasks && tasks.items || [];
  const tk = todayKey();
  const tmr = (() => {
    const d = /* @__PURE__ */ new Date();
    d.setDate(d.getDate() + 1);
    return keyOf(d);
  })();
  const evening = (/* @__PURE__ */ new Date()).getHours() >= 18;
  const mine = items.filter((t) => t.list === "l_inbox" && (!t.date || t.date <= tk));
  const next = evening ? items.filter((t) => t.list === "l_inbox" && t.date === tmr) : [];
  const sortT = (a, b) => a.done === b.done ? (a.prio || 9) - (b.prio || 9) : a.done ? 1 : -1;
  const mins = (t) => t.min || (+(/\((\d+)\s*min\)/.exec(t.title || "") || [])[1] || 0);
  const left = mine.filter((t) => !t.done).reduce((s, t) => s + mins(t), 0);
  const doneN = mine.filter((t) => t.done).length;
  const toggle = (id) => {
    setTasks((p) => ({ ...p, items: (p.items || []).map((t) => t.id === id ? { ...t, done: !t.done } : t) }));
    buzz(8);
  };
  const hm = (m) => m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? m % 60 + " min" : ""}` : `${m} min`;
  const Row = ({ t }) => /* @__PURE__ */ React.createElement("div", { onClick: () => toggle(t.id), style: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--line)", cursor: "pointer" } }, /* @__PURE__ */ React.createElement(CheckBox, { on: !!t.done }), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 13.5, lineHeight: 1.35, color: t.done ? "var(--muted)" : "var(--text)", textDecoration: t.done ? "line-through" : "none" } }, t.title), t.prio === 1 && !t.done && /* @__PURE__ */ React.createElement("span", { style: { width: 7, height: 7, borderRadius: 7, background: "var(--gold)", flexShrink: 0 } }));
  return /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14, border: "1px solid rgba(245,181,61,.4)" }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "var(--gold2)" } }, "\u2705 ZADANIA NA DZI\u015A \xB7 ", doneN, "/", mine.length), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, left ? "zosta\u0142o ~" + hm(left) : mine.length ? "komplet \u{1F525}" : "")), mine.length ? /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6 } }, mine.slice().sort(sortT).map((t) => /* @__PURE__ */ React.createElement(Row, { key: t.id, t }))) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginTop: 8 } }, "Brak zada\u0144 na dzi\u015B. Nowe przychodz\u0105 codziennie z raportem o 20:00."), next.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: ".06em" } }, "JUTRO"), next.slice().sort(sortT).map((t) => /* @__PURE__ */ React.createElement(Row, { key: t.id, t }))), /* @__PURE__ */ React.createElement("button", { onClick: () => setTab("tasks"), style: { width: "100%", marginTop: 8, background: "none", border: "none", color: "var(--faint)", fontSize: 12, cursor: "pointer" } }, "Wszystkie zadania \u2192"));
}

const hm2m = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
  return m ? +m[1] * 60 + +m[2] : null;
};
const m2hm = (m) => {
  m = (m % 1440 + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
const dayShift = (events, k) => shiftOfDate(events, k);
const SHIFT_WIN = { Ranka: [360, 930], "Popo\u0142udnie": [840, 1410], Nocka: [1320, 1440] };
const ROUT_M = [{ id: "m1", t: "\u{1F4A7} Woda + \u015Bwiat\u0142o dzienne", m: 2 }, { id: "m2", t: "\u{1F9B7} Z\u0119by, twarz, ubranie", m: 5 }, { id: "m3", t: "\u{1F9CD} Postawa, mewing, szyja", m: 3 }, { id: "m4", t: "\u{1F399}\uFE0F G\u0142os: oddech przepon\u0105 + 2 min czytania na g\u0142os", m: 5 }, { id: "m5", t: "\u{1F48A} Suple", m: 1 }, { id: "m6", t: "\u{1F9D8} Medytacja", m: 10 }, { id: "m7", t: "\u{1F4CB} Rzut oka na plan dnia", m: 2 }];
const ROUT_E = [{ id: "e1", t: "\u{1F4F5} Ekran od\u0142o\u017Cony, \u015Bwiat\u0142o przygaszone", m: 1 }, { id: "e2", t: "\u{1F6BF} Prysznic", m: 10 }, { id: "e3", t: "\u{1F9B7} Z\u0119by + skincare", m: 5 }, { id: "e4", t: "\u{1F392} Rzeczy na jutro gotowe", m: 2 }, { id: "e5", t: "\u{1F4DD} Dziennik: 3 zdania + 1 moment, w kt\xF3rym by\u0142em pewny siebie", m: 3 }, { id: "e6", t: "\u{1F4DA} Ksi\u0105\u017Cka (papier)", m: 20 }, { id: "e7", t: "\u{1F9D8} Oddech 4-7-8, \u015Bwiat\u0142o off", m: 3 }];
const sleepBuf = () => {
  const p = lsJSON("mp_profile_v1", {}) || {};
  return p.fastSleep ? 0 : 20;
};
const ROUT_M_MIN = ROUT_M.reduce((a, x) => a + x.m, 0), ROUT_E_MIN = ROUT_E.reduce((a, x) => a + x.m, 0);
const ROUT_M_SHORT = ["m1", "m2", "m5"];
const evKeyNow = () => {
  const d = /* @__PURE__ */ new Date();
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  return keyOf(d);
};
function sleepPlan(events, k, alarms, daily) {
  const D = daily || lsJSON("mp_daily_v4", {});
  const sl = (D[k] || {}).sl || {};
  const A = alarms || lsJSON("mp_alarms_v1", null) || HOME_DEF_ALARMS;
  const s0 = dayShift(events, k), s1 = dayShift(events, addDays(k, 1)), sp = dayShift(events, addDays(k, -1));
  const wakeOf = (s) => hm2m((A[s] || {}).wake) ?? (s === "Ranka" ? 300 : s === "Popo\u0142udnie" ? 450 : 480);
  let wake = wakeOf(s0), bed = null, note = "", nap = null, dayNap = null;
  if (sp === "Nocka" && s0 !== "Nocka") {
    wake = 780;
    dayNap = [510, 780];
    note = "Po nocce: kr\xF3tki sen do 13:00, wieczorem normalnie \u2014 reset rytmu";
  }
  if (sp === "Nocka" && s0 === "Nocka") {
    wake = 870;
    dayNap = [510, 870];
    note = "Mi\u0119dzy nockami: \u015Bpij 8:30\u201314:30 w ciemno\u015Bci";
  }
  if (s0 === "Nocka") {
    bed = null;
    nap = sp !== "Nocka" ? [930, 1050] : null;
    note = note || "Nocka: drzemka 15:30\u201317:30 przed wyjazdem";
  } else if (s0 === "Popo\u0142udnie") bed = 1455;
  else if (s1 === "Ranka") bed = 1290;
  else if (s1 === "Nocka") bed = 1470;
  else bed = 1380;
  if (s0 === "Popo\u0142udnie" && s1 === "Nocka") bed = 1500;
  const prevSl = (D[addDays(k, -1)] || {}).sl || {};
  const firstEv = (events || []).filter((e) => e.date === k && e.time && !/Ranka|Popołudnie|Nocka/.test(e.title || "")).map((e) => hm2m(e.time)).sort((a, b) => a - b)[0];
  if (prevSl.bed != null && prevSl.bed < 720) {
    const end = prevSl.bed + 450;
    if (wake < end) wake = end;
  }
  if (firstEv != null && wake > firstEv - 45 && firstEv - 45 > 240) wake = firstEv - 45;
  const plannedWake = wake;
  if (sl.wake != null) wake = sl.wake;
  const buf = sleepBuf();
  const mShort = s0 === "Ranka" || sp === "Nocka";
  const mMin = mShort ? 8 : ROUT_M_MIN;
  if (sl.eve != null) bed = sl.eve + ROUT_E_MIN + buf;
  if (sl.bed != null) bed = sl.bed;
  const routine = sl.eve != null ? sl.eve : bed != null ? bed - ROUT_E_MIN - buf : null;
  const lastMeal = bed != null ? bed - 120 : s0 === "Nocka" ? 1260 : null;
  const firstMeal = wake + 120;
  const prev = (D[addDays(k, -1)] || {}).sl || {};
  const slept = prev.bed != null && sl.wake != null ? (sl.wake + 1440 - prev.bed) % 1440 / 60 : null;
  const hours = bed != null ? (wakeOf(s1 === "Nocka" ? "Wolne" : s1) + (s1 === "Nocka" ? 120 : 0) + 1440 - bed) % 1440 / 60 : null;
  return { buf, s0, s1, sp, wake, plannedWake, bed, routine, lastMeal, firstMeal, nap, dayNap, note, hours, sl, mShort, mMin, slept };
}
const CONF_CH = [
  ["Nagraj 60 s o swoim dniu, ods\u0142uchaj \u2014 m\xF3w wolniej o 20%", 5],
  ["Kontakt wzrokowy 3 s z ka\u017Cd\u0105 osob\u0105, z kt\xF3r\u0105 dzi\u015B rozmawiasz", 2],
  ["Postawa szefa: 2 min wyprostowany + 10 min spaceru bez telefonu", 12],
  ["Zagadaj do 1 nieznajomej osoby jednym pytaniem otwartym", 3],
  ["Nagraj 60 s pitch SkupOS, ods\u0142uchaj, popraw jedn\u0105 rzecz", 8],
  ["Zero \u201Eyyy\u201D i \u201Ejakby\u201D w pierwszych 3 rozmowach dnia", 2],
  ["Daj 1 konkretny komplement (za czyn, nie wygl\u0105d)", 2],
  ["G\u0142os: mruczenie/rezonans 3 min + czytanie na g\u0142os z intonacj\u0105 3 min", 6],
  ["Pierwszy telefon do skupu zaraz po rozgrzewce \u2014 zanim poczujesz gotowo\u015B\u0107", 5],
  ["Pauza 2 s przed ka\u017Cd\u0105 odpowiedzi\u0105 \u2014 ca\u0142y dzie\u0144", 2],
  ["Opowiedz komu\u015B histori\u0119 w 60 s: pocz\u0105tek \u2192 problem \u2192 rozwi\u0105zanie", 3],
  ["Odm\xF3w czego\u015B spokojnie, bez t\u0142umaczenia si\u0119", 2],
  ["W rozmowach: 70% s\u0142uchasz, 30% m\xF3wisz, zadajesz pytania", 2],
  ["Nagraj swoj\u0105 stron\u0119 rozmowy telefonicznej i oce\u0144 ton 1\u201310", 8],
  ["Prezentacja SkupOS przed lustrem, 3 min", 5],
  ["Popro\u015B o feedback: \u201Eco m\xF3g\u0142bym robi\u0107 lepiej?\u201D", 3],
  ["Witaj si\u0119 pierwszy z ka\u017Cdym, do kogo wchodzisz", 2],
  ["G\u0142os z przepony: 5 min czytania na stoj\u0105co, g\u0142o\u015Bniej ni\u017C zwykle", 5],
  ["Popro\u015B skup wprost o 10-min prezentacj\u0119", 5],
  ["Wypowiedz cen\u0119 \u201E449 z\u0142\u201D 5\xD7 patrz\u0105c w oczy (lustro), bez u\u015Bmiechu przepraszaj\u0105cego", 3],
  ["Powiedz komu\u015B o swoim celu bez \u201Etylko\u201D i \u201Emo\u017Ce\u201D", 3],
  ["Rozmowa z nieznajomym 3+ minuty", 5],
  ["Nagraj 2-min wideo o SkupOS (nie publikuj), oce\u0144 mow\u0119 cia\u0142a", 10],
  ["Obiekcja \u201Eza drogo\u201D \u2014 prze\u0107wicz odpowied\u017A na g\u0142os 5\xD7", 5],
  ["Przejmij inicjatyw\u0119: zaproponuj konkretny plan (gdzie, kiedy, co)", 3],
  ["Dzie\u0144 bez narzekania \u2014 zero", 1],
  ["Popro\u015B klienta albo znajomego o polecenie", 3],
  ["Nagraj 60 s i por\xF3wnaj z nagraniem z dnia 1 \u2014 zapisz r\xF3\u017Cnic\u0119", 8]
];
const CONF_EPOCH = "2026-11-23";
const confOf = (k) => {
  const n = Math.max(0, Math.round((/* @__PURE__ */ new Date(k + "T12:00:00") - /* @__PURE__ */ new Date(CONF_EPOCH + "T12:00:00")) / 864e5));
  const c = CONF_CH[n % CONF_CH.length];
  return { t: c[0], m: c[1], n: n % CONF_CH.length + 1 };
};
const BLOCK_PLAN = {
  Wolne: [["conf", "", "08:45", 10], ["deep", "\u{1F4BC} Deep work: SkupOS + telefony do skup\xF3w", "09:00", 120], ["trade", "\u{1F4C8} Trading: wykresy, plan, wej\u015Bcia", "11:15", 30], ["train", "\u{1F3CB}\uFE0F Trening PPL", "12:30", 75], ["learn", "\u{1F3AF} Nauka sprzeda\u017Cy i marketingu", "16:00", 45]],
  "Popo\u0142udnie": [["conf", "", "08:15", 10], ["deep", "\u{1F4BC} Deep work + telefony do skup\xF3w", "08:30", 90], ["train", "\u{1F3CB}\uFE0F Trening PPL", "10:15", 60], ["trade", "\u{1F4C8} Trading: wykresy i plan", "11:45", 20], ["learn", "\u{1F3AF} Nauka sprzeda\u017Cy (audiobook w aucie)", "14:00", 25]],
  Ranka: [["read", "\u{1F3A7} Audiobook / podcast w drodze", "06:00", 25], ["med", "\u{1F9D8} Medytacja po powrocie (reset)", "15:40", 10], ["trade", "\u{1F4C8} Trading: wykresy i plan", "16:00", 20], ["conf", "", "16:20", 10], ["deep", "\u{1F4BC} Deep work nad biznesem", "16:30", 60], ["learn", "\u{1F3AF} Nauka sprzeda\u017Cy i marketingu", "18:45", 25]],
  Nocka: [["conf", "", "17:40", 10], ["med", "\u{1F9D8} Medytacja przed drzemk\u0105", "15:15", 10], ["trade", "\u{1F4C8} Trading: szybki przegl\u0105d", "18:00", 20], ["learn", "\u{1F3A7} Audiobook o sprzeda\u017Cy w drodze", "22:00", 25]]
};
const blockStart = (spec, sp) => {
  const m = /^(wake|routine)([+-]\d+)?$/.exec(spec);
  if (m) {
    const base = m[1] === "wake" ? sp.wake : sp.routine;
    return base == null ? null : base + +(m[2] || 0);
  }
  return hm2m(spec);
};
function dayItems(events, tasks, k, daily) {
  const out = [];
  const sh = dayShift(events, k);
  if (SHIFT_WIN[sh]) out.push({ kind: "shift", t0: SHIFT_WIN[sh][0], t1: SHIFT_WIN[sh][1], title: `${sh} (z dojazdem)`, hard: true });
  const sp = sleepPlan(events, k, null, daily);
  if (sp.dayNap) out.push({ kind: "sleep", t0: sp.dayNap[0], t1: sp.dayNap[1], title: "\u{1F634} Sen po nocce", hard: false });
  if (sp.nap) out.push({ kind: "sleep", t0: sp.nap[0], t1: sp.nap[1], title: "\u{1F634} Drzemka przed nock\u0105", hard: false });
  out.push({ kind: "rout", t0: sp.wake, t1: sp.wake + sp.mMin, title: `\u2600\uFE0F Po wstaniu${sp.mShort ? " (szybki start)" : ""} \xB7 ${sp.mMin} min`, r: "m" });
  if (sp.routine != null) out.push({ kind: "rout", t0: sp.routine, t1: sp.routine + ROUT_E_MIN, title: `\u{1F319} Przed snem \xB7 ${ROUT_E_MIN + sp.buf} min (ksi\u0105\u017Cka, prysznic, z\u0119by${sp.buf ? `, +${sp.buf} min na za\u015Bni\u0119cie` : ""})`, r: "e" });
  if (sp.bed != null) out.push({ kind: "bed", t0: sp.bed, t1: sp.bed, title: "\u{1F6CF}\uFE0F Sen" });
  if (!(sp.sp === "Nocka" && sp.s0 === "Nocka")) out.push({ kind: "meal", t0: sp.firstMeal, t1: sp.firstMeal, title: "\u{1F37D}\uFE0F Pierwszy posi\u0142ek (od)" });
  if (sp.lastMeal != null) out.push({ kind: "meal", t0: sp.lastMeal, t1: sp.lastMeal, title: sp.s0 === "Nocka" ? "\u{1F37D}\uFE0F Du\u017Cy posi\u0142ek przed nock\u0105 (do), w pracy tylko lekko" : "\u{1F37D}\uFE0F Ostatni posi\u0142ek (do)" });
  const bo = ((daily || lsJSON("mp_daily_v4", {}))[k] || {}).bo || {};
  (BLOCK_PLAN[sh] || []).forEach(([id, title, st, min]) => {
    const o = bo[id];
    if (o === "skip" || o && o.skip) return;
    if (id === "conf") {
      const c = confOf(k);
      title = `\u{1F4AC} Pewno\u015B\u0107 #${c.n}: ${c.t}`;
      min = Math.max(5, c.m + 3);
    }
    if (o && o.title) title = o.title;
    const t0 = o && o.at ? hm2m(o.at) : blockStart(st, sp);
    if (t0 == null) return;
    if (o && o.min) min = +o.min;
    out.push({ kind: "block", t0, t1: t0 + min, title: `${title} (${min} min)`, bid: id, moved: !!(o && o.at) });
  });
  (events || []).filter((e) => e.date === k && e.time && !/Ranka|Popołudnie|Nocka/.test(e.title || "")).forEach((e) => {
    const t0 = hm2m(e.time);
    out.push({ kind: "event", t0, t1: t0 + (+e.dur || 60), title: e.title, ev: e, hard: true });
  });
  (tasks && tasks.items || []).filter((t) => t.list === "l_inbox" && (t.date === k || !t.date && k === todayKey()) && t.at).forEach((t) => {
    const t0 = hm2m(t.at);
    out.push({ kind: "task", t0, t1: t0 + (+t.min || 30), title: t.title, task: t, hard: false });
  });
  out.sort((a, b) => a.t0 - b.t0);
  out.forEach((a) => {
    a.conf = out.filter((b) => b !== a && b.kind !== "bed" && a.kind !== "bed" && b.kind !== "meal" && a.kind !== "meal" && !(a.kind === "rout" && b.kind === "rout") && (a.hard || b.hard || a.kind === "sleep" || b.kind === "sleep") && !(a.kind === "block" && b.kind === "block") && !(a.kind === "block" && b.kind === "task" || a.kind === "task" && b.kind === "block") && a.t0 < b.t1 && b.t0 < a.t1).map((b) => b.title);
  });
  return out;
}
function icsDownload(e) {
  const d = e.date.replace(/-/g, "");
  const t0 = hm2m(e.time) || 540;
  const t1 = t0 + (+e.dur || 60);
  const f = (m) => `${d}T${pad(Math.floor(m / 60) % 24)}${pad(m % 60)}00`;
  const rem = e.remind == null ? 60 : +e.remind;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MasterPlan//PL", "BEGIN:VEVENT", `UID:mp-${e.id}@masterplan`, `DTSTAMP:${(/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART:${f(t0)}`, `DTEND:${f(t1)}`, `SUMMARY:${String(e.title).replace(/[,;]/g, " ")}`, e.note ? `DESCRIPTION:${String(e.note).replace(/[,;\n]/g, " ")}` : "", ...rem >= 0 ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${String(e.title).replace(/[,;]/g, " ")}`, `TRIGGER:-PT${rem}M`, "END:VALARM"] : [], "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (e.title || "wydarzenie").replace(/[^\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ -]/g, "").slice(0, 40) + ".ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4e3);
  buzz(10);
}
const EV_COLORS2 = ["#f5b53d", "#22c55e", "#3b82f6", "#a78bfa", "#ef4444", "#14b8a6"];
function EventForm({ date, onSave, compact }) {
  const [t, setT] = useState("");
  const [d, setD] = useState(date || todayKey());
  const [tm, setTm] = useState("");
  const [dur, setDur] = useState("60");
  const [rem, setRem] = useState("60");
  const [note, setNote] = useState("");
  const [col, setCol] = useState("#a78bfa");
  useEffect(() => {
    if (date) setD(date);
  }, [date]);
  const sm = { ...inputStyle, padding: "9px 10px", fontSize: 14 };
  const lb = { fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 };
  const save = (andIcs) => {
    if (!t.trim()) return;
    const e = { id: uid(), date: d, title: t.trim(), note: note.trim(), color: col, ...tm ? { time: tm, dur: +dur || 60, remind: rem === "" ? -1 : +rem } : {} };
    onSave(e);
    if (andIcs && tm) icsDownload(e);
    setT("");
    setTm("");
    setNote("");
    buzz(10);
  };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("input", { value: t, onChange: (e) => setT(e.target.value), placeholder: "np. Lekarz z Karolin\u0105", style: { ...sm, marginBottom: 8 } }), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 8 } }, /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: lb }, "Data"), /* @__PURE__ */ React.createElement("input", { type: "date", value: d, onChange: (e) => setD(e.target.value), style: sm })), /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: lb }, "Godzina"), /* @__PURE__ */ React.createElement("input", { type: "time", value: tm, onChange: (e) => setTm(e.target.value), style: sm }))), tm && /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: lb }, "Ile trwa (min, z dojazdem)"), /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", value: dur, onChange: (e) => setDur(e.target.value), style: sm })), /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: lb }, "Przypomnij (min przed)"), /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", value: rem, onChange: (e) => setRem(e.target.value), style: sm }))), !compact && /* @__PURE__ */ React.createElement("input", { value: note, onChange: (e) => setNote(e.target.value), placeholder: "Notatka (opcjonalnie)", style: { ...sm, marginTop: 8 } }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, EV_COLORS2.map((c) => /* @__PURE__ */ React.createElement("button", { key: c, onClick: () => setCol(c), style: { width: 26, height: 26, borderRadius: 99, background: c, cursor: "pointer", border: col === c ? "2px solid var(--text)" : "2px solid transparent" } }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => save(false), style: { ...btnPrimary, marginTop: 0, flex: 1 } }, "Dodaj"), tm && /* @__PURE__ */ React.createElement("button", { onClick: () => save(true), style: { ...btnPrimary, marginTop: 0, flex: 1.3, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--line2)" } }, "Dodaj + \u{1F4F2} iPhone")), tm && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--faint)", marginTop: 6, lineHeight: 1.4 } }, "\u201E+ iPhone\u201D dodaje wydarzenie do kalendarza telefonu z przypomnieniem ", rem || 0, " min przed \u2014 dzwoni nawet przy zamkni\u0119tej aplikacji."));
}
function DayAgendaCard({ events, setEvents, tasks, setTasks, day, setDay, setTab, daily, setDayFor, setProfile }) {
  const [k, setK] = useState(todayKey());
  const [addOpen, setAddOpen] = useState(false);
  const [rOpen, setROpen] = useState(null);
  const isToday = k === todayKey();
  const items = dayItems(events, tasks, k, daily);
  const sp = sleepPlan(events, k, null, daily);
  const ek = evKeyNow();
  const spEve = sleepPlan(events, ek, null, daily);
  const nowMin = () => (/* @__PURE__ */ new Date()).getHours() * 60 + (/* @__PURE__ */ new Date()).getMinutes();
  const setSl = (key, patch) => {
    if (setDayFor) setDayFor(key, (d) => ({ ...d, sl: { ...d.sl || {}, ...patch } }));
    buzz(12);
  };
  const hNow = (/* @__PURE__ */ new Date()).getHours();
  const tSl = ((daily || {})[todayKey()] || {}).sl || {};
  const eSl = ((daily || {})[ek] || {}).sl || {};
  const nowM = (/* @__PURE__ */ new Date()).getHours() * 60 + (/* @__PURE__ */ new Date()).getMinutes();
  const loose = (tasks && tasks.items || []).filter((t) => t.list === "l_inbox" && !t.at && (t.date === k || !t.date && isToday));
  const allT = (tasks && tasks.items || []).filter((t) => t.list === "l_inbox" && (t.date === k || !t.date && isToday));
  const doneN = allT.filter((t) => t.done).length;
  const allDay = (events || []).filter((e) => e.date === k && !e.time && !/Ranka|Popołudnie|Nocka/.test(e.title || ""));
  const toggleT = (id) => {
    setTasks((p) => ({ ...p, items: (p.items || []).map((t) => t.id === id ? { ...t, done: !t.done } : t) }));
    buzz(8);
  };
  const rt = isToday && day && day.rt || {};
  const toggleR = (r, id) => {
    if (!isToday) return;
    setDay((d) => ({ ...d, rt: { ...d.rt || {}, [r]: { ...(d.rt || {})[r] || {}, [id]: !((d.rt || {})[r] || {})[id] } } }));
    buzz(6);
  };
  const conflicts = items.filter((i) => i.conf.length && (i.kind === "task" || i.kind === "block"));
  const dName = (kk) => (/* @__PURE__ */ new Date(kk + "T12:00:00")).toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" });
  const upcoming = (events || []).filter((e) => e.date > k && e.date <= addDays(k, 7) && !/Ranka|Popołudnie|Nocka/.test(e.title || "")).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, 5);
  const col = (i) => i.kind === "block" ? "#38bdf8" : i.kind === "meal" ? "#84cc16" : i.kind === "shift" ? "#e87c1e" : i.kind === "event" ? i.ev.color || "#a78bfa" : i.kind === "task" ? "var(--gold)" : i.kind === "sleep" || i.kind === "bed" ? "#6366f1" : "var(--green2)";
  return /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14, border: "1px solid rgba(245,181,61,.4)" }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setK(addDays(k, -1)), style: { ...iconBtn, width: 28, height: 28, fontSize: 13 } }, "\u2039"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "var(--gold2)", textTransform: "uppercase" } }, "\u{1F4C5} ", isToday ? "Dzi\u015B" : dName(k), " \xB7 ", sp.s0), /* @__PURE__ */ React.createElement("button", { onClick: () => setK(addDays(k, 1)), style: { ...iconBtn, width: 28, height: 28, fontSize: 13 } }, "\u203A")), /* @__PURE__ */ React.createElement("button", { onClick: () => setAddOpen(true), style: { background: "var(--gold)", color: "#1a1200", border: "none", borderRadius: 10, padding: "6px 10px", fontWeight: 800, fontSize: 12, cursor: "pointer" } }, "+ Wydarzenie")), isToday && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(99,102,241,.10)", border: "1px solid rgba(99,102,241,.35)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.45 } }, /* @__PURE__ */ React.createElement("div", null, "\u2600\uFE0F ", /* @__PURE__ */ React.createElement("b", null, "Po wstaniu:"), " ", tSl.wake != null ? `wsta\u0142e\u015B ${m2hm(tSl.wake)}` : `plan ${m2hm(sp.plannedWake)}`, " \xB7 pierwszy posi\u0142ek od ", m2hm(sp.firstMeal), sp.slept ? ` \xB7 spa\u0142e\u015B ${sp.slept.toFixed(1)} h` : ""), /* @__PURE__ */ React.createElement("div", null, "\u{1F319} ", /* @__PURE__ */ React.createElement("b", null, "Przed snem:"), " ", eSl.bed != null ? `po\u0142o\u017Cy\u0142e\u015B si\u0119 ${m2hm(eSl.bed)}` : eSl.eve != null ? `czytasz od ${m2hm(eSl.eve)} \u2192 za\u015Bniesz ok. ${m2hm(spEve.bed)}` : spEve.routine != null ? `od\u0142\xF3\u017C telefon o ${m2hm(spEve.routine)} \u2192 sen ${m2hm(spEve.bed)}` : "dzi\u015B nocka \u2014 sen po powrocie", spEve.lastMeal != null && eSl.bed == null && eSl.eve == null ? ` \xB7 jedzenie do ${m2hm(spEve.lastMeal)}` : ""), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 2 } }, spEve.buf ? `w tym +${spEve.buf} min na za\u015Bni\u0119cie \xB7 ` : "szybkie zasypianie wy\u0107wiczone \xB7 ", /* @__PURE__ */ React.createElement("span", { onClick: () => setProfile && setProfile((p) => ({ ...p, fastSleep: !p.fastSleep })), style: { textDecoration: "underline", cursor: "pointer" } }, spEve.buf ? "zasypiam szybko" : "przywr\xF3\u0107 +20 min"))), tSl.wake == null && hNow >= 4 && hNow < 16 ? /* @__PURE__ */ React.createElement("button", { onClick: () => setSl(todayKey(), { wake: nowMin() }), style: { flexShrink: 0, padding: "9px 11px", borderRadius: 11, border: "none", background: "var(--gold)", color: "#1a1200", fontWeight: 800, fontSize: 12.5, cursor: "pointer" } }, "\u2600\uFE0F Wsta\u0142em") : eSl.eve == null && (hNow >= 17 || hNow < 5 || spEve.s0 === "Nocka") ? /* @__PURE__ */ React.createElement("button", { onClick: () => setSl(ek, { eve: nowMin() }), style: { flexShrink: 0, padding: "9px 11px", borderRadius: 11, border: "none", background: "#6366f1", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" } }, "\u{1F4DA} Id\u0119 czyta\u0107") : eSl.eve != null && eSl.bed == null ? /* @__PURE__ */ React.createElement("button", { onClick: () => setSl(ek, { bed: nowMin() }), style: { flexShrink: 0, padding: "9px 11px", borderRadius: 11, border: "none", background: "#4338ca", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" } }, "\u{1F634} K\u0142ad\u0119 si\u0119") : null), (tSl.wake != null || eSl.eve != null) && /* @__PURE__ */ React.createElement("button", { onClick: () => {
    if (eSl.eve != null) setSl(ek, { eve: null, bed: null });
    else setSl(todayKey(), { wake: null });
  }, style: { marginTop: 4, background: "none", border: "none", color: "var(--faint)", fontSize: 11, cursor: "pointer", padding: 0 } }, "\u21BA cofnij ostatnie")), conflicts.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, padding: "9px 11px", borderRadius: 11, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.4)", fontSize: 12.5, lineHeight: 1.45 } }, "\u26A0\uFE0F ", /* @__PURE__ */ React.createElement("b", null, "Niewykonalne w tych godzinach:"), " ", conflicts.map((c) => `${c.title.replace(/\s*\(\d+\s*min\)/, "")} \u2194 ${String(c.conf[0]).replace(/\s*\(\d+\s*min\)/, "")}`).join("; "), ". Przesu\u0144 jedno z nich."), allDay.map((e) => /* @__PURE__ */ React.createElement("div", { key: e.id, style: { marginTop: 8, fontSize: 12.5, padding: "6px 9px", borderRadius: 9, background: "var(--surface2)", borderLeft: `3px solid ${e.color || "var(--gold)"}` } }, "\u{1F4CC} ", e.title, e.note ? ` \xB7 ${e.note}` : "")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8 } }, items.map((i, idx) => {
    const past = isToday && i.t1 < nowM && i.kind !== "bed";
    const done = i.kind === "block" ? !!(rt.b || {})[i.bid] : i.kind === "task" ? i.task.done : i.kind === "rout" ? (i.r === "m" ? sp.mShort ? ROUT_M.filter((x) => ROUT_M_SHORT.includes(x.id)) : ROUT_M : ROUT_E).every((x) => (rt[i.r] || {})[x.id]) : false;
    return /* @__PURE__ */ React.createElement("div", { key: idx, onClick: () => i.kind === "task" ? toggleT(i.task.id) : i.kind === "block" ? toggleR("b", i.bid) : i.kind === "rout" ? setROpen(rOpen === i.r ? null : i.r) : null, style: { display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", cursor: i.kind === "task" || i.kind === "rout" || i.kind === "block" ? "pointer" : "default", opacity: past && !i.conf.length ? 0.55 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 44, fontSize: 12, fontWeight: 800, color: "var(--muted)", fontVariantNumeric: "tabular-nums", paddingTop: 1 } }, m2hm(i.t0)), /* @__PURE__ */ React.createElement("div", { style: { width: 3, borderRadius: 3, background: col(i), flexShrink: 0 } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: i.kind === "shift" || i.kind === "event" ? 700 : 500, textDecoration: done ? "line-through" : "none", color: done ? "var(--muted)" : "var(--text)" } }, (i.kind === "task" || i.kind === "rout" || i.kind === "block") && /* @__PURE__ */ React.createElement("span", { style: { marginRight: 6 } }, done ? "\u2611\uFE0F" : "\u2B1C"), i.title), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: i.conf.length ? "var(--red)" : "var(--faint)" } }, i.kind === "bed" ? sp.hours ? `ok. ${sp.hours.toFixed(1)} h snu` : "" : i.kind === "meal" ? "okno jedzenia" : `${m2hm(i.t0)}\u2013${m2hm(i.t1)}`, i.kind === "task" && i.task.by ? ` \xB7 zr\xF3b do ${i.task.by}` : "", i.kind === "event" && i.ev.remind >= 0 ? ` \xB7 przypomnienie ${i.ev.remind} min przed` : "", i.conf.length ? ` \xB7 koliduje: ${i.conf[0]}` : ""), i.kind === "rout" && rOpen === i.r && /* @__PURE__ */ React.createElement("div", { onClick: (e) => e.stopPropagation(), style: { marginTop: 6 } }, (i.r === "m" ? sp.mShort ? ROUT_M.filter((x) => ROUT_M_SHORT.includes(x.id)) : ROUT_M : ROUT_E).map((x) => /* @__PURE__ */ React.createElement("div", { key: x.id, onClick: () => toggleR(i.r, x.id), style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: isToday ? "pointer" : "default" } }, /* @__PURE__ */ React.createElement(CheckBox, { on: !!(rt[i.r] || {})[x.id] }), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 12.5 } }, x.t), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--faint)" } }, x.m, " min")))), i.kind === "event" && /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
      e.stopPropagation();
      icsDownload(i.ev);
    }, style: { marginTop: 4, background: "none", border: "1px solid var(--line2)", color: "var(--muted)", borderRadius: 8, padding: "3px 8px", fontSize: 11, cursor: "pointer" } }, "\u{1F4F2} Do kalendarza iPhone")));
  })), sp.note && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "#a5b4fc", marginTop: 6 } }, "\u{1F634} ", sp.note), loose.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: ".06em" } }, "ZADANIA BEZ GODZINY \xB7 ", doneN, "/", allT.length), loose.slice().sort((a, b) => a.done === b.done ? (a.prio || 9) - (b.prio || 9) : a.done ? 1 : -1).map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, onClick: () => toggleT(t.id), style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", cursor: "pointer" } }, /* @__PURE__ */ React.createElement(CheckBox, { on: !!t.done }), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 13.5, color: t.done ? "var(--muted)" : "var(--text)", textDecoration: t.done ? "line-through" : "none" } }, t.title), t.by && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--faint)" } }, "do ", t.by)))), upcoming.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, color: "var(--muted)", letterSpacing: ".06em" } }, "NAJBLI\u017BSZE"), upcoming.map((e) => /* @__PURE__ */ React.createElement("div", { key: e.id, style: { fontSize: 12.5, padding: "5px 0", display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--muted)", width: 88 } }, dName(e.date), e.time ? " " + e.time : ""), /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, e.title)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setTab("cal"), style: { flex: 1, background: "none", border: "none", color: "var(--faint)", fontSize: 12, cursor: "pointer" } }, "Kalendarz \u2192"), /* @__PURE__ */ React.createElement("button", { onClick: () => setTab("tasks"), style: { flex: 1, background: "none", border: "none", color: "var(--faint)", fontSize: 12, cursor: "pointer" } }, "Wszystkie zadania \u2192")), /* @__PURE__ */ React.createElement(Sheet, { open: addOpen, onClose: () => setAddOpen(false), title: "Nowe wydarzenie" }, /* @__PURE__ */ React.createElement(EventForm, { date: k, onSave: (e) => {
    setEvents((p) => [...p, e]);
    setAddOpen(false);
  } })));
}
function ReminderHost({ events, setToast }) {
  useEffect(() => {
    const tick = () => {
      const now = /* @__PURE__ */ new Date();
      const k = todayKey();
      const nm = now.getHours() * 60 + now.getMinutes();
      let sent = {};
      try {
        sent = JSON.parse(localStorage.getItem("mp_remsent") || "{}");
      } catch (e) {
      }
      const fire = (id, title, body) => {
        if (sent[id]) return;
        sent[id] = Date.now();
        buzz([200, 100, 200]);
        setToast && setToast({ icon: "sun", title, msg: body, color: "var(--gold2)" });
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && navigator.serviceWorker) navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, tag: id, icon: "icon-192.png" }));
        } catch (e) {
        }
      };
      (events || []).filter((e) => e.date === k && e.time && e.remind !== -1).forEach((e) => {
        const t0 = hm2m(e.time);
        const rem = e.remind == null ? 60 : +e.remind;
        if (nm >= t0 - rem && nm < t0) fire("ev_" + e.id, `\u23F0 ${e.title} o ${e.time}`, `Za ${t0 - nm} min.`);
      });
      const sp = sleepPlan(events, k);
      if (sp.routine != null && nm >= sp.routine && nm < sp.routine + 30) fire("rt_" + k, "\u{1F319} Czas na rutyn\u0119 wieczorn\u0105", `Sen o ${m2hm(sp.bed)}. Prysznic, z\u0119by, dziennik, ksi\u0105\u017Cka \u2014 kliknij \u201EId\u0119 czyta\u0107\u201D.`);
      Object.keys(sent).forEach((x) => {
        if (Date.now() - sent[x] > 3 * 864e5) delete sent[x];
      });
      try {
        localStorage.setItem("mp_remsent", JSON.stringify(sent));
      } catch (e) {
      }
    };
    tick();
    const iv = setInterval(tick, 6e4);
    return () => clearInterval(iv);
  }, [events]);
  return null;
}

function Home({ profile, setProfile, habits, supps, day, daily, setDayFor, tasks, setTasks, events, setEvents, finance, setFinance, setToast, diet, toggleHabit, setTab, resetStats, journal, setJournal, setDay }) {
    const [wOpen, setWOpen] = useState(false);
    const [wVal, setWVal] = useState(profile.weight);
    const [setOpen, setSetOpen] = useState(false);
    const [notifState, setNotifState] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
    const rem = profile.reminders || { affirm: { on: false, time: "08:00" }, save: { on: false, time: "20:00" }, briefing: { on: false, time: "07:00" } };
    const setRem = (key, patch) => setProfile({ ...profile, reminders: { ...rem, [key]: { ...rem[key], ...patch } } });
    const askNotif = async () => {
        try {
            const r = await Notification.requestPermission();
            setNotifState(r);
        }
        catch {
            setNotifState("denied");
        }
    };
    const impRef = useRef(null);
    const [bkpMsg, setBkpMsg] = useState("");
    const exportData = async () => {
        try {
            const ls = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf("mp_") === 0 && k !== "mp_ai_key")
                    ls[k] = localStorage.getItem(k);
            }
            let photos = null;
            try {
                photos = await idb.get("photos");
            }
            catch (e) { }
            const dump = { _app: "MasterPlan", _ver: 1, _date: new Date().toISOString(), ls, photos: photos || [] };
            const blob = new Blob([JSON.stringify(dump)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "masterplan-backup-" + todayKey() + ".json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            setBkpMsg("Pobrano kopię ✓");
            setTimeout(() => setBkpMsg(""), 4000);
        }
        catch (e) {
            setBkpMsg("Błąd eksportu: " + (e && e.message ? e.message : e));
        }
    };
    const importData = async (file) => {
        try {
            const text = await file.text();
            const dump = JSON.parse(text);
            if (!dump || dump._app !== "MasterPlan" || !dump.ls) {
                setBkpMsg("Niepoprawny plik kopii.");
                return;
            }
            if (!window.confirm("Wczytać kopię? To NADPISZE wszystkie obecne dane w aplikacji."))
                return;
            Object.keys(dump.ls).forEach((k) => { try {
                localStorage.setItem(k, dump.ls[k]);
            }
            catch (e) { } });
            if (dump.photos) {
                try {
                    await idb.set("photos", dump.photos);
                }
                catch (e) { }
            }
            setBkpMsg("Wczytano. Restart…");
            setTimeout(() => { try {
                location.reload();
            }
            catch (e) { } }, 700);
        }
        catch (e) {
            setBkpMsg("Błąd importu: " + (e && e.message ? e.message : e));
        }
    };
    const [pushOn, setPushOn] = useState(() => { try {
        return localStorage.getItem("mp_push_on") === "1";
    }
    catch (e) {
        return false;
    } });
    const [pushMsg, setPushMsg] = useState("");
    const [workerUrl, setWorkerUrl] = useState(() => { try {
        return localStorage.getItem("mp_worker_url") || "";
    }
    catch (e) {
        return "";
    } });
    const togglePush = async (v) => {
        const t = (profile.reminders && profile.reminders.briefing && profile.reminders.briefing.time) || "07:00";
        setPushMsg(v ? "Włączam…" : "");
        if (v) {
            try {
                await enablePush(t);
                try {
                    localStorage.setItem("mp_push_on", "1");
                }
                catch (e) { }
                setPushOn(true);
                setPushMsg("Push włączony ✓ Przypomnienie o " + t + " (nawet przy zamkniętej apce).");
            }
            catch (e) {
                setPushOn(false);
                setPushMsg("Nie udało się: " + (e && e.message ? e.message : e));
            }
        }
        else {
            await disablePush();
            try {
                localStorage.setItem("mp_push_on", "0");
            }
            catch (e) { }
            setPushOn(false);
            setPushMsg("Push wyłączony.");
        }
    };
    const coreHabits = habits.filter((h) => h.core);
    const habitsDone = habits.filter((h) => day.habits[h.id]).length;
    const suppsDone = supps.filter((s) => day.supps[s.id]).length;
    const totalDaily = habits.length + supps.length;
    const doneDaily = habitsDone + suppsDone;
    const dayPct = totalDaily ? Math.round((doneDaily / totalDaily) * 100) : 0;
    const allCore = coreHabits.length > 0 && coreHabits.every((h) => day.habits[h.id]);
    /* consecutive-day streak from daily log (all core habits done) */
    const streak = useMemo(() => {
        const complete = (rec) => rec && rec.habits && coreHabits.length > 0 && coreHabits.every((h) => rec.habits[h.id]);
        const key = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
        let s = 0;
        const cur = new Date();
        // don't punish before the day ends: if today isn't complete, count from yesterday
        if (!complete(daily[key(cur)]))
            cur.setDate(cur.getDate() - 1);
        for (let i = 0; i < 400; i++) {
            if (complete(daily[key(cur)])) {
                s++;
                cur.setDate(cur.getDate() - 1);
            }
            else
                break;
        }
        return s;
    }, [daily, coreHabits]);
    /* finance snapshot */
    const month = monthKey();
    const txM = finance.tx.filter((t) => (t.date || "").slice(0, 7) === month);
    const spent = txM.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0);
    const totalLimit = (finance.cats || []).reduce((a, c) => a + Math.round((finance.capital || 0) * (c.pct || 0) / 100), 0);
    const budgetPct = totalLimit ? Math.round((spent / totalLimit) * 100) : 0;
    const tasksOpen = tasks.items.filter((t) => !t.done).length;
    const wp = Math.max(0, Math.min(100, ((profile.weight - profile.start) / (profile.goal - profile.start)) * 100));
    const affirmation = AFFIRM[new Date().getDate() % AFFIRM.length];
    const quote = QUOTES[(new Date().getFullYear() * 366 + dayOfYear()) % QUOTES.length];
    /* forma dnia — jedna liczba */
    const _calT = (() => { const b = 10 * profile.weight + 6.25 * profile.height - 5 * ((diet && diet.age) || 25) + (((diet && diet.sex) || "m") === "m" ? 5 : -161); const ff = (ACT_OPTS.find((a) => a.k === (diet && diet.activity)) || { f: 1.55 }).f; return Math.round(b * ff + ((diet && diet.surplus) || 0)); })();
    const _kcalToday = (day.food || []).reduce((a, x) => a + (x.kcal || 0), 0) + evalPlanDay(todayKey(), day, dietMultOf(diet)).eaten.kcal;
    const _sleepH = parseFloat(day.sleep && day.sleep.h) || 0;
    const _ratio = _calT ? _kcalToday / _calT : 0;
    const scNut = (day.food && day.food.length) ? (_ratio <= 1 ? _ratio : Math.max(0, 1 - (_ratio - 1))) : null;
    const scSleep = _sleepH ? Math.max(0, Math.min(1, _sleepH / 8)) : null;
    const scHab = totalDaily ? doneDaily / totalDaily : 0;
    const scTrain = day.workoutDone ? 1 : 0;
    const _comps = [["Nawyki", scHab], ["Sen", scSleep], ["Dieta", scNut], ["Trening", scTrain]];
    const _wts = { Nawyki: 40, Sen: 25, Dieta: 20, Trening: 15 };
    let _ws = 0, _vs = 0;
    _comps.forEach(([k, v]) => { if (v != null) {
        _ws += _wts[k];
        _vs += v * _wts[k];
    } });
    const formScore = _ws ? Math.round(_vs / _ws * 100) : 0;
    const formLabel = formScore >= 85 ? "Świetna forma" : formScore >= 65 ? "Dobra forma" : formScore >= 40 ? "Średnio" : "Nadrób dziś";
    const formColor = formScore >= 85 ? "var(--gold2)" : formScore >= 65 ? "var(--green2)" : formScore >= 40 ? "var(--amber)" : "var(--red)";
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26, display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
            React.createElement("div", null,
                React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, fontWeight: 500, textTransform: "capitalize" } }, prettyDate()),
                React.createElement("h1", { style: { margin: "3px 0 0", fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, profile.name ? `Cześć, ${profile.name}` : "Master Plan")),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 99, background: "var(--surface)", border: "1px solid var(--line)" } },
                    React.createElement(Flame, { size: 16, color: allCore ? "var(--gold2)" : "var(--faint)", fill: allCore ? "var(--gold)" : "none" }),
                    React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 15 } }, streak)),
                React.createElement("button", { onClick: () => setSetOpen(true), style: { ...iconBtn, position: "relative" }, "aria-label": "Ustawienia" }, React.createElement(SyncDot, null),
                    React.createElement(Settings, { size: 18 })))),
        React.createElement(DayAgendaCard, { events: events || [], setEvents, tasks, setTasks, day, setDay, setTab, daily, setDayFor, setProfile }),
        React.createElement(WinDayCard, { daily, day, setDay, habits, diet }),
        React.createElement(GoalMini, { setTab }),
        React.createElement(IOSAlarmEvening, { alarmCfg: lsJSON("mp_alarms_v1", null) || HOME_DEF_ALARMS, events: lsJSON("mp_events_v1", []), setTab }),
        React.createElement(FreeFundsCard, { finance, setFinance, setToast }),
        React.createElement(Card, { style: { marginTop: 18, display: "flex", alignItems: "center", gap: 18, position: "relative", overflow: "hidden" } },
            dayPct === 100 && React.createElement("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(120px 80px at 22% 50%, var(--green-glow), transparent)", animation: "pulse 2s ease-in-out infinite" } }),
            React.createElement(Ring, { pct: dayPct, glow: dayPct === 100, color: dayPct === 100 ? "var(--gold)" : "var(--green)" },
                React.createElement("div", null,
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: "-.04em" } },
                        dayPct,
                        React.createElement("span", { style: { fontSize: 15 } }, "%")),
                    React.createElement("div", { style: { fontSize: 10.5, color: "var(--muted)", marginTop: 2 } }, "dzie\u0144"))),
            React.createElement("div", { style: { flex: 1, zIndex: 1 } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, letterSpacing: "-.02em" } }, dayPct === 100 ? "Dzień zaliczony 🔥" : doneDaily === 0 ? "Zacznij dzień" : "Jedziesz dalej"),
                React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, margin: "5px 0 12px" } },
                    doneDaily,
                    "/",
                    totalDaily,
                    " zada\u0144 dnia odhaczonych"),
                React.createElement(Bar, { pct: dayPct, color: dayPct === 100 ? "var(--gold)" : "var(--green)" }))),
        React.createElement(Card, { style: { marginTop: 12 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14 } },
                React.createElement("div", { style: { textAlign: "center", minWidth: 60 } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 34, lineHeight: 1, color: formColor } }, formScore),
                    React.createElement("div", { style: { fontSize: 10, color: "var(--faint)", marginTop: 2 } }, "/ 100")),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, marginBottom: 9 } },
                        "Forma dnia \u2014 ",
                        formLabel),
                    React.createElement("div", { style: { display: "flex", gap: 8 } }, _comps.map(([lbl, v]) => (React.createElement("div", { key: lbl, style: { flex: 1 } },
                        React.createElement("div", { style: { height: 5, borderRadius: 99, background: "rgba(255,255,255,.08)", overflow: "hidden" } },
                            React.createElement("div", { style: { width: v == null ? "0%" : `${Math.round(v * 100)}%`, height: "100%", background: formColor, borderRadius: 99 } })),
                        React.createElement("div", { style: { fontSize: 9.5, color: "var(--faint)", marginTop: 4, textAlign: "center" } },
                            lbl,
                            v == null ? " —" : "")))))))),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 } },
            React.createElement(Stat, { onClick: () => setTab("habits"), icon: Check, tint: "var(--green)", big: `${habitsDone}/${habits.length}`, label: "Nawyki", sub: `${suppsDone}/${supps.length} suplementów` }),
            React.createElement(Stat, { onClick: () => setTab("train"), icon: Dumbbell, tint: "var(--gold)", big: day.workoutDone ? "✓" : "—", label: "Trening", sub: day.workoutDone ? "Zrobiony" : "Niezrobiony" }),
            React.createElement(Stat, { onClick: () => setTab("tasks"), icon: ListTodo, tint: "var(--blue)", big: `${tasksOpen}`, label: "Zadania", sub: "do zrobienia" }),
            React.createElement(Stat, { onClick: () => setTab("money"), icon: Wallet, tint: budgetPct > 100 ? "var(--red)" : "var(--green)", big: `${budgetPct}%`, label: "Bud\u017Cet", sub: `${eur(spent)} / ${eur(totalLimit)}`, barPct: budgetPct })),
        React.createElement(Card, { style: { marginTop: 12 }, onClick: () => { setWVal(profile.weight); setWOpen(true); } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9 } },
                    React.createElement("div", { style: { width: 34, height: 34, borderRadius: 10, background: "rgba(245,181,61,.12)", display: "grid", placeItems: "center" } },
                        React.createElement(TrendingUp, { size: 17, color: "var(--gold2)" })),
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Masa cia\u0142a"),
                        React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } },
                            "cel ",
                            profile.start,
                            "\u2192",
                            profile.goal,
                            " kg \u00B7 ",
                            profile.height,
                            " cm"))),
                React.createElement("div", { style: { textAlign: "right" } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, letterSpacing: "-.03em" } },
                        profile.weight,
                        React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, " kg")),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--gold2)" } },
                        (profile.goal - profile.weight).toFixed(1),
                        " kg do celu"))),
            React.createElement(Bar, { pct: wp, color: "linear-gradient(90deg, var(--gold), var(--gold2))" }),
            React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 7, textAlign: "right" } }, "Dotknij, aby zaktualizowa\u0107 wag\u0119")),
        React.createElement(Card, { style: { marginTop: 12, background: "linear-gradient(135deg, rgba(34,197,94,.10), rgba(245,181,61,.06))", border: "1px solid rgba(34,197,94,.18)" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--green2)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" } }, "Afirmacja dnia"),
                React.createElement("button", { onClick: () => setSetOpen(true), style: { background: "none", border: "none", cursor: "pointer", color: rem.affirm.on ? "var(--green2)" : "var(--faint)", display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, padding: 0 } },
                    React.createElement(Bell, { size: 13, fill: rem.affirm.on ? "var(--green2)" : "none" }),
                    rem.affirm.on ? rem.affirm.time : "Przypomnij")),
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 16.5, lineHeight: 1.35, letterSpacing: "-.01em" } },
                "\u201E",
                affirmation,
                "\"")),
        React.createElement(Card, { style: { marginTop: 12, position: "relative", overflow: "hidden" } },
            React.createElement(Quote, { size: 56, style: { position: "absolute", right: -6, top: -10, opacity: .06, color: "var(--gold2)" } }),
            React.createElement("div", { style: { fontSize: 11.5, color: "var(--gold2)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 } },
                React.createElement(Sparkles, { size: 13 }),
                " Cytat dnia"),
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, lineHeight: 1.4, letterSpacing: "-.01em", position: "relative" } },
                "\u201E",
                quote.t,
                "\""),
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginTop: 8, fontWeight: 600 } },
                "\u2014 ",
                quote.a)),
        React.createElement("div", { style: sectionTitle }, "Nawyki nieznegocjowalne"),
        React.createElement(Card, { pad: 6 }, coreHabits.map((h, i) => {
            const on = !!day.habits[h.id];
            const Ic = ICONS[h.icon] || Check;
            return (React.createElement("div", { key: h.id, onClick: () => toggleHabit(h.id), style: {
                    display: "flex", alignItems: "center", gap: 13, padding: "12px 12px", cursor: "pointer",
                    borderBottom: i < coreHabits.length - 1 ? "1px solid var(--line)" : "none",
                } },
                React.createElement(CheckBox, { on: on }),
                React.createElement(Ic, { size: 17, color: on ? "var(--green2)" : "var(--faint)", style: { flexShrink: 0 } }),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                    React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600, color: on ? "var(--muted)" : "var(--text)", textDecoration: on ? "line-through" : "none" } }, h.name),
                    React.createElement("div", { style: { fontSize: 12, color: "var(--faint)" } }, h.hint))));
        })),
        React.createElement("div", { style: { height: 8 } }),
        React.createElement(Sheet, { open: wOpen, onClose: () => setWOpen(false), title: "Zaktualizuj wag\u0119" },
            React.createElement("label", { style: label }, "Aktualna waga (kg)"),
            React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: wVal, onChange: (e) => setWVal(e.target.value), autoFocus: true }),
            React.createElement("button", { style: btnPrimary, onClick: () => { const v = parseFloat(wVal); if (!isNaN(v))
                    setProfile({ ...profile, weight: v }); setWOpen(false); } }, "Zapisz")),
        React.createElement(DailyJournal, { journal: journal, setJournal: setJournal }),
        React.createElement(Sheet, { open: setOpen, onClose: () => setSetOpen(false), title: "Ustawienia" },
            React.createElement(SyncPanel, null),
            React.createElement("label", { style: label }, "Twoje imi\u0119"),
            React.createElement("input", { style: inputStyle, value: profile.name, placeholder: "np. Kuba", onChange: (e) => setProfile({ ...profile, name: e.target.value }) }),
            React.createElement("div", { style: { ...label, marginTop: 20, marginBottom: 10, fontSize: 13, color: "var(--text)", fontWeight: 700 } }, "Przypomnienia"),
            React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 14, marginBottom: 10 } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                        React.createElement(Sun, { size: 18, color: "var(--gold2)" }),
                        React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600 } }, "Afirmacja dnia")),
                    React.createElement(Toggle, { on: rem.affirm.on, onChange: (v) => setRem("affirm", { on: v }) })),
                rem.affirm.on && (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 12 } },
                    React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "O godzinie"),
                    React.createElement("input", { type: "time", value: rem.affirm.time, onChange: (e) => setRem("affirm", { time: e.target.value }), style: { ...inputStyle, width: "auto", flex: 1, padding: "10px 12px", colorScheme: "dark" } })))),
            React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 14, marginBottom: 10 } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                        React.createElement(PiggyBank, { size: 18, color: "var(--green2)" }),
                        React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600 } }, "Codzienne oszcz\u0119dzanie")),
                    React.createElement(Toggle, { on: rem.save.on, onChange: (v) => setRem("save", { on: v }) })),
                rem.save.on && (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 12 } },
                    React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "O godzinie"),
                    React.createElement("input", { type: "time", value: rem.save.time, onChange: (e) => setRem("save", { time: e.target.value }), style: { ...inputStyle, width: "auto", flex: 1, padding: "10px 12px", colorScheme: "dark" } })))),
            React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 14, marginBottom: 10 } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                        React.createElement("span", { style: { fontSize: 18 } }, "\uD83E\uDDE0"),
                        React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600 } }, "Raport dnia (Druga G\u0142owa)")),
                    React.createElement(Toggle, { on: rem.briefing.on, onChange: (v) => setRem("briefing", { on: v }) })),
                rem.briefing.on && (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 12 } },
                    React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "O godzinie"),
                    React.createElement("input", { type: "time", value: rem.briefing.time, onChange: (e) => setRem("briefing", { time: e.target.value }), style: { ...inputStyle, width: "auto", flex: 1, padding: "10px 12px", colorScheme: "dark" } })))),
            notifState !== "granted" && notifState !== "unsupported" && (React.createElement("button", { onClick: askNotif, style: { ...inputStyle, width: "100%", cursor: "pointer", color: "var(--green2)", fontWeight: 700, textAlign: "center", border: "1px dashed var(--line2)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 } },
                React.createElement(Bell, { size: 15 }),
                " W\u0142\u0105cz powiadomienia systemowe")),
            React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 } },
                notifState === "granted" ? "Powiadomienia systemowe włączone ✓ " : "",
                "Przypomnienia pojawiaj\u0105 si\u0119 w aplikacji, gdy jest otwarta. Aby mie\u0107 pewno\u015B\u0107, \u017Ce zadzwoni\u0105 nawet przy zamkni\u0119tej apce, ustaw te\u017C alarm w telefonie."),
            React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 14, marginBottom: 10 } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                        React.createElement("span", { style: { fontSize: 18 } }, "\uD83D\uDD14"),
                        React.createElement("div", null,
                            React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600 } }, "Push na serwerze"),
                            React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 1 } }, "Dzia\u0142a te\u017C przy zamkni\u0119tej apce"))),
                    React.createElement(Toggle, { on: pushOn, onChange: togglePush })),
                React.createElement("input", { value: workerUrl, onChange: (e) => { setWorkerUrl(e.target.value); try {
                        localStorage.setItem("mp_worker_url", e.target.value);
                    }
                    catch (er) { } }, placeholder: "https://...workers.dev", style: { ...inputStyle, fontSize: 12.5 } }),
                pushMsg && React.createElement("div", { style: { fontSize: 12, color: pushMsg.indexOf("✓") >= 0 ? "var(--green2)" : "var(--gold)", marginTop: 10, lineHeight: 1.45 } }, pushMsg),
                React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 } }, "Wymaga Twojego Workera (instrukcja: plik PORADNIK-PUSH). Godzina = ta z sekcji Raport dnia wy\u017Cej.")),
            React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 14, margin: "14px 0 10px" } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } },
                    React.createElement("span", { style: { fontSize: 18 } }, "\uD83D\uDCBE"),
                    React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600 } }, "Kopia zapasowa")),
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5, marginBottom: 12 } }, "Pobierz WSZYSTKIE dane (te\u017C zdj\u0119cia) do jednego pliku. Wgraj go na innym telefonie albo po wyczyszczeniu przegl\u0105darki, \u017Ceby odzyska\u0107 post\u0119p."),
                React.createElement("div", { style: { display: "flex", gap: 8 } },
                    React.createElement("button", { onClick: exportData, style: { flex: 1, padding: "11px 8px", borderRadius: 11, border: "none", background: "var(--green)", color: "#0a1f12", fontSize: 13, fontWeight: 700, cursor: "pointer" } }, "Eksportuj"),
                    React.createElement("button", { onClick: () => impRef.current && impRef.current.click(), style: { flex: 1, padding: "11px 8px", borderRadius: 11, border: "1px solid var(--line2)", background: "transparent", color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer" } }, "Wczytaj")),
                bkpMsg && React.createElement("div", { style: { fontSize: 12, color: "var(--green2)", marginTop: 10, textAlign: "center", lineHeight: 1.4 } }, bkpMsg),
                React.createElement("input", { ref: impRef, type: "file", accept: "application/json,.json", onChange: (e) => { const f = e.target.files && e.target.files[0]; if (f)
                        importData(f); e.target.value = ""; }, style: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", left: "-9999px" } })),
            React.createElement("div", { style: { background: "var(--surface)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 14, padding: 14, marginBottom: 10 } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } },
                    React.createElement("span", { style: { fontSize: 18 } }, "\uD83D\uDD12"),
                    React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600 } }, "\u015Awie\u017Cy start \u2014 zeruj statystyki")),
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5, marginBottom: 12 } }, "Czy\u015Bci histori\u0119 trening\u00F3w i nawyk\u00F3w, serie (streaki), rekordy PR, medytacje i g\u0142os \u2014 licznik rusza od dzi\u015B. Ustawienia, finanse, kalendarz, listy oraz waga i badania zostaj\u0105."),
                React.createElement("button", { onClick: () => { resetStats(); setSetOpen(false); }, style: { width: "100%", padding: "11px 8px", borderRadius: 11, border: "1px solid rgba(248,113,113,.35)", background: "rgba(248,113,113,.1)", color: "var(--red)", fontSize: 13, fontWeight: 700, cursor: "pointer" } }, "Wyzeruj i wystartuj na maxa")),
            React.createElement("button", { style: btnPrimary, onClick: () => setSetOpen(false) }, "Gotowe"))));
}
function Stat({ icon: Ic, tint, big, label, sub, onClick, barPct }) {
    return (React.createElement(Card, { onClick: onClick, pad: 14, style: { cursor: "pointer" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
            React.createElement("div", { style: { width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,.05)", display: "grid", placeItems: "center" } },
                React.createElement(Ic, { size: 16, color: tint })),
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, letterSpacing: "-.03em", color: tint } }, big)),
        React.createElement("div", { style: { fontSize: 13.5, fontWeight: 700, marginTop: 9 } }, label),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 1 } }, sub),
        barPct != null && React.createElement("div", { style: { marginTop: 9 } },
            React.createElement(Bar, { pct: barPct, color: barPct > 100 ? "var(--red)" : barPct > 80 ? "var(--amber)" : "var(--green)", h: 5 }))));
}
function CheckBox({ on }) {
    return (React.createElement("div", { style: {
            width: 24, height: 24, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center",
            border: on ? "none" : "2px solid var(--line2)",
            background: on ? "linear-gradient(135deg, var(--green2), var(--green))" : "transparent",
            transition: "all .18s", transform: on ? "scale(1)" : "scale(1)",
            boxShadow: on ? "0 4px 12px -4px var(--green-glow)" : "none",
        } }, on && React.createElement(Check, { size: 15, color: "#04130a", strokeWidth: 3.5, style: { animation: "pop .25s cubic-bezier(.2,1.4,.4,1)" } })));
}
/* ───────────────────────── TASKS (TickTick-style) ───────────────────────── */
function Tasks({ tasks, setTasks }) {
    const [active, setActive] = useState("all");
    const [add, setAdd] = useState(false);
    const [title, setTitle] = useState("");
    const [prio, setPrio] = useState(0);
    const [listFor, setListFor] = useState(tasks.lists[0]?.id);
    const [menuId, setMenuId] = useState(null);
    const [newListOpen, setNewListOpen] = useState(false);
    const [newListName, setNewListName] = useState("");
    const lists = tasks.lists;
    const items = active === "all" ? tasks.items : tasks.items.filter((t) => t.list === active);
    const open = items.filter((t) => !t.done).sort((a, b) => b.prio - a.prio);
    const done = items.filter((t) => t.done);
    const addTask = () => {
        if (!title.trim())
            return;
        setTasks((p) => ({ ...p, items: [{ id: uid(), list: listFor, title: title.trim(), done: false, prio }, ...p.items] }));
        setTitle("");
        setPrio(0);
        buzz(8);
    };
    const toggle = (id) => { buzz(8); setTasks((p) => ({ ...p, items: p.items.map((t) => t.id === id ? { ...t, done: !t.done } : t) })); };
    const del = (id) => { setTasks((p) => ({ ...p, items: p.items.filter((t) => t.id !== id) })); setMenuId(null); };
    const move = (id, list) => { setTasks((p) => ({ ...p, items: p.items.map((t) => t.id === id ? { ...t, list } : t) })); setMenuId(null); };
    const cyclePrio = (id) => setTasks((p) => ({ ...p, items: p.items.map((t) => t.id === id ? { ...t, prio: (t.prio + 1) % 4 } : t) }));
    const addList = () => { if (!newListName.trim())
        return; const id = uid(); const colors = ["#22c55e", "#f5b53d", "#3b82f6", "#a78bfa", "#ec4899", "#14b8a6"]; setTasks((p) => ({ ...p, lists: [...p.lists, { id, name: newListName.trim(), color: colors[p.lists.length % colors.length] }] })); setNewListName(""); setNewListOpen(false); };
    const listName = (id) => lists.find((l) => l.id === id)?.name || "";
    const listColor = (id) => lists.find((l) => l.id === id)?.color || "var(--faint)";
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26 } },
            React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Zadania"),
            React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } },
                open.length,
                " otwartych \u00B7 ",
                done.length,
                " zrobionych")),
        React.createElement("div", { style: { display: "flex", gap: 8, overflowX: "auto", padding: "16px 0 4px", margin: "0 -16px", paddingLeft: 16, paddingRight: 16, scrollbarWidth: "none" }, className: "noscroll" },
            React.createElement(Chip, { on: active === "all", onClick: () => setActive("all"), label: "Wszystko", color: "var(--green2)" }),
            lists.map((l) => React.createElement(Chip, { key: l.id, on: active === l.id, onClick: () => setActive(l.id), label: l.name, color: l.color, count: tasks.items.filter((t) => t.list === l.id && !t.done).length })),
            React.createElement("button", { onClick: () => setNewListOpen(true), style: { ...iconBtn, width: 34, height: 34, borderRadius: 99 } },
                React.createElement(Plus, { size: 16 }))),
        open.length === 0 && done.length === 0 && (React.createElement(Card, { style: { marginTop: 16, textAlign: "center", padding: 32, color: "var(--muted)" } },
            React.createElement(ListTodo, { size: 28, color: "var(--faint)", style: { marginBottom: 10 } }),
            React.createElement("div", { style: { fontSize: 14 } }, "Brak zada\u0144 tutaj. Dodaj pierwsze \u2193"))),
        React.createElement("div", { style: { marginTop: 14 } }, open.map((t) => (React.createElement(TaskRow, { key: t.id, t: t, active: active, listName: listName, listColor: listColor, onToggle: () => toggle(t.id), onMenu: () => setMenuId(menuId === t.id ? null : t.id), onPrio: () => cyclePrio(t.id), menuOpen: menuId === t.id, lists: lists, onMove: (lid) => move(t.id, lid), onDel: () => del(t.id) })))),
        done.length > 0 && (React.createElement(React.Fragment, null,
            React.createElement("div", { style: sectionTitle }, "Zrobione"),
            React.createElement("div", { style: { opacity: .6 } }, done.map((t) => (React.createElement(TaskRow, { key: t.id, t: t, active: active, listName: listName, listColor: listColor, onToggle: () => toggle(t.id), onMenu: () => setMenuId(menuId === t.id ? null : t.id), onPrio: () => { }, menuOpen: menuId === t.id, lists: lists, onMove: (lid) => move(t.id, lid), onDel: () => del(t.id) })))))),
        React.createElement("button", { onClick: () => { setListFor(active === "all" ? lists[0]?.id : active); setAdd(true); }, style: fab },
            React.createElement(Plus, { size: 26, color: "#04130a", strokeWidth: 3 })),
        React.createElement(Sheet, { open: add, onClose: () => setAdd(false), title: "Nowe zadanie" },
            React.createElement("input", { style: inputStyle, placeholder: "Co trzeba zrobi\u0107?", value: title, autoFocus: true, onChange: (e) => setTitle(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") {
                    addTask();
                    setAdd(false);
                } } }),
            React.createElement("label", { style: label }, "Lista"),
            React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, lists.map((l) => React.createElement(Chip, { key: l.id, on: listFor === l.id, onClick: () => setListFor(l.id), label: l.name, color: l.color }))),
            React.createElement("label", { style: label }, "Priorytet"),
            React.createElement("div", { style: { display: "flex", gap: 8 } }, [0, 1, 2, 3].map((p) => (React.createElement("button", { key: p, onClick: () => setPrio(p), style: {
                    flex: 1, padding: "10px", borderRadius: 11, cursor: "pointer", fontSize: 13, fontWeight: 700,
                    border: prio === p ? `1.5px solid ${prioColor(p)}` : "1px solid var(--line2)",
                    background: prio === p ? `${prioColor(p)}22` : "var(--surface)", color: prio === p ? prioColor(p) : "var(--muted)",
                } }, prioLabel(p))))),
            React.createElement("button", { style: btnPrimary, onClick: () => { addTask(); setAdd(false); } }, "Dodaj zadanie")),
        React.createElement(Sheet, { open: newListOpen, onClose: () => setNewListOpen(false), title: "Nowa lista" },
            React.createElement("input", { style: inputStyle, placeholder: "Nazwa listy", value: newListName, autoFocus: true, onChange: (e) => setNewListName(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                    addList(); } }),
            React.createElement("button", { style: btnPrimary, onClick: addList }, "Utw\u00F3rz list\u0119"))));
}
function TaskRow({ t, active, listName, listColor, onToggle, onMenu, onPrio, menuOpen, lists, onMove, onDel }) {
    return (React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 15, marginBottom: 9, overflow: "hidden" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "13px 13px" } },
            React.createElement("div", { onClick: onToggle, style: { cursor: "pointer" } },
                React.createElement(CheckBox, { on: t.done })),
            React.createElement("div", { style: { flex: 1, minWidth: 0, cursor: "pointer" }, onClick: onToggle },
                React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600, color: t.done ? "var(--faint)" : "var(--text)", textDecoration: t.done ? "line-through" : "none" } }, t.title),
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 } },
                    active === "all" && React.createElement("span", { style: { fontSize: 11, color: listColor(t.list), display: "flex", alignItems: "center", gap: 4 } },
                        React.createElement("span", { style: { width: 6, height: 6, borderRadius: 99, background: listColor(t.list) } }),
                        listName(t.list)),
                    t.prio > 0 && !t.done && React.createElement("span", { style: { fontSize: 11, color: prioColor(t.prio), fontWeight: 700 } },
                        "\u25CF ",
                        prioLabel(t.prio)))),
            !t.done && React.createElement("button", { onClick: onPrio, style: { ...iconBtn, width: 32, height: 32, border: "none", background: "transparent" } },
                React.createElement(Star, { size: 15, color: t.prio > 0 ? prioColor(t.prio) : "var(--faint)", fill: t.prio > 0 ? prioColor(t.prio) : "none" })),
            React.createElement("button", { onClick: onMenu, style: { ...iconBtn, width: 32, height: 32, border: "none", background: "transparent" } },
                React.createElement(MoreHorizontal, { size: 18, color: "var(--muted)" }))),
        menuOpen && (React.createElement("div", { style: { borderTop: "1px solid var(--line)", padding: "10px 13px 12px", background: "var(--surface2)", animation: "fade .15s ease" } },
            React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginBottom: 7, display: "flex", alignItems: "center", gap: 5 } },
                React.createElement(ArrowRightLeft, { size: 12 }),
                " Przenie\u015B do"),
            React.createElement("div", { style: { display: "flex", gap: 7, flexWrap: "wrap" } },
                lists.filter((l) => l.id !== t.list).map((l) => (React.createElement("button", { key: l.id, onClick: () => onMove(l.id), style: { padding: "7px 12px", borderRadius: 99, border: `1px solid ${l.color}55`, background: `${l.color}18`, color: l.color, fontSize: 12.5, fontWeight: 600, cursor: "pointer" } }, l.name))),
                React.createElement("button", { onClick: onDel, style: { padding: "7px 12px", borderRadius: 99, border: "1px solid rgba(239,68,68,.4)", background: "rgba(239,68,68,.12)", color: "var(--red)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 } },
                    React.createElement(Trash2, { size: 13 }),
                    " Usu\u0144"))))));
}
function Chip({ on, onClick, label, color, count }) {
    return (React.createElement("button", { onClick: onClick, style: {
            padding: "8px 14px", borderRadius: 99, whiteSpace: "nowrap", cursor: "pointer", fontSize: 13, fontWeight: on ? 700 : 600,
            border: on ? `1.5px solid ${color}` : "1px solid var(--line2)", background: on ? `${color}1f` : "var(--surface)",
            color: on ? color : "var(--muted)", display: "flex", alignItems: "center", gap: 7, transition: "all .15s", flexShrink: 0,
        } },
        label,
        count != null && count > 0 && React.createElement("span", { style: { fontSize: 11, opacity: .85, background: on ? `${color}33` : "var(--line2)", borderRadius: 99, padding: "0 6px", minWidth: 16, textAlign: "center" } }, count)));
}
/* ───────────────────────── TRAINING ───────────────────────── */
const lwMini = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line2)", background: "var(--surface2)", color: "var(--muted)", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const lwWBtn = { width: 52, height: 52, borderRadius: 14, border: "1px solid var(--line2)", background: "var(--surface2)", color: "var(--text)", fontSize: 24, fontWeight: 700, cursor: "pointer", flexShrink: 0 };
const lwNav = { flex: 1, padding: "13px", borderRadius: 13, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--text)", fontSize: 14, fontWeight: 700, cursor: "pointer" };
function LiveWorkout({ workout, day, setDay, selId, startTimer, timer, setTimer, daily, finishWorkout, onClose }) {
    const [exIdx, setExIdx] = useState(0);
    const ex = workout.ex[exIdx] || workout.ex[0];
    const sets = day.sets || {};
    const arr = sets[ex.id] || Array(ex.s).fill(false);
    const doneCount = arr.filter(Boolean).length;
    const allEx = workout.ex.length;
    const totalSets = workout.ex.reduce((a, e) => a + e.s, 0);
    const doneSets = workout.ex.reduce((a, e) => a + (sets[e.id] || []).filter(Boolean).length, 0);
    const lifts = day.lifts || {};
    const curW = (lifts[ex.id] && lifts[ex.id].w) || 0;
    const lastW = useMemo(() => {
        const ks = Object.keys(daily || {}).filter((k) => k !== todayKey()).sort().reverse();
        for (let i = 0; i < ks.length; i++) {
            const lf = daily[ks[i]] && daily[ks[i]].lifts && daily[ks[i]].lifts[ex.id];
            if (lf && lf.w)
                return lf.w;
        }
        return null;
    }, [daily, ex.id]);
    const setW = (w) => setDay((c) => ({ ...c, lifts: { ...(c.lifts || {}), [ex.id]: { w: Math.max(0, Math.round(w * 4) / 4) } } }));
    const completeSet = () => {
        const next = arr.findIndex((x) => !x);
        if (next === -1)
            return;
        setDay((c) => { const cs = { ...(c.sets || {}) }; const a = [...(cs[ex.id] || Array(ex.s).fill(false))]; a[next] = true; cs[ex.id] = a; return { ...c, sets: cs, workoutId: selId }; });
        buzz(12);
        if (restOf(ex) > 0)
            startTimer(restOf(ex), ex.n);
        if (next === ex.s - 1 && exIdx < allEx - 1)
            setTimeout(() => setExIdx((i) => Math.min(allEx - 1, i + 1)), 1000);
    };
    const undoSet = () => { const last = arr.lastIndexOf(true); if (last === -1)
        return; setDay((c) => { const cs = { ...(c.sets || {}) }; const a = [...(cs[ex.id] || [])]; a[last] = false; cs[ex.id] = a; return { ...c, sets: cs }; }); buzz(4); };
    const go = (d) => { setExIdx((i) => Math.max(0, Math.min(allEx - 1, i + d))); setTimer((t) => ({ ...t, running: false })); };
    const finish = () => { finishWorkout(); onClose(); };
    const resting = timer.running && timer.left > 0;
    const exDoneAll = doneCount >= ex.s;
    return (React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 100, background: "var(--bg)", display: "flex", flexDirection: "column", overflowY: "auto" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--line)" } },
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", fontWeight: 600 } },
                "\u0106wiczenie ",
                exIdx + 1,
                "/",
                allEx,
                " \u00B7 ",
                doneSets,
                "/",
                totalSets,
                " serii"),
            React.createElement("button", { onClick: onClose, style: { background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 } }, "\u2715")),
        React.createElement("div", { style: { flex: 1, padding: "18px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "center", marginBottom: 6 } },
                React.createElement(Ring, { pct: timer.dur ? (timer.left / timer.dur) * 100 : 0, size: 150, stroke: 11, glow: resting, color: resting ? "var(--green)" : "var(--line2)" },
                    React.createElement("div", { style: { textAlign: "center" } },
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 34, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums", color: resting ? "var(--text)" : "var(--faint)" } },
                            pad(Math.floor(timer.left / 60)),
                            ":",
                            pad(timer.left % 60)),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 2 } }, resting ? "Regeneracja" : "gotowy")))),
            React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "center", marginBottom: 22 } },
                React.createElement("button", { onClick: () => setTimer((t) => ({ ...t, running: !t.running, left: t.left === 0 ? t.dur : t.left })), style: lwMini }, timer.running ? "⏸ pauza" : "▶ start"),
                React.createElement("button", { onClick: () => setTimer((t) => ({ ...t, left: Math.max(0, t.left - 15) })), style: lwMini }, "\u221215"),
                React.createElement("button", { onClick: () => setTimer((t) => ({ ...t, left: t.left + 15, dur: Math.max(t.dur, t.left + 15) })), style: lwMini }, "+15"),
                React.createElement("button", { onClick: () => setTimer((t) => ({ ...t, running: false, left: 0 })), style: lwMini }, "pomi\u0144")),
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, letterSpacing: "-.02em", lineHeight: 1.15 } }, ex.n),
            React.createElement("div", { style: { fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 18 } },
                "Cel: ",
                ex.s,
                " serie \u00D7 ",
                ex.r),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } },
                React.createElement("button", { onClick: () => setW(curW - 2.5), style: lwWBtn }, "\u2212"),
                React.createElement("div", { style: { flex: 1, textAlign: "center" } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 30, letterSpacing: "-.02em" } },
                        curW ? curW : "—",
                        " ",
                        React.createElement("span", { style: { fontSize: 15, color: "var(--muted)" } }, "kg"))),
                React.createElement("button", { onClick: () => setW(curW + 2.5), style: lwWBtn }, "+")),
            lastW != null ? React.createElement("div", { onClick: () => setW(lastW), style: { textAlign: "center", fontSize: 12.5, color: "var(--gold)", cursor: "pointer", marginBottom: 20 } },
                "Ostatnio: ",
                lastW,
                " kg \u2014 dotknij, by u\u017Cy\u0107 (albo dorzu\u0107 +2.5)") : React.createElement("div", { style: { height: 20 } }),
            React.createElement("div", { style: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 22 } }, arr.map((on, i) => (React.createElement("div", { key: i, style: { width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", fontFamily: "var(--display)", fontWeight: 800, fontSize: 16, border: on ? "none" : (i === doneCount ? "2px solid var(--gold)" : "1.5px solid var(--line2)"), background: on ? "linear-gradient(135deg, var(--green2), var(--green))" : "var(--surface2)", color: on ? "#04130a" : (i === doneCount ? "var(--gold)" : "var(--muted)") } }, on ? React.createElement(Check, { size: 20, strokeWidth: 3 }) : i + 1)))),
            !exDoneAll ? (React.createElement("button", { onClick: completeSet, style: { width: "100%", padding: "17px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 17, fontWeight: 800, background: "linear-gradient(135deg, var(--green2), var(--green))", color: "#04130a" } },
                "\u2713 Seria ",
                doneCount + 1,
                " zaliczona")) : (React.createElement("div", { style: { textAlign: "center", padding: "16px", borderRadius: 16, background: "rgba(94,229,146,.12)", border: "1px solid rgba(94,229,146,.3)", color: "var(--green2)", fontWeight: 700, fontSize: 15 } }, "\u2713 \u0106wiczenie zrobione")),
            doneCount > 0 && React.createElement("button", { onClick: undoSet, style: { width: "100%", marginTop: 10, background: "none", border: "none", color: "var(--faint)", fontSize: 12.5, cursor: "pointer", padding: 8 } }, "Cofnij ostatni\u0105 seri\u0119")),
        React.createElement("div", { style: { display: "flex", gap: 10, padding: "14px 18px", borderTop: "1px solid var(--line)", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" } },
            React.createElement("button", { onClick: () => go(-1), disabled: exIdx === 0, style: { ...lwNav, opacity: exIdx === 0 ? 0.4 : 1 } }, "\u2039 Poprz."),
            exIdx < allEx - 1 ? (React.createElement("button", { onClick: () => go(1), style: lwNav }, "Nast\u0119pne \u203A")) : (React.createElement("button", { onClick: finish, style: { flex: 2, padding: "13px", borderRadius: 13, border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 800, background: "linear-gradient(135deg, var(--gold), #e0892a)", color: "#1a1200" } }, "Zako\u0144cz trening \u2713")))));
}
function Train({ day, setDay, daily, timer, setTimer, startTimer, prs, setPrs }) {
    const [selId, setSelId] = useState(day.workoutId && WORKOUTS.some((w) => w.id === day.workoutId) ? day.workoutId : nextPPL(daily));
    const [liveOpen, setLiveOpen] = useState(false);
    const workout = WORKOUTS.find((w) => w.id === selId) || WORKOUTS[0];
    const sets = day.sets || {};
    const groups = [...new Set(WORKOUTS.map((w) => w.group))];
    const totalSets = workout.ex.reduce((a, e) => a + e.s, 0);
    const doneSets = workout.ex.reduce((a, e) => a + (sets[e.id] || []).filter(Boolean).length, 0);
    const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
    const toggleSet = (ex, idx) => {
        buzz(8);
        setDay((c) => {
            const cs = { ...(c.sets || {}) };
            const arr = [...(cs[ex.id] || Array(ex.s).fill(false))];
            arr[idx] = !arr[idx];
            cs[ex.id] = arr;
            return { ...c, sets: cs, workoutId: selId };
        });
        // start rest timer when a set is completed
        const arr = sets[ex.id] || [];
        if (!arr[idx] && restOf(ex) > 0)
            startTimer(restOf(ex), ex.n);
    };
    const finishWorkout = () => { buzz([100, 50, 100]); setDay((c) => ({ ...c, workoutDone: true, workoutId: selId })); };
    const resetWorkout = () => setDay((c) => ({ ...c, sets: { ...(c.sets || {}), ...Object.fromEntries(workout.ex.map((e) => [e.id, Array(e.s).fill(false)])) }, workoutDone: false }));
    const adj = (d) => setTimer((t) => ({ ...t, left: Math.max(0, t.left + d), dur: Math.max(t.dur, t.left + d) }));
    const presets = [45, 60, 75, 90, 120, 180];
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26 } },
            React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Trening"),
            React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, "Odhaczaj serie \u00B7 timer przerw startuje sam")),
        React.createElement(Card, { style: { marginTop: 18, display: "flex", alignItems: "center", gap: 16 } },
            React.createElement(Ring, { pct: timer.dur ? (timer.left / timer.dur) * 100 : 0, size: 92, stroke: 8, glow: timer.running, color: timer.left === 0 ? "var(--gold)" : "var(--green)" },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 21, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" } },
                    pad(Math.floor(timer.left / 60)),
                    ":",
                    pad(timer.left % 60))),
            React.createElement("div", { style: { flex: 1 } },
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 8 } }, timer.label),
                React.createElement("div", { style: { display: "flex", gap: 7, marginBottom: 9 } },
                    React.createElement("button", { onClick: () => setTimer((t) => ({ ...t, running: !t.running, left: t.left === 0 ? t.dur : t.left })), style: timerBtn(true) }, timer.running ? React.createElement(Pause, { size: 16 }) : React.createElement(Play, { size: 16 })),
                    React.createElement("button", { onClick: () => adj(-15), style: timerBtn() },
                        React.createElement(Minus, { size: 15 })),
                    React.createElement("button", { onClick: () => adj(15), style: timerBtn() },
                        React.createElement(Plus, { size: 15 })),
                    React.createElement("button", { onClick: () => setTimer((t) => ({ ...t, left: t.dur, running: false })), style: timerBtn() },
                        React.createElement(RotateCcw, { size: 14 }))),
                React.createElement("div", { style: { display: "flex", gap: 5, flexWrap: "wrap" } }, presets.map((p) => (React.createElement("button", { key: p, onClick: () => startTimer(p, "Regeneracja"), style: {
                        padding: "4px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                        border: "1px solid var(--line2)", background: timer.dur === p ? "var(--green)" : "var(--surface2)",
                        color: timer.dur === p ? "#04130a" : "var(--muted)",
                    } }, p < 60 ? `${p}s` : `${p / 60}min`)))))),
        groups.map((g) => (React.createElement("div", { key: g },
            React.createElement("div", { style: sectionTitle }, g),
            React.createElement("div", { style: { display: "flex", gap: 8, overflowX: "auto", margin: "0 -16px", padding: "0 16px 4px" }, className: "noscroll" }, WORKOUTS.filter((w) => w.group === g).map((w) => (React.createElement("button", { key: w.id, onClick: () => setSelId(w.id), style: {
                    padding: "11px 14px", borderRadius: 14, cursor: "pointer", textAlign: "left", minWidth: 150, flexShrink: 0,
                    border: selId === w.id ? "1.5px solid var(--gold)" : "1px solid var(--line2)",
                    background: selId === w.id ? "rgba(245,181,61,.12)" : "var(--surface)",
                } },
                React.createElement("div", { style: { fontSize: 13.5, fontWeight: 700, color: selId === w.id ? "var(--gold2)" : "var(--text)" } }, (w.short || w.name) + (w.id === nextPPL(daily) ? " ▶" : "")),
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 2 } },
                    w.ex.length,
                    " \u0107wicze\u0144")))))))),
        React.createElement(Card, { style: { marginTop: 16, marginBottom: 4 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, workout.name),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 16, color: pct === 100 ? "var(--gold2)" : "var(--green2)" } },
                    pct,
                    "%")),
            React.createElement(Bar, { pct: pct, color: pct === 100 ? "var(--gold)" : "var(--green)" }),
            React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 7 } },
                doneSets,
                "/",
                totalSets,
                " serii")),
        React.createElement("button", { onClick: () => { setLiveOpen(true); buzz(10); }, style: { width: "100%", marginTop: 12, padding: "14px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 800, background: "linear-gradient(135deg, var(--gold), #e0892a)", color: "#1a1200" } }, "\u25B6 Trenuj na \u017Cywo"),
        React.createElement("div", { style: { marginTop: 12 } }, workout.ex.map((ex) => {
            const arr = sets[ex.id] || Array(ex.s).fill(false);
            const exDone = arr.filter(Boolean).length;
            return (React.createElement(Card, { key: ex.id, style: { marginBottom: 10 }, pad: 14 },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 11 } },
                    React.createElement("div", { style: { flex: 1, paddingRight: 8 } },
                        React.createElement("div", { style: { fontSize: 14.5, fontWeight: 700 } }, React.createElement(ExTag, { tag: ex.tag }), ex.n),
                        React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2 } },
                            ex.s,
                            " \u00D7 ",
                            ex.r,
                            "")),
                    React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: exDone === ex.s ? "var(--green2)" : "var(--faint)", whiteSpace: "nowrap" } },
                        exDone,
                        "/",
                        ex.s)),
                React.createElement(RestEditor, { ex: ex }), React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, arr.map((on, i) => (React.createElement("button", { key: i, onClick: () => toggleSet(ex, i), style: {
                        width: 42, height: 42, borderRadius: 12, cursor: "pointer", fontFamily: "var(--display)", fontWeight: 800, fontSize: 15,
                        border: on ? "none" : "1.5px solid var(--line2)",
                        background: on ? "linear-gradient(135deg, var(--green2), var(--green))" : "var(--surface2)",
                        color: on ? "#04130a" : "var(--muted)", transition: "all .15s",
                        boxShadow: on ? "0 4px 12px -5px var(--green-glow)" : "none",
                    } }, on ? React.createElement(Check, { size: 18, strokeWidth: 3, style: { display: "block", margin: "0 auto" } }) : i + 1)))), ex.mode !== "c" && React.createElement(SetLogger, { ex: ex, day: day, setDay: setDay, daily: daily, startTimer: startTimer })));
        })),
        React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 4 } },
            React.createElement("button", { onClick: resetWorkout, style: { ...timerBtn(), width: "auto", flex: "0 0 auto", padding: "0 18px", height: 50, borderRadius: 14 } },
                React.createElement(RotateCcw, { size: 16 })),
            React.createElement("button", { onClick: finishWorkout, style: { ...btnPrimary, marginTop: 0, flex: 1, background: (day.workoutDone && day.workoutId === selId) ? "var(--surface2)" : "linear-gradient(135deg, var(--gold), #e0892a)", color: (day.workoutDone && day.workoutId === selId) ? "var(--green2)" : "#1a1200" } }, (day.workoutDone && day.workoutId === selId) ? "✓ Trening zaliczony" : "Zakończ trening")),
        React.createElement(Progression, { daily: daily, prs: prs }),
        React.createElement(PRTracker, { prs: prs, setPrs: setPrs }),
        liveOpen && React.createElement(LiveWorkout, { workout: workout, day: day, setDay: setDay, selId: selId, startTimer: startTimer, timer: timer, setTimer: setTimer, daily: daily, finishWorkout: finishWorkout, onClose: () => setLiveOpen(false) })));
}
const timerBtn = (primary) => ({
    width: 44, height: 38, borderRadius: 11, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0,
    border: primary ? "none" : "1px solid var(--line2)", background: primary ? "var(--green)" : "var(--surface2)",
    color: primary ? "#04130a" : "var(--text)",
});
/* ───────────────────────── HABITS + SUPPLEMENTS ───────────────────────── */
function Habits({ habits, setHabits, supps, setSupps, day, toggleHabit, toggleSupp }) {
    const [seg, setSeg] = useState("habits");
    const [addOpen, setAddOpen] = useState(false);
    const [nName, setNName] = useState("");
    const [nHint, setNHint] = useState("");
    const [nDose, setNDose] = useState("");
    const [nWhen, setNWhen] = useState("Rano");
    const [editMode, setEditMode] = useState(false);
    const [nTime, setNTime] = useState("");
    const [nPeriod, setNPeriod] = useState("Rano");
    const PERIODS = ["Rano", "Południe", "Popołudnie", "Wieczór", "Noc", "Cały dzień"];
    const addHabit = () => { if (!nName.trim())
        return; setHabits((p) => [...p, { id: uid(), name: nName.trim(), hint: nHint.trim(), core: true, icon: "target", time: nTime, period: nPeriod }]); setNName(""); setNHint(""); setNTime(""); setAddOpen(false); };
    const addSupp = () => { if (!nName.trim())
        return; setSupps((p) => [...p, { id: uid(), name: nName.trim(), dose: nDose.trim(), when: nWhen }]); setNName(""); setNDose(""); setAddOpen(false); };
    const delHabit = (id) => setHabits((p) => p.filter((h) => h.id !== id));
    const delSupp = (id) => setSupps((p) => p.filter((s) => s.id !== id));
    const hDone = habits.filter((h) => day.habits[h.id]).length;
    const sDone = supps.filter((s) => day.supps[s.id]).length;
    const whenGroups = ["Rano", "Po treningu", "Wieczór"];
    const whenIcon = { "Rano": Coffee, "Po treningu": Dumbbell, "Wieczór": Moon };
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26, display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
            React.createElement("div", null,
                React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Nawyki"),
                React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, seg === "habits" ? `${hDone}/${habits.length} dzisiaj` : `${sDone}/${supps.length} dzisiaj`)),
            React.createElement("button", { onClick: () => setEditMode(!editMode), style: { ...iconBtn, width: "auto", padding: "0 14px", fontSize: 13, fontWeight: 700, color: editMode ? "var(--green2)" : "var(--muted)" } },
                React.createElement(Pencil, { size: 14, style: { marginRight: 5 } }),
                editMode ? "Gotowe" : "Edytuj")),
        React.createElement("div", { style: { display: "flex", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 4, marginTop: 16 } }, [["habits", "Nawyki", Check], ["supps", "Suplementy", Pill]].map(([id, lbl, Ic]) => (React.createElement("button", { key: id, onClick: () => setSeg(id), style: {
                flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700, border: "none",
                background: seg === id ? "var(--surface2)" : "transparent", color: seg === id ? "var(--green2)" : "var(--muted)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all .15s",
            } },
            React.createElement(Ic, { size: 16 }),
            lbl)))),
        seg === "habits" ? (React.createElement("div", { style: { marginTop: 16 } }, habits.map((h) => {
            const on = !!day.habits[h.id];
            const Ic = ICONS[h.icon] || Check;
            return (React.createElement("div", { key: h.id, style: { display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 15, padding: "13px 14px", marginBottom: 9 } },
                !editMode && React.createElement("div", { onClick: () => toggleHabit(h.id), style: { cursor: "pointer" } },
                    React.createElement(CheckBox, { on: on })),
                React.createElement("div", { style: { width: 36, height: 36, borderRadius: 10, background: on ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.05)", display: "grid", placeItems: "center", flexShrink: 0 } },
                    React.createElement(Ic, { size: 18, color: on ? "var(--green2)" : "var(--faint)" })),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                    React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600 } }, h.name),
                    React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", display: "flex", gap: 8, flexWrap: "wrap" } },
                        h.hint && React.createElement("span", null, h.hint),
                        (h.time || h.period) && React.createElement("span", { style: { color: "var(--gold)", fontWeight: 600 } },
                            h.period && `${h.period}`,
                            h.time && ` · ${h.time}`))),
                editMode && React.createElement("button", { onClick: () => delHabit(h.id), style: { ...iconBtn, width: 36, height: 36, border: "none", background: "rgba(239,68,68,.1)", color: "var(--red)" } },
                    React.createElement(Trash2, { size: 16 }))));
        }))) : (React.createElement("div", { style: { marginTop: 8 } },
            React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", margin: "10px 4px 4px", lineHeight: 1.5 } }, "To Twoja w\u0142asna lista z planu \u2014 narz\u0119dzie do odhaczania, nie porada medyczna. Trzymaj si\u0119 zasad cyklowania ze swojego arkusza."),
            whenGroups.map((w) => {
                const list = supps.filter((s) => s.when === w);
                if (!list.length)
                    return null;
                const Ic = whenIcon[w];
                return (React.createElement("div", { key: w },
                    React.createElement("div", { style: { ...sectionTitle, display: "flex", alignItems: "center", gap: 7 } },
                        React.createElement(Ic, { size: 13 }),
                        " ",
                        w),
                    list.map((s) => {
                        const on = !!day.supps[s.id];
                        return (React.createElement("div", { key: s.id, style: { display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 15, padding: "13px 14px", marginBottom: 9 } },
                            !editMode && React.createElement("div", { onClick: () => toggleSupp(s.id), style: { cursor: "pointer" } },
                                React.createElement(CheckBox, { on: on })),
                            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                                React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600, color: on ? "var(--muted)" : "var(--text)", textDecoration: on ? "line-through" : "none" } }, s.name),
                                React.createElement("div", { style: { fontSize: 12, color: "var(--gold2)", fontWeight: 600 } }, s.dose)),
                            editMode && React.createElement("button", { onClick: () => delSupp(s.id), style: { ...iconBtn, width: 36, height: 36, border: "none", background: "rgba(239,68,68,.1)", color: "var(--red)" } },
                                React.createElement(Trash2, { size: 16 }))));
                    })));
            }))),
        React.createElement("button", { onClick: () => { setNName(""); setNHint(""); setNDose(""); setAddOpen(true); }, style: fab },
            React.createElement(Plus, { size: 26, color: "#04130a", strokeWidth: 3 })),
        React.createElement(Sheet, { open: addOpen, onClose: () => setAddOpen(false), title: seg === "habits" ? "Nowy nawyk" : "Nowy suplement" },
            React.createElement("label", { style: label }, "Nazwa"),
            React.createElement("input", { style: inputStyle, value: nName, autoFocus: true, onChange: (e) => setNName(e.target.value), placeholder: seg === "habits" ? "np. Medytacja 5 min" : "np. Witamina C" }),
            seg === "habits" ? (React.createElement(React.Fragment, null,
                React.createElement("label", { style: label }, "Opis (opcjonalnie)"),
                React.createElement("input", { style: inputStyle, value: nHint, onChange: (e) => setNHint(e.target.value), placeholder: "np. rano, przed kaw\u0105" }),
                React.createElement("label", { style: label }, "Pora dnia"),
                React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 } }, PERIODS.map((p) => (React.createElement("button", { key: p, onClick: () => setNPeriod(p), style: { padding: "7px 11px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: nPeriod === p ? "1.5px solid var(--green)" : "1px solid var(--line2)", background: nPeriod === p ? "rgba(34,197,94,.12)" : "var(--surface2)", color: nPeriod === p ? "var(--green2)" : "var(--muted)" } }, p)))),
                React.createElement("label", { style: label }, "Godzina (opcjonalnie)"),
                React.createElement("input", { type: "time", style: inputStyle, value: nTime, onChange: (e) => setNTime(e.target.value) }),
                React.createElement("button", { style: btnPrimary, onClick: addHabit }, "Dodaj nawyk"))) : (React.createElement(React.Fragment, null,
                React.createElement("label", { style: label }, "Dawka"),
                React.createElement("input", { style: inputStyle, value: nDose, onChange: (e) => setNDose(e.target.value), placeholder: "np. 1000 mg" }),
                React.createElement("label", { style: label }, "Pora"),
                React.createElement("div", { style: { display: "flex", gap: 8 } }, whenGroups.map((w) => React.createElement(Chip, { key: w, on: nWhen === w, onClick: () => setNWhen(w), label: w, color: "var(--gold2)" }))),
                React.createElement("button", { style: btnPrimary, onClick: addSupp }, "Dodaj suplement"))))));
}
/* ───────────────────────── FINANCE ───────────────────────── */
const salaryPostFor = (f, now) => {
  const s = f.salary;
  if (!s || !(num(s.amount) > 0)) return null;
  const d = now || /* @__PURE__ */ new Date();
  const day = Math.min(28, Math.max(1, num(s.day) || 25));
  if (d.getDate() < day) return null;
  const m = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (s.from && m < s.from) return null;
  const id = "sal_" + m;
  if ((f.tx || []).some((t) => t.id === id) || (s.skip || []).includes(m)) return null;
  return { id, type: "income", amount: num(s.amount), note: s.note || "Wyp\u0142ata (Mauser)", date: `${m}-${pad(day)}`, cat: null, inc: s.inc || ((f.income || [])[0] || {}).id || null, src: "salary" };
};
function SalaryCard({ finance, setFinance }) {
  const s = finance.salary || {};
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(s.amount != null ? String(s.amount) : "");
  const [day, setDay] = useState(String(s.day || 25));
  const [inc, setInc] = useState(s.inc || ((finance.income || [])[0] || {}).id || "");
  const now = /* @__PURE__ */ new Date();
  const d = Math.min(28, Math.max(1, num(s.day) || 25));
  const m = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const posted = (finance.tx || []).find((t) => t.id === "sal_" + m);
  const next = now.getDate() < d ? new Date(now.getFullYear(), now.getMonth(), d) : new Date(now.getFullYear(), now.getMonth() + 1, d);
  const days = Math.ceil((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  const has = num(s.amount) > 0;
  const saveS = () => {
    const a = num(amt);
    setFinance((f) => {
      const sal = { ...f.salary || {}, amount: a || 0, day: Math.min(28, Math.max(1, num(day) || 25)), inc, note: "Wyp\u0142ata (Mauser)", from: (f.salary || {}).from || m };
      let nf = { ...f, salary: sal };
      const t = salaryPostFor(nf);
      if (t) nf = { ...nf, tx: [t, ...nf.tx || []] };
      return nf;
    });
    setOpen(false);
    buzz(10);
  };
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 16, background: "rgba(245,181,61,.07)", border: "1px solid rgba(245,181,61,.25)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 40, height: 40, borderRadius: 11, background: "rgba(245,181,61,.15)", display: "grid", placeItems: "center", flexShrink: 0, fontSize: 19 } }, "\u{1F4B6}"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 700, color: "var(--gold)" } }, "Wyp\u0142ata ", d, ". dnia miesi\u0105ca"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 1 } }, !has ? "Ustaw kwot\u0119 netto \u2014 wpisze si\u0119 sama co miesi\u0105c" : posted ? `\u2713 zaksi\u0119gowana ${posted.date} \xB7 nast\u0119pna za ${days} dni` : `wpisze si\u0119 sama za ${days} ${days === 1 ? "dzie\u0144" : "dni"}`)), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, color: "var(--gold2)" } }, has ? "\u20AC" + Math.round(num(s.amount)) : "\u2014"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--muted)" } }, "netto"))), /* @__PURE__ */ React.createElement("button", { onClick: () => setOpen(true), style: { width: "100%", marginTop: 11, padding: "9px", borderRadius: 10, border: "1px solid rgba(245,181,61,.3)", background: "transparent", color: "var(--gold)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" } }, has ? "Zmie\u0144 kwot\u0119 / dzie\u0144" : "Ustaw wyp\u0142at\u0119"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 8, lineHeight: 1.45 } }, "Nadgodziny, premie i inne nadwy\u017Cki dopisujesz r\u0119cznie jako przych\xF3d.")), /* @__PURE__ */ React.createElement(Sheet, { open, onClose: () => setOpen(false), title: "Miesi\u0119czna wyp\u0142ata" }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 } }, "Kwota netto na konto (\u20AC)"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", value: amt, onChange: (e) => setAmt(e.target.value), placeholder: String(Math.round(finance.capital || 0)), style: { ...inputStyle, fontFamily: "var(--display)", fontWeight: 700, fontSize: 18 } }), /* @__PURE__ */ React.createElement("label", { style: { fontSize: 12, color: "var(--muted)", display: "block", margin: "12px 0 6px" } }, "Dzie\u0144 wyp\u0142aty"), /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", value: day, onChange: (e) => setDay(e.target.value), style: inputStyle }), (finance.income || []).length > 1 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 12, color: "var(--muted)", display: "block", margin: "12px 0 6px" } }, "\u0179r\xF3d\u0142o przychodu"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, (finance.income || []).map((c) => /* @__PURE__ */ React.createElement("button", { key: c.id, onClick: () => setInc(c.id), style: { padding: "8px 11px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, border: inc === c.id ? "1.5px solid var(--gold)" : "1px solid var(--line2)", background: inc === c.id ? "rgba(245,181,61,.12)" : "var(--surface)", color: inc === c.id ? "var(--gold2)" : "var(--text)" } }, c.name)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 } }, "Co miesi\u0105c, od tego dnia, aplikacja sama dopisze przych\xF3d \u201EWyp\u0142ata (Mauser)\u201D. Je\u015Bli dzi\u015B jest ju\u017C po dniu wyp\u0142aty, wpisze j\u0105 od razu za ten miesi\u0105c. Usuni\u0119ta r\u0119cznie wyp\u0142ata nie wr\xF3ci w tym miesi\u0105cu."), /* @__PURE__ */ React.createElement("button", { onClick: saveS, style: btnPrimary }, "Zapisz")));
}

function Money({ finance, setFinance, events, setTab }) {
    const [addOpen, setAddOpen] = useState(false);
    const [type, setType] = useState("expense");
    const [amount, setAmount] = useState("");
    const [cat, setCat] = useState(finance.cats[0]?.id);
    const [inc, setInc] = useState(finance.income?.[0]?.id);
    const [note, setNote] = useState("");
    const [editOpen, setEditOpen] = useState(false);
    const [dCapital, setDCapital] = useState(finance.capital || 0);
    const [dGoal, setDGoal] = useState(finance.d2dGoal || 0);
    const [dCats, setDCats] = useState([]);
    const [dInc, setDInc] = useState([]);
    const [vaultOpen, setVaultOpen] = useState(false);
    const [vaultIn, setVaultIn] = useState("");
    const [dVaultGoal, setDVaultGoal] = useState(finance.vaultGoal || 0);
    const [goalOpen, setGoalOpen] = useState(false);
    const [gId, setGId] = useState(null);
    const [gName, setGName] = useState("");
    const [gTarget, setGTarget] = useState("");
    const [gSaved, setGSaved] = useState("");
    const [fixOpen, setFixOpen] = useState(false);
    const [fName, setFName] = useState("");
    const [fAmt, setFAmt] = useState("");
    const [pjMonthly, setPjMonthly] = useState(200);
    const [pjYears, setPjYears] = useState(10);
    const [pjRate, setPjRate] = useState(7);
    const [pjStart, setPjStart] = useState(0);
    const month = monthKey();
    const txM = finance.tx.filter((t) => (t.date || "").slice(0, 7) === month);
    const spentOf = (cid) => txM.filter((t) => t.type === "expense" && t.cat === cid).reduce((a, b) => a + b.amount, 0);
    const totalSpent = txM.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0);
    const cap = finance.capital || 0;
    const limitOf = (c) => Math.round(cap * (c.pct || 0) / 100);
    const totalLimit = finance.cats.reduce((a, c) => a + limitOf(c), 0);
    const allocPct = finance.cats.reduce((a, c) => a + (c.pct || 0), 0);
    const income = txM.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0);
    const d2dIncome = txM.filter((t) => t.type === "income" && t.inc === "i_d2d").reduce((a, b) => a + b.amount, 0);
    const net = income - totalSpent;
    const budgetPct = totalLimit ? (totalSpent / totalLimit) * 100 : 0;
    const d2dPct = finance.d2dGoal ? (d2dIncome / finance.d2dGoal) * 100 : 0;
    const roundTo = finance.roundTo || 1;
    const roundUpOf = (v) => { const up = Math.ceil(v / roundTo) * roundTo; const d = +(up - v).toFixed(2); return d <= 0 ? 0 : d; };
    const vault = finance.vault || 0;
    const vaultGoal = finance.vaultGoal || 0;
    const vaultPct = vaultGoal ? (vault / vaultGoal) * 100 : 0;
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
    const breakdown = finance.cats.map((c) => ({ ...c, sp: spentOf(c.id) })).filter((c) => c.sp > 0).sort((a, b) => b.sp - a.sp);
    const tip = SAVING_TIPS[dayOfYear() % SAVING_TIPS.length];
    const liveRound = (type === "expense" && finance.roundUp && parseFloat(amount) > 0) ? roundUpOf(parseFloat(amount)) : 0;
    const monthName = PL_MON[new Date().getMonth()];
    // ── Auto-kalkulator wypłaty (praca zmianowa 2+2+2, 106 EUR/dzień) ────────
    const RATE = 106;
    const [salOpen, setSalOpen] = useState(false);
    const extraDays = finance.salDays || 0;
    const extraWho = finance.salWho || "oboje"; // "oboje"|"ja"|"ona"
    const fuel = finance.salFuel != null ? finance.salFuel : ""; // paliwo zwracane przez agencję (€)
    const setExtraDays = (v) => setFinance((f) => ({ ...f, salDays: typeof v === "function" ? v(f.salDays || 0) : v }));
    const setExtraWho = (v) => setFinance((f) => ({ ...f, salWho: v }));
    const setFuel = (v) => setFinance((f) => ({ ...f, salFuel: v }));
    const incM = txM.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
    const expM = txM.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
    const netM = incM - expM;
    const saveRate = incM > 0 ? Math.round((netM / incM) * 100) : null;
    const _bn = {};
    txM.filter((t) => t.type === "expense").forEach((t) => { _bn[t.note || "Inne"] = (_bn[t.note || "Inne"] || 0) + t.amount; });
    const topSpend = Object.keys(_bn).map((n) => [n, _bn[n]]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    // Trend 6 miesięcy (z transakcji)
    const trend6 = (() => {
        const arr = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mk = d.getFullYear() + "-" + pad(d.getMonth() + 1);
            const mt = finance.tx.filter((t) => (t.date || "").slice(0, 7) === mk);
            const ic = mt.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0);
            const ex = mt.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0);
            arr.push({ label: PL_MON[d.getMonth()].slice(0, 3), ic, ex, net: ic - ex });
        }
        return arr;
    })();
    const trendMax = Math.max(1, ...trend6.map((m) => Math.max(m.ic, m.ex)));
    const avgNet = Math.round(trend6.reduce((a, m) => a + m.net, 0) / 6);
    // Cele oszczędnościowe
    const goals = finance.goals || [];
    const monSave = netM > 0 ? netM : (avgNet > 0 ? avgNet : 0);
    const saveGoal = () => {
        const t = parseFloat(gTarget) || 0;
        if (!gName.trim() || t <= 0)
            return;
        const s = parseFloat(gSaved) || 0;
        setFinance((f) => {
            const list = f.goals || [];
            if (gId)
                return { ...f, goals: list.map((x) => x.id === gId ? { ...x, name: gName.trim(), target: t, saved: s } : x) };
            return { ...f, goals: [...list, { id: uid(), name: gName.trim(), target: t, saved: s }] };
        });
        setGoalOpen(false);
        buzz(10);
    };
    const delGoal = (id) => setFinance((f) => ({ ...f, goals: (f.goals || []).filter((x) => x.id !== id) }));
    const openGoal = (g) => { if (g) {
        setGId(g.id);
        setGName(g.name);
        setGTarget(String(g.target));
        setGSaved(String(g.saved || 0));
    }
    else {
        setGId(null);
        setGName("");
        setGTarget("");
        setGSaved("");
    } setGoalOpen(true); };
    // Stałe wydatki / runway
    const fixed = finance.fixed || [];
    const burn = fixed.reduce((a, x) => a + (x.amount || 0), 0);
    const runway = burn > 0 ? cap / burn : 0;
    const emFund = burn > 0 ? vault / burn : 0;
    const saveFixed = () => { const a = parseFloat(fAmt) || 0; if (!fName.trim() || a <= 0)
        return; setFinance((f) => ({ ...f, fixed: [...(f.fixed || []), { id: uid(), name: fName.trim(), amount: a }] })); setFName(""); setFAmt(""); buzz(8); };
    const delFixed = (id) => setFinance((f) => ({ ...f, fixed: (f.fixed || []).filter((x) => x.id !== id) }));
    // Procent składany
    const pjN = (parseFloat(pjYears) || 0) * 12;
    const pjR = (parseFloat(pjRate) || 0) / 100 / 12;
    const pjM = parseFloat(pjMonthly) || 0;
    const pjS = parseFloat(pjStart) || 0;
    const pjFV = pjR > 0 ? pjS * Math.pow(1 + pjR, pjN) + pjM * ((Math.pow(1 + pjR, pjN) - 1) / pjR) : pjS + pjM * pjN;
    const pjIn = pjS + pjM * pjN;
    const pjGain = pjFV - pjIn;
    // Poprzedni i następny czwartek (dzień wypłaty)
    const getThursday = (offsetWeeks) => {
        const d = new Date();
        const dow = d.getDay();
        const daysToThur = (4 - dow + 7) % 7 || 7;
        const t = new Date(d);
        t.setDate(d.getDate() - (7 - daysToThur) + offsetWeeks * 7);
        return t;
    };
    const lastThurDate = (() => { const d = new Date(); const dow = d.getDay(); const back = (dow - 4 + 7) % 7 || 7; const t = new Date(d); t.setDate(d.getDate() - back); return t.toISOString().slice(0, 10); })();
    const nextThurDate = (() => { const d = new Date(); const dow = d.getDay(); const fwd = (4 - dow + 7) % 7 || 7; const t = new Date(d); t.setDate(d.getDate() + fwd); return t.toISOString().slice(0, 10); })();
    const nextThurLabel = (() => { const d = new Date(nextThurDate + "T12:00:00"); return d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" }); })();
    const isWorkShift = (title) => title && (title.includes("Ranka") || title.includes("Popołudnie") || title.includes("Nocka"));
    const autoWorkDays = (events || []).filter(e => e.date > lastThurDate && e.date <= nextThurDate && isWorkShift(e.title)).length;
    const fuelAmt = parseFloat(fuel) || 0;
    const extraAdd = extraDays * RATE * (extraWho === "oboje" ? 2 : 1);
    const baseEach = autoWorkDays * RATE;
    const totalBoth = baseEach * 2 + extraAdd + fuelAmt;
    const myTotal = baseEach + (extraWho === "oboje" ? extraDays * RATE : extraWho === "ja" ? extraDays * RATE : 0) + fuelAmt / 2;
    const herTotal = baseEach + (extraWho === "oboje" ? extraDays * RATE : extraWho === "ona" ? extraDays * RATE : 0) + fuelAmt / 2;
    const catName = (id) => finance.cats.find((c) => c.id === id)?.name || "—";
    const catColor = (id) => finance.cats.find((c) => c.id === id)?.color || "var(--faint)";
    const incName = (id) => finance.income?.find((c) => c.id === id)?.name || "Przychód";
    const add = () => {
        const v = parseFloat(amount);
        if (isNaN(v) || v <= 0)
            return;
        const t = { id: uid(), type, amount: v, note: note.trim(), date: todayKey(), cat: type === "expense" ? cat : null, inc: type === "income" ? inc : null };
        const ru = (type === "expense" && finance.roundUp) ? roundUpOf(v) : 0;
        setFinance((p) => ({ ...p, tx: [t, ...p.tx], vault: (p.vault || 0) + ru, vaultRoundup: (p.vaultRoundup || 0) + ru }));
        buzz(8);
        setAmount("");
        setNote("");
        setAddOpen(false);
    };
    const delTx = (id) => setFinance((p) => ({ ...p, tx: p.tx.filter((t) => t.id !== id), salary: String(id).indexOf("sal_") === 0 && p.salary ? { ...p.salary, skip: [...(p.salary.skip || []), id.slice(4)] } : p.salary }));
    const addToVault = () => { const v = parseFloat(vaultIn); if (isNaN(v) || v <= 0)
        return; setFinance((p) => ({ ...p, vault: (p.vault || 0) + v })); setVaultIn(""); setVaultOpen(false); buzz(8); };
    const toggleRoundUp = () => { setFinance((p) => ({ ...p, roundUp: !p.roundUp })); buzz(6); };
    const setRoundTo = (n) => setFinance((p) => ({ ...p, roundTo: n }));
    const openEdit = () => {
        setDCapital(finance.capital || 0);
        setDGoal(finance.d2dGoal || 0);
        setDVaultGoal(finance.vaultGoal || 0);
        setDCats(finance.cats.map((c) => ({ ...c })));
        setDInc((finance.income || []).map((c) => ({ ...c })));
        setEditOpen(true);
    };
    const saveEdit = () => {
        const cats = dCats.filter((c) => (c.name || "").trim()).map((c) => ({ id: c.id, name: c.name.trim(), pct: Math.max(0, parseFloat(c.pct) || 0), color: c.color }));
        const incs = dInc.filter((c) => (c.name || "").trim()).map((c) => ({ id: c.id, name: c.name.trim() }));
        setFinance((p) => ({ ...p, capital: Math.max(0, parseFloat(dCapital) || 0), d2dGoal: Math.max(0, parseFloat(dGoal) || 0), vaultGoal: Math.max(0, parseFloat(dVaultGoal) || 0), cats, income: incs.length ? incs : p.income }));
        setEditOpen(false);
        buzz(8);
    };
    const dCap = parseFloat(dCapital) || 0;
    const dAllocPct = dCats.reduce((a, c) => a + (parseFloat(c.pct) || 0), 0);
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26, display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
            React.createElement("div", null,
                React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Finanse"),
                React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2, textTransform: "capitalize" } },
                    monthName,
                    " ",
                    new Date().getFullYear())),
            React.createElement("button", { onClick: openEdit, style: { ...iconBtn, width: "auto", padding: "0 14px", fontSize: 13, fontWeight: 700, color: "var(--green2)" } },
                React.createElement(Pencil, { size: 14, style: { marginRight: 5 } }),
                "Edytuj")),
        React.createElement(Card, { style: { marginTop: 16 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Bilans miesi\u0105ca"),
                saveRate != null && React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: saveRate >= 20 ? "var(--green2)" : saveRate >= 0 ? "var(--gold2)" : "var(--red)" } },
                    saveRate,
                    "% od\u0142o\u017Cone")),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 } }, [["Przychód", incM, "var(--green2)"], ["Wydatki", expM, "var(--red)"], ["Zostało", netM, netM >= 0 ? "var(--gold2)" : "var(--red)"]].map((r) => (React.createElement("div", { key: r[0], style: { background: "var(--surface2)", borderRadius: 12, padding: "11px 8px", textAlign: "center" } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 15.5, color: r[2] } }, eur(r[1])),
                React.createElement("div", { style: { fontSize: 10.5, color: "var(--muted)", marginTop: 2 } }, r[0]))))),
            topSpend.length > 0 && (React.createElement("div", { style: { marginTop: 14 } },
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginBottom: 8 } }, "Gdzie id\u0105 pieni\u0105dze (ten miesi\u0105c)"),
                topSpend.map((r) => (React.createElement("div", { key: r[0], style: { marginBottom: 8 } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 } },
                        React.createElement("span", { style: { color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "68%" } }, r[0]),
                        React.createElement("span", { style: { color: "var(--muted)", fontWeight: 600 } }, eur(r[1]))),
                    React.createElement(Bar, { pct: expM > 0 ? (r[1] / expM) * 100 : 0, color: "var(--gold)", h: 5 }))))))),
        React.createElement("button", { onClick: () => { buzz(8); setTab("ai"); }, style: { width: "100%", marginTop: 12, background: "linear-gradient(135deg, rgba(245,181,61,.16), rgba(35,198,111,.12))", border: "1px solid var(--line2)", borderRadius: 16, padding: 15, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 13 } },
            React.createElement("span", { style: { fontSize: 26 } }, "\uD83D\uDCB0"),
            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Doradca finansowy AI"),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 1 } }, "Druga G\u0142owa zna Tw\u00F3j bud\u017Cet \u2014 pytaj o oszcz\u0119dzanie i inwestycje.")),
            React.createElement("span", { style: { color: "var(--faint)", fontSize: 18 } }, "\u2192")),
        React.createElement(SalaryCard, { finance, setFinance }),
        React.createElement(Sheet, { open: salOpen, onClose: () => setSalOpen(false), title: "Kalkulator wyp\u0142aty" },
            React.createElement(Card, { style: { background: "rgba(245,181,61,.07)", border: "1px solid rgba(245,181,61,.2)" } },
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 6 } },
                    "Automatch z grafiku (",
                    lastThurDate,
                    " \u2192 ",
                    nextThurDate,
                    "):"),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: "var(--gold2)" } },
                    autoWorkDays,
                    " dni \u00D7 \u20AC",
                    RATE,
                    " \u00D7 2 = ",
                    React.createElement("span", { style: { color: "var(--gold)" } },
                        "\u20AC",
                        autoWorkDays * RATE * 2))),
            React.createElement("label", { style: label }, "Extra dni (tylko Ty, tylko Ona lub oboje)"),
            React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 } },
                React.createElement("button", { onClick: () => setExtraDays((d) => Math.max(0, d - 1)), style: iconBtn }, "\u2013"),
                React.createElement("div", { style: { flex: 1, textAlign: "center", fontFamily: "var(--display)", fontWeight: 800, fontSize: 30 } }, extraDays),
                React.createElement("button", { onClick: () => setExtraDays((d) => d + 1), style: iconBtn }, "+")),
            React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 4 } }, ["oboje", "ja", "ona"].map((k) => (React.createElement("button", { key: k, onClick: () => setExtraWho(k), style: { flex: 1, padding: "10px", borderRadius: 11, cursor: "pointer", fontWeight: 700, fontSize: 13, border: extraWho === k ? "1.5px solid var(--gold)" : "1px solid var(--line2)", background: extraWho === k ? "rgba(245,181,61,.15)" : "var(--surface2)", color: extraWho === k ? "var(--gold2)" : "var(--muted)" } }, k.charAt(0).toUpperCase() + k.slice(1))))),
            React.createElement("label", { style: label }, "Zwrot paliwa od agencji (\u20AC)"),
            React.createElement("input", { type: "number", inputMode: "decimal", value: fuel, onChange: (e) => setFuel(e.target.value), placeholder: "0", style: { ...inputStyle, fontFamily: "var(--display)", fontWeight: 700, fontSize: 18 } }),
            React.createElement(Card, { style: { marginTop: 14, background: "rgba(245,181,61,.07)", border: "1px solid rgba(245,181,61,.2)" } },
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 10 } },
                    "Suma na ",
                    nextThurLabel,
                    ":"),
                [
                    ["Grafik (" + autoWorkDays + " dni × 2 os.)", "€" + autoWorkDays * RATE * 2],
                    ["Extra – " + (extraWho === "oboje" ? "oboje" : extraWho === "ja" ? "tylko Ty" : "tylko Ona"), "€" + extraDays * RATE * (extraWho === "oboje" ? 2 : 1)],
                    ["Paliwo (zwrot agencji)", "+€" + fuelAmt.toFixed(2)],
                ].map(([k, v]) => (React.createElement("div", { key: k, style: { display: "flex", justifyContent: "space-between", marginBottom: 7 } },
                    React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, k),
                    React.createElement("span", { style: { fontWeight: 700 } }, v)))),
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(245,181,61,.2)" } },
                    React.createElement("span", { style: { fontSize: 15, fontWeight: 700, color: "var(--gold)" } }, "RAZEM NA KONTO"),
                    React.createElement("span", { style: { fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: "var(--gold2)" } },
                        "\u20AC",
                        Math.round(totalBoth))),
                React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(245,181,61,.2)" } },
                    React.createElement("div", { style: { flex: 1, textAlign: "center" } },
                        React.createElement("div", { style: { fontWeight: 700, fontSize: 16 } },
                            "\u20AC",
                            Math.round(myTotal)),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "Ty")),
                    React.createElement("div", { style: { flex: 1, textAlign: "center" } },
                        React.createElement("div", { style: { fontWeight: 700, fontSize: 16 } },
                            "\u20AC",
                            Math.round(herTotal)),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "Ona")))),
            React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", textAlign: "center", marginTop: 10, lineHeight: 1.45 } }, "106 EUR netto / os. \u00B7 212 EUR razem / dzie\u0144 pracy \u00B7 wyp\u0142aty w czwartek")),
        React.createElement(Card, { style: { marginTop: 18, background: "linear-gradient(150deg, rgba(34,197,94,.08), rgba(13,15,21,0) 60%)", position: "relative" } },
            React.createElement("div", { style: { position: "absolute", top: 16, right: 16, display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 99, background: savingsRate >= 20 ? "rgba(34,197,94,.14)" : "var(--surface2)", border: `1px solid ${savingsRate >= 20 ? "rgba(34,197,94,.35)" : "var(--line2)"}` } },
                React.createElement(TrendingUp, { size: 12, color: savingsRate >= 20 ? "var(--green2)" : "var(--muted)" }),
                React.createElement("span", { style: { fontSize: 11.5, fontWeight: 700, color: savingsRate >= 20 ? "var(--green2)" : "var(--muted)" } },
                    "Oszcz\u0119dno\u015Bci ",
                    savingsRate,
                    "%")),
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", fontWeight: 600 } }, "Bilans miesi\u0105ca"),
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 38, letterSpacing: "-.04em", color: net >= 0 ? "var(--green2)" : "var(--red)", lineHeight: 1.1, marginTop: 2 } },
                net >= 0 ? "+" : "",
                eur(net)),
            React.createElement("div", { style: { display: "flex", gap: 16, marginTop: 14 } },
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, "Przych\u00F3d"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, color: "var(--green2)" } }, eur(income))),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, "Wydatki"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 17 } }, eur(totalSpent))),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, "Kapita\u0142"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, color: "var(--gold2)" } }, eur(cap))))),
        React.createElement(Card, { style: { marginTop: 12, background: "linear-gradient(150deg, rgba(245,181,61,.12), rgba(34,197,94,.05) 70%)", border: "1px solid rgba(245,181,61,.25)" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                    React.createElement("div", { style: { width: 38, height: 38, borderRadius: 11, background: "rgba(245,181,61,.18)", display: "grid", placeItems: "center" } },
                        React.createElement(PiggyBank, { size: 20, color: "var(--gold2)" })),
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Skarbonka"),
                        React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } },
                            "cel ",
                            eur(vaultGoal)))),
                React.createElement("div", { style: { textAlign: "right" } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, letterSpacing: "-.03em", color: "var(--gold2)" } }, eur(vault)),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--green2)", fontWeight: 600 } },
                        "z zaokr\u0105gle\u0144 ",
                        eur(finance.vaultRoundup || 0)))),
            React.createElement("div", { style: { margin: "12px 0 10px" } },
                React.createElement(Bar, { pct: vaultPct, color: "linear-gradient(90deg, var(--gold), var(--gold2))", h: 9 })),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement("button", { onClick: () => { setVaultIn(""); setVaultOpen(true); }, style: { flex: 1, padding: "11px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg, var(--gold), #e0892a)", color: "#1a1200", fontWeight: 800, fontFamily: "var(--display)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 } },
                    React.createElement(ArrowDownToLine, { size: 16 }),
                    " Dorzu\u0107 do skarbonki")),
            React.createElement("div", { onClick: toggleRoundUp, style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)", cursor: "pointer" } },
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600 } }, "Zbieraj ka\u017Cde euro"),
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)" } }, "Zaokr\u0105glaj wydatki w g\u00F3r\u0119 i odk\u0142adaj reszt\u0119")),
                React.createElement(Toggle, { on: !!finance.roundUp, onChange: toggleRoundUp })),
            finance.roundUp && (React.createElement("div", { style: { display: "flex", gap: 7, marginTop: 10 } },
                React.createElement("span", { style: { fontSize: 11.5, color: "var(--muted)", alignSelf: "center", marginRight: 2 } }, "Zaokr\u0105glaj do:"),
                [1, 2, 5].map((n) => (React.createElement("button", { key: n, onClick: (e) => { e.stopPropagation(); setRoundTo(n); }, style: { padding: "5px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: roundTo === n ? "1.5px solid var(--gold)" : "1px solid var(--line2)", background: roundTo === n ? "rgba(245,181,61,.15)" : "var(--surface2)", color: roundTo === n ? "var(--gold2)" : "var(--muted)" } },
                    "\u20AC",
                    n)))))),
        React.createElement(Card, { style: { marginTop: 12 }, onClick: openEdit },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Bud\u017Cet wykorzystany"),
                React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: budgetPct > 100 ? "var(--red)" : budgetPct > 80 ? "var(--amber)" : "var(--green2)" } },
                    Math.round(budgetPct),
                    "%")),
            React.createElement(Bar, { pct: budgetPct, color: budgetPct > 100 ? "var(--red)" : budgetPct > 80 ? "var(--amber)" : "var(--green)", h: 10 }),
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted)", marginTop: 7 } },
                React.createElement("span", null,
                    eur(totalSpent),
                    " wydane"),
                React.createElement("span", null,
                    "limit ",
                    eur(totalLimit),
                    " \u00B7 ",
                    allocPct,
                    "% kapita\u0142u"))),
        breakdown.length > 0 && (React.createElement(Card, { style: { marginTop: 12 } },
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, marginBottom: 12 } }, "Na co id\u0105 pieni\u0105dze"),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16 } },
                React.createElement(Donut, { data: breakdown.map((c) => ({ value: c.sp, color: c.color })), total: totalSpent }),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } }, breakdown.slice(0, 5).map((c) => (React.createElement("div", { key: c.id, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 7 } },
                    React.createElement("span", { style: { width: 9, height: 9, borderRadius: 99, background: c.color, flexShrink: 0 } }),
                    React.createElement("span", { style: { fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, c.name),
                    React.createElement("span", { style: { fontSize: 12.5, fontWeight: 700, color: "var(--muted)" } },
                        totalSpent ? Math.round(c.sp / totalSpent * 100) : 0,
                        "%")))))))),
        React.createElement(Card, { style: { marginTop: 12, border: "1px solid rgba(245,181,61,.2)" }, onClick: openEdit },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9, marginBottom: 10 } },
                React.createElement("div", { style: { width: 32, height: 32, borderRadius: 9, background: "rgba(245,181,61,.14)", display: "grid", placeItems: "center" } },
                    React.createElement(PiggyBank, { size: 17, color: "var(--gold2)" })),
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Cel: Biznes D2D"),
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } },
                        eur(d2dIncome),
                        " z ",
                        eur(finance.d2dGoal),
                        " / mies")),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--gold2)" } },
                    Math.round(d2dPct),
                    "%")),
            React.createElement(Bar, { pct: d2dPct, color: "linear-gradient(90deg, var(--gold), var(--gold2))", h: 9 })),
        React.createElement(Card, { style: { marginTop: 12, position: "relative", overflow: "hidden" } },
            React.createElement(Lightbulb, { size: 52, style: { position: "absolute", right: -4, top: -6, opacity: .06, color: "var(--gold2)" } }),
            React.createElement("div", { style: { fontSize: 11.5, color: "var(--gold2)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 8 } }, "Wskaz\u00F3wka od najbogatszych"),
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15.5, lineHeight: 1.4, letterSpacing: "-.01em" } },
                "\u201E",
                tip.t,
                "\""),
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginTop: 8, fontWeight: 600 } },
                "\u2014 ",
                tip.a)),
        React.createElement("div", { style: sectionTitle }, "Trend 6 miesi\u0119cy"),
        React.createElement(Card, null,
            React.createElement("div", { style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 6, height: 110 } }, trend6.map((m, i) => (React.createElement("div", { key: i, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } },
                React.createElement("div", { style: { flex: 1, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3 } },
                    React.createElement("div", { style: { width: "42%", height: Math.max(2, (m.ic / trendMax) * 100) + "%", background: "var(--green2)", borderRadius: "4px 4px 0 0", opacity: .9 } }),
                    React.createElement("div", { style: { width: "42%", height: Math.max(2, (m.ex / trendMax) * 100) + "%", background: "var(--red)", borderRadius: "4px 4px 0 0", opacity: .85 } })),
                React.createElement("div", { style: { fontSize: 10, color: "var(--faint)" } }, m.label))))),
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" } },
                React.createElement("div", { style: { display: "flex", gap: 12, fontSize: 11 } },
                    React.createElement("span", { style: { color: "var(--muted)" } },
                        React.createElement("span", { style: { color: "var(--green2)" } }, "\u25A0"),
                        " Przych\u00F3d"),
                    React.createElement("span", { style: { color: "var(--muted)" } },
                        React.createElement("span", { style: { color: "var(--red)" } }, "\u25A0"),
                        " Wydatki")),
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } },
                    "\u015Ar. odk\u0142adasz ",
                    React.createElement("b", { style: { color: avgNet >= 0 ? "var(--green2)" : "var(--red)", fontFamily: "var(--display)" } }, eur(avgNet)),
                    "/mies"))),
        React.createElement("div", { style: { ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("span", null, "Cele oszcz\u0119dno\u015Bciowe"),
            React.createElement("button", { onClick: () => openGoal(null), style: { ...iconBtn, width: 30, height: 30, borderRadius: 99 } },
                React.createElement(Plus, { size: 15 }))),
        goals.length === 0 && (React.createElement(Card, { onClick: () => openGoal(null), style: { cursor: "pointer", textAlign: "center", padding: 18 } },
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 } }, "Dodaj cel \u2014 np. kapita\u0142 na rozw\u00F3j SkupOS, poduszka, w\u0142asne mieszkanie. Zobaczysz post\u0119p i kiedy go osi\u0105gniesz przy obecnym tempie."))),
        goals.map((g) => {
            const p = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
            const left = Math.max(0, g.target - g.saved);
            const eta = left > 0 && monSave > 0 ? Math.ceil(left / monSave) : null;
            return (React.createElement(Card, { key: g.id, style: { marginBottom: 9, cursor: "pointer" }, onClick: () => openGoal(g) },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 } },
                    React.createElement("span", { style: { fontWeight: 700, fontSize: 14 } }, g.name),
                    React.createElement("span", { style: { fontSize: 12.5, color: "var(--muted)" } },
                        eur(g.saved),
                        " / ",
                        React.createElement("b", { style: { color: "var(--text)" } }, eur(g.target)))),
                React.createElement(Bar, { pct: p, color: p >= 100 ? "var(--green2)" : "var(--gold)", h: 8 }),
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11.5 } },
                    React.createElement("span", { style: { color: p >= 100 ? "var(--green2)" : "var(--muted)" } }, p >= 100 ? "✓ Cel osiągnięty!" : Math.round(p) + "% · zostało " + eur(left)),
                    eta != null && React.createElement("span", { style: { color: "var(--gold2)" } },
                        "~",
                        eta,
                        " mies."))));
        }),
        React.createElement("div", { style: { ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("span", null, "Sta\u0142e wydatki & runway"),
            React.createElement("button", { onClick: () => setFixOpen(true), style: { ...iconBtn, width: 30, height: 30, borderRadius: 99 } },
                React.createElement(Plus, { size: 15 }))),
        React.createElement(Card, { style: { background: "linear-gradient(150deg, rgba(91,140,255,.1), rgba(13,15,21,0) 65%)" } },
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 } },
                React.createElement("div", { style: { background: "var(--surface2)", borderRadius: 12, padding: "11px 10px" } },
                    React.createElement("div", { style: { fontSize: 10.5, color: "var(--muted)" } }, "Sta\u0142e / mies"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--blue)" } }, eur(burn))),
                React.createElement("div", { style: { background: "var(--surface2)", borderRadius: 12, padding: "11px 10px" } },
                    React.createElement("div", { style: { fontSize: 10.5, color: "var(--muted)" } }, "Runway (kapita\u0142)"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: burn <= 0 ? "var(--faint)" : runway >= 6 ? "var(--green2)" : runway >= 3 ? "var(--gold2)" : "var(--red)" } }, burn > 0 ? (runway >= 99 ? "99+" : runway.toFixed(1)) + " mies" : "—"))),
            burn > 0 && (React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: fixed.length ? 10 : 0 } },
                "Poduszka pokrywa ",
                React.createElement("b", { style: { color: emFund >= 3 ? "var(--green2)" : "var(--gold2)" } },
                    emFund.toFixed(1),
                    " mies"),
                " sta\u0142ych koszt\u00F3w (cel: 3\u20136). ",
                emFund < 3 ? "Buduj skarbonkę dalej." : "Solidny bufor.")),
            fixed.map((x) => (React.createElement("div", { key: x.id, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line)" } },
                React.createElement("span", { style: { fontSize: 13 } }, x.name),
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                    React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--muted)" } }, eur(x.amount)),
                    React.createElement("button", { onClick: () => delFixed(x.id), style: { ...iconBtn, width: 26, height: 26, border: "none", background: "transparent", color: "var(--faint)" } },
                        React.createElement(X, { size: 14 })))))),
            fixed.length === 0 && React.createElement("div", { style: { fontSize: 12, color: "var(--faint)" } }, "Dodaj sta\u0142e koszty (czynsz, telefon, subskrypcje), a policz\u0119 Tw\u00F3j burn i runway.")),
        React.createElement("div", { style: sectionTitle }, "Kalkulator inwestycji (procent sk\u0142adany)"),
        React.createElement(Card, null,
            React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 } }, "Zobacz, ile zbudujesz regularnie inwestuj\u0105c (np. tani fundusz indeksowy). To si\u0142a konsekwencji i procentu sk\u0142adanego."),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
                React.createElement("div", null,
                    React.createElement("label", { style: label }, "Miesi\u0119cznie (\u20AC)"),
                    React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: pjMonthly, onChange: (e) => setPjMonthly(e.target.value) })),
                React.createElement("div", null,
                    React.createElement("label", { style: label }, "Na start (\u20AC)"),
                    React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: pjStart, onChange: (e) => setPjStart(e.target.value) })),
                React.createElement("div", null,
                    React.createElement("label", { style: label }, "Lata"),
                    React.createElement("input", { style: inputStyle, type: "number", inputMode: "numeric", value: pjYears, onChange: (e) => setPjYears(e.target.value) })),
                React.createElement("div", null,
                    React.createElement("label", { style: label }, "Zwrot %/rok"),
                    React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: pjRate, onChange: (e) => setPjRate(e.target.value) }))),
            React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 10 } }, [5, 7, 10].map((r) => React.createElement(Chip, { key: r, on: +pjRate === r, onClick: () => setPjRate(r), label: r + "%", color: "var(--gold2)" }))),
            React.createElement("div", { style: { marginTop: 14, padding: 14, borderRadius: 14, background: "linear-gradient(135deg, rgba(35,198,111,.12), rgba(245,181,61,.08))", border: "1px solid var(--line2)", textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } },
                    "Po ",
                    parseFloat(pjYears) || 0,
                    " latach"),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 30, color: "var(--green2)", letterSpacing: "-.02em", margin: "2px 0" } }, eur(Math.round(pjFV))),
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } },
                    "Wp\u0142acone ",
                    eur(Math.round(pjIn)),
                    " \u00B7 zysk ",
                    React.createElement("b", { style: { color: "var(--gold2)" } }, eur(Math.round(pjGain))))),
            React.createElement("div", { style: { fontSize: 10.5, color: "var(--faint)", textAlign: "center", marginTop: 8, lineHeight: 1.4 } }, "Szacunek przy sta\u0142ym zwrocie \u2014 rynek si\u0119 waha, zyski nie s\u0105 gwarantowane. To nie porada inwestycyjna.")),
        React.createElement("div", { style: { ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("span", null, "Podzia\u0142 kapita\u0142u"),
            allocPct !== 100 && React.createElement("span", { style: { color: allocPct > 100 ? "var(--red)" : "var(--amber)", textTransform: "none", letterSpacing: 0, fontSize: 11 } },
                "przydzielono ",
                allocPct,
                "%")),
        finance.cats.map((c) => {
            const lim = limitOf(c);
            const sp = spentOf(c.id);
            const p = lim ? (sp / lim) * 100 : 0;
            const over = p > 100;
            return (React.createElement(Card, { key: c.id, pad: 14, style: { marginBottom: 9 } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 } },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9, minWidth: 0 } },
                        React.createElement("span", { style: { width: 9, height: 9, borderRadius: 99, background: c.color, flexShrink: 0 } }),
                        React.createElement("span", { style: { fontSize: 14, fontWeight: 600 } }, c.name),
                        React.createElement("span", { style: { fontSize: 11, color: "var(--faint)", background: "var(--surface2)", borderRadius: 99, padding: "1px 7px", flexShrink: 0 } },
                            c.pct,
                            "%")),
                    React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: over ? "var(--red)" : "var(--text)", whiteSpace: "nowrap" } },
                        eur(sp),
                        " ",
                        React.createElement("span", { style: { color: "var(--faint)", fontWeight: 500, fontSize: 12 } },
                            "/ ",
                            eur(lim)))),
                React.createElement(Bar, { pct: p, color: over ? "var(--red)" : p > 80 ? "var(--amber)" : c.color, h: 7 }),
                over && React.createElement("div", { style: { fontSize: 11, color: "var(--red)", marginTop: 6, fontWeight: 600 } },
                    "\u26A0 Przekroczono o ",
                    eur(sp - lim))));
        }),
        txM.length > 0 && (React.createElement(React.Fragment, null,
            React.createElement("div", { style: sectionTitle }, "Ostatnie operacje"),
            React.createElement(Card, { pad: 6 }, txM.slice(0, 12).map((t, i) => (React.createElement("div", { key: t.id, style: { display: "flex", alignItems: "center", gap: 12, padding: "11px 10px", borderBottom: i < Math.min(11, txM.length - 1) ? "1px solid var(--line)" : "none" } },
                React.createElement("div", { style: { width: 8, height: 8, borderRadius: 99, background: t.type === "income" ? "var(--green)" : catColor(t.cat), flexShrink: 0 } }),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                    React.createElement("div", { style: { fontSize: 14, fontWeight: 600 } }, t.type === "income" ? incName(t.inc) : catName(t.cat)),
                    t.note && React.createElement("div", { style: { fontSize: 12, color: "var(--faint)" } }, t.note)),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 14.5, color: t.type === "income" ? "var(--green2)" : "var(--text)" } },
                    t.type === "income" ? "+" : "−",
                    eur(t.amount)),
                React.createElement("button", { onClick: () => delTx(t.id), style: { ...iconBtn, width: 28, height: 28, border: "none", background: "transparent", color: "var(--faint)" } },
                    React.createElement(X, { size: 15 })))))))),
        React.createElement("div", { style: { height: 8 } }),
        React.createElement("button", { onClick: () => { setType("expense"); setAmount(""); setNote(""); setCat(finance.cats[0]?.id); setInc(finance.income?.[0]?.id); setAddOpen(true); }, style: fab },
            React.createElement(Plus, { size: 26, color: "#04130a", strokeWidth: 3 })),
        React.createElement(Sheet, { open: addOpen, onClose: () => setAddOpen(false), title: "Nowa operacja" },
            React.createElement("div", { style: { display: "flex", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 4, marginBottom: 4 } }, [["expense", "Wydatek", "var(--red)"], ["income", "Przychód", "var(--green)"]].map(([id, lbl, col]) => (React.createElement("button", { key: id, onClick: () => setType(id), style: {
                    flex: 1, padding: "10px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 700, border: "none",
                    background: type === id ? "var(--surface2)" : "transparent", color: type === id ? col : "var(--muted)",
                } }, lbl)))),
            React.createElement("label", { style: label }, "Kwota (\u20AC)"),
            React.createElement("input", { style: { ...inputStyle, fontFamily: "var(--display)", fontSize: 22, fontWeight: 800 }, type: "number", inputMode: "decimal", value: amount, autoFocus: true, onChange: (e) => setAmount(e.target.value), placeholder: "0", onKeyDown: (e) => { if (e.key === "Enter")
                    add(); } }),
            React.createElement("label", { style: label }, type === "expense" ? "Kategoria" : "Źródło dochodu"),
            React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, type === "expense"
                ? finance.cats.map((c) => React.createElement(Chip, { key: c.id, on: cat === c.id, onClick: () => setCat(c.id), label: c.name, color: c.color }))
                : (finance.income || []).map((c) => React.createElement(Chip, { key: c.id, on: inc === c.id, onClick: () => setInc(c.id), label: c.name, color: "var(--green2)" }))),
            React.createElement("label", { style: label }, "Notatka (opcjonalnie)"),
            React.createElement("input", { style: inputStyle, value: note, onChange: (e) => setNote(e.target.value), placeholder: "np. zakupy AH" }),
            liveRound > 0 && (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(245,181,61,.1)", border: "1px solid rgba(245,181,61,.25)" } },
                React.createElement(PiggyBank, { size: 16, color: "var(--gold2)" }),
                React.createElement("span", { style: { fontSize: 12.5, color: "var(--gold2)", fontWeight: 600 } },
                    "Do skarbonki trafi +",
                    eur(liveRound),
                    " (zaokr\u0105glenie)"))),
            React.createElement("button", { style: btnPrimary, onClick: add }, "Zapisz operacj\u0119")),
        React.createElement(Sheet, { open: vaultOpen, onClose: () => setVaultOpen(false), title: "Dorzu\u0107 do skarbonki" },
            React.createElement("label", { style: label }, "Kwota (\u20AC)"),
            React.createElement("input", { style: { ...inputStyle, fontFamily: "var(--display)", fontSize: 22, fontWeight: 800 }, type: "number", inputMode: "decimal", value: vaultIn, autoFocus: true, onChange: (e) => setVaultIn(e.target.value), placeholder: "0", onKeyDown: (e) => { if (e.key === "Enter")
                    addToVault(); } }),
            React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10 } }, [10, 25, 50, 100].map((q) => (React.createElement("button", { key: q, onClick: () => setVaultIn(String((parseFloat(vaultIn) || 0) + q)), style: { flex: 1, padding: "10px", borderRadius: 11, cursor: "pointer", fontSize: 13.5, fontWeight: 700, border: "1px solid var(--line2)", background: "var(--surface2)", color: "var(--gold2)" } },
                "+",
                q)))),
            React.createElement("button", { style: { ...btnPrimary, background: "linear-gradient(135deg, var(--gold), #e0892a)", color: "#1a1200" }, onClick: addToVault }, "Od\u0142\u00F3\u017C do skarbonki")),
        React.createElement(Sheet, { open: editOpen, onClose: () => setEditOpen(false), title: "Edytuj bud\u017Cet" },
            React.createElement("label", { style: label }, "Miesi\u0119czny kapita\u0142 / bud\u017Cet (\u20AC)"),
            React.createElement("input", { style: { ...inputStyle, fontFamily: "var(--display)", fontSize: 20, fontWeight: 800 }, type: "number", inputMode: "decimal", value: dCapital, onChange: (e) => setDCapital(e.target.value) }),
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 2px 8px" } },
                React.createElement("span", { style: { fontSize: 12.5, color: "var(--muted)", fontWeight: 700, letterSpacing: ".04em" } }, "PODZIA\u0141 KAPITA\u0141U (%)"),
                React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: dAllocPct > 100 ? "var(--red)" : dAllocPct === 100 ? "var(--green2)" : "var(--muted)" } },
                    dAllocPct,
                    "%")),
            dCats.map((c, idx) => (React.createElement("div", { key: c.id, style: { marginBottom: 9 } },
                React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
                    React.createElement("button", { onClick: () => setDCats((p) => p.map((x, i) => i === idx ? { ...x, color: CAT_PALETTE[(CAT_PALETTE.indexOf(x.color) + 1) % CAT_PALETTE.length] } : x)), style: { width: 30, height: 38, borderRadius: 9, border: "1px solid var(--line2)", background: c.color, cursor: "pointer", flexShrink: 0 }, title: "Zmie\u0144 kolor" }),
                    React.createElement("input", { style: { ...inputStyle, flex: 1, padding: "10px 12px" }, value: c.name, placeholder: "Nazwa sekcji", onChange: (e) => setDCats((p) => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x)) }),
                    React.createElement("input", { style: { ...inputStyle, width: 56, padding: "10px 4px", textAlign: "center", fontWeight: 700 }, type: "number", inputMode: "decimal", value: c.pct, onChange: (e) => setDCats((p) => p.map((x, i) => i === idx ? { ...x, pct: e.target.value } : x)) }),
                    React.createElement("button", { onClick: () => setDCats((p) => p.filter((_, i) => i !== idx)), style: { ...iconBtn, width: 38, height: 38, border: "none", background: "rgba(248,113,113,.1)", color: "var(--red)", flexShrink: 0 } },
                        React.createElement(Trash2, { size: 16 }))),
                React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginLeft: 38, marginTop: 3 } },
                    "\u2248 ",
                    eur(Math.round(dCap * (parseFloat(c.pct) || 0) / 100)),
                    " / mies")))),
            React.createElement("button", { onClick: () => setDCats((p) => [...p, { id: uid(), name: "", pct: 0, color: CAT_PALETTE[p.length % CAT_PALETTE.length] }]), style: { ...inputStyle, width: "100%", cursor: "pointer", color: "var(--green2)", fontWeight: 700, textAlign: "center", border: "1px dashed var(--line2)", background: "transparent" } }, "+ Dodaj sekcj\u0119"),
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", fontWeight: 700, letterSpacing: ".04em", margin: "18px 2px 8px" } }, "\u0179R\u00D3D\u0141A DOCHODU"),
            dInc.map((c, idx) => (React.createElement("div", { key: c.id, style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 9 } },
                React.createElement(Coins, { size: 16, color: "var(--green2)", style: { flexShrink: 0 } }),
                React.createElement("input", { style: { ...inputStyle, flex: 1, padding: "10px 12px" }, value: c.name, placeholder: "np. Freelance", onChange: (e) => setDInc((p) => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x)) }),
                React.createElement("button", { onClick: () => setDInc((p) => p.filter((_, i) => i !== idx)), style: { ...iconBtn, width: 38, height: 38, border: "none", background: "rgba(248,113,113,.1)", color: "var(--red)", flexShrink: 0 } },
                    React.createElement(Trash2, { size: 16 }))))),
            React.createElement("button", { onClick: () => setDInc((p) => [...p, { id: uid(), name: "" }]), style: { ...inputStyle, width: "100%", cursor: "pointer", color: "var(--green2)", fontWeight: 700, textAlign: "center", border: "1px dashed var(--line2)", background: "transparent" } }, "+ Dodaj \u017Ar\u00F3d\u0142o dochodu"),
            React.createElement("label", { style: label }, "Cel przychodu z biznesu D2D (\u20AC/mies)"),
            React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: dGoal, onChange: (e) => setDGoal(e.target.value) }),
            React.createElement("label", { style: label }, "Cel skarbonki / oszcz\u0119dno\u015Bci (\u20AC)"),
            React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: dVaultGoal, onChange: (e) => setDVaultGoal(e.target.value) }),
            React.createElement("button", { style: btnPrimary, onClick: saveEdit }, "Zapisz bud\u017Cet")),
        React.createElement(Sheet, { open: goalOpen, onClose: () => setGoalOpen(false), title: gId ? "Edytuj cel" : "Nowy cel oszczędnościowy" },
            React.createElement("label", { style: label }, "Nazwa celu"),
            React.createElement("input", { style: inputStyle, value: gName, onChange: (e) => setGName(e.target.value), placeholder: "np. Kapita\u0142 na SkupOS" }),
            React.createElement("label", { style: label }, "Kwota docelowa (\u20AC)"),
            React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: gTarget, onChange: (e) => setGTarget(e.target.value), placeholder: "np. 10000" }),
            React.createElement("label", { style: label }, "Ju\u017C od\u0142o\u017Cone (\u20AC)"),
            React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: gSaved, onChange: (e) => setGSaved(e.target.value), placeholder: "0" }),
            React.createElement("button", { style: btnPrimary, onClick: saveGoal }, gId ? "Zapisz" : "Dodaj cel"),
            gId && React.createElement("button", { onClick: () => { delGoal(gId); setGoalOpen(false); }, style: { ...inputStyle, width: "100%", marginTop: 8, cursor: "pointer", color: "var(--red)", fontWeight: 600, textAlign: "center", border: "1px solid rgba(248,113,113,.3)", background: "transparent" } }, "Usu\u0144 cel")),
        React.createElement(Sheet, { open: fixOpen, onClose: () => setFixOpen(false), title: "Sta\u0142y wydatek miesi\u0119czny" },
            React.createElement("label", { style: label }, "Nazwa"),
            React.createElement("input", { style: inputStyle, value: fName, onChange: (e) => setFName(e.target.value), placeholder: "np. Czynsz, telefon, Netflix" }),
            React.createElement("label", { style: label }, "Kwota / mies (\u20AC)"),
            React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: fAmt, onChange: (e) => setFAmt(e.target.value), placeholder: "np. 850" }),
            React.createElement("button", { style: btnPrimary, onClick: saveFixed }, "Dodaj"))));
}
/* ───────────────────────── CALENDAR + MONTHLY SUMMARY ───────────────────────── */
// Kolory zmian w kalendarzu
const SHIFT_COLOR = (title) => {
    if (!title)
        return "var(--gold)";
    if (title.includes("Ranka"))
        return "#f5c518";
    if (title.includes("Popołudnie"))
        return "#c2621a";
    if (title.includes("Nocka"))
        return "#991b1b";
    return "var(--gold)";
};
const SHIFT_BG = (title) => {
    if (!title)
        return "var(--surface2)";
    if (title.includes("Ranka"))
        return "rgba(245,197,24,.15)";
    if (title.includes("Popołudnie"))
        return "rgba(194,98,26,.18)";
    if (title.includes("Nocka"))
        return "rgba(153,27,27,.22)";
    return "var(--surface2)";
};
const isShift = (t) => t && (t.includes("Ranka") || t.includes("Popołudnie") || t.includes("Nocka"));
function Calendar({ events, setEvents, daily, habits, finance, profile, setProfile, setToast }) {
    const now = new Date();
    const [vy, setVy] = useState(now.getFullYear());
    const [vm, setVm] = useState(now.getMonth());
    const [sel, setSel] = useState(todayKey());
    const [dayOpen, setDayOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [note, setNote] = useState("");
    const [color, setColor] = useState("#f5b53d");
    const [goalOpen, setGoalOpen] = useState(false);
    const [goalVal, setGoalVal] = useState(profile.workoutGoal || 12);
    const coreHabits = habits.filter((h) => h.core);
    const dim = new Date(vy, vm + 1, 0).getDate();
    const firstW = (new Date(vy, vm, 1).getDay() + 6) % 7;
    const mStr = `${vy}-${pad(vm + 1)}`;
    const dkey = (d) => `${mStr}-${pad(d)}`;
    const evOn = (ds) => events.filter((e) => e.date === ds);
    const selEvents = evOn(sel);
    const cells = [];
    for (let i = 0; i < firstW; i++)
        cells.push(null);
    for (let d = 1; d <= dim; d++)
        cells.push(d);
    const addEvent = () => { if (!title.trim())
        return; setEvents((p) => [...p, { id: uid(), date: sel, title: title.trim(), note: note.trim(), color }]); setTitle(""); setNote(""); buzz(8); };
    const delEvent = (id) => setEvents((p) => p.filter((e) => e.id !== id));
    // Urlop
    const [vacOpen, setVacOpen] = useState(false);
    const [vacFrom, setVacFrom] = useState(todayKey());
    const [vacTo, setVacTo] = useState(todayKey());
    const [vacType, setVacType] = useState("Urlop 🌴");
    const VAC_TYPES = ["Urlop 🌴", "Urlop ona 🌺", "Urlop oboje 🌴🌺", "Choroba 🤒", "Dzień wolny 🔒"];
    const VAC_COLOR = "#14b8a6";
    const addVacation = () => {
        const from = new Date(vacFrom + "T12:00:00");
        const to = new Date(vacTo + "T12:00:00");
        if (from > to)
            return;
        const evs = [];
        for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
            const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            evs.push({ id: uid(), date: ds, title: vacType, note: `${vacFrom} – ${vacTo}`, color: VAC_COLOR });
        }
        setEvents(p => [...p.filter(e => !(e.date >= vacFrom && e.date <= vacTo && e.title.includes("🌴") || e.date >= vacFrom && e.date <= vacTo && e.title.includes("🌺") || e.date >= vacFrom && e.date <= vacTo && e.title.includes("🤒"))), ...evs]);
        setVacOpen(false);
        buzz([80, 40, 80]);
    };
    const prevM = () => { if (vm === 0) {
        setVm(11);
        setVy(vy - 1);
    }
    else
        setVm(vm - 1); };
    const nextM = () => { if (vm === 11) {
        setVm(0);
        setVy(vy + 1);
    }
    else
        setVm(vm + 1); };
    const goToday = () => { setVy(now.getFullYear()); setVm(now.getMonth()); setSel(todayKey()); };
    const genShifts = () => {
        const ANCHOR = new Date(2026, 5, 9, 12); // 2026-06-09 = Ranka, start cyklu
        const SH = [
            { t: "Ranka 🌅", note: "Wyjazd 06:00 · 07:00–15:00 · Powrót ~15:30", color: "#f5b53d" },
            { t: "Popołudnie 🌇", note: "Wyjazd 14:00 · 15:00–23:00 · Powrót ~23:30", color: "#e87c1e" },
            { t: "Nocka 🌙", note: "Wyjazd 22:00 · 23:00–07:00 · Powrót ~08:00", color: "#991b1b" },
        ];
        const cyc = [0, 0, 1, 1, 2, 2, -1, -1, -1, -1]; // 2+2+2+4
        const startD = new Date();
        startD.setHours(12, 0, 0, 0);
        const endD = new Date(2026, 11, 31, 12);
        const have = new Set((events || []).filter((e) => isShift(e.title)).map((e) => e.date));
        const addEv = [];
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
            const dk = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
            const diff = Math.round((d - ANCHOR) / 86400000);
            const s = cyc[((diff % 10) + 10) % 10];
            if (s < 0 || have.has(dk))
                continue;
            addEv.push({ id: uid(), date: dk, title: SH[s].t, note: SH[s].note, color: SH[s].color });
        }
        if (addEv.length)
            setEvents((p) => [...(p || []), ...addEv]);
        buzz(15);
        if (setToast)
            setToast({ icon: "check", title: addEv.length ? "Zmiany dodane" : "Komplet", msg: addEv.length ? "Dodano " + addEv.length + " dni pracy do końca roku" : "Wszystkie zmiany już są w kalendarzu", color: "var(--green)" });
    };
    const openDay = (d) => { setSel(dkey(d)); setTitle(""); setNote(""); setColor("#f5b53d"); setDayOpen(true); };
    // monthly summary
    const isCur = vy === now.getFullYear() && vm === now.getMonth();
    const isPast = vy < now.getFullYear() || (vy === now.getFullYear() && vm < now.getMonth());
    const fs = profile.freshStart || null;
    const inFs = (dk) => !fs || dk >= fs;
    const elapsedRaw = isCur ? Math.max(0, now.getDate() - 1) : (isPast ? dim : 0);
    let elapsed = 0;
    for (let d = 1; d <= elapsedRaw; d++) {
        if (inFs(dkey(d)))
            elapsed++;
    }
    let workoutsDone = 0, perfectDays = 0, habitSum = 0;
    for (let d = 1; d <= dim; d++) {
        const dk = dkey(d);
        if (!inFs(dk))
            continue;
        const rec = daily[dk];
        if (rec && rec.workoutDone)
            workoutsDone++;
        if (rec && coreHabits.length && coreHabits.every((h) => rec.habits && rec.habits[h.id]))
            perfectDays++;
    }
    for (let d = 1; d <= elapsedRaw; d++) {
        const dk = dkey(d);
        if (!inFs(dk))
            continue;
        const rec = daily[dk];
        const done = rec ? coreHabits.filter((h) => rec.habits && rec.habits[h.id]).length : 0;
        habitSum += coreHabits.length ? done / coreHabits.length : 0;
    }
    const habitAvg = elapsed ? Math.round(habitSum / elapsed * 100) : 0;
    // per-habit misses (in-range elapsed days; dziś = w toku, nie liczy się jako pominięty)
    const misses = coreHabits.map((h) => {
        let done = 0;
        for (let d = 1; d <= elapsedRaw; d++) {
            const dk = dkey(d);
            if (!inFs(dk))
                continue;
            const rec = daily[dk];
            if (rec && rec.habits && rec.habits[h.id])
                done++;
        }
        return { name: h.name, missed: Math.max(0, elapsed - done), done };
    }).sort((a, b) => b.missed - a.missed);
    const goal = profile.workoutGoal || 12;
    const wPct = goal ? (workoutsDone / goal) * 100 : 0;
    const pace = isCur && dim ? goal * (elapsed / dim) : goal;
    const behind = isCur && workoutsDone < pace - 0.5;
    const wColor = workoutsDone >= goal ? "var(--green)" : (isPast ? "var(--red)" : (behind ? "var(--amber)" : "var(--green)"));
    const wStatus = workoutsDone >= goal ? "Cel osiągnięty 🔥"
        : isPast ? `Poniżej celu — brakło ${goal - workoutsDone}`
            : behind ? `W tyle o ${Math.max(1, Math.ceil(pace - workoutsDone))} wzgl. tempa`
                : isCur ? "Na dobrej drodze" : "Zaplanowane";
    const txM = finance.tx.filter((t) => (t.date || "").slice(0, 7) === mStr);
    const spent = txM.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0);
    const incomeM = txM.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0);
    const net = incomeM - spent;
    const cap = finance.capital || 0;
    const totalLimit = (finance.cats || []).reduce((a, c) => a + Math.round(cap * (c.pct || 0) / 100), 0);
    const budgetPct = totalLimit ? Math.round(spent / totalLimit * 100) : 0;
    const WD = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nie"];
    const selPretty = (() => {
        const [Y, M, D] = sel.split("-").map(Number);
        const dt = new Date(Y, M - 1, D);
        return `${PL_DAYS[dt.getDay()]}, ${D} ${PL_MON[M - 1]}`;
    })();
    const EVENT_COLORS = ["#f5b53d", "#22c55e", "#3b82f6", "#a78bfa", "#ef4444", "#14b8a6"];
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26, display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("div", null,
                React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em", textTransform: "capitalize" } }, PL_MON[vm]),
                React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, vy)),
            React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
                React.createElement("button", { onClick: goToday, style: { ...iconBtn, width: "auto", padding: "0 12px", fontSize: 12.5, fontWeight: 700, color: "var(--green2)" } }, "Dzi\u015B"),
                React.createElement("button", { onClick: prevM, style: iconBtn },
                    React.createElement(ChevronLeft, { size: 18 })),
                React.createElement("button", { onClick: nextM, style: iconBtn },
                    React.createElement(ChevronRight, { size: 18 })))),
        React.createElement("button", { onClick: genShifts, style: { width: "100%", marginTop: 14, padding: "12px 14px", borderRadius: 13, border: "1px solid var(--line2)", background: "linear-gradient(135deg, rgba(245,181,61,.12), rgba(91,140,255,.1))", color: "var(--text)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 } }, "\uD83D\uDD12 Generuj zmiany do grudnia (2+2+2+4)"),
        React.createElement(Card, { style: { marginTop: 16 }, pad: 12 },
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 } }, WD.map((w) => React.createElement("div", { key: w, style: { textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--faint)", padding: "2px 0" } }, w))),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 } }, cells.map((d, i) => {
                if (d == null)
                    return React.createElement("div", { key: "e" + i });
                const ds = dkey(d);
                const isToday = ds === todayKey();
                const isSel = ds === sel;
                const evs = evOn(ds);
                const rec = daily[ds];
                const wdone = rec && rec.workoutDone;
                const shiftEv = evs.find(e => isShift(e.title));
                const cellBg = isToday ? "rgba(34,197,94,.16)" : shiftEv ? SHIFT_BG(shiftEv.title) : evs.length ? "var(--surface2)" : "transparent";
                const cellBorder = isSel ? "1.5px solid var(--green)" : shiftEv ? `1px solid ${SHIFT_COLOR(shiftEv.title)}44` : "1px solid transparent";
                return (React.createElement("button", { key: ds, onClick: () => openDay(d), style: {
                        position: "relative", aspectRatio: "1 / 1", minHeight: 40, borderRadius: 11, cursor: "pointer",
                        border: cellBorder, background: cellBg,
                        color: isToday ? "var(--green2)" : "var(--text)", display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 2,
                    } },
                    React.createElement("span", { style: { fontSize: 14, fontWeight: isToday ? 800 : 600, fontFamily: "var(--display)" } }, d),
                    React.createElement("div", { style: { display: "flex", gap: 3, height: 9, alignItems: "center" } },
                        shiftEv && !evs.find(e => VAC_TYPES.some && e.title && e.title.includes("🌴") || e.title && e.title.includes("🌺")) && React.createElement("span", { style: { fontSize: 9, color: SHIFT_COLOR(shiftEv.title), lineHeight: 1, fontWeight: 900 } }, "\u2605"),
                        evs.find(e => e.title && (e.title.includes("🌴") || e.title.includes("🌺") || e.title.includes("🏖️"))) && React.createElement("span", { style: { fontSize: 11, lineHeight: 1 } }, "\uD83C\uDF34"),
                        evs.find(e => !isShift(e.title) && !VAC_TYPES.includes(e.title)) && React.createElement("span", { style: { width: 5, height: 5, borderRadius: 99, background: evs.find(e => !isShift(e.title) && !VAC_TYPES.includes(e.title)).color || "var(--gold)", flexShrink: 0 } }),
                        wdone && React.createElement("span", { style: { fontSize: 8, color: "var(--green2)", lineHeight: 1 } }, "\u2713"))));
            })),
            React.createElement("div", { style: { display: "flex", gap: 14, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 11, color: "var(--muted)" } },
                React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } },
                    React.createElement("span", { style: { color: "#f5c518", fontWeight: 900, fontSize: 10 } }, "\u2605"),
                    " Ranka"),
                React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } },
                    React.createElement("span", { style: { color: "#c2621a", fontWeight: 900, fontSize: 10 } }, "\u2605"),
                    " Popo\u0142udnie"),
                React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } },
                    React.createElement("span", { style: { color: "#991b1b", fontWeight: 900, fontSize: 10 } }, "\u2605"),
                    " Nocka"),
                React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } },
                    React.createElement("span", { style: { color: "var(--green2)", fontSize: 10 } }, "\u2713"),
                    " Trening"),
                React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 5 } },
                    React.createElement("span", { style: { fontSize: 10 } }, "\uD83C\uDF34"),
                    " Urlop"))),
        (() => {
            const up = events.filter((e) => (e.date || "").slice(0, 7) === mStr).sort((a, b) => a.date.localeCompare(b.date));
            if (!up.length)
                return null;
            return (React.createElement(React.Fragment, null,
                React.createElement("div", { style: sectionTitle }, "Wa\u017Cne wydarzenia"),
                up.map((e) => {
                    const D = Number(e.date.split("-")[2]);
                    return (React.createElement(Card, { key: e.id, pad: 13, style: { marginBottom: 9, display: "flex", alignItems: "center", gap: 12, borderLeft: `3px solid ${e.color || "var(--gold)"}` } },
                        React.createElement("div", { style: { textAlign: "center", flexShrink: 0, width: 36 } },
                            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, lineHeight: 1 } }, D),
                            React.createElement("div", { style: { fontSize: 9.5, color: "var(--faint)", textTransform: "uppercase" } }, PL_MON[vm].slice(0, 3))),
                        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                            React.createElement("div", { style: { fontSize: 14, fontWeight: 600 } }, e.time ? e.time + " \xB7 " : "", e.title),
                            e.note && React.createElement("div", { style: { fontSize: 12, color: "var(--faint)" } }, e.note)),
                        React.createElement("button", { onClick: () => delEvent(e.id), style: { ...iconBtn, width: 30, height: 30, border: "none", background: "transparent", color: "var(--faint)" } },
                            React.createElement(X, { size: 15 }))));
                })));
        })(),
        React.createElement("div", { style: { ...sectionTitle, display: "flex", alignItems: "center", gap: 7 } },
            React.createElement(BarChart3, { size: 13 }),
            " Podsumowanie \u2014 ",
            PL_MON[vm]),
        React.createElement(Card, { style: { marginBottom: 10 }, onClick: () => { setGoalVal(profile.workoutGoal || 12); setGoalOpen(true); } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9 } },
                    React.createElement("div", { style: { width: 34, height: 34, borderRadius: 10, background: "rgba(245,181,61,.12)", display: "grid", placeItems: "center" } },
                        React.createElement(Dumbbell, { size: 17, color: "var(--gold2)" })),
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Treningi"),
                        React.createElement("div", { style: { fontSize: 11.5, color: (behind || (isPast && workoutsDone < goal)) ? "var(--amber)" : "var(--muted)" } }, wStatus))),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: wColor } },
                    workoutsDone,
                    React.createElement("span", { style: { fontSize: 13, color: "var(--faint)" } },
                        " / ",
                        goal))),
            React.createElement(Bar, { pct: wPct, color: wColor, h: 8 }),
            (isPast && workoutsDone < goal) && React.createElement("div", { style: { fontSize: 11.5, color: "var(--red)", marginTop: 8, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 } },
                React.createElement(AlertTriangle, { size: 13 }),
                " Za ma\u0142o trening\u00F3w w tym miesi\u0105cu \u2014 cel ",
                goal,
                "."),
            React.createElement("div", { style: { fontSize: 10.5, color: "var(--faint)", marginTop: 7, textAlign: "right" } }, "Dotknij, aby zmieni\u0107 cel")),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 } },
            React.createElement(Card, { pad: 14 },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } },
                    React.createElement(Flame, { size: 16, color: "var(--gold2)" }),
                    React.createElement("span", { style: { fontSize: 12.5, color: "var(--muted)", fontWeight: 600 } }, "Dni perfekcyjne")),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: "var(--gold2)" } },
                    perfectDays,
                    React.createElement("span", { style: { fontSize: 13, color: "var(--faint)" } },
                        " / ",
                        elapsed || dim)),
                React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 2 } }, "wszystkie nawyki")),
            React.createElement(Card, { pad: 14 },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } },
                    React.createElement(Check, { size: 16, color: "var(--green2)" }),
                    React.createElement("span", { style: { fontSize: 12.5, color: "var(--muted)", fontWeight: 600 } }, "Nawyki \u015Br.")),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: habitAvg >= 80 ? "var(--green2)" : habitAvg >= 50 ? "var(--amber)" : "var(--red)" } },
                    habitAvg,
                    "%"),
                React.createElement("div", { style: { marginTop: 8 } },
                    React.createElement(Bar, { pct: habitAvg, color: habitAvg >= 80 ? "var(--green)" : habitAvg >= 50 ? "var(--amber)" : "var(--red)", h: 5 })))),
        React.createElement(Card, { style: { marginBottom: 8 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9, marginBottom: 11 } },
                React.createElement("div", { style: { width: 34, height: 34, borderRadius: 10, background: "rgba(34,197,94,.12)", display: "grid", placeItems: "center" } },
                    React.createElement(Coins, { size: 17, color: "var(--green2)" })),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Finanse miesi\u0105ca")),
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 10 } },
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, "Bilans"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: net >= 0 ? "var(--green2)" : "var(--red)" } },
                        net >= 0 ? "+" : "",
                        eur(net))),
                React.createElement("div", { style: { textAlign: "right" } },
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, "Bud\u017Cet"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 18, color: budgetPct > 100 ? "var(--red)" : "var(--text)" } },
                        budgetPct,
                        "%"))),
            React.createElement(Bar, { pct: budgetPct, color: budgetPct > 100 ? "var(--red)" : budgetPct > 80 ? "var(--amber)" : "var(--green)", h: 7 })),
        elapsed > 0 && coreHabits.length > 0 && (React.createElement(Card, { style: { marginBottom: 8 }, pad: 14 },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } },
                React.createElement(AlertTriangle, { size: 16, color: "var(--amber)" }),
                React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Do poprawy w tym miesi\u0105cu")),
            React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginBottom: 12 } },
                "Ile razy nawyk zosta\u0142 pomini\u0119ty (",
                elapsed,
                " dni)"),
            misses.map((m) => {
                const p = elapsed ? (m.missed / elapsed) * 100 : 0;
                const col = m.missed === 0 ? "var(--green)" : p > 50 ? "var(--red)" : "var(--amber)";
                return (React.createElement("div", { key: m.name, style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } },
                    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } },
                            React.createElement("span", { style: { fontSize: 13, fontWeight: 600 } }, m.name),
                            React.createElement("span", { style: { fontSize: 12.5, fontWeight: 700, color: col } }, m.missed === 0 ? "komplet ✓" : `${m.missed}× pominięte`)),
                        React.createElement(Bar, { pct: 100 - p, color: col, h: 5 }))));
            }),
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", paddingTop: 10, marginTop: 2, borderTop: "1px solid var(--line)" } },
                React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--muted)" } }, "Treningi poni\u017Cej celu"),
                React.createElement("span", { style: { fontSize: 12.5, fontWeight: 700, color: workoutsDone >= goal ? "var(--green)" : "var(--amber)" } },
                    Math.max(0, goal - workoutsDone),
                    "\u00D7 brakuje")))),
        React.createElement("button", { onClick: () => openDay(isCur ? now.getDate() : 1), style: fab },
            React.createElement(Plus, { size: 26, color: "#04130a", strokeWidth: 3 })),
        React.createElement("button", { onClick: () => setVacOpen(true), style: { ...fab, right: 82, background: "rgba(20,184,166,.9)", boxShadow: "0 6px 22px -8px #14b8a6" } }, "\uD83C\uDF34"),
        React.createElement(Sheet, { open: dayOpen, onClose: () => setDayOpen(false), title: selPretty },
            selEvents.length > 0 && (React.createElement("div", { style: { marginBottom: 14 } }, selEvents.map((e) => (React.createElement("div", { key: e.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, marginBottom: 8, borderLeft: `3px solid ${e.color || "var(--gold)"}` } },
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                    React.createElement("div", { style: { fontSize: 14, fontWeight: 600 } }, e.time ? e.time + " \xB7 " : "", e.title),
                    e.note && React.createElement("div", { style: { fontSize: 12, color: "var(--faint)" } }, e.note)),
                React.createElement("button", { onClick: () => delEvent(e.id), style: { ...iconBtn, width: 30, height: 30, border: "none", background: "rgba(248,113,113,.1)", color: "var(--red)" } },
                    React.createElement(Trash2, { size: 15 }))))))),
            React.createElement("label", { style: label }, "Nowe wydarzenie"),
            React.createElement(EventForm, { date: sel, onSave: (ev) => setEvents((p) => [...p, ev]) })),
        React.createElement(Sheet, { open: vacOpen, onClose: () => setVacOpen(false), title: "Dodaj urlop \uD83C\uDF34" },
            React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 } }, "Zaznacz zakres urlopu w kalendarzu \u2014 ka\u017Cdy dzie\u0144 otrzyma ikon\u0119 \uD83C\uDF34. Urlop p\u0142atny jest automatycznie liczony w kalkulatorze wyp\u0142at jako dzie\u0144 pracy."),
            React.createElement("label", { style: label }, "Rodzaj"),
            React.createElement("div", { style: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 4 } }, VAC_TYPES.map(t => (React.createElement("button", { key: t, onClick: () => setVacType(t), style: { padding: "7px 11px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", border: vacType === t ? "1.5px solid #14b8a6" : "1px solid var(--line2)", background: vacType === t ? "rgba(20,184,166,.15)" : "var(--surface2)", color: vacType === t ? "#14b8a6" : "var(--muted)" } }, t)))),
            React.createElement("label", { style: label }, "Od"),
            React.createElement("input", { type: "date", style: inputStyle, value: vacFrom, onChange: e => setVacFrom(e.target.value) }),
            React.createElement("label", { style: label }, "Do"),
            React.createElement("input", { type: "date", style: inputStyle, value: vacTo, onChange: e => setVacTo(e.target.value), min: vacFrom }),
            vacFrom && vacTo && vacFrom <= vacTo && (React.createElement("div", { style: { marginTop: 10, padding: "10px 12px", background: "rgba(20,184,166,.1)", border: "1px solid rgba(20,184,166,.3)", borderRadius: 11, fontSize: 13, color: "#14b8a6", fontWeight: 600 } }, (() => { const a = new Date(vacFrom + "T12:00:00"); const b = new Date(vacTo + "T12:00:00"); const days = Math.round((b - a) / 86400000) + 1; return `${days} ${days === 1 ? "dzień" : "dni"} urlopu · ${vacFrom} – ${vacTo}`; })())),
            React.createElement("button", { style: { ...btnPrimary, marginTop: 14, background: "linear-gradient(135deg, #14b8a6, #0d9488)" }, onClick: addVacation }, "Zaznacz urlop w kalendarzu"),
            React.createElement("button", { style: { ...btnPrimary, marginTop: 8, background: "transparent", border: "1px solid var(--line2)", color: "var(--muted)" }, onClick: () => { setEvents(p => p.filter(e => !(e.date >= vacFrom && e.date <= vacTo && VAC_TYPES.some(t => e.title === t)))); setVacOpen(false); } }, "Usu\u0144 urlop z tego okresu")),
        React.createElement(Sheet, { open: goalOpen, onClose: () => setGoalOpen(false), title: "Miesi\u0119czny cel trening\u00F3w" },
            React.createElement("label", { style: label }, "Ile trening\u00F3w chcesz zrobi\u0107 w miesi\u0105cu?"),
            React.createElement("input", { style: { ...inputStyle, fontFamily: "var(--display)", fontSize: 20, fontWeight: 800 }, type: "number", inputMode: "numeric", value: goalVal, autoFocus: true, onChange: (e) => setGoalVal(e.target.value) }),
            React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", marginTop: 6, lineHeight: 1.5 } }, "Plan PPL 3\u00D7/tydzie\u0144 \u2248 12\u201314. Kalistenika 4\u00D7/tydzie\u0144 \u2248 16. Dostaniesz alert, je\u015Bli pod koniec miesi\u0105ca b\u0119dzie ich za ma\u0142o."),
            React.createElement("button", { style: btnPrimary, onClick: () => { const v = parseInt(goalVal); if (!isNaN(v) && v > 0)
                    setProfile({ ...profile, workoutGoal: v }); setGoalOpen(false); } }, "Zapisz cel"))));
}
const SEED_TRADES = {
  accounts: [{ id: "ftmo1", name: "FTMO 100k", size: 1e5, dailyDD: 5, maxDD: 10 }],
  checklist: [
    { id: "c1", t: "Plan zapisany PRZED wej\u015Bciem: strefa, SL, TP" },
    { id: "c2", t: "Wchodz\u0119 z planu \u2014 nie \u201Ena widok wybicia\u201D" },
    { id: "c3", t: "R:R \u2265 1:7" },
    { id: "c4", t: "Ryzyko mie\u015Bci si\u0119 w dziennym limicie DD" },
    { id: "c5", t: "Setup zgodny z systemem (HTF / strefa)" },
    { id: "c6", t: "Brak wa\u017Cnych news\xF3w w najbli\u017Cszych godzinach" }
  ],
  setups: ["Retest strefy", "Wybicie + retest", "Odrzucenie strefy HTF", "Kontynuacja trendu"],
  trades: []
};
const MISTAKES = ["Wej\u015Bcie impulsywne", "Za wcze\u015Bnie", "Przesuni\u0119ty SL", "Za du\u017Ce ryzyko", "Wyj\u015Bcie przed TP", "Revenge", "Brak planu"];
const num = (v) => {
  const n = parseFloat(String(v == null ? "" : v).replace(",", "."));
  return isNaN(n) ? null : n;
};
const tradeCalc = (t) => {
  const e = num(t.entry), sl = num(t.sl), tp = num(t.tp), ex = num(t.exit);
  const risk = e != null && sl != null ? Math.abs(e - sl) : null;
  const sgn = t.dir === "S" ? -1 : 1;
  const rr = risk && tp != null ? sgn * (tp - e) / risk : null;
  const R = risk && ex != null ? sgn * (ex - e) / risk : num(t.manualR);
  const riskPct = num(t.riskPct) || 0;
  const pipsSL = risk != null ? risk * 10 : null;
  const pipsTP = tp != null && e != null ? Math.abs(tp - e) * 10 : null;
  return { risk, rr, R, riskPct, pipsSL, pipsTP };
};
const fmtR = (r) => r == null || isNaN(r) ? "\u2014" : `${r >= 0 ? "+" : ""}${(Math.round(r * 100) / 100).toLocaleString("pl-PL")}R`;
const usd = (n) => (n < 0 ? "\u2212$" : "$") + Math.round(Math.abs(n)).toLocaleString("pl-PL");
function EquityCurve({ points }) {
  if (points.length < 2) return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", padding: "18px 0", textAlign: "center" } }, "Krzywa kapita\u0142u pojawi si\u0119 po 2 zamkni\u0119tych tradach");
  const W = 320, H = 110, P = 6;
  const min = Math.min(0, ...points), max = Math.max(0, ...points);
  const span = max - min || 1;
  const x = (i) => P + i / (points.length - 1) * (W - 2 * P);
  const y = (v) => H - P - (v - min) / span * (H - 2 * P);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= 0;
  return /* @__PURE__ */ React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, style: { width: "100%", height: 110, display: "block" } }, /* @__PURE__ */ React.createElement("line", { x1: P, x2: W - P, y1: y(0), y2: y(0), stroke: "rgba(255,255,255,.12)", strokeDasharray: "3 4" }), /* @__PURE__ */ React.createElement("path", { d, fill: "none", stroke: up ? "var(--green)" : "var(--red)", strokeWidth: "2.2", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: x(points.length - 1), cy: y(points[points.length - 1]), r: "3.5", fill: up ? "var(--green2)" : "var(--red)" }));
}
function Trading({ trades: T, setTrades }) {
  const [seg, setSeg] = useState("log");
  const [form, setForm] = useState(null);
  const [filterAcc, setFilterAcc] = useState("all");
  const [accOpen, setAccOpen] = useState(false);
  const [newCheck, setNewCheck] = useState("");
  const accs = T.accounts || [];
  const accName = (id) => (accs.find((a) => a.id === id) || {}).name || "\u2014";
  const list = (T.trades || []).filter((t) => filterAcc === "all" || t.acc === filterAcc);
  const closed = list.filter((t) => t.status === "closed").sort((a, b) => (a.closedAt || a.date).localeCompare(b.closedAt || b.date));
  const open = list.filter((t) => t.status !== "closed");
  const Rs = closed.map((t) => tradeCalc(t).R).filter((r) => r != null);
  const wins = Rs.filter((r) => r > 0), losses = Rs.filter((r) => r < 0);
  const sumR = Rs.reduce((a, b) => a + b, 0);
  const winRate = Rs.length ? wins.length / Rs.length * 100 : 0;
  const pf = losses.length ? wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0)) : wins.length ? Infinity : 0;
  let cum = 0;
  const curve = [0, ...Rs.map((r) => cum += r)];
  let peak = 0, mdd = 0;
  curve.forEach((v) => {
    peak = Math.max(peak, v);
    mdd = Math.max(mdd, peak - v);
  });
  const grp = (fn) => {
    const m = {};
    closed.forEach((t) => {
      const k = fn(t);
      const r = tradeCalc(t).R;
      if (r == null) return;
      (m[k] = m[k] || []).push(r);
    });
    return Object.entries(m).map(([k, a]) => ({ k, n: a.length, sum: a.reduce((x, y) => x + y, 0), wr: a.filter((r) => r > 0).length / a.length * 100 })).sort((a, b) => b.sum - a.sum);
  };
  const bySetup = grp((t) => t.setup || "\u2014");
  const byPlan = grp((t) => t.planned ? "Z planem (checklista OK)" : "Poza planem / impulsywnie");
  const byMonth = grp((t) => (t.closedAt || t.date).slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k));
  const mistakes = {};
  closed.forEach((t) => (t.mistakes || []).forEach((m) => {
    mistakes[m] = (mistakes[m] || 0) + 1;
  }));
  const accStat = (a) => {
    const at = (T.trades || []).filter((t) => t.acc === a.id && t.status === "closed");
    const pnl = (t) => {
      const c = tradeCalc(t);
      return c.R != null ? c.R * (c.riskPct / 100) * a.size : 0;
    };
    const bal = a.size + at.reduce((s, t) => s + pnl(t), 0);
    const today = at.filter((t) => (t.closedAt || "").slice(0, 10) === todayKey()).reduce((s, t) => s + pnl(t), 0);
    const openRisk = (T.trades || []).filter((t) => t.acc === a.id && t.status !== "closed").reduce((s, t) => s + (num(t.riskPct) || 0) / 100 * a.size, 0);
    const dailyLim = a.size * a.dailyDD / 100, maxFloor = a.size * (1 - a.maxDD / 100);
    return { bal, today, openRisk, dailyLeft: dailyLim + Math.min(0, today) - openRisk, dailyLim, maxLeft: bal - maxFloor, maxLim: a.size * a.maxDD / 100 };
  };
  const blank = () => ({ id: uid(), date: todayKey(), acc: accs[0] ? accs[0].id : "", inst: "XAUUSD", dir: "L", entry: "", sl: "", tp: "", exit: "", riskPct: "0.5", setup: T.setups[0] || "", checks: {}, planned: false, emotion: 3, notes: "", plan: "", chart: "", mistakes: [], status: "open" });
  const saveTrade = (t) => {
    const allChecked = T.checklist.every((c) => t.checks[c.id]);
    const nt = { ...t, planned: allChecked && !t.override };
    if (nt.exit !== "" && nt.status !== "closed") {
      nt.status = "closed";
      nt.closedAt = nt.closedAt || todayKey();
    }
    setTrades((p) => ({ ...p, trades: p.trades.some((x) => x.id === nt.id) ? p.trades.map((x) => x.id === nt.id ? nt : x) : [nt, ...p.trades] }));
    setForm(null);
    buzz(10);
  };
  const delTrade = (id) => {
    setTrades((p) => ({ ...p, trades: p.trades.filter((x) => x.id !== id) }));
    setForm(null);
  };
  const F = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const fc = form ? tradeCalc(form) : null;
  const checkedAll = form ? T.checklist.every((c) => form.checks[c.id]) : false;
  const seg3 = [["log", "Dziennik"], ["stats", "Statystyki"], ["acc", "Konta"]];
  const lbl = { fontSize: 12, color: "var(--muted)", margin: "12px 0 6px", display: "block" };
  const pill = (on, color) => ({ padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, border: on ? `1.5px solid ${color || "var(--green)"}` : "1px solid var(--line2)", background: on ? "rgba(34,197,94,.1)" : "var(--surface2)", color: on ? color || "var(--green2)" : "var(--muted)" });
  const statBox = (label, val, color) => /* @__PURE__ */ React.createElement("div", { style: { background: "var(--surface2)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, label), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 19, color: color || "var(--text)", marginTop: 2 } }, val));
  const TradeRow = ({ t }) => {
    const c = tradeCalc(t);
    const cl = t.status === "closed";
    return /* @__PURE__ */ React.createElement("div", { onClick: () => setForm({ ...t }), style: { display: "flex", alignItems: "center", gap: 10, padding: "12px", borderRadius: 13, background: "var(--surface)", border: "1px solid var(--line)", marginBottom: 8, cursor: "pointer" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, background: t.dir === "L" ? "rgba(34,197,94,.14)" : "rgba(248,113,113,.14)", color: t.dir === "L" ? "var(--green2)" : "var(--red)" } }, t.dir === "L" ? "BUY" : "SELL"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 700 } }, t.inst, " \xB7 ", t.setup || "\u2014"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 } }, t.date, " \xB7 ", accName(t.acc), " \xB7 ryzyko ", t.riskPct, "% \xB7 plan 1:", c.rr ? c.rr.toFixed(1) : "?", t.planned ? "" : " \xB7 \u26A0 poza planem")), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 15, color: !cl ? "var(--amber)" : c.R > 0 ? "var(--green2)" : c.R < 0 ? "var(--red)" : "var(--muted)" } }, cl ? fmtR(c.R) : "otwarty"));
  };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("header", { style: { paddingTop: 26, display: "flex", justifyContent: "space-between", alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Trading"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, closed.length, " zamkni\u0119tych \xB7 ", fmtR(sumR), " \xB7 WR ", Math.round(winRate), "%")), /* @__PURE__ */ React.createElement("button", { onClick: () => setForm(blank()), style: { ...iconBtn, width: "auto", padding: "0 14px", fontSize: 13, fontWeight: 700, color: "var(--green2)", display: "flex", alignItems: "center" } }, /* @__PURE__ */ React.createElement(Plus, { size: 15, style: { marginRight: 4 } }), "Trade")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 4, marginTop: 16 } }, seg3.map(([id, l]) => /* @__PURE__ */ React.createElement("button", { key: id, onClick: () => setSeg(id), style: { flex: 1, padding: 10, borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700, border: "none", background: seg === id ? "var(--surface2)" : "transparent", color: seg === id ? "var(--green2)" : "var(--muted)" } }, l))), accs.length > 1 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 10, overflowX: "auto" }, className: "noscroll" }, [{ id: "all", name: "Wszystkie" }, ...accs].map((a) => /* @__PURE__ */ React.createElement("button", { key: a.id, onClick: () => setFilterAcc(a.id), style: { ...pill(filterAcc === a.id), flexShrink: 0, padding: "6px 10px", fontSize: 12 } }, a.name))), seg === "log" && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12 } }, open.length > 0 && /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Otwarte"), open.map((t) => /* @__PURE__ */ React.createElement(TradeRow, { key: t.id, t })), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Zamkni\u0119te"), closed.length === 0 ? /* @__PURE__ */ React.createElement(Card, { style: { textAlign: "center", color: "var(--muted)", padding: 26 } }, "Brak trad\xF3w. Dodaj pierwszy \u2014 najpierw checklista, potem wej\u015Bcie.") : [...closed].reverse().map((t) => /* @__PURE__ */ React.createElement(TradeRow, { key: t.id, t }))), seg === "stats" && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, statBox("Suma R", fmtR(sumR), sumR >= 0 ? "var(--green2)" : "var(--red)"), statBox("Win rate", `${Math.round(winRate)}%`, winRate >= 70 ? "var(--green2)" : "var(--text)"), statBox("Oczekiwana warto\u015B\u0107 / trade", fmtR(Rs.length ? sumR / Rs.length : null)), statBox("Profit factor", pf === Infinity ? "\u221E" : pf ? pf.toFixed(2) : "\u2014"), statBox("\u015Ar. wygrana / strata", `${fmtR(wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null)} / ${fmtR(losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null)}`), statBox("Max obsuni\u0119cie", mdd ? `\u2212${mdd.toFixed(2)}R` : "0R", mdd ? "var(--amber)" : "var(--text)")), /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 10 }, pad: 12 }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 6 } }, "Krzywa kapita\u0142u (R)"), /* @__PURE__ */ React.createElement(EquityCurve, { points: curve })), [["Plan vs impuls \u2014 tu wida\u0107, ile kosztuje wej\u015Bcie \u201Ena widok wybicia\u201D", byPlan], ["Setupy", bySetup], ["Miesi\u0105ce", byMonth]].map(([title, rows]) => /* @__PURE__ */ React.createElement("div", { key: title }, /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, title), /* @__PURE__ */ React.createElement(Card, { pad: 6 }, rows.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { padding: 12, fontSize: 12.5, color: "var(--faint)" } }, "Brak danych") : rows.map((r, i) => /* @__PURE__ */ React.createElement("div", { key: r.k, style: { display: "flex", alignItems: "center", gap: 8, padding: "10px", borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, fontSize: 13, fontWeight: 600 } }, r.k), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, r.n, "\xD7 \xB7 WR ", Math.round(r.wr), "%"), /* @__PURE__ */ React.createElement("div", { style: { width: 70, textAlign: "right", fontWeight: 800, color: r.sum >= 0 ? "var(--green2)" : "var(--red)" } }, fmtR(r.sum))))))), Object.keys(mistakes).length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Najcz\u0119stsze b\u0142\u0119dy"), /* @__PURE__ */ React.createElement(Card, { pad: 12 }, Object.entries(mistakes).sort((a, b) => b[1] - a[1]).map(([m, n]) => /* @__PURE__ */ React.createElement("div", { key: m, style: { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" } }, /* @__PURE__ */ React.createElement("span", null, m), /* @__PURE__ */ React.createElement("b", { style: { color: "var(--amber)" } }, n, "\xD7")))))), seg === "acc" && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12 } }, accs.map((a) => {
    const s = accStat(a);
    return /* @__PURE__ */ React.createElement(Card, { key: a.id, style: { marginBottom: 10 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 800, fontSize: 15 } }, a.name), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: s.bal >= a.size ? "var(--green2)" : "var(--red)" } }, usd(s.bal))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 10 } }, "Dzienny limit straty (", a.dailyDD, "%) \u2014 zosta\u0142o ", usd(Math.max(0, s.dailyLeft)), s.openRisk ? ` (z otwartym ryzykiem ${usd(s.openRisk)})` : ""), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6 } }, /* @__PURE__ */ React.createElement(Bar, { pct: Math.max(0, Math.min(100, s.dailyLeft / s.dailyLim * 100)), color: s.dailyLeft / s.dailyLim < 0.4 ? "var(--red)" : "var(--green)" })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 10 } }, "Maks. obsuni\u0119cie (", a.maxDD, "%) \u2014 bufor ", usd(Math.max(0, s.maxLeft))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6 } }, /* @__PURE__ */ React.createElement(Bar, { pct: Math.max(0, Math.min(100, s.maxLeft / s.maxLim * 100)), color: s.maxLeft / s.maxLim < 0.4 ? "var(--red)" : "var(--gold)" })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
      if (accs.length > 1) setTrades((p) => ({ ...p, accounts: p.accounts.filter((x) => x.id !== a.id) }));
    }, style: { ...iconBtn, width: 36, height: 34, color: "var(--faint)" } }, /* @__PURE__ */ React.createElement(Trash2, { size: 14 }))));
  }), /* @__PURE__ */ React.createElement("button", { onClick: () => setAccOpen(true), style: { ...inputStyle, width: "100%", cursor: "pointer", color: "var(--green2)", fontWeight: 700, textAlign: "center", border: "1px dashed var(--line2)", background: "transparent" } }, "+ Dodaj konto (np. druga firma prop)"), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Checklista przed wej\u015Bciem"), /* @__PURE__ */ React.createElement(Card, { pad: 8 }, T.checklist.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 6px" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, fontSize: 13 } }, c.t), /* @__PURE__ */ React.createElement("button", { onClick: () => setTrades((p) => ({ ...p, checklist: p.checklist.filter((x) => x.id !== c.id) })), style: { ...iconBtn, width: 28, height: 28, border: "none", background: "transparent", color: "var(--faint)" } }, /* @__PURE__ */ React.createElement(X, { size: 14 })))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, padding: 6 } }, /* @__PURE__ */ React.createElement("input", { style: inputStyle, value: newCheck, placeholder: "Nowy punkt\u2026", onChange: (e) => setNewCheck(e.target.value) }), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    if (!newCheck.trim()) return;
    setTrades((p) => ({ ...p, checklist: [...p.checklist, { id: uid(), t: newCheck.trim() }] }));
    setNewCheck("");
  }, style: { ...iconBtn, flexShrink: 0 } }, /* @__PURE__ */ React.createElement(Plus, { size: 16 }))))), /* @__PURE__ */ React.createElement(AccSheet, { open: accOpen, onClose: () => setAccOpen(false), onAdd: (a) => {
    setTrades((p) => ({ ...p, accounts: [...p.accounts, a] }));
    setAccOpen(false);
  } }), /* @__PURE__ */ React.createElement(Sheet, { open: !!form, onClose: () => setForm(null), title: form && T.trades.some((x) => x.id === form.id) ? "Trade" : "Nowy trade" }, form && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: checkedAll ? "var(--green2)" : "var(--amber)" } }, "1 \xB7 Checklista przed wej\u015Bciem ", checkedAll ? "\u2713" : `(${T.checklist.filter((c) => form.checks[c.id]).length}/${T.checklist.length})`), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6 } }, T.checklist.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.id, onClick: () => F("checks", { ...form.checks, [c.id]: !form.checks[c.id] }), style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", cursor: "pointer" } }, /* @__PURE__ */ React.createElement(CheckBox, { on: !!form.checks[c.id] }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, color: form.checks[c.id] ? "var(--text)" : "var(--muted)" } }, c.t)))), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Plan trade'u (zapisz zanim klikniesz BUY/SELL)"), /* @__PURE__ */ React.createElement("textarea", { value: form.plan, onChange: (e) => F("plan", e.target.value), placeholder: "Dlaczego tu? Gdzie uniewa\u017Cnienie? Co musi si\u0119 sta\u0107, \u017Cebym wszed\u0142?", style: { ...inputStyle, width: "100%", minHeight: 70, resize: "vertical" } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 800, marginTop: 16 } }, "2 \xB7 Parametry"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => F("dir", "L"), style: { ...pill(form.dir === "L"), flex: 1 } }, "BUY"), /* @__PURE__ */ React.createElement("button", { onClick: () => F("dir", "S"), style: { ...pill(form.dir === "S", "var(--red)"), flex: 1 } }, "SELL")), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: lbl }, "Instrument"), /* @__PURE__ */ React.createElement("input", { style: inputStyle, value: form.inst, onChange: (e) => F("inst", e.target.value.toUpperCase()) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: lbl }, "Data"), /* @__PURE__ */ React.createElement("input", { type: "date", style: { ...inputStyle, colorScheme: "dark" }, value: form.date, onChange: (e) => F("date", e.target.value) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: lbl }, "Wej\u015Bcie"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inputStyle, value: form.entry, onChange: (e) => F("entry", e.target.value) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: lbl }, "Ryzyko % konta"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inputStyle, value: form.riskPct, onChange: (e) => F("riskPct", e.target.value) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: lbl }, "Stop loss"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inputStyle, value: form.sl, onChange: (e) => F("sl", e.target.value) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: lbl }, "Take profit"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inputStyle, value: form.tp, onChange: (e) => F("tp", e.target.value) }))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, marginTop: 8, color: fc.rr != null && fc.rr < 7 ? "var(--amber)" : "var(--muted)" } }, "SL ", fc.pipsSL != null ? Math.round(fc.pipsSL) : "\u2014", " pips \xB7 TP ", fc.pipsTP != null ? Math.round(fc.pipsTP) : "\u2014", " pips \xB7 R:R 1:", fc.rr != null ? fc.rr.toFixed(1) : "\u2014", fc.rr != null && fc.rr < 7 ? " \u2014 poni\u017Cej Twojego minimum 1:7" : ""), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Konto"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, accs.map((a) => /* @__PURE__ */ React.createElement("button", { key: a.id, onClick: () => F("acc", a.id), style: pill(form.acc === a.id) }, a.name))), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Setup"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, T.setups.map((s) => /* @__PURE__ */ React.createElement("button", { key: s, onClick: () => F("setup", s), style: pill(form.setup === s) }, s))), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Link do wykresu (TradingView \u2192 aparat \u2192 Copy link)"), /* @__PURE__ */ React.createElement("input", { style: inputStyle, value: form.chart, placeholder: "https://www.tradingview.com/x/\u2026", onChange: (e) => F("chart", e.target.value), autoCapitalize: "off" }), form.chart && /^https?:\/\//.test(form.chart) && /* @__PURE__ */ React.createElement("a", { href: form.chart, target: "_blank", rel: "noreferrer", style: { display: "inline-block", marginTop: 6, fontSize: 12.5, color: "var(--blue)" } }, "Otw\xF3rz wykres \u2197"), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Emocje przed wej\u015Bciem (1 spok\xF3j \u2014 5 FOMO)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, [1, 2, 3, 4, 5].map((n) => /* @__PURE__ */ React.createElement("button", { key: n, onClick: () => F("emotion", n), style: { ...pill(form.emotion === n, n >= 4 ? "var(--red)" : void 0), flex: 1 } }, n))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 800, marginTop: 16 } }, "3 \xB7 Wynik (po zamkni\u0119ciu)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => F("exit", form.tp), style: { ...pill(false), flex: 1 } }, "TP"), /* @__PURE__ */ React.createElement("button", { onClick: () => F("exit", form.sl), style: { ...pill(false), flex: 1 } }, "SL"), /* @__PURE__ */ React.createElement("button", { onClick: () => F("exit", form.entry), style: { ...pill(false), flex: 1 } }, "BE")), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Cena wyj\u015Bcia"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inputStyle, value: form.exit, onChange: (e) => F("exit", e.target.value), placeholder: "puste = trade otwarty" }), fc.R != null && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14, fontWeight: 800, marginTop: 8, color: fc.R >= 0 ? "var(--green2)" : "var(--red)" } }, fmtR(fc.R), accs.find((a) => a.id === form.acc) ? ` \xB7 ${usd(fc.R * fc.riskPct / 100 * accs.find((a) => a.id === form.acc).size)}` : ""), /* @__PURE__ */ React.createElement("label", { style: lbl }, "B\u0142\u0119dy"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, MISTAKES.map((m) => {
    const on = (form.mistakes || []).includes(m);
    return /* @__PURE__ */ React.createElement("button", { key: m, onClick: () => F("mistakes", on ? form.mistakes.filter((x) => x !== m) : [...form.mistakes || [], m]), style: { ...pill(on, "var(--amber)"), fontSize: 12, padding: "6px 10px" } }, m);
  })), /* @__PURE__ */ React.createElement("label", { style: lbl }, "Wnioski"), /* @__PURE__ */ React.createElement("textarea", { value: form.notes, onChange: (e) => F("notes", e.target.value), placeholder: "Co zrobi\u0142em dobrze? Co poprawi\u0119 nast\u0119pnym razem?", style: { ...inputStyle, width: "100%", minHeight: 60, resize: "vertical" } }), !checkedAll && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--amber)", marginTop: 14, lineHeight: 1.45 } }, "Checklista niepe\u0142na \u2014 trade zostanie oznaczony jako \u201Epoza planem\u201D. Statystyki poka\u017C\u0105, ile Ci\u0119 to kosztuje."), /* @__PURE__ */ React.createElement("button", { onClick: () => saveTrade(form), style: checkedAll ? btnPrimary : { ...btnPrimary, background: "linear-gradient(135deg, var(--amber), #d48a0a)", color: "#1a1200" } }, checkedAll ? "Zapisz trade" : "Zapisz mimo to (poza planem)"), T.trades.some((x) => x.id === form.id) && /* @__PURE__ */ React.createElement("button", { onClick: () => delTrade(form.id), style: { ...inputStyle, width: "100%", marginTop: 10, cursor: "pointer", color: "var(--red)", textAlign: "center", background: "transparent" } }, "Usu\u0144 trade"))));
}
function AccSheet({ open, onClose, onAdd }) {
  const [n, setN] = useState("");
  const [s, setS] = useState("100000");
  const [d, setD] = useState("5");
  const [m, setM] = useState("10");
  return /* @__PURE__ */ React.createElement(Sheet, { open, onClose, title: "Nowe konto" }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 } }, "Nazwa"), /* @__PURE__ */ React.createElement("input", { style: inputStyle, value: n, placeholder: "np. The5ers 100k", onChange: (e) => setN(e.target.value) }), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 12, color: "var(--muted)" } }, "Wielko\u015B\u0107 $"), /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", style: inputStyle, value: s, onChange: (e) => setS(e.target.value) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 12, color: "var(--muted)" } }, "Dzienny DD %"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inputStyle, value: d, onChange: (e) => setD(e.target.value) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 12, color: "var(--muted)" } }, "Maks. DD %"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inputStyle, value: m, onChange: (e) => setM(e.target.value) }))), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    if (!n.trim()) return;
    onAdd({ id: uid(), name: n.trim(), size: num(s) || 1e5, dailyDD: num(d) || 5, maxDD: num(m) || 10 });
    setN("");
  }, style: btnPrimary }, "Dodaj konto"));
}

const PF = {
  egg: { n: "Jajka", u: "szt", kcal: 78, p: 6.3, c: 0.6, f: 5.3 },
  butter: { n: "Mas\u0142o (do sma\u017Cenia)", u: "g", kcal: 717, p: 0.9, c: 0.1, f: 81 },
  avo: { n: "Awokado (mi\u0105\u017Csz)", u: "g", kcal: 160, p: 2, c: 9, f: 15 },
  cheese: { n: "Ser dojrzewaj\u0105cy (gouda)", u: "g", kcal: 356, p: 25, c: 2, f: 27 },
  bread: { n: "Chleb na zakwasie", u: "g", kcal: 240, p: 8, c: 48, f: 1.2 },
  brazil: { n: "Orzechy brazylijskie", u: "szt", kcal: 33, p: 0.7, c: 0.6, f: 3.4 },
  ribeye: { n: "Wo\u0142owina \u2014 antrykot", u: "g", kcal: 280, p: 24, c: 0, f: 20 },
  liver: { n: "W\u0105tr\xF3bka wo\u0142owa", u: "g", kcal: 135, p: 20, c: 4, f: 3.6 },
  salmon: { n: "\u0141oso\u015B", u: "g", kcal: 208, p: 20, c: 0, f: 13 },
  mackerel: { n: "Makrela", u: "g", kcal: 205, p: 19, c: 0, f: 14 },
  olive: { n: "Oliwa extra virgin", u: "g", kcal: 884, p: 0, c: 0, f: 100 },
  veg: { n: "Warzywa gotowane (broku\u0142, szpinak, papryka)", u: "g", kcal: 35, p: 2.4, c: 7, f: 0.4 },
  choc: { n: "Gorzka czekolada 85%", u: "g", kcal: 590, p: 10, c: 22, f: 46 },
  milk: { n: "Mleko 3,2% / kefir", u: "ml", kcal: 61, p: 3.2, c: 4.7, f: 3.2 },
  cream: { n: "\u015Amietanka 30%", u: "ml", kcal: 292, p: 2.3, c: 3, f: 30 },
  yog: { n: "Jogurt grecki 10%", u: "g", kcal: 120, p: 5, c: 4, f: 10 },
  banana: { n: "Banan", u: "szt", kcal: 105, p: 1.3, c: 27, f: 0.4 },
  honey: { n: "Mi\xF3d", u: "g", kcal: 304, p: 0.3, c: 82, f: 0 }
};
const STAGES = [
  { k: 1, label: "Etap 1", sub: "tydz. 1\u20132", mult: 0.75 },
  { k: 2, label: "Etap 2", sub: "tydz. 3\u20134", mult: 0.88 },
  { k: 3, label: "Etap 3", sub: "od tyg. 5", mult: 1 }
];
const WEEK_PL = ["Pn", "Wt", "\u015Ar", "Cz", "Pt", "So", "Nd"];
const WEEK_FULL = ["Poniedzia\u0142ek", "Wtorek", "\u015Aroda", "Czwartek", "Pi\u0105tek", "Sobota", "Niedziela"];
const P2_ROT = ["beef", "salmon", "beef", "liver", "mackerel", "beef", "beef"];
const P2_LABEL = { beef: "Wo\u0142owina", salmon: "\u0141oso\u015B", liver: "W\u0105tr\xF3bka + wo\u0142owina", mackerel: "Makrela" };
const mealsFor = (wd) => {
  const rot = P2_ROT[wd];
  const protein = rot === "beef" ? [["ribeye", 300]] : rot === "liver" ? [["liver", 100], ["ribeye", 200]] : [[rot, 300]];
  return [
    { id: "m1", name: "Posi\u0142ek 1", hint: "przed zmian\u0105 / na jej pocz\u0105tku \xB7 min. 1,5 h po pobudce", items: [["egg", 4], ["butter", 20], ["avo", 150], ["cheese", 50], ["bread", 50], ["brazil", 2]] },
    { id: "m2", name: `Posi\u0142ek 2 \u2014 ${P2_LABEL[rot]}`, hint: "w pracy \xB7 g\u0142\xF3wna przerwa \xB7 najwi\u0119kszy posi\u0142ek", tag: rot, items: [...protein, ["olive", rot === "beef" || rot === "liver" ? 25 : 30], ["veg", 200], ["choc", 30]] },
    { id: "m3", name: "Koktajl", hint: "druga po\u0142owa zmiany", items: [["milk", 400], ["cream", 80], ["yog", 150], ["banana", 1], ["honey", 20]] }
  ];
};
const stageG = (key, g, mult) => {
  const it = PF[key];
  const v = g * mult;
  return it.u === "szt" ? Math.max(1, Math.round(v)) : Math.round(v / 5) * 5;
};
const macroOf = (key, qty) => {
  const it = PF[key];
  const k = (parseFloat(qty) || 0) / (it.u === "szt" ? 1 : 100);
  return { kcal: it.kcal * k, p: it.p * k, c: it.c * k, f: it.f * k };
};
const addM = (a, b) => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f });
const ZERO = { kcal: 0, p: 0, c: 0, f: 0 };
const weekdayIdx = (key) => ((/* @__PURE__ */ new Date(key + "T12:00:00")).getDay() + 6) % 7;
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const weekKeys = (offset = 0) => {
  const d = /* @__PURE__ */ new Date(todayKey() + "T12:00:00");
  d.setDate(d.getDate() - (d.getDay() + 6) % 7 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return keyOf(x);
  });
};
const hm = (t) => {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const nowHM = () => {
  const n = /* @__PURE__ */ new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
};
const evalPlanDay = (key, rec, mult) => {
  const mp = rec && rec.mplan || {};
  const meals = mealsFor(weekdayIdx(key));
  let planned = ZERO, eaten = ZERO;
  const mealSums = {};
  meals.forEach((m) => {
    let ms = ZERO, msPlan = ZERO;
    m.items.forEach(([k, g]) => {
      const iid = `${m.id}_${k}`;
      const def = stageG(k, g, mult);
      const qty = mp.g && mp.g[iid] != null && mp.g[iid] !== "" ? mp.g[iid] : def;
      ms = addM(ms, macroOf(k, qty));
      msPlan = addM(msPlan, macroOf(k, def));
    });
    mealSums[m.id] = ms;
    planned = addM(planned, msPlan);
    if (mp[m.id] && mp[m.id].done) eaten = addM(eaten, ms);
  });
  const done = meals.filter((m) => mp[m.id] && mp[m.id].done);
  const anyDone = done.length > 0;
  const rules = [];
  rules.push({ id: "kcal", label: `Kalorie \u2265 95% celu (${Math.round(planned.kcal)} kcal)`, ok: eaten.kcal >= planned.kcal * 0.95, val: `${Math.round(eaten.kcal)} kcal` });
  rules.push({ id: "prot", label: `Bia\u0142ko \u2265 ${Math.round(planned.p * 0.9)} g`, ok: eaten.p >= planned.p * 0.9, val: `${Math.round(eaten.p)} g` });
  const fatPct = eaten.kcal ? eaten.f * 9 / eaten.kcal * 100 : 0;
  rules.push({ id: "fat", label: "T\u0142uszcz \u2265 50% kalorii", ok: anyDone && fatPct >= 50, val: anyDone ? `${Math.round(fatPct)}%` : "\u2014" });
  const m2 = mp.m2 && mp.m2.done;
  const biggest = m2 && mealSums.m2.kcal >= mealSums.m1.kcal && mealSums.m2.kcal >= mealSums.m3.kcal;
  rules.push({ id: "big", label: "Najwi\u0119kszy posi\u0142ek w pracy (Posi\u0142ek 2)", ok: !!biggest, val: m2 ? `${Math.round(mealSums.m2.kcal)} kcal` : "\u2014" });
  const wake = hm(mp.wake), sleep = hm(mp.sleep);
  let winOk = false, winVal = "wpisz pobudk\u0119 i sen";
  if (wake != null && sleep != null && anyDone) {
    const rel = (t) => (t - wake + 1440) % 1440;
    const relSleep = rel(sleep) || 1440;
    const bad = done.filter((m) => {
      const t = hm(mp[m.id].t);
      if (t == null) return false;
      const r = rel(t);
      return r < 90 || r > relSleep - 90;
    });
    winOk = bad.length === 0;
    winVal = winOk ? "OK" : `poza oknem: ${bad.map((m) => m.name.split(" \u2014")[0]).join(", ")}`;
  } else if (wake != null && sleep != null) winVal = "\u2014";
  rules.push({ id: "win", label: "Nic 1,5 h po pobudce i przed snem", ok: winOk, val: winVal });
  const passed = rules.filter((r) => r.ok).length;
  return { meals, mealSums, planned, eaten, rules, passed, mp, tag: P2_ROT[weekdayIdx(key)], done };
};
function MealPlan({ daily, setDayFor, diet, setDiet }) {
  const tk = todayKey();
  const [off, setOff] = useState(0);
  const keys = weekKeys(off);
  const [sel, setSel] = useState(tk);
  const selKey = keys.includes(sel) ? sel : keys[0];
  const stage = diet.stage || 1;
  const mult = (STAGES.find((s) => s.k === stage) || STAGES[0]).mult;
  const ev = evalPlanDay(selKey, daily[selKey], mult);
  const mp = ev.mp;
  const patch = (fn) => setDayFor(selKey, (c) => ({ ...c, mplan: fn(c.mplan || {}) }));
  const toggleMeal = (m) => {
    buzz(8);
    patch((p) => {
      const cur = p[m.id] || {};
      return { ...p, [m.id]: { ...cur, done: !cur.done, t: !cur.done ? cur.t || (selKey === tk ? nowHM() : "") : cur.t } };
    });
  };
  const setG = (iid, v) => patch((p) => ({ ...p, g: { ...p.g || {}, [iid]: v.replace(",", ".").replace(/[^0-9.]/g, "") } }));
  const setField = (f, v) => patch((p) => ({ ...p, [f]: v }));
  const setMealT = (m, v) => patch((p) => ({ ...p, [m.id]: { ...p[m.id] || {}, t: v } }));
  const evs = keys.map((k) => evalPlanDay(k, daily[k], mult));
  const daysFull = evs.filter((e) => e.passed === e.rules.length).length;
  const liverWk = evs.filter((e) => e.tag === "liver" && e.mp.m2 && e.mp.m2.done).length;
  const fishWk = evs.filter((e) => (e.tag === "salmon" || e.tag === "mackerel") && e.mp.m2 && e.mp.m2.done).length;
  const weights = (ks) => ks.map((k) => parseFloat(((daily[k] || {}).mplan || {}).weight)).filter((x) => x > 0);
  const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const wNow = avg(weights(keys)), wPrev = avg(weights(weekKeys(off - 1)));
  const tInput = { ...inputStyle, padding: "8px 8px", fontSize: 14, fontWeight: 700, textAlign: "center" };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14 }, pad: 12 }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 8 } }, "Rozpychanie \u017Co\u0142\u0105dka \u2014 przejd\u017A dalej, gdy etap jest komfortowy przez 4\u20135 dni"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, STAGES.map((s) => /* @__PURE__ */ React.createElement("button", { key: s.k, onClick: () => {
    buzz(5);
    setDiet((d) => ({ ...d, stage: s.k }));
  }, style: {
    flex: 1,
    padding: "9px 4px",
    borderRadius: 11,
    cursor: "pointer",
    border: stage === s.k ? "1.5px solid var(--green)" : "1px solid var(--line2)",
    background: stage === s.k ? "rgba(34,197,94,.12)" : "var(--surface2)",
    color: stage === s.k ? "var(--green2)" : "var(--muted)"
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 800 } }, s.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5 } }, s.sub, " \xB7 ", Math.round(evalPlanDay(selKey, null, s.mult).planned.kcal / 50) * 50))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 14 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setOff(off - 1), style: { ...iconBtn, width: 34, height: 34 } }, /* @__PURE__ */ React.createElement(ChevronLeft, { size: 16 })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 } }, keys.map((k, i) => {
    const e = evs[i];
    const on = k === selKey;
    const full = e.passed === e.rules.length;
    const some = e.done.length > 0;
    return /* @__PURE__ */ React.createElement("button", { key: k, onClick: () => setSel(k), style: {
      padding: "7px 0",
      borderRadius: 10,
      cursor: "pointer",
      border: on ? "1.5px solid var(--gold)" : "1px solid var(--line)",
      background: on ? "rgba(245,181,61,.12)" : "var(--surface)",
      color: k === tk ? "var(--gold2)" : "var(--text)"
    } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800 } }, WEEK_PL[i]), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--muted)" } }, parseInt(k.slice(8))), /* @__PURE__ */ React.createElement("div", { style: { width: 6, height: 6, borderRadius: 9, margin: "3px auto 0", background: full ? "var(--green)" : some ? "var(--amber)" : "var(--line2)" } }));
  })), /* @__PURE__ */ React.createElement("button", { onClick: () => setOff(off + 1), style: { ...iconBtn, width: 34, height: 34 } }, /* @__PURE__ */ React.createElement(ChevronRight, { size: 16 }))), /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 12 }, pad: 12 }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, marginBottom: 10 } }, WEEK_FULL[weekdayIdx(selKey)], " ", selKey === tk ? "\xB7 dzi\u015B" : ""), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: 11, color: "var(--muted)" } }, "Pobudka", /* @__PURE__ */ React.createElement("input", { type: "time", value: mp.wake || "", onChange: (e) => setField("wake", e.target.value), style: { ...tInput, marginTop: 4 } })), /* @__PURE__ */ React.createElement("label", { style: { fontSize: 11, color: "var(--muted)" } }, "Sen", /* @__PURE__ */ React.createElement("input", { type: "time", value: mp.sleep || "", onChange: (e) => setField("sleep", e.target.value), style: { ...tInput, marginTop: 4 } })), /* @__PURE__ */ React.createElement("label", { style: { fontSize: 11, color: "var(--muted)" } }, "Waga rano", /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", placeholder: "kg", value: mp.weight || "", onChange: (e) => setField("weight", e.target.value.replace(",", ".").replace(/[^0-9.]/g, "")), style: { ...tInput, marginTop: 4 } })))), ev.meals.map((m) => {
    const st = mp[m.id] || {};
    const s = ev.mealSums[m.id];
    return /* @__PURE__ */ React.createElement(Card, { key: m.id, style: { marginTop: 10, border: st.done ? "1px solid rgba(34,197,94,.45)" : void 0 }, pad: 13 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { onClick: () => toggleMeal(m), style: { cursor: "pointer", paddingTop: 2 } }, /* @__PURE__ */ React.createElement(CheckBox, { on: !!st.done })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 }, onClick: () => toggleMeal(m) }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14.5, fontWeight: 800, cursor: "pointer" } }, m.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 } }, m.hint)), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 15 } }, Math.round(s.kcal)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--muted)" } }, "B ", Math.round(s.p), " \xB7 T ", Math.round(s.f), " \xB7 W ", Math.round(s.c)))), st.done && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--muted)" } }, "Zjedzone o ", /* @__PURE__ */ React.createElement("input", { type: "time", value: st.t || "", onChange: (e) => setMealT(m, e.target.value), style: { ...tInput, width: 96, padding: "5px 6px", fontSize: 13 } })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, borderTop: "1px solid var(--line)" } }, m.items.map(([k, g]) => {
      const iid = `${m.id}_${k}`;
      const it = PF[k];
      const def = stageG(k, g, mult);
      const val = mp.g && mp.g[iid] != null ? mp.g[iid] : "";
      const changed = val !== "" && parseFloat(val) !== def;
      return /* @__PURE__ */ React.createElement("div", { key: iid, style: { display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--line)" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0, fontSize: 13 } }, it.n), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", value: val, placeholder: String(def), onChange: (e) => setG(iid, e.target.value), style: { ...inputStyle, width: 70, padding: "6px 6px", textAlign: "center", fontSize: 13.5, fontWeight: 700, color: changed ? "var(--gold2)" : "var(--text)" } }), /* @__PURE__ */ React.createElement("div", { style: { width: 24, fontSize: 11, color: "var(--faint)" } }, it.u));
    })));
  }), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Zasady dnia \xB7 ", ev.passed, "/", ev.rules.length), /* @__PURE__ */ React.createElement(Card, { pad: 6 }, ev.rules.map((r, i) => /* @__PURE__ */ React.createElement("div", { key: r.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderBottom: i < ev.rules.length - 1 ? "1px solid var(--line)" : "none" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 22, height: 22, borderRadius: 7, display: "grid", placeItems: "center", background: r.ok ? "var(--green)" : "var(--surface2)", border: r.ok ? "none" : "1px solid var(--line2)" } }, r.ok ? /* @__PURE__ */ React.createElement(Check, { size: 14, color: "#04130a", strokeWidth: 3 }) : /* @__PURE__ */ React.createElement(X, { size: 12, color: "var(--faint)" })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, fontSize: 13, fontWeight: 600, color: r.ok ? "var(--text)" : "var(--muted)" } }, r.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: r.ok ? "var(--green2)" : "var(--faint)", textAlign: "right", maxWidth: 120 } }, r.val)))), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Tydzie\u0144"), /* @__PURE__ */ React.createElement(Card, { pad: 6 }, [
    { label: "Dni z kompletem zasad", ok: daysFull >= 5, val: `${daysFull}/7` },
    { label: "W\u0105tr\xF3bka \u2265 1\xD7 w tygodniu", ok: liverWk >= 1, val: `${liverWk}\xD7` },
    { label: "Ryba \u2265 2\xD7 w tygodniu", ok: fishWk >= 2, val: `${fishWk}\xD7` },
    { label: "\u015Arednia waga (vs poprz. tydzie\u0144)", ok: wNow != null && wPrev != null && wNow > wPrev, val: wNow == null ? "\u2014" : `${wNow.toFixed(1)} kg${wPrev != null ? ` (${wNow - wPrev >= 0 ? "+" : ""}${(wNow - wPrev).toFixed(2)})` : ""}` }
  ].map((r, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderBottom: i < 3 ? "1px solid var(--line)" : "none" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 22, height: 22, borderRadius: 7, display: "grid", placeItems: "center", background: r.ok ? "var(--green)" : "var(--surface2)", border: r.ok ? "none" : "1px solid var(--line2)" } }, r.ok ? /* @__PURE__ */ React.createElement(Check, { size: 14, color: "#04130a", strokeWidth: 3 }) : /* @__PURE__ */ React.createElement(X, { size: 12, color: "var(--faint)" })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, fontSize: 13, fontWeight: 600, color: r.ok ? "var(--text)" : "var(--muted)" } }, r.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: r.ok ? "var(--green2)" : "var(--faint)" } }, r.val)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", textAlign: "center", margin: "12px 8px 4px", lineHeight: 1.45 } }, "Wpisz gramatur\u0119 tylko gdy r\xF3\u017Cni si\u0119 od planu (puste = plan). Brak wzrostu \u015Bredniej wagi przez 2 tyg. \u2192 +1 \u0142y\u017Cka oliwy w P2 albo wi\u0119cej \u015Bmietanki w koktajlu."));
}

const SHOP_EPOCH = "2026-11-23";
const addDays = (key, n) => {
  const d = /* @__PURE__ */ new Date(key + "T12:00:00");
  d.setDate(d.getDate() + n);
  return keyOf(d);
};
const shopWindow = (key) => {
  const days = Math.floor((/* @__PURE__ */ new Date(key + "T12:00:00") - /* @__PURE__ */ new Date(SHOP_EPOCH + "T12:00:00")) / 864e5);
  const idx = Math.floor(days / 3);
  const start = addDays(SHOP_EPOCH, idx * 3);
  return { start, days: [start, addDays(start, 1), addDays(start, 2)], next: addDays(start, 3) };
};
const fmtQty = (q, u) => {
  if (u === "szt") return `${Math.ceil(q)} szt`;
  const big = u === "ml" ? "l" : "kg";
  if (q >= 1e3) return `${(Math.round(q / 100) / 10).toLocaleString("pl-PL")} ${big}`;
  return `${Math.round(q / 10) * 10} ${u}`;
};
const SHOP_HINT = {
  avo: (q) => `\u2248 ${Math.ceil(q / 150)} szt`,
  bread: (q) => `\u2248 ${Math.max(1, Math.ceil(q / 500))} bochenek`,
  choc: (q) => `\u2248 ${Math.max(1, Math.ceil(q / 100))} tabliczki 100 g`,
  milk: (q) => `\u2248 ${Math.max(1, Math.ceil(q / 1e3))} karton(y) 1 l`,
  cream: (q) => `\u2248 ${Math.max(1, Math.ceil(q / 250))} \xD7 250 ml`,
  olive: (q) => q < 300 ? "sprawd\u017A zapas" : "kup butelk\u0119",
  honey: () => "sprawd\u017A zapas",
  butter: (q) => `\u2248 ${Math.max(1, Math.ceil(q / 250))} kostka`,
  egg: (q) => `\u2248 ${Math.ceil(q / 10)} op. po 10`
};
const buildAutoShop = (daily, mult, store) => {
  const w = shopWindow(todayKey());
  const tot = {};
  w.days.forEach((k) => {
    const mp = (daily[k] || {}).mplan || {};
    mealsFor(weekdayIdx(k)).forEach((m) => m.items.forEach(([key, g]) => {
      const iid = `${m.id}_${key}`;
      const ov = mp.g && mp.g[iid] != null && mp.g[iid] !== "" ? parseFloat(mp.g[iid]) : null;
      tot[key] = (tot[key] || 0) + (ov != null && !isNaN(ov) ? ov : stageG(key, g, mult));
    }));
  });
  const items = Object.entries(tot).filter(([, q]) => q > 0).map(([key, q]) => {
    const it = PF[key];
    const hint = SHOP_HINT[key] ? ` (${SHOP_HINT[key](q)})` : "";
    return { id: `auto_${key}`, name: `\u{1F4CB} ${it.n} \u2014 ${fmtQty(q, it.u)}${hint}`, store, done: false, auto: true };
  });
  return { win: w.start, items };
};
const mergeAutoShop = (shopping, built, force) => {
  const sameWin = shopping.autoWin === built.win;
  const prev = {};
  (shopping.items || []).forEach((it) => {
    if (it.auto) prev[it.id] = it;
  });
  const autoItems = built.items.map((it) => sameWin && prev[it.id] ? { ...it, done: prev[it.id].done, price: prev[it.id].price, store: prev[it.id].store || it.store, txId: prev[it.id].txId, txDate: prev[it.id].txDate } : it);
  return { ...shopping, autoWin: built.win, items: [...autoItems, ...(shopping.items || []).filter((it) => !it.auto)] };
};
function AutoShopBar({ shopping, setShopping, daily, diet }) {
  const w = shopWindow(todayKey());
  const mult = (STAGES.find((s) => s.k === (diet.stage || 1)) || STAGES[0]).mult;
  const fmt = (k) => `${parseInt(k.slice(8))}.${k.slice(5, 7)}`;
  const refresh = () => {
    buzz(8);
    setShopping((p) => mergeAutoShop(p, buildAutoShop(daily, mult, (p.stores || [])[0] || "Sklep"), true));
  };
  return /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14 }, pad: 12 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 800 } }, "\u{1F4CB} Lista z planu diety"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 } }, "Na ", fmt(w.days[0]), "\u2013", fmt(w.days[2]), " \xB7 nowa lista ", fmt(w.next), " \xB7 etap ", diet.stage || 1)), /* @__PURE__ */ React.createElement("button", { onClick: refresh, style: { ...iconBtn, width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 700, color: "var(--green2)" } }, "Od\u015Bwie\u017C")));
}


/* ───── Zakupy → Finanse: automatyczna kategoryzacja odhaczonych pozycji ───── */
const SHOP_RULES = [
  [/paliw|benzyn|diesel|myjni|parking|olej silnik/i, /transport|paliw|auto|van/i],
  [/flyer|ulotk|wizytów|sprzęt|druk|domen|hosting|biuro/i, /biznes|firma|d2d|saas/i],
  [/czynsz|prąd|gaz|internet|rachun/i, /mieszkan|czynsz|dom/i],
  [/kino|gra|netflix|spotify|bilet|prezent|alkohol|piwo/i, /rozrywk|inne|fun/i],
];
const FOOD_WORDS = /jaj|mas[łl]|awokad|ser|chleb|orzech|wołow|wołowina|antrykot|wątrób|łoso|makrel|ryb|oliw|warzyw|brokuł|szpinak|papryk|czekolad|mlek|kefir|śmietan|jogurt|banan|miód|kurcz|indyk|ryż|makaron|kasz|twaróg|kwark|owoc|mięs|suplement|kreatyn|magnez|omega|witamin|białk|płatk/i;
const findCat = (cats, re) => (cats || []).find((c) => re.test(c.name));
const shopCatFor = (finance, it) => {
  const cats = finance.cats || [];
  const food = findCat(cats, /jedzen|żywn|spożyw|food/i);
  if (it.auto || FOOD_WORDS.test(it.name)) return (food || cats[0] || {}).id || null;
  for (const [itemRe, catRe] of SHOP_RULES) if (itemRe.test(it.name)) { const c = findCat(cats, catRe); if (c) return c.id; }
  const other = findCat(cats, /inne|rozrywk/i);
  return (other || food || cats[0] || {}).id || null;
};
const shopTxNote = (it) => "Zakupy · " + it.name.replace(/^📋\s*/, "").replace(/\s*\(.*\)\s*$/, "") + (it.store ? " (" + it.store + ")" : "");

const lsJSON = (k, fb) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
};
const dietMultOf = (diet) => (STAGES.find((x) => x.k === (diet && diet.stage || 1)) || STAGES[0]).mult;
const tradePnl = (t, accs) => {
  const a = (accs || []).find((x) => x.id === t.acc);
  const c = tradeCalc(t);
  return a && c.R != null ? c.R * (c.riskPct / 100) * a.size : 0;
};
const winEval = (key, rec, habits, diet, trades) => {
  rec = rec || {};
  const hb = habits || [];
  const habPct = hb.length ? hb.filter((h) => rec.habits && rec.habits[h.id]).length / hb.length : 0;
  const pe = evalPlanDay(key, rec, dietMultOf(diet));
  const offPlan = (trades && trades.trades || []).filter((t) => t.date === key && !t.planned).length;
  const conds = [
    { id: "train", label: rec.restDay ? "Dzie\u0144 regeneracji" : "Trening z kolejki", ok: !!rec.workoutDone || !!rec.restDay, tap: true },
    { id: "diet", label: `Zasady diety ${pe.passed}/${pe.rules.length}`, ok: pe.passed === pe.rules.length },
    { id: "habits", label: `Nawyki ${Math.round(habPct * 100)}% (min. 80%)`, ok: habPct >= 0.8 },
    { id: "trade", label: offPlan ? `${offPlan} trade poza planem` : "Zero trade'\xF3w poza planem", ok: offPlan === 0 }
  ];
  return { conds, won: conds.every((c) => c.ok), n: conds.filter((c) => c.ok).length };
};
function WinDayCard({ daily, day, setDay, habits, diet }) {
  const trades = lsJSON("mp_trades_v1", { trades: [] });
  const tk = todayKey();
  const ev = winEval(tk, day, habits, diet, trades);
  let streak = 0;
  {
    let d = /* @__PURE__ */ new Date(tk + "T12:00:00");
    if (!ev.won) d.setDate(d.getDate() - 1);
    for (let i = 0; i < 400; i++) {
      const k = keyOf(d);
      if (!daily[k] || !winEval(k, daily[k], habits, diet, trades).won) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
  }
  return /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14, border: ev.won ? "1px solid rgba(245,181,61,.55)" : void 0, background: ev.won ? "linear-gradient(135deg, rgba(245,181,61,.10), var(--surface))" : void 0 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 16 } }, ev.won ? "\u{1F3C6} Dzie\u0144 wygrany" : "Dzie\u0144 wygrany?"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2 } }, ev.n, "/", ev.conds.length, " warunk\xF3w \xB7 seria ", streak, " ", streak === 1 ? "dzie\u0144" : "dni")), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: ev.won ? "var(--gold2)" : "var(--faint)" } }, "\u{1F525}", streak)), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, ev.conds.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.id, onClick: c.tap && !day.workoutDone ? () => {
    buzz(8);
    setDay((x) => ({ ...x, restDay: !x.restDay }));
  } : void 0, style: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: c.tap && !day.workoutDone ? "pointer" : "default" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", background: c.ok ? "var(--green)" : "var(--surface2)", border: c.ok ? "none" : "1px solid var(--line2)" } }, c.ok ? /* @__PURE__ */ React.createElement(Check, { size: 13, color: "#04130a", strokeWidth: 3 }) : null), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, fontSize: 13, fontWeight: 600, color: c.ok ? "var(--text)" : "var(--muted)" } }, c.label), c.tap && !day.workoutDone && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--faint)" } }, day.restDay ? "cofnij" : "dzie\u0144 wolny?")))));
}
const SEED_GATE = { savings: "", costs: "", months: 12, eurPerUsd: 0.92, split: 80, live: false };
const gateStore = {
  v: lsJSON("mp_gate_v1", SEED_GATE),
  subs: /* @__PURE__ */ new Set(),
  set(p) {
    this.v = { ...this.v, ...p };
    save("mp_gate_v1", this.v);
    this.subs.forEach((f) => f(this.v));
  },
  replace(v) {
    this.v = { ...SEED_GATE, ...v || {} };
    this.subs.forEach((f) => f(this.v));
  }
};
function ExitGate({ finance, setFinance, setToast }) {
  const [g, setG] = useState(gateStore.v);
  useEffect(() => {
    gateStore.subs.add(setG);
    return () => gateStore.subs.delete(setG);
  }, []);
  const T = lsJSON("mp_trades_v1", { trades: [], accounts: [] });
  const costs = num(g.costs) || Math.round(finance.capital || 0);
  const savings = num(g.savings) != null ? num(g.savings) : Math.round(finance.vault || 0);
  const runway = costs ? savings / costs : 0;
  const now = /* @__PURE__ */ new Date(todayKey() + "T12:00:00");
  const months = [3, 2, 1].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  });
  const perMonth = months.map((m) => {
    const usdV = (T.trades || []).filter((t) => t.status === "closed" && (t.closedAt || t.date || "").slice(0, 7) === m).reduce((s, t) => s + tradePnl(t, T.accounts), 0);
    return { m, eur: usdV * (num(g.eurPerUsd) || 0.92) * ((num(g.split) || 80) / 100) };
  });
  const avg = perMonth.reduce((s, x) => s + x.eur, 0) / 3;
  const allPositive = perMonth.every((x) => x.eur > 0);
  const pRun = Math.min(100, runway / (num(g.months) || 12) * 100);
  const pInc = costs ? Math.min(100, Math.max(0, avg / costs * 100)) : 0;
  const ready = pRun >= 100 && pInc >= 100 && allPositive && g.live;
  const inp = { ...inputStyle, padding: "9px 10px", fontSize: 14, fontWeight: 700 };
  const lbl = { fontSize: 11.5, color: "var(--muted)", display: "block", marginBottom: 4 };
  const eurF = (n) => "\u20AC" + Math.round(n).toLocaleString("pl-PL");
  const mName = (m) => ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "pa\u017A", "lis", "gru"][parseInt(m.slice(5)) - 1];
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("header", { style: { paddingTop: 26 } }, /* @__PURE__ */ React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Brama wyj\u015Bcia \u{1F6AA}"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, "Odchodzisz z Mauser, gdy dane \u2014 nie emocje \u2014 m\xF3wi\u0105 \u201Etak\u201D")), /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 16, textAlign: "center", border: ready ? "1px solid var(--green)" : void 0 }, pad: 18 }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: "var(--muted)" } }, "Status"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, marginTop: 4, color: ready ? "var(--green2)" : "var(--gold2)" } }, ready ? "Warunki spe\u0142nione" : `${Math.round((pRun + pInc) / 2)}% drogi`), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", marginTop: 6 } }, ready ? "Podejmij decyzj\u0119 na spokojnie, po jednej nocy snu." : "Wszystkie 4 warunki musz\u0105 by\u0107 zielone jednocze\u015Bnie.")), [
    { t: `1 \xB7 Poduszka: ${runway.toFixed(1)} / ${num(g.months) || 12} mies. koszt\xF3w`, p: pRun, ok: pRun >= 100, sub: `${eurF(savings)} oszcz\u0119dno\u015Bci \xB7 koszty ${eurF(costs)}/mies.` },
    { t: "2 \xB7 Trading: \u015Brednia z 3 mies. \u2265 koszty", p: pInc, ok: pInc >= 100, sub: `${eurF(avg)}/mies. netto (po podziale ${num(g.split) || 80}%) vs ${eurF(costs)}` }
  ].map((r) => /* @__PURE__ */ React.createElement(Card, { key: r.t, style: { marginTop: 10 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700 } }, /* @__PURE__ */ React.createElement("span", null, r.t), /* @__PURE__ */ React.createElement("span", { style: { color: r.ok ? "var(--green2)" : "var(--muted)" } }, Math.round(r.p), "%")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8 } }, /* @__PURE__ */ React.createElement(Bar, { pct: r.p, color: r.ok ? "var(--green)" : "var(--gold)" })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 6 } }, r.sub))), /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 10 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700 } }, /* @__PURE__ */ React.createElement("span", null, "3 \xB7 Ka\u017Cdy z 3 miesi\u0119cy na plusie"), /* @__PURE__ */ React.createElement("span", { style: { color: allPositive ? "var(--green2)" : "var(--muted)" } }, allPositive ? "\u2713" : "\u2717")), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 } }, perMonth.map((x) => /* @__PURE__ */ React.createElement("div", { key: x.m, style: { background: "var(--surface2)", borderRadius: 10, padding: "8px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, mName(x.m)), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 800, color: x.eur > 0 ? "var(--green2)" : x.eur < 0 ? "var(--red)" : "var(--faint)" } }, eurF(x.eur)))))), /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 10 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { onClick: () => gateStore.set({ live: !g.live }), style: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" } }, /* @__PURE__ */ React.createElement(CheckBox, { on: !!g.live }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 700 } }, "4 \xB7 System zweryfikowany na realnym koncie"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2 } }, "Wyp\u0142aty z prop firm / ma\u0142y realny rachunek \u2014 nie tylko backtest")))), setFinance && React.createElement(FreeFundsCard, { finance, setFinance, setToast, always: true }), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Ustawienia"), /* @__PURE__ */ React.createElement(Card, { pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Oszcz\u0119dno\u015Bci \u20AC (puste = skarbonka)"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inp, value: g.savings, placeholder: String(Math.round(finance.vault || 0)), onChange: (e) => gateStore.set({ savings: e.target.value }) })), /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Koszty \u017Cycia \u20AC/mies."), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inp, value: g.costs, placeholder: String(Math.round(finance.capital || 0)), onChange: (e) => gateStore.set({ costs: e.target.value }) })), /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Ile miesi\u0119cy poduszki"), /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", style: inp, value: g.months, onChange: (e) => gateStore.set({ months: e.target.value }) })), /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Tw\xF3j podzia\u0142 zysku prop %"), /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", style: inp, value: g.split, onChange: (e) => gateStore.set({ split: e.target.value }) })), /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Kurs \u20AC za 1 $"), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", style: inp, value: g.eurPerUsd, onChange: (e) => gateStore.set({ eurPerUsd: e.target.value }) }))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginTop: 10, lineHeight: 1.45 } }, "Doch\xF3d z tradingu liczony z zamkni\u0119tych trade'\xF3w w dzienniku (zak\u0142adka Trading), z ryzykiem % i wielko\u015Bci\u0105 konta. Pami\u0119taj o dziecku w bud\u017Cecie koszt\xF3w.")));
}
const dgExtraLines = (daily, diet) => {
  const L = [];
  try {
    const mult = dietMultOf(diet);
    const days = [];
    {
      const t = /* @__PURE__ */ new Date(todayKey() + "T12:00:00");
      for (let i = 6; i >= 0; i--) {
        const d = new Date(t);
        d.setDate(t.getDate() - i);
        days.push(keyOf(d));
      }
    }
    const evs = days.map((k) => evalPlanDay(k, daily[k], mult));
    const full = evs.filter((e) => e.passed === e.rules.length).length;
    const tEv = evs[evs.length - 1];
    L.push(`PLAN DIETY (2 posilki + koktajl, tluszcz >50%, etap ${diet && diet.stage || 1}): dzis zasady ${tEv.passed}/${tEv.rules.length} (${tEv.rules.filter((r) => !r.ok).map((r) => r.label).join("; ") || "komplet"}), zjedzone z planu ${Math.round(tEv.eaten.kcal)}/${Math.round(tEv.planned.kcal)} kcal. Dni z kompletem zasad w 7 dni: ${full}/7.`);
    L.push(`TRENING: plan PPL (Push/Pull/Legs + mobilnosc, szyja, przedramiona). Nastepny w kolejce: ${(WORKOUTS_PPL.find((w2) => w2.id === nextPPL(daily)) || {}).short}.`);
    const T = lsJSON("mp_trades_v1", null);
    if (T && (T.trades || []).length) {
      const since = days[0];
      const cl = T.trades.filter((t) => t.status === "closed");
      const last30 = cl.filter((t) => (t.closedAt || t.date) >= keyOf(new Date(Date.now() - 30 * 864e5)));
      const Rs = last30.map((t) => tradeCalc(t).R).filter((r) => r != null);
      const off = T.trades.filter((t) => t.date >= since && !t.planned).length;
      L.push(`TRADING (zloto, swing, R:R min 1:7, konta prop): 30 dni ${Rs.length} zamknietych, suma ${Rs.reduce((a, b) => a + b, 0).toFixed(1)}R, WR ${Rs.length ? Math.round(Rs.filter((r) => r > 0).length / Rs.length * 100) : 0}%. Trade'y poza planem (7 dni): ${off}. Otwarte: ${T.trades.filter((t) => t.status !== "closed").length}.`);
    }
    const tk = todayKey();
    const w = winEval(tk, daily[tk], lsJSON("mp_habits_v1", []), diet, T);
    L.push(`DZIEN WYGRANY dzis: ${w.n}/${w.conds.length} (${w.conds.filter((c) => !c.ok).map((c) => c.label).join("; ") || "komplet"}).`);
  } catch (e) {
  }
  return L;
};

try { if (!localStorage.getItem("mp_ai_model_mig5")) { localStorage.setItem("mp_ai_model_mig5", "1"); const cm = localStorage.getItem("mp_ai_model"); if (!cm || cm === "claude-sonnet-4-5") localStorage.setItem("mp_ai_model", "claude-opus-5-5"); } } catch (e) {}
const SEED_GOAL = { target: 1e5, pln: 4.25, price: 449, fee: 1500, clients: [], calls: {}, ms: {}, moved: {}, snooze: "", log: [] };
const goalStore = {
  v: { ...SEED_GOAL, ...lsJSON("mp_goal_v1", {}) },
  subs: /* @__PURE__ */ new Set(),
  set(p) {
    this.v = { ...this.v, ...typeof p === "function" ? p(this.v) : p };
    save("mp_goal_v1", this.v);
    this.subs.forEach((f) => f(this.v));
  },
  replace(v) {
    this.v = { ...SEED_GOAL, ...v || {} };
    this.subs.forEach((f) => f(this.v));
  }
};
const useGoal = () => {
  const [g, setG] = useState(goalStore.v);
  useEffect(() => {
    goalStore.subs.add(setG);
    return () => goalStore.subs.delete(setG);
  }, []);
  return g;
};
const repStore = {
  v: lsJSON("mp_dgrep_v1", {}),
  subs: /* @__PURE__ */ new Set(),
  gen: null,
  set(fn) {
    const nv = typeof fn === "function" ? fn(this.v) : fn;
    const keys = Object.keys(nv).sort().slice(-30);
    const out = {};
    keys.forEach((k) => out[k] = nv[k]);
    this.v = out;
    save("mp_dgrep_v1", out);
    this.subs.forEach((f) => f(out));
  },
  replace(v) {
    this.v = v || {};
    this.subs.forEach((f) => f(this.v));
  }
};
const useRep = () => {
  const [r, setR] = useState(repStore.v);
  useEffect(() => {
    repStore.subs.add(setR);
    return () => repStore.subs.delete(setR);
  }, []);
  return r;
};
const zl = (n) => Math.round(n || 0).toLocaleString("pl-PL") + " z\u0142";
const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const endOfYm = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return keyOf(new Date(y, mo, 0));
};
function goalRevenue(g, m) {
  const T = lsJSON("mp_trades_v1", { trades: [], accounts: [] });
  const gt = gateStore.v;
  const usd = (T.trades || []).filter((t) => t.status === "closed" && (t.closedAt || t.date || "").slice(0, 7) === m).reduce((s, t) => s + tradePnl(t, T.accounts), 0);
  const trading = usd * ((num(gt.split) || 80) / 100) * (num(gt.eurPerUsd) || 0.92) * (num(g.pln) || 4.25);
  const end = endOfYm(m);
  const act = (g.clients || []).filter((c) => c.date <= end && (!c.lost || c.lost > end));
  const mrr = act.reduce((s, c) => s + (num(c.price) || 0), 0);
  const fresh = (g.clients || []).filter((c) => (c.date || "").slice(0, 7) === m);
  const onb = fresh.reduce((s, c) => s + (num(c.fee) || 0), 0);
  return { trading, mrr, onb, total: trading + mrr + onb, clients: act.length, fresh: fresh.length };
}
function goalStats(g) {
  const now = /* @__PURE__ */ new Date(todayKey() + "T12:00:00");
  const m0 = ymOf(now);
  const ms = [2, 1, 0].map((i) => ymOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const rev = goalRevenue(g, m0);
  const avg3 = ms.map((m) => goalRevenue(g, m).total).reduce((a, b) => a + b, 0) / 3;
  const T = lsJSON("mp_trades_v1", { accounts: [] });
  const funded = (T.accounts || []).reduce((s, a) => s + (num(a.size) || 0), 0);
  const dl = new Date(2027, 11, 31);
  const monthsLeft = Math.max(1, (dl.getFullYear() - now.getFullYear()) * 12 + dl.getMonth() - now.getMonth());
  const mon = new Date(now);
  mon.setDate(now.getDate() - (now.getDay() + 6) % 7);
  let callsW = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    callsW += (g.calls || {})[keyOf(d)] || 0;
  }
  const callsT = (g.calls || {})[todayKey()] || 0;
  return { m0, rev, avg3, funded, monthsLeft, callsW, callsT, needClients: Math.max(0, Math.ceil((60 - rev.clients) / monthsLeft)) };
}
const GOAL_Q = [
  { q: "I kw. 2027", by: "2027-03-31", items: [
    { id: "q1a", t: "2 konta finansowane w dzienniku", auto: (s) => (lsJSON("mp_trades_v1", { accounts: [] }).accounts || []).length >= 2 },
    { id: "q1b", t: "Pierwsza wyp\u0142ata z prop firmy" },
    { id: "q1c", t: "3 p\u0142ac\u0105ce skupy do 31 stycznia", auto: (s, g) => (g.clients || []).filter((c) => c.date <= "2027-01-31").length >= 3 },
    { id: "q1d", t: "10 klient\xF3w SkupOS", auto: (s) => s.rev.clients >= 10 },
    { id: "q1e", t: "Nowi klienci po 449 z\u0142+" }
  ] },
  { q: "II kw. 2027", by: "2027-06-30", items: [
    { id: "q2a", t: "300 tys. $ finansowania", auto: (s) => s.funded >= 3e5 },
    { id: "q2b", t: "Konta w 2\u20133 r\xF3\u017Cnych firmach prop" },
    { id: "q2c", t: "25 klient\xF3w SkupOS", auto: (s) => s.rev.clients >= 25 },
    { id: "q2d", t: "Program polece\u0144 (miesi\u0105c gratis)" }
  ] },
  { q: "III kw. 2027", by: "2027-09-30", items: [
    { id: "q3a", t: "Brama wyj\u015Bcia spe\u0142niona (4/4)" },
    { id: "q3b", t: "Odej\u015Bcie z Mauser" },
    { id: "q3c", t: "40 klient\xF3w SkupOS", auto: (s) => s.rev.clients >= 40 }
  ] },
  { q: "IV kw. 2027", by: "2027-12-31", items: [
    { id: "q4a", t: "500 tys. $ finansowania", auto: (s) => s.funded >= 5e5 },
    { id: "q4b", t: "60 klient\xF3w SkupOS", auto: (s) => s.rev.clients >= 60 },
    { id: "q4c", t: "6+ nowych klient\xF3w w miesi\u0105cu", auto: (s) => s.rev.fresh >= 6 },
    { id: "q4d", t: "\u015Arednia 3 mies. \u2265 100 000 z\u0142", auto: (s, g) => s.avg3 >= (num(g.target) || 1e5) }
  ] }
];
const msDone = (it, s, g) => it.auto ? !!it.auto(s, g) : !!(g.ms || {})[it.id];
function curQuarter() {
  const t = todayKey();
  return GOAL_Q.find((q) => t <= q.by) || GOAL_Q[GOAL_Q.length - 1];
}
function freeFunds(finance, g) {
  const m = monthKey();
  const tx = (finance.tx || []).filter((x) => (x.date || "").slice(0, 7) === m);
  const inc = tx.filter((x) => x.type === "income").reduce((a, b) => a + (b.amount || 0), 0);
  const spent = tx.filter((x) => x.type === "expense").reduce((a, b) => a + (b.amount || 0), 0);
  const budget = finance.capital || 0;
  const moved = (g.moved || {})[m] || 0;
  return { inc, spent, budget, moved, free: Math.max(0, Math.floor(inc - Math.max(spent, budget) - moved)) };
}
function moveToGate(x, finance, setFinance, setToast) {
  if (!(x > 0)) return;
  setFinance((p) => ({ ...p, vault: (p.vault || 0) + x }));
  const gs = num(gateStore.v.savings);
  if (gs != null) gateStore.set({ savings: String(gs + x) });
  const m = monthKey();
  goalStore.set((g) => ({ moved: { ...g.moved || {}, [m]: ((g.moved || {})[m] || 0) + x }, log: [{ id: uid(), date: todayKey(), eur: x }, ...g.log || []].slice(0, 50) }));
  buzz(12);
  setToast && setToast({ icon: "piggy", title: `+\u20AC${x} w Bramie`, msg: `Poduszka: \u20AC${Math.round((finance.vault || 0) + x)}. Bli\u017Cej wyj\u015Bcia z fabryki.`, color: "var(--green2)", go: "brama" });
}
function FreeFundsCard({ finance, setFinance, setToast, always }) {
  const g = useGoal();
  const f = freeFunds(finance, g);
  const [custom, setCustom] = useState("");
  if (!always && (f.free < 25 || g.snooze === todayKey())) return null;
  return /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14, border: "1px solid rgba(35,198,111,.45)", background: "linear-gradient(135deg, rgba(35,198,111,.10), var(--surface))" }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "var(--green2)" } }, "\u{1F6AA} WOLNE \u015ARODKI \u2192 BRAMA"), f.inc > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, marginTop: 4 } }, "\u20AC", f.free, " do od\u0142o\u017Cenia"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 } }, "Przych\xF3d \u20AC", Math.round(f.inc), " \u2212 bud\u017Cet \u20AC", Math.round(Math.max(f.spent, f.budget)), f.moved ? ` \u2212 ju\u017C od\u0142o\u017Cone \u20AC${Math.round(f.moved)}` : "", ". Trafi do skarbonki i Bramy wyj\u015Bcia."), f.free > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 7, marginTop: 10 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => moveToGate(f.free, finance, setFinance, setToast), style: { flex: 1.4, padding: "10px 6px", borderRadius: 11, border: "none", background: "var(--green)", color: "#08130c", fontWeight: 800, fontSize: 13, cursor: "pointer" } }, "Od\u0142\xF3\u017C \u20AC", f.free), /* @__PURE__ */ React.createElement("button", { onClick: () => moveToGate(Math.floor(f.free / 2), finance, setFinance, setToast), style: { flex: 1, padding: "10px 6px", borderRadius: 11, border: "1px solid var(--line2)", background: "var(--surface2)", color: "var(--text)", fontWeight: 700, fontSize: 13, cursor: "pointer" } }, "Po\u0142ow\u0119"), !always && /* @__PURE__ */ React.createElement("button", { onClick: () => goalStore.set({ snooze: todayKey() }), style: { flex: 0.8, padding: "10px 6px", borderRadius: 11, border: "none", background: "transparent", color: "var(--faint)", fontWeight: 700, fontSize: 12, cursor: "pointer" } }, "Nie dzi\u015B")), always && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 7, marginTop: 8 } }, /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", value: custom, onChange: (e) => setCustom(e.target.value), placeholder: "Inna kwota \u20AC", style: { ...inputStyle, flex: 1, padding: "9px 10px" } }), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    moveToGate(Math.floor(num(custom) || 0), finance, setFinance, setToast);
    setCustom("");
  }, style: { ...btnPrimary, marginTop: 0, width: "auto", padding: "0 14px" } }, "Od\u0142\xF3\u017C"))) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginTop: 5, lineHeight: 1.5 } }, "Wpisz w Finansach przych\xF3d z tego miesi\u0105ca (wyp\u0142ata, payout). Policz\u0119, ile zostaje ponad bud\u017Cet, i zaproponuj\u0119 przelew do Bramy."));
}
function Goal100({ finance, setFinance, setSaasData, setToast, setTab }) {
  const g = useGoal();
  const rep = useRep();
  const s = goalStats(g);
  const [cOpen, setCOpen] = useState(false);
  const [cn, setCn] = useState("");
  const [cp, setCp] = useState("");
  const [cf, setCf] = useState("");
  const [yard, setYard] = useState("");
  const [setOpen, setSetOpen] = useState(false);
  const target = num(g.target) || 1e5;
  const pct = Math.min(100, s.rev.total / target * 100);
  const q = curQuarter();
  const addCall = (d) => {
    const k = todayKey();
    goalStore.set((x) => ({ calls: { ...x.calls || {}, [k]: Math.max(0, ((x.calls || {})[k] || 0) + d) } }));
    if (d > 0 && yard.trim()) {
      const nm = yard.trim();
      setSaasData((p) => ({ ...p, pipeline: (p.pipeline || []).some((l) => l.name.toLowerCase() === nm.toLowerCase()) ? p.pipeline : [...p.pipeline || [], { id: uid(), name: nm, stage: "Kontakt", val: num(g.price) || 449 }] }));
      setYard("");
    }
    buzz(d > 0 ? 8 : 4);
  };
  const addClient = () => {
    const nm = cn.trim();
    if (!nm) return;
    const c = { id: uid(), name: nm, price: num(cp) || num(g.price) || 449, fee: cf === "" ? num(g.fee) || 0 : num(cf) || 0, date: todayKey() };
    goalStore.set((x) => ({ clients: [c, ...x.clients || []] }));
    setSaasData((p) => {
      const pl = p.pipeline || [];
      const ex = pl.find((l) => l.name.toLowerCase() === nm.toLowerCase());
      return { ...p, pipeline: ex ? pl.map((l) => l === ex ? { ...l, stage: "Zamkni\u0119ty", val: c.price } : l) : [...pl, { id: uid(), name: nm, stage: "Zamkni\u0119ty", val: c.price }], revenue: c.fee ? [...p.revenue || [], { id: uid(), amt: c.fee, note: "Wdro\u017Cenie " + nm, date: todayKey() }] : p.revenue || [] };
    });
    setCn("");
    setCp("");
    setCf("");
    setCOpen(false);
    buzz(20);
    setToast && setToast({ icon: "sun", title: "Nowy klient SkupOS \u{1F525}", msg: `${nm}: +${zl(c.price)}/mies.${c.fee ? " + " + zl(c.fee) + " wdro\u017Cenie" : ""}`, color: "var(--gold2)" });
  };
  const lose = (id) => goalStore.set((x) => ({ clients: (x.clients || []).map((c) => c.id === id ? { ...c, lost: c.lost ? void 0 : todayKey() } : c) }));
  const inp = { ...inputStyle, padding: "9px 10px", fontSize: 14 };
  const lastRep = Object.keys(rep).sort().reverse().find((k) => rep[k] && rep[k].text);
  const Stat = ({ v, l, c }) => /* @__PURE__ */ React.createElement("div", { style: { background: "var(--surface2)", borderRadius: 12, padding: "10px 8px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: c || "var(--text)" } }, v), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--muted)", marginTop: 2 } }, l));
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("header", { style: { paddingTop: 26, display: "flex", justifyContent: "space-between", alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Cel 100k \u{1F3AF}"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, "100 000 z\u0142/mies. \xB7 grudzie\u0144 2027 \xB7 zosta\u0142o ", s.monthsLeft, " mies.")), /* @__PURE__ */ React.createElement("button", { onClick: () => setSetOpen(true), style: iconBtn, "aria-label": "Ustawienia celu" }, "\u2699\uFE0F")), /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 16, border: "1px solid rgba(245,181,61,.45)" }, pad: 16 }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "var(--gold2)" } }, "TEN MIESI\u0104C"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 32, letterSpacing: "-.03em" } }, zl(s.rev.total)), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--muted)", fontSize: 13 } }, "/ ", zl(target))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement(Bar, { pct, color: "var(--gold)", h: 10 })), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginTop: 12 } }, /* @__PURE__ */ React.createElement(Stat, { v: zl(s.rev.trading), l: "Trading (po podziale)", c: s.rev.trading < 0 ? "var(--red)" : "var(--green2)" }), /* @__PURE__ */ React.createElement(Stat, { v: zl(s.rev.mrr), l: `SkupOS MRR \xB7 ${s.rev.clients} kl.` }), /* @__PURE__ */ React.createElement(Stat, { v: zl(s.rev.onb), l: `Wdro\u017Cenia \xB7 ${s.rev.fresh} nowych` })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 } }, "\u015Arednia z 3 mies.: ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--text)" } }, zl(s.avg3)), " \xB7 finansowanie: ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--text)" } }, Math.round(s.funded / 1e3), " tys. $"), " / 500 tys. $")), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Tydzie\u0144 sprzeda\u017Cy"), /* @__PURE__ */ React.createElement(Card, { pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 20 } }, s.callsW, " / 20 telefon\xF3w"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2 } }, "Dzi\u015B: ", s.callsT, " \xB7 dzwo\u0144 8\u201312, gdy w\u0142a\u015Bciciel jest na placu")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => addCall(-1), style: { ...iconBtn, width: 40, height: 40 } }, "\u2212"), /* @__PURE__ */ React.createElement("button", { onClick: () => addCall(1), style: { width: 52, height: 40, borderRadius: 12, border: "none", background: "var(--gold)", color: "#1a1200", fontWeight: 800, fontSize: 18, cursor: "pointer" } }, "+\u{1F4DE}"))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement(Bar, { pct: Math.min(100, s.callsW / 20 * 100), color: s.callsW >= 20 ? "var(--green)" : "var(--gold)" })), /* @__PURE__ */ React.createElement("input", { value: yard, onChange: (e) => setYard(e.target.value), placeholder: "Nazwa skupu (opcjonalnie \u2192 trafi do lejka SaaS)", style: { ...inp, marginTop: 10 } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginTop: 8 } }, "Tempo: potrzebujesz ok. ", s.needClients, " nowych klient\xF3w miesi\u0119cznie, \u017Ceby mie\u0107 60 w grudniu 2027.")), /* @__PURE__ */ React.createElement("div", { style: { ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", null, "Klienci SkupOS (", s.rev.clients, ")"), /* @__PURE__ */ React.createElement("button", { onClick: () => setCOpen(true), style: { background: "none", border: "none", color: "var(--gold2)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", textTransform: "none", letterSpacing: 0 } }, "+ Dodaj klienta")), /* @__PURE__ */ React.createElement(Card, { pad: 12 }, !(g.clients || []).length && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", textAlign: "center", padding: "8px 0", lineHeight: 1.5 } }, "Zero p\u0142ac\u0105cych skup\xF3w. Pierwszy klient jest wa\u017Cniejszy ni\u017C ka\u017Cda nowa funkcja."), (g.clients || []).map((c) => /* @__PURE__ */ React.createElement("div", { key: c.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", borderTop: "1px solid var(--line)", opacity: c.lost ? 0.45 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 700, textDecoration: c.lost ? "line-through" : "none" } }, c.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--faint)" } }, "od ", c.date, " \xB7 ", zl(c.price), "/mies.", c.fee ? ` \xB7 wdro\u017Cenie ${zl(c.fee)}` : "")), /* @__PURE__ */ React.createElement("button", { onClick: () => lose(c.id), style: { background: "none", border: "1px solid var(--line2)", color: "var(--faint)", borderRadius: 9, padding: "5px 8px", fontSize: 11, cursor: "pointer" } }, c.lost ? "Wr\xF3ci\u0142" : "Odszed\u0142")))), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Kamienie milowe 2027"), GOAL_Q.map((qq) => {
    const done = qq.items.filter((it) => msDone(it, s, g)).length;
    const cur = qq === q;
    return /* @__PURE__ */ React.createElement(Card, { key: qq.q, style: { marginBottom: 10, border: cur ? "1px solid rgba(245,181,61,.5)" : void 0 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 800 } }, /* @__PURE__ */ React.createElement("span", null, qq.q, cur ? " \xB7 TERAZ" : ""), /* @__PURE__ */ React.createElement("span", { style: { color: done === qq.items.length ? "var(--green2)" : "var(--muted)" } }, done, "/", qq.items.length)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 2 } }, "do ", qq.by), qq.items.map((it) => {
      const ok = msDone(it, s, g);
      return /* @__PURE__ */ React.createElement("div", { key: it.id, onClick: () => {
        if (!it.auto) {
          goalStore.set((x) => ({ ms: { ...x.ms || {}, [it.id]: !(x.ms || {})[it.id] } }));
          buzz(6);
        }
      }, style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", cursor: it.auto ? "default" : "pointer" } }, /* @__PURE__ */ React.createElement(CheckBox, { on: ok }), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 13, color: ok ? "var(--muted)" : "var(--text)", textDecoration: ok ? "line-through" : "none" } }, it.t), it.auto && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9.5, fontWeight: 800, color: "var(--blue)", border: "1px solid rgba(91,140,255,.4)", borderRadius: 6, padding: "2px 5px" } }, "AUTO"));
    }));
  }), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Finanse \u2192 Brama"), /* @__PURE__ */ React.createElement(FreeFundsCard, { finance, setFinance, setToast, always: true }), /* @__PURE__ */ React.createElement("button", { onClick: () => setTab("brama"), style: { ...btnPrimary, marginTop: 10, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--line2)" } }, "\u{1F6AA} Otw\xF3rz Bram\u0119 wyj\u015Bcia"), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Raport Drugiej G\u0142owy"), /* @__PURE__ */ React.createElement(Card, { pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 } }, "Codziennie o 20:00 Druga G\u0142owa analizuje dane z ca\u0142ej aplikacji i zostawia raport, kt\xF3ry wisi, dop\xF3ki nie klikniesz \u201EPrzeczytane\u201D.", lastRep ? ` Ostatni: ${lastRep}.` : ""), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => repStore.gen && repStore.gen(true), style: { flex: 1, padding: "11px 6px", borderRadius: 12, border: "1px solid var(--line2)", background: "rgba(245,181,61,.13)", color: "var(--gold2)", fontWeight: 800, fontSize: 13, cursor: "pointer" } }, "\u{1F9E0} Raport teraz"), lastRep && /* @__PURE__ */ React.createElement("button", { onClick: () => {
    repStore.set((r) => ({ ...r, [lastRep]: { ...r[lastRep], read: false } }));
  }, style: { flex: 1, padding: "11px 6px", borderRadius: 12, border: "1px solid var(--line2)", background: "var(--surface2)", color: "var(--text)", fontWeight: 700, fontSize: 13, cursor: "pointer" } }, "\u{1F4CB} Poka\u017C ostatni"))), /* @__PURE__ */ React.createElement("div", { style: { height: 20 } }), /* @__PURE__ */ React.createElement(Sheet, { open: cOpen, onClose: () => setCOpen(false), title: "Nowy klient SkupOS" }, /* @__PURE__ */ React.createElement("input", { value: cn, onChange: (e) => setCn(e.target.value), placeholder: "Nazwa skupu", style: { ...inp, marginBottom: 8 } }), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", value: cp, onChange: (e) => setCp(e.target.value), placeholder: `Abonament z\u0142 (${g.price})`, style: inp }), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", value: cf, onChange: (e) => setCf(e.target.value), placeholder: `Wdro\u017Cenie z\u0142 (${g.fee})`, style: inp })), /* @__PURE__ */ React.createElement("button", { onClick: addClient, style: btnPrimary }, "Dodaj klienta")), /* @__PURE__ */ React.createElement(Sheet, { open: setOpen, onClose: () => setSetOpen(false), title: "Ustawienia celu" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, [["target", "Cel z\u0142/mies."], ["pln", "Kurs z\u0142 za 1 \u20AC"], ["price", "Domy\u015Blny abonament z\u0142"], ["fee", "Domy\u015Blne wdro\u017Cenie z\u0142"]].map(([k, l]) => /* @__PURE__ */ React.createElement("label", { key: k }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: "var(--muted)", display: "block", marginBottom: 4 } }, l), /* @__PURE__ */ React.createElement("input", { inputMode: "decimal", value: g[k], onChange: (e) => goalStore.set({ [k]: e.target.value }), style: inp })))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 } }, "Trading liczony z zamkni\u0119tych trade'\xF3w w dzienniku \xD7 tw\xF3j podzia\u0142 i kurs $\u2192\u20AC z Bramy \xD7 kurs \u20AC\u2192z\u0142. Pensja z Mauser nie wlicza si\u0119 do celu, bo to nie jest przych\xF3d z biznesu.")));
}
const dgAllLines = () => {
  const L = [];
  try {
    const g = goalStore.v;
    const s = goalStats(g);
    const q = curQuarter();
    L.push(`CEL 100K (100 000 zl/mies. do grudnia 2027, zostalo ${s.monthsLeft} mies.): ten miesiac ${zl(s.rev.total)} (trading ${zl(s.rev.trading)}, SkupOS MRR ${zl(s.rev.mrr)} z ${s.rev.clients} klientow, wdrozenia ${zl(s.rev.onb)} z ${s.rev.fresh} nowych). Srednia 3 mies. ${zl(s.avg3)}. Finansowanie prop ${Math.round(s.funded / 1e3)} tys. $ (cel 500 tys.). Telefony do skupow: dzis ${s.callsT}, ten tydzien ${s.callsW}/20. Potrzebne tempo: ${s.needClients} nowych klientow/mies.`);
    L.push(`KAMIENIE ${q.q} (do ${q.by}): ` + q.items.map((it) => (msDone(it, s, g) ? "[x] " : "[ ] ") + it.t).join("; "));
    const gt = gateStore.v;
    L.push(`BRAMA WYJSCIA: oszczednosci ${gt.savings || "(skarbonka)"} \u20AC, koszty ${gt.costs || "(budzet)"} \u20AC/mies., wymagane ${gt.months} mies. poduszki, weryfikacja live: ${gt.live ? "tak" : "nie"}. Odlozone z wolnych srodkow ten miesiac: \u20AC${Math.round((g.moved || {})[monthKey()] || 0)}.`);
    const T = lsJSON("mp_trades_v1", null);
    if (T) L.push(`KONTA PROP: ${(T.accounts || []).map((a) => a.name + " " + Math.round((a.size || 0) / 1e3) + "k").join(", ") || "brak"}.`);
    const bp = lsJSON("mp_bizplan_v1", null);
    if (bp && bp.meta) L.push("BIZNES PLAN: " + Object.keys(bp.meta).map((k) => {
      const m = bp.meta[k] || {};
      return `${k}: ${m.stage || "Pomysl"}, ${m.h || 0} h/tydz., KPI ${m.kpi || "-"} (teraz ${m.now || "-"}, cel ${m.goal || "-"}), nastepny krok: ${m.next || "-"}`;
    }).join(" | ") + (bp.vision ? ` | WIZJA 2027: ${String(bp.vision).slice(0, 200)}` : ""));
    const gl = gsDgLine(); if (gl) L.push(gl);
    const sa = lsJSON("mp_saas_v1", null);
    if (sa && (sa.pipeline || []).length) {
      const by = {};
      sa.pipeline.forEach((l) => by[l.stage] = (by[l.stage] || 0) + 1);
      L.push("LEJEK SPRZEDAZY: " + Object.keys(by).map((k) => k + " " + by[k]).join(", ") + ".");
    }
    const tk = lsJSON("mp_tasks_v1", null);
    if (tk && (tk.items || []).length) {
      const open = tk.items.filter((t) => !t.done);
      L.push(`ZADANIA: ${open.length} otwartych, najwazniejsze: ${open.sort((a, b) => (a.prio || 9) - (b.prio || 9)).slice(0, 5).map((t) => t.title).join("; ")}.`);
    }
    const sh = lsJSON("mp_shopping_v1", null);
    const shi = Array.isArray(sh) ? sh : sh && sh.items;
    if (shi && shi.length) L.push(`ZAKUPY: ${shi.filter((i) => !i.done).length} do kupienia z ${shi.length}.`);
  } catch (e) {
  }
  return L;
};
function mdInline(t, kp) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  let i = 0;
  while (m = re.exec(t)) {
    if (m.index > last) out.push(t.slice(last, m.index));
    const s = m[0];
    if (s.startsWith("**")) out.push(/* @__PURE__ */ React.createElement("strong", { key: kp + i++, style: { fontWeight: 700, color: "var(--text)" } }, s.slice(2, -2)));
    else if (s.startsWith("`")) out.push(/* @__PURE__ */ React.createElement("code", { key: kp + i++, style: { background: "var(--surface2)", borderRadius: 5, padding: "1px 5px", fontSize: ".9em" } }, s.slice(1, -1)));
    else out.push(/* @__PURE__ */ React.createElement("em", { key: kp + i++ }, s.slice(1, -1)));
    last = m.index + s.length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}
function MD({ text }) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;
  let k = 0;
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        /* @__PURE__ */ React.createElement("div", { key: k++, style: { overflowX: "auto", margin: "10px 0" } }, /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "collapse", width: "100%", fontSize: 13 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, head.map((h2, j) => /* @__PURE__ */ React.createElement("th", { key: j, style: { textAlign: "left", padding: "7px 9px", borderBottom: "1px solid var(--line2)", fontWeight: 700, whiteSpace: "nowrap" } }, mdInline(h2, "h" + j))))), /* @__PURE__ */ React.createElement("tbody", null, rows.map((r, ri) => /* @__PURE__ */ React.createElement("tr", { key: ri }, r.map((c, j) => /* @__PURE__ */ React.createElement("td", { key: j, style: { padding: "7px 9px", borderBottom: "1px solid var(--line)", verticalAlign: "top" } }, mdInline(c, "c" + ri + j))))))))
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const lv = h[1].length;
      blocks.push(/* @__PURE__ */ React.createElement("div", { key: k++, style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: lv <= 1 ? 19 : lv === 2 ? 16.5 : 15, margin: "16px 0 6px", letterSpacing: "-.01em", color: "var(--text)" } }, mdInline(h[2], "H" + k)));
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) {
      blocks.push(/* @__PURE__ */ React.createElement("div", { key: k++, style: { borderTop: "1px solid var(--line)", margin: "12px 0" } }));
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const items = [];
      const ordered = /^\s*\d/.test(l);
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        const ind = /^\s{2,}/.test(lines[i]);
        items.push({ t: lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""), ind, n: (/^\s*(\d+)/.exec(lines[i]) || [])[1] });
        i++;
      }
      blocks.push(
        /* @__PURE__ */ React.createElement("div", { key: k++, style: { margin: "6px 0" } }, items.map((it, j) => /* @__PURE__ */ React.createElement("div", { key: j, style: { display: "flex", gap: 8, padding: "2px 0", paddingLeft: it.ind ? 18 : 0 } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--muted)", minWidth: ordered ? 16 : 8, flexShrink: 0 } }, ordered && it.n ? it.n + "." : "\u2022"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, mdInline(it.t, "L" + k + j)))))
      );
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s|^\s*([-*•]|\d+[.)])\s+|^\s*\|.*\|\s*$/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) {
      para.push(lines[i++]);
    }
    blocks.push(/* @__PURE__ */ React.createElement("p", { key: k++, style: { margin: "8px 0" } }, mdInline(para.join(" "), "P" + k)));
  }
  return /* @__PURE__ */ React.createElement("div", { className: "mp-md" }, blocks);
}
const REPORT_PROMPT = (dateK, ctx) => `DANE Z CALEJ APLIKACJI (stan na ${dateK}, godz. ${(/* @__PURE__ */ new Date()).toTimeString().slice(0, 5)}):
${ctx}

Napisz moj RAPORT DNIA. Format (markdown, po polsku, max ok. 380 slow, czytam na telefonie):

**Werdykt w jednym zdaniu** (pogrubiony) + ocena dnia X/10.

## Liczby dnia
Tabela: | Obszar | Dzis | Cel | Status (\u2705/\u26A0\uFE0F/\u274C) | \u2014 trening, dieta (zasady), nawyki, trading, telefony do skupow, finanse/Brama. Tylko to, co jest w danych.

## Cel 100k
Gdzie jestem w tym miesiacu, czy tempo wystarcza, ktory kamien milowy kwartalu jest zagrozony. Policz.

## Brutalna prawda
1\u20133 punkty: co realnie olewam albo gdzie sie oszukuje. Bez owijania, bez przeklenstw, bez moralizowania.

## Jutro
Jaka zmiana/wolne wedlug kalendarza i 3 konkretne rzeczy w kolejnosci waznosci. Ostatnia linia: jedna rzecz, od ktorej zaczynam.

Nie wymyslaj danych. Jesli czegos brakuje (np. nie wpisalem przychodu), powiedz w jednym zdaniu, co mam uzupelnic.`;
function DGReportHost({ S, setTab }) {
  const rep = useRep();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const sRef = useRef(S);
  sRef.current = S;
  const gen = async (force) => {
    if (busyRef.current) return;
    if (!localStorage.getItem("mp_ai_key")) {
      if (force) alert("Najpierw wklej klucz API w Rozw\xF3j \u2192 Druga G\u0142owa \u2192 \u2699\uFE0F");
      return;
    }
    const k = todayKey();
    busyRef.current = true;
    setBusy(true);
    repStore.set((r2) => ({ ...r2, [k]: { ...r2[k] || {}, pending: Date.now() } }));
    let mem = [];
    try {
      mem = JSON.parse(localStorage.getItem("mp_ai_mem") || "[]");
    } catch (e) {
    }
    const ctx = dgContext({ ...sRef.current, mem });
    const res = await askDG(REPORT_PROMPT(k, ctx), 1800);
    repStore.set((r2) => ({ ...r2, [k]: res.ok ? { text: res.text, ts: Date.now(), read: false } : { err: res.text, ts: Date.now(), read: false } }));
    busyRef.current = false;
    setBusy(false);
    setOpen(true);
    if (res.ok) {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && navigator.serviceWorker) {
          navigator.serviceWorker.ready.then((sw) => sw.showNotification("\u{1F4CB} Raport Drugiej G\u0142owy", { body: res.text.replace(/[#*|]/g, "").slice(0, 140), tag: "dg-report", icon: "icon-192.png" }));
        }
      } catch (e) {
      }
    }
  };
  repStore.gen = gen;
  useEffect(() => {
    const tick = () => {
      const now = /* @__PURE__ */ new Date();
      if (now.getHours() < 20) return;
      const r2 = repStore.v[todayKey()];
      if (r2 && (r2.text || r2.pending && Date.now() - r2.pending < 5 * 6e4)) return;
      if (r2 && r2.err && Date.now() - (r2.ts || 0) < 30 * 6e4) return;
      gen(false);
    };
    const t0 = setTimeout(tick, 4e3);
    const iv = setInterval(tick, 6e4);
    const vis = () => document.visibilityState === "visible" && setTimeout(tick, 2500);
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  const unread = Object.keys(rep).sort().reverse().find((k) => rep[k] && (rep[k].text || rep[k].err) && !rep[k].read);
  if (busy && !unread) return /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", top: "max(12px, env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)", zIndex: 75, padding: "8px 14px", borderRadius: 99, background: "var(--surface2)", border: "1px solid var(--line2)", fontSize: 12.5, color: "var(--muted)" } }, "\u{1F9E0} Druga G\u0142owa pisze raport\u2026");
  if (!unread) return null;
  const r = rep[unread];
  const markRead = () => {
    repStore.set((x) => ({ ...x, [unread]: { ...x[unread], read: true, readAt: Date.now() } }));
    buzz(10);
  };
  const reply = () => {
    try {
      const m = JSON.parse(localStorage.getItem("mp_ai_msgs") || "[]");
      localStorage.setItem("mp_ai_msgs", JSON.stringify([...m, { role: "assistant", content: "\u{1F4CB} **Raport dnia " + unread + "**\n\n" + (r.text || "") }].slice(-40)));
    } catch (e) {
    }
    markRead();
    setTab("ai");
  };
  if (!open) return /* @__PURE__ */ React.createElement("div", { onClick: () => setOpen(true), className: "mp-repbar", style: { position: "fixed", top: "max(10px, env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)", zIndex: 75, width: "calc(100% - 28px)", maxWidth: 432, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, background: "var(--surface2)", border: "1px solid rgba(245,181,61,.55)", cursor: "pointer", boxShadow: "0 14px 34px -14px rgba(0,0,0,.8)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18 } }, "\u{1F4CB}"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 13, fontWeight: 700 } }, "Raport Drugiej G\u0142owy czeka \xB7 ", unread), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--gold2)", fontWeight: 800 } }, "Otw\xF3rz"));
  return /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.55)", display: "flex", justifyContent: "center", animation: "fade .2s ease" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "100%", maxWidth: 720, background: "var(--bg)", display: "flex", flexDirection: "column", height: "100%" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "max(14px, env(safe-area-inset-top)) 16px 12px", borderBottom: "1px solid var(--line)" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 34, height: 34, borderRadius: 10, background: "rgba(217,119,87,.16)", display: "grid", placeItems: "center", fontSize: 18 } }, "\u{1F9E0}"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 16 } }, "Raport dnia"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, "Druga G\u0142owa \xB7 ", unread, " \xB7 ", r.ts ? new Date(r.ts).toTimeString().slice(0, 5) : "")), /* @__PURE__ */ React.createElement("button", { onClick: () => setOpen(false), style: iconBtn, "aria-label": "Zwi\u0144" }, "\u25BE")), /* @__PURE__ */ React.createElement("div", { className: "dg-text", style: { flex: 1, overflowY: "auto", padding: "8px 18px 20px" } }, r.text ? /* @__PURE__ */ React.createElement(MD, { text: r.text }) : /* @__PURE__ */ React.createElement("div", { style: { color: "var(--red)", fontSize: 13.5, marginTop: 14 } }, "Nie uda\u0142o si\u0119 zrobi\u0107 raportu: ", r.err)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, padding: "12px 16px max(14px, env(safe-area-inset-bottom))", borderTop: "1px solid var(--line)" } }, r.text && /* @__PURE__ */ React.createElement("button", { onClick: reply, style: { flex: 1, padding: "13px 8px", borderRadius: 13, border: "1px solid var(--line2)", background: "var(--surface2)", color: "var(--text)", fontWeight: 700, fontSize: 13.5, cursor: "pointer" } }, "\u{1F4AC} Odpowiedz"), !r.text && /* @__PURE__ */ React.createElement("button", { onClick: () => gen(true), style: { flex: 1, padding: "13px 8px", borderRadius: 13, border: "1px solid var(--line2)", background: "var(--surface2)", color: "var(--text)", fontWeight: 700, fontSize: 13.5, cursor: "pointer" } }, "\u21BB Pon\xF3w"), /* @__PURE__ */ React.createElement("button", { onClick: markRead, style: { flex: 1.4, padding: "13px 8px", borderRadius: 13, border: "none", background: "var(--gold)", color: "#1a1200", fontWeight: 800, fontSize: 14, cursor: "pointer" } }, "\u2713 Przeczytane"))));
}
function DGChatView({ msgs, loading, endRef, input, setInput, send, hasKey, onClear }) {
  const taRef = useRef(null);
  useEffect(() => {
    const t = taRef.current;
    if (t) {
      t.style.height = "auto";
      t.style.height = Math.min(160, t.scrollHeight) + "px";
    }
  }, [input]);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, (msgs.length > 0 || loading) && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 18, display: "flex", flexDirection: "column", gap: 18 } }, msgs.map((m, i) => m.role === "user" ? /* @__PURE__ */ React.createElement("div", { key: i, style: { alignSelf: "flex-end", maxWidth: "85%", padding: "10px 14px", borderRadius: 18, background: "var(--surface2)", border: "1px solid var(--line)", fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap" } }, typeof m.content === "string" ? m.content : "\u{1F4CE} (zdj\u0119cia)") : /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 10, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 26, height: 26, borderRadius: 8, background: "rgba(217,119,87,.16)", display: "grid", placeItems: "center", fontSize: 14, flexShrink: 0, marginTop: 2 } }, "\u{1F9E0}"), /* @__PURE__ */ React.createElement("div", { className: "dg-text", style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement(MD, { text: m.content })))), loading && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 26, height: 26, borderRadius: 8, background: "rgba(217,119,87,.16)", display: "grid", placeItems: "center", fontSize: 14, animation: "pulse 1.4s ease-in-out infinite" } }, "\u{1F9E0}"), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--muted)", fontSize: 13.5 } }, "My\u015Bl\u0119\u2026")), /* @__PURE__ */ React.createElement("div", { ref: endRef }), msgs.length > 0 && /* @__PURE__ */ React.createElement("button", { onClick: onClear, style: { alignSelf: "center", background: "transparent", border: "none", color: "var(--faint)", fontSize: 12, cursor: "pointer", padding: 6 } }, "Nowa rozmowa")), hasKey && /* @__PURE__ */ React.createElement("div", { className: "mp-composer", style: { position: "sticky", bottom: "calc(80px + env(safe-area-inset-bottom))", paddingTop: 10, paddingBottom: 6, background: "linear-gradient(transparent, var(--bg) 30%)", marginTop: 12, zIndex: 5 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 10px 10px 16px", borderRadius: 22, background: "var(--surface)", border: "1px solid var(--line2)", boxShadow: "0 10px 30px -16px rgba(0,0,0,.8)" } }, /* @__PURE__ */ React.createElement("textarea", { ref: taRef, rows: 1, value: input, onChange: (e) => setInput(e.target.value), onKeyDown: (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }, placeholder: "Napisz do Drugiej G\u0142owy\u2026", style: { flex: 1, resize: "none", border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 15, lineHeight: 1.45, fontFamily: "var(--body)", padding: "6px 0", maxHeight: 160 } }), /* @__PURE__ */ React.createElement("button", { onClick: () => send(), disabled: loading || !input.trim(), "aria-label": "Wy\u015Blij", style: { width: 36, height: 36, borderRadius: 11, border: "none", background: input.trim() && !loading ? "#d97757" : "var(--surface2)", color: input.trim() && !loading ? "#fff" : "var(--faint)", fontSize: 18, fontWeight: 800, cursor: "pointer", flexShrink: 0 } }, "\u2191"))));
}
function GoalMini({ setTab }) {
  const g = useGoal();
  const s = goalStats(g);
  const pct = Math.min(100, s.rev.total / (num(g.target) || 1e5) * 100);
  return /* @__PURE__ */ React.createElement(Card, { onClick: () => setTab("cel"), style: { marginTop: 14, cursor: "pointer" }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "var(--gold2)" } }, "\u{1F3AF} CEL 100K \xB7 ", s.monthsLeft, " MIES."), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, "\u{1F4DE} ", s.callsW, "/20")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 20 } }, zl(s.rev.total)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, "w tym miesi\u0105cu \xB7 ", s.rev.clients, " klient\xF3w")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8 } }, /* @__PURE__ */ React.createElement(Bar, { pct, color: "var(--gold)" })));
}


const favStore = {
  v: lsJSON("mp_fav_v1", ["testo", "looksmax", "bizplan"]),
  subs: /* @__PURE__ */ new Set(),
  toggle(t) {
    this.v = this.v.includes(t) ? this.v.filter((x) => x !== t) : [...this.v, t];
    save("mp_fav_v1", this.v);
    this.subs.forEach((f) => f(this.v));
  },
  replace(v) {
    this.v = Array.isArray(v) ? v : [];
    this.subs.forEach((f) => f(this.v));
  }
};
const HUB_NAMES = {};
const hubStore = {
  v: { order: [], own: false, ...lsJSON("mp_hub_v1", {}) },
  subs: /* @__PURE__ */ new Set(),
  set(p) {
    this.v = { ...this.v, ...p };
    save("mp_hub_v1", this.v);
    this.subs.forEach((f) => f(this.v));
  },
  replace(v) {
    this.v = { order: [], own: false, ...v || {} };
    this.subs.forEach((f) => f(this.v));
  }
};
function hubOrdered(all, order) {
  const ids = all.map((i) => i.t);
  const o = (order || []).filter((t) => ids.includes(t));
  ids.forEach((t) => {
    if (!o.includes(t)) o.push(t);
  });
  return o.map((t) => all.find((i) => i.t === t));
}
function HubOrder({ all, Tile, go }) {
  const [h, setH] = useState(hubStore.v);
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    hubStore.subs.add(setH);
    return () => hubStore.subs.delete(setH);
  }, []);
  const list = hubOrdered(all, h.order);
  const mv = (i, to) => {
    const o = list.map((x) => x.t);
    const [it] = o.splice(i, 1);
    o.splice(Math.max(0, Math.min(o.length, to)), 0, it);
    hubStore.set({ order: o, own: true });
    buzz(5);
  };
  const sb = (on) => ({ flex: 1, padding: "8px 6px", borderRadius: 10, border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: on ? "var(--gold)" : "transparent", color: on ? "#1a1200" : "var(--muted)" });
  const ab = { width: 34, height: 34, borderRadius: 10, border: "1px solid var(--line2)", background: "var(--surface2)", color: "var(--text)", fontSize: 14, cursor: "pointer", flexShrink: 0 };
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", marginTop: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", gap: 4, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 4 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => hubStore.set({ own: false }), style: sb(!h.own) }, "Sekcje"), /* @__PURE__ */ React.createElement("button", { onClick: () => hubStore.set({ own: true }), style: sb(h.own) }, "Moja kolejno\u015B\u0107")), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setEdit(!edit);
    if (!edit) hubStore.set({ own: true });
    buzz(5);
  }, style: { padding: "10px 12px", borderRadius: 12, border: edit ? "1px solid var(--gold)" : "1px solid var(--line2)", background: edit ? "rgba(245,181,61,.14)" : "var(--surface)", color: edit ? "var(--gold2)" : "var(--text)", fontSize: 12.5, fontWeight: 800, cursor: "pointer" } }, edit ? "\u2713 Gotowe" : "\u2195 U\u0142\xF3\u017C")), edit && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 8, lineHeight: 1.45 } }, "Najwa\u017Cniejsze na g\xF3r\u0119. \u2912 przenosi od razu na sam\u0105 g\xF3r\u0119."), list.map((i, idx) => /* @__PURE__ */ React.createElement("div", { key: i.t, style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 6, borderRadius: 13, background: "var(--surface)", border: "1px solid var(--line)" } }, /* @__PURE__ */ React.createElement("span", { style: { width: 20, fontSize: 12, color: "var(--faint)", fontWeight: 800, textAlign: "right" } }, idx + 1), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18 } }, i.e), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 13.5, fontWeight: 700, minWidth: 0 } }, i.n), /* @__PURE__ */ React.createElement("button", { onClick: () => mv(idx, 0), disabled: idx === 0, style: { ...ab, opacity: idx === 0 ? 0.3 : 1 }, "aria-label": "Na g\xF3r\u0119" }, "\u2912"), /* @__PURE__ */ React.createElement("button", { onClick: () => mv(idx, idx - 1), disabled: idx === 0, style: { ...ab, opacity: idx === 0 ? 0.3 : 1 }, "aria-label": "W g\xF3r\u0119" }, "\u25B2"), /* @__PURE__ */ React.createElement("button", { onClick: () => mv(idx, idx + 1), disabled: idx === list.length - 1, style: { ...ab, opacity: idx === list.length - 1 ? 0.3 : 1 }, "aria-label": "W d\xF3\u0142" }, "\u25BC"))), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    hubStore.set({ order: [], own: false });
    setEdit(false);
  }, style: { width: "100%", marginTop: 4, background: "none", border: "none", color: "var(--faint)", fontSize: 12, cursor: "pointer", padding: 8 } }, "Przywr\xF3\u0107 domy\u015Blne")), !edit && h.own && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 14 } }, list.map((i) => /* @__PURE__ */ React.createElement(Tile, { key: i.t, i }))));
}

function DevHub({ setTab, profile, daily, habits, measures, medi, voiceLog, books, prs, diet }) {
  const [q, setQ] = useState("");
  const [, setHubTick] = useState(0);
  useEffect(() => { const f = () => setHubTick((x) => x + 1); hubStore.subs.add(f); return () => hubStore.subs.delete(f); }, []);
  const [fav, setFav] = useState(favStore.v);
  useEffect(() => {
    favStore.subs.add(setFav);
    return () => favStore.subs.delete(setFav);
  }, []);
  const go = (t) => {
    buzz(6);
    setTab(t);
  };
  const streakOf = (has) => {
    let n = 0;
    const c = /* @__PURE__ */ new Date(todayKey() + "T12:00:00");
    if (!has(keyOf(c))) c.setDate(c.getDate() - 1);
    while (has(keyOf(c))) {
      n++;
      c.setDate(c.getDate() - 1);
    }
    return n;
  };
  const mset = new Set((medi || []).map((s) => s.date));
  const mStreak = streakOf((k) => mset.has(k));
  const vStreak = streakOf((k) => voiceLog && voiceLog[k] && (voiceLog[k].d || voiceLog[k].g || voiceLog[k].p));
  const pts = (measures || []).filter((m) => m.weight > 0);
  const lastW = pts.length ? pts.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0].weight : profile.weight;
  const bc = (books || []).length;
  const SECTIONS = [
    { title: "Cia\u0142o", items: [
      { e: "\u{1FA7A}", n: "Zdrowie & cia\u0142o", s: `Waga ${lastW} \u2192 ${profile.goal} kg \xB7 sen \xB7 badania`, t: "health", c: "167,139,250" },
      { e: "\u{1F48E}", n: "Looksmax", s: "Sk\xF3ra, w\u0142osy, wygl\u0105d", t: "looksmax", c: "236,72,153" },
      { e: "\u{1F525}", n: "Testosteron", s: "Naturalna optymalizacja", t: "testo", c: "248,113,113" }
    ] },
    { title: "Umys\u0142 & charakter", items: [
      { e: "\u{1F9D8}", n: "Medytacja", s: mStreak ? `\u{1F525} ${mStreak} dni z rz\u0119du` : "Ostro\u015B\u0107 umys\u0142u", t: "medytacja", c: "250,204,21" },
      { e: "\u{1F9E0}", n: "Reset g\u0142owy", s: "Gdy siada psychika", t: "resilience", c: "96,165,250" },
      { e: "\u{1F5E3}\uFE0F", n: "Charyzma", s: "Rozmowy i wp\u0142yw", t: "charisma", c: "192,132,252" },
      { e: "\u{1F399}\uFE0F", n: "G\u0142os & postawa", s: vStreak ? `\u{1F525} ${vStreak} dni z rz\u0119du` : "Mowa i sylwetka", t: "glos", c: "45,212,191" },
      { e: "\u{1F4DA}", n: "Czytanie", s: `${bc} ${bc === 1 ? "pozycja" : "pozycji"}`, t: "books", c: "251,146,60" }
    ] },
    { title: "Biznes & wolno\u015B\u0107 finansowa", items: [
      { e: "\u{1F4CB}", n: "Biznes Plan", s: "Plan firmy krok po kroku", t: "bizplan", c: "56,189,248" },
      { e: "\u{1F680}", n: "Biznes / SaaS", s: "Pipeline i przychody", t: "saas", c: "16,185,129" },
      { e: "\u{1F3AF}", n: "Cel 100k", s: "100 000 z\u0142/mies. do grudnia 2027", t: "cel", c: "245,181,61" },
      { e: "\u{1F6AA}", n: "Brama wyj\u015Bcia", s: "Warunki odej\u015Bcia z Mauser", t: "brama", c: "250,204,21" }
    ] },
    { title: "Organizacja", items: [
      { e: "\u2705", n: "Zadania", s: "Lista rzeczy do zrobienia", t: "tasks", c: "96,165,250" },
      { e: "\u{1F4C5}", n: "Kalendarz", s: "Zmiany i wydarzenia", t: "cal", c: "96,165,250" },
      { e: "\u{1F5D3}\uFE0F", n: "Plan zmian", s: "Tydzie\u0144 pod grafik", t: "shifts", c: "96,165,250" },
      { e: "\u{1F4CA}", n: "Przegl\u0105d tygodnia", s: "Niedziela, 15 min", t: "review", c: "245,181,61" },
      { e: "\u23F0", n: "Alarmy", s: "Pobudka, suple, trening", t: "alarms", c: "245,181,61" },
      { e: "\u{1F9ED}", n: "\u015Acie\u017Cka rozwoju", s: "Etapy i kolejno\u015B\u0107", t: "devpath", c: "74,222,128" },
      { e: "\u{1F916}", n: "AI Tools", s: "Narz\u0119dzia AI do pracy", t: "aitools", c: "91,140,255" }
    ] }
  ];
  const all = SECTIONS.flatMap((s) => s.items);
  all.forEach((i) => {
    HUB_NAMES[i.t] = i.n;
  });
  const nq = fnorm(q.trim());
  const match = (i) => !nq || fnorm(i.n + " " + i.s).includes(nq);
  const favItems = fav.map((t) => all.find((i) => i.t === t)).filter(Boolean);
  const Tile = ({ i }) => {
    const on = fav.includes(i.t);
    return /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => go(i.t), style: { width: "100%", height: "100%", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "13px 12px", textAlign: "left", cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: `rgba(${i.c},.14)`, display: "grid", placeItems: "center", fontSize: 19 } }, i.e), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0, paddingRight: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: 13.5, lineHeight: 1.2 } }, i.n), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 2, lineHeight: 1.25 } }, i.s))), /* @__PURE__ */ React.createElement("button", { "aria-label": "Przypnij", onClick: (e) => {
      e.stopPropagation();
      buzz(5);
      favStore.toggle(i.t);
    }, style: { position: "absolute", top: 6, right: 6, background: "none", border: "none", cursor: "pointer", padding: 4, color: on ? "var(--gold2)" : "var(--faint)", fontSize: 14, lineHeight: 1 } }, on ? "\u2605" : "\u2606"));
  };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 9 };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("header", { style: { paddingTop: 26 } }, /* @__PURE__ */ React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 28, fontWeight: 800, letterSpacing: "-.03em" } }, "Rozw\xF3j"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, "Przypnij \u2605 to, z czego korzystasz najcz\u0119\u015Bciej")), /* @__PURE__ */ React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "\u{1F50D}  Szukaj: np. medytacja, biznes, sen\u2026", style: { ...inputStyle, width: "100%", marginTop: 16 } }), !nq && /* @__PURE__ */ React.createElement("button", { onClick: () => go("ai"), style: { width: "100%", marginTop: 12, background: "linear-gradient(135deg, rgba(245,181,61,.16), rgba(91,140,255,.13))", border: "1px solid var(--line2)", borderRadius: 18, padding: 15, textAlign: "left", cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center", gap: 13 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 28 } }, "\u{1F9E0}"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 } }, "Druga G\u0142owa"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 1 } }, "Zna Twoje dane: diet\u0119, trening, trading, finanse")), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--faint)", fontSize: 18 } }, "\u2192")), !nq && !hubStore.v.own && favItems.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "\u2605 Przypi\u0119te"), /* @__PURE__ */ React.createElement("div", { style: grid }, favItems.map((i) => /* @__PURE__ */ React.createElement(Tile, { key: i.t, i })))), !nq && React.createElement(HubOrder, { all, Tile, go }), (!nq && hubStore.v.own ? [] : SECTIONS).map((s) => {
    const items = s.items.filter(match);
    if (!items.length) return null;
    return /* @__PURE__ */ React.createElement("div", { key: s.title }, /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, s.title), /* @__PURE__ */ React.createElement("div", { style: grid }, items.map((i) => /* @__PURE__ */ React.createElement(Tile, { key: i.t, i }))));
  }), nq && !all.some(match) && /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 16, textAlign: "center", color: "var(--muted)" } }, "Nic nie znaleziono dla \u201E", q, "\u201D"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", textAlign: "center", margin: "16px 0 8px" } }, "Trening, Dieta, Nawyki, Finanse i Trading masz na dolnym pasku."));
}
function BackBar({ tab, setTab }) {
  const name = HUB_NAMES[tab] || (tab === "ai" ? "Druga G\u0142owa" : "");
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, paddingTop: 14, marginBottom: -12 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
    buzz(5);
    setTab("rozwoj");
  }, style: { ...iconBtn, width: "auto", padding: "0 12px", height: 34, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, color: "var(--muted)" } }, /* @__PURE__ */ React.createElement(ChevronLeft, { size: 16 }), "Rozw\xF3j"), name && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--faint)" } }, "/ ", name));
}

/* ───────────────────────── DIET / FITATU-STYLE ───────────────────────── */
const SEED_DIET = { age: 25, sex: "m", activity: "mod", surplus: 400, proteinPerKg: 2.0, fatPerKg: 0.9 };
const SEED_SHOPPING = {
    stores: ["Albert Heijn", "Action", "Polski Sklep", "Dirk"],
    items: [
        { id: uid(), name: "Pierś z kurczaka", store: "Albert Heijn", done: false },
        { id: uid(), name: "Jajka (10 szt)", store: "Albert Heijn", done: false },
        { id: uid(), name: "Twaróg / kwark", store: "Albert Heijn", done: false },
        { id: uid(), name: "Ryż / makaron pełnoziarnisty", store: "Albert Heijn", done: false },
        { id: uid(), name: "Kasza gryczana", store: "Polski Sklep", done: false },
        { id: uid(), name: "Kefir", store: "Polski Sklep", done: false },
        { id: uid(), name: "Pojemniki na posiłki", store: "Action", done: false },
        { id: uid(), name: "Banany", store: "Dirk", done: false },
    ],
};
const ACT_OPTS = [
    { k: "sed", label: "Siedzący", f: 1.2, hint: "biuro, mało ruchu" },
    { k: "light", label: "Lekki", f: 1.375, hint: "1–2 treningi/tydz" },
    { k: "mod", label: "Umiarkowany", f: 1.55, hint: "3–4 treningi/tydz" },
    { k: "high", label: "Wysoki", f: 1.725, hint: "praca fizyczna + trening" },
    { k: "veryHigh", label: "B. wysoki", f: 1.9, hint: "ciężka praca + sport" },
];
// macros are per 100 g (u:"g"), per 100 ml (u:"ml"), or per 1 unit (u: label like "szt")
const FOOD_CATS = ["Mięso & ryby", "Wędliny & przetwory", "Nabiał & jaja", "Węglowodany & zboża", "Pieczywo", "Owoce", "Warzywa", "Rośliny strączkowe & roślinne", "Tłuszcze & orzechy", "Przekąski & słodycze", "Sosy & dodatki", "Napoje", "Białko & suplementy", "Dania gotowe & fast food"];
const fnorm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const isWeight = (u) => u === "g" || u === "ml";
const foodRef = (u) => (isWeight(u) ? 100 : 1);
const FOODS = [
    // — Mięso & ryby —
    { n: "Pierś z kurczaka", cat: "Mięso & ryby", u: "g", kcal: 165, p: 31, c: 0, f: 3.6 },
    { n: "Udko z kurczaka (bez skóry)", cat: "Mięso & ryby", u: "g", kcal: 209, p: 26, c: 0, f: 11 },
    { n: "Udko z kurczaka (ze skórą)", cat: "Mięso & ryby", u: "g", kcal: 233, p: 24, c: 0, f: 15 },
    { n: "Skrzydełka z kurczaka", cat: "Mięso & ryby", u: "g", kcal: 203, p: 30, c: 0, f: 8 },
    { n: "Kurczak pieczony (mięso)", cat: "Mięso & ryby", u: "g", kcal: 190, p: 29, c: 0, f: 8 },
    { n: "Wątróbka drobiowa", cat: "Mięso & ryby", u: "g", kcal: 136, p: 17, c: 0.7, f: 5 },
    { n: "Pierś z indyka", cat: "Mięso & ryby", u: "g", kcal: 135, p: 29, c: 0, f: 1 },
    { n: "Udo z indyka", cat: "Mięso & ryby", u: "g", kcal: 170, p: 28, c: 0, f: 6 },
    { n: "Indyk mielony", cat: "Mięso & ryby", u: "g", kcal: 148, p: 21, c: 0, f: 7 },
    { n: "Stek wołowy (rostbef)", cat: "Mięso & ryby", u: "g", kcal: 217, p: 26, c: 0, f: 12 },
    { n: "Antrykot wołowy (ribeye)", cat: "Mięso & ryby", u: "g", kcal: 291, p: 24, c: 0, f: 21 },
    { n: "Polędwica wołowa", cat: "Mięso & ryby", u: "g", kcal: 150, p: 22, c: 0, f: 7 },
    { n: "Wołowina mielona 5%", cat: "Mięso & ryby", u: "g", kcal: 137, p: 21, c: 0, f: 6 },
    { n: "Wołowina mielona 15%", cat: "Mięso & ryby", u: "g", kcal: 215, p: 18, c: 0, f: 15 },
    { n: "Gulasz wołowy (łopatka)", cat: "Mięso & ryby", u: "g", kcal: 180, p: 20, c: 0, f: 11 },
    { n: "Wątroba wołowa", cat: "Mięso & ryby", u: "g", kcal: 135, p: 20, c: 3.9, f: 3.6 },
    { n: "Ozór wołowy", cat: "Mięso & ryby", u: "g", kcal: 224, p: 15, c: 3.7, f: 17 },
    { n: "Schab wieprzowy", cat: "Mięso & ryby", u: "g", kcal: 242, p: 27, c: 0, f: 14 },
    { n: "Karkówka wieprzowa", cat: "Mięso & ryby", u: "g", kcal: 259, p: 17, c: 0, f: 21 },
    { n: "Łopatka wieprzowa", cat: "Mięso & ryby", u: "g", kcal: 257, p: 17, c: 0, f: 21 },
    { n: "Polędwiczka wieprzowa", cat: "Mięso & ryby", u: "g", kcal: 143, p: 21, c: 0, f: 6 },
    { n: "Żeberka wieprzowe", cat: "Mięso & ryby", u: "g", kcal: 277, p: 18, c: 0, f: 22 },
    { n: "Golonka", cat: "Mięso & ryby", u: "g", kcal: 290, p: 18, c: 0, f: 24 },
    { n: "Wieprzowina mielona", cat: "Mięso & ryby", u: "g", kcal: 263, p: 17, c: 0, f: 21 },
    { n: "Boczek surowy", cat: "Mięso & ryby", u: "g", kcal: 518, p: 9, c: 0, f: 53 },
    { n: "Smalec", cat: "Mięso & ryby", u: "g", kcal: 892, p: 0, c: 0, f: 99 },
    { n: "Wątróbka wieprzowa", cat: "Mięso & ryby", u: "g", kcal: 134, p: 21, c: 2.5, f: 4 },
    { n: "Cielęcina (udziec)", cat: "Mięso & ryby", u: "g", kcal: 172, p: 21, c: 0, f: 9 },
    { n: "Jagnięcina", cat: "Mięso & ryby", u: "g", kcal: 294, p: 25, c: 0, f: 21 },
    { n: "Baranina", cat: "Mięso & ryby", u: "g", kcal: 234, p: 25, c: 0, f: 15 },
    { n: "Dziczyzna (sarnina)", cat: "Mięso & ryby", u: "g", kcal: 120, p: 22, c: 0, f: 3 },
    { n: "Kaczka (pierś, ze skórą)", cat: "Mięso & ryby", u: "g", kcal: 337, p: 19, c: 0, f: 28 },
    { n: "Kaczka (mięso bez skóry)", cat: "Mięso & ryby", u: "g", kcal: 135, p: 19, c: 0, f: 6 },
    { n: "Gęś (mięso)", cat: "Mięso & ryby", u: "g", kcal: 238, p: 25, c: 0, f: 15 },
    { n: "Królik", cat: "Mięso & ryby", u: "g", kcal: 136, p: 21, c: 0, f: 5 },
    { n: "Łosoś", cat: "Mięso & ryby", u: "g", kcal: 208, p: 20, c: 0, f: 13 },
    { n: "Łosoś wędzony", cat: "Mięso & ryby", u: "g", kcal: 177, p: 25, c: 0, f: 8 },
    { n: "Pstrąg", cat: "Mięso & ryby", u: "g", kcal: 148, p: 21, c: 0, f: 7 },
    { n: "Dorsz", cat: "Mięso & ryby", u: "g", kcal: 82, p: 18, c: 0, f: 0.7 },
    { n: "Mintaj", cat: "Mięso & ryby", u: "g", kcal: 81, p: 17, c: 0, f: 1 },
    { n: "Morszczuk", cat: "Mięso & ryby", u: "g", kcal: 87, p: 18, c: 0, f: 1.3 },
    { n: "Tuńczyk świeży", cat: "Mięso & ryby", u: "g", kcal: 144, p: 23, c: 0, f: 5 },
    { n: "Tuńczyk z puszki (w sosie własnym)", cat: "Mięso & ryby", u: "g", kcal: 116, p: 26, c: 0, f: 1 },
    { n: "Tuńczyk z puszki (w oleju)", cat: "Mięso & ryby", u: "g", kcal: 198, p: 29, c: 0, f: 9 },
    { n: "Makrela", cat: "Mięso & ryby", u: "g", kcal: 205, p: 19, c: 0, f: 14 },
    { n: "Makrela wędzona", cat: "Mięso & ryby", u: "g", kcal: 221, p: 21, c: 0, f: 16 },
    { n: "Śledź", cat: "Mięso & ryby", u: "g", kcal: 158, p: 18, c: 0, f: 9 },
    { n: "Śledź w oleju", cat: "Mięso & ryby", u: "g", kcal: 242, p: 16, c: 0, f: 20 },
    { n: "Sardynki w oleju", cat: "Mięso & ryby", u: "g", kcal: 208, p: 25, c: 0, f: 11 },
    { n: "Halibut", cat: "Mięso & ryby", u: "g", kcal: 110, p: 21, c: 0, f: 2.5 },
    { n: "Sola", cat: "Mięso & ryby", u: "g", kcal: 91, p: 18, c: 0, f: 1.5 },
    { n: "Karp", cat: "Mięso & ryby", u: "g", kcal: 127, p: 18, c: 0, f: 6 },
    { n: "Panga", cat: "Mięso & ryby", u: "g", kcal: 90, p: 15, c: 0, f: 3 },
    { n: "Tilapia", cat: "Mięso & ryby", u: "g", kcal: 96, p: 20, c: 0, f: 1.7 },
    { n: "Krewetki", cat: "Mięso & ryby", u: "g", kcal: 99, p: 24, c: 0.2, f: 0.3 },
    { n: "Małże", cat: "Mięso & ryby", u: "g", kcal: 86, p: 12, c: 3.7, f: 2 },
    { n: "Kalmary", cat: "Mięso & ryby", u: "g", kcal: 92, p: 16, c: 3, f: 1.4 },
    { n: "Ośmiornica", cat: "Mięso & ryby", u: "g", kcal: 82, p: 15, c: 2.2, f: 1 },
    { n: "Kawior", cat: "Mięso & ryby", u: "g", kcal: 264, p: 25, c: 4, f: 18 },
    { n: "Surimi (paluszki krabowe)", cat: "Mięso & ryby", u: "g", kcal: 95, p: 8, c: 15, f: 0.5 },
    // — Wędliny & przetwory —
    { n: "Szynka gotowana", cat: "Wędliny & przetwory", u: "g", kcal: 107, p: 18, c: 1.5, f: 3 },
    { n: "Szynka drobiowa", cat: "Wędliny & przetwory", u: "g", kcal: 110, p: 18, c: 2, f: 3 },
    { n: "Szynka wieprzowa wędzona", cat: "Wędliny & przetwory", u: "g", kcal: 145, p: 21, c: 1, f: 6 },
    { n: "Polędwica sopocka", cat: "Wędliny & przetwory", u: "g", kcal: 130, p: 21, c: 1, f: 5 },
    { n: "Polędwica drobiowa", cat: "Wędliny & przetwory", u: "g", kcal: 95, p: 19, c: 1.5, f: 1.5 },
    { n: "Kiełbasa zwyczajna", cat: "Wędliny & przetwory", u: "g", kcal: 298, p: 12, c: 2, f: 27 },
    { n: "Kiełbasa śląska", cat: "Wędliny & przetwory", u: "g", kcal: 300, p: 13, c: 1, f: 27 },
    { n: "Kiełbasa krakowska", cat: "Wędliny & przetwory", u: "g", kcal: 310, p: 16, c: 1, f: 27 },
    { n: "Kabanosy", cat: "Wędliny & przetwory", u: "g", kcal: 458, p: 24, c: 1, f: 40 },
    { n: "Salami", cat: "Wędliny & przetwory", u: "g", kcal: 407, p: 21, c: 1, f: 35 },
    { n: "Mortadela", cat: "Wędliny & przetwory", u: "g", kcal: 311, p: 16, c: 3, f: 26 },
    { n: "Parówki", cat: "Wędliny & przetwory", u: "g", kcal: 290, p: 11, c: 2, f: 26 },
    { n: "Parówki drobiowe", cat: "Wędliny & przetwory", u: "g", kcal: 230, p: 12, c: 2, f: 19 },
    { n: "Frankfurterki", cat: "Wędliny & przetwory", u: "g", kcal: 278, p: 12, c: 2, f: 25 },
    { n: "Boczek wędzony", cat: "Wędliny & przetwory", u: "g", kcal: 541, p: 37, c: 1.4, f: 42 },
    { n: "Pasztet drobiowy", cat: "Wędliny & przetwory", u: "g", kcal: 290, p: 12, c: 5, f: 25 },
    { n: "Pasztetowa", cat: "Wędliny & przetwory", u: "g", kcal: 330, p: 12, c: 4, f: 30 },
    { n: "Kaszanka", cat: "Wędliny & przetwory", u: "g", kcal: 250, p: 11, c: 12, f: 18 },
    { n: "Salceson", cat: "Wędliny & przetwory", u: "g", kcal: 230, p: 15, c: 1, f: 18 },
    { n: "Metka", cat: "Wędliny & przetwory", u: "g", kcal: 300, p: 13, c: 1, f: 27 },
    { n: "Szynka konserwowa", cat: "Wędliny & przetwory", u: "g", kcal: 185, p: 16, c: 2, f: 12 },
    { n: "Mielonka", cat: "Wędliny & przetwory", u: "g", kcal: 250, p: 14, c: 3, f: 20 },
    { n: "Bekon (plastry)", cat: "Wędliny & przetwory", u: "g", kcal: 417, p: 13, c: 1, f: 40 },
    { n: "Schab pieczony (wędlina)", cat: "Wędliny & przetwory", u: "g", kcal: 170, p: 22, c: 1, f: 9 },
    { n: "Indyk wędzony (wędlina)", cat: "Wędliny & przetwory", u: "g", kcal: 100, p: 20, c: 1, f: 2 },
    { n: "Chorizo", cat: "Wędliny & przetwory", u: "g", kcal: 455, p: 24, c: 2, f: 38 },
    { n: "Prosciutto", cat: "Wędliny & przetwory", u: "g", kcal: 250, p: 28, c: 0, f: 15 },
    // — Nabiał & jaja —
    { n: "Jajko", cat: "Nabiał & jaja", u: "szt", kcal: 78, p: 6.3, c: 0.6, f: 5.3 },
    { n: "Białko jaja", cat: "Nabiał & jaja", u: "szt", kcal: 17, p: 3.6, c: 0.2, f: 0.1 },
    { n: "Żółtko jaja", cat: "Nabiał & jaja", u: "szt", kcal: 55, p: 2.7, c: 0.3, f: 4.5 },
    { n: "Jajko przepiórcze", cat: "Nabiał & jaja", u: "szt", kcal: 14, p: 1.2, c: 0, f: 1 },
    { n: "Mleko 2%", cat: "Nabiał & jaja", u: "ml", kcal: 50, p: 3.4, c: 4.8, f: 2 },
    { n: "Mleko 3,2%", cat: "Nabiał & jaja", u: "ml", kcal: 61, p: 3.2, c: 4.8, f: 3.2 },
    { n: "Mleko 0%", cat: "Nabiał & jaja", u: "ml", kcal: 35, p: 3.5, c: 5, f: 0.1 },
    { n: "Mleko 1,5%", cat: "Nabiał & jaja", u: "ml", kcal: 46, p: 3.4, c: 4.9, f: 1.5 },
    { n: "Mleko owsiane", cat: "Nabiał & jaja", u: "ml", kcal: 46, p: 1, c: 8, f: 1.5 },
    { n: "Mleko migdałowe (niesłodzone)", cat: "Nabiał & jaja", u: "ml", kcal: 17, p: 0.6, c: 0.5, f: 1.4 },
    { n: "Mleko sojowe", cat: "Nabiał & jaja", u: "ml", kcal: 43, p: 3.3, c: 1.8, f: 1.9 },
    { n: "Mleko kokosowe (napój)", cat: "Nabiał & jaja", u: "ml", kcal: 30, p: 0.2, c: 2, f: 2 },
    { n: "Mleko kokosowe (z puszki)", cat: "Nabiał & jaja", u: "ml", kcal: 185, p: 2, c: 3, f: 18 },
    { n: "Kefir", cat: "Nabiał & jaja", u: "ml", kcal: 50, p: 3.3, c: 4, f: 2 },
    { n: "Maślanka", cat: "Nabiał & jaja", u: "ml", kcal: 40, p: 3.4, c: 4.7, f: 0.5 },
    { n: "Jogurt naturalny", cat: "Nabiał & jaja", u: "g", kcal: 61, p: 3.5, c: 4.7, f: 3.3 },
    { n: "Jogurt naturalny 0%", cat: "Nabiał & jaja", u: "g", kcal: 41, p: 4, c: 5, f: 0.1 },
    { n: "Jogurt grecki 2%", cat: "Nabiał & jaja", u: "g", kcal: 73, p: 9, c: 4, f: 2 },
    { n: "Jogurt grecki 0%", cat: "Nabiał & jaja", u: "g", kcal: 57, p: 10, c: 3.6, f: 0.1 },
    { n: "Jogurt grecki 5%", cat: "Nabiał & jaja", u: "g", kcal: 97, p: 9, c: 3.6, f: 5 },
    { n: "Jogurt owocowy", cat: "Nabiał & jaja", u: "g", kcal: 90, p: 4, c: 15, f: 2 },
    { n: "Jogurt pitny", cat: "Nabiał & jaja", u: "ml", kcal: 70, p: 3, c: 12, f: 1.5 },
    { n: "Skyr / kwark 0%", cat: "Nabiał & jaja", u: "g", kcal: 63, p: 11, c: 4, f: 0.2 },
    { n: "Twaróg chudy", cat: "Nabiał & jaja", u: "g", kcal: 72, p: 18, c: 3.5, f: 0.5 },
    { n: "Twaróg półtłusty", cat: "Nabiał & jaja", u: "g", kcal: 99, p: 17, c: 3.5, f: 2 },
    { n: "Twaróg tłusty", cat: "Nabiał & jaja", u: "g", kcal: 137, p: 16, c: 3.5, f: 7 },
    { n: "Serek wiejski", cat: "Nabiał & jaja", u: "g", kcal: 98, p: 12, c: 3.5, f: 4 },
    { n: "Serek wiejski light", cat: "Nabiał & jaja", u: "g", kcal: 78, p: 12, c: 3, f: 2 },
    { n: "Serek homogenizowany", cat: "Nabiał & jaja", u: "g", kcal: 140, p: 8, c: 14, f: 6 },
    { n: "Serek topiony", cat: "Nabiał & jaja", u: "g", kcal: 290, p: 10, c: 5, f: 25 },
    { n: "Serek kanapkowy (typu Almette)", cat: "Nabiał & jaja", u: "g", kcal: 250, p: 6, c: 3, f: 24 },
    { n: "Mascarpone", cat: "Nabiał & jaja", u: "g", kcal: 430, p: 5, c: 4, f: 44 },
    { n: "Ricotta", cat: "Nabiał & jaja", u: "g", kcal: 174, p: 11, c: 3, f: 13 },
    { n: "Feta", cat: "Nabiał & jaja", u: "g", kcal: 264, p: 14, c: 4, f: 21 },
    { n: "Mozzarella", cat: "Nabiał & jaja", u: "g", kcal: 280, p: 22, c: 2, f: 20 },
    { n: "Mozzarella light", cat: "Nabiał & jaja", u: "g", kcal: 170, p: 20, c: 2, f: 9 },
    { n: "Ser żółty (gouda)", cat: "Nabiał & jaja", u: "g", kcal: 356, p: 25, c: 0, f: 28 },
    { n: "Ser cheddar", cat: "Nabiał & jaja", u: "g", kcal: 402, p: 25, c: 1.3, f: 33 },
    { n: "Ser edamski", cat: "Nabiał & jaja", u: "g", kcal: 330, p: 27, c: 0, f: 24 },
    { n: "Parmezan", cat: "Nabiał & jaja", u: "g", kcal: 431, p: 38, c: 4, f: 29 },
    { n: "Ser pleśniowy (brie)", cat: "Nabiał & jaja", u: "g", kcal: 334, p: 21, c: 0.5, f: 28 },
    { n: "Ser pleśniowy (camembert)", cat: "Nabiał & jaja", u: "g", kcal: 300, p: 20, c: 0.5, f: 24 },
    { n: "Ser pleśniowy niebieski (gorgonzola)", cat: "Nabiał & jaja", u: "g", kcal: 353, p: 21, c: 2.3, f: 29 },
    { n: "Ser kozi", cat: "Nabiał & jaja", u: "g", kcal: 364, p: 22, c: 2.5, f: 30 },
    { n: "Ser wędzony", cat: "Nabiał & jaja", u: "g", kcal: 328, p: 24, c: 0, f: 26 },
    { n: "Halloumi", cat: "Nabiał & jaja", u: "g", kcal: 321, p: 21, c: 2, f: 25 },
    { n: "Oscypek", cat: "Nabiał & jaja", u: "g", kcal: 330, p: 24, c: 1, f: 26 },
    { n: "Ser żółty light", cat: "Nabiał & jaja", u: "g", kcal: 250, p: 30, c: 0, f: 14 },
    { n: "Masło", cat: "Nabiał & jaja", u: "g", kcal: 717, p: 0.9, c: 0.1, f: 81 },
    { n: "Masło klarowane (ghee)", cat: "Nabiał & jaja", u: "g", kcal: 900, p: 0, c: 0, f: 100 },
    { n: "Śmietana 12%", cat: "Nabiał & jaja", u: "ml", kcal: 117, p: 3.2, c: 4.6, f: 10 },
    { n: "Śmietana 18%", cat: "Nabiał & jaja", u: "ml", kcal: 183, p: 2.8, c: 4.1, f: 18 },
    { n: "Śmietana 30%", cat: "Nabiał & jaja", u: "ml", kcal: 292, p: 2.5, c: 3.4, f: 30 },
    { n: "Śmietana 36% (kremówka)", cat: "Nabiał & jaja", u: "ml", kcal: 336, p: 2.1, c: 2.9, f: 35 },
    { n: "Śmietana kwaśna 20%", cat: "Nabiał & jaja", u: "ml", kcal: 204, p: 2.6, c: 3.8, f: 20 },
    { n: "Bita śmietana (z puszki)", cat: "Nabiał & jaja", u: "g", kcal: 260, p: 2.5, c: 12, f: 22 },
    { n: "Budyń (gotowy)", cat: "Nabiał & jaja", u: "g", kcal: 95, p: 3, c: 16, f: 2.5 },
    // — Węglowodany & zboża —
    { n: "Ryż biały (suchy)", cat: "Węglowodany & zboża", u: "g", kcal: 350, p: 7, c: 78, f: 0.7 },
    { n: "Ryż biały (ugotowany)", cat: "Węglowodany & zboża", u: "g", kcal: 130, p: 2.7, c: 28, f: 0.3 },
    { n: "Ryż brązowy (suchy)", cat: "Węglowodany & zboża", u: "g", kcal: 357, p: 7.5, c: 72, f: 2.7 },
    { n: "Ryż brązowy (ugotowany)", cat: "Węglowodany & zboża", u: "g", kcal: 112, p: 2.6, c: 23, f: 0.9 },
    { n: "Ryż basmati (suchy)", cat: "Węglowodany & zboża", u: "g", kcal: 348, p: 8, c: 77, f: 0.9 },
    { n: "Ryż jaśminowy (suchy)", cat: "Węglowodany & zboża", u: "g", kcal: 352, p: 7, c: 79, f: 0.6 },
    { n: "Makaron (suchy)", cat: "Węglowodany & zboża", u: "g", kcal: 355, p: 12, c: 71, f: 1.5 },
    { n: "Makaron (ugotowany)", cat: "Węglowodany & zboża", u: "g", kcal: 157, p: 5.8, c: 30, f: 0.9 },
    { n: "Makaron pełnoziarnisty (suchy)", cat: "Węglowodany & zboża", u: "g", kcal: 348, p: 14, c: 62, f: 2.5 },
    { n: "Makaron ryżowy (suchy)", cat: "Węglowodany & zboża", u: "g", kcal: 360, p: 3.4, c: 84, f: 0.5 },
    { n: "Makaron sojowy / shirataki", cat: "Węglowodany & zboża", u: "g", kcal: 10, p: 0.1, c: 2, f: 0 },
    { n: "Kasza gryczana (sucha)", cat: "Węglowodany & zboża", u: "g", kcal: 336, p: 13, c: 69, f: 3.4 },
    { n: "Kasza gryczana (ugotowana)", cat: "Węglowodany & zboża", u: "g", kcal: 110, p: 4, c: 21, f: 1.1 },
    { n: "Kasza jaglana (sucha)", cat: "Węglowodany & zboża", u: "g", kcal: 346, p: 11, c: 72, f: 4 },
    { n: "Kasza jęczmienna (sucha)", cat: "Węglowodany & zboża", u: "g", kcal: 344, p: 9, c: 73, f: 2 },
    { n: "Kasza pęczak (sucha)", cat: "Węglowodany & zboża", u: "g", kcal: 340, p: 9, c: 73, f: 2 },
    { n: "Kasza kuskus (sucha)", cat: "Węglowodany & zboża", u: "g", kcal: 376, p: 13, c: 77, f: 0.6 },
    { n: "Kasza bulgur (sucha)", cat: "Węglowodany & zboża", u: "g", kcal: 342, p: 12, c: 76, f: 1.3 },
    { n: "Kasza manna (sucha)", cat: "Węglowodany & zboża", u: "g", kcal: 360, p: 10, c: 73, f: 1 },
    { n: "Komosa ryżowa / quinoa (sucha)", cat: "Węglowodany & zboża", u: "g", kcal: 368, p: 14, c: 64, f: 6 },
    { n: "Komosa ryżowa (ugotowana)", cat: "Węglowodany & zboża", u: "g", kcal: 120, p: 4.4, c: 21, f: 1.9 },
    { n: "Płatki owsiane", cat: "Węglowodany & zboża", u: "g", kcal: 379, p: 13, c: 67, f: 7 },
    { n: "Płatki owsiane górskie", cat: "Węglowodany & zboża", u: "g", kcal: 372, p: 12, c: 60, f: 7 },
    { n: "Otręby owsiane", cat: "Węglowodany & zboża", u: "g", kcal: 246, p: 17, c: 50, f: 7 },
    { n: "Płatki kukurydziane (cornflakes)", cat: "Węglowodany & zboża", u: "g", kcal: 357, p: 7, c: 84, f: 0.9 },
    { n: "Musli", cat: "Węglowodany & zboża", u: "g", kcal: 367, p: 9, c: 66, f: 7 },
    { n: "Granola", cat: "Węglowodany & zboża", u: "g", kcal: 471, p: 10, c: 64, f: 20 },
    { n: "Płatki jaglane", cat: "Węglowodany & zboża", u: "g", kcal: 360, p: 9, c: 72, f: 4 },
    { n: "Kasza owsiana (owsianka, ugot.)", cat: "Węglowodany & zboża", u: "g", kcal: 90, p: 3, c: 15, f: 2 },
    { n: "Mąka pszenna", cat: "Węglowodany & zboża", u: "g", kcal: 364, p: 10, c: 76, f: 1 },
    { n: "Mąka żytnia", cat: "Węglowodany & zboża", u: "g", kcal: 340, p: 9, c: 75, f: 1.7 },
    { n: "Mąka owsiana", cat: "Węglowodany & zboża", u: "g", kcal: 375, p: 13, c: 66, f: 7 },
    { n: "Mąka kukurydziana", cat: "Węglowodany & zboża", u: "g", kcal: 361, p: 7, c: 76, f: 3.9 },
    { n: "Mąka ziemniaczana / skrobia", cat: "Węglowodany & zboża", u: "g", kcal: 330, p: 0.4, c: 82, f: 0.1 },
    { n: "Ziemniaki (gotowane)", cat: "Węglowodany & zboża", u: "g", kcal: 87, p: 2, c: 17, f: 0.1 },
    { n: "Ziemniaki pieczone", cat: "Węglowodany & zboża", u: "g", kcal: 93, p: 2.5, c: 21, f: 0.1 },
    { n: "Puree ziemniaczane", cat: "Węglowodany & zboża", u: "g", kcal: 88, p: 2, c: 15, f: 2 },
    { n: "Bataty (słodkie ziemniaki)", cat: "Węglowodany & zboża", u: "g", kcal: 86, p: 1.6, c: 20, f: 0.1 },
    { n: "Frytki (pieczone)", cat: "Węglowodany & zboża", u: "g", kcal: 170, p: 3, c: 28, f: 5 },
    { n: "Gnocchi (kopytka)", cat: "Węglowodany & zboża", u: "g", kcal: 170, p: 4, c: 33, f: 1.5 },
    { n: "Kluski śląskie", cat: "Węglowodany & zboża", u: "g", kcal: 157, p: 3, c: 34, f: 0.5 },
    { n: "Makaron pełnoziarnisty (ugotowany)", cat: "Węglowodany & zboża", u: "g", kcal: 149, p: 6, c: 27, f: 1.4 },
    // — Pieczywo —
    { n: "Chleb pszenny (jasny)", cat: "Pieczywo", u: "g", kcal: 265, p: 9, c: 49, f: 3.2 },
    { n: "Chleb żytni razowy", cat: "Pieczywo", u: "g", kcal: 250, p: 8, c: 49, f: 1.5 },
    { n: "Chleb żytni na zakwasie", cat: "Pieczywo", u: "g", kcal: 230, p: 7, c: 46, f: 1.3 },
    { n: "Chleb graham", cat: "Pieczywo", u: "g", kcal: 247, p: 9, c: 47, f: 2 },
    { n: "Chleb pełnoziarnisty", cat: "Pieczywo", u: "g", kcal: 247, p: 13, c: 41, f: 4 },
    { n: "Pumpernikiel", cat: "Pieczywo", u: "g", kcal: 250, p: 8, c: 44, f: 2 },
    { n: "Chleb tostowy", cat: "Pieczywo", u: "g", kcal: 270, p: 8, c: 50, f: 4 },
    { n: "Bułka pszenna (kajzerka)", cat: "Pieczywo", u: "g", kcal: 290, p: 9, c: 55, f: 3 },
    { n: "Bułka grahamka", cat: "Pieczywo", u: "g", kcal: 260, p: 9, c: 50, f: 2.5 },
    { n: "Bagietka", cat: "Pieczywo", u: "g", kcal: 274, p: 9, c: 55, f: 2 },
    { n: "Chałka", cat: "Pieczywo", u: "g", kcal: 330, p: 8, c: 57, f: 8 },
    { n: "Tortilla pszenna", cat: "Pieczywo", u: "g", kcal: 310, p: 8, c: 52, f: 7 },
    { n: "Pita", cat: "Pieczywo", u: "g", kcal: 275, p: 9, c: 55, f: 1.2 },
    { n: "Naan", cat: "Pieczywo", u: "g", kcal: 310, p: 9, c: 50, f: 8 },
    { n: "Croissant maślany", cat: "Pieczywo", u: "g", kcal: 406, p: 8, c: 46, f: 21 },
    { n: "Rogal", cat: "Pieczywo", u: "g", kcal: 330, p: 8, c: 52, f: 10 },
    { n: "Bułka maślana", cat: "Pieczywo", u: "g", kcal: 340, p: 8, c: 55, f: 9 },
    { n: "Sucharki", cat: "Pieczywo", u: "g", kcal: 385, p: 11, c: 73, f: 5 },
    { n: "Pieczywo chrupkie (Wasa)", cat: "Pieczywo", u: "g", kcal: 335, p: 11, c: 64, f: 4 },
    { n: "Precle (pieczywo)", cat: "Pieczywo", u: "g", kcal: 380, p: 10, c: 71, f: 4 },
    { n: "Kromka chleba żytniego", cat: "Pieczywo", u: "szt", kcal: 70, p: 2.5, c: 14, f: 0.5 },
    { n: "Bułka tarta", cat: "Pieczywo", u: "g", kcal: 350, p: 12, c: 72, f: 4 },
    { n: "Grzanki / grzanka czosnkowa", cat: "Pieczywo", u: "g", kcal: 400, p: 9, c: 55, f: 16 },
    // — Owoce —
    { n: "Jabłko", cat: "Owoce", u: "g", kcal: 52, p: 0.3, c: 14, f: 0.2 },
    { n: "Banan", cat: "Owoce", u: "g", kcal: 89, p: 1.1, c: 23, f: 0.3 },
    { n: "Pomarańcza", cat: "Owoce", u: "g", kcal: 47, p: 0.9, c: 12, f: 0.1 },
    { n: "Mandarynka", cat: "Owoce", u: "g", kcal: 53, p: 0.8, c: 13, f: 0.3 },
    { n: "Grejpfrut", cat: "Owoce", u: "g", kcal: 42, p: 0.8, c: 11, f: 0.1 },
    { n: "Cytryna", cat: "Owoce", u: "g", kcal: 29, p: 1.1, c: 9, f: 0.3 },
    { n: "Winogrona", cat: "Owoce", u: "g", kcal: 69, p: 0.7, c: 18, f: 0.2 },
    { n: "Truskawki", cat: "Owoce", u: "g", kcal: 32, p: 0.7, c: 8, f: 0.3 },
    { n: "Maliny", cat: "Owoce", u: "g", kcal: 52, p: 1.2, c: 12, f: 0.7 },
    { n: "Borówki / jagody", cat: "Owoce", u: "g", kcal: 57, p: 0.7, c: 14, f: 0.3 },
    { n: "Jeżyny", cat: "Owoce", u: "g", kcal: 43, p: 1.4, c: 10, f: 0.5 },
    { n: "Porzeczki czarne", cat: "Owoce", u: "g", kcal: 63, p: 1.4, c: 15, f: 0.4 },
    { n: "Wiśnie", cat: "Owoce", u: "g", kcal: 50, p: 1, c: 12, f: 0.3 },
    { n: "Czereśnie", cat: "Owoce", u: "g", kcal: 63, p: 1.1, c: 16, f: 0.2 },
    { n: "Kiwi", cat: "Owoce", u: "g", kcal: 61, p: 1.1, c: 15, f: 0.5 },
    { n: "Mango", cat: "Owoce", u: "g", kcal: 60, p: 0.8, c: 15, f: 0.4 },
    { n: "Ananas", cat: "Owoce", u: "g", kcal: 50, p: 0.5, c: 13, f: 0.1 },
    { n: "Brzoskwinia", cat: "Owoce", u: "g", kcal: 39, p: 0.9, c: 10, f: 0.3 },
    { n: "Nektarynka", cat: "Owoce", u: "g", kcal: 44, p: 1.1, c: 11, f: 0.3 },
    { n: "Morela", cat: "Owoce", u: "g", kcal: 48, p: 1.4, c: 11, f: 0.4 },
    { n: "Śliwki", cat: "Owoce", u: "g", kcal: 46, p: 0.7, c: 11, f: 0.3 },
    { n: "Gruszka", cat: "Owoce", u: "g", kcal: 57, p: 0.4, c: 15, f: 0.1 },
    { n: "Arbuz", cat: "Owoce", u: "g", kcal: 30, p: 0.6, c: 8, f: 0.2 },
    { n: "Melon", cat: "Owoce", u: "g", kcal: 34, p: 0.8, c: 8, f: 0.2 },
    { n: "Granat", cat: "Owoce", u: "g", kcal: 83, p: 1.7, c: 19, f: 1.2 },
    { n: "Figa świeża", cat: "Owoce", u: "g", kcal: 74, p: 0.8, c: 19, f: 0.3 },
    { n: "Awokado", cat: "Owoce", u: "g", kcal: 160, p: 2, c: 9, f: 15 },
    { n: "Kokos (miąższ)", cat: "Owoce", u: "g", kcal: 354, p: 3.3, c: 15, f: 33 },
    { n: "Daktyle suszone", cat: "Owoce", u: "g", kcal: 282, p: 2.5, c: 75, f: 0.4 },
    { n: "Rodzynki", cat: "Owoce", u: "g", kcal: 299, p: 3, c: 79, f: 0.5 },
    { n: "Żurawina suszona", cat: "Owoce", u: "g", kcal: 308, p: 0.1, c: 82, f: 1.4 },
    { n: "Morele suszone", cat: "Owoce", u: "g", kcal: 241, p: 3.4, c: 63, f: 0.5 },
    { n: "Śliwki suszone", cat: "Owoce", u: "g", kcal: 240, p: 2.2, c: 64, f: 0.4 },
    { n: "Banan suszony (chips)", cat: "Owoce", u: "g", kcal: 519, p: 2.3, c: 58, f: 34 },
    { n: "Mus jabłkowy (bez cukru)", cat: "Owoce", u: "g", kcal: 42, p: 0.2, c: 11, f: 0.1 },
    { n: "Mandarynki z puszki", cat: "Owoce", u: "g", kcal: 70, p: 0.5, c: 17, f: 0.1 },
    // — Warzywa —
    { n: "Pomidor", cat: "Warzywa", u: "g", kcal: 18, p: 0.9, c: 3.9, f: 0.2 },
    { n: "Pomidorki koktajlowe", cat: "Warzywa", u: "g", kcal: 18, p: 0.9, c: 3.9, f: 0.2 },
    { n: "Ogórek", cat: "Warzywa", u: "g", kcal: 15, p: 0.7, c: 3.6, f: 0.1 },
    { n: "Ogórek kiszony", cat: "Warzywa", u: "g", kcal: 11, p: 0.6, c: 2.2, f: 0.2 },
    { n: "Papryka czerwona", cat: "Warzywa", u: "g", kcal: 31, p: 1, c: 6, f: 0.3 },
    { n: "Papryka zielona", cat: "Warzywa", u: "g", kcal: 20, p: 0.9, c: 4.6, f: 0.2 },
    { n: "Marchew", cat: "Warzywa", u: "g", kcal: 41, p: 0.9, c: 10, f: 0.2 },
    { n: "Burak", cat: "Warzywa", u: "g", kcal: 43, p: 1.6, c: 10, f: 0.2 },
    { n: "Cebula", cat: "Warzywa", u: "g", kcal: 40, p: 1.1, c: 9, f: 0.1 },
    { n: "Czosnek", cat: "Warzywa", u: "g", kcal: 149, p: 6.4, c: 33, f: 0.5 },
    { n: "Por", cat: "Warzywa", u: "g", kcal: 61, p: 1.5, c: 14, f: 0.3 },
    { n: "Brokuł", cat: "Warzywa", u: "g", kcal: 34, p: 2.8, c: 7, f: 0.4 },
    { n: "Kalafior", cat: "Warzywa", u: "g", kcal: 25, p: 1.9, c: 5, f: 0.3 },
    { n: "Kapusta biała", cat: "Warzywa", u: "g", kcal: 25, p: 1.3, c: 6, f: 0.1 },
    { n: "Kapusta czerwona", cat: "Warzywa", u: "g", kcal: 31, p: 1.4, c: 7, f: 0.2 },
    { n: "Kapusta kiszona", cat: "Warzywa", u: "g", kcal: 19, p: 0.9, c: 4, f: 0.1 },
    { n: "Kapusta pekińska", cat: "Warzywa", u: "g", kcal: 16, p: 1.2, c: 3.2, f: 0.2 },
    { n: "Jarmuż", cat: "Warzywa", u: "g", kcal: 49, p: 4.3, c: 9, f: 0.9 },
    { n: "Szpinak", cat: "Warzywa", u: "g", kcal: 23, p: 2.9, c: 3.6, f: 0.4 },
    { n: "Sałata", cat: "Warzywa", u: "g", kcal: 15, p: 1.4, c: 2.9, f: 0.2 },
    { n: "Rukola", cat: "Warzywa", u: "g", kcal: 25, p: 2.6, c: 3.7, f: 0.7 },
    { n: "Cukinia", cat: "Warzywa", u: "g", kcal: 17, p: 1.2, c: 3.1, f: 0.3 },
    { n: "Bakłażan", cat: "Warzywa", u: "g", kcal: 25, p: 1, c: 6, f: 0.2 },
    { n: "Pieczarki", cat: "Warzywa", u: "g", kcal: 22, p: 3.1, c: 3.3, f: 0.3 },
    { n: "Boczniaki", cat: "Warzywa", u: "g", kcal: 33, p: 3.3, c: 6, f: 0.4 },
    { n: "Dynia", cat: "Warzywa", u: "g", kcal: 26, p: 1, c: 6.5, f: 0.1 },
    { n: "Seler korzeniowy", cat: "Warzywa", u: "g", kcal: 42, p: 1.5, c: 9, f: 0.3 },
    { n: "Seler naciowy", cat: "Warzywa", u: "g", kcal: 16, p: 0.7, c: 3, f: 0.2 },
    { n: "Pietruszka korzeń", cat: "Warzywa", u: "g", kcal: 75, p: 3, c: 18, f: 0.8 },
    { n: "Rzodkiewka", cat: "Warzywa", u: "g", kcal: 16, p: 0.7, c: 3.4, f: 0.1 },
    { n: "Botwinka", cat: "Warzywa", u: "g", kcal: 19, p: 1.8, c: 3.3, f: 0.2 },
    { n: "Szparagi", cat: "Warzywa", u: "g", kcal: 20, p: 2.2, c: 3.9, f: 0.1 },
    { n: "Fasolka szparagowa", cat: "Warzywa", u: "g", kcal: 31, p: 1.8, c: 7, f: 0.1 },
    { n: "Groszek zielony", cat: "Warzywa", u: "g", kcal: 81, p: 5, c: 14, f: 0.4 },
    { n: "Kukurydza (ziarna)", cat: "Warzywa", u: "g", kcal: 86, p: 3.2, c: 19, f: 1.2 },
    { n: "Kukurydza z puszki", cat: "Warzywa", u: "g", kcal: 96, p: 3, c: 18, f: 1.3 },
    { n: "Pomidory z puszki (krojone)", cat: "Warzywa", u: "g", kcal: 32, p: 1.6, c: 7, f: 0.2 },
    { n: "Passata pomidorowa", cat: "Warzywa", u: "g", kcal: 35, p: 1.5, c: 7, f: 0.2 },
    { n: "Koncentrat pomidorowy", cat: "Warzywa", u: "g", kcal: 82, p: 4.3, c: 19, f: 0.5 },
    { n: "Oliwki zielone", cat: "Warzywa", u: "g", kcal: 145, p: 1, c: 4, f: 15 },
    { n: "Oliwki czarne", cat: "Warzywa", u: "g", kcal: 115, p: 0.8, c: 6, f: 11 },
    { n: "Ogórki konserwowe", cat: "Warzywa", u: "g", kcal: 20, p: 0.6, c: 4, f: 0.1 },
    { n: "Buraki z puszki", cat: "Warzywa", u: "g", kcal: 45, p: 1.5, c: 10, f: 0.1 },
    // — Rośliny strączkowe & roślinne —
    { n: "Soczewica czerwona (sucha)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 352, p: 24, c: 60, f: 1.5 },
    { n: "Soczewica zielona (sucha)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 353, p: 25, c: 60, f: 1.1 },
    { n: "Soczewica (ugotowana)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 116, p: 9, c: 20, f: 0.4 },
    { n: "Ciecierzyca (sucha)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 364, p: 19, c: 61, f: 6 },
    { n: "Ciecierzyca (ugotowana)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 164, p: 9, c: 27, f: 2.6 },
    { n: "Fasola biała (sucha)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 333, p: 21, c: 60, f: 1.5 },
    { n: "Fasola czerwona (sucha)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 337, p: 24, c: 60, f: 1.1 },
    { n: "Fasola czerwona z puszki", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 110, p: 7, c: 17, f: 0.5 },
    { n: "Fasola czarna (sucha)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 341, p: 21, c: 62, f: 1.4 },
    { n: "Groch (suchy)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 340, p: 23, c: 60, f: 1.5 },
    { n: "Bób", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 88, p: 7, c: 12, f: 0.7 },
    { n: "Soja (suche ziarna)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 446, p: 36, c: 30, f: 20 },
    { n: "Edamame", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 121, p: 12, c: 9, f: 5 },
    { n: "Tofu naturalne", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 144, p: 15, c: 3, f: 9 },
    { n: "Tofu wędzone", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 170, p: 18, c: 2, f: 11 },
    { n: "Tempeh", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 193, p: 19, c: 9, f: 11 },
    { n: "Seitan", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 143, p: 25, c: 14, f: 2 },
    { n: "Hummus", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 177, p: 8, c: 20, f: 9 },
    { n: "Pasta z ciecierzycy (falafel)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 333, p: 13, c: 32, f: 18 },
    { n: "Kotlet sojowy (gotowy)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 180, p: 16, c: 12, f: 8 },
    { n: "Mięso roślinne (Beyond/burger)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 230, p: 17, c: 5, f: 17 },
    { n: "Pasta orzechowa (z orzeszków ziemnych)", cat: "Rośliny strączkowe & roślinne", u: "g", kcal: 588, p: 25, c: 20, f: 50 },
    // — Tłuszcze & orzechy —
    { n: "Oliwa z oliwek", cat: "Tłuszcze & orzechy", u: "ml", kcal: 884, p: 0, c: 0, f: 100 },
    { n: "Olej rzepakowy", cat: "Tłuszcze & orzechy", u: "ml", kcal: 884, p: 0, c: 0, f: 100 },
    { n: "Olej kokosowy", cat: "Tłuszcze & orzechy", u: "ml", kcal: 892, p: 0, c: 0, f: 100 },
    { n: "Olej lniany", cat: "Tłuszcze & orzechy", u: "ml", kcal: 884, p: 0, c: 0, f: 100 },
    { n: "Olej słonecznikowy", cat: "Tłuszcze & orzechy", u: "ml", kcal: 884, p: 0, c: 0, f: 100 },
    { n: "Margaryna", cat: "Tłuszcze & orzechy", u: "g", kcal: 717, p: 0.2, c: 0.7, f: 80 },
    { n: "Migdały", cat: "Tłuszcze & orzechy", u: "g", kcal: 579, p: 21, c: 22, f: 50 },
    { n: "Orzechy włoskie", cat: "Tłuszcze & orzechy", u: "g", kcal: 654, p: 15, c: 14, f: 65 },
    { n: "Orzechy laskowe", cat: "Tłuszcze & orzechy", u: "g", kcal: 628, p: 15, c: 17, f: 61 },
    { n: "Orzechy nerkowca", cat: "Tłuszcze & orzechy", u: "g", kcal: 553, p: 18, c: 30, f: 44 },
    { n: "Orzechy ziemne (arachidowe)", cat: "Tłuszcze & orzechy", u: "g", kcal: 567, p: 26, c: 16, f: 49 },
    { n: "Orzechy pistacjowe", cat: "Tłuszcze & orzechy", u: "g", kcal: 560, p: 20, c: 28, f: 45 },
    { n: "Orzechy brazylijskie", cat: "Tłuszcze & orzechy", u: "g", kcal: 659, p: 14, c: 12, f: 67 },
    { n: "Orzechy makadamia", cat: "Tłuszcze & orzechy", u: "g", kcal: 718, p: 8, c: 14, f: 76 },
    { n: "Orzechy pekan", cat: "Tłuszcze & orzechy", u: "g", kcal: 691, p: 9, c: 14, f: 72 },
    { n: "Pestki dyni", cat: "Tłuszcze & orzechy", u: "g", kcal: 559, p: 30, c: 11, f: 49 },
    { n: "Pestki słonecznika", cat: "Tłuszcze & orzechy", u: "g", kcal: 584, p: 21, c: 20, f: 51 },
    { n: "Nasiona chia", cat: "Tłuszcze & orzechy", u: "g", kcal: 486, p: 17, c: 42, f: 31 },
    { n: "Siemię lniane", cat: "Tłuszcze & orzechy", u: "g", kcal: 534, p: 18, c: 29, f: 42 },
    { n: "Sezam", cat: "Tłuszcze & orzechy", u: "g", kcal: 573, p: 18, c: 23, f: 50 },
    { n: "Mak", cat: "Tłuszcze & orzechy", u: "g", kcal: 525, p: 18, c: 28, f: 42 },
    { n: "Masło orzechowe", cat: "Tłuszcze & orzechy", u: "g", kcal: 588, p: 25, c: 20, f: 50 },
    { n: "Masło migdałowe", cat: "Tłuszcze & orzechy", u: "g", kcal: 614, p: 21, c: 19, f: 56 },
    { n: "Tahini (pasta sezamowa)", cat: "Tłuszcze & orzechy", u: "g", kcal: 595, p: 17, c: 21, f: 54 },
    { n: "Wiórki kokosowe", cat: "Tłuszcze & orzechy", u: "g", kcal: 660, p: 7, c: 23, f: 64 },
    { n: "Orzechy mieszane", cat: "Tłuszcze & orzechy", u: "g", kcal: 607, p: 20, c: 18, f: 54 },
    { n: "Słonecznik łuskany", cat: "Tłuszcze & orzechy", u: "g", kcal: 584, p: 21, c: 20, f: 51 },
    // — Przekąski & słodycze —
    { n: "Czekolada gorzka 70%", cat: "Przekąski & słodycze", u: "g", kcal: 546, p: 8, c: 46, f: 38 },
    { n: "Czekolada gorzka 90%", cat: "Przekąski & słodycze", u: "g", kcal: 592, p: 10, c: 14, f: 55 },
    { n: "Czekolada mleczna", cat: "Przekąski & słodycze", u: "g", kcal: 535, p: 8, c: 57, f: 30 },
    { n: "Czekolada biała", cat: "Przekąski & słodycze", u: "g", kcal: 539, p: 6, c: 59, f: 31 },
    { n: "Baton czekoladowy (typu Snickers)", cat: "Przekąski & słodycze", u: "g", kcal: 488, p: 8, c: 60, f: 24 },
    { n: "Baton zbożowy", cat: "Przekąski & słodycze", u: "g", kcal: 400, p: 6, c: 68, f: 11 },
    { n: "Nutella / krem orzechowo-czekoladowy", cat: "Przekąski & słodycze", u: "g", kcal: 539, p: 6, c: 57, f: 31 },
    { n: "Żelki", cat: "Przekąski & słodycze", u: "g", kcal: 343, p: 7, c: 77, f: 0.2 },
    { n: "Cukierki krówki", cat: "Przekąski & słodycze", u: "g", kcal: 420, p: 3, c: 75, f: 12 },
    { n: "Lizak / cukierki twarde", cat: "Przekąski & słodycze", u: "g", kcal: 390, p: 0, c: 98, f: 0 },
    { n: "Ciastka (herbatniki)", cat: "Przekąski & słodycze", u: "g", kcal: 450, p: 6, c: 72, f: 15 },
    { n: "Ciastka owsiane", cat: "Przekąski & słodycze", u: "g", kcal: 450, p: 7, c: 65, f: 18 },
    { n: "Wafle (typu Prince Polo)", cat: "Przekąski & słodycze", u: "g", kcal: 520, p: 6, c: 62, f: 28 },
    { n: "Pierniki", cat: "Przekąski & słodycze", u: "g", kcal: 360, p: 5, c: 73, f: 5 },
    { n: "Pączek", cat: "Przekąski & słodycze", u: "g", kcal: 340, p: 6, c: 45, f: 15 },
    { n: "Drożdżówka", cat: "Przekąski & słodycze", u: "g", kcal: 330, p: 7, c: 52, f: 10 },
    { n: "Sernik", cat: "Przekąski & słodycze", u: "g", kcal: 270, p: 8, c: 25, f: 15 },
    { n: "Ciasto czekoladowe (brownie)", cat: "Przekąski & słodycze", u: "g", kcal: 420, p: 5, c: 50, f: 22 },
    { n: "Tiramisu", cat: "Przekąski & słodycze", u: "g", kcal: 300, p: 5, c: 30, f: 17 },
    { n: "Lody śmietankowe", cat: "Przekąski & słodycze", u: "g", kcal: 207, p: 3.5, c: 24, f: 11 },
    { n: "Lody wodne (sorbet)", cat: "Przekąski & słodycze", u: "g", kcal: 130, p: 0.4, c: 32, f: 0.1 },
    { n: "Chipsy ziemniaczane", cat: "Przekąski & słodycze", u: "g", kcal: 536, p: 6, c: 53, f: 33 },
    { n: "Chipsy (light/pieczone)", cat: "Przekąski & słodycze", u: "g", kcal: 460, p: 7, c: 62, f: 18 },
    { n: "Paluszki słone", cat: "Przekąski & słodycze", u: "g", kcal: 380, p: 11, c: 72, f: 5 },
    { n: "Krakersy", cat: "Przekąski & słodycze", u: "g", kcal: 430, p: 9, c: 68, f: 13 },
    { n: "Popcorn (na maśle)", cat: "Przekąski & słodycze", u: "g", kcal: 480, p: 9, c: 58, f: 24 },
    { n: "Popcorn (bez tłuszczu)", cat: "Przekąski & słodycze", u: "g", kcal: 375, p: 12, c: 74, f: 4 },
    { n: "Nachos", cat: "Przekąski & słodycze", u: "g", kcal: 490, p: 7, c: 60, f: 24 },
    { n: "Chrupki kukurydziane", cat: "Przekąski & słodycze", u: "g", kcal: 520, p: 5, c: 60, f: 30 },
    { n: "Miód", cat: "Przekąski & słodycze", u: "g", kcal: 304, p: 0.3, c: 82, f: 0 },
    { n: "Dżem", cat: "Przekąski & słodycze", u: "g", kcal: 250, p: 0.4, c: 62, f: 0.1 },
    { n: "Cukier", cat: "Przekąski & słodycze", u: "g", kcal: 400, p: 0, c: 100, f: 0 },
    { n: "Cukier brązowy", cat: "Przekąski & słodycze", u: "g", kcal: 380, p: 0, c: 98, f: 0 },
    { n: "Syrop klonowy", cat: "Przekąski & słodycze", u: "g", kcal: 260, p: 0, c: 67, f: 0 },
    { n: "Chałwa", cat: "Przekąski & słodycze", u: "g", kcal: 520, p: 12, c: 50, f: 30 },
    { n: "Marmolada", cat: "Przekąski & słodycze", u: "g", kcal: 265, p: 0.3, c: 66, f: 0.1 },
    { n: "Galaretka (gotowa)", cat: "Przekąski & słodycze", u: "g", kcal: 62, p: 1.2, c: 14, f: 0 },
    { n: "Ptasie mleczko", cat: "Przekąski & słodycze", u: "g", kcal: 420, p: 3, c: 68, f: 15 },
    // — Sosy & dodatki —
    { n: "Ketchup", cat: "Sosy & dodatki", u: "g", kcal: 112, p: 1.3, c: 26, f: 0.3 },
    { n: "Majonez", cat: "Sosy & dodatki", u: "g", kcal: 680, p: 1, c: 2, f: 75 },
    { n: "Majonez light", cat: "Sosy & dodatki", u: "g", kcal: 330, p: 1, c: 8, f: 32 },
    { n: "Musztarda", cat: "Sosy & dodatki", u: "g", kcal: 97, p: 6, c: 8, f: 4 },
    { n: "Sos sojowy", cat: "Sosy & dodatki", u: "ml", kcal: 60, p: 8, c: 6, f: 0 },
    { n: "Sos słodko-kwaśny", cat: "Sosy & dodatki", u: "g", kcal: 150, p: 0.5, c: 36, f: 0.1 },
    { n: "Sos BBQ", cat: "Sosy & dodatki", u: "g", kcal: 170, p: 1, c: 40, f: 0.5 },
    { n: "Sos czosnkowy", cat: "Sosy & dodatki", u: "g", kcal: 430, p: 2, c: 6, f: 44 },
    { n: "Pesto", cat: "Sosy & dodatki", u: "g", kcal: 450, p: 5, c: 6, f: 45 },
    { n: "Sos pomidorowy do makaronu", cat: "Sosy & dodatki", u: "g", kcal: 70, p: 1.5, c: 9, f: 3 },
    { n: "Guacamole", cat: "Sosy & dodatki", u: "g", kcal: 155, p: 2, c: 8, f: 13 },
    { n: "Salsa pomidorowa", cat: "Sosy & dodatki", u: "g", kcal: 40, p: 1.5, c: 8, f: 0.3 },
    { n: "Sos tzatziki", cat: "Sosy & dodatki", u: "g", kcal: 120, p: 3, c: 4, f: 10 },
    { n: "Hummus (sos)", cat: "Sosy & dodatki", u: "g", kcal: 177, p: 8, c: 20, f: 9 },
    { n: "Ocet balsamiczny", cat: "Sosy & dodatki", u: "ml", kcal: 88, p: 0.5, c: 17, f: 0 },
    { n: "Sos rybny", cat: "Sosy & dodatki", u: "ml", kcal: 50, p: 9, c: 4, f: 0 },
    { n: "Sriracha / sos chili", cat: "Sosy & dodatki", u: "g", kcal: 100, p: 2, c: 18, f: 1 },
    { n: "Sos teriyaki", cat: "Sosy & dodatki", u: "g", kcal: 130, p: 3, c: 28, f: 0 },
    { n: "Vegeta / przyprawa warzywna", cat: "Sosy & dodatki", u: "g", kcal: 170, p: 9, c: 28, f: 1 },
    { n: "Bulion (kostka, na 100 ml)", cat: "Sosy & dodatki", u: "ml", kcal: 10, p: 0.5, c: 1, f: 0.3 },
    // — Napoje —
    { n: "Woda", cat: "Napoje", u: "ml", kcal: 0, p: 0, c: 0, f: 0 },
    { n: "Woda gazowana", cat: "Napoje", u: "ml", kcal: 0, p: 0, c: 0, f: 0 },
    { n: "Kawa czarna (bez cukru)", cat: "Napoje", u: "ml", kcal: 2, p: 0.1, c: 0, f: 0 },
    { n: "Kawa z mlekiem", cat: "Napoje", u: "ml", kcal: 30, p: 1.5, c: 3, f: 1 },
    { n: "Herbata (bez cukru)", cat: "Napoje", u: "ml", kcal: 1, p: 0, c: 0.2, f: 0 },
    { n: "Sok pomarańczowy", cat: "Napoje", u: "ml", kcal: 45, p: 0.7, c: 10, f: 0.2 },
    { n: "Sok jabłkowy", cat: "Napoje", u: "ml", kcal: 46, p: 0.1, c: 11, f: 0.1 },
    { n: "Sok pomidorowy", cat: "Napoje", u: "ml", kcal: 17, p: 0.8, c: 3.5, f: 0.1 },
    { n: "Sok multiwitamina", cat: "Napoje", u: "ml", kcal: 48, p: 0.3, c: 11, f: 0.1 },
    { n: "Cola", cat: "Napoje", u: "ml", kcal: 42, p: 0, c: 11, f: 0 },
    { n: "Cola zero", cat: "Napoje", u: "ml", kcal: 0.3, p: 0, c: 0, f: 0 },
    { n: "Napój energetyczny", cat: "Napoje", u: "ml", kcal: 45, p: 0, c: 11, f: 0 },
    { n: "Napój energetyczny zero", cat: "Napoje", u: "ml", kcal: 3, p: 0, c: 0.5, f: 0 },
    { n: "Lemoniada", cat: "Napoje", u: "ml", kcal: 40, p: 0, c: 10, f: 0 },
    { n: "Napój izotoniczny", cat: "Napoje", u: "ml", kcal: 26, p: 0, c: 6, f: 0 },
    { n: "Oranżada / napój gazowany", cat: "Napoje", u: "ml", kcal: 38, p: 0, c: 9.5, f: 0 },
    { n: "Tonik", cat: "Napoje", u: "ml", kcal: 34, p: 0, c: 9, f: 0 },
    { n: "Kombucha", cat: "Napoje", u: "ml", kcal: 25, p: 0, c: 6, f: 0 },
    { n: "Piwo (jasne 5%)", cat: "Napoje", u: "ml", kcal: 43, p: 0.5, c: 3.6, f: 0 },
    { n: "Piwo bezalkoholowe", cat: "Napoje", u: "ml", kcal: 26, p: 0.4, c: 5.6, f: 0 },
    { n: "Wino czerwone wytrawne", cat: "Napoje", u: "ml", kcal: 85, p: 0.1, c: 2.6, f: 0 },
    { n: "Wino białe wytrawne", cat: "Napoje", u: "ml", kcal: 82, p: 0.1, c: 2.6, f: 0 },
    { n: "Wódka (40%)", cat: "Napoje", u: "ml", kcal: 231, p: 0, c: 0, f: 0 },
    { n: "Whisky (40%)", cat: "Napoje", u: "ml", kcal: 250, p: 0, c: 0, f: 0 },
    { n: "Smoothie owocowe", cat: "Napoje", u: "ml", kcal: 60, p: 1, c: 13, f: 0.5 },
    { n: "Koktajl mleczny (shake)", cat: "Napoje", u: "ml", kcal: 110, p: 3, c: 16, f: 3.5 },
    // — Białko & suplementy —
    { n: "Odżywka białkowa (whey)", cat: "Białko & suplementy", u: "g", kcal: 380, p: 80, c: 7, f: 6 },
    { n: "Białko serwatkowe izolat (WPI)", cat: "Białko & suplementy", u: "g", kcal: 373, p: 90, c: 2, f: 1.5 },
    { n: "Kazeina", cat: "Białko & suplementy", u: "g", kcal: 360, p: 78, c: 8, f: 3 },
    { n: "Białko roślinne (wegańskie)", cat: "Białko & suplementy", u: "g", kcal: 370, p: 75, c: 8, f: 6 },
    { n: "Gainer (odżywka na masę)", cat: "Białko & suplementy", u: "g", kcal: 380, p: 20, c: 65, f: 5 },
    { n: "Baton proteinowy", cat: "Białko & suplementy", u: "g", kcal: 350, p: 32, c: 38, f: 10 },
    { n: "Baton proteinowy (low carb)", cat: "Białko & suplementy", u: "g", kcal: 330, p: 40, c: 25, f: 12 },
    { n: "Chrupki proteinowe", cat: "Białko & suplementy", u: "g", kcal: 380, p: 55, c: 25, f: 8 },
    { n: "Kreatyna (monohydrat)", cat: "Białko & suplementy", u: "g", kcal: 0, p: 0, c: 0, f: 0 },
    { n: "BCAA / aminokwasy", cat: "Białko & suplementy", u: "g", kcal: 10, p: 2, c: 0, f: 0 },
    { n: "Glutamina", cat: "Białko & suplementy", u: "g", kcal: 0, p: 0, c: 0, f: 0 },
    { n: "Masło orzechowe proteinowe", cat: "Białko & suplementy", u: "g", kcal: 560, p: 35, c: 12, f: 40 },
    { n: "Budyń proteinowy (gotowy)", cat: "Białko & suplementy", u: "g", kcal: 80, p: 9, c: 7, f: 1.5 },
    // — Dania gotowe & fast food —
    { n: "Pierogi ruskie", cat: "Dania gotowe & fast food", u: "g", kcal: 200, p: 6, c: 32, f: 5 },
    { n: "Pierogi z mięsem", cat: "Dania gotowe & fast food", u: "g", kcal: 240, p: 9, c: 30, f: 9 },
    { n: "Pierogi z kapustą i grzybami", cat: "Dania gotowe & fast food", u: "g", kcal: 185, p: 5, c: 30, f: 5 },
    { n: "Naleśniki z serem", cat: "Dania gotowe & fast food", u: "g", kcal: 210, p: 8, c: 28, f: 7 },
    { n: "Naleśniki z dżemem", cat: "Dania gotowe & fast food", u: "g", kcal: 195, p: 5, c: 33, f: 5 },
    { n: "Gołąbki", cat: "Dania gotowe & fast food", u: "g", kcal: 120, p: 6, c: 12, f: 5 },
    { n: "Bigos", cat: "Dania gotowe & fast food", u: "g", kcal: 110, p: 6, c: 8, f: 6 },
    { n: "Kotlet schabowy (panierowany)", cat: "Dania gotowe & fast food", u: "g", kcal: 290, p: 20, c: 12, f: 18 },
    { n: "Kotlet mielony", cat: "Dania gotowe & fast food", u: "g", kcal: 250, p: 16, c: 10, f: 16 },
    { n: "Kotlet de volaille", cat: "Dania gotowe & fast food", u: "g", kcal: 300, p: 16, c: 16, f: 20 },
    { n: "Pulpety w sosie", cat: "Dania gotowe & fast food", u: "g", kcal: 150, p: 11, c: 7, f: 8 },
    { n: "Gulasz", cat: "Dania gotowe & fast food", u: "g", kcal: 150, p: 14, c: 5, f: 8 },
    { n: "Zrazy", cat: "Dania gotowe & fast food", u: "g", kcal: 180, p: 18, c: 6, f: 9 },
    { n: "Leczo", cat: "Dania gotowe & fast food", u: "g", kcal: 70, p: 3, c: 8, f: 3 },
    { n: "Fasolka po bretońsku", cat: "Dania gotowe & fast food", u: "g", kcal: 110, p: 6, c: 15, f: 3 },
    { n: "Spaghetti bolognese", cat: "Dania gotowe & fast food", u: "g", kcal: 160, p: 8, c: 18, f: 6 },
    { n: "Lasagne", cat: "Dania gotowe & fast food", u: "g", kcal: 170, p: 9, c: 15, f: 8 },
    { n: "Makaron carbonara", cat: "Dania gotowe & fast food", u: "g", kcal: 210, p: 9, c: 22, f: 10 },
    { n: "Risotto", cat: "Dania gotowe & fast food", u: "g", kcal: 165, p: 4, c: 25, f: 5 },
    { n: "Frytki (fast food)", cat: "Dania gotowe & fast food", u: "g", kcal: 312, p: 3.4, c: 41, f: 15 },
    { n: "Pizza margherita", cat: "Dania gotowe & fast food", u: "g", kcal: 250, p: 9, c: 30, f: 10 },
    { n: "Pizza pepperoni", cat: "Dania gotowe & fast food", u: "g", kcal: 290, p: 12, c: 30, f: 14 },
    { n: "Hamburger", cat: "Dania gotowe & fast food", u: "g", kcal: 250, p: 13, c: 22, f: 12 },
    { n: "Cheeseburger", cat: "Dania gotowe & fast food", u: "g", kcal: 280, p: 15, c: 22, f: 15 },
    { n: "Big Mac (typu)", cat: "Dania gotowe & fast food", u: "g", kcal: 257, p: 11, c: 20, f: 15 },
    { n: "Kebab (z mięsem i sosem)", cat: "Dania gotowe & fast food", u: "g", kcal: 215, p: 12, c: 16, f: 12 },
    { n: "Kebab w bułce", cat: "Dania gotowe & fast food", u: "g", kcal: 240, p: 13, c: 22, f: 11 },
    { n: "Hot dog", cat: "Dania gotowe & fast food", u: "g", kcal: 247, p: 10, c: 22, f: 14 },
    { n: "Zapiekanka", cat: "Dania gotowe & fast food", u: "g", kcal: 230, p: 8, c: 28, f: 10 },
    { n: "Frytki belgijskie z sosem", cat: "Dania gotowe & fast food", u: "g", kcal: 290, p: 4, c: 38, f: 14 },
    { n: "Nuggetsy z kurczaka", cat: "Dania gotowe & fast food", u: "g", kcal: 296, p: 15, c: 16, f: 19 },
    { n: "Fish and chips", cat: "Dania gotowe & fast food", u: "g", kcal: 230, p: 12, c: 24, f: 10 },
    { n: "Sushi (rolka)", cat: "Dania gotowe & fast food", u: "g", kcal: 145, p: 4, c: 28, f: 1.5 },
    { n: "Ramen (z dodatkami)", cat: "Dania gotowe & fast food", u: "g", kcal: 110, p: 5, c: 15, f: 3 },
    { n: "Tortilla / wrap z kurczakiem", cat: "Dania gotowe & fast food", u: "g", kcal: 215, p: 11, c: 22, f: 9 },
    { n: "Kanapka z szynką i serem", cat: "Dania gotowe & fast food", u: "g", kcal: 260, p: 12, c: 26, f: 12 },
    { n: "Jajecznica (na maśle)", cat: "Dania gotowe & fast food", u: "g", kcal: 155, p: 11, c: 1, f: 12 },
    { n: "Owsianka na mleku", cat: "Dania gotowe & fast food", u: "g", kcal: 110, p: 4, c: 16, f: 3 },
    { n: "Sałatka grecka", cat: "Dania gotowe & fast food", u: "g", kcal: 110, p: 3, c: 6, f: 8 },
    { n: "Sałatka cezar z kurczakiem", cat: "Dania gotowe & fast food", u: "g", kcal: 170, p: 11, c: 6, f: 11 },
    { n: "Rosół z makaronem", cat: "Dania gotowe & fast food", u: "g", kcal: 40, p: 3, c: 4, f: 1.2 },
    { n: "Zupa pomidorowa z ryżem", cat: "Dania gotowe & fast food", u: "g", kcal: 55, p: 2, c: 9, f: 1.5 },
    { n: "Krem z dyni", cat: "Dania gotowe & fast food", u: "g", kcal: 60, p: 1.5, c: 8, f: 2.5 },
    { n: "Żurek", cat: "Dania gotowe & fast food", u: "g", kcal: 70, p: 2.5, c: 7, f: 3.5 },
];
const SEED_MICROS = [
    { id: "vd", name: "Witamina D", rda: "2000–4000 IU", src: "słońce, tłuste ryby, żółtka", supp: "s_d3" },
    { id: "zn", name: "Cynk", rda: "11 mg", src: "wołowina, pestki dyni, jaja", supp: "s_zinc" },
    { id: "mg", name: "Magnez", rda: "400 mg", src: "orzechy, kasze, gorzka czekolada", supp: "s_mag" },
    { id: "omega", name: "Omega-3 (EPA/DHA)", rda: "1–2 g", src: "łosoś, makrela, siemię lniane", supp: "s_omega" },
    { id: "vc", name: "Witamina C", rda: "90 mg", src: "papryka, cytrusy, natka" },
    { id: "b12", name: "Witamina B12", rda: "2,4 µg", src: "mięso, ryby, nabiał, jaja" },
    { id: "fe", name: "Żelazo", rda: "8–10 mg", src: "czerwone mięso, wątróbka, szpinak" },
    { id: "ca", name: "Wapń", rda: "1000 mg", src: "nabiał, twaróg, jarmuż" },
    { id: "k", name: "Potas", rda: "3500 mg", src: "banany, ziemniaki, fasola" },
    { id: "se", name: "Selen", rda: "55 µg", src: "orzechy brazylijskie, ryby, jaja" },
    { id: "va", name: "Witamina A", rda: "900 µg", src: "marchew, wątróbka, jaja" },
];
function MacroBar({ icon: Ic, label, val, target, color }) {
    const p = target ? (val / target) * 100 : 0;
    return (React.createElement("div", { style: { marginBottom: 11 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 } },
            React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 } },
                React.createElement(Ic, { size: 14, color: color }),
                " ",
                label),
            React.createElement("span", { style: { fontSize: 12.5, fontWeight: 700, color: "var(--muted)" } },
                React.createElement("span", { style: { color: p > 105 ? "var(--amber)" : "var(--text)" } }, Math.round(val)),
                " / ",
                target,
                " g")),
        React.createElement(Bar, { pct: p, color: p > 105 ? "var(--amber)" : color, h: 7 })));
}
function BulkTips({ w, goal }) {
    const [open, setOpen] = useState(false);
    const bw = w || 80;
    const prot = Math.round(bw * 2);
    const fat = Math.round(bw * 0.9);
    const rows = [
        ["Tempo to podstawa", "Celuj w ~0,25–0,4 kg na tydzień (dla Ciebie, wysokiego i szczupłego, to ok. +1–1,5 kg miesięcznie). Szybciej = więcej tłuszczu. Waż się 2–3× w tygodniu rano i patrz na średnią z tygodnia, nie na jeden dzień."],
        ["Mała nadwyżka kalorii", "Tylko +250–400 kcal ponad utrzymanie. Przy bardzo aktywnym trybie (zmiany + trening) palisz dużo, więc najtrudniejsze będzie ZJEŚĆ tyle — nie sama nadwyżka."],
        ["Białko: ~" + prot + " g dziennie", "Około 2 g na kg masy ciała. Rozłóż na 4–5 posiłków po 30–40 g — mięśnie budują się lepiej niż przy jednym dużym posiłku."],
        ["Węglowodany = Twoje paliwo", "Przy dużej aktywności to one mają wypełnić większość nadwyżki. Najwięcej wokół treningu (przed i po): ryż, owsianka, makaron, ziemniaki, kasze, owoce."],
        ["Tłuszcze: ~" + fat + " g dziennie", "0,8–1 g na kg — potrzebne dla hormonów (w tym testosteronu). Nie przesadzaj: są bardzo kaloryczne i zajmują miejsce na węgle. Oliwa, orzechy, jajka, tłuste ryby."],
        ["Gdy ciężko zjeść tyle", "Typowe u wysokich. Ratuj się płynnymi kaloriami: koktajl (mleko + owsianka + masło orzechowe + banan + odżywka) to 600–800 kcal bez uczucia przejedzenia. Jedz kalorycznie, ale zdrowo: orzechy, masło orzechowe, oliwa, suszone owoce, pełnotłusty nabiał."],
        ["Progresja na treningu", "Bez dokładania ciężaru i powtórzeń nadwyżka pójdzie w tłuszcz. Rośnie siła na sztandze → masa idzie w mięśnie, nie w brzuch."],
        ["Sen i regeneracja", "Przy pracy zmianowej + treningu to klucz. Za mało snu = gorsze budowanie mięśni i łatwiejsze odkładanie tłuszczu."],
    ];
    return (React.createElement(Card, { style: { marginTop: 12, padding: 0, overflow: "hidden" } },
        React.createElement("button", { onClick: () => setOpen((o) => !o), style: { width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" } },
            React.createElement("span", { style: { fontSize: 20 } }, "\uD83D\uDCAA"),
            React.createElement("span", { style: { flex: 1, minWidth: 0 } },
                React.createElement("span", { style: { display: "block", fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, color: "var(--text)" } }, "Jak przybiera\u0107 na masie \u2014 bez t\u0142uszczu"),
                React.createElement("span", { style: { display: "block", fontSize: 11.5, color: "var(--faint)", marginTop: 1 } }, "Czysta masa przy bardzo aktywnym trybie")),
            React.createElement("span", { style: { color: "var(--faint)", fontSize: 13, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" } }, "\u25BE")),
        open && (React.createElement("div", { style: { padding: "0 16px 16px" } },
            rows.map(([t, b], i) => (React.createElement("div", { key: i, style: { padding: "10px 0", borderTop: "1px solid var(--line)" } },
                React.createElement("div", { style: { fontWeight: 700, fontSize: 13.5, color: "var(--green2)", marginBottom: 3 } }, t),
                React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 } }, b)))),
            React.createElement("div", { style: { padding: "10px 0 0", borderTop: "1px solid var(--line)" } },
                React.createElement("div", { style: { fontWeight: 700, fontSize: 13.5, color: "var(--amber)", marginBottom: 3 } }, "Kontroluj efekt"),
                React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 } }, "Ro\u015Bnie za szybko (>0,5 kg/tydz. przez 2\u20133 tygodnie, ro\u015Bnie pas w spodniach) \u2192 zbij nadwy\u017Ck\u0119 o 150\u2013200 kcal. Waga stoi 2 tygodnie \u2192 dodaj 200 kcal, najlepiej z w\u0119glowodan\u00F3w.")),
            React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 } }, "Wskaz\u00F3wki og\u00F3lne, nie porada medyczna. Dostosuj do samopoczucia i wynik\u00F3w.")))));
}
function ItemRow({ it, onToggle, onDel, onPrice }) {
    const [pv, setPv] = useState(it.price ? String(it.price) : "");
    useEffect(() => { setPv(it.price ? String(it.price) : ""); }, [it.price]);
    return (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderRadius: 13, background: "var(--surface)", border: "1px solid var(--line)", marginBottom: 8 } },
        React.createElement("div", { onClick: () => onToggle(it.id), style: { cursor: "pointer" } },
            React.createElement(CheckBox, { on: it.done })),
        React.createElement("span", { style: { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: it.done ? "var(--faint)" : "var(--text)", textDecoration: it.done ? "line-through" : "none", cursor: "pointer" }, onClick: () => onToggle(it.id) }, it.name),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 2, background: "var(--surface2)", borderRadius: 9, padding: "5px 9px", border: "1px solid var(--line)" } },
            React.createElement("span", { style: { fontSize: 12.5, color: "var(--faint)" } }, "\u20AC"),
            React.createElement("input", { value: pv, onChange: (e) => setPv(e.target.value.replace(",", ".")), onBlur: () => onPrice(it.id, pv), onKeyDown: (e) => { if (e.key === "Enter")
                    e.target.blur(); }, inputMode: "decimal", placeholder: "0", style: { width: 42, border: "none", background: "transparent", color: it.price ? "var(--gold2)" : "var(--faint)", fontSize: 13.5, fontWeight: 700, fontFamily: "var(--display)", outline: "none", textAlign: "right", padding: 0 } })),
        React.createElement("button", { onClick: () => onDel(it.id), style: { ...iconBtn, width: 30, height: 30, border: "none", background: "transparent", color: "var(--faint)" } },
            React.createElement(X, { size: 15 }))));
}
function Diet({ diet, setDiet, shopping, setShopping, day, setDay, profile, supps, measures, finance, setFinance, setToast, daily, setDayFor }) {
    const [seg, setSeg] = useState("plan");
    const dietMult = (STAGES.find((x) => x.k === (diet.stage || 1)) || STAGES[0]).mult;
    useEffect(() => {
        const st = diet.stage || 1;
        if (shopping.autoWin !== shopWindow(todayKey()).start || shopping.autoStage !== st)
            setShopping((p) => ({ ...mergeAutoShop(p, buildAutoShop(daily || {}, dietMult, (p.stores || [])[0] || "Sklep")), autoStage: st }));
    }, [diet.stage]);
    const [goalsOpen, setGoalsOpen] = useState(false);
    const [foodOpen, setFoodOpen] = useState(false);
    const [shopOpen, setShopOpen] = useState(false);
    const [storeAddOpen, setStoreAddOpen] = useState(false);
    const [store, setStore] = useState(shopping.stores[0] || "all");
    const [fn, setFn] = useState("");
    const [fk, setFk] = useState("");
    const [fp, setFp] = useState("");
    const [fc, setFc] = useState("");
    const [ff, setFf] = useState("");
    const [foodQuery, setFoodQuery] = useState("");
    const [selFood, setSelFood] = useState(null);
    const [qty, setQty] = useState(100);
    const [manualOpen, setManualOpen] = useState(false);
    const [mealSheet, setMealSheet] = useState(false);
    const [mealName, setMealName] = useState("");
    const [sn, setSn] = useState("");
    const [sStore, setSStore] = useState(shopping.stores[0] || "");
    const [newStore, setNewStore] = useState("");
    const [dAge, setDAge] = useState(diet.age);
    const [dAct, setDAct] = useState(diet.activity);
    const [dSur, setDSur] = useState(diet.surplus);
    const [dProt, setDProt] = useState(diet.proteinPerKg);
    const [dFat, setDFat] = useState(diet.fatPerKg);
    const [dSex, setDSex] = useState(diet.sex);
    // targets
    const w = profile.weight, h = profile.height, age = diet.age;
    const bmr = Math.round(10 * w + 6.25 * h - 5 * age + (diet.sex === "m" ? 5 : -161));
    const actF = (ACT_OPTS.find((a) => a.k === diet.activity) || { f: 1.55 }).f;
    const tdee = Math.round(bmr * actF);
    const calTarget = Math.round(tdee + (diet.surplus || 0));
    const pG = Math.round((diet.proteinPerKg || 2) * w);
    const fG = Math.round((diet.fatPerKg || 0.9) * w);
    const cG = Math.max(0, Math.round((calTarget - pG * 4 - fG * 9) / 4));
    const planEv = evalPlanDay(todayKey(), day, dietMult);
    const planRows = planEv.done.map((m) => { const ms = planEv.mealSums[m.id]; return { id: "plan_" + m.id, name: "📋 " + m.name + " (z planu)", kcal: Math.round(ms.kcal), p: +ms.p.toFixed(1), c: +ms.c.toFixed(1), f: +ms.f.toFixed(1) }; });
    const food = [...planRows, ...(day.food || [])];
    const meals = diet.meals || [];
    const recentFoods = (diet.recent || []).map((n) => FOODS.find((f) => f.n === n)).filter(Boolean);
    const sum = food.reduce((a, x) => ({ kcal: a.kcal + (x.kcal || 0), p: a.p + (x.p || 0), c: a.c + (x.c || 0), f: a.f + (x.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
    const calPct = calTarget ? (sum.kcal / calTarget) * 100 : 0;
    const left = Math.round(calTarget - sum.kcal);
    const addFood = (item) => { setDay((c) => ({ ...c, food: [{ id: uid(), ...item }, ...(c.food || [])] })); buzz(8); };
    const delFood = (id) => { if (String(id).startsWith("plan_")) { const mid = id.slice(5); setDay((c) => ({ ...c, mplan: { ...(c.mplan || {}), [mid]: { ...((c.mplan || {})[mid] || {}), done: false } } })); return; } setDay((c) => ({ ...c, food: (c.food || []).filter((x) => x.id !== id) })); };
    const saveMeal = () => {
        const nm = mealName.trim();
        const items = (day.food || []);
        if (!nm || !items.length) {
            setMealSheet(false);
            return;
        }
        setDiet((d) => ({ ...d, meals: [{ id: uid(), name: nm, items: items.map(({ name, kcal, p, c, f }) => ({ name, kcal, p, c, f })) }, ...(d.meals || [])] }));
        setMealName("");
        setMealSheet(false);
        buzz(10);
    };
    const addMeal = (m) => { setDay((c) => ({ ...c, food: [...m.items.map((it) => ({ id: uid(), ...it })), ...(c.food || [])] })); buzz(12); };
    const delMeal = (id) => setDiet((d) => ({ ...d, meals: (d.meals || []).filter((m) => m.id !== id) }));
    const addManual = () => {
        const k = parseFloat(fk);
        if (!fn.trim() || isNaN(k))
            return;
        addFood({ name: fn.trim(), kcal: k, p: parseFloat(fp) || 0, c: parseFloat(fc) || 0, f: parseFloat(ff) || 0 });
        setFn("");
        setFk("");
        setFp("");
        setFc("");
        setFf("");
        setManualOpen(false);
        setFoodOpen(false);
    };
    const openFoodSheet = () => { setFoodQuery(""); setSelFood(null); setManualOpen(false); setFn(""); setFk(""); setFp(""); setFc(""); setFf(""); setFoodOpen(true); };
    const pickFood = (it) => { setSelFood(it); setQty(it.u === "ml" ? 250 : isWeight(it.u) ? 100 : 1); };
    const scale = selFood ? (parseFloat(qty) || 0) / foodRef(selFood.u) : 0;
    const scaled = selFood ? { kcal: selFood.kcal * scale, p: selFood.p * scale, c: selFood.c * scale, f: selFood.f * scale } : null;
    const qStep = (d) => setQty((q) => { const v = Math.max(0, (parseFloat(q) || 0) + d); return isWeight(selFood?.u) ? v : Math.round(v); });
    const addSelected = () => {
        if (!selFood || !(parseFloat(qty) > 0))
            return;
        const unitLbl = isWeight(selFood.u) ? selFood.u : selFood.u;
        addFood({ name: `${selFood.n} (${parseFloat(qty)} ${unitLbl})`, kcal: Math.round(scaled.kcal), p: +scaled.p.toFixed(1), c: +scaled.c.toFixed(1), f: +scaled.f.toFixed(1) });
        setDiet((d) => ({ ...d, recent: [selFood.n, ...((d.recent || []).filter((n) => n !== selFood.n))].slice(0, 12) }));
        setSelFood(null);
        setFoodQuery("");
        setFoodOpen(false);
    };
    const foodMatches = (() => {
        const q = fnorm(foodQuery.trim());
        const list = q ? FOODS.filter((it) => fnorm(it.n).includes(q) || fnorm(it.cat).includes(q)) : FOODS;
        return list;
    })();
    // micros
    const microCov = (m) => !!(day.micros && day.micros[m.id]) || !!(m.supp && day.supps && day.supps[m.supp]);
    const toggleMicro = (id) => { buzz(8); setDay((c) => ({ ...c, micros: { ...(c.micros || {}), [id]: !((c.micros || {})[id]) } })); };
    const microsCovered = SEED_MICROS.filter(microCov).length;
    // shopping
    const stores = shopping.stores;
    const addItem = () => { if (!sn.trim())
        return; setShopping((p) => ({ ...p, items: [{ id: uid(), name: sn.trim(), store: sStore || p.stores[0], done: false, price: 0 }, ...p.items] })); setSn(""); buzz(8); };
    // odhaczenie z ceną → wydatek w Finansach (auto-kategoria); odznaczenie → usuwa ten wydatek
    const syncShopTx = (it, done, price) => {
        const txId = it.txId || ("shop_" + uid());
        if (done && price > 0) {
            const cat = shopCatFor(finance, it);
            const tx = { id: txId, type: "expense", amount: Math.round(price * 100) / 100, note: shopTxNote(it), date: it.txDate || todayKey(), cat, inc: null, src: "shop" };
            setFinance((f) => ({ ...f, tx: (f.tx || []).some((t) => t.id === txId) ? f.tx.map((t) => (t.id === txId ? tx : t)) : [tx, ...(f.tx || [])] }));
            if (setToast && !it.txId)
                setToast({ icon: "piggy", title: "Dodano do Finansów", msg: eur(tx.amount) + " · " + (((finance.cats || []).find((c) => c.id === cat) || {}).name || "wydatek"), color: "var(--green)" });
            return { txId, txDate: tx.date };
        }
        if (it.txId)
            setFinance((f) => ({ ...f, tx: (f.tx || []).filter((t) => t.id !== it.txId) }));
        return { txId: null, txDate: null };
    };
    const toggleItem = (id) => {
        buzz(8);
        const it = shopping.items.find((x) => x.id === id);
        if (!it)
            return;
        const done = !it.done;
        const link = syncShopTx(it, done, it.price || 0);
        setShopping((p) => ({ ...p, items: p.items.map((x) => (x.id === id ? { ...x, done, ...link } : x)) }));
    };
    const delItem = (id) => setShopping((p) => ({ ...p, items: p.items.filter((it) => it.id !== id) }));
    const clearDone = () => setShopping((p) => ({ ...p, items: p.items.filter((it) => !it.done) }));
    const addStore = () => { const n = newStore.trim(); if (!n || stores.includes(n)) {
        setStoreAddOpen(false);
        return;
    } setShopping((p) => ({ ...p, stores: [...p.stores, n] })); setNewStore(""); setStoreAddOpen(false); };
    const itemsFor = (st) => shopping.items.filter((it) => it.store === st).sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
    const setPrice = (id, v) => {
        const price = Math.max(0, parseFloat(v) || 0);
        const it = shopping.items.find((x) => x.id === id);
        const link = it && it.done ? syncShopTx(it, true, price) : {};
        setShopping((p) => ({ ...p, items: p.items.map((x) => (x.id === id ? { ...x, price, ...link } : x)) }));
    };
    const shopPlan = shopping.items.reduce((a, it) => a + (it.price || 0), 0);
    const shopBought = shopping.items.filter((it) => it.done).reduce((a, it) => a + (it.price || 0), 0);
    const shopUnlogged = shopping.items.filter((it) => !it.txId && (it.price || 0) > 0).length;
    const logShopping = () => {
        const useBought = shopBought > 0;
        const srcItems = shopping.items.filter((it) => !it.txId && (useBought ? it.done : true) && (it.price || 0) > 0);
        if (!srcItems.length)
            return;
        const byStore = {};
        srcItems.forEach((it) => { byStore[it.store] = (byStore[it.store] || 0) + (it.price || 0); });
        const newTx = Object.keys(byStore).map((st) => ({ id: uid(), date: todayKey(), type: "expense", amount: Math.round(byStore[st] * 100) / 100, note: "Zakupy · " + st }));
        const total = newTx.reduce((a, t) => a + t.amount, 0);
        setFinance((f) => ({ ...f, tx: [...newTx, ...(f.tx || [])] }));
        setShopping((p) => ({ ...p, items: useBought ? p.items.filter((it) => !it.done) : [] }));
        buzz(12);
        if (setToast)
            setToast({ icon: "piggy", title: "Zapisano wydatek", msg: eur(total) + (newTx.length > 1 ? " (" + newTx.length + " sklepy)" : " · " + newTx[0].note.replace("Zakupy · ", "")), color: "var(--green)" });
    };
    const saveGoals = () => {
        setDiet({ age: Math.max(14, parseInt(dAge) || 25), sex: dSex, activity: dAct, surplus: Math.round(parseFloat(dSur) || 0), proteinPerKg: parseFloat(dProt) || 2, fatPerKg: parseFloat(dFat) || 0.9 });
        setGoalsOpen(false);
        buzz(8);
    };
    const openGoals = () => { setDAge(diet.age); setDAct(diet.activity); setDSur(diet.surplus); setDProt(diet.proteinPerKg); setDFat(diet.fatPerKg); setDSex(diet.sex); setGoalsOpen(true); };
    // live preview in goals sheet
    const pBmr = Math.round(10 * w + 6.25 * h - 5 * (parseInt(dAge) || 0) + (dSex === "m" ? 5 : -161));
    const pF = (ACT_OPTS.find((a) => a.k === dAct) || { f: 1.55 }).f;
    const pTdee = Math.round(pBmr * pF);
    const pTarget = Math.round(pTdee + (parseFloat(dSur) || 0));
    const FoodRow = ({ it, onClick }) => (React.createElement("button", { onClick: onClick, style: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 7, cursor: "pointer", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", textAlign: "left" } },
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, it.n),
            React.createElement("div", { style: { fontSize: 11, color: "var(--faint)" } },
                "B ",
                it.p,
                " \u00B7 W ",
                it.c,
                " \u00B7 T ",
                it.f,
                " \u00B7 /",
                isWeight(it.u) ? (it.u === "ml" ? "100ml" : "100g") : it.u)),
        React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 13.5, color: "var(--gold2)", whiteSpace: "nowrap" } },
            it.kcal,
            " kcal")));
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26, display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
            React.createElement("div", null,
                React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Dieta"),
                React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, seg === "plan" ? `2 posiłki + koktajl · tłuszcz > węgle` : seg === "food" ? `cel ${calTarget} kcal · ${w}→${profile.goal} kg` : `${shopping.items.filter((i) => !i.done).length} rzeczy do kupienia`)),
            seg === "food" && (React.createElement("button", { onClick: openGoals, style: { ...iconBtn, width: "auto", padding: "0 14px", fontSize: 13, fontWeight: 700, color: "var(--green2)" } },
                React.createElement(Pencil, { size: 14, style: { marginRight: 5 } }),
                "Cele"))),
        React.createElement("div", { style: { display: "flex", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 4, marginTop: 16 } }, [["plan", "Plan", CalendarDays], ["food", "Jedzenie", Utensils], ["shop", "Zakupy", ShoppingCart]].map(([id, lbl, Ic]) => (React.createElement("button", { key: id, onClick: () => setSeg(id), style: {
                flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700, border: "none",
                background: seg === id ? "var(--surface2)" : "transparent", color: seg === id ? "var(--green2)" : "var(--muted)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all .15s",
            } },
            React.createElement(Ic, { size: 16 }),
            lbl)))),
        seg === "plan" ? React.createElement(MealPlan, { daily, setDayFor, diet, setDiet }) : seg === "food" ? (React.createElement("div", null,
            React.createElement(Card, { style: { marginTop: 14, display: "flex", alignItems: "center", gap: 16 } },
                React.createElement(Ring, { pct: calPct, size: 108, stroke: 10, glow: calPct >= 100, color: calPct > 110 ? "var(--amber)" : "var(--green)" },
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, lineHeight: 1, letterSpacing: "-.03em" } }, Math.round(sum.kcal)),
                        React.createElement("div", { style: { fontSize: 10, color: "var(--muted)", marginTop: 1 } },
                            "z ",
                            calTarget))),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                    React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 6 } },
                        React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, color: left < 0 ? "var(--amber)" : "var(--green2)" } }, Math.abs(left)),
                        React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } },
                            "kcal ",
                            left < 0 ? "ponad cel" : "pozostało")),
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", margin: "3px 0 10px" } }, "kcal spo\u017Cyte dzisiaj"),
                    React.createElement(Bar, { pct: calPct, color: calPct > 110 ? "var(--amber)" : "var(--green)", h: 8 }))),
            React.createElement(Card, { style: { marginTop: 12 } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, marginBottom: 12 } }, "Makrosk\u0142adniki"),
                React.createElement(MacroBar, { icon: Beef, label: "Bia\u0142ko", val: sum.p, target: pG, color: "var(--green)" }),
                React.createElement(MacroBar, { icon: Wheat, label: "W\u0119glowodany", val: sum.c, target: cG, color: "var(--blue)" }),
                React.createElement(MacroBar, { icon: Droplet, label: "T\u0142uszcze", val: sum.f, target: fG, color: "var(--gold)" }),
                React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 4, lineHeight: 1.5 } },
                    "Wyliczone pod przyrost masy (78\u2192",
                    profile.goal,
                    " kg). Szacunki, nie porada medyczna \u2014 dostosuj \u201ECele\".")),
            React.createElement(BulkTips, { w: w, goal: profile.goal }),
            React.createElement(WeightTrend, { measures: measures, diet: diet, setDiet: setDiet, profile: profile }),
            React.createElement("div", { style: { ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" } },
                React.createElement("span", null, "Moje zestawy"),
                React.createElement("button", { onClick: () => { setMealName(""); setMealSheet(true); }, style: { ...iconBtn, width: "auto", padding: "0 12px", fontSize: 12.5, fontWeight: 700, color: "var(--green2)" } }, "+ Zapisz dzi\u015B")),
            meals.length === 0 ? (React.createElement(Card, { style: { textAlign: "center", padding: 18, color: "var(--muted)", fontSize: 12.5, lineHeight: 1.5 } }, "Zapisz dzisiejszy zestaw jedzenia i dodawaj go potem jednym klikni\u0119ciem \u2014 szybkie wklepanie dnia na masie.")) : (React.createElement(Card, { pad: 6 }, meals.map((m, i) => {
                const tk = m.items.reduce((a, x) => a + (x.kcal || 0), 0);
                return (React.createElement("div", { key: m.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "11px 10px", borderBottom: i < meals.length - 1 ? "1px solid var(--line)" : "none" } },
                    React.createElement("button", { onClick: () => addMeal(m), style: { flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: 0 } },
                        React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.name),
                        React.createElement("div", { style: { fontSize: 11.5, color: "var(--green2)" } },
                            m.items.length,
                            " poz. \u00B7 ",
                            Math.round(tk),
                            " kcal \u00B7 dodaj \u21A9")),
                    React.createElement("button", { onClick: () => delMeal(m.id), style: { ...iconBtn, width: 28, height: 28, border: "none", background: "transparent", color: "var(--faint)" } },
                        React.createElement(X, { size: 15 }))));
            }))),
            React.createElement(Sheet, { open: mealSheet, onClose: () => setMealSheet(false), title: "Zapisz zestaw" },
                React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 } },
                    "Zapisuj\u0119 dzisiejsze ",
                    (day.food || []).length,
                    " pozycji jako zestaw do ponownego u\u017Cycia."),
                React.createElement("input", { value: mealName, onChange: (e) => setMealName(e.target.value), placeholder: "Nazwa, np. Dzie\u0144 na masie / Owsianka", style: inputStyle }),
                React.createElement("button", { style: { ...btnPrimary, marginTop: 10 }, onClick: saveMeal }, "Zapisz zestaw")),
            React.createElement("div", { style: sectionTitle }, "Dziennik \u2014 dzisiaj"),
            food.length === 0 ? (React.createElement(Card, { style: { textAlign: "center", padding: 28, color: "var(--muted)" } },
                React.createElement(Utensils, { size: 26, color: "var(--faint)", style: { marginBottom: 8 } }),
                React.createElement("div", { style: { fontSize: 14 } }, "Brak posi\u0142k\u00F3w. Dodaj pierwszy \u2193"))) : (React.createElement(Card, { pad: 6 }, food.map((x, i) => (React.createElement("div", { key: x.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "11px 10px", borderBottom: i < food.length - 1 ? "1px solid var(--line)" : "none" } },
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                    React.createElement("div", { style: { fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, x.name),
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)" } },
                        "B ",
                        Math.round(x.p),
                        " \u00B7 W ",
                        Math.round(x.c),
                        " \u00B7 T ",
                        Math.round(x.f),
                        " g")),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 14.5, color: "var(--gold2)" } },
                    Math.round(x.kcal),
                    React.createElement("span", { style: { fontSize: 10.5, color: "var(--faint)" } }, " kcal")),
                React.createElement("button", { onClick: () => delFood(x.id), style: { ...iconBtn, width: 28, height: 28, border: "none", background: "transparent", color: "var(--faint)" } },
                    React.createElement(X, { size: 15 }))))))),
            React.createElement("div", { style: { ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" } },
                React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 7 } },
                    React.createElement(Carrot, { size: 13 }),
                    " Mikrosk\u0142adniki"),
                React.createElement("span", { style: { textTransform: "none", letterSpacing: 0, fontSize: 11.5, color: microsCovered === SEED_MICROS.length ? "var(--green2)" : "var(--amber)" } },
                    microsCovered,
                    "/",
                    SEED_MICROS.length,
                    " pokryte")),
            React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", margin: "0 4px 10px" } }, "Odhaczaj, co dzi\u015B jad\u0142e\u015B/suplementowa\u0142e\u015B \u2014 reszta to Twoje braki."),
            SEED_MICROS.map((m) => {
                const cov = microCov(m);
                const bySupp = !!(m.supp && day.supps && day.supps[m.supp]);
                return (React.createElement("div", { key: m.id, onClick: () => toggleMicro(m.id), style: {
                        display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", marginBottom: 8, cursor: "pointer",
                        borderRadius: 13, background: "var(--surface)", border: `1px solid ${cov ? "rgba(34,197,94,.25)" : "var(--line)"}`,
                    } },
                    React.createElement(CheckBox, { on: cov }),
                    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7 } },
                            React.createElement("span", { style: { fontSize: 14, fontWeight: 600, color: cov ? "var(--muted)" : "var(--text)" } }, m.name),
                            React.createElement("span", { style: { fontSize: 11, color: "var(--faint)" } }, m.rda),
                            bySupp && React.createElement("span", { style: { fontSize: 9.5, color: "var(--green2)", background: "rgba(34,197,94,.12)", borderRadius: 99, padding: "1px 6px" } }, "suplement \u2713")),
                        React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginTop: 1 } }, m.src))));
            }),
            React.createElement("div", { style: { height: 8 } }),
            React.createElement("button", { onClick: openFoodSheet, style: fab },
                React.createElement(Plus, { size: 26, color: "#04130a", strokeWidth: 3 })))) : (React.createElement("div", null,
            React.createElement(AutoShopBar, { shopping, setShopping, daily: daily || {}, diet }),
            React.createElement("div", { style: { display: "flex", gap: 8, overflowX: "auto", padding: "16px 0 4px", margin: "0 -16px", paddingLeft: 16, paddingRight: 16 }, className: "noscroll" },
                React.createElement(Chip, { on: store === "all", onClick: () => setStore("all"), label: "Wszystko", color: "var(--green2)", count: shopping.items.filter((i) => !i.done).length }),
                stores.map((s) => React.createElement(Chip, { key: s, on: store === s, onClick: () => setStore(s), label: s, color: "var(--gold2)", count: shopping.items.filter((i) => i.store === s && !i.done).length })),
                React.createElement("button", { onClick: () => { setNewStore(""); setStoreAddOpen(true); }, style: { ...iconBtn, width: 34, height: 34, borderRadius: 99 } },
                    React.createElement(Plus, { size: 16 }))),
            shopping.items.length > 0 && (React.createElement(Card, { style: { marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" } },
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", fontWeight: 600 } }, "Plan zakup\u00F3w"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", color: "var(--gold2)" } }, eur(shopPlan))),
                React.createElement("div", { style: { textAlign: "right" } },
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, "w koszyku"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 17, color: "var(--green2)" } }, eur(shopBought)),
                    React.createElement("div", { style: { fontSize: 10.5, color: "var(--faint)", marginTop: 2 } },
                        shopping.items.filter((i) => !i.done).length,
                        " do kupienia")))),
            React.createElement("div", { style: { marginTop: 14 } }, store === "all" ? (shopping.items.length === 0 ? (React.createElement(Card, { style: { textAlign: "center", padding: 28, color: "var(--muted)" } },
                React.createElement(ShoppingCart, { size: 26, color: "var(--faint)", style: { marginBottom: 8 } }),
                React.createElement("div", { style: { fontSize: 14 } }, "Lista pusta. Dodaj co\u015B \u2193"))) : (stores.filter((s) => itemsFor(s).length > 0).map((s) => (React.createElement("div", { key: s, style: { marginBottom: 10 } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, margin: "4px 4px 8px" } },
                    React.createElement(Store, { size: 13, color: "var(--gold2)" }),
                    React.createElement("span", { style: { fontFamily: "var(--display)", fontSize: 13, fontWeight: 700, color: "var(--muted)" } }, s)),
                itemsFor(s).map((it) => React.createElement(ItemRow, { key: it.id, it: it, onToggle: toggleItem, onDel: delItem, onPrice: setPrice }))))))) : (itemsFor(store).length === 0 ? (React.createElement(Card, { style: { textAlign: "center", padding: 28, color: "var(--muted)" } },
                React.createElement(ShoppingCart, { size: 26, color: "var(--faint)", style: { marginBottom: 8 } }),
                React.createElement("div", { style: { fontSize: 14 } },
                    "Brak rzeczy dla \u201E",
                    store,
                    "\". Dodaj \u2193"))) : (itemsFor(store).map((it) => React.createElement(ItemRow, { key: it.id, it: it, onToggle: toggleItem, onDel: delItem, onPrice: setPrice }))))),
            (shopUnlogged > 0 && false) && (React.createElement("button", { onClick: logShopping, style: { ...btnPrimary, marginTop: 10 } }, shopBought > 0 ? "Zapisz kupione jako wydatek · " + eur(shopBought) : "Zapisz całość jako wydatek · " + eur(shopPlan))),
            shopping.items.some((i) => i.done) && (React.createElement("button", { onClick: clearDone, style: { ...inputStyle, width: "100%", cursor: "pointer", color: "var(--faint)", fontWeight: 600, textAlign: "center", border: "1px dashed var(--line2)", background: "transparent", marginTop: 8 } }, "Usu\u0144 kupione (bez zapisu)")),
            React.createElement("div", { style: { height: 8 } }),
            React.createElement("button", { onClick: () => { setSn(""); setSStore(store === "all" ? stores[0] : store); setShopOpen(true); }, style: fab },
                React.createElement(Plus, { size: 26, color: "#04130a", strokeWidth: 3 })))),
        React.createElement(Sheet, { open: goalsOpen, onClose: () => setGoalsOpen(false), title: "Cele kaloryczne" },
            React.createElement("div", { style: { display: "flex", gap: 10, padding: 14, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--line)", marginBottom: 4 } },
                React.createElement("div", { style: { flex: 1, textAlign: "center" } },
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "BMR"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18 } }, pBmr)),
                React.createElement("div", { style: { flex: 1, textAlign: "center", borderLeft: "1px solid var(--line)", borderRight: "1px solid var(--line)" } },
                    React.createElement("div", { style: { fontSize: 11, color: "var(--muted)" } }, "TDEE"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18 } }, pTdee)),
                React.createElement("div", { style: { flex: 1, textAlign: "center" } },
                    React.createElement("div", { style: { fontSize: 11, color: "var(--green2)" } }, "Cel"),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--green2)" } }, pTarget))),
            React.createElement("label", { style: label }, "Wiek"),
            React.createElement("input", { style: inputStyle, type: "number", inputMode: "numeric", value: dAge, onChange: (e) => setDAge(e.target.value) }),
            React.createElement("label", { style: label }, "P\u0142e\u0107"),
            React.createElement("div", { style: { display: "flex", gap: 8 } }, [["m", "Mężczyzna"], ["f", "Kobieta"]].map(([k, l]) => React.createElement(Chip, { key: k, on: dSex === k, onClick: () => setDSex(k), label: l, color: "var(--green2)" }))),
            React.createElement("label", { style: label }, "Aktywno\u015B\u0107"),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 7 } }, ACT_OPTS.map((a) => (React.createElement("button", { key: a.k, onClick: () => setDAct(a.k), style: {
                    display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 13px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                    border: dAct === a.k ? "1.5px solid var(--green)" : "1px solid var(--line2)", background: dAct === a.k ? "rgba(34,197,94,.1)" : "var(--surface)",
                } },
                React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: dAct === a.k ? "var(--green2)" : "var(--text)" } }, a.label),
                React.createElement("span", { style: { fontSize: 11.5, color: "var(--faint)" } },
                    a.hint,
                    " \u00B7 \u00D7",
                    a.f))))),
            React.createElement("label", { style: label },
                "Nadwy\u017Cka kaloryczna (na mas\u0119): +",
                Math.round(parseFloat(dSur) || 0),
                " kcal"),
            React.createElement("input", { style: inputStyle, type: "number", inputMode: "numeric", value: dSur, onChange: (e) => setDSur(e.target.value) }),
            React.createElement("div", { style: { display: "flex", gap: 10 } },
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("label", { style: label }, "Bia\u0142ko (g/kg)"),
                    React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: dProt, onChange: (e) => setDProt(e.target.value) })),
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("label", { style: label }, "T\u0142uszcze (g/kg)"),
                    React.createElement("input", { style: inputStyle, type: "number", inputMode: "decimal", value: dFat, onChange: (e) => setDFat(e.target.value) }))),
            React.createElement("button", { style: btnPrimary, onClick: saveGoals }, "Zapisz cele")),
        React.createElement(Sheet, { open: foodOpen, onClose: () => setFoodOpen(false), title: "Dodaj posi\u0142ek" },
            React.createElement("input", { style: inputStyle, placeholder: "Szukaj produktu (np. stek, ry\u017C, jajko)", value: foodQuery, autoFocus: true, onChange: (e) => { setFoodQuery(e.target.value); setSelFood(null); } }),
            selFood && (React.createElement("div", { style: { marginTop: 12, padding: 14, borderRadius: 14, background: "var(--surface2)", border: "1px solid var(--green)" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
                    React.createElement("div", { style: { fontSize: 14.5, fontWeight: 700 } }, selFood.n),
                    React.createElement("button", { onClick: () => setSelFood(null), style: { ...iconBtn, width: 28, height: 28, border: "none", background: "transparent", color: "var(--faint)" } },
                        React.createElement(X, { size: 15 }))),
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                    React.createElement("button", { onClick: () => qStep(isWeight(selFood.u) ? -10 : -1), style: { width: 44, height: 42, borderRadius: 11, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--text)" } },
                        React.createElement(Minus, { size: 15 })),
                    React.createElement("input", { style: { ...inputStyle, textAlign: "center", fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, flex: 1 }, type: "number", inputMode: "decimal", value: qty, onChange: (e) => setQty(e.target.value) }),
                    React.createElement("span", { style: { fontSize: 13, color: "var(--muted)", minWidth: 40, textAlign: "center" } }, selFood.u),
                    React.createElement("button", { onClick: () => qStep(isWeight(selFood.u) ? 10 : 1), style: { width: 44, height: 42, borderRadius: 11, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, border: "none", background: "var(--green)", color: "#04130a" } },
                        React.createElement(Plus, { size: 15 }))),
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 12 } },
                    React.createElement("div", { style: { textAlign: "center", flex: 1 } },
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--gold2)" } }, Math.round(scaled.kcal)),
                        React.createElement("div", { style: { fontSize: 10, color: "var(--faint)" } }, "kcal")),
                    React.createElement("div", { style: { textAlign: "center", flex: 1 } },
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--green2)" } }, scaled.p.toFixed(1)),
                        React.createElement("div", { style: { fontSize: 10, color: "var(--faint)" } }, "B (g)")),
                    React.createElement("div", { style: { textAlign: "center", flex: 1 } },
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--blue)" } }, scaled.c.toFixed(1)),
                        React.createElement("div", { style: { fontSize: 10, color: "var(--faint)" } }, "W (g)")),
                    React.createElement("div", { style: { textAlign: "center", flex: 1 } },
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--gold)" } }, scaled.f.toFixed(1)),
                        React.createElement("div", { style: { fontSize: 10, color: "var(--faint)" } }, "T (g)"))),
                React.createElement("button", { style: btnPrimary, onClick: addSelected }, "Dodaj do dziennika"))),
            !selFood && (React.createElement("div", { style: { maxHeight: "44vh", overflowY: "auto", margin: "12px -2px 0", padding: "0 2px" }, className: "noscroll" }, foodQuery.trim()
                ? (foodMatches.length === 0
                    ? React.createElement("div", { style: { textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 20 } }, "Brak wynik\u00F3w \u2014 wpisz r\u0119cznie poni\u017Cej.")
                    : foodMatches.map((it) => React.createElement(FoodRow, { key: it.n, it: it, onClick: () => pickFood(it) })))
                : (React.createElement(React.Fragment, null,
                    recentFoods.length > 0 && (React.createElement("div", null,
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontSize: 11.5, fontWeight: 700, color: "var(--gold2)", textTransform: "uppercase", letterSpacing: ".06em", margin: "10px 2px 7px" } }, "\u2605 Ostatnio u\u017Cywane"),
                        recentFoods.map((it) => React.createElement(FoodRow, { key: "r" + it.n, it: it, onClick: () => pickFood(it) })))),
                    FOOD_CATS.map((cat) => {
                        const items = FOODS.filter((x) => x.cat === cat);
                        if (!items.length)
                            return null;
                        return (React.createElement("div", { key: cat },
                            React.createElement("div", { style: { fontFamily: "var(--display)", fontSize: 11.5, fontWeight: 700, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".06em", margin: "10px 2px 7px" } }, cat),
                            items.map((it) => React.createElement(FoodRow, { key: it.n, it: it, onClick: () => pickFood(it) }))));
                    }))))),
            !selFood && (React.createElement(React.Fragment, null,
                React.createElement("button", { onClick: () => setManualOpen((o) => !o), style: { ...inputStyle, width: "100%", cursor: "pointer", color: "var(--muted)", fontWeight: 700, textAlign: "center", border: "1px dashed var(--line2)", background: "transparent", marginTop: 12 } }, manualOpen ? "Ukryj ręczne wpisywanie" : "Nie ma na liście? Wpisz ręcznie"),
                manualOpen && (React.createElement("div", { style: { marginTop: 10 } },
                    React.createElement("input", { style: inputStyle, placeholder: "Nazwa (np. Jogurt marki X)", value: fn, onChange: (e) => setFn(e.target.value) }),
                    React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } },
                        React.createElement("input", { style: { ...inputStyle, flex: 1.2 }, type: "number", inputMode: "numeric", placeholder: "kcal", value: fk, onChange: (e) => setFk(e.target.value) }),
                        React.createElement("input", { style: { ...inputStyle, flex: 1 }, type: "number", inputMode: "decimal", placeholder: "B", value: fp, onChange: (e) => setFp(e.target.value) }),
                        React.createElement("input", { style: { ...inputStyle, flex: 1 }, type: "number", inputMode: "decimal", placeholder: "W", value: fc, onChange: (e) => setFc(e.target.value) }),
                        React.createElement("input", { style: { ...inputStyle, flex: 1 }, type: "number", inputMode: "decimal", placeholder: "T", value: ff, onChange: (e) => setFf(e.target.value) })),
                    React.createElement("button", { style: btnPrimary, onClick: addManual }, "Dodaj do dziennika")))))),
        React.createElement(Sheet, { open: shopOpen, onClose: () => setShopOpen(false), title: "Dodaj do listy" },
            React.createElement("label", { style: label }, "Co kupi\u0107?"),
            React.createElement("input", { style: inputStyle, placeholder: "np. Mas\u0142o orzechowe", value: sn, autoFocus: true, onChange: (e) => setSn(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") {
                    addItem();
                    setShopOpen(false);
                } } }),
            React.createElement("label", { style: label }, "Sklep"),
            React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, stores.map((s) => React.createElement(Chip, { key: s, on: sStore === s, onClick: () => setSStore(s), label: s, color: "var(--gold2)" }))),
            React.createElement("button", { style: btnPrimary, onClick: () => { addItem(); setShopOpen(false); } }, "Dodaj do listy")),
        React.createElement(Sheet, { open: storeAddOpen, onClose: () => setStoreAddOpen(false), title: "Nowy sklep" },
            React.createElement("input", { style: inputStyle, placeholder: "Nazwa sklepu", value: newStore, autoFocus: true, onChange: (e) => setNewStore(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                    addStore(); } }),
            React.createElement("button", { style: btnPrimary, onClick: addStore }, "Dodaj sklep"))));
}
const fab = {
    position: "fixed", bottom: 84, right: "max(16px, calc(50% - 230px + 16px))", zIndex: 45,
    width: 56, height: 56, borderRadius: 18, border: "none", cursor: "pointer",
    background: "linear-gradient(135deg, var(--green2), var(--green))", display: "grid", placeItems: "center",
    boxShadow: "0 12px 28px -8px var(--green-glow), 0 0 0 1px rgba(255,255,255,.06)",
};
/* ───── BOOK TRACKER ───── */
function BookTracker({ books, setBooks }) {
    const [addOpen, setAddOpen] = useState(false);
    const [bTitle, setBTitle] = useState("");
    const [bAuthor, setBAuthor] = useState("");
    const [bTotal, setBTotal] = useState("300");
    const updatePages = (id, val) => {
        const n = Math.max(0, parseInt(val) || 0);
        setBooks(bs => bs.map(b => b.id === id ? { ...b, read: Math.min(n, b.total) } : b));
    };
    const addBook = () => {
        if (!bTitle.trim())
            return;
        setBooks(bs => [...bs, { id: uid(), title: bTitle.trim(), author: bAuthor.trim(), total: parseInt(bTotal) || 300, read: 0 }]);
        setBTitle("");
        setBAuthor("");
        setBTotal("300");
        setAddOpen(false);
    };
    const delBook = (id) => setBooks(bs => bs.filter(b => b.id !== id));
    const done = (books || []).filter(b => b.read >= b.total).length;
    const totalPages = (books || []).reduce((a, b) => a + b.total, 0);
    const readPages = (books || []).reduce((a, b) => a + b.read, 0);
    return (React.createElement("div", null,
        React.createElement(DevHeader, { icon: Quote, tint: "#f59e0b", kicker: "Wiedza = d\u017Awignia", title: "Biblioteka" }),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 } },
            React.createElement(Card, { pad: 12 },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: "var(--green2)" } }, done),
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 } }, "przeczytanych")),
            React.createElement(Card, { pad: 12 },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, color: "var(--gold)" } }, readPages),
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 } }, "stron")),
            React.createElement(Card, { pad: 12 },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 24 } }, (books || []).length),
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 } }, "na li\u015Bcie"))),
        React.createElement("div", { style: { ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("span", null, "Lista lektur"),
            React.createElement("button", { onClick: () => setAddOpen(true), style: { ...iconBtn, width: 32, height: 28, borderRadius: 8 } }, "+")),
        (books || []).map(b => {
            const pct = b.total ? Math.round((b.read / b.total) * 100) : 0;
            const finished = b.read >= b.total && b.total > 0;
            return (React.createElement(Card, { key: b.id, style: { marginBottom: 10 } },
                React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 10 } },
                    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                        React.createElement("div", { style: { fontSize: 14.5, fontWeight: 700, color: finished ? "var(--green2)" : "var(--text)" } },
                            finished ? "✓ " : "",
                            b.title),
                        b.author && React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", marginTop: 1 } }, b.author)),
                    React.createElement("button", { onClick: () => delBook(b.id), style: { background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4, flexShrink: 0 } },
                        React.createElement(Trash2, { size: 14 }))),
                React.createElement("div", { style: { marginTop: 10 } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 5 } },
                        React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } },
                            b.read,
                            " / ",
                            b.total,
                            " stron"),
                        React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: finished ? "var(--green2)" : "var(--gold)" } },
                            pct,
                            "%")),
                    React.createElement("div", { style: { height: 8, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" } },
                        React.createElement("div", { style: { height: "100%", width: `${pct}%`, background: finished ? "var(--green)" : "linear-gradient(90deg,var(--gold),#e0892a)", borderRadius: 9, transition: "width .3s" } })),
                    React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 9, alignItems: "center" } },
                        React.createElement("span", { style: { fontSize: 11.5, color: "var(--muted)" } }, "Strona:"),
                        React.createElement("button", { onClick: () => updatePages(b.id, b.read - 10), style: { ...iconBtn, width: 30, height: 26, borderRadius: 7, fontSize: 14 } }, "\u2013"),
                        React.createElement("input", { type: "number", inputMode: "numeric", value: b.read, onChange: e => updatePages(b.id, e.target.value), style: { ...inputStyle, width: 72, padding: "5px 8px", fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, textAlign: "center" } }),
                        React.createElement("button", { onClick: () => updatePages(b.id, b.read + 10), style: { ...iconBtn, width: 30, height: 26, borderRadius: 7, fontSize: 14, background: "var(--green)", border: "none", color: "#04130a" } }, "+"),
                        !finished && React.createElement("button", { onClick: () => setBooks(bs => bs.map(bk => bk.id === b.id ? { ...bk, read: bk.total } : bk)), style: { marginLeft: "auto", padding: "5px 10px", borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: "1px solid var(--green)", background: "rgba(34,197,94,.1)", color: "var(--green2)" } }, "Koniec")))));
        }),
        (books || []).length === 0 && React.createElement(Card, null,
            React.createElement("div", { style: { textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "10px 0" } }, "Brak ksi\u0105\u017Cek. Dodaj pierwsz\u0105 \u2191")),
        React.createElement(Sheet, { open: addOpen, onClose: () => setAddOpen(false), title: "Dodaj ksi\u0105\u017Ck\u0119" },
            React.createElement("label", { style: label }, "Tytu\u0142 *"),
            React.createElement("input", { value: bTitle, onChange: e => setBTitle(e.target.value), placeholder: "np. Atomic Habits", style: inputStyle }),
            React.createElement("label", { style: label }, "Autor"),
            React.createElement("input", { value: bAuthor, onChange: e => setBAuthor(e.target.value), placeholder: "np. James Clear", style: inputStyle }),
            React.createElement("label", { style: label }, "Liczba stron"),
            React.createElement("input", { type: "number", value: bTotal, onChange: e => setBTotal(e.target.value), placeholder: "300", style: inputStyle }),
            React.createElement("button", { style: btnPrimary, onClick: addBook }, "Dodaj do biblioteki"))));
}
/* ═══════════════════════════════════════════════════════════════════
   ALARM CENTER — powiadomienia i budziki dostosowane do grafiku
   ═══════════════════════════════════════════════════════════════════ */
const HOME_DEF_ALARMS = { Ranka: { enabled: true, wake: "05:00", supl: "05:15", biz: "15:30", trening: "15:30" }, Popo\u0142udnie: { enabled: true, wake: "07:00", supl: "07:15", biz: "08:00", trening: "12:00" }, Nocka: { enabled: true, wake: "08:00", supl: "08:15", biz: "10:00", trening: null }, Wolne: { enabled: true, wake: "06:00", supl: "06:15", biz: "06:30", trening: "09:30" } };
const AL_LABELS = { wake: "Pobudka", supl: "Suple", biz: "Biznes \xB7 telefony do skup\xF3w", trening: "Trening" };
const shiftOfDate = (events, k) => {
  const e = (events || []).find((x) => x.date === k && x.title && /Ranka|Popołudnie|Nocka/.test(x.title));
  return e ? e.title.includes("Ranka") ? "Ranka" : e.title.includes("Popo\u0142udnie") ? "Popo\u0142udnie" : "Nocka" : "Wolne";
};
function iosAlarmList(alarmCfg, events, offset) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + offset);
  const k = keyOf(d);
  const sh = shiftOfDate(events, k);
  const c = (alarmCfg || {})[sh] || {};
  const nowHM = `${pad((/* @__PURE__ */ new Date()).getHours())}:${pad((/* @__PURE__ */ new Date()).getMinutes())}`;
  const items = Object.keys(AL_LABELS).filter((f) => c[f] && /^\d{1,2}:\d{2}$/.test(c[f]) && (offset > 0 || c[f] > nowHM)).map((f) => ({ t: c[f].padStart(5, "0"), l: "MP \xB7 " + AL_LABELS[f] }));
  const seen = /* @__PURE__ */ new Set();
  const uniq = items.sort((a, b) => a.t < b.t ? -1 : 1).filter((x) => {
    const kk = x.t;
    if (seen.has(kk)) {
      const prev = items.find((y) => y.t === kk);
      if (prev && prev !== x) prev.l += " + " + x.l.replace("MP \xB7 ", "");
      return false;
    }
    seen.add(kk);
    return true;
  });
  const out = c.enabled === false ? [] : uniq;
  try {
    const sp = sleepPlan(events, k, alarmCfg);
    if (sp.routine != null && (offset > 0 || m2hm(sp.routine) > nowHM)) out.push({ t: m2hm(sp.routine), l: "MP \xB7 Rutyna wieczorna \u2192 sen " + m2hm(sp.bed) });
    if (sp.nap && (offset > 0 || m2hm(sp.nap[0]) > nowHM)) out.push({ t: m2hm(sp.nap[0]), l: "MP \xB7 Drzemka przed nock\u0105" });
    out.sort((a, b) => (a.t < b.t ? -1 : 1));
  } catch (e) {}
  return { k, sh, items: out };
}
function IOSAlarmCard({ alarmCfg, events, setTab, compact }) {
  const [off, setOff] = useState((/* @__PURE__ */ new Date()).getHours() >= 15 ? 1 : 0);
  const L = iosAlarmList(alarmCfg, events, off);
  const run = () => {
    if (!L.items.length) return;
    const text = L.items.map((x) => `${x.t}|${x.l}`).join(";");
    buzz(10);
    window.location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent("MP Alarmy") + "&input=text&text=" + encodeURIComponent(text);
  };
  return /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "var(--gold2)" } }, "\u23F0 ALARMY W ZEGARZE \xB7 iPHONE"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4 } }, [["Dzi\u015B", 0], ["Jutro", 1]].map(([l, v]) => /* @__PURE__ */ React.createElement("button", { key: v, onClick: () => setOff(v), style: { padding: "4px 9px", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: off === v ? "var(--gold)" : "var(--surface2)", color: off === v ? "#1a1200" : "var(--muted)" } }, l)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, marginTop: 6 } }, off ? "Jutro" : "Dzi\u015B", ": ", L.sh), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 } }, L.items.length ? L.items.map((x) => /* @__PURE__ */ React.createElement("span", { key: x.t, style: { fontSize: 12, padding: "5px 8px", borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--line)" } }, /* @__PURE__ */ React.createElement("b", null, x.t), " ", x.l.replace("MP \xB7 ", ""))) : /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, "Brak alarm\xF3w do ustawienia.")), /* @__PURE__ */ React.createElement("button", { onClick: run, disabled: !L.items.length, style: { ...btnPrimary, marginTop: 10, opacity: L.items.length ? 1 : 0.5 } }, "Ustaw ", L.items.length, " alarm(y) w Zegarze"), !compact && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginTop: 8, lineHeight: 1.5 } }, "Wymaga Skr\xF3tu \u201EMP Alarmy\u201D w aplikacji Skr\xF3ty. Godziny zmieniasz ni\u017Cej, osobno dla ka\u017Cdej zmiany."), compact && setTab && /* @__PURE__ */ React.createElement("button", { onClick: () => setTab("alarms"), style: { width: "100%", marginTop: 6, background: "none", border: "none", color: "var(--faint)", fontSize: 12, cursor: "pointer" } }, "Zmie\u0144 godziny \u2192"));
}
function IOSAlarmEvening({ alarmCfg, events, setTab }) {
  const [h, setH] = useState((/* @__PURE__ */ new Date()).getHours());
  useEffect(() => {
    const iv = setInterval(() => setH((/* @__PURE__ */ new Date()).getHours()), 5 * 6e4);
    return () => clearInterval(iv);
  }, []);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent || "") || lsJSON("mp_ios_force", false);
  if (!ios || h < 18) return null;
  return /* @__PURE__ */ React.createElement(IOSAlarmCard, { alarmCfg, events, setTab, compact: true });
}

function AlarmCenter({ alarmCfg, defaultAlarms, saveAlarms, notifPerm, askNotif, events, setToast, fireAlarm }) {
    const [editShift, setEditShift] = useState(null);
    const [draft, setDraft] = useState({});
    const todayKey2 = () => { const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const tk = todayKey2();
    const todayEv = (events || []).find(e => e.date === tk && (e.title.includes("Ranka") || e.title.includes("Popołudnie") || e.title.includes("Nocka")));
    const todayShift = todayEv ? (todayEv.title.includes("Ranka") ? "Ranka" : todayEv.title.includes("Popołudnie") ? "Popołudnie" : "Nocka") : "Wolne";
    const SHIFTS = ["Ranka", "Popołudnie", "Nocka", "Wolne"];
    const SHIFT_ICON = { Ranka: "🌅", Popołudnie: "🌇", Nocka: "🌙", Wolne: "🔒" };
    const ALARM_LABELS = { wake: "⏰ Pobudka", supl: "💊 Suplementy", biz: "💻 Deep Work", trening: "🏋️ Trening" };
    const ALARM_HINTS = { wake: "Wstań i zacznij rytuał", supl: "D3+K2 + magnez + kreatyna", biz: "Wyłącz rozpraszacze, blok skupienia", trening: "Siłownia / kalistenika" };
    const cfg = alarmCfg || defaultAlarms;
    const openEdit = (shift) => { setEditShift(shift); setDraft({ ...cfg[shift] }); };
    const saveEdit = () => { const nc = { ...cfg, [editShift]: draft }; saveAlarms(nc); setEditShift(null); };
    const toggle = (shift) => { saveAlarms({ ...cfg, [shift]: { ...cfg[shift], enabled: !cfg[shift]?.enabled } }); };
    const testNotif = () => {
        if (notifPerm !== "granted") {
            askNotif();
            return;
        }
        if (fireAlarm)
            fireAlarm("🔔 Test alarmu", "Powiadomienia działają — zobaczysz je na ekranie blokady!");
        else if (setToast)
            setToast({ icon: "sun", title: "Test alarmu", msg: "Powiadomienia działają!", color: "var(--green2)" });
    };
    return (React.createElement("div", null,
        React.createElement(DevHeader, { icon: Bell, tint: "var(--gold)", kicker: "Alarmy i powiadomienia", title: "Centrum alarm\u00F3w" }),
        React.createElement(IOSAlarmCard, { alarmCfg: cfg, events }),
        React.createElement(PhoneAlarmCard, { cfg: cfg, todayShift: todayShift, setToast: setToast }),
        React.createElement(Card, { style: { marginTop: 14, background: notifPerm === "granted" ? "rgba(34,197,94,.08)" : "rgba(245,181,61,.1)", border: notifPerm === "granted" ? "1px solid rgba(34,197,94,.3)" : "1px solid rgba(245,181,61,.35)" } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
                React.createElement("span", { style: { fontSize: 26 } }, notifPerm === "granted" ? "✅" : "🔔"),
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontWeight: 700, fontSize: 14 } }, notifPerm === "granted" ? "Powiadomienia aktywne" : "Powiadomienia wyłączone"),
                    React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.45 } }, notifPerm === "granted" ? "Alarmy trafiają na ekran blokady gdy aplikacja jest otwarta." : "Zezwól na powiadomienia, żeby alarmy działały na ekranie blokady.")),
                notifPerm !== "granted" && React.createElement("button", { onClick: askNotif, style: { ...btnPrimary, width: "auto", padding: "10px 16px", fontSize: 13 } }, "W\u0142\u0105cz"),
                notifPerm === "granted" && React.createElement("button", { onClick: testNotif, style: { padding: "9px 14px", borderRadius: 11, border: "1px solid var(--green)", background: "rgba(34,197,94,.1)", color: "var(--green2)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" } }, "Test \uD83D\uDD14")),
            notifPerm === "granted" && (React.createElement("div", { style: { marginTop: 10, padding: "9px 12px", background: "rgba(34,197,94,.07)", borderRadius: 9, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 } },
                React.createElement("b", null, "Jak dzia\u0142a:"),
                " Aplikacja musi by\u0107 otwarta w przegl\u0105darce / na ekranie. PWA zainstalowana na home screen pozwala alarmom dzia\u0142a\u0107 w tle. Na iOS Safari \u2192 \"Do ekranu g\u0142\u00F3wnego\" \u2192 otw\u00F3rz jako apk\u0119 (nie przez Safari)."))),
        React.createElement("div", { style: sectionTitle },
            "Dzi\u015B \u2014 ",
            SHIFT_ICON[todayShift],
            " ",
            todayShift),
        React.createElement(Card, { style: { marginBottom: 14 } },
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginBottom: 10 } }, "Aktywne alarmy na dzi\u015B:"),
            (["wake", "supl", "biz", "trening"]).map(k => {
                const t = cfg[todayShift]?.[k];
                if (!t)
                    return null;
                return (React.createElement("div", { key: k, style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: k !== "wake" ? "1px solid var(--line)" : "none" } },
                    React.createElement("span", { style: { fontSize: 18, width: 26, textAlign: "center" } }, ALARM_LABELS[k].slice(0, 2)),
                    React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontWeight: 700, fontSize: 14 } }, ALARM_LABELS[k].slice(3)),
                        React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, ALARM_HINTS[k])),
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontWeight: 800, fontSize: 16, color: "var(--green2)" } }, t)));
            })),
        React.createElement("div", { style: sectionTitle }, "Alarmy per zmiana"),
        SHIFTS.map(shift => {
            const s = cfg[shift] || {};
            const isToday = shift === todayShift;
            return (React.createElement(Card, { key: shift, style: { marginBottom: 10, border: isToday ? "1px solid var(--green)" : "1px solid var(--line)" } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } },
                    React.createElement("span", { style: { fontSize: 20 } }, SHIFT_ICON[shift]),
                    React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontWeight: 700, fontSize: 15 } },
                            shift,
                            isToday ? React.createElement("span", { style: { fontSize: 11, color: "var(--green2)", marginLeft: 8 } }, "\u25CF dzi\u015B") : "")),
                    React.createElement("button", { onClick: () => toggle(shift), style: { padding: "6px 12px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", border: s.enabled ? "1.5px solid var(--green)" : "1px solid var(--line2)", background: s.enabled ? "rgba(34,197,94,.12)" : "var(--surface2)", color: s.enabled ? "var(--green2)" : "var(--muted)" } }, s.enabled ? "WŁ ✓" : "WYŁ"),
                    React.createElement("button", { onClick: () => openEdit(shift), style: { ...iconBtn, width: 34, height: 32, border: "none" } },
                        React.createElement(Pencil, { size: 14 }))),
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 } }, (["wake", "supl", "biz", "trening"]).map(k => (React.createElement("div", { key: k, style: { background: "var(--surface2)", borderRadius: 9, padding: "7px 10px", display: "flex", justifyContent: "space-between" } },
                    React.createElement("span", { style: { fontSize: 11.5, color: "var(--muted)" } }, ALARM_LABELS[k]),
                    React.createElement("span", { style: { fontFamily: "var(--mono)", fontSize: 12.5, fontWeight: 700, color: s[k] ? "var(--text)" : "var(--faint)" } }, s[k] || "—")))))));
        }),
        React.createElement(Card, { style: { marginTop: 4, background: "rgba(245,181,61,.07)", border: "1px solid rgba(245,181,61,.25)" } },
            React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.55, color: "var(--muted)" } },
                React.createElement("b", { style: { color: "var(--gold)" } }, "\uD83D\uDCF1 Wskaz\u00F3wka iPhone:"),
                " Zainstaluj apk\u0119 na home screen (Safari \u2192 Udost\u0119pnij \u2192 Do ekranu g\u0142\u00F3wnego). Otwarta apka jako PWA dzia\u0142a w tle i wysy\u0142a alarmy. Ekran blokady wymaga \u017Ce apka by\u0142a aktywna w ostatnich minutach.")),
        React.createElement(Sheet, { open: !!editShift, onClose: () => setEditShift(null), title: `${SHIFT_ICON[editShift] || ""} Alarmy — ${editShift}` },
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 } }, "Ustaw godziny alarm\u00F3w dla tej zmiany. Pozostaw puste \u017Ceby wy\u0142\u0105czy\u0107 konkretny alarm."),
            editShift && (["wake", "supl", "biz", "trening"]).map(k => (React.createElement("div", { key: k },
                React.createElement("label", { style: label },
                    ALARM_LABELS[k],
                    " \u00B7 ",
                    ALARM_HINTS[k]),
                React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
                    React.createElement("input", { type: "time", value: draft[k] || "", onChange: e => setDraft(p => ({ ...p, [k]: e.target.value })), style: { ...inputStyle, flex: 1, fontFamily: "var(--mono)", fontWeight: 700, fontSize: 18 } }),
                    React.createElement("button", { onClick: () => setDraft(p => ({ ...p, [k]: "" })), style: { ...iconBtn, width: 34, height: 34, color: "var(--faint)" } },
                        React.createElement(X, { size: 14 })))))),
            React.createElement("button", { style: { ...btnPrimary, marginTop: 16 }, onClick: saveEdit }, "Zapisz alarmy"),
            React.createElement("button", { style: { marginTop: 8, width: "100%", padding: "12px", borderRadius: 13, border: "1px solid var(--line2)", background: "transparent", color: "var(--muted)", fontWeight: 600, cursor: "pointer" }, onClick: () => { setDraft({ ...defaultAlarms[editShift] }); } }, "Reset do domy\u015Blnych"))));
}
/* ═══════════════════════════════════════════════════════════════════
   DEV PATH — ścieżka rozwoju 12 tygodni
   ═══════════════════════════════════════════════════════════════════ */
function DevPath({ setTab }) {
    const [done, setDone] = useState(() => { try {
        const s = localStorage.getItem("mp_devpath_v1");
        return s ? JSON.parse(s) : {};
    }
    catch {
        return {};
    } });
    const [openPh, setOpenPh] = useState({});
    const toggle = (id) => { const n = { ...done, [id]: !done[id] }; setDone(n); try {
        localStorage.setItem("mp_devpath_v1", JSON.stringify(n));
    }
    catch { } };
    const togglePh = (id) => setOpenPh(p => ({ ...p, [id]: !p[id] }));
    const PHASES = [
        { id: "ph1", week: "Tygodnie 1–2", emoji: "🏗️", title: "Fundamenty systemu", color: "var(--green2)",
            tasks: [
                { id: "p1t1", t: "Zainstaluj apkę na home screen (Safari → Do ekranu głównego)" },
                { id: "p1t2", t: "Włącz powiadomienia w zakładce Alarmy" },
                { id: "p1t3", t: "Ustaw alarmy dla każdego typu zmiany" },
                { id: "p1t4", t: "Zrób badania krwi: testosteron, SHBG, wit. D — zakładka Zdrowie" },
                { id: "p1t5", t: "Kup suplementy: D3+K2, magnez (glikcynian), kreatyna (5g/dzień)" },
                { id: "p1t6", t: "14 dni z rzędu: odhaczaj nawyki każdego dnia" },
                { id: "p1t7", t: "Zaplanuj 4 treningi / tydzień w Kalendarzu" },
                { id: "p1t8", t: "Przeczytaj: Atomic Habits — pierwsze 3 rozdziały" },
            ]
        },
        { id: "ph2", week: "Tygodnie 3–4", emoji: "🧠", title: "Mindset & Charyzma", color: "var(--gold)",
            tasks: [
                { id: "p2t1", t: "Codzienne 5 min rano: afirmacja + wizualizacja trudnej rozmowy" },
                { id: "p2t2", t: "Przeczytaj: Jak zdobyć przyjaciół — Carnegie (100% do końca)" },
                { id: "p2t3", t: "7 tygodniowych wyzwań charyzmy zaliczone (zakładka Charyzma)" },
                { id: "p2t4", t: "Wieczorny log social wins: 14 dni z rzędu" },
                { id: "p2t5", t: "Jeden nowy wartościowy kontakt biznesowy w tygodniu" },
                { id: "p2t6", t: "Przeczytaj: Never Split the Difference — Voss" },
                { id: "p2t7", t: "Zimny prysznic codziennie przez 14 dni (nawyk → wola)" },
            ]
        },
        { id: "ph3", week: "Tygodnie 5–6", emoji: "💻", title: "SaaS Foundation — pierwsze kroki", color: "#10b981",
            tasks: [
                { id: "p3t1", t: "Zainstaluj Cursor AI — zbuduj pierwsze demo apki (cokolwiek)" },
                { id: "p3t2", t: "Wybierz niszę (np. logistyka / usługi lokalne) — jedna branża" },
                { id: "p3t3", t: "Portfolio: 3 projekty z opisem problemu → rozwiązania → wartości" },
                { id: "p3t4", t: "Konto Apollo.io: pierwsza lista 50 firm z decydentami" },
                { id: "p3t5", t: "Claude: napisz szablon cold e-maila (problem + ROI + CTA)" },
                { id: "p3t6", t: "Wyślij pierwsze 5 cold e-maili ← ZACZNIJ TU" },
                { id: "p3t7", t: "Przeczytaj: $100M Offers — Hormozi (pierwsze 3 rozdziały)" },
            ]
        },
        { id: "ph4", week: "Tygodnie 7–8", emoji: "🚀", title: "Outreach & Sprzedaż", color: "var(--rose)",
            tasks: [
                { id: "p4t1", t: "5 cold e-maili dziennie przez 2 tygodnie = 70 e-maili" },
                { id: "p4t2", t: "Make.com: zautomatyzuj follow-up po 3 dniach bez odpowiedzi" },
                { id: "p4t3", t: "HeyGen: wideo cold outreach 60 sek. do 10 firm (wyróżnij się!)" },
                { id: "p4t4", t: "LinkedIn: 3 posty w stylu case study / insight / pytanie" },
                { id: "p4t5", t: "Pierwsze 3 demo calls umówione i przeprowadzone" },
                { id: "p4t6", t: "Oferta cennikowa 3-poziomowa napisana i gotowa do wysłania" },
                { id: "p4t7", t: "Przeczytaj: Pitch Anything — Klaff" },
            ]
        },
        { id: "ph5", week: "Tygodnie 9–12", emoji: "🏆", title: "Pierwszy deal", color: "#f59e0b",
            tasks: [
                { id: "p5t1", t: "100 cold e-maili wysłanych — zmierz open rate i reply rate" },
                { id: "p5t2", t: "5+ demo calls — dokumentuj co pytają klienci" },
                { id: "p5t3", t: "Retrospektywa: co działa? Co zmienić? Jedna zmiana w tygodniu" },
                { id: "p5t4", t: "Pierwsza oferta wysłana do potencjalnego klienta" },
                { id: "p5t5", t: "Clay.com: zaawansowana personalizacja outreach na 200 firm" },
                { id: "p5t6", t: "Przeczytaj: The Challenger Sale — Dixon & Adamson" },
                { id: "p5t7", t: "🎉 PIERWSZY DEAL ZAMKNIĘTY — zrób to!" },
            ]
        },
    ];
    const totalTasks = PHASES.reduce((a, p) => a + p.tasks.length, 0);
    const doneTasks = Object.values(done).filter(Boolean).length;
    const pct = Math.round((doneTasks / totalTasks) * 100);
    const curPhase = PHASES.find(p => p.tasks.some(t => !done[t.id])) || PHASES[PHASES.length - 1];
    return (React.createElement("div", null,
        React.createElement(DevHeader, { icon: TrendingUp, tint: "var(--green2)", kicker: "Twoja droga do pierwszego dealu", title: "\u015Acie\u017Cka Rozwoju" }),
        React.createElement(Card, { style: { marginTop: 14 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14 } },
                React.createElement(Ring, { pct: pct, size: 72, stroke: 7, color: "var(--green2)", glow: true }),
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 } },
                        curPhase.emoji,
                        " ",
                        curPhase.title),
                    React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginTop: 3 } },
                        doneTasks,
                        " z ",
                        totalTasks,
                        " zada\u0144 \u00B7 ",
                        curPhase.week),
                    React.createElement("div", { style: { marginTop: 8, height: 6, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" } },
                        React.createElement("div", { style: { height: "100%", width: pct + "%", background: "linear-gradient(90deg,var(--green2),#10b981)", borderRadius: 9, transition: "width .4s" } }))))),
        React.createElement(Card, { style: { marginTop: 10, background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.2)", marginBottom: 14 } },
            React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.6 } },
                React.createElement("b", { style: { color: "var(--green2)" } }, "Zasada 80/20 \u015Bcie\u017Cki:"),
                " Zr\u00F3b W PE\u0141NI jeden etap zanim przejdziesz do nast\u0119pnego. Lepsza g\u0142\u0119boka znajomo\u015B\u0107 jednej fazy ni\u017C powierzchowna czterech. Ka\u017Cde odhaczone zadanie = realna zmiana, nie checkmark dla siebie.")),
        PHASES.map((ph, phIdx) => {
            const phDone = ph.tasks.filter(t => done[t.id]).length;
            const phPct = Math.round((phDone / ph.tasks.length) * 100);
            const isActive = ph.id === curPhase.id;
            const isPast = PHASES.indexOf(ph) < PHASES.indexOf(curPhase);
            const isOpen = openPh[ph.id] !== undefined ? openPh[ph.id] : isActive;
            return (React.createElement(Card, { key: ph.id, style: { marginBottom: 8, padding: "0" } },
                React.createElement("button", { onClick: () => togglePh(ph.id), style: { width: "100%", background: "none", border: "none", cursor: "pointer", color: "var(--text)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, textAlign: "left" } },
                    React.createElement("span", { style: { fontSize: 20 } }, ph.emoji),
                    React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
                            React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, ph.title),
                            isActive && React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: ph.color, background: ph.color + "22", padding: "2px 7px", borderRadius: 6 } }, "TERAZ"),
                            isPast && phPct === 100 && React.createElement("span", { style: { fontSize: 10, fontWeight: 800, color: "var(--green2)" } }, "\u2713 DONE")),
                        React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 } },
                            ph.week,
                            " \u00B7 ",
                            phDone,
                            "/",
                            ph.tasks.length)),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 14, color: phPct === 100 ? "var(--green2)" : ph.color, marginRight: 6 } },
                        phPct,
                        "%"),
                    React.createElement("span", { style: { color: "var(--faint)", fontSize: 14 } }, isOpen ? "▲" : "▼")),
                isOpen && (React.createElement("div", { style: { padding: "0 16px 14px", borderTop: "1px solid var(--line)" } }, ph.tasks.map((task, ti) => (React.createElement("button", { key: task.id, onClick: () => toggle(task.id), style: { width: "100%", display: "flex", alignItems: "flex-start", gap: 12, background: "none", border: "none", borderTop: ti ? "1px solid var(--line)" : "none", cursor: "pointer", color: "var(--text)", padding: "11px 0", textAlign: "left" } },
                    React.createElement("span", { style: { width: 24, height: 24, borderRadius: 8, flexShrink: 0, marginTop: 1, border: done[task.id] ? "none" : `2px solid ${ph.color}`, background: done[task.id] ? ph.color : "transparent", display: "grid", placeItems: "center" } }, done[task.id] && React.createElement(Check, { size: 14, color: "#04130a", strokeWidth: 3 })),
                    React.createElement("span", { style: { flex: 1, fontSize: 13.5, lineHeight: 1.5, textDecoration: done[task.id] ? "line-through" : "none", opacity: done[task.id] ? .55 : 1 } }, task.t))))))));
        })));
}
/* ───── AI TOOLS ───── */
function AITools() {
    const CATS = [
        { cat: "🧠 Asystenci AI — tekst, kod, myślenie", tools: [
                { n: "Claude (claude.ai)", tag: "Twój główny AI", d: "Najlepszy do długich projektów, kodu, analizy i tekstów sprzedażowych. Dawaj mu całe dokumenty i proś o feedback. Tu rozmawiasz i budujesz.", use: "Oferty, cold e-maile, kod apek, analiza konkurencji, skrypty sprzedażowe, strategia." },
                { n: "ChatGPT GPT-4o (chat.openai.com)", tag: "Wszechstronny", d: "Dobry do burzenia mózgów i tworzenia treści na LinkedIn. Custom GPT-y automatyzują powtarzalne zadania.", use: "Posty LinkedIn, research branżowy, custom GPT do generowania ofert." },
                { n: "Perplexity AI (perplexity.ai)", tag: "AI Search", d: "Wyszukiwarka z AI — aktualne odpowiedzi ze źródłami. Idealna do researchu firm i branż przed cold outreach.", use: "Research klientów, trendy branżowe, info o firmach." },
                { n: "Gemini Advanced (gemini.google.com)", tag: "Google AI", d: "Integruje się z Docs, Gmail i Drive. Dobry do analizy dokumentów.", use: "Analiza plików, odpowiedzi na e-maile, integracja z G Suite." },
            ] },
        { cat: "💻 Kodowanie — buduj apki 5× szybciej", tools: [
                { n: "Cursor AI (cursor.com)", tag: "⭐ ZMIENIA GRĘ", d: "IDE z AI wbudowanym bezpośrednio w edytor. Opisujesz co chcesz — AI pisze i zmienia kod w całym projekcie. Budujesz MVP dla klienta w godziny, nie dni.", use: "Budowanie apek dla klientów, refactoring, nowe funkcje." },
                { n: "Bolt.new (bolt.new)", tag: "Apka w 5 min", d: "Opisujesz apkę w zdaniu, Bolt generuje działający kod + deploy natychmiast. Idealne do prototypów przed spotkaniem z klientem.", use: "Demo dla klienta, proof-of-concept na sprzedaż." },
                { n: "v0 by Vercel (v0.dev)", tag: "UI w sekundy", d: "Generuje piękny interfejs React + Tailwind z opisu tekstowego.", use: "Mockupy UI dla projektów klientów, szybkie prototypowanie." },
                { n: "GitHub Copilot (github.com)", tag: "Autocomplete", d: "Podpowiada kod w czasie rzeczywistym. Dobre uzupełnienie Cursora przy codziennym kodowaniu.", use: "Boilerplate, snippety, dokumentacja kodu." },
            ] },
        { cat: "🤖 Automatyzacja — czas to Twój kapitał", tools: [
                { n: "Make.com (make.com)", tag: "⭐ Polecane", d: "Wizualna automatyzacja bez kodu. Łączy 1000+ apek. Automatyzuj outreach, CRM, notyfikacje, raporty.", use: "Auto follow-up po braku odpowiedzi, sync leadów do Notion, alerty sprzedażowe." },
                { n: "n8n (n8n.io)", tag: "Open source", d: "Jak Make, ale self-hosted i darmowy. Bardziej techniczny, ale pełna kontrola.", use: "Pipeline AI + bazy danych, własny serwer, zero limitów." },
                { n: "Zapier (zapier.com)", tag: "Najprostszy", d: "Tysiące integracji, zero kodu. Dobry start dla prostszych automatyzacji.", use: "Nowy lead → e-mail → Notion. Proste przepływy." },
            ] },
        { cat: "🎯 Sprzedaż i prospecting", tools: [
                { n: "Clay (clay.com)", tag: "⭐ Prospecting AI", d: "Buduje spersonalizowane listy cold outreach z AI. Enrichuje dane firmowe i pisze spersonalizowane e-maile na dużą skalę.", use: "500 firm + automatyczny spersonalizowany cold e-mail do każdej." },
                { n: "Apollo.io (apollo.io)", tag: "B2B baza", d: "Baza 275M+ kontaktów B2B z e-mailami. Filtruj po branży, stanowisku, wielkości firmy, lokalizacji.", use: "Znajdź decydentów IT w firmach 10-200 osób w NL i PL." },
                { n: "Notion AI (notion.so)", tag: "Workspace AI", d: "AI wbudowany w Notion — summaryzuje, pisze, organizuje. Idealne jako CRM + baza wiedzy projektów.", use: "Pipeline klientów, dokumentacja projektu, baza case studies." },
            ] },
        { cat: "🎨 Content, wideo, głos", tools: [
                { n: "Midjourney (midjourney.com)", tag: "Obrazy AI", d: "Najlepsza jakość grafik AI. Do materiałów marketingowych, LinkedIn, prezentacji.", use: "Grafiki do postów, tła prezentacji, mockupy produktu." },
                { n: "ElevenLabs (elevenlabs.io)", tag: "Głos AI", d: "Naturalny głos AI do nagrań. Twórz voiceover wideo-demo w minuty.", use: "Narracja demo apki dla klienta, promo materiały audio." },
                { n: "HeyGen (heygen.com)", tag: "Wideo AI awatar", d: "Klonujesz swój głos i twarz — personalizowane wideo do cold outreach.", use: "Wideo cold outreach: 'Cześć [Imię], nagrałem 60 sek. dla Twojej firmy...'." },
            ] },
    ];
    return (React.createElement("div", null,
        React.createElement(DevHeader, { icon: Sparkles, tint: "#60a5fa", kicker: "Narz\u0119dzia kt\u00F3re zmieniaj\u0105 gr\u0119", title: "AI Tools \uD83E\uDD16" }),
        React.createElement(Card, { style: { marginTop: 14, background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.25)", marginBottom: 4 } },
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.6 } },
                "Te narz\u0119dzia pozwalaj\u0105 Ci ",
                React.createElement("b", null, "budowa\u0107 apki, sprzedawa\u0107 i tworzy\u0107 content 5\u201310\u00D7 szybciej"),
                ". Zacznij od ",
                React.createElement("b", null, "Cursor AI + Make.com + Clay"),
                " \u2014 to najwi\u0119ksze d\u017Awignie dla developer-sprzedawcy.")),
        React.createElement(Card, { style: { marginBottom: 14, background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.18)" } },
            React.createElement("div", { style: { fontSize: 12.5, fontWeight: 700, color: "#60a5fa", marginBottom: 8 } }, "\uD83D\uDDD3\uFE0F AI Stack na 4 dni wolne"),
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.65 } },
                React.createElement("b", null, "Rano:"),
                " Cursor \u2192 kod apki dla klienta \u00B7 Claude \u2192 oferta / cold e-mail",
                React.createElement("br", null),
                React.createElement("b", null, "Po\u0142udnie:"),
                " Apollo.io \u2192 lista lead\u00F3w \u00B7 Clay \u2192 personalizacja \u00B7 HeyGen \u2192 wideo-demo 60 sek.",
                React.createElement("br", null),
                React.createElement("b", null, "Popo\u0142udnie:"),
                " Make.com \u2192 zautomatyzuj 1 proces tygodniowo",
                React.createElement("br", null),
                React.createElement("b", null, "Wiecz\u00F3r:"),
                " LinkedIn post (Claude + Midjourney) \u2014 30 min wystarczy")),
        CATS.map((cat) => (React.createElement("div", { key: cat.cat },
            React.createElement("div", { style: sectionTitle }, cat.cat),
            cat.tools.map((t) => (React.createElement(Fold, { key: t.n, icon: Zap, tint: "#60a5fa", title: React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
                    t.n.split(" (")[0],
                    React.createElement("span", { style: { fontSize: 10.5, fontWeight: 700, color: t.tag.includes("⭐") ? "var(--gold)" : "#60a5fa", background: t.tag.includes("⭐") ? "rgba(245,181,61,.15)" : "rgba(96,165,250,.15)", padding: "2px 7px", borderRadius: 6 } }, t.tag)) },
                React.createElement("div", { style: { fontSize: 13, lineHeight: 1.55, marginBottom: 8 } }, t.d),
                React.createElement("div", { style: { fontSize: 12.5, background: "rgba(96,165,250,.08)", borderRadius: 9, padding: "8px 11px", color: "#93c5fd", lineHeight: 1.45 } },
                    React.createElement("b", null, "Jak u\u017Cywa\u0107: "),
                    t.use),
                t.n.includes("(") && React.createElement("div", { style: { marginTop: 6, fontSize: 12, color: "#60a5fa", fontWeight: 700 } },
                    "\u2192 ",
                    t.n.split("(")[1].replace(")", ""))))))))));
}
/* ───── WEEKLY SHIFT PLAN ───── */
function WeeklyShiftPlan({ events }) {
    const ADVICE = {
        "Ranka": {
            color: "#f5c518", bg: "rgba(245,197,24,.1)", border: "rgba(245,197,24,.3)",
            blok: "05:00 pobudka → zimny prysznic → 05:30–06:00 przegląd celów/afirmacje → 06:00 wyjazd. Po pracy 15:30–18:00: DEEP WORK / biznes (blok 2–2,5h). 18:00–19:30: trening. Wieczór: nauka i regeneracja.",
            deepwork: "15:30–18:00 — PRIORYTET 1 po Ranka. Cold outreach (5 e-maili), praca nad projektem klienta lub portfolio. Wyłącz powiadomienia, ustaw timer 90 min.",
            biznes: "17:30–18:00 quick review wyników (pipeline CRM, odpowiedzi). Wieczór 20:00–21:30: nauka (książka, kurs, YT o sprzedaży/AI).",
            trening: "15:30–17:30 (zaraz po pracy) — ciało rozgrzane, kortyzol poranny opada. Siłownia lub kalistenika.",
            sen: "22:00–23:00 w łóżku. Ekrany off 21:00. Cel: 7h.",
            supl: "D3+K2, omega-3 rano. Kreatyna po treningu. Magnez wieczorem.",
        },
        "Popołudnie": {
            color: "#c2621a", bg: "rgba(194,98,26,.12)", border: "rgba(194,98,26,.3)",
            blok: "07:00–08:00 pobudka → zaraz po przebudzeniu DEEP WORK (złoty czas). 08:00–12:00: biznes, kod, outreach. 12:00–13:30: trening. 14:00 wyjazd. Wracasz ~23:30.",
            deepwork: "08:00–12:00 — NAJLEPSZA pora na pracę twórczą. 4h skupienia: rozwój produktu, cold outreach, portfolio, nauka AI. Blokuj ten czas jak zmianę w pracy.",
            biznes: "08:00–10:00: praca głęboka (kod/projekt). 10:00–11:00: sprzedaż (cold e-maile, follow-up, LinkedIn). 11:00–12:00: nauka (książka/kurs). To Twoje 4h złota.",
            trening: "12:00–13:30 — siłownia przed pracą. Nie przenoś na po nockach.",
            sen: "Wracasz ~23:30. Zaśnij ~01:00. Wstań ~08:00–09:00.",
            supl: "Wszystkie rano. Kofeina tylko do 12:00 (nie chcesz problemu ze snem po pracy).",
        },
        "Nocka": {
            color: "#991b1b", bg: "rgba(153,27,27,.15)", border: "rgba(153,27,27,.3)",
            blok: "Dzień przed nocką (do 20:00): max praca i trening. 20:00: wyciszenie. 22:00 wyjazd. Po nocce: sen priorytet absolutny.",
            deepwork: "Jeśli chcesz robić coś w dzień przed nocką (do 15:00): to OK. Po nocce — zero pracy twórczej. Mózg nie działa na niedoborze snu.",
            biznes: "Dzień nocki (przed 18:00): możesz zrobić lekki przegląd (e-maile, plan jutrzejszy). Nic kreatywnego. Zadbaj o sen, bo jutro Wolne — tam robisz swój najlepszy blok.",
            trening: "NIE trenuj przed nocką. Lekka mobilność 15 min OK. Trening = jutro (Wolne).",
            sen: "Po nocce: okulary ↓, zasłony. Blok 7–9h. Nie rozwalaj rytmu dobowego.",
            supl: "Magnez PRZED nocką. D3 rano. Kofeina tylko w 1. połowie nocki.",
        },
    };
    const pad2 = (n) => String(n).padStart(2, "0");
    const dkeyLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const today = new Date();
    const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
    const getShift = (d) => {
        const ds = dkeyLocal(d);
        const ev = (events || []).find(e => e.date === ds && (e.title.includes("Ranka") || e.title.includes("Popołudnie") || e.title.includes("Nocka")));
        if (!ev)
            return null;
        if (ev.title.includes("Ranka"))
            return "Ranka";
        if (ev.title.includes("Popołudnie"))
            return "Popołudnie";
        if (ev.title.includes("Nocka"))
            return "Nocka";
        return null;
    };
    const WDN = ["Ndz", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
    const [sel, setSel] = useState(() => {
        // domyślnie wybierz dziś jeśli ma zmianę, inaczej pierwszy dzień ze zmianą
        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            if (getShift(d))
                return i;
        }
        return 0;
    });
    const selDay = week[sel];
    const shiftType = getShift(selDay);
    const adv = shiftType ? ADVICE[shiftType] : null;
    const ds = dkeyLocal(selDay);
    const ev = (events || []).find(e => e.date === ds && (e.title.includes("Ranka") || e.title.includes("Popołudnie") || e.title.includes("Nocka")));
    return (React.createElement("div", null,
        React.createElement(DevHeader, { icon: CalendarDays, tint: "#60a5fa", kicker: "Tw\u00F3j tydzie\u0144 \u00B7 zmiana po zmianie", title: "Plan tygodnia" }),
        React.createElement("div", { style: { display: "flex", gap: 5, marginTop: 14, overflowX: "auto", paddingBottom: 4 } }, week.map((d, i) => {
            const sh = getShift(d);
            const color = sh ? (sh === "Ranka" ? "#f5c518" : sh === "Popołudnie" ? "#c2621a" : "#991b1b") : "var(--faint)";
            const isToday = i === 0;
            const on = sel === i;
            return (React.createElement("button", { key: i, onClick: () => setSel(i), style: { flexShrink: 0, minWidth: 52, padding: "10px 6px", borderRadius: 13, cursor: "pointer", textAlign: "center", border: on ? `1.5px solid ${color}` : "1px solid var(--line2)", background: on ? "var(--surface2)" : "transparent", color: "var(--text)" } },
                React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, color: isToday ? "var(--green2)" : "var(--muted)" } }, WDN[d.getDay()]),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: isToday ? "var(--green2)" : "var(--text)" } }, d.getDate()),
                React.createElement("div", { style: { fontSize: 14, marginTop: 2 } }, sh === "Ranka" ? "🌅" : sh === "Popołudnie" ? "🌇" : sh === "Nocka" ? "🌙" : "🔒")));
        })),
        adv ? (React.createElement("div", { style: { marginTop: 12, borderRadius: 16, padding: 16, background: adv.bg, border: `1px solid ${adv.border}` } },
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: adv.color, marginBottom: 14 } },
                shiftType === "Ranka" ? "🌅 Ranka" : shiftType === "Popołudnie" ? "🌇 Popołudnie" : "🌙 Nocka",
                ev && React.createElement("span", { style: { fontSize: 12, color: "var(--muted)", fontFamily: "var(--body)", fontWeight: 500, marginLeft: 8 } }, ev.note?.split("·")[0]?.trim())),
            [["⚡ Plan dnia", adv.blok], ["💻 Deep Work", adv.deepwork], ["🚀 Biznes", adv.biznes], ["🏋️ Trening", adv.trening], ["😴 Sen", adv.sen], ["💊 Suplementy", adv.supl]].map(([ic, txt]) => (React.createElement("div", { key: ic, style: { display: "flex", gap: 10, marginBottom: 11 } },
                React.createElement("div", { style: { fontSize: 17, flexShrink: 0, width: 24, textAlign: "center" } }, ic.slice(0, 2)),
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: 12, fontWeight: 800, color: adv.color, letterSpacing: ".04em", marginBottom: 2 } }, ic.slice(3)),
                    React.createElement("div", { style: { fontSize: 13, color: "var(--text)", lineHeight: 1.55 } }, txt))))))) : (React.createElement(Card, { style: { marginTop: 12, textAlign: "center", padding: "20px 16px" } },
            React.createElement("div", { style: { fontSize: 28, marginBottom: 8 } }, "\uD83D\uDD12"),
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 18 } }, "Wolne"),
            React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.55 } }, "4 dni do regeneracji. Priorytet: sen, ci\u0119\u017Cki trening, gotowanie, s\u0142o\u0144ce i czas dla siebie."))),
        React.createElement("div", { style: sectionTitle }, "Wskaz\u00F3wki og\u00F3lne"),
        React.createElement(Fold, { icon: Zap, tint: "#f5c518", title: "\uD83C\uDF05 Ranka \u2014 harmonogram dnia" },
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.65 } },
                React.createElement("b", null, "05:00"),
                " Pobudka \u00B7 zimny prysznic \u00B7 afirmacja",
                React.createElement("br", null),
                React.createElement("b", null, "05:30\u201306:00"),
                " Przegl\u0105d cel\u00F3w / plan dnia",
                React.createElement("br", null),
                React.createElement("b", null, "06:00"),
                " Wyjazd \u00B7 07:00\u201315:00 praca",
                React.createElement("br", null),
                React.createElement("b", null, "15:30\u201318:00"),
                " \uD83D\uDCBB DEEP WORK (praca w\u0142asna, cold outreach, projekt)",
                React.createElement("br", null),
                React.createElement("b", null, "18:00\u201319:30"),
                " \uD83C\uDFCB\uFE0F Trening",
                React.createElement("br", null),
                React.createElement("b", null, "20:00\u201321:30"),
                " Nauka (ksi\u0105\u017Cka, kurs, AI)",
                React.createElement("br", null),
                React.createElement("b", null, "22:00"),
                " Ekrany off \u2192 sen")),
        React.createElement(Fold, { icon: Zap, tint: "#c2621a", title: "\uD83C\uDF07 Popo\u0142udnie \u2014 harmonogram dnia" },
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.65 } },
                React.createElement("b", null, "07:00\u201308:00"),
                " Pobudka \u00B7 zimny prysznic \u00B7 plan dnia",
                React.createElement("br", null),
                React.createElement("b", null, "08:00\u201312:00"),
                " \uD83D\uDCBB BLOK BIZNESOWY (max 4h skupienia!)",
                React.createElement("br", null),
                "\u00A0\u00A0\u2022 08:00\u201310:00 praca tw\u00F3rcza (kod / projekt)",
                React.createElement("br", null),
                "\u00A0\u00A0\u2022 10:00\u201311:00 sprzeda\u017C (outreach, LinkedIn, follow-up)",
                React.createElement("br", null),
                "\u00A0\u00A0\u2022 11:00\u201312:00 nauka (ksi\u0105\u017Cka / kurs)",
                React.createElement("br", null),
                React.createElement("b", null, "12:00\u201313:30"),
                " \uD83C\uDFCB\uFE0F Trening",
                React.createElement("br", null),
                React.createElement("b", null, "14:00"),
                " Wyjazd \u00B7 15:00\u201323:00 praca \u00B7 powr\u00F3t ~23:30",
                React.createElement("br", null),
                React.createElement("b", null, "01:00"),
                " Sen")),
        React.createElement(Fold, { icon: Zap, tint: "#991b1b", title: "\uD83C\uDF19 Nocka \u2014 harmonogram dnia" },
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.65 } },
                React.createElement("b", null, "08:00"),
                " Pobudka normalna (NIE odsypiaj!)",
                React.createElement("br", null),
                React.createElement("b", null, "09:00\u201314:00"),
                " Lekka praca (przegl\u0105d e-maili, plan, nic tw\u00F3rczego)",
                React.createElement("br", null),
                React.createElement("b", null, "14:00\u201315:00"),
                " Du\u017Cy posi\u0142ek przed nock\u0105",
                React.createElement("br", null),
                React.createElement("b", null, "16:00\u201318:00"),
                " Drzemka (opcjonalna, max 90 min)",
                React.createElement("br", null),
                React.createElement("b", null, "22:00"),
                " Wyjazd \u00B7 23:00\u201307:00 nocka",
                React.createElement("br", null),
                React.createElement("b", null, "Po nocce"),
                " okulary \u2193, zas\u0142ony, 7\u20139h snu")),
        React.createElement(Fold, { icon: Zap, tint: "var(--green2)", title: "\uD83D\uDD12 4 dni wolne \u2014 LOCK IN, MAKS. GRIND" },
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.65 } },
                React.createElement("b", null, "Dzie\u0144 1 (pon) \u2014 regeneracja po nocce"),
                React.createElement("br", null),
                "\u00A0\u00A0\u015Apij do 09:00. Spacer w s\u0142o\u0144cu. Lekki trening. Wiecz\u00F3r: planowanie cel\u00F3w na wolne.",
                React.createElement("br", null),
                React.createElement("br", null),
                React.createElement("b", null, "Dzie\u0144 2 + 3 \u2014 BLOK SZCZYTOWY"),
                React.createElement("br", null),
                "\u00A0\u00A006:00 Pobudka \u2192 zimny prysznic \u2192 06:30\u201309:30 Deep Work (projekt / product dev)",
                React.createElement("br", null),
                "\u00A0\u00A009:30\u201311:30 Ci\u0119\u017Cki trening si\u0142owy",
                React.createElement("br", null),
                "\u00A0\u00A013:00\u201316:00 Sprzeda\u017C / outreach / nauka AI",
                React.createElement("br", null),
                "\u00A0\u00A016:00\u201318:00 Drugi blok tw\u00F3rczy lub networking",
                React.createElement("br", null),
                "\u00A0\u00A0Wiecz\u00F3r: relaks, partnerka, nie telefon",
                React.createElement("br", null),
                React.createElement("br", null),
                React.createElement("b", null, "Dzie\u0144 4 (czw) \u2014 przygotowanie do kolejnego cyklu"),
                React.createElement("br", null),
                "\u00A0\u00A0Lekki trening. Przegl\u0105d tygodnia. Plan na nowy cykl. Wczesny sen."))));
}
/* ───── SAAS BUSINESS DASHBOARD ───── */
function SaasDashboard({ saasData, setSaasData }) {
    const pipeline = saasData.pipeline || [];
    const revenue = saasData.revenue || [];
    const setPipeline = (fn) => setSaasData(d => ({ ...d, pipeline: typeof fn === "function" ? fn(d.pipeline || []) : fn }));
    const setRevenue = (fn) => setSaasData(d => ({ ...d, revenue: typeof fn === "function" ? fn(d.revenue || []) : fn }));
    const [open, setOpen] = useState(false);
    const [rOpen, setROpen] = useState(false);
    const [name, setName] = useState("");
    const [stage, setStage] = useState("Kontakt");
    const [val, setVal] = useState("");
    const [rAmt, setRAmt] = useState("");
    const [rNote, setRNote] = useState("");
    const STAGES = ["Kontakt", "Demo", "Oferta", "Negocjacje", "Zamknięty", "Stracony"];
    const STAGE_COLORS = { "Kontakt": "var(--muted)", "Demo": "var(--blue)", "Oferta": "var(--gold)", "Negocjacje": "var(--amber)", "Zamknięty": "var(--green2)", "Stracony": "var(--red)" };
    const addLead = () => { if (!name.trim())
        return; setPipeline(p => [...p, { id: uid(), name: name.trim(), stage, val: parseFloat(val) || 0 }]); setName(""); setVal(""); setOpen(false); };
    const nextStage = (id) => setPipeline(p => p.map(l => l.id === id ? { ...l, stage: STAGES[Math.min(STAGES.indexOf(l.stage) + 1, STAGES.length - 1)] } : l));
    const delLead = (id) => setPipeline(p => p.filter(l => l.id !== id));
    const addRev = () => { if (!(parseFloat(rAmt) > 0))
        return; setRevenue(p => [...p, { id: uid(), amt: parseFloat(rAmt), note: rNote.trim(), date: todayKey() }]); setRAmt(""); setRNote(""); setROpen(false); };
    const totalRev = revenue.reduce((a, r) => a + r.amt, 0);
    const openDeals = pipeline.filter(l => l.stage !== "Zamknięty" && l.stage !== "Stracony");
    const pipeVal = openDeals.reduce((a, l) => a + l.val, 0);
    const TIPS = [
        { t: "Pitch na ROI, nie na funkcje", d: "Klient nie kupuje aplikacji — kupuje czas/pieniądze. Np. 'Ta apka zaoszczędzi Wam 3 h/dzień = €15k rocznie.' Licz konkretny zwrot z inwestycji zanim wejdziesz na spotkanie." },
        { t: "Niszuj się — jedna branża na start", d: "Zamiast 'robimy wszystko': 'aplikacje dla firm transportowych' albo 'SaaS dla lokalnych usługodawców'. Łatwiej zbudować autorytet, referencje i case studies w jednej niszy." },
        { t: "5 zimnych e-maili dziennie", d: "Personalizuj każdy: jeden konkretny problem ich branży, nie features produktu. Dodaj zdanie o ich firmie (LinkedIn/strona). Follow-up 3×: dzień 2, dzień 5, dzień 10." },
        { t: "Demo video > oferta PDF", d: "Nagraj 2-minutowe wideo Loom z działającym prototypem. Konwertuje 3× lepiej niż PDF. Pokaż: problem → apka → wynik." },
        { t: "Retainer = stały przychód", d: "Po dostarczeniu projektu zaproponuj plan maintenance + nowe funkcje (€300–1000/mies). Jeden klient = miesiące przychodu bez nowego prospectingu." },
        { t: "LinkedIn jako silnik inbound", d: "Posty 3×/tydzień: case study (problem → rozwiązanie → liczby). Komentuj w niszach branżowych. Po 90 dniach masz inbound bez cold outreach." },
        { t: "Follow-up zamyka deal", d: "80% sprzedaży zamyka się po 5+ kontaktach. Większość odpuszcza po 1. Ustaw przypomnienia — to jest Twoja przewaga." },
        { t: "Ceny 3-poziomowe zawsze", d: "Basic €2k / Standard €5k / Premium €10k. Klienci wybierają środek. Unikasz negocjacji w dół i zostawiasz miejsce dla dużych budżetów." },
    ];
    const todayTip = TIPS[new Date().getDate() % TIPS.length];
    return (React.createElement("div", null,
        React.createElement(DevHeader, { icon: Zap, tint: "#10b981", kicker: "Sprzeda\u017C aplikacji dla firm", title: "Biznes SaaS" }),
        React.createElement(Card, { style: { marginTop: 14, background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)" } },
            React.createElement("div", { style: { fontSize: 13.5, fontWeight: 700, color: "#10b981", marginBottom: 5 } }, "Wskaz\u00F3wka dnia"),
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, marginBottom: 5 } }, todayTip.t),
            React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", lineHeight: 1.55 } }, todayTip.d)),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginTop: 14 } },
            React.createElement(Card, null,
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em" } }, "Pipeline"),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, marginTop: 4 } },
                    "\u20AC",
                    pipeVal.toLocaleString()),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } },
                    openDeals.length,
                    " aktywnych")),
            React.createElement(Card, null,
                React.createElement("div", { style: { fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em" } }, "Przych\u00F3d"),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, color: "var(--green2)", marginTop: 4 } },
                    "\u20AC",
                    totalRev.toLocaleString()),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, "\u0142\u0105cznie"))),
        React.createElement("div", { style: { ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("span", null, "Pipeline lead\u00F3w"),
            React.createElement("button", { onClick: () => setOpen(true), style: { ...iconBtn, width: 32, height: 28, borderRadius: 8 } }, "+")),
        pipeline.filter(l => l.stage !== "Stracony").length === 0 && React.createElement(Card, null,
            React.createElement("div", { style: { textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "10px 0" } }, "Brak lead\u00F3w. Dodaj pierwszego \u2191")),
        pipeline.filter(l => l.stage !== "Stracony").map(l => (React.createElement(Card, { key: l.id, style: { marginBottom: 9, padding: "13px 14px" } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: 14.5, fontWeight: 700 } }, l.name),
                    React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 4, alignItems: "center" } },
                        React.createElement("span", { style: { fontSize: 11.5, fontWeight: 700, color: STAGE_COLORS[l.stage] || "var(--muted)", background: "var(--surface2)", padding: "3px 8px", borderRadius: 6 } }, l.stage),
                        l.val > 0 && React.createElement("span", { style: { fontSize: 12, color: "var(--gold)", fontWeight: 700 } },
                            "\u20AC",
                            l.val))),
                React.createElement("button", { onClick: () => nextStage(l.id), style: { ...iconBtn, width: 36, height: 32, background: "rgba(34,197,94,.1)", color: "var(--green2)", border: "none" } },
                    React.createElement(ChevronRight, { size: 16 })),
                React.createElement("button", { onClick: () => delLead(l.id), style: { ...iconBtn, width: 32, height: 32, border: "none", background: "rgba(239,68,68,.08)", color: "var(--red)" } },
                    React.createElement(X, { size: 15 })))))),
        React.createElement("div", { style: { ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("span", null, "Przychody"),
            React.createElement("button", { onClick: () => setROpen(true), style: { ...iconBtn, width: 32, height: 28, borderRadius: 8 } }, "+")),
        revenue.length === 0 && React.createElement(Card, null,
            React.createElement("div", { style: { textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "8px 0" } }, "Brak przychod\u00F3w \u2014 dodaj pierwszy projekt \u2191")),
        revenue.slice(-5).reverse().map(r => (React.createElement(Card, { key: r.id, style: { marginBottom: 8, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 } },
            React.createElement("div", { style: { flex: 1 } },
                React.createElement("div", { style: { fontSize: 14, fontWeight: 600 } }, r.note || "Przychód"),
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, r.date)),
            React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 17, color: "var(--green2)" } },
                "+\u20AC",
                r.amt),
            React.createElement("button", { onClick: () => setRevenue(p => p.filter(x => x.id !== r.id)), style: { background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4 } },
                React.createElement(Trash2, { size: 14 }))))),
        React.createElement("div", { style: sectionTitle }, "Porady sprzeda\u017Cowe \u2014 SaaS & Aplikacje"),
        TIPS.map((t, i) => (React.createElement(Fold, { key: i, icon: Lightbulb, tint: "#10b981", title: t.t },
            React.createElement("div", { style: { fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" } }, t.d)))),
        React.createElement(Sheet, { open: open, onClose: () => setOpen(false), title: "Nowy lead" },
            React.createElement("label", { style: label }, "Firma / klient"),
            React.createElement("input", { value: name, onChange: e => setName(e.target.value), placeholder: "np. Firma XYZ sp. z o.o.", style: inputStyle }),
            React.createElement("label", { style: label }, "Etap"),
            React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, STAGES.slice(0, 4).map(s => React.createElement("button", { key: s, onClick: () => setStage(s), style: { padding: "7px 11px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: stage === s ? "1.5px solid var(--green)" : "1px solid var(--line2)", background: stage === s ? "rgba(34,197,94,.1)" : "var(--surface2)", color: stage === s ? "var(--green2)" : "var(--muted)" } }, s))),
            React.createElement("label", { style: label }, "Warto\u015B\u0107 projektu (\u20AC)"),
            React.createElement("input", { type: "number", value: val, onChange: e => setVal(e.target.value), placeholder: "0", style: inputStyle }),
            React.createElement("button", { style: btnPrimary, onClick: addLead }, "Dodaj lead")),
        React.createElement("div", { style: sectionTitle }, "\u26A1 Rutyna Sprzeda\u017Cowa \u2014 codzienna"),
        React.createElement(Card, { style: { background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.22)", marginBottom: 14 } },
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.75 } },
                React.createElement("b", { style: { color: "#10b981" } }, "\uD83C\uDF05 Rano (30 min \u2014 PRIORYTET 1):"),
                React.createElement("br", null),
                "\u2022 5 cold e-maili \u2014 Claude pisze szablon, Ty personalizujesz jedno zdanie",
                React.createElement("br", null),
                "\u2022 3 follow-upy \u2014 wi\u0119kszo\u015B\u0107 deali zamkn\u0119\u0142a si\u0119 przy 5. kontakcie",
                React.createElement("br", null),
                "\u2022 Aktualizuj pipeline w aplikacji",
                React.createElement("br", null),
                React.createElement("br", null),
                React.createElement("b", { style: { color: "var(--gold)" } }, "\u2600\uFE0F Po\u0142udnie (20 min):"),
                React.createElement("br", null),
                "\u2022 1 post na LinkedIn (case study lub insight) \u2014 AI pomaga",
                React.createElement("br", null),
                "\u2022 Reaguj na komentarze w ci\u0105gu godziny",
                React.createElement("br", null),
                React.createElement("br", null),
                React.createElement("b", { style: { color: "var(--muted)" } }, "\uD83C\uDF19 Wiecz\u00F3r (10 min):"),
                React.createElement("br", null),
                "\u2022 Przygotuj jutrzejsz\u0105 list\u0119 5 firm do outreach",
                React.createElement("br", null),
                "\u2022 10 stron ksi\u0105\u017Cki sprzeda\u017Cowej z biblioteki")),
        React.createElement("div", { style: sectionTitle }, "\uD83D\uDCC5 Tygodniowy rytm SaaS"),
        React.createElement(Card, { style: { marginBottom: 14 } }, [["Pon", "Blok 3h: kod apki / development + 5 cold e-maili"], ["Wt", "Portfolio: zaktualizuj case study lub dodaj nowy projekt"], ["Śr", "LinkedIn: post + 30 min komentowania w niszach"], ["Cz", "Follow-up wszystkich otwartych deali + 1 zimny telefon"], ["Pt", "Retrospektywa tygodnia: ile e-maili → odpowiedzi → demo → deal?"], ["4 dni wolne", "2× blok 3h: nowy feature lub demo-wideo dla 3 firm (HeyGen + Cursor)"]].map(([d, t]) => (React.createElement("div", { key: d, style: { display: "flex", gap: 10, padding: "8px 0", borderTop: d !== "Pon" ? "1px solid var(--line)" : "none" } },
            React.createElement("span", { style: { fontSize: 11, fontWeight: 800, color: "#10b981", minWidth: 70 } }, d),
            React.createElement("span", { style: { fontSize: 13, lineHeight: 1.45 } }, t))))),
        React.createElement(Sheet, { open: rOpen, onClose: () => setROpen(false), title: "Dodaj przych\u00F3d" },
            React.createElement("label", { style: label }, "Kwota (\u20AC)"),
            React.createElement("input", { type: "number", value: rAmt, onChange: e => setRAmt(e.target.value), placeholder: "0", style: { ...inputStyle, fontFamily: "var(--display)", fontWeight: 700, fontSize: 20 } }),
            React.createElement("label", { style: label }, "Opis"),
            React.createElement("input", { value: rNote, onChange: e => setRNote(e.target.value), placeholder: "np. Aplikacja dla XYZ \u2014 etap 1", style: inputStyle }),
            React.createElement("button", { style: btnPrimary, onClick: addRev }, "Dodaj przych\u00F3d"))));
}
/* ───── HEALTH TRACKER (sen, pomiary ciała, badania krwi) ───── */
function HealthTracker({ day, setDay, daily, profile, setProfile, events, setEvents, measures, setMeasures, photos, setPhotos, bloodLog, setBloodLog, setToast }) {
    const [seg, setSeg] = useState("sleep");
    const [mOpen, setMOpen] = useState(false);
    const [mWeight, setMWeight] = useState("");
    const [mChest, setMChest] = useState("");
    const [mWaist, setMWaist] = useState("");
    const [mArm, setMArm] = useState("");
    const [mHip, setMHip] = useState("");
    const SEGS = [["sleep", "Sen 😴"], ["body", "Pomiary 📏"], ["photo", "Sylwetka 📸"], ["blood", "Badania 🩸"]];
    const tk = todayKey();
    const dkeyFn = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1).padStart(2, "0")}-${pad(d.getDate()).padStart(2, "0")}`;
    // Sen
    const sleep = day.sleep || { h: "", qual: 0 };
    const setSleep = (k, v) => setDay(c => ({ ...c, sleep: { ...(c.sleep || {}), [k]: v } }));
    const sleepHistory = Object.entries(daily || {}).filter(([d]) => d <= tk).slice(-14).map(([d, dv]) => [d, dv && dv.sleep]).filter(([, s]) => s && s.h);
    // Pomiary ciała
    const safeArr = measures || [];
    const addMeasure = () => {
        const w = parseFloat(mWeight);
        if (!w)
            return;
        setMeasures(p => [...(p || []), { id: uid(), date: tk, weight: w, chest: parseFloat(mChest) || 0, waist: parseFloat(mWaist) || 0, arm: parseFloat(mArm) || 0 }]);
        setMWeight("");
        setMChest("");
        setMWaist("");
        setMArm("");
        setMOpen(false);
    };
    const latest = safeArr.slice(-1)[0];
    // Badania krwi
    const BLOOD_TESTS = [
        { id: "bt1", name: "Testosteron całkowity + wolny", freq: "co 3 miesiące", color: "#f5b53d" },
        { id: "bt2", name: "SHBG + Estradiol", freq: "co 3 miesiące", color: "#fbbf24" },
        { id: "bt3", name: "Witamina D (25-OH)", freq: "co 6 miesięcy", color: "#60a5fa" },
        { id: "bt4", name: "Morfologia krwi (CBC)", freq: "co 6 miesięcy", color: "#22c55e" },
        { id: "bt5", name: "Glukoza + insulina na czczo", freq: "raz w roku", color: "#f87171" },
        { id: "bt6", name: "Lipidogram (cholesterol)", freq: "raz w roku", color: "#a78bfa" },
        { id: "bt7", name: "Ferrytyna + żelazo", freq: "raz w roku", color: "#fb7185" },
        { id: "bt8", name: "TSH (tarczyca)", freq: "raz w roku", color: "#818cf8" },
    ];
    const [addedTests, setAddedTests] = useState({});
    const [bOpen, setBOpen] = useState(false);
    const [bTest, setBTest] = useState(BLOOD_TESTS[0].name);
    const [bVal, setBVal] = useState("");
    const [bDate, setBDate] = useState(todayKey());
    const addBlood = () => { if (!bVal.trim())
        return; setBloodLog((p) => [{ id: uid(), date: bDate, name: bTest, value: bVal.trim() }, ...(p || [])]); setBVal(""); setBOpen(false); buzz(8); if (setToast)
        setToast({ icon: "sun", title: "Zapisano wynik", msg: bTest, color: "#f87171" }); };
    const addBloodReminder = (test) => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        const ds = dkeyFn(d);
        setEvents(p => [...(p || []), { id: uid(), date: ds, title: "🩸 " + test.name, note: test.freq, color: "#f87171" }]);
        setAddedTests(p => ({ ...p, [test.id]: true }));
        if (setToast)
            setToast({ icon: "sun", title: "Dodano do kalendarza", msg: "🩸 " + test.name + " · za 7 dni", color: "#f87171" });
        setTimeout(() => setAddedTests(p => ({ ...p, [test.id]: false })), 3000);
    };
    return (React.createElement("div", null,
        React.createElement(DevHeader, { icon: TrendingUp, tint: "#a78bfa", kicker: "Sen \u00B7 Cia\u0142o \u00B7 Badania", title: "Zdrowie & Cia\u0142o" }),
        React.createElement("div", { style: { display: "flex", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 4, marginTop: 14, gap: 4 } }, SEGS.map(([id, lbl]) => (React.createElement("button", { key: id, onClick: () => setSeg(id), style: { flex: 1, padding: "10px 6px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, border: "none", background: seg === id ? "var(--surface2)" : "transparent", color: seg === id ? "#a78bfa" : "var(--muted)" } }, lbl)))),
        seg === "sleep" && (React.createElement("div", { style: { marginTop: 14 } },
            React.createElement(Card, null,
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, marginBottom: 12 } },
                    "Sen \u2014 ",
                    tk),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 10 } }, "Godziny"),
                React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 16 } },
                    React.createElement("button", { onClick: () => setSleep("h", String(Math.max(0, (parseFloat(sleep.h) || 0) - 0.5))), style: iconBtn }, "\u2013"),
                    React.createElement("div", { style: { flex: 1, textAlign: "center", fontFamily: "var(--display)", fontWeight: 800, fontSize: 36, color: parseFloat(sleep.h) >= 7 ? "var(--green2)" : parseFloat(sleep.h) > 0 ? "var(--red)" : "var(--faint)" } },
                        sleep.h || "—",
                        React.createElement("span", { style: { fontSize: 18 } }, "h")),
                    React.createElement("button", { onClick: () => setSleep("h", String(Math.min(12, (parseFloat(sleep.h) || 0) + 0.5))), style: iconBtn }, "+")),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 8 } }, "Jako\u015B\u0107"),
                React.createElement("div", { style: { display: "flex", gap: 6 } }, [1, 2, 3, 4, 5].map(n => (React.createElement("button", { key: n, onClick: () => setSleep("qual", n), style: { flex: 1, padding: "10px 0", borderRadius: 11, cursor: "pointer", fontWeight: 800, fontSize: 16, border: sleep.qual === n ? "1.5px solid #a78bfa" : "1px solid var(--line2)", background: sleep.qual === n ? "rgba(167,139,250,.15)" : "var(--surface2)", color: sleep.qual === n ? "#a78bfa" : "var(--muted)" } },
                    n,
                    "\u2605")))),
                parseFloat(sleep.h) < 7 && parseFloat(sleep.h) > 0 && React.createElement("div", { style: { marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(248,113,113,.1)", color: "var(--red)", fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 } }, "\u26A0 Poni\u017Cej 7h \u2014 testosteron spada, regeneracja niepe\u0142na. Na nocki: zaciemnij pok\u00F3j, okulary w drodze do domu rano."),
                parseFloat(sleep.h) >= 7 && React.createElement("div", { style: { marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(34,197,94,.08)", color: "var(--green2)", fontSize: 12.5, fontWeight: 600 } }, "\u2713 Dobry sen \u2014 optymalnie dla hormono i regeneracji.")),
            sleepHistory.length > 1 && (React.createElement(Card, { style: { marginTop: 12 } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 14, marginBottom: 12 } },
                    "Ostatnie ",
                    sleepHistory.length,
                    " dni"),
                React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "flex-end", height: 64 } }, sleepHistory.slice(-14).map(([d, s]) => {
                    const h = parseFloat(s?.h) || 0;
                    const pct = Math.min(100, (h / 9) * 100);
                    const color = h >= 7 ? "var(--green2)" : h >= 5 ? "var(--gold)" : "var(--red)";
                    return React.createElement("div", { key: d, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 } },
                        React.createElement("div", { style: { width: "100%", height: pct * 0.6 + 2, background: color, borderRadius: 3, minHeight: 2 } }),
                        React.createElement("div", { style: { fontSize: 9, color: "var(--faint)" } }, h || "?"));
                })),
                React.createElement("div", { style: { fontSize: 10.5, color: "var(--faint)", marginTop: 8, textAlign: "center" } }, "godziny snu (max 9h = 100%)"))))),
        seg === "body" && (React.createElement("div", { style: { marginTop: 14 } },
            latest && (React.createElement(Card, { style: { marginBottom: 12 } },
                React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginBottom: 10 } },
                    "Ostatni pomiar \u00B7 ",
                    latest.date),
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, [["Waga", latest.weight, "kg", "var(--green2)"], ["Klatka", latest.chest, "cm", "var(--gold)"], ["Talia", latest.waist, "cm", "var(--blue)"], ["Ramię", latest.arm, "cm", "#a78bfa"]].map(([lbl, v, u, c]) => v > 0 && (React.createElement("div", { key: lbl, style: { background: "var(--surface2)", borderRadius: 11, padding: "10px 12px", textAlign: "center" } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: c } },
                        v,
                        React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, u)),
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 } }, lbl))))),
                latest.weight > 0 && profile.goal && (React.createElement("div", { style: { marginTop: 10, padding: "9px 12px", background: "rgba(34,197,94,.07)", borderRadius: 10 } },
                    React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)" } },
                        "Cel: ",
                        profile.goal,
                        " kg \u00B7 Zosta\u0142o: ",
                        React.createElement("b", { style: { color: "var(--gold)" } },
                            Math.max(0, (profile.goal) - latest.weight).toFixed(1),
                            " kg")))))),
            React.createElement("button", { style: { ...btnPrimary, marginBottom: 12 }, onClick: () => setMOpen(true) },
                React.createElement(Plus, { size: 18, style: { marginRight: 6 } }),
                "Dodaj pomiar"),
            safeArr.slice(-6).reverse().map(m => (React.createElement(Card, { key: m.id, style: { marginBottom: 8, padding: "12px 14px" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 19 } },
                        m.weight,
                        " ",
                        React.createElement("span", { style: { fontSize: 13, color: "var(--muted)" } }, "kg")),
                    React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, m.date),
                    React.createElement("button", { onClick: () => setMeasures(p => (p || []).filter(x => x.id !== m.id)), style: { background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4 } },
                        React.createElement(Trash2, { size: 14 }))),
                (m.chest || m.waist || m.arm) > 0 && React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", marginTop: 4 } },
                    "kl. ",
                    m.chest || "—",
                    " \u00B7 talia ",
                    m.waist || "—",
                    " \u00B7 ram. ",
                    m.arm || "—",
                    " cm")))),
            safeArr.length === 0 && React.createElement(Card, null,
                React.createElement("div", { style: { textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "10px 0" } }, "Brak pomiar\u00F3w. Dodaj pierwszy \u2191")),
            React.createElement(Sheet, { open: mOpen, onClose: () => setMOpen(false), title: "Nowy pomiar cia\u0142a" },
                [["Waga (kg) *", mWeight, setMWeight], ["Klatka (cm)", mChest, setMChest], ["Talia (cm)", mWaist, setMWaist], ["Ramię (cm)", mArm, setMArm]].map(([lbl, v, set]) => (React.createElement("div", { key: lbl },
                    React.createElement("label", { style: label }, lbl),
                    React.createElement("input", { type: "number", inputMode: "decimal", value: v, onChange: e => set(e.target.value), placeholder: "0", style: inputStyle })))),
                React.createElement("button", { style: btnPrimary, onClick: addMeasure }, "Zapisz pomiar")))),
        seg === "photo" && React.createElement(PhotoTimeline, { photos: photos, setPhotos: setPhotos }),
        seg === "blood" && (React.createElement("div", { style: { marginTop: 14 } },
            React.createElement(Card, { style: { background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.25)", marginBottom: 14 } },
                React.createElement("div", { style: { fontSize: 13, lineHeight: 1.6 } },
                    "Regularne badania krwi to fundament: widzisz czy testosteron ro\u015Bnie, wykrywasz niedobory (D3, \u017Celazo, magnez) zanim poczujesz objawy. Kliknij ",
                    React.createElement("b", null, "+ Kal."),
                    " \u017Ceby doda\u0107 reminder w Kalendarzu.")),
            React.createElement(Card, { style: { marginBottom: 14 } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (bloodLog && bloodLog.length) ? 10 : 0 } },
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Moje wyniki"),
                    React.createElement("button", { onClick: () => { setBDate(todayKey()); setBOpen(true); }, style: { padding: "8px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "none", background: "var(--gold)", color: "#1a1200" } }, "+ Dodaj wynik")),
                (bloodLog || []).slice(0, 16).map((r) => (React.createElement("div", { key: r.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--line)" } },
                    React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                        React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600 } }, r.name),
                        React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)" } }, r.date)),
                    React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 15, color: "var(--gold)", flexShrink: 0 } }, r.value),
                    React.createElement("button", { onClick: () => setBloodLog((p) => (p || []).filter((x) => x.id !== r.id)), style: { background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4, flexShrink: 0 } },
                        React.createElement(Trash2, { size: 14 }))))),
                (!bloodLog || !bloodLog.length) && React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 } }, "Zapisuj wyniki, \u017Ceby widzie\u0107 trend \u2014 Druga G\u0142owa te\u017C je wtedy zna.")),
            React.createElement(Sheet, { open: bOpen, onClose: () => setBOpen(false), title: "Nowy wynik badania" },
                React.createElement("label", { style: label }, "Badanie"),
                React.createElement("select", { value: bTest, onChange: (e) => setBTest(e.target.value), style: { ...inputStyle, marginBottom: 10 } }, BLOOD_TESTS.map((t) => React.createElement("option", { key: t.id, value: t.name }, t.name))),
                React.createElement("label", { style: label }, "Wynik (z jednostk\u0105)"),
                React.createElement("input", { value: bVal, onChange: (e) => setBVal(e.target.value), placeholder: "np. 21.5 nmol/l albo 650 ng/dL", style: { ...inputStyle, marginBottom: 10 } }),
                React.createElement("label", { style: label }, "Data"),
                React.createElement("input", { type: "date", value: bDate, onChange: (e) => setBDate(e.target.value), style: { ...inputStyle, marginBottom: 4 } }),
                React.createElement("button", { style: btnPrimary, onClick: addBlood }, "Zapisz wynik")),
            BLOOD_TESTS.map(t => (React.createElement(Card, { key: t.id, style: { marginBottom: 9, padding: "13px 14px", display: "flex", alignItems: "center", gap: 12 } },
                React.createElement("div", { style: { width: 8, height: 8, borderRadius: 99, background: t.color, flexShrink: 0 } }),
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: 14, fontWeight: 600 } }, t.name),
                    React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, t.freq)),
                React.createElement("button", { onClick: () => addBloodReminder(t), style: { padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: addedTests[t.id] ? "1.5px solid var(--green2)" : "1px solid var(--line2)", background: addedTests[t.id] ? "rgba(34,197,94,.15)" : "var(--surface2)", color: addedTests[t.id] ? "var(--green2)" : "var(--gold)", flexShrink: 0, transition: "all .2s" } }, addedTests[t.id] ? "✓ Dodano!" : "+ Kal.")))),
            React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", textAlign: "center", marginTop: 14, lineHeight: 1.55 } }, "W NL: przez huisarts lub prywatnie (Synlab, Medlon). W PL: Diagnostyka, Medicover.")))));
}
/* ───────────────────────── TESTOSTERON & CHARYZMA (sekcje rozwoju) ───────────────────────── */
function Fold({ icon: Ic, tint, title, sub, openInit, children }) {
    const [o, setO] = useState(!!openInit);
    return (React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, marginBottom: 11, overflow: "hidden" } },
        React.createElement("button", { onClick: () => setO(!o), style: { width: "100%", background: "none", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left", padding: 15, display: "flex", alignItems: "center", gap: 12 } },
            Ic && React.createElement("span", { style: { width: 38, height: 38, borderRadius: 11, background: "var(--surface2)", display: "grid", placeItems: "center", flexShrink: 0 } },
                React.createElement(Ic, { size: 19, color: tint || "var(--green2)" })),
            React.createElement("span", { style: { flex: 1 } },
                React.createElement("span", { style: { display: "block", fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 } }, title),
                sub && React.createElement("span", { style: { display: "block", fontSize: 12.5, color: "var(--muted)", marginTop: 2 } }, sub)),
            React.createElement(ChevronRight, { size: 18, color: "var(--faint)", style: { transform: o ? "rotate(90deg)" : "none", transition: "transform .2s", flexShrink: 0 } })),
        o && React.createElement("div", { style: { padding: "0 15px 15px", animation: "fade .2s ease" } }, children)));
}
function Bullets({ items, tint }) {
    return (React.createElement("div", null, items.map((s, i) => {
        const ix = s.indexOf(" — ");
        const h = ix > 0 ? s.slice(0, ix) : null;
        const d = ix > 0 ? s.slice(ix + 3) : s;
        return (React.createElement("div", { key: i, style: { display: "flex", gap: 9, padding: "7px 0", borderTop: i ? "1px solid var(--line)" : "none" } },
            React.createElement("span", { style: { color: tint || "var(--green2)", marginTop: 4, flexShrink: 0, fontSize: 11 } }, "\u25CF"),
            React.createElement("span", { style: { fontSize: 13.5, lineHeight: 1.55 } },
                h && React.createElement("b", { style: { fontWeight: 700 } },
                    h,
                    " \u2014 "),
                d)));
    })));
}
function DevHeader({ icon: Ic, tint, kicker, title }) {
    return (React.createElement("div", { style: { paddingTop: 18, marginBottom: 6 } },
        React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 } },
            React.createElement(Ic, { size: 14, color: tint }),
            " ",
            kicker),
        React.createElement("h1", { style: { margin: "3px 0 0", fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.01em" } }, title)));
}
function Testo() {
    return (React.createElement("div", null,
        React.createElement(DevHeader, { icon: Flame, tint: "var(--gold)", kicker: "Naturalnie, m\u0105drze, d\u0142ugoterminowo", title: "Testosteron" }),
        React.createElement(Card, { pad: 14, style: { background: "rgba(245,181,61,.08)", border: "1px solid rgba(245,181,61,.25)", marginBottom: 14 } },
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.55, color: "var(--text)" } },
                "Najwi\u0119ksze d\u017Awignie to ",
                React.createElement("b", null, "sen, trening si\u0142owy, dieta, niski stres i zdrowa masa cia\u0142a"),
                " \u2014 nie suplementy. Zr\u00F3b badania krwi (testosteron ca\u0142kowity i wolny, SHBG, estradiol, wit. D), a przy niskich wynikach lub objawach id\u017A do endokrynologa. Bez steryd\u00F3w i \u201Etesto booster\u00F3w\u201D na w\u0142asn\u0105 r\u0119k\u0119.")),
        React.createElement(Fold, { icon: Moon, tint: "var(--blue)", title: "Sen \u2014 fundament", sub: "Najwi\u0119kszy wp\u0142yw na testosteron", openInit: true },
            React.createElement(Bullets, { items: [
                    "7–9 h snu — większość testosteronu produkujesz w nocy; już kilka nocy < 5 h potrafi go mocno obniżyć.",
                    "Regularność — kładź się i wstawaj o stałych porach, też w weekend.",
                    "Ciemność i chłód — zaciemnij pokój (rolety/maska), 18–20°C, bez ekranów na godzinę przed snem.",
                    "Słońce zaraz po przebudzeniu ustawia rytm dobowy i poprawia jakość snu wieczorem.",
                ], tint: "var(--blue)" })),
        React.createElement(Fold, { icon: Dumbbell, tint: "var(--green2)", title: "Trening si\u0142owy" },
            React.createElement(Bullets, { items: [
                    "Ciężkie ruchy wielostawowe — przysiad, martwy ciąg, wyciskanie, podciąganie, wiosłowanie.",
                    "Progresja — stopniowo dokładaj ciężar lub powtórzenia; to bodziec hormonalny.",
                    "Krótko i intensywnie — 45–75 min; unikaj przewlekłego przetrenowania.",
                    "Za dużo długiego cardio i deficytu = niższy testosteron. Siła ważniejsza niż godziny biegania.",
                ] })),
        React.createElement(Fold, { icon: Beef, tint: "var(--red)", title: "Dieta i masa cia\u0142a" },
            React.createElement(Bullets, { items: [
                    "Nie głoduj — przewlekły duży deficyt kalorii obniża testosteron. Jedz tyle, by mieć siłę.",
                    "Tłuszcze są ważne — jaja z żółtkiem, oliwa, awokado, tłuste ryby, masło, orzechy.",
                    "Białko i warzywa w każdym posiłku; ogranicz cukier i wysoko przetworzone jedzenie.",
                    "Mikroskładniki — cynk, magnez, witamina D, bor (z diety i ewentualnej suplementacji).",
                    "Tkanka tłuszczowa — zbyt wysoka zamienia testosteron w estrogen; bardzo niska też szkodzi. Celuj w szczupłą, sprawną sylwetkę.",
                    "Alkohol mocno obniża testosteron — ogranicz do minimum.",
                ], tint: "var(--red)" })),
        React.createElement(Fold, { icon: Sun, tint: "var(--gold)", title: "S\u0142o\u0144ce i witamina D" },
            React.createElement(Bullets, { items: [
                    "Witamina D działa jak prohormon — jej niedobór wiąże się z niższym testosteronem.",
                    "W Holandii słońca jest mało — rozważ D3 (najlepiej z K2) po sprawdzeniu poziomu we krwi.",
                    "Codzienna porcja światła dziennego, zwłaszcza rano.",
                ], tint: "var(--gold)" })),
        React.createElement(Fold, { icon: Zap, tint: "var(--amber)", title: "Stres i regeneracja" },
            React.createElement(Bullets, { items: [
                    "Kortyzol jest przeciwnikiem testosteronu — przewlekły stres go zjada.",
                    "Codzienne wyciszenie — spacer, oddech (np. 4-7-8), natura, mniej scrollowania.",
                    "Dni bez treningu też budują — regeneracja to broń, nie luz. Śpisz i regenerujesz się PO TO, żeby uderzać mocniej. To część grindu, nie wymówka.",
                ], tint: "var(--amber)" })),
        React.createElement(Fold, { icon: AlertTriangle, tint: "var(--red)", title: "Czego unika\u0107" },
            React.createElement(Bullets, { items: [
                    "Niedobór snu i przewlekły stres.",
                    "Nadmiar alkoholu, papierosy i nikotyna.",
                    "Otyłość brzuszna i ciągły cukier.",
                    "Ksenoestrogeny z plastiku — nie podgrzewaj jedzenia w plastiku, myj ręce po pracy, przechowuj jedzenie w szkle (ważne przy pracy z tworzywami).",
                ], tint: "var(--red)" })),
        React.createElement(Fold, { icon: Pill, tint: "var(--blue)", title: "Suplementy (po badaniach)" },
            React.createElement(Bullets, { items: [
                    "Witamina D3 z K2 — szczególnie zimą i przy pracy zmianowej.",
                    "Magnez i cynk — częste niedobory, wspierają testosteron i sen.",
                    "Kreatyna — nie podnosi testosteronu, ale realnie wspiera siłę i trening (3–5 g dziennie).",
                    "Ashwagandha — badania pokazują obniżenie kortyzolu i wzrost testosteronu u zestresowanych.",
                    "Najpierw badania i rozmowa z lekarzem. Żadnych sterydów ani zastrzyków bez nadzoru — to ryzyko dla zdrowia i własnej produkcji hormonów.",
                ], tint: "var(--blue)" })),
        React.createElement(Fold, { icon: TimerIcon, tint: "var(--green2)", title: "Praca zmianowa 2+2+2+4", sub: "Jak u\u0142o\u017Cy\u0107 rutyn\u0119 pod Tw\u00F3j grafik", openInit: true },
            React.createElement(Bullets, { items: [
                    "Noce biją najmocniej — po nocce zaciemnij pokój i śpij w jednym bloku; w drodze do domu rano noś okulary przeciwsłoneczne, by nie „obudzić” mózgu światłem.",
                    "Kofeina tylko w pierwszej połowie zmiany (zwłaszcza nocnej), żeby nie psuła snu po pracy.",
                    "Dni dzienne — lekki lub średni trening albo sama mobilność; priorytetem jest sen.",
                    "Dni popołudniowe — najlepszy moment na solidny trening (ciało rozgrzane po dniu).",
                    "4 dni wolne — tu wrzuć najcięższe treningi, nadrób sen (ale trzymaj kotwicę porannego wstawania), dużo słońca, gotowanie, ludzie i natura.",
                    "Stałe pory posiłków na tyle, na ile grafik pozwala; nawodnienie przez całą zmianę.",
                    "Po nockach nie odsypiaj całej doby — śpij blok, potem krótka drzemka, by szybciej wrócić do rytmu dziennego przed wolnym.",
                ] })),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", textAlign: "center", margin: "14px 4px 24px", lineHeight: 1.5 } }, "Oparte na endokrynologii i naukach o sporcie \u2014 to nie porada medyczna. Przy objawach (spadek energii, libido, nastroju) zr\u00F3b badania i skonsultuj si\u0119 z lekarzem.")));
}
const CHARISMA_CHALLENGES = [
    "Zagadaj do nieznajomego — choć jedno zdanie ponad to, co konieczne.",
    "Utrzymuj ciepły kontakt wzrokowy przez całą jedną rozmowę.",
    "Daj komuś szczery, konkretny komplement — nie ogólnik.",
    "Zadaj komuś głębokie pytanie i naprawdę wysłuchaj odpowiedzi.",
    "Zapamiętaj imię nowej osoby i użyj go w rozmowie.",
    "Mów dziś wolniej i rób pauzy po ważnych zdaniach.",
    "Wejdź w jedną sytuację poza strefą komfortu — zagadaj pierwszy.",
    "Trzymaj postawę cały dzień: barki w tył, klatka otwarta, głowa prosto.",
    "Rozśmiesz kogoś — lekko, naturalnie, bez cisnięcia.",
    "Słuchaj bez układania odpowiedzi w głowie — sama obecność.",
    "Powiedz komuś wprost, co doceniasz w tym, co robi.",
    "Zacznij rozmowę z kimś, kogo zwykle mijasz: kasjer, sąsiad, kolega ze zmiany.",
    "Opowiedz krótką historię z barwą — detal, emocja, puenta.",
    "Zadbaj o pierwsze wrażenie: uśmiech z oczu i pewny uścisk dłoni.",
    "Przez jedną rozmowę bądź zainteresowany, nie interesujący — same pytania.",
];
const BIZ_QUESTIONS = [
    { cat: "Początki i droga", qs: ["Od czego naprawdę zacząłeś — co było pierwszym krokiem?", "Jaki błąd na starcie kosztował Cię najwięcej i czego Cię nauczył?", "Co zrobiłbyś inaczej, gdybyś zaczynał dziś od zera?"] },
    { cat: "Decyzje i ryzyko", qs: ["Jak podejmujesz trudne decyzje bez pełnych danych?", "Jaka decyzja wydawała się szalona, a okazała się najlepsza?", "Czego najbardziej się dziś obawiasz w swoim biznesie?"] },
    { cat: "Skalowanie i pieniądze", qs: ["Co najbardziej przyspieszyło Twój wzrost?", "Na co wydajesz bez wahania, a na czym oszczędzasz?", "Po czym poznajesz, że pomysł jest warty wejścia?"] },
    { cat: "Ludzie i przywództwo", qs: ["Jak budujesz zespół, któremu ufasz?", "Po czym poznajesz właściwą osobę?", "Czego szukasz u ludzi, z którymi robisz interesy?"] },
    { cat: "Nawyki i głowa", qs: ["Jak wygląda Twój typowy poranek?", "Co robisz, żeby trzymać dyscyplinę, gdy nie ma motywacji?", "Jaka książka albo osoba zmieniła Twój sposób myślenia?"] },
];
function Charisma({ charisma, setCharisma }) {
    const c = charisma || { done: {}, log: [] };
    const [logOpen, setLogOpen] = useState(false);
    const [lWho, setLWho] = useState("");
    const [lNote, setLNote] = useState("");
    const [lRating, setLRating] = useState(4);
    const [randQ, setRandQ] = useState("");
    const tkey = todayKey();
    const todayCh = CHARISMA_CHALLENGES[dayOfYear() % CHARISMA_CHALLENGES.length];
    const chDone = !!(c.done && c.done[tkey]);
    const toggleCh = () => { setCharisma({ ...c, done: { ...(c.done || {}), [tkey]: !chDone } }); buzz(chDone ? 4 : 12); };
    const chStreak = (() => { const done = c.done || {}; const pd = (n) => String(n).padStart(2, "0"); const kk = (x) => x.getFullYear() + "-" + pd(x.getMonth() + 1) + "-" + pd(x.getDate()); let s = 0; const cur = new Date(); if (!done[kk(cur)])
        cur.setDate(cur.getDate() - 1); for (let i = 0; i < 400; i++) {
        if (done[kk(cur)]) {
            s++;
            cur.setDate(cur.getDate() - 1);
        }
        else
            break;
    } return s; })();
    const addLog = () => { if (!lWho.trim() && !lNote.trim())
        return; setCharisma({ ...c, log: [{ id: uid(), date: tkey, who: lWho.trim(), note: lNote.trim(), rating: lRating }, ...(c.log || [])] }); setLWho(""); setLNote(""); setLRating(4); setLogOpen(false); buzz(8); };
    const allQ = BIZ_QUESTIONS.reduce((a, g) => a.concat(g.qs), []);
    return (React.createElement("div", null,
        React.createElement(DevHeader, { icon: Sparkles, tint: "var(--green2)", kicker: "Pewno\u015B\u0107 siebie, sympatia, magnetyzm", title: "Charyzma" }),
        React.createElement(Card, { style: { marginBottom: 14, border: chDone ? "1px solid rgba(94,229,146,.45)" : "1px solid var(--line)" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
                React.createElement("div", { style: { fontSize: 12, fontWeight: 800, color: "var(--green2)", letterSpacing: ".05em" } }, "WYZWANIE DNIA"),
                chStreak > 0 && React.createElement("div", { style: { fontSize: 12.5, fontWeight: 700, color: "var(--gold)" } },
                    "\uD83D\uDD25 ",
                    chStreak,
                    " dni")),
            React.createElement("div", { style: { fontSize: 15.5, lineHeight: 1.5, fontWeight: 600, marginBottom: 14 } }, todayCh),
            React.createElement("button", { onClick: toggleCh, style: { width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: chDone ? "rgba(94,229,146,.18)" : "var(--green)", color: chDone ? "var(--green2)" : "#0a1f12" } }, chDone ? "✓ Zrobione dziś" : "Oznacz jako zrobione")),
        React.createElement(Card, { style: { marginBottom: 14 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (c.log && c.log.length) ? 10 : 0 } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Dziennik interakcji"),
                React.createElement("button", { onClick: () => setLogOpen(true), style: { padding: "8px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "none", background: "var(--gold)", color: "#1a1200" } }, "+ Dodaj")),
            (c.log || []).slice(0, 10).map((it) => (React.createElement("div", { key: it.id, style: { padding: "10px 0", borderTop: "1px solid var(--line)" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 } },
                    React.createElement("span", { style: { fontSize: 13.5, fontWeight: 600 } }, it.who || "Interakcja"),
                    React.createElement("span", { style: { fontSize: 11.5, color: "var(--gold)", flexShrink: 0 } },
                        "★".repeat(it.rating || 0),
                        React.createElement("span", { style: { color: "var(--faint)" } },
                            " \u00B7 ",
                            it.date))),
                it.note && React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 } }, it.note)))),
            (!c.log || !c.log.length) && React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 } }, "Zapisuj rozmowy: z kim, jak posz\u0142o, co poprawi\u0107. Wracaj do tego i ucz si\u0119 na sobie.")),
        React.createElement(Fold, { icon: Lightbulb, tint: "var(--gold)", title: "Pytania do biznesmen\u00F3w i mentor\u00F3w", sub: "Gotowe pytania, kt\u00F3re otwieraj\u0105 ludzi" },
            React.createElement("button", { onClick: () => setRandQ(allQ[Math.floor(Math.random() * allQ.length)]), style: { width: "100%", padding: "10px", borderRadius: 10, border: "1px dashed var(--line2)", background: "transparent", color: "var(--gold)", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: randQ ? 8 : 12 } }, "\uD83C\uDFB2 Wylosuj pytanie"),
            randQ && React.createElement("div", { style: { fontSize: 14, fontWeight: 600, lineHeight: 1.5, padding: "12px 14px", borderRadius: 12, background: "rgba(245,181,61,.1)", border: "1px solid rgba(245,181,61,.25)", marginBottom: 14 } }, randQ),
            BIZ_QUESTIONS.map((g) => (React.createElement("div", { key: g.cat, style: { marginBottom: 12 } },
                React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "var(--green2)", marginBottom: 6, letterSpacing: ".03em" } }, g.cat),
                g.qs.map((q, i) => React.createElement("div", { key: i, style: { fontSize: 13, lineHeight: 1.5, color: "var(--muted)", marginBottom: 5, paddingLeft: 13, position: "relative" } },
                    React.createElement("span", { style: { position: "absolute", left: 0 } }, "\u00B7"),
                    q)))))),
        React.createElement(Sheet, { open: logOpen, onClose: () => setLogOpen(false), title: "Nowa interakcja" },
            React.createElement("label", { style: { fontSize: 12.5, color: "var(--muted)", display: "block", marginBottom: 6 } }, "Z kim / kontekst"),
            React.createElement("input", { value: lWho, onChange: (e) => setLWho(e.target.value), placeholder: "np. klient w sklepie, kolega ze zmiany", style: { ...inputStyle, marginBottom: 12 } }),
            React.createElement("label", { style: { fontSize: 12.5, color: "var(--muted)", display: "block", marginBottom: 6 } }, "Jak posz\u0142o / co poprawi\u0107"),
            React.createElement("textarea", { value: lNote, onChange: (e) => setLNote(e.target.value), placeholder: "Co zadzia\u0142a\u0142o, co nast\u0119pnym razem zrobi\u0107 lepiej\u2026", rows: 3, style: { ...inputStyle, marginBottom: 12, resize: "vertical", minHeight: 70 } }),
            React.createElement("label", { style: { fontSize: 12.5, color: "var(--muted)", display: "block", marginBottom: 8 } }, "Jak si\u0119 czu\u0142e\u015B"),
            React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16 } }, [1, 2, 3, 4, 5].map((n) => React.createElement("button", { key: n, onClick: () => setLRating(n), style: { flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid var(--line)", cursor: "pointer", fontSize: 16, background: lRating >= n ? "rgba(245,181,61,.18)" : "var(--surface)", color: lRating >= n ? "var(--gold)" : "var(--faint)" } }, "\u2605"))),
            React.createElement("button", { style: btnPrimary, onClick: addLog }, "Zapisz")),
        React.createElement(Card, { pad: 14, style: { background: "rgba(94,229,146,.07)", border: "1px solid rgba(94,229,146,.22)", marginBottom: 14 } },
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.55 } },
                "Charyzma to nie sztuczki, tylko ",
                React.createElement("b", null, "obecno\u015B\u0107 + ciep\u0142o + pewno\u015B\u0107"),
                ". To umiej\u0119tno\u015B\u0107 \u2014 mo\u017Cna jej si\u0119 nauczy\u0107 \u0107wiczeniem, tak jak trenuj\u0105 j\u0105 aktorzy i m\u00F3wcy. Dzia\u0142a d\u0142ugoterminowo, bo opiera si\u0119 na szczero\u015Bci i dawaniu warto\u015Bci, nie na manipulacji.")),
        React.createElement(Fold, { icon: Star, tint: "var(--green2)", title: "Obecno\u015B\u0107 \u2014 fundament", sub: "To czuj\u0105 ludzie najbardziej", openInit: true },
            React.createElement(Bullets, { items: [
                    "Bądź w 100% tu i teraz — pełna uwaga na rozmówcy, telefon schowany.",
                    "Słuchaj, zamiast układać w głowie odpowiedź — ludzie czują różnicę.",
                    "Technika improwizacji „tak, i…” — podchwytuj to, co mówi druga osoba, i rozwijaj.",
                    "Nie spiesz się — spokój i brak pośpiechu sygnalizują pewność.",
                ] })),
        React.createElement(Fold, { icon: TrendingUp, tint: "var(--gold)", title: "Mowa cia\u0142a i g\u0142os" },
            React.createElement(Bullets, { items: [
                    "Postawa — wyprostowana, otwarta, barki w tył; zajmuj swoją przestrzeń.",
                    "Ruchy — wolne i spokojne; nerwowe gesty zdradzają niepewność.",
                    "Kontakt wzrokowy — ciepły i utrzymany, bez wpatrywania się na siłę.",
                    "Głos — mów wolniej, niżej i z pauzami; pauza po zdaniu to siła, nie pustka.",
                    "Uśmiech — autentyczny, „z oczu”; rozluźnia i przyciąga.",
                ], tint: "var(--gold)" })),
        React.createElement(Fold, { icon: Flame, tint: "var(--amber)", title: "Pewno\u015B\u0107 siebie" },
            React.createElement(Bullets, { items: [
                    "Kompetencje rodzą pewność — im więcej umiesz i trenujesz, tym naturalniej ją czujesz.",
                    "Mała dawka dyskomfortu dziennie — jedna rozmowa lub sytuacja poza strefą komfortu.",
                    "Zadbaj o ciało i wygląd — sylwetka, fryzura, ubranie wpływają na to, jak się czujesz.",
                    "Autodialog — mów do siebie jak do kogoś, komu kibicujesz, nie jak najgorszy krytyk.",
                    "Przygotowanie — kilka tematów i historii w zanadrzu zdejmuje stres rozmowy.",
                ], tint: "var(--amber)" })),
        React.createElement(Fold, { icon: Check, tint: "var(--green2)", title: "Bycie lubianym" },
            React.createElement(Bullets, { items: [
                    "Szczera ciekawość — pytaj o ludzi i dopytuj; bądź zainteresowany, nie interesujący.",
                    "Spraw, by druga osoba czuła się ważna — to zapamiętuje się najdłużej.",
                    "Zapamiętuj imiona i detale i wracaj do nich następnym razem.",
                    "Ciepło i kompetencja — to dwie osie sympatii; pokaż obie.",
                    "Daj, zanim weźmiesz — pomoc, uznanie, uwaga; ludzie się odwzajemniają.",
                ] })),
        React.createElement(Fold, { icon: Lightbulb, tint: "var(--gold)", title: "Humor i lekko\u015B\u0107" },
            React.createElement(Bullets, { items: [
                    "Rodzaje humoru — obserwacyjny, callback (wracanie do wcześniejszego żartu), lekkie przekomarzanie, autoironia z umiarem, zaskakująca puenta.",
                    "Czytaj salę i timing — ten sam żart w złym momencie nie działa.",
                    "Nie cisnij — najlepszy humor jest swobodny; baw się rozmową, nie „występuj”.",
                    "Opowiadaj historie z barwą — detale, emocje, mała puenta na końcu.",
                    "Lekkość i dystans do siebie przyciągają bardziej niż perfekcja.",
                ], tint: "var(--gold)" })),
        React.createElement(Fold, { icon: Target, tint: "var(--red)", title: "Cz\u0142owiek, kt\u00F3rego pragnie towarzystwo" },
            React.createElement(Bullets, { items: [
                    "Bądź źródłem dobrych emocji — ludzie wracają tam, gdzie czują się ze sobą dobrze.",
                    "Mindset obfitości — nie potrzebujesz akceptacji każdego; to paradoksalnie przyciąga.",
                    "Nieprzywiązanie do wyniku — rozmawiaj dla samej rozmowy, bez wyczekiwania na efekt.",
                    "Niezawodność i energia — bądź tym, na kim można polegać i z kim po prostu jest dobrze.",
                ], tint: "var(--red)" })),
        React.createElement(Fold, { icon: Quote, tint: "var(--blue)", title: "Praca z pod\u015Bwiadomo\u015Bci\u0105" },
            React.createElement(Bullets, { items: [
                    "Wizualizacja i próba mentalna — jak aktorzy i sportowcy, w głowie przećwicz scenę (rozmowę, wystąpienie), zanim się wydarzy.",
                    "Obraz siebie — zmień to, jak siebie widzisz, a zachowanie pójdzie za tym.",
                    "„Act as if” — wcielaj się w pewną siebie wersję siebie, aż stanie się naturalna.",
                    "Afirmacje i priming rano (masz je w zakładce Dziś) ustawiają nastawienie na cały dzień.",
                    "Reframing — stres przed rozmową potraktuj jako ekscytację i gotowość, nie zagrożenie.",
                ], tint: "var(--blue)" })),
        React.createElement(Fold, { icon: Sun, tint: "var(--green2)", title: "Codzienna rutyna charyzmy" },
            React.createElement(Bullets, { items: [
                    "Rano — 2 minuty wizualizacji plus afirmacja (zakładka Dziś).",
                    "W ciągu dnia — jedna rozmowa z nieznajomym albo jeden szczery komplement.",
                    "Wieczorem — zapisz jeden „social win” z dnia (co poszło dobrze).",
                    "Co tydzień — jedna sytuacja mocno poza strefą komfortu (rozmowa, scena, wystąpienie).",
                ] })),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", textAlign: "center", margin: "14px 4px 4px", lineHeight: 1.5 } }, "Oparte na psychologii spo\u0142ecznej, sztuce aktorskiej i technikach wyst\u0105pie\u0144 \u2014 prawdziwa charyzma to warto\u015B\u0107 dla innych, nie manipulacja."),
        React.createElement("div", { style: sectionTitle }, "\u26A1 Rutyna Charyzmy \u2014 codzienna 15 min"),
        React.createElement(Card, { style: { background: "rgba(94,229,146,.07)", border: "1px solid rgba(94,229,146,.22)" } },
            React.createElement("div", { style: { fontSize: 13, lineHeight: 1.75 } },
                React.createElement("b", { style: { color: "var(--green2)" } }, "Rano (5 min):"),
                React.createElement("br", null),
                "\u2022 Afirmacja + wizualizacja: zamknij oczy, wyobra\u017A sobie 1 trudn\u0105 rozmow\u0119 \u2014 i \u017Ce idzie \u015Bwietnie.",
                React.createElement("br", null),
                "\u2022 \"Act as if\" \u2014 wyjd\u017A z postaw\u0105 osoby, kt\u00F3r\u0105 chcesz by\u0107.",
                React.createElement("br", null),
                React.createElement("br", null),
                React.createElement("b", { style: { color: "var(--gold)" } }, "W ci\u0105gu dnia (5 min):"),
                React.createElement("br", null),
                "\u2022 1 szczery komplement lub pytanie do kogo\u015B nowego.",
                React.createElement("br", null),
                "\u2022 Przy ka\u017Cdej rozmowie: s\u0142uchaj, zamiast czeka\u0107 na swoj\u0105 kolej.",
                React.createElement("br", null),
                React.createElement("br", null),
                React.createElement("b", { style: { color: "var(--muted)" } }, "Wiecz\u00F3r (5 min):"),
                React.createElement("br", null),
                "\u2022 Zapisz 1 \"social win\" \u2014 co posz\u0142o dobrze dzi\u015B w kontakcie z lud\u017Ami.",
                React.createElement("br", null),
                "\u2022 Opowiedz partner\u0446\u0435 histori\u0119 z point\u0105 \u2014 trening storytellingu.")),
        React.createElement("div", { style: sectionTitle }, "\uD83D\uDCC5 Tygodniowe wyzwania charyzmy"),
        React.createElement(Card, { style: { marginBottom: 24 } }, [["Pn", "Zagadaj do obcej osoby — zacznij od obserwacji (komentarz do sytuacji)"], ["Wt", "Użyj 'tak i…' w 3 rozmowach — nie neguj, rozwijaj"], ["Śr", "Opowiedz historię z życia z emocją i pointą"], ["Cz", "Pełna uwaga na rozmówcy cały dzień — telefon schowany"], ["Pt", "Improwizacja: rzuć temat, mów przez 1 min, zatrzymaj się na puencie"], ["Sob", "1 wartościowa rozmowa biznesowa (online/live) — bez agendy, dla relacji"], ["Ndz", "Refleksja: co poszło dobrze? Gdzie straciłeś uwagę rozmówcy?"]].map(([d, t]) => (React.createElement("div", { key: d, style: { display: "flex", gap: 10, padding: "8px 0", borderTop: d !== "Pn" ? "1px solid var(--line)" : "none" } },
            React.createElement("span", { style: { fontSize: 11, fontWeight: 800, color: "var(--faint)", minWidth: 24 } }, d),
            React.createElement("span", { style: { fontSize: 13, lineHeight: 1.45 } }, t)))))));
}
const rootBase = { background: "#07090d", minHeight: "100vh" };
/* ───────────────────────── styles ───────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
.mp-root{
  --bg:#100e13; --bg2:#17141c; --surface:#1c1822; --surface2:#251f2d;
  --line:rgba(255,255,255,.06); --line2:rgba(255,255,255,.11);
  --text:#f3eff5; --muted:#9c95a6; --faint:#645d6f;
  --green:#23c66f; --green2:#5fe39a; --green-glow:rgba(35,198,111,.4);
  --gold:#f7a83a; --gold2:#ffcf86; --red:#fb7185; --amber:#fbbf24; --blue:#7aa2ff;
  --display:'Sora',sans-serif; --body:'Hanken Grotesk',sans-serif;
  --shadow:0 8px 26px -14px rgba(0,0,0,.75), 0 1px 0 rgba(255,255,255,.045) inset;
  --radius:16px;
  font-family:var(--body); color:var(--text);
  background:
    radial-gradient(720px 480px at 50% -12%, rgba(247,168,58,.11), transparent 72%),
    radial-gradient(560px 420px at 90% 6%, rgba(122,162,255,.055), transparent 72%),
    var(--bg);
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}
*{box-sizing:border-box;}
.mp-root button{font-family:var(--body); transition:transform .12s cubic-bezier(.2,.8,.2,1), filter .15s ease, background .15s ease, color .15s ease, border-color .15s ease, box-shadow .2s ease;}
.mp-root button:active{transform:scale(.97);}
.mp-root input,.mp-root textarea,.mp-root select{transition:border-color .15s ease, background .15s ease;}
.mp-root input:focus,.mp-root textarea:focus,.mp-root select:focus{border-color:var(--gold)!important;}
.mp-root .grain{position:fixed;inset:0;pointer-events:none;z-index:1;opacity:.02;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
.noscroll::-webkit-scrollbar{display:none;}
.noscroll{-ms-overflow-style:none;scrollbar-width:none;}
@keyframes fade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}
@keyframes slideUp{from{opacity:0;transform:translateY(40px);}to{opacity:1;transform:translateY(0);}}
@keyframes pop{0%{transform:scale(.3);}100%{transform:scale(1);}}
@keyframes pulse{0%,100%{opacity:.5;}50%{opacity:1;}}
@keyframes dropIn{from{opacity:0;transform:translate(-50%,-16px);}to{opacity:1;transform:translate(-50%,0);}}

@media (min-width: 900px){
  .mp-shell{max-width:1180px !important; padding-left:236px !important; padding-bottom:48px !important;}
  .mp-content{max-width:880px; padding:0 28px !important;}
  .mp-nav{top:0 !important; bottom:0 !important; right:auto !important; left:max(0px, calc(50% - 590px)) !important; width:220px; max-width:none !important; margin:0 !important;
    grid-template-columns:1fr !important; align-content:start; gap:4px; padding:30px 12px !important; border-top:none !important; border-right:1px solid var(--line);}
  .mp-nav::before{content:"MASTER PLAN"; display:block; font-family:var(--display); font-weight:800; font-size:20px; letter-spacing:-.02em; color:var(--text); padding:0 14px 22px;}
  .mp-nav button{flex-direction:row !important; justify-content:flex-start; gap:12px !important; padding:11px 14px !important; border-radius:12px;}
  .mp-nav button span{font-size:14px !important;}
  .mp-nav button:hover{background:var(--surface) !important;}
  .mp-root .noscroll[style*="overflow-x"]{flex-wrap:wrap !important; overflow:visible !important; margin-left:0 !important; margin-right:0 !important; padding-left:0 !important; padding-right:0 !important;}
  .mp-sheet-wrap{align-items:center !important;}
  .mp-sheet{max-width:600px !important; border-radius:22px !important; border-bottom:1px solid var(--line) !important; max-height:88vh !important;}
}
input::placeholder,textarea::placeholder{color:var(--faint);}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
@media (prefers-reduced-motion: reduce){.mp-root *{animation-duration:.01ms!important;transition-duration:.01ms!important;}}

.dg-text{font-size:15px;line-height:1.62;color:var(--text);font-family:ui-serif,Georgia,"Times New Roman",serif;}
.dg-text p{margin:8px 0}
.dg-text table{font-family:var(--body)}

@media (min-width:900px){ .mp-composer{bottom:0 !important;} }
`;
/* ═══════════════ WEIGHT TREND → korekta diety ═══════════════ */
function WeightTrend({ measures, diet, setDiet, profile }) {
    const pts = (measures || []).filter((m) => m.weight > 0).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const adjust = (d) => setDiet((s) => ({ ...s, surplus: Math.round((s.surplus || 0) + d) }));
    if (pts.length < 2) {
        return (React.createElement(Card, { style: { marginTop: 12 } },
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, marginBottom: 6 } }, "Trend wagi \u2192 korekta diety"),
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 } },
                "Zapisz wag\u0119 co najmniej 2\u00D7 (w zak\u0142adce ",
                React.createElement("b", { style: { color: "var(--text)" } }, "Zdrowie & Cia\u0142o \u2192 Pomiary"),
                "), a tutaj pojawi si\u0119 tempo przyrostu i podpowied\u017A, czy zmieni\u0107 kalorie.")));
    }
    const first = pts[0], last = pts[pts.length - 1];
    const days = Math.max(1, (new Date(last.date) - new Date(first.date)) / 86400000);
    const pw = (last.weight - first.weight) / days * 7;
    let tone, msg, action = null;
    if (pw > 0.5) {
        tone = "var(--amber)";
        msg = `Rośniesz ~${pw.toFixed(2)} kg/tydz — trochę za szybko jak na czystą masę. Zbij ok. 200 kcal, żeby ograniczyć przyrost tłuszczu.`;
        action = ["− 200 kcal", () => adjust(-200)];
    }
    else if (pw < 0.1) {
        tone = "var(--blue)";
        msg = pw < -0.05 ? `Tracisz ~${Math.abs(pw).toFixed(2)} kg/tydz — to nie jest budowanie masy. Dodaj ok. 250 kcal.` : `Waga prawie stoi (${pw.toFixed(2)} kg/tydz). Dodaj ok. 200 kcal, najlepiej z węglowodanów.`;
        action = ["+ 200 kcal", () => adjust(200)];
    }
    else {
        tone = "var(--green2)";
        msg = `Tempo w sam raz (~${pw.toFixed(2)} kg/tydz) — czysta masa. Trzymaj tak dalej.`;
    }
    const ws = pts.map((p) => p.weight);
    const mn = Math.min(...ws), mx = Math.max(...ws), rng = mx - mn || 1;
    const recent = pts.slice(-12);
    return (React.createElement(Card, { style: { marginTop: 12 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 } },
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Trend wagi"),
            React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } },
                last.weight,
                " kg \u00B7 cel ",
                profile.goal,
                " kg")),
        React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 3, height: 44, marginBottom: 10 } }, recent.map((p, i) => (React.createElement("div", { key: i, title: `${p.date}: ${p.weight} kg`, style: { flex: 1, height: `${22 + ((p.weight - mn) / rng) * 78}%`, background: tone, opacity: 0.35 + 0.65 * (i / Math.max(1, recent.length - 1)), borderRadius: 3 } })))),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } },
            React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: tone } },
                pw >= 0 ? "+" : "",
                pw.toFixed(2)),
            React.createElement("span", { style: { fontSize: 12, color: "var(--muted)" } }, "kg / tydzie\u0144")),
        React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 } }, msg),
        action && (React.createElement("button", { onClick: action[1], style: { ...btnPrimary, marginTop: 12, background: "var(--surface2)", color: tone, border: `1px solid ${tone}` } },
            action[0],
            " \u00B7 nadwy\u017Cka teraz ",
            (diet.surplus || 0) >= 0 ? "+" : "",
            diet.surplus || 0,
            " kcal"))));
}
/* ═══════════════ REKORDY (PR) w treningu ═══════════════ */
const PR_LIFTS = ["Przysiad", "Wyciskanie leżąc", "Martwy ciąg", "Wyciskanie nad głowę", "Podciąganie", "Wiosłowanie"];
function PRTracker({ prs, setPrs }) {
    const [open, setOpen] = useState(false);
    const [ex, setEx] = useState(PR_LIFTS[0]);
    const [wt, setWt] = useState("");
    const [rp, setRp] = useState("");
    const list = prs || [];
    const e1rm = (w, r) => Math.round(w * (1 + r / 30));
    const add = () => {
        const w = parseFloat(wt), r = parseInt(rp);
        if (!(w > 0) || !(r > 0))
            return;
        const p = (n) => String(n).padStart(2, "0");
        const d = new Date();
        const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        setPrs((s) => [{ id: uid(), ex, weight: w, reps: r, date }, ...(s || [])]);
        setWt("");
        setRp("");
        setOpen(false);
        buzz(12);
    };
    const byEx = {};
    list.forEach((p) => { (byEx[p.ex] = byEx[p.ex] || []).push(p); });
    const exWith = Object.keys(byEx);
    return (React.createElement(Card, { style: { marginTop: 14 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (open || exWith.length) ? 12 : 0 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement(Target, { size: 16, color: "var(--gold2)" }),
                React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Rekordy (PR)")),
            React.createElement("button", { onClick: () => setOpen((v) => !v), style: { ...iconBtn, width: "auto", padding: "0 12px", fontSize: 12.5, fontWeight: 700, color: "var(--green2)" } }, open ? "Zamknij" : "+ Wynik")),
        open && (React.createElement("div", { style: { marginBottom: exWith.length ? 14 : 0 } },
            React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 } }, PR_LIFTS.map((l) => React.createElement("button", { key: l, onClick: () => setEx(l), style: { padding: "7px 11px", borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: ex === l ? "1.5px solid var(--gold2)" : "1px solid var(--line2)", background: ex === l ? "rgba(245,181,61,.12)" : "var(--surface2)", color: ex === l ? "var(--gold2)" : "var(--muted)" } }, l))),
            React.createElement("div", { style: { display: "flex", gap: 8 } },
                React.createElement("input", { value: wt, onChange: (e) => setWt(e.target.value), inputMode: "decimal", placeholder: "kg", style: { ...inputStyle, flex: 1 } }),
                React.createElement("input", { value: rp, onChange: (e) => setRp(e.target.value), inputMode: "numeric", placeholder: "powt.", style: { ...inputStyle, flex: 1 } }),
                React.createElement("button", { onClick: add, style: { ...btnPrimary, marginTop: 0, width: "auto", padding: "0 20px" } }, "OK")))),
        exWith.length === 0 ? (!open && React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 12 } }, "Zapisuj najlepsze serie (przysiad, wyciskanie, martwy ci\u0105g\u2026) i \u015Bled\u017A, jak ro\u015Bnie si\u0142a. Na masie to najlepszy dow\u00F3d, \u017Ce jedzenie idzie w mi\u0119\u015Bnie, nie w t\u0142uszcz.")) : (exWith.map((name) => {
            const arr = byEx[name].slice().sort((a, b) => (a.date < b.date ? -1 : 1));
            const best = arr.reduce((m, p) => (e1rm(p.weight, p.reps) > e1rm(m.weight, m.reps) ? p : m), arr[0]);
            const lastP = arr[arr.length - 1];
            const up = e1rm(lastP.weight, lastP.reps) - e1rm(arr[0].weight, arr[0].reps);
            return (React.createElement("div", { key: name, style: { padding: "11px 0", borderTop: "1px solid var(--line)" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } },
                    React.createElement("span", { style: { fontSize: 14, fontWeight: 700 } }, name),
                    React.createElement("span", { style: { fontSize: 12, color: up > 0 ? "var(--green2)" : "var(--muted)" } }, up > 0 ? `▲ +${up} kg 1RM` : (arr.length > 1 ? "bez zmian" : "nowy"))),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 3 } },
                    "Rekord: ",
                    React.createElement("b", { style: { color: "var(--gold2)" } },
                        best.weight,
                        " kg \u00D7 ",
                        best.reps),
                    " (~",
                    e1rm(best.weight, best.reps),
                    " kg 1RM) \u00B7 ostatnio ",
                    lastP.weight,
                    "\u00D7",
                    lastP.reps)));
        }))));
}
/* ═══════════════ ZDJĘCIA SYLWETKI ═══════════════ */
function PhotoTimeline({ photos, setPhotos }) {
    const [view, setView] = useState(null);
    const list = (photos || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const inputRef = useRef(null);
    const store1 = (data) => { const p = (n) => String(n).padStart(2, "0"); const d = new Date(); const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; setPhotos((s) => [{ id: uid(), date, data }, ...(s || [])]); buzz(10); };
    const onFile = (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file)
            return;
        const reader = new FileReader();
        reader.onerror = () => alert("Nie udało się odczytać pliku. Spróbuj inne zdjęcie.");
        reader.onload = (ev) => {
            const raw = ev.target.result;
            try {
                const img = new Image();
                img.onerror = () => store1(raw);
                img.onload = () => {
                    try {
                        const max = 900;
                        let w = img.width || max, h = img.height || max;
                        if (w > h && w > max) {
                            h = Math.round(h * max / w);
                            w = max;
                        }
                        else if (h > max) {
                            w = Math.round(w * max / h);
                            h = max;
                        }
                        const cv = document.createElement("canvas");
                        cv.width = w;
                        cv.height = h;
                        cv.getContext("2d").drawImage(img, 0, 0, w, h);
                        store1(cv.toDataURL("image/jpeg", 0.7));
                    }
                    catch (err) {
                        store1(raw);
                    }
                };
                img.src = raw;
            }
            catch (err) {
                store1(raw);
            }
        };
        reader.readAsDataURL(file);
    };
    const del = (id) => { setPhotos((s) => (s || []).filter((x) => x.id !== id)); setView(null); };
    return (React.createElement("div", null,
        React.createElement(Card, { style: { textAlign: "center" } },
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, marginBottom: 4 } }, "Zdj\u0119cia sylwetki"),
            React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 } }, "R\u00F3b zdj\u0119cie co 1\u20132 tygodnie w tym samym \u015Bwietle i pozie. Lustro poka\u017Ce rekompozycj\u0119 lepiej ni\u017C sama waga. Zdj\u0119cia zostaj\u0105 tylko na Twoim telefonie."),
            React.createElement("button", { onClick: () => inputRef.current && inputRef.current.click(), style: { ...btnPrimary, display: "inline-block", cursor: "pointer", padding: "12px 22px", width: "auto" } }, "+ Dodaj zdj\u0119cie"),
            React.createElement("input", { ref: inputRef, type: "file", accept: "image/*", onChange: onFile, style: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", border: 0, padding: 0, left: "-9999px" } })),
        list.length > 0 && (React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 } }, list.map((ph) => (React.createElement("button", { key: ph.id, onClick: () => setView(ph), style: { padding: 0, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "var(--surface)", aspectRatio: "3 / 4" } },
            React.createElement("img", { src: ph.data, alt: ph.date, style: { width: "100%", height: "100%", objectFit: "cover", display: "block" } })))))),
        React.createElement(Sheet, { open: !!view, onClose: () => setView(null), title: view ? view.date : "" }, view && (React.createElement("div", null,
            React.createElement("img", { src: view.data, alt: view.date, style: { width: "100%", borderRadius: 14, display: "block" } }),
            React.createElement("button", { onClick: () => del(view.id), style: { ...btnPrimary, marginTop: 14, background: "rgba(248,113,113,.12)", color: "var(--red)", border: "1px solid rgba(248,113,113,.3)" } }, "Usu\u0144 zdj\u0119cie"))))));
}
/* ═══════════════ PRZEGLĄD TYGODNIA ═══════════════ */
function WeeklyReview({ daily, habits, measures, finance, weekFocus, setWeekFocus, profile }) {
    const [txt, setTxt] = useState("");
    const pad2 = (n) => String(n).padStart(2, "0");
    const keyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push(keyOf(d));
    }
    const habTot = habits.length;
    const habPcts = days.map((k) => { const dv = daily[k]; if (!dv || !dv.habits)
        return null; return habTot ? habits.filter((h) => dv.habits[h.id]).length / habTot : 0; }).filter((v) => v != null);
    const habAvg = habPcts.length ? Math.round(habPcts.reduce((a, b) => a + b, 0) / habPcts.length * 100) : 0;
    const trainDays = days.filter((k) => daily[k] && daily[k].workoutDone).length;
    const loggedDays = days.filter((k) => daily[k]).length;
    const pts = (measures || []).filter((m) => m.weight > 0).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    let wRate = null, wLast = null;
    if (pts.length >= 2) {
        const f = pts[0], l = pts[pts.length - 1];
        wLast = l.weight;
        const dd = Math.max(1, (new Date(l.date) - new Date(f.date)) / 86400000);
        wRate = (l.weight - f.weight) / dd * 7;
    }
    const weekSet = new Set(days);
    const weekSpent = (finance.tx || []).filter((t) => t.type === "expense" && weekSet.has((t.date || "").slice(0, 10))).reduce((a, b) => a + b.amount, 0);
    const month = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`;
    const monSpent = (finance.tx || []).filter((t) => t.type === "expense" && (t.date || "").slice(0, 7) === month).reduce((a, b) => a + b.amount, 0);
    const budget = (finance.cats || []).reduce((a, c) => a + Math.round((finance.capital || 0) * (c.pct || 0) / 100), 0);
    const focus = weekFocus || [];
    const addF = () => { const t = txt.trim(); if (!t || focus.length >= 3)
        return; setWeekFocus((s) => [...(s || []), { id: uid(), text: t, done: false }]); setTxt(""); buzz(8); };
    const toggleF = (id) => setWeekFocus((s) => (s || []).map((f) => (f.id === id ? { ...f, done: !f.done } : f)));
    const delF = (id) => setWeekFocus((s) => (s || []).filter((f) => f.id !== id));
    const verdict = habAvg >= 80 && trainDays >= 3 ? "Mocny tydzień 🔥" : habAvg >= 55 ? "Solidny tydzień, jest co podkręcić" : "Słabszy tydzień — reset zaczyna się teraz";
    const Metric = ({ label, value, sub, color }) => (React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 12px" } },
        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: color || "var(--text)" } }, value),
        React.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginTop: 2 } }, label),
        sub && React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 1 } }, sub)));
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26 } },
            React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Przegl\u0105d tygodnia"),
            React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } },
                "Ostatnie 7 dni \u00B7 ",
                verdict)),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 } },
            React.createElement(Metric, { label: "Nawyki (\u015Brednia)", value: `${habAvg}%`, sub: `${loggedDays}/7 dni z wpisem`, color: habAvg >= 70 ? "var(--green2)" : "var(--amber)" }),
            React.createElement(Metric, { label: "Treningi", value: `${trainDays}`, sub: "cel ~3/tydz", color: trainDays >= 3 ? "var(--green2)" : "var(--amber)" }),
            React.createElement(Metric, { label: "Trend wagi", value: wRate == null ? "—" : `${wRate >= 0 ? "+" : ""}${wRate.toFixed(2)}`, sub: wRate == null ? "zapisz 2× wagę" : `kg/tydz · ${wLast} kg`, color: wRate == null ? "var(--muted)" : (wRate > 0.5 ? "var(--amber)" : wRate < 0.1 ? "var(--blue)" : "var(--green2)") }),
            React.createElement(Metric, { label: "Wydatki (7 dni)", value: eur(weekSpent), sub: budget ? `mies. ${eur(monSpent)} / ${eur(budget)}` : "—", color: "var(--text)" })),
        React.createElement("div", { style: sectionTitle }, "Priorytety na nowy tydzie\u0144"),
        React.createElement(Card, null,
            focus.length === 0 && React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 } }, "Wybierz 1\u20133 rzeczy, na kt\u00F3rych skupisz si\u0119 w nadchodz\u0105cym tygodniu. Ma\u0142o = realne do zrobienia."),
            focus.map((f) => (React.createElement("div", { key: f.id, style: { display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: "1px solid var(--line)" } },
                React.createElement("button", { onClick: () => toggleF(f.id), style: { background: "transparent", border: "none", cursor: "pointer", padding: 0 } },
                    React.createElement(CheckBox, { on: f.done })),
                React.createElement("span", { style: { flex: 1, fontSize: 14, color: f.done ? "var(--muted)" : "var(--text)", textDecoration: f.done ? "line-through" : "none" } }, f.text),
                React.createElement("button", { onClick: () => delF(f.id), style: { ...iconBtn, width: 28, height: 28, border: "none", background: "transparent", color: "var(--faint)" } },
                    React.createElement(X, { size: 15 }))))),
            focus.length < 3 && (React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
                React.createElement("input", { value: txt, onChange: (e) => setTxt(e.target.value), onKeyDown: (e) => e.key === "Enter" && addF(), placeholder: "np. 4 treningi, 0 fast food\u00F3w", style: { ...inputStyle, flex: 1 } }),
                React.createElement("button", { onClick: addF, style: { ...btnPrimary, marginTop: 0, width: "auto", padding: "0 18px" } }, "Dodaj")))),
        React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 12, lineHeight: 1.5, padding: "0 2px" } }, "Wskaz\u00F3wka: r\u00F3b przegl\u0105d w niedziel\u0119 wieczorem. 2 minuty refleksji = lepszy start w tydzie\u0144 ni\u017C jakakolwiek apka.")));
}
/* ═══════════════ DRUGA GŁOWA — agent nad całą aplikacją ═══════════════ */
function Looksmax() {
    const ROI = [
        ["Leanność + postawa", "Niski poziom tłuszczu rzeźbi szczękę i rysy; wyprostowana sylwetka zmienia wszystko od progu."],
        ["Skóra (SPF!)", "Czysta cera i ochrona przed słońcem to największa dźwignia na lata — codziennie, też zimą."],
        ["Szyja & kaptury", "Gruba szyja = męska, mocna sylwetka. Najbardziej niedoceniany trening."],
        ["Włosy & zarost", "Dobre cięcie pod kształt twarzy i zadbany zarost robią ogromną różnicę."],
        ["Sen & nawodnienie", "7–9 h snu i woda — regeneracja skóry, jędrność, brak podkrążonych oczu."],
    ];
    const BLOCKS = [
        { e: "🌅", n: "Rano (AM)", c: "245,181,61", items: [
                "Zimna woda na twarz — obkurcza, budzi, redukuje opuchliznę.",
                "Niacynamid (serum) — reguluje sebum, wygładza, działa na przebarwienia.",
                "SPF 30–50 KAŻDEGO dnia — absolutna baza anti-aging i na przebarwienia.",
                "Włosy: tekstura do przodu, mocny chwyt (Got2b Glued).",
                "Postawa od progu: barki w tył, klatka otwarta, głowa prosto.",
            ] },
        { e: "🌙", n: "Wieczór (PM)", c: "91,140,255", items: [
                "Oczyszczenie twarzy — zmyj sebum, brud i SPF z całego dnia.",
                "Kwas azelainowy 10–20% — Twój sojusznik na oily skin i przebarwienia.",
                "Lekki nawilżacz — nie przesuszaj skóry, bo odbije większym sebum.",
                "Mewing przed snem + 5 min chin tucki / rozciąganie karku.",
                "7–9 h snu — wtedy regeneruje się skóra i rośnie testosteron.",
            ] },
        { e: "🔒", n: "Codziennie 24/7 (lock in)", c: "35,198,111", items: [
                "Mewing — język na podniebieniu, zęby lekko razem, oddech nosem. Cały dzień.",
                "Chin tuck co godzinę — przeciw głowie wysuniętej od telefonu.",
                "Telefon na wysokości oczu, nie patrz w dół.",
                "Woda 2,5–3 l — cera, energia, jędrność.",
                "Trzymaj niski poziom tłuszczu — bf nisko = ostre rysy.",
            ] },
        { e: "🧴", n: "Skóra (oily + przebarwienia)", c: "236,72,153", items: [
                "Baza: azelainowy 10–20% + niacynamid + SPF. Prosto i konsekwentnie.",
                "Nie dłub i nie wyciskaj — to robi przebarwienia i blizny.",
                "Wprowadzaj jeden nowy produkt na raz, obserwuj 2–3 tyg.",
                "Uporczywe przebarwienia/trądzik → dermatolog (retinoidy na receptę).",
            ], tip: "SPF to większość efektu na przebarwienia. Bez niego reszta to walka pod górę." },
        { e: "💪", n: "Szyja & szczęka", c: "248,113,113", items: [
                "Trening szyji 2–3×/tydz — zakładka Trening, grupa „Szyja & kark”.",
                "Mewing buduje linię szczęki w długim terminie.",
                "Żucie (twarda guma, marchew) z umiarem — angażuje żwacze.",
                "Niski poziom tłuszczu odsłania szczękę bardziej niż cokolwiek innego.",
            ] },
        { e: "💇", n: "Włosy & zarost", c: "251,146,60", items: [
                "Twarz podłużna + wysokie czoło: tekstura z grzywką do przodu > sleek back.",
                "Produkt z mocnym chwytem (Got2b Glued), nie przeciążaj ilością.",
                "Strzyżenie co 3–4 tyg trzyma kształt.",
                "Zarost: definiuj linię, równo przycinaj — porządek > długość.",
            ] },
        { e: "☀️", n: "Sen, słońce, regeneracja", c: "250,204,21", items: [
                "7–9 h snu to fundament wyglądu — skóra, oczy, hormony.",
                "Światło dzienne rano — rytm dobowy, lepsza cera i nastrój.",
                "Ogranicz cukier i alkohol — napuchnięta, szara cera to ich wina.",
                "Ruch i pot — krążenie i czystsza skóra.",
            ] },
    ];
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26 } },
            React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 28, fontWeight: 800, letterSpacing: "-.03em" } }, "Looksmax \uD83D\uDC8E"),
            React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 4, lineHeight: 1.5 } }, "Maksymalizujesz to, co masz. Genetyka to baza \u2014 reszta to grind: sk\u00F3ra, postawa, forma, szyja, sen. Bez ryzykownych skr\u00F3t\u00F3w.")),
        React.createElement("div", { style: sectionTitle }, "Gdzie jest najwi\u0119kszy zwrot"),
        React.createElement(Card, null, ROI.map((r, i) => (React.createElement("div", { key: r[0], style: { display: "flex", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none" } },
            React.createElement("div", { style: { width: 26, height: 26, borderRadius: 8, background: "rgba(236,72,153,.15)", color: "#ec4899", display: "grid", placeItems: "center", fontFamily: "var(--display)", fontWeight: 800, fontSize: 14, flexShrink: 0 } }, i + 1),
            React.createElement("div", { style: { flex: 1 } },
                React.createElement("div", { style: { fontWeight: 700, fontSize: 13.5 } }, r[0]),
                React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.45 } }, r[1])))))),
        React.createElement("div", { style: sectionTitle }, "Rutyna"),
        BLOCKS.map((b) => (React.createElement(Card, { key: b.n, style: { marginBottom: 11 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 11, marginBottom: 10 } },
                React.createElement("div", { style: { width: 38, height: 38, borderRadius: 11, background: `rgba(${b.c},.15)`, display: "grid", placeItems: "center", fontSize: 19 } }, b.e),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15.5, color: `rgb(${b.c})` } }, b.n)),
            b.items.map((it, i) => (React.createElement("div", { key: i, style: { display: "flex", gap: 9, padding: "5px 0", fontSize: 13, lineHeight: 1.5 } },
                React.createElement("span", { style: { color: `rgb(${b.c})`, flexShrink: 0 } }, "\u2022"),
                React.createElement("span", { style: { color: "var(--text)" } }, it)))),
            b.tip && React.createElement("div", { style: { marginTop: 9, padding: "9px 11px", borderRadius: 11, background: "rgba(245,181,61,.08)", border: "1px solid rgba(245,181,61,.2)", fontSize: 12, color: "var(--gold2)", lineHeight: 1.45 } },
                "\uD83D\uDCA1 ",
                b.tip)))),
        React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", textAlign: "center", margin: "10px 6px 24px", lineHeight: 1.5 } }, "Looksmax = higiena, sk\u00F3ra, postawa, forma i sen \u2014 codziennie, w trybie lock in. Trzymaj si\u0119 rzeczy zdrowych i sprawdzonych; przy zabiegach medycznych lub uporczywych problemach sk\u00F3ry skonsultuj si\u0119 ze specjalist\u0105. To nie porada medyczna.")));
}
const BP_SECTIONS = [
    { id: "exec", n: "1. Streszczenie wykonawcze", g: "Jedna strona esencji: co robisz, dla kogo, jaki problem rozwiazujesz, jak zarabiasz, trakcja, cel na 12-24 mies. i czego potrzebujesz (jesli szukasz finansowania). Pisz NA KONCU, gdy reszta jest gotowa." },
    { id: "firma", n: "2. Opis firmy", g: "Misja i wizja, forma prawna (JDG / sp. z o.o. / eenmanszaak), lokalizacja i rynek dzialania, etap (pomysl / MVP / pierwsi klienci), wlasciciel i kompetencje, dotychczasowe osiagniecia." },
    { id: "produkt", n: "3. Produkt / usluga", g: "Problem klienta → Twoje rozwiazanie → dlaczego lepsze (przewaga: cena, prostota, nisza, AI). Co dziala DZIS, a co w roadmapie. Dla SkupOS: przyjecia, cennik, magazyn, dokumenty PCC-4, panel klienta, AI." },
    { id: "rynek", n: "4. Analiza rynku", g: "Wielkosc rynku: TAM (caly), SAM (osiagalny), SOM (realny na 1-3 lata) — np. liczba skupow zlomu w Polsce x cena rocznie. Trendy: digitalizacja, BDO, e-faktury KSeF. Klient docelowy: kto decyduje, ile placi, jak kupuje." },
    { id: "konkurencja", n: "5. Konkurencja", g: "Konkurenci bezposredni (np. Recirculo) i posredni (Excel, zeszyt, programy ksiegowe). Tabela: cena / funkcje / slabosci. Twoje pozycjonowanie: dlaczego wybiora Ciebie. Krotki SWOT (silne, slabe, szanse, zagrozenia)." },
    { id: "model", n: "6. Model biznesowy", g: "Jak zarabiasz: abonament miesieczny (progi cenowe w PLN), oplata wdrozeniowa, dodatki. Unit economics: koszt pozyskania klienta (CAC), wartosc klienta w czasie (LTV), marza. Zdrowo: LTV > 3x CAC." },
    { id: "marketing", n: "7. Marketing i sprzedaz", g: "Jak klient Cie znajdzie: D2D po skupach, cold call, grupy branzowe, polecenia, Google. Lejek: kontakt → demo → trial → platnosc, z liczbami. Plan na pierwszych 10 klientow. Kto sprzedaje i ile godzin tygodniowo." },
    { id: "operacje", n: "8. Plan operacyjny", g: "Jak firma dziala na co dzien: technologia (stack, hosting, koszty/mies), wdrozenia klientow, wsparcie (kanal, czas reakcji), bezpieczenstwo danych i RODO. Co robisz sam, co kupujesz na zewnatrz." },
    { id: "zespol", n: "9. Zespol", g: "Kto tworzy firme i jakie ma kompetencje (produkt, kod, sprzedaz). Czego brakuje i kiedy to uzupelnisz (kontraktor, wspolnik). Na start solo: pokaz, ze laczysz budowe produktu ze sprzedaza, a reszte kupujesz." },
    { id: "finanse", n: "10. Plan finansowy", g: "Prognoza 12-36 mies.: przychody (liczba klientow x cena), koszty stale i zmienne, prog rentownosci (break-even), potrzebna gotowka do tego momentu (runway). Trzy scenariusze: pesymistyczny / realny / optymistyczny." },
    { id: "ryzyko", n: "11. Analiza ryzyka", g: "Top 5 ryzyk (wolna sprzedaz, churn, konkurent, regulacje, zalezosc od jednej osoby) + plan ograniczenia kazdego. Banki i inwestorzy czytaja to uwaznie — pokazuje dojrzalosc." },
    { id: "kamienie", n: "12. Kamienie milowe", g: "Harmonogram z datami: gotowy produkt → pierwszy placacy klient → 10 klientow → break-even → skalowanie / sprzedaz firmy. Mierzalne cele z terminami. To Twoj plan egzekucji." },
];
const GS_SEED = {
  vision3: "",
  why: "",
  goals: [
    { id: "g1", t: "\u015Arednio 100 000 z\u0142/mies. przychodu w X\u2013XII 2027", lag: "Przych\xF3d z\u0142/mies. (Cel 100k)", lead: "Telefony do skup\xF3w", target: 20, src: "calls", ob: "Po zmianie nie chce mi si\u0119 dzwoni\u0107, odk\u0142adam na \u201Ejutro\u201D", plan: "Je\u015Bli mam wolne albo popo\u0142udni\xF3wk\u0119, to o 8:00 siadam z kaw\u0105 i robi\u0119 10 telefon\xF3w, zanim otworz\u0119 cokolwiek innego." },
    { id: "g2", t: "500 tys. $ finansowania prop i regularne wyp\u0142aty", lag: "Finansowanie $ i wyp\u0142aty", lead: "Trade'y w pe\u0142ni z planu (checklista 6/6)", target: 2, src: "manual", ob: "Wchodz\u0119 impulsywnie na widok wybicia", plan: "Je\u015Bli widz\u0119 wybicie bez zapisanego planu, to zamykam wykres i zapisuj\u0119 plan na nast\u0119pn\u0105 \u015Bwiec\u0119 HTF." },
    { id: "g3", t: "Masa ok. 88 kg na czysto i si\u0142a na PPL", lag: "Waga i rekordy", lead: "Treningi PPL", target: 4, src: "train", ob: "Po nocce odpuszczam trening", plan: "Je\u015Bli jestem po nocce, to robi\u0119 skr\xF3cony trening 30 min albo mobilno\u015B\u0107, zamiast nic." }
  ],
  cycle: { start: "", tactics: [], done: {} },
  leadVal: {},
  reviews: {}
};
const GS_TACTICS = [
  { t: "20 telefon\xF3w do skup\xF3w", w: 0 },
  { t: "4 treningi PPL", w: 0 },
  { t: "Przegl\u0105d tygodnia (niedziela, 20 min)", w: 0 },
  { t: "Raport tygodnia wys\u0142any zaufanej osobie", w: 0 },
  { t: "Lista 100 skup\xF3w z BDO z telefonami", w: 1 },
  { t: "Skrypt rozmowy + oferta 449 z\u0142 + odpowiedzi na 5 obiekcji", w: 1 },
  { t: "Pierwsze 5 prezentacji SkupOS", w: 2 },
  { t: "Pierwszy p\u0142ac\u0105cy skup", w: 3 },
  { t: "3 p\u0142ac\u0105ce skupy", w: 6 },
  { t: "Program polece\u0144 gotowy", w: 8 },
  { t: "10 klient\xF3w SkupOS", w: 12 }
];
const gsMon = (d) => {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x;
};
const gsWeekNo = (start) => {
  if (!start) return 0;
  const s = gsMon(/* @__PURE__ */ new Date(start + "T12:00:00"));
  const n = gsMon(/* @__PURE__ */ new Date());
  return Math.floor((n - s) / (7 * 864e5)) + 1;
};
const gsWeekKeys = (wkStartDate) => {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(wkStartDate);
    d.setDate(d.getDate() + i);
    out.push(keyOf(d));
  }
  return out;
};
function gsLeadThisWeek(goal, gs) {
  const keys = gsWeekKeys(gsMon(/* @__PURE__ */ new Date()));
  if (goal.src === "calls") {
    const c = goalStore.v.calls || {};
    return keys.reduce((s, k) => s + (c[k] || 0), 0);
  }
  if (goal.src === "train") {
    const d = lsJSON("mp_daily_v4", {});
    return keys.filter((k) => d[k] && d[k].workoutDone).length;
  }
  return ((gs.leadVal || {})[goal.id] || {})[keys[0]] || 0;
}
function gsScore(gs, w) {
  const tac = (gs.cycle.tactics || []).filter((t) => t.w === 0 || t.w === w);
  if (!tac.length) return null;
  const dn = tac.filter((t) => ((gs.cycle.done || {})["w" + w] || {})[t.id]).length;
  return { pct: Math.round(dn / tac.length * 100), dn, n: tac.length, tac };
}
function GoalSystem({ bizplan, setBizplan }) {
  const gs = { ...GS_SEED, ...bizplan.gs || {}, cycle: { ...GS_SEED.cycle, ...(bizplan.gs || {}).cycle || {} } };
  const setGs = (fn) => setBizplan((p) => {
    const cur2 = { ...GS_SEED, ...p.gs || {}, cycle: { ...GS_SEED.cycle, ...(p.gs || {}).cycle || {} } };
    return { ...p, gs: typeof fn === "function" ? fn(cur2) : { ...cur2, ...fn } };
  });
  const [seg, setSeg] = useState("rok");
  const [nt, setNt] = useState("");
  const [nw, setNw] = useState("0");
  const [copied, setCopied] = useState(false);
  const w = gsWeekNo(gs.cycle.start);
  const cur = w >= 1 && w <= 12 ? gsScore(gs, w) : null;
  const ta = { ...inputStyle, width: "100%", minHeight: 64, resize: "vertical", lineHeight: 1.5, fontFamily: "var(--body)", fontSize: 13 };
  const sm = { ...inputStyle, padding: "8px 10px", fontSize: 13 };
  const setGoal = (id, patch) => setGs((g) => ({ ...g, goals: g.goals.map((x) => x.id === id ? { ...x, ...patch } : x) }));
  const startCycle = () => {
    const mon = gsMon(/* @__PURE__ */ new Date());
    if ((/* @__PURE__ */ new Date()).getDay() !== 1) mon.setDate(mon.getDate() + 7);
    setGs((g) => ({ ...g, cycle: { start: keyOf(mon), tactics: g.cycle.tactics && g.cycle.tactics.length ? g.cycle.tactics : GS_TACTICS.map((t) => ({ id: uid(), ...t })), done: {} } }));
    buzz(12);
  };
  const toggle = (tid) => {
    setGs((g) => {
      const k = "w" + w;
      const d = { ...g.cycle.done || {} };
      d[k] = { ...d[k] || {}, [tid]: !(d[k] || {})[tid] };
      return { ...g, cycle: { ...g.cycle, done: d } };
    });
    buzz(6);
  };
  const addTac = () => {
    if (!nt.trim()) return;
    setGs((g) => ({ ...g, cycle: { ...g.cycle, tactics: [...g.cycle.tactics || [], { id: uid(), t: nt.trim(), w: Math.max(0, Math.min(12, parseInt(nw) || 0)) }] } }));
    setNt("");
  };
  const delTac = (id) => setGs((g) => ({ ...g, cycle: { ...g.cycle, tactics: g.cycle.tactics.filter((t) => t.id !== id) } }));
  const wkKey = keyOf(gsMon(/* @__PURE__ */ new Date()));
  const rv = (gs.reviews || {})[wkKey] || {};
  const setRv = (patch) => setGs((g) => ({ ...g, reviews: { ...g.reviews || {}, [wkKey]: { ...(g.reviews || {})[wkKey] || {}, ...patch } } }));
  const report = () => {
    const L = [`RAPORT TYGODNIA (${wkKey})`, cur ? `Wynik wykonania: ${cur.pct}% (${cur.dn}/${cur.n}) \u2014 cel 85%` : "", ...gs.goals.map((g) => `\u2022 ${g.lead}: ${gsLeadThisWeek(g, gs)}/${g.target}`), rv.win ? `Wygrana: ${rv.win}` : "", rv.miss ? `Nie wysz\u0142o: ${rv.miss}` : "", rv.fix ? `Zmiana na przysz\u0142y tydzie\u0144: ${rv.fix}` : ""].filter(Boolean).join("\n");
    try {
      navigator.clipboard.writeText(L);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
    }
    if (navigator.share) navigator.share({ text: L }).catch(() => {
    });
  };
  const segBtn = (k, l) => /* @__PURE__ */ React.createElement("button", { key: k, onClick: () => setSeg(k), style: { flex: 1, padding: "9px 4px", borderRadius: 10, border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: seg === k ? "var(--gold)" : "transparent", color: seg === k ? "#1a1200" : "var(--muted)" } }, l);
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 12, background: "linear-gradient(135deg, rgba(245,181,61,.10), var(--surface))", border: "1px solid rgba(245,181,61,.35)" }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 } }, /* @__PURE__ */ React.createElement("b", { style: { color: "var(--text)" } }, "Jak to dzia\u0142a:"), " wizja na 3 lata \u2192 ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--text)" } }, "maks. 3 cele na rok"), " (ka\u017Cdy z miernikiem wyniku i miernikiem dzia\u0142ania) \u2192 plan na ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--text)" } }, "12 tygodni"), " \u2192 co tydzie\u0144 wynik wykonania (cel ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--text)" } }, "85%"), ") i raport do zaufanej osoby.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 13, padding: 4, marginTop: 12 } }, segBtn("rok", "1 \xB7 Rok"), segBtn("12t", "2 \xB7 12 tygodni"), segBtn("tydz", "3 \xB7 Tydzie\u0144")), seg === "rok" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Wizja \u2014 31.12.2029"), /* @__PURE__ */ React.createElement(Card, { pad: 14 }, /* @__PURE__ */ React.createElement("textarea", { value: gs.vision3, onChange: (e) => setGs({ vision3: e.target.value }), placeholder: "Jak wygl\u0105da twoje \u017Cycie za 3 lata? Liczby: przych\xF3d, firma, cia\u0142o, rodzina, gdzie mieszkasz.", style: ta }), /* @__PURE__ */ React.createElement("textarea", { value: gs.why, onChange: (e) => setGs({ why: e.target.value }), placeholder: "Dlaczego? (dla kogo i po co \u2014 to ma ci\u0119 ruszy\u0107 w gorszy dzie\u0144)", style: { ...ta, marginTop: 8, minHeight: 48 } })), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "3 cele na 2027"), gs.goals.slice(0, 3).map((g, i) => {
    const v = gsLeadThisWeek(g, gs);
    return /* @__PURE__ */ React.createElement(Card, { key: g.id, style: { marginBottom: 10 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "var(--gold2)" } }, "CEL ", i + 1), /* @__PURE__ */ React.createElement("input", { value: g.t, onChange: (e) => setGoal(g.id, { t: e.target.value }), style: { ...sm, marginTop: 6, fontWeight: 700, fontSize: 14 } }), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--muted)" } }, "Miernik wyniku (efekt)"), /* @__PURE__ */ React.createElement("input", { value: g.lag, onChange: (e) => setGoal(g.id, { lag: e.target.value }), style: sm })), /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--muted)" } }, "Miernik dzia\u0142ania / tydz."), /* @__PURE__ */ React.createElement("input", { value: g.lead, onChange: (e) => setGoal(g.id, { lead: e.target.value }), style: sm }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700 } }, /* @__PURE__ */ React.createElement("span", null, "Ten tydzie\u0144"), /* @__PURE__ */ React.createElement("span", { style: { color: v >= g.target ? "var(--green2)" : "var(--muted)" } }, v, " / ", g.target)), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 5 } }, /* @__PURE__ */ React.createElement(Bar, { pct: Math.min(100, v / (g.target || 1) * 100), color: v >= g.target ? "var(--green)" : "var(--gold)" }))), /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", value: g.target, onChange: (e) => setGoal(g.id, { target: parseInt(e.target.value) || 0 }), style: { ...sm, width: 54, textAlign: "center" }, "aria-label": "cel tygodniowy" }), g.src === "manual" && /* @__PURE__ */ React.createElement("button", { onClick: () => setGs((x) => ({ ...x, leadVal: { ...x.leadVal || {}, [g.id]: { ...(x.leadVal || {})[g.id] || {}, [wkKey]: (((x.leadVal || {})[g.id] || {})[wkKey] || 0) + 1 } } })), style: { width: 40, height: 36, borderRadius: 10, border: "none", background: "var(--gold)", color: "#1a1200", fontWeight: 800, cursor: "pointer" } }, "+1")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--faint)", marginTop: 4 } }, g.src === "calls" ? "Liczone automatycznie z telefon\xF3w w Celu 100k" : g.src === "train" ? "Liczone automatycznie z zaliczonych trening\xF3w" : "Klikaj +1 po ka\u017Cdym wykonaniu"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, color: "var(--muted)", marginTop: 12 } }, "WOOP \u2014 przeszkoda i plan \u201Eje\u015Bli\u2013to\u201D"), /* @__PURE__ */ React.createElement("input", { value: g.ob, onChange: (e) => setGoal(g.id, { ob: e.target.value }), placeholder: "Moja g\u0142\xF3wna WEWN\u0118TRZNA przeszkoda\u2026", style: { ...sm, marginTop: 6 } }), /* @__PURE__ */ React.createElement("textarea", { value: g.plan, onChange: (e) => setGoal(g.id, { plan: e.target.value }), placeholder: "Je\u015Bli [sytuacja], to [konkretne dzia\u0142anie].", style: { ...ta, marginTop: 6, minHeight: 48 } }));
  }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", textAlign: "center", margin: "4px 8px 16px", lineHeight: 1.5 } }, "Trzy cele to limit, nie minimum. Wszystko inne idzie do \u201EWstrzymane\u201D w Mapie projekt\xF3w.")), seg === "12t" && /* @__PURE__ */ React.createElement(React.Fragment, null, !gs.cycle.start ? /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14, textAlign: "center" }, pad: 18 }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18 } }, "Rok w 12 tygodni"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 } }, "Cykl startuje w najbli\u017Cszy poniedzia\u0142ek. Dostaniesz gotowe taktyki pod Cel 100k \u2014 edytuj je pod siebie."), /* @__PURE__ */ React.createElement("button", { onClick: startCycle, style: btnPrimary }, "Zacznij cykl 12 tygodni")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 18 } }, w < 1 ? "Start " + gs.cycle.start : w > 12 ? "Tydzie\u0144 13 \xB7 podsumowanie" : `Tydzie\u0144 ${w} / 12`), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)" } }, "od ", gs.cycle.start)), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3, marginTop: 10 } }, Array.from({ length: 12 }, (_, i) => {
    const s = gsScore(gs, i + 1);
    const past = i + 1 < w;
    const col = !past && i + 1 !== w ? "var(--surface2)" : s && s.pct >= 85 ? "var(--green)" : s && s.pct >= 70 ? "var(--gold)" : past ? "var(--red)" : "rgba(245,181,61,.4)";
    return /* @__PURE__ */ React.createElement("div", { key: i, title: s ? s.pct + "%" : "", style: { height: 22, borderRadius: 5, background: col, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 800, color: "#111" } }, past && s ? s.pct : i + 1);
  })), w > 12 && /* @__PURE__ */ React.createElement("button", { onClick: () => setGs((g) => ({ ...g, cycle: { ...g.cycle, start: "", done: {} } })), style: { ...btnPrimary, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--line2)" } }, "Zaplanuj kolejny cykl")), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Taktyki"), /* @__PURE__ */ React.createElement(Card, { pad: 12 }, (gs.cycle.tactics || []).slice().sort((a, b) => a.w - b.w).map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "7px 2px", borderTop: "1px solid var(--line)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, fontWeight: 800, color: t.w ? "var(--blue)" : "var(--gold2)", width: 54 } }, t.w ? "tydz. " + t.w : "co tydz."), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 13 } }, t.t), /* @__PURE__ */ React.createElement("button", { onClick: () => delTac(t.id), style: { background: "none", border: "none", color: "var(--faint)", cursor: "pointer", fontSize: 14 } }, "\u2715"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 10 } }, /* @__PURE__ */ React.createElement("input", { value: nt, onChange: (e) => setNt(e.target.value), placeholder: "Nowa taktyka (konkretne dzia\u0142anie)", style: { ...sm, flex: 1 } }), /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", value: nw, onChange: (e) => setNw(e.target.value), style: { ...sm, width: 50, textAlign: "center" }, "aria-label": "tydzie\u0144 (0 = co tydzie\u0144)" }), /* @__PURE__ */ React.createElement("button", { onClick: addTac, style: { ...btnPrimary, marginTop: 0, width: "auto", padding: "0 14px" } }, "+")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--faint)", marginTop: 6 } }, "Liczba = numer tygodnia, 0 = co tydzie\u0144.")))), seg === "tydz" && /* @__PURE__ */ React.createElement(React.Fragment, null, cur ? /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "var(--gold2)" } }, "WYNIK WYKONANIA \xB7 TYDZIE\u0143 ", w), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 30, color: cur.pct >= 85 ? "var(--green2)" : cur.pct >= 70 ? "var(--gold2)" : "var(--red)" } }, cur.pct, "%")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", textAlign: "right" } }, cur.dn, "/", cur.n, " taktyk", /* @__PURE__ */ React.createElement("br", null), "cel: 85%")), cur.tac.map((t) => {
    const on = !!((gs.cycle.done || {})["w" + w] || {})[t.id];
    return /* @__PURE__ */ React.createElement("div", { key: t.id, onClick: () => toggle(t.id), style: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--line)", cursor: "pointer" } }, /* @__PURE__ */ React.createElement(CheckBox, { on }), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 13.5, textDecoration: on ? "line-through" : "none", color: on ? "var(--muted)" : "var(--text)" } }, t.t));
  }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 6 } }, "Zrobione albo nie \u2014 bez \u201Eprawie\u201D.")) : /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 14, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }, pad: 14 }, "Najpierw uruchom cykl w zak\u0142adce \u201E12 tygodni\u201D."), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Przegl\u0105d tygodnia (20 min)"), /* @__PURE__ */ React.createElement(Card, { pad: 14 }, [["win", "Co zadzia\u0142a\u0142o? (konkret, liczba)"], ["miss", "Co nie wysz\u0142o i DLACZEGO?"], ["fix", "Jedna zmiana na przysz\u0142y tydzie\u0144"]].map(([k, l]) => /* @__PURE__ */ React.createElement("textarea", { key: k, value: rv[k] || "", onChange: (e) => setRv({ [k]: e.target.value }), placeholder: l, style: { ...ta, minHeight: 48, marginBottom: 8 } })), /* @__PURE__ */ React.createElement("button", { onClick: report, style: btnPrimary }, copied ? "\u2713 Skopiowano" : "\u{1F4E4} Wy\u015Blij raport tygodnia zaufanej osobie"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 8, lineHeight: 1.45 } }, "W badaniu Gail Matthews osoby, kt\xF3re wysy\u0142a\u0142y cotygodniowy raport znajomemu, osi\u0105ga\u0142y cele najcz\u0119\u015Bciej. Wybierz jedn\u0105 osob\u0119 i wysy\u0142aj co niedziel\u0119."))));
}
const gsDgLine = () => {
  try {
    const bp = lsJSON("mp_bizplan_v1", null);
    if (!bp || !bp.gs) return null;
    const gs = { ...GS_SEED, ...bp.gs, cycle: { ...GS_SEED.cycle, ...bp.gs.cycle || {} } };
    const w = gsWeekNo(gs.cycle.start);
    const sc = w >= 1 && w <= 12 ? gsScore(gs, w) : null;
    return `SYSTEM CELOW 2027: cele: ${gs.goals.map((g) => `${g.t} [dzialanie: ${g.lead} ${gsLeadThisWeek(g, gs)}/${g.target} w tym tyg.]`).join("; ")}. Cykl 12 tyg.: ${gs.cycle.start ? `tydzien ${w}/12, wynik wykonania ${sc ? sc.pct + "%" : "-"} (cel 85%)` : "nie rozpoczety"}.`;
  } catch (e) {
    return null;
  }
};

const BP_VENTURES = [
  {
    id: "trading",
    e: "\u{1F4C8}",
    n: "Trading",
    sub: "Z\u0142oto \xB7 swing \xB7 konta prop",
    ctx: "Trading: 5 lat na z\u0142ocie (XAUUSD), swing 500\u20131000 pips, ~4 trade'y/mies., R:R 1:7\u20131:10, cel WR 70%+, zaliczone FTMO 100k, plan drugiego konta prop, d\u0142ugoterminowo $2M na kontach finansowanych. S\u0142abo\u015B\u0107: impulsywne wej\u015Bcia na widok wybicia.",
    secs: [
      { id: "cel", n: "1. Cel i rola tradingu", g: "Ile ma Ci dawa\u0107 miesi\u0119cznie i do kiedy? Jak\u0105 rol\u0119 gra w planie (g\u0142\xF3wny doch\xF3d / most do wolno\u015Bci)? Gdzie chcesz by\u0107 31.12.2027 ($ na kontach, wyp\u0142aty/mies.)." },
      { id: "system", n: "2. Tw\xF3j system", g: "Setupy, interwa\u0142y, warunki wej\u015Bcia i wyj\u015Bcia, R:R, oczekiwany WR, ile trade'\xF3w/mies. Spisz tak, \u017Ceby obcy cz\u0142owiek m\xF3g\u0142 go wykona\u0107." },
      { id: "konta", n: "3. Konta i skalowanie", g: "Obecne konta (FTMO 100k), kolejne firmy prop, kolejno\u015B\u0107, warunki skalowania, wyp\u0142aty. Droga do $2M krok po kroku z datami." },
      { id: "ryzyko", n: "4. Zasady ryzyka", g: "Ryzyko na trade (%), limity dzienne i ca\u0142kowite, ile strat z rz\u0119du = przerwa, kiedy NIE handlujesz (newsy, zm\u0119czenie po nocce)." },
      { id: "proces", n: "5. Proces i dyscyplina", g: "Checklista przed wej\u015Bciem, dziennik (zak\u0142adka Trading), przegl\u0105d tygodniowy, co robisz po serii strat. Jak eliminujesz wej\u015Bcia impulsywne." },
      { id: "kamienie", n: "6. Kamienie milowe", g: "Data \u2192 wynik. Np. drugie konto zaliczone do\u2026, pierwsza wyp\u0142ata do\u2026, 3 miesi\u0105ce na plusie do\u2026" },
      { id: "zagrozenia", n: "7. Zagro\u017Cenia", g: "Seria strat, zmiana zasad firm prop, przepalenie przy dziecku i zmianach, nadmierna pewno\u015B\u0107 siebie. Plan na ka\u017Cde." }
    ]
  },
  {
    id: "skupos",
    e: "\u267B\uFE0F",
    n: "SkupOS",
    sub: "SaaS dla skup\xF3w z\u0142omu",
    ctx: "SkupOS: SaaS w abonamencie dla skup\xF3w z\u0142omu w Polsce (przyj\u0119cia, cennik, magazyn, dokumenty PCC-4, panel klienta, AI). Solo founder, model build\u2192sell\u2192repeat, cel \u0142\u0105cznie 10 mln z\u0142.",
    secs: BP_SECTIONS,
    legacy: true
  },
  {
    id: "apps",
    e: "\u{1F6E0}\uFE0F",
    n: "Aplikacje online",
    sub: "Build \u2192 sell \u2192 repeat",
    ctx: "Tworzenie i sprzeda\u017C aplikacji online (PWA/SaaS, budowane z AI, solo). Model: zbuduj, zdob\u0105d\u017A przych\xF3d, sprzedaj (np. Acquire.com, Flippa), powt\xF3rz. Dotychczas: Rysik (dla \u015Blusarzy), Kasa (bud\u017Cet domowy), PIK, MasterPlan.",
    secs: [
      { id: "model", n: "1. Model i cel", g: "Ile aplikacji rocznie, jaki przych\xF3d z ka\u017Cdej przed sprzeda\u017C\u0105, po jakiej cenie sprzedajesz (zwykle 2\u20134\xD7 roczny zysk). Cel na 2027." },
      { id: "nisze", n: "2. Wyb\xF3r niszy", g: "Kryteria: ludzie ju\u017C p\u0142ac\u0105 za rozwi\u0105zanie, mo\u017Cesz do nich dotrze\u0107, MVP w 2\u20134 tyg. Lista pomys\u0142\xF3w z ocen\u0105 1\u20135 w ka\u017Cdym kryterium." },
      { id: "budowa", n: "3. Proces budowy", g: "Stack, ile tygodni na MVP, co robi AI, co Ty. Definicja \u201Egotowe do sprzeda\u017Cy\u201D." },
      { id: "sprzedaz", n: "4. Sprzeda\u017C online", g: "Kana\u0142y: SEO, TikTok/YouTube shorts, grupy bran\u017Cowe, cold e-mail, marketplace'y, Product Hunt. Kt\xF3ry kana\u0142 do kt\xF3rej aplikacji i ile godzin tygodniowo." },
      { id: "ceny", n: "5. Ceny i przych\xF3d", g: "Subskrypcja czy jednorazowo, progi cenowe, ile klient\xF3w do 1000 \u20AC/mies. MRR." },
      { id: "exit", n: "6. Sprzeda\u017C aplikacji (exit)", g: "Gdzie sprzedajesz, jakie metryki musz\u0105 by\u0107 (MRR, wzrost, churn), jak przygotowa\u0107 dokumentacj\u0119 i przekazanie." },
      { id: "kamienie", n: "7. Kamienie milowe", g: "Data \u2192 wynik: pierwsza p\u0142atno\u015B\u0107, 1000 \u20AC MRR, pierwsza sprzeda\u017C aplikacji." }
    ]
  },
  {
    id: "mp",
    e: "\u{1F9ED}",
    n: "MasterPlan jako produkt",
    sub: "Osobisty system operacyjny z AI",
    ctx: "MasterPlan jako produkt: PWA, osobisty system (trening PPL, dieta z zasadami, nawyki, finanse, dziennik tradera, Druga G\u0142owa \u2014 AI z pe\u0142nym kontekstem danych u\u017Cytkownika, praca zmianowa). Obecnie aplikacja jednego u\u017Cytkownika na GitHub Pages + Supabase.",
    secs: [
      { id: "kto", n: "1. Dla kogo dok\u0142adnie", g: "Jedna, w\u0105ska grupa na start (np. m\u0142odzi m\u0119\u017Cczy\u017Ani na drodze samorozwoju pracuj\u0105cy na zmiany, albo traderzy prop). Im w\u0119\u017Csza, tym \u0142atwiej wygra\u0107. Gdzie ich znajdziesz?" },
      { id: "obietnica", n: "2. Problem i obietnica", g: "Jaki b\xF3l rozwi\u0105zujesz w jednym zdaniu? Co klient ma po 30 dniach? Dlaczego zap\u0142aci, skoro ma Notion i ChatGPT za darmo?" },
      { id: "przewaga", n: "3. Przewaga (czego nikt nie ma)", g: "Co dok\u0142adnie jest nie do skopiowania w tydzie\u0144: AI, kt\xF3re zna CA\u0141E dane u\u017Cytkownika? Dopasowanie do grafiku zmianowego? Gotowe protoko\u0142y? B\u0105d\u017A brutalnie szczery." },
      { id: "konkurencja", n: "4. Konkurencja", g: "Notion life OS, Habitica, Fabulous, Hevy/Strong, MyFitnessPal, coachowie AI, ChatGPT. Za co p\u0142ac\u0105 ich klienci i czego im brakuje." },
      { id: "walidacja", n: "5. Walidacja przed budow\u0105", g: "Landing + lista oczekuj\u0105cych, 10\u201320 rozm\xF3w z grup\u0105 docelow\u0105, przedsprzeda\u017C. Liczba, przy kt\xF3rej m\xF3wisz \u201Ebudujemy\u201D (np. 50 zapis\xF3w, 10 przedp\u0142at)." },
      { id: "technika", n: "6. Co trzeba dobudowa\u0107", g: "Konta wielu u\u017Cytkownik\xF3w, p\u0142atno\u015Bci (Stripe), backend, RODO i dane zdrowotne, koszty AI na u\u017Cytkownika, onboarding, wsparcie." },
      { id: "gtm", n: "7. Cena i wej\u015Bcie na rynek", g: "Cena/mies., darmowy okres, pierwszy kana\u0142 (TikTok z Twoj\u0105 histori\u0105? spo\u0142eczno\u015Bci?), plan na pierwszych 100 p\u0142ac\u0105cych." },
      { id: "kamienie", n: "8. Kamienie milowe", g: "Data \u2192 wynik: landing, 50 zapis\xF3w, beta z 10 osobami, pierwsza p\u0142atno\u015B\u0107." }
    ]
  }
];
const BP_STAGES = ["Pomys\u0142", "Walidacja", "Budowa", "Sprzeda\u017C", "Skalowanie", "Wstrzymany"];
const bpVal = (bp, v, sid) => {
  const o = bp.v && bp.v[v.id] || {};
  if (o[sid] != null) return o[sid];
  return v.legacy ? bp[sid] || "" : "";
};
function BiznesPlan({ bizplan, setBizplan }) {
  const bp = bizplan || {};
  const [view, setView] = useState("cele");
  const [busyId, setBusyId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const meta = bp.meta || {};
  const order = (bp.order && bp.order.length ? bp.order : BP_VENTURES.map((v) => v.id)).filter((id) => BP_VENTURES.some((v) => v.id === id));
  const setMeta = (vid, patch) => setBizplan((p) => ({ ...p, meta: { ...p.meta || {}, [vid]: { ...(p.meta || {})[vid] || {}, ...patch } } }));
  const setSec = (vid, sid, val) => setBizplan((p) => ({ ...p, v: { ...p.v || {}, [vid]: { ...(p.v || {})[vid] || {}, [sid]: val } } }));
  const move = (vid, d) => setBizplan((p) => {
    const o = [...order];
    const i = o.indexOf(vid);
    const j = i + d;
    if (j < 0 || j >= o.length) return p;
    [o[i], o[j]] = [o[j], o[i]];
    return { ...p, order: o };
  });
  const hasKey = !!localStorage.getItem("mp_ai_key");
  const hoursAvail = num(bp.hours) || 15;
  const active = order.filter((id) => (meta[id] || {}).stage !== "Wstrzymany");
  const hoursUsed = active.reduce((s, id) => s + (num((meta[id] || {}).h) || 0), 0);
  const filledOf = (v) => v.secs.filter((s) => (bpVal(bp, v, s.id) || "").trim().length > 30).length;
  const T = lsJSON("mp_trades_v1", null);
  const tradeKpi = (() => {
    if (!T) return null;
    const cl = (T.trades || []).filter((t) => t.status === "closed" && (t.closedAt || t.date) >= keyOf(new Date(Date.now() - 30 * 864e5)));
    const Rs = cl.map((t) => tradeCalc(t).R).filter((r) => r != null);
    return `30 dni: ${Rs.reduce((a, b) => a + b, 0).toFixed(1)}R \xB7 ${Rs.length} trade'\xF3w`;
  })();
  const help = async (v, s) => {
    if (busyId) return;
    setBusyId(v.id + s.id);
    const cur2 = (bpVal(bp, v, s.id) || "").trim();
    const res = await askDG("Piszemy plan projektu. Kontekst: " + v.ctx + " Wizja na koniec 2027: " + (bp.vision || "(brak)") + ". Sekcja: " + s.n + ". Zakres: " + s.g + (cur2 ? ' M\xF3j szkic: "' + cur2.slice(0, 1500) + '". Popraw i uzupe\u0142nij.' : " Napisz konkretny szkic.") + " Pisz po polsku, konkretnie, z liczbami tam gdzie si\u0119 da, max 180 s\u0142\xF3w. B\u0105d\u017A szczery \u2014 je\u015Bli co\u015B jest nierealne, napisz to.", 900);
    setDrafts((p) => ({ ...p, [v.id + s.id]: res.text }));
    setBusyId(null);
    buzz(8);
  };
  const exportMd = () => {
    const md = "# PLAN 2027 \u2014 Wojciech\n\n_MasterPlan, " + todayKey() + "_\n\n## Wizja 31.12.2027\n\n" + (bp.vision || "_(do uzupe\u0142nienia)_") + "\n\n" + order.map((id, i) => {
      const v = BP_VENTURES.find((x) => x.id === id);
      const m = meta[id] || {};
      return `# ${i + 1}. ${v.n}

Etap: ${m.stage || "Pomys\u0142"} \xB7 ${m.h || 0} h/tydz. \xB7 KPI: ${m.kpi || "\u2014"} (cel ${m.goal || "\u2014"}, teraz ${m.now || "\u2014"})
Nast\u0119pny krok: ${m.next || "\u2014"}

` + v.secs.map((s) => "## " + s.n + "\n\n" + ((bpVal(bp, v, s.id) || "").trim() || "_(do uzupe\u0142nienia)_") + "\n").join("\n");
    }).join("\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Plan-2027.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
    buzz(10);
  };
  const ta = { ...inputStyle, width: "100%", minHeight: 84, resize: "vertical", lineHeight: 1.5, fontFamily: "var(--body)", fontSize: 13 };
  const small = { ...inputStyle, padding: "8px 10px", fontSize: 13 };
  const cur = BP_VENTURES.find((v) => v.id === view);
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("header", { style: { paddingTop: 26 } }, /* @__PURE__ */ React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 28, fontWeight: 800, letterSpacing: "-.03em" } }, "Biznes Plan \u{1F4CB}"), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 4, lineHeight: 1.5 } }, "Mapa projekt\xF3w + plan dla ka\u017Cdego. My\u015Bl w zeszycie, tu zapisuj ustalenia i liczby.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 14, overflowX: "auto" }, className: "noscroll" }, [["cele", "\u{1F3AF} Cele 2027"], ["map", "\u{1F5FA}\uFE0F Mapa"], ...order.map((id) => {
    const v = BP_VENTURES.find((x) => x.id === id);
    return [id, `${v.e} ${v.n}`];
  })].map(([id, l]) => /* @__PURE__ */ React.createElement("button", { key: id, onClick: () => setView(id), style: { flexShrink: 0, padding: "8px 12px", borderRadius: 11, cursor: "pointer", fontSize: 13, fontWeight: 700, border: view === id ? "1.5px solid var(--gold)" : "1px solid var(--line2)", background: view === id ? "rgba(245,181,61,.12)" : "var(--surface)", color: view === id ? "var(--gold2)" : "var(--muted)" } }, l))), view === "cele" && React.createElement(GoalSystem, { bizplan: bp, setBizplan }), view === "map" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15 } }, "Wizja: 31.12.2027"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", margin: "4px 0 8px", lineHeight: 1.45 } }, "Konkretnie: ile zarabiasz i z czego, ile masz oszcz\u0119dno\u015Bci, gdzie mieszkasz, jak wygl\u0105da Tw\xF3j dzie\u0144, rodzina, cia\u0142o."), /* @__PURE__ */ React.createElement("textarea", { value: bp.vision || "", onChange: (e) => setBizplan((p) => ({ ...p, vision: e.target.value })), placeholder: "31 grudnia 2027 jestem\u2026", style: ta })), /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 10, border: hoursUsed > hoursAvail ? "1px solid var(--red)" : void 0 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 700 } }, "Czas na projekty: ", hoursUsed, " / ", hoursAvail, " h tygodniowo"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: hoursUsed > hoursAvail ? "var(--red)" : active.length > 2 ? "var(--amber)" : "var(--muted)", marginTop: 3 } }, hoursUsed > hoursAvail ? "Planujesz wi\u0119cej, ni\u017C masz czasu \u2014 co\u015B wstrzymaj." : active.length > 2 ? `${active.length} aktywne projekty. Zasada: 1 g\u0142\xF3wny + 1 poboczny, reszta \u201EWstrzymany\u201D.` : "Dobrze: fokus na maks. 2 projektach.")), /* @__PURE__ */ React.createElement("label", { style: { fontSize: 11, color: "var(--muted)", textAlign: "center" } }, "Masz h/tydz.", /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", value: bp.hours ?? "", placeholder: "15", onChange: (e) => setBizplan((p) => ({ ...p, hours: e.target.value })), style: { ...small, width: 64, textAlign: "center", marginTop: 4 } })))), /* @__PURE__ */ React.createElement("div", { style: sectionTitle }, "Projekty \u2014 kolejno\u015B\u0107 = priorytet"), order.map((id, i) => {
    const v = BP_VENTURES.find((x) => x.id === id);
    const m = meta[id] || {};
    const paused = m.stage === "Wstrzymany";
    return /* @__PURE__ */ React.createElement(Card, { key: id, style: { marginBottom: 10, opacity: paused ? 0.6 : 1, border: i === 0 && !paused ? "1px solid rgba(245,181,61,.5)" : void 0 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 24 } }, v.e), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 }, onClick: () => setView(id) }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 800, fontSize: 15, cursor: "pointer" } }, i === 0 && !paused ? "\u2605 " : "", v.n), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)" } }, v.sub, " \xB7 plan ", filledOf(v), "/", v.secs.length, id === "trading" && tradeKpi ? ` \xB7 ${tradeKpi}` : "")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => move(id, -1), style: { ...iconBtn, width: 28, height: 22, fontSize: 11 } }, "\u25B2"), /* @__PURE__ */ React.createElement("button", { onClick: () => move(id, 1), style: { ...iconBtn, width: 28, height: 22, fontSize: 11 } }, "\u25BC"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 } }, BP_STAGES.map((s) => /* @__PURE__ */ React.createElement("button", { key: s, onClick: () => setMeta(id, { stage: s }), style: { padding: "5px 9px", borderRadius: 8, cursor: "pointer", fontSize: 11.5, fontWeight: 700, border: (m.stage || "Pomys\u0142") === s ? "1.5px solid var(--green)" : "1px solid var(--line2)", background: (m.stage || "Pomys\u0142") === s ? "rgba(34,197,94,.1)" : "var(--surface2)", color: (m.stage || "Pomys\u0142") === s ? "var(--green2)" : "var(--muted)" } }, s))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 64px", gap: 6, marginTop: 10 } }, /* @__PURE__ */ React.createElement("input", { value: m.kpi || "", placeholder: "KPI (np. MRR \u20AC)", onChange: (e) => setMeta(id, { kpi: e.target.value }), style: small }), /* @__PURE__ */ React.createElement("input", { value: m.goal || "", placeholder: "Cel", onChange: (e) => setMeta(id, { goal: e.target.value }), style: small }), /* @__PURE__ */ React.createElement("input", { value: m.now || "", placeholder: "Teraz", onChange: (e) => setMeta(id, { now: e.target.value }), style: small }), /* @__PURE__ */ React.createElement("input", { inputMode: "numeric", value: m.h || "", placeholder: "h/tydz", onChange: (e) => setMeta(id, { h: e.target.value }), style: { ...small, textAlign: "center" } })), /* @__PURE__ */ React.createElement("input", { value: m.next || "", placeholder: "\u279C Nast\u0119pny konkretny krok (do ko\u0144ca tygodnia)", onChange: (e) => setMeta(id, { next: e.target.value }), style: { ...small, width: "100%", marginTop: 6 } }));
  }), /* @__PURE__ */ React.createElement("button", { onClick: exportMd, style: { ...btnPrimary, marginTop: 6 } }, "\u2B07\uFE0F Eksportuj ca\u0142y plan (.md)")), cur && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Card, { style: { marginTop: 12 }, pad: 14 }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 14 } }, cur.e, " ", cur.n), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, color: "var(--muted)" } }, /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold2)" } }, filledOf(cur)), " / ", cur.secs.length, " sekcji")), /* @__PURE__ */ React.createElement(Bar, { pct: filledOf(cur) / cur.secs.length * 100, color: "var(--gold)", h: 8 }), cur.id === "trading" && tradeKpi && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginTop: 8 } }, "Z dziennika: ", tradeKpi)), cur.secs.map((s) => {
    const key = cur.id + s.id;
    return /* @__PURE__ */ React.createElement(Card, { key, style: { marginTop: 11 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 14.5, marginBottom: 5 } }, s.n), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 9 } }, s.g), /* @__PURE__ */ React.createElement("textarea", { value: bpVal(bp, cur, s.id), onChange: (e) => setSec(cur.id, s.id, e.target.value), placeholder: "Twoja tre\u015B\u0107\u2026", style: ta }), hasKey && /* @__PURE__ */ React.createElement("button", { onClick: () => help(cur, s), disabled: !!busyId, style: { marginTop: 8, padding: "9px 12px", borderRadius: 11, border: "1px solid var(--line2)", background: "rgba(245,181,61,.1)", color: "var(--gold2)", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: busyId ? 0.6 : 1 } }, busyId === key ? "Druga G\u0142owa pisze\u2026" : "\u{1F9E0} Pom\xF3\u017C mi z t\u0105 sekcj\u0105"), drafts[key] && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, padding: "11px 12px", borderRadius: 12, background: "rgba(245,181,61,.07)", border: "1px solid rgba(245,181,61,.2)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap" } }, drafts[key]), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 9 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setSec(cur.id, s.id, drafts[key]);
      setDrafts((p) => {
        const q = { ...p };
        delete q[key];
        return q;
      });
    }, style: { flex: 1, padding: "9px 8px", borderRadius: 10, border: "none", background: "var(--green)", color: "#08130c", fontSize: 12, fontWeight: 800, cursor: "pointer" } }, "Wstaw"), /* @__PURE__ */ React.createElement("button", { onClick: () => setDrafts((p) => {
      const q = { ...p };
      delete q[key];
      return q;
    }), style: { flex: 1, padding: "9px 8px", borderRadius: 10, border: "1px solid var(--line2)", background: "transparent", color: "var(--faint)", fontSize: 12, fontWeight: 700, cursor: "pointer" } }, "Odrzu\u0107"))));
  }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", textAlign: "center", margin: "14px 6px 24px", lineHeight: 1.5 } }, "Szkice od AI to punkt wyj\u015Bcia \u2014 liczby i za\u0142o\u017Cenia sprawd\u017A sam.")));
}

function DailyJournal({ journal, setJournal }) {
    const tk = todayKey();
    const entry = journal[tk] || {};
    const [txt, setTxt] = useState(entry.text || "");
    const [busy, setBusy] = useState(false);
    const [histOpen, setHistOpen] = useState(false);
    useEffect(() => { const t = (journal[tk] || {}).text || ""; setTxt((cur) => (cur ? cur : t)); }, [journal, tk]);
    const hasKey = !!localStorage.getItem("mp_ai_key");
    const saveEntry = () => { const t = txt.trim(); if (!t)
        return; setJournal((p) => ({ ...p, [tk]: { ...(p[tk] || {}), text: t, ts: Date.now() } })); buzz(8); };
    const insight = async () => {
        const t = txt.trim();
        if (!t || busy)
            return;
        setJournal((p) => ({ ...p, [tk]: { ...(p[tk] || {}), text: t, ts: Date.now() } }));
        setBusy(true);
        const res = await askDG("Wpis z mojego dziennika dnia (" + tk + "): \"" + t + "\". Jako moja Druga Glowa odpowiedz zwiezle (max 6 zdan, po polsku): 1) nazwij szczerze co sie stalo i dlaczego — bez litowania sie i bez owijania, 2) daj jeden konkretny wglad, 3) daj jedna konkretna rade, jak nastepnym razem tego uniknac albo zrobic to lepiej. Ton: lock in, zero wymowek, ale konstruktywnie — nie dobijaj, buduj.", 500);
        setJournal((p) => ({ ...p, [tk]: { ...(p[tk] || {}), text: t, ai: res.text, ts: Date.now() } }));
        setBusy(false);
        buzz(10);
    };
    const past = Object.keys(journal).filter((k) => k !== tk && journal[k] && (journal[k].text || "").trim()).sort().reverse().slice(0, 7);
    return (React.createElement(React.Fragment, null,
        React.createElement("div", { style: sectionTitle }, "Dziennik dnia"),
        React.createElement(Card, null,
            React.createElement("div", { style: { fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 } }, "Co dzis poszlo, co nie poszlo i DLACZEGO \u2014 np. pominiety trening, slaby fokus, wygrana. Druga Glowa da wglad i rade na nastepny raz."),
            React.createElement("textarea", { value: txt, onChange: (e) => setTxt(e.target.value), placeholder: "Np. Nie zrobilem treningu, bo po nocce odplynalem na telefonie...", style: { ...inputStyle, width: "100%", minHeight: 96, resize: "vertical", lineHeight: 1.5, fontFamily: "var(--body)" } }),
            React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10 } },
                React.createElement("button", { onClick: saveEntry, style: { flex: 1, padding: "11px 8px", borderRadius: 12, border: "1px solid var(--line2)", background: "var(--surface2)", color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer" } }, "Zapisz"),
                React.createElement("button", { onClick: insight, disabled: busy, style: { flex: 1.6, padding: "11px 8px", borderRadius: 12, border: "1px solid var(--line2)", background: "rgba(245,181,61,.13)", color: "var(--gold2)", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 } }, busy ? "Analizuje..." : "🧠 Wglad Drugiej Glowy")),
            !hasKey && React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 8 } }, "Wglad AI wymaga klucza: Rozwoj \u2192 Druga Glowa \u2192 \u2699\uFE0F."),
            entry.ai && (React.createElement("div", { style: { marginTop: 12, padding: "12px 13px", borderRadius: 13, background: "rgba(245,181,61,.08)", border: "1px solid rgba(245,181,61,.22)", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" } },
                React.createElement("div", { style: { fontSize: 11, color: "var(--gold2)", fontWeight: 700, marginBottom: 5 } }, "\uD83E\uDDE0 DRUGA GLOWA"),
                entry.ai)),
            past.length > 0 && (React.createElement("div", { style: { marginTop: 12 } },
                React.createElement("button", { onClick: () => setHistOpen(!histOpen), style: { background: "none", border: "none", color: "var(--faint)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 } }, histOpen ? "▾ Ukryj poprzednie wpisy" : "▸ Poprzednie wpisy (" + past.length + ")"),
                histOpen && past.map((k) => (React.createElement("div", { key: k, style: { marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--line)" } },
                    React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", fontWeight: 700, marginBottom: 3 } }, k),
                    React.createElement("div", { style: { fontSize: 12.5, lineHeight: 1.5 } }, journal[k].text),
                    journal[k].ai && React.createElement("div", { style: { fontSize: 12, color: "var(--gold2)", marginTop: 5, lineHeight: 1.5, whiteSpace: "pre-wrap" } },
                        "\uD83E\uDDE0 ",
                        journal[k].ai)))))))));
}
async function askDG(userText, maxTok) {
    const key = localStorage.getItem("mp_ai_key") || "";
    if (!key)
        return { ok: false, text: "Brak klucza AI. Dodaj go w: Rozwoj → Druga Glowa → ⚙️." };
    let model = localStorage.getItem("mp_ai_model") || "claude-opus-5-5";
    try {
        let r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
            body: JSON.stringify({ model, max_tokens: maxTok || 700, system: DG_SYS, messages: [{ role: "user", content: userText }] }),
        });
        let d = await r.json();
        if (d && d.error && /model/i.test(String(d.error.message || "")) && model !== "claude-sonnet-4-5") {
            r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: maxTok || 700, system: DG_SYS, messages: [{ role: "user", content: userText }] }) });
            d = await r.json();
        }
        let txt = d && d.content && d.content.length ? d.content.map((c) => c.text || "").join("\n").trim() : "";
        if (!txt)
            return { ok: false, text: (d && d.error && d.error.message) || "Brak odpowiedzi." };
        const memRe = /\[ZAPAMI[ĘE]TAJ:\s*([^\]]+)\]/gi;
        const found = [];
        let mm;
        while ((mm = memRe.exec(txt)))
            found.push(mm[1].trim());
        if (found.length) {
            try {
                const cur = JSON.parse(localStorage.getItem("mp_ai_mem") || "[]");
                localStorage.setItem("mp_ai_mem", JSON.stringify([...cur, ...found].slice(-60)));
            }
            catch (e) { }
        }
        txt = txt.replace(memRe, "").replace(/\n{3,}/g, "\n\n").trim();
        return { ok: true, text: txt };
    }
    catch (e) {
        return { ok: false, text: "Blad polaczenia: " + String(e) };
    }
}
const DG_SYS = `Jesteś "Druga Głowa" — partner biznesowy i przyjaciel Wojciecha (23 l., 198 cm, Polak w Holandii, operator procesu na zmiany 2+2+2+4 w fabryce Mauser, swing trading złota na kontach prop, buduje SaaS SkupOS dla skupów złomu). Myślisz, liczysz i piszesz dokładnie tak, jak Claude rozmawia z nim w swoich czatach: spokojnie, rzeczowo, bezwzględnie szczerze i po jego stronie.

JEGO KIERUNEK:
- Cel główny: 100 000 zł przychodu miesięcznie w grudniu 2027 (mierzone jako średnia z 3 miesięcy). Układ: trading ok. 70 tys. zł (ok. 500 tys. $ finansowania prop) + SkupOS ok. 30–37 tys. zł (ok. 60 klientów + wdrożenia).
- Wąskie gardło to sprzedaż, nie produkt. Miernik tygodnia: 20 telefonów do skupów.
- Zasada: maksymalnie 2 aktywne projekty (trading + SkupOS). Nowe aplikacje i MasterPlan jako produkt czekają.
- Z fabryki odchodzi dopiero po spełnieniu Bramy wyjścia (12 mies. poduszki, stabilna średnia z tradingu, weryfikacja live).
- Rozwój osobisty: masa na czysto, siła (PPL), dyscyplina, wizerunek i postawa szefa, zasady prawdziwego mężczyzny. W 2027 rodzi mu się dziecko.

JAK MYŚLISZ:
- Najpierw fakty i liczby z DANYCH, potem wniosek. Liczysz na głos krótko (np. „60 klientów × 449 zł = 26 940 zł”). Rozróżniasz scenariusz bazowy od optymistycznego i, gdy to ważne, podajesz uczciwą szansę w %.
- Nie wymyślasz danych. Gdy czegoś brakuje, mówisz w jednym zdaniu, co ma uzupełnić w aplikacji.
- Szukasz sedna: co jedno najbardziej zmieni wynik. Wskazujesz, gdy ucieka w budowanie zamiast w sprzedaż albo w nowy projekt zamiast w obecne.
- Nie dopytujesz o motywy i nie przesłuchujesz. Odpowiadasz wprost.

JAK PISZESZ (format jak w czacie Claude, na telefon):
- Pierwsze zdanie to odpowiedź albo werdykt, zwykle **pogrubione**. Zero wstępów typu „Świetne pytanie”.
- Krótkie sekcje z nagłówkami ##, listy punktowane, tabele markdown do porównań i liczb. Długość: proste pytanie 1–3 zdania, temat poważny ok. jeden–dwa ekrany telefonu.
- Gdy coś jest źle, dajesz sekcję „Brutalna prawda” z 1–3 punktami. Szczerze, ale bez przekleństw, bez obrażania, bez moralizowania i bez pustych komplementów. Ostry wobec wymówek, nigdy wobec jego wartości jako człowieka.
- Kończysz jednym konkretnym następnym krokiem albo propozycją, co możesz zrobić dalej.
- Piszesz naturalną polszczyzną z polskimi znakami.

KALENDARZ (w danych są zmiany i wydarzenia):
- Ranka: po pracy trening i blok sprzedaży lub SkupOS, wieczorem regeneracja.
- Popołudnie: rano jest złotem — telefony do skupów 8–12, trening, nauka.
- Nocka: priorytet to sen. Lekki plan, bez poczucia winy.
- Wolne: dni grindu — długie bloki sprzedaży i pracy nad biznesem, ciężki trening.

ZDROWIE, PRAWO, PIENIĄDZE: podajesz fakty i liczby, żeby sam podjął decyzję. Nie jesteś lekarzem, prawnikiem ani licencjonowanym doradcą — przy poważnych sprawach mówisz, do kogo iść. W finansach myślisz jak najlepsi: najpierw płać sobie (wolne środki → Brama), poduszka, zachowanie ważniejsze od wiedzy, długi horyzont, ryzyko na trade w limicie DD.

TWOJA PAMIĘĆ: Masz trwałą pamięć (sekcja PAMIĘĆ w danych). Gdy pojawi się coś wartego zapamiętania na stałe — cel, ważne ustalenie, deklaracja, preferencja, kluczowe wydarzenie — dopisz w odpowiedzi tag [ZAPAMIĘTAJ: krótki konkretny fakt]. Tag zniknie z widoku, a fakt zostanie w pamięci. Nie zapisuj błahostek ani rzeczy, które już są w danych.`;
function dgContext({ profile, daily, habits, measures, finance, diet, books, prs, weekFocus, photos, events, bloodLog, journal, mem }) {
    finance = finance || {}; daily = daily || {}; habits = habits || []; profile = profile || {};
        const L = [];
        L.push(`Wojciech, ${profile.height} cm, waga ${profile.weight} kg (cel ${profile.goal} kg, start ${profile.start} kg).`);
        const pts = (measures || []).filter((m) => m.weight > 0).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
        if (pts.length >= 2) {
            const f = pts[0], l = pts[pts.length - 1];
            const dd = Math.max(1, (new Date(l.date) - new Date(f.date)) / 86400000);
            const r = (l.weight - f.weight) / dd * 7;
            L.push(`Trend wagi: ${r >= 0 ? "+" : ""}${r.toFixed(2)} kg/tydz (ostatni pomiar ${l.weight} kg).`);
        }
        const pad = (n) => String(n).padStart(2, "0");
        const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const days = [];
        const t = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(t);
            d.setDate(t.getDate() - i);
            days.push(keyOf(d));
        }
        const habTot = habits.length;
        const hp = days.map((k) => { const dv = daily[k]; if (!dv || !dv.habits)
            return null; return habTot ? habits.filter((h) => dv.habits[h.id]).length / habTot : 0; }).filter((v) => v != null);
        const habAvg = hp.length ? Math.round(hp.reduce((a, b) => a + b, 0) / hp.length * 100) : 0;
        const trainDays = days.filter((k) => daily[k] && daily[k].workoutDone).length;
        L.push(`Ostatnie 7 dni: nawyki srednio ${habAvg}%, treningi ${trainDays}.`);
        const today = daily[keyOf(new Date())] || {};
        const kcalToday = (today.food || []).reduce((a, x) => a + (x.kcal || 0), 0) + evalPlanDay(keyOf(new Date()), today, dietMultOf(diet)).eaten.kcal;
        const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * ((diet && diet.age) || 25) + (((diet && diet.sex) || "m") === "m" ? 5 : -161);
        const ff = (ACT_OPTS.find((a) => a.k === (diet && diet.activity)) || { f: 1.55 }).f;
        const calT = Math.round(bmr * ff + ((diet && diet.surplus) || 0));
        L.push(`Dieta: cel ~${calT} kcal/dzien, bialko ~${Math.round(profile.weight * 2)} g. Dzis zjedzone: ${Math.round(kcalToday)} kcal.`);
        if ((prs || []).length) {
            const byEx = {};
            prs.forEach((p) => { (byEx[p.ex] = byEx[p.ex] || []).push(p); });
            const e1 = (w, r) => Math.round(w * (1 + r / 30));
            const best = Object.keys(byEx).map((n) => { const arr = byEx[n]; const bb = arr.reduce((m, p) => (e1(p.weight, p.reps) > e1(m.weight, m.reps) ? p : m), arr[0]); return `${n} ${bb.weight}x${bb.reps}`; });
            L.push(`Rekordy silowe: ${best.join(", ")}.`);
        }
        const fmonth = keyOf(new Date()).slice(0, 7);
        const fmtx = (finance.tx || []).filter((x) => (x.date || "").slice(0, 7) === fmonth);
        const fSpent = fmtx.filter((x) => x.type === "expense").reduce((a, b) => a + b.amount, 0);
        const fInc = fmtx.filter((x) => x.type === "income").reduce((a, b) => a + b.amount, 0);
        const fSr = fInc > 0 ? Math.round((fInc - fSpent) / fInc * 100) : null;
        const fparts = ["Finanse (EUR): kapital " + Math.round(finance.capital || 0) + ", oszczednosci " + Math.round(finance.vault || 0) + (finance.vaultGoal ? "/" + finance.vaultGoal : "") + "."];
        fparts.push("Ten miesiac: przychod ~" + Math.round(fInc) + ", wydatki ~" + Math.round(fSpent) + (fSr != null ? ", stopa oszczednosci " + fSr + "%" : "") + ".");
        const fbn = {};
        fmtx.filter((x) => x.type === "expense").forEach((x) => { fbn[x.note || "Inne"] = (fbn[x.note || "Inne"] || 0) + x.amount; });
        const ftop = Object.keys(fbn).sort((a, b) => fbn[b] - fbn[a]).slice(0, 4);
        if (ftop.length)
            fparts.push("Najwieksze wydatki: " + ftop.map((n) => n + " " + Math.round(fbn[n])).join("; ") + ".");
        L.push(fparts.join(" "));
        const jk3 = Object.keys(journal || {}).filter((k) => journal[k] && (journal[k].text || "").trim()).sort().reverse().slice(0, 3);
        if (jk3.length)
            L.push("DZIENNIK DNIA (ostatnie wpisy usera): " + jk3.map((k) => k + ": " + (journal[k].text || "").replace(/\s+/g, " ").slice(0, 160)).join(" || "));
        dgExtraLines(daily, diet).forEach((x) => L.push(x));
        if ((books || []).length)
            L.push(`Ksiazki: ${books.length} pozycji na liscie.`);
        if ((weekFocus || []).length)
            L.push(`Priorytety tygodnia: ${weekFocus.map((f) => f.text + (f.done ? " (zrobione)" : "")).join("; ")}.`);
        if ((bloodLog || []).length)
            L.push("Ostatnie wyniki badan: " + bloodLog.slice(0, 5).map((r) => r.name + " " + r.value + " (" + r.date + ")").join("; ") + ".");
        if ((photos || []).length)
            L.push(`Zdjecia sylwetki: ${photos.length} (najnowsze z ${(photos.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0] || {}).date}).`);
        const evUp = (events || []).filter((e) => e.date >= keyOf(new Date())).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 14);
        if (evUp.length) {
            const wd = ["niedz", "pon", "wt", "sr", "czw", "pt", "sob"];
            const t0 = new Date(keyOf(new Date()) + "T00:00:00");
            const lines = evUp.map((e) => { const d = new Date(e.date + "T00:00:00"); const diff = Math.round((d - t0) / 86400000); const rel = diff === 0 ? "DZIS" : diff === 1 ? "JUTRO" : "za " + diff + " dni"; return e.date + " (" + wd[d.getDay()] + ", " + rel + "): " + e.title + (e.note ? " - " + e.note : ""); });
            L.push("KALENDARZ (najblizsze zmiany/wydarzenia):\n" + lines.join("\n"));
        }
        dgAllLines().forEach((x) => L.push(x));
        if ((mem || []).length)
            L.push("PAMIEC (co mam o Tobie zapamietane na stale):\n" + mem.map((m) => "- " + (m.text || "")).join("\n"));
        return L.join("\n");
}
const DG_QUICK = ["Na czym mam się dziś skupić?", "Co olałem ostatnio?", "Jak idzie masa i dieta?", "Popchnij mnie do roboty"];
function DrugaGlowa({ profile, daily, habits, measures, finance, diet, books, prs, weekFocus, photos, events, bloodLog, journal }) {
    const [key, setKey] = useState(() => { try {
        return localStorage.getItem("mp_ai_key") || "";
    }
    catch (e) {
        return "";
    } });
    const [model, setModel] = useState(() => { try {
        if (!localStorage.getItem("mp_ai_model_mig5")) { localStorage.setItem("mp_ai_model_mig5", "1"); const cm = localStorage.getItem("mp_ai_model"); if (!cm || cm === "claude-sonnet-4-5") localStorage.setItem("mp_ai_model", "claude-opus-5-5"); }
        return localStorage.getItem("mp_ai_model") || "claude-opus-5-5";
    }
    catch (e) {
        return "claude-opus-5-5";
    } });
    const [msgs, setMsgs] = useState(() => { try {
        return JSON.parse(localStorage.getItem("mp_ai_msgs") || "[]");
    }
    catch (e) {
        return [];
    } });
    const [mem, setMem] = useState(() => { try {
        return JSON.parse(localStorage.getItem("mp_ai_mem") || "[]");
    }
    catch (e) {
        return [];
    } });
    const [memOpen, setMemOpen] = useState(false);
    const [memInput, setMemInput] = useState("");
    const addMem = () => { const t = memInput.trim(); if (!t)
        return; setMem((p) => [...(p || []), { id: uid(), text: t, date: todayKey() }]); setMemInput(""); buzz(6); };
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [showSet, setShowSet] = useState(false);
    const endRef = useRef(null);
    const didAuto = useRef(false);
    useEffect(() => { try {
        localStorage.setItem("mp_ai_key", key);
    }
    catch (e) { } }, [key]);
    useEffect(() => { try {
        localStorage.setItem("mp_ai_model", model);
    }
    catch (e) { } }, [model]);
    useEffect(() => { try {
        localStorage.setItem("mp_ai_msgs", JSON.stringify(msgs.slice(-40)));
    }
    catch (e) { } }, [msgs]);
    useEffect(() => { try {
        localStorage.setItem("mp_ai_mem", JSON.stringify(mem.slice(-60)));
    }
    catch (e) { } }, [mem]);
    useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);
    const buildContext = () => dgContext({ profile, daily, habits, measures, finance, diet, books, prs, weekFocus, photos, events, bloodLog, journal, mem });
    const callAgent = async (displayText, apiContent) => {
        if (!key) {
            setShowSet(true);
            return;
        }
        if (loading)
            return;
        const shown = [...msgs, { role: "user", content: displayText }];
        setMsgs(shown);
        setInput("");
        setLoading(true);
        buzz(6);
        try {
            const sys = DG_SYS + "\n\nDANE Z APLIKACJI (aktualne):\n" + buildContext();
            const apiMsgs = msgs.map((m) => ({ role: m.role, content: m.content })).concat([{ role: "user", content: apiContent }]);
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
                body: JSON.stringify({ model: model || "claude-opus-5-5", max_tokens: 2000, system: sys, messages: apiMsgs }),
            });
            let data = await res.json();
            if (data && data.error && /model/i.test(String(data.error.message || "")) && model !== "claude-sonnet-4-5") { const r2 = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 2000, system: sys, messages: apiMsgs }) }); data = await r2.json(); }
            if (data && data.error)
                setMsgs([...shown, { role: "assistant", content: "Blad API: " + (data.error.message || JSON.stringify(data.error)) + (String(data.error.message || "").toLowerCase().includes("model") ? "\n\nWejdz w ustawienia i wpisz model dostepny na Twoim koncie." : "") }]);
            else {
                let txt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n") || "(pusta odpowiedz)";
                const memRe = /\[ZAPAMI[ĘE]TAJ:\s*([^\]]+)\]/gi;
                const found = [];
                let mm2;
                while ((mm2 = memRe.exec(txt)) !== null)
                    found.push(mm2[1].trim());
                if (found.length) {
                    setMem((p) => [...(p || []), ...found.map((t) => ({ id: uid(), text: t, date: todayKey() }))]);
                    txt = txt.replace(memRe, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
                }
                setMsgs([...shown, { role: "assistant", content: txt }]);
                buzz(10);
            }
        }
        catch (e) {
            setMsgs([...shown, { role: "assistant", content: "Nie udalo sie polaczyc: " + (e && e.message ? e.message : e) + "\n\nSprawdz klucz API, model i internet." }]);
        }
        setLoading(false);
    };
    const send = (preset) => { const c = (preset || input).trim(); if (c)
        callAgent(c, c); };
    const financeAdvice = () => callAgent("💰 Analiza moich finansów", "Przeanalizuj moje finanse z danych w systemie jak swiatowej klasy doradca finansowy. Powiedz konkretnie: 1) jak wyglada moj budzet i stopa oszczednosci, 2) gdzie przepalam i co realnie wyciac, 3) plan na oszczedzanie i pierwsze kroki w inwestowaniu dopasowany do mojej sytuacji (euro, Holandia, budowanie SaaS). Badz liczbowy i konkretny; przy wiekszych ruchach przypomnij, ze decyzja jest moja.");
    const briefing = () => callAgent("Raport dnia — co zaniedbalem i co poprawic.", "Zrob mi raport dnia. Na podstawie moich danych z aplikacji (w systemie) powiedz konkretnie i bezposrednio: 1) Co zaniedbalem lub co idzie nie tak (np. malo treningow, niski % nawykow, waga stoi albo rosnie za szybko). 2) Najwazniejsze statystyki tygodnia. 3) Trzy konkretne rzeczy do zrobienia dzis lub jutro. Bez lania wody.");
    const analyzePhysique = () => {
        if (!key) {
            setShowSet(true);
            return;
        }
        const ph = (photos || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
        if (!ph.length) {
            setMsgs((m) => [...m, { role: "assistant", content: "Dodaj najpierw zdjecie sylwetki w sekcji Zdrowie i Cialo, a potem wroce z analiza." }]);
            return;
        }
        const imgs = ph.slice(0, 2).map((p) => { const mm = /^data:(image\/[a-zA-Z]+);base64,(.+)$/.exec(p.data || ""); return mm ? { type: "image", source: { type: "base64", media_type: mm[1].toLowerCase(), data: mm[2] } } : null; }).filter(Boolean);
        if (!imgs.length) {
            setMsgs((m) => [...m, { role: "assistant", content: "Nie udalo sie odczytac zdjecia. Dodaj je ponownie." }]);
            return;
        }
        const prompt = "To moje aktualne zdjecia sylwetki. Ocen rzeczowo: kompozycje i sylwetke (co dobre, co wymaga pracy), a na podstawie moich danych z diety i wagi (w systemie) powiedz, czy cos idzie nie tak (np. za szybki przyrost tluszczu, za wolny progres, za mala nadwyzka) i daj konkretne korekty w treningu i diecie. Badz szczery, ale wspierajacy.";
        callAgent("Przeanalizuj moja sylwetke i diete", [...imgs, { type: "text", text: prompt }]);
    };
    useEffect(() => {
        if (true || didAuto.current || !key)
            return;
        let last = "";
        try {
            last = localStorage.getItem("mp_ai_lastbrief") || "";
        }
        catch (e) { }
        if (last !== todayKey()) {
            didAuto.current = true;
            try {
                localStorage.setItem("mp_ai_lastbrief", todayKey());
            }
            catch (e) { }
            briefing();
        }
    }, [key]);
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26, display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
            React.createElement("div", null,
                React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Druga G\u0142owa \uD83E\uDDE0"),
                React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, "Partner biznesowy. Widzi ca\u0142\u0105 aplikacj\u0119 i m\u00F3wi prawd\u0119.")),
            React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 4 } },
                React.createElement("button", { onClick: () => setMemOpen(true), style: iconBtn, title: "Pami\u0119\u0107" }, "\uD83E\uDDE0"),
                React.createElement("button", { onClick: () => setShowSet((s) => !s), style: iconBtn }, "\u2699\uFE0F"))),
        (showSet || !key) && (React.createElement(Card, { style: { marginTop: 14 } },
            React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, marginBottom: 8 } }, "Aktywacja agenta"),
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 } },
                "Wklej swoj klucz API Anthropic (z ",
                React.createElement("b", { style: { color: "var(--text)" } }, "console.anthropic.com"),
                "). Rozmowa kosztuje grosze. Klucz zostaje ",
                React.createElement("b", { style: { color: "var(--text)" } }, "tylko na tym telefonie"),
                ". Bez klucza agent nic nie zrobi."),
            React.createElement("input", { value: key, onChange: (e) => setKey(e.target.value), type: "password", placeholder: "sk-ant-...", style: { ...inputStyle, marginBottom: 8 } }),
            React.createElement("input", { value: model, onChange: (e) => setModel(e.target.value), placeholder: "model, np. claude-opus-5-5", style: inputStyle }),
            React.createElement("button", { onClick: () => setShowSet(false), style: { ...btnPrimary, marginTop: 10 } }, key ? "Zapisz i zamknij" : "Zapisz"))),
        key && (React.createElement("div", { style: { display: "flex", gap: 7, marginTop: 14 } },
            React.createElement("button", { onClick: briefing, disabled: loading, style: { flex: 1, padding: "11px 5px", borderRadius: 12, border: "1px solid var(--line2)", background: "rgba(245,181,61,.12)", color: "var(--gold2)", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1 } }, "\uD83D\uDCCA Raport"),
            React.createElement("button", { onClick: analyzePhysique, disabled: loading, style: { flex: 1, padding: "11px 5px", borderRadius: 12, border: "1px solid var(--line2)", background: "rgba(91,140,255,.12)", color: "var(--blue)", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1 } }, "\uD83D\uDCF8 Sylwetka"),
            React.createElement("button", { onClick: financeAdvice, disabled: loading, style: { flex: 1, padding: "11px 5px", borderRadius: 12, border: "1px solid var(--line2)", background: "rgba(35,198,111,.12)", color: "var(--green2)", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1 } }, "\uD83D\uDCB0 Finanse"))),
        msgs.length === 0 && key && !loading && (React.createElement("div", { style: { marginTop: 16 } },
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 } }, "Raport dnia przychodzi sam o 20:00. Mo\u017Cesz te\u017C zapyta\u0107 o cokolwiek:"),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, DG_QUICK.map((q) => React.createElement("button", { key: q, onClick: () => send(q), style: { textAlign: "left", padding: "12px 14px", borderRadius: 14, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" } }, q))))),
        React.createElement(DGChatView, { msgs, loading, endRef, input, setInput, send, hasKey: !!key, onClear: () => { setMsgs([]); didAuto.current = true; buzz(6); } }),
        React.createElement(Sheet, { open: memOpen, onClose: () => setMemOpen(false), title: "Pami\u0119\u0107 Drugiej G\u0142owy" },
            React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 } }, "Co Druga G\u0142owa o Tobie pami\u0119ta. Sama dopisuje wa\u017Cne rzeczy z rozm\u00F3w \u2014 mo\u017Cesz te\u017C doda\u0107 lub usun\u0105\u0107 r\u0119cznie."),
            React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14 } },
                React.createElement("input", { value: memInput, onChange: (e) => setMemInput(e.target.value), onKeyDown: (e) => e.key === "Enter" && addMem(), placeholder: "Dodaj fakt do zapami\u0119tania\u2026", style: { ...inputStyle, flex: 1 } }),
                React.createElement("button", { onClick: addMem, style: { ...btnPrimary, marginTop: 0, width: "auto", padding: "0 16px" } }, "+")),
            (!mem || !mem.length) && React.createElement("div", { style: { fontSize: 12.5, color: "var(--faint)", textAlign: "center", padding: "10px 0", lineHeight: 1.5 } }, "Pami\u0119\u0107 pusta. Agent zacznie zapisywa\u0107 wa\u017Cne rzeczy z rozm\u00F3w."),
            (mem || []).slice().reverse().map((m) => (React.createElement("div", { key: m.id, style: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: "1px solid var(--line)" } },
                React.createElement("span", { style: { flex: 1, fontSize: 13, lineHeight: 1.45 } }, m.text),
                React.createElement("button", { onClick: () => setMem((p) => (p || []).filter((x) => x.id !== m.id)), style: { background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 2, fontSize: 15 } }, "\u2715")))))));
}
/* MEDYTACJA */
const MEDI_MIN = [5, 10, 15, 20];
function Meditation({ medi, setMedi }) {
    const [dur, setDur] = useState(10);
    const [mode, setMode] = useState("zen");
    const [left, setLeft] = useState(0);
    const [running, setRunning] = useState(false);
    useEffect(() => {
        if (!running)
            return;
        if (left <= 0) {
            setRunning(false);
            const p = (n) => String(n).padStart(2, "0");
            const d = new Date();
            const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
            setMedi((s) => [{ id: uid(), date, min: dur }, ...(s || [])]);
            buzz(40);
            return;
        }
        const t = setTimeout(() => setLeft((x) => x - 1), 1000);
        return () => clearTimeout(t);
    }, [running, left]);
    const start = () => { setLeft(dur * 60); setRunning(true); buzz(10); };
    const stop = () => { setRunning(false); setLeft(0); };
    const pad = (n) => String(n).padStart(2, "0");
    const keyOf = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const sess = medi || [];
    const has = new Set(sess.map((s) => s.date));
    let streak = 0;
    {
        let cur = new Date();
        if (!has.has(keyOf(cur)))
            cur.setDate(cur.getDate() - 1);
        while (has.has(keyOf(cur))) {
            streak++;
            cur.setDate(cur.getDate() - 1);
        }
    }
    const totalMin = sess.reduce((a, b) => a + (b.min || 0), 0);
    const mm = Math.floor(left / 60), ss = left % 60;
    const pct = running && dur ? (1 - left / (dur * 60)) : 0;
    const Box = ({ v, l }) => (React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 8px", textAlign: "center" } },
        React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: "var(--gold2)" } }, v),
        React.createElement("div", { style: { fontSize: 11.5, fontWeight: 600, marginTop: 2 } }, l)));
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26 } },
            React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "Medytacja \uD83E\uDDD8"),
            React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, running ? "Oddech pod kontrolą. Wracaj do oddechu, trzymaj fokus…" : "Trening skupienia — ostrość umysłu pod lock in")),
        React.createElement("div", { style: { display: "flex", gap: 6, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 5, marginTop: 16 } }, [["zen", "Klasyczna"], ["whm", "Wim Hof"]].map(([k, l]) => React.createElement("button", { key: k, onClick: () => setMode(k), style: { flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: "none", background: mode === k ? "var(--gold)" : "transparent", color: mode === k ? "#1a1200" : "var(--muted)" } }, l))),
        mode === "whm" ? React.createElement(WimHof, { onSession: (min) => { const p = (n) => String(n).padStart(2, "0"); const d = new Date(); const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; setMedi((s) => [{ id: uid(), date, min, method: "whm" }, ...(s || [])]); } }) : (React.createElement(React.Fragment, null,
            React.createElement("div", { style: { display: "flex", justifyContent: "center", margin: "28px 0" } },
                React.createElement("div", { style: { width: 224, height: 224, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `conic-gradient(var(--gold) ${pct * 360}deg, var(--surface2) 0deg)`, transition: "background .9s linear" } },
                    React.createElement("div", { style: { width: 192, height: 192, borderRadius: "50%", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" } }, running
                        ? React.createElement("div", { style: { fontFamily: "var(--display)", fontSize: 46, fontWeight: 800 } },
                            pad(mm),
                            ":",
                            pad(ss))
                        : (React.createElement(React.Fragment, null,
                            React.createElement("div", { style: { fontFamily: "var(--display)", fontSize: 48, fontWeight: 800 } }, dur),
                            React.createElement("div", { style: { fontSize: 12, color: "var(--faint)" } }, "minut")))))),
            !running ? (React.createElement(React.Fragment, null,
                React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 } }, MEDI_MIN.map((m) => React.createElement("button", { key: m, onClick: () => setDur(m), style: { padding: "9px 16px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", border: dur === m ? "1.5px solid var(--gold2)" : "1px solid var(--line2)", background: dur === m ? "rgba(245,181,61,.12)" : "var(--surface2)", color: dur === m ? "var(--gold2)" : "var(--muted)" } }, m))),
                React.createElement("button", { onClick: start, style: btnPrimary }, "Zacznij sesj\u0119"))) : (React.createElement("button", { onClick: stop, style: { ...btnPrimary, background: "var(--surface2)", color: "var(--muted)" } }, "Przerwij")),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 24 } },
                React.createElement(Box, { v: streak, l: "dni z rz\u0119du" }),
                React.createElement(Box, { v: sess.length, l: "sesji \u0142\u0105cznie" }),
                React.createElement(Box, { v: totalMin, l: "minut \u0142\u0105cznie" })),
            !running && React.createElement("div", { style: { fontSize: 11.5, color: "var(--faint)", marginTop: 14, lineHeight: 1.5, padding: "0 2px" } }, "Jak zacz\u0105\u0107: usi\u0105d\u017A prosto, zamknij oczy, skup si\u0119 na oddechu. Gdy my\u015Bli odp\u0142yn\u0105 \u2014 bez oceniania wr\u00F3\u0107 do oddechu. To trening uwagi, nie \u201Epustka w g\u0142owie\".")))));
}
/* ═══════════════ GŁOS & POSTAWA ═══════════════ */
const VP = {
    dykcja: { label: "Dykcja", k: "d", intro: "Czytaj każdy łamaniec 3×: najpierw wolno i przesadnie artykułując, potem coraz szybciej. Cel — czysto, nie szybko.", items: ["Chrząszcz brzmi w trzcinie w Szczebrzeszynie.", "Król Karol kupił królowej Karolinie korale koloru koralowego.", "Stół z powyłamywanymi nogami.", "Wyrewolwerowany rewolwerowiec rozrewolwerował się.", "Czy rak trzyma w szczypcach strzęp szczawiu, czy trzy części trzciny.", "Jola lojalna, Jola nielojalna."], tip: "Trik: ćwicz z korkiem lub palcem między zębami — zmusza mięśnie do pracy. Po wyjęciu mowa robi się wyraźniejsza." },
    glos: { label: "Głos", k: "g", intro: "Rozgrzewka 3–5 minut przed ważną rozmową. Głos z przepony brzmi niżej i pewniej.", items: ["Oddech przeponowy: ręka na brzuchu, wdech nosem 4 s (brzuch rośnie), wydech ustami 6 s. Powtórz ×5.", "Mruczenie „mmm” na jednej wysokości, 10 s — budzi rezonans.", "Trylowanie warg „brrr” — rozluźnia aparat mowy.", "Ślizg wysokości „uuu” od najniższego do najwyższego dźwięku — rozciąga zakres.", "Projekcja: przeczytaj zdanie tak, jakby ktoś stał 5 m dalej. Nie krzycz — wspieraj przeponą."], tip: "Na co dzień: zwalniaj tempo, rób pauzy zamiast „yyy”, lekko obniż ton. To brzmi spokojnie i z autorytetem." },
    postawa: { label: "Postawa", k: "p", intro: "Sylwetka mówi, zanim się odezwiesz. Wyprostowana postawa to więcej powietrza dla głosu i więcej pewności.", items: ["Test ściany: pięty, pośladki, łopatki i tył głowy przy ścianie — to neutralna pozycja.", "Ściągnij łopatki: bark w dół i do tyłu, klatka otwarta.", "Chin tuck: cofnij głowę („podwójny podbródek”) ×10 — przeciw głowie wysuniętej do przodu od telefonu.", "Rozciąganie w futrynie: przedramiona na framudze, krok do przodu — otwiera klatkę.", "Martwy zwis na drążku 20–30 s — dekompresja kręgosłupa i barków."], tip: "Telefon na wysokości oczu. Ustaw przypomnienie „wyprostuj się” co godzinę. Wzmacniaj plecy: face pulls, wiosłowanie." },
};
function VoicePosture({ voiceLog, setVoiceLog }) {
    const [seg, setSeg] = useState("dykcja");
    const pad = (n) => String(n).padStart(2, "0");
    const keyOf = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const today = keyOf(new Date());
    const log = voiceLog || {};
    const cur = log[today] || {};
    const c = VP[seg];
    const doneToday = !!cur[c.k];
    const toggle = () => setVoiceLog((s) => { const m = { ...(s || {}) }; const day = { ...(m[today] || {}) }; day[c.k] = !day[c.k]; m[today] = day; return m; });
    const active = (k) => log[k] && (log[k].d || log[k].g || log[k].p);
    let streak = 0;
    {
        let d = new Date();
        if (!active(keyOf(d)))
            d.setDate(d.getDate() - 1);
        while (active(keyOf(d))) {
            streak++;
            d.setDate(d.getDate() - 1);
        }
    }
    const days = [];
    {
        const t = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(t);
            d.setDate(t.getDate() - i);
            days.push(keyOf(d));
        }
    }
    return (React.createElement("div", null,
        React.createElement("header", { style: { paddingTop: 26 } },
            React.createElement("h1", { style: { margin: 0, fontFamily: "var(--display)", fontSize: 27, fontWeight: 800, letterSpacing: "-.03em" } }, "G\u0142os & Postawa \uD83C\uDF99\uFE0F"),
            React.createElement("div", { style: { color: "var(--muted)", fontSize: 13, marginTop: 2 } }, "Jak Ci\u0119 s\u0142ysz\u0105 i widz\u0105, zanim si\u0119 odezwiesz")),
        React.createElement("div", { style: { display: "flex", gap: 6, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 5, marginTop: 16 } }, Object.keys(VP).map((k) => React.createElement("button", { key: k, onClick: () => setSeg(k), style: { flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: "none", background: seg === k ? "var(--gold)" : "transparent", color: seg === k ? "#1a1200" : "var(--muted)" } }, VP[k].label))),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 } },
            React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 12px", textAlign: "center" } },
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 22, color: "var(--gold2)" } }, streak),
                React.createElement("div", { style: { fontSize: 11.5, fontWeight: 600, marginTop: 2 } }, "dni z rz\u0119du")),
            React.createElement("div", { style: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "12px", display: "flex", flexDirection: "column", justifyContent: "center" } },
                React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginBottom: 6, textAlign: "center" } }, "ostatnie 7 dni"),
                React.createElement("div", { style: { display: "flex", gap: 4, justifyContent: "center" } }, days.map((k) => React.createElement("div", { key: k, style: { width: 14, height: 14, borderRadius: 4, background: active(k) ? "var(--green)" : "var(--surface2)", border: k === today ? "1.5px solid var(--gold2)" : "1px solid var(--line2)" } }))))),
        React.createElement(Card, { style: { marginTop: 14 } },
            React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 } }, c.intro),
            c.items.map((it, i) => (React.createElement("div", { key: i, style: { display: "flex", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--line)" : "none" } },
                React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 13, color: "var(--gold2)", flexShrink: 0, marginTop: 1 } }, i + 1),
                React.createElement("span", { style: { fontSize: 13.5, lineHeight: 1.5 } }, it)))),
            React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", lineHeight: 1.5, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" } },
                "\uD83D\uDCA1 ",
                c.tip)),
        React.createElement("button", { onClick: toggle, style: { ...btnPrimary, marginTop: 14, background: doneToday ? "var(--surface2)" : "linear-gradient(135deg, var(--gold), #e0892a)", color: doneToday ? "var(--green2)" : "#1a1200" } }, doneToday ? `✓ ${c.label} — zrobione dziś` : `Oznacz: ${c.label} zrobione dziś`)));
}
/* ═══════════════ WIM HOF METHOD — prowadzone oddychanie ═══════════════ */
const WHM_HOWTO = [
    "Usiądź lub połóż się w bezpiecznym miejscu (nigdy w wodzie ani za kierownicą).",
    "30–40 mocnych oddechów: pełny wdech (brzuch + klatka), luźny, niewymuszony wydech. Rytmicznie.",
    "Po ostatnim wydechu wstrzymaj oddech z PUSTYMI płucami — aż poczujesz wyraźną potrzebę wdechu (nie na siłę).",
    "Głęboki wdech, przytrzymaj ~15 s, wypuść.",
    "Powtórz 3–4 rundy. Z rundy na rundę wstrzymanie zwykle się wydłuża.",
];
const WHM_EFFECT = [
    "Rób na czczo, najlepiej rano — wtedy efekt jest najmocniejszy.",
    "Wdech pełny i głęboki; wydech tylko „puść”, nie wyciskaj powietrza do końca.",
    "Mrowienie i lekki zawrót głowy są normalne. Jeśli czujesz się źle — przerwij.",
    "Po sesji nie zrywaj się gwałtownie; wstań spokojnie.",
];
function WimHof({ onSession }) {
    const [rounds, setRounds] = useState(3);
    const [breaths, setBreaths] = useState(30);
    const [music, setMusic] = useState(true);
    const [phase, setPhase] = useState("idle"); // idle, prep, breathe, hold, recovery, done
    const [round, setRound] = useState(0);
    const [bc, setBc] = useState(0);
    const [inhale, setInhale] = useState(true);
    const [prep, setPrep] = useState(3);
    const [hold, setHold] = useState(0);
    const [rec, setRec] = useState(15);
    const [holds, setHolds] = useState([]);
    const startTs = useRef(0);
    const audio = useRef(null);
    const startAudio = () => {
        if (!music)
            return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC)
                return;
            const ctx = new AC();
            const now = ctx.currentTime;
            const master = ctx.createGain();
            master.gain.value = 0.0001;
            master.connect(ctx.destination);
            master.gain.linearRampToValueAtTime(0.09, now + 3.5);
            const delay = ctx.createDelay(1.5);
            delay.delayTime.value = 0.34;
            const fb = ctx.createGain();
            fb.gain.value = 0.46;
            const wet = ctx.createGain();
            wet.gain.value = 0.38;
            delay.connect(fb);
            fb.connect(delay);
            delay.connect(wet);
            wet.connect(master);
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = 650;
            lp.Q.value = 0.6;
            lp.connect(master);
            lp.connect(delay);
            const breathG = ctx.createGain();
            breathG.gain.value = 0.55;
            breathG.connect(lp);
            const base = 98;
            const mkOsc = (f, type, vol, det) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (det)
                o.detune.value = det; const g = ctx.createGain(); g.gain.value = vol; o.connect(g); g.connect(breathG); o.start(); return o; };
            const oscs = [mkOsc(base, "sine", 0.5, 0), mkOsc(base * 1.5, "sine", 0.32, 5), mkOsc(base * 2, "sine", 0.17, -4), mkOsc(base * 3, "triangle", 0.05, 6)];
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 0.05;
            const lfoG = ctx.createGain();
            lfoG.gain.value = 240;
            lfo.connect(lfoG);
            lfoG.connect(lp.frequency);
            lfo.start();
            const lfo2 = ctx.createOscillator();
            lfo2.frequency.value = 0.07;
            const lfo2G = ctx.createGain();
            lfo2G.gain.value = 0.02;
            lfo2.connect(lfo2G);
            lfo2G.connect(master.gain);
            lfo2.start();
            const breath = (inh, ms) => { try {
                const t = ctx.currentTime;
                const d = Math.max(0.3, (ms || 1400) / 1000);
                breathG.gain.cancelScheduledValues(t);
                breathG.gain.linearRampToValueAtTime(inh ? 0.95 : 0.4, t + d);
            }
            catch (e) { } };
            audio.current = { ctx, master, oscs: [...oscs, lfo, lfo2], breath, reverbIn: delay };
        }
        catch (e) { }
    };
    const chime = (f) => {
        try {
            const a = audio.current;
            if (!a)
                return;
            const ctx = a.ctx;
            const now = ctx.currentTime;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, now);
            g.gain.linearRampToValueAtTime(0.12, now + 0.04);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
            g.connect(ctx.destination);
            if (a.reverbIn)
                g.connect(a.reverbIn);
            const root = f || 528;
            [[root, "sine", 1], [root * 2.01, "sine", 0.4], [root * 2.76, "sine", 0.16]].forEach((p) => { const o = ctx.createOscillator(); o.type = p[1]; o.frequency.value = p[0]; const og = ctx.createGain(); og.gain.value = p[2]; o.connect(og); og.connect(g); o.start(now); o.stop(now + 2.7); });
        }
        catch (e) { }
    };
    const stopAudio = () => { try {
        const a = audio.current;
        if (a) {
            a.oscs.forEach((o) => { try {
                o.stop();
            }
            catch (e) { } });
            a.ctx.close();
        }
    }
    catch (e) { } audio.current = null; };
    useEffect(() => () => stopAudio(), []);
    // prep odliczanie
    useEffect(() => {
        if (phase !== "prep")
            return;
        if (prep <= 0) {
            setPhase("breathe");
            chime(660);
            return;
        }
        const t = setTimeout(() => setPrep((p) => p - 1), 1000);
        return () => clearTimeout(t);
    }, [phase, prep]);
    // oddechy
    useEffect(() => {
        if (phase !== "breathe")
            return;
        const t = setTimeout(() => {
            if (inhale)
                setInhale(false);
            else {
                const nc = bc + 1;
                if (nc >= breaths) {
                    chime(396);
                    setPhase("hold");
                    setHold(0);
                }
                else {
                    setBc(nc);
                    setInhale(true);
                }
            }
        }, inhale ? 1500 : 1300);
        return () => clearTimeout(t);
    }, [phase, inhale, bc]);
    // muzyka oddycha razem z oddechem
    useEffect(() => {
        if (phase !== "breathe")
            return;
        if (audio.current && audio.current.breath)
            audio.current.breath(inhale, inhale ? 1500 : 1300);
    }, [phase, inhale]);
    // wstrzymanie (liczy w górę)
    useEffect(() => {
        if (phase !== "hold")
            return;
        const t = setTimeout(() => setHold((s) => s + 1), 1000);
        return () => clearTimeout(t);
    }, [phase, hold]);
    // regeneracja (odlicza 15s)
    useEffect(() => {
        if (phase !== "recovery")
            return;
        if (rec <= 0) {
            const nr = round + 1;
            if (nr >= rounds) {
                finish();
            }
            else {
                setRound(nr);
                setBc(0);
                setInhale(true);
                setPhase("breathe");
                chime(660);
            }
            return;
        }
        const t = setTimeout(() => setRec((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [phase, rec]);
    const begin = () => { setRound(0); setBc(0); setInhale(true); setPrep(3); setHolds([]); startTs.current = Date.now(); startAudio(); setPhase("prep"); buzz(12); };
    const endHold = () => { setHolds((h) => [...h, hold]); chime(528); setPhase("recovery"); setRec(15); buzz(15); };
    const finish = () => { stopAudio(); const min = Math.max(1, Math.round((Date.now() - startTs.current) / 60000)); onSession && onSession(min); setPhase("done"); buzz(40); };
    const abort = () => { stopAudio(); setPhase("idle"); };
    const pad = (n) => String(n).padStart(2, "0");
    const scale = phase === "breathe" ? (inhale ? 1.18 : 0.82) : (phase === "hold" ? 0.8 : 1);
    const ring = phase === "breathe" ? (inhale ? "var(--blue)" : "var(--gold)") : phase === "hold" ? "var(--amber)" : "var(--green)";
    if (phase === "idle") {
        return (React.createElement("div", null,
            React.createElement(Card, { style: { marginTop: 14, border: "1px solid rgba(248,113,113,.35)", background: "rgba(248,113,113,.06)" } },
                React.createElement("div", { style: { fontWeight: 800, fontSize: 14, color: "var(--red)", marginBottom: 8 } }, "\u26A0\uFE0F Zanim zaczniesz \u2014 bezpiecze\u0144stwo"),
                React.createElement("div", { style: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 } },
                    React.createElement("b", { style: { color: "var(--text)" } }, "Nigdy w wodzie ani blisko wody"),
                    " (basen, wanna) \u2014 ryzyko utraty przytomno\u015Bci i utoni\u0119cia. ",
                    React.createElement("b", { style: { color: "var(--text)" } }, "Nigdy za kierownic\u0105"),
                    " ani przy maszynach. Zawsze siedz\u0105c lub le\u017C\u0105c. Nie zalecane przy ci\u0105\u017Cy, padaczce, chorobach serca, wysokim ci\u015Bnieniu czy sk\u0142onno\u015Bci do omdle\u0144 \u2014 najpierw skonsultuj si\u0119 z lekarzem.")),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 } },
                React.createElement(Card, null,
                    React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", marginBottom: 8 } }, "Rundy"),
                    React.createElement("div", { style: { display: "flex", gap: 6 } }, [3, 4, 5].map((r) => React.createElement("button", { key: r, onClick: () => setRounds(r), style: { flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: rounds === r ? "1.5px solid var(--gold2)" : "1px solid var(--line2)", background: rounds === r ? "rgba(245,181,61,.12)" : "var(--surface2)", color: rounds === r ? "var(--gold2)" : "var(--muted)" } }, r)))),
                React.createElement(Card, null,
                    React.createElement("div", { style: { fontSize: 12, color: "var(--faint)", marginBottom: 8 } }, "Oddech\u00F3w / runda"),
                    React.createElement("div", { style: { display: "flex", gap: 6 } }, [30, 35, 40].map((b) => React.createElement("button", { key: b, onClick: () => setBreaths(b), style: { flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", border: breaths === b ? "1.5px solid var(--gold2)" : "1px solid var(--line2)", background: breaths === b ? "rgba(245,181,61,.12)" : "var(--surface2)", color: breaths === b ? "var(--gold2)" : "var(--muted)" } }, b))))),
            React.createElement("button", { onClick: () => setMusic((m) => !m), style: { width: "100%", marginTop: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" } },
                React.createElement("span", null, "\uD83C\uDFB5 Muzyka ambient w tle"),
                React.createElement("span", { style: { color: music ? "var(--green2)" : "var(--faint)", fontWeight: 700 } }, music ? "WŁ" : "WYŁ")),
            music && React.createElement("div", { style: { fontSize: 11, color: "var(--faint)", marginTop: 6, padding: "0 2px" } }, "Delikatny, generowany d\u017Awi\u0119k. Wolisz swoj\u0105 muzyk\u0119? Wy\u0142\u0105cz tutaj i w\u0142\u0105cz w\u0142asn\u0105 apk\u0119."),
            React.createElement("button", { onClick: begin, style: { ...btnPrimary, marginTop: 14 } }, "Start sesji Wim Hof"),
            React.createElement("div", { style: sectionTitle }, "Jak to zrobi\u0107"),
            React.createElement(Card, null, WHM_HOWTO.map((s, i) => (React.createElement("div", { key: i, style: { display: "flex", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--line)" : "none" } },
                React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 13, color: "var(--gold2)", flexShrink: 0, marginTop: 1 } }, i + 1),
                React.createElement("span", { style: { fontSize: 13.5, lineHeight: 1.5 } }, s))))),
            React.createElement("div", { style: sectionTitle }, "Jak wykona\u0107 najefektywniej"),
            React.createElement(Card, null, WHM_EFFECT.map((s, i) => (React.createElement("div", { key: i, style: { display: "flex", gap: 9, padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none" } },
                React.createElement("span", { style: { color: "var(--green2)", flexShrink: 0 } }, "\u2713"),
                React.createElement("span", { style: { fontSize: 13, lineHeight: 1.5, color: "var(--muted)" } }, s)))))));
    }
    if (phase === "done") {
        return (React.createElement("div", { style: { paddingTop: 10 } },
            React.createElement(Card, { style: { textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 40 } }, "\uD83C\uDFD4\uFE0F"),
                React.createElement("div", { style: { fontFamily: "var(--display)", fontWeight: 800, fontSize: 20, marginTop: 6 } }, "Sesja uko\u0144czona"),
                React.createElement("div", { style: { fontSize: 13, color: "var(--muted)", marginTop: 4 } }, "\u015Awietna robota. Zapisane do Twojej serii medytacji.")),
            React.createElement("div", { style: sectionTitle }, "Czas wstrzymania w rundach"),
            React.createElement(Card, null, holds.map((h, i) => (React.createElement("div", { key: i, style: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none" } },
                React.createElement("span", { style: { fontSize: 13.5, color: "var(--muted)" } },
                    "Runda ",
                    i + 1),
                React.createElement("span", { style: { fontFamily: "var(--display)", fontWeight: 700, color: "var(--gold2)" } },
                    pad(Math.floor(h / 60)),
                    ":",
                    pad(h % 60)))))),
            React.createElement("button", { onClick: () => setPhase("idle"), style: { ...btnPrimary, marginTop: 14 } }, "Gotowe")));
    }
    return (React.createElement("div", { style: { paddingTop: 4 } },
        React.createElement("div", { style: { textAlign: "center", color: "var(--muted)", fontSize: 13, marginTop: 8 } },
            "Runda ",
            round + 1,
            " / ",
            rounds),
        React.createElement("div", { style: { display: "flex", justifyContent: "center", margin: "22px 0" } },
            React.createElement("div", { style: { width: 240, height: 240, borderRadius: "50%", border: `3px solid ${ring}`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${scale})`, transition: `transform ${phase === "breathe" ? (inhale ? 1.5 : 1.3) : 0.5}s ease-in-out`, background: "var(--surface)" } },
                React.createElement("div", { style: { textAlign: "center" } },
                    phase === "prep" && React.createElement("div", { style: { fontFamily: "var(--display)", fontSize: 60, fontWeight: 800 } }, prep || "•"),
                    phase === "breathe" && (React.createElement(React.Fragment, null,
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontSize: 26, fontWeight: 800 } }, inhale ? "Wdech" : "Wydech"),
                        React.createElement("div", { style: { fontSize: 14, color: "var(--muted)", marginTop: 4 } },
                            Math.min(bc + 1, breaths),
                            " / ",
                            breaths))),
                    phase === "hold" && (React.createElement(React.Fragment, null,
                        React.createElement("div", { style: { fontSize: 14, color: "var(--amber)", fontWeight: 700 } }, "WSTRZYMAJ"),
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontSize: 44, fontWeight: 800, margin: "2px 0" } },
                            pad(Math.floor(hold / 60)),
                            ":",
                            pad(hold % 60)),
                        React.createElement("div", { style: { fontSize: 11, color: "var(--faint)" } }, "puste p\u0142uca"))),
                    phase === "recovery" && (React.createElement(React.Fragment, null,
                        React.createElement("div", { style: { fontSize: 13, color: "var(--green2)", fontWeight: 700 } }, "WDECH I PRZYTRZYMAJ"),
                        React.createElement("div", { style: { fontFamily: "var(--display)", fontSize: 50, fontWeight: 800 } }, rec)))))),
        phase === "breathe" && React.createElement("div", { style: { textAlign: "center", fontSize: 12.5, color: "var(--faint)", marginBottom: 10 } }, "Pe\u0142ny wdech, lu\u017Any wydech. Pod\u0105\u017Caj za ko\u0142em."),
        phase === "hold" && React.createElement("button", { onClick: endHold, style: btnPrimary }, "Wdech \u2014 koniec wstrzymania"),
        phase !== "hold" && React.createElement("button", { onClick: abort, style: { ...btnPrimary, background: "var(--surface2)", color: "var(--muted)" } }, "Zako\u0144cz sesj\u0119"),
        phase === "hold" && React.createElement("button", { onClick: abort, style: { background: "transparent", border: "none", color: "var(--faint)", fontSize: 12, cursor: "pointer", padding: 10, display: "block", margin: "8px auto 0" } }, "Przerwij")));
}
/* ═══════════════ ROZWÓJ — pulpit 8 płaszczyzn ═══════════════ */

