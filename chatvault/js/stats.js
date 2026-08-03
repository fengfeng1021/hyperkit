/* Statistics.

   Every number here is computed from the vault. None of them are illustrative.
   The vocabulary panel is the one that earns the section: raw term frequency
   would return "the", "and" and "I think", so it is stopword filtered and
   weighted by inverse conversation frequency, which turns a word count into a
   list of subjects. */

import { ROLE_CODE } from "./index-build.js";
import { isContentTerm } from "./tokenize.js";

export function computeStats(index, records) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const convCount = index.convIds.length;

  let messages = 0;
  let chars = 0;
  let earliest = Infinity;
  let latest = -Infinity;
  let longest = null;
  const perSource = new Map();

  for (const rec of records) {
    messages += rec.msgCount;
    chars += rec.charCount;
    if (rec.createdAt < earliest) earliest = rec.createdAt;
    const end = rec.updatedAt || rec.createdAt;
    if (end > latest) latest = end;
    if (!longest || rec.msgCount > longest.msgCount) longest = rec;
    perSource.set(rec.source, (perSource.get(rec.source) || 0) + 1);
  }

  // messages per calendar month, from real message timestamps
  const months = new Map();
  const hours = new Int32Array(24);
  const weekdays = new Int32Array(7);
  for (const rec of records) {
    for (const node of rec.nodes) {
      const d = new Date(node.t || rec.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.set(key, (months.get(key) || 0) + 1);
      hours[d.getHours()]++;
      weekdays[d.getDay()]++;
    }
  }
  const monthKeys = [...months.keys()].sort();
  const monthSeries = fillMonths(monthKeys, months);

  return {
    conversations: convCount,
    messages,
    chars,
    earliest: Number.isFinite(earliest) ? earliest : null,
    latest: Number.isFinite(latest) ? latest : null,
    longest: longest ? { id: longest.id, title: longest.title, msgCount: longest.msgCount } : null,
    perSource: [...perSource.entries()].sort((a, b) => b[1] - a[1]),
    monthSeries,
    hours: Array.from(hours),
    weekdays: Array.from(weekdays),
    vocabulary: topSubjects(index, 24),
    byId,
  };
}

function fillMonths(keys, map) {
  if (!keys.length) return [];
  const [y0, m0] = keys[0].split("-").map(Number);
  const [y1, m1] = keys[keys.length - 1].split("-").map(Number);
  const out = [];
  let y = y0;
  let m = m0;
  let guard = 0;
  while ((y < y1 || (y === y1 && m <= m1)) && guard++ < 600) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ key, year: y, month: m, count: map.get(key) || 0 });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * What you asked about: terms from your own messages only, weighted by
 * tf * log(N / conversation frequency).
 */
export function topSubjects(index, limit = 24) {
  const T = index.terms.length;
  const N = Math.max(1, index.convIds.length);
  const tf = new Float64Array(T);
  const human = ROLE_CODE.human;

  for (let t = 0; t < T; t++) {
    const word = index.terms[t];
    if (!isContentTerm(word) || word.length > 20) continue;
    const a = index.postOff[t];
    const b = index.postOff[t + 1];
    let sum = 0;
    for (let k = a; k < b; k++) {
      if (index.docRole[index.postDocs[k]] === human) sum += index.postTf[k];
    }
    if (sum) tf[t] = sum * Math.log(1 + N / Math.max(1, index.convDf[t]));
  }

  const order = [];
  for (let t = 0; t < T; t++) if (tf[t] > 0) order.push(t);
  order.sort((a, b) => tf[b] - tf[a]);
  return order.slice(0, limit).map((t) => ({
    term: index.terms[t],
    weight: tf[t],
    conversations: index.convDf[t],
  }));
}

export function formatSpan(from, to) {
  if (!from || !to) return "no dated messages";
  const months = Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 24) return `${months} months`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} years ${rest} months` : `${years} years`;
}
