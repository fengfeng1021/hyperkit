/* ==========================================================================
   main.js
   Wiring. Everything that turns numbers into a page and a page back into
   numbers. No calculation lives here; it all comes from finance.js.
   ========================================================================== */

import {
  DEFAULTS, BOUNDS, TW, PATHS, LEDGER_ROWS,
} from './assumptions.js';
import { SAMPLE_SCENARIOS } from './samples.js';
import { fmt, parseNumber, clamp } from './format.js';
import { simulate } from './finance.js';
import { runMonteCarlo } from './montecarlo.js';
import { decode, encode, isShareHash, normalize, shareURL, readStore, writeStore, clearStore } from './serialize.js';
import { createChart } from './chart.js';
import { initDrawers } from './drawers.js';
import { buildVerdict, paintVerdict } from './verdict.js';
import { createSheet } from './sheet.js';
import { createScenarios } from './scenarios.js';
import { toast, dismissTop, hasActionToast } from './toast.js';
import { motion } from './motion.js';

/* ------------------------------------------------------------------ state */

let params = { ...DEFAULTS };
let result = null;
let hasData = false;      // has the chart been given anything to draw
let isSample = false;
let scrubMonth = 0;
let highlight = null;
let mcToken = 0;
let dragging = false;

/* Filled in by whoever owns the scrubber gesture. When GSAP's Draggable is
   present the motion layer owns it; otherwise the native handlers below do. */
let cancelDrag = null;
/* The motion layer subscribes here so it can react to the cursor passing the
   annotated month. Nothing else reads it. */
let monthHook = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const getCtx = () => ({ p: params, r: result, month: scrubMonth });

/* ------------------------------------------------------------ field specs */

const FIELDS = {
  balance: {
    input: '#f-balance', bound: () => BOUNDS.balance,
    get: () => params.balance, set: (v) => { params.balance = v; },
    display: (v) => fmt.groupInput(v), digits: 0, step: 10000,
  },
  ratePct: {
    input: '#f-rate', bound: () => BOUNDS.ratePct,
    get: () => params.ratePct, set: (v) => { params.ratePct = v; },
    /* Three decimals so 新青安 1.775% is shown as it is computed, not rounded
       to 1.77% while the maths uses the third digit. */
    display: (v) => String(Number(v.toFixed(3))), digits: 3, step: 0.01,
  },
  termYears: {
    input: '#f-term', bound: () => BOUNDS.termYears,
    get: () => params.termMonths / 12, set: (v) => { params.termMonths = Math.round(v * 12); },
    display: (v) => String(Math.round(v)), digits: 0, step: 1,
  },
  graceYears: {
    input: '#f-grace',
    bound: () => ({ ...BOUNDS.graceYears, max: Math.max(0, Math.round(params.termMonths / 12) - 1) }),
    get: () => params.graceMonths / 12, set: (v) => { params.graceMonths = Math.round(v * 12); },
    display: (v) => String(Math.round(v)), digits: 0, step: 1,
  },
  lump: {
    input: '#f-lump',
    bound: () => ({ ...BOUNDS.lump, max: params.balance }),
    get: () => params.lump, set: (v) => { params.lump = v; },
    display: (v) => fmt.groupInput(v), digits: 0, step: 10000,
  },
  monthly: {
    input: '#f-monthly', bound: () => BOUNDS.monthly,
    get: () => params.monthly, set: (v) => { params.monthly = v; },
    display: (v) => fmt.groupInput(v), digits: 0, step: 1000,
  },
  homeValue: {
    input: '#f-home', bound: () => BOUNDS.homeValue,
    get: () => params.homeValue, set: (v) => { params.homeValue = v; },
    display: (v) => fmt.groupInput(v), digits: 0, step: 100000,
  },
  seed: {
    input: '#f-seed', bound: () => BOUNDS.seed,
    get: () => params.seed, set: (v) => { params.seed = Math.round(v); },
    display: (v) => String(Math.round(v)), digits: 0, step: 1, noGroup: true,
  },
  paths: {
    input: '#f-paths', bound: () => BOUNDS.paths,
    get: () => params.paths, set: (v) => { params.paths = Math.round(v); },
    display: (v) => String(Math.round(v)), digits: 0, step: 100, noGroup: true,
  },
};

const SLIDERS = {
  prepayShare: {
    input: '#s-prepayshare', out: '#o-prepayshare',
    get: () => params.prepayShare, set: (v) => { params.prepayShare = v; },
    display: (v) => `${Math.round(v)}%`, minor: 10, major: 50,
  },
  investPct: {
    input: '#s-invest', out: '#o-invest',
    get: () => params.investPct, set: (v) => { params.investPct = v; },
    display: (v) => `${v.toFixed(2)}%`, minor: 1, major: 5,
  },
  volPct: {
    input: '#s-vol', out: '#o-vol',
    get: () => params.volPct, set: (v) => { params.volPct = v; },
    display: (v) => `${v.toFixed(1)}%`, minor: 5, major: 20,
  },
  homeGrowthPct: {
    input: '#s-home', out: '#o-home',
    get: () => params.homeGrowthPct, set: (v) => { params.homeGrowthPct = v; },
    display: (v) => `${v.toFixed(1)}%`, minor: 1, major: 5,
  },
  taxPct: {
    input: '#s-tax', out: '#o-tax',
    get: () => params.taxPct, set: (v) => { params.taxPct = v; },
    display: (v) => `${Math.round(v)}%`, minor: 5, major: 10,
  },
};

/* ------------------------------------------------------------------ setup
   The boot sequence lives at the very bottom of this file so that every
   module-level binding it touches is already initialised. */

let chart;
let drawers;
let sheet;
let scenarios;

/* -------------------------------------------------------------- bootstrap */

function bootstrap() {
  /* Only a real share hash restores state. #top / #bench / #params are
     in-page anchors and must not be read as a broken share link. */
  if (isShareHash(location.hash)) {
    const parsed = decode(location.hash);
    params = parsed.params;
    hasData = true;
    isSample = false;
    if (!parsed.ok) {
      console.warn('[房貸沙盤] 分享連結有欄位讀不出來，已用預設值補齊。原始 hash:', parsed.raw);
      const box = document.createElement('code');
      box.className = 'toast__raw';
      box.textContent = `#${parsed.raw}`;
      toast({
        message: '分享連結有一段讀不出來，已經用預設值把缺的補齊了。你可以直接改成你的數字。',
        tone: 'error',
        actions: [{ label: '看看原始連結', onClick: (b) => b.appendChild(box), close: false }],
      });
    }
  } else {
    params = { ...DEFAULTS };
    const last = readStore('last', null);
    if (last && typeof last === 'string') {
      toast({
        message: '要接續你上次調的那組參數嗎？',
        actions: [
          { label: '接續上次', onClick: () => loadScenario(last, null, 'own') },
          { label: '不用', onClick: () => {} },
        ],
      });
    }
  }
  syncControls();
  recompute();
  if (!readStore('seen', false)) writeStore('seen', true);
}

/* -------------------------------------------------------------- rendering */

function recompute(opts = {}) {
  params = normalize(params);
  syncControls();
  writeHashDebounced();

  if (!hasData) {
    result = null;
    chart.setResult(null);
    paintEmpty();
    drawers.refresh(getCtx());
    refreshLedger();
    sheet.setResult(null, false);
    return;
  }

  result = simulate(params);
  if (scrubMonth > result.months) scrubMonth = result.months;

  chart.setResult(result);
  chart.setMonth(scrubMonth);
  paintReadout();
  paintLegend();
  paintVerdictRow();
  paintFlag();
  paintSrTable();
  refreshLedger();
  drawers.refresh(getCtx());
  sheet.setResult(result, isSample);
  enableScrubber(true);

  if (params.mode === 1 && !opts.skipMonteCarlo) startMonteCarlo();
  else hideProgress();
}

function paintEmpty() {
  ['a', 'b', 'c'].forEach((k) => {
    $(`[data-role="read-${k}"]`).textContent = '-';
    $(`[data-role="delta-${k}"]`).textContent = k === 'a' ? '基準' : '-';
    $(`[data-role="legend-${k}"]`).textContent = '尚無數值';
  });
  $('#legend').dataset.empty = 'true';
  paintVerdict($('#verdict-line'), buildVerdict(null));
  paintFlag();
  enableScrubber(false);
  $('#sr-data').querySelector('tbody').textContent = '';
}

function paintReadout() {
  if (!result) return;
  const m = scrubMonth;
  const base = result.paths.a.net[m];
  PATHS.forEach(({ key }) => {
    const v = result.paths[key].net[m];
    motion.count($(`[data-role="read-${key}"]`), v, fmt.money);
    const d = $(`[data-role="delta-${key}"]`);
    if (key === 'a') {
      d.textContent = '基準';
      d.dataset.lead = 'base';
    } else {
      const diff = v - base;
      d.textContent = diff >= 0 ? `領先 ${fmt.money(diff)}` : `- ${fmt.money(-diff)}`;
      d.dataset.lead = diff >= 0 ? 'yes' : 'no';
    }
  });
  const node = $('#scrubber');
  node.setAttribute('aria-valuenow', String(m));
  node.setAttribute('aria-valuetext',
    `${fmt.monthLabel(m)}，提前還款 ${fmt.money(base)} 元，投資 ${fmt.money(result.paths.b.net[m])} 元`);
}

function paintLegend() {
  if (!result) return;
  const N = result.months;
  PATHS.forEach(({ key }) => {
    $(`[data-role="legend-${key}"]`).textContent = fmt.money(result.paths[key].net[N]);
  });
  $('#legend').dataset.empty = 'false';
}

function paintVerdictRow() {
  const v = buildVerdict(result);
  const node = $('#verdict-line');
  paintVerdict(node, v);
  const existing = $('#verdict-fix');
  if (existing) existing.remove();
  if (v.action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'verdict-fix';
    b.className = 'btn btn--quiet';
    b.textContent = v.action.label;
    b.addEventListener('click', () => {
      params.monthly = v.action.value;
      hasData = true; isSample = false;
      recompute();
      $('#f-monthly').focus();
    });
    node.after(b);
  }
}

function paintFlag() {
  const flag = $('#scenario-flag');
  const next = $('#titleblock-next');
  const nextText = $('#nextcue-text');
  if (!hasData) {
    flag.dataset.state = 'none';
    flag.textContent = '尚未載入';
    if (next) next.hidden = true;
    return;
  }
  flag.dataset.state = isSample ? 'sample' : 'own';
  flag.textContent = isSample ? '範例情境' : '你的情境';
  /* The hero stays put once the curves are drawn, so the title block has to
     admit that the numbers behind them live further down the page. */
  if (next) next.hidden = false;
  if (nextText) {
    nextText.textContent = isSample
      ? '往下把範例數字換成你的貸款餘額、利率、年期'
      : '往下調整假設：報酬率、寬限期、稅率都會即時重算';
  }
}

function paintSrTable() {
  const tbody = $('#sr-data').querySelector('tbody');
  tbody.textContent = '';
  if (!result) return;
  const N = result.months;
  for (let y = 0; y * 12 <= N; y += 5) {
    const m = Math.min(y * 12, N);
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = String(y);
    tr.appendChild(th);
    ['a', 'b', 'c'].forEach((k) => {
      const td = document.createElement('td');
      td.textContent = fmt.moneyNT(result.paths[k].net[m]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

function announce(text) {
  const node = $('#live-cross');
  node.textContent = '';
  requestAnimationFrame(() => { node.textContent = text; });
}

/* ------------------------------------------------------------ monte carlo */

function startMonteCarlo() {
  if (!result) return;
  const token = ++mcToken;
  const canvasOK = !!document.createElement('canvas').getContext?.('2d');
  if (!canvasOK) {
    toast({ message: '這個瀏覽器不支援畫布，只能用固定報酬模式。', tone: 'error' });
    setMode(0);
    return;
  }
  showProgress(0, params.paths);
  $('#seg-mode').setAttribute('aria-busy', 'true');

  runMonteCarlo(result, {
    seed: params.seed, paths: params.paths,
    investPct: params.investPct, volPct: params.volPct,
  }, (done, total) => {
    if (token !== mcToken) return;
    showProgress(done, total);
  }).then((band) => {
    if (token !== mcToken) return;
    hideProgress();
    $('#seg-mode').removeAttribute('aria-busy');
    chart.setBand(band);
    drawers.refresh(getCtx());
    refreshLedger();
    if (band.downgraded) {
      toast({
        message: `這台裝置跑 ${band.requested} 條路徑會卡，已改成 ${band.count} 條。想跑滿的話在下方把路徑數調回去。`,
        tone: 'error',
      });
    }
    announce(`蒙地卡羅完成，${band.count} 條路徑中有 ${Math.round(band.winRate * 100)}% 的情況投資在期末勝出。`);
  });
}

function showProgress(done, total) {
  const el = $('#plot-progress');
  el.hidden = false;
  el.textContent = `模擬 ${total} 條路徑，已完成 ${done}`;
}
function hideProgress() {
  $('#plot-progress').hidden = true;
  $('#seg-mode').removeAttribute('aria-busy');
}

/* ---------------------------------------------------------------- ledger */

function buildLedger() {
  const host = $('#ledger-body');
  LEDGER_ROWS.forEach((row, idx) => {
    const r = document.createElement('div');
    r.className = 'ledger__row';
    r.setAttribute('role', 'row');
    if ((idx + 1) % 5 === 0) r.classList.add('is-rule');

    const name = document.createElement('span');
    name.setAttribute('role', 'cell');
    name.className = 'ledger__name';
    name.textContent = row.name;

    const val = document.createElement('span');
    val.setAttribute('role', 'cell');
    val.className = 'ledger__val';
    val.dataset.ledger = String(idx);
    val.textContent = '-';

    const src = document.createElement('span');
    src.setAttribute('role', 'cell');
    src.className = 'ledger__src';
    src.textContent = row.src;

    const cell = document.createElement('span');
    cell.setAttribute('role', 'cell');
    cell.className = 'ledger__ask';
    const d = document.createElement('details');
    d.className = 'drawer';
    d.dataset.drawer = row.drawer;
    d.innerHTML =
      '<summary class="drawer__trigger" aria-label="這個數字怎麼來的">' +
      '<svg class="icon" aria-hidden="true"><use href="#i-help"></use></svg></summary>' +
      '<div class="drawer__panel"></div>';
    cell.appendChild(d);

    r.append(name, val, src, cell);
    host.appendChild(r);
  });
}

function refreshLedger() {
  const ctx = { ...getCtx(), fmt };
  LEDGER_ROWS.forEach((row, idx) => {
    const node = $(`[data-ledger="${idx}"]`);
    if (!node) return;
    let out = '-';
    try { out = row.value(ctx); } catch (err) { out = '-'; }
    node.textContent = out;
  });
}

/* ------------------------------------------------------------- numfields */

function fieldNode(key) { return $(FIELDS[key].input); }
function fieldWrap(key) { return fieldNode(key).closest('.numfield'); }

function setHelper(key, text, tone) {
  const wrap = fieldWrap(key);
  const helper = wrap.querySelector('.numfield__helper');
  if (!helper.dataset.base) helper.dataset.base = helper.textContent;
  helper.textContent = text ?? helper.dataset.base;
  wrap.dataset.tone = tone || '';
  fieldNode(key).setAttribute('aria-invalid', tone === 'error' ? 'true' : 'false');
}

function flashClamped(key, note) {
  const wrap = fieldWrap(key);
  wrap.classList.add('is-clamped');
  setHelper(key, note, 'clamped');
  clearTimeout(wrap._clampTimer);
  wrap._clampTimer = setTimeout(() => {
    wrap.classList.remove('is-clamped');
    setHelper(key, null, '');
  }, 3000);
}

function commitField(key, { silent = false } = {}) {
  const spec = FIELDS[key];
  const node = fieldNode(key);
  const parsed = parseNumber(node.value);

  if (parsed === null) {
    if (node.value.trim() === '') {
      spec.set(spec.get());
      node.value = spec.display(spec.get());
      setHelper(key, null, '');
      return;
    }
    setHelper(key, '看不懂這個數字。可以打 1050 萬、1,050萬 或 10500000。', 'error');
    return;
  }

  const bound = spec.bound();
  const res = clamp(parsed, bound);
  spec.set(res.value);
  params = normalize(params);
  node.value = spec.display(spec.get());

  if (res.clamped && !silent) flashClamped(key, bound.note || `已調整為 ${spec.display(res.value)}。`);
  else setHelper(key, null, '');

  markChanged(key);
}

function markChanged(key) {
  const wrap = fieldWrap(key);
  const mark = wrap.querySelector('.numfield__mark');
  if (!mark) return;
  const spec = FIELDS[key];
  const defaults = { ...DEFAULTS };
  let def;
  if (key === 'termYears') def = defaults.termMonths / 12;
  else if (key === 'graceYears') def = defaults.graceMonths / 12;
  else def = defaults[key];
  mark.hidden = Math.abs(spec.get() - def) < 1e-9;
}

let inputTimer = 0;
function bindFields() {
  Object.keys(FIELDS).forEach((key) => {
    const spec = FIELDS[key];
    const node = fieldNode(key);

    node.addEventListener('input', () => {
      const parsed = parseNumber(node.value);
      if (parsed === null) return;
      const bound = spec.bound();
      spec.set(Math.max(bound.min, Math.min(bound.max, parsed)));
      touch();
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => recompute(), 160);
    });

    node.addEventListener('change', () => { commitField(key); touch(); recompute(); });
    node.addEventListener('blur', () => { commitField(key); });

    node.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        const step = spec.step * (e.shiftKey ? 10 : 1);
        const cur = parseNumber(node.value) ?? spec.get();
        const bound = spec.bound();
        const next = clamp(Number((cur + dir * step).toFixed(6)), bound);
        spec.set(next.value);
        params = normalize(params);
        node.value = spec.display(spec.get());
        markChanged(key);
        touch();
        recompute();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        node.value = spec.display(spec.get());
        setHelper(key, null, '');
        node.blur();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commitField(key);
        touch();
        recompute();
      }
    });
  });
}

/* --------------------------------------------------------------- sliders */

function buildSliderScales() {
  Object.entries(SLIDERS).forEach(([key, spec]) => {
    const input = $(spec.input);
    const scale = input.parentElement.querySelector('.slider__scale');
    if (!scale) return;
    const min = Number(input.min), max = Number(input.max);
    scale.textContent = '';
    for (let v = min; v <= max + 1e-9; v += spec.minor) {
      const pct = ((v - min) / (max - min)) * 100;
      const major = Math.abs(v % spec.major) < 1e-9;
      const tick = document.createElement('span');
      tick.className = major ? 'slider__tick slider__tick--major' : 'slider__tick';
      tick.style.left = `${pct}%`;
      scale.appendChild(tick);
      if (major) {
        const lab = document.createElement('span');
        lab.className = 'slider__ticklabel';
        lab.style.left = `${pct}%`;
        lab.textContent = String(Math.round(v));
        scale.appendChild(lab);
      }
    }
  });
}

function syncSlider(key) {
  const spec = SLIDERS[key];
  const input = $(spec.input);
  const v = spec.get();
  input.value = String(v);
  $(spec.out).textContent = spec.display(v);
  const min = Number(input.min), max = Number(input.max);
  const pct = ((v - min) / (max - min)) * 100;
  input.style.setProperty('--track-fill', `${pct}%`);
  $(spec.out).style.setProperty('--thumb-pos', `${pct}%`);
}

function bindSliders() {
  Object.entries(SLIDERS).forEach(([key, spec]) => {
    const input = $(spec.input);
    input.addEventListener('input', () => {
      spec.set(Number(input.value));
      syncSlider(key);
      touch();
      if (!hasData) { recompute(); return; }
      /* Cheap redraw while the thumb is down: the fan freezes, the three
         curves and the crossing follow. */
      result = simulate(params);
      chart.setResult(result);
      chart.setMonth(scrubMonth);
      paintReadout(); paintLegend(); paintVerdictRow(); refreshLedger();
    });
    input.addEventListener('change', () => {
      spec.set(Number(input.value));
      syncSlider(key);
      touch();
      recompute();
    });
    input.addEventListener('pointerdown', () => document.body.classList.add('is-scrubbing'));
    input.addEventListener('pointerup', () => document.body.classList.remove('is-scrubbing'));
  });
}

/* -------------------------------------------------------------- segments */

function setSegment(groupSel, value) {
  $$(`${groupSel} .segment__opt`).forEach((b) => {
    const on = b.dataset.value === String(value);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
}

function bindSegment(groupSel, onPick) {
  const group = $(groupSel);
  group.addEventListener('click', (e) => {
    const b = e.target.closest('.segment__opt');
    if (!b || b.disabled) return;
    onPick(b.dataset.value);
    b.focus();
  });
  group.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const opts = $$(`${groupSel} .segment__opt`);
    const cur = opts.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const next = (cur + (e.key === 'ArrowRight' ? 1 : -1) + opts.length) % opts.length;
    onPick(opts[next].dataset.value);
    opts[next].focus();
  });
}

function setMode(v) {
  params.mode = Number(v) ? 1 : 0;
  setSegment('#seg-mode', params.mode);
  $$('[data-field="volPct"] input, [data-field="paths"] input, [data-field="seed"] input')
    .forEach((n) => { n.disabled = params.mode === 0; });
  $$('[data-field="volPct"], [data-field="paths"], [data-field="seed"]')
    .forEach((n) => n.classList.toggle('is-disabled', params.mode === 0));
  if (params.mode === 0) { mcToken++; chart.setBand(null); hideProgress(); }
  recompute();
}

function bindSegments() {
  bindSegment('#seg-mode', (v) => { touch(); setMode(v); });
  bindSegment('#seg-prepay', (v) => {
    params.prepayMode = Number(v) ? 1 : 0;
    setSegment('#seg-prepay', params.prepayMode);
    touch(); recompute();
  });
  bindSegment('#seg-sheetpath', (v) => { setSegment('#seg-sheetpath', v); sheet.setPath(v); });
  bindSegment('#seg-sheetgrain', (v) => { setSegment('#seg-sheetgrain', v); sheet.setGrain(v); });
}

/* --------------------------------------------------------------- switches */

function bindSwitches() {
  const bind = (sel, key) => {
    const node = $(sel);
    node.addEventListener('click', () => {
      params[key] = params[key] ? 0 : 1;
      node.setAttribute('aria-checked', params[key] ? 'true' : 'false');
      touch();
      recompute();
    });
    node.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); node.click(); }
    });
  };
  bind('#sw-itemized', 'itemized');
  bind('#sw-refinance', 'refinance');
}

/* --------------------------------------------------------------- scrubber */

function syncScrubberGeometry(api) {
  const pad = api.pad;
  const wrap = $('#scrubber-wrap');
  wrap.style.setProperty('--rail-l', `${pad.l}px`);
  wrap.style.setProperty('--rail-r', `${pad.r}px`);
  buildScrubberTicks();
  positionHandle();
}

function buildScrubberTicks() {
  const host = $('#scrubber-ticks');
  if (!host) return;
  host.textContent = '';
  const months = result ? result.months : 360;
  const years = Math.ceil(months / 12);
  const stride = (host.clientWidth && host.clientWidth < 380) ? 10 : 5;
  for (let y = 0; y <= years; y++) {
    const pct = (Math.min(y * 12, months) / months) * 100;
    const major = y % stride === 0;
    const t = document.createElement('span');
    t.className = major ? 'scrubber__tick scrubber__tick--major' : 'scrubber__tick';
    t.style.left = `${pct}%`;
    host.appendChild(t);
    if (major) {
      const l = document.createElement('span');
      l.className = 'scrubber__ticklabel';
      l.style.left = `${pct}%`;
      l.textContent = String(y);
      host.appendChild(l);
    }
  }
}

function positionHandle() {
  const handle = $('#scrubber');
  const months = result ? result.months : 360;
  const pct = months ? scrubMonth / months : 0;
  /* The rail is inset by the plot's own padding so the handle, the cursor
     line and the x axis all agree on where a month is. */
  handle.style.left =
    `calc(var(--rail-l, 64px) + (100% - var(--rail-l, 64px) - var(--rail-r, 18px)) * ${pct})`;
  const line = document.getElementById('cursor-line');
  if (line) line.setAttribute('data-month', String(scrubMonth));
}

function enableScrubber(on) {
  const handle = $('#scrubber');
  handle.setAttribute('aria-disabled', on ? 'false' : 'true');
  handle.tabIndex = 0;
  $('#scrubber-wrap').classList.toggle('is-disabled', !on);
  if (result) handle.setAttribute('aria-valuemax', String(result.months));
}

function setMonth(m, opts = {}) {
  if (!result) return;
  const prev = scrubMonth;
  scrubMonth = Math.max(0, Math.min(result.months, Math.round(m)));
  chart.setMonth(scrubMonth);
  positionHandle();
  paintReadout();
  if (result.crossMonth >= 0 && !opts.silent) {
    const was = prev >= result.crossMonth;
    const now = scrubMonth >= result.crossMonth;
    if (was !== now && now) {
      announce(`${fmt.monthLabel(result.crossMonth)}，投資開始領先。`);
      document.body.dataset.crossed = 'true';
    } else if (was !== now) {
      document.body.dataset.crossed = 'false';
    }
  }
  monthHook?.(scrubMonth, result);
}

function bindScrubber() {
  const track = $('#scrubber-track');
  const handle = $('#scrubber');
  const railBox = () => {
    const r = track.getBoundingClientRect();
    const cs = getComputedStyle($('#scrubber-wrap'));
    const l = parseFloat(cs.getPropertyValue('--rail-l')) || 0;
    const rr = parseFloat(cs.getPropertyValue('--rail-r')) || 0;
    return { left: r.left + l, width: Math.max(1, r.width - l - rr) };
  };

  /* Draggable, when it loaded, takes the pointer gesture so the throw can
     carry inertia. Without it these plain pointer handlers do the same job
     minus the glide. The keyboard path below is shared either way. */
  if (typeof window.Draggable === 'undefined') {
    let startMonth = 0;

    const move = (clientX) => {
      const box = railBox();
      const months = result ? result.months : 360;
      setMonth(((clientX - box.left) / box.width) * months);
    };

    const end = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('is-scrubbing');
      $('#scrubber-wrap').classList.remove('is-dragging');
    };

    track.addEventListener('pointerdown', (e) => {
      if (!result) return;
      dragging = true;
      startMonth = scrubMonth;
      document.body.classList.add('is-scrubbing');
      $('#scrubber-wrap').classList.add('is-dragging');
      track.setPointerCapture(e.pointerId);
      move(e.clientX);
      handle.focus({ preventScroll: true });
    });
    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      move(e.clientX);
    });
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);

    cancelDrag = () => { setMonth(startMonth); end(); };
  }

  handle.addEventListener('keydown', (e) => {
    if (!result) return;
    const big = e.shiftKey ? 12 : 1;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':  setMonth(scrubMonth - big); break;
      case 'ArrowRight': setMonth(scrubMonth + big); break;
      case 'PageDown':   setMonth(scrubMonth - 12); break;
      case 'PageUp':     setMonth(scrubMonth + 12); break;
      case 'Home':       setMonth(0); break;
      case 'End':        setMonth(result.months); break;
      case 'x': case 'X':
        /* markMonth, not crossMonth: when the two curves never actually swap
           places the chart still annotates the month the lead becomes
           decisive, and that pill is what the reader is aiming at. Keying off
           crossMonth made X do nothing on exactly the scenarios where an
           annotation was sitting there in plain sight. */
        if (result.markMonth >= 0) setMonth(result.markMonth);
        break;
      case 'Escape':
        if (dragging && cancelDrag) cancelDrag();
        else handled = false;
        break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  handle.addEventListener('focus', () => { $('#scrubber-hint').hidden = false; });
  handle.addEventListener('blur', () => { $('#scrubber-hint').hidden = true; });
}

/* --------------------------------------------------------------- buttons */

function bindButtons() {
  $('#btn-sample').addEventListener('click', loadSample);

  $('#btn-own').addEventListener('click', () => {
    const target = $('#params');
    target.scrollIntoView({ behavior: motion.prefersReduced ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => $('#f-balance').focus({ preventScroll: true }), motion.prefersReduced ? 0 : 420);
  });

  $('#btn-share').addEventListener('click', copyShareLink);

  $('#btn-reset').addEventListener('click', () => {
    toast({
      message: '重設會清掉你填的所有數字，換回預設值。',
      actions: [
        {
          label: '確定重設',
          onClick: () => {
            params = { ...DEFAULTS };
            hasData = false; isSample = false; scrubMonth = 0;
            mcToken++;
            chart.setBand(null);
            syncControls();
            recompute();
            announce('已重設為預設值。');
          },
        },
        { label: '取消', onClick: () => {} },
      ],
    });
  });

  $('#btn-save').addEventListener('click', () => {
    if (!hasData) { toast({ message: '還沒有東西可以存。先載入範例情境或填入你的數字。' }); return; }
    const ok = scenarios.save(params, `情境 ${scenarios.count + 1}`);
    if (ok) announce('已存進比較欄。');
  });

  $('#btn-preset-general').addEventListener('click', () => applyPreset('general'));
  $('#btn-preset-youth').addEventListener('click', () => applyPreset('youth'));

  $('#btn-csv').addEventListener('click', () => {
    if (!sheet.download()) toast({ message: '還沒有攤還表可以匯出。先載入情境。' });
    else announce('CSV 已開始下載。');
  });

  const dlg = $('#dlg-shortcuts');
  $('#btn-shortcuts').addEventListener('click', () => openDialog());
  $('#dlg-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  $('#legend').addEventListener('click', (e) => {
    const row = e.target.closest('.legend__row');
    if (!row) return;
    setHighlight(highlight === row.dataset.path ? null : row.dataset.path);
  });
}

function openDialog() {
  const dlg = $('#dlg-shortcuts');
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

function applyPreset(which) {
  const preset = TW.presets[which];
  params.ratePct = preset.ratePct;
  params.graceMonths = Math.min(preset.graceMonths, Math.max(0, params.termMonths - 12));
  touch();
  recompute();
  toast({ message: `已套用${preset.label}參考利率 ${fmt.pct(preset.ratePct, 3)}。這是參考值，請以你的貸款合約為準。` });
}

let sampleIndex = -1;

/** "A whole new set of numbers just arrived" — the motion layer redraws the
    curves from scratch when it sees this, instead of swapping them silently. */
function signalFreshData(kind) {
  document.dispatchEvent(new CustomEvent('sandbox:load', { detail: { kind } }));
}

function loadSample() {
  sampleIndex = (sampleIndex + 1) % SAMPLE_SCENARIOS.length;
  const s = SAMPLE_SCENARIOS[sampleIndex];
  params = normalize({ ...s.params });
  hasData = true;
  isSample = true;
  scrubMonth = 0;
  mcToken++;
  chart.setBand(null);
  syncControls();
  signalFreshData('sample');   // after the band reset, so the redraw it arms is the real one
  recompute();
  toast({
    message: `範例 ${sampleIndex + 1} / ${SAMPLE_SCENARIOS.length}：${s.name}。${s.note} 再按一次換下一個範例。`,
  });
  announce(`已載入範例情境：${s.name}。三條曲線已畫出。`);
}

function loadScenario(hash, name, flag) {
  const parsed = decode(`#${hash}`);
  params = parsed.params;
  hasData = true;
  isSample = flag === 'sample';
  scrubMonth = 0;
  mcToken++;
  chart.setBand(null);
  syncControls();
  signalFreshData('scenario');
  recompute();
  if (name) announce(`已載入情境 ${name}。`);
}

async function copyShareLink() {
  const url = shareURL(params);
  const extra = isSample ? '這是範例參數，記得改成你自己的數字再分享。' : '';
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(url);
    toast({ message: `連結已複製。它包含你所有的參數，別人打開會看到同一張圖。${extra}` });
  } catch (err) {
    const input = document.createElement('input');
    input.className = 'toast__url';
    input.readOnly = true;
    input.value = url;
    toast({
      message: '這個瀏覽器不讓我直接複製。連結已經選好了，按 Ctrl + C（Mac 是 Cmd + C）。',
      tone: 'error',
      node: input,
      actions: [{ label: '知道了', onClick: () => {} }],
    });
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }
}

function setHighlight(key) {
  highlight = key;
  chart.setHighlight(key);
  $$('#legend .legend__row').forEach((r) => {
    r.classList.toggle('is-on', highlight === r.dataset.path);
  });
  $('#legend').dataset.highlight = key || '';
}

/* --------------------------------------------------------------- keyboard */

function isTyping(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { handleEscape(e); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTyping(e.target)) return;
    const onScrubber = e.target instanceof Element && e.target.closest('.scrubber__handle');
    if (onScrubber && ['x', 'X'].includes(e.key)) return;   // its own handler owns X

    switch (e.key) {
      case 'e': case 'E': e.preventDefault(); loadSample(); break;
      case 'r': case 'R': e.preventDefault(); $('#btn-reset').click(); break;
      case 'c': case 'C': e.preventDefault(); copyShareLink(); break;
      case 'm': case 'M': e.preventDefault(); touch(); setMode(params.mode ? 0 : 1); break;
      case 's': case 'S': e.preventDefault(); $('#btn-save').click(); break;
      case '1': e.preventDefault(); setHighlight(highlight === 'a' ? null : 'a'); break;
      case '2': e.preventDefault(); setHighlight(highlight === 'b' ? null : 'b'); break;
      case '3': e.preventDefault(); setHighlight(highlight === 'c' ? null : 'c'); break;
      case 'x': case 'X':
        if (result && result.markMonth >= 0) { e.preventDefault(); setMonth(result.markMonth); $('#scrubber').focus(); }
        break;
      case '0': e.preventDefault(); setMonth(0); break;
      case '?': e.preventDefault(); openDialog(); break;
      default: break;
    }
  });
}

function handleEscape(e) {
  if (dragging) { e.preventDefault(); cancelDrag?.(); return; }
  if (scenarios.cancelMove()) { e.preventDefault(); return; }
  const dlg = $('#dlg-shortcuts');
  if (dlg.open) { return; } // native <dialog> closes itself and restores focus
  if (drawers.closeLast()) { e.preventDefault(); return; }
  if (hasActionToast()) { e.preventDefault(); dismissTop(); return; }
  if (isTyping(e.target)) return; // the field's own handler restores its value
  $('#scrubber').focus();
}

/* ------------------------------------------------------------------- hash */

let hashTimer = 0;
let selfHash = '';

function writeHashDebounced() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    if (!hasData) return;
    selfHash = encode(params);
    history.replaceState(null, '', `#${selfHash}`);
    writeStore('last', selfHash);
  }, 300);
}

function bindHash() {
  window.addEventListener('hashchange', () => {
    const raw = location.hash.replace(/^#/, '');
    if (!isShareHash(location.hash) || raw === selfHash) return;
    /* A pending write from the last parameter change must not clobber a hash
       the user just pasted or navigated back to. */
    clearTimeout(hashTimer);
    const parsed = decode(location.hash);
    params = parsed.params;
    selfHash = encode(params);
    hasData = true;
    isSample = false;
    syncControls();
    recompute();
    if (!parsed.ok) {
      console.warn('[房貸沙盤] 這個 hash 有欄位讀不出來，已用預設值補齊。原始 hash:', parsed.raw);
      toast({
        message: '這個連結有一段讀不出來，已經用預設值把缺的補齊了。你可以直接改成你的數字。',
        tone: 'error',
      });
    }
  });
}

/* ---------------------------------------------------------------- helpers */

function touch() {
  hasData = true;
  if (isSample) isSample = false;
  paintFlag();
}

function syncControls() {
  Object.keys(FIELDS).forEach((key) => {
    const spec = FIELDS[key];
    const node = fieldNode(key);
    if (document.activeElement !== node) node.value = spec.display(spec.get());
    markChanged(key);
  });
  Object.keys(SLIDERS).forEach(syncSlider);
  setSegment('#seg-mode', params.mode);
  setSegment('#seg-prepay', params.prepayMode);
  $('#sw-itemized').setAttribute('aria-checked', params.itemized ? 'true' : 'false');
  $('#sw-refinance').setAttribute('aria-checked', params.refinance ? 'true' : 'false');
  $$('[data-field="volPct"] input, [data-field="paths"] input, [data-field="seed"] input')
    .forEach((n) => { n.disabled = params.mode === 0; });
  $$('[data-field="volPct"], [data-field="paths"], [data-field="seed"]')
    .forEach((n) => n.classList.toggle('is-disabled', params.mode === 0));
  positionHandle();
}

/* ------------------------------------------------------------------- boot */

chart = createChart($('#plot'), { onResize: syncScrubberGeometry });
buildLedger();
buildSliderScales();
buildScrubberTicks();
drawers = initDrawers(getCtx);
sheet = createSheet({ onHoverMonth: (m) => chart.setRowMark(m) });
/* The motion layer fills these in so a tray rebuild can be measured before and
   after. Empty until then, and the tray works fine with them empty. */
const trayHooks = {};
scenarios = createScenarios({
  onLoad: loadScenario,
  onCopyLink: copyShareLink,
  onClearStore: () => clearStore(),
  announce,
  beforeRender: () => trayHooks.before?.(),
  afterRender: () => trayHooks.after?.(),
});

bindFields();
bindSliders();
bindSegments();
bindSwitches();
bindButtons();
bindScrubber();
bindKeyboard();
bindHash();

bootstrap();

/* The animation layer's only entry point. Nothing here computes anything; it
   reads the current state and drives the timeline cursor. */
window.__sandbox = {
  get result() { return result; },
  get params() { return params; },
  get month() { return scrubMonth; },
  setMonth,
  chart,
  motion,
  scenarios,
  trayHooks,
  /** Keeps the shared `dragging` flag honest when Draggable owns the gesture. */
  setDragging(on) { dragging = !!on; },
  /** Escape during a drag routes here. */
  setDragCanceller(fn) { cancelDrag = fn; },
  /** Called after every cursor move, with the month and the current result. */
  setMonthHook(fn) { monthHook = fn; },
};
