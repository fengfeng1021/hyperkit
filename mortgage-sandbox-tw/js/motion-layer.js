/* ==========================================================================
   motion-layer.js
   The animation layer. Loaded after main.js, so window.__sandbox already
   exists; it is the only module in this project that touches GSAP directly.

   There is one authored moment here and it is the crossing: the instant the
   sheet commits to an answer. Everything else in this file is feedback on a
   control the user is actually holding — a scrubber that keeps its momentum,
   digits that interpolate because they are the same quantity, a drawer that
   opens to its own height. No section entrances, no scroll reveals, nothing
   that hides content until a trigger fires.

   Every timeline starts from the state the CSS already paints. Kill this file
   and the page loses no information.
   ========================================================================== */

import { motion } from './motion.js';

const gsap = window.gsap;
const sandbox = window.__sandbox;
const NS = 'http://www.w3.org/2000/svg';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* Nothing below is load-bearing for correctness, so a missing CDN is a silent
   downgrade rather than a console full of red. */
if (gsap && sandbox) init();

function init() {
  const { Draggable, InertiaPlugin, Flip } = window;
  const plugins = [Draggable, InertiaPlugin, Flip].filter(Boolean);
  if (plugins.length) gsap.registerPlugin(...plugins);

  const chart = sandbox.chart;

  /* MOTION_ON is owned by matchMedia below. Handlers registered outside it read
     the flag rather than the media query, so there is exactly one authority. */
  let MOTION_ON = false;

  /* ---------------------------------------------------------------- state */

  let crossTL = null;        // the crossing timeline, at most one at a time
  let introTL = null;
  let anchor = null;         // the crossing currently drawn
  let playedAnchor = null;   // the crossing the birth last played at
  let pendingIntro = false;
  let pastMark = false;

  /* ------------------------------------------------------------- crossing */

  function crossNodes() {
    const group = $('#cross-group');
    if (!group) return null;
    return {
      group,
      dot: $('#cross-dot'),
      ring: $('#cross-ring'),
      leader: $('#cross-leader'),
      pill: $('#cross-pill'),
      tick: $('#cross-tick'),
      wash: $('#cross-wash'),
      chars: $$('#cross-pill-text .cross-char'),
    };
  }

  /** The drawn-and-settled state. Also the state the CSS paints on its own,
      which is why nothing here is needed for the page to be correct. */
  function settle(n = crossNodes()) {
    if (!n) return;
    const all = [n.group, n.dot, n.ring, n.leader, n.pill, n.tick, n.wash, ...n.chars].filter(Boolean);
    if (all.length) gsap.set(all, { clearProps: 'all' });
  }

  /* The retracted state: the point exists, the annotation has not been made.
     Kept as data so it can be applied now (before a timeline that starts at
     once, so nothing shows for a frame) or scheduled inside one (so a nested
     birth retracts at its own start, not when it was constructed). */
  function primeVars(n, a) {
    const list = [
      [n.dot, { transformOrigin: '50% 50%', scale: 0 }],
      [n.ring, { transformOrigin: '50% 50%', scale: 0.4, autoAlpha: 0 }],
      [n.leader, { strokeDasharray: a.leaderLen, strokeDashoffset: a.leaderLen }],
      [n.pill, { transformOrigin: '0% 100%', scale: 0.86, autoAlpha: 0 }],
      [n.tick, { y: -8, autoAlpha: 0 }],
      [n.wash, { svgOrigin: `${a.cx} ${a.plotTop}`, scaleX: 0 }],
    ];
    if (n.chars.length) list.push([n.chars, { autoAlpha: 0 }]);
    return list.filter(([t]) => t && (!Array.isArray(t) || t.length));
  }

  function primeInto(tl, n, a, at) {
    primeVars(n, a).forEach(([t, v]) => tl.set(t, v, at));
  }

  function retractNow(a) {
    const n = crossNodes();
    if (!n) return;
    primeVars(n, a).forEach(([t, v]) => gsap.set(t, v));
  }

  /* The signature moment.

     Reading order is the drafting order: the point is measured, the reading
     is announced as a ring, the ground it claims is washed in, a leader line
     is run out to clear space, and only then is the note lettered in. */
  function birthTL(a) {
    const n = crossNodes();
    if (!n) return gsap.timeline();

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    primeInto(tl, n, a, 0);

    // the point is placed
    tl.to(n.dot, { scale: 1, duration: 0.40, ease: 'back.out(2.6)' }, 0);

    /* One ring of the reading going out, then the target mark settling back.
       fromTo, not to: the primed state holds the ring hidden until the wave
       actually starts, so nothing sits at the crossing before its moment. */
    tl.fromTo(n.ring,
      { scale: 0.4, autoAlpha: 1, transformOrigin: '50% 50%' },
      { scale: 3.2, autoAlpha: 0, duration: 0.62, ease: 'power2.out', immediateRender: false }, 0.02);
    tl.set(n.ring, { scale: 1, autoAlpha: 0 }, 0.64);
    tl.to(n.ring, { autoAlpha: 1, duration: 0.30, ease: 'power2.out' }, 0.64);

    // "from here on, this one is ahead" wiped in from the crossing
    tl.to(n.wash, { scaleX: 1, duration: 0.80, ease: 'power3.out' }, 0.08);

    // the crossing projected back onto the time axis
    tl.to(n.tick, { y: 0, autoAlpha: 1, duration: 0.36 }, 0.20);

    // leader line run out, then the note opened off its top end
    tl.to(n.leader, { strokeDashoffset: 0, duration: 0.42 }, 0.22);
    tl.to(n.pill, { scale: 1, autoAlpha: 1, duration: 0.48, ease: 'power4.out' }, 0.52);
    if (n.chars.length) {
      tl.to(n.chars, {
        autoAlpha: 1, duration: 0.20, ease: 'power1.out',
        stagger: Math.min(0.018, 0.42 / n.chars.length),
      }, 0.58);
    }

    tl.eventCallback('onInterrupt', () => settle());
    return tl;
  }

  /* The conclusion moving. Snap back to where the crossing used to be, take
     the annotation down, walk the point to its new month, build it again. */
  function reversalTL(from, a) {
    const n = crossNodes();
    if (!n) return birthTL(a);

    /* Snap to the conclusion's old coordinates in the same frame the redraw
       landed, so it looks like the same annotation coming apart. */
    gsap.set(n.group, { x: from.cx, y: from.cy });
    gsap.set(n.leader, { strokeDasharray: a.leaderLen, strokeDashoffset: 0 });
    gsap.set(n.wash, { svgOrigin: `${a.cx} ${a.plotTop}` });

    const tl = gsap.timeline();
    tl.to(n.pill, { scale: 0.86, autoAlpha: 0, transformOrigin: '0% 100%', duration: 0.20, ease: 'power2.in' }, 0);
    tl.to(n.leader, { strokeDashoffset: a.leaderLen, duration: 0.20, ease: 'power2.in' }, 0);
    tl.to(n.wash, { scaleX: 0, duration: 0.24, ease: 'power2.in' }, 0);
    tl.to(n.tick, { y: -8, autoAlpha: 0, duration: 0.18, ease: 'power2.in' }, 0);
    tl.to(n.dot, { scale: 0.5, transformOrigin: '50% 50%', duration: 0.20, ease: 'power2.in' }, 0);

    // the point travels to its new month; both ends are still, so this is the
    // one place an in-out curve is right
    tl.to(n.group, { x: a.cx, y: a.cy, duration: 0.52, ease: 'power3.inOut' }, 0.22);
    tl.add(birthTL(a), 0.66);

    tl.eventCallback('onInterrupt', () => settle());
    return tl;
  }

  /** The cursor reaching the annotated month. One ring, no re-lettering. */
  function pulse() {
    const n = crossNodes();
    if (!n || !n.ring) return;
    gsap.killTweensOf([n.ring, n.dot]);
    const tl = gsap.timeline();
    tl.set(n.ring, { transformOrigin: '50% 50%', scale: 0.5, autoAlpha: 1 }, 0);
    tl.to(n.ring, { scale: 3.0, autoAlpha: 0, duration: 0.56, ease: 'power2.out' }, 0);
    tl.set(n.ring, { scale: 1, autoAlpha: 0 }, 0.56);
    tl.to(n.ring, { autoAlpha: 1, duration: 0.26, ease: 'power2.out' }, 0.56);
    tl.fromTo(n.dot,
      { scale: 1 },
      { scale: 1.6, transformOrigin: '50% 50%', duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1 }, 0);
  }

  /* ------------------------------------------------------- curve draw-in */

  function seriesClips() {
    const svg = $('#plot-svg');
    const { W, H } = chart.size;
    const pad = chart.pad;
    let defs = svg.querySelector('defs.motion-defs');
    if (!defs) {
      defs = document.createElementNS(NS, 'defs');
      defs.setAttribute('class', 'motion-defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    const x0 = pad.l - 6;
    const w = Math.max(1, (W - pad.r + 10) - x0);
    return ['a', 'b', 'c'].map((k) => {
      let cp = defs.querySelector(`#clip-series-${k}`);
      if (!cp) {
        cp = document.createElementNS(NS, 'clipPath');
        cp.id = `clip-series-${k}`;
        cp.setAttribute('clipPathUnits', 'userSpaceOnUse');
        cp.appendChild(document.createElementNS(NS, 'rect'));
        defs.appendChild(cp);
      }
      const r = cp.firstChild;
      r.setAttribute('x', x0);
      r.setAttribute('y', -40);
      r.setAttribute('width', w);
      r.setAttribute('height', H + 80);
      $(`#series-${k}`).setAttribute('clip-path', `url(#clip-series-${k})`);
      return { rect: r, x0 };
    });
  }

  function unclipSeries() {
    ['a', 'b', 'c'].forEach((k) => $(`#series-${k}`)?.removeAttribute('clip-path'));
  }

  /** Three curves drawn left to right, the baseline first. The sheet is being
      plotted, not faded in. */
  function introTimeline(a) {
    const clips = seriesClips();
    const tl = gsap.timeline({
      onComplete: unclipSeries,
      onInterrupt: () => { unclipSeries(); settle(); },
    });
    clips.forEach((c, i) => {
      tl.fromTo(c.rect,
        { scaleX: 0 },
        { scaleX: 1, svgOrigin: `${c.x0} 0`, duration: 0.62, ease: 'power3.out' },
        i * 0.09);
    });
    if (a) tl.add(birthTL(a), 0.66);
    return tl;
  }

  /* ------------------------------------------------------- chart wiring */

  chart.on('empty-out', ({ node }) => {
    if (!MOTION_ON || !node) return;
    /* The dimension line is cleared by the redraw that follows this call, so
       show it leaving from a copy parked on the svg root. */
    const ghost = node.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.setAttribute('class', 'dimline dimline--ghost');
    $('#plot-svg').appendChild(ghost);
    gsap.to(ghost, {
      autoAlpha: 0, y: -12, duration: 0.36, ease: 'power2.in',
      onComplete: () => ghost.remove(),
    });
  });

  /* A slider sends one `input` per frame, and every one of them rebuilds the
     annotation from scratch. So a running timeline is always pointed at nodes
     that no longer exist, and the honest answer is: while the numbers are
     still moving, the annotation just follows them, drawn and static. The
     moment is announced once the hand comes off. */
  let announceTimer = 0;
  let announceWaits = 0;

  function scheduleAnnounce(waiting) {
    clearTimeout(announceTimer);
    announceWaits = waiting ? announceWaits + 1 : 0;
    announceTimer = setTimeout(() => {
      if (!MOTION_ON || !anchor || pendingIntro) return;
      /* Still under the hand: wait for the gesture to finish. Bounded, because
         a pointer released outside the window never clears the class and the
         moment should still be announced. */
      if (document.body.classList.contains('is-scrubbing') && announceWaits < 24) {
        scheduleAnnounce(true);
        return;
      }
      if (crossTL && crossTL.isActive()) { crossTL.kill(); crossTL = null; }

      if (!playedAnchor) {
        retractNow(anchor);
        crossTL = birthTL(anchor);
      } else if (playedAnchor.month !== anchor.month) {
        crossTL = reversalTL(playedAnchor, anchor);
      }
      playedAnchor = anchor;
    }, 140);
  }

  chart.on('cross', (a) => {
    anchor = a;
    if (!a) { playedAnchor = null; pastMark = false; clearTimeout(announceTimer); return; }
    if (!MOTION_ON) { playedAnchor = a; return; }

    pastMark = sandbox.month >= a.month;

    // held for the intro timeline that is about to run
    if (pendingIntro) { retractNow(a); return; }

    /* The nodes this timeline was animating were just replaced. Land it on the
       fresh ones, which the redraw already left in their finished state. */
    if (crossTL && crossTL.isActive()) { crossTL.kill(); crossTL = null; settle(); }

    if (playedAnchor && playedAnchor.month === a.month) return;   // redraw, no news
    scheduleAnnounce();
  });

  chart.on('render', ({ hasResult, hasBand }) => {
    if (!MOTION_ON) { unclipSeries(); breathe(false); return; }
    breathe(hasResult && hasBand);
    if (!pendingIntro) return;
    pendingIntro = false;
    introTL?.kill();
    introTL = introTimeline(anchor);
    playedAnchor = anchor;
    crossTL = introTL;
  });

  document.addEventListener('sandbox:load', () => { if (MOTION_ON) pendingIntro = true; });

  sandbox.setMonthHook((m, r) => {
    if (!MOTION_ON || !r || !anchor) return;
    const now = m >= anchor.month;
    if (now === pastMark) return;
    pastMark = now;
    if (now && !(crossTL && crossTL.isActive())) pulse();
  });

  /* ------------------------------------------------ probability envelope */

  let breathTL = null;
  const gBand = $('#g-band');

  /** P10 and P90 are a range, not a line. Letting the edges breathe says the
      band is uncertain without adding a second colour. */
  function breathe(on) {
    if (on && !breathTL) {
      breathTL = gsap.to(gBand, {
        '--band-breath': 1.75,
        '--band-fade': 0.42,
        duration: 2.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    } else if (!on && breathTL) {
      breathTL.kill();
      breathTL = null;
      gsap.set(gBand, { clearProps: '--band-breath,--band-fade' });
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      if (!breathTL) return;
      if (e.isIntersecting) breathTL.play(); else breathTL.pause();
    }, { threshold: 0 }).observe($('#plot'));
  }

  /* -------------------------------------------------------- the scrubber */

  function initScrubber() {
    if (!Draggable) return;
    const wrap = $('#scrubber-wrap');
    const track = $('#scrubber-track');
    const handle = $('#scrubber');
    const proxy = document.createElement('div');

    const rail = () => {
      const r = track.getBoundingClientRect();
      const cs = getComputedStyle(wrap);
      const l = parseFloat(cs.getPropertyValue('--rail-l')) || 0;
      const rr = parseFloat(cs.getPropertyValue('--rail-r')) || 0;
      return { left: r.left + l, width: Math.max(1, r.width - l - rr) };
    };
    const months = () => (sandbox.result ? sandbox.result.months : 360);
    const perMonth = () => rail().width / Math.max(1, months());

    let startMonth = 0;

    const finish = () => {
      sandbox.setDragging(false);
      document.body.classList.remove('is-scrubbing');
      wrap.classList.remove('is-dragging');
    };

    const drag = Draggable.create(proxy, {
      type: 'x',
      trigger: track,
      cursor: 'ew-resize',
      activeCursor: 'grabbing',
      /* Momentum is motion, so it goes away with the preference; the drag
         itself is a control and stays either way. */
      inertia: !!InertiaPlugin && !motion.prefersReduced,
      edgeResistance: 1,
      snap: { x: (v) => Math.round(v / perMonth()) * perMonth() },

      onPressInit() {
        const box = rail();
        this.applyBounds({ minX: 0, maxX: box.width, minY: 0, maxY: 0 });
        const px = Math.max(0, Math.min(box.width, this.pointerX - box.left));
        gsap.set(proxy, { x: px, y: 0 });
        this.update();
      },
      onPress() {
        if (!sandbox.result) return;
        gsap.killTweensOf(proxy);
        startMonth = sandbox.month;
        sandbox.setDragging(true);
        document.body.classList.add('is-scrubbing');
        wrap.classList.add('is-dragging');
        handle.focus({ preventScroll: true });
        sandbox.setMonth((this.x / rail().width) * months());
      },
      onDrag() { sandbox.setMonth((this.x / rail().width) * months()); },
      onThrowUpdate() { sandbox.setMonth((this.x / rail().width) * months()); },
      onRelease() {
        wrap.classList.remove('is-dragging');
        if (!this.isThrowing) finish();
      },
      onThrowComplete: finish,
    })[0];

    sandbox.setDragCanceller(() => {
      gsap.killTweensOf(proxy);
      drag.disable();
      drag.enable();
      sandbox.setMonth(startMonth);
      finish();
    });
  }

  /* ------------------------------------------------------- segment slide */

  function initSegments() {
    if (!Flip) return () => {};
    const cleanups = [];
    $$('.segment').forEach((seg) => {
      const opts = $$('.segment__opt', seg);
      if (opts.length < 2) return;
      seg.classList.add('segment--flip');

      opts.slice(1).forEach(() => {
        const d = document.createElement('span');
        d.className = 'segment__div';
        d.setAttribute('aria-hidden', 'true');
        seg.appendChild(d);
      });
      const ind = document.createElement('span');
      ind.className = 'segment__ind';
      ind.setAttribute('aria-hidden', 'true');
      seg.appendChild(ind);

      const selected = () => seg.querySelector('.segment__opt[aria-checked="true"]') || opts[0];
      const place = () => {
        const sel = selected();
        ind.style.left = `${sel.offsetLeft}px`;
        ind.style.top = `${sel.offsetTop}px`;
        ind.style.width = `${sel.offsetWidth}px`;
        ind.style.height = `${sel.offsetHeight}px`;
        $$('.segment__div', seg).forEach((d, i) => { d.style.left = `${opts[i + 1].offsetLeft - 1}px`; });
      };
      place();
      let last = selected();

      /* The selected block is one object that moves, not two that swap fills,
         so aria-checked is the single source of truth and Flip follows it.

         syncControls() rewrites aria-checked on every recompute, which is once
         per frame while a slider is down. An attribute set to the value it
         already had still records a mutation, so the choice itself has to be
         the gate, not the attribute write. */
      const mo = new MutationObserver(() => {
        const sel = selected();
        if (sel === last) return;
        last = sel;
        if (!MOTION_ON) { place(); return; }
        const state = Flip.getState(ind);
        place();
        Flip.from(state, { duration: 0.28, ease: 'power3.out', scale: true });
      });
      opts.forEach((o) => mo.observe(o, { attributes: true, attributeFilter: ['aria-checked'] }));

      const onResize = () => place();
      window.addEventListener('resize', onResize);
      cleanups.push(() => {
        mo.disconnect();
        window.removeEventListener('resize', onResize);
        seg.classList.remove('segment--flip');
        ind.remove();
        $$('.segment__div', seg).forEach((d) => d.remove());
      });
    });
    return () => cleanups.forEach((f) => f());
  }

  /* -------------------------------------------------------------- drawers */

  function initDrawers() {
    const offs = [];
    $$('details.drawer').forEach((d) => {
      const panel = $('.drawer__panel', d);
      const summary = $('summary', d);
      if (!panel || !summary) return;

      const onToggle = () => {
        if (!MOTION_ON || !d.open) return;
        const mt = parseFloat(getComputedStyle(panel).marginTop) || 0;
        gsap.killTweensOf(panel);
        gsap.fromTo(panel,
          { height: 0, marginTop: 0, autoAlpha: 0, overflow: 'hidden' },
          {
            height: 'auto', marginTop: mt, autoAlpha: 1,
            duration: 0.32, ease: 'power3.out',
            clearProps: 'height,marginTop,overflow,opacity,visibility',
          });
      };
      /* Native <details> closes instantly, which loses the connection between
         the panel and the number it explains. Hold the close for one tween. */
      const onClick = (e) => {
        if (!MOTION_ON || !d.open) return;
        e.preventDefault();
        gsap.killTweensOf(panel);
        gsap.to(panel, {
          height: 0, marginTop: 0, autoAlpha: 0, overflow: 'hidden',
          duration: 0.22, ease: 'power2.in',
          onComplete() { d.open = false; gsap.set(panel, { clearProps: 'all' }); },
        });
      };
      d.addEventListener('toggle', onToggle);
      summary.addEventListener('click', onClick);
      offs.push(() => {
        d.removeEventListener('toggle', onToggle);
        summary.removeEventListener('click', onClick);
        gsap.set(panel, { clearProps: 'all' });
      });
    });
    return () => offs.forEach((f) => f());
  }

  /* --------------------------------------------------------------- toasts */

  function initToasts() {
    const host = $('#toast-region');
    if (!host) return () => {};
    const mo = new MutationObserver((records) => {
      if (!MOTION_ON) return;
      records.forEach((r) => r.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement) || !n.classList.contains('toast')) return;
        /* The toast's CSS transition owns its exit. Suspend it for the
           entrance so the two are not animating the same property at once;
           clearProps hands it back. */
        n.style.transition = 'none';
        gsap.fromTo(n,
          { autoAlpha: 0, y: 12 },
          {
            autoAlpha: 1, y: 0, duration: 0.28, ease: 'power3.out',
            /* No scale, and no 3D transform. Scaling a text panel resamples a
               rasterised bitmap, and translate3d promotes the toast onto its
               own compositor layer, which drops subpixel antialiasing. Either
               one leaves the message looking blurred for the whole entrance —
               and the entrance is exactly when people read it. A 2D translate
               of whole pixels keeps the type sharp on every frame. */
            force3D: false,
            clearProps: 'transform,opacity,visibility',
            /* Hand the transition back a frame later, so removing the inline
               opacity is not itself something the transition interpolates. */
            onComplete() { requestAnimationFrame(() => { n.style.transition = ''; }); },
          });
      }));
    });
    mo.observe(host, { childList: true });
    return () => mo.disconnect();
  }

  /* ------------------------------------------------------ scenario cards */

  let chipDrags = [];

  function killChipDrags() {
    chipDrags.forEach((d) => d.kill());
    chipDrags = [];
  }

  function initTray() {
    const tray = $('#tray');
    const sc = sandbox.scenarios;
    if (!tray || !sc) return;

    function bindChips() {
      killChipDrags();
      if (!Draggable) return;
      const slots = $$('.tray__slot', tray);
      $$('.chip', tray).forEach((chip) => {
        const grip = $('.chip__grip', chip);
        if (!grip) return;
        chipDrags.push(Draggable.create(chip, {
          type: 'x,y',
          trigger: grip,
          zIndexBoost: true,
          minimumMovement: 4,
          cursor: 'grab',
          activeCursor: 'grabbing',
          onDragStart() {
            chip.classList.add('is-dragging');
          },
          onDrag() {
            slots.forEach((s) => {
              const hit = this.hitTest(s, '40%');
              s.classList.toggle('is-drop-valid', hit && !s.contains(chip));
            });
          },
          onDragEnd() {
            chip.classList.remove('is-dragging');
            let target = -1;
            slots.forEach((s, i) => {
              if (this.hitTest(s, '40%')) target = i;
              s.classList.remove('is-drop-valid');
            });
            const filled = sc.count;
            if (target >= 0 && target < filled && sc.reorder(chip.dataset.id, target)) return;
            /* No valid slot under the pointer: the card goes home rather than
               being dropped somewhere it cannot live. */
            gsap.to(chip, { x: 0, y: 0, duration: 0.42, ease: 'power3.out' });
          },
        })[0]);
      });
    }

    /* A card that changes slot keeps its identity, so it travels rather than
       teleports. Measured by hand instead of through Flip: the cards live in a
       flex slot inside a grid and change parent when they move, and Flip's
       out-of-flow mode lands them a few pixels off in that arrangement. The
       first/last/invert here is four lines and stays in flow. */
    let trayRects = null;
    sandbox.trayHooks.before = () => {
      trayRects = null;
      if (!MOTION_ON) return;
      trayRects = new Map();
      $$('#tray .chip').forEach((c) => trayRects.set(c.dataset.id, c.getBoundingClientRect()));
    };
    sandbox.trayHooks.after = () => {
      bindChips();
      if (!trayRects) return;
      const was = trayRects;
      trayRects = null;
      $$('#tray .chip').forEach((c) => {
        const from = was.get(c.dataset.id);
        if (!from) {
          // a card that was just saved arrives rather than appears
          gsap.fromTo(c,
            { autoAlpha: 0, scale: 0.94, y: 10 },
            { autoAlpha: 1, scale: 1, y: 0, duration: 0.44, ease: 'power3.out', clearProps: 'all' });
          return;
        }
        const now = c.getBoundingClientRect();
        const dx = from.left - now.left;
        const dy = from.top - now.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        gsap.fromTo(c, { x: dx, y: dy },
          { x: 0, y: 0, duration: 0.44, ease: 'power3.out', clearProps: 'transform' });
      });
    };
    bindChips();
  }

  /* --------------------------------------------------- reduced motion gate */

  const mm = gsap.matchMedia();
  mm.add(
    { reduce: '(prefers-reduced-motion: reduce)', any: 'all' },
    (ctx) => {
      MOTION_ON = !ctx.conditions.reduce;

      if (!MOTION_ON) {
        /* Everything the timelines would have produced, applied at once. The
           annotation, the curves and the numbers are all already correct in
           the DOM; this only clears anything a running tween had touched. */
        crossTL?.kill(); crossTL = null;
        introTL?.kill(); introTL = null;
        unclipSeries();
        settle();
        breathe(false);
        playedAnchor = anchor;
        return;
      }

      const offSeg = initSegments();
      const offDrawers = initDrawers();
      const offToasts = initToasts();

      return () => {
        crossTL?.kill(); crossTL = null;
        introTL?.kill(); introTL = null;
        unclipSeries();
        settle();
        breathe(false);
        offSeg(); offDrawers(); offToasts();
      };
    },
  );

  /* Interaction, not decoration: these are built once and stay built under
     any motion preference. */
  initScrubber();
  initTray();

  /* main.js has already booted by the time this module runs, so a shared link
     that arrived with numbers in it has drawn its curves before anyone was
     listening. Replay that one render as the plot it should have been. */
  if (MOTION_ON && sandbox.result) {
    pendingIntro = true;
    chart.repriceOnly();          // re-emits the crossing; the handler holds it
    pendingIntro = false;
    introTL = introTimeline(anchor);
    playedAnchor = anchor;
    crossTL = introTL;
    breathe(!!sandbox.result.band);
  }

  /* Nothing should outlive the page. */
  window.addEventListener('pagehide', () => {
    crossTL?.kill();
    introTL?.kill();
    breathe(false);
  });
}
