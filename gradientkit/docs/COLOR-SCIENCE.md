# GradientKit - COLOR SCIENCE

Implementation spec for `js/color.js`. Everything here is hand-implemented. No color library is
loaded, in JS or via CDN. If a value in this document is wrong, the product is wrong, so every
constant below is written out in full rather than approximated.

Module contract: `js/color.js` exports pure functions only, no DOM, no state, no side effects. It is
the one module in the project that can be unit-tested in isolation, and it will be.

Convention: all channel values are floats. sRGB and linear-sRGB in `[0,1]`. OKLab `L` in `[0,1]`,
`a`/`b` roughly `[-0.4, 0.4]`. OKLCH `C >= 0`, `H` in degrees `[0, 360)`.

---

## 1. sRGB transfer function

```js
export const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

export const linearToSrgb = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
```

Both are applied per channel. Negative inputs are passed through the linear branch unchanged in
sign (`Math.sign(c) * f(Math.abs(c))`) so that out-of-gamut intermediates round-trip correctly
during gamut mapping rather than being silently clamped at the wrong stage.

The shader uses the identical piecewise function, not the `pow(c, 2.2)` shortcut. The shortcut is
where most WebGL gradient tools quietly lose accuracy in the darks.

---

## 2. linear-sRGB to OKLab

Bjorn Ottosson's matrices, full precision.

```js
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
```

`Math.cbrt` is used rather than `Math.pow(x, 1/3)` because `pow` returns `NaN` for negative inputs,
and `l`/`m`/`s` do go negative for out-of-gamut colors during gamut mapping. In GLSL, where `cbrt`
does not exist, use `sign(x) * pow(abs(x), 1.0/3.0)`.

## 3. OKLab to linear-sRGB

```js
export function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r:  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}
```

## 4. OKLab to OKLCH and back

```js
export function oklabToOklch(L, a, b) {
  const C = Math.sqrt(a * a + b * b);
  // Below this chroma the hue is meaningless. CSS Color 4 calls it "powerless".
  const H = C < 1e-7 ? NaN : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

export function oklchToOklab(L, C, H) {
  const h = Number.isNaN(H) ? 0 : (H * Math.PI) / 180;
  return { L, a: C * Math.cos(h), b: C * Math.sin(h) };
}
```

`H` is deliberately `NaN` and not `0` for achromatic colors. Carrying a fake hue of 0 is exactly the
bug that makes a black-to-orange ramp in other tools swing through red. Section 6 handles it.

## 5. Round-trip requirement

`hexToOklch` then `oklchToHex` must be the identity for every 8-bit sRGB triple. The test in
`docs/` terms: sample all 4096 colors where each channel is a multiple of 17, plus 2000 random
triples, and assert exact byte equality after rounding. Any failure blocks the build. This is the
first thing implemented and the first thing tested, before any UI exists.

Rounding on output is `Math.round(clamp01(c) * 255)`, not `Math.floor`, and not `(c*255)|0`.

---

## 6. Interpolation

The four spaces, all with a common signature `mix(a, b, t) -> {r,g,b}` in sRGB `[0,1]`.

### 6.1 sRGB (the wrong one, shipped for comparison)

Component-wise lerp on the **gamma-encoded** values. This is what `linear-gradient()` does without
an `in` keyword, and what every legacy tool does. We reproduce the wrong behaviour faithfully,
because a comparison against a strawman is worthless.

### 6.2 HSL

Convert both endpoints to HSL, lerp `S` and `L` linearly, lerp `H` along the **short arc**
(Section 6.4), convert back. Reproduces `in hsl` from CSS Color 4.

### 6.3 OKLab

Convert both endpoints to OKLab, lerp `L`, `a`, `b` component-wise, convert back, then gamut-map.
Rectangular, so no hue path question arises. This is the space used for mesh blending because a
mesh weights more than two colors at once and only a rectangular space makes that well-defined.

### 6.4 OKLCH (the default)

Convert both endpoints to OKLCH. Lerp `L` and `C` linearly. Lerp `H` along the shortest arc:

```js
export function lerpHue(h1, h2, t) {
  let d = ((h2 - h1 + 540) % 360) - 180;   // shortest signed delta, [-180, 180)
  return (h1 + d * t + 360) % 360;
}
```

The `+540 ... -180` form is used rather than a chain of `if` statements because it is branchless and
translates directly to GLSL.

**Powerless hue carry.** Before interpolating, if one endpoint's `H` is `NaN` (its `C` is below
`1e-7`), it adopts the other endpoint's hue. If both are `NaN`, hue is irrelevant and is set to `0`.
This is the CSS Color 4 rule and it is the difference between `#000000 -> #FF7A00` producing a clean
dark-orange ramp (correct) and producing a ramp that bends through red (what happens when a tool
treats black as `H = 0`).

After every OKLCH interpolation, the result is gamut-mapped (Section 7) before conversion to sRGB.

### 6.5 Easing between stops

Each stop pair carries an optional easing curve applied to `t` before interpolation, so that stop
distribution can be shaped without adding stops. Options exposed in the UI: `linear` (default),
`ease-in`, `ease-out`, `ease-in-out`, all as cubic beziers, plus a numeric `midpoint` control
(0.05 to 0.95) which maps to the exponent `k = log(0.5) / log(midpoint)` and `t' = t^k`. That is the
same mechanism Figma calls a gradient midpoint handle, and it emits as a real extra CSS stop, since
CSS has no per-pair easing.

---

## 7. Gamut mapping (CSS Color 4, section 13.2)

Used whenever an OKLCH color is not representable in sRGB. Binary search on chroma with a
delta-E-OK acceptance test, exactly as specified, not a naive clip.

```js
const JND = 0.02;
const EPSILON = 1e-4;

export function gamutMapOklch(L, C, H) {
  if (L >= 1) return { r: 1, g: 1, b: 1, clippedC: 0, deltaE: 0 };
  if (L <= 0) return { r: 0, g: 0, b: 0, clippedC: 0, deltaE: 0 };

  const direct = oklchToSrgbUnclamped(L, C, H);
  if (inGamut(direct)) return { ...direct, clippedC: C, deltaE: 0 };

  let min = 0;
  let max = C;
  let minInGamut = true;
  let current, clipped, E = 0;

  while (max - min > EPSILON) {
    const chroma = (min + max) / 2;
    current = oklchToSrgbUnclamped(L, chroma, H);

    if (minInGamut && inGamut(current)) {
      min = chroma;
      continue;
    }

    clipped = clipToGamut(current);                    // per-channel clamp to [0,1]
    E = deltaEOK(srgbToOklab(clipped), { L, ...oklchToOklab(L, chroma, H) });

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

const inGamut = ({ r, g, b }) =>
  r >= -EPSILON && r <= 1 + EPSILON &&
  g >= -EPSILON && g <= 1 + EPSILON &&
  b >= -EPSILON && b <= 1 + EPSILON;

export const deltaEOK = (c1, c2) =>
  Math.hypot(c1.L - c2.L, c1.a - c2.a, c1.b - c2.b);
```

`clippedC` and `deltaE` are surfaced in the color popover's out-of-gamut line, which is why they are
returned rather than discarded. Those are the real numbers shown to the user.

The shader uses a fixed 12-iteration version of the same search rather than a `while` loop, since
`12` iterations over a `[0, 0.4]` chroma range resolves to better than `1e-4`, and unbounded loops
are hostile to GLSL compilers.

---

## 8. Dithering and grain

Two separate passes with separate controls. They solve different problems and users conflate them,
so the UI keeps them adjacent but distinct and the panel title is `Grain and dither`.

### 8.1 Ordered dither (banding removal, on by default)

An 8x8 Bayer matrix, generated once at module load by the standard recursion rather than pasted as a
literal, so it is verifiable:

```js
function bayer(n) {                       // n is a power of two
  if (n === 1) return [[0]];
  const s = bayer(n / 2);
  const out = Array.from({ length: n }, () => new Array(n));
  for (let y = 0; y < n / 2; y++) {
    for (let x = 0; x < n / 2; x++) {
      const v = 4 * s[y][x];
      out[y][x] = v;
      out[y][x + n / 2] = v + 2;
      out[y + n / 2][x] = v + 3;
      out[y + n / 2][x + n / 2] = v + 1;
    }
  }
  return out;
}
// normalized to [-0.5, 0.5)
const BAYER8 = bayer(8).map(row => row.map(v => v / 64 - 0.5));
```

Applied in the fragment shader immediately before the 8-bit write, at an amplitude of exactly
`1/255`, in **gamma-encoded** space (dither must happen at the quantization step, not before the
transfer function). Uploaded as an 8x8 `R8` texture with `NEAREST` filtering and `REPEAT` wrap, and
sampled at `gl_FragCoord.xy / 8.0` so the pattern is locked to device pixels and does not swim when
the canvas resizes.

This removes the 8-bit banding that is visible on any large-area gradient, and it is the reason the
loupe exists: at 8x magnification the user can see the pattern and confirm it is working.

### 8.2 Film grain (aesthetic, off by default)

Hash noise, not a texture, so it costs nothing to change and never tiles.

```glsl
float hash(vec2 p) {
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
```

Sampled at `floor(gl_FragCoord.xy / u_grainSize)` so `u_grainSize` (1 to 8 device pixels) actually
changes the grain's particle size rather than only its density. `u_grainAmp` (0 to 100 in the UI)
maps to `0 .. 0.06` in linear light, applied as a signed perturbation to the linear color before the
transfer function, so grain in the shadows behaves like real film rather than like additive
whitening.

`u_grainSeed` advances by one every animation frame **only** when the user is actively dragging a
grain control, so the grain shimmers while being adjusted (making the effect legible) and is
perfectly static otherwise (so a screenshot and a PNG export match what is on screen).

---

## 9. Color vision deficiency

Machado, Oliveira and Fernandes (2009), severity 1.0, applied in **linear-light** RGB, never in
gamma space. Credited in `README.md`.

```js
export const CVD = {
  protanopia: [
     0.152286,  1.052583, -0.204868,
     0.114503,  0.786281,  0.099216,
    -0.003882, -0.048116,  1.051998,
  ],
  deuteranopia: [
     0.367322,  0.860646, -0.227968,
     0.280085,  0.672501,  0.047413,
    -0.011820,  0.042940,  0.968881,
  ],
  tritanopia: [
     1.255528, -0.076749, -0.178779,
    -0.078411,  0.930809,  0.147602,
     0.004733,  0.691367,  0.303900,
  ],
};
```

Passed to the shader as a `mat3` uniform, identity when simulation is off, so there is no branch in
the fragment shader. Export paths always use identity: the simulation is a preview, never baked into
a file. The UI states this in words on the Notice, because a user who exports a simulated PNG by
accident has been actively harmed.

---

## 10. Contrast measurement

WCAG 2.1 relative luminance and contrast ratio. APCA is deliberately not implemented: its
specification is still revising, and shipping a number that later changes would break the one thing
this product is selling, which is trustworthy numbers.

```js
export const relativeLuminance = ({ r, g, b }) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

export function contrastRatio(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
```

**Worst-point search.** The sample text's bounding box is sampled at 256 positions along its
horizontal centre line plus 3 rows (top quarter, middle, bottom quarter), giving 768 samples. The
minimum ratio and its normalized x position are reported. Samples are read from the **rendered
canvas** via a 1x768 `readPixels` strip, not recomputed from the gradient math, so grain, dither and
gamut clipping are all included in the measurement. Measuring the ideal instead of the actual would
make the number a lie.

Thresholds: 4.5 for text under 18px (or under 14px bold), 3.0 at or above that. The verdict word is
`PASS AA` or `FAIL AA`, capitalised because it quotes the WCAG conformance level.

---

## 11. Mesh field

`N` control points, each with a position in `[0,1]^2`, an OKLab color, and a radius. Blended with
inverse distance weighting in OKLab:

```glsl
vec3 lab = vec3(0.0);
float wsum = 0.0;
for (int i = 0; i < MAX_POINTS; i++) {
  if (i >= u_pointCount) break;
  vec2 d = (uv - u_pointPos[i]) / max(u_pointRadius[i], 1e-3);
  float dist2 = dot(d, d) + 1e-5;
  float w = 1.0 / pow(dist2, u_falloff * 0.5);   // u_falloff default 2.4
  lab += u_pointLab[i] * w;
  wsum += w;
}
lab /= wsum;
```

`MAX_POINTS` is 12, matching the portfolio spec's 4 to 12 range. The loop bound is a compile-time
constant with a runtime `break`, because dynamic loop bounds are not portable in GLSL ES 3.00.

OKLab, not sRGB, is what stops the grey lobes at the seams between points. That is the same argument
as the gradient case, and the mesh mode's Notice on first use says so in one sentence.

**Canvas2D fallback:** identical math, evaluated in JS on a 96x96 `ImageData`, then drawn to the
Stage with `imageSmoothingEnabled = true` and `imageSmoothingQuality = 'high'`. Roughly 1/6 linear
resolution, which is why the fallback Notice says "lower resolution". Export always runs the full
resolution CPU path regardless, in 256px tiles with a `yield` between tiles so the tab does not lock.

---

## 12. Output formats

### 12.1 CSS

```css
/* modern */
background: linear-gradient(in oklch longer hue 135deg,
  oklch(0.176 0.058 271.4) 0%,
  oklch(0.318 0.129 268.1) 42%,
  oklch(0.671 0.135 271.9) 100%);
```

Emitted with `shorter hue` by default (matching our own interpolation) and only naming the hue
interpolation method when it is not the default, so the output stays readable.

Fallback block, always emitted:

```css
background: linear-gradient(135deg, #0B1026 0%, #1B2A6B 42%, #6E8BFF 100%);
@supports (background: linear-gradient(in oklch, #000, #fff)) {
  background: linear-gradient(in oklch 135deg, ...);
}
```

The fallback is **not** a two-stop guess. It is the OKLCH curve resampled at 9 evenly spaced
positions and written as sRGB hex stops, so a browser without `in oklch` still gets a visually close
result rather than the muddy two-stop version. That resampling is the single most useful thing this
tool emits and it is why an engineer will paste our output instead of writing their own.

Every emitted string is verified with `CSS.supports('background', str)` before the Copy button is
enabled. If verification fails, the button is disabled with the reason exposed, and that is a bug
report, not a user error.

### 12.2 SVG

Real `<linearGradient>` / `<radialGradient>` with `gradientUnits="objectBoundingBox"` and a
`gradientTransform="rotate(a, 0.5, 0.5)"` for the angle. Conic has no SVG equivalent, so the SVG tab
for a conic gradient offers a 512px `<image>` with an embedded data URI instead, and says so in one
sentence rather than silently emitting something wrong.

Stops are resampled to 9 sRGB stops for the same reason as the CSS fallback, since SVG gradients are
sRGB-only.

### 12.3 Tailwind v4

```css
@theme {
  --gradient-deep-field: linear-gradient(in oklch 135deg, ... );
}
```

Plus the utility usage line as a comment. v4 `@theme`, not a v3 `tailwind.config.js` object, because
v3 config files are the thing being replaced and emitting one would age the output on day one.

### 12.4 PNG

Rendered by the same shader into an `OffscreenCanvas` at the requested size (1024 / 2048 / 4096),
with dither and grain applied at that resolution rather than upscaled. `OffscreenCanvas` is
feature-detected; without it, a detached `<canvas>` is used. Falls back to 2048 on allocation
failure, with the Notice described in `INTERACTION.md` section 7.

---

## 13. URL hash schema

Version-prefixed, readable, hand-editable, and short enough to survive a Slack paste.

```
#gk1&k=g&t=l&a=135&i=oklch&s=0B1026@0,1B2A6B@42,6E8BFF@100&g=14_2&d=1
```

| Key | Values | Meaning |
|---|---|---|
| `gk1` | literal | Schema version. Unknown versions parse what they recognise and skip the rest. |
| `k` | `g` \| `m` | Mode: gradient or mesh |
| `t` | `l` \| `r` \| `c` | Linear, radial, conic |
| `a` | `0`-`359` | Angle in degrees. Omitted for radial. |
| `i` | `srgb` \| `hsl` \| `oklab` \| `oklch` | Interpolation space |
| `s` | `RRGGBB@pos` list | Stops. Position `0`-`100`, up to 2 decimals. Comma separated. |
| `m` | `RRGGBB@x_y_r` list | Mesh points. `x`,`y`,`r` in hundredths. Present only when `k=m`. |
| `g` | `amp_size` | Grain amplitude `0`-`100`, size `1`-`8` |
| `d` | `0` \| `1` | Dither |
| `e` | `l` \| `i` \| `o` \| `io` | Easing between stops. Omitted when linear. |

Parsing is total: every field is individually validated, an invalid field falls back to its default
rather than aborting the whole parse, and a completely unparseable hash produces the default gradient
plus the Notice from `INTERACTION.md` section 7. There is no code path where a hash throws.

Written with `history.replaceState`, not `location.hash =`, so editing a gradient does not fill the
browser's back stack with hundreds of entries. That is a small detail that decides whether the back
button works.

---

## 14. The reference set

12 gradient specimens and 3 mesh fields, all authored here. Each one exists to demonstrate a
specific behaviour, which is why the shelf is called a reference set and not a gallery. Colors are
authored as sRGB hex and converted to OKLCH at load; the OKLCH values shown in the UI are always
computed, never stored, so they cannot drift from the math.

| # | Name | Type | Space | Stops | Demonstrates |
|---|---|---|---|---|---|
| 1 | Deep Field | linear 200 | oklch | `#05060E` `#1B2A6B` `#6E8BFF` | The default. Dark-to-light blue where sRGB loses a third of the chroma mid-ramp. |
| 2 | Sodium Lamp | linear 165 | oklch | `#1A0E00` `#FF7A00` `#FFD98A` | Powerless-hue carry: a near-black endpoint that must not bend through red. |
| 3 | Anodize | linear 135 | oklch | `#2B0A3D` `#B5179E` `#FF8FA3` | The classic magenta ramp that goes chalky in sRGB. |
| 4 | Cold Cathode | linear 110 | oklch | `#001417` `#00B3A4` `#C8FFF4` | Out-of-gamut chroma at the midpoint. Shows gamut mapping working. |
| 5 | Kiln | linear 90 | oklch | `#240000` `#C1121F` `#FFB703` | Long hue travel, 60 degrees, where the short-arc rule matters most. |
| 6 | Mineral Wash | linear 160 | oklab | `#0F1A17` `#4C7A66` `#D8E2DC` | Rectangular blending. Compare against #1 to feel the difference between OKLab and OKLCH. |
| 7 | Photoresist | conic 45 | oklch | `#14002E` `#6D23B6` `#00D4FF` | Conic type, and the exact hex pair from the product's origin story. |
| 8 | Overcast | linear 180 | oklab | `#1C1E20` `#9AA3AA` `#E8EDF1` | Near-neutral ramp. The sweep correctly reports no meaningful dead zone here. |
| 9 | Ember Ring | radial | oklch | `#FF5400` `#47070A` `#08050A` | Radial type with an off-centre origin at 30% 30%. |
| 10 | Aurora Sweep | conic 0 | oklch | `#0B1026` `#00E5A0` `#7B5CFF` `#0B1026` | Four stops, closed loop, where the first and last must match exactly. |
| 11 | Cyanotype | linear 155 | oklch | `#04141F` `#0B5C8C` `#7FD3F7` | Low-chroma blue where dithering matters more than interpolation. |
| 12 | Step Wedge | linear 90 | srgb | `#101010` `#E0E0E0` | The control specimen. Pure achromatic, deliberately sRGB, because banding is worst on a neutral ramp and this is where the dither loupe is most convincing. |

| # | Mesh field | Points | Demonstrates |
|---|---|---|---|
| M1 | Bloom | 4 | Minimum viable field. Two warm, two cool lobes meeting in the centre. |
| M2 | Interference | 7 | Where sRGB mesh tools produce grey seams and OKLab does not. |
| M3 | Cross Section | 12 | The maximum. Performance ceiling test, and the one that justifies the WebGL path. |

Names are drawn from optics, photography and materials processing, which is the world the interface
already lives in. None of them are `Cool Blues` or `Sunset Vibes`, and none of them are borrowed
from uiGradients.
