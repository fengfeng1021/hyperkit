/**
 * js/loom/noise.js
 * The procedural core. Value noise, fbm, ridged folds and domain warping,
 * all seeded so a template is reproducible: the seed printed under the stage
 * is the number that produced the cloth you are looking at.
 *
 * No dependencies. Everything here is plain arithmetic on typed arrays.
 */

/** Small, fast, seedable PRNG. Same seed, same cloth, forever. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32 bit hash of a string, used to turn names into seeds. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Build a noise field bound to one seed.
 * value2 returns 0..1. fbm returns roughly 0..1. ridge returns 0..1 with
 * sharp creases where the underlying noise crosses its midpoint.
 */
export function makeNoise(seed) {
  const rng = mulberry32(seed);
  const SIZE = 256;
  const perm = new Uint8Array(SIZE);
  const vals = new Float32Array(SIZE);

  for (let i = 0; i < SIZE; i++) {
    perm[i] = i;
    vals[i] = rng();
  }
  for (let i = SIZE - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }

  function lattice(x, y) {
    return vals[(perm[x & 255] + (y & 255)) & 255];
  }

  function value2(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = fade(x - xi);
    const v = fade(y - yi);
    const a = lattice(xi, yi);
    const b = lattice(xi + 1, yi);
    const c = lattice(xi, yi + 1);
    const d = lattice(xi + 1, yi + 1);
    const top = a + (b - a) * u;
    const bottom = c + (d - c) * u;
    return top + (bottom - top) * v;
  }

  function fbm(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += value2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Folds want creases, not blobs. Ridged noise gives the crease. */
  function ridge(x, y, octaves = 3, lacunarity = 2.11, gain = 0.55) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(value2(x * freq, y * freq) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  return { value2, fbm, ridge, rng };
}

/** Separable box blur over a Float32Array. Used to derive occlusion. */
export function boxBlur(src, w, h, radius) {
  if (radius < 1) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const span = radius * 2 + 1;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let i = -radius; i <= radius; i++) acc += src[row + clampi(i, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      acc -= src[row + clampi(x - radius, 0, w - 1)];
      acc += src[row + clampi(x + radius + 1, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -radius; i <= radius; i++) acc += tmp[clampi(i, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      acc -= tmp[clampi(y - radius, 0, h - 1) * w + x];
      acc += tmp[clampi(y + radius + 1, 0, h - 1) * w + x];
    }
  }
  return out;
}

function clampi(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};
