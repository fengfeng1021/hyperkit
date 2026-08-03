/**
 * js/ui/toast.js
 * Toasts appear for exactly one thing in this build: a destructive action
 * that can be undone. Everything else is inline, next to the control that
 * caused it, because a seller dropping fifty files does not want fifty
 * floating messages.
 */

import { el } from '../util/dom.js';

export function toast(host, { text, undoLabel = 'Undo', onUndo, ms = 8000 }) {
  const node = el('div', { class: 'toast', role: 'status' }, [el('span', { text })]);
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    node.remove();
  };
  if (onUndo) {
    node.appendChild(el('button', {
      type: 'button', class: 'btn btn-text', text: undoLabel,
      onclick: () => { onUndo(); close(); }
    }));
  }
  host.appendChild(node);
  timer = setTimeout(close, ms);
  return close;
}
