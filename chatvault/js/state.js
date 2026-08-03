/* The single application state, plus a minimal subscription mechanism.
   No framework: the views ask for what changed and redraw that part. */

const listeners = new Map();

export const state = {
  mode: "empty", // empty | loaded
  view: "index", // index | stats
  records: [],
  byId: new Map(),
  index: null,
  sample: false,
  sources: new Set(),

  query: "",
  parsed: null,
  results: null,
  expansions: [],
  expansionBlocklist: new Set(),
  removedExpansions: [],
  searchMode: "exact", // exact | expanded | meaning
  includeAlternate: false,
  semantic: { available: false, ready: false, busy: false, vectors: null },

  filters: { source: new Set(), role: undefined, from: null, to: null, hasCode: false },

  selectedId: null,
  branchChoices: new Map(), // conversation id -> Map(parentNodeId -> childNodeId)
  matchIndex: 0,

  parsing: null, // { name, read, total, conversations }
  lastIngest: null,
};

export function on(event, fn) {
  let set = listeners.get(event);
  if (!set) listeners.set(event, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.debug(`chatvault: listener for ${event} failed`, err);
    }
  }
}

export function choicesFor(convId) {
  let m = state.branchChoices.get(convId);
  if (!m) state.branchChoices.set(convId, (m = new Map()));
  return m;
}

export function activeFilterCount() {
  const f = state.filters;
  let n = 0;
  if (f.source.size) n++;
  if (f.role) n++;
  if (f.from || f.to) n++;
  if (f.hasCode) n++;
  return n;
}

/** Merge the drawer's filters with the ones parsed out of the query string. */
export function effectiveFilters() {
  const f = state.filters;
  const out = {};
  if (f.source.size) out.source = [...f.source];
  if (f.role) out.role = f.role;
  if (f.hasCode) out.hasCode = true;
  if (f.from) out.after = f.from;
  if (f.to) out.before = f.to;
  return out;
}
