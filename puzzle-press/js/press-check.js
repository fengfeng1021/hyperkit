/* The press check.
   It is present from the first second with estimated values, because the whole
   argument of this product is that you can see what the machine measures before
   you have spent anything. After a run the same rows turn over to measured.

   Nothing in here is rounded to look better. If ninety-four puzzles hit the
   target level and six did not, the row says so. */

import { el, clear, icon, fmt } from './dom.js';
import { fontById, kb, totalBytes, loadedFont } from './fonts.js';
import { summarise } from './puzzles/verify.js';
import { PAGE_MIN, PAGE_MAX } from './kdp.js';

const LEVEL_LABEL = { 1: '入門', 2: '輕鬆', 3: '中等', 4: '困難', 5: '專家' };

export function specRows(app) {
  const { state } = app;
  const plan = state.plan;
  const measured = state.puzzles.filter(Boolean).length > 0;
  const tag = measured ? '實測' : '預估';
  const font = fontById(state.fontId);
  const g = plan.geo;
  const rows = [];

  rows.push({
    name: 'Trim（裁切尺寸）',
    value: plan.trim.label,
    why: 'KDP 標準開本，內頁與封面共用同一組尺寸',
    tag,
  });
  rows.push({
    name: 'Bleed（出血）',
    value: plan.bleed ? '0.125 in' : '關閉',
    why: plan.bleed ? '上、下、外三邊。內側是書脊，不裁切' : '無出血時外緣最小邊界降為 0.25 in',
    tag,
  });
  rows.push({
    name: 'PDF 頁面',
    value: `${g.pageWpt} × ${g.pageHpt} pt`,
    why: `${g.pageWin} × ${g.pageHin} in · 寬 = trim + 0.125，高 = trim + 0.25`,
    tag,
  });
  rows.push({
    name: '總頁數',
    value: fmt(plan.pageCount),
    why: `KDP 允許 ${PAGE_MIN} 到 ${PAGE_MAX}${plan.padded ? ` · 含 ${plan.padded} 張補頁` : ''}`,
    tag,
    flagged: plan.pageCount < PAGE_MIN || plan.pageCount > PAGE_MAX,
  });
  rows.push({
    name: 'Gutter（裝訂邊）',
    value: `${plan.gutterIn} in`,
    why: `${plan.pageCount} 頁落在 ${plan.tier.label} 級距`,
    tag,
  });
  rows.push({
    name: '外緣最小邊界',
    value: `${g.outerIn} in`,
    why: plan.bleed ? '有出血時的 KDP 最小值' : '無出血時的 KDP 最小值',
    tag,
  });

  const embedded = state.embedded;
  rows.push({
    name: '字型嵌入',
    value: font.name,
    why: embedded
      ? `Regular + Bold，已子集化 · ${embedded.glyphs} 個字元 · 原始 ${kb(totalBytes(font))}`
      : loadedFont(state.fontId)
        ? `Regular + Bold 已就緒（${kb(totalBytes(font))}），匯出時以 subset 嵌入`
        : `Regular + Bold 尚未下載（${kb(totalBytes(font))}，只下載一次）`,
    tag: embedded ? '實測' : '預估',
    flagged: state.fontStatus === 'failed',
  });
  rows.push({
    name: '解析度',
    value: '向量（無點陣圖）',
    why: '內頁全部是線與文字，不受 300 DPI 限制',
    tag,
  });
  return rows;
}

export function verdictRows(app) {
  const { state } = app;
  const done = state.puzzles.filter(Boolean);
  const pending = done.length === 0;
  const s = pending ? null : summarise(done, state.type);
  const target = state.level;

  const rows = [];
  const na = { value: '-', tag: '待開印', why: '' };

  if (state.type === 'sudoku') {
    rows.push({
      name: '唯一解',
      ...(pending
        ? na
        : {
            value: `${s.unique} / ${s.total}`,
            tag: '實測',
            why: '唯一性求解器逐題複驗，不重用生成期的中間結果',
            mark: s.unique === s.total ? 'check' : 'slash',
            flagged: s.unique !== s.total,
          }),
    });
  } else if (state.type === 'maze') {
    rows.push({
      name: '單一路徑',
      ...(pending
        ? na
        : {
            value: `${s.singlePath} / ${s.total}`,
            tag: '實測',
            why: 'BFS 驗證為樹：邊數 = 格數 - 1，且全部可達',
            mark: s.singlePath === s.total ? 'check' : 'slash',
            flagged: s.singlePath !== s.total,
          }),
    });
    rows.push({
      name: '最短解',
      ...(pending
        ? { value: '-', tag: '待開印', why: `目標區間 ${bandOf(target)} 步` }
        : {
            value: `${s.stepRange[0]} 到 ${s.stepRange[1]} 步`,
            tag: '實測',
            why: `目標區間 ${bandOf(target)} 步 · 命中 ${s.inBand} / ${s.total}`,
            mark: s.inBand === s.total ? 'check' : 'slash',
            flagged: s.inBand !== s.total,
          }),
    });
  } else {
    rows.push({
      name: '單字放置',
      ...(pending
        ? na
        : {
            value: `${s.verified} / ${s.total}`,
            tag: '實測',
            why: `共放入 ${fmt(s.placed)} 個字，逐格回讀確認${
              s.unplaced ? ` · ${s.unplaced} 個字在這個網格放不進去，已從單字表移除` : ''
            }`,
            mark: s.verified === s.total ? 'check' : 'slash',
            flagged: s.verified !== s.total,
          }),
    });
    rows.push({
      name: '字母密度',
      ...(pending
        ? { value: '-', tag: '待開印', why: `L${target} 目標密度 ${Math.round(densityTarget(target) * 100)}%` }
        : {
            value: `${s.densityRange[0]}% 到 ${s.densityRange[1]}%`,
            tag: '實測',
            why: `L${target} 目標密度 ${Math.round(densityTarget(target) * 100)}%，其餘是干擾字母`,
            mark: 'check',
          }),
    });
  }

  /* difficulty distribution, honest */
  if (state.type === 'sudoku') {
    rows.push({
      name: '難度分佈',
      ...(pending
        ? { value: '-', tag: '待開印', why: `目標 L${target} ${LEVEL_LABEL[target]}` }
        : {
            value: distLabel(s.levels),
            tag: '實測',
            why: `目標 L${target} ${LEVEL_LABEL[target]}`,
            mark: (s.levels[target] || 0) === s.total ? 'check' : null,
            details:
              (s.levels[target] || 0) === s.total
                ? null
                : [
                    '每一題都是先產生完整解、再逐格挖空，每挖一格都用唯一性求解器確認仍是唯一解。',
                    '挖到不能再挖之後，用技巧求解器評定它實際需要的最高階技巧。',
                    '評定結果低於目標時會換一個解重來，最多 12 次；12 次仍未命中就收下較低的那一級並列在這裡。',
                  ],
          }),
    });
  }

  rows.push({
    name: '題號連續性',
    ...(pending
      ? na
      : {
          value: `1 到 ${s.total} 無缺號`,
          tag: '實測',
          why: '題目頁與答案頁共用同一個 id',
          mark: s.contiguous ? 'check' : 'slash',
          flagged: !s.contiguous,
        }),
  });

  rows.push({
    name: '答案對應',
    ...(pending
      ? na
      : {
          value: `${s.verified} / ${s.total}`,
          tag: '實測',
          why: '逐題比對答案與題目',
          mark: s.verified === s.total ? 'check' : 'slash',
          flagged: s.verified !== s.total,
        }),
  });

  rows.push({
    name: '版面溢出',
    ...(pending
      ? { value: '-', tag: '待開印', why: '匯出 PDF 時逐行量測' }
      : state.embedded
        ? {
            value: `${state.embedded.overflow} 頁`,
            tag: '實測',
            why: '內容全部落在安全區內',
            mark: state.embedded.overflow === 0 ? 'check' : 'slash',
            flagged: state.embedded.overflow > 0,
          }
        : { value: '-', tag: '待匯出', why: '匯出 PDF 時逐行量測，量得的是真實字寬' }),
  });

  return rows;
}

function distLabel(levels) {
  return Object.keys(levels)
    .sort()
    .reverse()
    .map((lv) => `L${lv} × ${levels[lv]}`)
    .join(' · ');
}

function bandOf(level) {
  const bands = { 1: '40 到 70', 2: '70 到 110', 3: '120 到 180', 4: '190 到 270', 5: '300 到 420' };
  return bands[level] || bands[3];
}

function densityTarget(level) {
  return { 1: 0.4, 2: 0.48, 3: 0.56, 4: 0.68, 5: 0.78 }[level] || 0.56;
}

/* ---------- rendering ---------- */

export function renderCheck(app) {
  renderRows(app.dom.specRows, specRows(app));
  renderRows(app.dom.verdictRows, verdictRows(app));
  renderStamp(app);
  renderState(app);
}

function renderRows(host, rows) {
  clear(host);
  rows.forEach((r) => {
    const dt = el('dt', { text: r.name });
    const value = el('dd', {});
    if (r.mark) value.appendChild(icon(r.mark));
    value.appendChild(el('span', { text: r.value }));

    const row = el('div', { class: `spec${r.flagged ? ' is-flagged' : ''}` }, [
      dt,
      el('span', { class: 'leader', 'aria-hidden': 'true' }),
      value,
    ]);
    row.appendChild(
      el('p', { class: 'why' }, [
        el('span', { text: r.why || '' }),
        r.tag ? el('span', { class: `tag${r.tag === '實測' ? ' is-measured' : ''}`, text: r.tag }) : null,
      ].filter(Boolean)),
    );
    if (r.details) {
      const d = el('details', {}, [el('summary', { text: '為什麼不是 100？' })]);
      r.details.forEach((line) => d.appendChild(el('p', { text: line })));
      row.appendChild(d);
    }
    host.appendChild(row);
  });
}

function renderStamp(app) {
  const { state, dom } = app;
  const done = state.puzzles.filter(Boolean);
  const verified = done.filter((p) => p.verify && p.verify.pass).length;
  const failed = done.length - verified;
  dom.stamp.classList.toggle('is-clean', done.length > 0 && failed === 0 && state.phase === 'done');
  dom.stamp.classList.toggle('is-flagged', failed > 0);
  dom.stampCount.textContent = done.length ? `${state.plan.pageCount}p` : '';
}

function renderState(app) {
  const { state, dom } = app;
  const done = state.puzzles.filter(Boolean);
  if (!done.length) {
    dom.checkState.textContent = '全部為預估值。開印之後逐列翻成實測。';
    return;
  }
  const failed = done.filter((p) => p.verify && !p.verify.pass).length;
  if (state.phase === 'generating') dom.checkState.textContent = `生成中，已完成 ${done.length} 題。`;
  else if (state.phase === 'verifying') dom.checkState.textContent = '驗證中，逐題複驗。';
  else if (failed) dom.checkState.textContent = `${failed} 題未通過複驗，已在下方標出。`;
  else dom.checkState.textContent = `${done.length} 題全部通過複驗。`;
}

/* ---------- press-check.txt ---------- */

export function checkText(app) {
  const { state } = app;
  const lines = [];
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, Math.max(n, s.length));
  lines.push('PUZZLE PRESS 驗印單 / PRESS CHECK');
  lines.push('='.repeat(60));
  lines.push(`書名        ${state.title}`);
  lines.push(`種子        ${state.seed}`);
  lines.push(`題型        ${typeLabel(state.type)} L${state.level}`);
  lines.push(`產生時間    ${new Date().toLocaleString('zh-TW')}`);
  lines.push('');
  lines.push('規格');
  lines.push('-'.repeat(60));
  specRows(app).forEach((r) => {
    lines.push(`${pad(r.name, 18)}${pad(r.value, 34)}[${r.tag}]`);
    if (r.why) lines.push(`${' '.repeat(18)}${r.why}`);
  });
  lines.push('');
  lines.push('驗證');
  lines.push('-'.repeat(60));
  verdictRows(app).forEach((r) => {
    lines.push(`${pad(r.name, 18)}${pad(r.value, 34)}[${r.tag}]`);
    if (r.why) lines.push(`${' '.repeat(18)}${r.why}`);
  });
  lines.push('');
  lines.push('依據：Amazon KDP Help, "Set Trim Size, Bleed, and Margins"');
  lines.push('      topic GVBQ3CMEQW3W2VL6');
  lines.push('gutter 級距：24-150 = 0.375 in / 151-300 = 0.5 / 301-500 = 0.625');
  lines.push('             501-700 = 0.75 / 701-828 = 0.875');
  lines.push('外緣最小邊界：無出血 0.25 in，有出血 0.375 in');
  lines.push('');
  lines.push('這份檔案由 Puzzle Press 在你的瀏覽器裡產生，沒有任何資料離開這台電腦。');
  return lines.join('\n');
}

export function typeLabel(type) {
  return type === 'sudoku' ? '數獨' : type === 'maze' ? '迷宮' : '字謎';
}
