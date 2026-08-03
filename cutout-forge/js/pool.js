/* Worker pool for the chroma-key path, with an inline fallback.

   A module worker is the fast path. It fails in two real situations we have
   to survive: a page opened straight off the disk with file:// (no worker
   origin), and browsers without module workers. In both cases the same
   functions run on the main thread with a frame yield between photos, so the
   button still does something when it is pressed. That is the whole point of
   the floor path. */

import { chromaKey, featherMask, maskMetrics } from './chroma.js';

let nextId = 1;

export class ChromaPool {
  constructor(size = 2) {
    this.size = Math.max(1, size);
    this.workers = [];
    this.pending = new Map();
    this.rr = 0;
    this.inline = false;
    this.ready = this._boot();
  }

  async _boot() {
    if (typeof Worker !== 'function') { this.inline = true; return 'inline'; }
    try {
      const url = new URL('./worker.js', import.meta.url);
      this._url = url;
      for (let i = 0; i < this.size; i++) this.workers.push(this._spawn(url));
      await this._ping(this.workers[0], 2500);
      return 'worker';
    } catch {
      this.workers.forEach(w => { try { w.terminate(); } catch { /* already gone */ } });
      this.workers = [];
      this.inline = true;
      return 'inline';
    }
  }

  _ping(worker, timeout) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('worker did not answer')); }, timeout);
      this.pending.set(id, { resolve: () => { clearTimeout(timer); resolve(); }, reject });
      worker.postMessage({ type: 'ping', id });
    });
  }

  _onMessage(msg) {
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    if (msg.type === 'cut:error') entry.reject(new Error(msg.message));
    else entry.resolve(msg);
  }

  _post(payload, transfer) {
    return new Promise((resolve, reject) => {
      const id = payload.id;
      this.pending.set(id, { resolve, reject });
      const worker = this.workers[this.rr++ % this.workers.length];
      worker.postMessage(payload, transfer);
    });
  }

  /** rgba is consumed. Returns mask (0/255), alpha, and real measurements. */
  async cut(rgba, w, h, feather) {
    await this.ready;
    if (!this.inline && this.workers.length) {
      try {
        const buf = rgba.buffer;
        const msg = await this._post({ type: 'cut', id: nextId++, rgba: buf, w, h, feather }, [buf]);
        return {
          mask: new Uint8Array(msg.mask),
          alpha: new Uint8ClampedArray(msg.alpha),
          bg: msg.bg, bgHex: msg.bgHex, spread: msg.spread, tol: msg.tol,
          coverage: msg.coverage, soft: msg.soft, ms: msg.ms,
        };
      } catch {
        this.inline = true;   // one failure and we stop trusting the worker
      }
    }
    const t0 = performance.now();
    const res = chromaKey(rgba, w, h);
    const alpha = featherMask(res.mask, w, h, feather);
    const metrics = maskMetrics(alpha);
    return { ...res, alpha, ...metrics, ms: performance.now() - t0 };
  }

  /** Re-feathers a stored mask. Milliseconds, so the inspector sliders are live. */
  async refeather(mask, w, h, feather) {
    await this.ready;
    if (!this.inline && this.workers.length) {
      try {
        const copy = Uint8Array.from(mask);
        const msg = await this._post({ type: 'feather', id: nextId++, mask: copy.buffer, w, h, feather }, [copy.buffer]);
        return {
          mask: new Uint8Array(msg.mask),
          alpha: new Uint8ClampedArray(msg.alpha),
          coverage: msg.coverage, soft: msg.soft,
        };
      } catch {
        this.inline = true;
      }
    }
    const alpha = featherMask(mask, w, h, feather);
    return { mask, alpha, ...maskMetrics(alpha) };
  }

  _spawn(url) {
    const w = new Worker(url, { type: 'module' });
    w.onmessage = (ev) => this._onMessage(ev.data);
    w.onerror = () => { this.inline = true; };
    return w;
  }

  /** Grows once the hardware probe lands, shrinks when memory gets tight. */
  resize(size) {
    this.size = Math.max(1, size);
    while (this.workers.length > this.size) {
      const w = this.workers.pop();
      try { w.terminate(); } catch { /* already gone */ }
    }
    if (this.inline || !this._url) return;
    while (this.workers.length < this.size) {
      try { this.workers.push(this._spawn(this._url)); }
      catch { break; }
    }
  }
}
