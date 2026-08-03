/* ==========================================================================
   GradientKit - library.js
   localStorage saved library. Everything stays on this device; there is no
   account and no server. Three failure modes are handled as first-class
   states, not as thrown errors: storage blocked, quota full, corrupt payload.
   ========================================================================== */

const KEY = 'gk.saved.v1';
const SEEN_KEY = 'gk.seen';

let available = null;

/** Probe once. Private mode and blocked-storage policies throw on write, not
 *  on read, so a read-only check is not enough. */
export function storageAvailable() {
  if (available !== null) return available;
  try {
    const probe = '__gk_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function loadAll() {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.hash === 'string' && typeof e.name === 'string')
      .map((e) => ({ hash: e.hash, name: e.name.slice(0, 48), at: Number(e.at) || 0 }));
  } catch {
    // A corrupt payload is treated as an empty library rather than a crash.
    return [];
  }
}

/** @returns {'ok'|'quota'|'blocked'} */
export function save(entry) {
  if (!storageAvailable()) return 'blocked';
  const all = loadAll();
  all.unshift({ hash: entry.hash, name: entry.name, at: Date.now() });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all.slice(0, 200)));
    return 'ok';
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) return 'quota';
    return 'blocked';
  }
}

export function remove(hash) {
  if (!storageAvailable()) return 'blocked';
  const all = loadAll().filter((e) => e.hash !== hash);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
    return 'ok';
  } catch {
    return 'blocked';
  }
}

export function has(hash) {
  return loadAll().some((e) => e.hash === hash);
}

export function markSeen() {
  if (!storageAvailable()) return;
  try { window.localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* not critical */ }
}

export function hasSeen() {
  if (!storageAvailable()) return false;
  try { return window.localStorage.getItem(SEEN_KEY) !== null; } catch { return false; }
}

/** Relative time in the product's own voice. No library, no locale guessing
 *  beyond what Intl already knows. */
export function relativeTime(ms) {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(ms).toISOString().slice(0, 10);
}
