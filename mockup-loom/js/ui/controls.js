/**
 * js/ui/controls.js
 * NumberField and Slider.
 *
 * The number field has press-and-hold repeat on both step zones because
 * nudging a placement by one percent forty times is a real thing a seller
 * does. The slider handle is square: it marks a value on a scale, it is not
 * a grip you turn.
 */

import { el, clamp } from '../util/dom.js';
import { icon } from './icons.js';

export class NumberField {
  constructor(host, { label, value, min, max, step = 1, precision = 0, suffix = '', onChange }) {
    this.min = min; this.max = max; this.step = step;
    this.precision = precision;
    this.suffix = suffix;
    this.onChange = onChange;
    this.value = value;

    this.input = el('input', {
      class: 'nf-input num',
      type: 'text',
      inputmode: 'decimal',
      'aria-label': label,
      value: this._text(value)
    });

    this.down = el('button', { type: 'button', class: 'nf-step', 'aria-label': `${label} down` }, [icon('remove')]);
    this.up = el('button', { type: 'button', class: 'nf-step', 'aria-label': `${label} up` }, [icon('add')]);

    this.root = el('div', { class: 'nf' }, [
      el('span', { class: 'nf-label', text: label }),
      el('div', { class: 'nf-body' }, [this.down, this.input, this.up])
    ]);
    host.appendChild(this.root);

    this._repeat(this.down, -1);
    this._repeat(this.up, +1);

    this.input.addEventListener('change', () => this._commit());
    this.input.addEventListener('blur', () => this._commit());
    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { this._commit(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { this.nudge(ev.shiftKey ? 10 : 1); ev.preventDefault(); }
      else if (ev.key === 'ArrowDown') { this.nudge(ev.shiftKey ? -10 : -1); ev.preventDefault(); }
    });
  }

  _text(v) {
    return Number(v).toFixed(this.precision) + this.suffix;
  }

  _commit() {
    const raw = parseFloat(String(this.input.value).replace(/[^0-9.+-]/g, ''));
    if (Number.isNaN(raw)) { this.set(this.value); return; }
    this.set(raw, true);
  }

  _repeat(button, dir) {
    let timer = null;
    let delay = null;
    const stop = () => { clearInterval(timer); clearTimeout(delay); timer = null; };
    button.addEventListener('pointerdown', (ev) => {
      button.setPointerCapture(ev.pointerId);
      this.nudge(dir);
      delay = setTimeout(() => {
        timer = setInterval(() => this.nudge(dir), 45);
      }, 380);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((e) => button.addEventListener(e, stop));
  }

  nudge(units) {
    this.set(this.value + this.step * units, true);
  }

  set(v, emit) {
    const next = clamp(Number(v), this.min, this.max);
    const changed = next !== this.value;
    this.value = next;
    this.input.value = this._text(next);
    if (emit && changed && this.onChange) this.onChange(next);
  }

  setDisabled(on) {
    this.input.disabled = !!on;
    this.down.disabled = !!on;
    this.up.disabled = !!on;
    this.root.setAttribute('aria-disabled', String(!!on));
  }
}

export class Slider {
  constructor(host, { label, value, min, max, step = 1, suffix = '', onChange, onCommit }) {
    this.min = min; this.max = max; this.step = step;
    this.suffix = suffix;
    this.onChange = onChange;
    this.onCommit = onCommit;
    this.value = value;

    this.fill = el('span', { class: 'slider-fill' });
    this.knob = el('span', { class: 'slider-knob' });
    this.readout = el('span', { class: 'slider-value num' });

    this.track = el('div', {
      class: 'slider-track',
      role: 'slider',
      tabindex: '0',
      'aria-label': label,
      'aria-valuemin': String(min),
      'aria-valuemax': String(max)
    }, [el('span', { class: 'slider-rail' }), this.fill, this.knob]);

    this.root = el('div', { class: 'slider' }, [
      el('span', { class: 'slider-label', text: label }),
      this.track,
      this.readout
    ]);
    host.appendChild(this.root);

    let dragging = false;
    const fromEvent = (ev) => {
      const r = this.track.getBoundingClientRect();
      const t = clamp((ev.clientX - r.left) / (r.width || 1), 0, 1);
      const raw = this.min + t * (this.max - this.min);
      this.set(Math.round(raw / this.step) * this.step, true);
    };
    this.track.addEventListener('pointerdown', (ev) => {
      if (this.disabled) return;
      dragging = true;
      this.track.setPointerCapture(ev.pointerId);
      fromEvent(ev);
      ev.preventDefault();
    });
    this.track.addEventListener('pointermove', (ev) => { if (dragging) fromEvent(ev); });
    const end = () => { if (dragging) { dragging = false; this.onCommit?.(this.value); } };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);

    this.track.addEventListener('keydown', (ev) => {
      if (this.disabled) return;
      const big = ev.shiftKey ? 10 : 1;
      let next = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') next = this.value + this.step * big;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') next = this.value - this.step * big;
      else if (ev.key === 'Home') next = this.min;
      else if (ev.key === 'End') next = this.max;
      if (next === null) return;
      ev.preventDefault();
      this.set(next, true);
      this.onCommit?.(this.value);
    });

    this.set(value, false);
  }

  set(v, emit) {
    const next = clamp(Number(v), this.min, this.max);
    const changed = next !== this.value;
    this.value = next;
    const t = (next - this.min) / (this.max - this.min || 1);
    this.fill.style.width = `${t * 100}%`;
    this.knob.style.left = `${t * 100}%`;
    this.readout.textContent = Math.round(next) + this.suffix;
    this.track.setAttribute('aria-valuenow', String(Math.round(next)));
    this.track.setAttribute('aria-valuetext', Math.round(next) + this.suffix);
    if (emit && changed && this.onChange) this.onChange(next);
  }

  setDisabled(on) {
    this.disabled = !!on;
    this.root.setAttribute('aria-disabled', String(!!on));
    this.track.tabIndex = on ? -1 : 0;
  }
}
