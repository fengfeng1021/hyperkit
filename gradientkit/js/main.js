/* ==========================================================================
   GradientKit - main.js
   Assembly. Owns the store, the renderer, the frame schedule and the keyboard.

   Two render passes:
     fast  - canvas, track, stage readouts. Runs on every change, in rAF.
     heavy - output code, comparison bands, vision thumbnails, banding check.
             Debounced and suppressed while a pointer drag is in progress.

   Motion mount points for the animation layer are listed at the bottom of
   README.md and marked in the source with the comment MOTION HOOK.
   ========================================================================== */

import {
  SPACE_LABELS, SPACE_ORDER, VISION_LABELS, toHex, parseHex, hexToOklch,
  formatOklch, nameColor, clamp,
} from './color.js';
import { buildRamp, rampAt, rampToCssGradient, describeScene } from './gradient.js';
import { createStore, defaultState, decodeHash, encodeHash } from './state.js';
import { createRenderer } from './render.js';
import { createTrack } from './track.js';
import { createSweep } from './sweep.js';
import { createOutputs } from './outputs.js';
import { createBands, createShelf } from './sections.js';
import { createVisionStrip, createLoupe, createProbe, createLibrary, bandingSentence } from './panels.js';
import { createNoticeHost } from './notice.js';
import { NumericField, Slider, bindRadioGroup, buttonStates, armable, copyText } from './controls.js';
import { iconMarkup } from './icons.js';
import { GRADIENT_PRESETS, MESH_PRESETS, REFERENCE_SET, findPreset } from './presets.js';
import { validateFile, extractStops } from './extract.js';
import * as library from './library.js';

const $ = (sel) => document.querySelector(sel);

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

const liveRegions = {
  polite: $('#live-polite'),
  assertive: $('#live-assertive'),
};
const announce = (msg) => { liveRegions.polite.textContent = msg; };

const noticeHost = createNoticeHost($('#notice-slot'), liveRegions);
const notice = (o) => noticeHost.show(typeof o === 'string' ? { message: o } : o);

const parsed = decodeHash(window.location.hash);
const store = createStore(parsed.state);

const stageCanvas = $('#stage');
const stageEl = $('#stage-wrap');
const overlayEl = $('#stage-overlay');

const renderer = createRenderer(stageCanvas, {
  onFallback: () => {
    notice({
      message: 'Software renderer. The stage preview is lower resolution. Exports are full resolution.',
      persistent: false,
    });
  },
  onContextLost: (count) => {
    if (count <= 2) {
      notice({ message: 'The graphics context restarted. Your gradient is unchanged.' });
    }
  },
});

if (renderer.kind !== 'webgl2') {
  notice({
    message: 'Software renderer. The stage preview is lower resolution. Exports are full resolution.',
  });
}

/* --------------------------------------------------------------------------
   Icons that live in static markup
   -------------------------------------------------------------------------- */

const ICON_SLOTS = [
  ['#btn-reference .gk-btn-icon', 'bookmark'],
  ['#btn-copylink .gk-btn-icon', 'link'],
  ['#btn-add-stop .gk-btn-icon', 'plus'],
  ['#btn-add-point .gk-btn-icon', 'plus'],
  ['#btn-copy .gk-btn-icon', 'copy'],
  ['#btn-png .gk-btn-icon', 'download'],
  ['#btn-save .gk-btn-icon', 'bookmark'],
];
for (const [sel, name] of ICON_SLOTS) {
  const el = $(sel);
  if (el) el.innerHTML = iconMarkup(name);
}

/* --------------------------------------------------------------------------
   Derived values
   -------------------------------------------------------------------------- */

let ramp = buildRamp(store.get().stops, store.get().space, store.get().easing, 512);
let rampKey = '';

function currentRamp() {
  const s = store.get();
  const key = JSON.stringify([s.stops, s.space, s.easing]);
  if (key !== rampKey) {
    ramp = buildRamp(s.stops, s.space, s.easing, 512);
    rampKey = key;
  }
  return ramp;
}

/** The only two hue-bearing custom properties in the product, both sampled
 *  from the user's own gradient. */
function paintUserTokens() {
  const r = currentRamp();
  const mid = rampAt(r, 0.5);
  const edge = rampAt(r, 0);
  const midHex = toHex(mid.r, mid.g, mid.b);
  const edgeHex = toHex(edge.r, edge.g, edge.b);
  const root = document.documentElement;
  root.style.setProperty('--user-mid', midHex);
  root.style.setProperty('--user-edge', edgeHex);
  root.style.setProperty('--user-mid-wash', hexAlpha(midHex, 0.22));
  root.style.setProperty('--user-edge-wash', hexAlpha(edgeHex, 0.1));
}

function hexAlpha(hex, a) {
  const c = parseHex(hex) || { r: 1, g: 1, b: 1 };
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
}

/* --------------------------------------------------------------------------
   Track
   -------------------------------------------------------------------------- */

const guideEl = $('#guide');

const track = createTrack($('#track'), {
  store,
  getRamp: currentRamp,
  notice,
  setGuide(x) {
    if (x === null) { guideEl.hidden = true; return; }
    guideEl.hidden = false;
    guideEl.style.left = `${x * 100}%`;
  },
  onActiveChange(i) {
    const stop = store.get().stops[i];
    if (stop) $('#track-readout').dataset.hex = stop.hex;
  },
});

/* --------------------------------------------------------------------------
   Sweep
   -------------------------------------------------------------------------- */

const sweep = createSweep(overlayEl, { store, renderer, notice, announce });

/* --------------------------------------------------------------------------
   Left rail controls
   -------------------------------------------------------------------------- */

const typeGroup = bindRadioGroup($('#type-group'), {
  onChange(value) {
    store.commit({ type: value }, 'type');
    syncGeometry();
  },
});

const spaceGroup = bindRadioGroup($('#space-group'), {
  onChange(value) {
    const previous = store.get().space;
    if (previous === value) return;
    store.commit({ space: value }, 'space');
    library.markSeen();
    // MOTION HOOK: the sweep timeline replaces this instant open.
    sweep.open(previous, value);
    syncCompareLabel();
  },
});

const angleField = new NumericField($('#field-angle'), {
  min: 0, max: 360, step: 1, decimals: 0,
  rangeMessage: 'Angle is 0 to 360.',
  onChange(v, live) {
    (live ? store.set : store.commit).call(store, { angle: v }, 'angle', 'angle');
  },
});

const cxField = new NumericField($('#field-cx'), {
  min: 0, max: 100, step: 1, decimals: 0,
  rangeMessage: 'Center x is 0 to 100.',
  onChange(v, live) {
    (live ? store.set : store.commit).call(store, (s) => { s.center = { ...s.center, x: v / 100 }; return s; }, 'center', 'cx');
  },
});
const cyField = new NumericField($('#field-cy'), {
  min: 0, max: 100, step: 1, decimals: 0,
  rangeMessage: 'Center y is 0 to 100.',
  onChange(v, live) {
    (live ? store.set : store.commit).call(store, (s) => { s.center = { ...s.center, y: v / 100 }; return s; }, 'center', 'cy');
  },
});
const radiusField = new NumericField($('#field-radius'), {
  min: 5, max: 300, step: 1, decimals: 0,
  rangeMessage: 'Radius is 5 to 300.',
  onChange(v, live) {
    (live ? store.set : store.commit).call(store, { radius: v / 100 }, 'radius', 'radius');
  },
});

$('#in-easing').addEventListener('change', (e) => {
  store.commit({ easing: e.target.value }, 'easing');
});

function syncGeometry() {
  const s = store.get();
  const isRadial = s.type === 'radial';
  angleField.setDisabled(isRadial, isRadial ? 'Radial gradients use a center and a radius, not an angle.' : '');
  $('#radial-fields').hidden = !isRadial;
}

function syncCompareLabel() {
  const s = store.get();
  const from = s.space === 'oklch' ? 'srgb' : s.space;
  const to = s.space === 'oklch' ? 'oklch' : 'oklch';
  $('#btn-compare .gk-btn-label').textContent =
    s.space === 'oklch' ? 'Compare against sRGB' : `Compare ${SPACE_LABELS[from]} against ${SPACE_LABELS[to]}`;
}

$('#btn-compare').addEventListener('click', () => {
  const s = store.get();
  if (s.space === 'oklch') {
    sweep.open('srgb', 'oklch');
  } else {
    store.commit({ space: 'oklch' }, 'space');
    spaceGroup.set('oklch');
    sweep.open(s.space, 'oklch');
    syncCompareLabel();
  }
  library.markSeen();
  sweep.focusGrip();
});

/* --------------------------------------------------------------------------
   Stop list (left rail)
   -------------------------------------------------------------------------- */

const stopListEl = $('#stop-list');
let stopFields = [];

function renderStopList() {
  const stops = store.get().stops;
  if (stopListEl.children.length !== stops.length) {
    stopListEl.innerHTML = '';
    stopFields = [];
    stops.forEach((_, i) => stopListEl.appendChild(makeStopRow(i)));
  }
  stops.forEach((stop, i) => {
    const row = stopListEl.children[i];
    row.querySelector('.gk-swatch').style.setProperty('--c', stop.hex);
    row.querySelector('.gk-swatch').setAttribute('aria-label', `Color of stop ${i + 1}, ${nameColor(stop.hex)}`);
    row.querySelector('.gk-stoprow-hex').textContent = stop.hex;
    const field = stopFields[i];
    if (field && document.activeElement !== field.input) field.set(stop.pos, { silent: true });
    const del = row.querySelector('.gk-stoprow-del');
    const only2 = stops.length <= 2;
    del.setAttribute('aria-disabled', String(only2));
    del.classList.toggle('is-disabled', only2);
  });
}

function makeStopRow(i) {
  const li = document.createElement('li');
  li.className = 'gk-stoprow';
  li.dataset.index = String(i);
  li.innerHTML = `
    <button type="button" class="gk-swatch"></button>
    <span class="gk-stoprow-hex"></span>
    <div class="gk-num gk-num--compact">
      <label class="gk-num-label" for="stop-pos-${i}">at</label>
      <input class="gk-num-input" id="stop-pos-${i}" type="text" inputmode="decimal" value="0"
             autocomplete="off" spellcheck="false">
      <span class="gk-num-unit">%</span>
      <p class="gk-num-msg" role="status"></p>
    </div>
    <button type="button" class="gk-stoprow-del" aria-describedby="stop-del-reason">
      ${iconMarkup('minus')}<span class="gk-sr">Delete stop ${i + 1}</span>
    </button>`;

  li.querySelector('.gk-swatch').addEventListener('click', () => {
    track.setActive(i);
    track.openColorFor(i);
  });
  li.querySelector('.gk-stoprow-del').addEventListener('click', () => {
    if (store.get().stops.length <= 2) {
      notice('Two stops is the minimum for a gradient.');
      return;
    }
    store.commit((s) => { s.stops.splice(i, 1); return s; }, 'stop-delete');
  });

  stopFields[i] = new NumericField(li.querySelector('.gk-num'), {
    min: 0, max: 100, step: 0.5, decimals: 2,
    rangeMessage: 'Position is 0 to 100.',
    onChange(v, live) {
      (live ? store.set : store.commit).call(store, (s) => {
        if (s.stops[i]) s.stops[i].pos = v;
        return s;
      }, 'stop-pos', `stop-pos-${i}`);
    },
  });
  return li;
}

$('#btn-add-stop').addEventListener('click', () => track.insertAtWidestGap());

/* --------------------------------------------------------------------------
   Mesh list and mesh points on the Stage
   -------------------------------------------------------------------------- */

const meshListEl = $('#mesh-list');
const meshPointsEl = $('#mesh-points');

function renderMeshList() {
  const s = store.get();
  meshListEl.innerHTML = '';
  s.mesh.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'gk-stoprow';
    li.innerHTML = `
      <button type="button" class="gk-swatch" style="--c:${p.hex}" aria-label="Color of point ${i + 1}, ${nameColor(p.hex)}"></button>
      <span class="gk-stoprow-hex">${p.hex}</span>
      <span class="gk-stoprow-coord">${Math.round(p.x * 100)}, ${Math.round(p.y * 100)}</span>
      <button type="button" class="gk-stoprow-del"${s.mesh.length <= 3 ? ' aria-disabled="true" class="is-disabled"' : ''}>
        ${iconMarkup('minus')}<span class="gk-sr">Delete point ${i + 1}</span>
      </button>`;
    li.querySelector('.gk-swatch').addEventListener('click', () => cycleMeshColor(i));
    li.querySelector('.gk-stoprow-del').addEventListener('click', () => {
      if (store.get().mesh.length <= 3) {
        notice('A mesh field needs at least three points.');
        return;
      }
      store.commit((st) => { st.mesh.splice(i, 1); return st; }, 'mesh-delete');
    });
    meshListEl.appendChild(li);
  });
}

function cycleMeshColor(i) {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = store.get().mesh[i].hex;
  input.className = 'gk-hidden-color';
  document.body.appendChild(input);
  input.addEventListener('input', () => {
    store.set((s) => { s.mesh[i].hex = input.value.toUpperCase(); return s; }, 'mesh-color');
  });
  input.addEventListener('change', () => {
    store.commit((s) => { s.mesh[i].hex = input.value.toUpperCase(); return s; }, 'mesh-color');
    input.remove();
  });
  input.click();
}

function renderMeshPoints() {
  const s = store.get();
  if (s.mode !== 'mesh') { meshPointsEl.hidden = true; return; }
  meshPointsEl.hidden = false;
  if (meshPointsEl.children.length !== s.mesh.length) {
    meshPointsEl.innerHTML = '';
    s.mesh.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gk-meshpoint';
      b.dataset.index = String(i);
      b.innerHTML = '<span class="gk-meshpoint-ring"></span><span class="gk-sr"></span>';
      meshPointsEl.appendChild(b);
    });
  }
  s.mesh.forEach((p, i) => {
    const b = meshPointsEl.children[i];
    b.style.left = `${p.x * 100}%`;
    b.style.top = `${p.y * 100}%`;
    b.style.setProperty('--ring', `${p.r * 100}%`);
    b.style.setProperty('--c', p.hex);
    b.querySelector('.gk-sr').textContent = `Mesh point ${i + 1}, ${nameColor(p.hex)}, at ${Math.round(p.x * 100)} and ${Math.round(p.y * 100)} percent`;
  });
}

let meshDrag = null;
meshPointsEl.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.gk-meshpoint');
  if (!b) return;
  e.preventDefault();
  b.setPointerCapture(e.pointerId);
  store.mark();
  meshDrag = { index: Number(b.dataset.index), el: b };
  meshPointsEl.classList.add('is-dragging');
  b.classList.add('is-active');
});
meshPointsEl.addEventListener('pointermove', (e) => {
  if (!meshDrag) return;
  const r = stageEl.getBoundingClientRect();
  store.set((s) => {
    s.mesh[meshDrag.index].x = clamp((e.clientX - r.left) / r.width, 0, 1);
    s.mesh[meshDrag.index].y = clamp((e.clientY - r.top) / r.height, 0, 1);
    return s;
  }, 'mesh-drag');
});
const endMeshDrag = (e) => {
  if (!meshDrag) return;
  meshDrag.el.classList.remove('is-active');
  try { meshDrag.el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  meshPointsEl.classList.remove('is-dragging');
  meshDrag = null;
  store.set({}, 'mesh-drop');
};
meshPointsEl.addEventListener('pointerup', endMeshDrag);
meshPointsEl.addEventListener('pointercancel', endMeshDrag);

meshPointsEl.addEventListener('keydown', (e) => {
  const b = e.target.closest('.gk-meshpoint');
  if (!b) return;
  const i = Number(b.dataset.index);
  const step = e.shiftKey ? 0.05 : 0.01;
  const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (map[e.key]) {
    e.preventDefault();
    const [dx, dy] = map[e.key];
    store.commit((s) => {
      s.mesh[i].x = clamp(s.mesh[i].x + dx, 0, 1);
      s.mesh[i].y = clamp(s.mesh[i].y + dy, 0, 1);
      return s;
    }, 'mesh-key', `mesh-${i}`);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    cycleMeshColor(i);
  }
});

$('#btn-add-point').addEventListener('click', () => {
  const s = store.get();
  if (s.mesh.length >= 12) {
    notice('Twelve points is the maximum for a mesh field.');
    return;
  }
  const r = currentRamp();
  const c = rampAt(r, Math.random());
  store.commit((st) => {
    st.mesh.push({ hex: toHex(c.r, c.g, c.b), x: 0.5, y: 0.5, r: 0.45 });
    return st;
  }, 'mesh-add');
});

/* --------------------------------------------------------------------------
   Mode
   -------------------------------------------------------------------------- */

const modeGroup = bindRadioGroup($('#mode-group'), {
  onChange(value) {
    store.commit({ mode: value }, 'mode');
    syncMode();
  },
});

function syncMode() {
  const s = store.get();
  const mesh = s.mode === 'mesh';
  $('#panel-stops').hidden = mesh;
  $('#panel-mesh').hidden = !mesh;
  $('#track').hidden = mesh;
  spaceGroup.setDisabled('hsl', mesh, mesh ? 'Mesh fields blend in a rectangular space. HSL has no rectangular form.' : '');
  if (mesh && s.space === 'hsl') {
    store.set({ space: 'oklab' }, 'space');
    spaceGroup.set('oklab');
  }
  $('#space-reason').textContent = mesh
    ? 'Mesh fields blend in a rectangular space. HSL has no rectangular form.'
    : '';
}

/* --------------------------------------------------------------------------
   Output panel
   -------------------------------------------------------------------------- */

const outputs = createOutputs({
  tablist: $('#out-tabs'),
  codeEl: $('#code-text'),
  metaEl: $('#code-meta'),
  copyBtn: $('#btn-copy'),
  noteEl: $('#out-note'),
  pngSizes: $('#png-sizes'),
  pngBtn: $('#btn-png'),
  pngNote: $('#png-note'),
  pngPanel: $('#png-panel'),
  wipeEl: $('#code-wipe'),
}, { store, notice });

/* --------------------------------------------------------------------------
   Measurement panels
   -------------------------------------------------------------------------- */

const vision = createVisionStrip($('#vision-strip'), {
  store,
  onSelect(kind) {
    store.commit({ vision: kind }, 'vision');
    syncVision();
  },
});

function syncVision() {
  const s = store.get();
  const on = s.vision !== 'normal';
  $('#vision-note').textContent = on
    ? `Stage is simulating ${VISION_LABELS[s.vision].toLowerCase()}. Exports are unaffected.`
    : 'Exports are unaffected by this preview.';
  $('#vision-note').classList.toggle('is-strong', on);
}

const loupe = createLoupe($('#loupe'), $('#loupe-hex'), { renderer, stageCanvas });

const probe = createProbe({
  input: $('#in-probe'),
  sizeGroup: $('#probe-sizes'),
  weightToggle: $('#probe-weight'),
  fgGroup: $('#probe-fg'),
  readout: $('#probe-ratio'),
  verdict: $('#probe-verdict'),
  position: $('#probe-where'),
  empty: $('#probe-empty'),
  sample: $('#probe-sample'),
  marker: $('#probe-marker'),
}, { store, renderer, stageEl, announce });

// Hovering the readout enlarges the worst-point marker on the Stage, so the
// number and the place it came from are visibly the same thing.
$('.gk-readout').addEventListener('pointerenter', () => $('#probe-marker').classList.add('is-large'));
$('.gk-readout').addEventListener('pointerleave', () => $('#probe-marker').classList.remove('is-large'));

const grainSlider = new Slider($('#slider-grain'), {
  defaultValue: 0,
  onChange(v, live) {
    (live ? store.set : store.commit).call(store, (s) => { s.grain = { ...s.grain, amp: v }; return s; }, 'grain', 'grain');
    $('#out-grain').textContent = String(v);
  },
});

$('#grain-sizes').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-gsize]');
  if (!b) return;
  const size = Number(b.dataset.gsize);
  store.commit((s) => { s.grain = { ...s.grain, size }; return s; }, 'grain-size');
  for (const btn of $('#grain-sizes').querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.gsize) === size));
  }
});

$('#toggle-dither').addEventListener('click', () => {
  const next = !store.get().dither;
  store.commit({ dither: next }, 'dither');
  $('#toggle-dither').setAttribute('aria-pressed', String(next));
});

const libraryUi = createLibrary({
  list: $('#lib-list'),
  emptyState: $('#lib-empty'),
  saveBtn: $('#btn-save'),
  blockedNote: $('#lib-blocked'),
  saveReason: $('#save-reason'),
}, {
  decode: (hash) => decodeHash(hash).state,
  cssFromRamp: (r) => rampToCssGradient(r, { angle: 90, k: 16 }),
  onLoad(hash) {
    const next = decodeHash(hash).state;
    store.replace(next, 'library-load');
    syncAll();
  },
  onChanged() { libraryUi.syncSaveButton(encodeHash(store.get())); },
});

$('#btn-save').addEventListener('click', () => {
  const btn = $('#btn-save');
  if (btn.getAttribute('aria-disabled') === 'true') return;
  const s = store.get();
  const hash = encodeHash(s);
  const result = libraryUi.trySave(hash, s.name || 'Untitled gradient');
  if (result === 'ok') {
    notice({ message: 'Saved to this browser only.', kind: 'saved', duration: 3200 });
  } else if (result === 'quota') {
    notice({
      message: "This browser's storage is full. Delete a saved gradient to make room.",
      assertive: true,
    });
  } else if (result === 'blocked') {
    notice({ message: 'This browser is blocking local storage, so saving is off. Share links still work.' });
  }
  libraryUi.syncSaveButton(hash);
});

/* --------------------------------------------------------------------------
   Sections B and C
   -------------------------------------------------------------------------- */

const bands = createBands($('#bands'), { store });

const shelf = createShelf($('#shelf'), {
  onLoad(preset) {
    loadPreset(preset);
  },
});

function loadPreset(preset) {
  const base = defaultState();
  const next = { ...base, ...preset.scene, name: preset.name, presetId: preset.id };
  next.stops = (preset.scene.stops || base.stops).map((s) => ({ ...s }));
  next.mesh = (preset.scene.mesh || base.mesh).map((p) => ({ ...p }));
  next.grain = { ...store.get().grain };
  next.dither = store.get().dither;
  next.vision = store.get().vision;
  next.probe = { ...store.get().probe };
  store.replace(next, 'preset');
  syncAll();
  announce(`${preset.name} loaded. ${preset.demonstrates}`);
  stageEl.classList.remove('is-dissolving');
  void stageEl.offsetWidth;
  stageEl.classList.add('is-dissolving');
}

/* --------------------------------------------------------------------------
   Bar actions
   -------------------------------------------------------------------------- */

const referenceBtn = buttonStates($('#btn-reference'));
$('#btn-reference').addEventListener('click', () => {
  const preset = findPreset(REFERENCE_SET.workbench);
  const base = defaultState();
  const next = {
    ...base,
    ...preset.scene,
    name: preset.name,
    presetId: preset.id,
    stops: preset.scene.stops.map((s) => ({ ...s })),
    grain: { ...REFERENCE_SET.grain },
    dither: REFERENCE_SET.dither,
    probe: { ...base.probe, ...REFERENCE_SET.probe },
  };
  store.replace(next, 'reference-set');
  syncAll();
  referenceBtn.success('Loaded');
  announce('Reference set loaded. Fifteen specimens are on the shelf and the workbench is set to Deep Field.');
  shelf.scrollIntoView();
});

const copyLinkBtn = buttonStates($('#btn-copylink'));
$('#btn-copylink').addEventListener('click', async () => {
  const url = `${window.location.origin}${window.location.pathname}${encodeHash(store.get())}`;
  const res = await copyText(url);
  if (res.ok) {
    copyLinkBtn.success('Copied');
  } else {
    copyLinkBtn.reset();
    notice({
      message: 'The browser blocked clipboard access. The link is in the address bar, copy it from there.',
      assertive: true,
    });
  }
});

armable($('#btn-reset'), {
  armedLabel: 'Press again to reset',
  onFire() {
    store.replace(defaultState(), 'reset');
    sweep.close();
    syncAll();
    announce('Reset to the default gradient.');
  },
});

/* --------------------------------------------------------------------------
   Shortcut sheet. Not a modal: the page stays interactive and scrollable.
   -------------------------------------------------------------------------- */

const SHORTCUTS = [
  ['Space', 'Compare the current space against OKLCH'],
  ['1 2 3', 'Linear, radial, conic'],
  ['Q W E R', 'sRGB, HSL, OKLab, OKLCH without the comparison'],
  ['M', 'Switch between gradient and mesh'],
  ['G', 'Grain on or off'],
  ['D', 'Ordered dither on or off'],
  ['C', 'Cycle the vision simulation'],
  ['T', 'Jump to the contrast probe'],
  ['+ and -', 'Add a stop at the widest gap, delete the focused stop'],
  ['Ctrl or Cmd + C', 'Copy the open output tab'],
  ['Ctrl or Cmd + S', 'Save to this browser'],
  ['Ctrl or Cmd + Z', 'Undo, add Shift to redo'],
  ['? ', 'Open and close this panel'],
  ['Esc', 'Cancel a drag, close a popover, revert a field'],
];

let sheet = null;
function toggleSheet(force) {
  const open = force ?? !sheet;
  if (!open) {
    if (sheet) { sheet.remove(); sheet = null; }
    $('#btn-shortcuts').setAttribute('aria-expanded', 'false');
    $('#btn-shortcuts').focus();
    return;
  }
  if (sheet) return;
  sheet = document.createElement('aside');
  sheet.className = 'gk-sheet';
  sheet.setAttribute('aria-label', 'Keyboard shortcuts');
  sheet.innerHTML = `
    <div class="gk-sheet-head">
      <h2 class="gk-sheet-title" tabindex="-1">Keyboard</h2>
      <button type="button" class="gk-sheet-close">${iconMarkup('x')}<span class="gk-sr">Close the shortcut panel</span></button>
    </div>
    <dl class="gk-sheet-list">
      ${SHORTCUTS.map(([k, d]) => `<div class="gk-sheet-row"><dt>${k.trim()}</dt><dd>${d}</dd></div>`).join('')}
    </dl>`;
  document.body.appendChild(sheet);
  $('#btn-shortcuts').setAttribute('aria-expanded', 'true');
  sheet.querySelector('.gk-sheet-close').addEventListener('click', () => toggleSheet(false));
  sheet.querySelector('.gk-sheet-title').focus();
  // Soft trap: Tab cycles inside, Shift+Tab from the heading returns to page.
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); toggleSheet(false); }
  });
}
$('#btn-shortcuts').addEventListener('click', () => toggleSheet());

/* --------------------------------------------------------------------------
   Stage interaction: crosshair, readout, drop target
   -------------------------------------------------------------------------- */

const crosshair = $('#crosshair');
const stageReadout = $('#stage-readout');

stageEl.addEventListener('pointermove', (e) => {
  if (meshDrag) return;
  const r = stageEl.getBoundingClientRect();
  const nx = clamp((e.clientX - r.left) / r.width, 0, 1);
  const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
  crosshair.hidden = false;
  crosshair.style.left = `${nx * 100}%`;
  crosshair.style.top = `${ny * 100}%`;
  const c = renderer.sampleAt(nx, ny);
  const hex = toHex(c.r, c.g, c.b);
  const lch = hexToOklch(hex);
  stageReadout.hidden = false;
  stageReadout.textContent = `${hex}   ${formatOklch(lch.L, lch.C, lch.H)}`;
  loupe.setPoint(nx, ny);
});

stageEl.addEventListener('pointerleave', () => {
  crosshair.hidden = true;
  stageReadout.hidden = true;
});

stageCanvas.addEventListener('keydown', (e) => {
  const s = store.get();
  if (e.key === '[' || e.key === ']') {
    e.preventDefault();
    if (s.mode === 'mesh') {
      const list = [...meshPointsEl.children];
      if (!list.length) return;
      const at = list.indexOf(document.activeElement);
      const next = e.key === ']' ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
      list[next].focus();
    } else {
      const count = s.stops.length;
      const next = e.key === ']' ? (track.activeIndex + 1) % count : (track.activeIndex - 1 + count) % count;
      track.setActive(next);
      document.querySelector('.gk-track-handles').children[next]?.focus();
    }
  }
});

/* ---- drop an image --------------------------------------------------- */

const dropEl = $('#stage-drop');
const dropText = $('#drop-text');
const dropBar = $('#drop-bar');
let dragDepth = 0;

stageEl.addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  dragDepth += 1;
  dropEl.hidden = false;
  dropText.textContent = 'Drop an image to pull four stops from it.';
  dropBar.style.setProperty('--progress', '0%');
});
stageEl.addEventListener('dragover', (e) => {
  if (!dropEl.hidden) e.preventDefault();
});
stageEl.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropEl.hidden = true;
});
stageEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  const file = e.dataTransfer?.files?.[0];
  const check = validateFile(file);
  if (!check.ok) {
    dropEl.hidden = true;
    notice({ message: check.message, kind: 'image', assertive: true });
    return;
  }
  dropText.textContent = 'Reading image.';
  try {
    const result = await extractStops(file, (p) => dropBar.style.setProperty('--progress', `${Math.round(p * 100)}%`));
    dropEl.hidden = true;
    store.commit((s) => { s.stops = result.stops; s.name = file.name.replace(/\.[^.]+$/, ''); return s; }, 'extract');
    syncAll();
    notice({
      message: `Four stops pulled from ${file.name}. Undo with Ctrl+Z.`,
      kind: 'image',
      duration: 4000,
    });
  } catch (err) {
    dropEl.hidden = true;
    notice({ message: err.message, kind: 'image', assertive: true });
  }
});

/* --------------------------------------------------------------------------
   Mobile panel groups
   -------------------------------------------------------------------------- */

const work = $('#work');
document.querySelectorAll('.gk-mtab').forEach((btn) => {
  btn.addEventListener('click', () => {
    work.dataset.mtab = btn.dataset.mgroup;
    document.querySelectorAll('.gk-mtab').forEach((b) => {
      b.setAttribute('aria-current', String(b === btn));
    });
  });
});

/* --------------------------------------------------------------------------
   Keyboard, global
   -------------------------------------------------------------------------- */

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (track.isDragging && track.abortDrag()) return;
    if (sheet) { toggleSheet(false); return; }
    if (track.hasPopover && track.closePopover()) return;
    if (sweep.isOpen) { sweep.close(); return; }
    return;
  }

  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    const ok = e.shiftKey ? store.redo() : store.undo();
    if (!ok) {
      announce(e.shiftKey ? 'Nothing to redo.' : 'Nothing to undo yet.');
    } else {
      syncAll();
      announce(e.shiftKey ? 'Redone.' : 'Undone.');
    }
    return;
  }
  if (mod && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    $('#btn-save').click();
    return;
  }
  if (mod && (e.key === 'c' || e.key === 'C') && $('#rail-right').contains(document.activeElement)) {
    e.preventDefault();
    $('#btn-copy').click();
    return;
  }

  if (isTyping(document.activeElement) || mod) return;

  const s = store.get();
  switch (e.key) {
    case ' ':
      e.preventDefault();
      $('#btn-compare').click();
      break;
    case '1': case '2': case '3': {
      const type = ['linear', 'radial', 'conic'][Number(e.key) - 1];
      store.commit({ type }, 'type');
      typeGroup.set(type);
      syncGeometry();
      break;
    }
    case 'q': case 'w': case 'e': case 'r': {
      const space = SPACE_ORDER['qwer'.indexOf(e.key)];
      if (!space) break;
      if (s.mode === 'mesh' && space === 'hsl') {
        announce('Mesh fields blend in a rectangular space. HSL has no rectangular form.');
        break;
      }
      store.commit({ space }, 'space');
      spaceGroup.set(space);
      sweep.close();
      syncCompareLabel();
      break;
    }
    case 'm': case 'M': {
      const next = s.mode === 'mesh' ? 'gradient' : 'mesh';
      store.commit({ mode: next }, 'mode');
      modeGroup.set(next);
      syncMode();
      break;
    }
    case 'g': case 'G': {
      const amp = s.grain.amp > 0 ? 0 : (lastGrain || 14);
      if (s.grain.amp > 0) lastGrain = s.grain.amp;
      store.commit((st) => { st.grain = { ...st.grain, amp }; return st; }, 'grain');
      grainSlider.set(amp);
      $('#out-grain').textContent = String(amp);
      break;
    }
    case 'd': case 'D':
      $('#toggle-dither').click();
      break;
    case 'c': case 'C': {
      const order = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];
      const next = order[(order.indexOf(s.vision) + 1) % order.length];
      store.commit({ vision: next }, 'vision');
      syncVision();
      break;
    }
    case 't': case 'T':
      e.preventDefault();
      probe.focus();
      break;
    case '+': case '=':
      e.preventDefault();
      track.insertAtWidestGap();
      break;
    case '-':
      e.preventDefault();
      track.removeActive();
      break;
    case '?':
      e.preventDefault();
      toggleSheet();
      break;
    default:
      break;
  }
});

let lastGrain = 14;

/* --------------------------------------------------------------------------
   Frame schedule
   -------------------------------------------------------------------------- */

let frameQueued = false;
let heavyTimer = 0;
let hashTimer = 0;

function scheduleFast() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    fastPass();
  });
}

function scheduleHeavy() {
  clearTimeout(heavyTimer);
  heavyTimer = setTimeout(() => {
    if (track.isDragging || meshDrag) { scheduleHeavy(); return; }
    heavyPass();
  }, 120);
}

function scheduleHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    // replaceState, not location.hash: editing must not fill the back stack.
    try {
      history.replaceState(null, '', encodeHash(store.get()));
    } catch { /* some embedded contexts refuse history writes */ }
  }, 320);
}

function fastPass() {
  const s = store.get();
  renderer.render(s);
  paintUserTokens();
  track.render();
  renderStopList();
  renderMeshPoints();
  stageCanvas.setAttribute('aria-label', describeScene(s));
  probe.paintSample();
  loupe.draw();
}

function heavyPass() {
  const s = store.get();
  outputs.render();
  bands.update();
  vision.update();
  probe.measure();
  shelf.setActive(s.presetId);
  $('#banding-note').textContent = bandingSentence(s);
  libraryUi.syncSaveButton(encodeHash(s));
  scheduleHash();
}

store.subscribe(() => {
  scheduleFast();
  scheduleHeavy();
});

/* --------------------------------------------------------------------------
   Sync every control from state. Called after any wholesale replacement.
   -------------------------------------------------------------------------- */

function syncAll() {
  const s = store.get();
  sweep.close();
  modeGroup.set(s.mode);
  typeGroup.set(s.type);
  spaceGroup.set(s.space);
  angleField.set(s.angle, { silent: true });
  cxField.set(Math.round(s.center.x * 100), { silent: true });
  cyField.set(Math.round(s.center.y * 100), { silent: true });
  radiusField.set(Math.round(s.radius * 100), { silent: true });
  $('#in-easing').value = s.easing;
  grainSlider.set(s.grain.amp);
  $('#out-grain').textContent = String(s.grain.amp);
  for (const btn of $('#grain-sizes').querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.gsize) === s.grain.size));
  }
  $('#toggle-dither').setAttribute('aria-pressed', String(s.dither));
  probe.sync();
  syncGeometry();
  syncMode();
  syncVision();
  syncCompareLabel();
  renderMeshList();
  stopListEl.innerHTML = '';
  stopFields = [];
  renderStopList();
  scheduleFast();
  heavyPass();
}

/* --------------------------------------------------------------------------
   Sizing
   -------------------------------------------------------------------------- */

function resize() {
  const r = stageEl.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  renderer.setSize(r.width, r.height, window.devicePixelRatio || 1);
  scheduleFast();
  // setSize clears the backing store. Measuring here would read a blank canvas
  // and report a flawless 21.00:1 for any text, so the read is queued behind
  // the frame fastPass paints. A resize triggers no store change, so nothing
  // else would ever come along and correct it.
  requestAnimationFrame(() => probe.measure());
}

if (typeof ResizeObserver === 'function') {
  new ResizeObserver(resize).observe(stageEl);
} else {
  window.addEventListener('resize', resize);
}

/* --------------------------------------------------------------------------
   First paint
   -------------------------------------------------------------------------- */

libraryUi.render();
renderMeshList();
renderStopList();
syncAll();
resize();
// The first paint is synchronous, not scheduled: a tab that loads in the
// background gets no animation frames, and an instrument that shows nothing
// until it is looked at is not an instrument.
fastPass();

if (parsed.warnings.includes('unreadable')) {
  notice({
    message: 'That link could not be read, so the default gradient is loaded.',
    action: {
      label: 'Copy a working link',
      onClick: () => $('#btn-copylink').click(),
    },
  });
} else if (parsed.warnings.includes('newer')) {
  notice({ message: 'Part of that link came from a newer version and was skipped.' });
} else if (parsed.warnings.some((w) => w.startsWith('field:'))) {
  notice({ message: 'Part of that link was malformed, so those settings fell back to their defaults.' });
}

if (!library.storageAvailable()) {
  $('#lib-blocked').hidden = false;
}

// MOTION HOOK: the first-visit hairline pulse on the interpolation-space
// control belongs to the animation layer and reads this flag.
document.documentElement.dataset.firstVisit = String(!library.hasSeen());

// Exposed for the animation layer, which tweens plain numbers rather than DOM.
window.GradientKit = {
  store,
  renderer,
  sweep,
  track,
  announce,
  notice,
  scheduleFast,
  renderNow: fastPass,
  presets: { GRADIENT_PRESETS, MESH_PRESETS },
};
