/* Motion attachment points.

   The application never imports motion.js and never checks whether GSAP
   loaded. It calls through here. If nothing is attached (GSAP blocked, the CDN
   is down, prefers-reduced-motion is on) every call is a no-op that returns
   false, and the caller falls back to writing the final value directly.

   That is the whole contract: this build loses transitions, never information. */

export const fx = {
  /* one sheet finished painting and is ready to be swept in (beat 1) */
  sheet: null,
  /* a solid mark just turned into a registration cross (beat 2) */
  verified: null,

  /* run lifecycle: park the four registers, converge them, retire them */
  runStart: null,
  runDone: null,
  runStop: null,

  /* bound to a real count, so whoever takes this one moves it linearly.
     The press button's own --progress bar is not here on purpose: its CSS
     transition is already `100ms linear`, which is the same contract, and
     keeping it in CSS means it still behaves when this file attaches nothing. */
  ruler: null,

  /* transient surfaces */
  drawerOpen: null,
  drawerClose: null,
  toastIn: null,
  toastOut: null,
  inlineIn: null,
};

/** Returns true when a handler took the call. A handler that explicitly
    returns false is declining, and the caller does its own thing. */
export function call(name, ...args) {
  const fn = fx[name];
  if (typeof fn !== 'function') return false;
  try {
    return fn(...args) !== false;
  } catch (err) {
    /* a broken decoration must never take the product down with it */
    fx[name] = null;
    return false;
  }
}
