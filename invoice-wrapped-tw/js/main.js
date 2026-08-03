/* main.js
   ES module entry。把所有東西接起來，並負責解析報告、儲存、快捷鍵與模式切換。 */

import { $, $$, el, esc, announce, notice } from './ui.js';
import { icon, barcodeMark } from './icons.js';
import { startMonitor, renderPanel } from './privacy.js';
import { initFeed, loadSample } from './feed.js';
import { state, setData, clearData, hasData, on, addFilter, removeFilter, clearFilters, filtered } from './state.js';
import { createHeatmap, createLineChart, createFlow } from './charts.js';
import { createBubbleField } from './bubbles.js';
import { createLedger } from './ledger.js';
import { createCashback } from './cashback.js';
import { createReview } from './review.js';
import { money, int, pct, ymd } from './format.js';
import { storageState, saveYear, listYears, deleteYear, lsFootprint, lsClearAll, lsGet, lsSet } from './storage.js';
import { CATEGORIES, FALLBACK_CATEGORY, categoryById } from './rules.js';
import { tokenize, classify, autoMap, decodeBuffer } from './csv.js';
import { normalize, categorize, aggregate } from './dataset.js';
import { initMotion } from './motion.js';

/* ---------------- 站頭裝飾（自繪，不是字元） ---------------- */
$('#wordmark-mark').innerHTML = barcodeMark(14);
$$('[data-icon]').forEach((n) => { n.innerHTML = icon(n.dataset.icon, +(n.dataset.iconSize || 16)); });

/* ---------------- 固定層的實際高度 ----------------
   全站只有兩層會黏在視窗頂端：站頭，以及範例資料標記帶（只在跑範例時存在）。
   它們的高度由內容決定（字級、視窗寬度、標記帶在不在），所以量出來寫回 CSS 變數，
   讓 html 的 scroll-padding-top 與標記帶的 top 都跟著實際佈局走，而不是猜一個常數。
   工具列不黏，它屬於儀表板的內容，捲走就該讓它捲走。 */
const stickyChrome = (() => {
  const root = document.documentElement;
  const nav = $('.masthead');
  const strip = $('#sample-strip');
  let last = '';

  const measure = () => {
    const navH = nav ? nav.getBoundingClientRect().height : 0;
    const stripH = strip && !strip.hidden ? strip.getBoundingClientRect().height : 0;
    const key = `${navH}|${stripH}`;
    if (key === last) return;
    last = key;
    root.style.setProperty('--masthead-h', `${navH}px`);
    root.style.setProperty('--sticky-h', `${navH + stripH}px`);
  };

  measure();
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(measure);
    if (nav) ro.observe(nav);
    if (strip) ro.observe(strip);
  }
  addEventListener('resize', measure, { passive: true });
  if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {});
  return measure;
})();

/* ---------------- 離線監測 ---------------- */
startMonitor();
renderPanel($('#privacy-panel-body'));
renderPanel($('#offline-list'));

const privacyBtn = $('#privacy-dot');
const privacyPanel = $('#privacy-panel');
privacyBtn.addEventListener('click', () => {
  const open = privacyPanel.hidden;
  privacyPanel.hidden = !open;
  privacyBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !privacyPanel.hidden) {
    privacyPanel.hidden = true;
    privacyBtn.setAttribute('aria-expanded', 'false');
    privacyBtn.focus();
  }
});
document.addEventListener('click', (e) => {
  if (privacyPanel.hidden) return;
  if (!privacyPanel.contains(e.target) && e.target !== privacyBtn && !privacyBtn.contains(e.target)) {
    privacyPanel.hidden = true;
    privacyBtn.setAttribute('aria-expanded', 'false');
  }
});

/* ---------------- 元件 ---------------- */

const heatmap = createHeatmap($('#heatmap-host'), {
  onSelect: (f) => { addFilter(f); },
  isSelected: (key) => state.filters.some((x) => x.key === key),
});
const line = createLineChart($('#line-host'));
const flow = createFlow($('#flow-host'));
const bubbles = createBubbleField($('#bubble-host'), { onPick: onBubblePick });
const ledger = createLedger($('#ledger-host'), {
  getRows: filtered,
  onClearFilters: () => clearFilters(),
  tagsHost: $('#ledger-tags'),
});
const cashback = createCashback($('#cashback-host'));
const review = createReview($('#review'), {
  onClose: () => { },
  onImportOther: () => { review.close(); $('#feed-input').click(); },
  onLoadSample2024: () => loadCompareSample(),
});

/* ---------------- 進紙口 ---------------- */

const feed = initFeed({
  onReady: (payload) => {
    setData(payload);
    persist(payload);
    reportParse(payload.parseReport);
    document.getElementById('dash')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
});

/* ---------------- 資料到位後的渲染 ---------------- */

on('data', () => {
  const s = state.summary;
  document.body.dataset.mode = hasData() ? 'data' : 'empty';
  renderStats(s);
  renderSampleStrip();
  heatmap.render(s);
  line.render(s);
  flow.render(s);
  bubbles.render(s);
  cashback.render(s);
  ledger.refresh();
  renderToolbar();
  $('#store-detail').hidden = true;

  // 資料太少時不假裝有故事可講：主 CTA 停用並說明原因
  const openBtn = $('#open-review');
  const note = $('.review-cta-note');
  const thin = hasData() && s.count < 10;
  openBtn.disabled = thin;
  openBtn.setAttribute('aria-disabled', String(thin));
  note.textContent = thin
    ? `目前只有 ${int(s.count)} 筆。年度回顧需要至少 10 筆才有東西可講，再匯入一個檔案就會解鎖。`
    : '十屏敘事，最後一屏產出一張 1080 × 1920 的直式圖卡。按 G 再按 W 也可以打開。';
});

on('filter', () => {
  ledger.renderTags(state.filters, (k) => removeFilter(k));
  ledger.refresh();
  heatmap.refreshSelection();
});

/* ---------------- 年度數列 ---------------- */

function renderStats(s) {
  const map = {
    total: s ? money(s.totalCents, { noCents: true }) : '- - -',
    count: s ? `${int(s.count)}` : '- - -',
    stores: s ? `${int(s.storeCount)}` : '- - -',
    avg: s ? money(s.avgCents, { noCents: true }) : '- - -',
    max: s && s.biggest ? money(s.biggest.amountCents, { noCents: true }) : '- - -',
    top: s && s.champion ? s.champion.name : '- - -',
  };
  Object.entries(map).forEach(([k, v]) => {
    const node = $(`[data-stat="${k}"]`);
    if (!node) return;
    node.textContent = v;
    node.classList.toggle('is-placeholder', !s);
    node.dataset.value = s ? String(numericFor(k, s)) : '0';
  });
  fitStatValues();
  const cap = $('#stat-caption');
  if (cap) {
    cap.textContent = s
      ? `${s.year} 年，${ymd(s.firstDate)} 到 ${ymd(s.lastDate)}，${int(s.activeDays)} 天有消費。`
      : '資料進來以後，這六格會被真實數字取代。現在它們是空的，因為這個站還不知道你的任何事。';
  }
}

/* 六格共用一個字級：量出這六串裡最寬的一串佔幾個字級的寬度（比值與字級無關），
   交給 CSS 跟設計上限取小值。這樣 NT$327,541 不會被折成三行，
   六格也不會各自縮成不同大小。店名那格是文字不是數字，不參與。 */
function fitStatValues() {
  const strip = $('#stat-strip');
  if (!strip) return;
  let widest = 0;
  $$('.stat-value', strip).forEach((node) => {
    if (node.closest('.stat--text')) return;
    const text = (node.textContent || '').trim();
    if (!text) return;
    const probe = node.cloneNode(true);
    probe.removeAttribute('data-stat');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;'
      + 'white-space:nowrap;width:max-content;font-size:100px';
    node.parentElement.append(probe);
    widest = Math.max(widest, probe.getBoundingClientRect().width);
    probe.remove();
  });
  // 多留 4%：這六格中間有 hairline 分隔線，字貼著線走是難看的
  if (widest > 0) strip.style.setProperty('--num-em', ((widest / 100) * 1.04).toFixed(3));
}
if (document.fonts?.ready) document.fonts.ready.then(fitStatValues).catch(() => {});

function numericFor(k, s) {
  return { total: s.totalCents / 100, count: s.count, stores: s.storeCount, avg: s.avgCents / 100, max: s.biggest?.amountCents / 100 || 0, top: 0 }[k] || 0;
}

/* ---------------- 範例資料標記帶 ---------------- */

function renderSampleStrip() {
  const strip = $('#sample-strip');
  if (state.source !== 'sample' || !hasData()) { strip.hidden = true; stickyChrome(); return; }
  strip.hidden = false;
  $('#sample-strip-text').textContent =
    `目前顯示的是範例資料（${state.summary.year} 年，${int(state.summary.count)} 筆虛構消費）`;
  // 標記帶出現／消失會改變固定層總高，捲動讓位的距離必須同步跟上
  stickyChrome();
}
$('#sample-swap').addEventListener('click', () => $('#feed-input').click());

/* ---------------- 工具列 ---------------- */

function renderToolbar() {
  const bar = $('#dash-toolbar');
  bar.innerHTML = '';
  if (!hasData()) return;
  const s = state.summary;

  bar.append(el('p', { class: 'toolbar-meta num' }, [
    el('span', { text: `${s.year} 年` }),
    el('span', { text: `${int(s.count)} 筆` }),
    el('span', { text: state.files.join('、') || '範例資料' }),
  ]));

  const actions = el('div', { class: 'toolbar-actions' });
  const swap = el('button', { type: 'button', class: 'btn btn-ghost', text: '換一個檔案' });
  swap.addEventListener('click', () => $('#feed-input').click());
  const sample = el('button', { type: 'button', class: 'btn btn-ghost', text: '換成範例資料' });
  sample.addEventListener('click', () => loadSample());
  const remap = el('button', { type: 'button', class: 'btn btn-ghost', text: '欄位對映不對？手動指定' });
  remap.disabled = !feed.canReopenMapper();
  remap.addEventListener('click', () => {
    feed.reopenMapper();
    document.getElementById('feed-slot')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  const wipe = el('button', { type: 'button', class: 'btn btn-ghost', text: '清除這份資料' });
  wipe.addEventListener('click', () => {
    clearData();
    feed.setSlotState('idle');
    announce('已清除記憶體中的資料');
    document.getElementById('feed-slot')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  actions.append(swap, sample, remap, wipe);
  bar.append(actions);
}

/* ---------------- 泡泡點選 → 店家詳情 ---------------- */

function onBubblePick(node) {
  const box = $('#store-detail');
  if (!node) { box.hidden = true; return; }
  const rows = state.invoices
    .filter((inv) => (node.rest ? node.members.some((m) => m.name === inv.store) : inv.store === node.name))
    .sort((a, b) => b.ts - a.ts);
  box.hidden = false;
  box.innerHTML = `
    <div class="sd-head">
      <h3 class="sd-name">${esc(node.name)}</h3>
      <p class="sd-meta num">${money(node.cents, { noCents: true })}　${int(node.count)} 次　佔全年 ${pct(node.cents, state.summary.totalCents, 1)}</p>
    </div>
    <div class="sd-rows">${rows.slice(0, 400).map((inv, i) => `
      <div class="receipt-row${(i + 1) % 5 === 0 ? ' has-rule' : ''}">
        <span class="rr-date num">${esc(ymd(inv.date).slice(5))}</span>
        <span class="rr-store">${esc(inv.items[0]?.name || inv.store)}</span>
        <span class="rr-amt num">${esc(money(inv.amountCents, { noCents: true }))}</span>
        <span class="rr-id num">${esc(inv.id)}</span>
      </div>`).join('')}</div>`;
  const close = el('button', { type: 'button', class: 'sd-close', 'aria-label': '關閉店家詳情', html: icon('close', 14) });
  close.addEventListener('click', () => { box.hidden = true; });
  box.prepend(close);

  // 未命中分類規則的店家可以手動歸類。這比藏一份黑箱分類表誠實。
  if (!node.rest) {
    const current = state.invoices.find((inv) => inv.store === node.name);
    const picker = el('label', { class: 'sd-cat' }, [el('span', { text: '歸到' })]);
    const sel = el('select', { class: 'select select-cat', 'aria-label': `把 ${node.name} 歸到哪一個分類` });
    const manual = (lsGet('cat', {}) || {})[node.name];
    sel.append(el('option', { value: 'auto', text: '依規則自動判定', selected: !manual }));
    [...CATEGORIES, FALLBACK_CATEGORY].forEach((c) => {
      const o = el('option', { value: c.id, text: c.name });
      if (manual === c.id) o.selected = true;
      else if (!manual && current && current.category === c.id) o.textContent = `${c.name}（目前）`;
      sel.append(o);
    });
    sel.addEventListener('change', () => {
      const map = lsGet('cat', {}) || {};
      if (sel.value === 'auto') delete map[node.name]; else map[node.name] = sel.value;
      lsSet('cat', map);
      recategorize();
      announce(sel.value === 'auto'
        ? `${node.name} 改回依規則判定`
        : `已把 ${node.name} 歸到${categoryById(sel.value).name}`);
    });
    picker.append(sel);
    box.querySelector('.sd-head').append(picker);
  }

  const key = `store:${node.name}`;
  const filterBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: '只看這家店的明細' });
  filterBtn.addEventListener('click', () => {
    addFilter({
      key, type: 'store', label: node.name,
      test: (inv) => (node.rest ? node.members.some((m) => m.name === inv.store) : inv.store === node.name),
    });
    $('#ledger-host').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  box.querySelector('.sd-head').append(filterBtn);
}

/** 手動分類改變後，就地重跑分類與彙總（不重新解析檔案） */
function recategorize() {
  if (!hasData()) return;
  categorize(state.invoices);
  const summary = aggregate(state.invoices, { source: state.source, fileCount: state.files.length });
  setData({
    invoices: state.invoices,
    summary,
    source: state.source,
    files: state.files,
    parseReport: state.parseReport,
  });
}

/* ---------------- 解析報告 ---------------- */

function reportParse(r) {
  const host = $('#parse-report');
  host.innerHTML = '';
  if (!r) return;

  if (r.skipped > 0) {
    const list = [...r.badRows, ...r.skippedRows].slice(0, 60);
    host.append(notice({
      tone: 'info',
      title: `讀進 ${int(r.read)} 列，成功 ${int(r.ok)} 筆，跳過 ${int(r.skipped)} 列。`,
      body: '跳過的多半是檔頭說明列。如果數量不對，可以展開看原始文字。',
      detail: {
        label: '看看跳過了什麼',
        html: `<ul class="skip-list">${list.map((b) => `
          <li><span class="skip-line num">第 ${b.line} 列</span>
              <span class="skip-reason">${esc(b.reason)}</span>
              <code class="skip-raw">${esc((b.raw || '').slice(0, 90))}</code></li>`).join('')}
          ${r.skipped > list.length ? `<li class="skip-more">還有 ${int(r.skipped - list.length)} 列沒有列出。</li>` : ''}</ul>`,
      },
    }));
  }

  if (r.duplicates > 0) {
    host.append(notice({
      tone: 'info',
      title: `合併了 ${int(r.files.length)} 個檔案，其中 ${int(r.duplicates)} 筆重複（同一張發票號碼）已略過。`,
      body: '重複只計一次主檔金額，所以總額不會被灌水。',
    }));
  }

  if (r.anomalies > 0) {
    host.append(notice({
      tone: 'error',
      title: `${int(r.anomalies)} 筆金額異常（負數或超過 10 億），已列入明細但不計入統計。`,
      body: '這通常是折讓或作廢的發票。你可以在明細表用搜尋找到它們。',
    }));
  }

  if (!storageState.persistent) {
    const fp = lsFootprint();
    host.append(notice({
      tone: 'info',
      title: `瀏覽器不讓這個頁面儲存設定：${storageState.reason}。`,
      body: '這次的分析照常運作，但欄位對映與費率設定不會被記住。',
      actions: [{ label: `清除本站舊資料（${fp.keys} 筆）`, onClick: () => { lsClearAll(); announce('已清除本站儲存的設定'); } }],
    }));
  }
}

/* ---------------- 儲存與年度比較 ---------------- */

async function persist(payload) {
  const res = await saveYear(payload.summary.year, {
    summary: stripForStorage(payload.summary),
    invoices: null,
    source: payload.source,
  });
  if (res && res.ok === false && res.reason) {
    $('#parse-report').append(notice({ tone: 'info', title: res.reason, body: '你可以在頁尾的「已保存的年度」清單刪掉舊的年度。' }));
  }
  refreshYears();
}

/** IndexedDB 只留彙總，不留逐筆原始列 */
function stripForStorage(s) {
  return {
    ...s,
    byStore: s.byStore.slice(0, 60).map(({ visits, ...rest }) => rest),
    byStoreCount: undefined,
    byDay: undefined,
    champion: s.champion ? { ...s.champion, visits: s.champion.visits.map((v) => ({ ts: v.ts, cents: v.cents })) } : null,
    biggest: s.biggest ? { ...s.biggest, items: s.biggest.items.slice(0, 8) } : null,
  };
}

async function refreshYears() {
  const host = $('#saved-years');
  const years = await listYears();
  host.innerHTML = '';
  if (!years.length) {
    host.append(el('p', { class: 'section-text', text: '這台裝置上還沒有保存任何年度。跑完一次分析就會自動存下彙總（不含逐筆原始列）。' }));
    return;
  }
  years.forEach((y) => {
    const row = el('div', { class: 'receipt-row receipt-row--year' }, [
      el('span', { class: 'rr-date num', text: String(y.year) }),
      el('span', { class: 'rr-store', text: y.source === 'sample' ? '範例資料' : '你的檔案' }),
      el('span', { class: 'rr-amt num', text: money(y.summary.totalCents, { noCents: true }) }),
    ]);
    const del = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '刪除' });
    del.addEventListener('click', async () => { await deleteYear(y.year); refreshYears(); announce(`已刪除 ${y.year} 年的保存資料`); });
    row.append(del);
    host.append(row);
  });

  // 有第二個年度就解鎖比較章節
  if (state.summary) {
    const other = years.find((y) => y.year !== state.summary.year);
    review.setCompare(other ? other.summary : null);
  }
}
refreshYears();

async function loadCompareSample() {
  try {
    const res = await fetch('assets/sample-invoice-2024.csv', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const buf = await res.arrayBuffer();
    const dec = decodeBuffer(buf);
    const cls = classify(tokenize(dec.text));
    const mapping = autoMap(cls.main, cls.detail);
    const norm = normalize(cls, mapping, 'sample');
    categorize(norm.invoices);
    const summary = aggregate(norm.invoices, { source: 'sample', fileCount: 1 });
    await saveYear(summary.year, { summary: stripForStorage(summary), invoices: null, source: 'sample' });
    review.setCompare(summary);
    refreshYears();
    announce(`已載入 ${summary.year} 年範例資料，年度比較已解鎖`);
  } catch {
    announce('2024 年範例資料載入失敗');
    $('#parse-report').append(notice({
      tone: 'error',
      title: '找不到 assets/sample-invoice-2024.csv。',
      body: '這份靜態網站的 assets 資料夾可能不完整，或是頁面用 file:// 開啟。請改用本機靜態伺服器開啟。',
    }));
  }
}

/* ---------------- 年度回顧入口 ---------------- */

$('#open-review').addEventListener('click', (e) => {
  if (!hasData()) return;
  review.open(state.summary, state.source === 'sample', { opener: e.currentTarget });
});

/* ---------------- 快捷鍵 ---------------- */

let gPressed = 0;
document.addEventListener('keydown', (e) => {
  const t = e.target;
  const tag = (t.tagName || '').toLowerCase();
  if (['input', 'select', 'textarea'].includes(tag) || t.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === '/') { e.preventDefault(); if (hasData()) ledger.focusSearch(); return; }
  if (e.key === '?') { e.preventDefault(); toggleShortcuts(); return; }
  if (e.key.toLowerCase() === 'g') { gPressed = Date.now(); return; }
  if (e.key.toLowerCase() === 'w' && Date.now() - gPressed < 1000) {
    gPressed = 0;
    if (hasData() && state.summary.count >= 10) {
      review.open(state.summary, state.source === 'sample', { opener: $('#open-review') });
    }
  }
});

function toggleShortcuts() {
  const p = $('#shortcuts');
  p.hidden = !p.hidden;
  $('#shortcuts-toggle').setAttribute('aria-expanded', String(!p.hidden));
  if (!p.hidden) p.querySelector('h2')?.focus();
}
$('#shortcuts-toggle').addEventListener('click', toggleShortcuts);

/* ---------------- 教學紙帶的鍵盤水平捲動 ---------------- */

const tape = $('#tape');
tape.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { e.preventDefault(); tape.scrollBy({ left: tape.clientWidth * 0.8, behavior: 'smooth' }); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); tape.scrollBy({ left: -tape.clientWidth * 0.8, behavior: 'smooth' }); }
});

/* ---------------- 起始狀態 ---------------- */

document.body.dataset.mode = 'empty';
renderStats(null);
$('#year-now').textContent = String(new Date().getFullYear());

/* ---------------- 動效層 ----------------
   最後才掛。GSAP 的 CDN 掛掉時 initMotion 直接回 null，上面每一個功能照常運作。 */

const motion = initMotion({ review, bubbles });

window.__iwtw = {
  state, bubbles, line, review, ledger, motion,
  onData: (fn) => on('data', fn),
};
