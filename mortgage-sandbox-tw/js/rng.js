/* ==========================================================================
   rng.js
   Seeded pseudo-random numbers. Math.random() appears nowhere in this project.

   A shared link has to reproduce the exact same chart on someone else's
   screen, otherwise the discussion the link was posted to cannot happen.
   That requires the whole simulation to be a pure function of (params, seed).
   ========================================================================== */

/** mulberry32: 32-bit state, period 2^32, good enough for a wealth fan. */
export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform, cached second value.
 * u1 must exclude 0 or ln(0) = -Infinity poisons the whole path.
 */
export function gaussianFrom(rand) {
  let spare = null;
  return function normal() {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u1 = rand();
    while (u1 <= Number.EPSILON) u1 = rand();
    const u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  };
}

/** Linear-interpolated percentile of an already-sorted Float64Array. */
export function percentileSorted(sorted, q) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
