/**
 * js/ui/icons.js
 * Six icons, drawn here, one stroke weight, square caps, 24x24 box.
 * There are no emoji and no Unicode glyphs standing in for an icon anywhere
 * in this build. Square caps because the whole interface is guillotine cut.
 */

const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  add: ['M12 5v14', 'M5 12h14'],
  remove: ['M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  rotate: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 4v5h-5'],
  chevron: ['M9 6l6 6-6 6']
};

export function icon(name, label) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const d of PATHS[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

export const ICON_NAMES = Object.keys(PATHS);
