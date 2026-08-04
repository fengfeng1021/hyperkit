/* Generation worker.
   Two phases, both reported as real counts: generate, then verify. The verify
   phase deliberately re-derives every claim from the finished puzzle. */

import { generateOne } from '../puzzles/generate.js';
import { verifyPuzzle } from '../puzzles/verify.js';

let cancelled = false;

self.postMessage({ type: 'ready' });

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.cmd === 'cancel') {
    cancelled = true;
    return;
  }
  if (msg.cmd !== 'run') return;
  cancelled = false;
  run(msg.spec).catch((err) => {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  });
};

async function run(spec) {
  const puzzles = [];
  for (let i = spec.from || 0; i < spec.count; i += 1) {
    if (cancelled) {
      self.postMessage({ type: 'cancelled', at: i });
      return;
    }
    const p = generateOne({ ...spec, index: i });
    puzzles.push(p);
    self.postMessage({ type: 'puzzle', index: i, puzzle: p });
  }
  self.postMessage({ type: 'phase', phase: 'verify' });
  for (let i = 0; i < puzzles.length; i += 1) {
    if (cancelled) {
      self.postMessage({ type: 'cancelled', at: spec.count });
      return;
    }
    const v = verifyPuzzle(puzzles[i]);
    self.postMessage({ type: 'verified', index: puzzles[i].id - 1, verify: v });
  }
  self.postMessage({ type: 'done' });
}
