/* ==========================================================================
   GradientKit - track.js
   The engraved rule under the Stage, its stop handles, and the color popover.

   Dragging is pointer-captured and updates the readout on the same frame. No
   inertia: a precision instrument does not throw. Inserting a stop samples the
   gradient at that exact t, so adding a control point never changes the
   picture and never destroys work.
   ========================================================================== */

import {
  parseHex, toHex, hexToOklch, oklchToSrgbUnclamped, gamutMapOklch, isInSrgb,
  formatOklch, nameColor, clamp,
} from './color.js';
import { rampAt } from './gradient.js';
import { iconMarkup } from './icons.js';

const HANDLE_MIN = 2;

export function createTrack(root, ctx) {
  const handlesEl = root.querySelector('.gk-track-handles');
  const ghostEl = root.querySelector('.gk-track-ghost');
  const readoutEl = root.querySelector('.gk-track-readout');
  let activeIndex = 0;
  let drag = null;

  function stops() {
    return ctx.store.get().stops;
  }

  function sortedIndexes() {
    return stops()
      .map((s, i) => ({ s, i }))
      .sort((a, b) => a.s.pos - b.s.pos)
      .map((x) => x.i);
  }

  function render() {
    const list = stops();
    const existing = [...handlesEl.children];
    while (existing.length > list.length) handlesEl.removeChild(handlesEl.lastElementChild);
    for (let i = handlesEl.children.length; i < list.length; i++) {
      handlesEl.appendChild(makeHandle());
    }
    list.forEach((stop, i) => {
      const el = handlesEl.children[i];
      el.style.left = `${stop.pos}%`;
      el.style.setProperty('--stop-color', stop.hex);
      el.dataset.index = String(i);
      el.tabIndex = i === activeIndex ? 0 : -1;
      el.setAttribute('aria-valuenow', stop.pos.toFixed(2));
      el.setAttribute('aria-valuetext', `${stop.pos.toFixed(1)}%，${nameColor(stop.hex)}`);
      el.querySelector('.gk-stop-value').textContent = `${stop.pos.toFixed(2)}%`;
      const twin = list.some((o, j) => j !== i && Math.abs(o.pos - stop.pos) < 0.01);
      el.classList.toggle('is-hardstop', twin);
      // Handles near either end align their readout inward so it is never
      // clipped by the track's own bounds.
      el.dataset.edge = stop.pos < 8 ? 'start' : stop.pos > 92 ? 'end' : 'mid';
    });
    updateReadout();
  }

  function makeHandle() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gk-stop';
    b.setAttribute('role', 'slider');
    b.setAttribute('aria-orientation', 'horizontal');
    b.setAttribute('aria-valuemin', '0');
    b.setAttribute('aria-valuemax', '100');
    b.innerHTML = '<span class="gk-stop-value"></span>';
    return b;
  }

  function updateReadout() {
    const list = stops();
    const stop = list[activeIndex];
    if (!stop) { readoutEl.textContent = ''; return; }
    const twin = list.some((o, j) => j !== activeIndex && Math.abs(o.pos - stop.pos) < 0.01);
    readoutEl.textContent = twin
      ? `${stop.pos.toFixed(1)}% 硬邊`
      : `${stop.hex}　${stop.pos.toFixed(2)}%`;
  }

  function posFromEvent(e) {
    const r = root.getBoundingClientRect();
    return clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
  }

  function setActive(i) {
    activeIndex = clamp(i, 0, stops().length - 1);
    render();
    ctx.onActiveChange?.(activeIndex);
  }

  /* ---- drag ------------------------------------------------------------ */

  handlesEl.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.gk-stop');
    if (!el) return;
    const index = Number(el.dataset.index);

    // Alt on an existing handle duplicates that stop at the pointer.
    if (e.altKey) {
      const src = stops()[index];
      const pos = posFromEvent(e);
      ctx.store.commit((s) => {
        s.stops.splice(index + 1, 0, { hex: src.hex, pos: +pos.toFixed(2) });
        return s;
      }, 'stop-duplicate');
      setActive(index + 1);
      return;
    }

    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    ctx.store.mark();
    drag = { index, startPos: stops()[index].pos, pointerId: e.pointerId, moved: false };
    setActive(index);
    el.classList.add('is-dragging');
    root.classList.add('is-dragging');
    ctx.setGuide?.(stops()[index].pos / 100);
  });

  handlesEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    let pos = posFromEvent(e);
    if (e.shiftKey) pos = Math.round(pos);
    drag.moved = true;
    ctx.store.set((s) => {
      s.stops[drag.index].pos = +pos.toFixed(2);
      return s;
    }, 'stop-drag');
    ctx.setGuide?.(pos / 100);
  });

  function endDrag(e) {
    if (!drag) return;
    const el = handlesEl.children[drag.index];
    if (el) {
      el.classList.remove('is-dragging');
      el.classList.add('is-settling');
      setTimeout(() => el.classList.remove('is-settling'), 240);
      try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    root.classList.remove('is-dragging');
    ctx.setGuide?.(null);
    ctx.store.set({}, 'stop-drop');
    drag = null;
  }
  handlesEl.addEventListener('pointerup', endDrag);
  handlesEl.addEventListener('pointercancel', endDrag);

  /** Esc during a drag aborts and restores the pre-drag position. */
  function abortDrag() {
    if (!drag) return false;
    const { index, startPos } = drag;
    ctx.store.set((s) => { s.stops[index].pos = startPos; return s; }, 'stop-abort');
    root.classList.remove('is-dragging');
    ctx.setGuide?.(null);
    drag = null;
    return true;
  }

  /* ---- ghost handle + insert ------------------------------------------- */

  root.addEventListener('pointermove', (e) => {
    if (drag || e.target.closest('.gk-stop')) { ghostEl.hidden = true; return; }
    const pos = posFromEvent(e);
    ghostEl.hidden = false;
    ghostEl.style.left = `${pos}%`;
    ghostEl.textContent = `${pos.toFixed(2)}%`;
  });
  root.addEventListener('pointerleave', () => { ghostEl.hidden = true; });

  root.addEventListener('click', (e) => {
    if (e.target.closest('.gk-stop')) return;
    insertAt(posFromEvent(e));
  });

  function insertAt(pos) {
    if (stops().length >= 16) {
      ctx.notice?.('色標最多十六個。想再加就先刪掉一個。');
      return;
    }
    const ramp = ctx.getRamp();
    const c = rampAt(ramp, pos / 100);
    const hex = toHex(c.r, c.g, c.b);
    let newIndex = 0;
    ctx.store.commit((s) => {
      s.stops.push({ hex, pos: +pos.toFixed(2) });
      newIndex = s.stops.length - 1;
      return s;
    }, 'stop-insert');
    setActive(newIndex);
    const el = handlesEl.children[newIndex];
    if (el) {
      el.classList.add('is-settling');
      setTimeout(() => el.classList.remove('is-settling'), 240);
      el.focus();
    }
  }

  /* ---- keyboard -------------------------------------------------------- */

  handlesEl.addEventListener('keydown', (e) => {
    const el = e.target.closest('.gk-stop');
    if (!el) return;
    const index = Number(el.dataset.index);
    const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const order = sortedIndexes();
    const at = order.indexOf(index);

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      ctx.store.commit((s) => {
        s.stops[index].pos = +clamp(s.stops[index].pos + dir * step, 0, 100).toFixed(2);
        return s;
      }, 'stop-key', `stop-${index}`);
      setActive(index);
      handlesEl.children[index]?.focus();
    } else if (e.key === 'Tab' && !e.shiftKey && at < order.length - 1) {
      // Roving tabindex: Tab leaves the group, [ and ] move within it.
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      const nextAt = e.key === ']' ? (at + 1) % order.length : (at - 1 + order.length) % order.length;
      setActive(order[nextAt]);
      handlesEl.children[order[nextAt]]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      ctx.store.commit((s) => { s.stops[index].pos = e.key === 'Home' ? 0 : 100; return s; }, 'stop-key');
      setActive(index);
      handlesEl.children[index]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openColorPopover(el, index);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeStop(index);
    }
  });

  handlesEl.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.gk-stop');
    if (el) openColorPopover(el, Number(el.dataset.index));
  });

  handlesEl.addEventListener('focusin', (e) => {
    const el = e.target.closest('.gk-stop');
    if (el) setActive(Number(el.dataset.index));
  });

  function removeStop(index) {
    if (stops().length <= HANDLE_MIN) {
      ctx.notice?.('漸層至少要留兩個色標。');
      return;
    }
    ctx.store.commit((s) => { s.stops.splice(index, 1); return s; }, 'stop-delete');
    setActive(Math.max(0, index - 1));
    handlesEl.children[Math.max(0, index - 1)]?.focus();
  }

  /* ---- color popover --------------------------------------------------- */

  let popover = null;

  function closePopover(refocus = true) {
    if (!popover) return false;
    const trigger = popover.trigger;
    popover.el.remove();
    document.removeEventListener('pointerdown', popover.outside, true);
    popover = null;
    if (refocus && trigger) trigger.focus();
    return true;
  }

  function openColorPopover(trigger, index) {
    closePopover(false);
    const el = document.createElement('div');
    el.className = 'gk-popover';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `第 ${index + 1} 個色標的顏色`);

    const current = stops()[index].hex;
    const lch = hexToOklch(current);

    el.innerHTML = `
      <div class="gk-pop-row">
        <label class="gk-pop-label" for="pop-hex">Hex</label>
        <input class="gk-pop-hex" id="pop-hex" type="text" spellcheck="false" autocomplete="off" value="${current}">
        ${'EyeDropper' in window ? `<button type="button" class="gk-pop-pick">${iconMarkup('pipette')}<span class="gk-sr">從螢幕上吸一個顏色</span></button>` : ''}
      </div>
      <p class="gk-pop-msg" role="status"></p>
      <div class="gk-pop-triple">
        ${lchRow('L', 'l', lch.L, 0, 1, 0.001, 3)}
        ${lchRow('C', 'c', lch.C, 0, 0.4, 0.001, 3)}
        ${lchRow('H', 'h', Number.isNaN(lch.H) ? 0 : lch.H, 0, 360, 0.1, 1)}
      </div>
      <p class="gk-pop-gamut"></p>
    `;

    document.body.appendChild(el);
    position(el, trigger);

    const hexInput = el.querySelector('.gk-pop-hex');
    const msg = el.querySelector('.gk-pop-msg');
    const gamut = el.querySelector('.gk-pop-gamut');
    const fields = {
      l: el.querySelector('[data-lch="l"]'),
      c: el.querySelector('[data-lch="c"]'),
      h: el.querySelector('[data-lch="h"]'),
    };

    function currentLch() {
      return {
        L: Number(fields.l.value),
        C: Number(fields.c.value),
        H: Number(fields.h.value),
      };
    }

    function paintGamut() {
      const { L, C, H } = currentLch();
      if (isInSrgb(L, C, H)) {
        gamut.textContent = '在 sRGB 色域內。';
        gamut.classList.remove('is-clipped');
      } else {
        const m = gamutMapOklch(L, C, H);
        gamut.textContent = `為了塞進 sRGB，彩度被壓到 ${m.clippedC.toFixed(3)}，Delta E ${m.deltaE.toFixed(3)}。`;
        gamut.classList.add('is-clipped');
      }
    }

    function applyLch(live) {
      const { L, C, H } = currentLch();
      const m = gamutMapOklch(L, C, H);
      const hex = toHex(m.r, m.g, m.b);
      hexInput.value = hex;
      el.style.setProperty('--pop-color', hex);
      paintGamut();
      const write = live ? ctx.store.set : ctx.store.commit;
      write.call(ctx.store, (s) => { s.stops[index].hex = hex; return s; }, 'stop-color', `color-${index}`);
      render();
    }

    for (const key of ['l', 'c', 'h']) {
      const input = fields[key];
      input.addEventListener('input', () => {
        const out = input.parentElement.querySelector('.gk-pop-num');
        out.textContent = Number(input.value).toFixed(Number(input.dataset.decimals));
        applyLch(true);
      });
      input.addEventListener('change', () => applyLch(false));
    }

    let debounce = 0;
    hexInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const rgb = parseHex(hexInput.value);
        if (!rgb) {
          el.classList.add('is-error');
          msg.textContent = '這不是顏色。試試 #3A5BFF 或 oklch(62% 0.21 264)。';
          return;
        }
        el.classList.remove('is-error');
        msg.textContent = '';
        const next = hexToOklch(hexInput.value);
        fields.l.value = String(next.L);
        fields.c.value = String(next.C);
        fields.h.value = String(Number.isNaN(next.H) ? 0 : next.H);
        for (const key of ['l', 'c', 'h']) {
          const out = fields[key].parentElement.querySelector('.gk-pop-num');
          out.textContent = Number(fields[key].value).toFixed(Number(fields[key].dataset.decimals));
        }
        applyLch(false);
      }, 300);
    });
    hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        hexInput.value = stops()[index].hex;
        el.classList.remove('is-error');
        msg.textContent = '';
      }
    });

    const pick = el.querySelector('.gk-pop-pick');
    if (pick) {
      pick.addEventListener('click', async () => {
        try {
          // Cancelling a pick is not an error and shows no message.
          const res = await new window.EyeDropper().open();
          if (res?.sRGBHex) {
            hexInput.value = res.sRGBHex.toUpperCase();
            hexInput.dispatchEvent(new Event('input'));
          }
        } catch { /* user cancelled */ }
      });
    }

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closePopover(); }
    });

    const outside = (e) => {
      if (!el.contains(e.target) && e.target !== trigger) closePopover(false);
    };
    document.addEventListener('pointerdown', outside, true);

    popover = { el, trigger, outside };
    el.style.setProperty('--pop-color', current);
    paintGamut();
    hexInput.focus();
    hexInput.select();
  }

  function lchRow(label, key, value, min, max, step, decimals) {
    return `
      <div class="gk-pop-field">
        <span class="gk-pop-key">${label}</span>
        <input class="gk-pop-rail" type="range" data-lch="${key}" data-decimals="${decimals}"
               min="${min}" max="${max}" step="${step}" value="${value}"
               aria-label="${label === 'L' ? '明度' : label === 'C' ? '彩度' : '色相'}">
        <span class="gk-pop-num">${Number(value).toFixed(decimals)}</span>
      </div>`;
  }

  function position(el, trigger) {
    const r = trigger.getBoundingClientRect();
    const w = 260;
    const left = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8);
    const above = r.top > 320;
    el.style.left = `${left}px`;
    if (above) el.style.top = `${r.top - 8}px`;
    else el.style.top = `${r.bottom + 8}px`;
    el.dataset.side = above ? 'above' : 'below';
  }

  render();

  return {
    render,
    setActive,
    get activeIndex() { return activeIndex; },
    insertAtWidestGap() {
      const list = stops().slice().sort((a, b) => a.pos - b.pos);
      let gap = 0;
      let at = 50;
      for (let i = 0; i < list.length - 1; i++) {
        const d = list[i + 1].pos - list[i].pos;
        if (d > gap) { gap = d; at = list[i].pos + d / 2; }
      }
      insertAt(at);
    },
    removeActive() { removeStop(activeIndex); },
    openColorFor(index) {
      const el = handlesEl.children[index];
      if (el) openColorPopover(el, index);
    },
    abortDrag,
    closePopover,
    get isDragging() { return !!drag; },
    get hasPopover() { return !!popover; },
  };
}

export { oklchToSrgbUnclamped, formatOklch };
