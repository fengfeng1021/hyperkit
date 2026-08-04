/* Local assets: the list library, the layout presets, the run ledger.
   These three stores are the reason the tenth book costs almost nothing to set
   up. The library is never cleared automatically; when quota runs out the run
   ledger is trimmed and the user is told, in that order. */

const DB_NAME = 'puzzle-press';
const DB_VERSION = 1;
const RUNS_KEEP = 24;

let dbPromise = null;
export const state = {
  available: true,
  reason: '',
  memoryLists: [],
};

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lists')) db.createObjectStore('lists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('presets')) db.createObjectStore('presets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('runs')) db.createObjectStore('runs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB blocked'));
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  }).catch((err) => {
    state.available = false;
    state.reason = err && err.message ? err.message : String(err);
    throw err;
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    try {
      result = fn(s);
    } catch (err) {
      reject(err);
      return;
    }
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  });
}

function all(store) {
  return tx(store, 'readonly', (s) => s.getAll());
}

export async function init() {
  try {
    await open();
    state.available = true;
    return true;
  } catch (err) {
    state.available = false;
    return false;
  }
}

/* ---------- lists ---------- */

export async function getLists() {
  if (!state.available) return state.memoryLists.slice();
  try {
    const rows = await all('lists');
    return (rows || []).sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
  } catch (err) {
    return state.memoryLists.slice();
  }
}

export async function putList(list) {
  const row = { createdAt: Date.now(), uses: 0, tooLongWords: [], ...list };
  if (!state.available) {
    const i = state.memoryLists.findIndex((l) => l.id === row.id);
    if (i >= 0) state.memoryLists[i] = row;
    else state.memoryLists.unshift(row);
    return row;
  }
  await tx('lists', 'readwrite', (s) => s.put(row));
  return row;
}

export async function deleteList(id) {
  if (!state.available) {
    state.memoryLists = state.memoryLists.filter((l) => l.id !== id);
    return;
  }
  await tx('lists', 'readwrite', (s) => s.delete(id));
}

export async function markListUsed(id, bookTitle) {
  const lists = await getLists();
  const row = lists.find((l) => l.id === id);
  if (!row) return null;
  row.uses = (row.uses || 0) + 1;
  row.usedAt = Date.now();
  row.lastBook = bookTitle;
  return putList(row);
}

export async function recordTooLong(id, words, minGrid) {
  const lists = await getLists();
  const row = lists.find((l) => l.id === id);
  if (!row) return null;
  const map = new Map((row.tooLongWords || []).map((w) => [w.word, w]));
  words.forEach((w) => {
    const prev = map.get(w.word || w);
    const grid = w.minGrid || minGrid;
    if (!prev || grid > prev.minGrid) map.set(w.word || w, { word: w.word || w, minGrid: grid });
  });
  row.tooLongWords = Array.from(map.values());
  return putList(row);
}

/* ---------- presets ---------- */

const LS_KEY = 'puzzle-press:last';

export async function getPreset(id = 'last') {
  if (!state.available) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }
  try {
    return await tx('presets', 'readonly', (s) => s.get(id));
  } catch (err) {
    return null;
  }
}

export async function putPreset(preset, id = 'last') {
  const row = { ...preset, id, savedAt: Date.now() };
  if (!state.available) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(row));
    } catch (err) {
      /* nothing left to fall back to; the interface already says so */
    }
    return row;
  }
  try {
    await tx('presets', 'readwrite', (s) => s.put(row));
  } catch (err) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(row));
    } catch (e2) {
      /* ignore */
    }
  }
  return row;
}

export async function getPresets() {
  if (!state.available) return [];
  try {
    const rows = await all('presets');
    return rows || [];
  } catch (err) {
    return [];
  }
}

/* ---------- runs ---------- */

export async function getRuns() {
  if (!state.available) return [];
  try {
    const rows = await all('runs');
    return (rows || []).sort((a, b) => b.at - a.at);
  } catch (err) {
    return [];
  }
}

export async function addRun(run) {
  if (!state.available) return { trimmed: 0, quota: false };
  const row = { id: `${run.at}-${run.seed}`, ...run };
  try {
    await tx('runs', 'readwrite', (s) => s.put(row));
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      const trimmed = await trimRuns(8);
      try {
        await tx('runs', 'readwrite', (s) => s.put(row));
      } catch (e2) {
        return { trimmed, quota: true, failed: true };
      }
      return { trimmed, quota: true };
    }
    return { trimmed: 0, quota: false, failed: true };
  }
  const rows = await getRuns();
  if (rows.length > RUNS_KEEP) {
    const drop = rows.slice(RUNS_KEEP);
    await Promise.all(drop.map((r) => tx('runs', 'readwrite', (s) => s.delete(r.id))));
  }
  return { trimmed: 0, quota: false };
}

export async function trimRuns(keep) {
  const rows = await getRuns();
  const drop = rows.slice(keep);
  await Promise.all(drop.map((r) => tx('runs', 'readwrite', (s) => s.delete(r.id)).catch(() => {})));
  return drop.length;
}

export async function clearRuns() {
  if (!state.available) return;
  await tx('runs', 'readwrite', (s) => s.clear());
}

/* ---------- tally ---------- */

export function tally(runs) {
  const books = runs.length;
  const puzzles = runs.reduce((n, r) => n + (r.count || 0), 0);
  const failedBooks = runs.filter((r) => (r.failed || 0) > 0).length;
  const failedPuzzles = runs.reduce((n, r) => n + (r.failed || 0), 0);
  return { books, puzzles, failedBooks, failedPuzzles };
}

/* ---------- export / import ---------- */

export async function exportLibrary() {
  const lists = await getLists();
  const presets = await getPresets();
  const runs = await getRuns();
  return {
    format: 'puzzle-press-library',
    version: 1,
    exportedAt: new Date().toISOString(),
    lists,
    presets,
    runs,
  };
}

export async function importLibrary(payload) {
  if (!payload || payload.format !== 'puzzle-press-library') {
    throw new Error('這不是清單庫 JSON（缺少 format 標記）。');
  }
  const lists = Array.isArray(payload.lists) ? payload.lists : [];
  let added = 0;
  for (let i = 0; i < lists.length; i += 1) {
    const l = lists[i];
    if (!l || !l.id || !Array.isArray(l.words)) continue;
    /* eslint-disable no-await-in-loop */
    await putList(l);
    added += 1;
  }
  return added;
}
