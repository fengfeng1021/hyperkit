/* baseline.js — 基準線：遞迴讀檔、SHA-256、存 IndexedDB，之後比對現況得出變動檔案。
   刻意不解析 .git：isomorphic-git 兩週起跳，而且非 git 資料夾（agent 常常直接寫在
   沒有 git 的資料夾）用不到。 */

const enc = new TextEncoder();

export async function hashText(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function countLines(text) {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

/**
 * 對每一個檔案算雜湊。每 25 檔回報一次進度（避免每檔 reflow）。
 * 可用 AbortController 取消，取消後舊基準線保留。
 */
export async function markBaseline(entries, onProgress, signal) {
  const files = {};
  let i = 0;
  for (const e of entries) {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    let text = '';
    try { text = await e.read(); } catch { i += 1; continue; }
    files[e.path] = { hash: await hashText(text), size: e.size, lines: countLines(text) };
    i += 1;
    if (onProgress && i % 25 === 0) onProgress(i, entries.length);
  }
  if (onProgress) onProgress(i, entries.length);
  return { markedAt: Date.now(), files };
}

/**
 * 現況 vs 基準線。回傳 [{ path, size, status, churn, addedLines, removedLines }]
 * churn = 用來排序的變動量（位元組差 + 新檔案給滿分）
 */
export async function diffAgainst(baseline, entries, onProgress, signal) {
  const base = (baseline && baseline.files) || {};
  const changed = [];
  let i = 0;
  for (const e of entries) {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    const prev = base[e.path];
    let text = '';
    try { text = await e.read(); } catch { i += 1; continue; }
    const hash = await hashText(text);
    const lines = countLines(text);
    if (!prev) {
      changed.push({ path: e.path, size: e.size, status: 'new', churn: e.size,
                     addedLines: lines, removedLines: 0, text, read: e.read });
    } else if (prev.hash !== hash) {
      const dl = lines - (prev.lines || 0);
      changed.push({
        path: e.path, size: e.size, status: 'modified',
        churn: Math.abs(e.size - (prev.size || 0)) || Math.round(e.size * 0.25),
        addedLines: dl > 0 ? dl : 0, removedLines: dl < 0 ? -dl : 0,
        text, read: e.read,
      });
    }
    i += 1;
    if (onProgress && i % 25 === 0) onProgress(i, entries.length);
  }
  if (onProgress) onProgress(i, entries.length);
  const now = new Set(entries.map((e) => e.path));
  const deleted = Object.keys(base).filter((p) => !now.has(p));
  return { changed, deleted };
}

/** 本機解析 import / require 關係圖，不是語意索引。 */
export function importGraph(files) {
  const known = new Set(files.map((f) => f.path));
  const edges = [];
  const rx = /(?:import\s[^'"]*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"])/g;
  for (const f of files) {
    if (!f.text) continue;
    let m;
    rx.lastIndex = 0;
    while ((m = rx.exec(f.text)) !== null) {
      const spec = m[1] || m[2] || m[3];
      if (!spec || !spec.startsWith('.')) continue;
      const target = resolveRel(f.path, spec, known);
      if (target && target !== f.path) edges.push([f.path, target]);
    }
  }
  return edges;
}

function resolveRel(from, spec, known) {
  const dir = from.split('/').slice(0, -1);
  const parts = spec.split('/');
  const out = [...dir];
  for (const p of parts) {
    if (p === '.' || p === '') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  const base = out.join('/');
  const cands = [base, base + '.js', base + '.ts', base + '.jsx', base + '.tsx',
                 base + '/index.js', base + '/index.ts'];
  return cands.find((c) => known.has(c)) || null;
}

export function fmtWhen(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtShort(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
