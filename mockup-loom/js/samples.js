/**
 * js/samples.js
 * The sample set. Four designs, drawn here rather than shipped as binary
 * assets, so that opening the folder anywhere gives you a working tool with
 * nothing to download and nothing to 404.
 *
 * They are deliberately the four hardest cases for a flat composite:
 * straight rules, a dense interlace, a hard-edged mark and a full-bleed
 * stripe field. Every one of them shows a fold immediately.
 */

const INK = '#16161a';
const CHALK = '#f2efe7';
const BRICKISH = '#a83f2a';

function mkCanvas(size = 1400) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

/* 1. Loom Monogram ------------------------------------------------------- */

function loomMonogram() {
  const c = mkCanvas();
  const x = c.getContext('2d');
  const S = c.width;
  const u = S / 100;

  x.strokeStyle = INK;
  x.lineCap = 'butt';
  x.lineJoin = 'miter';

  // outer rule
  x.lineWidth = 2 * u;
  x.strokeRect(12 * u, 12 * u, 76 * u, 76 * u);

  // the M, drawn as four heavy strokes
  x.lineWidth = 9 * u;
  x.beginPath();
  x.moveTo(28 * u, 68 * u);
  x.lineTo(28 * u, 32 * u);
  x.lineTo(50 * u, 56 * u);
  x.lineTo(72 * u, 32 * u);
  x.lineTo(72 * u, 68 * u);
  x.stroke();

  // the shuttle bar
  x.fillStyle = BRICKISH;
  x.fillRect(28 * u, 76 * u, 44 * u, 5 * u);

  // warp ticks
  x.fillStyle = INK;
  for (let i = 0; i < 9; i++) {
    x.fillRect((20 + i * 7.5) * u, 20 * u, 1.6 * u, 5 * u);
  }
  return c;
}

/* 2. Warp and Weft ------------------------------------------------------- */

function warpAndWeft() {
  const c = mkCanvas();
  const x = c.getContext('2d');
  const S = c.width;
  const n = 9;
  const pad = S * 0.1;
  const span = S - pad * 2;
  const cell = span / n;
  const bar = cell * 0.62;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const over = (i + j) % 2 === 0;
      const cx = pad + i * cell + cell / 2;
      const cy = pad + j * cell + cell / 2;
      x.fillStyle = over ? INK : BRICKISH;
      if (over) {
        x.fillRect(cx - bar / 2, cy - cell / 2, bar, cell);
      } else {
        x.fillRect(cx - cell / 2, cy - bar / 2, cell, bar);
      }
    }
  }
  return c;
}

/* 3. Shuttle Mark -------------------------------------------------------- */

function shuttleMark() {
  const c = mkCanvas();
  const x = c.getContext('2d');
  const S = c.width;
  const u = S / 100;

  x.fillStyle = INK;
  x.beginPath();
  x.moveTo(8 * u, 50 * u);
  x.quadraticCurveTo(50 * u, 14 * u, 92 * u, 50 * u);
  x.quadraticCurveTo(50 * u, 86 * u, 8 * u, 50 * u);
  x.closePath();
  x.fill();

  // the bobbin window is cut out, so a transparent PNG has something to prove
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  x.ellipse(50 * u, 50 * u, 15 * u, 11 * u, 0, 0, Math.PI * 2);
  x.fill();
  x.globalCompositeOperation = 'source-over';

  x.fillStyle = INK;
  for (let i = 0; i < 3; i++) {
    x.fillRect((30 + i * 18) * u, 91 * u, 12 * u, 3 * u);
  }
  return c;
}

/* 4. Selvedge Stripe ----------------------------------------------------- */

function selvedgeStripe() {
  const c = mkCanvas();
  const x = c.getContext('2d');
  const S = c.width;
  const u = S / 100;

  x.fillStyle = CHALK;
  x.fillRect(6 * u, 22 * u, 88 * u, 56 * u);

  const widths = [7, 2, 4, 1.5, 10, 2, 3, 1.5, 6];
  let y = 26;
  let dark = true;
  for (const w of widths) {
    x.fillStyle = dark ? INK : BRICKISH;
    x.fillRect(6 * u, y * u, 88 * u, w * u);
    y += w + 1.4;
    dark = !dark;
  }
  x.strokeStyle = INK;
  x.lineWidth = 1.5 * u;
  x.strokeRect(6 * u, 22 * u, 88 * u, 56 * u);
  return c;
}

/* Calibration card, loaded with ?calib=1 ---------------------------------- */

export function calibrationGrid() {
  const c = mkCanvas(1200);
  const x = c.getContext('2d');
  const S = c.width;
  const n = 20;
  x.strokeStyle = INK;
  x.lineWidth = S / 340;
  x.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * S;
    x.moveTo(p, 0); x.lineTo(p, S);
    x.moveTo(0, p); x.lineTo(S, p);
  }
  x.stroke();
  return c;
}

export const SAMPLE_SPECS = [
  { id: 'loom-monogram', name: '織機字標', draw: loomMonogram },
  { id: 'warp-weft-grid', name: '經緯格', draw: warpAndWeft },
  { id: 'shuttle-mark', name: '梭子印記', draw: shuttleMark },
  { id: 'selvedge-stripe', name: '布邊條紋', draw: selvedgeStripe }
];

/** Build the four sample designs. Synchronous: it is all Canvas 2D. */
export function buildSampleSet() {
  return SAMPLE_SPECS.map((spec) => {
    const canvas = spec.draw();
    return {
      id: spec.id,
      name: spec.name,
      fileBase: spec.id,
      source: canvas,
      width: canvas.width,
      height: canvas.height,
      aspect: canvas.width / canvas.height,
      sample: true,
      soft: false
    };
  });
}
