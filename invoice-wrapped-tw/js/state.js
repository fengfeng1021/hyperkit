/* state.js
   記憶體內的唯一真相。儀表板與回顧模式共用同一份 dataset。 */

const listeners = { data: new Set(), filter: new Set() };

export const state = {
  invoices: [],      // 正規化後的發票陣列
  summary: null,     // aggregate() 的輸出
  source: null,      // 'sample' | 'user'
  files: [],         // 已匯入的檔名
  parseReport: null, // { read, ok, skipped, badRows, duplicates, ... }
  filters: [],       // [{ type, value, label, test(inv) }]
};

export function setData({ invoices, summary, source, files, parseReport }) {
  state.invoices = invoices;
  state.summary = summary;
  state.source = source;
  state.files = files || [];
  state.parseReport = parseReport || null;
  state.filters = [];
  emit('data');
  emit('filter');
}

export function clearData() {
  state.invoices = [];
  state.summary = null;
  state.source = null;
  state.files = [];
  state.parseReport = null;
  state.filters = [];
  emit('data');
  emit('filter');
}

export function hasData() {
  return !!state.summary && state.summary.count > 0;
}

/* ---------------- 篩選 ---------------- */

export function addFilter(filter) {
  if (state.filters.some((f) => f.key === filter.key)) {
    state.filters = state.filters.filter((f) => f.key !== filter.key);
  } else {
    state.filters = [...state.filters.filter((f) => f.type !== filter.type || filter.multi), filter];
  }
  emit('filter');
}

export function removeFilter(key) {
  state.filters = state.filters.filter((f) => f.key !== key);
  emit('filter');
}

export function clearFilters() {
  state.filters = [];
  emit('filter');
}

export function filtered() {
  if (!state.filters.length) return state.invoices;
  return state.invoices.filter((inv) => state.filters.every((f) => f.test(inv)));
}

export function hasFilter(key) {
  return state.filters.some((f) => f.key === key);
}

/* ---------------- 事件 ---------------- */

export function on(evt, fn) {
  listeners[evt].add(fn);
  return () => listeners[evt].delete(fn);
}

export function emit(evt) {
  listeners[evt].forEach((fn) => {
    try { fn(state); } catch (err) { console.error('[iwtw] listener failed', err); }
  });
}
