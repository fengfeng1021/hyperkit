/* ==========================================================================
   Platform output presets.

   These are the numbers that get a listing rejected: not whether the cutout
   is clean, but whether the product fills the right share of a square frame
   on a pure white sweep. Every value here is editable, and every row states
   the date the guidance was read so nobody has to trust us about it.
   ========================================================================== */

import { el, storage, svgIcon, clamp } from './util.js';

export const CHECKED_ON = '2026-08-03';

const FACTORY = [
  {
    id: 'shopify', name: 'Shopify', size: 2048, fill: 0.90,
    formats: ['png', 'jpg'], jpegQuality: 0.92, template: '{name}_shopify_01',
    reframe: true, on: true,
    note: '正方形 2048 px，商品佔畫面 90%，一張透明 PNG 加一張白底 JPEG。',
  },
  {
    id: 'amazon', name: 'Amazon 主圖', size: 1600, fill: 0.85,
    formats: ['jpg'], jpegQuality: 0.95, template: '{name}_amazon_MAIN',
    reframe: true, on: false, pureWhite: true,
    note: '正方形 1600 px，商品佔 85%，背景寫成純白 255, 255, 255。',
  },
  {
    id: 'etsy', name: 'Etsy', size: 2000, fill: 0.92,
    formats: ['png', 'jpg'], jpegQuality: 0.92, template: '{name}_etsy_01',
    reframe: true, on: false,
    note: '正方形 2000 px，商品佔 92%，一張透明 PNG 加一張白底 JPEG。',
  },
  {
    id: 'shopee', name: 'Shopee', size: 1024, fill: 0.88,
    formats: ['jpg'], jpegQuality: 0.90, template: '{name}_shopee_01',
    reframe: true, on: false,
    note: '正方形 1024 px，商品佔 88%，白底 JPEG。',
  },
  {
    id: 'transparent', name: '只要去背圖', size: 0, fill: 1,
    formats: ['png'], jpegQuality: 0.92, template: '{name}_cutout',
    reframe: false, on: false,
    note: '維持原始像素尺寸，不重新構圖，去背後的 alpha 原樣保留。',
  },
];

const KEY = 'cutout-forge.presets.v2';

export const presets = FACTORY.map(p => ({ ...p }));

export function loadPresets() {
  const saved = storage.get(KEY, null);
  if (!saved) return;
  for (const p of presets) {
    const s = saved[p.id];
    if (!s) continue;
    if (typeof s.on === 'boolean') p.on = s.on;
    if (Number.isFinite(s.size)) p.size = clamp(Math.round(s.size), 200, 6000);
    if (Number.isFinite(s.fill)) p.fill = clamp(s.fill, 0.4, 1);
    if (Array.isArray(s.formats) && s.formats.length) p.formats = s.formats.filter(f => f === 'png' || f === 'jpg');
    if (Number.isFinite(s.jpegQuality)) p.jpegQuality = clamp(s.jpegQuality, 0.5, 1);
    if (typeof s.template === 'string' && s.template.includes('{name}')) p.template = s.template;
  }
  if (!presets.some(p => p.on)) presets.find(p => p.id === 'transparent').on = true;
}

export function savePresets() {
  const out = {};
  for (const p of presets) {
    out[p.id] = { on: p.on, size: p.size, fill: p.fill, formats: p.formats, jpegQuality: p.jpegQuality, template: p.template };
  }
  return storage.set(KEY, out);
}

export const activePresets = () => presets.filter(p => p.on);

/** How many files one photo will produce with the current selection. */
export const filesPerPhoto = () =>
  activePresets().reduce((sum, p) => sum + p.formats.length, 0);

/** The concrete job list handed to the exporter. */
export function outputSpecs() {
  const specs = [];
  for (const p of activePresets()) {
    for (const format of p.formats) {
      specs.push({
        presetId: p.id,
        presetName: p.name,
        format,
        size: p.size,
        fill: p.fill,
        reframe: p.reframe,
        quality: p.jpegQuality,
        matte: format === 'jpg' ? 'white' : 'transparent',
        template: p.template,
        folder: `${p.id}/${format}`,
      });
    }
  }
  return specs;
}

export function fileNameFor(spec, base, index) {
  const stem = spec.template
    .replaceAll('{name}', base)
    .replaceAll('{n}', String(index).padStart(2, '0'));
  return `${stem}.${spec.format}`;
}

/* -------------------------------------------------------------------- view */

export function renderPresets(mount, onChange) {
  mount.textContent = '';

  for (const p of presets) {
    const inputId = `pset-${p.id}`;
    const panelId = `pset-panel-${p.id}`;

    const check = el('input', { type: 'checkbox', id: inputId, checked: p.on });
    check.addEventListener('change', () => {
      p.on = check.checked;
      if (!presets.some(x => x.on)) {
        const t = presets.find(x => x.id === 'transparent');
        t.on = true;
        mount.querySelector('#pset-transparent').checked = true;
        onChange({ guard: '至少要留一種輸出，已經把「只要去背圖」重新打開。' });
      } else {
        onChange({});
      }
      savePresets();
    });

    const box = el('span', { class: 'checkbox' }, [svgIcon('i-check')]);
    const label = el('label', { class: 'preset__label', for: inputId }, [
      check, box, el('span', { class: 'preset__name', text: p.name }),
    ]);

    const spec = el('span', { class: 'preset__spec', text: specLabel(p) });

    const editBtn = el('button', {
      type: 'button', class: 'preset__edit', 'aria-expanded': 'false', 'aria-controls': panelId,
      text: '調整',
    });

    const row = el('div', { class: 'preset__row' }, [label, editBtn]);
    const source = el('p', { class: 'preset__source' }, [
      spec,
      el('span', { class: 'preset__checked', text: `${CHECKED_ON} 查核。不一樣就自己改。` }),
    ]);

    const panel = el('div', { class: 'preset__panel', id: panelId, hidden: true });
    buildPanel(panel, p, () => { spec.textContent = specLabel(p); savePresets(); onChange({}); });

    editBtn.addEventListener('click', () => {
      const open = editBtn.getAttribute('aria-expanded') === 'true';
      editBtn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
      editBtn.textContent = open ? '調整' : '收合';
    });

    mount.append(el('li', { class: 'preset', 'data-preset': p.id }, [row, source, panel]));
  }
}

function specLabel(p) {
  const dims = p.size ? `${p.size}px` : '原尺寸';
  const pct = p.reframe ? ` ${Math.round(p.fill * 100)}%` : '';
  return `${dims}${pct} ${p.formats.join('+')}`;
}

function buildPanel(panel, p, changed) {
  const rows = [];

  if (p.reframe) {
    const size = el('input', { class: 'input', type: 'number', min: 200, max: 6000, step: 16, value: p.size, id: `sz-${p.id}` });
    size.addEventListener('change', () => {
      const v = clamp(Math.round(Number(size.value) || p.size), 200, 6000);
      size.value = v; p.size = v; changed();
    });
    rows.push(field(`sz-${p.id}`, '尺寸', size, 'px'));

    const fill = el('input', { class: 'range', type: 'range', min: 60, max: 100, step: 1, value: Math.round(p.fill * 100), id: `fl-${p.id}` });
    const out = el('output', { class: 'field__out mono', text: `${Math.round(p.fill * 100)}%` });
    const syncFill = () => {
      fill.style.setProperty('--fill', `${((fill.value - 60) / 40) * 100}%`);
      fill.setAttribute('aria-valuetext', `佔畫面 ${fill.value}%`);
    };
    fill.addEventListener('input', () => { out.textContent = `${fill.value}%`; syncFill(); });
    fill.addEventListener('change', () => { p.fill = Number(fill.value) / 100; changed(); });
    syncFill();
    rows.push(el('div', { class: 'field' }, [el('label', { class: 'field__label', for: `fl-${p.id}`, text: '商品佔畫面' }), fill, out]));
  }

  if (!p.pureWhite) {
    const wrap = el('div', { class: 'field field--radios' }, [el('span', { class: 'field__label', text: '檔案格式' })]);
    for (const fmt of ['png', 'jpg']) {
      const cb = el('input', { type: 'checkbox', checked: p.formats.includes(fmt) });
      cb.addEventListener('change', () => {
        const set = new Set(p.formats);
        cb.checked ? set.add(fmt) : set.delete(fmt);
        if (!set.size) { set.add(fmt); cb.checked = true; }
        p.formats = ['png', 'jpg'].filter(f => set.has(f));
        changed();
      });
      wrap.append(el('label', { class: 'radio' }, [cb, el('span', { text: fmt.toUpperCase() })]));
    }
    rows.push(wrap);
  }

  if (p.formats.includes('jpg') || p.pureWhite) {
    const q = el('input', { class: 'range', type: 'range', min: 60, max: 100, step: 1, value: Math.round(p.jpegQuality * 100), id: `q-${p.id}` });
    const qo = el('output', { class: 'field__out mono', text: `${Math.round(p.jpegQuality * 100)}` });
    const syncQ = () => {
      q.style.setProperty('--fill', `${((q.value - 60) / 40) * 100}%`);
      q.setAttribute('aria-valuetext', `JPEG 品質 ${q.value}`);
    };
    q.addEventListener('input', () => { qo.textContent = q.value; syncQ(); });
    q.addEventListener('change', () => { p.jpegQuality = Number(q.value) / 100; changed(); });
    syncQ();
    rows.push(el('div', { class: 'field' }, [el('label', { class: 'field__label', for: `q-${p.id}`, text: 'JPEG 品質' }), q, qo]));
  }

  const tpl = el('input', { class: 'input', type: 'text', value: p.template, id: `tp-${p.id}`, spellcheck: 'false' });
  tpl.addEventListener('change', () => {
    if (!tpl.value.includes('{name}')) {
      tpl.setAttribute('aria-invalid', 'true');
      tpl.value = p.template;
      setTimeout(() => tpl.removeAttribute('aria-invalid'), 1600);
      return;
    }
    p.template = tpl.value.trim();
    changed();
  });
  rows.push(field(`tp-${p.id}`, '檔名', tpl, ''));

  panel.append(...rows, el('p', { class: 'preset__source', text: p.note }));
}

function field(id, labelText, control, suffix) {
  return el('div', { class: 'field' }, [
    el('label', { class: 'field__label', for: id, text: labelText }),
    control,
    el('span', { class: 'field__out mono', text: suffix }),
  ]);
}
