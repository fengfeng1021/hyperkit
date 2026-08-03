/* ==========================================================================
   montecarlo.js
   Log-normal monthly returns, seeded, chunked so the main thread keeps
   painting. The loan side is already deterministic, so a draw only has to
   re-run the investment account: three multiplies per month.
   ========================================================================== */

import { mulberry32, gaussianFrom, percentileSorted } from './rng.js';

const QUANTILES = [0.10, 0.50, 0.90];

/* Deliberately a timer and not requestAnimationFrame: rAF stops firing in a
   backgrounded or non-compositing tab, and a simulation that silently never
   finishes is worse than one that finishes a frame late. */
const schedule = (fn) => setTimeout(fn, 0);

/**
 * @param {object} result   output of finance.simulate()
 * @param {object} opts     { seed, paths, investPct, volPct }
 * @param {function} onProgress (done, total)
 * @returns {Promise<object>} band
 */
export function runMonteCarlo(result, opts, onProgress) {
  const N = result.months;
  const cols = N + 1;
  let total = opts.paths;

  const contribA = result.paths.a.contrib;
  const contribB = result.paths.b.contrib;
  const contribC = result.paths.c.contrib;

  const hv = result.homeValue;
  const baseA = new Float64Array(cols);
  const baseB = new Float64Array(cols);
  const baseC = new Float64Array(cols);
  for (let t = 0; t < cols; t++) {
    baseA[t] = hv[t] - result.paths.a.balance[t] + result.paths.a.cash[t];
    baseB[t] = hv[t] - result.paths.b.balance[t] + result.paths.b.cash[t];
    baseC[t] = hv[t] - result.paths.c.balance[t] + result.paths.c.cash[t];
  }

  const sigmaM = opts.volPct / 100 / Math.sqrt(12);
  const muM = Math.log(1 + opts.investPct / 100) / 12 - (sigmaM * sigmaM) / 2;

  const rand = mulberry32(opts.seed);
  const normal = gaussianFrom(rand);

  let store = new Float32Array(total * cols);
  let winB = 0;
  let winC = 0;
  let done = 0;
  let batch = 50;
  let downgraded = false;

  return new Promise((resolve) => {
    function chunk() {
      const t0 = performance.now();
      const end = Math.min(done + batch, total);

      for (let d = done; d < end; d++) {
        let invA = contribA[0];
        let invB = contribB[0];
        let invC = contribC[0];
        const off = d * cols;
        store[off] = baseB[0] + invB;

        for (let t = 1; t < cols; t++) {
          const growth = Math.exp(muM + sigmaM * normal());
          invA = invA * growth + contribA[t];
          invB = invB * growth + contribB[t];
          invC = invC * growth + contribC[t];
          store[off + t] = baseB[t] + invB;
        }

        const finalA = baseA[N] + invA;
        const finalB = baseB[N] + invB;
        const finalC = baseC[N] + invC;
        if (finalB >= finalA) winB++;
        if (finalC >= finalA) winC++;
      }

      const processed = Math.max(1, end - done);
      done = end;
      const dt = performance.now() - t0;
      const perPath = dt / processed;

      /* Honest degradation: if this machine would need more than four seconds
         for the full run, cut the path count and say so. */
      if (!downgraded && perPath * total > 4000 && total > 300) {
        total = 300;
        store = store.slice(0, total * cols);
        downgraded = true;
      }
      // aim each chunk at roughly one frame
      batch = Math.max(25, Math.min(500, Math.round(12 / Math.max(perPath, 0.0005))));

      if (onProgress) onProgress(Math.min(done, total), total);

      if (done >= total) {
        resolve(finish(store, total, cols, winB, winC, downgraded, opts.paths));
      } else {
        schedule(chunk);
      }
    }
    schedule(chunk);
  });
}

function finish(store, count, cols, winB, winC, downgraded, requested) {
  const p10 = new Float64Array(cols);
  const p50 = new Float64Array(cols);
  const p90 = new Float64Array(cols);
  const col = new Float64Array(count);

  for (let t = 0; t < cols; t++) {
    for (let d = 0; d < count; d++) col[d] = store[d * cols + t];
    col.sort();
    p10[t] = percentileSorted(col, QUANTILES[0]);
    p50[t] = percentileSorted(col, QUANTILES[1]);
    p90[t] = percentileSorted(col, QUANTILES[2]);
  }

  let min = Infinity, max = -Infinity;
  for (let t = 0; t < cols; t++) {
    if (p10[t] < min) min = p10[t];
    if (p90[t] > max) max = p90[t];
  }

  return {
    p10, p50, p90, store, count, cols,
    winRate: winB / count,
    winRateC: winC / count,
    downgraded, requested,
    domain: { min, max },
  };
}
