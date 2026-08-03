/* bubbles.js
   店家泡泡雲。canvas + 自寫的碰撞鬆弛力學（不引入 d3）。
   面積編碼金額、ramp 濃淡編碼分類、條紋密度是第二層編碼（色覺辨識障礙友善）。
   收斂後停止 rAF，只在互動時重繪。
   canvas 旁必附一個視覺隱藏的前 20 名表格，這是視覺化唯一誠實的無障礙做法。 */

import { el, esc, announce, token, rampColor, fitCanvas, stripePattern, raf } from './ui.js';
import { categoryById } from './rules.js';
import { money, int, pct } from './format.js';

export function createBubbleField(root, { onPick }) {
  const canvas = el('canvas', {
    class: 'bubble-canvas', tabindex: '0', role: 'img',
    'aria-label': '店家泡泡雲，泡泡面積等於金額。左右方向鍵依金額切換店家，Enter 展開該店家消費。',
  });
  const tip = el('div', { class: 'bubble-tooltip', role: 'tooltip', hidden: true });
  const srTable = el('div', { class: 'sr-only' });
  const wrap = el('div', { class: 'bubble-wrap' }, [canvas, tip]);
  root.append(wrap, srTable);

  let ctx = null;
  let nodes = [];
  let summary = null;
  let raf1 = 0;
  let alpha = 1;
  let hover = null;
  let selected = null;
  let kbIndex = -1;
  let W = 0, H = 0;
  let mobileGrid = false;
  let fadeIn = 0;

  function render(s) {
    summary = s;
    cancelAnimationFrame(raf1);
    if (!summary) { nodes = []; srTable.innerHTML = ''; return; }
    build();
    buildSrTable();
    if (!ctx) return;
    if (mobileGrid) { drawGrid(); return; }
    alpha = 1; fadeIn = 0;
    tick();
  }

  function build() {
    W = root.clientWidth || 640;
    mobileGrid = window.matchMedia('(max-width: 767px)').matches;
    H = mobileGrid ? Math.round(window.innerHeight * 0.6) : Math.min(640, Math.round(window.innerHeight * 0.72));
    ctx = fitCanvas(canvas, W, H);
    if (!ctx) {
      canvas.replaceWith(fallbackTable());
      return;
    }

    const stores = summary.byStore;
    if (!stores.length) return;

    // 半徑 = sqrt(金額) x k，讓最大的泡泡約佔畫布短邊的 34%
    const maxCents = stores[0].cents || 1;
    const target = Math.min(W, H) * 0.17;
    const k = target / Math.sqrt(maxCents);

    const kept = [];
    const tiny = [];
    stores.forEach((st) => {
      const r = Math.sqrt(st.cents) * k;
      if (r < 6) tiny.push(st); else kept.push({ ...st, r });
    });
    if (tiny.length) {
      const cents = tiny.reduce((a, x) => a + x.cents, 0);
      kept.push({
        name: `其他 ${tiny.length} 家`, cents, count: tiny.reduce((a, x) => a + x.count, 0),
        category: 'other', r: Math.max(6, Math.sqrt(cents) * k), rest: true, members: tiny,
      });
    }

    // 面積總和超過畫布時整體縮放，避免擠爆
    const area = kept.reduce((a, n) => a + Math.PI * n.r * n.r, 0);
    const fit = Math.sqrt((W * H * 0.52) / area);
    if (fit < 1) kept.forEach((n) => { n.r = Math.max(4, n.r * fit); });

    const cx = W / 2, cy = H / 2;
    nodes = kept.map((n, i) => {
      const ang = i * 2.399963; // 黃金角，初始分佈不打結
      const rad = Math.sqrt(i / kept.length) * Math.min(W, H) * 0.42;
      const def = categoryById(n.category);
      return {
        ...n,
        x: cx + Math.cos(ang) * rad,
        y: cy + Math.sin(ang) * rad,
        vx: 0, vy: 0,
        ramp: def.ramp, stripes: def.stripes, catName: def.name,
        alpha: 0,
      };
    });
    kbIndex = -1;
    selected = null;
  }

  function step() {
    const cx = W / 2, cy = H / 2;
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      a.vx += (cx - a.x) * 0.012 * alpha;
      a.vy += (cy - a.y) * 0.014 * alpha;
    }
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        const min = a.r + b.r + 1.5;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2) || 0.01;
        const push = ((min - d) / d) * 0.5;
        dx *= push; dy *= push;
        a.vx -= dx; a.vy -= dy;
        b.vx += dx; b.vy += dy;
      }
    }
    for (const a of nodes) {
      a.x += a.vx; a.y += a.vy;
      a.vx *= 0.72; a.vy *= 0.72;
      a.x = Math.max(a.r + 2, Math.min(W - a.r - 2, a.x));
      a.y = Math.max(a.r + 2, Math.min(H - a.r - 2, a.y));
    }
    // 超過 300 顆時加快衰減，8 秒內收斂
    alpha *= nodes.length > 300 ? 0.95 : 0.977;
  }

  function tick() {
    step();
    fadeIn = Math.min(1, fadeIn + 0.06);
    nodes.forEach((n) => { n.alpha = fadeIn; });
    draw();
    if (alpha > 0.006) raf1 = requestAnimationFrame(tick);
    else { alpha = 0; nodes.forEach((n) => { n.alpha = 1; }); draw(); }
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const dim = hover || selected;
    for (const n of nodes) {
      if (n.hidden) continue;
      const isFocus = n === hover || n === selected;
      ctx.globalAlpha = n.alpha * (dim && !isFocus ? 0.42 : 1);
      const r = n.r * (isFocus ? 1.08 : 1);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = rampColor(n.ramp);
      ctx.fill();
      const pat = stripePattern(ctx, n.stripes);
      if (pat) { ctx.fillStyle = pat; ctx.fill(); }
      if (isFocus) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = token(n === selected ? '--vermilion-bright' : '--paper');
        ctx.stroke();
      }
      if (r > 26) {
        ctx.globalAlpha = n.alpha;
        ctx.fillStyle = n.ramp >= 4 ? token('--ink-void') : token('--paper');
        ctx.font = `600 ${Math.min(14, Math.max(10, r / 3.4))}px ${token('--font-text') || 'sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = n.name.length > 7 ? `${n.name.slice(0, 6)}…` : n.name;
        ctx.fillText(label, n.x, n.y);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** < 768px：關閉力學，改用依金額排序的方形網格，面積仍正比金額 */
  function drawGrid() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const cols = 4;
    const cellW = W / cols;
    let x = 0, y = 8, rowH = 0, i = 0;
    for (const n of nodes) {
      const size = Math.max(18, Math.min(cellW - 10, n.r * 1.9));
      if (x + cellW > W + 1) { x = 0; y += rowH + 10; rowH = 0; }
      n.gx = x + cellW / 2; n.gy = y + size / 2; n.gs = size;
      ctx.fillStyle = rampColor(n.ramp);
      ctx.fillRect(n.gx - size / 2, n.gy - size / 2, size, size);
      const pat = stripePattern(ctx, n.stripes);
      if (pat) { ctx.fillStyle = pat; ctx.fillRect(n.gx - size / 2, n.gy - size / 2, size, size); }
      rowH = Math.max(rowH, size);
      x += cellW;
      i++;
      if (y > H) break;
    }
  }

  function fallbackTable() {
    const box = el('div', { class: 'bubble-fallback' });
    box.innerHTML = `<p class="chart-empty">這個瀏覽器停用了 Canvas，泡泡雲改用前 20 名店家的排行表。其餘功能正常。</p>`;
    return box;
  }

  function buildSrTable() {
    const rows = summary.byStore.slice(0, 20).map((s, i) =>
      `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${money(s.cents, { noCents: true })}</td><td>${int(s.count)}</td></tr>`).join('');
    srTable.innerHTML = `<table><caption>店家消費前 20 名</caption>
      <thead><tr><th>名次</th><th>店家</th><th>金額</th><th>次數</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function hit(px, py) {
    if (mobileGrid) {
      return nodes.find((n) => n.gs && Math.abs(px - n.gx) < n.gs / 2 && Math.abs(py - n.gy) < n.gs / 2) || null;
    }
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.hidden) continue;
      const dx = px - n.x, dy = py - n.y;
      if (dx * dx + dy * dy < n.r * n.r) return n;
    }
    return null;
  }

  canvas.addEventListener('pointermove', (e) => {
    const box = canvas.getBoundingClientRect();
    const n = hit(e.clientX - box.left, e.clientY - box.top);
    canvas.style.cursor = n ? 'pointer' : 'default';
    if (n === hover) { if (n) placeTip(e); return; }
    hover = n;
    if (n) { showTip(n); placeTip(e); } else tip.hidden = true;
    if (alpha <= 0.006) draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; if (alpha <= 0.006) draw(); });
  canvas.addEventListener('click', (e) => {
    const box = canvas.getBoundingClientRect();
    const n = hit(e.clientX - box.left, e.clientY - box.top);
    pick(n);
  });
  canvas.addEventListener('keydown', (e) => {
    if (!nodes.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      kbIndex = (kbIndex + (e.key === 'ArrowRight' ? 1 : nodes.length - 1) + (kbIndex < 0 ? 1 : 0)) % nodes.length;
      hover = nodes[kbIndex];
      showTip(hover);
      const b = canvas.getBoundingClientRect();
      placeAt(b.left + hover.x, b.top + hover.y - hover.r - 12);
      draw();
      announce(`${hover.name}，${money(hover.cents, { noCents: true })}，${int(hover.count)} 次`);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(nodes[Math.max(0, kbIndex)]);
    } else if (e.key === 'Escape' && selected) {
      selected = null; tip.hidden = true; draw(); onPick(null);
    }
  });
  canvas.addEventListener('blur', () => { tip.hidden = true; });

  function pick(n) {
    selected = n && n !== selected ? n : null;
    draw();
    onPick(selected);
  }

  function showTip(n) {
    tip.hidden = false;
    tip.innerHTML = `
      <span class="tip-head">${esc(n.name)}</span>
      <span class="tip-row"><span>${esc(n.catName)}</span><b class="num">${pct(n.cents, summary.totalCents)}</b></span>
      <span class="tip-row"><span>金額</span><b class="num">${money(n.cents, { noCents: true })}</b></span>
      <span class="tip-row"><span>次數</span><b class="num">${int(n.count)}</b></span>`;
  }
  function placeTip(e) { placeAt(e.clientX, e.clientY - 16); }
  function placeAt(cx, cy) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const box = wrap.getBoundingClientRect();
    tip.style.left = `${Math.max(4, Math.min(box.width - w - 4, cx - box.left - w / 2))}px`;
    tip.style.top = `${Math.max(4, cy - box.top - h - 6)}px`;
  }

  const onResize = raf(() => { if (summary) render(summary); });
  window.addEventListener('resize', onResize);

  return {
    render,
    getNodes: () => nodes,
    getChampion: () => nodes.find((n) => n.name === summary?.champion?.name) || null,
    canvasEl: canvas,
    stop: () => cancelAnimationFrame(raf1),
    redraw: draw,
  };
}
