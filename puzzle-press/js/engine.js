/* Worker manager with an honest main-thread fallback.
   Under file:// a module worker cannot start. That is a situation, not an
   error, so the fallback runs the identical generator in rAF-sized slices and
   the status bar says which path is in use. Results are bit-identical either
   way, because every puzzle comes from hash(seed, type, index). */

import { generateOne } from './puzzles/generate.js';
import { verifyPuzzle } from './puzzles/verify.js';

const HANDSHAKE_MS = 800;
const SLICE_MS = 12;

export class Engine {
  constructor() {
    this.worker = null;
    this.mode = 'pending';
    this.cancelled = false;
    this.running = false;
  }

  async prepare() {
    if (this.mode !== 'pending') return this.mode;
    try {
      const url = new URL('./worker/generate.worker.js', import.meta.url);
      const worker = new Worker(url, { type: 'module' });
      const ok = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), HANDSHAKE_MS);
        worker.onmessage = (e) => {
          if (e.data && e.data.type === 'ready') {
            clearTimeout(timer);
            resolve(true);
          }
        };
        worker.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
      if (ok) {
        this.worker = worker;
        this.mode = 'worker';
      } else {
        worker.terminate();
        this.mode = 'main';
      }
    } catch (err) {
      this.mode = 'main';
    }
    return this.mode;
  }

  cancel() {
    this.cancelled = true;
    if (this.worker && this.running) {
      this.worker.postMessage({ cmd: 'cancel' });
    }
  }

  /**
   * @param {object} spec {type, seed, level, size, words, count, from}
   * @param {object} handlers {onPuzzle, onVerified, onPhase, onCancelled}
   */
  async run(spec, handlers) {
    await this.prepare();
    this.cancelled = false;
    this.running = true;
    try {
      if (this.mode === 'worker') return await this.runWorker(spec, handlers);
      return await this.runMain(spec, handlers);
    } finally {
      this.running = false;
    }
  }

  runWorker(spec, h) {
    return new Promise((resolve, reject) => {
      const worker = this.worker;
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'puzzle') h.onPuzzle(m.index, m.puzzle);
        else if (m.type === 'verified') h.onVerified(m.index, m.verify);
        else if (m.type === 'phase') h.onPhase(m.phase);
        else if (m.type === 'cancelled') {
          h.onCancelled(m.at);
          resolve({ cancelled: true, at: m.at });
        } else if (m.type === 'done') resolve({ cancelled: false });
        else if (m.type === 'error') reject(new Error(m.message));
      };
      worker.onerror = (e) => reject(new Error(e.message || 'worker 發生錯誤'));
      worker.postMessage({ cmd: 'run', spec });
    });
  }

  async runMain(spec, h) {
    const puzzles = [];
    let i = spec.from || 0;
    while (i < spec.count) {
      if (this.cancelled) {
        h.onCancelled(i);
        return { cancelled: true, at: i };
      }
      const started = performance.now();
      while (i < spec.count && performance.now() - started < SLICE_MS) {
        const p = generateOne({ ...spec, index: i });
        puzzles.push(p);
        h.onPuzzle(i, p);
        i += 1;
      }
      /* eslint-disable no-await-in-loop */
      await frame();
    }
    h.onPhase('verify');
    let k = 0;
    while (k < puzzles.length) {
      if (this.cancelled) {
        h.onCancelled(spec.count);
        return { cancelled: true, at: spec.count };
      }
      const started = performance.now();
      while (k < puzzles.length && performance.now() - started < SLICE_MS) {
        h.onVerified(puzzles[k].id - 1, verifyPuzzle(puzzles[k]));
        k += 1;
      }
      await frame();
    }
    return { cancelled: false };
  }
}

function frame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}
