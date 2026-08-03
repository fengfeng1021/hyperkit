/* ledger.js
   逐筆明細表。虛擬捲動 + 展開 D 明細 + 搜尋 + 篩選標籤 + 骨架列。
   列高 28px，每 5 列一條 hairline，不是每列都有線。 */

import { el, esc, announce, raf } from './ui.js';
import { icon } from './icons.js';
import { money, ymdhm, ymd } from './format.js';
import { categoryById } from './rules.js';

const ROW_H = 28;
const ROW_H_S = 56;
const OVERSCAN = 8;

export function createLedger(root, { getRows, onClearFilters, tagsHost }) {
  const search = el('input', {
    type: 'search', class: 'input ledger-search', id: 'ledger-search',
    placeholder: '搜尋店名、品名或發票號碼', 'aria-label': '搜尋明細',
  });
  const head = el('div', { class: 'ledger-head' }, [
    el('div', { class: 'receipt-row receipt-row--head', 'aria-hidden': 'true' }, [
      el('span', { class: 'rr-date', text: '日期' }),
      el('span', { class: 'rr-store', text: '店家' }),
      el('span', { class: 'rr-amt', text: '金額' }),
      el('span', { class: 'rr-id', text: '發票號碼' }),
    ]),
  ]);
  const viewport = el('div', {
    class: 'ledger-viewport', tabindex: '0', role: 'group',
    'aria-label': '逐筆消費明細，方向鍵移動，Enter 展開品項',
  });
  const spacer = el('div', { class: 'ledger-spacer' });
  const layer = el('div', { class: 'ledger-layer' });
  spacer.append(layer);
  viewport.append(spacer);
  const foot = el('p', { class: 'ledger-foot num' });

  root.append(el('div', { class: 'ledger-tools' }, [search]), head, viewport, foot);

  let rows = [];
  let expandedId = null;
  let expandedH = 0;
  let cursor = 0;
  let query = '';
  let loadingMore = false;

  function rowHeight() {
    return window.matchMedia('(max-width: 767px)').matches ? ROW_H_S : ROW_H;
  }

  function apply() {
    const all = getRows();
    const q = query.trim().toLowerCase();
    rows = q
      ? all.filter((inv) => inv.store.toLowerCase().includes(q)
        || inv.id.toLowerCase().includes(q)
        || inv.items.some((it) => it.name.toLowerCase().includes(q)))
      : all;
    if (expandedId && !rows.some((r) => r.id === expandedId)) { expandedId = null; expandedH = 0; }
    cursor = Math.min(cursor, Math.max(0, rows.length - 1));
    layout();
    paint();
    foot.textContent = rows.length
      ? `${rows.length.toLocaleString('zh-TW')} 筆，合計 ${money(rows.reduce((a, r) => a + r.amountCents, 0), { noCents: true })}`
      : '';
  }

  function layout() {
    spacer.style.height = `${rows.length * rowHeight() + expandedH}px`;
  }

  function indexAt(y) {
    const h = rowHeight();
    if (!expandedId) return Math.floor(y / h);
    const ei = rows.findIndex((r) => r.id === expandedId);
    const eTop = ei * h;
    if (y < eTop + h) return Math.floor(y / h);
    if (y < eTop + h + expandedH) return ei;
    return Math.floor((y - expandedH) / h);
  }

  function topOf(i) {
    const h = rowHeight();
    if (!expandedId) return i * h;
    const ei = rows.findIndex((r) => r.id === expandedId);
    return i * h + (i > ei ? expandedH : 0);
  }

  function paint() {
    const h = rowHeight();
    if (!rows.length) { layer.innerHTML = ''; renderEmpty(); return; }
    root.querySelector('.ledger-empty')?.remove();

    const vh = viewport.clientHeight || 420;
    const start = Math.max(0, indexAt(viewport.scrollTop) - OVERSCAN);
    const end = Math.min(rows.length, indexAt(viewport.scrollTop + vh) + OVERSCAN);

    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const inv = rows[i];
      const node = rowNode(inv, i);
      node.style.transform = `translateY(${topOf(i)}px)`;
      frag.append(node);
      if (inv.id === expandedId) {
        const det = detailNode(inv);
        det.style.transform = `translateY(${topOf(i) + h}px)`;
        frag.append(det);
      }
    }
    if (loadingMore) {
      for (let s = 0; s < 3; s++) {
        const sk = el('div', { class: 'receipt-row receipt-row--skeleton', 'aria-hidden': 'true' });
        sk.style.transform = `translateY(${topOf(end) + s * h}px)`;
        frag.append(sk);
      }
    }
    layer.replaceChildren(frag);
  }

  function rowNode(inv, i) {
    const cat = categoryById(inv.category);
    const node = el('div', {
      class: `receipt-row${i === cursor ? ' is-cursor' : ''}${inv.abnormal ? ' is-abnormal' : ''}`
        + `${(i + 1) % 5 === 0 ? ' has-rule' : ''}`,
      role: 'button', tabindex: '-1',
      'aria-expanded': inv.id === expandedId ? 'true' : 'false',
      'data-i': i,
    });
    node.innerHTML = `
      <span class="rr-date num">${esc(inv.hasTime ? ymdhm(inv.date).slice(5) : ymd(inv.date).slice(5))}</span>
      <span class="rr-store"><span class="rr-cat" title="${esc(cat.name)}">${icon(cat.icon, 13)}</span>${esc(inv.store)}</span>
      <span class="rr-amt num">${esc(money(inv.amountCents, { noCents: true }))}</span>
      <span class="rr-id num">${esc(inv.id)}</span>`;
    node.addEventListener('click', () => toggle(inv.id, i));
    return node;
  }

  function detailNode(inv) {
    const box = el('div', { class: 'receipt-detail' });
    const sum = inv.items.reduce((a, it) => a + it.subCents, 0);
    box.innerHTML = inv.items.length
      ? `<ul class="detail-items">${inv.items.map((it) => `
            <li><span class="di-name">${esc(it.name)}</span><span class="di-sub num">${esc(money(it.subCents, { noCents: true }))}</span></li>`).join('')}
         </ul>
         <p class="detail-note num">品項小計 ${money(sum, { noCents: true })}，主檔總金額 ${money(inv.amountCents, { noCents: true })}${
           sum !== inv.amountCents ? '（兩者不同時，統計一律以主檔總金額為準）' : ''}</p>`
      : '<p class="detail-note">這張發票沒有品項明細列。財政部的匯出有時只有主檔。</p>';
    return box;
  }

  function renderEmpty() {
    if (root.querySelector('.ledger-empty')) return;
    const box = el('div', { class: 'ledger-empty' });
    box.append(el('p', { class: 'empty-title', text: query ? `「${query}」找不到符合的消費。` : '這個篩選條件下沒有消費。' }));
    box.append(el('p', { class: 'empty-text', text: '把上面的篩選標籤拿掉，或換一個關鍵字。' }));
    const btn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: '清除篩選與搜尋' });
    btn.addEventListener('click', () => { query = ''; search.value = ''; onClearFilters(); apply(); });
    box.append(btn);
    viewport.after(box);
  }

  function toggle(id, i) {
    if (expandedId === id) { expandedId = null; expandedH = 0; }
    else {
      expandedId = id;
      const inv = rows.find((r) => r.id === id);
      expandedH = 34 + Math.max(1, inv.items.length) * 24;
      cursor = i;
    }
    layout(); paint();
    announce(expandedId ? '已展開品項明細' : '已收合品項明細');
  }

  viewport.addEventListener('scroll', raf(paint));
  viewport.addEventListener('keydown', (e) => {
    if (!rows.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(0, Math.min(rows.length - 1, cursor + (e.key === 'ArrowDown' ? 1 : -1)));
      const t = topOf(cursor), h = rowHeight();
      if (t < viewport.scrollTop) viewport.scrollTop = t;
      else if (t + h > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = t + h - viewport.clientHeight;
      paint();
      const inv = rows[cursor];
      announce(`${ymd(inv.date)} ${inv.store} ${money(inv.amountCents, { noCents: true })}`);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(rows[cursor].id, cursor);
    } else if (e.key === 'Escape' && expandedId) {
      e.preventDefault();
      expandedId = null; expandedH = 0; layout(); paint();
    }
  });

  // 搜尋不掛 rAF：分頁在背景時 rAF 會被凍結，輸入就會沒有反應
  let searchTimer = 0;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = search.value; apply(); }, 90);
  });

  window.addEventListener('resize', raf(() => { layout(); paint(); }));

  /* ---- 篩選標籤 ---- */
  function renderTags(filters, onRemove) {
    tagsHost.innerHTML = '';
    if (!filters.length) { tagsHost.hidden = true; return; }
    tagsHost.hidden = false;
    tagsHost.append(el('span', { class: 'tags-label', text: '目前的篩選' }));
    filters.forEach((f) => {
      const tag = el('span', { class: 'tag' }, [
        el('span', { class: 'tag-text', text: f.label }),
      ]);
      const x = el('button', {
        type: 'button', class: 'tag-x', 'aria-label': `移除篩選 ${f.label}`,
        html: icon('close', 12),
      });
      x.addEventListener('click', () => onRemove(f.key));
      tag.append(x);
      tagsHost.append(tag);
    });
    const clear = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '全部清除' });
    clear.addEventListener('click', onClearFilters);
    tagsHost.append(clear);
  }

  return { refresh: apply, renderTags, focusSearch: () => search.focus() };
}
