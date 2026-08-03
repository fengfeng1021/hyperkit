/* ==========================================================================
   Chroma-key cutout. Pure JavaScript, zero dependencies, runs in a Worker or
   on the main thread. This is the floor path: it is always available, even
   with the network unplugged and the model host unreachable.

   Honest range: solid or near-solid studio backgrounds, which is what most
   e-commerce product photography actually is.
   Outside that range: fur, hair, glass, gradients, cluttered rooms. When the
   background is measured as not solid enough the caller flags the photo
   instead of pretending the result is clean.

   Algorithm, fixed:
     1. sample a 2 px frame from all four edges
     2. convert to CIE Lab, take the median as the background colour, take the
        90th percentile of delta-E76 as the spread
     3. tolerance = clamp(spread * 1.6, 6, 22)
     4. mark every pixel within tolerance of the background
     5. label connected components of those pixels; a component is background
        if it touches the image border, or if it is large enough to be a real
        hole (so the middle of a ring is cut out, but sensor noise inside the
        product is not)
     6. two 3x3 morphological closings on the product mask
   ========================================================================== */

/* sRGB 0..255 -> linear, memoised */
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const XN = 0.95047, YN = 1.0, ZN = 1.08883;
const f = t => (t > 0.008856451679 ? Math.cbrt(t) : 7.787037037 * t + 16 / 116);

export function rgbToLab(r, g, b, out) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN;
  const y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / YN;
  const z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / ZN;
  const fx = f(x), fy = f(y), fz = f(z);
  out[0] = 116 * fy - 16;
  out[1] = 500 * (fx - fy);
  out[2] = 200 * (fy - fz);
  return out;
}

function median(arr) {
  const a = Float64Array.from(arr).sort();
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

function percentile(arr, p) {
  const a = Float64Array.from(arr).sort();
  if (!a.length) return 0;
  return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))];
}

/* -------------------------------------------------------------- morphology */

function dilate(src, dst, w, h) {
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0, y1 = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : 0, x1 = x < w - 1 ? x + 1 : w - 1;
      let v = 0;
      for (let yy = y0; yy <= y1 && !v; yy++) {
        for (let xx = x0; xx <= x1; xx++) { if (src[yy * w + xx]) { v = 1; break; } }
      }
      dst[y * w + x] = v;
    }
  }
}

function erode(src, dst, w, h) {
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0, y1 = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : 0, x1 = x < w - 1 ? x + 1 : w - 1;
      let v = 1;
      for (let yy = y0; yy <= y1 && v; yy++) {
        for (let xx = x0; xx <= x1; xx++) { if (!src[yy * w + xx]) { v = 0; break; } }
      }
      dst[y * w + x] = v;
    }
  }
}

/* --------------------------------------------------------------- main entry */

/**
 * @param {Uint8ClampedArray} rgba  w*h*4
 * @returns {{mask: Uint8Array, bg: number[], bgHex: string, spread: number, tol: number}}
 *          mask is 255 for product, 0 for background, at w x h.
 */
export function chromaKey(rgba, w, h) {
  const lab = [0, 0, 0];

  /* 1. border frame samples, 2 px deep, stepped so a 4000 px edge is cheap */
  const Ls = [], As = [], Bs = [];
  const step = Math.max(1, Math.round(Math.max(w, h) / 320));
  const push = (x, y) => {
    const i = (y * w + x) * 4;
    rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2], lab);
    Ls.push(lab[0]); As.push(lab[1]); Bs.push(lab[2]);
  };
  for (let x = 0; x < w; x += step) { push(x, 0); push(x, 1); push(x, h - 1); push(x, h - 2); }
  for (let y = 0; y < h; y += step) { push(0, y); push(1, y); push(w - 1, y); push(w - 2, y); }

  /* 2. median background, 90th percentile spread */
  const bgL = median(Ls), bgA = median(As), bgB = median(Bs);
  const deltas = new Float64Array(Ls.length);
  for (let i = 0; i < Ls.length; i++) {
    const dL = Ls[i] - bgL, dA = As[i] - bgA, dB = Bs[i] - bgB;
    deltas[i] = Math.sqrt(dL * dL + dA * dA + dB * dB);
  }
  const spread = percentile(deltas, 0.9);

  /* 3. tolerance */
  const tol = Math.min(22, Math.max(6, spread * 1.6));
  const tol2 = tol * tol;

  /* 4. within-tolerance map */
  const n = w * h;
  const isBg = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2], lab);
    const dL = lab[0] - bgL, dA = lab[1] - bgA, dB = lab[2] - bgB;
    if (dL * dL + dA * dA + dB * dB < tol2) isBg[i] = 1;
  }

  /* 5. connected components, explicit stack, no recursion.
        Keep a component as background when it reaches the border, or when it
        is a hole big enough to be intentional (the middle of a ring). */
  const holeMin = Math.max(24, Math.round(n * 0.0008));
  const visited = new Uint8Array(n);
  const bg = new Uint8Array(n);
  const stack = new Int32Array(n);
  const region = new Int32Array(1024);
  let regionCap = 1024;
  let regionBuf = region;

  for (let seed = 0; seed < n; seed++) {
    if (!isBg[seed] || visited[seed]) continue;
    let sp = 0, count = 0, touches = false;
    stack[sp++] = seed;
    visited[seed] = 1;
    while (sp > 0) {
      const idx = stack[--sp];
      const y = (idx / w) | 0, x = idx - y * w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      if (count >= regionCap) {
        regionCap *= 2;
        const bigger = new Int32Array(regionCap);
        bigger.set(regionBuf.subarray(0, count));
        regionBuf = bigger;
      }
      regionBuf[count++] = idx;
      if (x > 0 && isBg[idx - 1] && !visited[idx - 1]) { visited[idx - 1] = 1; stack[sp++] = idx - 1; }
      if (x < w - 1 && isBg[idx + 1] && !visited[idx + 1]) { visited[idx + 1] = 1; stack[sp++] = idx + 1; }
      if (y > 0 && isBg[idx - w] && !visited[idx - w]) { visited[idx - w] = 1; stack[sp++] = idx - w; }
      if (y < h - 1 && isBg[idx + w] && !visited[idx + w]) { visited[idx + w] = 1; stack[sp++] = idx + w; }
    }
    if (touches || count >= holeMin) {
      for (let k = 0; k < count; k++) bg[regionBuf[k]] = 1;
    }
  }

  /* 6. two closings on the product mask (= two openings on the background) */
  let a = bg, b = new Uint8Array(n);
  for (let pass = 0; pass < 2; pass++) {
    erode(a, b, w, h);
    const t = a; a = b; b = t;
    dilate(a, b, w, h);
    const t2 = a; a = b; b = t2;
  }

  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = a[i] ? 0 : 255;

  /* background colour reported back in sRGB, sampled not invented */
  const bgRgb = labToRgb(bgL, bgA, bgB);

  return { mask, bg: bgRgb, bgHex: toHex(bgRgb), spread, tol };
}

function labToRgb(L, A, B) {
  const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  const inv = t => (t > 0.2068965517 ? t * t * t : (t - 16 / 116) / 7.787037037);
  const x = inv(fx) * XN, y = inv(fy) * YN, z = inv(fz) * ZN;
  let r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  let g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  let b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  const enc = c => {
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  return [enc(r), enc(g), enc(b)];
}

function toHex(rgb) {
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('');
}

/* --------------------------------------------------------------- feathering
   Three box-blur passes approximate a gaussian closely enough for a matte and
   are O(n) per pass. Feather 0 leaves the hard edge alone. */

function boxBlurPass(src, dst, w, h, r) {
  const tmp = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = src[row] * (r + 1);
    for (let i = 1; i <= r; i++) sum += src[row + Math.min(i, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * inv;
      sum += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = tmp[x] * (r + 1);
    for (let i = 1; i <= r; i++) sum += tmp[Math.min(i, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum * inv;
      sum += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
    }
  }
}

export function featherMask(mask, w, h, sigma) {
  if (!sigma || sigma <= 0) return Uint8ClampedArray.from(mask);
  const r = Math.max(1, Math.round((Math.sqrt((12 * sigma * sigma) / 3 + 1) - 1) / 2));
  let a = Float32Array.from(mask);
  let b = new Float32Array(w * h);
  for (let i = 0; i < 3; i++) { boxBlurPass(a, b, w, h, r); const t = a; a = b; b = t; }
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) out[i] = a[i];
  return out;
}

/* ----------------------------------------------------------------- metrics
   Real numbers read off the alpha channel, used to decide whether a photo
   needs a human look. These are heuristics and the interface says so. */

export function maskMetrics(alpha) {
  let sum = 0, soft = 0;
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i];
    sum += a;
    if (a > 20 && a < 235) soft++;
  }
  return {
    coverage: sum / (alpha.length * 255),
    soft: soft / alpha.length,
  };
}
