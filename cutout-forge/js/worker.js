/* Chroma-key worker. Keeps the flood fill and the morphology off the main
   thread so the wall keeps painting while a batch runs.
   If module workers are unavailable (some file:// contexts, old browsers),
   js/pool.js calls the very same functions inline instead. */

import { chromaKey, featherMask, maskMetrics } from './chroma.js';

self.onmessage = (ev) => {
  const msg = ev.data;

  if (msg.type === 'ping') {
    self.postMessage({ type: 'pong', id: msg.id });
    return;
  }

  if (msg.type === 'cut') {
    const { id, rgba, w, h, feather } = msg;
    try {
      const t0 = performance.now();
      const res = chromaKey(new Uint8ClampedArray(rgba), w, h);
      const alpha = featherMask(res.mask, w, h, feather);
      const metrics = maskMetrics(alpha);
      self.postMessage({
        type: 'cut:done', id,
        mask: res.mask.buffer, alpha: alpha.buffer,
        bg: res.bg, bgHex: res.bgHex, spread: res.spread, tol: res.tol,
        coverage: metrics.coverage, soft: metrics.soft,
        ms: performance.now() - t0,
      }, [res.mask.buffer, alpha.buffer]);
    } catch (err) {
      self.postMessage({ type: 'cut:error', id, message: String(err && err.message || err) });
    }
    return;
  }

  if (msg.type === 'feather') {
    const { id, mask, w, h, feather } = msg;
    try {
      const m = new Uint8Array(mask);
      const alpha = featherMask(m, w, h, feather);
      const metrics = maskMetrics(alpha);
      self.postMessage({
        type: 'feather:done', id,
        mask: m.buffer, alpha: alpha.buffer,
        coverage: metrics.coverage, soft: metrics.soft,
      }, [m.buffer, alpha.buffer]);
    } catch (err) {
      self.postMessage({ type: 'cut:error', id, message: String(err && err.message || err) });
    }
  }
};
