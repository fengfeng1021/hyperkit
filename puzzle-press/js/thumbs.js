/* Canvas renderer.
   Consumes exactly the same primitive list that the PDF writer consumes. If a
   thumbnail is wrong, the PDF is wrong in the same way, which is the only
   honest relationship between a preview and a file. */

import { paintPage } from './paint.js';
import { rectFor } from './layout.js';
import { trimRect } from './kdp.js';

let interiorFamily = 'ui-sans-serif, system-ui, sans-serif';

export function setInteriorFamily(family) {
  interiorFamily = family;
}

/* Colours come from tokens.css, never from literals in here. The page face and
   the four annotation layers are the only coloured things a canvas draws; the
   puzzle itself is printed ink, expressed as a 0 to 1 grey in paint.js. */
const tokenCache = new Map();
function token(name) {
  if (!tokenCache.has(name)) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    tokenCache.set(name, v);
  }
  return tokenCache.get(name);
}

export function renderPage(canvas, page, plan, puzzles, meta, opts = {}) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const cssW = opts.width || canvas.clientWidth || 132;
  const scale = cssW / plan.geo.pageWpt;
  const cssH = plan.geo.pageHpt * scale;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = token('--stock');
  ctx.fillRect(0, 0, cssW, cssH);

  const H = plan.geo.pageHpt;
  const X = (x) => x * scale;
  const Y = (y) => (H - y) * scale;

  const { ops } = paintPage(page, plan, puzzles, meta);
  ops.forEach((op) => {
    const grey = Math.round(op.grey * 255);
    const colour = `rgb(${grey},${grey},${grey})`;
    if (op.t === 'line') {
      ctx.save();
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(0.35, op.lw * scale);
      if (op.dash) ctx.setLineDash(op.dash.map((d) => d * scale));
      ctx.beginPath();
      ctx.moveTo(X(op.x1), Y(op.y1));
      ctx.lineTo(X(op.x2), Y(op.y2));
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (op.t === 'rect') {
      ctx.save();
      if (op.fill !== undefined) {
        const g = Math.round(op.fill * 255);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(X(op.x), Y(op.y + op.h), op.w * scale, op.h * scale);
      }
      if (op.stroke !== undefined) {
        const g = Math.round(op.stroke * 255);
        ctx.strokeStyle = `rgb(${g},${g},${g})`;
        ctx.lineWidth = Math.max(0.35, op.lw * scale);
        if (op.dash) ctx.setLineDash(op.dash.map((d) => d * scale));
        ctx.strokeRect(X(op.x), Y(op.y + op.h), op.w * scale, op.h * scale);
      }
      ctx.restore();
      return;
    }
    if (op.t === 'text') {
      const px = op.size * scale;
      if (px < 1.4) return; /* below this a glyph is a smudge, so leave it out */
      ctx.save();
      ctx.fillStyle = colour;
      ctx.font = `${op.font === 'bold' ? '700 ' : '400 '}${px}px ${interiorFamily}`;
      ctx.textAlign = op.align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(op.s, X(op.x), Y(op.y));
      ctx.restore();
    }
  });

  if (opts.annotate) drawAnnotations(ctx, page, plan, scale, H, opts.layers);
  return { cssW, cssH, scale };
}

/* The four inspector layers, drawn from the same geometry the PDF uses. */
function drawAnnotations(ctx, page, plan, scale, H, layerOpts) {
  const X = (x) => x * scale;
  const Y = (y) => (H - y) * scale;
  const t = trimRect(page.n, plan.trim, plan.bleed);
  const r = rectFor(page, plan);
  const layers = layerOpts || { trim: true, bleed: true, gutter: true, safe: true };
  const magenta = token('--magenta');
  const wash = token('--magenta-wash');
  const rule = token('--rule-strong');

  if (layers.gutter) {
    const gw = r.gutterPt * scale;
    ctx.save();
    ctx.globalAlpha = 0.55; /* the band annotates the page, it does not cover it */
    ctx.fillStyle = wash;
    if (r.gutterSide === 'left') ctx.fillRect(0, 0, gw, H * scale);
    else ctx.fillRect(plan.geo.pageWpt * scale - gw, 0, gw, H * scale);
    ctx.restore();
  }
  if (layers.bleed && plan.bleed) {
    ctx.save();
    ctx.strokeStyle = magenta;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(0.5, 0.5, plan.geo.pageWpt * scale - 1, plan.geo.pageHpt * scale - 1);
    ctx.restore();
  }
  if (layers.trim) {
    ctx.save();
    ctx.strokeStyle = magenta;
    ctx.lineWidth = 1;
    ctx.strokeRect(X(t.x), Y(t.y + t.h), t.w * scale, t.h * scale);
    ctx.restore();
  }
  if (layers.safe) {
    ctx.save();
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.strokeRect(X(r.x), Y(r.y + r.h), r.w * scale, r.h * scale);
    ctx.restore();
  }
}
