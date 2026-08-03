/**
 * js/templates/forms.js
 * The six product forms, drawn rather than photographed.
 *
 * Every path in this file is authored in HEIGHT UNITS: y runs 0..1 and x runs
 * 0..aspect, so a stroke is the same thickness in both directions and nothing
 * is squashed when a form is not square. weave.js converts to uv.
 *
 * Each form contributes four grayscale layers that become one RGBA texture:
 *   garment  -> R  coverage of the object
 *   print    -> G  where a design is allowed to land
 *   detail   -> B  baked shading inside the object, contact shadow outside it
 *   seam     -> A  stitch lines, which eat the edge of the ink
 *
 * Fold behaviour (how much cloth, how it creases) is a small recipe read by
 * weave.js. Rigid forms simply ask for no folds and a macro surface instead.
 */

const TAU = Math.PI * 2;

/* Shared painters ------------------------------------------------------- */

function stitch(ctx, path, width, dash) {
  ctx.save();
  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  if (dash) ctx.setLineDash(dash);
  ctx.strokeStyle = '#fff';
  ctx.stroke(path);
  ctx.restore();
}

function band(ctx, x, y, w, h, level) {
  ctx.fillStyle = `rgb(${level},${level},${level})`;
  ctx.fillRect(x, y, w, h);
}

/** Vertical falloff used to keep the lower half of hanging cloth heavier. */
function verticalShade(ctx, x, y, w, h, topLevel, bottomLevel) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgb(${topLevel},${topLevel},${topLevel})`);
  g.addColorStop(1, `rgb(${bottomLevel},${bottomLevel},${bottomLevel})`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/* Tee -------------------------------------------------------------------- */

const tee = {
  id: 'tee',
  label: 'T 恤',
  seed: 4417,
  aspect: 1,
  family: 'fabric',
  defaultColorway: 'studio-grey',
  print: { cx: 0.5, cy: 0.44, w: 0.36, h: 0.4 },
  fold: { amp: 1, freq: 3.0, warp: 0.55, anisoX: 1.35, anisoY: 0.72, crease: 0.42 },
  weaveFreq: 260,
  relief: 1,
  dispAmount: 1,
  parallax: 0.55,
  garment(ctx) {
    const p = new Path2D();
    p.moveTo(0.305, 0.205);
    p.lineTo(0.185, 0.25);
    p.lineTo(0.12, 0.455);
    p.lineTo(0.238, 0.5);
    p.lineTo(0.228, 0.868);
    p.quadraticCurveTo(0.5, 0.905, 0.772, 0.868);
    p.lineTo(0.762, 0.5);
    p.lineTo(0.88, 0.455);
    p.lineTo(0.815, 0.25);
    p.lineTo(0.695, 0.205);
    p.bezierCurveTo(0.66, 0.288, 0.34, 0.288, 0.305, 0.205);
    p.closePath();
    ctx.fill(p);
  },
  detail(ctx) {
    verticalShade(ctx, 0.1, 0.19, 0.8, 0.73, 140, 112);
    // collar rib
    const collar = new Path2D();
    collar.moveTo(0.305, 0.205);
    collar.bezierCurveTo(0.34, 0.288, 0.66, 0.288, 0.695, 0.205);
    collar.bezierCurveTo(0.66, 0.246, 0.34, 0.246, 0.305, 0.205);
    ctx.fillStyle = 'rgb(96,96,96)';
    ctx.fill(collar);
    // sleeve and body hems sit slightly proud of the cloth
    band(ctx, 0.12, 0.44, 0.12, 0.016, 104);
    band(ctx, 0.76, 0.44, 0.12, 0.016, 104);
    band(ctx, 0.23, 0.855, 0.54, 0.02, 106);
    // armhole shadow
    ctx.fillStyle = 'rgb(98,98,98)';
    ctx.fillRect(0.228, 0.25, 0.022, 0.25);
    ctx.fillRect(0.75, 0.25, 0.022, 0.25);
  },
  seam(ctx) {
    const s = new Path2D();
    s.moveTo(0.238, 0.5); s.lineTo(0.228, 0.862);
    s.moveTo(0.762, 0.5); s.lineTo(0.772, 0.862);
    s.moveTo(0.126, 0.446); s.lineTo(0.234, 0.49);
    s.moveTo(0.874, 0.446); s.lineTo(0.766, 0.49);
    stitch(ctx, s, 0.006, [0.012, 0.008]);
    const hem = new Path2D();
    hem.moveTo(0.232, 0.856); hem.quadraticCurveTo(0.5, 0.892, 0.768, 0.856);
    stitch(ctx, hem, 0.005, [0.01, 0.008]);
  }
};

/* Hoodie ----------------------------------------------------------------- */

const hoodie = {
  id: 'hoodie',
  label: '帽 T',
  seed: 7331,
  aspect: 1,
  family: 'fabric',
  defaultColorway: 'black',
  print: { cx: 0.5, cy: 0.47, w: 0.32, h: 0.28 },
  fold: { amp: 1.25, freq: 2.4, warp: 0.7, anisoX: 1.2, anisoY: 0.8, crease: 0.5 },
  weaveFreq: 180,
  relief: 1.15,
  dispAmount: 1.15,
  parallax: 0.62,
  garment(ctx) {
    const hood = new Path2D();
    hood.moveTo(0.3, 0.32);
    hood.bezierCurveTo(0.3, 0.085, 0.7, 0.085, 0.7, 0.32);
    hood.closePath();
    ctx.fill(hood);
    const p = new Path2D();
    p.moveTo(0.3, 0.27);
    p.lineTo(0.165, 0.335);
    p.lineTo(0.098, 0.63);
    p.lineTo(0.228, 0.668);
    p.lineTo(0.218, 0.845);
    p.lineTo(0.782, 0.845);
    p.lineTo(0.772, 0.668);
    p.lineTo(0.902, 0.63);
    p.lineTo(0.835, 0.335);
    p.lineTo(0.7, 0.27);
    p.closePath();
    ctx.fill(p);
    ctx.fillRect(0.218, 0.845, 0.564, 0.04);
  },
  detail(ctx) {
    verticalShade(ctx, 0.08, 0.08, 0.85, 0.82, 142, 108);
    // hood opening
    const hole = new Path2D();
    hole.moveTo(0.335, 0.315);
    hole.bezierCurveTo(0.345, 0.15, 0.655, 0.15, 0.665, 0.315);
    hole.closePath();
    ctx.fillStyle = 'rgb(58,58,58)';
    ctx.fill(hole);
    // kangaroo pocket
    ctx.fillStyle = 'rgb(112,112,112)';
    const pocket = new Path2D();
    pocket.moveTo(0.318, 0.66);
    pocket.lineTo(0.682, 0.66);
    pocket.lineTo(0.66, 0.8);
    pocket.lineTo(0.34, 0.8);
    pocket.closePath();
    ctx.fill(pocket);
    // ribbed waistband and cuffs
    band(ctx, 0.218, 0.845, 0.564, 0.04, 100);
    band(ctx, 0.098, 0.6, 0.13, 0.035, 100);
    band(ctx, 0.772, 0.6, 0.13, 0.035, 100);
    // drawstrings
    ctx.strokeStyle = 'rgb(178,178,178)';
    ctx.lineWidth = 0.008;
    const cord = new Path2D();
    cord.moveTo(0.44, 0.315); cord.lineTo(0.432, 0.44);
    cord.moveTo(0.56, 0.315); cord.lineTo(0.568, 0.44);
    ctx.stroke(cord);
  },
  seam(ctx) {
    const s = new Path2D();
    s.moveTo(0.228, 0.668); s.lineTo(0.218, 0.845);
    s.moveTo(0.772, 0.668); s.lineTo(0.782, 0.845);
    s.moveTo(0.318, 0.66); s.lineTo(0.682, 0.66);
    s.moveTo(0.318, 0.66); s.lineTo(0.34, 0.8);
    s.moveTo(0.682, 0.66); s.lineTo(0.66, 0.8);
    stitch(ctx, s, 0.006, [0.012, 0.008]);
  }
};

/* Tote ------------------------------------------------------------------- */

const tote = {
  id: 'tote',
  label: '帆布袋',
  seed: 2860,
  aspect: 0.8333,
  family: 'fabric',
  defaultColorway: 'natural',
  print: { cx: 0.4167, cy: 0.58, w: 0.4, h: 0.4 },
  fold: { amp: 0.7, freq: 3.6, warp: 0.35, anisoX: 0.75, anisoY: 1.4, crease: 0.3 },
  weaveFreq: 150,
  relief: 0.85,
  dispAmount: 0.8,
  parallax: 0.4,
  garment(ctx) {
    ctx.save();
    ctx.lineWidth = 0.03;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#fff';
    const h = new Path2D();
    h.moveTo(0.215, 0.315);
    h.bezierCurveTo(0.2, 0.13, 0.335, 0.13, 0.325, 0.315);
    h.moveTo(0.508, 0.315);
    h.bezierCurveTo(0.498, 0.13, 0.633, 0.13, 0.618, 0.315);
    ctx.stroke(h);
    ctx.restore();
    const p = new Path2D();
    p.moveTo(0.098, 0.3);
    p.lineTo(0.735, 0.3);
    p.lineTo(0.748, 0.885);
    p.lineTo(0.085, 0.885);
    p.closePath();
    ctx.fill(p);
  },
  detail(ctx) {
    verticalShade(ctx, 0.06, 0.28, 0.72, 0.63, 138, 116);
    band(ctx, 0.085, 0.3, 0.65, 0.026, 104);
    band(ctx, 0.085, 0.862, 0.663, 0.023, 102);
    ctx.fillStyle = 'rgb(110,110,110)';
    ctx.fillRect(0.2, 0.3, 0.016, 0.05);
    ctx.fillRect(0.322, 0.3, 0.016, 0.05);
    ctx.fillRect(0.494, 0.3, 0.016, 0.05);
    ctx.fillRect(0.615, 0.3, 0.016, 0.05);
  },
  seam(ctx) {
    const s = new Path2D();
    s.moveTo(0.098, 0.316); s.lineTo(0.735, 0.316);
    s.moveTo(0.09, 0.868); s.lineTo(0.744, 0.868);
    s.moveTo(0.104, 0.3); s.lineTo(0.09, 0.882);
    s.moveTo(0.729, 0.3); s.lineTo(0.743, 0.882);
    stitch(ctx, s, 0.006, [0.011, 0.008]);
  }
};

/* Mug -------------------------------------------------------------------- */

const mug = {
  id: 'mug',
  label: '馬克杯',
  seed: 1094,
  aspect: 1.25,
  family: 'rigid',
  defaultColorway: 'gloss-white',
  print: { cx: 0.53, cy: 0.52, w: 0.3, h: 0.28 },
  fold: { amp: 0.06, freq: 8, warp: 0.1, anisoX: 1, anisoY: 1, crease: 0 },
  macro: { kind: 'cylinder', cx: 0.53, r: 0.255, strength: 1 },
  weaveFreq: 0,
  relief: 1.6,
  dispAmount: 1.35,
  parallax: 1.1,
  garment(ctx) {
    ctx.save();
    ctx.lineWidth = 0.055;
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'butt';
    const handle = new Path2D();
    handle.moveTo(0.77, 0.36);
    handle.bezierCurveTo(1.02, 0.35, 1.02, 0.67, 0.77, 0.64);
    ctx.stroke(handle);
    ctx.restore();
    const body = new Path2D();
    body.moveTo(0.275, 0.24);
    body.bezierCurveTo(0.27, 0.5, 0.285, 0.68, 0.305, 0.775);
    body.bezierCurveTo(0.42, 0.815, 0.64, 0.815, 0.755, 0.775);
    body.bezierCurveTo(0.775, 0.68, 0.79, 0.5, 0.785, 0.24);
    body.closePath();
    ctx.fill(body);
    ctx.beginPath();
    ctx.ellipse(0.53, 0.24, 0.255, 0.052, 0, 0, TAU);
    ctx.fill();
  },
  detail(ctx) {
    band(ctx, 0.24, 0.16, 0.6, 0.7, 128);
    // cylinder shading, painted across the barrel
    const g = ctx.createLinearGradient(0.275, 0, 0.785, 0);
    g.addColorStop(0, 'rgb(76,76,76)');
    g.addColorStop(0.22, 'rgb(150,150,150)');
    g.addColorStop(0.45, 'rgb(190,190,190)');
    g.addColorStop(0.78, 'rgb(120,120,120)');
    g.addColorStop(1, 'rgb(70,70,70)');
    ctx.fillStyle = g;
    ctx.fillRect(0.275, 0.2, 0.51, 0.62);
    // rim and inside
    ctx.fillStyle = 'rgb(74,74,74)';
    ctx.beginPath();
    ctx.ellipse(0.53, 0.24, 0.235, 0.04, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgb(196,196,196)';
    ctx.beginPath();
    ctx.ellipse(0.53, 0.238, 0.255, 0.052, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgb(64,64,64)';
    ctx.beginPath();
    ctx.ellipse(0.53, 0.246, 0.226, 0.038, 0, 0, TAU);
    ctx.fill();
    // base contact
    band(ctx, 0.3, 0.788, 0.46, 0.018, 92);
  },
  seam(ctx) {
    const s = new Path2D();
    s.moveTo(0.3, 0.79); s.lineTo(0.76, 0.79);
    stitch(ctx, s, 0.004, null);
  }
};

/* Poster ----------------------------------------------------------------- */

const poster = {
  id: 'poster',
  label: '海報',
  seed: 6205,
  aspect: 0.8,
  family: 'rigid',
  defaultColorway: 'bright-white',
  print: { cx: 0.4, cy: 0.5, w: 0.55, h: 0.77 },
  fold: { amp: 0.12, freq: 2.2, warp: 0.2, anisoX: 1, anisoY: 1, crease: 0 },
  weaveFreq: 620,
  relief: 0.5,
  dispAmount: 0.35,
  parallax: 0.2,
  garment(ctx) {
    ctx.fillRect(0.06, 0.05, 0.68, 0.9);
  },
  detail(ctx) {
    // frame face
    band(ctx, 0.06, 0.05, 0.68, 0.9, 84);
    band(ctx, 0.068, 0.06, 0.664, 0.88, 96);
    // bevel toward the paper
    band(ctx, 0.1, 0.09, 0.6, 0.82, 66);
    // the paper itself
    band(ctx, 0.108, 0.098, 0.584, 0.804, 140);
    const g = ctx.createLinearGradient(0.108, 0.098, 0.692, 0.902);
    g.addColorStop(0, 'rgb(152,152,152)');
    g.addColorStop(0.65, 'rgb(132,132,132)');
    g.addColorStop(1, 'rgb(120,120,120)');
    ctx.fillStyle = g;
    ctx.fillRect(0.108, 0.098, 0.584, 0.804);
  },
  seam(ctx) {
    const s = new Path2D();
    s.rect(0.104, 0.094, 0.592, 0.812);
    stitch(ctx, s, 0.004, null);
  }
};

/* Sticker ---------------------------------------------------------------- */

const sticker = {
  id: 'sticker',
  label: '貼紙',
  seed: 3548,
  aspect: 1,
  family: 'rigid',
  defaultColorway: 'white',
  print: { cx: 0.5, cy: 0.5, w: 0.56, h: 0.56 },
  fold: { amp: 0.1, freq: 4, warp: 0.15, anisoX: 1, anisoY: 1, crease: 0 },
  macro: { kind: 'dome', cx: 0.5, cy: 0.5, r: 0.42, strength: 0.7 },
  weaveFreq: 0,
  relief: 1.2,
  dispAmount: 0.5,
  parallax: 0.45,
  garment(ctx) {
    ctx.fillRect(0.16, 0.16, 0.68, 0.68);
  },
  detail(ctx) {
    band(ctx, 0.16, 0.16, 0.68, 0.68, 150);
    // vinyl kiss-cut border stays brighter than the printed field
    band(ctx, 0.2, 0.2, 0.6, 0.6, 128);
    const g = ctx.createLinearGradient(0.16, 0.16, 0.84, 0.84);
    g.addColorStop(0, 'rgb(166,166,166)');
    g.addColorStop(0.55, 'rgb(134,134,134)');
    g.addColorStop(1, 'rgb(112,112,112)');
    ctx.fillStyle = g;
    ctx.fillRect(0.2, 0.2, 0.6, 0.6);
    // lifted corner
    ctx.fillStyle = 'rgb(94,94,94)';
    const curl = new Path2D();
    curl.moveTo(0.84, 0.74);
    curl.lineTo(0.84, 0.84);
    curl.lineTo(0.74, 0.84);
    curl.closePath();
    ctx.fill(curl);
  },
  seam(ctx) {
    const s = new Path2D();
    s.rect(0.2, 0.2, 0.6, 0.6);
    stitch(ctx, s, 0.005, [0.01, 0.007]);
  }
};

export const FORMS = [tee, hoodie, tote, mug, poster, sticker];

export function getForm(id) {
  return FORMS.find((f) => f.id === id) || FORMS[0];
}

/** Print rectangle in uv space (0..1 on both axes). */
export function printUV(form) {
  const a = form.aspect;
  return {
    x: (form.print.cx - form.print.w / 2) / a,
    y: form.print.cy - form.print.h / 2,
    w: form.print.w / a,
    h: form.print.h,
    cx: form.print.cx / a,
    cy: form.print.cy
  };
}

/** Pixel dimensions for a given long-edge-of-width output setting. */
export function outputSize(form, width) {
  const w = Math.round(width);
  const h = Math.round(width / form.aspect);
  return { w, h };
}
