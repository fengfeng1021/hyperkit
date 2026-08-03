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
      metaEl.textContent = `${lines.length} 行 ${currentText.length} 字`;
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
        noteEl.textContent = '圓錐漸層在 SVG 裡沒有對應的原生元素，所以這個分頁改成嵌一張 512px 的點陣圖，內容就是載物台上看到的。';
        const token = ++rasterToken;
        try {
          const raster = await buildSvgRaster(scene, 512);
          if (token === rasterToken && active === 'svg') setCode(raster.code);
        } catch {
          noteEl.textContent = '這台裝置畫不出那張 512px 的點陣圖。改用 PNG 分頁輸出。';
        }
      } else {
        setCode(out.code);
        noteEl.textContent = 'SVG 漸層只吃 sRGB，所以色標是從 OKLCH 曲線上重新取十七個位置抓下來的。';
      }
      noteEl.dataset.state = 'ok';
      copyBtn.hidden = false;
      els.pngPanel.hidden = true;
    } else if (active === 'tailwind') {
      const out = buildTailwind(scene);
      setCode(out.code);
      noteEl.textContent = 'Tailwind v4 的 @theme。不產 v3 的 config 物件，因為 v3 config 正是 v4 要取代掉的東西。';
      noteEl.dataset.state = 'ok';
      copyBtn.hidden = false;
      els.pngPanel.hidden = true;
    } else {
      setCode(`${suggestedFilename(scene, pngSize)}\n${pngSize} x ${pngSize} px\ndither ${scene.dither ? 'on' : 'off'}, grain ${scene.grain.amp}/${scene.grain.size}\n色覺模擬永遠不會被烤進檔案裡`);
      noteEl.textContent = '用同一支 shader 直接在目標尺寸算一次，所以抖色和顆粒是全解析度長出來的，不是放大來的。';
      noteEl.dataset.state = 'ok';
      copyBtn.hidden = true;
      els.pngPanel.hidden = false;
    }
  }

  copyBtn.addEventListener('click', async () => {
    const res = await copyText(currentText, codeEl);
    if (res.ok) {
      copy.success('已複製');
    } else {
      copy.label('自己按 Ctrl+C');
      ctx.notice({
        message: '瀏覽器擋掉了剪貼簿。程式碼已經幫你選起來了，按 Ctrl+C 複製。',
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
    png.loading(`正在算 ${pngSize}px`);
    png.progress(0);
    try {
      const result = await exportPng({ ...scene, vision: 'normal' }, pngSize, (p) => png.progress(p));
      const name = suggestedFilename(scene, result.size);
      const url = downloadBlob(result.blob, name);
      png.success('已下載');
      if (result.downgraded) {
        ctx.notice({
          message: `${pngSize}px 對這台裝置來說太大了，所以改存成 ${result.size}px 的檔案。`,
        });
      } else if (!document.hasFocus()) {
        ctx.notice({
          message: '下載可能被擋掉了。用這個連結把檔案存下來。',
          action: { label: `存成 ${name}`, onClick: () => { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); } },
        });
      }
      pngNote.textContent = `上次輸出：${name}`;
    } catch (err) {
      png.reset();
      ctx.notice({
        message: '這台裝置算不出這張圖。挑一個小一點的尺寸再試。',
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
