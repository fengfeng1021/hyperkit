/* ==========================================================================
   GradientKit - sweep.js
   The comparison controller behind the product's one authored moment.

   This module owns the real numbers and the DOM. It computes the chroma
   deficit curve, finds the worst point, positions the seam, draws the bracket
   and prints the measured percentage. It does not animate: the seam position
   is a single number (`setSeam`) and the shake is a single number, both of
   which the motion layer tweens on a plain JS object.

   With no motion layer present the seam lands immediately and becomes a
   draggable divider, which is also exactly the prefers-reduced-motion
   behaviour. The teaching value is identical either way.

   Motion mount points, stable:
     .gk-sweep            overlay root, carries --seam and --shake
     .gk-sweep-rail       spans the stage and carries the seam's transform, so
                          --seam is a percentage and needs no measurement
     .gk-sweep-line       the 1px seam
     .gk-sweep-grip       the divider's hit area and focus target
     .gk-sweep-label      "sRGB  <  |  >  OKLCH"
     .gk-sweep-bracket    dead-zone rectangle
     .gk-sweep-deficit    "chroma -34% here"
     choreograph(fn)      register the motion layer's landing sequence
   ========================================================================== */

import { compareSpaces } from './gradient.js';
import { SPACE_LABELS, clamp } from './color.js';

export function createSweep(overlay, ctx) {
  let el = null;
  let gripEl = null;
  let deficitEl = null;
  let seam = 0.5;
  let report = null;
  let fromSpace = 'srgb';
  // Optional. The motion layer registers a function here; if it returns true it
  // has taken over the landing and will drive setSeam itself. Nothing else in
  // the product knows the animation exists.
  let choreographer = null;

  function mount() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'gk-sweep';
    el.innerHTML = `
      <div class="gk-sweep-bracket" hidden></div>
      <p class="gk-sweep-deficit" hidden></p>
      <div class="gk-sweep-rail">
        <div class="gk-sweep-line"></div>
        <button type="button" class="gk-sweep-grip"
                role="slider" aria-orientation="horizontal"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"
                aria-label="Comparison divider. Left of it is the corrected space.">
          <span class="gk-sr">Drag or use arrow keys to move the comparison divider</span>
        </button>
      </div>
      <p class="gk-sweep-label"></p>
    `;
    overlay.appendChild(el);
    gripEl = el.querySelector('.gk-sweep-grip');
    deficitEl = el.querySelector('.gk-sweep-deficit');
    bindGrip();
    return el;
  }

  function bindGrip() {
    const grip = el.querySelector('.gk-sweep-grip');
    let dragging = false;
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      grip.setPointerCapture(e.pointerId);
      grip.classList.add('is-dragging');
    });
    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = overlay.getBoundingClientRect();
      setSeam(clamp((e.clientX - r.left) / r.width, 0, 1));
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      grip.classList.remove('is-dragging');
      try { grip.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    grip.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.1 : 0.01;
      if (e.key === 'ArrowRight') { e.preventDefault(); setSeam(seam + step); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setSeam(seam - step); }
      else if (e.key === 'Home') { e.preventDefault(); setSeam(0); }
      else if (e.key === 'End') { e.preventDefault(); setSeam(1); }
      else if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
  }

  // The seam moves 60 times a second during the authored sweep, so it is
  // driven by a transform rather than by `left`. It rides a rail that spans
  // the stage, which means the percentage resolves against the stage width and
  // the seam needs no measurement and survives any resize on its own.
  function setSeam(x, shake = 0) {
    seam = clamp(x, 0, 1);
    if (el) {
      el.style.setProperty('--seam', `${seam * 100}%`);
      el.style.setProperty('--shake', `${shake}px`);
      // gripEl is cached at mount: this runs sixty times a second during the
      // sweep and a selector query per frame is a query too many.
      const pct = Math.round(seam * 100);
      gripEl.setAttribute('aria-valuenow', String(pct));
      gripEl.setAttribute('aria-valuetext', `${pct} percent across the stage`);
    }
    ctx.renderer.setSweep(seam, shake, fromSpace);
  }

  /**
   * Put the measured percentage under its finding, but never past the edge of
   * the stage: on a narrow screen the readout is wider than the space left of
   * a worst point near t=0, and a clipped number is not a measurement. One
   * layout read per open, never during the sweep.
   */
  function placeDeficit(t) {
    deficitEl.style.left = `${t * 100}%`;
    const ow = overlay.getBoundingClientRect().width;
    const dw = deficitEl.getBoundingClientRect().width;
    if (!ow || !dw) return;
    const margin = dw / 2 + 8;
    const px = margin * 2 > ow ? ow / 2 : clamp(t * ow, margin, ow - margin);
    deficitEl.style.left = `${(px / ow) * 100}%`;
  }

  /**
   * Prepare and show the comparison. Every number here is computed
   * synchronously from the user's own stops before a single frame renders.
   */
  function open(from, to) {
    const state = ctx.store.get();
    if (state.mode === 'mesh') {
      ctx.notice('A mesh field blends every point at once, so there is no two-space seam to draw.');
      return null;
    }
    fromSpace = from;
    report = compareSpaces(state.stops, from, to, state.easing, 256);
    mount();
    el.hidden = false;
    overlay.classList.add('is-comparing');

    const label = el.querySelector('.gk-sweep-label');
    label.textContent = `${SPACE_LABELS[from]}  <  |  >  ${SPACE_LABELS[to]}`;

    const bracket = el.querySelector('.gk-sweep-bracket');
    const deficit = el.querySelector('.gk-sweep-deficit');

    if (report.meaningful) {
      bracket.hidden = false;
      deficit.hidden = false;
      bracket.style.left = `${report.spanLo * 100}%`;
      bracket.style.width = `${Math.max(2, (report.spanHi - report.spanLo) * 100)}%`;
      deficit.textContent = `${SPACE_LABELS[report.poorer]} chroma -${report.worstPct}% here`;
      placeDeficit(report.worstT);
      const recovered = report.poorer === from;
      ctx.announce(recovered
        ? `Now interpolating in ${SPACE_LABELS[to]}. Chroma recovered ${report.worstPct} percent at ${Math.round(report.worstT * 100)} percent position.`
        : `Now interpolating in ${SPACE_LABELS[to]}, which gives up ${report.worstPct} percent of the chroma ${SPACE_LABELS[from]} had at ${Math.round(report.worstT * 100)} percent position.`);
    } else {
      bracket.hidden = true;
      deficit.hidden = false;
      deficit.textContent = `No chroma difference between these two. ${SPACE_LABELS[from]} is fine here.`;
      placeDeficit(0.5);
      ctx.announce(`No meaningful chroma difference between ${SPACE_LABELS[from]} and ${SPACE_LABELS[to]} for these colors.`);
    }

    const landing = report.meaningful ? report.worstT : 0.5;
    const handled = choreographer
      && choreographer({ report, from, to, landing, root: el, setSeam }) === true;
    // No motion layer, or reduced motion: the seam lands on the measurement at
    // once and is immediately draggable. Same teaching, user-paced.
    if (!handled) setSeam(landing);
    return report;
  }

  function close() {
    if (!el) return;
    // Esc, a preset load or a mode change can arrive mid-sequence. Tell the
    // motion layer first so it stops writing to elements that are going away.
    if (choreographer) choreographer({ abort: true });
    el.hidden = true;
    overlay.classList.remove('is-comparing');
    ctx.renderer.clearSweep();
  }

  function focusGrip() {
    el?.querySelector('.gk-sweep-grip')?.focus();
  }

  return {
    open,
    close,
    setSeam,
    focusGrip,
    /** Register (or clear, with null) the motion layer's landing sequence. */
    choreograph(fn) { choreographer = typeof fn === 'function' ? fn : null; },
    get isOpen() { return !!el && !el.hidden; },
    get report() { return report; },
    get element() { return el; },
    get seam() { return seam; },
  };
}
