/* ui.js
   共用 DOM 工具、提示與錯誤面板、螢幕閱讀器播報。
   錯誤文案格式固定為兩句：第一句說發生什麼，第二句說怎麼辦。 */

import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- 播報 ---------------- */

let liveNode = null;
export function announce(msg) {
  if (!liveNode) liveNode = document.getElementById('live-region');
  if (!liveNode) return;
  liveNode.textContent = '';
  window.setTimeout(() => { liveNode.textContent = msg; }, 40);
}

/* ---------------- notice ----------------
   四邊等寬 1px 框。錯誤用 vermilion 框，資訊用 line-3 框。
   不使用加粗 border-left。 */

/**
 * @param {{tone:'error'|'info', title:string, body?:string, actions?:Array, detail?:{label:string, html:string}}} spec
 */
export function notice(spec) {
  const root = el('div', {
    class: `notice notice--${spec.tone === 'error' ? 'error' : 'info'}`,
    role: spec.tone === 'error' ? 'alert' : 'status',
  });

  const mark = el('span', { class: 'notice-mark', html: icon(spec.tone === 'error' ? 'alert' : 'info', 16) });
  const body = el('div', { class: 'notice-body' });
  body.append(el('p', { class: 'notice-title', text: spec.title }));
  if (spec.body) body.append(el('p', { class: 'notice-text', text: spec.body }));

  if (spec.detail) {
    const det = el('details', { class: 'notice-detail' });
    det.append(el('summary', { class: 'notice-summary' }, [
      el('span', { class: 'notice-summary-label', text: spec.detail.label }),
      el('span', { class: 'notice-summary-chev', html: icon('expand', 14) }),
    ]));
    det.append(el('div', { class: 'notice-detail-body', html: spec.detail.html }));
    body.append(det);
  }

  if (spec.actions && spec.actions.length) {
    const bar = el('div', { class: 'notice-actions' });
    spec.actions.forEach((a) => {
      bar.append(el('button', {
        type: 'button',
        class: a.primary ? 'btn btn-primary btn-sm' : 'btn btn-ghost',
        onclick: a.onClick,
        text: a.label,
      }));
    });
    body.append(bar);
  }

  root.append(mark, body);

  if (spec.dismissible !== false) {
    root.append(el('button', {
      type: 'button', class: 'notice-close', 'aria-label': '關閉這則提示',
      html: icon('close', 14),
      onclick: () => root.remove(),
    }));
  }
  return root;
}

export function clearNotices(host) {
  host.innerHTML = '';
}

/* ---------------- 視覺隱藏但可讀 ---------------- */

export function srOnly(text) {
  return el('span', { class: 'sr-only', text });
}

/* ---------------- 節流 ---------------- */

export function raf(fn) {
  let queued = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}

/* ---------------- 讀 token ---------------- */

const tokenCache = new Map();
export function token(name) {
  if (tokenCache.has(name)) return tokenCache.get(name);
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  tokenCache.set(name, v);
  return v;
}
export function rampColor(step) {
  return token(`--ramp-${Math.max(0, Math.min(6, step))}`);
}

/* ---------------- canvas DPR ---------------- */

export function fitCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/* ---------------- 分類條紋 pattern ----------------
   分類不靠色相區分，靠濃淡 + 條紋密度 + 圖示三重編碼。 */

const patternCache = new Map();
export function stripePattern(ctx, density) {
  if (!density) return null;
  const key = `s${density}`;
  if (patternCache.has(key)) return patternCache.get(key);
  const size = 12;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.strokeStyle = token('--ink-void');
  cx.globalAlpha = 0.55;
  cx.lineWidth = 1;
  for (let i = 0; i < density; i++) {
    const off = (size / density) * i;
    cx.beginPath();
    cx.moveTo(-size + off, size);
    cx.lineTo(off + size, -size);
    cx.stroke();
  }
  const pat = ctx.createPattern(c, 'repeat');
  patternCache.set(key, pat);
  return pat;
}
