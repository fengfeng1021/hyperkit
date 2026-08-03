/* ==========================================================================
   chart.js
   The drafting sheet. SVG carries the axes, the three curves, the cursor and
   the annotation; a canvas underneath carries the Monte Carlo fan, because
   1000 polylines are not something the DOM should be asked to hold.

   Nothing in here starts hidden. The empty state is a drawn thing (a drafting
   dimension line), not a missing thing.
   ========================================================================== */

import { fmt } from './format.js';
import { PATHS } from './assumptions.js';

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs, parent) {
  const n = document.createElementNS(NS, name);
  if (attrs) for (const k in attrs) {
    if (attrs[k] === null || attrs[k] === undefined) continue;
    n.setAttribute(k, attrs[k]);
  }
  if (parent) parent.appendChild(n);
  return n;
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Pick a y-axis step so we land on 5,000,000 where we can and stay legible. */
function chooseStep(range, targetLines) {
  const candidates = [1e6, 2.5e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2.5e8, 5e8];
  for (const c of candidates) if (range / c <= targetLines) return c;
  return candidates[candidates.length - 1];
}

export function createChart(root, hooks = {}) {
  const svg = root.querySelector('#plot-svg');
  const canvas = root.querySelector('#fan-canvas');
  const ctx = canvas.getContext ? canvas.getContext('2d') : null;

  const gGrid   = svg.querySelector('#g-grid');
  const gAxis   = svg.querySelector('#g-axis');
  const gShort  = svg.querySelector('#g-shortfall');
  const gWash   = svg.querySelector('#g-wash');
  const gBand   = svg.querySelector('#g-band');
  const gCursor = svg.querySelector('#g-cursor');
  const gCross  = svg.querySelector('#g-cross');
  const gEmpty  = svg.querySelector('#g-empty');
  const gRow    = svg.querySelector('#g-rowmark');

  const series = {
    a: svg.querySelector('#series-a'),
    b: svg.querySelector('#series-b'),
    c: svg.querySelector('#series-c'),
  };
  const descNode = svg.querySelector('#plot-desc');

  /* A two-event emitter, not a framework. The animation layer is the only
     listener; it needs to know where the crossing landed and when a redraw
     replaced the nodes it was holding. */
  const listeners = new Map();
  function emit(name, payload) {
    const fns = listeners.get(name);
    if (!fns) return;
    fns.forEach((fn) => { try { fn(payload); } catch (err) { console.error('[chart]', err); } });
  }

  const state = {
    result: null,
    month: 0,
    highlight: null,
    rowMark: null,
    band: null,
    W: 0, H: 0,
    pad: { l: 64, r: 18, t: 18, b: 30 },
    yMin: 0, yMax: 1, step: 5e6,
    months: 360,
    yearStride: 5,
    canvasDirty: true,
  };

  /* --------------------------------------------------------------- scales */
  const xOf = (m) => {
    const { l, r } = state.pad;
    const w = state.W - l - r;
    return l + (state.months === 0 ? 0 : (m / state.months) * w);
  };
  const yOf = (v) => {
    const { t, b } = state.pad;
    const h = state.H - t - b;
    const span = state.yMax - state.yMin || 1;
    return t + h - ((v - state.yMin) / span) * h;
  };
  const monthAtX = (px) => {
    const { l, r } = state.pad;
    const w = state.W - l - r;
    if (w <= 0) return 0;
    return Math.max(0, Math.min(state.months, Math.round(((px - l) / w) * state.months)));
  };

  /* --------------------------------------------------------------- layout */
  function measure() {
    const rect = root.getBoundingClientRect();
    state.W = Math.max(240, Math.round(rect.width));
    state.H = Math.max(200, Math.round(rect.height));
    state.pad.l = state.W < 420 ? 46 : 64;
    state.yearStride = state.W < 380 ? 10 : 5;
    svg.setAttribute('viewBox', `0 0 ${state.W} ${state.H}`);

    /* Only the backing store is sized in device pixels. The element's layout
       size stays under CSS (width/height 100%), otherwise a stale inline px
       width survives a shrink and drags a horizontal scrollbar onto mobile. */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(state.W * dpr);
    canvas.height = Math.round(state.H * dpr);
    if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); }
  }

  function computeDomain() {
    const r = state.result;
    if (!r) {
      state.yMin = 0; state.yMax = 5e6; state.step = 5e6; state.months = 360;
      return;
    }
    state.months = r.months;
    let min = r.domain.min;
    let max = r.domain.max;
    if (state.band) {
      min = Math.min(min, state.band.domain.min);
      max = Math.max(max, state.band.domain.max);
    }
    const targetLines = state.H < 340 ? 5 : 8;
    const step = chooseStep(Math.max(max - min, 1e6), targetLines);
    state.step = step;
    state.yMin = Math.min(0, Math.floor(min / step) * step);
    state.yMax = Math.ceil(max / step) * step;
    if (state.yMax === state.yMin) state.yMax = state.yMin + step;
  }

  /* ------------------------------------------------------------ structure */
  function drawFrame() {
    clear(gGrid); clear(gAxis);
    const { l, r, t, b } = state.pad;
    const x0 = l, x1 = state.W - r, y0 = t, y1 = state.H - b;

    // horizontal grid lines, one per y step
    for (let v = state.yMin; v <= state.yMax + 1; v += state.step) {
      const y = yOf(v);
      el('line', { x1: x0, y1: y, x2: x1, y2: y, class: 'gridline' }, gGrid);
      el('text', { x: x0 - 8, y: y + 4, class: 'ytick', 'text-anchor': 'end' }, gGrid)
        .textContent = fmt.moneyShort(v);
    }

    // axes: left and bottom, 1px, information-carrying so they take --ink-300
    el('line', { x1: x0, y1: y0, x2: x0, y2: y1, class: 'axis' }, gAxis);
    el('line', { x1: x0, y1: y1, x2: x1, y2: y1, class: 'axis' }, gAxis);

    // x ticks: 4px every year, 10px with a numeral every stride years
    const years = Math.ceil(state.months / 12);
    for (let y = 0; y <= years; y++) {
      const m = Math.min(y * 12, state.months);
      const x = xOf(m);
      const major = y % state.yearStride === 0;
      el('line', { x1: x, y1: y1, x2: x, y2: y1 + (major ? 10 : 4), class: major ? 'xtick xtick--major' : 'xtick' }, gAxis);
      if (major) {
        el('text', { x, y: y1 + 22, class: 'xlabel', 'text-anchor': y === 0 ? 'start' : 'middle' }, gAxis)
          .textContent = String(y);
      }
    }
    el('text', { x: x1, y: y1 + 22, class: 'xlabel xlabel--unit', 'text-anchor': 'end' }, gAxis)
      .textContent = '年';
  }

  /* ---------------------------------------------------------- empty state */
  function drawEmpty() {
    clear(gEmpty);
    if (state.result) return;
    const { l, r } = state.pad;
    const x0 = l + 28, x1 = state.W - r - 28;
    const y = Math.round((state.H - state.pad.b + state.pad.t) / 2);

    const g = el('g', { class: 'dimline', id: 'dimline' }, gEmpty);
    el('line', { x1: x0, y1: y, x2: x1, y2: y, class: 'dimline__bar' }, g);
    // 45-degree drafting arrow heads
    [[x0, 1], [x1, -1]].forEach(([x, dir]) => {
      el('path', { d: `M${x} ${y} l${dir * 9} -5 M${x} ${y} l${dir * 9} 5`, class: 'dimline__arrow' }, g);
      el('line', { x1: x, y1: y - 10, x2: x, y2: y + 10, class: 'dimline__ext' }, g);
    });
    el('text', { x: (x0 + x1) / 2, y: y - 14, class: 'dimline__label', 'text-anchor': 'middle' }, g)
      .textContent = '這張圖還沒有數字';
    el('text', { x: (x0 + x1) / 2, y: y + 28, class: 'dimline__sub', 'text-anchor': 'middle' }, g)
      .textContent = '載入範例情境，或在下方填入你的貸款餘額、利率、剩餘年限。';
  }

  /* -------------------------------------------------------------- series */
  function pathData(arr) {
    const n = state.months;
    let d = '';
    const stride = n > 720 ? 2 : 1;
    for (let t = 0; t <= n; t += stride) {
      d += `${t === 0 ? 'M' : 'L'}${xOf(t).toFixed(2)} ${yOf(arr[t]).toFixed(2)}`;
    }
    if ((n % stride) !== 0) d += `L${xOf(n).toFixed(2)} ${yOf(arr[n]).toFixed(2)}`;
    return d;
  }

  function drawSeries() {
    const r = state.result;
    for (const k of ['a', 'b', 'c']) {
      series[k].setAttribute('d', r ? pathData(r.paths[k].net) : '');
    }
  }

  /* ---------------------------------------------------------- shortfall */
  function drawShortfall() {
    clear(gShort);
    const r = state.result;
    if (!r || !r.shortfallMonths.length) return;
    const y1 = state.H - state.pad.b;
    const seen = new Set();
    // thin the marks out so a 336-month gap reads as a band, not 336 elements
    const stride = Math.max(1, Math.ceil(r.shortfallMonths.length / 80));
    r.shortfallMonths.forEach((m, idx) => {
      if (idx % stride !== 0 && idx !== r.shortfallMonths.length - 1) return;
      const x = Math.round(xOf(m));
      if (seen.has(x)) return;
      seen.add(x);
      el('line', { x1: x, y1, x2: x, y2: y1 - 6, class: 'shortfall__tick' }, gShort);
    });
    el('text', { x: state.pad.l + 8, y: state.pad.t + 14, class: 'shortfall__note' }, gShort)
      .textContent = `第 ${r.shortfallMonths[0]} 到 ${r.shortfallMonths[r.shortfallMonths.length - 1]} 月有現金缺口，圖上以刻度標示`;
  }

  /* --------------------------------------------------------------- band */
  function drawBand() {
    clear(gBand);
    const b = state.band;
    if (!b || !state.result) return;
    const mk = (arr, cls) => {
      let d = '';
      const stride = Math.max(1, Math.round(state.months / 180));
      for (let t = 0; t <= state.months; t += stride) {
        d += `${t === 0 ? 'M' : 'L'}${xOf(t).toFixed(2)} ${yOf(arr[t]).toFixed(2)}`;
      }
      el('path', { d, class: cls, fill: 'none' }, gBand);
    };
    mk(b.p10, 'band band--edge');
    mk(b.p90, 'band band--edge');
    mk(b.p50, 'band band--median');
  }

  function drawFan() {
    if (!ctx) return;
    ctx.clearRect(0, 0, state.W, state.H);
    const b = state.band;
    if (!b || !state.result) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(state.pad.l, state.pad.t, state.W - state.pad.l - state.pad.r,
      state.H - state.pad.t - state.pad.b);
    ctx.clip();
    ctx.strokeStyle = cssVar('--fan-stroke') || 'rgba(46,92,150,.045)';
    ctx.lineWidth = 1;
    const stride = Math.max(1, Math.round(state.months / 120));
    for (let d = 0; d < b.count; d++) {
      const off = d * b.cols;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(b.store[off]));
      for (let t = stride; t <= state.months; t += stride) {
        ctx.lineTo(xOf(t), yOf(b.store[off + t]));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------- cursor */
  function drawCursor() {
    clear(gCursor);
    const r = state.result;
    if (!r) return;
    const m = state.month;
    const x = xOf(m);
    el('line', {
      x1: x, y1: state.pad.t, x2: x, y2: state.H - state.pad.b,
      class: 'cursorline', id: 'cursor-line',
    }, gCursor);
    PATHS.forEach(({ key }) => {
      el('circle', {
        cx: x, cy: yOf(r.paths[key].net[m]), r: 4,
        class: `cursordot cursordot--${key}`, 'data-path': key,
      }, gCursor);
    });
  }

  /* -------------------------------------------------- crossing annotation */
  function drawCross() {
    clear(gCross); clear(gWash);
    const r = state.result;
    if (!r || r.markMonth < 0) { emit('cross', null); return; }

    const m = r.markMonth;
    const cx = xOf(m);
    const cy = yOf(r.paths[r.leader === 'b' ? 'b' : 'a'].net[m]);
    const x1 = state.W - state.pad.r;

    // "from here on, the gap is bigger than the money you are deciding about"
    const wash = el('g', { id: 'cross-wash', 'data-leader': r.leader }, gWash);
    el('rect', {
      x: cx, y: state.pad.t, width: Math.max(0, x1 - cx),
      height: state.H - state.pad.t - state.pad.b, class: 'wash__fill',
    }, wash);
    el('line', { x1: cx, y1: state.pad.t, x2: x1, y2: state.pad.t, class: 'wash__edge' }, wash);

    // x-axis tick for the crossing
    const tick = el('g', { id: 'cross-tick' }, gCross);
    const ay = state.H - state.pad.b;
    el('line', { x1: cx, y1: ay, x2: cx, y2: ay + 10, class: 'cross__tick' }, tick);
    const tickLabel = el('text', { x: cx, y: ay + 22, class: 'cross__ticklabel', 'text-anchor': 'middle' }, tick);
    tickLabel.textContent = fmt.monthShort(m);

    /* The crossing sits wherever the maths puts it, which is often right on
       top of a year numeral. Two labels stacked on one baseline read as a
       single garbled token ("9 年 21月"), so the year numeral yields — the
       crossing is the one the reader came for, and the ruler underneath still
       carries every year. drawFrame() has just rebuilt gAxis, so this only
       ever hides labels belonging to the current frame. */
    try {
      const lb = tickLabel.getBBox();
      gAxis.querySelectorAll('.xlabel').forEach((t) => {
        const b = t.getBBox();
        const clear = b.x > lb.x + lb.width + 6 || b.x + b.width + 6 < lb.x;
        if (!clear) t.setAttribute('visibility', 'hidden');
      });
    } catch (err) { /* not laid out yet; the next render catches it */ }

    const g = el('g', { id: 'cross-group', transform: `translate(${cx} ${cy})` }, gCross);
    const leaderLen = Math.min(64, Math.max(28, cy - state.pad.t - 34));
    el('line', { x1: 0, y1: 0, x2: 0, y2: -leaderLen, class: 'cross__leader', id: 'cross-leader' }, g);
    el('circle', { cx: 0, cy: 0, r: 6, class: 'cross__ring', id: 'cross-ring' }, g);
    el('circle', { cx: 0, cy: 0, r: 4, class: 'cross__dot', id: 'cross-dot' }, g);

    const who = r.leader === 'b' ? '投資' : '提前還款';
    let label;
    if (r.markKind === 'cross') {
      label = `${fmt.monthLabel(m)}，${who}開始領先`;
    } else if (m === 0) {
      label = `${who}一路領先，差距一開始就大於 ${fmt.moneyShort(r.threshold)}`;
    } else {
      label = `${fmt.monthLabel(m)}，${who}的差距超過 ${fmt.moneyShort(r.threshold)}`;
    }

    const pill = el('g', { id: 'cross-pill', class: 'pill', transform: `translate(0 ${-leaderLen})` }, g);
    const rect = el('rect', { class: 'pill__box', x: 0, y: 0, rx: 4, ry: 4 }, pill);
    const text = el('text', { class: 'pill__text', id: 'cross-pill-text', x: 0, y: 0 }, pill);
    [...label].forEach((ch) => {
      const s = el('tspan', { class: 'cross-char' }, text);
      s.textContent = ch;
    });

    // measure, then place. Flip left when the pill would run off the sheet.
    let tw = 120;
    try { tw = Math.ceil(text.getBBox().width); } catch (err) { /* not laid out yet */ }
    const padX = 10, padY = 6, th = 18;
    const boxW = tw + padX * 2;
    const boxH = th + padY * 2;
    const flip = cx + boxW / 2 > x1;
    const bx = flip ? -boxW + 12 : Math.max(-boxW / 2, state.pad.l - cx);
    rect.setAttribute('x', bx);
    rect.setAttribute('y', -boxH - 8);
    rect.setAttribute('width', boxW);
    rect.setAttribute('height', boxH);
    text.setAttribute('x', bx + padX);
    text.setAttribute('y', -boxH - 8 + padY + 13);
    el('polygon', {
      class: 'pill__tail',
      points: `-5,-8 5,-8 0,-2`,
    }, pill);

    emit('cross', {
      month: m,
      cx, cy,
      leaderLen,
      leader: r.leader,
      kind: r.markKind,
      plotTop: state.pad.t,
      plotRight: x1,
      axisY: ay,
    });
  }

  /* --------------------------------------------------- amortisation hover */
  function drawRowMark() {
    clear(gRow);
    if (state.rowMark === null || !state.result) return;
    const x = xOf(Math.min(state.rowMark, state.months));
    el('line', {
      x1: x, y1: state.pad.t, x2: x, y2: state.H - state.pad.b, class: 'rowmark',
    }, gRow);
  }

  /* ----------------------------------------------------- accessible text */
  function updateDesc() {
    const r = state.result;
    if (!r) {
      descNode.textContent = '圖表尚未載入資料。座標軸已備妥，x 軸為 0 到 30 年。';
      return;
    }
    const N = r.months;
    const end = (k) => fmt.moneyNT(r.paths[k].net[N]);
    const who = r.leader === 'b' ? '投資' : '提前還款';
    const cross = r.markMonth < 0
      ? `在 ${Math.round(N / 12)} 年內，三條路徑的差距都小於你的期初可動用現金。`
      : r.markKind === 'cross'
        ? `${fmt.monthLabel(r.markMonth)}${who}開始領先。`
        : `${fmt.monthLabel(r.markMonth)}起，${who}的領先幅度超過 ${fmt.moneyShort(r.threshold)}。`;
    descNode.textContent =
      `三條淨資產曲線。第 ${Math.round(N / 12)} 年時，全額提前還款 ${end('a')}，` +
      `只繳月付投資差額 ${end('b')}，寬限期加投資 ${end('c')}。${cross}`;
  }

  /* -------------------------------------------------------------- public */
  function renderAll() {
    computeDomain();
    drawFrame();
    drawEmpty();
    drawSeries();
    drawShortfall();
    drawBand();
    drawFan();
    drawCross();
    drawCursor();
    drawRowMark();
    updateDesc();
    emit('render', { hasResult: !!state.result, hasBand: !!state.band });
  }

  function renderLight() {
    drawSeries();
    drawCursor();
  }

  const api = {
    get months() { return state.months; },
    get result() { return state.result; },
    get pad() { return { ...state.pad }; },
    get size() { return { W: state.W, H: state.H }; },
    monthAtX,
    xOf, yOf,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return () => {
        const fns = listeners.get(name) || [];
        const i = fns.indexOf(fn);
        if (i >= 0) fns.splice(i, 1);
      };
    },
    setResult(result) {
      /* The empty-state dimension line is about to be cleared. Hand it over
         while it is still in the tree so it can be shown leaving. */
      if (!state.result && result) emit('empty-out', { node: svg.querySelector('#dimline') });
      state.result = result;
      state.band = result ? result.band : null;
      if (result && state.month > result.months) state.month = result.months;
      renderAll();
    },
    setBand(band) {
      state.band = band;
      if (state.result) state.result.band = band;
      renderAll();
    },
    setMonth(m) {
      state.month = Math.max(0, Math.min(state.months, Math.round(m)));
      drawCursor();
      return state.month;
    },
    get month() { return state.month; },
    setRowMark(m) { state.rowMark = m; drawRowMark(); },
    setHighlight(key) {
      state.highlight = key;
      svg.setAttribute('data-highlight', key || '');
    },
    /** Redraw only the curves. Used while a slider is being dragged. */
    repriceOnly() { computeDomain(); drawFrame(); drawSeries(); drawCursor(); drawCross(); },
    resize() { measure(); renderAll(); hooks.onResize?.(api); },
    renderLight,
  };

  measure();
  renderAll();
  hooks.onResize?.(api);

  if ('ResizeObserver' in window) {
    let timer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => api.resize(), 60);
    });
    ro.observe(root);
  } else {
    window.addEventListener('resize', () => api.resize());
  }

  return api;
}
