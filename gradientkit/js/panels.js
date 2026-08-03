/* ==========================================================================
   GradientKit - panels.js
   Measurement panels: vision simulation, grain and dither with the loupe, the
   contrast probe, and the saved library.

   Every number in here is measured from the rendered canvas, never from the
   ideal math, because the ideal is not what ships.
   ========================================================================== */

import {
  applyCvd, contrastRatio, aaThreshold, parseHex, toHex, hexToOklch, formatOklch,
  VISION_ORDER, VISION_LABELS, clamp,
} from './color.js';
import { rasterize, buildRamp, detectsBanding } from './gradient.js';
import { iconMarkup } from './icons.js';
import * as library from './library.js';

/* --------------------------------------------------------------------------
   Vision simulation strip
   Four live 68x44 thumbnails. One raster is computed and the three matrices
   are applied to its pixels, so all four always agree with each other.
   -------------------------------------------------------------------------- */

export function createVisionStrip(root, ctx) {
  const W = 68;
  const H = 44;
  const cells = new Map();

  VISION_ORDER.forEach((kind, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gk-vision-cell';
    b.dataset.vision = kind;
    b.tabIndex = i === 0 ? 0 : -1;
    b.setAttribute('aria-pressed', String(i === 0));
    b.innerHTML = `<canvas class="gk-vision-canvas" width="${W}" height="${H}" aria-hidden="true"></canvas>
      <span class="gk-vision-name">${VISION_LABELS[kind]}</span>`;
    b.addEventListener('click', () => ctx.onSelect(kind));
    root.appendChild(b);
    cells.set(kind, { el: b, ctx2d: b.querySelector('canvas').getContext('2d') });
  });

  root.addEventListener('keydown', (e) => {
    const list = [...cells.values()].map((c) => c.el);
    const idx = list.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % list.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + list.length) % list.length;
    if (next >= 0) {
      e.preventDefault();
      list.forEach((el, i) => { el.tabIndex = i === next ? 0 : -1; });
      list[next].focus();
    }
  });

  let cache = '';

  function update(force = false) {
    const state = ctx.store.get();
    const key = JSON.stringify([state.mode, state.type, state.angle, state.space, state.easing, state.stops, state.mesh, state.center, state.radius]);
    if (key === cache && !force) {
      for (const [kind, c] of cells) c.el.setAttribute('aria-pressed', String(kind === state.vision));
      return;
    }
    cache = key;
    const base = rasterize({ ...state, grain: { amp: 0, size: 1 }, dither: true, vision: 'normal' }, W, H);
    for (const [kind, c] of cells) {
      const out = new Uint8ClampedArray(base.length);
      for (let i = 0; i < base.length; i += 4) {
        const col = applyCvd(
          { r: base[i] / 255, g: base[i + 1] / 255, b: base[i + 2] / 255 },
          kind,
        );
        out[i] = Math.round(col.r * 255);
        out[i + 1] = Math.round(col.g * 255);
        out[i + 2] = Math.round(col.b * 255);
        out[i + 3] = 255;
      }
      c.ctx2d.putImageData(new ImageData(out, W, H), 0, 0);
      c.el.setAttribute('aria-pressed', String(kind === state.vision));
      c.el.classList.toggle('is-selected', kind === state.vision);
    }
  }

  return { update };
}

/* --------------------------------------------------------------------------
   Loupe
   88x88 at 8x pixelated magnification, sampling actual device pixels from the
   Stage. This is how a user confirms the dither is doing something.
   -------------------------------------------------------------------------- */

export function createLoupe(canvas, hexOut, ctx) {
  const c = canvas.getContext('2d');
  const SCALE = 8;
  const src = Math.round(canvas.width / SCALE);
  let point = { x: 0.5, y: 0.5 };

  function draw() {
    const stage = ctx.stageCanvas;
    if (!stage.width || !stage.height) return;
    const sx = clamp(Math.round(point.x * stage.width) - Math.floor(src / 2), 0, Math.max(0, stage.width - src));
    const sy = clamp(Math.round(point.y * stage.height) - Math.floor(src / 2), 0, Math.max(0, stage.height - src));
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, canvas.width, canvas.height);
    try {
      c.drawImage(stage, sx, sy, src, src, 0, 0, canvas.width, canvas.height);
    } catch {
      // A tainted or zero-sized source leaves the loupe blank rather than
      // throwing; the hex readout below still reports the sampled color.
    }
    const sample = ctx.renderer.sampleAt(point.x, point.y);
    hexOut.textContent = toHex(sample.r, sample.g, sample.b);
  }

  function setPoint(x, y) {
    point = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
    draw();
  }

  return { draw, setPoint, get point() { return point; } };
}

/* --------------------------------------------------------------------------
   Contrast probe
   768 samples: 256 columns across the sample text's box, at three rows.
   Read from rendered pixels so grain, dither and gamut clipping are included.
   -------------------------------------------------------------------------- */

export function createProbe(els, ctx) {
  const { input, sizeGroup, weightToggle, fgGroup, readout, verdict, position, empty, sample } = els;
  let lastAnnounce = 0;

  function measure() {
    const state = ctx.store.get();
    const text = state.probe.text.trim();
    if (!text) {
      readout.textContent = '--.--';
      verdict.textContent = '';
      position.textContent = '';
      empty.hidden = false;
      sample.hidden = true;
      els.marker.hidden = true;
      return null;
    }
    empty.hidden = true;
    sample.hidden = false;

    const stageRect = ctx.stageEl.getBoundingClientRect();
    const box = sample.getBoundingClientRect();
    if (!stageRect.width || !box.width) return null;

    const nx = (box.left - stageRect.left) / stageRect.width;
    const ny = (box.top - stageRect.top) / stageRect.height;
    const nw = box.width / stageRect.width;
    const nh = box.height / stageRect.height;

    const rect = ctx.renderer.readRect(
      clamp(nx, 0, 1), clamp(ny, 0, 1),
      clamp(nw, 0.001, 1 - clamp(nx, 0, 0.999)),
      clamp(nh, 0.001, 1 - clamp(ny, 0, 0.999)),
    );

    const fg = parseHex(state.probe.fg) || { r: 1, g: 1, b: 1 };
    const rows = [Math.floor(rect.h * 0.25), Math.floor(rect.h * 0.5), Math.floor(rect.h * 0.75)];
    let worst = Infinity;
    let worstX = 0;
    const cols = Math.min(256, rect.w);
    for (const ry of rows) {
      for (let i = 0; i < cols; i++) {
        const px = Math.floor((i / Math.max(1, cols - 1)) * (rect.w - 1));
        const o = (ry * rect.w + px) * 4;
        const bg = { r: rect.data[o] / 255, g: rect.data[o + 1] / 255, b: rect.data[o + 2] / 255 };
        const ratio = contrastRatio(fg, bg);
        if (ratio < worst) { worst = ratio; worstX = i / Math.max(1, cols - 1); }
      }
    }

    const threshold = aaThreshold(state.probe.size, state.probe.weight);
    const pass = worst >= threshold;
    readout.textContent = `${worst.toFixed(2)}:1`;
    verdict.textContent = pass ? 'PASS AA' : 'FAIL AA';
    verdict.dataset.pass = String(pass);
    const worstAcross = nx + worstX * nw;
    position.textContent = `worst at ${(worstAcross * 100).toFixed(1)}%`;

    els.marker.hidden = false;
    els.marker.style.left = `${worstAcross * 100}%`;
    els.marker.style.top = `${(ny + nh / 2) * 100}%`;

    const now = Date.now();
    if (now - lastAnnounce > 800) {
      lastAnnounce = now;
      ctx.announce(`Contrast ${worst.toFixed(2)} to 1. ${pass ? 'Passes' : 'Fails'} AA at ${state.probe.size} pixels.`);
    }
    return { ratio: worst, pass, at: worstAcross };
  }

  function paintSample() {
    const p = ctx.store.get().probe;
    sample.textContent = p.text;
    sample.style.fontSize = `${p.size}px`;
    sample.style.fontWeight = String(p.weight);
    sample.style.color = p.fg;
    sample.style.left = `${p.x * 100}%`;
    sample.style.top = `${p.y * 100}%`;
  }

  input.addEventListener('input', () => {
    ctx.store.set((s) => { s.probe.text = input.value; return s; }, 'probe');
    paintSample();
    measure();
  });

  sizeGroup.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-size]');
    if (!b) return;
    const size = Number(b.dataset.size);
    ctx.store.set((s) => { s.probe.size = size; return s; }, 'probe');
    for (const btn of sizeGroup.querySelectorAll('button[data-size]')) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.size) === size));
    }
    paintSample();
    measure();
  });

  weightToggle.addEventListener('click', () => {
    const next = ctx.store.get().probe.weight === 600 ? 400 : 600;
    ctx.store.set((s) => { s.probe.weight = next; return s; }, 'probe');
    weightToggle.setAttribute('aria-pressed', String(next === 600));
    weightToggle.querySelector('.gk-weight-value').textContent = String(next);
    paintSample();
    measure();
  });

  fgGroup.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fg]');
    if (!b) return;
    ctx.store.set((s) => { s.probe.fg = b.dataset.fg; return s; }, 'probe');
    for (const btn of fgGroup.querySelectorAll('button[data-fg]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.fg === b.dataset.fg));
    }
    paintSample();
    measure();
  });

  // The sample text is draggable across the Stage; the readout recomputes on
  // every frame of the drag.
  let dragging = false;
  sample.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    sample.setPointerCapture(e.pointerId);
    sample.classList.add('is-dragging');
  });
  sample.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = ctx.stageEl.getBoundingClientRect();
    ctx.store.set((s) => {
      s.probe.x = clamp((e.clientX - r.left) / r.width, 0.05, 0.95);
      s.probe.y = clamp((e.clientY - r.top) / r.height, 0.08, 0.92);
      return s;
    }, 'probe');
    paintSample();
    measure();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    sample.classList.remove('is-dragging');
    try { sample.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  sample.addEventListener('pointerup', endDrag);
  sample.addEventListener('pointercancel', endDrag);

  function sync() {
    const p = ctx.store.get().probe;
    if (input.value !== p.text) input.value = p.text;
    for (const btn of sizeGroup.querySelectorAll('button[data-size]')) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.size) === p.size));
    }
    weightToggle.setAttribute('aria-pressed', String(p.weight === 600));
    weightToggle.querySelector('.gk-weight-value').textContent = String(p.weight);
    for (const btn of fgGroup.querySelectorAll('button[data-fg]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.fg === p.fg));
    }
    paintSample();
  }

  return { measure, sync, paintSample, focus: () => input.focus() };
}

/* --------------------------------------------------------------------------
   Saved library
   -------------------------------------------------------------------------- */

export function createLibrary(els, ctx) {
  const { list, emptyState, saveBtn, blockedNote } = els;
  let quotaBlocked = false;

  function render() {
    if (!library.storageAvailable()) {
      list.hidden = true;
      emptyState.hidden = true;
      blockedNote.hidden = false;
      saveBtn.hidden = true;
      return;
    }
    blockedNote.hidden = true;
    saveBtn.hidden = false;
    const entries = library.loadAll();
    list.innerHTML = '';
    if (!entries.length) {
      list.hidden = true;
      emptyState.hidden = false;
      return;
    }
    list.hidden = false;
    emptyState.hidden = true;

    entries.forEach((entry, i) => {
      const row = document.createElement('li');
      row.className = 'gk-lib-row';
      if (quotaBlocked && i === entries.length - 1) row.classList.add('is-oldest');
      const thumb = document.createElement('span');
      thumb.className = 'gk-lib-thumb';
      try {
        const parsed = ctx.decode(entry.hash);
        const ramp = buildRamp(parsed.stops, parsed.space, parsed.easing, 64);
        thumb.style.backgroundImage = ctx.cssFromRamp(ramp);
      } catch {
        thumb.style.backgroundImage = 'none';
      }
      row.appendChild(thumb);

      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'gk-lib-load';
      load.innerHTML = `<span class="gk-lib-name">${escapeHtml(entry.name)}</span>
        <span class="gk-lib-time">${library.relativeTime(entry.at)}</span>`;
      load.addEventListener('click', () => ctx.onLoad(entry.hash));
      row.appendChild(load);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'gk-lib-delete';
      del.innerHTML = `${iconMarkup('x')}<span class="gk-sr">Delete ${escapeHtml(entry.name)}</span>`;
      del.addEventListener('click', () => {
        library.remove(entry.hash);
        quotaBlocked = false;
        render();
        ctx.onChanged();
      });
      row.appendChild(del);

      list.appendChild(row);
    });
  }

  function trySave(hash, name) {
    if (library.has(hash)) return 'duplicate';
    const result = library.save({ hash, name });
    if (result === 'quota') quotaBlocked = true;
    render();
    return result;
  }

  function syncSaveButton(hash) {
    if (!library.storageAvailable()) return;
    const dup = library.has(hash);
    saveBtn.setAttribute('aria-disabled', String(dup || quotaBlocked));
    saveBtn.classList.toggle('is-disabled', dup || quotaBlocked);
    els.saveReason.textContent = quotaBlocked
      ? 'Storage is full. Delete a saved gradient to make room.'
      : dup ? 'Already saved.' : '';
  }

  return { render, trySave, syncSaveButton, get quotaBlocked() { return quotaBlocked; } };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --------------------------------------------------------------------------
   Grain and dither helper: the banding sentence.
   -------------------------------------------------------------------------- */

export function bandingSentence(state) {
  if (state.grain.amp > 0) return '';
  const ramp = buildRamp(state.stops, state.space, state.easing, 1024);
  if (!detectsBanding(ramp, 1200)) return '';
  return 'Grain off. 8-bit banding is visible in the loupe at this amplitude.';
}

export { formatOklch, hexToOklch };
