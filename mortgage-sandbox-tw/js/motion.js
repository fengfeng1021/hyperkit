/* ==========================================================================
   motion.js
   The seam between the interface and the animation layer.

   Everything the interface asks for goes through here, and every call has a
   correct answer with GSAP absent and under prefers-reduced-motion: it writes
   the end state immediately. So the page is complete with the CDN blocked,
   opened from file://, or with motion turned off at the OS level.

   The choreography itself lives in motion-layer.js. This file holds no
   timelines; it only guarantees the fallback.
   ========================================================================== */

const mq = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

/* Read live, not once at load. The preference can change mid-session, and a
   cached boolean would keep animating for a user who just turned it off. */
const reduceNow = () => (mq ? mq.matches : false);
const gsapNow = () => (typeof window !== 'undefined' && typeof window.gsap !== 'undefined' ? window.gsap : null);

export const hasGSAP = !!gsapNow();

const TRANSFORM_KEYS = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation'];
const TWEEN_KEYS = [
  'duration', 'delay', 'ease', 'stagger', 'repeat', 'yoyo', 'overwrite',
  'onComplete', 'onStart', 'onUpdate', 'onInterrupt', 'clearProps', 'immediateRender',
];

function toNodes(target) {
  if (typeof target === 'string') return [...document.querySelectorAll(target)];
  if (target instanceof Element) return [target];
  if (Array.isArray(target)) return target.filter(Boolean);
  if (target && typeof target.length === 'number') return [...target];
  return [];
}

/** Apply a plain object of styles right now. The fallback for every tween. */
function applyNow(target, vars) {
  toNodes(target).forEach((n) => {
    const tf = [];
    for (const k in vars) {
      if (TWEEN_KEYS.includes(k)) continue;
      if (k === 'autoAlpha') {
        n.style.opacity = vars[k];
        n.style.visibility = vars[k] > 0 ? 'inherit' : 'hidden';
        continue;
      }
      if (TRANSFORM_KEYS.includes(k)) { tf.push([k, vars[k]]); continue; }
      if (k.startsWith('--')) { n.style.setProperty(k, vars[k]); continue; }
      if (k in n.style) n.style[k] = vars[k];
      else n.setAttribute(k, vars[k]);
    }
    if (tf.length) {
      /* Transform aliases have no styleable equivalent, so compose them by
         hand rather than dropping them on the floor. */
      const get = (k, d) => { const f = tf.find((p) => p[0] === k); return f ? f[1] : d; };
      const parts = [];
      const x = get('x', 0), y = get('y', 0);
      if (x || y) parts.push(`translate(${typeof x === 'number' ? `${x}px` : x}, ${typeof y === 'number' ? `${y}px` : y})`);
      const s = get('scale', null);
      if (s !== null) parts.push(`scale(${s})`);
      else {
        const sx = get('scaleX', null), sy = get('scaleY', null);
        if (sx !== null) parts.push(`scaleX(${sx})`);
        if (sy !== null) parts.push(`scaleY(${sy})`);
      }
      const r = get('rotation', null);
      if (r !== null) parts.push(`rotate(${typeof r === 'number' ? `${r}deg` : r})`);
      n.style.transform = parts.join(' ');
    }
  });
  vars.onComplete?.();
}

export const motion = {
  get hasGSAP() { return !!gsapNow(); },
  get prefersReduced() { return reduceNow(); },
  get enabled() { return !!gsapNow() && !reduceNow(); },

  to(target, vars) {
    if (this.enabled) return window.gsap.to(target, vars);
    applyNow(target, vars);
    return null;
  },
  set(target, vars) {
    const g = gsapNow();
    if (g) return g.set(target, vars);
    applyNow(target, vars);
    return null;
  },
  timeline(vars) {
    if (this.enabled) return window.gsap.timeline(vars);
    return {
      to(t, v) { applyNow(t, v); return this; },
      set(t, v) { applyNow(t, v); return this; },
      from() { return this; },
      fromTo(t, a, b) { applyNow(t, b); return this; },
      add() { return this; },
      play() { return this; },
      reverse() { return this; },
      restart() { return this; },
      kill() { return this; },
      progress() { return 1; },
      isActive() { return false; },
    };
  },

  /* ------------------------------------------------------------------------
     Number readouts.

     The value the eye follows must be the same quantity throughout, so the
     digits interpolate rather than jump. While the scrubber is down the catch
     up is short enough to feel attached to the hand; on a jump (X, a loaded
     scenario, a slider release) it rolls properly.
     ------------------------------------------------------------------------ */
  count(node, value, formatFn) {
    if (!node) return;
    const g = gsapNow();
    const st = node.__count || (node.__count = {});

    if (!g || reduceNow() || st.v === undefined || node.textContent !== formatFn(st.v)) {
      st.v = value;
      node.textContent = formatFn(value);
      return;
    }
    if (Math.abs(value - st.v) < 0.5) {
      st.v = value;
      node.textContent = formatFn(value);
      return;
    }

    const scrubbing = document.body.classList.contains('is-scrubbing');
    const box = st.box || (st.box = { v: st.v });
    box.v = st.v;
    g.to(box, {
      v: value,
      duration: scrubbing ? 0.18 : 0.52,
      ease: 'power3.out',
      overwrite: true,
      onUpdate() { st.v = box.v; node.textContent = formatFn(box.v); },
      onComplete() { st.v = value; node.textContent = formatFn(value); },
    });
  },
};
