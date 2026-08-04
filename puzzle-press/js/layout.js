/* Book layout.
   This module emits pure data. The thumbnails on the plate table and the pages
   inside the exported PDF are both drawn from the object this returns, so what
   the user judges on screen is the file they get. Nothing is computed twice.

   The gutter loop: the gutter depends on the page count, the page count depends
   on the layout, and the layout depends on the gutter. Three passes, and if it
   is still oscillating the larger gutter wins, because the larger gutter is
   never the reason a file gets rejected. */

import {
  TRIMS,
  PAGE_MIN,
  PAGE_MAX,
  gutterFor,
  gutterTierFor,
  pageBoxPt,
  outerMinIn,
  contentRect,
  PT_PER_IN,
  round2,
} from './kdp.js';

const TOC_PER_PAGE = { letter: 60, digest: 40 };

/** Minimum printed block size for one answer, in points. Below this an answer
    grid is not readable at arm's length, which is the whole point of these
    books. */
function answerBlockMin(largePrint) {
  return largePrint ? { w: 230, h: 300 } : { w: 150, h: 200 };
}

function answersPerPage(contentW, contentH, largePrint) {
  const min = answerBlockMin(largePrint);
  const cols = contentW >= min.w * 2 ? 2 : 1;
  const rows = contentH >= min.h * 2 ? 2 : 1;
  return { cols, rows, perPage: cols * rows };
}

export function planBook(opts) {
  const trim = TRIMS[opts.trimId] || TRIMS.letter;
  const bleed = opts.bleed !== false;
  const largePrint = !!opts.largePrint;
  const count = Math.max(1, opts.count | 0);
  const passes = [];

  /* Start at the smallest legal gutter and only ever grow. A wider gutter
     narrows the content box, which can only add pages, never remove them, so
     the sequence is monotone and settles in one or two passes. */
  let gutterIn = 0.375;
  let plan = null;

  for (let pass = 1; pass <= 3; pass += 1) {
    plan = compose({ trim, bleed, largePrint, count, gutterIn, opts });
    const wanted = gutterFor(plan.pageCount);
    passes.push({ pass, pages: plan.pageCount, gutter: gutterIn, wanted });
    if (wanted === gutterIn) break;
    if (pass === 3) {
      gutterIn = Math.max(gutterIn, wanted);
      plan = compose({ trim, bleed, largePrint, count, gutterIn, opts });
      passes.push({ pass: 4, pages: plan.pageCount, gutter: gutterIn, wanted: gutterIn, forced: true });
      break;
    }
    gutterIn = wanted;
  }

  const tier = gutterTierFor(plan.pageCount);
  const box = pageBoxPt(trim, bleed);
  const rect = contentRect(1, trim, bleed, gutterIn);

  const warnings = [];
  if (plan.pageCount < PAGE_MIN) {
    warnings.push({
      id: 'under',
      text: `目前 ${plan.pageCount} 頁，KDP 平裝最少 ${PAGE_MIN} 頁。`,
      actions: ['pad', 'more'],
    });
  }
  if (plan.pageCount > PAGE_MAX) {
    warnings.push({
      id: 'over',
      text: `目前 ${plan.pageCount} 頁，KDP 平裝上限 ${PAGE_MAX} 頁。`,
      actions: ['split', 'fewer'],
    });
  }
  if (passes.length > 1) {
    const first = passes[0];
    const last = passes[passes.length - 1];
    warnings.push({
      id: 'reflow',
      kind: 'note',
      text: `頁數 ${last.pages} 落在 ${tier.label} 級距，gutter 由 ${first.gutter} in 改為 ${last.gutter} in，已重排（第 ${passes.length} 趟）`,
    });
  }

  return {
    trim,
    trimId: trim.id,
    bleed,
    largePrint,
    count,
    gutterIn,
    tier,
    passes,
    warnings,
    pages: plan.pages,
    pageCount: plan.pageCount,
    sections: plan.sections,
    answerGrid: plan.answerGrid,
    padded: plan.padded,
    geo: {
      trimW: trim.w,
      trimH: trim.h,
      pageWpt: box.w,
      pageHpt: box.h,
      pageWin: Math.round((box.w / PT_PER_IN) * 1000) / 1000,
      pageHin: Math.round((box.h / PT_PER_IN) * 1000) / 1000,
      bleedIn: bleed ? 0.125 : 0,
      outerIn: outerMinIn(bleed),
      gutterIn,
      contentWpt: rect.w,
      contentHpt: rect.h,
    },
  };
}

function compose({ trim, bleed, largePrint, count, gutterIn, opts }) {
  const rect = contentRect(1, trim, bleed, gutterIn);
  const answerGrid = answersPerPage(rect.w, rect.h, largePrint);
  const tocPerPage = TOC_PER_PAGE[trim.id] || 60;

  const pages = [];
  const push = (kind, extra = {}) => {
    const n = pages.length + 1;
    pages.push({ n, kind, side: n % 2 === 1 ? 'right' : 'left', ...extra });
    return pages[pages.length - 1];
  };

  push('title');
  const tocPages = Math.max(1, Math.ceil(count / tocPerPage));
  for (let i = 0; i < tocPages; i += 1) {
    push('toc', { from: i * tocPerPage + 1, to: Math.min(count, (i + 1) * tocPerPage) });
  }
  push('howto');

  const frontEnd = pages.length;
  for (let i = 0; i < count; i += 1) push('puzzle', { puzzleIndex: i });
  const puzzleEnd = pages.length;

  /* the divider must be a right-hand page */
  if (pages.length % 2 === 1) push('blank', { reason: 'parity' });
  push('divider');

  const answerPages = Math.ceil(count / answerGrid.perPage);
  for (let i = 0; i < answerPages; i += 1) {
    const from = i * answerGrid.perPage;
    push('answer', {
      answers: Array.from(
        { length: Math.min(answerGrid.perPage, count - from) },
        (_, k) => from + k,
      ),
    });
  }

  let padded = 0;
  while (pages.length < PAGE_MIN) {
    push('blank', { reason: 'minimum' });
    padded += 1;
  }
  if (pages.length % 2 === 1) {
    push('blank', { reason: 'even' });
    padded += 1;
  }

  return {
    pages,
    pageCount: pages.length,
    answerGrid,
    padded,
    sections: [
      { id: 'front', label: '前置', from: 1, to: frontEnd },
      { id: 'puzzle', label: '題目', from: frontEnd + 1, to: puzzleEnd },
      { id: 'answer', label: '解答', from: puzzleEnd + 1, to: pages.length },
    ],
  };
}

/** Content rectangle for a specific page, mirrored for verso pages. */
export function rectFor(page, plan) {
  return contentRect(page.n, plan.trim, plan.bleed, plan.gutterIn);
}
