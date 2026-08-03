/**
 * js/stage.js
 * The render surface and everything drawn on top of it.
 *
 * The stage is the only exactly neutral surface in the build. Nothing here
 * tints it, nothing overlays it with colour, because the whole reason a
 * seller is here is to judge whether a green looks right on a grey shirt.
 *
 * Device pixel ratio drops to 1 while something is being dragged and climbs
 * back to min(dpr, 2) a moment after the drag ends.
 */

import { printUV } from './templates/index.js';

export class Stage {
  constructor(refs) {
    Object.assign(this, refs);
    this.form = null;
    this.dragging = false;
    this._settle = null;

    this._ro = new ResizeObserver(() => this.layout());
    this._ro.observe(this.stageEl);
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  setForm(form) {
    this.form = form;
    this.layout();
  }

  /** Fit the render box inside the stage padding, keeping the form's aspect. */
  layout() {
    if (!this.form) return;
    const box = this.stageEl.getBoundingClientRect();
    const style = getComputedStyle(this.stageEl);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availW = Math.max(40, box.width - padX);
    const availH = Math.max(40, box.height - padY);

    let w = availW;
    let h = w / this.form.aspect;
    if (h > availH) {
      h = availH;
      w = h * this.form.aspect;
    }
    this.innerEl.style.width = `${Math.round(w)}px`;
    this.innerEl.style.height = `${Math.round(h)}px`;

    const dpr = this.dragging ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    if (this.renderer) {
      this.renderer.resize(Math.round(w * dpr), Math.round(h * dpr));
      this.renderer.requestFrame();
    }
    this.placePrintBox();
  }

  placePrintBox() {
    if (!this.form) return;
    const pa = printUV(this.form);
    const s = this.printbox.style;
    s.left = `${pa.x * 100}%`;
    s.top = `${pa.y * 100}%`;
    s.width = `${pa.w * 100}%`;
    s.height = `${pa.h * 100}%`;
  }

  setDragging(on) {
    if (this.dragging === on) return;
    this.dragging = on;
    this.guides.hidden = !on;
    clearTimeout(this._settle);
    if (on) {
      this.layout();
    } else {
      // Come back to full resolution once the hand has stopped moving.
      this._settle = setTimeout(() => this.layout(), 120);
    }
  }

  setSeed(text) {
    this.seedEl.textContent = text;
  }

  showReadout(text) {
    this.readout.hidden = !text;
    if (text) this.readout.textContent = text;
  }

  /** Place the placement frame from a uv box plus rotation in degrees. */
  setFrame(box, rotationDeg, visible) {
    this.pframe.hidden = !visible;
    if (!visible) return;
    const s = this.pframe.style;
    s.left = `${box.x * 100}%`;
    s.top = `${box.y * 100}%`;
    s.width = `${box.w * 100}%`;
    s.height = `${box.h * 100}%`;
    s.transform = `rotate(${rotationDeg}deg)`;
  }

  /** Client point to uv, honouring the current render box. */
  toUV(clientX, clientY) {
    const r = this.innerEl.getBoundingClientRect();
    return {
      x: (clientX - r.left) / (r.width || 1),
      y: (clientY - r.top) / (r.height || 1),
      rect: r
    };
  }
}
