/* store.js — IndexedDB（specimens / baselines / rules / runs）與 localStorage 設定。
   FileSystemDirectoryHandle 可結構化複製，所以可以直接 put 進 specimens。 */

const DB_NAME = 'diff-warden';
const DB_VERSION = 1;
export const RUN_LIMIT = 40;

let dbp = null;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (err) { reject(err); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('specimens')) db.createObjectStore('specimens', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('baselines')) db.createObjectStore('baselines', { keyPath: 'specimenId' });
      if (!db.objectStoreNames.contains('rules')) db.createObjectStore('rules', { keyPath: 'fingerprint' });
      if (!db.objectStoreNames.contains('runs')) db.createObjectStore('runs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode) {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(store, value) {
  const os = await tx(store, 'readwrite');
  return wrap(os.put(value));
}
export async function get(store, key) {
  const os = await tx(store, 'readonly');
  return wrap(os.get(key));
}
export async function getAll(store) {
  const os = await tx(store, 'readonly');
  return wrap(os.getAll());
}
export async function del(store, key) {
  const os = await tx(store, 'readwrite');
  return wrap(os.delete(key));
}

/* ---------------------------------------------------------------- rules */

export async function listRules(demo) {
  const all = await getAll('rules').catch(() => []);
  return all.filter((r) => (demo ? r.demo === true : r.demo !== true))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function saveRule(rule) { return put('rules', rule); }

export async function bumpRule(fp, at) {
  const r = await get('rules', fp);
  if (!r) return null;
  r.hits = (r.hits || 0) + 1;
  r.lastHitAt = at;
  await put('rules', r);
  return r;
}

export async function clearDemo() {
  const rules = await getAll('rules').catch(() => []);
  for (const r of rules) if (r.demo) await del('rules', r.fingerprint);
  const runs = await getAll('runs').catch(() => []);
  for (const r of runs) if (r.demo) await del('runs', r.id);
}

/* ----------------------------------------------------------------- runs */

export async function listRuns(demo) {
  const all = await getAll('runs').catch(() => []);
  return all.filter((r) => (demo ? r.demo === true : r.demo !== true))
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

/** 歷史報告硬上限 40 次，超過時汰舊。回傳被刪掉的筆數。 */
export async function saveRun(run) {
  await put('runs', run);
  const all = await listRuns(run.demo);
  let dropped = 0;
  while (all.length > RUN_LIMIT) {
    const old = all.shift();
    await del('runs', old.id);
    dropped += 1;
  }
  return dropped;
}

/* --------------------------------------------------------- localStorage */

const LS = {
  read(k, fallback) {
    try { const v = localStorage.getItem(k); return v === null ? fallback : v; }
    catch { return fallback; }
  },
  write(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const settings = {
  key(provider) { return LS.read('dw.key.' + provider, ''); },
  setKey(provider, v) { return v ? LS.write('dw.key.' + provider, v) : (LS.remove('dw.key.' + provider), true); },
  provider() { return LS.read('dw.provider', 'anthropic'); },
  setProvider(v) { LS.write('dw.provider', v); },
  model(provider) { return LS.read('dw.model.' + provider, ''); },
  setModel(provider, v) { LS.write('dw.model.' + provider, v); },
  budget() { return parseInt(LS.read('dw.budget', '60000'), 10) || 60000; },
  setBudget(v) { LS.write('dw.budget', String(v)); },
  excludes(id) {
    const raw = LS.read('dw.excludes.' + id, '');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  setExcludes(id, arr) { LS.write('dw.excludes.' + id, JSON.stringify(arr)); },
  lastSpecimen() { return LS.read('dw.specimen', ''); },
  setLastSpecimen(v) { LS.write('dw.specimen', v); },
};

/** navigator.storage.estimate() -> 0..1，取不到回 null */
export async function storagePressure() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (!quota) return null;
    return usage / quota;
  } catch { return null; }
}
