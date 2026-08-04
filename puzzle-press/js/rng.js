/* Deterministic randomness.
   Every puzzle in a book is derived from hash(seed, type, index), never from a
   single running sequence. That is what makes "reroll only puzzle 47" possible
   and what makes "carry on generating the remaining 63" bit-identical to a
   single uninterrupted run. */

const HEX = '0123456789ABCDEF';

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(a) {
  let t = a >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** XXXX-XXXX, uppercase hex. Anything else is filtered out as it is typed. */
export function normaliseSeed(raw) {
  const clean = String(raw || '')
    .toUpperCase()
    .replace(/[^0-9A-F]/g, '')
    .slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export function isCompleteSeed(seed) {
  return /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(seed);
}

export function randomSeed() {
  const bytes = new Uint8Array(4);
  (globalThis.crypto || {}).getRandomValues
    ? globalThis.crypto.getRandomValues(bytes)
    : bytes.forEach((_, i) => {
        bytes[i] = Math.floor(Math.random() * 256);
      });
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** The sub-seed contract. salt lets a generator retry without leaving the seed. */
export function subRandom(seed, type, index, salt = 0) {
  return mulberry32(fnv1a(`${seed}|${type}|${index}|${salt}`));
}

export function shuffle(list, rnd) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function randInt(rnd, min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}
