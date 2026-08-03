/* icons.js
   自繪 SVG 圖示系統。stroke-width 1.5 / stroke-linecap square / currentColor。
   零 emoji、零 Unicode 字元當圖示。
   11 個功能圖示 + 6 個分類圖示，全部畫在 24x24 網格上。 */

const PATHS = {
  /* ---- 功能圖示（11） ---- */
  file:     '<path d="M14 3H6v18h12V7l-4-4Z"/><path d="M14 3v4h4"/>',
  folder:   '<path d="M3 6h6l2 3h10v11H3V6Z"/>',
  download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  close:    '<path d="M5 5l14 14"/><path d="M19 5L5 19"/>',
  expand:   '<path d="M6 9l6 6 6-6"/>',
  collapse: '<path d="M6 15l6-6 6 6"/>',
  arrow:    '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
  search:   '<path d="M4 4h11v11H4z"/><path d="M15 15l5 5"/>',
  info:     '<path d="M3 3h18v18H3z"/><path d="M12 10v7"/><path d="M12 6.5v1.5"/>',
  alert:    '<path d="M3 3h18v18H3z"/><path d="M12 7v7"/><path d="M12 16.5V18"/>',
  barcode:  '<path d="M4 4v16"/><path d="M7.5 4v16"/><path d="M11 4v16"/><path d="M14.5 4v11"/><path d="M20 4v16"/>',

  /* ---- 分類圖示（6） ---- */
  cvs:   '<path d="M4 9h16v11H4z"/><path d="M4 9l2-4h12l2 4"/><path d="M9 20v-6h6v6"/>',
  mart:  '<path d="M3 5h3l2.5 10h9L20 8H7"/><path d="M9 19h.01"/><path d="M17 19h.01"/><path d="M8 18.5h2v2H8z"/><path d="M16 18.5h2v2h-2z"/>',
  food:  '<path d="M6 3v8a2 2 0 0 0 4 0V3"/><path d="M8 11v10"/><path d="M17 3c-1.5 2-2 4-2 6h4c0-2-.5-4-2-6Z"/><path d="M17 9v12"/>',
  trans: '<path d="M4 6h16v9H4z"/><path d="M4 11h16"/><path d="M7 15v3"/><path d="M17 15v3"/><path d="M8 8.5h3"/>',
  drug:  '<path d="M5 5h14v14H5z"/><path d="M12 8v8"/><path d="M8 12h8"/>',
  shop:  '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
};

/**
 * 產生一個圖示的 SVG 字串。
 * @param {string} name PATHS 的 key
 * @param {number} size px
 */
export function icon(name, size = 16) {
  const d = PATHS[name];
  if (!d) return '';
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" `
    + 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" '
    + `stroke-linejoin="miter" aria-hidden="true" focusable="false">${d}</svg>`;
}

/** wordmark 旁的 5 線條碼標記（粗細不等，是自繪不是字元） */
export function barcodeMark(h = 14) {
  const bars = [
    [0, 1.6], [2.6, 1], [4.8, 2.4], [8.4, 1], [10.6, 1.8],
  ];
  const w = 12.4;
  const rects = bars
    .map(([x, bw]) => `<rect x="${x}" y="0" width="${bw}" height="16" />`)
    .join('');
  return `<svg class="barcode-mark" viewBox="0 0 ${w} 16" width="${(w / 16) * h}" height="${h}" `
    + `fill="currentColor" aria-hidden="true" focusable="false">${rects}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS);
