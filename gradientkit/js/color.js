/* ==========================================================================
   GradientKit - color.js
   Hand-implemented color science. No library, in JS or via CDN.
   Pure functions only: no DOM, no state, no side effects.

   Conventions
     sRGB and linear-sRGB channels are floats in [0,1] (values outside that
     range are legal intermediates and are preserved, not clamped).
     OKLab   L in [0,1], a/b roughly [-0.4, 0.4]
     OKLCH   C >= 0, H in degrees [0,360), NaN when the color is powerless.

   Spec: docs/COLOR-SCIENCE.md
   ========================================================================== */

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/* --------------------------------------------------------------------------
   1. sRGB transfer function
   Sign-preserving so out-of-gamut intermediates round-trip during gamut
   mapping instead of being silently clamped at the wrong stage.
   -------------------------------------------------------------------------- */

export function srgbToLinear(c) {
  const s = c < 0 ? -1 : 1;
  const a = Math.abs(c);
  return s * (a <= 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4));
}

export function linearToSrgb(c) {
  const s = c < 0 ? -1 : 1;
  const a = Math.abs(c);
  return s * (a <= 0.0031308 ? 12.92 * a : 1.055 * Math.pow(a, 1 / 2.4) - 0.055);
}

/* --------------------------------------------------------------------------
   2 + 3. linear-sRGB <-> OKLab  (Bjorn Ottosson, full precision)
   Math.cbrt rather than pow(x, 1/3): pow returns NaN for negative inputs and
   l/m/s do go negative for out-of-gamut colors.
   -------------------------------------------------------------------------- */

export function linearSrgbToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

export function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

/* --------------------------------------------------------------------------
   4. OKLab <-> OKLCH
   H is deliberately NaN, never 0, for achromatic colors. Carrying a fake hue
   of 0 is exactly the bug that swings a black-to-orange ramp through red.
   -------------------------------------------------------------------------- */

export const POWERLESS_C = 1e-7;

export function oklabToOklch(L, a, b) {
  const C = Math.sqrt(a * a + b * b);
  const H = C < POWERLESS_C ? NaN : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

export function oklchToOklab(L, C, H) {
  const h = Number.isNaN(H) ? 0 : (H * Math.PI) / 180;
  return { L, a: C * Math.cos(h), b: C * Math.sin(h) };
}

/* --------------------------------------------------------------------------
   Composed conversions
   -------------------------------------------------------------------------- */

export function srgbToOklab(r, g, b) {
  return linearSrgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
}

export function oklabToSrgbUnclamped(L, a, b) {
  const lin = oklabToLinearSrgb(L, a, b);
  return { r: linearToSrgb(lin.r), g: linearToSrgb(lin.g), b: linearToSrgb(lin.b) };
}

export function oklchToSrgbUnclamped(L, C, H) {
  const lab = oklchToOklab(L, C, H);
  return oklabToSrgbUnclamped(lab.L, lab.a, lab.b);
}

export function srgbToOklch(r, g, b) {
  const lab = srgbToOklab(r, g, b);
  return oklabToOklch(lab.L, lab.a, lab.b);
}

/* --------------------------------------------------------------------------
   Hex
   Rounding on output is Math.round(clamp01(c) * 255). Not floor, not | 0.
   -------------------------------------------------------------------------- */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function parseHex(str) {
  if (typeof str !== 'string') return null;
  const m = HEX_RE.exec(str.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  const n = parseInt(h, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function toHex(r, g, b) {
  const c = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

export const rgbToHex = ({ r, g, b }) => toHex(r, g, b);

export function hexToOklch(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return srgbToOklch(rgb.r, rgb.g, rgb.b);
}

export function oklchToHex(L, C, H) {
  const m = gamutMapOklch(L, C, H);
  return toHex(m.r, m.g, m.b);
}

/* --------------------------------------------------------------------------
   7. Gamut mapping - CSS Color 4 section 13.2
   Binary search on chroma with a delta-E-OK acceptance test, not a naive clip.
   clippedC and deltaE are returned because the popover shows both as real
   numbers.
   -------------------------------------------------------------------------- */

const JND = 0.02;
const EPSILON = 1e-4;

export const inGamut = ({ r, g, b }) =>
  r >= -EPSILON && r <= 1 + EPSILON &&
  g >= -EPSILON && g <= 1 + EPSILON &&
  b >= -EPSILON && b <= 1 + EPSILON;

export const clipToGamut = ({ r, g, b }) => ({ r: clamp01(r), g: clamp01(g), b: clamp01(b) });

export const deltaEOK = (c1, c2) => Math.hypot(c1.L - c2.L, c1.a - c2.a, c1.b - c2.b);

export function gamutMapOklch(L, C, H) {
  if (!Number.isFinite(L) || !Number.isFinite(C)) {
    return { r: 0, g: 0, b: 0, clippedC: 0, deltaE: 0 };
  }
  if (L >= 1) return { r: 1, g: 1, b: 1, clippedC: 0, deltaE: 0 };
  if (L <= 0) return { r: 0, g: 0, b: 0, clippedC: 0, deltaE: 0 };

  const direct = oklchToSrgbUnclamped(L, C, H);
  if (inGamut(direct)) {
    return { r: clamp01(direct.r), g: clamp01(direct.g), b: clamp01(direct.b), clippedC: C, deltaE: 0 };
  }

  let min = 0;
  let max = C;
  let minInGamut = true;
  let current = direct;
  let clipped = clipToGamut(direct);
  let E = 0;

  while (max - min > EPSILON) {
    const chroma = (min + max) / 2;
    current = oklchToSrgbUnclamped(L, chroma, H);

    if (minInGamut && inGamut(current)) {
      min = chroma;
      continue;
    }

    clipped = clipToGamut(current);
    const labClipped = srgbToOklab(clipped.r, clipped.g, clipped.b);
    const labWanted = oklchToOklab(L, chroma, H);
    E = deltaEOK(labClipped, labWanted);

    if (E < JND) {
      if (JND - E < EPSILON) return { ...clipped, clippedC: chroma, deltaE: E };
      minInGamut = false;
      min = chroma;
    } else {
      max = chroma;
    }
  }

  return { ...clipToGamut(current), clippedC: min, deltaE: E };
}

/** True when the requested OKLCH triple is representable in sRGB as-is. */
export function isInSrgb(L, C, H) {
  return inGamut(oklchToSrgbUnclamped(L, C, H));
}

/* --------------------------------------------------------------------------
   HSL, for the `in hsl` comparison space
   -------------------------------------------------------------------------- */

export function srgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return { h: NaN, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

export function hslToSrgb(h, s, l) {
  if (s <= 0 || Number.isNaN(h)) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const hk = ((h % 360) + 360) % 360 / 360;
  return { r: f(hk + 1 / 3), g: f(hk), b: f(hk - 1 / 3) };
}

/* --------------------------------------------------------------------------
   6. Interpolation
   Common signature mix(a, b, t) -> {r,g,b} in sRGB [0,1].
   -------------------------------------------------------------------------- */

/** Shortest signed arc between two hues, branchless so it ports to GLSL. */
export function lerpHue(h1, h2, t) {
  const d = ((h2 - h1 + 540) % 360) - 180;
  return (h1 + d * t + 360) % 360;
}

const lerp = (a, b, t) => a + (b - a) * t;

/** 6.1 sRGB. Component-wise lerp on gamma-encoded values: the wrong one,
 *  reproduced faithfully, because a comparison against a strawman is worthless. */
export function mixSrgb(c1, c2, t) {
  return { r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t) };
}

/** 6.2 HSL, hue along the short arc, matching CSS `in hsl`. */
export function mixHsl(c1, c2, t) {
  const a = srgbToHsl(c1.r, c1.g, c1.b);
  const b = srgbToHsl(c2.r, c2.g, c2.b);
  let ha = a.h;
  let hb = b.h;
  if (Number.isNaN(ha) && Number.isNaN(hb)) { ha = 0; hb = 0; }
  else if (Number.isNaN(ha)) ha = hb;
  else if (Number.isNaN(hb)) hb = ha;
  const h = lerpHue(ha, hb, t);
  const out = hslToSrgb(h, lerp(a.s, b.s, t), lerp(a.l, b.l, t));
  return { r: clamp01(out.r), g: clamp01(out.g), b: clamp01(out.b) };
}

/** 6.3 OKLab. Rectangular, so no hue-path question. Used for mesh blending. */
export function mixOklab(c1, c2, t) {
  const a = srgbToOklab(c1.r, c1.g, c1.b);
  const b = srgbToOklab(c2.r, c2.g, c2.b);
  const L = lerp(a.L, b.L, t);
  const A = lerp(a.a, b.a, t);
  const B = lerp(a.b, b.b, t);
  const lch = oklabToOklch(L, A, B);
  const m = gamutMapOklch(lch.L, lch.C, lch.H);
  return { r: m.r, g: m.g, b: m.b };
}

/** 6.4 OKLCH with powerless-hue carry and shortest-arc hue. The default. */
export function mixOklch(c1, c2, t) {
  const a = srgbToOklch(c1.r, c1.g, c1.b);
  const b = srgbToOklch(c2.r, c2.g, c2.b);
  let ha = a.H;
  let hb = b.H;
  if (Number.isNaN(ha) && Number.isNaN(hb)) { ha = 0; hb = 0; }
  else if (Number.isNaN(ha)) ha = hb;
  else if (Number.isNaN(hb)) hb = ha;
  const L = lerp(a.L, b.L, t);
  const C = lerp(a.C, b.C, t);
  const H = lerpHue(ha, hb, t);
  const m = gamutMapOklch(L, C, H);
  return { r: m.r, g: m.g, b: m.b };
}

export const SPACE_IDS = { srgb: 0, hsl: 1, oklab: 2, oklch: 3 };
export const SPACE_LABELS = { srgb: 'sRGB', hsl: 'HSL', oklab: 'OKLab', oklch: 'OKLCH' };
export const SPACE_ORDER = ['srgb', 'hsl', 'oklab', 'oklch'];
export const TYPE_LABELS = { linear: '線性', radial: '放射', conic: '圓錐' };

export function mixInSpace(space, c1, c2, t) {
  switch (space) {
    case 'hsl': return mixHsl(c1, c2, t);
    case 'oklab': return mixOklab(c1, c2, t);
    case 'oklch': return mixOklch(c1, c2, t);
    default: return mixSrgb(c1, c2, t);
  }
}

/* --------------------------------------------------------------------------
   6.5 Easing between stops
   -------------------------------------------------------------------------- */

export const EASINGS = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export const EASING_IDS = { linear: 0, in: 1, out: 2, inout: 3 };

/** Figma-style midpoint: t' = t^k where k = log(0.5)/log(midpoint). */
export const midpointExponent = (mid) => Math.log(0.5) / Math.log(clamp(mid, 0.05, 0.95));

/* --------------------------------------------------------------------------
   8.1 Ordered dither
   8x8 Bayer generated by the standard recursion so it is verifiable, never
   pasted as a literal.
   -------------------------------------------------------------------------- */

export function bayer(n) {
  if (n === 1) return [[0]];
  const s = bayer(n / 2);
  const half = n / 2;
  const out = Array.from({ length: n }, () => new Array(n));
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      const v = 4 * s[y][x];
      out[y][x] = v;
      out[y][x + half] = v + 2;
      out[y + half][x] = v + 3;
      out[y + half][x + half] = v + 1;
    }
  }
  return out;
}

/** Normalized to [-0.5, 0.5). Applied at amplitude 1/255 immediately before
 *  the 8-bit write, in gamma-encoded space. */
export const BAYER8 = bayer(8).map((row) => row.map((v) => v / 64 - 0.5));

/** Closed form of the same matrix. Used by the fragment shader; kept here so
 *  the two implementations can be diffed. */
export function bayerClosed(x, y) {
  // The recursion puts the OUTERMOST quadrant split (the high coordinate bit)
  // in the LOW two bits of the result, so the loop runs from the fine bit up.
  let v = 0;
  for (let i = 0; i < 3; i++) {
    v = v * 4 + ((2 * ((x >> i) & 1) + 3 * ((y >> i) & 1)) & 3);
  }
  return v;
}

/* --------------------------------------------------------------------------
   9. Color vision deficiency
   Machado, Oliveira and Fernandes (2009), severity 1.0.
   Applied in LINEAR-LIGHT RGB, never in gamma space. Preview only: exports
   always use identity.
   -------------------------------------------------------------------------- */

export const CVD = {
  normal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.011820, 0.042940, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779,
    -0.078411, 0.930809, 0.147602,
    0.004733, 0.691367, 0.303900,
  ],
};

export const VISION_ORDER = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];
export const VISION_LABELS = {
  normal: '一般',
  protanopia: '紅色盲',
  deuteranopia: '綠色盲',
  tritanopia: '藍黃色盲',
};

/** Apply a CVD matrix to a gamma-encoded sRGB triple, doing the work in
 *  linear light. Returns gamma-encoded sRGB. */
export function applyCvd(rgb, kind) {
  const m = CVD[kind] || CVD.normal;
  if (kind === 'normal' || !kind) return rgb;
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return {
    r: clamp01(linearToSrgb(m[0] * r + m[1] * g + m[2] * b)),
    g: clamp01(linearToSrgb(m[3] * r + m[4] * g + m[5] * b)),
    b: clamp01(linearToSrgb(m[6] * r + m[7] * g + m[8] * b)),
  };
}

/* --------------------------------------------------------------------------
   10. Contrast
   WCAG 2.1 relative luminance and ratio. APCA is deliberately not implemented:
   its specification is still revising and a number that later changes would
   break the one thing this product sells.
   -------------------------------------------------------------------------- */

export const relativeLuminance = ({ r, g, b }) =>
  0.2126 * srgbToLinear(clamp01(r)) +
  0.7152 * srgbToLinear(clamp01(g)) +
  0.0722 * srgbToLinear(clamp01(b));

export function contrastRatio(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const hi = a > b ? a : b;
  const lo = a > b ? b : a;
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA threshold for a given rendered size and weight. */
export const aaThreshold = (px, weight) => (px >= 24 || (px >= 18.66 && weight >= 700) ? 3 : 4.5);

/* --------------------------------------------------------------------------
   Formatting
   -------------------------------------------------------------------------- */

export function formatOklch(L, C, H, { pct = true } = {}) {
  const h = Number.isNaN(H) ? 'none' : H.toFixed(1);
  return pct
    ? `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${h})`
    : `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h})`;
}

export function hexToOklchString(hex) {
  const lch = hexToOklch(hex);
  return lch ? formatOklch(lch.L, lch.C, lch.H) : '';
}

/* --------------------------------------------------------------------------
   Authored color naming over the OKLCH hue wheel.
   Used for the Stage's aria-label and each stop's aria-valuetext, so a screen
   reader hears "indigo at 42 percent" instead of a hex string.
   -------------------------------------------------------------------------- */

const HUE_NAMES = [
  [345, 360, '紅'], [0, 15, '紅'], [15, 45, '橘'], [45, 70, '琥珀'],
  [70, 100, '橄欖綠'], [100, 150, '綠'], [150, 180, '藍綠'], [180, 210, '青'],
  [210, 250, '天藍'], [250, 275, '藍'], [275, 300, '靛'],
  [300, 330, '紫'], [330, 345, '洋紅'],
];

export function nameColor(hex) {
  const lch = hexToOklch(hex);
  if (!lch) return '無法辨識的顏色';
  const { L, C, H } = lch;
  if (C < 0.02 || Number.isNaN(H)) {
    if (L < 0.1) return '黑';
    if (L < 0.32) return '炭黑';
    if (L < 0.58) return '灰';
    if (L < 0.84) return '銀灰';
    return '白';
  }
  const h = ((H % 360) + 360) % 360;
  let base = '灰';
  for (const [lo, hi, name] of HUE_NAMES) {
    if (h >= lo && h < hi) { base = name; break; }
  }
  let prefix = '';
  if (L < 0.26) prefix = '深';
  else if (L < 0.46) prefix = '暗';
  else if (L > 0.86) prefix = '淡';
  else if (L > 0.72) prefix = '淺';
  // Chinese puts the saturation qualifier ahead of the lightness one, so this
  // prepends where the English version appended.
  if (C < 0.05) prefix = '濁' + prefix;
  return prefix + base;
}

/* --------------------------------------------------------------------------
   Self test. Exercised by tools/check-color.mjs, never at runtime.
   -------------------------------------------------------------------------- */

export function selfTest() {
  const failures = [];

  // Round-trip: hex -> OKLCH -> hex must be the identity.
  const step = 17;
  for (let r = 0; r <= 255; r += step) {
    for (let g = 0; g <= 255; g += step) {
      for (let b = 0; b <= 255; b += step) {
        const hex = toHex(r / 255, g / 255, b / 255);
        const lch = hexToOklch(hex);
        const back = oklchToHex(lch.L, lch.C, lch.H);
        if (back !== hex) failures.push(`round-trip ${hex} -> ${back}`);
      }
    }
  }
  for (let i = 0; i < 2000; i++) {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    const hex = toHex(r / 255, g / 255, b / 255);
    const lch = hexToOklch(hex);
    const back = oklchToHex(lch.L, lch.C, lch.H);
    if (back !== hex) failures.push(`random round-trip ${hex} -> ${back}`);
  }

  // Bayer: recursion and closed form must agree.
  const rec = bayer(8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (rec[y][x] !== bayerClosed(x, y)) failures.push(`bayer ${x},${y}`);
    }
  }

  // Powerless hue: black to orange must not bend through red.
  const mid = mixOklch(parseHex('#000000'), parseHex('#FF7A00'), 0.5);
  const midLch = srgbToOklch(mid.r, mid.g, mid.b);
  const endLch = hexToOklch('#FF7A00');
  if (Math.abs(midLch.H - endLch.H) > 2) failures.push('powerless hue carry');

  // Contrast sanity.
  const cw = contrastRatio(parseHex('#FFFFFF'), parseHex('#000000'));
  if (Math.abs(cw - 21) > 0.01) failures.push(`white on black = ${cw}`);

  return failures;
}
