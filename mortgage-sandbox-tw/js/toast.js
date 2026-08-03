/* ==========================================================================
   toast.js
   Bottom-right message strip. Two at a time; the third pushes out the oldest.
   Errors are assertive and stay until dismissed. Toasts carrying an action
   never auto-close, because a message you have to act on should not vanish
   while you are reading it.
   ========================================================================== */

const region = () => document.getElementById('toast-region');
const live = [];

export function toast(opts) {
  const { message, tone = 'info', actions = [], duration, node } = opts;
  const host = region();
  if (!host) return null;

  while (live.length >= 2) dismiss(live[0]);

  const box = document.createElement('div');
  box.className = `toast toast--${tone}`;
  box.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  box.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');

  const p = document.createElement('p');
  p.className = 'toast__msg';
  p.textContent = message;
  box.appendChild(p);

  if (node) box.appendChild(node);

  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'toast__actions';
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast__btn';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        try { a.onClick?.(box); } finally { if (a.close !== false) dismiss(box); }
      });
      row.appendChild(b);
    });
    box.appendChild(row);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast__close';
  close.setAttribute('aria-label', '關閉訊息');
  close.textContent = '×';
  close.addEventListener('click', () => dismiss(box));
  box.appendChild(close);

  host.appendChild(box);
  live.push(box);

  const ttl = duration ?? (actions.length ? 0 : tone === 'error' ? 8000 : 4500);
  if (ttl > 0) {
    box._timer = setTimeout(() => dismiss(box), ttl);
  }
  return box;
}

export function dismiss(box) {
  if (!box || !box.isConnected) return;
  clearTimeout(box._timer);
  const idx = live.indexOf(box);
  if (idx >= 0) live.splice(idx, 1);
  box.classList.add('is-leaving');
  setTimeout(() => box.remove(), 200);
}

export function dismissTop() {
  if (!live.length) return false;
  const withAction = [...live].reverse().find((b) => b.querySelector('.toast__btn'));
  dismiss(withAction || live[live.length - 1]);
  return true;
}

export function hasActionToast() {
  return live.some((b) => b.querySelector('.toast__btn'));
}
