/* Small shared helpers. No DOM framework, no dependencies. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function on(el, type, handler, opts) {
  el.addEventListener(type, handler, opts);
  return () => el.removeEventListener(type, handler, opts);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function svgIcon(id, cls = 'icon') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#' + id);
  svg.append(use);
  return svg;
}

/* ---------------------------------------------------------------- formatting */

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function fmtMB(n) { return (n / 1048576).toFixed(1); }

export function fmtSeconds(ms) {
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(2)} s`;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

export function fmtEta(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `~${s} s left`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return r ? `~${m} min ${r} s left` : `~${m} min left`;
}

export function fmtMoney(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function baseName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'photo';
}

export function extOf(name) {
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function hex2(n) { return n.toString(16).padStart(2, '0').toUpperCase(); }
export function rgbHex(r, g, b) { return `#${hex2(r)}${hex2(g)}${hex2(b)}`; }

/* ---------------------------------------------------------------- storage
   localStorage can be full, disabled, or throw in private mode. Every read
   and write goes through here so the app degrades to memory silently once,
   with one honest alert raised by main.js. */

const memory = new Map();
export const storage = {
  broken: false,
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return memory.has(key) ? memory.get(key) : fallback;
      return JSON.parse(raw);
    } catch {
      this.broken = true;
      return memory.has(key) ? memory.get(key) : fallback;
    }
  },
  set(key, value) {
    memory.set(key, value);
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { this.broken = true; return false; }
  },
};

/* ---------------------------------------------------------------- canvas */

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') {
    const c = new OffscreenCanvas(w, h);
    return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) };
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) };
}

export async function canvasToBlob(canvas, type = 'image/png', quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob(quality === undefined ? { type } : { type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob returned null'))), type, quality);
  });
}

/* ---------------------------------------------------------------- image size
   Reads pixel dimensions straight out of the file header, so we can plan the
   decode without ever holding a full-resolution bitmap. Falls back to a real
   decode only when the container is not one we can parse. */

export async function readImageSize(file) {
  try {
    const buf = new Uint8Array(await file.slice(0, 131072).arrayBuffer());
    const dv = new DataView(buf.buffer);

    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: dv.getUint32(16), height: dv.getUint32(20) };
    }
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    }
    // BMP
    if (buf[0] === 0x42 && buf[1] === 0x4d) {
      return { width: dv.getInt32(18, true), height: Math.abs(dv.getInt32(22, true)) };
    }
    // RIFF / WebP
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) {
      const fourcc = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
      if (fourcc === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
      if (fourcc === 'VP8L') {
        const b = dv.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (fourcc === 'VP8X') {
        const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
        const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
        return { width: w + 1, height: h + 1 };
      }
    }
    // JPEG: walk the marker chain to the first start-of-frame
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = dv.getUint16(i + 2);
        const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) return { width: dv.getUint16(i + 7), height: dv.getUint16(i + 5) };
        if (marker === 0xda) break;
        i += 2 + len;
      }
    }
    // ISO base media (AVIF / HEIF): find the ispe box
    for (let i = 4; i < buf.length - 16; i++) {
      if (buf[i] === 0x69 && buf[i + 1] === 0x73 && buf[i + 2] === 0x70 && buf[i + 3] === 0x65) {
        return { width: dv.getUint32(i + 8), height: dv.getUint32(i + 12) };
      }
    }
  } catch { /* fall through to the decode probe */ }
  return null;
}

/* Human sentence for a container this browser cannot decode. */
export function unsupportedMessage(name) {
  const ext = extOf(name);
  const table = {
    heic: 'HEIC is not supported by this browser. Convert to JPEG first.',
    heif: 'HEIF is not supported by this browser. Convert to JPEG first.',
    psd: 'PSD is a layered document, not a photo. Export a JPEG or PNG first.',
    tif: 'TIFF is not supported by this browser. Convert to JPEG first.',
    tiff: 'TIFF is not supported by this browser. Convert to JPEG first.',
    svg: 'SVG has no pixels to cut out. Use the raster export instead.',
    raw: 'Camera RAW is not supported by this browser. Export a JPEG first.',
    cr2: 'Camera RAW is not supported by this browser. Export a JPEG first.',
    nef: 'Camera RAW is not supported by this browser. Export a JPEG first.',
    arw: 'Camera RAW is not supported by this browser. Export a JPEG first.',
    dng: 'Camera RAW is not supported by this browser. Export a JPEG first.',
  };
  return table[ext] || `This browser could not decode ${name}. Convert it to JPEG or PNG first.`;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Yields to the event loop between photos so a long batch never starves
   paint or input.

   Deliberately NOT requestAnimationFrame: sellers park this tab and go work
   in their store admin, and rAF stops firing the moment a tab is hidden,
   which would freeze the batch. setTimeout is throttled to one second in
   background tabs. A MessageChannel round trip is a macrotask that neither
   throttles nor stops, so the queue keeps running while you are elsewhere. */
export function yieldToBrowser() {
  if (typeof scheduler === 'object' && scheduler && typeof scheduler.yield === 'function') {
    return scheduler.yield();
  }
  if (typeof MessageChannel !== 'function') return new Promise(r => setTimeout(r, 0));
  return new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(0);
  });
}

/* Kept for the one place that genuinely wants a painted frame. */
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
