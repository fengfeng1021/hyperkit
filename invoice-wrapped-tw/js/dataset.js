/* dataset.js
   正規化 → 去重 → 分類 → 彙總。
   金額全程以「分」為單位的整數流動；D 明細列的小計絕對不與 M 主檔的總金額相加。 */

import { parseDate, parseAmountCents } from './csv.js';
import { matchCategory, categoryById } from './rules.js';
import { lsGet } from './storage.js';
import { weekdayIndex } from './format.js';

const AMOUNT_CEILING = 1e9 * 100; // 10 億元，以分為單位

/* ---------------- 正規化 ---------------- */

/**
 * @param {{main:Array,detail:Array}} rows classify() 的輸出
 * @param {object} mapping autoMap() 或對映精靈的輸出
 * @param {'sample'|'user'} source
 */
export function normalize(rows, mapping, source) {
  const m = mapping.main;
  const invoices = new Map();
  const bad = [];
  let anomalies = 0;

  for (const { line, cells } of rows.main) {
    const rawDate = cells[m.date];
    const parsed = parseDate(rawDate);
    if (!parsed) {
      bad.push({ line, raw: cells.join(','), reason: `日期欄「${String(rawDate || '').slice(0, 16)}」無法解析` });
      continue;
    }
    const cents = parseAmountCents(cells[m.amount]);
    if (cents == null) {
      bad.push({ line, raw: cells.join(','), reason: `金額欄「${String(cells[m.amount] || '').slice(0, 16)}」不是數字` });
      continue;
    }
    const abnormal = cents < 0 || Math.abs(cents) > AMOUNT_CEILING;
    if (abnormal) anomalies++;

    const id = (m.invoiceNo >= 0 ? (cells[m.invoiceNo] || '').trim().replace(/\s|-/g, '') : '')
      || `L${line}`;

    invoices.set(id, {
      id,
      date: parsed.date,
      hasTime: parsed.hasTime,
      ts: parsed.date.getTime(),
      store: (m.store >= 0 ? (cells[m.store] || '').trim() : '') || '未載明店名',
      taxId: m.taxId >= 0 ? (cells[m.taxId] || '').trim() : '',
      amountCents: cents,
      abnormal,
      items: [],
      source,
      line,
    });
  }

  const dm = mapping.detail;
  let orphanDetails = 0;
  if (dm && dm.invoiceNo >= 0) {
    for (const { cells } of rows.detail) {
      const id = (cells[dm.invoiceNo] || '').trim().replace(/\s|-/g, '');
      const inv = invoices.get(id);
      if (!inv) { orphanDetails++; continue; }
      const sub = dm.subtotal >= 0 ? parseAmountCents(cells[dm.subtotal]) : null;
      inv.items.push({
        name: (dm.item >= 0 ? (cells[dm.item] || '').trim() : '') || '未載明品名',
        subCents: sub == null ? 0 : sub,
      });
    }
  }

  return { invoices: [...invoices.values()], bad, anomalies, orphanDetails };
}

/**
 * 依發票號碼合併多個檔案。後匯入的覆蓋先前的（使用者通常是在補資料）。
 */
export function merge(existing, incoming) {
  const map = new Map(existing.map((i) => [i.id, i]));
  let duplicates = 0;
  const dupList = [];
  for (const inv of incoming) {
    if (map.has(inv.id)) { duplicates++; dupList.push(inv.id); }
    map.set(inv.id, inv);
  }
  const all = [...map.values()].sort((a, b) => a.ts - b.ts);
  return { invoices: all, duplicates, dupList: dupList.slice(0, 200) };
}

/* ---------------- 分類 ---------------- */

export function categorize(invoices) {
  const overrides = lsGet('cat', {}) || {};
  for (const inv of invoices) {
    const manual = overrides[inv.store];
    if (manual) { inv.category = manual; inv.categorySource = 'manual'; continue; }
    const hit = matchCategory(inv.store);
    inv.category = hit.id;
    inv.categoryKeyword = hit.keyword;
    inv.categorySource = hit.keyword ? 'rule' : 'fallback';
  }
  return invoices;
}

/* ---------------- 彙總 ---------------- */

export function aggregate(invoices, meta = {}) {
  const counted = invoices.filter((i) => !i.abnormal);
  const total = counted.reduce((a, i) => a + i.amountCents, 0);

  const byMonth = Array.from({ length: 12 }, () => ({ cents: 0, count: 0 }));
  const byWeekdayHour = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ cents: 0, count: 0 })));
  const storeMap = new Map();
  const catMap = new Map();
  const dayMap = new Map();
  let hasTime = false;

  for (const inv of counted) {
    const d = inv.date;
    byMonth[d.getMonth()].cents += inv.amountCents;
    byMonth[d.getMonth()].count += 1;

    const wd = weekdayIndex(d);
    const cell = byWeekdayHour[wd][d.getHours()];
    cell.cents += inv.amountCents;
    cell.count += 1;
    if (inv.hasTime) hasTime = true;

    let s = storeMap.get(inv.store);
    if (!s) {
      s = { name: inv.store, taxId: inv.taxId, cents: 0, count: 0, category: inv.category, visits: [] };
      storeMap.set(inv.store, s);
    }
    s.cents += inv.amountCents;
    s.count += 1;
    s.visits.push({ ts: inv.ts, date: d, cents: inv.amountCents, id: inv.id });

    let c = catMap.get(inv.category);
    if (!c) {
      const def = categoryById(inv.category);
      c = { id: def.id, name: def.name, ramp: def.ramp, stripes: def.stripes, icon: def.icon, cents: 0, count: 0, stores: new Set() };
      catMap.set(inv.category, c);
    }
    c.cents += inv.amountCents;
    c.count += 1;
    c.stores.add(inv.store);

    const dk = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const day = dayMap.get(dk) || { cents: 0, count: 0, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()) };
    day.cents += inv.amountCents;
    day.count += 1;
    dayMap.set(dk, day);
  }

  const byStore = [...storeMap.values()].sort((a, b) => b.cents - a.cents);
  const byStoreCount = [...byStore].sort((a, b) => b.count - a.count);
  const byCategory = [...catMap.values()]
    .map((c) => ({ ...c, storeCount: c.stores.size, stores: undefined }))
    .sort((a, b) => b.cents - a.cents);

  const sortedByAmount = [...counted].sort((a, b) => b.amountCents - a.amountCents);
  const days = [...dayMap.values()].sort((a, b) => b.cents - a.cents);

  // 消費最兇的一週：以七天滑動視窗掃過整年
  const byTs = [...counted].sort((a, b) => a.ts - b.ts);
  let peakWeek = null;
  if (byTs.length) {
    const WEEK = 7 * 864e5;
    let lo = 0, sum = 0, cnt = 0;
    for (let hi = 0; hi < byTs.length; hi++) {
      sum += byTs[hi].amountCents; cnt++;
      while (byTs[hi].ts - byTs[lo].ts > WEEK) { sum -= byTs[lo].amountCents; cnt--; lo++; }
      if (!peakWeek || sum > peakWeek.cents) {
        peakWeek = { cents: sum, count: cnt, from: byTs[lo].date, to: byTs[hi].date };
      }
    }
  }

  // 最晚的一次消費（只在有時間欄位時成立）
  let latest = null;
  if (hasTime) {
    for (const inv of counted) {
      const h = inv.date.getHours();
      const score = h < 5 ? h + 24 : h; // 凌晨算「更晚」
      if (!latest || score > latest.score) latest = { inv, score, hour: h };
    }
  }

  const years = new Map();
  counted.forEach((i) => years.set(i.date.getFullYear(), (years.get(i.date.getFullYear()) || 0) + 1));
  const year = [...years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? new Date().getFullYear();

  const champion = byStoreCount[0] || null;
  if (champion) champion.visits.sort((a, b) => a.ts - b.ts);

  return {
    year,
    source: meta.source || 'user',
    fileCount: meta.fileCount || 1,
    totalCents: total,
    count: counted.length,
    rawCount: invoices.length,
    anomalies: invoices.length - counted.length,
    storeCount: storeMap.size,
    avgCents: counted.length ? Math.round(total / counted.length) : 0,
    hasTime,
    byMonth,
    byWeekdayHour,
    byStore,
    byStoreCount,
    byCategory,
    byDay: [...dayMap.values()].sort((a, b) => a.date - b.date),
    peakDay: days[0] || null,
    peakWeek,
    biggest: sortedByAmount[0] || null,
    latest,
    champion,
    firstDate: byTs[0]?.date || null,
    lastDate: byTs[byTs.length - 1]?.date || null,
    activeDays: dayMap.size,
  };
}

/** 熱力圖的五分位切點（以「有消費的格子」為母體，避免 0 稀釋分位） */
export function heatQuantiles(byWeekdayHour) {
  const vals = [];
  for (const row of byWeekdayHour) for (const c of row) if (c.cents > 0) vals.push(c.cents);
  vals.sort((a, b) => a - b);
  if (!vals.length) return [0, 0, 0, 0, 0, 0];
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
  return [q(0.17), q(0.34), q(0.5), q(0.67), q(0.84), vals[vals.length - 1]];
}

export function rampStepFor(cents, cuts) {
  if (cents <= 0) return 0;
  for (let i = 0; i < cuts.length; i++) if (cents <= cuts[i]) return i + 1;
  return 6;
}
