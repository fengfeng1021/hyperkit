/* storage.js
   localStorage（欄位對映、手動分類、回饋費率）與 IndexedDB（歷年彙總）。
   兩者都必須在被拒絕時安靜降級成記憶體，而且要能告訴使用者發生了什麼。
   失敗路徑見 docs/INTERACTION.md §5 第 8、9 條。 */

const PREFIX = 'iwtw:';
const memory = new Map();

/** 一旦寫入失敗就永久改用記憶體，不再反覆嘗試。 */
export const storageState = {
  persistent: true,
  reason: '',
};

function fallback(err) {
  if (storageState.persistent) {
    storageState.persistent = false;
    storageState.reason = err && err.name === 'QuotaExceededError'
      ? '瀏覽器儲存空間已滿'
      : '瀏覽器不允許這個頁面寫入儲存空間（可能是無痕模式）';
  }
}

export function lsGet(key, def = null) {
  const k = PREFIX + key;
  if (memory.has(k)) return memory.get(k);
  try {
    const raw = window.localStorage.getItem(k);
    if (raw == null) return def;
    return JSON.parse(raw);
  } catch (err) {
    fallback(err);
    return def;
  }
}

export function lsSet(key, value) {
  const k = PREFIX + key;
  memory.set(k, value);
  if (!storageState.persistent) return false;
  try {
    window.localStorage.setItem(k, JSON.stringify(value));
    return true;
  } catch (err) {
    fallback(err);
    return false;
  }
}

export function lsRemove(key) {
  const k = PREFIX + key;
  memory.delete(k);
  try { window.localStorage.removeItem(k); } catch (err) { fallback(err); }
}

/** 這個站在 localStorage 佔用的位元組數，用於「清除本站舊資料」按鈕 */
export function lsFootprint() {
  let total = 0;
  let count = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      total += k.length + (window.localStorage.getItem(k) || '').length;
      count++;
    }
  } catch (err) { fallback(err); }
  return { bytes: total * 2, keys: count };
}

export function lsClearAll() {
  const keys = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch (err) { fallback(err); }
  memory.clear();
  return keys.length;
}

/* ---------------- IndexedDB：歷年彙總 ---------------- */

const DB_NAME = 'iwtw';
const DB_VERSION = 1;
const STORE = 'years';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'year' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function saveYear(year, payload) {
  const db = await openDb();
  if (!db) return { ok: false, reason: '這個瀏覽器沒有可用的 IndexedDB，這次的分析不會被保存。' };

  // 事前配額檢查：空間不足時直接走降級路徑，不要等到寫入炸掉。
  let dropRaw = false;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      if (quota && quota - usage < 12 * 1024 * 1024) dropRaw = true;
    }
  } catch { /* estimate 不支援就照常寫 */ }

  const record = {
    year,
    summary: payload.summary,
    invoices: dropRaw ? null : payload.invoices,
    savedAt: Date.now(),
    source: payload.source,
  };

  const write = (rec) => new Promise((resolve) => {
    try {
      const req = tx(db, 'readwrite').put(rec);
      req.onsuccess = () => resolve({ ok: true, degraded: rec.invoices == null });
      req.onerror = () => resolve({ ok: false, err: req.error });
    } catch (err) { resolve({ ok: false, err }); }
  });

  let res = await write(record);
  if (!res.ok && record.invoices) {
    // 降級：只留彙總，丟掉逐筆原始列
    res = await write({ ...record, invoices: null });
    if (res.ok) return { ok: true, degraded: true };
  }
  if (!res.ok) {
    return { ok: false, reason: '儲存空間不足，這個年度沒有被保存。你可以在下方清單刪掉舊的年度再試一次。' };
  }
  return res;
}

export async function listYears() {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = tx(db, 'readonly').getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.year - a.year));
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

export async function deleteYear(year) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const req = tx(db, 'readwrite').delete(year);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}
