/**
 * js/ui/light-dial.js
 * Azimuth as a dial, because a photographer thinks about a key light in
 * degrees around the subject, not as a number in a box.
 *
 * Twelve ticks, north long. The handle is round: it is one of exactly two
 * grips in this interface, and the token file documents both.
 * Dragging renders live. Escape restores the value the drag started from.
 */

import { el, drag } from '../util/dom.js';

const NS = 'http://www.w3.org/2000/svg';

export class LightDial {
  constructor(host, { value = 315, onChange, onCommit }) {
    this.value = value;
    this.onChange = onChange;
    this.onCommit = onCommit;

    this.root = el('div', {
      class: 'dial',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Azimuth',
      'aria-valuemin': '0',
      'aria-valuemax': '359'
    });

    this.root.appendChild(this._face());
    this.grip = el('span', { class: 'dial-grip' });
    this.readout = el('span', { class: 'dial-readout' });
    this.root.appendChild(this.grip);
    this.root.appendChild(this.readout);
    host.appendChild(this.root);

    this._startValue = value;
    this._drag = drag(this.root, {
      start: (ev) => {
        if (this.disabled) return;
        this._startValue = this.value;
        this.root.classList.add('is-dragging');
        this._fromEvent(ev);
      },
      move: (ev) => { if (!this.disabled) this._fromEvent(ev); },
      end: (ev, cancelled) => {
        this.root.classList.remove('is-dragging');
        if (cancelled) this.set(this._startValue, true);
        this.onCommit?.(this.value);
      }
    });

    this.root.addEventListener('keydown', (ev) => {
      if (this.disabled) return;
      const step = ev.shiftKey ? 1 : 5;
      let next = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') next = this.value + step;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') next = this.value - step;
      else if (ev.key === 'Home') next = 315;
      if (next === null) return;
      ev.preventDefault();
      this.set(next, true);
      this.onCommit?.(this.value);
    });

    this.set(value, false);
  }

  _face() {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');

    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', '50');
    ring.setAttribute('cy', '50');
    ring.setAttribute('r', '44');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'currentColor');
    ring.setAttribute('stroke-width', '0.7');
    ring.setAttribute('opacity', '0.28');
    svg.appendChild(ring);

    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * (Math.PI / 180);
      const long = i === 0;
      const r1 = 44;
      const r2 = 44 - (long ? 8 : 4);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', (50 + Math.cos(a) * r1).toFixed(2));
      line.setAttribute('y1', (50 + Math.sin(a) * r1).toFixed(2));
      line.setAttribute('x2', (50 + Math.cos(a) * r2).toFixed(2));
      line.setAttribute('y2', (50 + Math.sin(a) * r2).toFixed(2));
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', long ? '1.2' : '0.7');
      line.setAttribute('opacity', '0.5');
      svg.appendChild(line);
    }

    // The beam: a faint wedge showing where the light is coming from. It is
    // drawn once pointing north and then rotated, so nothing rebuilds path
    // data on a pointer move and the motion layer can tween one number.
    this.beam = document.createElementNS(NS, 'path');
    this.beam.setAttribute('fill', 'currentColor');
    this.beam.setAttribute('opacity', '0.12');
    const spread = 22 * (Math.PI / 180);
    const north = -Math.PI / 2;
    const p1 = [50 + Math.cos(north - spread) * 44, 50 + Math.sin(north - spread) * 44];
    const p2 = [50 + Math.cos(north + spread) * 44, 50 + Math.sin(north + spread) * 44];
    this.beam.setAttribute('d',
      `M50 50 L${p1[0].toFixed(2)} ${p1[1].toFixed(2)} A44 44 0 0 1 ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} Z`);
    this.beam.style.transformOrigin = '50px 50px';
    svg.appendChild(this.beam);

    svg.style.color = 'var(--grey-500)';
    return svg;
  }

  _fromEvent(ev) {
    const r = this.root.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2);
    const dy = ev.clientY - (r.top + r.height / 2);
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    this.set(deg, true);
  }

  set(v, emit) {
    let next = Math.round(v) % 360;
    if (next < 0) next += 360;
    const changed = next !== this.value;
    this.value = next;

    this.paint(next);

    this.readout.textContent = `${String(next).padStart(3, '0')}`;
    this.root.setAttribute('aria-valuenow', String(next));
    this.root.setAttribute('aria-valuetext', `${next} degrees`);
    if (emit && changed && this.onChange) this.onChange(next);
  }

  /**
   * Grip and beam geometry for one azimuth. Correct on its own; js/motion.js
   * replaces this with a smoothed version so a 5 degree keyboard step travels
   * the arc instead of teleporting, and restores it under reduced motion.
   */
  paint(deg) {
    this.paintAt(deg);
  }

  /** The unsmoothed write. The motion layer calls this from its tween. */
  paintAt(deg) {
    const size = this.root.clientWidth || 148;
    const a = ((deg - 90) * Math.PI) / 180;
    const rad = 0.5 * size - 7;
    this.grip.style.transform =
      `translate(${(Math.cos(a) * rad).toFixed(2)}px, ${(Math.sin(a) * rad).toFixed(2)}px)`;
    this.beam.style.transform = `rotate(${deg.toFixed(2)}deg)`;
  }

  cancelDrag() {
    if (!this._drag.isDragging()) return false;
    this.set(this._startValue, true);
    this._drag.abort();
    return true;
  }

  setDisabled(on) {
    this.disabled = !!on;
    this.root.setAttribute('aria-disabled', String(!!on));
    this.root.tabIndex = on ? -1 : 0;
  }
}
