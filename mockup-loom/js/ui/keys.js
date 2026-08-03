/**
 * js/ui/keys.js
 * The keyboard map. This is the only dialog in the build, therefore the only
 * place that traps focus. It is opened with ? and closed with Escape.
 */

import { el, $$ } from '../util/dom.js';

export const SHORTCUTS = [
  ['W', '撥動平貼／服貼開關'],
  ['F', '按住偷看平貼的樣子'],
  ['1 - 6', '換版型'],
  ['B', '輪流切換疊色方式'],
  ['E', '輸出 ZIP'],
  ['R', '開始算這批'],
  ['?', '開關這張表'],
  ['Esc', '退回上一層']
];

export class KeyboardOverlay {
  constructor(root, closeButton) {
    this.root = root;
    this.lastFocus = null;
    const list = root.querySelector('#keys-list');
    for (const [key, what] of SHORTCUTS) {
      list.appendChild(el('dt', { text: key }));
      list.appendChild(el('dd', { text: what }));
    }
    closeButton.addEventListener('click', () => this.close());
    root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Tab') return;
      const focusables = $$('button, [href], input, select, [tabindex]:not([tabindex="-1"])', root)
        .filter((n) => n.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (ev.shiftKey && document.activeElement === first) { last.focus(); ev.preventDefault(); }
      else if (!ev.shiftKey && document.activeElement === last) { first.focus(); ev.preventDefault(); }
    });
  }

  get isOpen() { return !this.root.hidden; }

  open() {
    this.lastFocus = document.activeElement;
    this.root.hidden = false;
    this.root.querySelector('button')?.focus();
  }

  close() {
    this.root.hidden = true;
    this.lastFocus?.focus?.();
  }

  toggle() {
    if (this.isOpen) this.close(); else this.open();
  }
}
