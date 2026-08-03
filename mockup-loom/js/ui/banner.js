/**
 * js/ui/banner.js
 * A banner is a standing condition, not an event. Reduced mode is not red,
 * because losing displacement is a smaller machine, not a mistake.
 */

import { el } from '../util/dom.js';

export class BannerHost {
  constructor(host) {
    this.host = host;
    this.current = null;
  }

  show({ id, text, tone = 'info', detail = null, detailLabel = '差在哪裡', action = null }) {
    this.clear();
    const node = el('div', { class: `banner${tone === 'error' ? ' is-error' : ''}`, 'data-id': id || '' });
    node.appendChild(el('p', { text }));

    if (detail) {
      const box = el('div', { class: 'banner-detail', hidden: true });
      for (const line of detail) box.appendChild(el('p', { text: line }));
      const toggle = el('button', {
        type: 'button',
        class: 'btn btn-text',
        text: detailLabel,
        'aria-expanded': 'false',
        onclick: () => {
          const open = box.hidden;
          box.hidden = !open;
          toggle.setAttribute('aria-expanded', String(open));
        }
      });
      node.appendChild(toggle);
      node.appendChild(box);
    }

    if (action) {
      node.appendChild(el('button', {
        type: 'button', class: 'btn btn-text', text: action.label, onclick: action.run
      }));
    }

    this.host.appendChild(node);
    this.current = node;
    return node;
  }

  clear() {
    this.host.textContent = '';
    this.current = null;
  }

  autoClearAfter(ms) {
    const node = this.current;
    setTimeout(() => { if (this.current === node) this.clear(); }, ms);
  }
}
