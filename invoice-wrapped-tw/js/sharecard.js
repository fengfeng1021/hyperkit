/* sharecard.js
   分享圖卡產生器。離屏 canvas 1080x1920，站內自繪，不呼叫任何截圖服務。
   四種版型 ledger / single / ring / heat，齒孔邊、真實 Code 128 條碼、
   遮蔽金額改為實心方塊塗黑（不是馬賽克）。繪圖前 await document.fonts.ready。 */

import { el, esc, announce, token, rampColor } from './ui.js';
import { icon } from './icons.js';
import { money, int, weekdayName } from './format.js';
import { heatQuantiles, rampStepFor } from './dataset.js';

const CW = 1080, CH = 1920;
const PAD = 96;

/* ---------------- Code 128 ---------------- */

const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

/** Code 128 Set B。回傳寬度序列（bar/space 交替，第一個是 bar）。 */
export function code128B(text) {
  const values = [104];
  for (const ch of text) {
    const v = ch.charCodeAt(0) - 32;
    values.push(v >= 0 && v < 95 ? v : 0);
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103);
  values.push(106);
  const widths = [];
  values.forEach((v) => { for (const c of C128[v]) widths.push(+c); });
  return widths;
}

function drawBarcode(ctx, text, x, y, w, h, color) {
  const widths = code128B(text);
  const unit = w / widths.reduce((a, b) => a + b, 0);
  let cx = x;
  ctx.fillStyle = color;
  widths.forEach((wd, i) => {
    if (i % 2 === 0) ctx.fillRect(cx, y, wd * unit, h);
    cx += wd * unit;
  });
}

/* ---------------- 齒孔邊 ---------------- */

function perforate(ctx, bg) {
  const r = 11, gap = 34;
  ctx.fillStyle = bg;
  for (let x = gap / 2; x < CW; x += gap) {
    ctx.beginPath(); ctx.arc(x, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, CH, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let y = gap / 2; y < CH; y += gap) {
    ctx.beginPath(); ctx.arc(0, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(CW, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

/* ---------------- 版型 ---------------- */

export const LAYOUTS = [
  { id: 'ledger', name: '收據', desc: '六個數字' },
  { id: 'single', name: '單一數字', desc: '一個巨大的數字' },
  { id: 'ring', name: '年輪', desc: '造訪次數的環' },
  { id: 'heat', name: '熱力', desc: '星期與時段' },
];

function fontDisplay(size, weight = 900) {
  return `${weight} ${size}px "Archivo", "Arial Narrow", sans-serif`;
}
function fontText(size, weight = 400) {
  return `${weight} ${size}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
}
function fontData(size, weight = 400) {
  return `${weight} ${size}px "Martian Mono", Consolas, monospace`;
}

/** 金額被遮蔽時畫成實心方塊，像被塗黑的收據 */
function maskedText(ctx, text, x, y, size, align, mask) {
  ctx.textAlign = align;
  if (!mask) { ctx.fillText(text, x, y); return; }
  const w = ctx.measureText(text).width;
  const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  const prev = ctx.fillStyle;
  ctx.fillStyle = token('--vermilion');
  ctx.fillRect(left, y - size * 0.78, w, size * 0.86);
  ctx.fillStyle = prev;
}

export function drawCard(ctx, { summary, layout, mask, isSample }) {
  const bg = token('--ink-void');
  const paper = token('--paper');
  const dim = token('--paper-dim');
  const mute = token('--paper-mute');
  const acc = token('--vermilion');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CW, CH);

  // 上下細掃描紋，材質而非裝飾
  ctx.fillStyle = 'rgba(244,246,251,.022)';
  for (let y = 0; y < CH; y += 4) ctx.fillRect(0, y, CW, 1);

  // 站頭
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = paper;
  ctx.font = fontDisplay(38, 800);
  ctx.textAlign = 'left';
  ctx.fillText('發票回顧', PAD, 150);
  ctx.fillStyle = acc;
  [0, 14, 30, 52, 68].forEach((dx, i) => {
    ctx.fillRect(PAD + 210 + dx, 122, [7, 4, 10, 4, 8][i], 30);
  });
  ctx.fillStyle = mute;
  ctx.font = fontData(26);
  ctx.textAlign = 'right';
  ctx.fillText(String(summary.year), CW - PAD, 150);

  ctx.strokeStyle = token('--line-2');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 186); ctx.lineTo(CW - PAD, 186); ctx.stroke();

  if (layout === 'ledger') drawLedger();
  else if (layout === 'single') drawSingle();
  else if (layout === 'ring') drawRing();
  else drawHeat();

  // 底部：真實 Code 128 條碼 + 網址
  const payload = `IW${summary.year}-${summary.count}`;
  drawBarcode(ctx, payload, PAD, CH - 268, CW - PAD * 2, 78, paper);
  ctx.fillStyle = mute;
  ctx.font = fontData(20);
  ctx.textAlign = 'left';
  ctx.fillText(payload, PAD, CH - 168);
  ctx.textAlign = 'right';
  ctx.fillText('fengfeng1021.github.io/hyperkit', CW - PAD, CH - 168);

  ctx.fillStyle = dim;
  ctx.font = fontText(22);
  ctx.textAlign = 'left';
  ctx.fillText('資料在瀏覽器裡就地解析，沒有上傳。', PAD, CH - 122);

  if (isSample) {
    const label = '範例資料';
    ctx.font = fontText(22, 500);
    const w = ctx.measureText(label).width + 32;
    ctx.strokeStyle = acc;
    ctx.lineWidth = 2;
    ctx.strokeRect(CW - PAD - w, CH - 148, w, 40);
    ctx.fillStyle = acc;
    ctx.textAlign = 'center';
    ctx.fillText(label, CW - PAD - w / 2, CH - 120);
  }

  perforate(ctx, 'rgba(0,0,0,0)');

  /* ---- 版型內容 ---- */

  function drawLedger() {
    const rows = [
      ['總金額', money(summary.totalCents, { noCents: true }), true],
      ['筆數', `${int(summary.count)} 筆`, false],
      ['去過的店', `${int(summary.storeCount)} 家`, false],
      ['平均單筆', money(summary.avgCents, { noCents: true }), true],
      ['最貴一筆', summary.biggest ? money(summary.biggest.amountCents, { noCents: true }) : '-', true],
      ['最常去', summary.champion ? summary.champion.name : '-', false],
    ];
    let y = 340;
    ctx.textBaseline = 'alphabetic';
    rows.forEach(([k, v, isMoney], i) => {
      ctx.fillStyle = mute;
      ctx.font = fontText(26);
      ctx.textAlign = 'left';
      ctx.fillText(k, PAD, y);
      ctx.fillStyle = paper;
      ctx.font = fontData(44, 600);
      maskedText(ctx, v, CW - PAD, y + 4, 44, 'right', mask && isMoney);
      y += 96;
      if ((i + 1) % 5 === 0) {
        ctx.strokeStyle = token('--line-1');
        ctx.beginPath(); ctx.moveTo(PAD, y - 52); ctx.lineTo(CW - PAD, y - 52); ctx.stroke();
      }
    });

    if (summary.champion) {
      ctx.fillStyle = dim;
      ctx.font = fontText(30);
      ctx.textAlign = 'left';
      wrap(`你走進 ${summary.champion.name} ${summary.champion.count} 次，`
        + `平均每 ${(365 / Math.max(1, summary.champion.count)).toFixed(1)} 天一次。`, PAD, 980, CW - PAD * 2, 46);
    }
  }

  function drawSingle() {
    const n = summary.champion ? summary.champion.count : summary.count;
    ctx.textAlign = 'center';
    ctx.fillStyle = paper;
    ctx.font = fontDisplay(360, 900);
    ctx.fillText(String(n), CW / 2, 780);
    ctx.fillStyle = acc;
    ctx.fillRect(CW / 2 - 120, 830, 240, 4);
    ctx.fillStyle = dim;
    ctx.font = fontText(34);
    wrapCenter(summary.champion
      ? `${summary.year} 年，我走進 ${summary.champion.name} 的次數。`
      : `${summary.year} 年，我開出的發票筆數。`, CW / 2, 920, CW - PAD * 2, 52);

    ctx.fillStyle = mute;
    ctx.font = fontData(28);
    ctx.textAlign = 'center';
    maskedText(ctx, `全年 ${money(summary.totalCents, { noCents: true })}`, CW / 2, 1120, 28, 'center', mask);
  }

  function drawRing() {
    const visits = summary.champion ? summary.champion.visits : [];
    const cx = CW / 2, cy = 800;
    const R = 300;
    const cuts = visits.length
      ? [...visits.map((v) => v.cents)].sort((a, b) => a - b)
      : [];
    const q = (p) => cuts[Math.min(cuts.length - 1, Math.floor(cuts.length * p))] || 0;
    const steps = [q(0.25), q(0.5), q(0.75)];

    visits.forEach((v, i) => {
      const ang = (i / visits.length) * Math.PI * 2 - Math.PI / 2;
      const step = v.cents <= steps[0] ? 3 : v.cents <= steps[1] ? 4 : v.cents <= steps[2] ? 5 : 6;
      const x = cx + Math.cos(ang) * R;
      const y = cy + Math.sin(ang) * R;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = rampColor(step);
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = paper;
    ctx.font = fontDisplay(190, 900);
    ctx.fillText(String(visits.length || summary.count), cx, cy + 40);
    ctx.fillStyle = mute;
    ctx.font = fontText(28);
    ctx.fillText(summary.champion ? summary.champion.name : '全年發票', cx, cy + 100);

    ctx.fillStyle = dim;
    ctx.font = fontText(32);
    wrapCenter('一格是一次。這一整圈是我今年走進同一家店的次數。', cx, 1260, CW - PAD * 2, 50);
  }

  function drawHeat() {
    const cuts = heatQuantiles(summary.byWeekdayHour);
    const cell = 34, gap = 6;
    const gw = 24 * cell + 23 * gap;
    const x0 = (CW - gw) / 2 + 30;
    const y0 = 420;
    ctx.font = fontData(20);
    for (let r = 0; r < 7; r++) {
      ctx.fillStyle = mute;
      ctx.textAlign = 'right';
      ctx.fillText(weekdayName(r), x0 - 16, y0 + r * (cell + gap) + cell * 0.72);
      for (let c = 0; c < 24; c++) {
        const d = summary.byWeekdayHour[r][c];
        ctx.fillStyle = rampColor(rampStepFor(d.cents, cuts));
        ctx.fillRect(x0 + c * (cell + gap), y0 + r * (cell + gap), cell, cell);
      }
    }
    ctx.fillStyle = mute;
    ctx.font = fontData(20);
    ctx.textAlign = 'center';
    [0, 6, 12, 18, 23].forEach((h) => {
      ctx.fillText(String(h).padStart(2, '0'), x0 + h * (cell + gap) + cell / 2, y0 + 7 * (cell + gap) + 34);
    });

    let peak = { r: 0, c: 0, cents: -1 };
    for (let r = 0; r < 7; r++) for (let c = 0; c < 24; c++) {
      if (summary.byWeekdayHour[r][c].cents > peak.cents) peak = { r, c, cents: summary.byWeekdayHour[r][c].cents };
    }
    ctx.fillStyle = paper;
    ctx.font = fontDisplay(88, 800);
    ctx.textAlign = 'left';
    ctx.fillText(`${weekdayName(peak.r)} ${String(peak.c).padStart(2, '0')} 點`, PAD, 1020);
    ctx.fillStyle = dim;
    ctx.font = fontText(32);
    wrap('這是我今年最會花錢的那一格。', PAD, 1090, CW - PAD * 2, 50);
  }

  function wrap(text, x, y, maxW, lh) {
    let line = '';
    let yy = y;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, yy); line = ch; yy += lh; }
      else line += ch;
    }
    ctx.fillText(line, x, yy);
  }
  function wrapCenter(text, cx2, y, maxW, lh) {
    const prev = ctx.textAlign;
    ctx.textAlign = 'center';
    wrap(text, cx2, y, maxW, lh);
    ctx.textAlign = prev;
  }
}

/* ---------------- UI ---------------- */

export function createShareCard(root) {
  let summary = null;
  let layout = 'ledger';
  let mask = false;
  let isSample = false;
  let fontsReady = false;
  let fontTimeout = false;

  const off = document.createElement('canvas');
  off.width = CW; off.height = CH;

  const preview = el('canvas', { class: 'card-preview', width: '540', height: '960', role: 'img', 'aria-label': '分享圖卡預覽' });
  const thumbs = el('div', { class: 'card-layouts', role: 'radiogroup', 'aria-label': '圖卡版型' });
  const controls = el('div', { class: 'card-controls' });
  const status = el('p', { class: 'card-status', 'aria-live': 'polite' });

  LAYOUTS.forEach((L, i) => {
    const b = el('button', {
      type: 'button', class: 'card-layout', role: 'radio',
      'aria-checked': L.id === layout ? 'true' : 'false',
      tabindex: L.id === layout ? '0' : '-1',
      'data-layout': L.id,
    });
    b.innerHTML = `<canvas class="card-thumb" width="108" height="192"></canvas>
      <span class="card-layout-name">${esc(L.name)}</span>
      <span class="card-layout-desc">${esc(L.desc)}</span>`;
    b.addEventListener('click', () => choose(L.id));
    b.addEventListener('keydown', (e) => {
      const dirs = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!dirs[e.key]) return;
      e.preventDefault();
      const next = LAYOUTS[(i + dirs[e.key] + LAYOUTS.length) % LAYOUTS.length];
      choose(next.id);
      thumbs.querySelector(`[data-layout="${next.id}"]`)?.focus();
    });
    thumbs.append(b);
  });

  const maskLabel = el('label', { class: 'checkbox' });
  const maskInput = el('input', { type: 'checkbox' });
  maskInput.addEventListener('change', () => { mask = maskInput.checked; paint(); });
  maskLabel.append(maskInput, el('span', { text: '遮蔽所有金額' }));

  const dl = el('button', { type: 'button', class: 'btn btn-primary', id: 'card-download' }, [
    el('span', { html: icon('download', 16) }), el('span', { class: 'btn-label', text: '產生 PNG' }),
  ]);
  dl.addEventListener('click', download);

  controls.append(thumbs, maskLabel, dl, status);
  root.append(el('div', { class: 'card-preview-wrap' }, [preview]), controls);

  function choose(id) {
    layout = id;
    thumbs.querySelectorAll('.card-layout').forEach((n) => {
      const on = n.dataset.layout === id;
      n.setAttribute('aria-checked', on ? 'true' : 'false');
      n.setAttribute('tabindex', on ? '0' : '-1');
    });
    paint();
    announce(`已選擇${LAYOUTS.find((l) => l.id === id).name}版型`);
  }

  async function ensureFonts() {
    if (fontsReady || fontTimeout) return;
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ]);
      fontsReady = true;
    } catch {
      fontTimeout = true;
      status.textContent = '自訂字型載入逾時，圖卡改用系統字型。重新整理可以再試一次。';
    }
  }

  function paint() {
    if (!summary) return;
    const ctx = off.getContext('2d');
    if (!ctx) { status.textContent = '這個瀏覽器停用了 Canvas，圖卡無法繪製。'; return; }
    drawCard(ctx, { summary, layout, mask, isSample });

    const pctx = preview.getContext('2d');
    if (pctx) {
      pctx.clearRect(0, 0, preview.width, preview.height);
      pctx.drawImage(off, 0, 0, preview.width, preview.height);
    }
    thumbs.querySelectorAll('.card-layout').forEach((b) => {
      const c = b.querySelector('.card-thumb');
      const cx = c.getContext('2d');
      if (!cx) return;
      const tmp = document.createElement('canvas');
      tmp.width = CW; tmp.height = CH;
      const tctx = tmp.getContext('2d');
      if (!tctx) return;
      drawCard(tctx, { summary, layout: b.dataset.layout, mask, isSample });
      cx.clearRect(0, 0, c.width, c.height);
      cx.drawImage(tmp, 0, 0, c.width, c.height);
    });
  }

  async function download() {
    const label = dl.querySelector('.btn-label');
    dl.classList.add('is-loading');
    dl.setAttribute('aria-busy', 'true');
    label.textContent = '產生中';
    preview.classList.add('is-scanning');
    await ensureFonts();
    paint();
    await new Promise((r) => setTimeout(r, 30));
    off.toBlob((blob) => {
      preview.classList.remove('is-scanning');
      dl.classList.remove('is-loading');
      dl.removeAttribute('aria-busy');
      if (!blob) { label.textContent = '產生 PNG'; status.textContent = '圖卡產生失敗，這個瀏覽器可能限制了 canvas 匯出。'; return; }
      const a = el('a', {
        href: URL.createObjectURL(blob),
        download: `invoice-wrapped-${summary.year}-${layout}.png`,
      });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      label.textContent = '已下載';
      status.textContent = `已存成 invoice-wrapped-${summary.year}-${layout}.png，1080 × 1920。`;
      announce('圖卡已下載');
      setTimeout(() => { label.textContent = '產生 PNG'; }, 1200);
    }, 'image/png');
  }

  async function render(s, sample) {
    summary = s;
    isSample = sample;
    if (!summary) return;
    await ensureFonts();
    paint();
  }

  return { render, redraw: paint };
}
