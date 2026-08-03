/* review.js
   年度回顧模式：全螢幕十屏、scroll-snap、focus trap、年輪 canvas、
   年度比較未解鎖面板（含 .ics 產生器）、最後一屏的分享圖卡。
   內容全部預設可見。這一層不寫任何 GSAP。

   給動效層的介面（js/motion.js）：
   - root 上會發出 'review:open'（章節已建好、尺寸已量得到）與 'review:close'
   - getRing() 回傳年輪控制器，含 setReveal() / setRadiusScale()，
     讓動效層可以逐格點亮與收縮，幾何仍然只有這一份 */

import { el, announce, token, rampColor, fitCanvas, raf } from './ui.js';
import { icon } from './icons.js';
import { money, int, pct, ymd, mdw, weekdayName, hourLabel } from './format.js';
import { createShareCard } from './sharecard.js';

export function createReview(root, { onClose, onImportOther, onLoadSample2024 }) {
  let summary = null;
  let compare = null;
  let isSample = false;
  let opener = null;
  let card = null;
  let ring = null;
  let chapters = [];

  const scroller = el('div', { class: 'review-scroller' });
  const closeBtn = el('button', {
    type: 'button', class: 'review-close', 'aria-label': '回到儀表板（Esc）',
  }, [el('span', { html: icon('close', 18) }), el('span', { class: 'review-close-text', text: '回到儀表板' })]);

  root.append(closeBtn, scroller);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '年度回顧');

  closeBtn.addEventListener('click', close);

  function chapter(id, index, total, parts) {
    const sec = el('section', { class: 'chapter', id, 'aria-labelledby': `${id}-h` });
    sec.append(el('p', {
      class: 'chapter-index num', 'aria-hidden': 'true',
      text: `${String(index).padStart(2, '0')} / ${total}`,
    }));
    const inner = el('div', { class: 'chapter-inner' });
    parts.forEach((p) => inner.append(p));
    sec.append(inner);
    return sec;
  }

  function build() {
    scroller.innerHTML = '';
    chapters = [];
    if (!summary) return;
    const T = 10;
    const s = summary;

    /* 01 開場 */
    chapters.push(chapter('ch-open', 1, T, [
      el('h2', { class: 'chapter-num num', id: 'ch-open-h', tabindex: '-1', text: money(s.totalCents, { noCents: true }) }),
      el('p', { class: 'chapter-note', text: `${s.year} 年，你開出 ${int(s.count)} 張發票。這是它們加起來的樣子。` }),
      el('p', { class: 'chapter-sub', text: s.firstDate && s.lastDate ? `${ymd(s.firstDate)} 到 ${ymd(s.lastDate)}，其中 ${int(s.activeDays)} 天有消費。` : '' }),
    ]));

    /* 02 最大分類 */
    const topCat = s.byCategory[0];
    chapters.push(chapter('ch-cat', 2, T, [
      el('h2', { class: 'chapter-num num', id: 'ch-cat-h', text: topCat ? pct(topCat.cents, s.totalCents, 0) : '-' }),
      el('p', { class: 'chapter-note', text: topCat ? `你的錢有這麼多流進「${topCat.name}」，${int(topCat.count)} 筆，${money(topCat.cents, { noCents: true })}。` : '' }),
      catBars(s),
    ]));

    /* 03 你的第二個家（招牌時刻的舞台） */
    const ch = s.champion;
    const homeSec = chapter('ch-home', 3, T, [
      el('div', { class: 'champion' }, [
        el('span', { class: 'champion-logo', text: ch ? ch.name : '' }),
        el('span', { class: 'champion-num num', id: 'ch-home-h', text: ch ? String(ch.count) : '0' }),
      ]),
      ringHost(),
      el('p', { class: 'chapter-note', text: ch
        ? `你今年走進 ${ch.name} 的次數，比一年裡的週末還多。平均每 ${(365 / Math.max(1, ch.count)).toFixed(1)} 天一次。`
        : '這份資料裡沒有重複造訪的店家。' }),
      el('span', { class: 'ring-seed', 'aria-hidden': 'true' }),
    ]);
    chapters.push(homeSec);

    /* 04 最貴的一筆 */
    const big = s.biggest;
    chapters.push(chapter('ch-max', 4, T, [
      el('h2', { class: 'chapter-num num', id: 'ch-max-h', text: big ? money(big.amountCents, { noCents: true }) : '-' }),
      el('p', { class: 'chapter-note', text: big ? `${ymd(big.date)}，${big.store}。這是你今年最貴的一張發票。` : '' }),
      big && big.items.length ? el('ul', { class: 'chapter-items' },
        big.items.slice(0, 6).map((it) => el('li', {}, [
          el('span', { class: 'ci-name', text: it.name }),
          el('span', { class: 'ci-sub num', text: money(it.subCents, { noCents: true }) }),
        ]))) : el('p', { class: 'chapter-sub', text: '這張發票沒有品項明細。' }),
    ]));

    /* 05 最晚的一次 */
    const late = s.latest;
    chapters.push(chapter('ch-late', 5, T, [
      el('h2', { class: 'chapter-num num', id: 'ch-late-h', text: late ? `${String(late.hour).padStart(2, '0')}:${String(late.inv.date.getMinutes()).padStart(2, '0')}` : '無時間' }),
      el('p', { class: 'chapter-note', text: late
        ? `${mdw(late.inv.date)}，${late.inv.store}，${money(late.inv.amountCents, { noCents: true })}。那個時間你還醒著。`
        : '這份資料的日期不含時間，所以算不出最晚的一次。' }),
    ]));

    /* 06 消費最兇的一週 */
    const pw = s.peakWeek;
    chapters.push(chapter('ch-week', 6, T, [
      el('h2', { class: 'chapter-num num', id: 'ch-week-h', text: pw ? money(pw.cents, { noCents: true }) : '-' }),
      el('p', { class: 'chapter-note', text: pw
        ? `${ymd(pw.from)} 到 ${ymd(pw.to)}，七天內 ${int(pw.count)} 筆。這是你今年花得最兇的一週。`
        : '' }),
      el('p', { class: 'chapter-sub', text: pw ? `同期的全年平均是 ${money(Math.round(s.totalCents / 52), { noCents: true })} 一週。` : '' }),
    ]));

    /* 07 行為指紋：最固定的習慣看的是「次數」，不是金額 */
    let peak = { r: 0, c: 0, count: -1, cents: 0 };
    for (let r = 0; r < 7; r++) for (let c = 0; c < 24; c++) {
      const cell = s.byWeekdayHour[r][c];
      if (cell.count > peak.count) peak = { r, c, count: cell.count, cents: cell.cents };
    }
    chapters.push(chapter('ch-print', 7, T, [
      el('h2', { class: 'chapter-num num', id: 'ch-print-h', text: s.hasTime ? `${weekdayName(peak.r)} ${hourLabel(peak.c)}` : '無時間' }),
      el('p', { class: 'chapter-note', text: s.hasTime
        ? `這一格出現 ${int(peak.count)} 次，合計 ${money(peak.cents, { noCents: true })}。這是你這一年最固定的一個習慣。`
        : '這份資料的日期不含時間，星期與時段的指紋算不出來。' }),
      miniHeat(s),
    ]));

    /* 08 長尾 */
    const once = s.byStore.filter((x) => x.count === 1).length;
    const top5 = pct(s.byStore.slice(0, 5).reduce((a, x) => a + x.cents, 0), s.totalCents, 0);
    chapters.push(chapter('ch-tail', 8, T, [
      el('h2', { class: 'chapter-num num', id: 'ch-tail-h', text: int(s.storeCount) }),
      el('p', { class: 'chapter-note', text: once
        ? `你今年走進 ${int(s.storeCount)} 家不同的店，其中 ${int(once)} 家只去過一次。`
        : `你今年走進 ${int(s.storeCount)} 家不同的店，每一家都不只去過一次。` }),
      el('p', { class: 'chapter-sub', text: `金額最高的五家就吃掉 ${top5}，剩下的 ${int(Math.max(0, s.storeCount - 5))} 家分掉其餘。` }),
    ]));

    /* 09 年度比較 */
    chapters.push(chapter('ch-compare', 9, T, [compareBlock(s)]));

    /* 10 撕下一張帶走 */
    const cardHost = el('div', { class: 'share-card', id: 'share-card' });
    chapters.push(chapter('ch-card', 10, T, [
      el('h2', { class: 'chapter-h2', id: 'ch-card-h', text: '撕下一張帶走' }),
      el('p', { class: 'chapter-sub', text: '在這台裝置上畫好，直接存成 PNG。沒有截圖服務，沒有上傳。' }),
      cardHost,
    ]));

    chapters.forEach((c) => scroller.append(c));

    card = createShareCard(cardHost);
    card.render(summary, isSample);
    ring = mountRing();
  }

  /* ---- 主數字的合身量測 ----
     每屏的主數字是一整串不能斷的字（金額、時刻、「週三 18:00」）。
     這裡量出「整串寬度 ÷ 目前字級」，那是一個與字級無關的比值，
     交給 CSS 去和設計上限取小值，窄容器就自動縮到剛好一行。
     量一次就夠；字體換好之後會再量一次，因為那時候字寬才是最終的。 */
  function fitNumbers() {
    if (root.hidden) return;
    scroller.querySelectorAll('.chapter-num, .champion-num').forEach((n) => {
      const text = (n.textContent || '').trim();
      if (!text) return;
      const probe = n.cloneNode(true);
      probe.removeAttribute('id');
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;'
        + 'white-space:nowrap;width:max-content;max-width:none;font-size:100px';
      n.parentElement.append(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      if (w > 0) n.style.setProperty('--num-em', ((w / 100) * 1.03).toFixed(3));
    });
  }

  /* ---- 分類長條（單一油墨，濃淡就是分類） ---- */
  function catBars(s) {
    const wrap = el('div', { class: 'cat-bars' });
    s.byCategory.slice(0, 6).forEach((c) => {
      const row = el('div', { class: 'cat-bar' });
      row.append(el('span', { class: 'cb-name', text: c.name }));
      const track = el('span', { class: 'cb-track' });
      const fill = el('span', { class: 'cb-fill' });
      fill.style.width = `${(c.cents / s.totalCents) * 100}%`;
      fill.style.background = rampColor(c.ramp);
      track.append(fill);
      row.append(track);
      row.append(el('span', { class: 'cb-val num', text: money(c.cents, { noCents: true }) }));
      wrap.append(row);
    });
    return wrap;
  }

  function miniHeat(s) {
    const box = el('div', { class: 'mini-heat', 'aria-hidden': 'true' });
    const max = Math.max(1, ...s.byWeekdayHour.flat().map((c) => c.cents));
    for (let r = 0; r < 7; r++) {
      const row = el('div', { class: 'mini-heat-row' });
      for (let c = 0; c < 24; c++) {
        const v = s.byWeekdayHour[r][c].cents / max;
        const cell = el('span', { class: 'mini-heat-cell' });
        cell.style.background = rampColor(v === 0 ? 0 : Math.max(1, Math.round(v * 6)));
        row.append(cell);
      }
      box.append(row);
    }
    return box;
  }

  /* ---- 年輪 ---- */

  function ringHost() {
    const host = el('div', { class: 'ring-host' });
    host.append(el('canvas', {
      class: 'ring-canvas', id: 'ring', tabindex: '0', role: 'img',
      'aria-label': '年輪：每一格是一次造訪，依日期順時針排列。左右方向鍵查詢單日金額。',
    }));
    host.append(el('p', { class: 'ring-readout num', 'aria-live': 'polite' }));
    return host;
  }

  function mountRing() {
    const canvas = scroller.querySelector('#ring');
    const readout = scroller.querySelector('.ring-readout');
    if (!canvas) return null;
    const visits = summary.champion ? summary.champion.visits : [];
    let idx = -1;
    let ctx = null;
    let geom = null;
    /* 動效層可以插手的兩個旋鈕。null / 1 就是靜態終值。 */
    let reveal = null;      // (i, total) => { s: 0..1 縮放, a: 0..1 透明度 }
    let radiusScale = 1;    // 整圈半徑倍率，退場時收縮成一點

    let sized = 0;
    function draw() {
      // 年輪必須是正圓。全站的 img/svg/canvas 有 max-width:100%，所以只要算出來的
      // 邊長超過容器寬度，瀏覽器就會把它橫向壓扁成橢圓（畫布座標仍是正方形）。
      // 因此邊長一律先夾在容器實際可用寬度之內。
      // 量的是章節的內容欄，不是 .ring-host——後者是 shrink-to-fit，
      // 拿它當上限會跟畫布互相決定寬度，愈畫愈小。
      const col = canvas.closest('.chapter-inner');
      const avail = col ? Math.floor(col.getBoundingClientRect().width) : 0;
      const wanted = Math.min(360, Math.max(220, (scroller.clientWidth || 360) * 0.62));
      const size = Math.floor(avail > 0 ? Math.min(wanted, avail) : wanted);
      // 動效層會逐幀呼叫這個函式。尺寸沒變就別重設 canvas.width，
      // 那會重新配置點陣圖，是這一段唯一會掉幀的地方。
      if (size !== sized || !ctx) {
        ctx = fitCanvas(canvas, size, size);
        sized = size;
      }
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      if (!visits.length) return;
      const cx = size / 2, cy = size / 2;
      const R = size * 0.40;
      geom = { cx, cy, R, size };
      const sorted = [...visits].map((v) => v.cents).sort((a, b) => a - b);
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      const cuts = [q(0.25), q(0.5), q(0.75)];
      visits.forEach((v, i) => {
        const rv = reveal ? reveal(i, visits.length) : null;
        if (rv && (rv.a <= 0.001 || rv.s <= 0.001)) return;
        const s = rv ? rv.s : 1;
        const ang = (i / visits.length) * Math.PI * 2 - Math.PI / 2;
        const step = v.cents <= cuts[0] ? 3 : v.cents <= cuts[1] ? 4 : v.cents <= cuts[2] ? 5 : 6;
        const x = cx + Math.cos(ang) * R * radiusScale;
        const y = cy + Math.sin(ang) * R * radiusScale;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        if (rv) ctx.globalAlpha = rv.a;
        ctx.fillStyle = rampColor(step);
        ctx.fillRect(-3 * s, -3 * s, 6 * s, 6 * s);
        if (i === idx) {
          ctx.strokeStyle = token('--paper');
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-5, -5, 10, 10);
        }
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    }

    function pick(i) {
      idx = i;
      draw();
      const v = visits[i];
      if (v) readout.textContent = `${mdw(v.date)} ${money(v.cents, { noCents: true })}`;
    }

    canvas.addEventListener('pointermove', (e) => {
      if (!geom || !visits.length) return;
      const box = canvas.getBoundingClientRect();
      const dx = e.clientX - box.left - geom.cx;
      const dy = e.clientY - box.top - geom.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(d - geom.R) > 16) { if (idx !== -1) { idx = -1; readout.textContent = ''; draw(); } return; }
      let a = Math.atan2(dy, dx) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      pick(Math.min(visits.length - 1, Math.floor((a / (Math.PI * 2)) * visits.length)));
    });
    canvas.addEventListener('pointerleave', () => { idx = -1; readout.textContent = ''; draw(); });
    canvas.addEventListener('keydown', (e) => {
      if (!visits.length) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        pick((idx + (e.key === 'ArrowRight' ? 1 : visits.length - 1) + (idx < 0 ? 1 : 0)) % visits.length);
        announce(readout.textContent);
      }
    });

    const redraw = raf(draw);
    window.addEventListener('resize', redraw);
    draw();
    return {
      draw,
      canvas,
      count: () => visits.length,
      setReveal: (fn) => { reveal = fn; },
      setRadiusScale: (v) => { radiusScale = v; },
    };
  }

  /* ---- 年度比較 / 未解鎖 ---- */

  function compareBlock(s) {
    if (compare) {
      const diff = s.totalCents - compare.totalCents;
      const box = el('div', { class: 'compare' });
      box.append(el('h2', { class: 'chapter-num num', id: 'ch-compare-h', text: `${diff >= 0 ? '+' : ''}${pct(Math.abs(diff), compare.totalCents, 1)}` }));
      box.append(el('p', { class: 'chapter-note', text: `跟 ${compare.year} 年比，你今年${diff >= 0 ? '多' : '少'}花了 ${money(Math.abs(diff), { noCents: true })}。` }));
      const rows = [
        ['總金額', money(compare.totalCents, { noCents: true }), money(s.totalCents, { noCents: true })],
        ['筆數', `${int(compare.count)} 筆`, `${int(s.count)} 筆`],
        ['店家數', `${int(compare.storeCount)} 家`, `${int(s.storeCount)} 家`],
        ['平均單筆', money(compare.avgCents, { noCents: true }), money(s.avgCents, { noCents: true })],
        ['最常去', compare.champion?.name || '-', s.champion?.name || '-'],
      ];
      const table = el('div', { class: 'compare-table' });
      table.append(el('div', { class: 'cmp-row cmp-row--head' }, [
        el('span', {}), el('span', { class: 'num', text: String(compare.year) }), el('span', { class: 'num', text: String(s.year) }),
      ]));
      rows.forEach(([k, a, b]) => table.append(el('div', { class: 'cmp-row' }, [
        el('span', { class: 'cmp-key', text: k }),
        el('span', { class: 'cmp-a num', text: a }),
        el('span', { class: 'cmp-b num', text: b }),
      ])));
      box.append(table);
      return box;
    }

    const box = el('div', { class: 'unlock' });
    box.append(el('h2', { class: 'chapter-h2', id: 'ch-compare-h', text: '等一份就能比較' }));
    const rolls = el('div', { class: 'unlock-rolls', 'aria-hidden': 'true' });
    const rollA = el('div', { class: 'roll roll--filled' });
    rollA.innerHTML = `<span class="roll-year num">${s.year}</span>`
      + s.byMonth.map((m, i) => `<span class="roll-line"><span class="roll-m num">${i + 1}</span>
        <span class="roll-bar" style="width:${Math.max(4, (m.cents / Math.max(1, ...s.byMonth.map((x) => x.cents))) * 100)}%"></span></span>`).join('');
    const rollB = el('div', { class: 'roll roll--blank' });
    rollB.innerHTML = `<span class="roll-year num">${s.year - 1}</span>`;
    const link = el('div', { class: 'unlock-link' }, [el('span', { class: 'unlock-link-text', text: '等一份就能比較' })]);
    rolls.append(rollA, link, rollB);
    box.append(rolls);

    box.append(el('p', { class: 'chapter-sub', text: `你只匯入了 ${s.year} 年。再給它一個年度，這一屏會變成同期成長率、分類位移、店家進榜與退榜。` }));

    const outs = el('div', { class: 'unlock-outs' });
    const b1 = el('button', { type: 'button', class: 'btn btn-primary', text: '匯入另一個年度的 CSV' });
    b1.addEventListener('click', () => { onImportOther(); });
    const b2 = el('button', { type: 'button', class: 'btn btn-secondary', text: `載入 ${s.year - 1} 年範例資料` });
    b2.addEventListener('click', () => onLoadSample2024());
    const b3 = el('button', { type: 'button', class: 'btn btn-secondary', text: '明年提醒我' });
    b3.addEventListener('click', () => downloadIcs(s.year + 1));
    outs.append(b1, b2, b3);
    box.append(outs);
    box.append(el('p', { class: 'unlock-note', text: '提醒是一個 .ics 行事曆檔，在這台裝置上產生，不需要註冊任何服務。' }));
    return box;
  }

  function downloadIcs(year) {
    const stamp = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    const day = new Date(Date.UTC(year, 0, 5));
    const next = new Date(Date.UTC(year, 0, 6));
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//invoice-wrapped-tw//TW',
      'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:iwtw-${year}@fengfeng1021.github.io`,
      `DTSTAMP:${stamp(new Date())}T000000Z`,
      `DTSTART;VALUE=DATE:${stamp(day)}`,
      `DTEND;VALUE=DATE:${stamp(next)}`,
      `SUMMARY:下載 ${year - 1} 年的載具消費明細，跑一次發票回顧`,
      'DESCRIPTION:到財政部電子發票整合服務平台的載具管理下載消費明細 CSV\\n然後打開 https://fengfeng1021.github.io/hyperkit/invoice-wrapped-tw/',
      'URL:https://fengfeng1021.github.io/hyperkit/invoice-wrapped-tw/',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `invoice-wrapped-${year}.ics` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    announce('已產生明年的行事曆提醒檔');
  }

  /* ---- 開關與鍵盤 ---- */

  function open(s, sample, opts = {}) {
    summary = s;
    isSample = sample;
    opener = opts.opener || document.activeElement;
    build();
    root.hidden = false;
    document.body.classList.add('is-review');
    scroller.scrollTop = 0;
    fitNumbers();
    document.fonts?.ready?.then(fitNumbers).catch(() => {});
    // 版面尺寸要等 overlay 顯示後才量得到，所以立刻重畫一次（不倚賴 rAF，
    // 分頁在背景時 rAF 會被凍結，圖卡與年輪就會停在 build 時的臨時尺寸）
    ring?.draw();
    card?.redraw();
    scroller.querySelector('#ch-open-h')?.focus();
    document.addEventListener('keydown', onKey, true);
    root.dispatchEvent(new CustomEvent('review:open'));
  }

  function close() {
    if (root.hidden) return;
    root.dispatchEvent(new CustomEvent('review:close'));
    root.hidden = true;
    document.body.classList.remove('is-review');
    document.removeEventListener('keydown', onKey, true);
    onClose();
    if (opener && opener.focus) opener.focus();
  }

  function goto(i) {
    const n = Math.max(0, Math.min(chapters.length - 1, i));
    scroller.scrollTo({ top: chapters[n].offsetTop, behavior: 'smooth' });
    chapters[n].querySelector('h2')?.setAttribute('tabindex', '-1');
  }

  function currentIndex() {
    const t = scroller.scrollTop + 4;
    let best = 0;
    chapters.forEach((c, i) => { if (c.offsetTop <= t) best = i; });
    return best;
  }

  function onKey(e) {
    if (root.hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag)) {
      if (e.key === 'Escape') close();
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { trap(e); return; }
    if (['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) {
      e.preventDefault(); goto(currentIndex() + 1); return;
    }
    if (['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) {
      e.preventDefault(); goto(currentIndex() - 1); return;
    }
    if (e.key === 'Home') { e.preventDefault(); goto(0); }
    if (e.key === 'End') { e.preventDefault(); goto(chapters.length - 1); }
  }

  function trap(e) {
    const f = [...root.querySelectorAll('a[href], button:not([disabled]), input, select, canvas[tabindex], [tabindex]:not([tabindex="-1"])')]
      .filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function setCompare(c) {
    compare = c;
    if (!root.hidden && summary) {
      const idx = currentIndex();
      root.dispatchEvent(new CustomEvent('review:close'));
      build();
      root.dispatchEvent(new CustomEvent('review:open'));
      window.requestAnimationFrame(() => goto(idx));
    }
  }

  return {
    open,
    close,
    setCompare,
    isOpen: () => !root.hidden,
    /* 動效層需要的三個把手 */
    scroller,
    getRing: () => ring,
    getSummary: () => summary,
  };
}
