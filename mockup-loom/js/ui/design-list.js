/**
 * js/ui/design-list.js
 * Thumbnails on a checker so a transparent PNG reads as transparent. The
 * checker is painted into each canvas rather than set as a CSS background,
 * because a gradient has no business being in this stylesheet.
 *
 * One tab stop. Arrows move, Space selects or ticks, Delete removes with an
 * undo toast rather than a confirmation dialog.
 */

import { el, $$, paintChecker, cssVar } from '../util/dom.js';
import { truncate } from '../designs.js';
import { icon } from './icons.js';

const THUMB_PX = 144;

export class DesignList {
  constructor(host, wrap, store, { onUse, onRemove, mode }) {
    this.host = host;
    this.wrap = wrap;
    this.store = store;
    this.onUse = onUse;
    this.onRemove = onRemove;
    this.mode = mode;

    host.addEventListener('keydown', (ev) => this._keys(ev));
    store.onChange(() => this.render());
  }

  setMode(mode) {
    this.mode = mode;
    this.render();
  }

  render() {
    const store = this.store;
    this.wrap.hidden = store.length === 0;
    this.host.textContent = '';

    for (const d of store.items) {
      const canvas = el('canvas', { width: THUMB_PX, height: THUMB_PX });
      const ctx = canvas.getContext('2d');
      paintChecker(ctx, THUMB_PX, THUMB_PX, 12, cssVar('--checker-a'), cssVar('--checker-b'));
      const k = Math.min(THUMB_PX / d.width, THUMB_PX / d.height) * 0.92;
      const w = d.width * k;
      const h = d.height * k;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(d.source, (THUMB_PX - w) / 2, (THUMB_PX - h) / 2, w, h);

      const tick = el('span', { class: 'tick', 'data-on': String(store.checked.has(d.id)) }, [icon('check')]);

      const item = el('li', {
        class: `dthumb${d.soft ? ' is-soft' : ''}`,
        role: 'option',
        tabindex: '-1',
        'data-id': d.id,
        'aria-selected': String(store.selectedId === d.id),
        title: d.name
      }, [
        canvas,
        tick,
        el('span', { class: 'dthumb-name', text: truncate(d.name, 18) })
      ]);

      item.addEventListener('click', (ev) => {
        if (this.mode === 'batch') this.store.toggleCheck(d.id);
        else this.onUse(d.id);
        ev.preventDefault();
      });
      this.host.appendChild(item);
    }
  }

  _keys(ev) {
    const items = $$('.dthumb', this.host);
    if (!items.length) return;
    let idx = items.findIndex((n) => n === document.activeElement);
    if (idx < 0) idx = items.findIndex((n) => n.getAttribute('aria-selected') === 'true');
    if (idx < 0) idx = 0;

    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      const id = items[idx].dataset.id;
      if (this.mode === 'batch') this.store.toggleCheck(id);
      else this.onUse(id);
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      this.onRemove(items[idx].dataset.id);
    }
  }

  setBusy(on) {
    this.host.setAttribute('aria-busy', String(!!on));
  }
}
