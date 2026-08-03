/* Tokeniser and stopword list.
   One regex pass, lowercase, no per-token allocation beyond the match itself.
   CJK runs are additionally emitted as character bigrams so that languages
   without spaces are still searchable. */

const WORD = /[\p{L}\p{N}_]+/gu;
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/u;

export const STOPWORDS = new Set(
  ("a about above after again against all am an and any are aren as at be because been before being " +
    "below between both but by can cannot could couldn did didn do does doesn doing don down during " +
    "each few for from further had hadn has hasn have haven having he her here hers herself him " +
    "himself his how i if in into is isn it its itself just let me more most mustn my myself no nor " +
    "not of off on once only or other ought our ours ourselves out over own same shan she should " +
    "shouldn so some such than that the their theirs them themselves then there these they this " +
    "those through to too under until up very was wasn we were weren what when where which while who " +
    "whom why with won would wouldn you your yours yourself yourselves get got going like want need " +
    "make makes made use used using thing things way ways one two also actually really something " +
    "anything nothing everything much many lot lots yes okay ok sure thanks thank please").split(" ")
);

const IDENT_SPLIT = /_+|(?<=[a-z0-9])(?=[A-Z])/;

/** Push every token of `text` into `out`. Returns the token count. */
export function tokenizeInto(text, out) {
  let n = 0;
  WORD.lastIndex = 0;
  let m;
  while ((m = WORD.exec(text)) !== null) {
    const raw = m[0].toLowerCase();
    out.push(raw);
    n++;
    // Identifiers are indexed whole and in pieces, so that searching "sqlite"
    // finds SQLITE_BUSY and searching "token bucket" finds TokenBucket. This is
    // an archive of technical conversations; identifiers are the vocabulary.
    if (raw.includes("_") || /[a-z0-9][A-Z]/.test(m[0])) {
      for (const part of m[0].split(IDENT_SPLIT)) {
        const p = part.toLowerCase();
        if (p.length >= 2 && p !== raw) {
          out.push(p);
          n++;
        }
      }
    }
    if (raw.length > 1 && CJK.test(raw)) {
      for (let i = 0; i + 1 < raw.length; i++) {
        out.push(raw.slice(i, i + 2));
        n++;
      }
    }
  }
  return n;
}

export function tokenize(text) {
  const out = [];
  tokenizeInto(text, out);
  return out;
}

/** True when a term is written in a script that does not space its words. */
export function isCjk(term) {
  return CJK.test(term);
}

/**
 * Character bigrams of a CJK term.
 *
 * The index stores a run of CJK both whole and as bigrams, so a run of text
 * such as 連線池的上限 becomes one long term plus 連線 線池 池的 的上 上限. A
 * query for 連線池 is a shorter run than the one it lives inside and would
 * never meet that long term, so it has to be matched through the bigrams. The
 * query side asks for them explicitly rather than the index side dropping the
 * whole run, because the whole run is what makes a readable index tab.
 */
export function cjkBigrams(term) {
  if (term.length < 2 || !CJK.test(term)) return [];
  const out = [];
  for (let i = 0; i + 1 < term.length; i++) out.push(term.slice(i, i + 2));
  return out;
}

/* Chinese function words. A run of Chinese with no space in it can be a whole
   clause, so the display side needs both a stopword list and a length ceiling,
   otherwise an index tab reads "沒有它的話" instead of "連線池". */
export const CJK_STOPWORDS = new Set(
  ("的 了 是 在 我 你 他 們 我們 你們 他們 我的 你的 這個 那個 這些 那些 什麼 是什麼 為什麼 怎麼 " +
    "要怎麼 可以 不能 不要 沒有 就是 不是 而不是 那就是 也是 還是 或者 或者把 因為 所以 如果 但是 " +
    "然後 而且 已經 一個 每一個 兩個 三個 現在 之後 之前 時候 東西 事情 問題 地方 情況 有沒有 " +
    "我們的 我們有 沒問題 不需要 預設是 的清單 的性質 可以往 跟得上 一下 一樣 一直 一定 比較 " +
    "非常 真的 其實 通常 常常 大概 大約 至少 甚至 直接 只是 只有 而已 這樣 那樣 怎樣 " +
    "在同一個 對於 關於 以及 這件事 那件事 這裡 那裡 哪裡 上面 下面 裡面 外面 開始 結束")
    .split(/\s+/)
    .filter(Boolean)
);

/** Terms worth showing a human: no stopwords, long enough to mean something,
    and for Chinese short enough to still be a term rather than a sentence. */
export function isContentTerm(t) {
  if (/^\d+$/.test(t)) return false;
  // 2 is a bigram cut out of a longer run, which reads as half a word; longer
  // than 6 is a whole clause, which reads as a sentence. Between the two is a
  // term.
  if (CJK.test(t)) return t.length >= 3 && t.length <= 6 && !CJK_STOPWORDS.has(t);
  return t.length >= 3 && !STOPWORDS.has(t);
}

/** Character trigrams of a term, used for "closest terms in your vault". */
export function trigrams(term) {
  const s = `  ${term} `;
  const out = [];
  for (let i = 0; i + 3 <= s.length; i++) out.push(s.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a, b) {
  const A = new Set(trigrams(a));
  const B = trigrams(b);
  let hit = 0;
  for (const g of B) if (A.has(g)) hit++;
  return (2 * hit) / (A.size + B.length);
}

/** Morphological variants that are only accepted if they exist in the vault. */
export function variantsOf(term) {
  const v = new Set();
  const add = (s) => {
    if (s && s.length >= 3 && s !== term) v.add(s);
  };
  if (term.endsWith("ies")) add(`${term.slice(0, -3)}y`);
  if (term.endsWith("es")) add(term.slice(0, -2));
  if (term.endsWith("s") && !term.endsWith("ss")) add(term.slice(0, -1));
  if (term.endsWith("ing")) {
    add(term.slice(0, -3));
    add(`${term.slice(0, -3)}e`);
  }
  if (term.endsWith("ed")) {
    add(term.slice(0, -2));
    add(term.slice(0, -1));
  }
  add(`${term}s`);
  add(`${term}es`);
  add(`${term}ing`);
  add(`${term}ed`);
  if (term.endsWith("y")) add(`${term.slice(0, -1)}ies`);
  return [...v];
}
