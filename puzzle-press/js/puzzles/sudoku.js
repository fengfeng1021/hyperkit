/* Sudoku.
   Two things are non-negotiable here and they are the reason this product can
   charge anything at all:

   1. Every published puzzle has exactly one solution. Uniqueness is checked on
      every single dig, and then checked again from scratch by verify.js on the
      finished grid, without reusing anything from generation.

   2. Difficulty is the highest-order technique a human needs, not the number of
      blanks. Grading by blank count is how you ship a "hard" puzzle that solves
      in three minutes, which is exactly why the buyer left the last tool.

   A puzzle that cannot be finished by the technique solver would need guessing.
   Those are discarded and regenerated, never shipped. */

import { shuffle } from '../rng.js';

const ALL = 0x1ff; // bits 0..8 = digits 1..9

export const SUDOKU_LEVELS = {
  1: { label: '入門', techniques: ['nakedSingle'] },
  2: { label: '輕鬆', techniques: ['hiddenSingle'] },
  3: { label: '中等', techniques: ['pointing', 'claiming', 'nakedPair'] },
  4: { label: '困難', techniques: ['hiddenPair', 'nakedTriple', 'xWing'] },
  5: { label: '專家', techniques: ['xyWing', 'swordfish'] },
};

export const TECHNIQUE_NAMES = {
  nakedSingle: 'naked single',
  hiddenSingle: 'hidden single',
  pointing: 'pointing pair',
  claiming: 'claiming pair',
  nakedPair: 'naked pair',
  hiddenPair: 'hidden pair',
  nakedTriple: 'naked triple',
  xWing: 'X-Wing',
  xyWing: 'XY-Wing',
  swordfish: 'Swordfish',
};

const TECHNIQUE_LEVEL = {};
Object.keys(SUDOKU_LEVELS).forEach((lv) => {
  SUDOKU_LEVELS[lv].techniques.forEach((t) => {
    TECHNIQUE_LEVEL[t] = Number(lv);
  });
});

/* ---------- precomputed geometry ---------- */

const ROW_OF = new Uint8Array(81);
const COL_OF = new Uint8Array(81);
const BOX_OF = new Uint8Array(81);
const UNITS = [];
const PEERS = [];

for (let i = 0; i < 81; i += 1) {
  ROW_OF[i] = Math.floor(i / 9);
  COL_OF[i] = i % 9;
  BOX_OF[i] = Math.floor(ROW_OF[i] / 3) * 3 + Math.floor(COL_OF[i] / 3);
}
for (let r = 0; r < 9; r += 1) {
  const u = [];
  for (let c = 0; c < 9; c += 1) u.push(r * 9 + c);
  UNITS.push(u);
}
for (let c = 0; c < 9; c += 1) {
  const u = [];
  for (let r = 0; r < 9; r += 1) u.push(r * 9 + c);
  UNITS.push(u);
}
for (let b = 0; b < 9; b += 1) {
  const u = [];
  const br = Math.floor(b / 3) * 3;
  const bc = (b % 3) * 3;
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) u.push((br + r) * 9 + bc + c);
  UNITS.push(u);
}
for (let i = 0; i < 81; i += 1) {
  const set = new Set();
  UNITS.forEach((u) => {
    if (u.includes(i)) u.forEach((j) => j !== i && set.add(j));
  });
  PEERS.push(Array.from(set));
}

const ROW_UNITS = UNITS.slice(0, 9);
const COL_UNITS = UNITS.slice(9, 18);
const BOX_UNITS = UNITS.slice(18, 27);

function bit(d) {
  return 1 << (d - 1);
}
function popcount(m) {
  let n = 0;
  let x = m;
  while (x) {
    x &= x - 1;
    n += 1;
  }
  return n;
}
function lowestDigit(m) {
  for (let d = 1; d <= 9; d += 1) if (m & bit(d)) return d;
  return 0;
}
function digitsOf(m) {
  const out = [];
  for (let d = 1; d <= 9; d += 1) if (m & bit(d)) out.push(d);
  return out;
}

/* ---------- exact solver (uniqueness) ---------- */

export function countSolutions(grid, limit = 2) {
  const rows = new Int32Array(9);
  const cols = new Int32Array(9);
  const boxes = new Int32Array(9);
  for (let i = 0; i < 81; i += 1) {
    const v = grid[i];
    if (v) {
      const b = bit(v);
      if (rows[ROW_OF[i]] & b || cols[COL_OF[i]] & b || boxes[BOX_OF[i]] & b) return 0;
      rows[ROW_OF[i]] |= b;
      cols[COL_OF[i]] |= b;
      boxes[BOX_OF[i]] |= b;
    }
  }
  const work = Int8Array.from(grid);
  let found = 0;

  function recurse() {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i += 1) {
      if (work[i]) continue;
      const mask = ALL & ~(rows[ROW_OF[i]] | cols[COL_OF[i]] | boxes[BOX_OF[i]]);
      const n = popcount(mask);
      if (n === 0) return false;
      if (n < bestCount) {
        bestCount = n;
        best = i;
        bestMask = mask;
        if (n === 1) break;
      }
    }
    if (best === -1) {
      found += 1;
      return found >= limit;
    }
    const r = ROW_OF[best];
    const c = COL_OF[best];
    const b = BOX_OF[best];
    for (let d = 1; d <= 9; d += 1) {
      const bm = bit(d);
      if (!(bestMask & bm)) continue;
      work[best] = d;
      rows[r] |= bm;
      cols[c] |= bm;
      boxes[b] |= bm;
      const stop = recurse();
      work[best] = 0;
      rows[r] &= ~bm;
      cols[c] &= ~bm;
      boxes[b] &= ~bm;
      if (stop) return true;
    }
    return false;
  }

  recurse();
  return found;
}

export function solveOnce(grid) {
  const rows = new Int32Array(9);
  const cols = new Int32Array(9);
  const boxes = new Int32Array(9);
  const work = Int8Array.from(grid);
  for (let i = 0; i < 81; i += 1) {
    const v = work[i];
    if (v) {
      rows[ROW_OF[i]] |= bit(v);
      cols[COL_OF[i]] |= bit(v);
      boxes[BOX_OF[i]] |= bit(v);
    }
  }
  function recurse() {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i += 1) {
      if (work[i]) continue;
      const mask = ALL & ~(rows[ROW_OF[i]] | cols[COL_OF[i]] | boxes[BOX_OF[i]]);
      const n = popcount(mask);
      if (n === 0) return false;
      if (n < bestCount) {
        bestCount = n;
        best = i;
        bestMask = mask;
        if (n === 1) break;
      }
    }
    if (best === -1) return true;
    for (let d = 1; d <= 9; d += 1) {
      const bm = bit(d);
      if (!(bestMask & bm)) continue;
      work[best] = d;
      rows[ROW_OF[best]] |= bm;
      cols[COL_OF[best]] |= bm;
      boxes[BOX_OF[best]] |= bm;
      if (recurse()) return true;
      work[best] = 0;
      rows[ROW_OF[best]] &= ~bm;
      cols[COL_OF[best]] &= ~bm;
      boxes[BOX_OF[best]] &= ~bm;
    }
    return false;
  }
  return recurse() ? work : null;
}

/* ---------- human technique solver ---------- */

function buildCandidates(grid) {
  const cand = new Int32Array(81);
  for (let i = 0; i < 81; i += 1) {
    if (grid[i]) {
      cand[i] = 0;
      continue;
    }
    let used = 0;
    PEERS[i].forEach((j) => {
      if (grid[j]) used |= bit(grid[j]);
    });
    cand[i] = ALL & ~used;
  }
  return cand;
}

function place(grid, cand, idx, d) {
  grid[idx] = d;
  cand[idx] = 0;
  const bm = bit(d);
  PEERS[idx].forEach((j) => {
    cand[j] &= ~bm;
  });
}

const STRATEGIES = [
  ['nakedSingle', nakedSingle],
  ['hiddenSingle', hiddenSingle],
  ['pointing', pointing],
  ['claiming', claiming],
  ['nakedPair', nakedPair],
  ['hiddenPair', hiddenPair],
  ['nakedTriple', nakedTriple],
  ['xWing', xWing],
  ['xyWing', xyWing],
  ['swordfish', swordfish],
];

/**
 * Solve using human techniques only.
 * @returns {{solved:boolean, maxLevel:number, used:Object<string,number>}}
 *          maxLevel 6 means the position needs guessing, which is never shipped.
 */
export function humanSolve(input, ceiling = 5) {
  const grid = Int8Array.from(input);
  const cand = buildCandidates(grid);
  const used = {};
  let maxLevel = 0;
  let empties = 0;
  for (let i = 0; i < 81; i += 1) if (!grid[i]) empties += 1;

  let guard = 0;
  while (empties > 0 && guard < 800) {
    guard += 1;
    let progressed = false;
    for (let s = 0; s < STRATEGIES.length; s += 1) {
      const [name, fn] = STRATEGIES[s];
      const lv = TECHNIQUE_LEVEL[name];
      if (lv > ceiling) return { solved: false, maxLevel: 6, used };
      const gained = fn(grid, cand);
      if (gained) {
        used[name] = (used[name] || 0) + gained;
        if (lv > maxLevel) maxLevel = lv;
        empties = 0;
        for (let i = 0; i < 81; i += 1) if (!grid[i]) empties += 1;
        progressed = true;
        break;
      }
    }
    if (!progressed) return { solved: false, maxLevel: 6, used };
  }
  return { solved: empties === 0, maxLevel: maxLevel || 1, used };
}

function nakedSingle(grid, cand) {
  let n = 0;
  for (let i = 0; i < 81; i += 1) {
    if (!grid[i] && popcount(cand[i]) === 1) {
      place(grid, cand, i, lowestDigit(cand[i]));
      n += 1;
    }
  }
  return n;
}

function hiddenSingle(grid, cand) {
  let n = 0;
  for (let u = 0; u < UNITS.length; u += 1) {
    const unit = UNITS[u];
    for (let d = 1; d <= 9; d += 1) {
      const bm = bit(d);
      let spot = -1;
      let count = 0;
      let taken = false;
      for (let k = 0; k < 9; k += 1) {
        const i = unit[k];
        if (grid[i] === d) {
          taken = true;
          break;
        }
        if (!grid[i] && cand[i] & bm) {
          count += 1;
          spot = i;
        }
      }
      if (!taken && count === 1) {
        place(grid, cand, spot, d);
        n += 1;
      }
    }
  }
  return n;
}

/* locked candidates, box -> line */
function pointing(grid, cand) {
  let n = 0;
  for (let b = 0; b < 9; b += 1) {
    const unit = BOX_UNITS[b];
    for (let d = 1; d <= 9; d += 1) {
      const bm = bit(d);
      const spots = unit.filter((i) => !grid[i] && cand[i] & bm);
      if (spots.length < 2 || spots.length > 3) continue;
      const rows = new Set(spots.map((i) => ROW_OF[i]));
      const cols = new Set(spots.map((i) => COL_OF[i]));
      if (rows.size === 1) {
        ROW_UNITS[ROW_OF[spots[0]]].forEach((i) => {
          if (BOX_OF[i] !== b && !grid[i] && cand[i] & bm) {
            cand[i] &= ~bm;
            n += 1;
          }
        });
      } else if (cols.size === 1) {
        COL_UNITS[COL_OF[spots[0]]].forEach((i) => {
          if (BOX_OF[i] !== b && !grid[i] && cand[i] & bm) {
            cand[i] &= ~bm;
            n += 1;
          }
        });
      }
    }
  }
  return n;
}

/* locked candidates, line -> box */
function claiming(grid, cand) {
  let n = 0;
  const lines = ROW_UNITS.concat(COL_UNITS);
  for (let l = 0; l < lines.length; l += 1) {
    const unit = lines[l];
    for (let d = 1; d <= 9; d += 1) {
      const bm = bit(d);
      const spots = unit.filter((i) => !grid[i] && cand[i] & bm);
      if (spots.length < 2 || spots.length > 3) continue;
      const box = BOX_OF[spots[0]];
      if (!spots.every((i) => BOX_OF[i] === box)) continue;
      BOX_UNITS[box].forEach((i) => {
        if (!unit.includes(i) && !grid[i] && cand[i] & bm) {
          cand[i] &= ~bm;
          n += 1;
        }
      });
    }
  }
  return n;
}

function nakedPair(grid, cand) {
  let n = 0;
  for (let u = 0; u < UNITS.length; u += 1) {
    const unit = UNITS[u];
    const pairs = unit.filter((i) => !grid[i] && popcount(cand[i]) === 2);
    for (let a = 0; a < pairs.length; a += 1) {
      for (let b = a + 1; b < pairs.length; b += 1) {
        if (cand[pairs[a]] !== cand[pairs[b]]) continue;
        const mask = cand[pairs[a]];
        unit.forEach((i) => {
          if (i !== pairs[a] && i !== pairs[b] && !grid[i] && cand[i] & mask) {
            cand[i] &= ~mask;
            n += 1;
          }
        });
      }
    }
  }
  return n;
}

function hiddenPair(grid, cand) {
  let n = 0;
  for (let u = 0; u < UNITS.length; u += 1) {
    const unit = UNITS[u];
    const spots = {};
    for (let d = 1; d <= 9; d += 1) {
      spots[d] = unit.filter((i) => !grid[i] && cand[i] & bit(d));
    }
    for (let d1 = 1; d1 <= 9; d1 += 1) {
      if (spots[d1].length !== 2) continue;
      for (let d2 = d1 + 1; d2 <= 9; d2 += 1) {
        if (spots[d2].length !== 2) continue;
        if (spots[d1][0] !== spots[d2][0] || spots[d1][1] !== spots[d2][1]) continue;
        const mask = bit(d1) | bit(d2);
        spots[d1].forEach((i) => {
          if (cand[i] !== mask) {
            cand[i] = mask;
            n += 1;
          }
        });
      }
    }
  }
  return n;
}

function nakedTriple(grid, cand) {
  let n = 0;
  for (let u = 0; u < UNITS.length; u += 1) {
    const unit = UNITS[u];
    const cells = unit.filter((i) => !grid[i] && popcount(cand[i]) >= 2 && popcount(cand[i]) <= 3);
    for (let a = 0; a < cells.length; a += 1) {
      for (let b = a + 1; b < cells.length; b += 1) {
        for (let c = b + 1; c < cells.length; c += 1) {
          const mask = cand[cells[a]] | cand[cells[b]] | cand[cells[c]];
          if (popcount(mask) !== 3) continue;
          unit.forEach((i) => {
            if (i !== cells[a] && i !== cells[b] && i !== cells[c] && !grid[i] && cand[i] & mask) {
              cand[i] &= ~mask;
              n += 1;
            }
          });
        }
      }
    }
  }
  return n;
}

function fish(grid, cand, size) {
  let n = 0;
  const orient = [
    { lines: ROW_UNITS, other: COL_UNITS, keyOf: COL_OF },
    { lines: COL_UNITS, other: ROW_UNITS, keyOf: ROW_OF },
  ];
  orient.forEach(({ lines, other, keyOf }) => {
    for (let d = 1; d <= 9; d += 1) {
      const bm = bit(d);
      const sets = [];
      lines.forEach((unit, li) => {
        const spots = unit.filter((i) => !grid[i] && cand[i] & bm);
        if (spots.length >= 2 && spots.length <= size) {
          sets.push({ li, keys: spots.map((i) => keyOf[i]) });
        }
      });
      combine(sets, size).forEach((combo) => {
        const keys = new Set();
        combo.forEach((s) => s.keys.forEach((k) => keys.add(k)));
        if (keys.size !== size) return;
        const lineIdx = new Set(combo.map((s) => s.li));
        keys.forEach((k) => {
          other[k].forEach((i) => {
            const li = lines === ROW_UNITS ? ROW_OF[i] : COL_OF[i];
            if (!lineIdx.has(li) && !grid[i] && cand[i] & bm) {
              cand[i] &= ~bm;
              n += 1;
            }
          });
        });
      });
    }
  });
  return n;
}

function combine(list, k) {
  const out = [];
  const cur = [];
  (function walk(start) {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i < list.length; i += 1) {
      cur.push(list[i]);
      walk(i + 1);
      cur.pop();
    }
  })(0);
  return out;
}

function xWing(grid, cand) {
  return fish(grid, cand, 2);
}
function swordfish(grid, cand) {
  return fish(grid, cand, 3);
}

function xyWing(grid, cand) {
  let n = 0;
  const bi = [];
  for (let i = 0; i < 81; i += 1) if (!grid[i] && popcount(cand[i]) === 2) bi.push(i);

  for (let p = 0; p < bi.length; p += 1) {
    const pivot = bi[p];
    const pd = digitsOf(cand[pivot]);
    const wings = PEERS[pivot].filter((i) => !grid[i] && popcount(cand[i]) === 2);
    for (let a = 0; a < wings.length; a += 1) {
      for (let b = a + 1; b < wings.length; b += 1) {
        const A = wings[a];
        const B = wings[b];
        if (cand[A] === cand[B]) continue;
        /* try both assignments of the pivot's two digits to the two wings */
        for (let t = 0; t < 2; t += 1) {
          const px = pd[t];
          const py = pd[1 - t];
          if (!(cand[A] & bit(px)) || cand[A] & bit(py)) continue;
          if (!(cand[B] & bit(py)) || cand[B] & bit(px)) continue;
          const zA = digitsOf(cand[A]).find((d) => d !== px);
          const zB = digitsOf(cand[B]).find((d) => d !== py);
          if (!zA || zA !== zB || zA === px || zA === py) continue;
          const bm = bit(zA);
          const seenByB = new Set(PEERS[B]);
          PEERS[A].forEach((i) => {
            if (i === pivot || i === A || i === B) return;
            if (!seenByB.has(i)) return;
            if (!grid[i] && cand[i] & bm) {
              cand[i] &= ~bm;
              n += 1;
            }
          });
        }
      }
    }
  }
  return n;
}

/* ---------- generation ---------- */

function generateFull(rnd) {
  const grid = new Int8Array(81);
  const rows = new Int32Array(9);
  const cols = new Int32Array(9);
  const boxes = new Int32Array(9);
  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  function fill(i) {
    if (i === 81) return true;
    const mask = ALL & ~(rows[ROW_OF[i]] | cols[COL_OF[i]] | boxes[BOX_OF[i]]);
    if (!mask) return false;
    const digits = shuffle(order, rnd);
    for (let k = 0; k < 9; k += 1) {
      const d = digits[k];
      const bm = bit(d);
      if (!(mask & bm)) continue;
      grid[i] = d;
      rows[ROW_OF[i]] |= bm;
      cols[COL_OF[i]] |= bm;
      boxes[BOX_OF[i]] |= bm;
      if (fill(i + 1)) return true;
      grid[i] = 0;
      rows[ROW_OF[i]] &= ~bm;
      cols[COL_OF[i]] &= ~bm;
      boxes[BOX_OF[i]] &= ~bm;
    }
    return false;
  }
  fill(0);
  return grid;
}

/**
 * @param {object} o
 * @param {number} o.level  target 1..5
 * @param {function} o.rnd
 * @param {number} [o.maxAttempts] how many full solutions to try before
 *        accepting a near miss. The press check reports every near miss.
 */
export function makeSudoku({ level, rnd, maxAttempts = 8 }) {
  const target = Math.min(5, Math.max(1, level));
  let best = null;
  let attempts = 0;

  for (let a = 0; a < maxAttempts; a += 1) {
    attempts += 1;
    const solution = generateFull(rnd);
    const puzzle = Int8Array.from(solution);
    const order = shuffle(
      Array.from({ length: 81 }, (_, i) => i),
      rnd,
    );

    for (let k = 0; k < order.length; k += 1) {
      const idx = order[k];
      const keep = puzzle[idx];
      puzzle[idx] = 0;
      if (countSolutions(puzzle, 2) !== 1) {
        puzzle[idx] = keep;
        continue;
      }
      const graded = humanSolve(puzzle, target);
      if (!graded.solved) puzzle[idx] = keep;
    }

    const graded = humanSolve(puzzle, 5);
    let clues = 0;
    for (let i = 0; i < 81; i += 1) if (puzzle[i]) clues += 1;
    const candidate = {
      puzzle: Array.from(puzzle),
      solution: Array.from(solution),
      clues,
      level: graded.maxLevel,
      target,
      techniques: graded.used,
      hit: graded.maxLevel === target,
      attempts,
    };
    if (candidate.hit) return candidate;
    if (!best || Math.abs(candidate.level - target) < Math.abs(best.level - target)) best = candidate;
  }
  return best;
}

export function verifySudoku(p) {
  const grid = Int8Array.from(p.puzzle);
  const solutions = countSolutions(grid, 2);
  const solved = solveOnce(grid);
  let matches = true;
  if (solved) {
    for (let i = 0; i < 81; i += 1) if (solved[i] !== p.solution[i]) matches = false;
  } else matches = false;
  return { unique: solutions === 1, solutions, matchesStoredSolution: matches, pass: solutions === 1 && matches };
}
