/* budget.js — token 與花費估算、檔案挑選與分批。
   公式寫死在這裡，UI 上「估算方式」可以展開看到同一份文字。 */

import { costOf } from './pricing.js';

export const SYS_TOKENS = 1150;
export const GRAPH_TOKENS_PER_FILE = 24;
export const OUT_TOKENS_PER_FILE = 420;
export const OUT_TOKENS_CAP = 8000;
export const BYTES_PER_TOKEN = 3.6;

export function fileTokens(bytes) {
  return Math.ceil(bytes / BYTES_PER_TOKEN);
}

export function estimate(files, provider, modelId) {
  const n = files.length;
  const bytes = files.reduce((a, f) => a + (f.size || 0), 0);
  const inTok = Math.ceil(bytes / BYTES_PER_TOKEN) + SYS_TOKENS + n * GRAPH_TOKENS_PER_FILE;
  const outTok = Math.min(n * OUT_TOKENS_PER_FILE, OUT_TOKENS_CAP);
  return { files: n, bytes, inTok, outTok, total: inTok + outTok, cost: costOf(provider, modelId, inTok, outTok) };
}

/**
 * 依變動量排序、依預算分批。
 * 回傳每個檔案標上 batch（1 起算）與 why（為什麼被選）。
 * 單一檔案就超過預算的，batch = 0 並標 oversize。
 */
export function planBatches(entries, budget) {
  const sorted = [...entries].sort((a, b) => (b.churn || 0) - (a.churn || 0) || (b.size || 0) - (a.size || 0));
  let batch = 1;
  let used = SYS_TOKENS;
  const out = [];
  sorted.forEach((e, i) => {
    const tok = fileTokens(e.size) + GRAPH_TOKENS_PER_FILE;
    const rec = { ...e, tokens: tok, rank: i + 1 };
    if (tok + SYS_TOKENS > budget) {
      rec.batch = 0;
      rec.oversize = true;
      rec.why = `單檔 ${fmtK(tok)} 超過 ${fmtK(budget)} 預算上限`;
      out.push(rec);
      return;
    }
    if (used + tok > budget) { batch += 1; used = SYS_TOKENS; }
    used += tok;
    rec.batch = batch;
    rec.why = whyPicked(rec, i, batch);
    out.push(rec);
  });
  return out;
}

function whyPicked(rec, i, batch) {
  if (rec.status === 'new') return batch > 1 ? `新檔案，排入第 ${batch} 批` : '新檔案';
  if (batch > 1) return `變動量第 ${i + 1}，排入第 ${batch} 批`;
  return `變動量第 ${i + 1}`;
}

export function fmtK(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export function fmtInt(n) {
  return (n || 0).toLocaleString('en-US');
}

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
