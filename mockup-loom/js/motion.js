/**
 * js/motion.js
 * The motion layer. Every tween in this build is created here and nowhere
 * else, so the whole inventory can be read in one file and audited against
 * docs/DESIGN-DIRECTION.md section 6.1, which is the authority on what is
 * allowed to move.
 *
 * The list, and the one sentence each earns its place with:
 *
 *   1. Weave switch timeline   state transition: this is the entire argument
 *                              of the product, proved in 300ms
 *   2. Batch card arrival      feedback: this card's GPU work just finished,
 *                              so the wall's rhythm is the machine's rhythm
 *   3. Light dial              feedback: a 5 degree step is a turn, not a jump
 *   4. ZIP tree lines          narrative: the folder grows before you commit
 *   5. Selection markers       hierarchy: attention moves from old to new
 *   6. Design list arriving    hierarchy: the list just came into existence
 *                              and that needs to be seen, once
 *   7. Batch figure roll       feedback: your ticks changed the work ahead
 *
 * Nothing else. No entrance animation, no scroll narrative, no parallax, no
 * marquee, no infinite loop, and therefore no ScrollTrigger in this build.
 *
 * Three properties hold for every line below:
 *   - Every element animated here is already visible and already in the right
 *     place before this file runs. Nothing in css/ sits at opacity 0 waiting
 *     to be rescued. If the GSAP CDN never answers, the tool is complete.
 *   - Everything lives inside gsap.matchMedia(). Under prefers-reduced-motion
 *     this file installs nothing at all and each module keeps the instant
 *     write it already had, which is why the reduced path cannot rot.
 *   - Linear easing appears nowhere. The two determinate progress fills stay
 *     in CSS, where linear is correct because the width is elapsed work.
 */

import { cssVar } from './util/dom.js';

/** Read a duration token so tokens.css stays the single source of timing. */
function seconds(name, fallback) {
  const v = parseFloat(cssVar(name));
  return Number.isFinite(v) && v > 0 ? v / 1000 : fallback;
}

export function installMotion(refs) {
  const gsap = window.gsap;

  /* The inert API. Returned as-is when GSAP is unavailable, and used by the
     public methods whenever the reduced-motion branch is the live one. */
  const api = {
    get active() { return live; },
    rollFigure(el, value, format) { el.textContent = format(value); },
    drawTree() {},
    setArrivalMode() {}
  };

  let live = false;
  if (!gsap) return api;

  const D = {
    tap: seconds('--dur-tap', 0.09),
    ui: seconds('--dur-ui', 0.18),
    panel: seconds('--dur-panel', 0.28),
    signature: seconds('--dur-signature', 0.3),
    knob: seconds('--dur-knob', 0.42),
    card: seconds('--dur-card', 0.42)
  };

  let arrival = 'render';
  let listSeen = false;

  const mm = gsap.matchMedia();

  mm.add({
    // `always` is load-bearing, not decoration. gsap.matchMedia only runs its
    // handler while at least one condition matches, so a conditions object of
    // nothing but `reduce` would install no motion at all for the ordinary
    // visitor, who does not match it. This is the condition that is always
    // true; `reduce` is read as a branch inside.
    always: 'all',
    reduce: '(prefers-reduced-motion: reduce)'
  }, (ctx) => {
    // Reduced motion: install nothing. Every module below already writes its
    // final value instantly, so the tool stays whole and nothing is hidden.
    if (ctx.conditions.reduce) return undefined;

    live = true;
    const undo = [];

    undo.push(signatureSwitch(gsap, D, refs));
    undo.push(batchWall(gsap, D, refs, () => arrival));
    undo.push(lightDial(gsap, D, refs));
    undo.push(selectionMarkers(gsap, D, refs));
    undo.push(designsArrive(gsap, D, refs, () => listSeen, () => { listSeen = true; }));

    return () => {
      live = false;
      for (const fn of undo) { try { fn(); } catch (err) { /* already gone */ } }
      undo.length = 0;
    };
  });

  /* --------------------------------------------------------------------
     4. The ZIP folder tree, drawn one line at a time.
     The seller reads this before pressing Export, so the lines arriving in
     order is the point: you watch the folder you are about to receive get
     built. renderTree already emitted them as separate spans and they are
     plain visible text without this.
     -------------------------------------------------------------------- */
  api.drawTree = (el) => {
    if (!live || !el || document.hidden) return;
    const lines = el.querySelectorAll('.tree-line');
    if (!lines.length) return;
    gsap.killTweensOf(lines);
    gsap.from(lines, {
      autoAlpha: 0,
      duration: D.ui,
      ease: 'power3.out',
      stagger: 0.02,
      overwrite: 'auto',
      clearProps: 'visibility,opacity'
    });
  };

  /* --------------------------------------------------------------------
     7. The batch figure. Ticking a design changes how much work is about to
     happen, and the number counting to its new value is the only honest way
     to say so. snap keeps it an integer the whole way: there is no such
     thing as 12.4 renders.
     -------------------------------------------------------------------- */
  api.rollFigure = (el, value, format) => {
    if (!el) return;
    // A figure is data before it is motion. In a hidden tab the ticker is
    // frozen, so a tween would leave the count reading 24 renders next to a
    // subtitle reading 0 designs x 0 templates. Nobody is watching it count,
    // so it simply says the true number.
    if (!live || document.hidden) { el.__roll = null; el.textContent = format(value); return; }
    let p = el.__roll;
    if (!p) {
      el.__roll = { v: value };
      el.textContent = format(value);
      return;
    }
    if (p.v === value) { el.textContent = format(value); return; }
    gsap.to(p, {
      v: value,
      duration: 0.2,
      ease: 'power2.out',
      snap: { v: 1 },
      overwrite: true,
      onUpdate() { el.textContent = format(Math.round(p.v)); },
      onComplete() { el.textContent = format(value); }
    });
  };

  /** 'relight' means the wall is repainting the same renders under a new key
      light, so the cards cross-fade instead of arriving as new work. */
  api.setArrivalMode = (mode) => { arrival = mode === 'relight' ? 'relight' : 'render'; };

  return api;
}

/* ======================================================================
   1. THE SIGNATURE MOMENT

   FLAT to WOVEN. One timeline, three things happening on it at once, and
   they are three views of a single event: the cloth taking the ink.

     - the shader scalar 0 to 1 on power2.inOut over --dur-signature, which
       is what actually bends the print into every fold, darkens the contact
       shadow, lifts the fibre highlight and lets the seam eat the edge
     - the knob and the brick fill travelling on back.out(2.2) over
       --dur-knob, the only overshoot in the entire build, because a physical
       switch carries momentum past its detent and this one is physical
     - the verdict line wiping in from the left on power3.out, its brick rule
       drawing across with it, arriving a beat after the cloth has answered

   The knob outlasts the shader by 120ms on purpose. The cloth settles first
   and the switch is still finding its seat, which is the order these things
   happen in when a real switch throws a real machine.

   Holding F peeks: the cloth answers, the knob does not move, because the
   switch has not been thrown.
   ====================================================================== */
function signatureSwitch(gsap, D, { weave }) {
  const knob = weave.knob;
  const fill = weave.fill;
  const verdict = weave.verdict;
  const button = weave.button;

  const proxy = { t: weave.woven ? 1 : 0 };
  let tl = null;

  // The CSS transitions on these two are the no-GSAP fallback. A transition
  // and a tween on the same property interpolate each other one frame at a
  // time, so exactly one of them may be running.
  const keepKnobT = knob.style.transition;
  const keepFillT = fill.style.transition;
  knob.style.transition = 'none';
  fill.style.transition = 'none';

  gsap.set(fill, { transformOrigin: '0 50%' });

  weave.animator = (to, opts = {}) => {
    if (tl) tl.kill();
    tl = gsap.timeline();

    tl.to(proxy, {
      t: to,
      duration: opts.peek ? 0.16 : D.signature,
      ease: 'power2.inOut',
      onUpdate: () => weave.applyShader(proxy.t)
    }, 0);

    if (!opts.knob) return;

    const travel = weave.travel();
    tl.to(knob, { x: to * travel, duration: D.knob, ease: 'back.out(2.2)' }, 0);
    tl.to(fill, { scaleX: to, duration: D.knob, ease: 'back.out(2.2)' }, 0);

    if (to === 1) {
      verdict.hidden = false;
      tl.fromTo(verdict,
        { clipPath: 'inset(0 100% 0 0)', y: 4 },
        { clipPath: 'inset(0 0% 0 0)', y: 0, duration: 0.26, ease: 'power3.out' },
        0.05);
    } else if (!verdict.hidden) {
      tl.to(verdict, {
        clipPath: 'inset(0 100% 0 0)',
        duration: 0.16,
        ease: 'power2.in',
        onComplete() { verdict.hidden = true; }
      }, 0);
    }
  };

  // Press feedback for the one control that carries the whole argument. The
  // knob narrows under the thumb and lets go; it never leaves its travel.
  const press = () => gsap.to(knob, { scaleX: 0.94, duration: D.tap, ease: 'power2.out', overwrite: 'auto' });
  const release = () => gsap.to(knob, { scaleX: 1, duration: D.ui, ease: 'power3.out', overwrite: 'auto' });
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);

  // --switch-w shrinks below 768px, so the knob's travel is not a constant.
  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      gsap.set(knob, { x: (weave.woven ? 1 : 0) * weave.travel() });
    }, 120);
  };
  window.addEventListener('resize', onResize);

  return () => {
    if (tl) tl.kill();
    weave.animator = null;
    button.removeEventListener('pointerdown', press);
    button.removeEventListener('pointerup', release);
    button.removeEventListener('pointercancel', release);
    button.removeEventListener('pointerleave', release);
    window.removeEventListener('resize', onResize);
    clearTimeout(resizeTimer);
    gsap.set([knob, fill], { clearProps: 'transform' });
    knob.style.transition = keepKnobT;
    fill.style.transition = keepFillT;
    weave.apply(weave.woven ? 1 : 0);
    verdict.hidden = !(weave.woven && weave.enabled);
    gsap.set(verdict, { clearProps: 'clipPath,transform' });
  };
}

/* ======================================================================
   2. THE WALL

   Five hundred cards, each one arriving at the exact moment its own render
   came off the GPU. There is no stagger value anywhere in this function:
   the timing is the machine's, which is the whole reason the effect earns
   its cost. A fixed stagger would be a lie about how long the work took.

   blur 12px to 0 is the developing tray. It is the only filter: blur in the
   build, and it is motion, not decoration.

   Cards outside the viewport are skipped entirely rather than animated
   invisibly, and the blur is dropped once too many are in flight at once,
   so a five hundred card run stays at frame rate on the machine a seller
   actually owns.
   ====================================================================== */
function batchWall(gsap, D, { batch }, arrivalMode) {
  let inflight = 0;

  batch.onCardShown = (img, node) => {
    // A batch deliberately keeps running in a background tab (see schedule()
    // in util/dom.js). requestAnimationFrame does not, so a tween started
    // here would hold its card invisible until the tab came back. Nobody is
    // watching this card arrive, so it simply arrives.
    if (document.hidden) return;

    const r = node.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (r.bottom < -160 || r.top > vh + 160) return;   // already correct off screen

    const relight = arrivalMode() === 'relight';
    const heavy = !relight && inflight < 24;
    inflight++;

    const from = { autoAlpha: 0, scale: heavy ? 0.94 : 0.985 };
    const to = {
      autoAlpha: 1,
      scale: 1,
      duration: heavy ? D.card : D.ui,
      ease: 'expo.out',
      onComplete() {
        inflight--;
        gsap.set(img, { clearProps: 'filter,transform,opacity,visibility' });
      },
      onInterrupt() { inflight--; }
    };
    if (heavy) {
      from.filter = 'blur(12px)';
      to.filter = 'blur(0px)';
    }
    gsap.fromTo(img, from, to);
  };

  return () => {
    batch.onCardShown = null;
    inflight = 0;
  };
}

/* ======================================================================
   3. THE LIGHT DIAL

   Dragging writes straight through: a grip that lags the finger reads as a
   broken control, not as a smooth one. Every other route to a new azimuth
   is a discrete step - arrow keys move 5 degrees, Home snaps to 315 - and
   those travel the arc instead of teleporting across the face, so the beam
   sweeps the way a lamp on a stand sweeps.

   The angle is carried unwrapped, so 350 to 10 goes twenty degrees forward
   rather than three hundred and forty back.

   Draggable's rotation type is deliberately not used here: it rotates the
   element it is given, and rotating this dial would carry the twelve fixed
   tick marks around with it. The compass is fixed; only the light moves.
   ====================================================================== */
function lightDial(gsap, D, { dial }) {
  const original = dial.paint.bind(dial);
  const carrier = { a: dial.value };
  const keepT = dial.grip.style.transition;
  dial.grip.style.transition = 'none';

  const quick = gsap.quickTo(carrier, 'a', {
    duration: D.ui,
    ease: 'power2.out',
    onUpdate: () => dial.paintAt(carrier.a)
  });

  dial.paint = (deg) => {
    // Shortest way round, on an angle that never wraps.
    let delta = ((deg - carrier.a) % 360 + 540) % 360 - 180;
    const target = carrier.a + delta;
    if (dial.root.classList.contains('is-dragging')) {
      gsap.killTweensOf(carrier);
      carrier.a = target;
      dial.paintAt(target);
    } else {
      quick(target);
    }
  };

  return () => {
    gsap.killTweensOf(carrier);
    dial.paint = original;
    dial.grip.style.transition = keepT;
    dial.paintAt(dial.value);
  };
}

/* ======================================================================
   5. SELECTION MARKERS

   Two of them, one gesture: the mark that says "this one" slides from the
   old choice to the new one instead of blinking there, so the eye is
   carried rather than made to search.

   The template grid gets a real travelling outline rather than six borders
   that switch on and off. The per-tile CSS border stays in the stylesheet
   and is only suppressed once the travelling marker exists, so a visitor
   whose CDN is blocked still sees which template is selected.
   ====================================================================== */
function selectionMarkers(gsap, D, { segments, picker, tplGrid }) {
  const undo = [];

  for (const seg of segments) {
    if (!seg) continue;
    const original = seg._place.bind(seg);
    const keepT = seg.marker.style.transition;
    let base = 0;
    let first = true;
    seg.marker.style.transformOrigin = '0 50%';
    seg.marker.style.transition = 'none';

    seg._place = () => {
      const btn = seg.buttons.find((b) => b.dataset.id === seg.value);
      if (!btn) return;
      const widest = Math.max(...seg.buttons.map((b) => b.offsetWidth));
      // A panel behind a closed tab measures zero. Its first real placement,
      // whenever the tab opens, is a placement and not a travel.
      if (!widest) { first = true; original(); return; }
      if (widest !== base) {
        base = widest;
        seg.marker.style.width = `${base}px`;
      }
      const vars = { x: btn.offsetLeft, scaleX: btn.offsetWidth / base };
      if (first) { gsap.set(seg.marker, vars); first = false; }
      else gsap.to(seg.marker, { ...vars, duration: D.ui, ease: 'power3.out', overwrite: 'auto' });
    };
    seg._place();

    undo.push(() => {
      gsap.killTweensOf(seg.marker);
      seg._place = original;
      seg.marker.style.transformOrigin = '';
      seg.marker.style.transition = keepT;
      gsap.set(seg.marker, { clearProps: 'transform' });
      original();
    });
  }

  if (tplGrid && picker) {
    const marker = document.createElement('span');
    marker.className = 'tpl-marker';
    marker.setAttribute('aria-hidden', 'true');
    tplGrid.appendChild(marker);
    tplGrid.classList.add('has-marker');

    let w = 0;
    let h = 0;
    let first = true;

    const place = () => {
      const tile = tplGrid.querySelector('.tpl[aria-selected="true"]');
      const face = tile && tile.querySelector('canvas');
      if (!face) return;
      const g = tplGrid.getBoundingClientRect();
      const c = face.getBoundingClientRect();
      if (!c.width) { requestAnimationFrame(place); return; }
      if (Math.abs(c.width - w) > 0.5 || Math.abs(c.height - h) > 0.5) {
        w = c.width; h = c.height;
        marker.style.width = `${w}px`;
        marker.style.height = `${h}px`;
      }
      const vars = { x: c.left - g.left, y: c.top - g.top };
      if (first) { gsap.set(marker, vars); first = false; }
      else gsap.to(marker, { ...vars, duration: D.ui, ease: 'power3.out', overwrite: 'auto' });
    };

    const original = picker.renderSelection.bind(picker);
    picker.renderSelection = () => { original(); place(); };
    place();

    const ro = new ResizeObserver(() => {
      first = true;   // a resize is a relayout, not a choice: no travel
      place();
    });
    ro.observe(tplGrid);

    undo.push(() => {
      ro.disconnect();
      gsap.killTweensOf(marker);
      picker.renderSelection = original;
      tplGrid.classList.remove('has-marker');
      marker.remove();
    });
  }

  return () => { for (const fn of undo) fn(); };
}

/* ======================================================================
   6. THE DESIGN LIST COMING INTO EXISTENCE

   docs/DESIGN-DIRECTION.md 6.1 asks for one deliberate layout shift here:
   the templates block yielding downward as the design list pushes it out of
   the way. Measured in the built layout, that shift does not exist. The
   designs panel is a fixed grid row (auto, resolved against the viewport)
   that scrolls internally, so gaining a row of thumbnails changes nothing
   below it. The only thing that moves on first load is the whole workbench
   rising 24px because "Render something first." stops being true, and that
   belongs to the export button, not to the design list.

   Animating a shift that does not happen would be inventing an event. The
   motive the doc gives is the real thing worth keeping - the list just came
   into existence and that needs to be seen - so it is served by the event
   that does occur: the thumbnails settling onto the bench in order.

   Once. The second batch of files does not get a ceremony; those get the
   olive is-new border that main.js already gives them.
   ====================================================================== */
function designsArrive(gsap, D, { designList }, wasSeen, markSeen) {
  if (!designList) return () => {};
  const original = designList.render.bind(designList);

  designList.render = () => {
    const wasHidden = designList.wrap.hidden;
    original();
    if (!wasHidden || designList.wrap.hidden || wasSeen()) return;
    // Behind a closed tab there is nothing to see arrive.
    if (document.hidden || !designList.wrap.offsetParent) return;
    const thumbs = designList.host.querySelectorAll('.dthumb');
    if (!thumbs.length) return;
    markSeen();
    gsap.from(thumbs, {
      autoAlpha: 0,
      y: -6,
      duration: D.panel,
      ease: 'power3.out',
      stagger: 0.03,
      clearProps: 'visibility,opacity,transform'
    });
  };

  return () => {
    designList.render = original;
    gsap.set(designList.host.querySelectorAll('.dthumb'),
      { clearProps: 'transform,opacity,visibility' });
  };
}
