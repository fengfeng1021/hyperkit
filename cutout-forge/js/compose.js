/* ==========================================================================
   Compositing. One code path is shared by the model and the chroma-key
   modes: both produce a mask at thumbnail resolution, and both are applied
   here, bilinearly resampled to whatever size the output needs.

   Nothing here holds a full-resolution buffer longer than one photo.
   ========================================================================== */

import { makeCanvas, clamp } from './util.js';

/** Bilinear sample of an 8-bit single channel map. */
function sampleAlpha(map, mw, mh, u, v) {
  const x = clamp(u * mw - 0.5, 0, mw - 1);
  const y = clamp(v * mh - 0.5, 0, mh - 1);
  const x0 = x | 0, y0 = y | 0;
  const x1 = x0 + 1 < mw ? x0 + 1 : x0;
  const y1 = y0 + 1 < mh ? y0 + 1 : y0;
  const fx = x - x0, fy = y - y0;
  const a = map[y0 * mw + x0], b = map[y0 * mw + x1];
  const c = map[y1 * mw + x0], d = map[y1 * mw + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/**
 * Paints `source` at w x h, applies the alpha map, and removes the colour the
 * background spilled onto the edge pixels.
 *
 * Despill: for pixels that are partly transparent the background colour is
 * mixed into them by the camera. We pull the pixel back along the vector
 * towards the background's own luminance, weighted by how transparent it is,
 * so a white sweep stops tinting a dark product's rim.
 */
export function cutout(source, w, h, mask, mw, mh, opts = {}) {
  const despill = clamp(opts.despill ?? 0.4, 0, 1);
  const bg = opts.bg || null;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  let bgLuma = 0;
  if (bg) bgLuma = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];

  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = sampleAlpha(mask, mw, mh, (x + 0.5) / w, v);
      px[i + 3] = a;
      if (a > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (bg && despill > 0 && a > 12 && a < 243) {
        const k = despill * (1 - a / 255);
        px[i] = px[i] - k * (bg[0] - bgLuma);
        px[i + 1] = px[i + 1] - k * (bg[1] - bgLuma);
        px[i + 2] = px[i + 2] - k * (bg[2] - bgLuma);
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  const bbox = maxX < 0
    ? { x: 0, y: 0, w, h, empty: true }
    : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, empty: false };

  return { canvas, ctx, bbox };
}

/**
 * Reframes a cutout into a platform's square canvas.
 * fill is the fraction of the frame the product's longest side must occupy,
 * which is the rule Amazon and Shopify actually publish.
 */
export function reframe(cutCanvas, bbox, spec) {
  const size = spec.size;
  const { canvas, ctx } = makeCanvas(size, size);

  if (spec.matte === 'white') {
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.clearRect(0, 0, size, size);
  }

  if (spec.reframe === false) {
    ctx.drawImage(cutCanvas, 0, 0, size, size);
    return canvas;
  }

  const bw = Math.max(1, bbox.w), bh = Math.max(1, bbox.h);
  const target = size * spec.fill;
  const scale = target / Math.max(bw, bh);
  const dw = bw * scale, dh = bh * scale;
  const dx = (size - dw) / 2, dy = (size - dh) / 2;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cutCanvas, bbox.x, bbox.y, bw, bh, dx, dy, dw, dh);
  return canvas;
}

/** Native size output: keep the original pixels, just carry the alpha. */
export function nativeFrame(cutCanvas, spec) {
  if (spec.matte !== 'white') return cutCanvas;
  const { canvas, ctx } = makeCanvas(cutCanvas.width, cutCanvas.height);
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cutCanvas, 0, 0);
  return canvas;
}

/** Paints the thumbnail-sized preview a tile shows once a photo resolves. */
export function paintPreview(canvasEl, source, sw, sh, mask, mw, mh, opts) {
  const { canvas } = cutout(source, sw, sh, mask, mw, mh, opts);
  canvasEl.width = sw;
  canvasEl.height = sh;
  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, sw, sh);
  ctx.drawImage(canvas, 0, 0);
}
