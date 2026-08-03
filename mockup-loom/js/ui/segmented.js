/**
 * js/ui/segmented.js
 * One tab stop, arrows move and apply immediately. There is no "press Enter
 * to confirm" step, because every one of these choices is instantly visible
 * on the stage and instantly reversible.
 *
 * The selection marker is a real element whose transform the motion pass will
 * tween. Its position is correct without any script running the tween.
 */

import { el } from '../util/dom.js';

export class Segmented {
  constructor(host, { name, options, value, onChange, labelledBy }) {
    this.host = host;
    this.options = options;
    this.value = value ?? options[0].id;
    this.onChange = onChange;

    this.root = el('div', {
      class: 'seg',
      role: 'radiogroup',
      'aria-label': labelledBy ? null : name,
      'aria-labelledby': labelledBy || null
    });
    this.marker = el('span', { class: 'seg-marker' });
    this.root.appendChild(this.marker);

    this.buttons = options.map((opt, i) =>
      el('button', {
        type: 'button',
        class: 'seg-item',
        role: 'radio',
        'aria-checked': String(opt.id === this.value),
        tabindex: opt.id === this.value ? '0' : '-1',
        'data-id': opt.id,
        text: opt.label,
        onclick: () => this.set(opt.id, true)
      })
    );
    this.buttons.forEach((b) => this.root.appendChild(b));

    this.root.addEventListener('keydown', (ev) => this._keys(ev));
    host.appendChild(this.root);

    this._ro = new ResizeObserver(() => this._place());
    this._ro.observe(this.root);
    requestAnimationFrame(() => this._place());
  }

  _keys(ev) {
    const idx = this.options.findIndex((o) => o.id === this.value);
    let next = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (idx + 1) % this.options.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (idx - 1 + this.options.length) % this.options.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = this.options.length - 1;
    if (next < 0) return;
    ev.preventDefault();
    this.set(this.options[next].id, true);
    this.buttons[next].focus();
  }

  set(id, emit) {
    if (this.disabled) return;
    this.value = id;
    this.buttons.forEach((b) => {
      const on = b.dataset.id === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    this._place();
    if (emit && this.onChange) this.onChange(id);
  }

  setDisabled(on, reason) {
    this.disabled = on;
    this.root.setAttribute('aria-disabled', String(!!on));
    this.buttons.forEach((b) => { b.disabled = !!on; });
    if (reason) this.root.setAttribute('aria-description', reason);
  }

  /** Marker geometry. The motion pass replaces the jump with a tween. */
  _place() {
    const idx = this.buttons.findIndex((b) => b.dataset.id === this.value);
    if (idx < 0) return;
    const btn = this.buttons[idx];
    this.marker.style.width = `${btn.offsetWidth}px`;
    this.marker.style.transform = `translateX(${btn.offsetLeft}px)`;
  }

  destroy() {
    this._ro.disconnect();
  }
}
