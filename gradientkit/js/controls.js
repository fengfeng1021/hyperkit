/* ==========================================================================
   GradientKit - controls.js
   The four primitives every panel is built from: numeric field, slider,
   toggle, radio group. Plus the button state machine.

   Everything here is keyboard-complete before it is pointer-complete. Arrow
   keys on a color stop are the difference between a tool and a toy.
   ========================================================================== */

import { iconMarkup } from './icons.js';

/* --------------------------------------------------------------------------
   Numeric field
   Fragment Mono, right aligned, fixed decimals so digits never jitter.
   The LABEL is a horizontal scrub target; the input is a real text field.
   -------------------------------------------------------------------------- */

export class NumericField {
  /**
   * @param {HTMLElement} root  .gk-num wrapper
   * @param {object} o
   * @param {number} o.min @param {number} o.max @param {number} o.step
   * @param {number} [o.decimals=0]
   * @param {string} [o.rangeMessage] Sentence shown when the value is refused.
   * @param {(v:number, live:boolean)=>void} o.onChange
   */
  constructor(root, o) {
    this.root = root;
    this.input = root.querySelector('.gk-num-input');
    this.label = root.querySelector('.gk-num-label');
    this.msg = root.querySelector('.gk-num-msg');
    this.o = { decimals: 0, ...o };
    this.committed = Number(this.input.value) || o.min;
    this.dragging = false;
    this.bind();
    this.set(this.committed, { silent: true });
  }

  format(v) { return Number(v).toFixed(this.o.decimals); }

  set(v, { silent = false } = {}) {
    const clamped = Math.min(this.o.max, Math.max(this.o.min, Number(v)));
    this.committed = clamped;
    if (document.activeElement !== this.input || silent) this.input.value = this.format(clamped);
    this.clearError();
    this.input.setAttribute('aria-valuenow', String(clamped));
    if (!silent) this.o.onChange(clamped, false);
  }

  clearError() {
    this.root.classList.remove('is-error');
    if (this.msg) this.msg.textContent = '';
    this.input.removeAttribute('aria-invalid');
  }

  showError(text) {
    this.root.classList.add('is-error');
    if (this.msg) this.msg.textContent = text;
    this.input.setAttribute('aria-invalid', 'true');
  }

  wipe() {
    this.root.classList.remove('is-wiping');
    // Forcing a reflow restarts the CSS underline wipe on repeated commits.
    void this.root.offsetWidth;
    this.root.classList.add('is-wiping');
  }

  commitFromText() {
    const raw = this.input.value.trim().replace(/[^0-9.+-]/g, '');
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      this.showError(this.o.rangeMessage || `Enter a number between ${this.o.min} and ${this.o.max}.`);
      return false;
    }
    if (n < this.o.min || n > this.o.max) {
      this.showError(this.o.rangeMessage || `Value is ${this.o.min} to ${this.o.max}.`);
      return false;
    }
    this.committed = n;
    this.input.value = this.format(n);
    this.clearError();
    this.wipe();
    this.o.onChange(n, false);
    return true;
  }

  nudge(dir, e) {
    let step = this.o.step;
    if (e.shiftKey) step *= 10;
    if (e.altKey) step /= 10;
    const next = Math.min(this.o.max, Math.max(this.o.min, this.committed + dir * step));
    this.committed = next;
    this.input.value = this.format(next);
    this.clearError();
    this.o.onChange(next, false);
  }

  bind() {
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); this.nudge(1, e); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.nudge(-1, e); }
      else if (e.key === 'Home') { e.preventDefault(); this.set(this.o.min); }
      else if (e.key === 'End') { e.preventDefault(); this.set(this.o.max); }
      else if (e.key === 'Enter') { e.preventDefault(); this.commitFromText(); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.input.value = this.format(this.committed);
        this.clearError();
      }
    });
    this.input.addEventListener('focus', () => this.input.select());
    this.input.addEventListener('blur', () => {
      if (this.input.value.trim() === this.format(this.committed)) { this.clearError(); return; }
      if (!this.commitFromText()) this.input.value = this.format(this.committed);
    });

    if (!this.label) return;
    this.label.addEventListener('pointerdown', (e) => {
      if (this.root.classList.contains('is-disabled')) return;
      e.preventDefault();
      this.dragging = true;
      this.startX = e.clientX;
      this.startVal = this.committed;
      this.label.setPointerCapture(e.pointerId);
      document.body.classList.add('is-scrubbing');
    });
    this.label.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      let step = this.o.step;
      if (e.shiftKey) step *= 10;
      if (e.altKey) step /= 10;
      const delta = (e.clientX - this.startX) * step;
      const next = Math.min(this.o.max, Math.max(this.o.min, this.startVal + delta));
      this.committed = next;
      this.input.value = this.format(next);
      this.o.onChange(next, true);
    });
    const end = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      document.body.classList.remove('is-scrubbing');
      try { this.label.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      this.o.onChange(this.committed, false);
    };
    this.label.addEventListener('pointerup', end);
    this.label.addEventListener('pointercancel', end);
  }

  setDisabled(disabled, reason = '') {
    this.root.classList.toggle('is-disabled', disabled);
    this.input.disabled = false; // stays focusable so the reason is readable
    this.input.setAttribute('aria-disabled', String(disabled));
    this.input.readOnly = disabled;
    if (this.msg) this.msg.textContent = disabled ? reason : '';
  }
}

/* --------------------------------------------------------------------------
   Slider. 1px rail, 10x10 square thumb, tick at the default value,
   double-click on the rail returns to it.
   -------------------------------------------------------------------------- */

export class Slider {
  constructor(root, o) {
    this.root = root;
    this.input = root.querySelector('input[type="range"]');
    this.o = o;
    if (o.defaultValue !== undefined) {
      this.root.style.setProperty('--default-pos', `${((o.defaultValue - Number(this.input.min)) / (Number(this.input.max) - Number(this.input.min))) * 100}%`);
    }
    this.input.addEventListener('input', () => {
      this.paint();
      o.onChange(Number(this.input.value), true);
    });
    this.input.addEventListener('change', () => o.onChange(Number(this.input.value), false));
    this.root.addEventListener('dblclick', () => {
      if (o.defaultValue === undefined) return;
      this.set(o.defaultValue);
      o.onChange(o.defaultValue, false);
    });
    this.paint();
  }

  paint() {
    const min = Number(this.input.min);
    const max = Number(this.input.max);
    const pct = ((Number(this.input.value) - min) / (max - min)) * 100;
    this.root.style.setProperty('--fill', `${pct}%`);
  }

  set(v) {
    this.input.value = String(v);
    this.paint();
  }

  get value() { return Number(this.input.value); }
}

/* --------------------------------------------------------------------------
   Toggle. A 22x12 throw switch with a square knob. Not a pill.
   -------------------------------------------------------------------------- */

export function bindToggle(btn, { onChange }) {
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(next));
    onChange(next);
  });
  return {
    set(v) { btn.setAttribute('aria-pressed', String(!!v)); },
    get value() { return btn.getAttribute('aria-pressed') === 'true'; },
  };
}

/* --------------------------------------------------------------------------
   Radio group. A real radiogroup: arrow keys move selection, Tab enters and
   leaves as one stop.
   -------------------------------------------------------------------------- */

export function bindRadioGroup(container, { onChange, valueAttr = 'data-value' }) {
  const items = () => [...container.querySelectorAll('[role="radio"]')];

  function select(el, focus = true) {
    if (!el || el.getAttribute('aria-disabled') === 'true') return;
    for (const it of items()) {
      const on = it === el;
      it.setAttribute('aria-checked', String(on));
      it.tabIndex = on ? 0 : -1;
    }
    if (focus) el.focus();
    onChange(el.getAttribute(valueAttr), el);
  }

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[role="radio"]');
    if (!btn || !container.contains(btn)) return;
    if (btn.getAttribute('aria-disabled') === 'true') return;
    select(btn, false);
  });

  container.addEventListener('keydown', (e) => {
    const list = items().filter((i) => i.getAttribute('aria-disabled') !== 'true');
    const idx = list.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); select(list[idx]); return; }
    if (next >= 0) { e.preventDefault(); select(list[next]); }
  });

  return {
    set(value) {
      const el = items().find((i) => i.getAttribute(valueAttr) === value);
      if (!el) return;
      for (const it of items()) {
        const on = it === el;
        it.setAttribute('aria-checked', String(on));
        it.tabIndex = on ? 0 : -1;
      }
    },
    setDisabled(value, disabled, reason) {
      const el = items().find((i) => i.getAttribute(valueAttr) === value);
      if (!el) return;
      el.setAttribute('aria-disabled', String(disabled));
      if (disabled && reason) {
        el.setAttribute('title', '');
        el.removeAttribute('title');
        const holder = container.querySelector('.gk-group-reason');
        if (holder) holder.textContent = reason;
      } else {
        const holder = container.querySelector('.gk-group-reason');
        if (holder && holder.dataset.owner === value) holder.textContent = '';
      }
    },
    get value() {
      const el = items().find((i) => i.getAttribute('aria-checked') === 'true');
      return el ? el.getAttribute(valueAttr) : null;
    },
  };
}

/* --------------------------------------------------------------------------
   Tablist with roving tab semantics.
   -------------------------------------------------------------------------- */

export function bindTablist(list, { onChange }) {
  const tabs = () => [...list.querySelectorAll('[role="tab"]')];

  // When every tab points at the same panel, the panel stays mounted and only
  // re-labels itself. Hiding it would leave the user looking at nothing.
  const shared = new Set(tabs().map((t) => t.getAttribute('aria-controls'))).size === 1;

  function activate(tab, focus = true) {
    for (const t of tabs()) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (shared) continue;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    }
    if (shared) {
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.setAttribute('aria-labelledby', tab.id);
    }
    if (focus) tab.focus();
    onChange(tab.dataset.tab, tab);
  }

  list.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) activate(tab, false);
  });
  list.addEventListener('keydown', (e) => {
    const all = tabs();
    const idx = all.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % all.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + all.length) % all.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    if (next >= 0) { e.preventDefault(); activate(all[next]); }
  });

  return { activate: (name) => { const t = tabs().find((x) => x.dataset.tab === name); if (t) activate(t, false); } };
}

/* --------------------------------------------------------------------------
   Button state machine. Fixed-width label box, so a swap never reflows.
   Buttons never turn red: an error reverts the label and the Notice carries
   the message.
   -------------------------------------------------------------------------- */

export function buttonStates(btn) {
  const labelEl = btn.querySelector('.gk-btn-label') || btn;
  const idle = labelEl.textContent;
  const idleIcon = btn.querySelector('.gk-icon')?.outerHTML || '';
  let timer = 0;

  function paint(text, iconName) {
    labelEl.textContent = text;
    const slot = btn.querySelector('.gk-btn-icon');
    if (slot) slot.innerHTML = iconName ? iconMarkup(iconName) : idleIcon;
  }

  return {
    reset() {
      if (timer) clearTimeout(timer);
      btn.classList.remove('is-loading', 'is-success');
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      paint(idle, null);
    },
    loading(text) {
      if (timer) clearTimeout(timer);
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      paint(text, null);
    },
    progress(fraction) {
      btn.style.setProperty('--progress', `${Math.round(fraction * 100)}%`);
    },
    success(text, ms = 1600) {
      if (timer) clearTimeout(timer);
      btn.classList.remove('is-loading');
      btn.classList.add('is-success');
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      paint(text, 'check');
      timer = setTimeout(() => this.reset(), ms);
    },
    label(text) { paint(text, null); },
  };
}

/**
 * Reset is the only destructive action, so it is two-press armed with a
 * draining hairline countdown. Esc or blur disarms. No confirmation modal.
 */
export function armable(btn, { armedLabel, onFire, window: winMs = 3000 }) {
  const labelEl = btn.querySelector('.gk-btn-label') || btn;
  const idle = labelEl.textContent;
  let armed = false;
  let timer = 0;

  function disarm() {
    armed = false;
    if (timer) clearTimeout(timer);
    btn.classList.remove('is-armed');
    labelEl.textContent = idle;
  }

  btn.addEventListener('click', () => {
    if (armed) { disarm(); onFire(); return; }
    armed = true;
    btn.classList.add('is-armed');
    labelEl.textContent = armedLabel;
    btn.style.setProperty('--arm-duration', `${winMs}ms`);
    timer = setTimeout(disarm, winMs);
  });
  btn.addEventListener('blur', disarm);
  btn.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); disarm(); } });

  return { disarm, get armed() { return armed; } };
}

/* --------------------------------------------------------------------------
   Clipboard with a real failure path. A silent copy is indistinguishable from
   a failed copy, so every call reports which branch it took.
   -------------------------------------------------------------------------- */

export async function copyText(text, selectFallbackEl) {
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('no clipboard');
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    if (selectFallbackEl) {
      const range = document.createRange();
      range.selectNodeContents(selectFallbackEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return { ok: false };
  }
}
