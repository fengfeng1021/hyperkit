/* ==========================================================================
   Export. This is the half of the job the SaaS tools leave to you: the
   cutout is not the deliverable, the correctly framed, correctly named,
   correctly foldered file is.

   One photo is open at full size at any moment. It is composited, written to
   every selected preset, and released before the next one is touched.
   ========================================================================== */

import { canvasToBlob, baseName, yieldToBrowser } from './util.js';
import { featherMask } from './chroma.js';
import { cutout, reframe, nativeFrame } from './compose.js';
import { outputSpecs, fileNameFor, activePresets } from './presets.js';
import { ZipWriter } from './zipwriter.js';

const VOLUME_LIMIT = 1_900_000_000;   // split before any single file gets unwieldy
const ROOT = 'forge-export';

export function plannedFileCount(queue) {
  return queue.deliverable.length * outputSpecs().length;
}

/**
 * @param {Queue} queue
 * @param {{onProgress:Function,onFolder:Function,onStage:Function}} hooks
 */
export async function runExport(queue, hooks = {}) {
  const { onProgress = () => {}, onFolder = () => {}, onStage = () => {} } = hooks;
  const specs = outputSpecs();
  const items = queue.deliverable;

  if (!specs.length) throw new Error('Pick at least one output preset before exporting.');
  if (!items.length) throw new Error('Nothing is done yet.');

  const total = items.length * specs.length;
  let written = 0;
  const manifest = [['original', 'output', 'platform', 'size', 'mode', 'needs a look', 'note']];
  const unreadable = [];

  const volumes = [];
  let writer = newVolume(onFolder, specs);

  /* Decode only as large as the biggest selected output actually needs. We
     never upscale, and we never hold 8000 px of pixels to make a 1024 px JPEG. */
  const wantsNative = specs.some(s => !s.reframe);
  const biggestFramed = specs.reduce((mx, s) => (s.reframe ? Math.max(mx, Math.ceil(s.size / s.fill)) : mx), 0);

  onStage('packing');

  for (const item of items) {
    let bitmap = null;
    try {
      const nativeEdge = Math.max(item.width || 0, item.height || 0);
      const targetEdge = wantsNative ? nativeEdge : Math.min(nativeEdge, Math.max(biggestFramed, 512));
      bitmap = await queue.openFullSize(item, targetEdge);
    } catch {
      unreadable.push(item.name);
      manifest.push([item.name, '', '', '', item.mode || '', '', 'could not be re-opened at full size']);
      written += specs.length;
      onProgress(written, total);
      continue;
    }

    try {
      const alpha = featherMask(item.mask, item.tw, item.th, item.feather);
      const cut = cutout(bitmap, bitmap.width, bitmap.height, alpha, item.tw, item.th, {
        despill: item.despill, bg: item.bg,
      });

      const base = baseName(item.name);
      for (const spec of specs) {
        const canvas = spec.reframe ? reframe(cut.canvas, cut.bbox, spec) : nativeFrame(cut.canvas, spec);
        const mime = spec.format === 'jpg' ? 'image/jpeg' : 'image/png';
        const blob = await canvasToBlob(canvas, mime, spec.format === 'jpg' ? spec.quality : undefined);

        if (writer.size + blob.size > VOLUME_LIMIT && writer.count > 1) {
          finishVolume(writer, manifest, volumes);
          writer = newVolume(onFolder, specs);
        }

        const folder = `${ROOT}/${spec.folder}`;
        const fileName = fileNameFor(spec, base, 1);
        await writer.add(`${folder}/${fileName}`, blob);

        manifest.push([
          item.name,
          `${spec.folder}/${fileName}`,
          spec.presetName,
          spec.reframe ? `${spec.size}x${spec.size}` : `${canvas.width}x${canvas.height}`,
          item.mode || 'chroma-key',
          item.flagReason ? 'yes' : 'no',
          item.flagReason || (item.downscaled ? 'downscaled for export' : ''),
        ]);

        if (canvas !== cut.canvas) { canvas.width = 1; canvas.height = 1; }
        written++;
        onProgress(written, total);
      }

      cut.canvas.width = 1; cut.canvas.height = 1;
    } catch (err) {
      unreadable.push(item.name);
      manifest.push([item.name, '', '', '', item.mode || '', '', 'failed while compositing']);
      written += specs.length;
      onProgress(written, total);
    } finally {
      if (bitmap) { try { bitmap.close(); } catch { /* already closed */ } }
      await yieldToBrowser();
    }
  }

  onStage('writing');
  finishVolume(writer, manifest, volumes);

  const names = volumes.length === 1
    ? [`${ROOT}.zip`]
    : volumes.map((_, i) => `${ROOT}-${i + 1}of${volumes.length}.zip`);

  return { blobs: volumes, names, written, total, unreadable, manifestRows: manifest.length - 1 };
}

function newVolume(onFolder, specs) {
  const writer = new ZipWriter();
  writer.addFolder(`${ROOT}/`);
  onFolder(`${ROOT}/`, 0);
  const seen = new Set();
  for (const p of activePresets()) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    writer.addFolder(`${ROOT}/${p.id}/`);
    onFolder(`${p.id}/`, 1);
    for (const spec of specs.filter(s => s.presetId === p.id)) {
      writer.addFolder(`${ROOT}/${spec.folder}/`);
      onFolder(`${spec.format}/`, 2);
    }
  }
  onFolder('_manifest.csv', 1);
  return writer;
}

/* Every volume carries the full manifest, so a split export is still
   auditable from whichever part you happen to open. */
function finishVolume(writer, manifest, volumes) {
  const csv = manifest.map(row => row.map(csvCell).join(',')).join('\r\n');
  writer.addText(`${ROOT}/_manifest.csv`, csv);
  volumes.push(writer.close());
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
