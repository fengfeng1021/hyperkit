/* Controller for the optional meaning search.

   Contract with the rest of the app:
     - no network request happens until enable() is called from a click
     - every failure resolves to { ok:false } instead of throwing
     - keyword search keeps working in every failure case */

import { putMeta, getMeta } from "./store.js";

const DIMS = 384;

export class Semantic {
  constructor() {
    this.worker = null;
    this.vectors = null;
    this.ids = null;
    this.state = "idle"; // idle | downloading | building | ready | failed | cancelled
    this.progress = { loaded: 0, total: 0, done: 0, of: 0 };
    this.listeners = new Set();
    this.pendingQuery = null;
    this.queryId = 0;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      try {
        fn(this);
      } catch (err) {
        console.debug("chatvault: semantic listener failed", err);
      }
    }
  }

  set(state, patch) {
    this.state = state;
    if (patch) Object.assign(this.progress, patch);
    this.notify();
  }

  async restore(convIds) {
    try {
      const saved = await getMeta("vectors");
      if (saved && saved.ids && saved.data && saved.ids.length === convIds.length) {
        const same = saved.ids.every((id, i) => id === convIds[i]);
        if (same) {
          this.vectors = new Float32Array(saved.data);
          this.ids = saved.ids;
          this.set("ready");
          return true;
        }
      }
    } catch (err) {
      console.debug("chatvault: stored vectors unreadable", err);
    }
    return false;
  }

  spawn() {
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL("./worker/embed-worker.js", import.meta.url), { type: "module" });
    } catch (err) {
      console.debug("chatvault: embedding worker unavailable", err);
      this.set("failed");
      return null;
    }
    this.worker.onmessage = (e) => this.handle(e.data || {});
    this.worker.onerror = () => this.set("failed");
    return this.worker;
  }

  handle(msg) {
    if (msg.type === "download") this.set("downloading", { loaded: msg.loaded, total: msg.total });
    else if (msg.type === "ready") this.set("building");
    else if (msg.type === "vectors") this.set("building", { done: msg.done, of: msg.total });
    else if (msg.type === "built") {
      this.vectors = msg.vectors;
      this.set("ready");
      putMeta("vectors", { ids: this.ids, data: this.vectors.buffer.slice(0) }).catch(() => {});
    } else if (msg.type === "queryVector") {
      if (this.pendingQuery && this.pendingQuery.id === msg.id) {
        this.pendingQuery.resolve(msg.vector);
        this.pendingQuery = null;
      }
    } else if (msg.type === "cancelled") {
      this.set("cancelled");
    } else if (msg.type === "failed") {
      console.debug("chatvault: meaning search unavailable", msg.stage, msg.message);
      if (this.pendingQuery) {
        this.pendingQuery.resolve(null);
        this.pendingQuery = null;
      }
      this.set("failed");
    }
  }

  /** @param {{id:string, text:string}[]} docs */
  enable(docs) {
    const worker = this.spawn();
    if (!worker) return false;
    this.ids = docs.map((d) => d.id);
    this.set("downloading", { loaded: 0, total: 0, done: 0, of: docs.length });
    worker.postMessage({ type: "build", texts: docs.map((d) => d.text.slice(0, 1800)) });
    return true;
  }

  cancel() {
    if (this.worker) this.worker.postMessage({ type: "cancel" });
    this.set("cancelled");
  }

  /** @returns {Promise<Float32Array|null>} */
  embedQuery(text) {
    const worker = this.spawn();
    if (!worker || this.state !== "ready") return Promise.resolve(null);
    const id = ++this.queryId;
    return new Promise((resolve) => {
      this.pendingQuery = { id, resolve };
      worker.postMessage({ type: "query", text, dims: DIMS, id });
      setTimeout(() => {
        if (this.pendingQuery && this.pendingQuery.id === id) {
          this.pendingQuery.resolve(null);
          this.pendingQuery = null;
        }
      }, 8000);
    });
  }

  /** Brute-force cosine. A few thousand vectors is well under a frame. */
  rank(queryVector, limit = 200) {
    if (!queryVector || !this.vectors || !this.ids) return [];
    const n = this.ids.length;
    const scored = [];
    for (let i = 0; i < n; i++) {
      let dot = 0;
      const base = i * DIMS;
      for (let d = 0; d < DIMS; d++) dot += this.vectors[base + d] * queryVector[d];
      scored.push([i, dot]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, limit).map(([i, score]) => ({ id: this.ids[i], score }));
  }
}
