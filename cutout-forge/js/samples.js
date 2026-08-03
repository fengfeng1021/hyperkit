/* ==========================================================================
   Six sample product photos, drawn here in the browser with Canvas 2D and
   handed to the queue as real File objects. They go through exactly the same
   decode, cutout, measurement and export path as your own photos. If they
   took a shortcut they would prove nothing.

   Each one is chosen to exercise a different part of the pipeline:
     1 mug        the easy case, pure white sweep
     2 box        near-solid grey, hard edges
     3 bottle     translucency, where model and chroma-key diverge
     4 scarf      fuzz, which should trip the soft-edge flag
     5 watch      a gradient background, which chroma-key must call out
     6 earrings   thin strokes, two separate objects, real holes
   ========================================================================== */

import { makeCanvas, canvasToBlob, yieldToBrowser } from './util.js';

const SIZE = 1400;

function grain(ctx, w, h, amount = 2) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = ((Math.random() * 2 - 1) * amount) | 0;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function softShadow(ctx, cx, cy, rx, ry) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  g.addColorStop(0, 'rgba(28,28,30,0.30)');
  g.addColorStop(0.6, 'rgba(28,28,30,0.12)');
  g.addColorStop(1, 'rgba(28,28,30,0)');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ 1 mug */
function drawMug(ctx) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, SIZE, SIZE);
  softShadow(ctx, 740, 1010, 330, 90);

  const bodyX = 480, bodyY = 420, bodyW = 440, bodyH = 560, r = 26;

  // handle behind the body
  ctx.save();
  ctx.lineWidth = 64;
  ctx.strokeStyle = '#7E8A8B';
  ctx.beginPath();
  ctx.arc(940, 690, 150, -Math.PI * 0.48, Math.PI * 0.48);
  ctx.stroke();
  ctx.lineWidth = 40;
  ctx.strokeStyle = '#98A4A5';
  ctx.beginPath();
  ctx.arc(940, 690, 150, -Math.PI * 0.44, Math.PI * 0.40);
  ctx.stroke();
  ctx.restore();

  const g = ctx.createLinearGradient(bodyX, 0, bodyX + bodyW, 0);
  g.addColorStop(0, '#6E7A7B');
  g.addColorStop(0.22, '#A6B1B2');
  g.addColorStop(0.5, '#8E9A9B');
  g.addColorStop(0.86, '#727E7F');
  g.addColorStop(1, '#5F6A6B');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, bodyW, bodyH, [r, r, 54, 54]);
  ctx.fill();

  // rim ellipse
  ctx.fillStyle = '#B7C1C2';
  ctx.beginPath();
  ctx.ellipse(bodyX + bodyW / 2, bodyY + 6, bodyW / 2, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4F5859';
  ctx.beginPath();
  ctx.ellipse(bodyX + bodyW / 2, bodyY + 14, bodyW / 2 - 26, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // specular band, upper left
  const hi = ctx.createLinearGradient(bodyX + 60, bodyY, bodyX + 190, bodyY + 420);
  hi.addColorStop(0, 'rgba(255,255,255,0.55)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.roundRect(bodyX + 56, bodyY + 70, 86, 420, 42);
  ctx.fill();
}

/* ------------------------------------------------------------------ 2 box */
function drawBox(ctx) {
  ctx.fillStyle = '#EDEDED';
  ctx.fillRect(0, 0, SIZE, SIZE);
  softShadow(ctx, 700, 1030, 340, 80);

  const cx = 700, cy = 700, w = 300, d = 300, hgt = 250;
  const top = [[cx, cy - hgt - d * 0.5], [cx + w, cy - hgt], [cx, cy - hgt + d * 0.5], [cx - w, cy - hgt]];
  const left = [[cx - w, cy - hgt], [cx, cy - hgt + d * 0.5], [cx, cy + hgt], [cx - w, cy + hgt - d * 0.5]];
  const right = [[cx + w, cy - hgt], [cx, cy - hgt + d * 0.5], [cx, cy + hgt], [cx + w, cy + hgt - d * 0.5]];

  const face = (pts, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  };

  face(top, '#DCC9B2');
  face(left, '#A9967E');
  face(right, '#C8B49A');

  // lid seam on the right face
  ctx.strokeStyle = 'rgba(96,82,64,0.45)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hgt + d * 0.5 + 70);
  ctx.lineTo(cx + w, cy - hgt + 70);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - hgt + 70);
  ctx.lineTo(cx, cy - hgt + d * 0.5 + 70);
  ctx.stroke();
}

/* --------------------------------------------------------------- 3 bottle */
function drawBottle(ctx) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, SIZE, SIZE);
  softShadow(ctx, 700, 1120, 240, 60);

  const x = 540, y = 330, w = 320, h = 780;

  ctx.save();
  ctx.globalAlpha = 0.35;
  const body = ctx.createLinearGradient(x, 0, x + w, 0);
  body.addColorStop(0, '#7FA9A4');
  body.addColorStop(0.35, '#CFE3E0');
  body.addColorStop(0.62, '#9FC3BE');
  body.addColorStop(1, '#6E9793');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, [90, 90, 34, 34]);
  ctx.fill();
  ctx.restore();

  // neck
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = '#A8CBC7';
  ctx.beginPath();
  ctx.roundRect(x + 108, y - 130, 104, 160, 12);
  ctx.fill();
  ctx.restore();

  // refraction band
  ctx.save();
  ctx.globalAlpha = 0.75;
  const ref = ctx.createLinearGradient(x + 40, 0, x + 130, 0);
  ref.addColorStop(0, 'rgba(255,255,255,0)');
  ref.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  ref.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ref;
  ctx.fillRect(x + 40, y + 60, 92, h - 160);
  ctx.restore();

  // cap
  ctx.fillStyle = '#1E4E4A';
  ctx.beginPath();
  ctx.roundRect(x + 96, y - 216, 128, 96, 10);
  ctx.fill();
  ctx.fillStyle = '#2C6763';
  ctx.fillRect(x + 96, y - 216, 128, 22);
}

/* ---------------------------------------------------------------- 4 scarf */
function drawScarf(ctx) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, SIZE, SIZE);
  softShadow(ctx, 700, 1010, 380, 70);

  const x = 330, y = 470, w = 740, h = 420, r = 46;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#9C5E4E');
  g.addColorStop(0.45, '#7E4436');
  g.addColorStop(1, '#5E3227');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();

  // weave
  ctx.strokeStyle = 'rgba(255,224,206,0.10)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 16 + i * 16);
    ctx.lineTo(x + w - 10, y + 16 + i * 16);
    ctx.stroke();
  }

  // 400 fibres pushing past the silhouette: this is what should flag
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 400; i++) {
    const edge = i % 4;
    let px, py, dx, dy;
    if (edge === 0) { px = x + Math.random() * w; py = y; dx = (Math.random() - 0.5) * 26; dy = -8 - Math.random() * 26; }
    else if (edge === 1) { px = x + Math.random() * w; py = y + h; dx = (Math.random() - 0.5) * 26; dy = 8 + Math.random() * 26; }
    else if (edge === 2) { px = x; py = y + Math.random() * h; dx = -8 - Math.random() * 26; dy = (Math.random() - 0.5) * 26; }
    else { px = x + w; py = y + Math.random() * h; dx = 8 + Math.random() * 26; dy = (Math.random() - 0.5) * 26; }
    const shade = 90 + Math.floor(Math.random() * 60);
    ctx.strokeStyle = `rgba(${shade + 40},${shade - 20},${shade - 40},0.85)`;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + dx * 0.5, py + dy * 0.5, px + dx, py + dy);
    ctx.stroke();
  }
}

/* ---------------------------------------------------------------- 5 watch */
function drawWatch(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, '#F2F2F2');
  bg.addColorStop(1, '#D6D6D6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // straps
  ctx.fillStyle = '#2B2F32';
  ctx.beginPath();
  ctx.roundRect(610, 210, 180, 320, 24);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(610, 880, 180, 320, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(614, 250 + i * 34); ctx.lineTo(786, 250 + i * 34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(614, 920 + i * 34); ctx.lineTo(786, 920 + i * 34); ctx.stroke();
  }

  // case
  const cg = ctx.createLinearGradient(500, 500, 900, 900);
  cg.addColorStop(0, '#4A5155');
  cg.addColorStop(0.5, '#33383B');
  cg.addColorStop(1, '#22262A');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(700, 700, 226, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#15181A';
  ctx.beginPath();
  ctx.arc(700, 700, 176, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#8C9498';
  ctx.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(700 + Math.cos(a) * 148, 700 + Math.sin(a) * 148);
    ctx.lineTo(700 + Math.cos(a) * 166, 700 + Math.sin(a) * 166);
    ctx.stroke();
  }
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#E4E8E8';
  ctx.beginPath(); ctx.moveTo(700, 700); ctx.lineTo(700, 590); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(700, 700); ctx.lineTo(786, 738); ctx.stroke();

  // crown
  ctx.fillStyle = '#5A6266';
  ctx.beginPath();
  ctx.roundRect(922, 676, 34, 48, 6);
  ctx.fill();
}

/* ------------------------------------------------------------- 6 earrings */
function drawEarrings(ctx) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, SIZE, SIZE);
  softShadow(ctx, 480, 1000, 150, 40);
  softShadow(ctx, 930, 1000, 150, 40);

  const ring = (cx, cy, r) => {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#C9A24A');
    g.addColorStop(0.4, '#F0DCA0');
    g.addColorStop(0.7, '#B98F35');
    g.addColorStop(1, '#8F6C22');
    ctx.strokeStyle = g;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#A98523';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy - r - 42, 34, Math.PI * 0.15, Math.PI * 0.95);
    ctx.stroke();

    ctx.fillStyle = '#DFC272';
    ctx.beginPath();
    ctx.arc(cx, cy - r + 4, 13, 0, Math.PI * 2);
    ctx.fill();
  };

  ring(480, 700, 190);
  ring(930, 700, 190);
}

const RECIPES = [
  { name: 'sample_ceramic_mug.jpg', draw: drawMug },
  { name: 'sample_sneaker_box.jpg', draw: drawBox },
  { name: 'sample_glass_bottle.jpg', draw: drawBottle },
  { name: 'sample_wool_scarf.jpg', draw: drawScarf },
  { name: 'sample_watch_grad.jpg', draw: drawWatch },
  { name: 'sample_earrings_pair.jpg', draw: drawEarrings },
];

/**
 * Draws all six and returns them as File objects.
 * @param {(done:number,total:number)=>void} [onProgress]
 */
export async function buildSamples(onProgress) {
  const files = [];
  for (let i = 0; i < RECIPES.length; i++) {
    const { name, draw } = RECIPES[i];
    const { canvas, ctx } = makeCanvas(SIZE, SIZE);
    ctx.imageSmoothingQuality = 'high';
    draw(ctx);
    grain(ctx, SIZE, SIZE, 2);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    files.push(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
    onProgress && onProgress(i + 1, RECIPES.length);
    await yieldToBrowser();
  }
  return files;
}

export const SAMPLE_COUNT = RECIPES.length;
