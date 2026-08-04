/* Word search.
   Difficulty is four measurable knobs, not a vibe:
     - how many direction vectors are legal
     - whether reversed words are allowed
     - target letter density (share of grid cells covered by real words)
     - how the distractor letters are chosen
   A word longer than the grid can never be placed, and that is reported by
   name and by the grid size it would need, not swallowed. */

import { shuffle, randInt } from '../rng.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* dr, dc. The first four are the "forward" set. */
const DIRS = [
  { dr: 0, dc: 1, name: 'E' },
  { dr: 1, dc: 0, name: 'S' },
  { dr: 1, dc: 1, name: 'SE' },
  { dr: -1, dc: 1, name: 'NE' },
  { dr: 0, dc: -1, name: 'W' },
  { dr: -1, dc: 0, name: 'N' },
  { dr: -1, dc: -1, name: 'NW' },
  { dr: 1, dc: -1, name: 'SW' },
];

export const WS_LEVELS = {
  1: { dirs: 4, reverse: false, density: 0.4, filler: 'uniform', fragments: false },
  2: { dirs: 4, reverse: true, density: 0.48, filler: 'uniform', fragments: false },
  3: { dirs: 8, reverse: true, density: 0.56, filler: 'frequency', fragments: false },
  4: { dirs: 8, reverse: true, density: 0.68, filler: 'frequency', fragments: false },
  5: { dirs: 8, reverse: true, density: 0.78, filler: 'frequency', fragments: true },
};

/** L1 keeps the four forward vectors. From L2 up, every axis may be read in
    both senses, which is the full eight. What separates L2 from L3 upwards is
    density and the distractor distribution, both of which are measured and
    printed on the press check. */
function vectorsFor(level) {
  const cfg = WS_LEVELS[level] || WS_LEVELS[3];
  if (cfg.dirs === 4 && !cfg.reverse) return DIRS.slice(0, 4);
  return DIRS.slice(0, 8);
}

export function wsDirectionCount(level) {
  return vectorsFor(level).length;
}

function letterFrequency(words) {
  const counts = new Array(26).fill(0);
  let total = 0;
  words.forEach((w) => {
    for (let i = 0; i < w.length; i += 1) {
      const idx = w.charCodeAt(i) - 65;
      if (idx >= 0 && idx < 26) {
        counts[idx] += 1;
        total += 1;
      }
    }
  });
  if (!total) return null;
  return { counts, total };
}

function pickFiller(cfg, freq, rnd) {
  if (cfg.filler === 'frequency' && freq) {
    let r = rnd() * freq.total;
    for (let i = 0; i < 26; i += 1) {
      r -= freq.counts[i];
      if (r <= 0) return ALPHABET[i];
    }
  }
  return ALPHABET[Math.floor(rnd() * 26)];
}

/**
 * @param {object} opts
 * @param {string[]} opts.words  candidate pool, already uppercase A-Z
 * @param {number} opts.size     grid edge
 * @param {number} opts.level    1..5
 * @param {function} opts.rnd
 */
export function makeWordSearch({ words, size, level, rnd }) {
  const cfg = WS_LEVELS[level] || WS_LEVELS[3];
  const vectors = vectorsFor(level);
  const pool = shuffle(words.filter((w) => w.length >= 3), rnd);

  const tooLong = [];
  const usable = [];
  pool.forEach((w) => {
    if (w.length > size) tooLong.push({ word: w, minGrid: nextOddAtLeast(w.length) });
    else usable.push(w);
  });

  const grid = new Array(size * size).fill('');
  const placements = [];
  const targetCells = Math.round(size * size * cfg.density);
  let filled = 0;

  const unplaced = [];
  for (let i = 0; i < usable.length; i += 1) {
    if (filled >= targetCells) break;
    const word = usable[i];
    const placed = tryPlace(grid, size, word, vectors, rnd);
    if (placed) {
      placements.push(placed);
      filled += placed.fresh;
    } else {
      /* attempted and would not fit anywhere. Never silently dropped: the
         press check counts these and the word list under the grid never
         claims a word that is not in the grid. */
      unplaced.push(word);
    }
  }

  /* Second pass: if density is still short, re-use words already placed is not
     acceptable (a reader would spot it), so we accept the shortfall and report
     the achieved density honestly. */
  const freq = letterFrequency(placements.map((p) => p.word));

  if (cfg.fragments) seedFragments(grid, size, placements, rnd);

  for (let i = 0; i < grid.length; i += 1) {
    if (!grid[i]) grid[i] = pickFiller(cfg, freq, rnd);
  }

  const covered = countCovered(size, placements);
  return {
    size,
    grid,
    words: placements.map((p) => p.word),
    placements,
    tooLong,
    unplaced,
    density: covered / (size * size),
    targetDensity: cfg.density,
    directions: vectors.length,
    reverse: cfg.reverse,
  };
}

function nextOddAtLeast(n) {
  const v = Math.max(13, n);
  return v % 2 === 0 ? v + 1 : v;
}

function countCovered(size, placements) {
  const seen = new Set();
  placements.forEach((p) => {
    for (let i = 0; i < p.word.length; i += 1) {
      seen.add((p.r + p.dr * i) * size + (p.c + p.dc * i));
    }
  });
  return seen.size;
}

function tryPlace(grid, size, word, vectors, rnd) {
  const attempts = 220;
  for (let a = 0; a < attempts; a += 1) {
    const v = vectors[Math.floor(rnd() * vectors.length)];
    const len = word.length;
    const rMin = v.dr > 0 ? 0 : v.dr < 0 ? len - 1 : 0;
    const rMax = v.dr > 0 ? size - len : v.dr < 0 ? size - 1 : size - 1;
    const cMin = v.dc > 0 ? 0 : v.dc < 0 ? len - 1 : 0;
    const cMax = v.dc > 0 ? size - len : v.dc < 0 ? size - 1 : size - 1;
    if (rMax < rMin || cMax < cMin) continue;
    const r = randInt(rnd, rMin, rMax);
    const c = randInt(rnd, cMin, cMax);
    let ok = true;
    let fresh = 0;
    for (let i = 0; i < len; i += 1) {
      const idx = (r + v.dr * i) * size + (c + v.dc * i);
      const cur = grid[idx];
      if (cur && cur !== word[i]) {
        ok = false;
        break;
      }
      if (!cur) fresh += 1;
    }
    if (!ok) continue;
    for (let i = 0; i < len; i += 1) {
      grid[(r + v.dr * i) * size + (c + v.dc * i)] = word[i];
    }
    return { word, r, c, dr: v.dr, dc: v.dc, dir: v.name, fresh };
  }
  return null;
}

/** L5 only: sow two-letter fragments of placed words next to those words, so
    the eye keeps catching false starts. */
function seedFragments(grid, size, placements, rnd) {
  placements.forEach((p) => {
    if (p.word.length < 4) return;
    const cut = randInt(rnd, 0, p.word.length - 2);
    const pair = p.word.slice(cut, cut + 2);
    for (let a = 0; a < 12; a += 1) {
      const r = randInt(rnd, Math.max(0, p.r - 3), Math.min(size - 1, p.r + 3));
      const c = randInt(rnd, Math.max(0, p.c - 3), Math.min(size - 2, p.c + 3));
      if (!grid[r * size + c] && !grid[r * size + c + 1]) {
        grid[r * size + c] = pair[0];
        grid[r * size + c + 1] = pair[1];
        return;
      }
    }
  });
}

/** Independent re-check: every claimed placement really reads that word in the
    finished grid. Run after generation, on the finished grid only. */
export function verifyWordSearch(p) {
  let ok = 0;
  p.placements.forEach((pl) => {
    let read = '';
    for (let i = 0; i < pl.word.length; i += 1) {
      read += p.grid[(pl.r + pl.dr * i) * p.size + (pl.c + pl.dc * i)] || '?';
    }
    if (read === pl.word) ok += 1;
  });
  return { ok, total: p.placements.length, pass: ok === p.placements.length };
}
