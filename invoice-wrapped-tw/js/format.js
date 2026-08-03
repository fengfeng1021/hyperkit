/* format.js
   所有輸出格式化。金額一律以「分」為單位的整數在內部流動，只在這裡除以 100。 */

const WEEKDAY = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

/** 12345600 -> "NT$123,456" */
export function money(cents, opts = {}) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = whole.toLocaleString('zh-TW');
  const tail = frac === 0 || opts.noCents ? '' : '.' + String(frac).padStart(2, '0');
  return `${sign}${opts.bare ? '' : 'NT$'}${body}${tail}`;
}

/** 只要數字本體，用於 canvas 排版 */
export function moneyBare(cents) {
  return money(cents, { bare: true, noCents: true });
}

export function int(n) {
  return Number(n || 0).toLocaleString('zh-TW');
}

export function pct(part, total, digits = 1) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(digits)}%`;
}

const pad = (n) => String(n).padStart(2, '0');

/** Date -> "03/14" */
export function md(d) {
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/** Date -> "2025/03/14" */
export function ymd(d) {
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/** Date -> "2025/03/14 21:33" */
export function ymdhm(d) {
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date -> "03/14（五）" */
export function mdw(d) {
  return `${md(d)}（${WEEKDAY[weekdayIndex(d)].slice(1)}）`;
}

/** 週一 = 0 */
export function weekdayIndex(d) {
  return (d.getDay() + 6) % 7;
}

export function weekdayName(i) {
  return WEEKDAY[i];
}

export function hourLabel(h) {
  return `${pad(h)}:00`;
}

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 月份標籤 1 -> "1 月" */
export function monthLabel(m) {
  return `${m + 1} 月`;
}
