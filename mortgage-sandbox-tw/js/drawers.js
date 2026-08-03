/* ==========================================================================
   drawers.js
   "這個數字怎麼來的"

   Native <details>/<summary>, so the content is findable with Ctrl+F, works
   without JavaScript, and needs no focus management. Several can be open at
   once, because comparing two formulas means having both on screen.
   ========================================================================== */

import { DRAWERS } from './assumptions.js';
import { fmt } from './format.js';

const openOrder = [];

export function renderDrawer(details, ctx) {
  const key = details.dataset.drawer;
  const spec = DRAWERS[key];
  const panel = details.querySelector('.drawer__panel');
  if (!spec || !panel) return;

  panel.textContent = '';

  const h = document.createElement('p');
  h.className = 'drawer__title';
  h.textContent = spec.title;
  panel.appendChild(h);

  const pre = document.createElement('pre');
  pre.className = 'formula';
  pre.textContent = spec.formula;
  panel.appendChild(pre);

  let rows = [];
  try { rows = spec.subs({ ...ctx, fmt }) || []; } catch (err) { rows = []; }
  if (rows.length) {
    const dl = document.createElement('dl');
    dl.className = 'subs';
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    });
    panel.appendChild(dl);
  }

  const src = document.createElement('p');
  src.className = 'drawer__source';
  src.textContent = spec.source;
  panel.appendChild(src);
}

export function initDrawers(getCtx) {
  const all = [...document.querySelectorAll('details.drawer')];
  all.forEach((d) => {
    d.addEventListener('toggle', () => {
      if (d.open) {
        renderDrawer(d, getCtx());
        openOrder.push(d);
      } else {
        const i = openOrder.indexOf(d);
        if (i >= 0) openOrder.splice(i, 1);
      }
    });
  });
  return {
    refresh(ctx) {
      document.querySelectorAll('details.drawer[open]').forEach((d) => renderDrawer(d, ctx));
    },
    /** Esc closes the most recently opened drawer and returns focus to it. */
    closeLast() {
      const d = openOrder[openOrder.length - 1];
      if (!d) return false;
      d.open = false;
      d.querySelector('summary')?.focus();
      return true;
    },
    hasOpen() { return openOrder.length > 0; },
  };
}
