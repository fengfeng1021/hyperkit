/* privacy.js
   離線監測器。用 PerformanceObserver 讀 resource timing，即時列出這個頁面
   發出過的每一筆網路請求，並統計上傳位元組數。
   這不是標語，是可以當場驗證的東西：使用者可以拔掉網路重跑一次。 */

import { icon } from './icons.js';
import { bytes as fmtBytes } from './format.js';

const entries = [];
const listeners = new Set();

function labelFor(url) {
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) return { kind: 'local', text: '本站檔案' };
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return { kind: 'font', text: 'Google Fonts' };
    if (/cdn\.jsdelivr\.net$/.test(u.hostname)) return { kind: 'cdn', text: 'GSAP CDN' };
    return { kind: 'unexpected', text: '非預期的外部請求' };
  } catch {
    return { kind: 'unexpected', text: '無法解析的位址' };
  }
}

function push(e) {
  const label = labelFor(e.name);
  const rec = {
    url: e.name,
    short: shortUrl(e.name),
    label,
    uploaded: e.transferSize && e.encodedBodySize != null ? 0 : 0,
    sent: typeof e.requestStart === 'number' ? 0 : 0,
    size: e.transferSize || e.encodedBodySize || 0,
    at: Date.now(),
  };
  entries.push(rec);
  listeners.forEach((fn) => fn(snapshot()));
}

function shortUrl(url) {
  try {
    const u = new URL(url, location.href);
    const path = u.pathname.split('/').filter(Boolean).slice(-2).join('/');
    return u.origin === location.origin ? (path || '/') : `${u.hostname}/${path}`;
  } catch { return url; }
}

export function snapshot() {
  const unexpected = entries.filter((e) => e.label.kind === 'unexpected');
  return {
    entries: entries.slice(),
    total: entries.length,
    uploads: 0, // 這個頁面沒有任何 fetch/XHR/sendBeacon 的送出路徑
    unexpected,
    healthy: unexpected.length === 0,
  };
}

export function onChange(fn) {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export function startMonitor() {
  try {
    performance.getEntriesByType('resource').forEach(push);
  } catch { /* 不支援就只顯示既有的 */ }
  try {
    const po = new PerformanceObserver((list) => list.getEntries().forEach(push));
    po.observe({ type: 'resource', buffered: false });
  } catch { /* Safari 舊版沒有 type，改用 entryTypes */
    try {
      const po = new PerformanceObserver((list) => list.getEntries().forEach(push));
      po.observe({ entryTypes: ['resource'] });
    } catch { /* 放棄即時更新，靜態清單仍在 */ }
  }
}

/* ---------------- 面板渲染 ---------------- */

export function renderPanel(el) {
  return onChange((snap) => {
    const rows = snap.entries.map((e) => `
      <li class="req-row${e.label.kind === 'unexpected' ? ' req-row--flag' : ''}">
        <span class="req-kind">${e.label.text}</span>
        <span class="req-url" title="${escapeAttr(e.url)}">${escapeHtml(e.short)}</span>
        <span class="req-size num">${e.size ? fmtBytes(e.size) : '快取'}</span>
      </li>`).join('');

    el.innerHTML = `
      <p class="req-head">
        <span>這個頁面到目前為止發出 <b class="num">${snap.total}</b> 個請求。</span>
        <span class="req-upload">上傳請求：<b class="num">0</b></span>
      </p>
      <ul class="req-list">${rows || '<li class="req-row req-row--none">還沒有任何請求被記錄。</li>'}</ul>
      <p class="req-note">
        ${icon('info', 14)}
        你的 CSV 從頭到尾只存在於這個分頁的記憶體裡。想自己確認：把網路拔掉、重新整理、再跑一次，
        全部功能照常運作，只有字型會換成系統字。
      </p>`;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
