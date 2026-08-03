/* charts.js
   熱力圖（DOM grid）、月度折線（canvas）、分類到店家的流向圖（SVG）。
   三者都是「一個 tab stop + 方向鍵」，不是 168 個 tab stop。 */

import { el, announce, token, rampColor, fitCanvas, raf } from './ui.js';
import { icon } from './icons.js';
import { heatQuantiles, rampStepFor } from './dataset.js';
import { money, int, pct, weekdayName, hourLabel, monthLabel } from './format.js';
import { categoryById } from './rules.js';

/* ==================== 熱力圖 ==================== */

export function createHeatmap(root, { onSelect, isSelected }) {
  let cells = [];
  let focus = { r: 0, c: 12 };
  let data = null;

  const tip = el('div', { class: 'chart-tooltip', role: 'tooltip', hidden: true });
  document.body.append(tip);

  function render(summary) {
    data = summary;
    root.innerHTML = '';
    if (!summary) return;

    if (!summary.hasTime) {
      root.append(el('p', { class: 'chart-empty', text: '這份資料沒有時間欄位，熱力圖需要發票日期含時間。其餘統計不受影響。' }));
      return;
    }

    const cuts = heatQuantiles(summary.byWeekdayHour);
    const grid = el('div', {
      class: 'heatmap', role: 'grid', tabindex: '0',
      'aria-label': '星期與時段消費熱力圖，用方向鍵移動，Enter 篩選明細表',
    });
    cells = [];

    for (let r = 0; r < 7; r++) {
      const row = el('div', { class: 'heat-row', role: 'row' });
      row.append(el('span', { class: 'heat-label', role: 'rowheader', text: weekdayName(r) }));
      const line = [];
      for (let c = 0; c < 24; c++) {
        const d = summary.byWeekdayHour[r][c];
        const step = rampStepFor(d.cents, cuts);
        const key = `heat:${r}:${c}`;
        const cell = el('div', {
          class: 'heat-cell',
          role: 'gridcell',
          tabindex: '-1',
          'data-r': r, 'data-c': c,
          'aria-selected': isSelected(key) ? 'true' : 'false',
          'aria-label': `${weekdayName(r)} ${hourLabel(c)}，${d.count} 筆，${money(d.cents, { noCents: true })}`,
        });
        cell.style.background = rampColor(step);
        if (isSelected(key)) cell.classList.add('is-selected');
        line.push(cell);
        row.append(cell);
      }
      cells.push(line);
      grid.append(row);
    }

    const axis = el('div', { class: 'heat-axis', 'aria-hidden': 'true' });
    [0, 6, 12, 18, 23].forEach((h) => axis.append(el('span', { class: 'heat-axis-tick num', text: String(h).padStart(2, '0'), style: `--at:${h}` })));
    grid.append(axis);

    const wrap = el('div', { class: 'heatmap-wrap' }, [grid]);
    root.append(wrap);

    const legend = el('div', { class: 'heat-legend' });
    legend.append(el('span', { class: 'legend-label', text: '少' }));
    for (let i = 0; i <= 6; i++) {
      const sw = el('span', { class: 'legend-swatch' });
      sw.style.background = rampColor(i);
      legend.append(sw);
    }
    legend.append(el('span', { class: 'legend-label', text: '多' }));
    root.append(legend);

    grid.addEventListener('keydown', onKey);
    grid.addEventListener('focus', () => moveTo(focus.r, focus.c, false));
    grid.addEventListener('pointerover', (e) => {
      const c = e.target.closest('.heat-cell');
      if (c) showTip(c);
    });
    grid.addEventListener('pointerout', hideTip);
    grid.addEventListener('click', (e) => {
      const c = e.target.closest('.heat-cell');
      if (c) select(+c.dataset.r, +c.dataset.c);
    });
  }

  function moveTo(r, c, doFocus = true) {
    if (!cells.length) return;
    focus = { r: Math.max(0, Math.min(6, r)), c: Math.max(0, Math.min(23, c)) };
    const cell = cells[focus.r][focus.c];
    root.querySelectorAll('.heat-cell').forEach((n) => n.setAttribute('tabindex', '-1'));
    cell.setAttribute('tabindex', '0');
    if (doFocus) cell.focus();
    showTip(cell);
  }

  function onKey(e) {
    const map = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (map[e.key]) {
      e.preventDefault();
      moveTo(focus.r + map[e.key][0], focus.c + map[e.key][1]);
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); moveTo(focus.r, 0); return; }
    if (e.key === 'End') { e.preventDefault(); moveTo(focus.r, 23); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(focus.r, focus.c); }
  }

  function select(r, c) {
    const d = data.byWeekdayHour[r][c];
    onSelect({
      key: `heat:${r}:${c}`,
      type: 'heat',
      multi: true,
      label: `${weekdayName(r)} ${hourLabel(c)}`,
      test: (inv) => ((inv.date.getDay() + 6) % 7) === r && inv.date.getHours() === c,
      empty: d.count === 0,
    });
  }

  function showTip(cell) {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    const d = data.byWeekdayHour[r][c];
    tip.innerHTML = `
      <span class="tip-head">${weekdayName(r)} ${hourLabel(c)}</span>
      <span class="tip-row"><span>筆數</span><b class="num">${int(d.count)}</b></span>
      <span class="tip-row"><span>金額</span><b class="num">${money(d.cents, { noCents: true })}</b></span>
      <span class="tip-row"><span>平均</span><b class="num">${d.count ? money(Math.round(d.cents / d.count), { noCents: true }) : '-'}</b></span>`;
    const box = cell.getBoundingClientRect();
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(window.innerWidth - tw - 8, Math.max(8, box.left + box.width / 2 - tw / 2))}px`;
    tip.style.top = `${box.top + window.scrollY - tip.offsetHeight - 8}px`;
  }
  function hideTip() { tip.hidden = true; }

  function refreshSelection() {
    root.querySelectorAll('.heat-cell').forEach((n) => {
      const key = `heat:${n.dataset.r}:${n.dataset.c}`;
      const on = isSelected(key);
      n.classList.toggle('is-selected', on);
      n.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  return { render, refreshSelection };
}

/* ==================== 月度折線 ==================== */

export function createLineChart(root) {
  const canvas = el('canvas', {
    class: 'line-canvas', tabindex: '0', role: 'img',
    'aria-label': '月度消費金額折線，用左右方向鍵切換月份',
  });
  const readout = el('p', { class: 'line-readout', 'aria-live': 'polite' });
  const table = el('table', { class: 'sr-only' });
  root.append(canvas, readout, table);

  let summary = null;
  let active = -1;
  let geom = null;

  function render(s) {
    summary = s;
    active = s ? s.byMonth.reduce((best, m, i, arr) => (m.cents > arr[best].cents ? i : best), 0) : -1;
    buildTable();
    draw();
    speak();
  }

  function buildTable() {
    if (!summary) { table.innerHTML = ''; return; }
    table.innerHTML = '<caption>月度消費金額</caption><thead><tr><th>月份</th><th>金額</th><th>筆數</th></tr></thead><tbody>'
      + summary.byMonth.map((m, i) => `<tr><td>${monthLabel(i)}</td><td>${money(m.cents, { noCents: true })}</td><td>${m.count}</td></tr>`).join('')
      + '</tbody>';
  }

  function draw() {
    const w = root.clientWidth || 480;
    const h = Math.max(180, Math.min(260, Math.round(w * 0.42)));
    const ctx = fitCanvas(canvas, w, h);
    if (!ctx) { root.querySelector('.line-canvas')?.replaceWith(el('p', { class: 'chart-empty', text: '這個瀏覽器停用了 Canvas，折線圖無法繪製。下方的月度數字表仍然可讀。' })); return; }
    ctx.clearRect(0, 0, w, h);
    if (!summary) return;

    const padL = 44, padR = 12, padT = 16, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;
    const max = Math.max(1, ...summary.byMonth.map((m) => m.cents));
    const x = (i) => padL + (iw * i) / 11;
    const y = (v) => padT + ih - (ih * v) / max;
    geom = { x, y, padL, padT, ih, iw };

    // 水平參考線（每四分之一），1px hairline
    ctx.strokeStyle = token('--line-1');
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = Math.round(padT + (ih * i) / 4) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
    }

    // 折線
    ctx.strokeStyle = token('--vermilion');
    ctx.lineWidth = 2;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    summary.byMonth.forEach((m, i) => { const px = x(i), py = y(m.cents); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.stroke();

    // 資料點：方形，不是圓點
    summary.byMonth.forEach((m, i) => {
      const px = x(i), py = y(m.cents);
      const on = i === active;
      ctx.fillStyle = on ? token('--vermilion-bright') : token('--vermilion');
      const s = on ? 8 : 5;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
      if (on) {
        ctx.strokeStyle = token('--paper');
        ctx.lineWidth = 1;
        ctx.strokeRect(px - s / 2 - 2.5, py - s / 2 - 2.5, s + 5, s + 5);
      }
    });

    // 軸標
    ctx.fillStyle = token('--paper-mute');
    ctx.font = `400 11px ${token('--font-data') || 'monospace'}`;
    ctx.textAlign = 'center';
    summary.byMonth.forEach((m, i) => { if (i % 2 === 0) ctx.fillText(String(i + 1), x(i), h - 8); });
    ctx.textAlign = 'right';
    ctx.fillText(money(max, { noCents: true }), padL - 8, padT + 4);
    ctx.fillText('0', padL - 8, padT + ih + 4);
  }

  function speak() {
    if (!summary || active < 0) { readout.textContent = ''; return; }
    const m = summary.byMonth[active];
    readout.innerHTML = `<span class="lr-m">${monthLabel(active)}</span>`
      + `<span class="lr-v num">${money(m.cents, { noCents: true })}</span>`
      + `<span class="lr-c num">${int(m.count)} 筆</span>`
      + `<span class="lr-p num">佔全年 ${pct(m.cents, summary.totalCents)}</span>`;
  }

  canvas.addEventListener('keydown', (e) => {
    if (!summary) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowRight' ? 1 : 11)) % 12;
      draw(); speak();
      announce(`${monthLabel(active)}，${money(summary.byMonth[active].cents, { noCents: true })}`);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!summary || !geom) return;
    const box = canvas.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - geom.padL) / geom.iw) * 11);
    if (i >= 0 && i <= 11 && i !== active) { active = i; draw(); speak(); }
  });

  const redraw = raf(() => { draw(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(redraw).observe(root);
  else window.addEventListener('resize', redraw);

  /** 讓招牌動效知道 12 月資料點在哪 */
  function pointAt(i) {
    if (!geom) return null;
    const box = canvas.getBoundingClientRect();
    return { x: box.left + geom.x(i), y: box.top + geom.y(summary.byMonth[i].cents) };
  }

  return { render, pointAt, redraw };
}

/* ==================== 流向圖（分類 → 店家） ==================== */

export function createFlow(root) {
  let summary = null;
  let order = [];
  const NODE_W = 12;

  function render(s) {
    summary = s;
    root.innerHTML = '';
    if (!summary) return;

    const cats = summary.byCategory;
    const stores = summary.byStore.slice(0, 12);
    const rest = summary.byStore.slice(12);

    if (cats.length < 2 || summary.byStore.length < 2) {
      root.append(el('p', { class: 'chart-empty', text: '資料的店家分佈太集中，流向圖需要至少 2 個分類與 2 家店。' }));
      return;
    }

    const right = stores.map((st) => ({ ...st }));
    if (rest.length) {
      right.push({
        name: `其他 ${rest.length} 家`,
        cents: rest.reduce((a, x) => a + x.cents, 0),
        count: rest.reduce((a, x) => a + x.count, 0),
        category: 'other',
        rest: true,
      });
    }
    order = right.map((_, i) => i);

    if (window.matchMedia('(max-width: 767px)').matches) { renderList(cats, right); return; }
    renderSvg(cats, right);
  }

  function renderList(cats, right) {
    const wrap = el('div', { class: 'flow-list' });
    cats.forEach((c) => {
      const det = el('details', { class: 'flow-details' });
      det.append(el('summary', {}, [
        el('span', { class: 'flow-cat-icon', html: icon(categoryById(c.id).icon, 16) }),
        el('span', { class: 'flow-cat-name', text: c.name }),
        el('span', { class: 'flow-cat-amt num', text: money(c.cents, { noCents: true }) }),
        el('span', { class: 'flow-cat-pct num', text: pct(c.cents, summary.totalCents, 0) }),
      ]));
      const list = el('div', { class: 'flow-sub' });
      right.filter((r) => r.category === c.id).forEach((r) => {
        list.append(el('div', { class: 'receipt-row receipt-row--flow' }, [
          el('span', { class: 'rr-store', text: r.name }),
          el('span', { class: 'rr-amt num', text: money(r.cents, { noCents: true }) }),
          el('span', { class: 'rr-id num', text: `${r.count} 次` }),
        ]));
      });
      if (!list.children.length) list.append(el('p', { class: 'flow-none', text: '這個分類沒有進入前 12 名的店家。' }));
      det.append(list);
      wrap.append(det);
    });
    root.append(wrap);
  }

  function renderSvg(cats, right) {
    const W = Math.max(360, root.clientWidth || 560);
    const rowH = 22, gap = 6;
    const H = Math.max(cats.length, right.length) * (rowH + gap) + 40;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'flow-svg');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', '分類到店家的金額流向圖。節點可用 Tab 聚焦，Alt 加上下鍵可重排。');

    const total = cats.reduce((a, c) => a + c.cents, 0) || 1;
    const usable = H - 40;
    const leftX = 120, rightX = W - 132;

    const leftNodes = [];
    let ly = 20;
    cats.forEach((c) => {
      const h = Math.max(8, (c.cents / total) * usable * 0.86);
      leftNodes.push({ ...c, x: leftX, y: ly, h });
      ly += h + gap;
    });

    const rightTotal = right.reduce((a, r) => a + r.cents, 0) || 1;
    function layoutRight() {
      let ry = 20;
      const nodes = [];
      order.forEach((idx) => {
        const r = right[idx];
        const h = Math.max(8, (r.cents / rightTotal) * usable * 0.86);
        nodes.push({ ...r, idx, x: rightX, y: ry, h });
        ry += h + gap;
      });
      return nodes;
    }

    /* 節點高度是金額，所以小額節點會擠在一起；但每個標籤都是固定的兩行高。
       先用節點中心當理想位置，再往下、往上各推一次，保證彼此至少差一個標籤高。
       節點本身不動——動的只有那兩行字，讀者仍然看得出它屬於哪一條。 */
    const LABEL_MIN = 28;
    function spreadLabels(nodes) {
      const ys = nodes.map((n) => n.y + n.h / 2);
      for (let i = 1; i < ys.length; i++) {
        if (ys[i] - ys[i - 1] < LABEL_MIN) ys[i] = ys[i - 1] + LABEL_MIN;
      }
      for (let i = ys.length - 2; i >= 0; i--) {
        if (ys[i + 1] - ys[i] < LABEL_MIN) ys[i] = ys[i + 1] - LABEL_MIN;
      }
      nodes.forEach((n, i) => { n.labelY = Math.max(14, ys[i]); });
    }

    function paint() {
      svg.innerHTML = '';
      const rightNodes = layoutRight();
      spreadLabels(leftNodes);
      spreadLabels(rightNodes);
      const NS = 'http://www.w3.org/2000/svg';

      // 連線
      const cursorL = new Map();
      const links = [];
      rightNodes.forEach((rn) => {
        const ln = leftNodes.find((l) => l.id === rn.category) || leftNodes[leftNodes.length - 1];
        const share = ln.cents ? rn.cents / ln.cents : 0;
        const lh = Math.max(2, ln.h * Math.min(1, share));
        const off = cursorL.get(ln.id) || 0;
        cursorL.set(ln.id, off + lh);
        links.push({ ln, rn, y0: ln.y + off, h0: lh, y1: rn.y, h1: rn.h });
      });

      links.forEach((lk) => {
        const p = document.createElementNS(NS, 'path');
        const x0 = lk.ln.x + NODE_W, x1 = lk.rn.x;
        const mx = (x0 + x1) / 2;
        p.setAttribute('d',
          `M${x0},${lk.y0} C${mx},${lk.y0} ${mx},${lk.y1} ${x1},${lk.y1} `
          + `L${x1},${lk.y1 + lk.h1} C${mx},${lk.y1 + lk.h1} ${mx},${lk.y0 + lk.h0} ${x0},${lk.y0 + lk.h0} Z`);
        p.setAttribute('fill', rampColor(lk.ln.ramp));
        p.setAttribute('fill-opacity', '.35');
        p.setAttribute('class', 'flow-link');
        p.dataset.cat = lk.ln.id;
        p.dataset.store = lk.rn.name;
        p.addEventListener('pointerenter', () => highlight(lk.ln.id, lk.rn.name));
        p.addEventListener('pointerleave', () => highlight(null, null));
        svg.append(p);
      });

      leftNodes.forEach((n) => svg.append(nodeEl(n, 'left')));
      rightNodes.forEach((n) => svg.append(nodeEl(n, 'right')));

      function nodeEl(n, side) {
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', `flow-node flow-node--${side}`);
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.dataset.key = side === 'left' ? n.id : n.name;
        g.setAttribute('aria-label',
          `${n.name}，${money(n.cents, { noCents: true })}，${int(n.count)} 筆，佔 ${pct(n.cents, summary.totalCents, 0)}`
          + (side === 'right' ? '。Alt 加上下鍵可以移動順序。' : ''));

        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', n.x); rect.setAttribute('y', n.y);
        rect.setAttribute('width', NODE_W); rect.setAttribute('height', n.h);
        rect.setAttribute('fill', rampColor(side === 'left' ? n.ramp : categoryById(n.category).ramp));
        g.append(rect);

        const label = document.createElementNS(NS, 'text');
        label.setAttribute('class', 'flow-label');
        label.setAttribute('x', side === 'left' ? n.x - 8 : n.x + NODE_W + 8);
        label.setAttribute('y', (n.labelY ?? n.y + n.h / 2) + 4);
        label.setAttribute('text-anchor', side === 'left' ? 'end' : 'start');
        label.textContent = n.name.length > 10 ? `${n.name.slice(0, 10)}…` : n.name;
        g.append(label);

        const amt = document.createElementNS(NS, 'text');
        amt.setAttribute('class', 'flow-amt');
        amt.setAttribute('x', side === 'left' ? n.x - 8 : n.x + NODE_W + 8);
        amt.setAttribute('y', (n.labelY ?? n.y + n.h / 2) + 17);
        amt.setAttribute('text-anchor', side === 'left' ? 'end' : 'start');
        amt.textContent = money(n.cents, { noCents: true });
        g.append(amt);

        const key = side === 'left' ? n.id : null;
        g.addEventListener('pointerenter', () => highlight(key, side === 'right' ? n.name : null));
        g.addEventListener('pointerleave', () => highlight(null, null));
        g.addEventListener('focus', () => highlight(key, side === 'right' ? n.name : null));
        g.addEventListener('blur', () => highlight(null, null));

        if (side === 'right') {
          g.addEventListener('keydown', (e) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
            e.preventDefault();
            const pos = order.indexOf(n.idx);
            const to = pos + (e.key === 'ArrowUp' ? -1 : 1);
            if (to < 0 || to >= order.length) return;
            order.splice(pos, 1); order.splice(to, 0, n.idx);
            paint();
            announce(`${n.name} 移到第 ${to + 1} 位`);
            svg.querySelector(`.flow-node--right[data-key="${CSS.escape(n.name)}"]`)?.focus();
          });
          enableDrag(g, n);
        }
        return g;
      }

      function enableDrag(g, n) {
        g.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          g.setPointerCapture(e.pointerId);
          const startY = e.clientY;
          const box = svg.getBoundingClientRect();
          const scale = H / box.height;
          const move = (ev) => {
            const dy = (ev.clientY - startY) * scale;
            const pos = order.indexOf(n.idx);
            const step = Math.round(dy / (n.h + gap));
            const to = Math.max(0, Math.min(order.length - 1, pos + step));
            if (to !== pos) {
              order.splice(pos, 1); order.splice(to, 0, n.idx);
              paint();
            }
          };
          const up = () => {
            svg.removeEventListener('pointermove', move);
            svg.removeEventListener('pointerup', up);
          };
          svg.addEventListener('pointermove', move);
          svg.addEventListener('pointerup', up);
        });
      }

      function highlight(catId, storeName) {
        svg.querySelectorAll('.flow-link').forEach((p) => {
          const on = (catId && p.dataset.cat === catId) || (storeName && p.dataset.store === storeName);
          const dim = catId || storeName;
          p.setAttribute('fill-opacity', on ? '.78' : dim ? '.08' : '.35');
        });
      }
    }

    paint();
    root.append(svg);
  }

  const rerender = raf(() => summary && render(summary));
  window.addEventListener('resize', rerender);

  return { render };
}
