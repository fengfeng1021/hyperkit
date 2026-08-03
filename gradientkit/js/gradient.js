/* ==========================================================================
   GradientKit - gradient.js
   Everything that turns a stop list into pixels, numbers or strings on the CPU.
   The GPU does the same math in js/render.js; this module is the reference
   implementation and is what every measurement is taken from.
   ========================================================================== */

import {
  parseHex, toHex, mixInSpace, EASINGS, clamp01, clamp,
  srgbToOklch, oklabToOklch, srgbToOklab, gamutMapOklch,
  applyCvd, contrastRatio, relativeLuminance, nameColor,
} from './color.js';

/* --------------------------------------------------------------------------
   Stop list normalisation
   -------------------------------------------------------------------------- */

/** Sort by position and coerce to {rgb, pos01}. Two stops at the same position
 *  are kept: that is a hard stop, a legitimate gradient technique. */
export function normalizeStops(stops) {
  const list = stops
    .map((s, i) => ({ rgb: parseHex(s.hex) || { r: 0, g: 0, b: 0 }, pos: clamp(s.pos, 0, 100) / 100, i }))
    .sort((a, b) => (a.pos - b.pos) || (a.i - b.i));
  if (list.length === 0) return [{ rgb: { r: 0, g: 0, b: 0 }, pos: 0 }, { rgb: { r: 1, g: 1, b: 1 }, pos: 1 }];
  if (list.length === 1) return [list[0], { ...list[0], pos: 1 }];
  return list;
}

/** Sample the gradient at t in [0,1]. Returns sRGB {r,g,b} in [0,1]. */
export function sampleGradient(norm, t, space, easing = 'linear') {
  const n = norm.length;
  if (t <= norm[0].pos) return norm[0].rgb;
  if (t >= norm[n - 1].pos) return norm[n - 1].rgb;
  for (let i = 0; i < n - 1; i++) {
    const a = norm[i];
    const b = norm[i + 1];
    if (t <= b.pos) {
      const span = b.pos - a.pos;
      const lt = span > 1e-9 ? (t - a.pos) / span : 1;
      const eased = (EASINGS[easing] || EASINGS.linear)(lt);
      return mixInSpace(space, a.rgb, b.rgb, eased);
    }
  }
  return norm[n - 1].rgb;
}

/* --------------------------------------------------------------------------
   Ramps
   A ramp is the gradient resampled to N sRGB triples. Every CPU-side raster
   (thumbnails, comparison bands, tiles, the Canvas2D fallback, CSS fallback
   stops, SVG stops) is built from a ramp so the expensive gamut search runs
   N times instead of once per pixel.
   -------------------------------------------------------------------------- */

export function buildRamp(stops, space, easing = 'linear', n = 256) {
  const norm = normalizeStops(stops);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = sampleGradient(norm, n === 1 ? 0 : i / (n - 1), space, easing);
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  return out;
}

export function rampAt(ramp, t) {
  const n = ramp.length / 3;
  const i = Math.round(clamp01(t) * (n - 1));
  return { r: ramp[i * 3], g: ramp[i * 3 + 1], b: ramp[i * 3 + 2] };
}

/** Resample a ramp into k evenly spaced hex stops. This is the single most
 *  useful thing the tool emits: an sRGB fallback that follows the OKLCH curve
 *  instead of a two-stop guess. */
export function resampleHexStops(ramp, k = 9) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const t = k === 1 ? 0 : i / (k - 1);
    const c = rampAt(ramp, t);
    out.push({ hex: toHex(c.r, c.g, c.b), pos: +(t * 100).toFixed(2) });
  }
  return out;
}

/** A CSS `linear-gradient(...)` built from a ramp. Used for every static
 *  swatch in the page (bands, tiles, thumbnails) so they need no canvas. */
export function rampToCssGradient(ramp, { angle = 90, k = 24, vision = 'normal' } = {}) {
  const parts = [];
  for (let i = 0; i < k; i++) {
    const t = i / (k - 1);
    let c = rampAt(ramp, t);
    if (vision && vision !== 'normal') c = applyCvd(c, vision);
    parts.push(`${toHex(c.r, c.g, c.b)} ${(t * 100).toFixed(2)}%`);
  }
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
}

/* --------------------------------------------------------------------------
   Chroma deficit
   The teaching number. deficit(t) = 1 - C_from / C_oklch, clamped to [0,1].
   -------------------------------------------------------------------------- */

export function chromaDeficit(stops, fromSpace, easing = 'linear', samples = 256) {
  return compareSpaces(stops, fromSpace, 'oklch', easing, samples);
}

/**
 * Chroma difference between two interpolation spaces along the same stops.
 * `poorer` names whichever space is the darker, less saturated one at the
 * worst point, so the readout can say which side is losing rather than
 * assuming OKLCH is always the reference.
 */
export function compareSpaces(stops, spaceA, spaceB, easing = 'linear', samples = 256) {
  const norm = normalizeStops(stops);
  const curve = new Float32Array(samples);
  let worst = 0;
  let worstT = 0;
  let poorer = spaceA;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const a = sampleGradient(norm, t, spaceA, easing);
    const b = sampleGradient(norm, t, spaceB, easing);
    const ca = srgbToOklch(a.r, a.g, a.b).C;
    const cb = srgbToOklch(b.r, b.g, b.b).C;
    const hi = Math.max(ca, cb);
    const d = hi < 1e-6 ? 0 : clamp01(1 - Math.min(ca, cb) / hi);
    curve[i] = d;
    if (d > worst) { worst = d; worstT = t; poorer = ca < cb ? spaceA : spaceB; }
  }
  // Span where the deficit is still within 60% of the worst value: the bracket.
  let lo = worstT;
  let hi = worstT;
  const floor = worst * 0.6;
  const wi = Math.round(worstT * (samples - 1));
  for (let i = wi; i >= 0 && curve[i] >= floor; i--) lo = i / (samples - 1);
  for (let i = wi; i < samples && curve[i] >= floor; i++) hi = i / (samples - 1);
  return {
    curve,
    worst,
    worstT,
    worstPct: Math.round(worst * 100),
    poorer,
    spanLo: lo,
    spanHi: hi,
    meaningful: worst >= 0.06,
  };
}

/* --------------------------------------------------------------------------
   Gradient geometry, matching the shader exactly.
   -------------------------------------------------------------------------- */

/** t for a pixel, in the same convention the fragment shader uses.
 *  CSS angle: 0deg points to the top, increasing clockwise. */
export function gradientT(px, py, w, h, type, angleDeg, center = { x: 0.5, y: 0.5 }, radius = 0.75) {
  if (type === 'radial') {
    const cx = center.x * w;
    const cy = center.y * h;
    const corners = [[0, 0], [w, 0], [0, h], [w, h]];
    let far = 0;
    for (const [x, y] of corners) far = Math.max(far, Math.hypot(x - cx, y - cy));
    const r = Math.max(far * radius, 1e-6);
    return clamp01(Math.hypot(px - cx, py - cy) / r);
  }
  if (type === 'conic') {
    const cx = center.x * w;
    const cy = center.y * h;
    const a = Math.atan2(px - cx, -(py - cy)); // 0 at top, clockwise
    let t = a / (Math.PI * 2) - angleDeg / 360;
    t -= Math.floor(t);
    return t;
  }
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const proj = (px - w / 2) * dx + (py - h / 2) * dy;
  return clamp01(0.5 + proj / Math.max(len, 1e-6));
}

/* --------------------------------------------------------------------------
   CPU raster. Used by the Canvas2D fallback, the vision thumbnails, the loupe
   source when WebGL is unavailable, and every PNG export on the CPU path.
   -------------------------------------------------------------------------- */

const BAYER = (() => {
  const b = [];
  for (let y = 0; y < 8; y++) {
    b[y] = [];
    for (let x = 0; x < 8; x++) {
      let v = 0;
      for (let i = 0; i < 3; i++) v = v * 4 + ((2 * ((x >> i) & 1) + 3 * ((y >> i) & 1)) & 3);
      b[y][x] = v / 64 - 0.5;
    }
  }
  return b;
})();

function hash2(x, y, seed) {
  let px = (x * 443.8975 + seed * 0.618) % 1;
  let py = (y * 397.2973 + seed * 0.313) % 1;
  if (px < 0) px += 1;
  if (py < 0) py += 1;
  const d = px * (py + 19.19) + py * (px + 19.19);
  px = (px + d) % 1;
  py = (py + d) % 1;
  return ((px + py) * px) % 1;
}

/** Mesh color at uv, inverse-distance weighted in OKLab. Same math as the
 *  shader; OKLab, not sRGB, is what stops grey seams between lobes. */
export function meshColorAt(points, ux, uy, falloff = 2.4) {
  let L = 0;
  let A = 0;
  let B = 0;
  let wsum = 0;
  for (const p of points) {
    const dx = (ux - p.x) / Math.max(p.r, 1e-3);
    const dy = (uy - p.y) / Math.max(p.r, 1e-3);
    const d2 = dx * dx + dy * dy + 1e-5;
    const w = 1 / Math.pow(d2, falloff * 0.5);
    L += p.lab.L * w;
    A += p.lab.a * w;
    B += p.lab.b * w;
    wsum += w;
  }
  if (wsum <= 0) return { r: 0, g: 0, b: 0 };
  const lch = oklabToOklch(L / wsum, A / wsum, B / wsum);
  const m = gamutMapOklch(lch.L, lch.C, lch.H);
  return { r: m.r, g: m.g, b: m.b };
}

export function meshPoints(list) {
  return list.map((p) => {
    const rgb = parseHex(p.hex) || { r: 0, g: 0, b: 0 };
    return { x: p.x, y: p.y, r: p.r, lab: srgbToOklab(rgb.r, rgb.g, rgb.b) };
  });
}

/**
 * Rasterize a scene into an ImageData-compatible Uint8ClampedArray.
 *
 * scene: { mode, type, angle, center, radius, stops, space, easing, mesh,
 *          grain:{amp,size}, dither, vision, falloff }
 *
 * `offsetX/offsetY` plus `fullW/fullH` render a window of a larger frame while
 * keeping the gradient geometry of the whole frame. That is what the tiled PNG
 * export uses, so a tile boundary is never visible in the output.
 */
export function rasterize(scene, w, h, opts = {}) {
  const { ramp = null, seed = 0, offsetX = 0, offsetY = 0 } = opts;
  const fullW = opts.fullW || w;
  const fullH = opts.fullH || h;
  const data = new Uint8ClampedArray(w * h * 4);
  const useRamp = scene.mode !== 'mesh'
    ? (ramp || buildRamp(scene.stops, scene.space, scene.easing, 512))
    : null;
  const pts = scene.mode === 'mesh' ? meshPoints(scene.mesh) : null;
  const cvd = scene.vision && scene.vision !== 'normal' ? scene.vision : null;
  const amp = (scene.grain?.amp || 0) / 100 * 0.06;
  const gsize = Math.max(1, scene.grain?.size || 1);

  for (let y = 0; y < h; y++) {
    const fy = y + offsetY;
    for (let x = 0; x < w; x++) {
      const fx = x + offsetX;
      let c;
      if (pts) {
        c = meshColorAt(pts, (fx + 0.5) / fullW, (fy + 0.5) / fullH, scene.falloff || 2.4);
      } else {
        const t = gradientT(fx + 0.5, fy + 0.5, fullW, fullH, scene.type, scene.angle, scene.center, scene.radius);
        c = rampAt(useRamp, t);
      }
      let r = c.r;
      let g = c.g;
      let b = c.b;
      if (amp > 0) {
        const n = (hash2(Math.floor(fx / gsize), Math.floor(fy / gsize), seed) - 0.5) * amp;
        // Grain lives in linear light so shadows behave like film rather than
        // like additive whitening.
        r = clamp01(linToS(sToLin(r) + n));
        g = clamp01(linToS(sToLin(g) + n));
        b = clamp01(linToS(sToLin(b) + n));
      }
      if (cvd) ({ r, g, b } = applyCvd({ r, g, b }, cvd));
      const dr = scene.dither ? BAYER[fy & 7][fx & 7] / 255 : 0;
      const o = (y * w + x) * 4;
      data[o] = Math.round(clamp01(r + dr) * 255);
      data[o + 1] = Math.round(clamp01(g + dr) * 255);
      data[o + 2] = Math.round(clamp01(b + dr) * 255);
      data[o + 3] = 255;
    }
  }
  return data;
}

const sToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToS = (c) => {
  const s = c < 0 ? -1 : 1;
  const a = Math.abs(c);
  return s * (a <= 0.0031308 ? 12.92 * a : 1.055 * Math.pow(a, 1 / 2.4) - 0.055);
};

/* --------------------------------------------------------------------------
   Banding detection
   True when the ungrained ramp produces an adjacent-column pair differing by
   exactly 1 in any channel over a run longer than 24 device pixels, which is
   the condition the loupe copy describes.
   -------------------------------------------------------------------------- */

export function detectsBanding(ramp, widthPx = 1200) {
  let run = 0;
  let prev = null;
  for (let x = 0; x < widthPx; x++) {
    const c = rampAt(ramp, x / (widthPx - 1));
    const q = [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
    if (prev) {
      const d = [Math.abs(q[0] - prev[0]), Math.abs(q[1] - prev[1]), Math.abs(q[2] - prev[2])];
      const maxd = Math.max(d[0], d[1], d[2]);
      if (maxd === 1) {
        run++;
        if (run > 24) return true;
      } else if (maxd > 1) {
        run = 0;
      }
    }
    prev = q;
  }
  return false;
}

/* --------------------------------------------------------------------------
   Accessible description of the whole gradient, regenerated on every commit.
   -------------------------------------------------------------------------- */

export function describeScene(scene) {
  if (scene.mode === 'mesh') {
    const names = scene.mesh.map((p) => nameColor(p.hex));
    const unique = [...new Set(names)];
    return `Mesh field with ${scene.mesh.length} points, blended in OKLab. Colors: ${unique.join(', ')}.`;
  }
  const typeWord = scene.type === 'linear'
    ? `Linear gradient at ${Math.round(scene.angle)} degrees`
    : scene.type === 'radial'
      ? 'Radial gradient'
      : `Conic gradient from ${Math.round(scene.angle)} degrees`;
  const spaceWord = { srgb: 'sRGB', hsl: 'HSL', oklab: 'OKLab', oklch: 'OKLCH' }[scene.space];
  const stopWords = scene.stops
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .map((s) => `${nameColor(s.hex)} at ${Math.round(s.pos)} percent`)
    .join(', ');
  return `${typeWord}, interpolated in ${spaceWord}, ${scene.stops.length} stops: ${stopWords}.`;
}

/* --------------------------------------------------------------------------
   Contrast probe worst-point search.
   Samples are read from rendered pixels when a reader is supplied, so grain,
   dither and gamut clipping are all included. Measuring the ideal instead of
   the actual would make the number a lie.
   -------------------------------------------------------------------------- */

export function worstPoint(samples, fg) {
  let worst = Infinity;
  let worstIdx = 0;
  for (let i = 0; i < samples.length; i++) {
    const ratio = contrastRatio(fg, samples[i]);
    if (ratio < worst) { worst = ratio; worstIdx = i; }
  }
  return { ratio: worst, index: worstIdx };
}

export { contrastRatio, relativeLuminance };
