/**
 * js/placement.js
 * Moving, scaling and rotating the design on the cloth.
 *
 * Nothing here moves DOM geometry to fake the result: every drag writes to the
 * placement state and the shader redraws. The frame is a readout of the truth,
 * not the truth itself, which is why it stays correct at any zoom or aspect.
 *
 * Escape during a drag restores the values the drag started from.
 */

import { drag, clamp } from './util/dom.js';
import { designExtent, placementBoxUV, fitScale } from './templates/index.js';

export class Placement {
  constructor({ stage, state, onChange }) {
    this.stage = stage;
    this.state = state;
    this.onChange = onChange;
    this.mode = null;
    this._start = null;

    const frame = stage.pframe;

    this._drag = drag(frame, {
      start: (ev) => {
        const grip = ev.target.dataset?.grip;
        this.mode = grip || 'move';
        this._start = {
          placement: { ...state.placement },
          uv: stage.toUV(ev.clientX, ev.clientY),
          shift: ev.shiftKey
        };
        frame.classList.add('is-active');
        stage.setDragging(true);
      },
      move: (ev) => this._move(ev),
      end: (ev, cancelled) => {
        frame.classList.remove('is-active');
        stage.setDragging(false);
        stage.showReadout('');
        if (cancelled && this._start) {
          Object.assign(state.placement, this._start.placement);
          this.onChange();
        }
        this.mode = null;
        this._start = null;
      }
    });

    frame.addEventListener('keydown', (ev) => this._keys(ev));
  }

  get designAspect() {
    return this.state.designAspect || 1;
  }

  _move(ev) {
    if (!this._start) return;
    const form = this.state.form;
    const now = this.stage.toUV(ev.clientX, ev.clientY);
    const p = this.state.placement;
    const s0 = this._start.placement;

    if (this.mode === 'move') {
      p.x = clamp(s0.x + (now.x - this._start.uv.x), -0.2, 1.2);
      p.y = clamp(s0.y + (now.y - this._start.uv.y), -0.2, 1.2);
      this.stage.showReadout(`x ${p.x.toFixed(3)}  y ${p.y.toFixed(3)}`);
    } else if (this.mode === 'rot') {
      const a0 = Math.atan2(this._start.uv.y - s0.y, this._start.uv.x - s0.x);
      const a1 = Math.atan2(now.y - p.y, now.x - p.x);
      let deg = s0.rotation + ((a1 - a0) * 180) / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      p.rotation = wrapDeg(deg);
      this.stage.showReadout(`${Math.round(p.rotation)} deg`);
    } else {
      // Corner scale, anchored on the centre. Equal ratio unless Shift.
      const d0 = Math.hypot((this._start.uv.x - s0.x) * form.aspect, this._start.uv.y - s0.y);
      const d1 = Math.hypot((now.x - p.x) * form.aspect, now.y - p.y);
      const k = d0 > 1e-4 ? d1 / d0 : 1;
      p.scale = clamp(s0.scale * k, 0.04, 4);
      this.stage.showReadout(`${Math.round(p.scale * 100)}%`);
    }
    this.onChange();
  }

  _keys(ev) {
    const p = this.state.placement;
    const step = ev.shiftKey ? 0.01 : 0.001;
    let handled = true;
    switch (ev.key) {
      case 'ArrowLeft': p.x -= step; break;
      case 'ArrowRight': p.x += step; break;
      case 'ArrowUp': p.y -= step; break;
      case 'ArrowDown': p.y += step; break;
      case '[': p.rotation = wrapDeg(p.rotation - (ev.shiftKey ? 15 : 1)); break;
      case ']': p.rotation = wrapDeg(p.rotation + (ev.shiftKey ? 15 : 1)); break;
      case '-': p.scale = clamp(p.scale - 0.01, 0.04, 4); break;
      case '=':
      case '+': p.scale = clamp(p.scale + 0.01, 0.04, 4); break;
      default: handled = false;
    }
    if (!handled) return;
    ev.preventDefault();
    this.onChange();
  }

  cancelDrag() {
    if (!this._drag.isDragging()) return false;
    this._drag.abort();
    return true;
  }

  fitToArea() {
    const form = this.state.form;
    this.state.placement.scale = fitScale(form, this.designAspect);
    this.state.placement.rotation = 0;
    const pa = { cx: form.print.cx / form.aspect, cy: form.print.cy };
    this.state.placement.x = pa.cx;
    this.state.placement.y = pa.cy;
    this.onChange();
  }

  box() {
    return placementBoxUV(this.state.form, this.state.placement, this.designAspect);
  }

  extent() {
    return designExtent(this.state.form, this.state.placement, this.designAspect);
  }
}

function wrapDeg(d) {
  let v = d % 360;
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return v;
}
