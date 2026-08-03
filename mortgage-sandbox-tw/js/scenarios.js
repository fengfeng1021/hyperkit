/* ==========================================================================
   scenarios.js
   The only card on the page, because a scenario really is a discrete object
   you pick up and put somewhere else.

   Storage degrades honestly: when localStorage is full or disabled the tray
   keeps working for this tab and says so, rather than silently losing data.
   ========================================================================== */

import { readStore, writeStore, encode, decode } from './serialize.js';
import { fmt } from './format.js';
import { simulate } from './finance.js';
import { toast } from './toast.js';

const KEY = 'scenarios';
const MAX_SLOTS = 3;
const MAX_STORED = 12;

export function createScenarios(opts) {
  const tray = document.getElementById('tray');
  const note = document.getElementById('tray-note');
  let items = [];
  let sessionOnly = false;
  let moveMode = null; // { id, index }

  function load() {
    const stored = readStore(KEY, []);
    items = Array.isArray(stored) ? stored.slice(0, MAX_STORED) : [];
  }

  function persist() {
    if (sessionOnly) return;
    const res = writeStore(KEY, items);
    if (!res.ok) {
      sessionOnly = true;
      showSessionNote();
      toast({
        message: '瀏覽器存不下這個情境（空間滿了或是無痕視窗）。你的網址列已經包含全部參數，先複製起來就不會弄丟。',
        tone: 'error',
        actions: [
          { label: '複製分享連結', onClick: () => opts.onCopyLink?.() },
          { label: '清掉本站存的情境', onClick: () => { items = []; render(); opts.onClearStore?.(); } },
        ],
      });
    }
  }

  function showSessionNote() {
    note.hidden = false;
    note.textContent = '這次的情境只留在這個分頁，關掉就沒了。';
  }

  function thumbnail(res) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 24');
    svg.setAttribute('class', 'chip__thumb');
    svg.setAttribute('aria-hidden', 'true');
    const N = res.months;
    let lo = Infinity, hi = -Infinity;
    ['a', 'b', 'c'].forEach((k) => {
      const s = res.paths[k].net;
      for (let t = 0; t <= N; t += 12) { if (s[t] < lo) lo = s[t]; if (s[t] > hi) hi = s[t]; }
    });
    const span = hi - lo || 1;
    ['c', 'b', 'a'].forEach((k) => {
      const s = res.paths[k].net;
      let d = '';
      for (let t = 0; t <= N; t += 12) {
        const x = (t / N) * 48;
        const y = 23 - ((s[t] - lo) / span) * 22;
        d += `${t === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('class', `chip__line chip__line--${k}`);
      svg.appendChild(p);
    });
    return svg;
  }

  function render() {
    opts.beforeRender?.();
    tray.textContent = '';
    const shown = items.slice(0, MAX_SLOTS);

    for (let i = 0; i < MAX_SLOTS; i++) {
      const li = document.createElement('li');
      li.className = 'tray__slot';
      li.dataset.index = i;

      const it = shown[i];
      if (!it) {
        li.classList.add('is-empty');
        const p = document.createElement('p');
        p.className = 'tray__placeholder';
        p.textContent = i === 0
          ? '調好一組參數後按「存成情境」，它會出現在這裡。'
          : '空格';
        li.appendChild(p);
        tray.appendChild(li);
        continue;
      }

      const res = simulate(decode(`#${it.hash}`).params);

      const card = document.createElement('article');
      card.className = 'chip';
      card.tabIndex = 0;
      card.dataset.id = it.id;
      card.dataset.flipId = it.id;   // stable identity across a full re-render
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `載入情境 ${it.name}`);
      if (moveMode && moveMode.id === it.id) card.classList.add('is-moving');

      const head = document.createElement('div');
      head.className = 'chip__head';

      /* The pointer grip. Keyboard users get the same reorder through Enter,
         so this is an affordance, not the only route. */
      const grip = document.createElement('span');
      grip.className = 'chip__grip';
      grip.setAttribute('aria-hidden', 'true');
      grip.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-grip"></use></svg>';
      // grabbing the card is not the same gesture as loading it
      grip.addEventListener('click', (e) => e.stopPropagation());

      const name = document.createElement('span');
      name.className = 'chip__name';
      name.contentEditable = 'true';
      name.spellcheck = false;
      name.textContent = it.name;
      name.setAttribute('role', 'textbox');
      name.setAttribute('aria-label', '情境名稱，可直接編輯');
      name.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
      });
      name.addEventListener('blur', () => {
        it.name = (name.textContent || '未命名情境').trim().slice(0, 24) || '未命名情境';
        name.textContent = it.name;
        persist();
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'chip__del';
      del.setAttribute('aria-label', `刪除情境 ${it.name}`);
      del.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg>';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        items = items.filter((x) => x.id !== it.id);
        persist();
        render();
      });
      head.append(grip, name, del);

      const dl = document.createElement('dl');
      dl.className = 'chip__figs';
      [['A', 'a'], ['B', 'b'], ['C', 'c']].forEach(([label, k]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = fmt.money(res.paths[k].net[res.months]);
        dl.append(dt, dd);
      });

      const cross = document.createElement('p');
      cross.className = 'chip__cross';
      const who = res.leader === 'b' ? '投資' : '還款';
      cross.textContent = res.markMonth < 0
        ? '差距全程小於門檻'
        : res.markKind === 'cross'
          ? `${who}於 ${fmt.monthShort(res.markMonth)} 反超`
          : res.markMonth === 0
            ? `${who}一路領先`
            : `${who}於 ${fmt.monthShort(res.markMonth)} 拉開`;

      card.append(head, dl, cross, thumbnail(res));
      card.addEventListener('click', () => opts.onLoad?.(it.hash, it.name));
      card.addEventListener('keydown', (e) => onCardKey(e, it, i));
      li.appendChild(card);
      tray.appendChild(li);
    }

    if (sessionOnly) showSessionNote();
    opts.afterRender?.();
  }

  /** Move a saved scenario to another slot. Used by both the keyboard path
      and the pointer drag. Returns false when nothing moved. */
  function reorder(id, toIndex) {
    const from = items.findIndex((x) => x.id === id);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(Math.min(items.length, MAX_SLOTS) - 1, toIndex));
    if (to === from) return false;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    persist();
    render();
    opts.announce?.(`已移到第 ${to + 1} 格`);
    return true;
  }

  function onCardKey(e, it, index) {
    if (moveMode && moveMode.id === it.id) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const to = Math.max(0, Math.min(Math.min(items.length, MAX_SLOTS) - 1, moveMode.index + dir));
        moveMode.index = to;
        opts.announce?.(`移動到第 ${to + 1} 格`);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const from = items.findIndex((x) => x.id === it.id);
        const [moved] = items.splice(from, 1);
        items.splice(moveMode.index, 0, moved);
        moveMode = null;
        persist();
        render();
        opts.announce?.('已放下');
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        moveMode = null;
        render();
        opts.announce?.('已取消移動');
        return;
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      moveMode = { id: it.id, index };
      render();
      opts.announce?.('移動模式，左右鍵選擇位置，Enter 放下，Esc 取消');
    } else if (e.key === ' ') {
      e.preventDefault();
      opts.onLoad?.(it.hash, it.name);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      items = items.filter((x) => x.id !== it.id);
      persist();
      render();
    }
  }

  load();
  render();

  return {
    save(params, name) {
      const hash = encode(params);
      if (items.some((x) => x.hash === hash)) {
        toast({ message: '這組參數已經在比較欄裡了。改一個數字再存，才看得出差別。' });
        return false;
      }
      if (items.length >= MAX_SLOTS) {
        toast({
          message: '比較欄最多三個情境，先移掉一個。',
          tone: 'error',
          actions: [{ label: '移掉最舊的', onClick: () => { items.shift(); persist(); render(); } }],
        });
        return false;
      }
      items.push({
        id: `s${Date.now().toString(36)}`,
        name: name || `情境 ${items.length + 1}`,
        hash,
        savedAt: Date.now(),
      });
      persist();
      render();
      return true;
    },
    cancelMove() {
      if (!moveMode) return false;
      moveMode = null;
      render();
      return true;
    },
    get count() { return Math.min(items.length, MAX_SLOTS); },
    reorder,
    indexOf(id) { return items.findIndex((x) => x.id === id); },
    render,
  };
}
