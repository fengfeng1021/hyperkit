/* feed.js
   進紙口的完整狀態機（idle / hover / focus / dragover / reading / parsing /
   success / error / disabled）、解析管線、欄位對映精靈、編碼選擇器。
   狀態表見 docs/INTERACTION.md §3.1 與 §5。 */

import { $, el, esc, announce, notice, clearNotices } from './ui.js';
import { sniffBinary, decodeBuffer, tokenize, classify, autoMap, shapeHash, guessType, parseAmountCents, big5Supported, ENCODINGS } from './csv.js';
import { normalize, merge, categorize, aggregate } from './dataset.js';
import { lsGet, lsSet } from './storage.js';
import { int, ymd, money } from './format.js';

const FIELD_OPTIONS = [
  { v: 'ignore', t: '忽略這一欄' },
  { v: 'date', t: '日期' },
  { v: 'store', t: '店家名稱' },
  { v: 'amount', t: '金額' },
  { v: 'invoiceNo', t: '發票號碼' },
  { v: 'taxId', t: '統一編號' },
  { v: 'item', t: '品名' },
];

const LARGE_FILE = 40 * 1024 * 1024;

let ui = {};
let job = null;        // 目前進行中的解析工作
let lastBuffers = null; // 最近一次解析用的原始位元組，供「欄位對映不對？」重開精靈
let lastOpts = null;

export function initFeed(handlers) {
  ui = {
    slot: $('#feed-slot'),
    input: $('#feed-input'),
    pick: $('#pick-file'),
    hint: $('#feed-hint'),
    progress: $('#feed-progress'),
    notices: $('#feed-notices'),
    mapper: $('#column-mapper'),
    sampleBtn: $('#load-sample'),
    onReady: handlers.onReady,
  };

  ui.pick.addEventListener('click', () => ui.input.click());
  ui.input.addEventListener('change', () => {
    if (ui.input.files && ui.input.files.length) handleFiles([...ui.input.files]);
    ui.input.value = '';
  });

  // dragover 需要計數器抵銷子元素冒泡
  let depth = 0;
  ui.slot.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (slotState() === 'disabled') return;
    depth++;
    setSlotState('dragover');
  });
  ui.slot.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  ui.slot.addEventListener('dragleave', (e) => {
    e.preventDefault();
    depth = Math.max(0, depth - 1);
    if (depth === 0 && slotState() === 'dragover') setSlotState('idle');
  });
  ui.slot.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    if (slotState() === 'disabled') return;
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) handleFiles(files); else setSlotState('idle');
  });

  ui.sampleBtn.addEventListener('click', () => loadSample());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && job && !job.cancelled) cancelJob();
  });

  return { handleFiles, loadSample, setSlotState, reopenMapper, canReopenMapper };
}

function slotState() { return ui.slot.getAttribute('data-state') || 'idle'; }

export function setSlotState(name, opts = {}) {
  ui.slot.setAttribute('data-state', name);
  ui.slot.setAttribute('aria-disabled', name === 'disabled' ? 'true' : 'false');
  ui.slot.setAttribute('aria-busy', name === 'reading' || name === 'parsing' ? 'true' : 'false');
  if (name === 'dragover') ui.hint.textContent = '放開就開始解析';
  else if (name === 'idle' || name === 'error') ui.hint.textContent = '把 CSV 拖到這裡';
  if (opts.clearProgress !== false && name !== 'reading' && name !== 'parsing') ui.progress.innerHTML = '';
}

/* ---------------- 進度顯示 ---------------- */

function renderProgress({ phase, fileIndex, fileTotal, fileName, read, ok, skipped, percent, warnSlow }) {
  const pct = Math.max(0, Math.min(100, percent || 0));
  ui.progress.innerHTML = `
    <div class="feed-tape" role="status">
      <p class="feed-tape-head">
        <span class="feed-phase">${phase === 'reading' ? `讀取檔案 ${fileIndex}/${fileTotal}` : '解析中'}</span>
        <span class="feed-file num">${esc(fileName || '')}</span>
      </p>
      <dl class="feed-counts">
        <div><dt>已讀</dt><dd class="num">${int(read || 0)} 列</dd></div>
        <div><dt>成功</dt><dd class="num">${int(ok || 0)}</dd></div>
        <div><dt>跳過</dt><dd class="num">${int(skipped || 0)}</dd></div>
      </dl>
      <div class="feed-bar"><span class="feed-bar-fill" style="width:${pct}%"></span></div>
      ${warnSlow ? '<p class="feed-slow">解析中，畫面可能略為停頓。</p>' : ''}
      <button type="button" class="btn btn-ghost btn-sm feed-cancel">取消解析</button>
    </div>`;
  const cancel = ui.progress.querySelector('.feed-cancel');
  if (cancel) cancel.addEventListener('click', cancelJob);
}

function cancelJob() {
  if (!job) return;
  job.cancelled = true;
  job = null;
  setSlotState('idle');
  announce('已取消解析');
}

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

/* ---------------- 主流程 ---------------- */

export async function handleFiles(files, opts = {}) {
  if (job && !job.cancelled) return;
  clearNotices(ui.notices);
  ui.mapper.innerHTML = '';
  ui.mapper.hidden = true;

  const csvish = files.filter((f) => /\.csv$|\.txt$/i.test(f.name) || f.type === 'text/csv');
  const others = files.filter((f) => !csvish.includes(f));

  const big = files.find((f) => f.size > LARGE_FILE);
  if (big && !opts.confirmedLarge) {
    setSlotState('error');
    ui.notices.append(notice({
      tone: 'info',
      title: `這個檔 ${(big.size / 1024 / 1024).toFixed(0)} MB，比預期大很多。`,
      body: '解析會花一點時間，也可能吃掉不少記憶體。你可以先確認匯出的年度範圍是不是選太寬。',
      actions: [
        { label: '仍要解析', primary: true, onClick: () => { clearNotices(ui.notices); handleFiles(files, { ...opts, confirmedLarge: true }); } },
        { label: '取消', onClick: () => { clearNotices(ui.notices); setSlotState('idle'); } },
      ],
      dismissible: false,
    }));
    return;
  }

  job = { cancelled: false };
  const myJob = job;
  setSlotState('reading');

  const buffers = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    renderProgress({ phase: 'reading', fileIndex: i + 1, fileTotal: files.length, fileName: f.name, percent: (i / files.length) * 100 });
    // eslint-disable-next-line no-await-in-loop
    const buf = await f.arrayBuffer();
    if (myJob.cancelled) return;
    buffers.push({ name: f.name, buffer: buf, size: f.size });
  }

  if (!csvish.length && others.length) {
    const first = buffers[0];
    const kind = sniffBinary(new Uint8Array(first.buffer));
    failWith({
      title: kind ? `這是一個${kind.label}，不是 CSV。` : `「${first.name}」看起來不是 CSV。`,
      body: '請到財政部電子發票整合服務平台的載具明細下載頁，格式選 CSV 再匯出一次。',
      files,
    });
    return;
  }

  await runParse(buffers.filter((b) => csvish.some((c) => c.name === b.name)) , { ...opts, myJob });
}

async function runParse(buffers, opts) {
  const myJob = opts.myJob || job;
  setSlotState('parsing');
  lastBuffers = buffers;
  lastOpts = { encoding: opts.encoding, source: opts.source };

  let allInvoices = [];
  let totalRead = 0, totalOk = 0, totalSkipped = 0, totalDup = 0, anomalies = 0;
  const badRows = [];
  const skippedRows = [];
  const fileNames = [];
  const warnSlow = buffers.some((b) => b.size > 4 * 1024 * 1024);

  for (let i = 0; i < buffers.length; i++) {
    const { name, buffer } = buffers[i];

    const bin = sniffBinary(new Uint8Array(buffer));
    if (bin) {
      failWith({
        title: `「${name}」是一個${bin.label}，不是 CSV。`,
        body: '請到載具專區選「消費明細下載」，格式選 CSV。',
      });
      return;
    }

    const dec = decodeBuffer(buffer, opts.encoding);
    if (!dec.forced && dec.ok === false) {
      openEncodingPicker({ name, buffer, dec, buffers, opts });
      return;
    }

    const rows = tokenize(dec.text);
    totalRead += rows.length;
    const cls = classify(rows);
    skippedRows.push(...cls.skipped.map((s) => ({ ...s, file: name })));

    if (!cls.main.length) {
      failWith({
        title: `「${name}」裡面找不到任何發票主檔列。`,
        body: '財政部的消費明細 CSV 每一列會以 M 或 D 開頭。如果你匯出的是「中獎發票」或「載具歸戶清單」，那份檔案沒有消費明細。',
        detail: {
          label: '看看這個檔的前幾列長什麼樣',
          html: `<pre class="raw-preview">${esc(rows.slice(0, 6).map((r) => r.join(',')).join('\n'))}</pre>`,
        },
      });
      return;
    }

    const hash = shapeHash(cls.main);
    const cached = lsGet(`colmap:${hash}`);
    const mapping = opts.mapping || cached || autoMap(cls.main, cls.detail);

    if (!mapping) {
      openMapper({ name, cls, hash, buffers, opts });
      return;
    }

    // 分塊正規化，每塊讓出主執行緒一次，進度是真的
    const CHUNK = 400;
    const chunks = [];
    for (let s = 0; s < cls.main.length; s += CHUNK) chunks.push(cls.main.slice(s, s + CHUNK));

    let acc = { invoices: [], bad: [], anomalies: 0 };
    for (let c = 0; c < chunks.length; c++) {
      const part = normalize({ main: chunks[c], detail: [] }, mapping, opts.source || 'user');
      acc.invoices.push(...part.invoices);
      acc.bad.push(...part.bad);
      acc.anomalies += part.anomalies;
      renderProgress({
        phase: 'parsing', fileIndex: i + 1, fileTotal: buffers.length, fileName: name,
        read: totalRead, ok: totalOk + acc.invoices.length, skipped: totalSkipped + acc.bad.length + skippedRows.length,
        percent: ((i + (c + 1) / chunks.length) / buffers.length) * 100,
        warnSlow,
      });
      // eslint-disable-next-line no-await-in-loop
      if (c % 3 === 2) await yieldFrame();
      if (myJob && myJob.cancelled) return;
    }

    // 明細列一次掛回主檔
    const byId = new Map(acc.invoices.map((iv) => [iv.id, iv]));
    const dm = mapping.detail;
    if (dm && dm.invoiceNo >= 0) {
      for (const { cells } of cls.detail) {
        const id = (cells[dm.invoiceNo] || '').trim().replace(/\s|-/g, '');
        const inv = byId.get(id);
        if (!inv) continue;
        const sub = dm.subtotal >= 0 ? parseAmountCents(cells[dm.subtotal]) : null;
        inv.items.push({
          name: (dm.item >= 0 ? (cells[dm.item] || '').trim() : '') || '未載明品名',
          subCents: sub == null ? 0 : sub,
        });
      }
    }

    badRows.push(...acc.bad.map((b) => ({ ...b, file: name })));
    anomalies += acc.anomalies;
    totalOk += acc.invoices.length;

    const merged = merge(allInvoices, acc.invoices);
    allInvoices = merged.invoices;
    totalDup += merged.duplicates;
    fileNames.push(name);

    if (mapping.auto || opts.remember) lsSet(`colmap:${hash}`, { main: mapping.main, detail: mapping.detail });
  }

  totalSkipped = badRows.length + skippedRows.length;

  if (!allInvoices.length) {
    failWith({
      title: '這個檔沒有解析出任何一筆消費。',
      body: '可能是欄位對不上。你可以自己指定哪一欄是日期、店家、金額。',
      actions: [{ label: '開啟欄位對映精靈', primary: true, onClick: () => openMapperManually(buffers, opts) }],
    });
    return;
  }

  categorize(allInvoices);
  const summary = aggregate(allInvoices, { source: opts.source || 'user', fileCount: buffers.length });

  const report = {
    read: totalRead, ok: totalOk, skipped: totalSkipped,
    badRows, skippedRows, duplicates: totalDup, anomalies,
    files: fileNames, encoding: opts.encoding || 'auto',
  };

  job = null;
  setSlotState('success');

  if (summary.count < 10) {
    ui.notices.append(notice({
      tone: 'info',
      title: `讀到 ${summary.count} 筆消費。年度回顧需要至少 10 筆才有東西可講。`,
      body: '已讀到的資料仍然列在下方明細表裡，不會浪費你的操作。',
      actions: [
        { label: '載入範例資料看看完整版', primary: true, onClick: () => loadSample() },
        { label: '再匯入一個檔案', onClick: () => ui.input.click() },
      ],
      dismissible: false,
    }));
  }

  ui.onReady({ invoices: allInvoices, summary, source: opts.source || 'user', files: fileNames, parseReport: report });

  const span = summary.firstDate && summary.lastDate
    ? `，涵蓋 ${ymd(summary.firstDate)} 到 ${ymd(summary.lastDate)}` : '';
  announce(`解析完成，${summary.count} 筆消費${span}`);
}

function failWith({ title, body, detail, actions, files }) {
  job = null;
  setSlotState('error');
  ui.notices.append(notice({
    tone: 'error',
    title,
    body,
    detail,
    dismissible: false,
    actions: actions || [
      { label: '重試', primary: true, onClick: () => { clearNotices(ui.notices); setSlotState('idle'); ui.input.click(); } },
      { label: '看下載步驟', onClick: () => { document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
      { label: '載入範例資料', onClick: () => loadSample() },
    ],
  }));
  announce(title);
}

/* ---------------- 範例資料 ---------------- */

export async function loadSample(file = 'assets/sample-invoice.csv') {
  const btn = ui.sampleBtn;
  const restore = btn ? btn.innerHTML : '';
  if (btn) {
    btn.style.width = `${btn.offsetWidth}px`;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="print-head" aria-hidden="true"></span><span>載入範例資料中</span>';
  }
  clearNotices(ui.notices);
  try {
    const res = await fetch(file, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const buffer = await res.arrayBuffer();
    job = { cancelled: false };
    await runParse([{ name: file.split('/').pop(), buffer, size: buffer.byteLength }],
      { source: 'sample', myJob: job });
  } catch (err) {
    job = null;
    setSlotState('error');
    ui.notices.append(notice({
      tone: 'error',
      title: `找不到範例檔案 ${file}。`,
      body: '這通常代表這份靜態網站被搬動時漏了 assets 資料夾，或是你正用 file:// 直接開啟頁面。請改用任何一個本機靜態伺服器開啟。',
      dismissible: false,
    }));
    announce('範例資料載入失敗');
  } finally {
    if (btn) {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      btn.innerHTML = restore;
      btn.style.width = '';
    }
  }
}

/* ---------------- 編碼選擇器 ---------------- */

function openEncodingPicker({ name, dec, buffers, opts }) {
  job = null;
  setSlotState('error');
  const host = el('div', { class: 'panel-inline' });
  const missing = !big5Supported();
  host.innerHTML = `
    <p class="panel-title">「${esc(name)}」的文字編碼無法自動判斷。</p>
    <p class="panel-text">${missing
      ? '這個瀏覽器不支援 Big5 解碼。如果你的檔案是 Big5，請先用試算表另存成 UTF-8 的 CSV 再匯入。'
      : '你可以手動指定編碼，或用試算表另存成 UTF-8 的 CSV 再匯入。選對的那一個，下面的預覽會是可讀的中文。'}</p>
    <div class="enc-list" role="radiogroup" aria-label="選擇文字編碼"></div>
    <div class="panel-actions">
      <button type="button" class="btn btn-primary" id="enc-apply" disabled>套用這個編碼並解析</button>
      <button type="button" class="btn btn-ghost" id="enc-cancel">取消</button>
    </div>`;

  const list = host.querySelector('.enc-list');
  let chosen = null;
  ENCODINGS.filter((e) => e.id !== 'big5' || !missing).forEach((e) => {
    const cand = dec.candidates.find((c) => c.id === e.id || (e.id === 'utf-8-bom' && c.id === 'utf-8'));
    const item = el('label', { class: 'enc-item' });
    item.innerHTML = `
      <input type="radio" name="enc" value="${e.id}">
      <span class="enc-name">${e.label}</span>
      <pre class="enc-preview">${esc(cand ? cand.preview : '（無法預覽）')}</pre>`;
    item.querySelector('input').addEventListener('change', () => {
      chosen = e.id;
      host.querySelector('#enc-apply').disabled = false;
    });
    list.append(item);
  });

  host.querySelector('#enc-apply').addEventListener('click', () => {
    ui.mapper.innerHTML = ''; ui.mapper.hidden = true;
    job = { cancelled: false };
    runParse(buffers, { ...opts, encoding: chosen, myJob: job });
  });
  host.querySelector('#enc-cancel').addEventListener('click', () => {
    ui.mapper.innerHTML = ''; ui.mapper.hidden = true; setSlotState('idle');
  });

  ui.mapper.innerHTML = '';
  ui.mapper.hidden = false;
  ui.mapper.append(host);
  announce('無法自動判斷文字編碼，請手動選擇');
}

/* ---------------- 欄位對映精靈 ---------------- */

export function canReopenMapper() {
  return !!(lastBuffers && lastBuffers.length);
}

/** 使用者主動說「欄位對映不對」時，用最近一次的原始位元組重開精靈 */
export function reopenMapper() {
  openMapperManually(lastBuffers, lastOpts || {});
}

export async function openMapperManually(buffers, opts = {}) {
  if (!buffers || !buffers.length) return;
  clearNotices(ui.notices);
  const dec = decodeBuffer(buffers[0].buffer, opts.encoding);
  const cls = classify(tokenize(dec.text));
  if (!cls.main.length) return;
  openMapper({ name: buffers[0].name, cls, hash: shapeHash(cls.main), buffers, opts, manual: true });
  ui.mapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function openMapper({ name, cls, hash, buffers, opts, manual }) {
  job = null;
  if (!manual) setSlotState('error');

  const width = cls.main.reduce((w, r) => Math.max(w, r.cells.length), 0);
  const sample = cls.main.slice(0, 8);
  const guesses = [];
  for (let c = 0; c < width; c++) {
    guesses.push(guessType(cls.main.slice(0, 40).map((r) => r.cells[c] || '')));
  }

  const assign = new Array(width).fill('ignore');
  const auto = autoMap(cls.main, cls.detail);
  if (auto) {
    for (const [field, idx] of Object.entries(auto.main)) if (idx >= 0) assign[idx] = field;
  } else {
    guesses.forEach((g, i) => {
      if (['date', 'amount', 'invoiceNo', 'taxId'].includes(g.type)) assign[i] = g.type;
    });
  }

  const host = el('div', { class: 'mapper' });
  host.innerHTML = `
    <h3 class="panel-title">${manual ? `「${esc(name)}」的欄位對映` : `認不出「${esc(name)}」的欄位。`}</h3>
    <p class="panel-text">${manual
      ? '下面是這個檔案的前 8 列。把每一欄改成它真正的用途，下方會即時預覽會解析出什麼。'
      : '財政部改過格式時會這樣。請指定哪一欄是日期、店家、金額。指定完下面會即時預覽會解析出什麼。'}</p>
    <div class="mapper-grid" role="group" aria-label="欄位對映"></div>
    <h4 class="mapper-sub">依這個對映，會解析出這樣的 3 筆資料</h4>
    <div class="mapper-preview"></div>
    <div class="panel-actions">
      <button type="button" class="btn btn-primary" id="map-apply">套用並解析</button>
      <label class="checkbox"><input type="checkbox" id="map-remember" checked><span>記住這個格式</span></label>
      <span class="mapper-missing" id="map-missing"></span>
    </div>`;

  const grid = host.querySelector('.mapper-grid');
  grid.style.setProperty('--cols', String(width));

  for (let c = 0; c < width; c++) {
    const col = el('div', { class: 'mapper-col' });
    const id = `mapcol-${c}`;
    const select = el('select', { class: 'select', id, 'aria-label': `第 ${c + 1} 欄的用途` });
    FIELD_OPTIONS.forEach((o) => {
      const opt = el('option', { value: o.v, text: o.t });
      if (assign[c] === o.v) opt.selected = true;
      select.append(opt);
    });
    select.addEventListener('change', () => { assign[c] = select.value; refresh(); });
    col.append(select);
    col.append(el('p', { class: 'mapper-hint', text: guesses[c].hint }));
    const cells = el('div', { class: 'mapper-cells' });
    sample.forEach((r) => cells.append(el('div', { class: 'mapper-cell num', text: (r.cells[c] || '').slice(0, 24) })));
    col.append(cells);
    grid.append(col);
  }

  const preview = host.querySelector('.mapper-preview');
  const applyBtn = host.querySelector('#map-apply');
  const missingEl = host.querySelector('#map-missing');

  function currentMapping() {
    const m = { date: -1, store: -1, amount: -1, invoiceNo: -1, taxId: -1 };
    assign.forEach((f, i) => { if (f !== 'ignore' && f !== 'item' && m[f] === -1) m[f] = i; });
    const d = autoMap(cls.main, cls.detail);
    return { main: m, detail: d ? d.detail : null };
  }

  function refresh() {
    const mapping = currentMapping();
    const missing = [];
    if (mapping.main.date < 0) missing.push('日期');
    if (mapping.main.amount < 0) missing.push('金額');
    applyBtn.disabled = missing.length > 0;
    missingEl.textContent = missing.length ? `還缺：${missing.join('、')}` : '';

    const test = normalize({ main: sample.slice(0, 3), detail: [] }, mapping, 'user');
    preview.innerHTML = test.invoices.length
      ? test.invoices.map((iv) => `
          <div class="receipt-row receipt-row--preview">
            <span class="rr-date num">${esc(ymd(iv.date))}</span>
            <span class="rr-store">${esc(iv.store)}</span>
            <span class="rr-amt num">${esc(money(iv.amountCents, { noCents: true }))}</span>
            <span class="rr-id num">${esc(iv.id)}</span>
          </div>`).join('')
      : `<p class="mapper-empty">${esc(test.bad[0]?.reason || '這個對映還解析不出東西。')}</p>`;
  }

  applyBtn.addEventListener('click', () => {
    const mapping = currentMapping();
    const remember = host.querySelector('#map-remember').checked;
    if (remember) lsSet(`colmap:${hash}`, mapping);
    ui.mapper.innerHTML = ''; ui.mapper.hidden = true;
    clearNotices(ui.notices);
    job = { cancelled: false };
    runParse(buffers, { ...opts, mapping, remember, myJob: job });
  });

  refresh();
  ui.mapper.innerHTML = '';
  ui.mapper.hidden = false;
  ui.mapper.append(host);
  announce('已開啟欄位對映精靈');
  host.querySelector('select')?.focus();
}
