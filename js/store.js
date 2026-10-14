// Progress storage: one JSON document in localStorage, saved after every change.
// The merge() function makes backups/sync safe across devices (unit-tested in tests/store.test.mjs).

export const KEY = 'svenskaquest.v1';
const BAK = 'svenskaquest.v1.bak';
const listeners = new Set();

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function defaultSettings() {
  return {
    dailyGoal: 50,
    sfx: true,
    haptics: true,
    autoplay: true,
    rate: 0.85,
    voice: '',
    native: true,
    speaking: true,
    typing: true,
    showIpa: true,
    theme: 'auto',
    freeMode: false,
  };
}

export function defaultState() {
  return {
    v: 1,
    created: Date.now(),
    updated: Date.now(),
    settingsUpdated: 0,
    name: '',
    avatar: '🦊',
    days: {}, // 'YYYY-MM-DD' -> xp earned that day
    coinsEarned: 0,
    coinsSpent: 0,
    freezes: 0,
    frozen: [], // days covered by a streak freeze
    owned: ['🦊'], // purchased avatars/themes
    theme: 'blue',
    words: {}, // id -> srs record
    units: {}, // unitId -> {lessons, boss, jump}
    ach: {}, // achievement id -> timestamp
    best: {}, // arcade mode -> best score
    counts: {}, // lifetime counters for achievements
    quests: null, // {day, items:[{id, n, done, claimed}]}
    settings: defaultSettings(),
    lastBackup: 0,
    lastSync: 0,
  };
}

function migrate(s) {
  const base = defaultState();
  const out = { ...base, ...s };
  out.settings = { ...base.settings, ...(s.settings || {}) };
  for (const k of ['days', 'words', 'units', 'ach', 'best', 'counts']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  for (const k of ['frozen', 'owned']) if (!Array.isArray(out[k])) out[k] = base[k];
  return out;
}

function readKey(k) {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s === 'object' && s.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export let S = defaultState();
export let storageOk = true;

export function load() {
  const s = readKey(KEY) || readKey(BAK);
  S = s ? migrate(s) : defaultState();
  try {
    localStorage.setItem('svenskaquest.probe', '1');
    localStorage.removeItem('svenskaquest.probe');
  } catch {
    storageOk = false;
  }
  return S;
}

let timer = null;
export function save(now = false) {
  S.updated = Date.now();
  clearTimeout(timer);
  const write = () => {
    try {
      const json = JSON.stringify(S);
      const prev = localStorage.getItem(KEY);
      // Keep yesterday's copy as a safety net against a bad write.
      if (prev && localStorage.getItem('svenskaquest.bakday') !== dayKey()) {
        localStorage.setItem(BAK, prev);
        localStorage.setItem('svenskaquest.bakday', dayKey());
      }
      localStorage.setItem(KEY, json);
      storageOk = true;
    } catch {
      storageOk = false;
    }
  };
  if (now) write();
  else timer = setTimeout(write, 250);
  listeners.forEach((fn) => fn(S));
}

export function flush() {
  if (timer) {
    clearTimeout(timer);
    save(true);
  }
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function replaceState(next) {
  S = migrate(next);
  save(true);
}

// ---------- derived values ----------

export const totalXp = (s = S) => Object.values(s.days).reduce((a, b) => a + b, 0);
export const todayXp = (s = S) => s.days[dayKey()] || 0;
export const coins = (s = S) => Math.max(0, s.coinsEarned - s.coinsSpent);

export function addXp(n) {
  const k = dayKey();
  S.days[k] = (S.days[k] || 0) + n;
}

export function addCoins(n) {
  S.coinsEarned += n;
}

export function spendCoins(n) {
  if (coins() < n) return false;
  S.coinsSpent += n;
  return true;
}

// A day counts towards the streak when any XP was earned, or a streak freeze covered it.
export function streak(s = S, today = dayKey()) {
  const active = (k) => (s.days[k] || 0) > 0 || s.frozen.includes(k);
  let k = active(today) ? today : addDays(today, -1);
  let n = 0;
  while (active(k)) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

// Spend owned streak freezes on missed days since the last active day. Returns days saved.
export function applyFreezes(s = S, today = dayKey()) {
  const activeDays = Object.keys(s.days).filter((k) => s.days[k] > 0).concat(s.frozen).sort();
  const last = activeDays[activeDays.length - 1];
  if (!last || last >= addDays(today, -1)) return 0;
  const missed = [];
  for (let k = addDays(last, 1); k < today; k = addDays(k, 1)) missed.push(k);
  if (!missed.length || s.freezes < missed.length) return 0; // a partial freeze can't rescue the streak
  s.freezes -= missed.length;
  s.frozen.push(...missed);
  return missed.length;
}

// ---------- merge (backup import / cloud sync) ----------

const maxMap = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? -Infinity, v);
  return out;
};

export function merge(a, b) {
  a = migrate(a);
  b = migrate(b);
  const out = migrate({});
  out.created = Math.min(a.created, b.created);
  out.updated = Math.max(a.updated, b.updated);
  const newer = a.updated >= b.updated ? a : b;
  const newerSettings = a.settingsUpdated >= b.settingsUpdated ? a : b;
  out.name = newer.name || a.name || b.name;
  out.avatar = newer.avatar;
  out.theme = newer.theme;
  out.settings = { ...newerSettings.settings };
  out.settingsUpdated = Math.max(a.settingsUpdated, b.settingsUpdated);
  out.days = maxMap(a.days, b.days);
  out.coinsEarned = Math.max(a.coinsEarned, b.coinsEarned);
  out.coinsSpent = Math.max(a.coinsSpent, b.coinsSpent);
  out.freezes = newer.freezes;
  out.frozen = [...new Set([...a.frozen, ...b.frozen])].sort();
  out.owned = [...new Set([...a.owned, ...b.owned])];
  out.words = { ...a.words };
  for (const [id, r] of Object.entries(b.words)) {
    const l = out.words[id];
    if (!l || r.l > l.l || (r.l === l.l && r.b > l.b)) out.words[id] = r;
  }
  out.units = { ...a.units };
  for (const [id, u] of Object.entries(b.units)) out.units[id] = maxMap(out.units[id], u);
  out.ach = { ...b.ach };
  for (const [id, t] of Object.entries(a.ach)) out.ach[id] = Math.min(t, out.ach[id] ?? Infinity);
  out.best = maxMap(a.best, b.best);
  out.counts = maxMap(a.counts, b.counts);
  out.quests = newer.quests;
  out.lastBackup = Math.max(a.lastBackup, b.lastBackup);
  out.lastSync = Math.max(a.lastSync, b.lastSync);
  return out;
}

// Ask the browser not to evict our storage (important on iOS when not installed to the home screen).
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {}
  return false;
}
