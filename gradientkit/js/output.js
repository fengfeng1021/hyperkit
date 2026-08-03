/* ==========================================================================
   GradientKit - output.js
   Every export target. The rule for all four: emit something an engineer can
   paste into production without a rewrite, or say plainly that we cannot.

   The sRGB fallback is never a two-stop guess. It is the OKLCH curve resampled
   at nine positions, which is the single most useful thing this tool emits.
   ========================================================================== */

import { buildRamp, resampleHexStops, rampAt } from './gradient.js';
import { hexToOklch, formatOklch, toHex } from './color.js';
import { renderToCanvas } from './render.js';

/* A class name and a filename both have to be ASCII, and every preset name in
   this build is Chinese, so slugging the name alone would collapse all fifteen
   specimens to `gradient`. The preset id is already a stable ASCII slug of the
   same thing, so it is the fallback before the generic word. */
const slug = (name, fallback = 'gradient') =>
  (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  || fallback
  || 'gradient';

const sceneSlug = (scene) => slug(scene.name, slug(scene.presetId));

const SPACE_CSS = { srgb: 'srgb', hsl: 'hsl', oklab: 'oklab', oklch: 'oklch' };
const SPACE_LABEL = { srgb: 'sRGB', hsl: 'HSL', oklab: 'OKLab', oklch: 'OKLCH' };

/* --------------------------------------------------------------------------
   Shared stop preparation
   -------------------------------------------------------------------------- */

function sortedStops(scene) {
  return scene.stops.slice().sort((a, b) => a.pos - b.pos);
}

/** Radial output scales stop positions by the radius, because CSS measures a
 *  radial gradient against farthest-corner while we measure against our own
 *  radius. Scaling makes the emitted CSS pixel-identical to the Stage. */
function cssStopList(scene, stops) {
  if (scene.type !== 'radial' || (scene.radius ?? 1) >= 0.999) return stops;
  const r = scene.radius;
  const scaled = stops.map((s) => ({ ...s, pos: +(s.pos * r).toFixed(2) }));
  const last = scaled[scaled.length - 1];
  if (last.pos < 100) scaled.push({ ...last, pos: 100 });
  return scaled;
}

function geometryPrefix(scene, space) {
  const inPart = space === 'srgb' ? '' : ` in ${SPACE_CSS[space]}`;
  if (scene.type === 'conic') return { fn: 'conic-gradient', head: `from ${Math.round(scene.angle)}deg${inPart}` };
  if (scene.type === 'radial') {
    const cx = Math.round((scene.center?.x ?? 0.5) * 100);
    const cy = Math.round((scene.center?.y ?? 0.5) * 100);
    return { fn: 'radial-gradient', head: `circle farthest-corner at ${cx}% ${cy}%${inPart}` };
  }
  return { fn: 'linear-gradient', head: `${Math.round(scene.angle)}deg${inPart}` };
}

const pct = (p) => `${(+p.toFixed(2))}%`;

/* --------------------------------------------------------------------------
   CSS
   -------------------------------------------------------------------------- */

export function buildCss(scene) {
  const name = sceneSlug(scene);
  const stops = sortedStops(scene);
  const ramp = buildRamp(scene.stops, scene.space, scene.easing, 512);

  // Modern block, in the user's chosen interpolation space.
  const modern = geometryPrefix(scene, scene.space);
  const modernStops = cssStopList(scene, stops).map((s) => {
    const lch = hexToOklch(s.hex);
    return `    ${formatOklch(lch.L, lch.C, lch.H)} ${pct(s.pos)}`;
  }).join(',\n');
  const modernValue = `${modern.fn}(${modern.head},\n${modernStops})`;

  // Fallback: the same curve resampled to 9 sRGB stops, not a two-stop guess.
  // When the gradient is already sRGB with even distribution there is nothing
  // to approximate, so the authored stops are emitted verbatim and the output
  // is exact rather than merely close.
  const exact = scene.space === 'srgb' && scene.easing === 'linear';
  const fbStops = cssStopList(scene, exact ? stops : resampleHexStops(ramp, 9));
  const plain = geometryPrefix(scene, 'srgb');
  const fallbackValue = `${plain.fn}(${plain.head}, ${fbStops.map((s) => `${s.hex} ${pct(s.pos)}`).join(', ')})`;

  const grainNote = scene.grain?.amp > 0
    ? `\n\n/* Grain is a canvas pass with no CSS equivalent. Export PNG to keep it. */`
    : '';

  // Interpolating in sRGB is already what every browser does, so there is
  // nothing to fall back from and no @supports guard is emitted.
  const code = scene.space === 'srgb'
    ? `/* ${scene.name || 'Gradient'} - GradientKit */
/* Interpolated in sRGB, which needs no fallback and no @supports guard. */
.${name} {
  background-image: ${fallbackValue};
}${grainNote}`
    : `/* ${scene.name || 'Gradient'} - GradientKit */
.${name} {
  /* sRGB fallback, resampled from the ${SPACE_LABEL[scene.space]} curve at 9 stops */
  background-image: ${fallbackValue};
}

@supports (background: ${plain.fn}(in oklch, #000, #fff)) {
  .${name} {
    background-image: ${modernValue};
  }
}${grainNote}`;

  return { code, modernValue, fallbackValue, name, plain: scene.space === 'srgb' };
}

/** CSS.supports round-trip. The fallback failing is a bug in this tool and is
 *  reported as such; the modern block failing only means this browser is older
 *  than the code it is generating, which is normal and is not an error. */
export function verifyCss(out) {
  const can = typeof CSS !== 'undefined' && typeof CSS.supports === 'function';
  if (!can) return { fallbackOk: true, modernOk: null, note: '' };
  const fallbackOk = CSS.supports('background-image', out.fallbackValue);
  const modernOk = out.plain ? true : CSS.supports('background-image', out.modernValue);
  let note = '';
  if (out.plain) {
    note = fallbackOk
      ? '已在這個瀏覽器驗過。sRGB 插值本來就是各家的預設行為，所以不需要備援區塊。'
      : '這段漸層在這個瀏覽器裡沒驗過。這是漸層工坊的問題，不是你的漸層有問題。';
  } else if (!fallbackOk) {
    note = '備援那一段在這個瀏覽器裡沒驗過。這是漸層工坊的問題，不是你的漸層有問題。';
  } else if (!modernOk) {
    note = '這個瀏覽器看不懂新式那一段，所以只驗到備援。新式那段送到支援的瀏覽器上還是正常的。';
  } else {
    note = '兩段都在這個瀏覽器裡驗過了。';
  }
  return { fallbackOk, modernOk, note };
}

/* --------------------------------------------------------------------------
   SVG
   Stops are resampled to 17 sRGB stops because SVG gradients are sRGB only.
   -------------------------------------------------------------------------- */

export function buildSvg(scene) {
  const name = sceneSlug(scene);
  const ramp = buildRamp(scene.stops, scene.space, scene.easing, 512);
  const stops = resampleHexStops(ramp, 17);
  const stopTags = stops
    .map((s) => `      <stop offset="${(s.pos / 100).toFixed(4)}" stop-color="${s.hex}"/>`)
    .join('\n');

  if (scene.type === 'conic') {
    return {
      code:
`<!-- SVG has no conic gradient primitive. -->
<!-- Press Build image below to embed a 512px raster of this exact conic. -->`,
      needsRaster: true,
      name,
    };
  }

  if (scene.type === 'radial') {
    const cx = (scene.center?.x ?? 0.5).toFixed(3);
    const cy = (scene.center?.y ?? 0.5).toFixed(3);
    const far = Math.max(
      Math.hypot(scene.center?.x ?? 0.5, scene.center?.y ?? 0.5),
      Math.hypot(1 - (scene.center?.x ?? 0.5), scene.center?.y ?? 0.5),
      Math.hypot(scene.center?.x ?? 0.5, 1 - (scene.center?.y ?? 0.5)),
      Math.hypot(1 - (scene.center?.x ?? 0.5), 1 - (scene.center?.y ?? 0.5)),
    );
    const r = (far * (scene.radius ?? 0.75)).toFixed(3);
    return {
      code:
`<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="${name}" gradientUnits="objectBoundingBox" cx="${cx}" cy="${cy}" r="${r}">
${stopTags}
    </radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#${name})"/>
</svg>`,
      name,
    };
  }

  // Linear: SVG's default vector runs left to right, CSS 90deg runs left to
  // right, so the transform is the CSS angle minus 90.
  const rot = (Math.round(scene.angle) - 90 + 360) % 360;
  return {
    code:
`<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${name}" gradientUnits="objectBoundingBox"
        x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(${rot} 0.5 0.5)">
${stopTags}
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#${name})"/>
</svg>`,
    name,
  };
}

/** Conic and mesh have no SVG primitive, so the honest output embeds a raster
 *  of exactly what the Stage shows rather than silently emitting something
 *  that renders differently. */
export async function buildSvgRaster(scene, size = 512) {
  const name = sceneSlug(scene);
  const canvas = await renderToCanvas({ ...scene, vision: 'normal' }, size);
  const dataUri = await canvasToDataUrl(canvas);
  return {
    code:
`<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <image id="${name}" width="${size}" height="${size}" preserveAspectRatio="none"
         href="${dataUri}"/>
</svg>`,
    name,
  };
}

async function canvasToDataUrl(canvas) {
  if (typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
  }
  return canvas.toDataURL('image/png');
}

/* --------------------------------------------------------------------------
   Tailwind v4
   `@theme`, not a v3 config object: v3 config files are the thing being
   replaced, and emitting one would age the output on day one.
   -------------------------------------------------------------------------- */

export function buildTailwind(scene) {
  const name = sceneSlug(scene);
  const css = buildCss(scene);
  const ramp = buildRamp(scene.stops, scene.space, scene.easing, 512);
  const mid = rampAt(ramp, 0.5);
  const first = rampAt(ramp, 0);
  const last = rampAt(ramp, 1);

  const code =
`/* app.css */
@import "tailwindcss";

@theme {
  --gradient-${name}: ${css.fallbackValue};
  --color-${name}-from: ${toHex(first.r, first.g, first.b)};
  --color-${name}-mid: ${toHex(mid.r, mid.g, mid.b)};
  --color-${name}-to: ${toHex(last.r, last.g, last.b)};
}

@supports (background: linear-gradient(in oklch, #000, #fff)) {
  @theme {
    --gradient-${name}: ${css.modernValue.replace(/\n\s+/g, ' ')};
  }
}

/* Usage */
/* <div class="bg-(image:--gradient-${name})"></div> */`;

  return { code, name };
}

/* --------------------------------------------------------------------------
   PNG
   Rendered by the same shader at the requested size, with dither and grain
   applied at that resolution rather than upscaled.
   -------------------------------------------------------------------------- */

export async function exportPng(scene, size, onProgress = () => {}) {
  let target = size;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const canvas = await renderToCanvas(scene, target, onProgress);
      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error('toBlob returned null');
      return { blob, size: target, downgraded: target !== size };
    } catch (err) {
      if (attempt === 0 && target > 2048) {
        target = 2048;
        continue;
      }
      throw err;
    }
  }
  throw new Error('export failed');
}

function canvasToBlob(canvas) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((res) => { canvas.toBlob(res, 'image/png'); });
}

/** Returns true when the browser actually started the download. A blocked
 *  download is reported to the caller so it can offer a real link instead. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  return url;
}

export function suggestedFilename(scene, size) {
  return `${sceneSlug(scene)}-${size}.png`;
}

export { slug };
