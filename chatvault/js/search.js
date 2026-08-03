/* Query parsing, BM25 ranking, phrase adjacency, filters, and term expansion.

   The whole query language lives in one input. Everything the parser
   understands is written on screen next to the field rather than in a document
   nobody opens.

   Exclusions are applied before scoring, not as a filter over results, because
   a document removed after ranking still moved the scores of everything above
   it. Phrases are checked against real positions. */

import { positionsAt, findPosting, ROLE_CODE, SOURCE_CODE } from "./index-build.js";
import { isContentTerm, variantsOf, trigramSimilarity } from "./tokenize.js";

const K1 = 1.2;
const B = 0.62; // lower than the usual 0.75: a chat message's length says little about its relevance

const TERM = /[\p{L}\p{N}_]+/gu;

function words(text) {
  const out = [];
  TERM.lastIndex = 0;
  let m;
  while ((m = TERM.exec(text)) !== null) out.push(m[0].toLowerCase());
  return out;
}

/**
 * Parse the query language.
 * @returns {{terms, phrases, required, excluded, filters, errors, free}}
 */
export function parseQuery(raw) {
  const q = {
    terms: [],
    phrases: [],
    required: [],
    excluded: [],
    filters: {},
    errors: [],
    free: "",
    conditions: [],
  };
  if (!raw) return q;

  const free = [];
  let i = 0;
  const text = raw;

  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    const tokenStart = i;

    let negate = false;
    let require = false;
    if (text[i] === "-" && i + 1 < text.length && !/\s/.test(text[i + 1])) {
      negate = true;
      i++;
    } else if (text[i] === "+" && i + 1 < text.length && !/\s/.test(text[i + 1])) {
      require = true;
      i++;
    }

    if (text[i] === '"') {
      const close = text.indexOf('"', i + 1);
      if (close < 0) {
        q.errors.push({
          field: "quote",
          message: 'Unclosed quote. Add a closing " or remove it.',
        });
        const rest = text.slice(i + 1);
        const w = words(rest);
        if (w.length) {
          q.terms.push(...w);
          free.push(rest);
        }
        break;
      }
      const inner = text.slice(i + 1, close);
      const w = words(inner);
      if (w.length > 1) q.phrases.push({ words: w, negate, text: inner });
      else if (w.length === 1) (negate ? q.excluded : require ? q.required : q.terms).push(w[0]);
      if (!negate) free.push(inner);
      i = close + 1;
      if (w.length) {
        q.conditions.push({
          kind: negate ? "exclude" : "phrase",
          label: `${negate ? "-" : ""}"${inner}"`,
          start: tokenStart,
          end: i,
        });
      }
      continue;
    }

    let end = i;
    while (end < text.length && !/\s/.test(text[end])) end++;
    const token = text.slice(i, end);
    i = end;

    const colon = token.indexOf(":");
    if (colon > 0) {
      const key = token.slice(0, colon).toLowerCase();
      const value = token.slice(colon + 1);
      if (applyFilter(q, key, value, negate, tokenStart, i)) continue;
    }

    const w = words(token);
    if (!w.length) continue;
    if (negate) q.excluded.push(...w);
    else if (require) {
      q.required.push(...w);
      free.push(token.slice(0));
    } else {
      q.terms.push(...w);
      free.push(token);
    }
    if (negate) q.conditions.push({ kind: "exclude", label: `-${token}`, start: tokenStart, end: i });
    else if (require) q.conditions.push({ kind: "require", label: `+${token}`, start: tokenStart, end: i });
  }

  q.free = free.join(" ").trim();
  return q;
}

function applyFilter(q, key, value, negate, start, end) {
  const push = (kind, token, label) => q.conditions.push({ kind, label, start, end });
  switch (key) {
    case "role": {
      const v = value.toLowerCase();
      const role = v === "you" || v === "human" || v === "user" ? "human" : v === "assistant" ? "assistant" : null;
      if (!role) {
        q.errors.push({ field: "role", message: "role: accepts human or assistant." });
        return true;
      }
      q.filters.role = role;
      push("role", `role:${role}`, `role:${role}`);
      return true;
    }
    case "source": {
      const v = value.toLowerCase();
      if (!(v in SOURCE_CODE)) {
        q.errors.push({ field: "source", message: "source: accepts chatgpt, claude, gemini or custom." });
        return true;
      }
      q.filters.source = q.filters.source || [];
      q.filters.source.push(v);
      push("source", `source:${v}`, `source:${v}`);
      return true;
    }
    case "after":
    case "before": {
      const t = parseDateBound(value, key === "before");
      if (t === null) {
        q.errors.push({
          field: key,
          message: `${key}:${value} is not a date. Use ${key}:2025-03 or ${key}:2025-03-14.`,
        });
        return true;
      }
      q.filters[key] = t;
      push(key, `${key}:${value}`, `${key}:${value}`);
      return true;
    }
    case "has": {
      if (value.toLowerCase() !== "code") {
        q.errors.push({ field: "has", message: "has: accepts code." });
        return true;
      }
      q.filters.hasCode = !negate;
      push("has", "has:code", "has:code");
      return true;
    }
    default:
      return false;
  }
}

export function parseDateBound(value, inclusiveEnd) {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : inclusiveEnd ? 12 : 1;
  const day = m[3] ? Number(m[3]) : null;
  if (month < 1 || month > 12) return null;
  if (day !== null && (day < 1 || day > 31)) return null;
  if (day === null) {
    return inclusiveEnd ? Date.UTC(year, month, 1) - 1 : Date.UTC(year, month - 1, 1);
  }
  return inclusiveEnd ? Date.UTC(year, month - 1, day + 1) - 1 : Date.UTC(year, month - 1, day);
}

/* ------------------------------------------------------------------ ranking */

function idf(index, termId) {
  const df = index.df[termId];
  return Math.log(1 + (index.docCount - df + 0.5) / (df + 0.5));
}

function convsContaining(index, termId, out) {
  const a = index.postOff[termId];
  const b = index.postOff[termId + 1];
  let last = -1;
  for (let k = a; k < b; k++) {
    const c = index.docConv[index.postDocs[k]];
    if (c !== last) {
      out.add(c);
      last = c;
    }
  }
  return out;
}

function docPassesFilters(index, doc, filters) {
  if (filters.role !== undefined && index.docRole[doc] !== ROLE_CODE[filters.role]) return false;
  const c = index.docConv[doc];
  return convPassesFilters(index, c, filters);
}

function convPassesFilters(index, c, filters) {
  if (filters.source && !filters.source.some((s) => index.convSource[c] === SOURCE_CODE[s])) return false;
  if (filters.hasCode && !index.convHasCode[c]) return false;
  const t = index.convTime[c];
  if (filters.after !== undefined && t < filters.after) return false;
  if (filters.before !== undefined && t > filters.before) return false;
  if (filters.onPathOnly && index.docOnPath) return true;
  return true;
}

/** Docs where all phrase words appear at consecutive positions. */
function phraseDocs(index, phraseWords) {
  const ids = phraseWords.map((w) => index.termId.get(w));
  if (ids.some((x) => x === undefined)) return null;
  let candidates = null;
  for (const id of ids) {
    const a = index.postOff[id];
    const b = index.postOff[id + 1];
    const set = new Set();
    for (let k = a; k < b; k++) set.add(index.postDocs[k]);
    candidates = candidates === null ? set : new Set([...candidates].filter((d) => set.has(d)));
    if (!candidates.size) return new Map();
  }
  const hits = new Map();
  for (const doc of candidates) {
    const lists = ids.map((id) => {
      const p = findPosting(index, id, doc);
      return p < 0 ? null : positionsAt(index, p);
    });
    if (lists.some((l) => l === null)) continue;
    let count = 0;
    const first = lists[0];
    const sets = lists.slice(1).map((l) => new Set(l));
    for (let i = 0; i < first.length; i++) {
      const base = first[i];
      let ok = true;
      for (let j = 0; j < sets.length; j++) {
        if (!sets[j].has(base + j + 1)) {
          ok = false;
          break;
        }
      }
      if (ok) count++;
    }
    if (count) hits.set(doc, count);
  }
  return hits;
}

/**
 * Run a query.
 * @returns {{conversations:Array, docHits:Map, total:{conversations:number,messages:number},
 *            expansions:Array, errors:Array, topScore:number}}
 */
export function runQuery(index, parsed, options = {}) {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const filters = { ...parsed.filters, ...(options.filters || {}) };
  const expansions = options.expansions || [];

  // 1. conversations knocked out by exclusions, computed before any scoring
  const excludedConvs = new Set();
  for (const w of parsed.excluded) {
    const id = index.termId.get(w);
    if (id !== undefined) convsContaining(index, id, excludedConvs);
  }
  for (const p of parsed.phrases.filter((x) => x.negate)) {
    const hits = phraseDocs(index, p.words);
    if (hits) for (const doc of hits.keys()) excludedConvs.add(index.docConv[doc]);
  }

  // 2. conversations that must contain every required term
  let requiredConvs = null;
  for (const w of parsed.required) {
    const id = index.termId.get(w);
    const set = id === undefined ? new Set() : convsContaining(index, id, new Set());
    requiredConvs = requiredConvs === null ? set : new Set([...requiredConvs].filter((c) => set.has(c)));
  }

  const scoring = [];
  for (const w of [...parsed.terms, ...parsed.required]) {
    const id = index.termId.get(w);
    if (id !== undefined) scoring.push({ termId: id, word: w, weight: 1 });
  }
  for (const e of expansions) {
    const id = index.termId.get(e.word);
    if (id !== undefined) scoring.push({ termId: id, word: e.word, weight: e.weight });
  }

  const positivePhrases = parsed.phrases.filter((x) => !x.negate);
  const phraseHitMaps = positivePhrases.map((p) => ({ phrase: p, hits: phraseDocs(index, p.words) }));

  // Intent, not resolution: a query whose words are absent from the vault must
  // return nothing, rather than falling through to "no query text" and
  // returning the whole vault.
  const hasText = parsed.terms.length > 0 || parsed.required.length > 0 || positivePhrases.length > 0;

  /** doc -> score */
  const docScore = new Map();

  if (hasText) {
    for (const { termId, weight } of scoring) {
      const w = idf(index, termId) * weight;
      const a = index.postOff[termId];
      const b = index.postOff[termId + 1];
      for (let k = a; k < b; k++) {
        const doc = index.postDocs[k];
        const tf = index.postTf[k];
        const dl = index.docLen[doc] || 1;
        const s = (w * (tf * (K1 + 1))) / (tf + K1 * (1 - B + (B * dl) / index.avgdl));
        docScore.set(doc, (docScore.get(doc) || 0) + s);
      }
    }
    for (const { phrase, hits } of phraseHitMaps) {
      if (!hits || !hits.size) {
        // a phrase that matches nothing removes everything
        docScore.clear();
        break;
      }
      const w = phrase.words.reduce((sum, x) => {
        const id = index.termId.get(x);
        return sum + (id === undefined ? 0 : idf(index, id));
      }, 0);
      const keep = new Map();
      for (const [doc, count] of hits) {
        const base = docScore.get(doc) || 0;
        keep.set(doc, base + w * (1 + Math.log(1 + count)) * 1.4);
      }
      docScore.clear();
      for (const [d, s] of keep) docScore.set(d, s);
    }
  }

  /* 3. roll messages up to conversations */
  const byConv = new Map();
  const addConv = (c, score, doc) => {
    let e = byConv.get(c);
    if (!e) byConv.set(c, (e = { conv: c, score: 0, best: -1, bestScore: -1, hits: 0 }));
    e.hits++;
    e.score += score;
    if (score > e.bestScore) {
      e.bestScore = score;
      e.best = doc;
    }
  };

  let messages = 0;
  if (hasText) {
    for (const [doc, score] of docScore) {
      const c = index.docConv[doc];
      if (excludedConvs.has(c)) continue;
      if (requiredConvs && !requiredConvs.has(c)) continue;
      if (!docPassesFilters(index, doc, filters)) continue;
      if (!options.includeAlternate && index.docOnPath[doc] === 0 && index.docNode[doc] >= 0) {
        addConv(c, score * 0.55, doc);
      } else {
        addConv(c, score, doc);
      }
      messages++;
    }
  } else {
    // no query text: one linear pass builds the role set, rather than a scan
    // of every document for every conversation
    let convHasRole = null;
    if (filters.role !== undefined) {
      convHasRole = new Set();
      const wanted = ROLE_CODE[filters.role];
      for (let d = 0; d < index.docCount; d++) {
        if (index.docRole[d] === wanted) convHasRole.add(index.docConv[d]);
      }
    }
    for (let c = 0; c < index.convIds.length; c++) {
      if (excludedConvs.has(c)) continue;
      if (requiredConvs && !requiredConvs.has(c)) continue;
      if (!convPassesFilters(index, c, filters)) continue;
      if (convHasRole && !convHasRole.has(c)) continue;
      byConv.set(c, { conv: c, score: 0, best: -1, bestScore: 0, hits: 0 });
      messages += index.convMsgCount[c];
    }
  }

  const list = [...byConv.values()];
  if (hasText) {
    for (const e of list) e.score = e.bestScore + 0.18 * Math.log(1 + e.hits);
    list.sort((a, b) => b.score - a.score || index.convTime[b.conv] - index.convTime[a.conv]);
  } else {
    list.sort((a, b) => index.convTime[b.conv] - index.convTime[a.conv]);
  }

  return {
    conversations: list,
    total: { conversations: list.length, messages },
    topScore: list.length ? list[0].score : 0,
    errors: parsed.errors,
    ms: (typeof performance !== "undefined" ? performance.now() : 0) - t0,
    hasText,
  };
}

/* ------------------------------------------------------- expanded mode terms */

/**
 * Terms that travel with the query terms inside this vault. Real co-occurrence
 * over the conversation signature terms built at index time, plus morphological
 * variants that actually exist in the vault. Nothing is invented.
 */
export function expandTerms(index, parsed, blocklist) {
  const seeds = [...parsed.terms, ...parsed.phrases.filter((p) => !p.negate).flatMap((p) => p.words)].filter(
    (w) => isContentTerm(w) && index.termId.has(w)
  );
  if (!seeds.length) return [];

  const C = index.convIds.length;
  const out = new Map();
  const seedSet = new Set(seeds);

  for (const seed of seeds) {
    const seedId = index.termId.get(seed);
    const convs = convsContaining(index, seedId, new Set());
    if (convs.size < 2) continue;
    const co = new Map();
    for (const c of convs) {
      const a = index.convTopOff[c];
      const b = index.convTopOff[c + 1];
      for (let k = a; k < b; k++) {
        const tid = index.convTopTerms[k];
        if (tid === seedId) continue;
        co.set(tid, (co.get(tid) || 0) + 1);
      }
    }
    for (const [tid, n] of co) {
      const word = index.terms[tid];
      if (seedSet.has(word) || (blocklist && blocklist.has(word))) continue;
      if (!isContentTerm(word)) continue;
      const dice = (2 * n) / (convs.size + index.convDf[tid]);
      if (n < 2 || dice < 0.14) continue;
      const prev = out.get(word);
      if (!prev || dice > prev.weight) out.set(word, { word, weight: dice, from: seed, kind: "co" });
    }

    for (const v of variantsOf(seed)) {
      if (!index.termId.has(v) || seedSet.has(v) || (blocklist && blocklist.has(v))) continue;
      const tid = index.termId.get(v);
      // a form that appears in exactly one conversation is usually a typo or a
      // quoted fragment, not a real variant worth widening the query with
      if (index.convDf[tid] < 2) continue;
      const weight = Math.min(0.9, 0.55 + Math.min(0.3, index.convDf[tid] / Math.max(1, C)));
      const prev = out.get(v);
      if (!prev || weight > prev.weight) out.set(v, { word: v, weight, from: seed, kind: "form" });
    }
  }

  return [...out.values()].sort((a, b) => b.weight - a.weight).slice(0, 6);
}

/* ------------------------------------------------- diagnostics for zero hits */

/** The query text with one condition cut out of it. */
export function queryWithout(raw, condition) {
  if (condition.start === undefined) return raw;
  return `${raw.slice(0, condition.start)}${raw.slice(condition.end)}`.replace(/\s+/g, " ").trim();
}

/** Rerun the query with one condition removed, to say what dropping it would give. */
export function estimateWithout(index, raw, condition, options) {
  const res = runQuery(index, parseQuery(queryWithout(raw, condition)), options);
  return res.total.conversations;
}

/** Closest terms actually present in the vault, by trigram similarity. */
export function closestTerms(index, word, limit = 3) {
  const scored = [];
  const target = word.toLowerCase();
  for (let i = 0; i < index.terms.length; i++) {
    const t = index.terms[i];
    if (Math.abs(t.length - target.length) > 4) continue;
    if (index.convDf[i] < 1) continue;
    const s = trigramSimilarity(target, t);
    if (s > 0.34) scored.push([t, s * Math.log(2 + index.convDf[i])]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, limit).map((x) => x[0]);
}

/** All query terms, for highlighting. Phrases contribute their words. */
export function highlightTerms(parsed, expansions) {
  const out = new Set();
  for (const t of parsed.terms) out.add(t);
  for (const t of parsed.required) out.add(t);
  for (const p of parsed.phrases) if (!p.negate) for (const w of p.words) out.add(w);
  for (const e of expansions || []) out.add(e.word);
  return [...out];
}
