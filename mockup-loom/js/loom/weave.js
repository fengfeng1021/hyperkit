/**
 * js/loom/weave.js
 * Turns a form recipe plus a seed into the two textures the shader needs.
 *
 *   FIELD (square, FIELD_SIZE)   R height   G occlusion   B heather   A thread
 *   SHAPE (aspect correct)       R coverage G print area  B shading   A seam
 *
 * Nothing here is photographed. The height field is domain warped fbm with a
 * ridged crease term; occlusion is derived from the height field itself by
 * comparing it against its own blur, which is what makes a fold read as a
 * fold and not as a stain.
 */

import { makeNoise, boxBlur, clamp01 } from './noise.js';
import { yieldToBrowser } from '../util/dom.js';

export const FIELD_SIZE = 512;
export const SHAPE_SIZE = 1024;

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* ---------------------------------------------------------------------- */
/* Field: the cloth itself                                                 */
/* ---------------------------------------------------------------------- */

export function buildField(form, seed, size = FIELD_SIZE, octaves = 4) {
  const n = makeNoise(seed);
  const f = form.fold;
  const N = size * size;
  const fold = new Float32Array(N);

  const warpFreq = f.freq * 0.55;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const wx = n.fbm(u * warpFreq, v * warpFreq, 2) - 0.5;
      const wy = n.fbm(u * warpFreq + 37.21, v * warpFreq + 11.93, 2) - 0.5;
      const su = (u + wx * f.warp) * f.freq * f.anisoX;
      const sv = (v + wy * f.warp) * f.freq * f.anisoY;

      // The crease term used to run three octaves at 1.7x the fold frequency,
      // which put its top octave around twenty cycles across the field: that
      // is tissue-paper crumple, not a hanging tee, and no print survives
      // being displaced by it. Two octaves at the fold's own frequency give
      // creases the size of the folds they belong to.
      let h = n.fbm(su, sv, octaves);
      if (f.crease > 0) h = h * (1 - f.crease) + n.ridge(su * 1.05, sv * 1.05, 2) * f.crease;
      fold[y * size + x] = 0.5 + (h - 0.5) * f.amp;
    }
  }

  // Occlusion comes from the cloth, never from the macro shape: a fold that
  // dips below its neighbourhood is in shadow.
  const blurred = boxBlur(fold, size, size, Math.max(2, Math.round(size / 42)));

  const data = new Uint8ClampedArray(N * 4);
  const macro = form.macro || null;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;

      let h = fold[i];
      if (macro) h = applyMacro(h, u, v, form, macro);

      // Occlusion only ever takes light away. The earlier form of this line
      // centred on 0.58 and ran to 1.0, so every crease came out as a bright
      // white outline and the tee read as crumpled foil. A fold that sits
      // above its neighbourhood is simply unoccluded; only the dips darken.
      const dip = blurred[i] - fold[i];
      const ao = 1 - clamp01(Math.max(0, dip) * 13) * 0.45;

      // Heather is a mottle in the yarn, not a blotch. The field is 512 wide
      // and gets stretched across a 900px stage, so anything under ~60 cycles
      // arrives as visible blobs rather than as cloth.
      const heather = n.fbm(u * 118, v * 118, 2);
      const thread = n.value2(u * 190 + 5.5, v * 190 + 2.25);

      const o = i * 4;
      data[o] = clamp01(h) * 255;
      data[o + 1] = ao * 255;
      data[o + 2] = heather * 255;
      data[o + 3] = thread * 255;
    }
  }

  return new ImageData(data, size, size);
}

function applyMacro(h, u, v, form, macro) {
  if (macro.kind === 'cylinder') {
    const x = u * form.aspect;
    const t = (x - macro.cx) / macro.r;
    if (Math.abs(t) >= 1) return h * 0.5;
    const profile = Math.sqrt(1 - t * t);
    return h * (1 - macro.strength * 0.8) + profile * macro.strength * 0.8;
  }
  if (macro.kind === 'dome') {
    const x = u * form.aspect;
    const dx = (x - macro.cx) / macro.r;
    const dy = (v - macro.cy) / macro.r;
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const profile = Math.sqrt(1 - d * d);
    return h * (1 - macro.strength * 0.6) + profile * macro.strength * 0.6;
  }
  return h;
}

/* ---------------------------------------------------------------------- */
/* Shape: the object cut out of the stage                                  */
/* ---------------------------------------------------------------------- */

export function buildShape(form, size = SHAPE_SIZE) {
  const H = size;
  const W = Math.round(size * form.aspect);
  const unit = H;

  // 1. coverage
  const gc = canvasOf(W, H);
  const g = gc.getContext('2d');
  g.setTransform(unit, 0, 0, unit, 0, 0);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  form.garment(g);

  // 2. print area
  const pc = canvasOf(W, H);
  const p = pc.getContext('2d');
  p.setTransform(unit, 0, 0, unit, 0, 0);
  p.fillStyle = '#fff';
  p.fillRect(
    form.print.cx - form.print.w / 2,
    form.print.cy - form.print.h / 2,
    form.print.w,
    form.print.h
  );

  // 3. seams, clipped to the object
  const sc = canvasOf(W, H);
  const s = sc.getContext('2d');
  s.setTransform(unit, 0, 0, unit, 0, 0);
  form.seam(s);
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'destination-in';
  s.drawImage(gc, 0, 0);

  // 4. shading. Inside the object it is baked detail, outside it is the
  //    contact shadow the object casts on the stage.
  const dc = canvasOf(W, H);
  const d = dc.getContext('2d');
  d.fillStyle = 'rgb(128,128,128)';
  d.fillRect(0, 0, W, H);
  paintContactShadow(d, gc, W, H);

  const ic = canvasOf(W, H);
  const ic2 = ic.getContext('2d');
  ic2.setTransform(unit, 0, 0, unit, 0, 0);
  form.detail(ic2);
  ic2.setTransform(1, 0, 0, 1, 0, 0);
  ic2.globalCompositeOperation = 'destination-in';
  ic2.drawImage(gc, 0, 0);
  d.drawImage(ic, 0, 0);

  // 5. merge into one RGBA buffer
  const ga = g.getImageData(0, 0, W, H).data;
  const pa = p.getImageData(0, 0, W, H).data;
  const sa = s.getImageData(0, 0, W, H).data;
  const da = d.getImageData(0, 0, W, H).data;

  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = ga[i + 3];
    out[i + 1] = pa[i + 3];
    out[i + 2] = da[i];
    out[i + 3] = sa[i + 3];
  }
  return new ImageData(out, W, H);
}

/**
 * A soft, offset shadow under the object. Offset and blur, never a halo.
 * `ctx.filter` covers every current browser; the stacked fallback keeps the
 * shadow present rather than absent if it is missing.
 */
function paintContactShadow(ctx, maskCanvas, W, H) {
  const blur = Math.round(H * 0.035);
  const dx = Math.round(H * 0.012);
  const dy = Math.round(H * 0.022);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  if ('filter' in ctx) {
    ctx.filter = `blur(${blur}px)`;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(maskCanvas, dx, dy, W, H);
    ctx.filter = 'none';
  } else {
    ctx.globalAlpha = 0.1;
    for (let k = 0; k < 6; k++) {
      const o = (k - 2.5) * (blur / 3);
      ctx.drawImage(maskCanvas, dx + o, dy + o, W, H);
    }
  }
  ctx.restore();
}

/* ---------------------------------------------------------------------- */

/**
 * Budget guard. A template must never make anyone wait: if the first field
 * came in over budget on this machine, every later one drops an octave rather
 * than holding the interface. Fewer octaves is a slightly softer fold, which
 * is a far smaller loss than a frozen tab.
 */
const FIELD_BUDGET_MS = 400;
let octaveBudget = 4;

/** Both maps for one form. Yields so the progress line can actually move. */
export async function buildTemplateMaps(form, onProgress) {
  const seed = form.seed;
  if (onProgress) onProgress(0.05);
  await nextFrame();

  const shape = buildShape(form);
  if (onProgress) onProgress(0.4);
  await nextFrame();

  const started = performance.now();
  const field = buildField(form, seed, FIELD_SIZE, octaveBudget);
  const elapsed = performance.now() - started;
  if (elapsed > FIELD_BUDGET_MS && octaveBudget > 2) octaveBudget--;

  if (onProgress) onProgress(1);
  return { shape, field, seed, octaves: octaveBudget, buildMs: Math.round(elapsed) };
}

export function nextFrame() {
  return yieldToBrowser();
}
