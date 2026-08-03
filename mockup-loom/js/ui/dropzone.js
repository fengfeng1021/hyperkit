/**
 * js/ui/dropzone.js
 * The whole window accepts a drop, not just the dashed box, because a seller
 * dragging fifty files from Explorer aims at the browser, not at a rectangle.
 *
 * Every failure is shown inline on the row for that file, with the file's own
 * name in the sentence and an action that actually resolves it. Fifty bad
 * files produce fifty rows and one summary line, never fifty toasts.
 */

import { el, $$ } from '../util/dom.js';
import { inspectFile, decodeFile, DesignError } from '../designs.js';

export class Dropzone {
  constructor({ zone, input, rowsHost, summaryEl, titleEl, onDesigns }) {
    this.zone = zone;
    this.input = input;
    this.rows = rowsHost;
    this.summary = summaryEl;
    this.title = titleEl;
    this.onDesigns = onDesigns;
    this.idleTitle = titleEl.textContent;
    this.skipped = 0;
    this.total = 0;
    this.filtering = false;
    this._depth = 0;

    zone.addEventListener('click', () => { if (!this.disabled) input.click(); });
    zone.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (!this.disabled) input.click(); }
    });
    input.addEventListener('change', () => {
      this.accept(input.files);
      input.value = '';
    });

    ['dragenter', 'dragover'].forEach((type) => {
      window.addEventListener(type, (ev) => {
        if (!hasFiles(ev)) return;
        ev.preventDefault();
        if (this.disabled) return;
        if (type === 'dragenter') this._depth++;
        document.body.classList.add('is-dragging');
        zone.classList.add('is-over');
        this.title.textContent = '放開就收進來';
      });
    });
    window.addEventListener('dragleave', (ev) => {
      if (!hasFiles(ev)) return;
      this._depth = Math.max(0, this._depth - 1);
      if (this._depth === 0) this._resetDrag();
    });
    window.addEventListener('drop', (ev) => {
      if (!hasFiles(ev)) return;
      ev.preventDefault();
      this._depth = 0;
      this._resetDrag();
      if (this.disabled) return;
      this.accept(ev.dataTransfer.files);
    });
  }

  _resetDrag() {
    document.body.classList.remove('is-dragging');
    this.zone.classList.remove('is-over');
    this.title.textContent = this.idleTitle;
  }

  setMobileCopy(on) {
    this.idleTitle = on ? '加入設計' : '設計拖到這裡';
    if (!this.zone.classList.contains('is-over')) this.title.textContent = this.idleTitle;
  }

  setDisabled(on, reason) {
    this.disabled = !!on;
    this.zone.setAttribute('aria-disabled', String(!!on));
    this.zone.tabIndex = on ? -1 : 0;
    if (on && reason) this.title.textContent = reason;
    else if (!on) this.title.textContent = this.idleTitle;
  }

  async accept(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    this.total += files.length;
    const made = [];
    for (const file of files) {
      const design = await this._one(file);
      if (design) made.push(design);
    }
    if (made.length) this.onDesigns(made);
    this._summarise();
  }

  async _one(file, opts = {}) {
    const row = this._row(file.name || 'file');
    row.progress(0.15);

    const pre = inspectFile(file);
    if (!pre.ok && !opts.force) {
      this.skipped++;
      row.fail(pre.message, pre.action ? [{
        label: pre.action.label,
        run: () => { row.remove(); this.skipped--; this._retry(file, { force: true }); }
      }] : []);
      return null;
    }

    row.progress(0.45);
    try {
      const design = await decodeFile(file, { downscale: !!opts.downscale });
      row.progress(1);
      if (design.soft) {
        row.warn(design.softNote);
      } else {
        row.remove();
      }
      return design;
    } catch (err) {
      this.skipped++;
      const action = err instanceof DesignError && err.action ? err.action : null;
      row.fail(err.message, action ? [{
        label: action.label,
        run: () => { row.remove(); this.skipped--; this._retry(file, { downscale: true, force: true }); }
      }] : []);
      return null;
    }
  }

  async _retry(file, opts) {
    const design = await this._one(file, opts);
    if (design) this.onDesigns([design]);
    this._summarise();
  }

  _row(name) {
    const nameEl = el('span', { class: 'file-name', text: name });
    const bar = el('span');
    const barWrap = el('span', { class: 'file-bar' }, [bar]);
    const msg = el('p', { class: 'file-msg', hidden: true });
    const actions = el('div', { class: 'file-actions' });
    const node = el('li', { class: 'file-row' }, [
      el('div', { class: 'file-row-top' }, [nameEl]),
      barWrap, msg, actions
    ]);
    this.rows.appendChild(node);

    const api = {
      node,
      progress(p) { bar.style.width = `${Math.round(p * 100)}%`; },
      remove() { node.remove(); },
      warn(text) {
        node.classList.add('is-warn');
        node.dataset.skipped = 'false';
        barWrap.remove();
        msg.textContent = text;
        msg.hidden = false;
        actions.appendChild(el('button', {
          type: 'button', class: 'btn btn-text', text: '知道了', onclick: () => node.remove()
        }));
      },
      fail(text, extra) {
        node.classList.add('is-error');
        node.dataset.skipped = 'true';
        barWrap.remove();
        msg.textContent = text;
        msg.hidden = false;
        for (const a of extra || []) {
          actions.appendChild(el('button', {
            type: 'button', class: 'btn btn-text', text: a.label, onclick: a.run
          }));
        }
        actions.appendChild(el('button', {
          type: 'button', class: 'btn btn-text', text: '移掉', onclick: () => { node.remove(); }
        }));
      }
    };
    return api;
  }

  _summarise() {
    const failedRows = $$('.file-row[data-skipped="true"]', this.rows);
    if (failedRows.length > 3) {
      this.summary.hidden = false;
      this.summary.textContent = '';
      this.summary.appendChild(document.createTextNode(
        `${this.total} 個檔案裡跳過了 ${failedRows.length} 個。`
      ));
      const btn = el('button', {
        type: 'button',
        class: 'btn btn-text',
        text: this.filtering ? '全部顯示' : '只看跳過的',
        onclick: () => { this.filtering = !this.filtering; this._applyFilter(); this._summarise(); }
      });
      this.summary.appendChild(btn);
    } else {
      this.summary.hidden = true;
    }
    this._applyFilter();
  }

  _applyFilter() {
    for (const row of $$('.file-row', this.rows)) {
      row.hidden = this.filtering && row.dataset.skipped !== 'true';
    }
  }
}

function hasFiles(ev) {
  const dt = ev.dataTransfer;
  if (!dt) return false;
  return Array.from(dt.types || []).includes('Files');
}
