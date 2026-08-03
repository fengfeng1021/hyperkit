/* ==========================================================================
   GradientKit - outputs.js
   The output tabs, the code block, and the export actions.

   Copy always reports which branch it took: a silent copy is indistinguishable
   from a failed copy. When the clipboard is blocked the code is selected for
   the user and the Notice says which keys to press.

   Motion mount points, stable:
     .gk-code-wipe   overlay whose clip-path the changed-line highlight tweens
                     (filled with --user-mid-wash, the gradient's own mid color)
   ========================================================================== */

import { buildCss, buildSvg, buildSvgRaster, buildTailwind, verifyCss, exportPng, downloadBlob, suggestedFilename } from './output.js';
import { buttonStates, copyText, bindTablist } from './controls.js';

export function createOutputs(els, ctx) {
  const { tablist, codeEl, metaEl, copyBtn, noteEl, pngSizes, pngBtn, pngNote, wipeEl } = els;
  const copy = buttonStates(copyBtn);
  const png = buttonStates(pngBtn);
  let active = 'css';
  let currentText = '';
  let pngSize = 2048;
  let rasterToken = 0;

  const tabs = bindTablist(tablist, {
    onChange: (name) => {
      active = name;
      render(true);
    },
  });

  // The code block scrolls vertically now that long declarations wrap. The
  // fade is the only signal that there is more below, so it is bound to the
  // real scroll position rather than left on permanently.
  const scroller = codeEl.parentElement;
  function syncScrollHint() {
    const more = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 2;
    scroller.parentElement.classList.toggle('has-more', more);
  }
  scroller.addEventListener('scroll', syncScrollHint, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncScrollHint).observe(scroller);

  function setCode(text) {
    const changed = text !== currentText;
    currentText = text;
    // One element per logical line, each carrying its own number. Lines wrap,
    // so a number can no longer be positioned by counting line boxes.
    const lines = text.split('\n');
    const rows = lines.map((line, i) => {
      const row = document.createElement('span');
      row.className = 'gk-code-line';
      row.dataset.n = String(i + 1);
      row.textContent = line;
      return row;
    });
    codeEl.replaceChildren(...rows);
    if (metaEl) {
      metaEl.textContent = `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, ${currentText.length} chars`;
    }
    requestAnimationFrame(syncScrollHint);
    if (changed) {
      wipeEl.classList.remove('is-wiping');
      void wipeEl.offsetWidth;
      wipeEl.classList.add('is-wiping');
    }
  }

  async function render() {
    const scene = ctx.store.get();
    if (active === 'css') {
      const out = buildCss(scene);
      setCode(out.code);
      const v = verifyCss(out);
      noteEl.textContent = v.note;
      noteEl.dataset.state = v.fallbackOk ? 'ok' : 'bug';
      copyBtn.hidden = false;
      els.pngPanel.hidden = true;
    } else if (active === 'svg') {
      const out = buildSvg(scene);
      if (out.needsRaster) {
        setCode(out.code);
        noteEl.textContent = 'A conic gradient has no SVG primitive, so this tab embeds a 512px raster of exactly what the Stage shows.';
        const token = ++rasterToken;
        try {
          const raster = await buildSvgRaster(scene, 512);
          if (token === rasterToken && active === 'svg') setCode(raster.code);
        } catch {
          noteEl.textContent = 'This device could not render the 512px raster. Use the PNG tab instead.';
        }
      } else {
        setCode(out.code);
        noteEl.textContent = 'SVG gradients are sRGB only, so the stops are resampled from the OKLCH curve at 17 positions.';
      }
      noteEl.dataset.state = 'ok';
      copyBtn.hidden = false;
      els.pngPanel.hidden = true;
    } else if (active === 'tailwind') {
      const out = buildTailwind(scene);
      setCode(out.code);
      noteEl.textContent = 'Tailwind v4 @theme. A v3 config object is not emitted, because v3 config files are the thing v4 replaces.';
      noteEl.dataset.state = 'ok';
      copyBtn.hidden = false;
      els.pngPanel.hidden = true;
    } else {
      setCode(`${suggestedFilename(scene, pngSize)}\n${pngSize} x ${pngSize} px\ndither ${scene.dither ? 'on' : 'off'}, grain ${scene.grain.amp}/${scene.grain.size}\nvision simulation is never baked in`);
      noteEl.textContent = 'Rendered by the same shader at the target size, so dither and grain land at full resolution instead of being upscaled.';
      noteEl.dataset.state = 'ok';
      copyBtn.hidden = true;
      els.pngPanel.hidden = false;
    }
  }

  copyBtn.addEventListener('click', async () => {
    const res = await copyText(currentText, codeEl);
    if (res.ok) {
      copy.success('Copied');
    } else {
      copy.label('Select and copy');
      ctx.notice({
        message: 'The browser blocked clipboard access. The code is selected, press Ctrl+C.',
        assertive: true,
      });
      setTimeout(() => copy.reset(), 4000);
    }
  });

  pngSizes.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-size]');
    if (!b) return;
    pngSize = Number(b.dataset.size);
    for (const btn of pngSizes.querySelectorAll('button[data-size]')) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.size) === pngSize));
    }
    render();
  });

  pngBtn.addEventListener('click', async () => {
    const scene = ctx.store.get();
    png.loading(`Rendering ${pngSize}px`);
    png.progress(0);
    try {
      const result = await exportPng({ ...scene, vision: 'normal' }, pngSize, (p) => png.progress(p));
      const name = suggestedFilename(scene, result.size);
      const url = downloadBlob(result.blob, name);
      png.success('Downloaded');
      if (result.downgraded) {
        ctx.notice({
          message: `The ${pngSize}px export was too large for this device, so a ${result.size}px file was saved instead.`,
        });
      } else if (!document.hasFocus()) {
        ctx.notice({
          message: 'The download may have been blocked. Use this link to save the file.',
          action: { label: `Save ${name}`, onClick: () => { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); } },
        });
      }
      pngNote.textContent = `Last export: ${name}`;
    } catch (err) {
      png.reset();
      ctx.notice({
        message: 'That export could not be rendered on this device. Try a smaller size.',
        assertive: true,
      });
    }
  });

  return {
    render,
    activate: tabs.activate,
    get text() { return currentText; },
    get active() { return active; },
  };
}
