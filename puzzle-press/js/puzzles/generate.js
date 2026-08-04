/* One puzzle from one sub-seed. Shared by the worker and by the main-thread
   fallback, so both paths produce bit-identical books. */

import { subRandom, shuffle } from '../rng.js';
import { makeWordSearch } from './wordsearch.js';
import { makeSudoku } from './sudoku.js';
import { makeMaze, MAZE_LEVELS } from './maze.js';

/** Words per word-search puzzle, before density trimming. */
function wordSlice(words, index, seed, size, level) {
  const rnd = subRandom(seed, 'ws-pick', index);
  const capacity = Math.max(10, Math.round((size * size) / 8));
  const pool = shuffle(words, rnd);
  return pool.slice(0, Math.min(pool.length, capacity + 8));
}

export function generateOne(spec) {
  const { type, index, seed, level } = spec;
  const id = index + 1;

  if (type === 'sudoku') {
    const rnd = subRandom(seed, 'sudoku', index, spec.salt || 0);
    const s = makeSudoku({ level, rnd, maxAttempts: 12 });
    return {
      id,
      type,
      level,
      gradedLevel: s.level,
      hit: s.hit,
      puzzle: s.puzzle,
      solution: s.solution,
      clues: s.clues,
      techniques: s.techniques,
      attempts: s.attempts,
    };
  }

  if (type === 'maze') {
    const rnd = subRandom(seed, 'maze', index, spec.salt || 0);
    const m = makeMaze({ level, rnd, maxAttempts: 40 });
    return {
      id,
      type,
      level,
      gradedLevel: level,
      size: m.size,
      cells: m.cells,
      start: m.start,
      end: m.end,
      steps: m.steps,
      path: m.path,
      inBand: m.inBand,
      band: MAZE_LEVELS[level].min + ' 到 ' + MAZE_LEVELS[level].max,
      attempts: m.attempts,
    };
  }

  const rnd = subRandom(seed, 'wordsearch', index, spec.salt || 0);
  const words = wordSlice(spec.words || [], index, seed, spec.size, level);
  const w = makeWordSearch({ words, size: spec.size, level, rnd });
  return {
    id,
    type: 'wordsearch',
    level,
    gradedLevel: level,
    size: w.size,
    grid: w.grid,
    words: w.words,
    placements: w.placements,
    tooLong: w.tooLong,
    unplaced: w.unplaced,
    density: w.density,
    targetDensity: w.targetDensity,
    directions: w.directions,
    reverse: w.reverse,
  };
}
