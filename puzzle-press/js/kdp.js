/* Amazon KDP paperback interior constants.
   Source: KDP Help, "Set Trim Size, Bleed, and Margins" (topic GVBQ3CMEQW3W2VL6),
   re-checked 2026-08. Every number the press check quotes comes from here, and
   the press check quotes the bracket it landed in, not just the value. */

export const PT_PER_IN = 72;

export const PAGE_MIN = 24;
export const PAGE_MAX = 828;

export const TRIMS = {
  letter: { id: 'letter', w: 8.5, h: 11, label: '8.5 × 11 in' },
  digest: { id: 'digest', w: 6, h: 9, label: '6 × 9 in' },
};

/** Inside (gutter) margin brackets. Page count only; trim size is irrelevant. */
export const GUTTER_TIERS = [
  { min: 24, max: 150, gutter: 0.375, label: '24-150' },
  { min: 151, max: 300, gutter: 0.5, label: '151-300' },
  { min: 301, max: 500, gutter: 0.625, label: '301-500' },
  { min: 501, max: 700, gutter: 0.75, label: '501-700' },
  { min: 701, max: 828, gutter: 0.875, label: '701-828' },
];

/** Outside / top / bottom minimum. With bleed KDP adds 0.125 in on those edges. */
export const OUTER_MIN_NO_BLEED = 0.25;
export const OUTER_MIN_BLEED = 0.375;
export const BLEED = 0.125;

export function gutterTierFor(pages) {
  const clamped = Math.max(PAGE_MIN, Math.min(PAGE_MAX, pages));
  return GUTTER_TIERS.find((t) => clamped >= t.min && clamped <= t.max) || GUTTER_TIERS[GUTTER_TIERS.length - 1];
}

export function gutterFor(pages) {
  return gutterTierFor(pages).gutter;
}

/** Trimming removes 0.125 in from top, bottom and outside only. The spine edge
    is not trimmed, so the width grows by one bleed and the height by two. */
export function pageBoxIn(trim, bleed) {
  return bleed
    ? { w: trim.w + BLEED, h: trim.h + BLEED * 2 }
    : { w: trim.w, h: trim.h };
}

export function pageBoxPt(trim, bleed) {
  const box = pageBoxIn(trim, bleed);
  return { w: round2(box.w * PT_PER_IN), h: round2(box.h * PT_PER_IN) };
}

export function outerMinIn(bleed) {
  return bleed ? OUTER_MIN_BLEED : OUTER_MIN_NO_BLEED;
}

/** The live content rectangle for one physical page, in PDF points, origin
    bottom-left (pdf-lib convention). Odd pages are right-hand pages, so their
    gutter is on the left and their bleed is on the right. Even pages mirror. */
export function contentRect(pageNumber, trim, bleed, gutterIn) {
  const box = pageBoxPt(trim, bleed);
  const bleedPt = bleed ? BLEED * PT_PER_IN : 0;
  const outerPt = outerMinIn(bleed) * PT_PER_IN;
  const gutterPt = gutterIn * PT_PER_IN;
  const right = pageNumber % 2 === 1;
  const left = right ? gutterPt : outerPt;
  const rightMargin = right ? outerPt : gutterPt;
  return {
    x: left,
    y: outerPt,
    w: round2(box.w - left - rightMargin),
    h: round2(box.h - outerPt * 2),
    pageW: box.w,
    pageH: box.h,
    bleedPt,
    outerPt,
    gutterPt,
    gutterSide: right ? 'left' : 'right',
  };
}

/** Trim box inside the PDF page, in points. Used by the inspector overlay. */
export function trimRect(pageNumber, trim, bleed) {
  const box = pageBoxPt(trim, bleed);
  if (!bleed) return { x: 0, y: 0, w: box.w, h: box.h, pageW: box.w, pageH: box.h };
  const b = BLEED * PT_PER_IN;
  const right = pageNumber % 2 === 1;
  return {
    x: right ? 0 : b,
    y: b,
    w: box.w - b,
    h: box.h - b * 2,
    pageW: box.w,
    pageH: box.h,
  };
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function inchLabel(n) {
  return `${Number(n.toFixed(3))} in`;
}
