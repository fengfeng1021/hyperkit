/**
 * js/weave-switch.js
 * The signature control.
 *
 * One scalar, u_displaceScale, drives the whole difference. This module owns
 * that scalar and nothing else owns it.
 *
 * The state machine here is complete without any animation. `apply(t)` is the
 * instant path and stays the instant path: boot, context restore and reduced
 * motion all go through it. When js/motion.js is installed it sets `animator`,
 * and from then on the two halves of `apply` are driven separately by a GSAP
 * timeline: the shader scalar on power2.inOut, the knob on back.out. Setting
 * `animator` back to null restores the instant behaviour exactly, which is
 * what gsap.matchMedia does when a visitor turns reduced motion on.
 *
 * Repeated clicks are legal and expected. A seller flips this five or six
 * times in a row, so the switch never queues, never disables itself, and
 * never lands in a half state.
 */

export class WeaveSwitch {
  constructor({ root, button, knob, fill, labelFlat, labelWoven, note, verdict, uniforms, onFrame, onFirstUse }) {
    this.root = root;
    this.button = button;
    this.knob = knob;
    this.fill = fill;
    this.labelFlat = labelFlat;
    this.labelWoven = labelWoven;
    this.note = note;
    this.verdict = verdict;
    this.uniforms = uniforms;
    this.onFrame = onFrame;
    this.onFirstUse = onFirstUse;

    this.woven = false;
    this.enabled = false;
    this.peeking = false;
    this.used = false;

    /** Set by js/motion.js. `(to, {knob}) => void`. Null means instant. */
    this.animator = null;

    button.addEventListener('click', () => this.toggle());
    labelFlat.addEventListener('click', () => this.set(false));
    labelWoven.addEventListener('click', () => this.set(true));

    this.apply(0);
    this.render();
  }

  setEnabled(on, reason) {
    this.enabled = !!on;
    this.button.setAttribute('aria-disabled', String(!on));
    this.root.dataset.empty = String(!on);
    this.note.textContent = reason || '';
    this.note.hidden = !reason;
    this.render();
  }

  setUsed(used) {
    this.used = !!used;
    this.render();
  }

  toggle() {
    if (!this.enabled) return;
    this.set(!this.woven);
  }

  set(woven) {
    if (!this.enabled) return;
    const changed = this.woven !== woven;
    this.woven = woven;
    this.render();
    if (this.animator) this.animator(woven ? 1 : 0, { knob: true });
    else this.apply(woven ? 1 : 0);
    if (changed && !this.used) {
      this.used = true;
      this.onFirstUse?.();
      this.render();
    }
  }

  /**
   * Hold F to compare without changing state. The knob does not move, because
   * the switch has not been thrown: only the cloth answers.
   */
  peek(on) {
    if (!this.enabled || !this.woven) return;
    if (this.peeking === on) return;
    this.peeking = on;
    if (this.animator) this.animator(on ? 0 : 1, { knob: false, peek: true });
    else this.applyShader(on ? 0 : 1);
  }

  /** The instant path: both halves at once. */
  apply(t) {
    this.applyShader(t);
    this.applyKnob(t);
  }

  /**
   * The one place the four gated shader values are written. Anything that
   * wants to animate the cloth animates `t` and calls this.
   */
  applyShader(t) {
    const u = this.uniforms;
    u.displaceScale = t;
    u.shadowMix = t * 0.85;
    u.fiberMix = t;
    u.seamBite = t;
    this.onFrame?.();
  }

  /** Knob travel and the brick fill behind it. Transform only, never width. */
  applyKnob(t) {
    this.knob.style.transform = `translateX(${t * this.travel()}px)`;
    this.fill.style.transform = `scaleX(${t})`;
  }

  travel() {
    return getTravel(this.button);
  }

  render() {
    const on = this.woven;
    this.button.setAttribute('aria-checked', String(on));
    this.labelFlat.classList.toggle('is-on', !on && this.enabled);
    this.labelWoven.classList.toggle('is-on', on && this.enabled);
    // With an animator installed the verdict line is wiped in and out on the
    // same timeline, so visibility belongs to that timeline. Losing the
    // switch entirely is not a transition, so that case still lands here.
    if (!this.animator) this.verdict.hidden = !(on && this.enabled);
    else if (!this.enabled) this.verdict.hidden = true;
    if (this.enabled && !this.used) {
      this.note.textContent = 'Press W or drag the switch.';
      this.note.hidden = false;
    } else if (this.enabled && this.used && !this.note.dataset.sticky) {
      this.note.hidden = true;
    }
  }
}

function getTravel(button) {
  const styles = getComputedStyle(button);
  const w = parseFloat(styles.width) || 220;
  const knob = parseFloat(styles.getPropertyValue('--switch-knob')) || 44;
  return Math.max(0, w - knob - 2);
}
