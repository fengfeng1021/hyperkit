/* defects.js — 缺陷的本機驗證、排序與渲染。
   模型會編造行號，所以每一條的行號都要在本機驗證過：讀該檔案、確認行號在範圍內、
   把該行內容抓出來一起顯示。行號超出範圍的降級並標記，不是照樣顯示。 */

import { sevLabel, sevRank } from './strip.js';

const DOWN = { blocker: 'high', high: 'medium', medium: 'low', low: 'low' };

/** fileMap: Map<path, {text, lines}>；sent: Set<path> */
export function verify(raw, fileMap, sent) {
  const d = {
    id: 'd' + Math.random().toString(36).slice(2, 9),
    file: String(raw.file || '').replace(/^\.?\//, ''),
    line: parseInt(raw.line, 10) || 0,
    endLine: parseInt(raw.endLine, 10) || 0,
    severity: normSev(raw.severity),
    category: String(raw.category || '未分類').slice(0, 24),
    title: String(raw.title || '未命名缺陷').slice(0, 120),
    why: String(raw.why || '').slice(0, 1200),
    related: Array.isArray(raw.related) ? raw.related.filter((r) => r && r.file).map((r) => ({
      file: String(r.file).replace(/^\.?\//, ''), line: parseInt(r.line, 10) || 0,
    })) : [],
    lineVerified: true,
    outOfScope: false,
    excerpt: null,
    lines: 0,
  };

  const rec = fileMap.get(d.file);
  if (!rec) {
    d.outOfScope = !sent.has(d.file);
    d.lineVerified = false;
    d.severity = DOWN[d.severity];
    return d;
  }
  d.lines = rec.lines;
  if (d.line < 1 || d.line > rec.lines) {
    d.lineVerified = false;
    d.severity = DOWN[d.severity];
  } else {
    d.excerpt = excerptOf(rec.text, d.line, d.endLine);
  }
  d.related = d.related.map((r) => {
    const rr = fileMap.get(r.file);
    return { ...r, outOfScope: !rr && !sent.has(r.file), ok: !!rr && r.line >= 1 && r.line <= rr.lines };
  });
  return d;
}

function normSev(s) {
  const v = String(s || '').toLowerCase();
  if (v.startsWith('block') || v === 'critical' || v === '阻斷') return 'blocker';
  if (v.startsWith('high') || v === '高') return 'high';
  if (v.startsWith('low') || v === '低') return 'low';
  return 'medium';
}

export function excerptOf(text, line, endLine) {
  const all = String(text || '').split('\n');
  const last = endLine && endLine >= line ? Math.min(endLine, all.length) : line;
  const from = Math.max(1, line - 3);
  const to = Math.min(all.length, last + 3);
  const out = [];
  for (let n = from; n <= to; n += 1) out.push({ n, t: all[n - 1] ?? '', hit: n >= line && n <= last });
  return out;
}

export function isCross(d) { return !!(d.related && d.related.length); }

export function sortDefects(list, mode) {
  const arr = [...list];
  if (mode === 'severity') {
    arr.sort((a, b) => sevRank(a.severity) - sevRank(b.severity)
      || a.file.localeCompare(b.file) || a.line - b.line);
  } else if (mode === 'file') {
    arr.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  } else {
    // 跨檔案永遠排最前面：排序本身要說明產品在賣什麼
    arr.sort((a, b) => (isCross(b) ? 1 : 0) - (isCross(a) ? 1 : 0)
      || sevRank(a.severity) - sevRank(b.severity)
      || a.file.localeCompare(b.file) || a.line - b.line);
  }
  return arr;
}

/* ------------------------------------------------------------- rendering */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function icon(id, cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

const MARK_SVG = {
  blocker: '<circle cx="12" cy="12" r="5" fill="currentColor"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 0v3M12 21v3M0 12h3M21 12h3" stroke="currentColor" stroke-width="1.5"/>',
  high: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" stroke-width="1.5"/>',
  medium: '<circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>',
  low: '<path d="M12 8a4 4 0 1 0 3 6.6" fill="none" stroke="currentColor" stroke-width="1"/>',
};

function markSvg(sev) {
  const wrap = document.createElement('span');
  wrap.className = 'dmark';
  wrap.style.color = `var(--sev-${sevRank(sev)})`;
  wrap.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${MARK_SVG[sev] || MARK_SVG.medium}</svg>`;
  return wrap;
}

export function renderDefect(d, h) {
  const li = el('li', 'drow');
  li.dataset.id = d.id;
  li.tabIndex = -1;
  li.appendChild(markSvg(d.severity));

  const body = el('div');
  const head = el('div', 'dhead');
  const sev = el('span', 'dsev', sevLabel(d.severity));
  sev.dataset.s = String(sevRank(d.severity));
  head.appendChild(sev);
  head.appendChild(el('span', 'dcat', d.category));
  const loc = el('span', 'dloc', `${d.file}:${d.line}`);
  head.appendChild(loc);
  if (isCross(d)) head.appendChild(el('span', 'dtag', '跨檔案'));
  if (!d.lineVerified) head.appendChild(el('span', 'dtag', '行號未能對應'));
  if (d.outOfScope) head.appendChild(el('span', 'dtag', '未在本次送出範圍'));
  body.appendChild(head);

  body.appendChild(el('h3', 'dtitle', d.title));

  if (isCross(d)) {
    const rel = el('div', 'drel');
    d.related.forEach((r) => {
      const row = el('span', 'drel-i');
      row.appendChild(icon('i-leader'));
      row.appendChild(el('span', null, `${r.file}:${r.line}`));
      if (r.outOfScope) row.appendChild(el('span', 'dtag', '未在本次送出範圍'));
      rel.appendChild(row);
    });
    body.appendChild(rel);
  }

  body.appendChild(el('p', 'dwhy', d.why));

  if (!d.lineVerified) {
    body.appendChild(el('p', 'dnote',
      d.outOfScope
        ? '這個檔案不在本次送出的清單裡，所以行號無法在本機驗證。情境描述仍可能是對的，但已降一階。'
        : `行號 ${d.line} 超出這個檔案的 ${d.lines} 行範圍，無法在本機對應，已降一階。`));
  }

  const acts = el('div', 'dacts');
  if (d.excerpt) {
    const bx = el('button', 'btn btn-xs btn-ghost', '展開節錄');
    bx.type = 'button';
    bx.addEventListener('click', () => h.toggleExcerpt(d, li, bx));
    acts.appendChild(bx);
  }
  const bd = el('button', 'btn btn-xs btn-ghost');
  bd.type = 'button';
  bd.appendChild(icon('i-dismiss'));
  bd.appendChild(document.createTextNode('這類我不管'));
  bd.addEventListener('click', () => h.dismiss(d, li));
  acts.appendChild(bd);

  const bc = el('button', 'btn btn-xs btn-ghost');
  bc.type = 'button';
  bc.appendChild(icon('i-copy'));
  bc.appendChild(document.createTextNode('複製'));
  bc.addEventListener('click', () => h.copy(d, bc));
  acts.appendChild(bc);

  body.appendChild(acts);
  li.appendChild(body);
  return li;
}

export function excerptNode(d) {
  const box = el('div', 'code');
  box.appendChild(el('p', 'code-file', d.file));
  d.excerpt.forEach((l) => {
    const row = el('div', 'code-l');
    if (l.hit) row.dataset.hit = '1';
    row.appendChild(el('span', 'code-n', String(l.n)));
    row.appendChild(el('span', 'code-t', l.t));
    box.appendChild(row);
  });
  return box;
}

export function defectText(d) {
  const lines = [
    `[${sevLabel(d.severity)}] ${d.category} — ${d.title}`,
    `${d.file}:${d.line}${d.lineVerified ? '' : '（行號未能對應）'}`,
  ];
  d.related.forEach((r) => lines.push(`  跨檔案 ${r.file}:${r.line}`));
  lines.push('', d.why);
  return lines.join('\n');
}
