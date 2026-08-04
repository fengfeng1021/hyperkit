/* Maze.
   Randomised depth-first search produces a perfect maze: every cell reachable,
   no loops, exactly one path between any two cells. "Unique path" is therefore
   structural rather than hopeful, and it is re-checked after the fact by
   counting passages (a tree on n cells has exactly n-1 edges) and by a BFS that
   must reach all n cells.

   Difficulty is calibrated on the shortest solution length, measured with BFS
   after generation. A maze whose solution falls outside the band for its level
   is regenerated rather than shipped with a wrong label. */

import { shuffle } from '../rng.js';

export const MAZE_LEVELS = {
  1: { size: 13, min: 40, max: 70, label: '入門' },
  2: { size: 17, min: 70, max: 110, label: '輕鬆' },
  3: { size: 21, min: 120, max: 180, label: '中等' },
  4: { size: 25, min: 190, max: 270, label: '困難' },
  5: { size: 31, min: 300, max: 420, label: '專家' },
};

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };
const DELTA = { [N]: [-1, 0], [E]: [0, 1], [S]: [1, 0], [W]: [0, -1] };

function carve(size, rnd) {
  const cells = new Uint8Array(size * size); // open sides per cell
  const seen = new Uint8Array(size * size);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const r = Math.floor(cur / size);
    const c = cur % size;
    const options = [];
    [N, E, S, W].forEach((d) => {
      const nr = r + DELTA[d][0];
      const nc = c + DELTA[d][1];
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) return;
      if (seen[nr * size + nc]) return;
      options.push([d, nr * size + nc]);
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [d, next] = shuffle(options, rnd)[0];
    cells[cur] |= d;
    cells[next] |= OPP[d];
    seen[next] = 1;
    stack.push(next);
  }
  return cells;
}

function bfs(cells, size, start) {
  const dist = new Int32Array(size * size).fill(-1);
  const prev = new Int32Array(size * size).fill(-1);
  const queue = [start];
  dist[start] = 0;
  let head = 0;
  let reached = 1;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    const r = Math.floor(cur / size);
    const c = cur % size;
    [N, E, S, W].forEach((d) => {
      if (!(cells[cur] & d)) return;
      const nr = r + DELTA[d][0];
      const nc = c + DELTA[d][1];
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) return;
      const next = nr * size + nc;
      if (dist[next] !== -1) return;
      dist[next] = dist[cur] + 1;
      prev[next] = cur;
      queue.push(next);
      reached += 1;
    });
  }
  return { dist, prev, reached };
}

function countPassages(cells, size) {
  let edges = 0;
  for (let i = 0; i < size * size; i += 1) {
    if (cells[i] & E) edges += 1;
    if (cells[i] & S) edges += 1;
  }
  return edges;
}

export function makeMaze({ level, rnd, maxAttempts = 40 }) {
  const cfg = MAZE_LEVELS[level] || MAZE_LEVELS[3];
  const size = cfg.size;
  const start = 0;
  const end = size * size - 1;
  let best = null;

  for (let a = 0; a < maxAttempts; a += 1) {
    const cells = carve(size, rnd);
    const { dist, prev, reached } = bfs(cells, size, start);
    const steps = dist[end];
    const edges = countPassages(cells, size);
    const perfect = reached === size * size && edges === size * size - 1;
    const path = [];
    let cur = end;
    while (cur !== -1) {
      path.push(cur);
      cur = prev[cur];
    }
    path.reverse();
    const candidate = {
      size,
      cells: Array.from(cells),
      start,
      end,
      steps,
      path,
      perfect,
      band: [cfg.min, cfg.max],
      inBand: perfect && steps >= cfg.min && steps <= cfg.max,
      attempts: a + 1,
      level,
    };
    if (candidate.inBand) return candidate;
    if (!best || bandDistance(candidate, cfg) < bandDistance(best, cfg)) best = candidate;
  }
  return best;
}

function bandDistance(m, cfg) {
  if (m.steps < cfg.min) return cfg.min - m.steps;
  if (m.steps > cfg.max) return m.steps - cfg.max;
  return 0;
}

/** Independent re-check on the finished maze only. */
export function verifyMaze(m) {
  const cells = Uint8Array.from(m.cells);
  const { dist, reached } = bfs(cells, m.size, m.start);
  const edges = countPassages(cells, m.size);
  const tree = edges === m.size * m.size - 1;
  const full = reached === m.size * m.size;
  return {
    singlePath: tree && full,
    tree,
    full,
    edges,
    cellCount: m.size * m.size,
    steps: dist[m.end],
    matchesStoredSteps: dist[m.end] === m.steps,
    inBand: m.inBand,
    pass: tree && full && dist[m.end] === m.steps,
  };
}
