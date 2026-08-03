/* ==========================================================================
   GradientKit - motion.js
   The animation layer. Loaded after main.js, talks to it only through
   window.GradientKit, and can be deleted without changing a single thing the
   page says or does.

   There is one authored moment in this product and it is the sweep: the user
   switches interpolation space and a 1px line crosses the specimen at a
   constant 2.4s, correcting the color behind it, stopping on the measured
   worst point to bracket it and print the real percentage, then finishing the
   crossing and parking on the finding. Everything else in here is sub-260ms
   functional feedback, and each piece answers "what does it say" in one line:

     sweep          narrative + state transition. The product's whole argument,
                    performed on the user's own colors, in one gesture.
     first-visit    hierarchy. Points at the one control worth touching first.
     grain shimmer  feedback. Noise you are adjusting should be alive, not a
                    frozen still that hides what the amplitude is doing.

   That is the whole list. Nothing on this page animates on scroll.

   Rules this file keeps:
     - The seam is a plain JS number tweened on an object. No DOM element is
       animated to move the seam; the shader reads a uniform.
     - Nothing starts from a hidden state that only JavaScript can rescue. The
       four elements this file fades in are created on demand by sweep.js and
       do not exist until the user asks for them.
     - Every sequence can be interrupted. Grab the seam, press Esc, press a
       key: the timeline stops and hands over control in the same frame.
   ========================================================================== */

const gsap = window.gsap;
const GK = window.GradientKit;

/* Durations mirror css/tokens.css. Seconds here, milliseconds there. */
const DUR = {
  travel: 2.4,    // --dur-sweep
  hold: 0.15,     // --dur-hold
  breathe: 0.52,  // --dur-breathe
  wipe: 0.42,     // --dur-4
  step: 0.26,     // --dur-3
};

/* --ease-out is cubic-bezier(0.16, 1, 0.3, 1), which is expo.out. */
const EASE = {
  out: 'expo.out',
  soft: 'power3.out',
  breathe: 'power2.inOut',
  measure: 'none',   // the travel only. It is a scan across a measured field.
};

if (gsap && GK) boot();

function boot() {
  gsap.defaults({ duration: DUR.step, ease: EASE.out });

  const mm = gsap.matchMedia();

  mm.add({
    reduce: '(prefers-reduced-motion: reduce)',
    ok: '(prefers-reduced-motion: no-preference)',
  }, (ctx) => {
    if (ctx.conditions.reduce) {
      // No choreographer registered, so sweep.js lands the seam on the
      // measured worst point immediately, draws the bracket and prints the
      // percentage in their final state, and leaves the divider draggable by
      // pointer and by arrow key. The full lesson, at the user's own pace.
      GK.sweep.choreograph(null);
      return;
    }

    GK.sweep.choreograph(choreograph);
    const teardown = [firstVisitPulse(), grainShimmer()];

    return () => {
      // Reached when the user turns reduced motion on mid-session. Every
      // inline style this file wrote comes off, so the static build takes over
      // a clean DOM rather than one holding a half-finished sequence.
      abortSweep();
      GK.sweep.choreograph(null);
      const root = GK.sweep.element;
      if (root) {
        gsap.set(root.querySelectorAll(
          '.gk-sweep-line, .gk-sweep-label, .gk-sweep-bracket, .gk-sweep-deficit',
        ), { clearProps: 'all' });
      }
      for (const fn of teardown) if (fn) fn();
    };
  });
}

/* ==========================================================================
   The sweep
   ========================================================================== */

let active = null;        // the running timeline, or null
let armed = null;         // the elements the running timeline touches
const wiredRoots = new WeakSet();

/**
 * Registered on sweep.js. Returning true means "I have taken the landing";
 * sweep.js then leaves the seam alone and this file drives it.
 */
function choreograph(payload) {
  if (payload.abort) { abortSweep(); return false; }
  try {
    runSweep(payload);
    return true;
  } catch {
    // A failed animation must never cost the user the comparison itself.
    abortSweep();
    return false;
  }
}

function runSweep({ report, landing, root, setSeam }) {
  // Re-triggering restarts. It never queues: two scans on one specimen is a
  // broken instrument.
  abortSweep();

  const stage = document.getElementById('stage-wrap');
  const canvas = document.getElementById('stage');
  const wipe = document.getElementById('code-wipe');
  const line = root.querySelector('.gk-sweep-line');
  const grip = root.querySelector('.gk-sweep-grip');
  const label = root.querySelector('.gk-sweep-label');
  const bracket = root.querySelector('.gk-sweep-bracket');
  const deficit = root.querySelector('.gk-sweep-deficit');

  wireInterrupts(root, grip);

  const meaningful = !!report.meaningful;
  const dead = meaningful ? report.worstT : 0.5;
  const sentence = deficit.textContent;

  armed = { root, stage, canvas, line, label, bracket, deficit, grip, sentence, wipe };

  // Opening state. Every one of these elements was created moments ago by
  // sweep.js and has never been painted, so nothing visible is being taken
  // away from the user here.
  root.classList.add('is-running');
  stage.classList.add('is-scanning');
  grip.setAttribute('aria-busy', 'true');
  gsap.set([line, label], { autoAlpha: 0 });
  gsap.set(deficit, { autoAlpha: 0 });
  if (meaningful) gsap.set(bracket, { autoAlpha: 0, scale: 1, clipPath: 'inset(0 100% 0 0)' });
  deficit.textContent = meaningful ? '' : sentence;

  const s = { x: 0, shake: 0 };
  const typed = { n: 0 };
  let lastX = -1;
  let lastShake = 0;
  setSeam(0, 0);

  const tl = gsap.timeline({
    defaults: { ease: EASE.out },
    onUpdate() {
      // Only touch the GPU when the seam actually moved. The breathe and the
      // code wipe run on the compositor and must not cost a shader pass.
      if (s.x === lastX && s.shake === lastShake) return;
      lastX = s.x;
      lastShake = s.shake;
      setSeam(s.x, s.shake);
    },
    onComplete: () => settleSweep(true),
  });
  active = tl;

  /* arm: the line appears at the left edge, the seam label mounts above. */
  tl.addLabel('arm', 0)
    .to(line, { autoAlpha: 1, duration: 0.12 }, 'arm')
    .to(label, { autoAlpha: 1, duration: 0.24 }, 'arm+=0.06');

  if (!meaningful) {
    /* No dead zone worth stopping for. The scan runs straight through and the
       sentence says so. Honesty over theatre. */
    tl.to(s, { x: 1, duration: DUR.travel, ease: EASE.measure }, 'arm+=0.12')
      .addLabel('land')
      .to(deficit, { autoAlpha: 1, duration: DUR.step }, 'land');
  } else {
    /* travel-a: constant speed to the worst point. Duration scales with the
       distance so the pace reads the same wherever the dead zone falls. */
    tl.to(s, { x: dead, duration: DUR.travel * dead, ease: EASE.measure }, 'arm+=0.12')

      /* bracket: the travel stops, the frame draws itself around the span
         where the deficit is still within 60% of its worst value, the seam
         stutters, and the measured percentage types in underneath. The
         stutter is doing the job a red box would do in a product that was
         allowed to use hue. This one is not. */
      .addLabel('bracket')
      .to(bracket, {
        autoAlpha: 1,
        clipPath: 'inset(0 0% 0 0)',
        duration: 0.18,
        ease: EASE.soft,
      }, 'bracket')
      .to(s, {
        ease: EASE.measure,
        keyframes: [
          { shake: 1.5, duration: 0.04 },
          { shake: -1.5, duration: 0.05 },
          { shake: 0.8, duration: 0.04 },
          { shake: 0, duration: 0.02 },
        ],
      }, 'bracket')
      .set(deficit, { autoAlpha: 1 }, 'bracket')
      .to(typed, {
        n: sentence.length,
        duration: 0.22,
        ease: EASE.measure,
        onUpdate() { deficit.textContent = sentence.slice(0, Math.round(typed.n)); },
        onComplete() { deficit.textContent = sentence; },
      }, 'bracket')

      /* hold: nothing moves. This pause is the entire point of the moment. */
      .addLabel('hold', '>')
      .to({}, { duration: DUR.hold }, 'hold')

      /* release: the frame lets go and the scan resumes in the same beat. */
      .addLabel('release')
      .to(bracket, { autoAlpha: 0, scale: 1.06, duration: 0.2, ease: EASE.soft }, 'release')
      .to(deficit, { autoAlpha: 0, duration: 0.2 }, 'release')
      .to(s, { x: 1, duration: DUR.travel * (1 - dead), ease: EASE.measure }, 'release')
      .addLabel('land');
  }

  /* land: the scan has crossed the whole specimen and the whole specimen
     exhales once. The breathe is the sentence "that is finished" said without
     words. The seam and its label stay lit: a split with no line on it would
     read as a rendering fault, not as a comparison. */
  tl.to(canvas, { scale: 1.015, duration: DUR.breathe / 2, ease: EASE.breathe }, 'land')
    .to(canvas, { scale: 1, duration: DUR.breathe / 2, ease: EASE.breathe });

  /* code: the export the user came for updates, wiped left to right in the
     gradient's own mid color. Never green: the confirmation is made of the
     thing the user just made. */
  if (wipe) {
    tl.call(() => { wipe.classList.remove('is-wiping'); }, null, 'land+=0.06')
      .fromTo(wipe,
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0% 0 0)', duration: DUR.wipe * 0.55, ease: EASE.soft },
        'land+=0.06')
      .to(wipe, {
        clipPath: 'inset(0 0 0 100%)',
        duration: DUR.wipe * 0.45,
        ease: 'power2.in',
        clearProps: 'clipPath',
      });
  }

  /* park: the instrument puts its cursor back on the finding and the number
     comes back with it. This leaves the screen in exactly the state reduced
     motion starts in, which is also the state the copy under the button
     promises: "the seam is draggable once it lands". */
  tl.addLabel('park', 'land+=0.26')
    .to(s, { x: landing, duration: 0.4, ease: EASE.out }, 'park')
    .to(deficit, { autoAlpha: 1, duration: 0.24 }, 'park+=0.1');
}

/** Hand control to the user from wherever the scan currently is. */
function settleSweep(completed) {
  const a = armed;
  active = null;
  if (!a) return;
  armed = null;
  a.root.classList.remove('is-running');
  a.stage.classList.remove('is-scanning');
  a.grip.removeAttribute('aria-busy');
  gsap.set(a.canvas, { clearProps: 'transform,willChange' });
  gsap.set([a.line, a.label, a.deficit], { autoAlpha: 1 });
  // The bracket has said its piece. Hide it by attribute and leave no inline
  // style behind, so the next comparison starts from the stylesheet whether or
  // not it is the one that animates.
  if (a.bracket) {
    gsap.set(a.bracket, { clearProps: 'all' });
    a.bracket.hidden = true;
  }
  a.deficit.textContent = a.sentence;
  if (!completed && a.wipe) gsap.set(a.wipe, { clearProps: 'clipPath' });
}

function abortSweep() {
  if (active) { active.kill(); active = null; }
  settleSweep(false);
}

/**
 * A running animation must never be a wall. Any attempt to use the divider
 * ends the sequence in the same frame and lets the real handler through.
 */
function wireInterrupts(root, grip) {
  if (wiredRoots.has(root)) return;
  wiredRoots.add(root);
  const take = () => { if (active) abortSweep(); };
  grip.addEventListener('pointerdown', take, { capture: true });
  grip.addEventListener('keydown', take, { capture: true });
  root.addEventListener('pointerdown', take, { capture: true });
}

/* ==========================================================================
   First visit: one hairline pulse on the interpolation-space control
   ========================================================================== */

function firstVisitPulse() {
  if (document.documentElement.dataset.firstVisit !== 'true') return null;
  const group = document.getElementById('space-group');
  if (!group) return null;

  const tween = gsap.fromTo(group,
    { '--pulse': 0 },
    {
      '--pulse': 1,
      duration: 0.42,
      ease: EASE.breathe,
      delay: 0.9,
      repeat: 3,
      yoyo: true,
      repeatDelay: 0.45,
    });

  const clear = () => { group.style.removeProperty('--pulse'); };
  const stop = () => { tween.kill(); clear(); };

  // The pulse has one job and it is finished the moment the user shows they
  // have seen the control.
  group.addEventListener('pointerdown', stop, { once: true });
  group.addEventListener('keydown', stop, { once: true });
  document.getElementById('btn-compare')?.addEventListener('click', stop, { once: true });
  tween.eventCallback('onComplete', clear);

  return stop;
}

/* ==========================================================================
   Grain: the noise moves while you are setting it
   ========================================================================== */

function grainShimmer() {
  const slider = document.getElementById('in-grain');
  const sizes = document.getElementById('grain-sizes');
  if (!slider || typeof GK.renderer.setGrainPhase !== 'function') return null;

  const phase = { v: 0 };
  let tween = null;
  let idle = 0;

  const stop = () => {
    clearTimeout(idle);
    if (tween) { tween.kill(); tween = null; }
    GK.renderer.setGrainPhase(0);
  };

  const wake = () => {
    const amp = GK.store.get().grain?.amp || 0;
    if (amp <= 0) { stop(); return; }
    clearTimeout(idle);
    // A short tail after the last input so releasing the slider is a settle,
    // not a hard stop.
    idle = setTimeout(stop, 420);
    if (tween) return;
    phase.v = 0;
    tween = gsap.to(phase, {
      v: 600,
      duration: 10,
      ease: EASE.measure,
      repeat: -1,
      onUpdate: () => GK.renderer.setGrainPhase(phase.v),
    });
  };

  slider.addEventListener('input', wake);
  sizes?.addEventListener('click', wake);

  return () => {
    stop();
    slider.removeEventListener('input', wake);
    sizes?.removeEventListener('click', wake);
  };
}

/* ==========================================================================
   Below the fold
   ========================================================================== */

/* Sections B, C and D carry no motion at all, and that is a decision rather
   than an omission. The comparison bands already say what they say, standing
   still, on the user's own colors. Animating them would be the same argument
   told a second time in a weaker voice, and it would turn one authored moment
   into a house style. This is also why ScrollTrigger is not loaded: nothing on
   this page is driven by scroll position. */
