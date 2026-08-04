/* Interior fonts.
   A PDF without embedded fonts is one of the most common KDP rejections, and a
   silent fallback to a standard font would hide that from the user. So there is
   no silent fallback here: if the bytes cannot be fetched, export is blocked and
   three real recovery paths are offered.

   The bytes are cached in the Cache API, so the second visit costs nothing, and
   the same bytes are registered with FontFace so the canvas thumbnails are set
   in the exact face the PDF will embed. */

const CACHE = 'puzzle-press-fonts-v1';
const HOSTS = ['https://cdn.jsdelivr.net', 'https://fastly.jsdelivr.net'];

export const INTERIOR_FONTS = [
  {
    id: 'atkinson',
    name: 'Atkinson Hyperlegible',
    note: '為低視力讀者設計，字母辨識度最高。大字版預設。',
    family: 'PP Atkinson Hyperlegible',
    files: {
      regular: { path: '/npm/@expo-google-fonts/atkinson-hyperlegible/AtkinsonHyperlegible_400Regular.ttf', bytes: 53504 },
      bold: { path: '/npm/@expo-google-fonts/atkinson-hyperlegible/AtkinsonHyperlegible_700Bold.ttf', bytes: 54444 },
    },
  },
  {
    id: 'lexend',
    name: 'Lexend',
    note: '為閱讀流暢度設計，中性、字腔開闊。',
    family: 'PP Lexend',
    files: {
      regular: { path: '/npm/@expo-google-fonts/lexend/Lexend_400Regular.ttf', bytes: 77836 },
      bold: { path: '/npm/@expo-google-fonts/lexend/Lexend_600SemiBold.ttf', bytes: 78204 },
    },
  },
  {
    id: 'courier',
    name: 'Courier Prime',
    note: '等寬。字謎格線裡每個字母寬度一致，方格會排得整齊。',
    family: 'PP Courier Prime',
    files: {
      regular: { path: '/npm/@expo-google-fonts/courier-prime/CourierPrime_400Regular.ttf', bytes: 68304 },
      bold: { path: '/npm/@expo-google-fonts/courier-prime/CourierPrime_700Bold.ttf', bytes: 69944 },
    },
  },
];

export function fontById(id) {
  return INTERIOR_FONTS.find((f) => f.id === id) || INTERIOR_FONTS[0];
}

export function totalBytes(font) {
  return font.files.regular.bytes + font.files.bold.bytes;
}

const memory = new Map(); // id -> { regular: Uint8Array, bold: Uint8Array, source }
const registered = new Set();

export function loadedFont(id) {
  return memory.get(id) || null;
}

export function adoptUploaded(id, weight, bytes, filename) {
  const cur = memory.get(id) || {};
  cur[weight] = bytes;
  cur.source = `上傳的 ${filename}`;
  if (!cur.bold) cur.bold = bytes;
  if (!cur.regular) cur.regular = bytes;
  memory.set(id, cur);
  registerFace(fontById(id), cur);
  return cur;
}

async function fetchBytes(path, expected, hostIndex, onChunk) {
  const url = HOSTS[hostIndex % HOSTS.length] + path;
  let response = null;
  if (globalThis.caches) {
    try {
      const cache = await caches.open(CACHE);
      response = await cache.match(url);
      if (response) {
        const buf = new Uint8Array(await response.arrayBuffer());
        onChunk(buf.byteLength, true);
        return buf;
      }
    } catch (err) {
      /* private mode blocks the Cache API; the network path still works */
    }
  }
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  let bytes;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onChunk(received, false);
    }
    bytes = new Uint8Array(received);
    let at = 0;
    chunks.forEach((c) => {
      bytes.set(c, at);
      at += c.byteLength;
    });
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
    onChunk(bytes.byteLength, false);
  }

  if (globalThis.caches) {
    try {
      const cache = await caches.open(CACHE);
      await cache.put(url, new Response(bytes.slice().buffer, { headers: { 'content-type': 'font/ttf' } }));
    } catch (err) {
      /* cache write failures are not fatal, the bytes are already in memory */
    }
  }
  void expected;
  return bytes;
}

/**
 * @param {string} id
 * @param {(loaded:number,total:number,cached:boolean)=>void} onProgress
 * @param {number} hostIndex 0 = jsdelivr, 1 = fastly mirror
 */
export async function ensureFont(id, onProgress = () => {}, hostIndex = 0) {
  const font = fontById(id);
  const have = memory.get(id);
  if (have && have.regular && have.bold) {
    registerFace(font, have);
    return have;
  }
  const total = totalBytes(font);
  let base = 0;
  const out = {};
  const weights = ['regular', 'bold'];
  for (let i = 0; i < weights.length; i += 1) {
    const w = weights[i];
    const spec = font.files[w];
    /* eslint-disable no-await-in-loop */
    out[w] = await fetchBytes(spec.path, spec.bytes, hostIndex, (loaded, cached) => {
      onProgress(base + loaded, total, cached);
    });
    base += out[w].byteLength;
  }
  out.source = HOSTS[hostIndex % HOSTS.length].replace('https://', '');
  memory.set(id, out);
  registerFace(font, out);
  onProgress(total, total, false);
  return out;
}

function registerFace(font, bytes) {
  if (!globalThis.FontFace || !globalThis.document || registered.has(font.id)) return;
  try {
    const reg = new FontFace(font.family, bytes.regular.slice().buffer, { weight: '400' });
    const bold = new FontFace(font.family, bytes.bold.slice().buffer, { weight: '700' });
    document.fonts.add(reg);
    document.fonts.add(bold);
    reg.load();
    bold.load();
    registered.add(font.id);
  } catch (err) {
    /* the PDF path does not need the browser to be able to render the face */
  }
}

export function kb(bytes) {
  return `${Math.round(bytes / 1000)} KB`;
}
