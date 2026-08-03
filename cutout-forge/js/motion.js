/* ==========================================================================
   Cutout Forge - motion layer

   ONE authored moment, not a set of effects: the wall developing.

   Every tween below belongs to that one moment and can be said in a sentence:

     entrance    the batch is countable - 200 thumbnails arrive as a single
                 body of work, from the centre outward, so the eye reads the
                 size of the job before it reads any one photo
     beam        the machine is measuring this photo right now, at a constant
                 rate, and it has not finished
     reveal      the measurement reached the bottom edge, so the background
                 dissolves - the beam is the cause, the cutout is the effect
     flinch      this specific tile just resolved; a 90ms confirmation, plus a
                 1px ring, that you can catch out of the corner of your eye
                 anywhere across 200 tiles
     ledger      the money you did not spend moved, and it moved because of
                 the photo that just landed
     regroup     the job is over and the wall has been reorganised into what
                 you have to do next
     receipt     the one frame worth screenshotting

   Nothing here is required for the interface to work. main.js exposes named
   hooks that are no-ops until this file registers against them, every custom
   property starts at a value that hides nothing, and if GSAP is blocked this
   module simply never runs. Under prefers-reduced-motion nothing registers at
   all: the wall still fills, the bands still group, the ledger is still
   correct, and .tile__runline replaces the beam with a static rule.
   ========================================================================== */

const gsap = window.gsap;
const Flip = window.Flip;
const forge = window.forge;

if (gsap && forge && forge.queue) boot();

function boot() {
  if (Flip) gsap.registerPlugin(Flip);

  /* Exponential ease-out from an already-visible state is the house default.
     "none" appears in exactly one place below - the scan beam - because a
     scan is a constant-rate measurement and easing it would turn an
     instrument into an ornament. */
  gsap.defaults({ ease: 'power3.out', duration: 0.42 });

  const q = forge.queue;
  const matrix = document.getElementById('matrix');
  const stage = document.getElementById('inspectorStage');
  if (!matrix) return;

  /* Rolling estimate of one photo's processing time, seeded at the measured
     WebGPU figure and corrected from real timings. The beam is paced from
     this, so it is a readout, not a decoration. */
  let avgMs = 420;

  /* `transform` on a .tile is a single shared channel - arrival, the resolve
     flinch and the regroup all want it, and GSAP will not let a CSS `scale`
     stand in as a second one. So it is sequenced by hand: the arrival is
     landed before the wall is measured, in-flight flinches are landed before
     Flip takes over, and no flinch is started while a regroup is running.
     The dissolve and the ring drive custom properties, so they are free to
     keep playing through all of it. */
  const beams = new Map();   // item id -> the beam tween
  const flinches = new Map();// item id -> the resolve flinch timeline
  let entrance = null;       // the centre-out stagger, while it runs
  let regrouping = false;    // true for the length of the Flip
  let wallState = null;      // Flip state captured just before regrouping
  let receipt = null;        // the end-of-batch plate, when it is up
  let live = null;           // the controller, null under reduced motion

  /* ---------------------------------------------------------------- beam */

  function startBeam(id, li) {
    if (beams.has(id)) return;
    li.style.setProperty('--scan', '-8%');
    beams.set(id, gsap.to(li, {
      '--scan': '96%',
      duration: Math.min(3.5, Math.max(0.3, avgMs / 1000)),
      ease: 'none',
    }));
  }

  /* The beam always finishes its run before the photo develops. If the result
     lands early the beam clears the frame at the same constant rate; if it
     lands late the beam has been holding just short of the bottom edge, which
     is what a stalled measurement actually looks like. */
  function finishBeam(id, li, then) {
    const beam = beams.get(id);
    if (beam) { beam.kill(); beams.delete(id); }
    gsap.to(li, { '--scan': '110%', duration: 0.12, ease: 'none', onComplete: then });
  }

  /* -------------------------------------------------------------- reveal */

  function flinch(id, li, from, to, up, down) {
    const tl = gsap.timeline({
      onComplete: () => {
        flinches.delete(id);
        gsap.set(li, { clearProps: 'transform,opacity,visibility' });
        stripShims([li]);
      },
    })
      .to(li, { autoAlpha: 1, scale: from, duration: up, ease: 'power2.out', overwrite: 'auto' })
      .to(li, { scale: to, duration: down, ease: 'power3.out' });
    flinches.set(id, tl);
  }

  function reveal(id, li, t) {
    const original = t && t.original;

    li.classList.add('is-revealing');
    li.style.setProperty('--erase', '0%');
    li.style.setProperty('--ring', '0');
    /* The done state fades the original out in CSS. Pin it opaque for the
       length of the dissolve so the mask is what removes it, then hand it
       back to the stylesheet already at zero. */
    if (original) gsap.set(original, { opacity: 1 });

    gsap.timeline({
      onComplete: () => {
        if (original) gsap.set(original, { opacity: 0 });
        li.classList.remove('is-revealing');
        li.style.removeProperty('--erase');
        li.style.removeProperty('--ring');
        li.style.removeProperty('--scan');
        if (original) requestAnimationFrame(() => gsap.set(original, { clearProps: 'opacity' }));
      },
    })
      .to(li, { '--erase': '100%', duration: 0.46, ease: 'power3.out' }, 0)
      .to(li, { '--ring': 1, duration: 0.08, ease: 'none' }, 0.04)
      .to(li, { '--ring': 0, duration: 0.34, ease: 'power3.out' }, 0.12);

    /* The flinch is the one part of the reveal that needs `transform`, so it
       is skipped for the handful of photos that land while the wall is
       already regrouping. The dissolve above always plays. */
    if (!regrouping) flinch(id, li, 1.04, 1, 0.09, 0.24);
  }

  /* ---------------------------------------------------------------- Flip */

  /* Land the arrival stagger before measuring or regrouping: it owns the same
     transform channel Flip is about to take, and a tile caught mid-entrance
     would be measured at the wrong size. */
  function landEntrance() {
    if (entrance && entrance.isActive()) entrance.progress(1);
    entrance = null;
  }

  function captureWall() {
    if (!Flip) return;
    landEntrance();
    const els = matrix.querySelectorAll('.tile, .band-label');
    wallState = els.length ? Flip.getState(els) : null;
  }

  /* GSAP normalises the independent transform properties to `none` inline
     whenever it drives `transform`. Left behind on a tile that is over, that
     would permanently disable the `scale` channel the arrival and the flinch
     ride on, so every transform user hands the element back clean. */
  function releaseTransform(els) {
    for (const el of els) {
      for (const p of ['transform', 'translate', 'rotate', 'scale']) el.style.removeProperty(p);
    }
  }

  /* clearProps: "transform" takes the matrix back but leaves the three shims
     behind. Nothing here ever animates them, so stripping them is safe at any
     moment, including while a transform tween is still running. */
  function stripShims(els) {
    for (const el of els) {
      for (const p of ['translate', 'rotate', 'scale']) el.style.removeProperty(p);
    }
  }

  function regroup() {
    landEntrance();
    /* Land every flinch still in flight, then hold the channel for Flip. */
    for (const tl of Array.from(flinches.values())) tl.progress(1);
    regrouping = true;

    const labels = matrix.querySelectorAll('.band-label');
    if (labels.length) {
      gsap.from(labels, {
        autoAlpha: 0, y: -10, duration: 0.44, ease: 'power3.out',
        stagger: 0.07, delay: 0.16,
        clearProps: 'transform,opacity,visibility',
        onComplete: () => stripShims(labels),
      });
    }
    if (!Flip || !wallState) { regrouping = false; return; }
    Flip.from(wallState, {
      duration: 0.72,
      ease: 'power3.inOut',
      stagger: { each: 0.0025, from: 'start' },
      simple: true,
      onComplete: () => {
        regrouping = false;
        releaseTransform(matrix.querySelectorAll('.tile, .band-label'));
      },
    });
    wallState = null;
  }

  /* ------------------------------------------------------------- receipt */

  function dismissReceipt(immediate) {
    if (!receipt) return;
    const r = receipt;
    receipt = null;
    r.hold.kill();
    for (const type of ['pointerdown', 'keydown', 'wheel']) {
      window.removeEventListener(type, r.onAny, true);
    }
    /* The rail figure comes back synchronously, never on a tween. Nothing
       about a decorative beat is allowed to leave the number invisible if the
       ticker stops mid-dismiss. */
    if (r.source) gsap.set(r.source, { clearProps: 'opacity,visibility' });
    /* Immediate means gone now, not gone on the next frame: teardown and a
       new batch both have to leave a clean floor without waiting on a tick. */
    if (immediate) { gsap.killTweensOf(r.node); r.node.remove(); return; }
    gsap.to(r.node, { autoAlpha: 0, duration: 0.34, ease: 'power2.out', onComplete: () => r.node.remove() });
  }

  function buildReceipt(counts) {
    const source = document.getElementById('ledgerAmount');
    const priced = source && !source.classList.contains('is-unset');

    const node = document.createElement('div');
    node.className = 'receipt';
    node.setAttribute('aria-hidden', 'true');

    const scrim = document.createElement('div');
    scrim.className = 'receipt__scrim';

    const plate = document.createElement('div');
    plate.className = 'receipt__plate';

    const label = document.createElement('p');
    label.className = 'receipt__label';
    label.textContent = priced ? 'You have not spent' : 'Cut out in this tab';

    const amount = document.createElement('strong');
    amount.className = 'receipt__amount mono';
    amount.textContent = priced ? source.textContent : String(counts.total);

    const note = document.createElement('p');
    note.className = 'receipt__note';
    const tail = [];
    if (counts.flagged) tail.push(`${counts.flagged} need a look`);
    if (counts.failed) tail.push(`${counts.failed} failed`);
    note.textContent = priced
      ? `${counts.total} photos cut out in this browser tab. Nothing uploaded.`
      : 'Nothing uploaded, nothing metered, no upload limit.';
    if (tail.length) note.textContent += ` ${tail.join(', ')}.`;

    plate.append(label, amount, note);
    node.append(scrim, plate);
    return { node, plate, scrim, amount, source: priced ? source : null };
  }

  /* The one frame a seller screenshots. It is a plate, not a modal: it takes
     no focus, passes every pointer through to the wall behind it, and any
     keystroke, click or scroll clears it early. */
  function showReceipt(counts) {
    if (counts.total < 3) return;
    dismissReceipt(true);

    const r = buildReceipt(counts);
    gsap.set(r.node, { autoAlpha: 0 });
    document.body.append(r.node);
    r.onAny = () => dismissReceipt(false);
    r.hold = gsap.delayedCall(2.24, () => dismissReceipt(false));
    /* Registered before anything can be hidden, so there is no window in
       which a throw would strand the ledger figure. */
    receipt = r;

    const src = r.source ? r.source.getBoundingClientRect() : null;
    const dst = r.amount.getBoundingClientRect();
    const box = r.plate.getBoundingClientRect();
    gsap.set(r.node, { autoAlpha: 1 });

    gsap.fromTo(r.scrim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'power2.out' });

    if (src && src.height > 0 && dst.height > 0) {
      /* Grow the number out of the rail from its own centre, so the plate
         reads as the ledger enlarging rather than a panel appearing. */
      gsap.set(r.plate, {
        transformOrigin: `${dst.left + dst.width / 2 - box.left}px ${dst.top + dst.height / 2 - box.top}px`,
      });
      gsap.set(r.source, { autoAlpha: 0 });
      gsap.fromTo(r.plate, {
        x: (src.left + src.width / 2) - (dst.left + dst.width / 2),
        y: (src.top + src.height / 2) - (dst.top + dst.height / 2),
        scale: Math.max(0.08, src.height / dst.height),
        autoAlpha: 0,
      }, { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: 0.74, ease: 'power3.out' });
    } else {
      gsap.fromTo(r.plate, { scale: 0.94, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.6, ease: 'power3.out' });
    }

    /* Registered last, so a stray pointerdown cannot re-enter this function
       part way through building the plate. */
    for (const type of ['pointerdown', 'keydown', 'wheel']) {
      window.addEventListener(type, r.onAny, { capture: true, passive: true });
    }
  }

  /* ---------------------------------------------------------- controller */

  function makeMotion() {
    /* The ledger number. gsap tweens a proxy and hands the value back through
       the callback main.js supplies, so the DOM writing stays in ledger.js. */
    const money = { v: 0 };
    let moneyStarted = false;

    forge.setLedgerAnimator((from, to, onUpdate) => {
      if (!moneyStarted) { money.v = from; moneyStarted = true; }
      gsap.to(money, {
        v: to, duration: 0.5, ease: 'power3.out', overwrite: true,
        onUpdate: () => onUpdate(money.v),
        onComplete: () => onUpdate(to),
      });
      const amountEl = document.getElementById('ledgerAmount');
      if (!amountEl) return;
      /* Every hundred dollars is a bigger beat, because that is the threshold
         the interface already marks with a colour step. */
      const crossed = Math.floor(to / 100) > Math.floor(from / 100);
      gsap.fromTo(amountEl,
        { scale: crossed ? 1.1 : 1.035 },
        {
          scale: 1, duration: crossed ? 0.62 : 0.34, ease: 'power3.out',
          overwrite: 'auto', clearProps: 'transform',
        });
    });

    /* The before/after divider. A measurement instrument tracks the pointer,
       so this is 110ms of smoothing, not an animation. */
    if (stage) {
      const proxy = { v: 50 };
      const write = () => stage.style.setProperty('--split', `${proxy.v.toFixed(2)}%`);
      const to = gsap.quickTo(proxy, 'v', { duration: 0.11, ease: 'power3.out', onUpdate: write });
      forge.setSplitDriver(pct => to(pct));
    }

    return {
      tilesAdded(els) {
        if (!els || !els.length) return;
        dismissReceipt(true);
        /* The batch arrives as one body from the centre out. Tiles do not
           exist before this call, so animating them in hides nothing.
           A photo that resolves before its own tile has finished arriving
           takes the transform channel over through the flinch's overwrite,
           which is the right answer: the result outranks the arrival. */
        entrance = gsap.from(els, {
          scale: 0.6,
          autoAlpha: 0,
          duration: 0.62,
          ease: 'power3.out',
          stagger: { from: 'center', grid: 'auto', each: 0.006 },
          clearProps: 'transform,opacity,visibility',
          onComplete: () => stripShims(els),
        });
      },

      item(it, resolved) {
        const t = forge.tiles.get(it.id);
        if (!t) return;
        const li = t.li;

        if (it.status === 'running') { startBeam(it.id, li); return; }
        if (!resolved) return;

        if (Number.isFinite(it.ms) && it.ms > 0) avgMs = avgMs * 0.75 + it.ms * 0.25;

        if (it.status === 'failed' || it.status === 'skipped') {
          const beam = beams.get(it.id);
          if (beam) { beam.kill(); beams.delete(it.id); }
          li.style.removeProperty('--scan');
          /* A fault does not develop. It recoils once and stops. */
          if (!regrouping) flinch(it.id, li, 0.965, 1, 0.1, 0.44);
        } else {
          finishBeam(it.id, li, () => reveal(it.id, li, t));
        }

        /* The last photo has resolved but the wall has not been regrouped
           yet: this is the only moment where the pre-regroup geometry is
           still on screen and final. */
        if (q.counts.pending === 0) captureWall();
      },

      batchComplete({ counts, banded }) {
        if (banded) regroup();
        /* Long enough for the last dissolve to finish and the wall to settle,
           so the number arrives into a quiet room. */
        gsap.delayedCall(banded ? 0.98 : 0.62, () => showReceipt(counts));
      },

      exportDone() {
        const next = document.getElementById('nextStep');
        if (next && !next.hidden) {
          gsap.from(next, {
            autoAlpha: 0, y: -8, duration: 0.5, ease: 'power3.out',
            clearProps: 'transform,opacity,visibility',
            onComplete: () => stripShims([next]),
          });
        }
      },

      /* A backgrounded tab stops requestAnimationFrame, and this product is
         built for someone who switches to their store admin mid-batch. Rather
         than leave half-rendered tweens holding the DOM at an intermediate
         value, land everything: the page a returning seller sees is correct
         whether or not a single frame was ever drawn. */
      settle() {
        for (const child of gsap.globalTimeline.getChildren(true, true, true)) {
          if (child.totalProgress() < 1) child.totalProgress(1);
        }
      },

      teardown() {
        dismissReceipt(true);
        forge.setLedgerAnimator(null);
        forge.setSplitDriver(null);
        for (const beam of beams.values()) beam.kill();
        beams.clear();
        for (const tl of flinches.values()) tl.kill();
        flinches.clear();
        entrance = null;
        regrouping = false;
        wallState = null;
        for (const t of forge.tiles.values()) {
          gsap.killTweensOf(t.li);
          gsap.set(t.li, { clearProps: 'opacity,visibility' });
          releaseTransform([t.li]);
          t.li.classList.remove('is-revealing');
          for (const p of ['--scan', '--erase', '--ring']) t.li.style.removeProperty(p);
          if (t.original) gsap.set(t.original, { clearProps: 'opacity' });
        }
        if (stage) stage.style.removeProperty('--split');
      },
    };
  }

  /* ------------------------------------------------------------- wiring
     Registered once. Every handler is inert while `live` is null, which is
     exactly the reduced-motion state. */

  forge.hooks.onTilesAdded = els => { if (live) live.tilesAdded(els); };
  forge.hooks.onBatchComplete = info => { if (live) live.batchComplete(info); };
  forge.hooks.onExportDone = res => { if (live) live.exportDone(res); };

  q.on('item', ({ item, resolved }) => { if (live) live.item(item, resolved); });

  /* Photos removed from the queue take their tweens with them. */
  q.on('items', () => {
    for (const [id, beam] of Array.from(beams)) {
      if (!forge.tiles.has(id)) { beam.kill(); beams.delete(id); }
    }
    for (const [id, tl] of Array.from(flinches)) {
      if (!forge.tiles.has(id)) { tl.kill(); flinches.delete(id); }
    }
    if (!forge.tiles.size) { wallState = null; dismissReceipt(true); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && live) live.settle();
  });

  const mm = gsap.matchMedia();
  mm.add({
    reduce: '(prefers-reduced-motion: reduce)',
    ok: '(prefers-reduced-motion: no-preference)',
  }, (ctx) => {
    /* reduce: register nothing. The wall fills, the bands group, the ledger
       counts and the divider tracks - all of it instantly and correctly. */
    if (ctx.conditions.reduce) return undefined;
    live = makeMotion();
    return () => { const l = live; live = null; l.teardown(); };
  });
}
