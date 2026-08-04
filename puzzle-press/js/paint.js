/* The single source of page geometry.
   paintPage returns primitives in PDF points with the origin at the bottom
   left. js/thumbs.js draws them on a canvas, js/pdf.js writes them into the
   file. Neither one measures anything itself, which is why the plate table and
   the exported PDF cannot drift apart. */

import { rectFor } from './layout.js';
import { trimRect } from './kdp.js';

const GREY = { light: 0.72, mid: 0.45, ink: 0 };

export function paintPage(page, plan, puzzles, meta) {
  const r = rectFor(page, plan);
  const ops = [];
  const lp = plan.largePrint;

  const top = r.y + r.h;
  const bottom = r.y;

  if (page.kind === 'blank') return { ops, rect: r };

  if (page.kind === 'title') {
    const cx = r.x + r.w / 2;
    text(ops, meta.title, cx, top - r.h * 0.32, lp ? 30 : 26, 'bold', 'center');
    text(ops, meta.subtitle, cx, top - r.h * 0.32 - 30, 12, 'reg', 'center');
    line(ops, cx - 60, top - r.h * 0.32 - 48, cx + 60, top - r.h * 0.32 - 48, 1, GREY.mid);
    text(ops, `${plan.count} puzzles with full answer key`, cx, top - r.h * 0.32 - 70, 10, 'reg', 'center');
    text(ops, `seed ${meta.seed}`, cx, bottom + 12, 8, 'reg', 'center', GREY.mid);
    return { ops, rect: r };
  }

  if (page.kind === 'divider') {
    const cx = r.x + r.w / 2;
    text(ops, 'Answers', cx, bottom + r.h * 0.5, lp ? 34 : 28, 'bold', 'center');
    line(ops, cx - 48, bottom + r.h * 0.5 - 16, cx + 48, bottom + r.h * 0.5 - 16, 1, GREY.mid);
    return { ops, rect: r };
  }

  runningHead(ops, r, page, meta);
  folio(ops, r, page);

  const bodyTop = top - 52;
  const bodyBottom = bottom + 22;

  if (page.kind === 'toc') {
    text(ops, 'Contents', r.x, top - 40, lp ? 20 : 17, 'bold', 'left');
    const cols = plan.trimId === 'letter' ? 3 : 2;
    const rows = Math.ceil((page.to - page.from + 1) / cols);
    const colW = r.w / cols;
    const lh = Math.min(16, (bodyTop - bodyBottom) / Math.max(rows, 1));
    for (let i = page.from; i <= page.to; i += 1) {
      const k = i - page.from;
      const col = Math.floor(k / rows);
      const row = k % rows;
      const x = r.x + col * colW;
      const y = bodyTop - row * lh - 10;
      const p = puzzles[i - 1];
      text(ops, `${i}`, x, y, 9, 'reg', 'left');
      text(ops, levelWord(p ? p.gradedLevel || p.level : plan.level), x + 22, y, 9, 'reg', 'left', GREY.mid);
      dots(ops, x + 62, y + 3, x + colW - 34, GREY.light);
      text(ops, `${pageOfPuzzle(plan, i)}`, x + colW - 14, y, 9, 'reg', 'right');
    }
    return { ops, rect: r };
  }

  if (page.kind === 'howto') {
    text(ops, 'How to solve', r.x, top - 40, lp ? 20 : 17, 'bold', 'left');
    const lines = HOWTO[meta.type] || [];
    lines.forEach((s, i) => {
      text(ops, s, r.x, bodyTop - i * (lp ? 22 : 18) - 8, lp ? 13 : 11, 'reg', 'left');
    });
    return { ops, rect: r };
  }

  if (page.kind === 'puzzle') {
    const p = puzzles[page.puzzleIndex];
    text(ops, `Puzzle ${page.puzzleIndex + 1}`, r.x, top - 40, lp ? 20 : 17, 'bold', 'left');
    text(
      ops,
      `${typeWord(meta.type)} · ${levelWord(p ? p.gradedLevel || p.level : plan.level)}`,
      r.x + r.w,
      top - 40,
      lp ? 12 : 10,
      'reg',
      'right',
      GREY.mid,
    );
    if (!p) {
      placeholder(ops, r.x, bodyBottom, r.w, bodyTop - bodyBottom);
      return { ops, rect: r };
    }
    drawPuzzle(ops, p, r.x, bodyBottom, r.w, bodyTop - bodyBottom, lp, false);
    return { ops, rect: r };
  }

  if (page.kind === 'answer') {
    text(ops, 'Answers', r.x, top - 40, lp ? 20 : 17, 'bold', 'left');
    const g = plan.answerGrid;
    const cellW = r.w / g.cols;
    const cellH = (bodyTop - bodyBottom) / g.rows;
    page.answers.forEach((idx, k) => {
      const col = k % g.cols;
      const row = Math.floor(k / g.cols);
      const x = r.x + col * cellW;
      const y = bodyTop - (row + 1) * cellH;
      const p = puzzles[idx];
      text(ops, `${idx + 1}`, x, y + cellH - 10, 10, 'bold', 'left');
      if (!p) {
        placeholder(ops, x + 4, y + 6, cellW - 12, cellH - 26);
        return;
      }
      drawPuzzle(ops, p, x + 4, y + 6, cellW - 12, cellH - 26, false, true);
    });
    return { ops, rect: r };
  }

  return { ops, rect: r };
}

/* ---------- page furniture ---------- */

function runningHead(ops, r, page, meta) {
  const top = r.y + r.h;
  const recto = page.n % 2 === 1;
  text(ops, meta.title, recto ? r.x + r.w : r.x, top - 8, 8, 'reg', recto ? 'right' : 'left', GREY.mid);
  line(ops, r.x, top - 16, r.x + r.w, top - 16, 0.5, GREY.light);
}

function folio(ops, r, page) {
  text(ops, `${page.n}`, r.x + r.w / 2, r.y + 4, 8, 'reg', 'center', GREY.mid);
}

function placeholder(ops, x, y, w, h) {
  rect(ops, x, y, w, h, { stroke: GREY.light, lw: 0.5, dash: [3, 3] });
  line(ops, x, y + h / 2, x + w, y + h / 2, 0.5, GREY.light);
}

/* ---------- puzzle bodies ---------- */

function drawPuzzle(ops, p, x, y, w, h, largePrint, answer) {
  if (p.type === 'wordsearch') return drawWordSearch(ops, p, x, y, w, h, largePrint, answer);
  if (p.type === 'sudoku') return drawSudoku(ops, p, x, y, w, h, largePrint, answer);
  return drawMaze(ops, p, x, y, w, h, largePrint, answer);
}

function drawWordSearch(ops, p, x, y, w, h, largePrint, answer) {
  const listCols = answer ? 2 : largePrint ? 3 : 4;
  const listRows = Math.ceil(p.words.length / listCols);
  const listLH = answer ? 8 : largePrint ? 15 : 12;
  const listH = answer ? 0 : listRows * listLH + 14;
  const gridSpace = Math.min(w, h - listH);
  const cell = gridSpace / p.size;
  const gx = x + (w - gridSpace) / 2;
  const gy = y + h - gridSpace;

  rect(ops, gx, gy, gridSpace, gridSpace, { stroke: GREY.ink, lw: answer ? 0.5 : 1 });
  if (!answer) {
    for (let i = 1; i < p.size; i += 1) {
      line(ops, gx + i * cell, gy, gx + i * cell, gy + gridSpace, 0.35, GREY.light);
      line(ops, gx, gy + i * cell, gx + gridSpace, gy + i * cell, 0.35, GREY.light);
    }
  }

  const fs = cell * 0.62;
  const solved = new Set();
  if (answer) {
    p.placements.forEach((pl) => {
      for (let i = 0; i < pl.word.length; i += 1) solved.add((pl.r + pl.dr * i) * p.size + (pl.c + pl.dc * i));
    });
  }
  for (let r0 = 0; r0 < p.size; r0 += 1) {
    for (let c0 = 0; c0 < p.size; c0 += 1) {
      const idx = r0 * p.size + c0;
      const cx = gx + c0 * cell + cell / 2;
      const cy = gy + gridSpace - (r0 + 1) * cell + cell * 0.28;
      const g = answer && !solved.has(idx) ? GREY.light : GREY.ink;
      text(ops, p.grid[idx], cx, cy, fs, 'reg', 'center', g);
    }
  }

  if (answer) {
    p.placements.forEach((pl) => {
      const x1 = gx + (pl.c + 0.5) * cell;
      const y1 = gy + gridSpace - (pl.r + 0.5) * cell;
      const x2 = gx + (pl.c + pl.dc * (pl.word.length - 1) + 0.5) * cell;
      const y2 = gy + gridSpace - (pl.r + pl.dr * (pl.word.length - 1) + 0.5) * cell;
      line(ops, x1, y1, x2, y2, 0.9, GREY.ink);
    });
    return;
  }

  const colW = w / listCols;
  p.words.forEach((word, i) => {
    const col = Math.floor(i / listRows);
    const row = i % listRows;
    text(ops, word, x + col * colW, gy - 14 - row * listLH, largePrint ? 10 : 8.5, 'reg', 'left');
  });
}

function drawSudoku(ops, p, x, y, w, h, largePrint, answer) {
  const size = Math.min(w, h);
  const cell = size / 9;
  const gx = x + (w - size) / 2;
  const gy = y + (h - size) / 2;
  const values = answer ? p.solution : p.puzzle;

  for (let i = 0; i <= 9; i += 1) {
    const thick = i % 3 === 0;
    const lw = thick ? (answer ? 0.9 : 1.4) : answer ? 0.3 : 0.5;
    line(ops, gx + i * cell, gy, gx + i * cell, gy + size, lw, GREY.ink);
    line(ops, gx, gy + i * cell, gx + size, gy + i * cell, lw, GREY.ink);
  }
  const fs = cell * 0.6;
  for (let r0 = 0; r0 < 9; r0 += 1) {
    for (let c0 = 0; c0 < 9; c0 += 1) {
      const v = values[r0 * 9 + c0];
      if (!v) continue;
      const clue = p.puzzle[r0 * 9 + c0] !== 0;
      text(
        ops,
        String(v),
        gx + c0 * cell + cell / 2,
        gy + size - (r0 + 1) * cell + cell * 0.28,
        fs,
        answer && !clue ? 'reg' : 'bold',
        'center',
        answer && !clue ? GREY.mid : GREY.ink,
      );
    }
  }
}

function drawMaze(ops, p, x, y, w, h, largePrint, answer) {
  const size = Math.min(w, h);
  const cell = size / p.size;
  const gx = x + (w - size) / 2;
  const gy = y + (h - size) / 2;
  const lw = answer ? 0.4 : Math.max(0.6, cell * 0.09);

  rect(ops, gx, gy, size, size, { stroke: GREY.ink, lw });

  for (let r0 = 0; r0 < p.size; r0 += 1) {
    for (let c0 = 0; c0 < p.size; c0 += 1) {
      const v = p.cells[r0 * p.size + c0];
      const x0 = gx + c0 * cell;
      const y0 = gy + size - (r0 + 1) * cell;
      if (!(v & 2) && c0 < p.size - 1) line(ops, x0 + cell, y0, x0 + cell, y0 + cell, lw, GREY.ink);
      if (!(v & 4) && r0 < p.size - 1) line(ops, x0, y0, x0 + cell, y0, lw, GREY.ink);
    }
  }
  /* entrance and exit are openings in the outer wall */
  line(ops, gx, gy + size, gx + cell, gy + size, lw + 0.4, 1);
  line(ops, gx + size - cell, gy, gx + size, gy, lw + 0.4, 1);
  text(ops, 'START', gx, gy + size + 4, 7, 'bold', 'left', GREY.ink);
  text(ops, 'END', gx + size, gy - 9, 7, 'bold', 'right', GREY.ink);

  if (answer && p.path && p.path.length) {
    for (let i = 1; i < p.path.length; i += 1) {
      const a = p.path[i - 1];
      const b = p.path[i];
      line(
        ops,
        gx + (a % p.size) * cell + cell / 2,
        gy + size - (Math.floor(a / p.size) + 0.5) * cell,
        gx + (b % p.size) * cell + cell / 2,
        gy + size - (Math.floor(b / p.size) + 0.5) * cell,
        Math.max(0.6, cell * 0.28),
        GREY.mid,
      );
    }
  }
}

/* ---------- primitive helpers ---------- */

function text(ops, s, x, y, size, font, align, grey = GREY.ink) {
  ops.push({ t: 'text', s: String(s), x, y, size, font: font || 'reg', align: align || 'left', grey });
}
function line(ops, x1, y1, x2, y2, lw, grey = GREY.ink) {
  ops.push({ t: 'line', x1, y1, x2, y2, lw, grey });
}
function rect(ops, x, y, w, h, o = {}) {
  ops.push({ t: 'rect', x, y, w, h, stroke: o.stroke, fill: o.fill, lw: o.lw || 1, dash: o.dash });
}
function dots(ops, x1, y, x2, grey) {
  ops.push({ t: 'line', x1, y1: y, x2, y2: y, lw: 0.4, grey, dash: [1, 2] });
}

/* ---------- shared labels ---------- */

export const HOWTO = {
  wordsearch: [
    'Every puzzle hides a list of words inside a grid of letters.',
    'Words run in straight lines: across, down, diagonally, and',
    'in this book they may also run backwards.',
    '',
    'Circle each word as you find it and tick it off the list',
    'printed under the grid.',
    '',
    'The answer section at the back shows every word struck',
    'through in its exact position.',
  ],
  sudoku: [
    'Fill the grid so that every row, every column and every',
    'three by three box contains the digits 1 to 9 exactly once.',
    '',
    'Every puzzle in this book has one solution and only one.',
    'You never need to guess: each puzzle can be finished by',
    'logic alone.',
    '',
    'The answer section at the back prints the full solution,',
    'with the starting clues shown in bold.',
  ],
  maze: [
    'Find your way from START at the top left corner to END at',
    'the bottom right corner.',
    '',
    'There are no loops and no dead ends that reconnect, so',
    'exactly one route joins the two openings.',
    '',
    'The answer section at the back traces that route.',
  ],
};

export function typeWord(type) {
  return type === 'sudoku' ? 'Sudoku' : type === 'maze' ? 'Maze' : 'Word Search';
}

export function levelWord(level) {
  return ['', 'Easy', 'Gentle', 'Medium', 'Hard', 'Expert'][level] || 'Medium';
}

export function pageOfPuzzle(plan, id) {
  const page = plan.pages.find((p) => p.kind === 'puzzle' && p.puzzleIndex === id - 1);
  return page ? page.n : 0;
}

export { trimRect };
