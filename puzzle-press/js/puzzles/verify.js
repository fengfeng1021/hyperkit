/* Independent re-verification.
   This module deliberately reuses nothing from the generation pass: it takes a
   finished puzzle object and re-derives every claim from the published grid.
   If generation had a bug, this is where it shows up. */

import { verifySudoku } from './sudoku.js';
import { verifyMaze } from './maze.js';
import { verifyWordSearch } from './wordsearch.js';

export function verifyPuzzle(p) {
  if (p.type === 'sudoku') {
    const v = verifySudoku(p);
    return { pass: v.pass, detail: v, reason: v.pass ? '' : v.solutions === 1 ? '答案與題目對不上' : `解的數量 ${v.solutions}，不是唯一解` };
  }
  if (p.type === 'maze') {
    const v = verifyMaze(p);
    return {
      pass: v.pass,
      detail: v,
      reason: v.pass ? '' : !v.tree ? '迷宮有迴路，路徑不唯一' : !v.full ? '有無法抵達的格子' : '最短解步數與紀錄不符',
    };
  }
  const v = verifyWordSearch(p);
  return { pass: v.pass, detail: v, reason: v.pass ? '' : `${v.total - v.ok} 個字在格線上讀不出來` };
}

/** Aggregate the whole book into the rows the press check prints. */
export function summarise(puzzles, type) {
  const total = puzzles.length;
  const verified = puzzles.filter((p) => p.verify && p.verify.pass).length;
  const levels = {};
  puzzles.forEach((p) => {
    const lv = p.gradedLevel || p.level;
    levels[lv] = (levels[lv] || 0) + 1;
  });
  const ids = puzzles.map((p) => p.id).sort((a, b) => a - b);
  let contiguous = true;
  ids.forEach((id, i) => {
    if (id !== i + 1) contiguous = false;
  });

  const out = { total, verified, levels, contiguous, type };

  if (type === 'sudoku') {
    out.unique = puzzles.filter((p) => p.verify && p.verify.detail.unique).length;
    out.clueRange = range(puzzles.map((p) => p.clues));
  }
  if (type === 'maze') {
    out.singlePath = puzzles.filter((p) => p.verify && p.verify.detail.singlePath).length;
    out.stepRange = range(puzzles.map((p) => p.steps));
    out.inBand = puzzles.filter((p) => p.inBand).length;
  }
  if (type === 'wordsearch') {
    out.placed = puzzles.reduce((n, p) => n + p.placements.length, 0);
    out.densityRange = range(puzzles.map((p) => Math.round(p.density * 100)));
    out.tooLong = puzzles.reduce((n, p) => n + (p.tooLong ? p.tooLong.length : 0), 0);
    out.unplaced = puzzles.reduce((n, p) => n + (p.unplaced ? p.unplaced.length : 0), 0);
  }
  return out;
}

function range(values) {
  if (!values.length) return [0, 0];
  return [Math.min(...values), Math.max(...values)];
}
