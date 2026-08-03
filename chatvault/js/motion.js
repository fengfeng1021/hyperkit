/* ChatVault motion layer.

   One authored moment, in six phases, and a small number of confirmations that
   belong to the same physical world. Nothing here is required for the page to
   work: every element it touches is already rendered at its resting state, so
   if the GSAP CDN never answers, or the reader has asked for reduced motion,
   this module registers nothing and the catalogue is simply still.

   THE MOMENT: opening the drawer.

     1  approach   the drop zone rises under a dragged file
     2  mouth      an amber mark opens at the top of the cavity, which is the
                   point every card is about to be thrown from
     3  fill       every parsed batch is thrown from that mark into the stack,
                   staggered from the centre, each sliver trailing two ghosts.
                   The stack is a histogram, so the drawer fills with the real
                   shape of the archive, ring by ring
     4  tabs       one amber tab rises for each real term pulled out of the
                   inverted index while it is being built, and the row of tabs
                   slides left to keep the newest at the edge
     5  seal       the whole stack takes one breath, one pass of light reads it
                   end to end, and it then compresses into a single 3px line
     6  handover   the drawer front travels down and shuts, the entry page goes,
                   the cabinet wipes in from the top, and that same line of
                   slivers grows outward from the centre as the spine strip

   From then on the spine strip is the search: every query travels the strip as
   a wave, hits rising to full ink, everything else falling to 0.08 alpha. The
   shape left on screen is the answer, which is why it is worth animating.

   Anything not on that list is a confirmation of a physical action: the drawer
   front under a dragged file, the export menu opening out of its button, and
   the messages that actually differ after a branch switch resolving into view.
*/

import { on } from "./state.js";

const gsap = typeof window !== "undefined" ? window.gsap : null;

const el = {};
const ui = {};
let live = false;
let flightUntil = 0;
let ringUntil = 0;
let spineTween = null;

if (gsap) install();

/* ------------------------------------------------------------------ setup */

function install() {
  gsap.defaults({ duration: 0.18, ease: "power4.out" });
  // Module scripts run after the document is parsed, so the markup is here.
  cacheElements();

  // Subscriptions are permanent; every handler is inert while live is false,
  // so a reader who turns reduced motion on mid-session gets the static build
  // from the next event onwards without anything having to be rebuilt.
  on("ui:ready", (parts) => {
    Object.assign(ui, parts);
    cacheElements();
    if (live) attachSpine();
  });
  on("ingest:start", onIngestStart);
  on("ingest:batch", onBatch);
  on("vault:closing", onClosing);
  on("vault:loaded", onLoaded);
  on("reader:rendered", onReaderRendered);

  const mm = gsap.matchMedia();
  mm.add(
    {
      reduce: "(prefers-reduced-motion: reduce)",
      ok: "(prefers-reduced-motion: no-preference)",
    },
    (ctx) => {
      if (ctx.conditions.reduce) return undefined; // resting state, which is the built state
      live = true;
      const observers = watchDom();
      attachSpine();
      return () => {
        live = false;
        for (const o of observers) o.disconnect();
        detachSpine();
        restDrawer();
        stopDrawerTicker();
      };
    }
  );
}

function cacheElements() {
  el.dropzone = document.getElementById("dropzone");
  el.plate = document.querySelector(".dropzone__plate");
  el.cavity = document.querySelector(".dropzone__cavity");
  el.tabstrip = document.getElementById("tabstrip");
  el.entry = document.querySelector(".entry");
  el.workspace = document.getElementById("workspace");
  el.spine = document.getElementById("spine");
  el.popover = document.getElementById("export-popover");
  el.readerTrack = document.querySelector(".reader__track");
}

/* Attribute watchers rather than extra listeners: the state machine in main.js
   already decides what the drop zone and the export menu are doing, and this
   layer only reacts to the decision. */
function watchDom() {
  const out = [];
  if (el.dropzone) {
    const mo = new MutationObserver(() => onZoneState(el.dropzone.dataset.state));
    mo.observe(el.dropzone, { attributes: true, attributeFilter: ["data-state"] });
    out.push(mo);
  }
  if (el.popover) {
    const mo = new MutationObserver(() => {
      if (!live || el.popover.hidden) return;
      gsap.fromTo(
        el.popover,
        { clipPath: "inset(0 0 100% 0)" },
        { clipPath: "inset(0 0 0% 0)", duration: 0.18, ease: "power3.out", clearProps: "clipPath" }
      );
    });
    mo.observe(el.popover, { attributes: true, attributeFilter: ["hidden"] });
    out.push(mo);
  }
  if (el.tabstrip) {
    const mo = new MutationObserver((records) => onTabsAdded(records));
    mo.observe(el.tabstrip, { childList: true });
    out.push(mo);
  }
  return out;
}

/* --------------------------------------------------- the drawer repaint clock

   The canvas repaints only when something asks it to. Rather than marking it
   dirty from every one of a few thousand staggered tweens, one ticker callback
   marks it once per frame for as long as drawer motion is scheduled. */

let drawerTicking = false;
let drawerUntil = 0;

function drawerFor(seconds) {
  drawerUntil = Math.max(drawerUntil, performance.now() + seconds * 1000 + 140);
  if (!drawerTicking) {
    drawerTicking = true;
    gsap.ticker.add(drawerTick);
  }
}

function drawerTick() {
  if (ui.drawer) ui.drawer.markDirty();
  if (performance.now() > drawerUntil) stopDrawerTicker();
}

function stopDrawerTicker() {
  if (!drawerTicking) return;
  gsap.ticker.remove(drawerTick);
  drawerTicking = false;
}

/* Reduced motion turned on mid import: put every sliver back on its shelf
   rather than leaving the ones in flight stranded in the air. */
function restDrawer() {
  const d = ui.drawer;
  if (!d) return;
  gsap.killTweensOf([d.mouth, d.field, d.sweep, ...d.slivers]);
  d.field.scale = 1;
  d.mouth.a = 0;
  d.sweep.a = 0;
  for (const s of d.slivers) {
    s.ox = 0;
    s.oy = 0;
    s.alpha = 1;
    s.scale = 1;
  }
  d.relayout();
  d.markDirty();
}

/* ---------------------------------------------------- 1: under a dragged file */

function onZoneState(next) {
  if (!live || !el.dropzone) return;
  if (next === "dragover") {
    gsap.to(el.dropzone, { y: -4, duration: 0.2, ease: "power3.out" });
    gsap.to(el.plate, { scaleY: 2, transformOrigin: "50% 0%", duration: 0.2, ease: "power3.out" });
  } else if (next === "idle" || next === "error") {
    gsap.to(el.dropzone, { y: 0, duration: 0.26, ease: "power3.out", clearProps: "transform" });
    gsap.to(el.plate, { scaleY: 1, duration: 0.26, ease: "power3.out", clearProps: "transform" });
  }
}

/* ------------------------------------------------------- 2: the drawer opens */

function onIngestStart() {
  if (!live || !ui.drawer) return;
  const d = ui.drawer;
  gsap.killTweensOf([d.mouth, d.field, d.sweep]);
  d.field.scale = 1;
  d.sweep.a = 0;
  d.mouth.a = 0;
  gsap.to(d.mouth, { a: 1, duration: 0.34, ease: "power3.out" });
  gsap.to(el.dropzone, { y: 0, duration: 0.2, clearProps: "transform" });
  gsap.to(el.plate, { scaleY: 1, duration: 0.2, clearProps: "transform" });
  flightUntil = 0;
  ringUntil = 0;
  drawerFor(0.4);
}

/* ------------------------------------- 3: a batch of cards lands in the drawer */

function onBatch() {
  if (!live || !ui.drawer) return;
  const d = ui.drawer;
  const batch = d.lastBatch;
  if (!batch || !batch.length || !d.cssWidth) return;

  const mouthX = d.mouthX || d.cssWidth / 2;
  for (const s of batch) {
    s.ox = mouthX - s.x + (Math.random() * 20 - 10);
    s.oy = -s.y - 6; // launch from the mark at the top of the cavity
    s.alpha = 0;
    s.scale = 0.35;
  }

  // 0.004s apart is the intended cadence; the clamp keeps a 12 card ring long
  // enough to read and a 200 card ring short enough not to hold up the import.
  const amount = Math.min(0.85, Math.max(0.22, batch.length * 0.004));
  const duration = 0.64;

  // A small export is parsed so fast that every ring would be announced in the
  // same millisecond. Rings therefore queue behind each other, up to a limit,
  // so that the drawer is seen filling in stages rather than in one flash. A
  // large export arrives slowly enough that the queue is always already empty.
  const now = performance.now();
  const delay = Math.min(0.75, Math.max(0, (ringUntil - now) / 1000));
  ringUntil = now + delay * 1000 + amount * 750;
  flightUntil = now + (delay + amount + duration) * 1000;
  drawerFor(delay + amount + duration);

  gsap.to(batch, {
    ox: 0,
    oy: 0,
    alpha: 1,
    scale: 1,
    delay,
    duration,
    ease: "power4.out",
    stagger: { amount, from: "center" },
  });
}

/* --------------------------------------------- 4: index tabs rise from the stack */

function onTabsAdded(records) {
  if (!live || !el.tabstrip) return;
  const added = [];
  for (const r of records) {
    for (const node of r.addedNodes) if (node.nodeType === 1) added.push(node);
  }
  if (!added.length) return;

  gsap.from(added, { yPercent: 120, duration: 0.24, ease: "power3.out" });

  // Everything already on the strip slides left by exactly the width the new
  // tab took, so the newest term is always at the edge and the row reads as one
  // continuous drift rather than a series of jumps.
  const tabs = [...el.tabstrip.children];
  const older = tabs.slice(0, tabs.length - added.length);
  if (!older.length) return;
  const gap = parseFloat(getComputedStyle(el.tabstrip).columnGap) || 6;
  const shift = added.reduce((n, node) => n + node.offsetWidth + gap, 0);
  gsap.fromTo(
    older,
    { x: shift },
    { x: 0, duration: 0.28, ease: "none", overwrite: "auto", clearProps: "x" }
  );
}

/* ------------------------------------------------- 5 and 6: sealing and handover */

function onClosing(e) {
  // Only when the drawer is the thing on screen. A second import into an open
  // vault has no drawer to shut, and must not be made to wait for one.
  if (!live || !e || !e.fresh) return;
  if (document.documentElement.dataset.vault !== "empty") return;
  if (!ui.drawer || !el.dropzone) return;
  e.wait(closeDrawer());
}

function closeDrawer() {
  const d = ui.drawer;
  const cavityH = el.cavity ? el.cavity.offsetHeight : 320;
  const line = (d.floorY || cavityH - 34) - 3;
  const hasStack = d.slivers.length > 0 && !!d.cssWidth;
  // Wait for whatever is still in flight, but never for long: the compression
  // below takes over any unfinished flight rather than queueing behind it.
  const settle = Math.min(0.7, Math.max(0, (flightUntil - performance.now()) / 1000));

  drawerFor(settle + 1.5);

  // Positions are absolute and relative to `settle` so the shape of the seal is
  // readable here rather than assembled out of relative offsets.
  const tl = gsap.timeline();
  const at = (t) => settle + t;

  if (hasStack) {
    // one breath: the vault is whole
    tl.to(d.field, { scale: 1.06, duration: 0.2, ease: "power2.out" }, at(0))
      .to(d.field, { scale: 1, duration: 0.36, ease: "power3.out" }, at(0.2));
    // one pass of light reads the stack end to end
    tl.fromTo(
      d.sweep,
      { p: 0, a: 0.78 },
      { p: 1, duration: 0.44, ease: "power2.inOut" },
      at(0)
    ).to(d.sweep, { a: 0, duration: 0.14, ease: "power2.in" }, at(0.34));
    // and the stack compresses into the single line it lives as from now on
    tl.to(
      d.slivers,
      {
        ox: 0,
        oy: (i, target) => line - target.y,
        h: 3, // down to the thickness the spine strip draws them at
        scale: 1,
        alpha: 0.85,
        duration: 0.42,
        ease: "power3.inOut",
        // "auto" rather than true: a ring still in flight keeps flying until
        // this tween actually starts, and is then taken over property by
        // property instead of being frozen the moment the seal is scheduled.
        overwrite: "auto",
        stagger: { amount: 0.18, from: "center" },
      },
      at(0.26)
    );
    tl.to(d.mouth, { a: 0, duration: 0.24, ease: "power2.in" }, at(0.26));
  }

  // the drawer front travels the depth of the cavity and shuts over the stack
  const shutAt = at(hasStack ? 0.82 : 0);
  tl.to(el.plate, { y: cavityH - 3, duration: 0.4, ease: "power3.in" }, shutAt).fromTo(
    el.cavity,
    { clipPath: "inset(0% 0 0 0)" },
    { clipPath: "inset(100% 0 0 0)", duration: 0.4, ease: "power3.in" },
    shutAt
  );

  // and the entry page steps back so the cabinet can take the screen
  tl.to(el.entry, { autoAlpha: 0, y: 10, duration: 0.22, ease: "power2.in" }, shutAt + 0.3);

  return tl.then();
}

function onLoaded(payload) {
  if (!live) return;
  const fresh = !!(payload && payload.meta && payload.meta.fresh);

  // The entry page is display:none by now, so its inline state is dropped
  // rather than left behind for a second import to inherit.
  gsap.set([el.entry, el.plate, el.cavity, el.dropzone].filter(Boolean), { clearProps: "all" });

  const targets = [el.spine, el.workspace].filter(Boolean);
  if (targets.length) {
    gsap.fromTo(
      targets,
      { clipPath: "inset(0 0 100% 0)" },
      {
        clipPath: "inset(0 0 0% 0)",
        duration: fresh ? 0.52 : 0.38,
        ease: "power4.out",
        stagger: 0.06,
        clearProps: "clipPath",
      }
    );
  }
  growSpine(fresh ? 0.62 : 0.44);
}

/* ---------------------------------------------------------- the spine strip */

function attachSpine() {
  if (ui.spine) ui.spine.transition = spineTransition;
}

function detachSpine() {
  if (spineTween) spineTween.kill();
  spineTween = null;
  if (ui.spine) {
    delete ui.spine.transition;
    ui.spine.settle();
    ui.spine.markDirty();
  }
}

/* One tween drives the whole strip. A stagger would mean one tween per
   conversation on every keystroke, which is fine for the sample and not fine
   for a vault of several thousand; a single proxy with a positional delay costs
   the same at any size and produces the same travelling wave. */
function runSpineWave({ duration, from, spread, power }) {
  const strip = ui.spine;
  if (!strip) return null;
  const sl = strip.slivers;
  const n = sl.length;
  if (!n) return null;

  for (const s of sl) {
    s.fa = s.alpha;
    s.fs = s.scale;
  }
  if (spineTween) spineTween.kill();

  const centre = (n - 1) / 2 || 1;
  const p = { v: 0 };
  // The proxy runs linear on purpose: the exponential ease-out is applied per
  // sliver below, after its own position in the wave has been taken off, so
  // every sliver gets the full curve rather than a slice of a shared one.
  spineTween = gsap.to(p, {
    v: 1,
    duration,
    ease: "none",
    onUpdate() {
      const v = p.v * (1 + spread);
      for (let i = 0; i < n; i++) {
        const s = sl[i];
        const u = from === "center" ? Math.abs(i - centre) / centre : i / Math.max(1, n - 1);
        const local = Math.min(1, Math.max(0, v - u * spread));
        const e = 1 - Math.pow(1 - local, power);
        s.alpha = s.fa + (s.ta - s.fa) * e;
        s.scale = s.fs + (s.ts - s.fs) * e;
      }
      strip.markDirty();
    },
    onComplete() {
      strip.settle();
      strip.markDirty();
      spineTween = null;
    },
  });
  return spineTween;
}

/* Every keystroke: the query travels the strip oldest to newest. What is left
   standing is the result set. */
function spineTransition() {
  runSpineWave({ duration: 0.3, from: "start", spread: 0.36, power: 3 });
}

/* The handover: the compressed line of slivers opens out from the centre. */
function growSpine(duration) {
  const strip = ui.spine;
  if (!strip || !strip.slivers.length) return;
  for (const s of strip.slivers) {
    s.alpha = 0;
    s.scale = 0.06;
  }
  runSpineWave({ duration, from: "center", spread: 0.5, power: 4 });
}

/* ----------------------------------------------- branch switches in the reader */

/* Only the messages that actually differ carry .is-changed, so only they
   resolve into view. Everything the two branches share stays exactly where it
   was, which is the whole point: the movement names the difference.
   The rows are positioned by the virtual list through transform, so this
   animates opacity and focus instead of touching that transform. */
function onReaderRendered(payload) {
  if (!live || !payload || !payload.changed || !payload.changed.size) return;
  const host = el.readerTrack || document.querySelector(".reader__track");
  if (!host) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const rows = host.querySelectorAll(".msg.is-changed");
      if (!rows.length) return;
      // The virtual list recycles these nodes. Clearing first means a second
      // branch switch mid-animation can never strand a row at low opacity.
      gsap.killTweensOf(host.children);
      gsap.set(host.children, { clearProps: "opacity,visibility,filter" });
      gsap.fromTo(
        rows,
        { autoAlpha: 0, filter: "blur(5px)" },
        {
          autoAlpha: 1,
          filter: "blur(0px)",
          duration: 0.34,
          ease: "power3.out",
          stagger: 0.05,
          clearProps: "opacity,visibility,filter",
        }
      );
    });
  });
}
