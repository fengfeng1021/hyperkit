/* ==========================================================================
   format.js
   Parsing and formatting for a Traditional Chinese numeric interface.

   Parsing has to survive what people actually type into a phone at 11pm:
     1,050萬  1050 萬  １０５０萬  NT$10,500,000  1050万  一千零五十萬(no)
   Full-width digits, full-width comma, the 萬 and 億 multipliers, currency
   symbols and stray spaces are all tolerated. Chinese numerals are not
   parsed; that is a different problem and guessing would be worse.
   ========================================================================== */

const FULLWIDTH_DIGITS = '０１２３４５６７８９';

/** Normalise full-width digits, punctuation and whitespace to ASCII. */
export function normalizeDigits(raw) {
  let s = String(raw ?? '');
  s = s.replace(/[０-９]/g, (ch) => String(FULLWIDTH_DIGITS.indexOf(ch)));
  s = s.replace(/[，、]/g, ',');   // ，、  ->  ,
  s = s.replace(/[．。]/g, '.');   // ．。  ->  .
  s = s.replace(/[＋]/g, '+').replace(/[－−–—]/g, '-');
  s = s.replace(/[％]/g, '%');
  s = s.replace(/[　\s]/g, '');
  return s;
}

/**
 * Parse a user-typed number.
 * @returns {number|null} null when there is no number in there at all.
 */
export function parseNumber(raw) {
  let s = normalizeDigits(raw);
  if (!s) return null;

  s = s.replace(/NT\$?/gi, '').replace(/[$＄]/g, '').replace(/元|圓/g, '').replace(/%/g, '');

  let mult = 1;
  // 億 first: 1.2億 -> 120000000. 萬/万 second: 1050萬 -> 10500000.
  if (/[億亿]/.test(s)) { mult *= 1e8; s = s.replace(/[億亿]/g, ''); }
  if (/[萬万]/.test(s)) { mult *= 1e4; s = s.replace(/[萬万]/g, ''); }
  if (/[千仟]/.test(s)) { mult *= 1e3; s = s.replace(/[千仟]/g, ''); }

  s = s.replace(/,/g, '');

  const m = s.match(/-?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]) * mult;
  return Number.isFinite(n) ? n : null;
}

/** Clamp to a bound record and report whether clamping happened. */
export function clamp(value, bound) {
  if (!bound) return { value, clamped: false };
  let v = value;
  let clamped = false;
  if (v < bound.min) { v = bound.min; clamped = true; }
  if (v > bound.max) { v = bound.max; clamped = true; }
  return { value: v, clamped };
}

const groupFmt = new Intl.NumberFormat('zh-Hant-TW', { maximumFractionDigits: 0 });

/** 10500000 -> "10,500,000" (rounded to whole NTD, sign preserved). */
export function money(n) {
  if (!Number.isFinite(n)) return '-';
  const r = Math.round(n);
  return (r < 0 ? '-' : '') + groupFmt.format(Math.abs(r));
}

/** With the NT$ prefix, for prose. */
export function moneyNT(n) {
  if (!Number.isFinite(n)) return '-';
  return `NT$ ${money(n)}`;
}

/** Compact for axis labels: 1,250 萬 / 3.2 億. Never lies about magnitude. */
export function moneyShort(n) {
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(abs >= 1e9 ? 0 : 1)} 億`;
  if (abs >= 1e4) return `${sign}${groupFmt.format(Math.round(abs / 1e4))} 萬`;
  return `${sign}${groupFmt.format(Math.round(abs))}`;
}

export function pct(n, digits = 2) {
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(digits)}%`;
}

export function signed(n) {
  if (!Number.isFinite(n)) return '-';
  const r = Math.round(n);
  if (r === 0) return '0';
  return (r > 0 ? '+' : '-') + groupFmt.format(Math.abs(r));
}

/** 135 -> "第 11 年 3 個月" */
export function monthLabel(m) {
  const y = Math.floor(m / 12);
  const mm = m % 12;
  if (y === 0) return `第 ${mm} 個月`;
  if (mm === 0) return `第 ${y} 年`;
  return `第 ${y} 年 ${mm} 個月`;
}

/** 135 -> "11 年 3 月" (compact, for pills and chips) */
export function monthShort(m) {
  const y = Math.floor(m / 12);
  const mm = m % 12;
  return mm === 0 ? `${y} 年` : `${y} 年 ${mm} 月`;
}

/** Thousands separator for a live input, keeping a trailing decimal point. */
export function groupInput(n, digits = 0) {
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('zh-Hant-TW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export const fmt = {
  money, moneyNT, moneyShort, pct, signed, monthLabel, monthShort, groupInput,
};
