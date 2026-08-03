/**
 * js/designs.js
 * The designs a seller brings in. They live in memory and in GPU textures and
 * nowhere else: not in localStorage, not in IndexedDB, not on a server. That
 * is why the line under the drop target is allowed to say so.
 */

export const MAX_EDGE = 8192;
export const SOFT_EDGE = 200;
export const MAX_BYTES = 40 * 1024 * 1024;

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

export function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'design';
}

export function truncate(str, max = 18) {
  return str.length <= max ? str : str.slice(0, max - 3) + '...';
}

/**
 * Everything we can decide before touching the decoder. Each failure names
 * the file, names the limit and names the next step.
 */
export function inspectFile(file) {
  const name = file.name || 'file';
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(name)) {
    return {
      ok: false,
      message: `Vector SVG needs a fixed size to rasterize. Export it as a PNG at 2000 px wide.`
    };
  }
  if (!IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false,
      message: `${name} is not an image the browser can read. Export it as PNG.`
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message: `${name} is ${Math.round(file.size / 1048576)} MB. Files over 40 MB are skipped to keep the tab responsive.`,
      action: { label: 'Add anyway', kind: 'force' }
    };
  }
  return { ok: true };
}

/** Decode to an ImageBitmap, downscaling only when asked to. */
export async function decodeFile(file, { downscale = false } = {}) {
  const name = file.name || 'file';
  let probe;
  try {
    probe = await createImageBitmap(file);
  } catch (err) {
    throw new DesignError(`${name} could not be decoded. The file may be damaged.`);
  }

  const big = Math.max(probe.width, probe.height);
  if (big > MAX_EDGE && !downscale) {
    const dim = probe.width >= probe.height ? 'wide' : 'tall';
    const px = probe.width >= probe.height ? probe.width : probe.height;
    probe.close?.();
    throw new DesignError(
      `${name} is ${px} px ${dim}. The maximum is ${MAX_EDGE} px.`,
      { label: 'Downscale and add', kind: 'downscale' }
    );
  }

  let bitmap = probe;
  if (big > MAX_EDGE && downscale) {
    const k = MAX_EDGE / big;
    const w = Math.max(1, Math.round(probe.width * k));
    const h = Math.max(1, Math.round(probe.height * k));
    bitmap = await createImageBitmap(probe, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
    probe.close?.();
  }

  const small = Math.min(bitmap.width, bitmap.height);
  return {
    id: `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    fileBase: slugify(name),
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    aspect: bitmap.width / bitmap.height,
    sample: false,
    soft: small < SOFT_EDGE,
    softNote: small < SOFT_EDGE
      ? `${name} is ${small} px on its short edge. It will look soft at export size.`
      : ''
  };
}

export class DesignError extends Error {
  constructor(message, action) {
    super(message);
    this.name = 'DesignError';
    this.action = action || null;
  }
}

/* ---------------------------------------------------------------------- */

export class DesignStore {
  constructor() {
    this.items = [];
    this.selectedId = null;
    this.checked = new Set();
    this._listeners = new Set();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) fn(this);
  }

  get length() { return this.items.length; }

  get selected() {
    return this.items.find((d) => d.id === this.selectedId) || null;
  }

  get checkedItems() {
    return this.items.filter((d) => this.checked.has(d.id));
  }

  add(list) {
    const incoming = Array.isArray(list) ? list : [list];
    for (const d of incoming) {
      // A repeat of the same file name gets its own entry; the seller may
      // genuinely have two versions open. Names are made unique at export.
      this.items.push(d);
      this.checked.add(d.id);
    }
    if (!this.selectedId && this.items.length) this.selectedId = this.items[0].id;
    this._emit();
    return incoming;
  }

  remove(id) {
    const idx = this.items.findIndex((d) => d.id === id);
    if (idx < 0) return null;
    const [gone] = this.items.splice(idx, 1);
    this.checked.delete(id);
    if (this.selectedId === id) {
      const next = this.items[Math.min(idx, this.items.length - 1)];
      this.selectedId = next ? next.id : null;
    }
    this._emit();
    return { item: gone, index: idx };
  }

  restore(item, index) {
    this.items.splice(Math.min(index, this.items.length), 0, item);
    this.checked.add(item.id);
    if (!this.selectedId) this.selectedId = item.id;
    this._emit();
  }

  select(id) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this._emit();
  }

  toggleCheck(id) {
    if (this.checked.has(id)) this.checked.delete(id);
    else this.checked.add(id);
    this._emit();
  }

  setAllChecked(on) {
    this.checked = on ? new Set(this.items.map((d) => d.id)) : new Set();
    this._emit();
  }

  clear() {
    for (const d of this.items) if (!d.sample) d.source.close?.();
    this.items = [];
    this.checked.clear();
    this.selectedId = null;
    this._emit();
  }
}
