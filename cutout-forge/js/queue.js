/* ==========================================================================
   The queue. This is the part competitors do not have: pause, resume, retry,
   remove, and a concurrency number that drops itself when memory gets tight.

   Memory discipline, enforced here and nowhere else:
     - display decode is capped at 512 px on the long edge
     - the only thing kept per photo is a 512 px mask, about 256 KB
     - full resolution is opened one photo at a time, during export only
   ========================================================================== */

import { readImageSize, unsupportedMessage, makeCanvas, clamp } from './util.js';
import { featherMask, maskMetrics } from './chroma.js';
import { cutout } from './compose.js';
import { engine } from './engine.js';
import { ChromaPool } from './pool.js';

export const WORK_EDGE = 512;    // resolution the cutout maths runs at
export const TILE_EDGE = 256;    // resolution a thumbnail is painted at
const MAX_EDGE = 12000;          // above this we downscale for export (F6)
const EXPORT_EDGE = 8000;

let seq = 0;

export class Queue {
  constructor() {
    this.items = [];
    this.concurrency = engine.concurrency || 2;
    this.pool = new ChromaPool(this.concurrency);
    this.running = false;
    this.paused = false;
    this.startedAt = 0;
    this.elapsed = 0;
    this.active = 0;
    this.skipped = [];
    this._handlers = new Map();
    this._undo = null;
    this.renderer = { original() {}, result() {}, clearOriginal() {} };
    this.defaults = { feather: 1.5, despill: 0.4 };
  }

  /* ------------------------------------------------------------- events */

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this._handlers.get(type).delete(fn);
  }

  emit(type, payload) {
    const set = this._handlers.get(type);
    if (set) for (const fn of set) fn(payload);
  }

  /* ------------------------------------------------------------ counting */

  get counts() {
    const c = { total: 0, queued: 0, running: 0, done: 0, flagged: 0, failed: 0, skipped: 0, paused: 0 };
    for (const it of this.items) {
      if (it.status === 'skipped') { c.skipped++; continue; }
      c.total++;
      if (c[it.status] !== undefined) c[it.status]++;
      if (it.status === 'decoding') c.running++;
    }
    c.finished = c.done + c.flagged + c.failed;
    c.pending = c.total - c.finished;
    return c;
  }

  get deliverable() {
    return this.items.filter(i => i.status === 'done' || i.status === 'flagged');
  }

  eta() {
    const c = this.counts;
    const resolved = c.done + c.flagged + c.failed;
    /* No estimate until five real photos have gone through. A percentage
       invented from nothing is the thing every other tool does. */
    if (resolved < 5) return null;
    const spent = this.elapsed + (this.running && this.startedAt ? performance.now() - this.startedAt : 0);
    if (spent <= 0) return null;
    const per = spent / resolved;
    const left = c.total - resolved;
    if (left <= 0) return 0;
    return per * left;
  }

  /* ---------------------------------------------------------------- add */

  add(files) {
    const accepted = [];
    for (const file of files) {
      const looksImage = /^image\//.test(file.type) || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(file.name);
      const item = {
        id: `p${++seq}`,
        file,
        name: file.name,
        size: file.size,
        width: 0, height: 0,
        tw: 0, th: 0,
        status: looksImage ? 'queued' : 'skipped',
        mode: null,
        mask: null,
        bg: null, bgHex: '', spread: 0,
        coverage: 0, soft: 0, ms: 0,
        feather: this.defaults.feather,
        despill: this.defaults.despill,
        flagReason: '', error: '', skipReason: '',
        attempts: 0, downscaled: false, reviewed: false,
      };
      if (!looksImage) {
        item.skipReason = unsupportedMessage(file.name);
        this.skipped.push(item);
      }
      this.items.push(item);
      accepted.push(item);
    }
    this.emit('items', { added: accepted });
    return accepted;
  }

  remove(ids) {
    const set = new Set(ids);
    const removed = this.items.filter(i => set.has(i.id));
    if (!removed.length) return null;
    const positions = removed.map(i => this.items.indexOf(i));
    this.items = this.items.filter(i => !set.has(i.id));
    for (const it of removed) { it.mask = null; }
    this._undo = { removed, positions, at: Date.now() };
    this.emit('items', { removed });
    return this._undo;
  }

  undoRemove() {
    if (!this._undo) return false;
    const { removed, positions } = this._undo;
    removed.forEach((it, i) => {
      const at = clamp(positions[i], 0, this.items.length);
      this.items.splice(at, 0, it);
    });
    this._undo = null;
    this.emit('items', { restored: removed });
    return true;
  }

  clear() {
    const removed = this.items.slice();
    this.items = [];
    this.skipped = [];
    this.running = false;
    this.paused = false;
    this.startedAt = 0;
    this.elapsed = 0;
    this._undo = null;
    this.emit('items', { removed, cleared: true });
  }

  byId(id) { return this.items.find(i => i.id === id) || null; }

  /* ------------------------------------------------------------ transport */

  start() {
    if (this.running) return;
    const c = this.counts;
    if (!c.queued && !c.paused) return;
    for (const it of this.items) if (it.status === 'paused') it.status = 'queued';
    this.running = true;
    this.paused = false;
    this.startedAt = performance.now();
    this.emit('transport', this.state());
    this._pump();
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    this.paused = true;
    this.elapsed += performance.now() - this.startedAt;
    this.startedAt = 0;
    for (const it of this.items) if (it.status === 'queued') { it.status = 'paused'; this.emit('item', { item: it }); }
    this.emit('transport', this.state());
  }

  resume() { this.start(); }

  retry(ids) {
    const set = ids ? new Set(ids) : null;
    let n = 0;
    for (const it of this.items) {
      if (set && !set.has(it.id)) continue;
      if (!set && it.status !== 'failed') continue;
      if (it.status === 'skipped') continue;
      it.status = 'queued';
      it.error = '';
      it.flagReason = '';
      it.attempts = 0;
      it.mask = null;
      n++;
      this.emit('item', { item: it });
    }
    if (n) { this.emit('items', {}); this.start(); }
    return n;
  }

  state() {
    return {
      running: this.running, paused: this.paused,
      counts: this.counts, concurrency: this.concurrency, eta: this.eta(),
    };
  }

  /* -------------------------------------------------------------- pumping */

  _pump() {
    if (!this.running) { this._settle(); return; }
    while (this.active < this.concurrency) {
      const next = this.items.find(i => i.status === 'queued');
      if (!next) break;
      this.active++;
      next.status = 'decoding';
      this.emit('item', { item: next });
      this._process(next).finally(() => {
        this.active--;
        this.emit('progress', this.state());
        this._pump();
      });
    }
    if (this.active === 0) this._settle();
  }

  _settle() {
    const c = this.counts;
    if (this.active === 0 && c.pending === 0 && (this.running || this.paused)) {
      if (this.running) { this.elapsed += performance.now() - this.startedAt; this.startedAt = 0; }
      this.running = false;
      this.paused = false;
      this.emit('transport', this.state());
      this.emit('complete', this.state());
    } else {
      this.emit('transport', this.state());
    }
  }

  lowerConcurrency(reason) {
    if (this.concurrency <= 1) return false;
    this.concurrency = Math.max(1, Math.floor(this.concurrency / 2));
    this.pool.resize(this.concurrency);
    this.emit('pressure', { concurrency: this.concurrency, reason });
    return true;
  }

  /* ------------------------------------------------------ single photo */

  async _process(item) {
    let bitmap = null;
    try {
      /* --- 1. dimensions from the header, so we can plan the decode ------ */
      if (!item.width) {
        const dims = await readImageSize(item.file);
        if (dims && dims.width > 0) { item.width = dims.width; item.height = dims.height; }
      }

      /* --- 2. decode, capped at WORK_EDGE on the long side --------------- */
      const opts = { resizeQuality: 'medium' };
      if (item.width && item.height) {
        if (item.width >= item.height) opts.resizeWidth = Math.min(WORK_EDGE, item.width);
        else opts.resizeHeight = Math.min(WORK_EDGE, item.height);
      } else {
        opts.resizeWidth = WORK_EDGE;
      }

      try {
        bitmap = await createImageBitmap(item.file, opts);
      } catch (err) {
        const formatProblem = /^image\//.test(item.file.type) === false
          || /decode|format|source image|unsupported/i.test(String(err && err.message));
        if (formatProblem) {
          item.status = 'skipped';
          item.skipReason = unsupportedMessage(item.name);
          this.skipped.push(item);
          this.emit('item', { item });
          this.emit('items', {});
          return;
        }
        item.attempts++;
        if (item.attempts < 2) {
          this.lowerConcurrency('a photo could not be decoded');
          item.status = 'queued';
          this.emit('item', { item });
          return;
        }
        throw err;
      }

      if (!item.width) { item.width = bitmap.width; item.height = bitmap.height; }
      item.tw = bitmap.width;
      item.th = bitmap.height;
      if (Math.max(item.width, item.height) > MAX_EDGE) {
        item.downscaled = true;
        this.emit('alert', {
          kind: 'info',
          text: `${item.name} is ${item.width} px wide. Exporting at ${EXPORT_EDGE} px instead.`,
        });
      }

      /* --- 3. paint the original into the tile --------------------------- */
      this.renderer.original(item, bitmap);

      item.status = 'running';
      this.emit('item', { item });

      /* --- 4. read the working pixels ----------------------------------- */
      const { canvas: work, ctx } = makeCanvas(item.tw, item.th);
      ctx.drawImage(bitmap, 0, 0);
      const rgba = ctx.getImageData(0, 0, item.tw, item.th).data;
      work.width = 1; work.height = 1;   // release the backing store immediately

      /* --- 5. cut it out, with the ladder underneath -------------------- */
      let mask = null, meta = {};
      const t0 = performance.now();

      if (engine.mode === 'model' && engine.modelStatus === 'ready') {
        try {
          mask = await engine.run(rgba, item.tw, item.th);
          item.mode = `model (${engine.device})`;
          engine.consecutiveModelFailures = 0;
          meta.bgHex = sampleBorderHex(rgba, item.tw, item.th);
        } catch (err) {
          engine.consecutiveModelFailures++;
          mask = null;
          if (engine.consecutiveModelFailures >= 2) {
            engine.useChroma('inference failed twice');
            this.emit('alert', {
              kind: 'warn',
              text: 'The model failed twice in a row. Switched to chroma-key for the rest of this batch.',
            });
          }
        }
      }

      if (!mask) {
        const res = await this.pool.cut(Uint8ClampedArray.from(rgba), item.tw, item.th, 0);
        mask = res.mask;
        item.mode = 'chroma-key';
        meta = { bg: res.bg, bgHex: res.bgHex, spread: res.spread, tol: res.tol };
      }

      item.ms = performance.now() - t0;
      item.mask = mask;
      item.bg = meta.bg || null;
      item.bgHex = meta.bgHex || '';
      item.spread = meta.spread || 0;

      /* --- 6. feather, measure, decide whether a human should look ----- */
      const alpha = featherMask(mask, item.tw, item.th, item.feather);
      const m = maskMetrics(alpha);
      item.coverage = m.coverage;
      item.soft = m.soft;

      item.flagReason = flagFor(item);
      item.status = item.flagReason ? 'flagged' : 'done';

      /* --- 7. paint the result and let the original go ----------------- */
      this.renderer.result(item, bitmap, alpha);
      this.emit('item', { item, resolved: true });
    } catch (err) {
      item.status = 'failed';
      item.error = friendlyError(err);
      this.emit('item', { item, resolved: true });
    } finally {
      if (bitmap) { try { bitmap.close(); } catch { /* already closed */ } }
    }
  }

  /* ------------------------------------------------- inspector recompute */

  /** Re-feathers one photo from its stored mask. Milliseconds, no inference. */
  async recompute(item) {
    if (!item.mask) return null;
    const alpha = featherMask(item.mask, item.tw, item.th, item.feather);
    const m = maskMetrics(alpha);
    item.coverage = m.coverage;
    item.soft = m.soft;
    return alpha;
  }

  /** Runs one photo again in the other mode, from the file, without touching the batch. */
  async retryInMode(item, mode) {
    const previous = item.status;
    item.status = 'running';
    this.emit('item', { item });
    let bitmap = null;
    try {
      const opts = { resizeQuality: 'medium' };
      if (item.width >= item.height) opts.resizeWidth = Math.min(WORK_EDGE, item.width);
      else opts.resizeHeight = Math.min(WORK_EDGE, item.height);
      bitmap = await createImageBitmap(item.file, opts);
      item.tw = bitmap.width; item.th = bitmap.height;
      const { canvas: work, ctx } = makeCanvas(item.tw, item.th);
      ctx.drawImage(bitmap, 0, 0);
      const rgba = ctx.getImageData(0, 0, item.tw, item.th).data;
      work.width = 1; work.height = 1;

      const t0 = performance.now();
      if (mode === 'model') {
        const ok = engine.modelStatus === 'ready';
        if (!ok) throw new Error('the model is not loaded, so there is nothing to retry with');
        item.mask = await engine.run(rgba, item.tw, item.th);
        item.mode = `model (${engine.device})`;
        item.bg = null;
        item.bgHex = sampleBorderHex(rgba, item.tw, item.th);
        item.spread = 0;
      } else {
        const res = await this.pool.cut(Uint8ClampedArray.from(rgba), item.tw, item.th, 0);
        item.mask = res.mask;
        item.mode = 'chroma-key';
        item.bg = res.bg; item.bgHex = res.bgHex; item.spread = res.spread;
      }
      item.ms = performance.now() - t0;

      const alpha = featherMask(item.mask, item.tw, item.th, item.feather);
      const m = maskMetrics(alpha);
      item.coverage = m.coverage;
      item.soft = m.soft;
      item.error = '';
      item.flagReason = flagFor(item);
      item.status = item.flagReason ? 'flagged' : 'done';
      this.renderer.result(item, bitmap, alpha);
      this.emit('item', { item, resolved: true });
      return alpha;
    } catch (err) {
      item.status = previous === 'running' ? 'failed' : previous;
      item.error = friendlyError(err);
      this.emit('item', { item, resolved: true });
      return null;
    } finally {
      if (bitmap) { try { bitmap.close(); } catch { /* already closed */ } }
    }
  }

  /* --------------------------------------------------------------- export */

  /**
   * Opens one photo for export. The caller must close the bitmap.
   * `targetEdge` is the long edge the output actually needs. We never upscale
   * past the original, and we never decode 8000 px to make a 1024 px JPEG.
   */
  async openFullSize(item, targetEdge) {
    const longest = Math.max(item.width || 0, item.height || 0);
    let edge = Number.isFinite(targetEdge) && targetEdge > 0 ? Math.min(targetEdge, longest || targetEdge) : longest;
    if (!edge || edge > MAX_EDGE) edge = Math.min(EXPORT_EDGE, edge || EXPORT_EDGE);

    if (!longest || edge >= longest) return createImageBitmap(item.file);
    const opts = item.width >= item.height ? { resizeWidth: Math.round(edge) } : { resizeHeight: Math.round(edge) };
    return createImageBitmap(item.file, { ...opts, resizeQuality: 'high' });
  }
}

/* --------------------------------------------------------------- helpers */

function flagFor(item) {
  if (item.coverage < 0.02) return 'almost nothing removed';
  if (item.coverage > 0.97) return 'almost everything removed';
  if (item.mode === 'chroma-key' && item.spread > 12) return 'background not solid';
  if (item.soft > 0.06) return 'soft edge';
  return '';
}

function friendlyError(err) {
  const msg = String((err && err.message) || err);
  if (/memory|allocat/i.test(msg)) return 'Ran out of memory on this photo. Lower the batch size and retry.';
  if (/decode|format/i.test(msg)) return 'This browser could not decode the file. Convert it to JPEG first.';
  if (/model/i.test(msg)) return msg.charAt(0).toUpperCase() + msg.slice(1) + '.';
  return 'Something went wrong reading this photo. Retry, or remove it from the queue.';
}

/** Median border colour, reported so the measurement column is not empty. */
function sampleBorderHex(rgba, w, h) {
  const rs = [], gs = [], bs = [];
  const step = Math.max(1, Math.round(w / 64));
  for (let x = 0; x < w; x += step) {
    for (const y of [0, h - 1]) {
      const i = (y * w + x) * 4;
      rs.push(rgba[i]); gs.push(rgba[i + 1]); bs.push(rgba[i + 2]);
    }
  }
  const mid = a => a.sort((p, q) => p - q)[a.length >> 1] | 0;
  const hx = v => v.toString(16).padStart(2, '0').toUpperCase();
  return `#${hx(mid(rs))}${hx(mid(gs))}${hx(mid(bs))}`;
}

export { cutout };
