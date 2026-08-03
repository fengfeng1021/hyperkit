/* IndexedDB: the vault itself.

   Rules that are not negotiable, because getting them wrong loses a user's
   archive rather than degrading their experience:
     - every write is inside a transaction, chunked, and rolls back whole
     - a second import of the same export MERGES, it never overwrites
     - a parse failure never deletes what was already stored
     - clearing is the only destructive action and it is guarded by typing */

const DB_NAME = "chatvault";
const DB_VERSION = 1;
const CHUNK = 200;

let dbPromise = null;

export function openDb() {
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
      if (!db.objectStoreNames.contains("conversations")) {
        const store = db.createObjectStore("conversations", { keyPath: "id" });
        store.createIndex("source", "source");
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("database blocked by another tab"));
  });
  return dbPromise;
}

function tx(db, stores, mode) {
  return db.transaction(stores, mode);
}

function done(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("transaction aborted"));
    transaction.onerror = () => reject(transaction.error);
  });
}

export class QuotaError extends Error {}

/**
 * Merge records into the vault. Existing ids are kept, not replaced, so a
 * re-import of an overlapping export cannot damage what is already stored.
 * @returns {{added:number, existing:number}}
 */
export async function mergeConversations(records, onProgress) {
  const db = await openDb();
  const existingIds = new Set(await allIds());
  const fresh = records.filter((r) => !existingIds.has(r.id));
  let written = 0;

  for (let i = 0; i < fresh.length; i += CHUNK) {
    const slice = fresh.slice(i, i + CHUNK);
    const transaction = tx(db, ["conversations"], "readwrite");
    const store = transaction.objectStore("conversations");
    for (const rec of slice) store.put(stripRuntime(rec));
    try {
      await done(transaction);
    } catch (err) {
      if (err && (err.name === "QuotaExceededError" || /quota/i.test(String(err.message)))) {
        throw new QuotaError(String(err.message));
      }
      throw err;
    }
    written += slice.length;
    if (onProgress) onProgress(written, fresh.length);
  }
  return { added: fresh.length, existing: records.length - fresh.length };
}

function stripRuntime(rec) {
  const { pathIds, ...rest } = rec;
  void pathIds;
  return rest;
}

export async function allIds() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, ["conversations"], "readonly").objectStore("conversations").getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, ["conversations"], "readonly").objectStore("conversations").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function countConversations() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, ["conversations"], "readonly").objectStore("conversations").count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeSource(source) {
  const db = await openDb();
  const transaction = tx(db, ["conversations"], "readwrite");
  const store = transaction.objectStore("conversations");
  const req = store.index("source").getAllKeys(source);
  const keys = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  for (const k of keys) store.delete(k);
  await done(transaction);
  return keys.length;
}

export async function clearVault() {
  const db = await openDb();
  const transaction = tx(db, ["conversations", "meta"], "readwrite");
  transaction.objectStore("conversations").clear();
  transaction.objectStore("meta").clear();
  await done(transaction);
}

export async function putMeta(k, v) {
  const db = await openDb();
  const transaction = tx(db, ["meta"], "readwrite");
  transaction.objectStore("meta").put({ k, v });
  try {
    await done(transaction);
    return true;
  } catch (err) {
    console.debug("chatvault: meta write failed", err);
    return false;
  }
}

export async function getMeta(k) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, ["meta"], "readonly").objectStore("meta").get(k);
    req.onsuccess = () => resolve(req.result ? req.result.v : undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage || 0, quota: quota || 0 };
  } catch (err) {
    console.debug("chatvault: storage estimate unavailable", err);
    return null;
  }
}

export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch (err) {
    console.debug("chatvault: persist request failed", err);
    return false;
  }
}

export async function isPersisted() {
  if (!navigator.storage || !navigator.storage.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}
