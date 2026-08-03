/* csv.js
   編碼偵測 + RFC 4180 tokenizer + 列分類 + 欄位自動對映。
   財政部的匯出格式會改版，所以這裡沒有任何寫死的欄位索引：
   欄位是靠「這一欄長得像什麼」推出來的，推不出來才交給對映精靈。 */

/* ---------------- 1. 二進位嗅探 ---------------- */

export function sniffBinary(bytes) {
  const head = bytes.subarray(0, 8);
  const s = String.fromCharCode(...head);
  if (s.startsWith('%PDF')) return { kind: 'pdf', label: ' PDF 檔' };
  if (head[0] === 0x50 && head[1] === 0x4b) return { kind: 'zip', label: ' ZIP 或 xlsx 檔' };
  if (head[0] === 0xd0 && head[1] === 0xcf) return { kind: 'xls', label: '舊版 Excel 檔' };
  if (head[0] === 0x89 && s.slice(1, 4) === 'PNG') return { kind: 'png', label: ' PNG 圖片' };
  if (head[0] === 0xff && head[1] === 0xd8) return { kind: 'jpg', label: ' JPEG 圖片' };
  return null;
}

/* ---------------- 2. 編碼偵測 ---------------- */

export const ENCODINGS = [
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'utf-8-bom', label: 'UTF-8（含 BOM）' },
  { id: 'big5', label: 'Big5' },
];

export function big5Supported() {
  try { new TextDecoder('big5'); return true; } catch { return false; }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function badRatio(text) {
  if (!text.length) return 1;
  let bad = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0xfffd) bad++;
  return bad / text.length;
}

function cjkRatio(text) {
  let cjk = 0;
  const n = Math.min(text.length, 20000);
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x4e00 && c <= 0x9fff) cjk++;
  }
  return n ? cjk / n : 0;
}

/**
 * 用 TextDecoder 嘗試 utf-8 與 big5，回報每個候選的品質。
 * @param {ArrayBuffer} buf
 * @param {string} [forced] 使用者手動指定的編碼 id
 */
export function decodeBuffer(buf, forced) {
  const bytes = new Uint8Array(buf);
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const candidates = [];

  if (forced) {
    const id = forced === 'utf-8-bom' ? 'utf-8' : forced;
    const text = stripBom(new TextDecoder(id).decode(bytes));
    return { text, encoding: forced, forced: true, ratio: badRatio(text), candidates: [] };
  }

  // UTF-8 嚴格模式：能過就一定是 UTF-8，不必再猜。
  try {
    const strict = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const text = stripBom(strict);
    return {
      text,
      encoding: hasBom ? 'utf-8-bom' : 'utf-8',
      ratio: 0,
      candidates: [{ id: hasBom ? 'utf-8-bom' : 'utf-8', ratio: 0, preview: preview(text) }],
    };
  } catch { /* 不是合法 UTF-8，往下試 */ }

  const loose = stripBom(new TextDecoder('utf-8').decode(bytes));
  candidates.push({ id: 'utf-8', ratio: badRatio(loose), cjk: cjkRatio(loose), text: loose });

  if (big5Supported()) {
    const b5 = stripBom(new TextDecoder('big5').decode(bytes));
    candidates.push({ id: 'big5', ratio: badRatio(b5), cjk: cjkRatio(b5), text: b5 });
  }

  candidates.sort((a, b) => (a.ratio - b.ratio) || (b.cjk - a.cjk));
  const best = candidates[0];
  return {
    text: best.text,
    encoding: best.id,
    ratio: best.ratio,
    ok: best.ratio <= 0.02,
    big5Missing: !big5Supported(),
    candidates: candidates.map((c) => ({ id: c.id, ratio: c.ratio, preview: preview(c.text) })),
  };
}

function preview(text) {
  return text.split(/\r\n|\n|\r/).slice(0, 5).join('\n').slice(0, 400);
}

/* ---------------- 3. RFC 4180 tokenizer ---------------- */

/**
 * 逐字元狀態機。處理引號內的逗號與換行、雙引號跳脫、CRLF/LF/CR。
 * @returns {string[][]}
 */
export function tokenize(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') { inQuotes = true; started = true; continue; }
    if (c === ',') { row.push(field); field = ''; started = true; continue; }
    if (c === '\r') { if (text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; started = false; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; started = false; continue; }
    field += c;
    started = true;
  }
  if (started || field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ---------------- 4. 型別偵測 ---------------- */

const RE_INVOICE = /^[A-Z]{2}\s?-?\s?\d{8}$/;
const RE_TAXID = /^\d{8}$/;
const RE_AMOUNT = /^-?\$?\s?[\d,]+(\.\d+)?$/;

/** 支援西元、民國、含時間、不含時間 */
export function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m;

  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d) ? null : { date: d, hasTime: m[4] != null };
  }

  m = s.match(/^(\d{2,3})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) { // 民國年
    const d = new Date(+m[1] + 1911, +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    return isNaN(d) ? null : { date: d, hasTime: m[4] != null };
  }

  m = s.match(/^(\d{4})(\d{2})(\d{2})(?:\s?(\d{2})(\d{2})(\d{2})?)?$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d) ? null : { date: d, hasTime: m[4] != null };
  }

  m = s.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (m) {
    const d = new Date(+m[1] + 1911, +m[2] - 1, +m[3]);
    return isNaN(d) ? null : { date: d, hasTime: false };
  }
  return null;
}

export function parseAmountCents(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[$,\s]/g, '');
  if (s === '' || !RE_AMOUNT.test(String(raw).trim())) {
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** 給對映精靈用的「這一欄看起來像什麼」提示 */
export function guessType(values) {
  const vals = values.filter((v) => v != null && String(v).trim() !== '').slice(0, 40);
  if (!vals.length) return { type: 'empty', hint: '這一欄是空的' };
  const hit = (fn) => vals.filter(fn).length / vals.length;

  const inv = hit((v) => RE_INVOICE.test(v.trim()));
  if (inv > 0.8) return { type: 'invoiceNo', hint: `看起來像發票號碼：${vals[0]}` };

  const dt = hit((v) => !!parseDate(v));
  if (dt > 0.8) return { type: 'date', hint: `看起來像日期：${vals[0]}` };

  const tax = hit((v) => RE_TAXID.test(v.trim()));
  if (tax > 0.8) return { type: 'taxId', hint: `看起來像統一編號：${vals[0]}` };

  const amt = hit((v) => parseAmountCents(v) != null);
  if (amt > 0.8) return { type: 'amount', hint: `看起來像金額：${vals[0]}` };

  const avg = vals.reduce((a, v) => a + v.length, 0) / vals.length;
  return { type: 'text', hint: `看起來像文字（平均 ${avg.toFixed(0)} 個字）：${vals[0]}` };
}

/* ---------------- 5. 列分類與自動對映 ---------------- */

const ROW_TAG = /^(?:表頭|表身|表尾|header|detail)?\s*=?\s*([MD])$/i;

export function classify(rows) {
  const main = [];
  const detail = [];
  const skipped = [];
  rows.forEach((cells, i) => {
    if (!cells.length || (cells.length === 1 && cells[0].trim() === '')) return; // 空行不算跳過
    const first = (cells[0] || '').trim();
    const tag = first.match(ROW_TAG);
    if (tag && first.length <= 2) {
      (tag[1].toUpperCase() === 'M' ? main : detail).push({ line: i + 1, cells });
      return;
    }
    skipped.push({
      line: i + 1,
      raw: cells.join(','),
      reason: tag ? '格式說明列（不是資料）' : `第一欄是「${first.slice(0, 12)}」，不是 M 或 D`,
    });
  });
  return { main, detail, skipped };
}

function scoreColumns(rows, key, test) {
  const width = rows.reduce((w, r) => Math.max(w, r.cells.length), 0);
  const scores = new Array(width).fill(0);
  const sample = rows.slice(0, 120);
  for (let c = 0; c < width; c++) {
    let hit = 0, n = 0;
    for (const r of sample) {
      const v = (r.cells[c] || '').trim();
      if (v === '') continue;
      n++;
      if (test(v)) hit++;
    }
    scores[c] = n ? hit / n : 0;
  }
  return scores;
}

function pickBest(scores, taken, min = 0.8) {
  let best = -1, bestV = min;
  scores.forEach((v, i) => { if (!taken.has(i) && v > bestV) { bestV = v; best = i; } });
  return best;
}

/**
 * 自動推導 M 列與 D 列的欄位對映。
 * 回傳 null 代表推不出來，呼叫端應開啟對映精靈。
 */
export function autoMap(main, detail) {
  if (!main.length) return null;
  const taken = new Set();

  const invS = scoreColumns(main, 'inv', (v) => RE_INVOICE.test(v));
  const invoiceNo = pickBest(invS, taken, 0.75);
  if (invoiceNo >= 0) taken.add(invoiceNo);

  const dateS = scoreColumns(main, 'date', (v) => !!parseDate(v));
  const date = pickBest(dateS, taken, 0.8);
  if (date >= 0) taken.add(date);

  const taxS = scoreColumns(main, 'tax', (v) => RE_TAXID.test(v));
  const taxId = pickBest(taxS, taken, 0.8);
  if (taxId >= 0) taken.add(taxId);

  const amtS = scoreColumns(main, 'amt', (v) => parseAmountCents(v) != null);
  // 金額通常是最後一個純數字欄
  let amount = -1;
  for (let c = amtS.length - 1; c >= 0; c--) {
    if (!taken.has(c) && amtS[c] > 0.85 && c > 0) { amount = c; break; }
  }
  if (amount >= 0) taken.add(amount);

  // 店名：剩下的欄位裡平均字數最長的那個
  let store = -1, bestLen = 0;
  const width = main.reduce((w, r) => Math.max(w, r.cells.length), 0);
  for (let c = 1; c < width; c++) {
    if (taken.has(c)) continue;
    let sum = 0, n = 0;
    for (const r of main.slice(0, 120)) {
      const v = (r.cells[c] || '').trim();
      if (v) { sum += v.length; n++; }
    }
    const avg = n ? sum / n : 0;
    if (avg > bestLen) { bestLen = avg; store = c; }
  }

  if (date < 0 || amount < 0) return null;

  let detailMap = null;
  if (detail.length) {
    const dInv = pickBest(scoreColumns(detail, 'inv', (v) => RE_INVOICE.test(v)), new Set(), 0.75);
    const dTaken = new Set(dInv >= 0 ? [dInv] : []);
    const dAmtS = scoreColumns(detail, 'amt', (v) => parseAmountCents(v) != null);
    let dAmt = -1;
    for (let c = 1; c < dAmtS.length; c++) if (!dTaken.has(c) && dAmtS[c] > 0.85) { dAmt = c; break; }
    if (dAmt >= 0) dTaken.add(dAmt);
    let dName = -1, dLen = 0;
    const dw = detail.reduce((w, r) => Math.max(w, r.cells.length), 0);
    for (let c = 1; c < dw; c++) {
      if (dTaken.has(c)) continue;
      let sum = 0, n = 0;
      for (const r of detail.slice(0, 120)) { const v = (r.cells[c] || '').trim(); if (v) { sum += v.length; n++; } }
      const avg = n ? sum / n : 0;
      if (avg > dLen) { dLen = avg; dName = c; }
    }
    detailMap = { invoiceNo: dInv, subtotal: dAmt, item: dName };
  }

  return { main: { date, taxId, store, invoiceNo, amount }, detail: detailMap, auto: true };
}

/** 對映快取的 key：用 M 列的欄位數與型別指紋當識別，比用標頭字串穩定 */
export function shapeHash(main) {
  if (!main.length) return 'empty';
  const width = main.reduce((w, r) => Math.max(w, r.cells.length), 0);
  const sig = [];
  for (let c = 0; c < width; c++) {
    sig.push(guessType(main.slice(0, 40).map((r) => r.cells[c] || '')).type);
  }
  let h = 2166136261;
  const s = `${width}|${sig.join(',')}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
