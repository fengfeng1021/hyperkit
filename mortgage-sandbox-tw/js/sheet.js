/* ==========================================================================
   sheet.js
   The amortisation schedule. This is the page's honesty test: if it
   reconciles with the bank's own repayment table, everything else on the
   page becomes believable.

   Monthly view can be 480 rows, so it renders in one documentFragment and
   the container scrolls. CSV export carries a UTF-8 BOM, otherwise Excel on
   Windows mangles the Chinese headers.
   ========================================================================== */

import { fmt } from './format.js';
import { PATHS } from './assumptions.js';

const HEAD = ['期', '月付', '利息', '本金', '提前還款', '餘額', '投資部位'];

export function createSheet(opts) {
  const table = document.getElementById('sheet-table');
  const tbody = table.querySelector('tbody');
  const caption = document.getElementById('sheet-caption');
  const scroll = document.getElementById('sheet-scroll');

  let pathKey = 'a';
  let grain = 'year';
  let result = null;
  let isSample = false;

  function rows() {
    if (!result) return [];
    const s = result.paths[pathKey];
    const N = result.months;
    const out = [];
    if (grain === 'month') {
      for (let t = 1; t <= N; t++) {
        out.push({
          label: String(t),
          month: t,
          payment: s.payment[t],
          interest: s.interest[t],
          principal: s.principal[t],
          prepay: s.prepay[t],
          balance: s.balance[t],
          invest: s.invest[t],
        });
      }
    } else {
      for (let y = 1; y <= Math.ceil(N / 12); y++) {
        const from = (y - 1) * 12 + 1;
        const to = Math.min(y * 12, N);
        let payment = 0, interest = 0, principal = 0, prepay = 0;
        for (let t = from; t <= to; t++) {
          payment += s.payment[t];
          interest += s.interest[t];
          principal += s.principal[t];
          prepay += s.prepay[t];
        }
        out.push({
          label: `第 ${y} 年`,
          month: to,
          payment, interest, principal, prepay,
          balance: s.balance[to],
          invest: s.invest[to],
        });
      }
    }
    return out;
  }

  function render() {
    tbody.textContent = '';
    if (!result) {
      caption.textContent = '尚未載入情境。載入後這裡會列出逐期的本金、利息與餘額。';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = HEAD.length;
      td.className = 'sheet-table__empty';
      td.textContent = '按「載入範例情境」，或在上方填入你的三個數字。';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    const meta = PATHS.find((x) => x.key === pathKey);
    caption.textContent =
      `${isSample ? '範例情境的攤還表：' : '攤還表：'}路徑 ${meta.long}，` +
      `${grain === 'month' ? '逐月' : '年度摘要'}。金額四捨五入到元。`;

    const frag = document.createDocumentFragment();
    rows().forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.month = r.month;
      if ((idx + 1) % 5 === 0) tr.classList.add('is-rule');
      [
        r.label, fmt.money(r.payment), fmt.money(r.interest),
        fmt.money(r.principal), r.prepay > 0.5 ? fmt.money(r.prepay) : '-',
        fmt.money(r.balance), fmt.money(r.invest),
      ].forEach((v, i) => {
        const cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = v;
        tr.appendChild(cell);
      });
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  tbody.addEventListener('pointerover', (e) => {
    const tr = e.target.closest('tr[data-month]');
    if (tr) opts.onHoverMonth?.(Number(tr.dataset.month));
  });
  tbody.addEventListener('pointerleave', () => opts.onHoverMonth?.(null));
  scroll.addEventListener('focusout', () => opts.onHoverMonth?.(null));

  function toCSV() {
    if (!result) return null;
    const meta = PATHS.find((x) => x.key === pathKey);
    const lines = [];
    lines.push(`# 房貸沙盤 攤還表 / 路徑 ${meta.long} / ${grain === 'month' ? '逐月' : '年度摘要'}`);
    lines.push(`# 貸款餘額,${result.params.balance},年利率,${result.params.ratePct},剩餘期數,${result.months}`);
    lines.push(HEAD.join(','));
    rows().forEach((r) => {
      lines.push([
        r.label,
        Math.round(r.payment), Math.round(r.interest), Math.round(r.principal),
        Math.round(r.prepay), Math.round(r.balance), Math.round(r.invest),
      ].join(','));
    });
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  function download() {
    const csv = toCSV();
    if (!csv) return false;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `房貸沙盤-攤還表-${pathKey}-${grain}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  return {
    setResult(r, sample) { result = r; isSample = !!sample; render(); },
    setPath(k) { pathKey = k; render(); },
    setGrain(g) { grain = g; render(); },
    get pathKey() { return pathKey; },
    download,
  };
}
