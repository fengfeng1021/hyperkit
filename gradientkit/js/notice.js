/* ==========================================================================
   GradientKit - notice.js
   The product's only messaging surface. No toasts, no modals, no queue.

   A notice sits in the flow between the Stage and the Track, so showing one
   shrinks the Stage instead of covering it. Maximum one at a time: a new
   notice replaces the current one.
   ========================================================================== */

import { iconMarkup } from './icons.js';

const KIND_ICON = {
  info: 'alert-triangle',
  image: 'image',
  saved: 'bookmark',
  link: 'link',
};

export function createNoticeHost(slot, liveRegions) {
  let current = null;
  let timer = 0;

  function clear() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (current) { current.remove(); current = null; }
    slot.classList.remove('is-active');
  }

  /**
   * @param {object} o
   * @param {string} o.message   One sentence. Names the problem and the recovery.
   * @param {'info'|'image'|'saved'|'link'} [o.kind]
   * @param {boolean} [o.assertive] Failure-class notices are announced assertively.
   * @param {{label:string, onClick:Function}} [o.action]
   * @param {number} [o.duration] Auto-dismiss in ms. Persistent when omitted.
   * @param {boolean} [o.persistent]
   */
  function show(o) {
    clear();
    const el = document.createElement('div');
    el.className = 'gk-notice';
    el.dataset.kind = o.kind || 'info';

    const icon = document.createElement('span');
    icon.className = 'gk-notice-icon';
    icon.innerHTML = iconMarkup(KIND_ICON[o.kind] || 'alert-triangle');
    el.appendChild(icon);

    const text = document.createElement('p');
    text.className = 'gk-notice-text';
    text.textContent = o.message;
    el.appendChild(text);

    if (o.action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gk-notice-action';
      btn.textContent = o.action.label;
      btn.addEventListener('click', () => o.action.onClick(el));
      el.appendChild(btn);
    }

    if (!o.persistent) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'gk-notice-close';
      close.innerHTML = `${iconMarkup('x')}<span class="gk-sr">Dismiss this message</span>`;
      close.addEventListener('click', clear);
      close.addEventListener('keydown', (e) => { if (e.key === 'Escape') clear(); });
      el.appendChild(close);
    }

    slot.appendChild(el);
    slot.classList.add('is-active');
    current = el;

    const region = o.assertive ? liveRegions.assertive : liveRegions.polite;
    if (region) region.textContent = o.message;

    if (o.duration) timer = setTimeout(clear, o.duration);
    return el;
  }

  return { show, clear, get element() { return current; } };
}
