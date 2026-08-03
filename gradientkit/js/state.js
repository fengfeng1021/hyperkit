/* ==========================================================================
   GradientKit - state.js
   One store, one hash schema, one undo ring. Everything the product can be in
   is described by the object this module owns, which is also exactly what the
   URL hash encodes, which is also exactly what the saved library stores.

   Parsing is total. Every field is validated on its own and an invalid field
   falls back to its default rather than aborting the parse. There is no code
   path where reading a hash throws.
   ========================================================================== */

import { clamp, parseHex } from './color.js';
import { GRADIENT_PRESETS, DEFAULT_PRESET_ID } from './presets.js';

export const SCHEMA = 'gk1';
export const MAX_STOPS = 16;
export const MAX_POINTS = 12;
export const UNDO_DEPTH = 50;

const TYPE_CODE = { linear: 'l', radial: 'r', conic: 'c' };
const CODE_TYPE = { l: 'linear', r: 'radial', c: 'conic' };
const EASE_CODE = { linear: 'l', in: 'i', out: 'o', inout: 'io' };
const CODE_EASE = { l: 'linear', i: 'in', o: 'out', io: 'inout' };
const SPACES = ['srgb', 'hsl', 'oklab', 'oklch'];

export function defaultState() {
  const preset = GRADIENT_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
  return {
    name: preset.name,
    presetId: preset.id,
    mode: 'gradient',
    type: preset.scene.type,
    angle: preset.scene.angle,
    space: preset.scene.space,
    easing: preset.scene.easing,
    center: { x: 0.5, y: 0.5 },
    radius: 0.75,
    falloff: 2.4,
    stops: preset.scene.stops.map((s) => ({ ...s })),
    mesh: [
      { hex: '#FF6A3D', x: 0.18, y: 0.22, r: 0.55 },
      { hex: '#FFC46B', x: 0.82, y: 0.16, r: 0.5 },
      { hex: '#1E3A8A', x: 0.16, y: 0.84, r: 0.6 },
      { hex: '#6D28D9', x: 0.86, y: 0.8, r: 0.52 },
    ],
    grain: { amp: 0, size: 2 },
    dither: true,
    vision: 'normal',
    // The probe ships with a specimen already mounted. A contrast readout that
    // reads --.-- until you type is the one measurement in here nobody would
    // ever discover, and the empty state is indistinguishable from a bug.
    probe: { text: 'Shipping this on Friday', size: 32, weight: 600, fg: '#FFFFFF', x: 0.5, y: 0.28 },
  };
}

/* --------------------------------------------------------------------------
   Validation helpers. Each one takes a raw value and a fallback.
   -------------------------------------------------------------------------- */

const num = (v, fb, lo, hi) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fb;
};

const oneOf = (v, list, fb) => (list.includes(v) ? v : fb);

function parseStops(raw) {
  if (!raw) return null;
  const out = [];
  for (const chunk of raw.split(',')) {
    const [hexPart, posPart] = chunk.split('@');
    const rgb = parseHex(hexPart);
    if (!rgb) continue;
    const pos = num(posPart, out.length === 0 ? 0 : 100, 0, 100);
    out.push({ hex: `#${hexPart.replace('#', '').toUpperCase()}`, pos: +pos.toFixed(2) });
    if (out.length >= MAX_STOPS) break;
  }
  return out.length >= 2 ? out : null;
}

function parseMesh(raw) {
  if (!raw) return null;
  const out = [];
  for (const chunk of raw.split(',')) {
    const [hexPart, rest] = chunk.split('@');
    const rgb = parseHex(hexPart);
    if (!rgb || !rest) continue;
    const [x, y, r] = rest.split('_');
    out.push({
      hex: `#${hexPart.replace('#', '').toUpperCase()}`,
      x: num(x, 50, 0, 100) / 100,
      y: num(y, 50, 0, 100) / 100,
      r: num(r, 50, 5, 200) / 100,
    });
    if (out.length >= MAX_POINTS) break;
  }
  return out.length >= 3 ? out : null;
}

/* --------------------------------------------------------------------------
   Hash: read
   Returns { state, warnings }. Never throws, never returns null.
   -------------------------------------------------------------------------- */

export function decodeHash(hash) {
  const state = defaultState();
  const warnings = [];
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return { state, warnings, empty: true };

  const parts = raw.split('&');
  const version = parts.shift();
  if (version !== SCHEMA) {
    if (/^gk\d+$/.test(version)) {
      warnings.push('newer');
    } else {
      warnings.push('unreadable');
      return { state, warnings };
    }
  }

  const kv = new Map();
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) kv.set(p.slice(0, eq), decodeURIComponent(p.slice(eq + 1)));
  }
  if (kv.size === 0) {
    warnings.push('unreadable');
    return { state, warnings };
  }

  let anyKnown = false;
  const take = (key, fn) => {
    if (!kv.has(key)) return;
    anyKnown = true;
    try { fn(kv.get(key)); } catch { warnings.push(`field:${key}`); }
  };

  take('k', (v) => { state.mode = v === 'm' ? 'mesh' : 'gradient'; });
  take('t', (v) => { state.type = CODE_TYPE[v] || 'linear'; });
  take('a', (v) => { state.angle = num(v, 200, 0, 360); });
  take('i', (v) => { state.space = oneOf(v, SPACES, 'oklch'); });
  take('e', (v) => { state.easing = CODE_EASE[v] || 'linear'; });
  take('s', (v) => { const s = parseStops(v); if (s) state.stops = s; else warnings.push('field:s'); });
  take('m', (v) => { const m = parseMesh(v); if (m) state.mesh = m; else warnings.push('field:m'); });
  take('c', (v) => {
    const [x, y, r] = v.split('_');
    state.center = { x: num(x, 50, 0, 100) / 100, y: num(y, 50, 0, 100) / 100 };
    state.radius = num(r, 75, 5, 300) / 100;
  });
  take('g', (v) => {
    const [amp, size] = v.split('_');
    state.grain = { amp: Math.round(num(amp, 0, 0, 100)), size: Math.round(num(size, 2, 1, 8)) };
  });
  take('d', (v) => { state.dither = v !== '0'; });
  take('n', (v) => { state.name = v.slice(0, 48); });

  if (!anyKnown) warnings.push('unreadable');
  state.presetId = null;
  return { state, warnings };
}

/* --------------------------------------------------------------------------
   Hash: write
   Readable, hand-editable, short enough to survive a Slack paste.
   -------------------------------------------------------------------------- */

export function encodeHash(s) {
  const out = [SCHEMA];
  out.push(`k=${s.mode === 'mesh' ? 'm' : 'g'}`);
  if (s.mode === 'mesh') {
    out.push(`m=${s.mesh.map((p) => `${p.hex.replace('#', '')}@${Math.round(p.x * 100)}_${Math.round(p.y * 100)}_${Math.round(p.r * 100)}`).join(',')}`);
  } else {
    out.push(`t=${TYPE_CODE[s.type] || 'l'}`);
    if (s.type !== 'radial') out.push(`a=${Math.round(s.angle)}`);
    if (s.type === 'radial') {
      out.push(`c=${Math.round(s.center.x * 100)}_${Math.round(s.center.y * 100)}_${Math.round(s.radius * 100)}`);
    }
    out.push(`i=${s.space}`);
    out.push(`s=${s.stops.slice().sort((a, b) => a.pos - b.pos).map((st) => `${st.hex.replace('#', '')}@${trimNum(st.pos)}`).join(',')}`);
    if (s.easing !== 'linear') out.push(`e=${EASE_CODE[s.easing]}`);
  }
  if (s.grain.amp > 0) out.push(`g=${s.grain.amp}_${s.grain.size}`);
  out.push(`d=${s.dither ? 1 : 0}`);
  if (s.name) out.push(`n=${encodeURIComponent(s.name)}`);
  return `#${out.join('&')}`;
}

const trimNum = (n) => {
  const v = +Number(n).toFixed(2);
  return String(v);
};

/* --------------------------------------------------------------------------
   Store
   -------------------------------------------------------------------------- */

export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  const past = [];
  const future = [];
  let lastCommitKey = '';
  let lastCommitTime = 0;

  const snapshot = () => JSON.parse(JSON.stringify(state));

  function emit(reason) {
    for (const fn of listeners) fn(state, reason);
  }

  return {
    get() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** Change without touching history. Use during a drag. */
    set(patch, reason = 'live') {
      state = typeof patch === 'function' ? patch(snapshot()) : { ...state, ...patch };
      emit(reason);
    },

    /**
     * Change and push one history entry.
     * `key` coalesces consecutive edits to the same control within 600ms into
     * a single undo step, so scrubbing a field does not fill the ring.
     */
    commit(patch, reason = 'commit', key = '') {
      const now = Date.now();
      const coalesce = key && key === lastCommitKey && now - lastCommitTime < 600;
      if (!coalesce) {
        past.push(snapshot());
        if (past.length > UNDO_DEPTH) past.shift();
        future.length = 0;
      }
      lastCommitKey = key;
      lastCommitTime = now;
      state = typeof patch === 'function' ? patch(snapshot()) : { ...state, ...patch };
      emit(reason);
    },

    /** Push the current state as a history entry without changing it. Used at
     *  pointerdown so a whole drag gesture becomes one undo step. */
    mark() {
      past.push(snapshot());
      if (past.length > UNDO_DEPTH) past.shift();
      future.length = 0;
      lastCommitKey = '';
    },

    undo() {
      if (!past.length) return false;
      future.push(snapshot());
      state = past.pop();
      lastCommitKey = '';
      emit('undo');
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(snapshot());
      state = future.pop();
      lastCommitKey = '';
      emit('redo');
      return true;
    },
    canUndo() { return past.length > 0; },
    canRedo() { return future.length > 0; },
    replace(next, reason = 'replace') {
      past.push(snapshot());
      if (past.length > UNDO_DEPTH) past.shift();
      future.length = 0;
      state = next;
      lastCommitKey = '';
      emit(reason);
    },
  };
}
