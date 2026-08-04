/* PDF writer.
   pdf-lib and fontkit are 1.28 MB together and are not loaded until the export
   button is pressed. Fonts are embedded with { subset: true } because an
   unembedded or unsubsetted font is one of the most common KDP rejections.

   Every coordinate here comes from paint.js. This file adds no geometry. */

import { paintPage } from './paint.js';

const PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const FONTKIT_URL = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';

let libsPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && existing.dataset.loaded === '1') {
      resolve();
      return;
    }
    const el = existing || document.createElement('script');
    el.src = src;
    el.onload = () => {
      el.dataset.loaded = '1';
      resolve();
    };
    el.onerror = () => reject(new Error(`無法載入 ${src}`));
    if (!existing) document.head.appendChild(el);
  });
}

export function loadLibs() {
  if (!libsPromise) {
    libsPromise = (async () => {
      await loadScript(PDFLIB_URL);
      await loadScript(FONTKIT_URL);
      if (!globalThis.PDFLib || !globalThis.fontkit) throw new Error('pdf-lib 載入後找不到全域物件');
      return { PDFLib: globalThis.PDFLib, fontkit: globalThis.fontkit };
    })().catch((err) => {
      libsPromise = null;
      throw err;
    });
  }
  return libsPromise;
}

/**
 * @param {object} o
 * @param {object} o.plan       layout.planBook result
 * @param {Array}  o.puzzles
 * @param {object} o.meta       {title, subtitle, seed, type}
 * @param {object} o.fontBytes  {regular:Uint8Array, bold:Uint8Array}
 * @param {(done:number,total:number,phase:string)=>void} o.onProgress
 * @param {()=>boolean} o.isCancelled
 * @param {boolean} [o.watermark] reserved, always false in this build
 */
export async function buildPdf(o) {
  const { PDFLib, fontkit } = await loadLibs();
  const { PDFDocument, rgb } = PDFLib;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(o.meta.title);
  doc.setSubject(`${o.plan.count} puzzles, seed ${o.meta.seed}`);
  doc.setCreator('Puzzle Press');
  doc.setProducer('Puzzle Press (pdf-lib)');

  const regular = await doc.embedFont(o.fontBytes.regular, { subset: true });
  const bold = await doc.embedFont(o.fontBytes.bold, { subset: true });

  const pages = o.plan.pages;
  const chars = new Set();
  let overflow = 0;

  for (let i = 0; i < pages.length; i += 1) {
    if (o.isCancelled && o.isCancelled()) return { cancelled: true };
    const spec = pages[i];
    const page = doc.addPage([o.plan.geo.pageWpt, o.plan.geo.pageHpt]);
    const { ops, rect } = paintPage(spec, o.plan, o.puzzles, o.meta);

    for (let k = 0; k < ops.length; k += 1) {
      const op = ops[k];
      const grey = rgb(op.grey === undefined ? 0 : op.grey, op.grey === undefined ? 0 : op.grey, op.grey === undefined ? 0 : op.grey);
      if (op.t === 'line') {
        page.drawLine({
          start: { x: op.x1, y: op.y1 },
          end: { x: op.x2, y: op.y2 },
          thickness: op.lw,
          color: grey,
          dashArray: op.dash,
        });
      } else if (op.t === 'rect') {
        page.drawRectangle({
          x: op.x,
          y: op.y,
          width: op.w,
          height: op.h,
          borderWidth: op.stroke === undefined ? 0 : op.lw,
          borderColor: op.stroke === undefined ? undefined : rgb(op.stroke, op.stroke, op.stroke),
          color: op.fill === undefined ? undefined : rgb(op.fill, op.fill, op.fill),
          borderDashArray: op.dash,
        });
      } else if (op.t === 'text') {
        const font = op.font === 'bold' ? bold : regular;
        const safe = sanitise(op.s);
        if (!safe) continue;
        for (let c = 0; c < safe.length; c += 1) chars.add(safe[c]);
        let x = op.x;
        if (op.align !== 'left') {
          const w = font.widthOfTextAtSize(safe, op.size);
          x = op.align === 'center' ? op.x - w / 2 : op.x - w;
        }
        if (x < rect.x - 1 || x + font.widthOfTextAtSize(safe, op.size) > rect.x + rect.w + 1) {
          if (spec.kind === 'puzzle' || spec.kind === 'answer') overflow += 1;
        }
        page.drawText(safe, { x, y: op.y, size: op.size, font, color: grey });
      }
    }

    if (i % 8 === 7) {
      if (o.onProgress) o.onProgress(i + 1, pages.length, 'compose');
      /* eslint-disable no-await-in-loop */
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (o.onProgress) o.onProgress(pages.length, pages.length, 'save');
  await new Promise((r) => setTimeout(r, 24));

  const bytes = await doc.save({ useObjectStreams: true });
  return {
    cancelled: false,
    bytes,
    sizeBytes: bytes.byteLength,
    glyphs: chars.size,
    overflow,
  };
}

/** pdf-lib throws on characters the embedded font has no glyph for. The book
    interior is Latin by design, so anything else is dropped and counted rather
    than allowed to abort a 200 page export. */
function sanitise(s) {
  return String(s).replace(/[^\u0020-\u007E\u00A0-\u024F]/g, '');
}

export function filenameFor(meta, plan) {
  const base = meta.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'puzzle-book';
  const size = plan.trimId === 'letter' ? '8.5x11' : '6x9';
  return `${base}-interior-${size}${plan.bleed ? '-bleed' : ''}.pdf`;
}
