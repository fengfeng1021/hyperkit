/* ==========================================================================
   Inspector. Takes over the floor rather than opening a modal, because
   checking an edge needs neither interruption nor protected focus, and the
   URL hash (#i/{id}) makes it linkable and back-button friendly.

   Everything in the measurement column is a value we actually computed.
   ========================================================================== */

import { $, el, clamp, fmtSeconds, fmtBytes } from './util.js';
import { featherMask, maskMetrics } from './chroma.js';
import { cutout } from './compose.js';

const VIEW_EDGE = 1024;

export class Inspector {
  constructor(root, deps) {
    this.root = root;
    this.deps = deps;                 // { queue, onClose, onRetry, onRemove, onChanged }
    this.item = null;
    this.bitmap = null;
    this.split = 50;
    this.zoomed = false;

    this.stage = $('#inspectorStage', root);
    this.plate = $('#inspectorPlate', root);
    this.original = $('#inspOriginal', root);
    this.result = $('#inspResult', root);
    this.handle = $('#inspHandle', root);
    this.zoomTag = $('#inspZoomTag', root);
    this.nameEl = $('#inspectorName', root);
    this.dimsEl = $('#inspectorDims', root);
    this.measure = $('#inspectorMeasure', root);
    this.feather = $('#inspFeather', root);
    this.featherOut = $('#inspFeatherOut', root);
    this.despill = $('#inspDespill', root);
    this.despillOut = $('#inspDespillOut', root);
    this.retryBtn = $('#inspRetry', root);
    this.removeBtn = $('#inspRemove', root);
    this.closeBtn = $('#inspClose', root);

    /* Motion layer may register a quickTo here. Until it does, the divider
       follows the pointer directly, which is correct, just not smoothed. */
    this.splitTo = null;

    this._wire();
  }

  _wire() {
    let dragging = false;

    const setFromPointer = (ev) => {
      const rect = this.stage.getBoundingClientRect();
      if (!rect.width) return;
      this.setSplit(((ev.clientX - rect.left) / rect.width) * 100);
    };

    this.handle.addEventListener('pointerdown', (ev) => {
      dragging = true;
      this.handle.setPointerCapture(ev.pointerId);
      this.stage.classList.add('is-dragging');
      ev.preventDefault();
    });
    this.handle.addEventListener('pointermove', (ev) => { if (dragging) setFromPointer(ev); });
    const stop = (ev) => {
      if (!dragging) return;
      dragging = false;
      this.stage.classList.remove('is-dragging');
      try { this.handle.releasePointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
    };
    this.handle.addEventListener('pointerup', stop);
    this.handle.addEventListener('pointercancel', stop);

    this.handle.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 10 : 2;
      if (ev.key === 'ArrowLeft') { this.setSplit(this.split - step); ev.preventDefault(); }
      if (ev.key === 'ArrowRight') { this.setSplit(this.split + step); ev.preventDefault(); }
      if (ev.key === 'Home') { this.setSplit(0); ev.preventDefault(); }
      if (ev.key === 'End') { this.setSplit(100); ev.preventDefault(); }
    });

    this.stage.addEventListener('click', (ev) => {
      if (ev.target.closest('.split-handle')) return;
      this.toggleZoom();
    });

    this.feather.addEventListener('input', () => {
      const v = Number(this.feather.value);
      this.featherOut.textContent = `${v} px`;
      this.feather.setAttribute('aria-valuetext', `${v} pixel${v === 1 ? '' : 's'}`);
      this.feather.style.setProperty('--fill', `${(v / 6) * 100}%`);
      if (this.item) { this.item.feather = v; this.repaint(); }
    });
    this.feather.addEventListener('change', () => this.deps.onChanged && this.deps.onChanged(this.item));

    this.despill.addEventListener('input', () => {
      const v = Number(this.despill.value);
      this.despillOut.textContent = `${v}%`;
      this.despill.setAttribute('aria-valuetext', `${v} percent`);
      this.despill.style.setProperty('--fill', `${v}%`);
      if (this.item) { this.item.despill = v / 100; this.repaint(); }
    });
    this.despill.addEventListener('change', () => this.deps.onChanged && this.deps.onChanged(this.item));

    for (const radio of this.root.querySelectorAll('input[name="matte"]')) {
      radio.addEventListener('change', () => this.setMatte(radio.value));
    }

    this.retryBtn.addEventListener('click', () => {
      if (!this.item) return;
      const next = this.item.mode === 'chroma-key' ? 'model' : 'chroma';
      this.deps.onRetry(this.item, next);
    });
    this.removeBtn.addEventListener('click', () => this.item && this.deps.onRemove(this.item));
    this.closeBtn.addEventListener('click', () => this.deps.onClose());
  }

  setSplit(pct) {
    this.split = clamp(pct, 0, 100);
    if (this.splitTo) this.splitTo(this.split);
    else this.stage.style.setProperty('--split', `${this.split}%`);
    this.handle.setAttribute('aria-valuenow', String(Math.round(this.split)));
    this.handle.setAttribute('aria-valuetext', `${Math.round(this.split)} percent`);
  }

  setMatte(value) {
    this.plate.style.background = '';
    this.plate.classList.remove('is-white', 'is-black');
    if (value === 'white') this.plate.style.background = 'rgb(255,255,255)';
    else if (value === 'black') this.plate.style.background = 'rgb(0,0,0)';
  }

  toggleZoom() {
    if (!this.item || !this.bitmap) return;
    this.zoomed = !this.zoomed;
    this.stage.classList.toggle('is-zoomed', this.zoomed);
    this.zoomTag.hidden = !this.zoomed;
    if (this.zoomed) {
      this.zoomTag.textContent = `1:1 · ${this.item.width} × ${this.item.height}`;
      for (const c of [this.original, this.result]) {
        c.style.width = `${this.viewW}px`;
        c.style.height = `${this.viewH}px`;
      }
    } else {
      for (const c of [this.original, this.result]) { c.style.width = ''; c.style.height = ''; }
    }
  }

  async open(item) {
    this.item = item;
    this.zoomed = false;
    this.stage.classList.remove('is-zoomed');
    this.zoomTag.hidden = true;

    this.nameEl.textContent = item.name;
    this.dimsEl.textContent = item.width
      ? `${item.width} × ${item.height} · ${fmtBytes(item.size)}`
      : fmtBytes(item.size);

    this.feather.value = String(item.feather);
    this.feather.dispatchEvent(new Event('input'));
    this.despill.value = String(Math.round(item.despill * 100));
    this.despill.dispatchEvent(new Event('input'));

    this.retryBtn.textContent = item.mode === 'chroma-key' ? 'Retry with the model' : 'Retry with chroma-key';
    this.setSplit(50);
    this.paintMeasure();

    if (this.bitmap) { try { this.bitmap.close(); } catch { /* already closed */ } this.bitmap = null; }

    try {
      const longest = Math.max(item.width || VIEW_EDGE, item.height || VIEW_EDGE);
      const edge = Math.min(VIEW_EDGE, longest);
      const opts = (item.width >= item.height)
        ? { resizeWidth: Math.round(edge) }
        : { resizeHeight: Math.round(edge) };
      this.bitmap = await createImageBitmap(item.file, { ...opts, resizeQuality: 'high' });
      this.viewW = this.bitmap.width;
      this.viewH = this.bitmap.height;
      this.repaint();
    } catch {
      this.viewW = 0; this.viewH = 0;
      this.nameEl.textContent = item.name;
      this.dimsEl.textContent = 'This photo could not be re-opened for inspection.';
    }
  }

  repaint() {
    if (!this.bitmap || !this.item) return;
    const w = this.viewW, h = this.viewH;

    this.original.width = w; this.original.height = h;
    const octx = this.original.getContext('2d');
    octx.clearRect(0, 0, w, h);
    octx.drawImage(this.bitmap, 0, 0, w, h);

    this.result.width = w; this.result.height = h;
    const rctx = this.result.getContext('2d');
    rctx.clearRect(0, 0, w, h);

    if (this.item.mask) {
      const alpha = featherMask(this.item.mask, this.item.tw, this.item.th, this.item.feather);
      const m = maskMetrics(alpha);
      this.item.coverage = m.coverage;
      this.item.soft = m.soft;
      const cut = cutout(this.bitmap, w, h, alpha, this.item.tw, this.item.th, {
        despill: this.item.despill, bg: this.item.bg,
      });
      rctx.drawImage(cut.canvas, 0, 0);
      cut.canvas.width = 1; cut.canvas.height = 1;
      this.paintMeasure();
    } else {
      rctx.drawImage(this.bitmap, 0, 0, w, h);
    }
  }

  paintMeasure() {
    const it = this.item;
    if (!it) return;
    const rows = [
      ['Mode', it.mode || 'not run yet', false],
      ['Time', it.ms ? fmtSeconds(it.ms) : 'not run yet', false],
      ['Coverage', `${(it.coverage * 100).toFixed(1)}%`, false],
      ['Soft pixels', `${(it.soft * 100).toFixed(1)}%`, it.soft > 0.06],
      ['Background', it.bgHex || 'not sampled', false],
    ];
    if (it.spread) rows.push(['Bg spread', it.spread.toFixed(1), it.spread > 12]);
    if (it.flagReason) rows.push(['Needs a look', it.flagReason, true]);
    if (it.error) rows.push(['Error', it.error, true]);

    this.measure.textContent = '';
    for (const [k, v, fault] of rows) {
      this.measure.append(el('div', { class: 'kv__row' }, [
        el('dt', { text: k }),
        el('dd', { class: fault ? 'is-fault' : '', text: String(v) }),
      ]));
    }
  }

  release() {
    if (this.bitmap) { try { this.bitmap.close(); } catch { /* already closed */ } this.bitmap = null; }
    this.item = null;
  }
}
