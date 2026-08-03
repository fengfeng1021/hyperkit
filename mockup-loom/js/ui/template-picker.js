/**
 * js/ui/template-picker.js
 * Six forms and their colourways. The thumbnail is the real render, shrunk,
 * not an illustration of it, so the picker cannot lie about what you will get.
 *
 * Generation is lazy and shows a determinate line while it runs. No template
 * is ever disabled: unlimited templates are the product promise.
 */

import { el, $$ } from '../util/dom.js';
import { FORMS, colorwaysFor, loadMaps, templateSlug } from '../templates/index.js';

export class TemplatePicker {
  constructor({ gridHost, swatchHost, state, onForm, onColorway, thumbnailFor }) {
    this.grid = gridHost;
    this.swatches = swatchHost;
    this.state = state;
    this.onForm = onForm;
    this.onColorway = onColorway;
    this.thumbnailFor = thumbnailFor;
    this.checked = new Set();
    this.mode = 'single';

    this.tiles = new Map();
    for (const form of FORMS) {
      const canvas = el('canvas', { width: 112, height: Math.round(112 / form.aspect) });
      const progress = el('span', { class: 'tpl-progress' });
      const tile = el('button', {
        type: 'button',
        class: 'tpl',
        role: 'option',
        tabindex: '-1',
        'data-id': form.id,
        'aria-selected': 'false'
      }, [canvas, progress, el('span', { class: 'tpl-name', text: form.label })]);

      tile.addEventListener('click', () => {
        if (this.mode === 'batch') this.toggleChecked(form.id);
        this.onForm(form.id);
      });
      this.grid.appendChild(tile);
      this.tiles.set(form.id, { tile, canvas, progress });
    }

    this.grid.addEventListener('keydown', (ev) => this._keys(ev, '.tpl', (n) => {
      if (this.mode === 'batch') this.toggleChecked(n.dataset.id);
      this.onForm(n.dataset.id);
    }));
    this.swatches.addEventListener('keydown', (ev) => this._keys(ev, '.swatch', (n) => {
      this.onColorway(n.dataset.id);
    }));
  }

  _keys(ev, sel, activate) {
    const items = $$(sel, ev.currentTarget);
    if (!items.length) return;
    let idx = items.findIndex((n) => n === document.activeElement);
    if (idx < 0) idx = items.findIndex((n) => n.getAttribute('aria-selected') === 'true');
    if (idx < 0) idx = 0;
    let next = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (idx + 1) % items.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (idx - 1 + items.length) % items.length;
    else if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); activate(items[idx]); return; }
    if (next < 0) return;
    ev.preventDefault();
    items[next].focus();
    activate(items[next]);
  }

  setMode(mode) {
    this.mode = mode;
    this.renderSelection();
  }

  toggleChecked(id) {
    if (this.checked.has(id)) this.checked.delete(id);
    else this.checked.add(id);
    this.renderSelection();
  }

  setAllChecked(on) {
    this.checked = on ? new Set(FORMS.map((f) => f.id)) : new Set();
    this.renderSelection();
  }

  renderSelection() {
    for (const [id, t] of this.tiles) {
      const selected = id === this.state.formId;
      t.tile.setAttribute('aria-selected', String(selected));
      t.tile.tabIndex = selected ? 0 : -1;
      let tick = t.tile.querySelector('.tick');
      if (this.mode === 'batch') {
        if (!tick) {
          tick = el('span', { class: 'tick' });
          t.tile.appendChild(tick);
        }
        tick.style.display = 'flex';
        tick.dataset.on = String(this.checked.has(id));
      } else if (tick) {
        tick.style.display = 'none';
      }
    }
    this.renderSwatches();
  }

  renderSwatches() {
    const form = FORMS.find((f) => f.id === this.state.formId);
    const list = colorwaysFor(form);
    this.swatches.textContent = '';
    for (const cw of list) {
      const btn = el('button', {
        type: 'button',
        class: 'swatch',
        role: 'option',
        'data-id': cw.id,
        tabindex: cw.id === this.state.colorwayId ? '0' : '-1',
        'aria-selected': String(cw.id === this.state.colorwayId),
        'aria-label': cw.label,
        title: cw.label,
        onclick: () => this.onColorway(cw.id)
      });
      btn.style.backgroundColor = cw.hex;
      this.swatches.appendChild(btn);
    }
  }

  /** Ensure a form's maps exist, showing the determinate line while they build. */
  async ensureMaps(form) {
    const t = this.tiles.get(form.id);
    const maps = await loadMaps(form, (p) => {
      if (t) t.progress.style.width = `${Math.round(p * 100)}%`;
    });
    if (t) t.progress.style.width = '0%';
    return maps;
  }

  /** Repaint one tile from the real renderer. */
  async refreshThumb(form, cw) {
    const t = this.tiles.get(form.id);
    if (!t) return;
    const shot = await this.thumbnailFor(form, cw);
    if (!shot) return;
    const ctx = t.canvas.getContext('2d');
    t.canvas.height = Math.round(t.canvas.width / form.aspect);
    ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(shot, 0, 0, t.canvas.width, t.canvas.height);
  }

  checkedTemplates() {
    const out = [];
    for (const form of FORMS) {
      if (!this.checked.has(form.id)) continue;
      const cw = colorwaysFor(form).find((c) => c.id === this.state.colorwayByForm?.[form.id])
        || colorwaysFor(form).find((c) => c.id === form.defaultColorway)
        || colorwaysFor(form)[0];
      out.push({ form, cw, id: templateSlug(form, cw) });
    }
    return out;
  }
}
