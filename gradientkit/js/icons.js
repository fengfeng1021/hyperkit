/* ==========================================================================
   GradientKit - icons.js
   Lucide path data (ISC licence, credited in README.md), copied inline so the
   project has zero runtime dependencies.

   One family, one stroke weight, no exceptions, zero emoji anywhere in the
   product. Every glyph is authored for a 0 0 24 24 viewBox and rendered at
   16px with stroke-width 1.5.
   ========================================================================== */

export const ICON_SET = {
  copy:
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check:
    '<path d="M20 6 9 17l-5-5"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<path d="M7 10l5 5 5-5"/>' +
    '<path d="M12 15V3"/>',
  link:
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  'undo-2':
    '<path d="M9 14 4 9l5-5"/>' +
    '<path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  'redo-2':
    '<path d="m15 14 5-5-5-5"/>' +
    '<path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
  plus:
    '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus:
    '<path d="M5 12h14"/>',
  pipette:
    '<path d="m2 22 1-1h3l9-9"/>' +
    '<path d="M3 21v-3l9-9"/>' +
    '<path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>',
  x:
    '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'chevron-down':
    '<path d="m6 9 6 6 6-6"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>' +
    '<circle cx="9" cy="9" r="2"/>' +
    '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  'alert-triangle':
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>' +
    '<path d="M12 9v4"/><path d="M12 17h.01"/>',
  bookmark:
    '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
};

const ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

/** Markup string for an icon. Content is authored here, never user input. */
export function iconMarkup(name, cls = 'gk-icon') {
  const body = ICON_SET[name];
  if (!body) return '';
  return `<svg class="${cls}" width="16" height="16" ${ATTRS}>${body}</svg>`;
}

/** Live SVG element, for callers that swap an icon in place. */
export function iconEl(name, cls = 'gk-icon') {
  const wrap = document.createElement('span');
  wrap.innerHTML = iconMarkup(name, cls);
  return wrap.firstElementChild;
}
