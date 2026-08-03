/* ==========================================================================
   GradientKit - sections.js
   The two teaching surfaces below the fold.

   B. Four bands, one per interpolation space, sharing the user's own endpoint
      colors, each carrying its computed chroma deficit. This is the artifact a
      designer screenshots into a ticket, so it has to be self-explanatory with
      no caption.
   C. The reference set shelf.
   ========================================================================== */

import { buildRamp, rampToCssGradient, chromaDeficit, rasterize } from './gradient.js';
import { SPACE_ORDER, SPACE_LABELS } from './color.js';
import { GRADIENT_PRESETS, MESH_PRESETS } from './presets.js';

/* --------------------------------------------------------------------------
   B. Comparison bands
   -------------------------------------------------------------------------- */

export function createBands(root, ctx) {
  const bands = new Map();

  for (const space of SPACE_ORDER) {
    const row = document.createElement('div');
    row.className = 'gk-band';
    row.dataset.space = space;
    row.innerHTML = `
      <div class="gk-band-name">${SPACE_LABELS[space]}</div>
      <div class="gk-band-swatch" role="img" aria-label="${SPACE_LABELS[space]} interpolation of the current endpoint colors"></div>
      <div class="gk-band-metric"><span class="gk-band-num">0%</span><span class="gk-band-unit">chroma deficit</span></div>
    `;
    root.appendChild(row);
    bands.set(space, {
      row,
      swatch: row.querySelector('.gk-band-swatch'),
      num: row.querySelector('.gk-band-num'),
    });
  }

  function update() {
    const state = ctx.store.get();
    const sorted = state.stops.slice().sort((a, b) => a.pos - b.pos);
    // The bands always show the user's own first and last stop, so the lesson
    // is always about their colors and not about a demo pair.
    const pair = [
      { hex: sorted[0].hex, pos: 0 },
      { hex: sorted[sorted.length - 1].hex, pos: 100 },
    ];
    for (const space of SPACE_ORDER) {
      const b = bands.get(space);
      const ramp = buildRamp(pair, space, 'linear', 128);
      b.swatch.style.backgroundImage = rampToCssGradient(ramp, { angle: 90, k: 32 });
      const d = chromaDeficit(pair, space, 'linear', 128);
      b.num.textContent = `${d.worstPct}%`;
      b.row.classList.toggle('is-current', space === state.space);
      b.row.classList.toggle('is-clean', d.worstPct === 0);
    }
  }

  return { update };
}

/* --------------------------------------------------------------------------
   C. Reference set shelf
   -------------------------------------------------------------------------- */

export function createShelf(root, ctx) {
  const tiles = [];

  const all = [
    ...GRADIENT_PRESETS.map((p) => ({ ...p, kind: 'gradient' })),
    ...MESH_PRESETS.map((p) => ({ ...p, kind: 'mesh' })),
  ];

  all.forEach((preset, i) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'gk-tile';
    tile.dataset.preset = preset.id;
    tile.tabIndex = i === 0 ? 0 : -1;
    tile.innerHTML = `
      <span class="gk-tile-art" aria-hidden="true"></span>
      <span class="gk-tile-name">${preset.name}</span>
      <span class="gk-tile-meta">${preset.kind === 'mesh'
        ? `${preset.scene.mesh.length} points, OKLab`
        : `${preset.scene.type}, ${SPACE_LABELS[preset.scene.space]}`}</span>
      <span class="gk-sr">. ${preset.demonstrates}</span>
    `;
    const art = tile.querySelector('.gk-tile-art');

    if (preset.kind === 'mesh') {
      const c = document.createElement('canvas');
      c.width = 84;
      c.height = 56;
      const cx = c.getContext('2d');
      cx.putImageData(new ImageData(rasterize({ ...preset.scene, dither: true }, 84, 56), 84, 56), 0, 0);
      art.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
      art.style.backgroundSize = 'cover';
    } else {
      const ramp = buildRamp(preset.scene.stops, preset.scene.space, 'linear', 128);
      const angle = preset.scene.type === 'linear' ? preset.scene.angle : 90;
      art.style.backgroundImage = rampToCssGradient(ramp, { angle, k: 24 });
    }

    tile.addEventListener('click', () => ctx.onLoad(preset));
    root.appendChild(tile);
    tiles.push(tile);
  });

  // Roving tabindex across the shelf.
  root.addEventListener('keydown', (e) => {
    const idx = tiles.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = Math.min(tiles.length - 1, idx + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tiles.length - 1;
    if (next >= 0) {
      e.preventDefault();
      tiles.forEach((t, i) => { t.tabIndex = i === next ? 0 : -1; });
      tiles[next].focus();
      tiles[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });

  function setActive(id) {
    for (const t of tiles) t.classList.toggle('is-active', t.dataset.preset === id);
  }

  function scrollIntoView() {
    root.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { setActive, scrollIntoView, tiles };
}
