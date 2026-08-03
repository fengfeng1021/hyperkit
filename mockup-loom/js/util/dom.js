/**
 * js/util/dom.js
 * Small helpers. No framework, no virtual DOM, no build step.
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Yield to the browser. requestAnimationFrame while the tab is visible, a
 * macrotask when it is not, because a hidden tab never fires rAF and a batch
 * of five hundred renders must not stall the moment somebody switches tabs.
 */
export function schedule(fn) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    setTimeout(fn, 0);
  } else {
    requestAnimationFrame(fn);
  }
}

export function yieldToBrowser() {
  return new Promise((resolve) => schedule(resolve));
}

export function fmtNum(v, digits = 0) {
  return Number(v).toFixed(digits);
}

/** Roving tabindex: a composite widget is one tab stop, arrows move inside. */
export function rovingList(container, itemSelector, onActivate) {
  container.addEventListener('keydown', (ev) => {
    const items = $$(itemSelector, container);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement) >= 0
      ? items.indexOf(document.activeElement)
      : items.findIndex((n) => n.getAttribute('aria-selected') === 'true');
    let next = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (current + 1 + items.length) % items.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = items.length - 1;
    if (next < 0) return;
    ev.preventDefault();
    items[next].focus();
    if (onActivate) onActivate(items[next], next);
  });
}

/** Pointer drag with a clean cancel path, used by the dial and the frame. */
export function drag(target, handlers) {
  let active = null;
  target.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    active = ev.pointerId;
    target.setPointerCapture(ev.pointerId);
    handlers.start?.(ev);
    ev.preventDefault();
  });
  target.addEventListener('pointermove', (ev) => {
    if (active !== ev.pointerId) return;
    handlers.move?.(ev);
  });
  const finish = (ev, cancelled) => {
    if (active !== ev.pointerId) return;
    active = null;
    try { target.releasePointerCapture(ev.pointerId); } catch (e) { /* already gone */ }
    handlers.end?.(ev, cancelled);
  };
  target.addEventListener('pointerup', (ev) => finish(ev, false));
  target.addEventListener('pointercancel', (ev) => finish(ev, true));
  return { isDragging: () => active !== null, abort: () => { active = null; handlers.end?.(null, true); } };
}

/** Paint a transparency checker into a 2D context. */
export function paintChecker(ctx, w, h, size, a, b) {
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = b;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      if (((x / size) + (y / size)) % 2 === 0) ctx.fillRect(x, y, size, size);
    }
  }
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
