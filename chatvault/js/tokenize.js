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

/** Terms worth showing a human: no stopwords, at least 3 characters, not a bare number. */
export function isContentTerm(t) {
  return t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t);
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
