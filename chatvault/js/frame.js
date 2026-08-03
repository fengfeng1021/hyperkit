/* One frame scheduler for everything that repaints per frame.

   Uses gsap.ticker when GSAP is on the page so that virtual list repaints,
   canvas redraws and tweens share a single clock and cannot fight over frames.
   Falls back to requestAnimationFrame so that nothing here depends on a CDN
   having answered. */

const callbacks = new Set();
let running = false;
let rafId = 0;

function pump() {
  for (const cb of callbacks) {
    try {
      cb();
    } catch (err) {
      console.debug("chatvault: frame callback failed", err);
    }
  }
}

function startRaf() {
  const loop = () => {
    pump();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function start() {
  if (running) return;
  running = true;
  if (typeof window !== "undefined" && window.gsap && window.gsap.ticker) {
    window.gsap.ticker.add(pump);
  } else {
    startRaf();
  }
}

/** @returns {() => void} unsubscribe */
export function onFrame(cb) {
  callbacks.add(cb);
  start();
  return () => callbacks.delete(cb);
}

export function stopAll() {
  callbacks.clear();
  if (rafId) cancelAnimationFrame(rafId);
  if (typeof window !== "undefined" && window.gsap && window.gsap.ticker) window.gsap.ticker.remove(pump);
  running = false;
}
