/* Small DOM helpers. No framework, no template strings for anything that
   carries user data. */

import { call } from './fx.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.keys(props).forEach((k) => {
    const v = props[k];
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'disabled' || k === 'hidden' || k === 'checked' || k === 'open') node[k] = !!v;
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

export function icon(name, cls = 'ico') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

export function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 90) return '剛剛';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return `${Math.floor(d / 30)} 個月前`;
}

export function bytesLabel(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

let toastHost = null;
export function toast(message) {
  if (!toastHost) toastHost = $('#toasts');
  const node = el('p', { class: 'toast', text: message });
  toastHost.appendChild(node);
  call('toastIn', node);
  setTimeout(() => {
    const gone = () => node.remove();
    if (!call('toastOut', node, gone)) gone();
  }, 3500);
}

export function say(message, assertive = false) {
  const node = $(assertive ? '#live-assertive' : '#live');
  if (node) node.textContent = message;
}

/** In-place confirm row. Replaces every modal and every window.confirm in this
    build. Auto-cancels after 3 seconds of no interaction. */
export function inlineConfirm(host, message, confirmLabel, onConfirm, timeout = 3000) {
  clear(host);
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    clear(host);
  };
  const row = el('div', { class: 'inline-confirm', role: 'group' }, [
    el('span', { text: message }),
    el('span', { class: 'spacer' }),
    el('button', {
      type: 'button',
      class: 'btn-primary',
      onclick: () => {
        close();
        onConfirm();
      },
    }, confirmLabel),
    el('button', { type: 'button', class: 'btn-hair', onclick: close }, '取消'),
  ]);
  host.appendChild(row);
  call('inlineIn', row);
  timer = setTimeout(close, timeout);
  row.addEventListener('pointerenter', () => clearTimeout(timer));
  row.addEventListener('pointerleave', () => {
    timer = setTimeout(close, timeout);
  });
  return close;
}

export function alertRow(message, actions = []) {
  const body = el('div', {}, [el('p', { text: message })]);
  if (actions.length) {
    const bar = el('div', { class: 'alert-actions' });
    actions.forEach((a) => {
      bar.appendChild(el('button', { type: 'button', onclick: a.run }, a.label));
    });
    body.appendChild(bar);
  }
  return el('div', { class: 'alert', role: 'alert' }, [icon('slash'), body]);
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
