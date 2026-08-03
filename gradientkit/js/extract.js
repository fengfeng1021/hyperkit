/* ==========================================================================
   GradientKit - extract.js
   Pull four stops out of a dropped image.

   Downscale to 128px on the long edge, convert to OKLab, median-cut to four
   buckets, take each bucket's OKLab mean, sort by L, place at 0 / 33.3 / 66.6
   / 100. Real computation, no library.
   ========================================================================== */

import { srgbToOklab, oklabToOklch, gamutMapOklch, toHex } from './color.js';

export const MAX_BYTES = 26214400; // 25 MB, refused before decode
const LONG_EDGE = 128;

export function validateFile(file) {
  if (!file) return { ok: false, message: '沒收到檔案。把圖片拖到載物台上再放開。' };
  if (!file.type || !file.type.startsWith('image/')) {
    return { ok: false, message: '這不是圖片檔。可以用 PNG、JPEG、WebP、GIF 或 AVIF。' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: '這張圖超過 25 MB。先輸出一張小一點的再丟一次。' };
  }
  return { ok: true };
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file);
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

/** Median cut in OKLab. Splitting on the widest axis in a perceptual space is
 *  what keeps a sunset from collapsing into four browns. */
function medianCut(points, depth) {
  if (depth === 0 || points.length <= 1) return [points];
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < lo[i]) lo[i] = p[i];
      if (p[i] > hi[i]) hi[i] = p[i];
    }
  }
  // OKLab a/b have a much smaller natural range than L, so the axis ranges are
  // weighted before comparison or every split would land on L.
  const weights = [1, 2.6, 2.6];
  let axis = 0;
  let best = -1;
  for (let i = 0; i < 3; i++) {
    const span = (hi[i] - lo[i]) * weights[i];
    if (span > best) { best = span; axis = i; }
  }
  const sorted = points.slice().sort((a, b) => a[axis] - b[axis]);
  const half = Math.floor(sorted.length / 2);
  return [
    ...medianCut(sorted.slice(0, half), depth - 1),
    ...medianCut(sorted.slice(half), depth - 1),
  ];
}

/**
 * @returns {Promise<{stops: {hex,pos}[], width:number, height:number}>}
 * @throws {Error} with a user-facing message when decode fails.
 */
export async function extractStops(file, onProgress = () => {}) {
  let bitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new Error('瀏覽器解不開這張圖。用 PNG 另存一份再試試看。');
  }
  onProgress(0.4);

  const w = bitmap.width;
  const h = bitmap.height;
  const scale = LONG_EDGE / Math.max(w, h, 1);
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, sw, sh);
  if (typeof bitmap.close === 'function') bitmap.close();
  onProgress(0.7);

  const data = ctx.getImageData(0, 0, sw, sh).data;
  const points = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue; // ignore transparent pixels
    const lab = srgbToOklab(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    points.push([lab.L, lab.a, lab.b]);
  }
  if (points.length < 4) {
    throw new Error('這張圖不透明的像素太少，抓不出四個顏色。');
  }
  onProgress(0.85);

  const buckets = medianCut(points, 2).filter((b) => b.length > 0).slice(0, 4);
  const means = buckets.map((bucket) => {
    let L = 0;
    let a = 0;
    let b = 0;
    for (const p of bucket) { L += p[0]; a += p[1]; b += p[2]; }
    const n = bucket.length;
    return { L: L / n, a: a / n, b: b / n };
  });

  means.sort((x, y) => x.L - y.L);
  const positions = [0, 33.33, 66.66, 100];
  const stops = means.map((m, i) => {
    const lch = oklabToOklch(m.L, m.a, m.b);
    const rgb = gamutMapOklch(lch.L, lch.C, lch.H);
    return { hex: toHex(rgb.r, rgb.g, rgb.b), pos: positions[i] ?? 100 };
  });
  onProgress(1);

  return { stops, width: w, height: h };
}
