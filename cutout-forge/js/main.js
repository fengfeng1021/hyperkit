/* ==========================================================================
   Cutout Forge - application shell.

   Wires the DOM to the queue, the engine, the presets, the ledger, the
   inspector and the exporter. Owns the keyboard model, the drag target, the
   alert slot, and the honest status readouts along the bottom.

   Motion is deliberately absent from this file. Every state the interface
   can be in is reachable and legible without a single animation running.
   The named hooks at the bottom are what the motion layer attaches to.
   ========================================================================== */

import { $, el, clamp, storage, fmtMB, fmtEta, svgIcon, yieldToBrowser } from './util.js';
import { engine } from './engine.js';
import { Queue, TILE_EDGE } from './queue.js';
import { paintPreview } from './compose.js';
import { presets, loadPresets, savePresets, renderPresets, activePresets } from './presets.js';
import { buildSamples, SAMPLE_COUNT } from './samples.js';
import { Ledger } from './ledger.js';
import { Inspector } from './inspector.js';
import { runExport, saveBlob, plannedFileCount } from './exporter.js';

/* --------------------------------------------------------------- elements */

const dom = {
  floor: $('#floor'),
  bed: $('#bed'),
  bedEngine: $('#bedEngine'),
  bedLead: $('#bedLead'),
  matrixWrap: $('#matrixWrap'),
  matrix: $('#matrix'),
  wallNote: $('#wallNote'),
  inspector: $('#inspector'),
  warmup: $('#warmup'),
  warmupSub: $('#warmupSub'),
  warmupBar: $('#warmupBar'),
  warmupFill: $('#warmupFill'),
  warmupReadout: $('#warmupReadout'),
  warmupActions: $('#warmupActions'),
  btnChoose: $('#btnChoose'),
  btnSamples: $('#btnSamples'),
  fileInput: $('#fileInput'),
  railSources: $('#railSources'),
  railTransport: $('#railTransport'),
  btnAddMore: $('#btnAddMore'),
  btnClearAll: $('#btnClearAll'),
  sourcesCount: $('#sourcesCount'),
  skippedBox: $('#skippedBox'),
  skippedSummary: $('#skippedSummary'),
  skippedList: $('#skippedList'),
  presets: $('#presets'),
  presetGuard: $('#presetGuard'),
  btnRun: $('#btnRun'),
  btnRunLabel: $('#btnRunLabel'),
  btnRetryFailed: $('#btnRetryFailed'),
  btnRetryLabel: $('#btnRetryLabel'),
  queueBar: $('#queueBar'),
  queueFill: $('#queueFill'),
  queueCounts: $('#queueCounts'),
  queueEta: $('#queueEta'),
  ledgerSlot: $('#ledgerSlot'),
  btnExport: $('#btnExport'),
  btnExportLabel: $('#btnExportLabel'),
  exportHint: $('#exportHint'),
  exportTree: $('#exportTree'),
  nextStep: $('#nextStep'),
  engineChip: $('#engineChip'),
  engineChipText: $('#engineChipText'),
  engineDetails: $('#engine'),
  engEngine: $('#engEngine'),
  engCached: $('#engCached'),
  engConcurrency: $('#engConcurrency'),
  modeModel: $('#modeModel'),
  modeChroma: $('#modeChroma'),
  engineModeWhy: $('#engineModeWhy'),
  btnModeToggle: $('#btnModeToggle'),
  btnClearCache: $('#btnClearCache'),
  btnShortcuts: $('#btnShortcuts'),
  btnShortcutsClose: $('#btnShortcutsClose'),
  shortcuts: $('#shortcutsDialog'),
  stEngine: $('#stEngine'),
  stConcurrency: $('#stConcurrency'),
  stMemory: $('#stMemory'),
  stQueue: $('#stQueue'),
  alertSlot: $('#alertSlot'),
  alertAssertive: $('#alertAssertive'),
};

/* ------------------------------------------------------------------ state */

const queue = new Queue();
const ledger = new Ledger(dom.ledgerSlot);
const tiles = new Map();
const selection = new Set();
let focusedId = null;
let exporting = false;
let memoryEased = false;
let view = 'bed';        // bed | matrix | inspector
let clearArmed = false;
let undoTimer = null;

const inspector = new Inspector(dom.inspector, {
  onClose: () => closeInspector(),
  onRetry: (item, mode) => retryOne(item, mode),
  onRemove: (item) => { closeInspector(); removeItems([item.id]); },
  onChanged: () => refreshExportButton(),
});

/* ---------------------------------------------------------- alert slot
   One message at a time, four seconds minimum, no toasts, no modals. */

const alerts = [];
let alertBusy = false;

function notify(kind, text, action) {
  alerts.push({ kind, text, action });
  if (kind === 'error') dom.alertAssertive.textContent = text;
  drainAlerts();
}

function drainAlerts() {
  if (alertBusy || !alerts.length) return;
  alertBusy = true;
  const { kind, text, action } = alerts.shift();
  dom.alertSlot.textContent = '';
  dom.alertSlot.className = 'statusrail__alert' + (kind === 'warn' || kind === 'error' ? ' is-warn' : '');
  dom.alertSlot.append(document.createTextNode(text));
  if (action) {
    const btn = el('button', { type: 'button', text: action.label });
    btn.addEventListener('click', () => { action.run(); dom.alertSlot.textContent = ''; });
    dom.alertSlot.append(' ', btn);
  }
  setTimeout(() => { alertBusy = false; drainAlerts(); }, 4200);
}

/* --------------------------------------------------------------- tiles */

const STATUS_TEXT = {
  queued: '等待中', decoding: '讀取中', running: '處理中', done: '完成',
  flagged: '要看一下', failed: '失敗', skipped: '已跳過', paused: '暫停中',
};

const LAMP = {
  queued: 'lamp--hollow', decoding: 'lamp--idle', running: 'lamp--solid',
  done: 'lamp--solid', flagged: 'lamp--tri', failed: 'lamp--frame',
  skipped: 'lamp--off', paused: 'lamp--hold',
};

function buildTile(item) {
  const result = el('canvas', { class: 'tile__layer tile__result', role: 'img', 'aria-label': `${item.name} 的去背結果` });
  const original = el('canvas', { class: 'tile__layer tile__original', role: 'presentation' });
  const slot = el('div', { class: 'tile__slot' });
  const scan = el('div', { class: 'tile__scan' });
  const runline = el('div', { class: 'tile__runline' });
  const flag = el('span', { class: 'tile__flag', hidden: true });
  const msg = el('p', { class: 'tile__msg', hidden: true });
  const hold = el('span', { class: 'tile__hold', hidden: true, text: '暫停' });
  const check = el('span', { class: 'tile__check' });

  const lamp = el('span', { class: 'lamp lamp--hollow' });
  const name = el('span', { class: 'tile__name', text: item.name });
  const dim = el('span', { class: 'tile__dim', text: item.width ? `${item.width}×${item.height}` : '' });
  const chrome = el('div', { class: 'tile__chrome' }, [lamp, name, dim]);

  const ops = el('div', { class: 'tile__ops' }, [
    el('button', { type: 'button', class: 'tile__op', 'data-op': 'open', text: '開啟', tabindex: '-1' }),
    el('button', { type: 'button', class: 'tile__op', 'data-op': 'retry', text: '重跑', tabindex: '-1' }),
    el('button', { type: 'button', class: 'tile__op', 'data-op': 'remove', text: '移除', tabindex: '-1' }),
  ]);

  const li = el('li', {
    class: 'tile', role: 'option', tabindex: '-1',
    'data-id': item.id, 'data-status': item.status, 'aria-selected': 'false',
  }, [slot, result, original, scan, runline, flag, msg, hold, check, ops, chrome]);

  tiles.set(item.id, { li, result, original, slot, lamp, name, dim, flag, msg, hold, ops });
  updateTile(item);
  return li;
}

function updateTile(item) {
  const t = tiles.get(item.id);
  if (!t) return;
  t.li.dataset.status = item.status;
  t.lamp.className = `lamp ${LAMP[item.status] || 'lamp--hollow'}`;
  t.flag.hidden = item.status !== 'flagged';
  t.hold.hidden = item.status !== 'paused';

  if (item.status === 'decoding') t.name.textContent = '讀取中…';
  else t.name.textContent = item.name;

  if (item.width) t.dim.textContent = `${item.width}×${item.height}`;
  if (item.status === 'flagged') t.dim.textContent = item.flagReason;

  const failing = item.status === 'failed' || item.status === 'skipped';
  t.msg.hidden = !failing;
  if (failing) t.msg.textContent = item.error || item.skipReason;

  const label = `${item.name}，${STATUS_TEXT[item.status] || item.status}` +
    (item.width ? `，${item.width} × ${item.height}` : '');
  t.li.setAttribute('aria-label', label);
}

queue.renderer.original = (item, bitmap) => {
  const t = tiles.get(item.id);
  if (!t) return;
  const scale = TILE_EDGE / Math.max(bitmap.width, bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  t.original.width = w; t.original.height = h;
  t.original.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  t.slot.hidden = true;
  t.viewW = w; t.viewH = h;
};

queue.renderer.result = (item, bitmap, alpha) => {
  const t = tiles.get(item.id);
  if (!t) return;
  const w = t.viewW || TILE_EDGE, h = t.viewH || TILE_EDGE;
  paintPreview(t.result, bitmap, w, h, alpha, item.tw, item.th, { despill: item.despill, bg: item.bg });
  /* The original layer has done its job once the result is painted. It is
     kept alive briefly so the motion layer can erase it, then released. */
  clearTimeout(t.freeTimer);
  t.freeTimer = setTimeout(() => {
    if (item.status === 'done' || item.status === 'flagged') {
      t.original.width = 1; t.original.height = 1;
    }
  }, 1400);
};

/* --------------------------------------------------------------- views */

function setView(next) {
  view = next;
  dom.bed.hidden = next !== 'bed';
  dom.matrixWrap.hidden = next !== 'matrix';
  dom.inspector.hidden = next !== 'inspector';
  dom.railSources.hidden = queue.items.length === 0;
  dom.railTransport.hidden = queue.items.length === 0;
  refreshWallNote();
  fitWall();
}

function rebuildMatrix() {
  const frag = document.createDocumentFragment();
  const seen = new Set();
  for (const item of queue.items) {
    seen.add(item.id);
    const existing = tiles.get(item.id);
    frag.append(existing ? existing.li : buildTile(item));
  }
  for (const [id, t] of tiles) {
    if (!seen.has(id)) { t.li.remove(); tiles.delete(id); }
  }
  dom.matrix.textContent = '';
  dom.matrix.append(frag);
  if (!focusedId || !tiles.has(focusedId)) focusedId = queue.items[0]?.id || null;
  syncRoving();
  fitWall();
}

function syncRoving() {
  for (const [id, t] of tiles) {
    t.li.tabIndex = id === focusedId ? 0 : -1;
    t.li.setAttribute('aria-selected', selection.has(id) ? 'true' : 'false');
  }
}

/* ---------------------------------------------------------- wall fitting

   The wall is built for two hundred photos and almost every first run is six.
   At six, the auto-fill grid puts one thin strip of thumbnails across the top
   of a bed that is otherwise empty, which reads as a broken layout rather than
   a small batch. So for small batches the tile edge and the column count are
   solved rather than assumed: pick the arrangement that makes the largest
   square tile inside the space actually available, cap it so one photo does
   not become a poster, and centre the result. Past WALL_DENSE tiles the
   auto-fill grid is already right and this leaves it alone.

   Nothing here is motion. It is layout, it runs with GSAP absent, and every
   value it writes is a plain CSS custom property the stylesheet falls back
   from cleanly. */

const WALL_DENSE = 40;      // above this the grid is dense enough on its own
const WALL_EDGE_MAX = 300;  // px; a square product thumbnail, not a hero image

function fitWall() {
  const wrap = dom.matrixWrap;
  const grid = dom.matrix;
  const n = tiles.size;

  const clear = () => {
    wrap.classList.remove('is-sparse');
    grid.style.removeProperty('--wall-cols');
    grid.style.removeProperty('--wall-edge');
  };

  if (wrap.hidden || n === 0 || n > WALL_DENSE) { clear(); return; }

  const wrapCS = getComputedStyle(wrap);
  const gap = parseFloat(getComputedStyle(grid).rowGap) || 8;
  const natural = parseFloat(wrapCS.getPropertyValue('--tile-min')) || 148;
  const availW = wrap.clientWidth - parseFloat(wrapCS.paddingLeft) - parseFloat(wrapCS.paddingRight);
  let availH = wrap.clientHeight - parseFloat(wrapCS.paddingTop) - parseFloat(wrapCS.paddingBottom);

  /* The caption takes its height out of the bed before the tiles get any. */
  if (!dom.wallNote.hidden) availH -= dom.wallNote.offsetHeight + 28;

  /* Band headers do too, and they also break the wall into groups that each
     start a new row - so the row count is per group, not ceil(n / columns).
     Getting this wrong is what makes a banded wall overshoot the fold. */
  const groups = [];
  let head = null;
  let overhead = 0;
  for (const child of grid.children) {
    if (child.classList.contains('band-label')) {
      const cs = getComputedStyle(child);
      overhead += child.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom) + gap;
      groups.push(head = { n: 0 });
    } else {
      if (!head) groups.push(head = { n: 0 });
      head.n++;
    }
  }
  if (!groups.length) groups.push({ n });
  availH -= overhead;
  if (availW < 80 || availH < 80) { clear(); return; }

  let edge = 0;
  let cols = 1;
  for (let c = 1; c <= n; c++) {
    let rows = 0;
    for (const g of groups) rows += Math.ceil(g.n / c);
    if (!rows) continue;
    const e = Math.min((availW - (c - 1) * gap) / c, (availH - (rows - 1) * gap) / rows);
    if (e > edge) { edge = e; cols = c; }
  }

  /* If the solved tile is no bigger than the one auto-fill would have given,
     there is nothing to gain and the plain grid stays. */
  if (edge <= natural + 1) { clear(); return; }

  edge = Math.min(edge, WALL_EDGE_MAX);
  wrap.classList.add('is-sparse');
  grid.style.setProperty('--wall-cols', String(cols));
  grid.style.setProperty('--wall-edge', `${Math.floor(edge)}px`);

  /* Band labels break rows the arithmetic above did not count. Measure once
     and shrink to fit rather than let the wall run under the fold. */
  const used = grid.scrollHeight;
  if (used > availH && used > 0) {
    const shrunk = Math.max(natural, Math.floor(edge * (availH / used)));
    grid.style.setProperty('--wall-edge', `${shrunk}px`);
  }
}

/* One caption under the wall, and only when the wall left room for it. It is
   an instrument label: it says what the machine is doing at this moment, not
   that something is missing. */
function refreshWallNote() {
  const note = dom.wallNote;
  const c = queue.counts;

  if (dom.matrixWrap.hidden || c.total === 0 || tiles.size > WALL_DENSE) {
    note.hidden = true;
    return;
  }

  note.textContent = '';
  if (c.pending > 0) {
    note.append(
      '每一道青色光帶，是一張照片正在從上緣往下被量測。已經跑完 ',
      el('span', { class: 'mono', text: `${c.finished} / ${c.total}` }),
      ' 張。沒有任何東西離開過這個分頁。',
    );
  } else {
    note.append(
      '棋盤格是真的透明，不是白底。',
      '點任一張跟原圖比對邊緣，沒問題就整面牆一次匯出成各平台尺寸。',
    );
  }
  note.hidden = false;
}

/* Called on every progress tick, so the wall is only re-solved when the
   caption actually appeared or disappeared. */
function refreshWall() {
  const wasHidden = dom.wallNote.hidden;
  refreshWallNote();
  if (wasHidden !== dom.wallNote.hidden) fitWall();
}

/* The bed changes size when the rail wraps, the window resizes, or the
   inspector hands the floor back. Re-solve rather than trust the last run.
   Coalesced onto one frame so an observer that fires because of its own
   write cannot turn into a loop. */
let wallFrame = 0;
function scheduleFit() {
  if (wallFrame) return;
  wallFrame = requestAnimationFrame(() => { wallFrame = 0; fitWall(); });
}
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(scheduleFit).observe(dom.matrixWrap);
} else {
  window.addEventListener('resize', scheduleFit);
}

/* Groups the wall by what the operator has to do next: ready, needs a look,
   failed. Grouping by platform would repeat every photo once per preset and
   answer a question nobody is asking. */
function applyBands() {
  const order = { done: 0, flagged: 1, failed: 2, skipped: 3 };
  const groups = [[], [], [], []];
  for (const item of queue.items) {
    const g = order[item.status];
    if (g === undefined) return false;
    groups[g].push(item);
  }
  if (!groups[1].length && !groups[2].length && !groups[3].length) return false;

  const titles = ['可以匯出', '要看一下', '失敗', '已跳過'];
  const cls = ['', 'band-label--flagged', 'band-label--failed', ''];
  dom.matrix.textContent = '';
  groups.forEach((group, i) => {
    if (!group.length) return;
    dom.matrix.append(el('li', { class: `band-label ${cls[i]}`.trim(), role: 'presentation' }, [
      titles[i], el('span', { class: 'mono', text: String(group.length) }),
    ]));
    for (const item of group) dom.matrix.append(tiles.get(item.id).li);
  });
  syncRoving();
  /* Band headers change how many rows the wall needs, so it is re-solved
     before Flip measures it. */
  refreshWallNote();
  fitWall();
  return true;
}

/* ------------------------------------------------------------- intake */

async function intake(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  const images = list.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif|tiff?)$/i.test(f.name));
  if (!images.length) {
    dom.floor.classList.add('is-reject');
    setTimeout(() => dom.floor.classList.remove('is-reject'), 2400);
    notify('warn', '這次丟進來的沒有圖片。這裡吃 JPEG、PNG、WebP、AVIF。');
    return;
  }
  const added = queue.add(images);
  rebuildMatrix();
  setView('matrix');
  refreshSources();
  refreshTransport();
  await yieldToBrowser();
  hooks.onTilesAdded(added.map(item => tiles.get(item.id)?.li).filter(Boolean));
  beginRun();
}

async function loadSamples() {
  const btn = dom.btnSamples;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.classList.add('btn--scanning');
  const label = btn.textContent;
  btn.textContent = '正在畫範例…';
  try {
    const files = await buildSamples((done, total) => {
      btn.style.setProperty('--meter', `${(done / total) * 100}%`);
    });
    /* The samples exist to answer "does this thing work" in a few seconds.
       If the model is not already cached we run the chroma-key path so the
       answer arrives now, and we say so out loud. */
    if (engine.cached !== 'yes' && engine.modelStatus !== 'ready') {
      engine.useChroma('sample run');
      notify('info', `載入 ${SAMPLE_COUNT} 張範例。現在跑的是 chroma-key：不用下載，在這種純色背景上很準。毛料、頭髮、玻璃要靠那個 44 MB 的模型，從右上角的引擎標籤切過去。`);
    } else {
      notify('info', `載入 ${SAMPLE_COUNT} 張範例商品。它們走的流程跟你自己的照片一模一樣。`);
    }
    await intake(files);
  } catch (err) {
    notify('error', '這個瀏覽器畫不出範例照片。直接選你自己的照片試試看。');
  } finally {
    /* Restored even on success: clearing the queue brings the bed back and
       the button has to be usable again. */
    btn.textContent = label;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('btn--scanning');
    btn.style.removeProperty('--meter');
  }
}

/* --------------------------------------------------------------- running */

async function beginRun() {
  if (engine.mode === 'model' && engine.modelStatus !== 'ready') {
    const ok = await warmUp();
    if (!ok && engine.mode !== 'chroma') return;
  }
  queue.start();
  refreshTransport();
}

async function warmUp() {
  dom.warmup.hidden = false;
  dom.warmup.classList.remove('is-failed');
  dom.warmupSub.textContent = `正在下載去背模型，${engine.weightsMB} MB。只會下載這一次。`;
  dom.warmupReadout.textContent = `0% · 0.0 / ${engine.weightsMB}.0 MB`;
  dom.warmupFill.style.width = '0%';
  resetWarmupActions();

  const ok = await engine.ensureModel({
    onProgress: (w) => {
      if (w.knownTotal) {
        dom.warmupFill.style.width = `${w.pct}%`;
        dom.warmupBar.setAttribute('aria-valuenow', String(Math.round(w.pct)));
        dom.warmupReadout.textContent = `${Math.round(w.pct)}% · ${fmtMB(w.loaded)} / ${fmtMB(w.total)} MB`;
      } else {
        dom.warmupBar.classList.add('bar--indeterminate');
        dom.warmupBar.removeAttribute('aria-valuenow');
        dom.warmupReadout.textContent = `已下載 ${fmtMB(w.loaded)} MB · 總大小未知`;
      }
    },
    onStall: () => {
      dom.warmupSub.textContent = '下載卡住了。';
      dom.warmupActions.textContent = '';
      const retry = el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: '重試' });
      retry.addEventListener('click', () => { dom.warmup.hidden = true; warmUp().then(() => queue.start()); });
      const now = el('button', { type: 'button', class: 'btn btn--primary btn--sm', text: '現在改用 chroma-key' });
      now.addEventListener('click', skipWarmup);
      dom.warmupActions.append(retry, now);
    },
  });

  if (!ok) {
    dom.warmup.classList.add('is-failed');
    dom.warmupSub.textContent = '連不上模型主機。已經切到 chroma-key 模式，佇列照跑。';
    notify('warn', '連不上模型主機。已經切到 chroma-key 模式，佇列照跑。');
    setTimeout(() => { dom.warmup.hidden = true; }, 6000);
    queue.start();
    return false;
  }

  dom.warmup.hidden = true;
  return true;
}

function resetWarmupActions() {
  dom.warmupActions.textContent = '';
  const skip = el('button', { type: 'button', class: 'btn btn--ghost btn--sm', id: 'btnSkipWarmup', text: '跳過，直接用 chroma-key' });
  skip.addEventListener('click', skipWarmup);
  dom.warmupActions.append(skip);
}

function skipWarmup() {
  engine.useChroma('skipped by the operator');
  dom.warmup.hidden = true;
  notify('info', '已切到 chroma-key 模式。按下去馬上跑，純色棚拍背景很乾淨；毛料、頭髮、玻璃它跟不了。想換回模型，隨時從引擎標籤切。');
  queue.start();
  refreshTransport();
}

async function retryOne(item, mode) {
  if (mode === 'model' && engine.modelStatus !== 'ready') {
    engine.useModel();
    const ok = await warmUp();
    if (!ok) return;
  }
  const alpha = await queue.retryInMode(item, mode);
  if (alpha) inspector.repaint();
  refreshAll();
}

/* ----------------------------------------------------------- rail updates */

function refreshSources() {
  const c = queue.counts;
  dom.sourcesCount.textContent = `已載入 ${c.total} 張`;
  const skipped = queue.items.filter(i => i.status === 'skipped');
  dom.skippedBox.hidden = skipped.length === 0;
  dom.skippedSummary.textContent = `跳過 ${skipped.length} 個檔案`;
  dom.skippedList.textContent = '';
  for (const s of skipped) dom.skippedList.append(el('li', { text: `${s.name} · ${s.skipReason}` }));
  dom.btnClearAll.textContent = clearArmed ? `再按一次，丟掉 ${c.total} 張` : '清空佇列';
  dom.btnClearAll.classList.toggle('btn--fault', clearArmed);
}

function refreshTransport() {
  const c = queue.counts;
  const st = queue.state();

  if (queue.running) {
    dom.btnRunLabel.textContent = '暫停';
    dom.btnRun.firstElementChild.replaceWith(svgIcon('i-pause'));
  } else if (c.paused > 0) {
    dom.btnRunLabel.textContent = `繼續（還有 ${c.paused} 張）`;
    dom.btnRun.firstElementChild.replaceWith(svgIcon('i-play'));
  } else {
    dom.btnRunLabel.textContent = '開始';
    dom.btnRun.firstElementChild.replaceWith(svgIcon('i-play'));
  }
  dom.btnRun.disabled = c.pending === 0 && !queue.running;

  dom.btnRetryFailed.hidden = c.failed === 0;
  dom.btnRetryLabel.textContent = `重跑 ${c.failed} 張失敗的`;

  const pct = c.total ? (c.finished / c.total) * 100 : 0;
  dom.queueFill.style.width = `${pct}%`;
  dom.queueBar.setAttribute('aria-valuenow', String(Math.round(pct)));
  dom.queueCounts.textContent =
    `${c.finished} / ${c.total}` + (c.failed ? ` · ${c.failed} 張失敗` : '') + (c.flagged ? ` · ${c.flagged} 張要看` : '');

  const eta = st.eta;
  dom.queueEta.textContent = c.pending === 0
    ? (c.total ? '這批跑完了' : '佇列是空的')
    : (eta === null ? '量測中…' : fmtEta(eta));

  refreshWall();
}

function refreshStatus() {
  const c = queue.counts;
  dom.stEngine.textContent = engine.mode === 'chroma'
    ? '引擎 chroma-key'
    : `引擎 ${engine.device}${engine.modelStatus === 'ready' ? '' : '（模型未載入）'}`;
  dom.stConcurrency.textContent = `並行 ${queue.concurrency} / ${engine.cores || '?'} 核`;
  dom.stMemory.textContent = memoryEased ? '記憶體已降載' : '記憶體正常';
  dom.stQueue.textContent = c.total ? `佇列 ${c.finished} / ${c.total}` : '佇列是空的';
}

function refreshExportButton() {
  const ready = queue.deliverable.length;
  const presetCount = activePresets().length;
  if (exporting) return;

  dom.btnExport.classList.remove('is-done', 'is-error');
  if (!ready || !presetCount) {
    dom.btnExport.disabled = true;
    dom.btnExportLabel.textContent = '匯出';
    dom.exportHint.textContent = ready ? '至少勾一種輸出規格。' : '還沒有跑完的照片。';
  } else {
    dom.btnExport.disabled = false;
    dom.btnExportLabel.textContent = `匯出 ${ready} 張 · ${presetCount} 種規格`;
    dom.exportHint.textContent = `${plannedFileCount(queue)} 個檔案，依平台分好資料夾，另附 _manifest.csv。`;
  }
}

function refreshLedger() {
  ledger.setCount(queue.deliverable.length);
}

function refreshAll() {
  refreshSources();
  refreshTransport();
  refreshStatus();
  refreshExportButton();
  refreshLedger();
}

/* --------------------------------------------------------------- export */

async function doExport() {
  if (exporting || dom.btnExport.disabled) return;
  exporting = true;
  dom.btnExport.setAttribute('aria-busy', 'true');
  dom.btnExport.classList.add('btn--loading');
  dom.btnExport.classList.remove('is-done', 'is-error');
  dom.exportTree.hidden = false;
  dom.exportTree.textContent = '';

  const seenFolders = new Set();

  try {
    const result = await runExport(queue, {
      onFolder: (name, depth) => {
        const key = depth + name;
        if (seenFolders.has(key)) return;
        seenFolders.add(key);
        const prefix = depth === 0 ? '' : depth === 1 ? '  ├─ ' : '  │   └─ ';
        const line = el('li', { class: 'is-new', text: prefix + name });
        dom.exportTree.append(line);
        setTimeout(() => line.classList.remove('is-new'), 600);
        dom.exportTree.scrollTop = dom.exportTree.scrollHeight;
      },
      onProgress: (done, total) => {
        dom.btnExportLabel.textContent = `打包中 ${done} / ${total} 個檔案`;
        dom.btnExport.style.setProperty('--meter', `${(done / total) * 100}%`);
      },
      onStage: (stage) => {
        if (stage === 'writing') dom.btnExportLabel.textContent = '正在寫入 forge-export.zip';
      },
    });

    result.blobs.forEach((blob, i) => saveBlob(blob, result.names[i]));

    if (result.blobs.length > 1) {
      notify('info', `這次匯出超過 1.9 GB，拆成 ${result.blobs.length} 個檔案。`);
    }
    if (result.unreadable.length) {
      notify('warn', `有 ${result.unreadable.length} 張沒辦法用原尺寸重新開啟，這次沒有匯出。名單在 _manifest.csv 裡。`);
    }

    dom.btnExport.classList.add('is-done');
    dom.btnExportLabel.textContent = '已存檔 · 再匯出一次';
    dom.nextStep.hidden = false;
    hooks.onExportDone(result);
    setTimeout(() => { exporting = false; refreshExportButton(); }, 3000);
  } catch (err) {
    dom.btnExport.classList.add('is-error');
    dom.btnExportLabel.textContent = '匯出失敗，少勾幾種規格再試';
    notify('error', String((err && err.message) || '匯出失敗。') + '東西都還在，佇列沒有被動到。');
    dom.btnExport.addEventListener('click', () => { exporting = false; refreshExportButton(); }, { once: true });
  } finally {
    dom.btnExport.removeAttribute('aria-busy');
    dom.btnExport.classList.remove('btn--loading');
    dom.btnExport.style.removeProperty('--meter');
  }
}

/* ------------------------------------------------------------- selection */

function removeItems(ids) {
  const undo = queue.remove(ids);
  if (!undo) return;
  for (const id of ids) { const t = tiles.get(id); if (t) { t.li.remove(); tiles.delete(id); } selection.delete(id); }
  rebuildMatrix();
  refreshAll();
  if (!queue.items.length) { setView('bed'); return; }

  clearTimeout(undoTimer);
  const label = undo.removed.length === 1 ? undo.removed[0].name : `${undo.removed.length} 張照片`;
  notify('info', `已移除 ${label}。`, {
    label: '復原',
    run: () => { if (queue.undoRemove()) { rebuildMatrix(); setView('matrix'); refreshAll(); } },
  });
  undoTimer = setTimeout(() => { queue._undo = null; }, 8000);
}

function columnsInMatrix() {
  const cols = getComputedStyle(dom.matrix).gridTemplateColumns.split(' ').filter(Boolean).length;
  return Math.max(1, cols);
}

function orderedIds() {
  return Array.from(dom.matrix.querySelectorAll('.tile')).map(li => li.dataset.id);
}

function moveFocus(delta, extendSelection) {
  const ids = orderedIds();
  const at = ids.indexOf(focusedId);
  const next = clamp(at + delta, 0, ids.length - 1);
  focusedId = ids[next];
  if (extendSelection) selection.add(focusedId);
  syncRoving();
  const t = tiles.get(focusedId);
  if (t) { t.li.focus(); t.li.scrollIntoView({ block: 'nearest' }); }
}

/* --------------------------------------------------------------- routing */

function openInspector(id) {
  const item = queue.byId(id);
  if (!item) return;
  focusedId = id;
  setView('inspector');
  inspector.open(item);
  if (location.hash !== `#i/${id}`) location.hash = `i/${id}`;
}

function closeInspector() {
  inspector.release();
  setView(queue.items.length ? 'matrix' : 'bed');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const t = tiles.get(focusedId);
  if (t) t.li.focus();
}

function routeFromHash() {
  const m = /^#i\/(.+)$/.exec(location.hash);
  if (m && queue.byId(m[1])) openInspector(m[1]);
  else if (view === 'inspector') closeInspector();
}

/* -------------------------------------------------------------- keyboard */

function inTextField(target) {
  return !!(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
}

function onGlobalKey(ev) {
  if (ev.key === 'Escape') { escapeLadder(); return; }
  if (inTextField(ev.target) || ev.metaKey || ev.ctrlKey || ev.altKey) return;

  const k = ev.key.toLowerCase();
  if (k === '?' || (ev.key === '/' && ev.shiftKey)) { openShortcuts(); ev.preventDefault(); return; }
  if (k === 'o') { dom.fileInput.click(); ev.preventDefault(); return; }
  if (k === 's' && view === 'bed') { loadSamples(); ev.preventDefault(); return; }
  if (k === 'p' && queue.items.length) { toggleRun(); ev.preventDefault(); return; }
  if (k === 'e') { doExport(); ev.preventDefault(); return; }
  if (view === 'inspector') {
    if (k === 'z') { inspector.toggleZoom(); ev.preventDefault(); }
    if (ev.key === '[' || ev.key === ']') { stepInspector(ev.key === ']' ? 1 : -1); ev.preventDefault(); }
  }
}

function escapeLadder() {
  if (dom.shortcuts.open) { dom.shortcuts.close(); return; }
  if (dom.engineDetails.open) { dom.engineDetails.open = false; dom.engineChip.focus(); return; }
  const openEdit = dom.presets.querySelector('.preset__edit[aria-expanded="true"]');
  if (openEdit) { openEdit.click(); openEdit.focus(); return; }
  if (view === 'inspector') { closeInspector(); return; }
  if (selection.size) { selection.clear(); syncRoving(); return; }
  /* A running queue is never interrupted by Escape. Eight minutes of work is
     not something a stray key press gets to throw away. */
}

function stepInspector(dir) {
  const ids = orderedIds().filter(id => {
    const it = queue.byId(id);
    return it && it.status !== 'failed' && it.status !== 'skipped';
  });
  const at = ids.indexOf(inspector.item?.id);
  const next = ids[clamp(at + dir, 0, ids.length - 1)];
  if (next && next !== inspector.item?.id) openInspector(next);
}

function onMatrixKey(ev) {
  if (!tiles.size || view !== 'matrix') return;
  const cols = columnsInMatrix();
  const ids = orderedIds();
  const extend = ev.shiftKey;

  switch (ev.key) {
    case 'ArrowRight': moveFocus(1, extend); break;
    case 'ArrowLeft': moveFocus(-1, extend); break;
    case 'ArrowDown': moveFocus(cols, extend); break;
    case 'ArrowUp': moveFocus(-cols, extend); break;
    case 'Home': {
      const at = ids.indexOf(focusedId);
      moveFocus((ev.ctrlKey ? 0 : Math.floor(at / cols) * cols) - at, extend); break;
    }
    case 'End': {
      const at = ids.indexOf(focusedId);
      const target = ev.ctrlKey ? ids.length - 1 : Math.min(ids.length - 1, Math.floor(at / cols) * cols + cols - 1);
      moveFocus(target - at, extend); break;
    }
    case 'PageDown': moveFocus(cols * 3, extend); break;
    case 'PageUp': moveFocus(-cols * 3, extend); break;
    case 'Enter': if (focusedId) openInspector(focusedId); break;
    case ' ':
      if (focusedId) { selection.has(focusedId) ? selection.delete(focusedId) : selection.add(focusedId); syncRoving(); }
      break;
    case 'a':
      if (ev.ctrlKey || ev.metaKey) { ids.forEach(id => selection.add(id)); syncRoving(); }
      else return;
      break;
    case 'Delete': case 'Backspace':
      removeItems(selection.size ? Array.from(selection) : (focusedId ? [focusedId] : []));
      break;
    case 'r': case 'R':
      queue.retry(selection.size ? Array.from(selection) : (focusedId ? [focusedId] : []));
      break;
    default: return;
  }
  ev.preventDefault();
}

/* --------------------------------------------------------------- dialogs */

let shortcutsOpener = null;
function openShortcuts() {
  shortcutsOpener = document.activeElement;
  if (typeof dom.shortcuts.showModal === 'function') dom.shortcuts.showModal();
  else dom.shortcuts.setAttribute('open', '');
}
dom.shortcuts.addEventListener('close', () => {
  if (shortcutsOpener && shortcutsOpener.focus) shortcutsOpener.focus();
});
dom.shortcuts.addEventListener('click', (ev) => {
  if (ev.target === dom.shortcuts) dom.shortcuts.close();
});

/* ------------------------------------------------------------ engine chip */

const MODEL_RUNNING_NOTE =
  '現在跑的就是它。你的照片在這個分頁裡解碼、去背、縮放 — 從頭到尾只有模型權重是下載進來的。';

/* Why the reduced path is the one running. engine.lastError carries the
   reason a switch was made; each one gets a sentence a seller can act on. */
const CHROMA_REASONS = {
  'sample run':
    '現在跑這個，是因為範例商品畫在純色背景上，幾秒就有結果，不用先等 44 MB 下載完。你自己的照片兩條路都能走。',
  'skipped by the operator':
    '現在跑這個，是因為你跳過了下載。想要模型的時候，從下面切回去。',
  'chosen by the operator':
    '現在跑這個，是因為你自己選的。想換回來隨時從下面切。',
};

function chromaReason() {
  return CHROMA_REASONS[engine.lastError]
    || '現在跑這個，是因為模型下載不下來，佇列改走不需要下載的那條路。每張照片還是會去背 — 網路回來以後，從下面再試一次模型。';
}

function paintEngine() {
  const s = engine.chipState();
  const text = {
    probing: '正在確認硬體',
    webgpu: 'WebGPU',
    wasm: 'WASM（較慢）',
    chroma: 'Chroma-key 模式',
    warming: engine.warm.knownTotal ? `暖機 ${Math.round(engine.warm.pct)}%` : '暖機中',
    'offline-ready': 'WebGPU · 可離線',
  }[s] || '正在確認硬體';

  dom.engineChip.className = `chip chip--${s}`;
  dom.engineChipText.textContent = s === 'offline-ready' && engine.device !== 'webgpu' ? 'WASM · 可離線' : text;
  if (s === 'warming') dom.engineChip.style.setProperty('--warm', `${engine.warm.pct}%`);

  dom.engEngine.textContent = engine.mode === 'chroma'
    ? 'chroma-key（不用下載）'
    : `${engine.device}（${engine.device === 'webgpu' ? 'fp16' : 'q8'}，${engine.weightsMB} MB）`;
  dom.engCached.textContent = {
    yes: '有，在 Cache Storage 裡', no: '還沒有', unavailable: '這個瀏覽器不給用快取', unknown: '確認中',
  }[engine.cached];
  dom.engConcurrency.textContent = `${queue.concurrency} / ${engine.cores || '?'} 核`;
  /* Both paths are always described in the popover; this marks the live one
     and says why it is live. A fallback that arrives without a reason is
     indistinguishable from a fault, and this one is not a fault. */
  const chroma = engine.mode === 'chroma';
  dom.modeChroma.classList.toggle('is-active', chroma);
  dom.modeModel.classList.toggle('is-active', !chroma);
  dom.engineModeWhy.textContent = chroma ? chromaReason() : MODEL_RUNNING_NOTE;

  dom.btnModeToggle.textContent = chroma ? `改成下載模型（${engine.weightsMB} MB）` : '改用 chroma-key 模式';
  dom.bedEngine.textContent = engine.bedLine();
  dom.bedEngine.classList.toggle('is-fault', !engine.caps.bitmap);
  refreshStatus();
}

/* ------------------------------------------------------------- listeners */

dom.btnChoose.addEventListener('click', () => dom.fileInput.click());
dom.btnAddMore.addEventListener('click', () => dom.fileInput.click());
dom.btnSamples.addEventListener('click', loadSamples);
dom.fileInput.addEventListener('change', () => {
  const files = Array.from(dom.fileInput.files || []);
  dom.fileInput.value = '';
  if (files.length) {
    dom.btnChoose.textContent = `讀取 ${files.length} 個檔案…`;
    intake(files).finally(() => { dom.btnChoose.textContent = '選擇照片'; });
  }
});

function toggleRun() {
  if (queue.running) queue.pause();
  else beginRun();
  refreshTransport();
}
dom.btnRun.addEventListener('click', toggleRun);
dom.btnRetryFailed.addEventListener('click', () => { queue.retry(null); refreshAll(); });

dom.btnClearAll.addEventListener('click', () => {
  if (!clearArmed) {
    clearArmed = true;
    refreshSources();
    setTimeout(() => { clearArmed = false; refreshSources(); }, 5000);
    return;
  }
  clearArmed = false;
  queue.clear();
  tiles.clear();
  selection.clear();
  ledger.reset();
  dom.matrix.textContent = '';
  dom.exportTree.hidden = true;
  dom.nextStep.hidden = true;
  setView('bed');
  refreshAll();
});

dom.btnExport.addEventListener('click', doExport);

dom.btnShortcuts.addEventListener('click', openShortcuts);
dom.btnShortcutsClose.addEventListener('click', () => dom.shortcuts.close());

dom.btnModeToggle.addEventListener('click', async () => {
  dom.engineDetails.open = false;
  if (engine.mode === 'chroma') {
    engine.useModel();
    paintEngine();
    if (queue.counts.pending > 0) beginRun();
    else if (engine.modelStatus !== 'ready') warmUp();
  } else {
    engine.useChroma('chosen by the operator');
    notify('info', '已切到 chroma-key 模式。按下去馬上跑，純色棚拍背景很乾淨；毛料、頭髮、玻璃它跟不了。想換回模型，隨時從引擎標籤切。');
  }
  paintEngine();
});

dom.btnClearCache.addEventListener('click', async () => {
  dom.engineDetails.open = false;
  const ok = await engine.clearCache();
  notify(ok ? 'info' : 'warn', ok
    ? '已清掉快取的模型。下次要用模型時會重新下載一次。'
    : '這個瀏覽器沒開放 Cache Storage，本來就沒有東西可以清。');
  paintEngine();
});

dom.matrix.addEventListener('keydown', onMatrixKey);
dom.matrix.addEventListener('click', (ev) => {
  const opBtn = ev.target.closest('.tile__op');
  const li = ev.target.closest('.tile');
  if (!li) return;
  const id = li.dataset.id;
  focusedId = id;

  if (opBtn) {
    const op = opBtn.dataset.op;
    if (op === 'open') openInspector(id);
    if (op === 'retry') { queue.retry([id]); refreshAll(); }
    if (op === 'remove') removeItems([id]);
    ev.stopPropagation();
    return;
  }
  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
    selection.has(id) ? selection.delete(id) : selection.add(id);
    syncRoving();
    return;
  }
  openInspector(id);
});
dom.matrix.addEventListener('focusin', (ev) => {
  const li = ev.target.closest('.tile');
  if (li) { focusedId = li.dataset.id; syncRoving(); }
});

document.addEventListener('keydown', onGlobalKey);
window.addEventListener('hashchange', routeFromHash);

/* ------------------------------------------------------------ drag target
   The whole floor is the target, not a small dotted rectangle in the middle.
   The counter cancels the bubbling of dragleave from child elements. */

let dragDepth = 0;
window.addEventListener('dragenter', (ev) => {
  if (!Array.from(ev.dataTransfer?.types || []).includes('Files')) return;
  ev.preventDefault();
  dragDepth++;
  dom.floor.classList.add('is-dragover');
  if (view === 'bed') {
    const n = ev.dataTransfer.items?.length || 0;
    dom.bedLead.textContent = n ? `放手就載入 ${n} 個檔案。` : '放手就載入這些檔案。';
  }
});
window.addEventListener('dragover', (ev) => {
  if (!Array.from(ev.dataTransfer?.types || []).includes('Files')) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) endDrag();
});
window.addEventListener('drop', (ev) => {
  if (!ev.dataTransfer?.files?.length) return;
  ev.preventDefault();
  dragDepth = 0;
  endDrag();
  intake(ev.dataTransfer.files);
});
function endDrag() {
  dom.floor.classList.remove('is-dragover');
  dom.bedLead.textContent = '全部在這個瀏覽器分頁裡跑完。不用註冊、不扣點數、不限張數。';
}

/* Eight minutes of work does not disappear to a stray tab close. */
window.addEventListener('beforeunload', (ev) => {
  if (exporting || queue.counts.pending > 0) { ev.preventDefault(); ev.returnValue = ''; }
});

/* ----------------------------------------------------------- queue events */

queue.on('item', ({ item, resolved }) => {
  updateTile(item);
  if (resolved) { refreshLedger(); refreshExportButton(); }
  refreshStatus();
});
queue.on('items', () => { refreshSources(); refreshExportButton(); });
queue.on('progress', () => refreshTransport());
queue.on('transport', () => { refreshTransport(); refreshStatus(); });
queue.on('alert', ({ kind, text }) => notify(kind, text));
queue.on('pressure', ({ concurrency, reason }) => {
  memoryEased = true;
  notify('info', `並行數降到 ${concurrency}，讓記憶體穩一點。`);
  void reason;
  refreshStatus();
  paintEngine();
});
queue.on('complete', () => {
  const c = queue.counts;
  refreshAll();
  const banded = applyBands();
  const parts = [`${c.total} 張全部跑完。`];
  if (c.flagged) parts.push(`${c.flagged} 張要看一下。`);
  if (c.failed) parts.push(`${c.failed} 張失敗。`);
  parts.push('可以匯出了。');
  notify(c.failed || c.flagged ? 'warn' : 'info', parts.join(''));
  hooks.onBatchComplete({ counts: c, banded });
});

engine.onChange(() => paintEngine());

/* ----------------------------------------------------------------- boot */

async function boot() {
  loadPresets();
  renderPresets(dom.presets, ({ guard }) => {
    dom.presetGuard.textContent = guard || '';
    refreshExportButton();
  });
  savePresets();

  if (storage.broken) {
    notify('warn', '這個瀏覽器沒辦法存設定，關掉分頁後會回到預設值。');
  }

  await engine.probe();
  queue.concurrency = engine.concurrency;
  queue.pool.resize(engine.concurrency);
  paintEngine();

  if (!engine.caps.bitmap) {
    dom.btnChoose.disabled = true;
    dom.btnSamples.disabled = true;
    notify('error', '這個瀏覽器沒辦法在背景解碼圖片。換 Chrome、Edge，或 Firefox 110 以上。');
  }
  if (engine.cached === 'unavailable' && engine.caps.bitmap) {
    notify('info', '無痕模式：下次開還是要重新下載一次模型。其他功能都正常。');
  }

  setView('bed');
  refreshAll();
  routeFromHash();
}

/* ------------------------------------------------------------- motion hooks
   Stable names the motion layer attaches to. Each one is a no-op today, so
   the interface is complete and correct with GSAP absent or blocked.

   DOM anchors, all stable:
     .tile                 one per photo, data-status carries the state
     .tile__scan           the beam layer, driven by --scan
     .tile__original       the layer erased by --erase during the reveal
     .matrix               the wall, the Flip container
     .band-label           the group headers that appear at the end
     .ledger__amount       the number that counts up
     .inspector__stage     carries --split for the divider
     .split-handle         the divider grip
     .bar__fill            warm-up and queue progress fills
   -------------------------------------------------------------------------- */

const hooks = {
  onTilesAdded() {},
  onBatchComplete() {},
  onExportDone() {},
};

window.forge = {
  queue, engine, ledger, inspector, presets,
  hooks,
  tiles,
  notify,
  refreshAll,
  applyBands,
  /** Motion registers here: fn(from, to, onUpdate) drives the ledger number. */
  setLedgerAnimator(fn) { ledger.animate = fn; },
  /** Motion registers here: fn(percent) drives the inspector divider. */
  setSplitDriver(fn) { inspector.splitTo = fn; },
};

boot();
