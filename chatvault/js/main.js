/* ChatVault entry point: state machine, event wiring, and the two page states.

   Mount points and stable class names the motion layer will use are listed in
   README.md under "Hooks for the motion layer". Nothing here depends on GSAP
   being present; if the CDN never answers, every feature below still works and
   the page is simply still. */

import { $, $$, el, clear, num, day, seconds } from "./dom.js";
import { state, on, emit, effectiveFilters, activeFilterCount, choicesFor } from "./state.js";
import { parseQuery, runQuery, expandTerms, highlightTerms } from "./search.js";
import { hydrate } from "./index-build.js";
import { IndexList, sourceLabel } from "./index-list.js";
import { Reader } from "./reader.js";
import { StatsView } from "./stats-view.js";
import { SpineStrip } from "./spine.js";
import { DrawerCanvas, TabStrip } from "./drawer-canvas.js";
import { MappingWizard } from "./wizard.js";
import { Semantic } from "./semantic.js";
import { showNotice, hideNotice, FAILURES } from "./notice.js";
import { exportOne, exportMany, ExportTooLarge, formatBytes } from "./exporter.js";
import {
  mergeConversations,
  loadAll,
  clearVault,
  removeSource,
  storageEstimate,
  requestPersistence,
  isPersisted,
  QuotaError,
  putMeta,
} from "./store.js";
import { recallMapping } from "./adapters/generic.js";
// The motion layer subscribes to the events emitted below. It is imported for
// its side effects only, and does nothing at all if GSAP never answered.
import "./motion.js";

const DEBOUNCE = 90;

const dom = {};
let indexList = null;
let reader = null;
let statsView = null;
let spine = null;
let drawer = null;
let tabStrip = null;
let wizard = null;
const semantic = new Semantic();

let worker = null;
let workerBroken = false;
let parsing = false;
let searchTimer = 0;
let liveTimer = 0;
let pendingFile = null;
let pendingWizardDetail = null;

/* ------------------------------------------------------------------- boot */

function boot() {
  cacheDom();
  wireGlobalDragGuards();
  wireDropzone();
  wireRail();
  wireSearch();
  wireFilters();
  wireKeyboard();
  wireExport();
  wireVaultPanel();
  wireGuides();

  reader = new Reader(dom.reader);
  statsView = new StatsView(dom.statsView, {
    onTermClick: (term) => {
      setView("index");
      applyQuery(term);
      dom.q.focus();
    },
    onOpenConversation: (id) => {
      setView("index");
      openById(id);
    },
  });
  indexList = new IndexList(dom.index, {
    onSelect: (rec, row, open) => selectConversation(rec, row, open),
    onQueryChange: (next, filtersOnly) => {
      if (!filtersOnly) applyQuery(next);
      else runSearch();
      syncFilterUi();
    },
  });
  spine = new SpineStrip(dom.spineCanvas, {
    onHover: (i) => showSpineLabel(i),
    onActivate: (i) => activateSpine(i),
  });
  drawer = new DrawerCanvas(dom.drawerCanvas);
  tabStrip = new TabStrip(dom.tabStrip);
  wizard = new MappingWizard(dom.wizard, {
    onApply: (mapping) => {
      dom.wizard.hidden = true;
      if (pendingFile) startIngest(pendingFile, { mapping });
    },
    onCancel: () => {
      dom.wizard.hidden = true;
      resetDropzone();
    },
  });

  emit("ui:ready", { dom, drawer, tabStrip, spine, indexList, reader });

  if (location.protocol === "file:") {
    showNotice(dom.pageNotice, FAILURES["file-protocol"]());
    dom.dropzone.setAttribute("aria-disabled", "true");
  }

  restoreVault();
  window.addEventListener("hashchange", applyHash);
}

function cacheDom() {
  dom.root = document.documentElement;
  dom.pageNotice = $("#page-notice");
  dom.dropzone = $("#dropzone");
  dom.dropzoneLabel = $(".dropzone__label");
  dom.dropzoneSub = $(".dropzone__sub");
  dom.dropzoneNotice = $("#dropzone-notice");
  dom.dropzoneProgress = $("#dropzone-progress");
  dom.fileInput = $("#file-input");
  dom.sampleBtn = $("#load-sample");
  dom.drawerCanvas = $("#drawer-canvas");
  dom.tabStrip = $("#tabstrip");
  dom.wizard = $("#wizard");
  dom.status = $("#statusline");
  dom.statusText = $(".statusline__text");
  dom.q = $("#q");
  dom.syntaxToggle = $("#syntax-toggle");
  dom.syntaxPanel = $("#syntax-panel");
  dom.modeToggle = $("#mode-toggle");
  dom.chips = $("#expansion-chips");
  dom.spine = $("#spine");
  dom.spineCanvas = $("#spine-canvas");
  dom.spineLabel = $("#spine-label");
  dom.index = $("#index");
  dom.reader = $("#reader");
  dom.statsView = $("#stats-view");
  dom.workspace = $("#workspace");
  dom.filters = $("#filters");
  dom.filtersToggle = $("#filters-toggle");
  dom.live = $("#live");
  dom.vaultPanel = $("#vault-panel");
  dom.vaultToggle = $("#vault-toggle");
  dom.statsBtn = $("#stats-btn");
  dom.backBtn = $("#back-to-index");
  dom.sampleBadge = $("#sample-badge");
  dom.exportBtn = $("#export-btn");
  dom.exportPopover = $("#export-popover");
  dom.keyboardHelp = $("#keyboard-help");
  dom.semanticEnable = $("#semantic-enable");
  dom.semanticPanel = $("#semantic-panel");
}

/* ------------------------------------------------------- vault restore */

async function restoreVault() {
  try {
    const records = await loadAll();
    if (!records.length) return;
    setStatus(`Reopening ${num(records.length)} stored conversations`);
    const { buildIndexFor } = await import("./reindex.js");
    const built = await buildIndexFor(records);
    await adoptVault(records, built.index, { restored: true, ms: built.ms });
  } catch (err) {
    console.debug("chatvault: vault could not be reopened", err);
    setStatus("");
  }
}

/* ------------------------------------------------------------- drop zone */

function wireGlobalDragGuards() {
  for (const type of ["dragover", "drop"]) {
    document.addEventListener(type, (e) => {
      if (e.target.closest && e.target.closest("#dropzone")) return;
      e.preventDefault();
    });
  }
}

function wireDropzone() {
  const zone = dom.dropzone;
  let depth = 0;

  zone.addEventListener("click", () => {
    if (parsing) return;
    dom.fileInput.click();
  });
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!parsing) dom.fileInput.click();
    }
  });
  dom.fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) startIngest(file, {});
    e.target.value = "";
  });
  dom.sampleBtn.addEventListener("click", loadSample);
  $("#choose-file").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!parsing) dom.fileInput.click();
  });

  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    depth++;
    if (!parsing) zone.dataset.state = "dragover";
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    depth = Math.max(0, depth - 1);
    if (depth === 0 && zone.dataset.state === "dragover") zone.dataset.state = "idle";
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    depth = 0;
    if (parsing) return;
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) startIngest(file, {});
    else zone.dataset.state = "idle";
  });
}

function resetDropzone() {
  parsing = false;
  dom.dropzone.dataset.state = "idle";
  dom.dropzone.removeAttribute("aria-disabled");
  dom.dropzoneLabel.textContent = "Drop your export here";
  dom.dropzoneSub.textContent = "or click to choose a file";
  dom.dropzoneProgress.hidden = true;
  drawer.reset();
  tabStrip.reset();
}

async function loadSample() {
  try {
    setStatus("Fetching the sample vault");
    const res = await fetch("./assets/sample-vault.json");
    if (!res.ok) throw new Error(`sample fetch ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], "sample-conversations.json", { type: "application/json" });
    state.sample = true;
    startIngest(file, {});
  } catch (err) {
    console.debug("chatvault: sample unavailable", err);
    showNotice(dom.dropzoneNotice, {
      tone: "alert",
      title: "The sample vault could not be loaded.",
      body: "It lives at assets/sample-vault.json next to this page. Reload, or drop your own export instead.",
    });
  }
}

/* ---------------------------------------------------------------- ingest */

function ensureWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL("./worker/parse-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => handleWorkerEvent(e.data || {});
    worker.onerror = () => {
      workerBroken = true;
    };
  } catch (err) {
    console.debug("chatvault: worker unavailable", err);
    workerBroken = true;
    worker = null;
  }
  return worker;
}

function startIngest(file, opts) {
  pendingFile = file;
  hideNotice(dom.dropzoneNotice);
  hideNotice(dom.pageNotice);
  dom.wizard.hidden = true;
  parsing = true;
  dom.dropzone.dataset.state = "parsing";
  dom.dropzone.setAttribute("aria-disabled", "true");
  dom.dropzoneLabel.textContent = `Reading ${file.name}`;
  dom.dropzoneSub.textContent = "Finish reading this file first";
  dom.dropzoneProgress.hidden = false;
  dom.dropzoneProgress.setAttribute("aria-valuenow", "0");
  drawer.reset();
  tabStrip.reset();
  indexList.showSkeleton(8);
  state.parsing = { name: file.name, read: 0, total: file.size, conversations: 0 };
  emit("ingest:start", state.parsing);

  const remembered = opts.mapping || null;
  const w = ensureWorker();
  if (w) {
    w.postMessage({ type: "ingest", file, mapping: remembered, entryName: opts.entryName, force: opts.force });
    return;
  }

  showNotice(dom.dropzoneNotice, {
    ...FAILURES["worker-unavailable"](),
    actions: [
      { label: "Parse anyway", primary: true, onClick: () => runOnMainThread(file, opts) },
      {
        label: "Cancel",
        onClick: () => {
          hideNotice(dom.dropzoneNotice);
          resetDropzone();
        },
      },
    ],
  });
}

async function runOnMainThread(file, opts) {
  hideNotice(dom.dropzoneNotice);
  try {
    const { ingest } = await import("./pipeline.js");
    const started = performance.now();
    const result = await ingest(file, opts, handleWorkerEvent);
    handleWorkerEvent({ type: "done", ...result, ms: performance.now() - started });
  } catch (err) {
    handleWorkerEvent({ type: "error", code: err && err.code ? err.code : "unexpected", detail: (err && err.detail) || { message: String(err && err.message) } });
  }
}

// Bytes read and conversations found, on one line under the drop zone label.
// Called from both `progress` and `batch`: on a small export the last progress
// event lands before any batch, so the count would otherwise stay at zero.
function writeParsingSub() {
  const p = state.parsing;
  if (!p) return;
  dom.dropzoneSub.textContent =
    `${formatBytes(p.read)} of ${formatBytes(p.total)}` +
    ` · ${num(p.conversations)} conversations`;
}

function handleWorkerEvent(msg) {
  switch (msg.type) {
    case "progress": {
      state.parsing.read = msg.read;
      state.parsing.total = msg.total;
      const pct = msg.total ? Math.min(100, Math.round((msg.read / msg.total) * 100)) : 0;
      dom.dropzoneProgress.setAttribute("aria-valuenow", String(pct));
      $(".dropzone__bar", dom.dropzoneProgress).style.width = `${pct}%`;
      writeParsingSub();
      setStatus(`Reading ${msg.name}: ${formatBytes(msg.read)} of ${formatBytes(msg.total)}`);
      break;
    }
    case "detected":
      setStatus(`Recognised as a ${sourceLabel(msg.source)} export: ${msg.reason}`);
      break;
    case "entry":
      setStatus(`Opening ${msg.name} inside the archive`);
      break;
    case "batch":
      state.parsing.conversations = msg.count;
      writeParsingSub();
      drawer.addBatch(msg.slice);
      emit("ingest:batch", msg);
      break;
    case "indexing":
      setStatus(`Indexing ${num(msg.conversations)} conversations`);
      break;
    case "indexProgress":
      if (msg.term) tabStrip.push(msg.term);
      emit("ingest:indexProgress", msg);
      break;
    case "truncated":
      showNotice(ingestNoticeHost(), {
        tone: "alert",
        title: `Parsing stopped at conversation ${num(msg.parsed)} of about ${num(msg.estimated)}.`,
        body: `The file looks truncated after ${formatBytes(msg.bytes)}. What was read is saved and searchable.`,
      });
      break;
    case "done":
      finishIngest(msg);
      break;
    case "cancelled":
      resetDropzone();
      setStatus("");
      break;
    case "error":
      handleIngestError(msg);
      break;
    default:
      break;
  }
}

/** In the empty state the notice belongs in the drawer; once a vault is open
    the drawer is off screen, so it belongs at the top of the page instead. */
function ingestNoticeHost() {
  return state.mode === "loaded" ? dom.pageNotice : dom.dropzoneNotice;
}

function handleIngestError(msg) {
  parsing = false;
  dom.dropzone.dataset.state = "error";
  dom.dropzone.removeAttribute("aria-disabled");
  dom.dropzoneProgress.hidden = true;
  indexList.hideSkeleton();
  setStatus("");
  const host = ingestNoticeHost();

  if (msg.code === "unknown-format") {
    pendingWizardDetail = msg.detail;
    const remembered = detailMapping(msg.detail);
    if (remembered) {
      startIngest(pendingFile, { mapping: remembered });
      return;
    }
    showNotice(host, {
      ...FAILURES["unknown-format"](),
      actions: [
        { label: "Map the fields", primary: true, onClick: () => wizard.open(pendingWizardDetail) },
        { label: "Try another file", onClick: () => resetDropzone() },
      ],
    });
    return;
  }

  if (msg.code === "zip-no-candidate") {
    const list = el("ul", { class: "notice__files" });
    for (const name of msg.detail.names || []) {
      list.append(
        el(
          "li",
          {},
          el("button", {
            type: "button",
            class: "linkbtn",
            text: name,
            onclick: () => startIngest(pendingFile, { entryName: name }),
          })
        )
      );
    }
    showNotice(host, {
      ...FAILURES["zip-no-candidate"](msg.detail),
      node: list,
      actions: [{ label: "Try another file", onClick: () => resetDropzone() }],
    });
    return;
  }

  const spec = FAILURES[msg.code] ? FAILURES[msg.code](msg.detail) : FAILURES.unexpected(msg.detail);
  showNotice(host, {
    ...spec,
    actions: [{ label: "Try another file", primary: true, onClick: () => resetDropzone() }],
  });
}

function detailMapping(detail) {
  if (!detail || !detail.sample) return null;
  try {
    return recallMapping(JSON.parse(detail.sample));
  } catch {
    return null;
  }
}

async function finishIngest(msg) {
  // parsing stays true until resetDropzone() below, so that the drop zone
  // cannot be reopened while the drawer is still shutting.
  indexList.hideSkeleton();
  dom.dropzoneProgress.hidden = true;

  const incoming = msg.records;
  let merged = { added: incoming.length, existing: 0 };
  try {
    merged = await mergeConversations(incoming);
  } catch (err) {
    if (err instanceof QuotaError) {
      const est = await storageEstimate();
      showNotice(dom.pageNotice, {
        ...FAILURES.quota({
          needed: formatBytes(incoming.reduce((n, r) => n + r.charCount * 2, 0)),
          allowed: est ? formatBytes(est.quota) : "less than needed",
        }),
        actions: [
          {
            label: "Keep this vault when storage runs low",
            primary: true,
            onClick: async () => {
              const ok = await requestPersistence();
              setStatus(ok ? "This browser will keep the vault when storage runs low." : "The browser declined to make this vault persistent.");
            },
          },
          { label: "Remove a source", onClick: () => toggleVaultPanel(true) },
        ],
      });
    } else {
      console.debug("chatvault: merge failed", err);
      showNotice(dom.pageNotice, FAILURES.unexpected({ message: String(err && err.message) }));
    }
  }

  const all = mergeRecordArrays(state.records, incoming);
  let index = msg.index;
  if (all.length !== incoming.length) {
    const { buildIndexFor } = await import("./reindex.js");
    index = (await buildIndexFor(all)).index;
  }
  await adoptVault(all, index, { ms: msg.ms, merged, fresh: true });
  resetDropzone();

  if (merged.existing > 0) {
    showNotice(dom.pageNotice, {
      tone: "amber",
      title: `${num(merged.added)} new conversations added. ${num(merged.existing)} were already in your vault.`,
      body: "Duplicates were matched on the export's own conversation id, not on the title.",
      autoDismiss: 6000,
    });
  }
}

/* The drawer seal runs to about 2.2 seconds at its longest. This ceiling is
   what happens when it cannot run at all, for instance in a background tab
   where the animation frame callback never fires: the vault opens anyway. */
const REVEAL_CEILING = 2600;

function settleBeforeReveal(meta) {
  const waits = [];
  emit("vault:closing", { fresh: !!(meta && meta.fresh), wait: (p) => waits.push(p) });
  if (!waits.length) return Promise.resolve();
  return Promise.race([
    Promise.all(waits).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, REVEAL_CEILING)),
  ]);
}

function mergeRecordArrays(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const rec of incoming) if (!byId.has(rec.id)) byId.set(rec.id, rec);
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

async function adoptVault(records, index, meta) {
  state.records = records;
  state.byId = new Map(records.map((r) => [r.id, r]));
  state.index = hydrate(index);
  state.sources = new Set(records.map((r) => r.source));

  // The vault is ready here. If something is still finishing on screen, most of
  // all the drawer shutting at the end of an import, it gets to say so and we
  // wait for it. Nothing waits by default, and nothing waits for long.
  await settleBeforeReveal(meta);

  state.mode = "loaded";
  dom.root.dataset.vault = "loaded";

  spine.setData(
    state.index.convIds.map((id) => {
      const rec = state.byId.get(id);
      return { id, title: rec ? rec.title : id, createdAt: rec ? rec.createdAt : 0, msgCount: rec ? rec.msgCount : 1 };
    })
  );

  buildSourceChips();
  syncFilterUi();
  runSearch();
  updateSemanticEntry();

  dom.sampleBadge.hidden = !state.sample;

  const messages = records.reduce((n, r) => n + r.msgCount, 0);
  const when = meta && meta.ms ? ` Indexed in ${seconds(meta.ms)}.` : "";
  setStatus(`${num(records.length)} conversations. ${num(messages)} messages.${when} Nothing left this tab.`);
  putMeta("lastOpened", Date.now()).catch(() => {});

  if (meta && meta.fresh) {
    dom.q.focus();
  }
  applyHash();
  emit("vault:loaded", { records, index: state.index, meta });
}

/* ---------------------------------------------------------------- search */

function wireSearch() {
  dom.q.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(), DEBOUNCE);
  });
  dom.q.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (dom.q.value) {
        e.preventDefault();
        applyQuery("");
      } else {
        dom.q.blur();
        indexList.track.focus();
      }
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      state.includeAlternate = true;
      runSearch();
      setStatus("Including messages on branches you did not keep.");
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      indexList.move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(searchTimer);
      runSearch();
    }
  });

  dom.syntaxToggle.addEventListener("click", () => {
    const open = dom.syntaxPanel.hidden;
    dom.syntaxPanel.hidden = !open;
    dom.syntaxToggle.setAttribute("aria-expanded", String(open));
  });

  $$(".mode__btn", dom.modeToggle).forEach((btn) => {
    btn.addEventListener("click", () => setSearchMode(btn.dataset.mode));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const all = $$(".mode__btn:not([disabled])", dom.modeToggle);
        const i = all.indexOf(btn);
        const next = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
        next.focus();
        setSearchMode(next.dataset.mode);
      }
    });
  });
}

function applyQuery(next) {
  dom.q.value = next;
  clearTimeout(searchTimer);
  runSearch();
}

function setSearchMode(mode) {
  if (!mode) return;
  const btn = $(`.mode__btn[data-mode="${mode}"]`, dom.modeToggle);
  if (btn && btn.disabled) return;
  state.searchMode = mode;
  $$(".mode__btn", dom.modeToggle).forEach((b) => {
    const active = b.dataset.mode === mode;
    b.setAttribute("aria-pressed", String(active));
    b.tabIndex = active ? 0 : -1;
  });
  positionModeIndicator();
  runSearch();
}

function positionModeIndicator() {
  const active = $('.mode__btn[aria-pressed="true"]', dom.modeToggle);
  const indicator = $(".mode__indicator", dom.modeToggle);
  if (!active || !indicator) return;
  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.transform = `translateX(${active.offsetLeft}px)`;
}

function runSearch() {
  if (!state.index) return;
  const raw = dom.q.value;
  state.query = raw;
  const parsed = parseQuery(raw);
  state.parsed = parsed;

  dom.q.classList.toggle("is-error", parsed.errors.length > 0);
  const errorHost = $("#q-error");
  if (parsed.errors.length) {
    errorHost.hidden = false;
    errorHost.textContent = parsed.errors[0].message;
  } else {
    errorHost.hidden = true;
    errorHost.textContent = "";
  }

  state.expansions =
    state.searchMode === "expanded" ? expandTerms(state.index, parsed, state.expansionBlocklist) : [];
  renderChips();

  const options = { filters: effectiveFilters(), includeAlternate: state.includeAlternate };
  const results = runQuery(state.index, parsed, { ...options, expansions: state.expansions });
  state.results = results;

  if (state.searchMode === "meaning" && semantic.state === "ready" && parsed.free) {
    semantic.embedQuery(parsed.free).then((vec) => {
      if (!vec) return;
      const ranked = semantic.rank(vec, 300);
      const rank = new Map(ranked.map((r, i) => [r.id, { score: r.score, i }]));
      const merged = results.conversations.slice();
      const present = new Set(merged.map((c) => state.index.convIds[c.conv]));
      for (const r of ranked) {
        if (present.has(r.id) || r.score < 0.28) continue;
        const ci = state.index.convIndexById.get(r.id);
        if (ci === undefined) continue;
        merged.push({ conv: ci, score: r.score, best: -1, bestScore: r.score, hits: 0, semantic: true });
      }
      merged.sort((a, b) => {
        const ra = rank.get(state.index.convIds[a.conv]);
        const rb = rank.get(state.index.convIds[b.conv]);
        return (rb ? rb.score : 0) + b.score * 0.35 - ((ra ? ra.score : 0) + a.score * 0.35);
      });
      paint(merged, results, parsed);
    });
  }

  paint(results.conversations, results, parsed);
}

function paint(rows, results, parsed) {
  const terms = highlightTerms(parsed, state.expansions);
  indexList.setRows(rows, terms, rows.length ? Math.max(...rows.map((r) => r.score)) : 0);

  const hits = results.hasText || activeFilterCount() > 0 || parsed.conditions.length ? new Map() : null;
  if (hits) rows.forEach((row, i) => hits.set(row.conv, { rank: i }));
  spine.applyResults(hits);

  const summary = `${num(rows.length)} ${rows.length === 1 ? "conversation" : "conversations"}, ${num(
    results.total.messages
  )} ${results.total.messages === 1 ? "message" : "messages"}`;
  indexList.setCount(summary);
  announce(summary);

  if (rows.length) {
    const first = rows[0];
    const rec = state.byId.get(state.index.convIds[first.conv]);
    if (rec && (!state.selectedId || !rows.some((r) => state.index.convIds[r.conv] === state.selectedId))) {
      indexList.select(0, false);
      selectConversation(rec, first, false);
    } else if (rec && reader.record) {
      reader.terms = terms;
      reader.recompute();
    }
  } else {
    reader.clearView();
  }
  updateExportLabels(rows.length);
}

function announce(text) {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    dom.live.textContent = text;
  }, 600);
}

function renderChips() {
  clear(dom.chips);
  const has = state.expansions.length > 0 || state.removedExpansions.length > 0;
  dom.chips.hidden = !has || state.searchMode !== "expanded";
  if (dom.chips.hidden) return;
  for (const item of state.expansions) {
    const chip = el("span", { class: "chip chip--expansion" });
    chip.append(el("span", { text: `${item.from} → ${item.word} ${item.weight.toFixed(2)}` }));
    chip.append(
      el("button", {
        type: "button",
        class: "chip__x",
        "aria-label": `Remove the term ${item.word} from this search`,
        onclick: () => {
          state.expansionBlocklist.add(item.word);
          state.removedExpansions.push(item.word);
          runSearch();
        },
        html: '<svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" class="ic"><use href="#ic-close"></use></svg>',
      })
    );
    dom.chips.append(chip);
  }
  if (state.removedExpansions.length) {
    dom.chips.append(
      el("button", {
        type: "button",
        class: "linkbtn",
        text: `Restore removed terms (${state.removedExpansions.length})`,
        onclick: () => {
          state.expansionBlocklist.clear();
          state.removedExpansions = [];
          runSearch();
        },
      })
    );
  }
}

/* --------------------------------------------------------------- filters */

function buildSourceChips() {
  const host = $("#source-chips");
  clear(host);
  const present = [...state.sources];
  if (present.length < 2) {
    host.closest(".filtergroup").hidden = true;
    return;
  }
  host.closest(".filtergroup").hidden = false;
  for (const source of present) {
    const selected = state.filters.source.has(source);
    const count = state.records.filter((r) => r.source === source).length;
    const chip = el("button", {
      type: "button",
      class: `chip chip--source${selected ? " is-on" : ""}`,
      "aria-pressed": String(selected),
      onclick: () => {
        if (state.filters.source.has(source)) state.filters.source.delete(source);
        else state.filters.source.add(source);
        buildSourceChips();
        runSearch();
        syncFilterUi();
      },
    });
    chip.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" class="ic"><use href="#ic-src-${source}"></use></svg>`;
    chip.append(el("span", { text: sourceLabel(source) }), el("span", { class: "chip__n", text: String(count) }));
    host.append(chip);
  }
}

function wireFilters() {
  $$('input[name="role"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.filters.role = input.value === "any" ? undefined : input.value;
      runSearch();
      syncFilterUi();
    });
  });
  $("#has-code").addEventListener("change", (e) => {
    state.filters.hasCode = e.target.checked;
    runSearch();
    syncFilterUi();
  });
  const from = $("#date-from");
  const to = $("#date-to");
  const dateError = $("#date-error");
  const applyDates = () => {
    const f = from.value ? Date.parse(`${from.value}-01T00:00:00Z`) : null;
    const t = to.value ? endOfMonth(to.value) : null;
    if (f && t && f > t) {
      dateError.hidden = false;
      from.classList.add("is-error");
      to.classList.add("is-error");
      return;
    }
    dateError.hidden = true;
    from.classList.remove("is-error");
    to.classList.remove("is-error");
    state.filters.from = f;
    state.filters.to = t;
    runSearch();
    syncFilterUi();
  };
  from.addEventListener("change", applyDates);
  to.addEventListener("change", applyDates);
  $("#date-swap").addEventListener("click", () => {
    const a = from.value;
    from.value = to.value;
    to.value = a;
    applyDates();
  });
  $$(".daterange__quick button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const now = new Date();
      if (btn.dataset.range === "30") {
        const start = new Date(now.getTime() - 30 * 86400000);
        from.value = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
        to.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      } else if (btn.dataset.range === "year") {
        from.value = `${now.getFullYear()}-01`;
        to.value = `${now.getFullYear()}-12`;
      } else {
        from.value = "";
        to.value = "";
      }
      applyDates();
    });
  });
  $("#clear-filters").addEventListener("click", () => {
    state.filters.source.clear();
    state.filters.role = undefined;
    state.filters.hasCode = false;
    state.filters.from = null;
    state.filters.to = null;
    from.value = "";
    to.value = "";
    $("#has-code").checked = false;
    const any = $('input[name="role"][value="any"]');
    if (any) any.checked = true;
    buildSourceChips();
    runSearch();
    syncFilterUi();
  });

  dom.filtersToggle.addEventListener("click", () => {
    const open = dom.filters.dataset.open !== "true";
    dom.filters.dataset.open = String(open);
    dom.filtersToggle.setAttribute("aria-expanded", String(open));
  });
}

function endOfMonth(value) {
  const [y, m] = value.split("-").map(Number);
  return Date.UTC(y, m, 1) - 1;
}

function syncFilterUi() {
  const n = activeFilterCount();
  const clearRow = $("#clear-filters");
  clearRow.hidden = n === 0;
  clearRow.textContent = `Clear all filters (${n})`;
  dom.filtersToggle.textContent = n ? `Filters (${n})` : "Filters";
}

/* ----------------------------------------------------------- conversation */

function selectConversation(rec, row, open) {
  state.selectedId = rec.id;
  const terms = highlightTerms(state.parsed || parseQuery(""), state.expansions);
  if (row && row.best >= 0) {
    const nodeIndex = state.index.docNode[row.best];
    if (nodeIndex >= 0 && rec.pathIds && !rec.pathIds.includes(rec.nodes[nodeIndex].id)) {
      switchToBranchContaining(rec, nodeIndex);
    }
  }
  reader.show(rec, terms);
  if (row && row.best >= 0) {
    const nodeIndex = state.index.docNode[row.best];
    if (nodeIndex >= 0) requestAnimationFrame(() => reader.focusMessage(nodeIndex));
  }
  if (state.view !== "index") setView("index");
  if (open && window.innerWidth < 768) dom.workspace.dataset.pane = "reader";
  updateExportLabels(state.results ? state.results.conversations.length : 0);
}

/** Point the branch choices at the fork that contains a given node. */
function switchToBranchContaining(rec, nodeIndex) {
  const byId = new Map(rec.nodes.map((n, i) => [n.id, i]));
  const choices = choicesFor(rec.id);
  let cursor = nodeIndex;
  let guard = 0;
  while (cursor !== undefined && guard++ < 4096) {
    const node = rec.nodes[cursor];
    const parentKey = node.parent === null || node.parent === undefined ? " root" : node.parent;
    choices.set(parentKey, node.id);
    if (!byId.has(node.parent)) break;
    cursor = byId.get(node.parent);
  }
}

function openById(id) {
  const rec = state.byId.get(id);
  if (!rec) return;
  const rows = state.results ? state.results.conversations : [];
  const at = rows.findIndex((r) => state.index.convIds[r.conv] === id);
  if (at >= 0) {
    indexList.list.scrollToIndex(at);
    indexList.select(at, true);
  } else {
    selectConversation(rec, null, true);
  }
}

function applyHash() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const id = params.get("c");
  if (id && state.byId.has(id)) {
    openById(id);
    const m = Number(params.get("m"));
    if (Number.isFinite(m)) requestAnimationFrame(() => reader.focusMessage(m));
  }
}

/* ------------------------------------------------------------ spine label */

function showSpineLabel(i) {
  if (i < 0 || !spine.cards || !spine.cards[i]) {
    dom.spineLabel.textContent = "";
    return;
  }
  const card = spine.cards[i];
  const title = card.title.length > 42 ? `${card.title.slice(0, 42)}...` : card.title;
  dom.spineLabel.textContent = `${title}   ${day(card.createdAt)}`;
}

function activateSpine(i) {
  if (!spine.cards || !spine.cards[i]) return;
  openById(spine.cards[i].id);
}

/* ---------------------------------------------------------------- export */

function wireExport() {
  dom.exportBtn.addEventListener("click", () => toggleExport(dom.exportPopover.hidden));
  document.addEventListener("click", (e) => {
    if (dom.exportPopover.hidden) return;
    if (e.target.closest("#export-popover") || e.target.closest("#export-btn")) return;
    toggleExport(false);
  });
  $$("#export-popover button[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => runExport(btn.dataset.export, btn));
  });
}

function toggleExport(open) {
  dom.exportPopover.hidden = !open;
  dom.exportBtn.setAttribute("aria-expanded", String(open));
  if (open) {
    const first = dom.exportPopover.querySelector("button:not([disabled])");
    if (first) first.focus();
  } else {
    dom.exportBtn.focus();
  }
}

function updateExportLabels(count) {
  const many = $$("#export-popover button[data-export^='all-']");
  for (const btn of many) {
    const format = btn.dataset.export === "all-markdown" ? "Markdown (.zip)" : "JSON";
    btn.textContent = `All ${num(count)} results as ${format}`;
    btn.disabled = count === 0;
    btn.title = count === 0 ? "No conversations in the current filter" : "";
  }
  const single = $$("#export-popover button[data-export^='one-']");
  for (const btn of single) btn.disabled = !state.selectedId;
  dom.exportBtn.disabled = !state.index;
}

async function runExport(kind, btn) {
  const rec = state.byId.get(state.selectedId);
  try {
    if (kind === "one-markdown" || kind === "one-json") {
      if (!rec) return;
      const info = exportOne(rec, kind === "one-json" ? "json" : "markdown", choicesFor(rec.id));
      toggleExport(false);
      setStatus(`Saved ${info.filename} (${formatBytes(info.size)})`, 6000);
      return;
    }
    const rows = state.results ? state.results.conversations : [];
    const records = rows.map((r) => state.byId.get(state.index.convIds[r.conv])).filter(Boolean);
    const original = btn.textContent;
    const info = await exportMany(records, kind === "all-json" ? "json" : "markdown", (done, total) => {
      btn.textContent = `Packing ${num(done)} of ${num(total)}`;
    });
    btn.textContent = original;
    toggleExport(false);
    setStatus(`Saved ${info.filename} (${formatBytes(info.size)})`, 6000);
  } catch (err) {
    if (err instanceof ExportTooLarge) {
      showNotice(dom.pageNotice, FAILURES["export-too-large"]());
    } else {
      console.debug("chatvault: export failed", err);
      showNotice(dom.pageNotice, FAILURES.unexpected({ message: String(err && err.message) }));
    }
  }
}

/* ------------------------------------------------------------ vault panel */

function wireVaultPanel() {
  dom.vaultToggle.addEventListener("click", () => toggleVaultPanel(dom.vaultPanel.hidden));
  $("#vault-close").addEventListener("click", () => toggleVaultPanel(false));
  $("#import-more").addEventListener("click", () => {
    toggleVaultPanel(false);
    dom.fileInput.click();
  });
  $("#persist-btn").addEventListener("click", async () => {
    const ok = await requestPersistence();
    $("#persist-state").textContent = ok
      ? "This browser will keep the vault when storage runs low."
      : "The browser declined. Your vault may be evicted if storage runs low.";
  });
  const confirmInput = $("#delete-confirm");
  const confirmBtn = $("#delete-btn");
  confirmInput.addEventListener("input", () => {
    confirmBtn.disabled = confirmInput.value.trim().toLowerCase() !== "delete";
  });
  confirmBtn.addEventListener("click", async () => {
    await clearVault();
    location.reload();
  });
}

async function toggleVaultPanel(open) {
  dom.vaultPanel.hidden = !open;
  dom.vaultToggle.setAttribute("aria-expanded", String(open));
  if (!open) {
    dom.vaultToggle.focus();
    return;
  }
  const host = $("#vault-sources");
  clear(host);
  const bySource = new Map();
  for (const rec of state.records) {
    const entry = bySource.get(rec.source) || { count: 0, chars: 0 };
    entry.count++;
    entry.chars += rec.charCount;
    bySource.set(rec.source, entry);
  }
  for (const [source, entry] of bySource) {
    host.append(
      el(
        "li",
        { class: "vaultrow" },
        el("span", { class: "vaultrow__name", text: sourceLabel(source) }),
        el("span", { class: "vaultrow__n", text: `${num(entry.count)} conversations` }),
        el("span", { class: "vaultrow__size", text: `${formatBytes(entry.chars)} of text` }),
        el("button", {
          type: "button",
          class: "linkbtn linkbtn--alert",
          text: "Remove",
          onclick: async () => {
            await removeSource(source);
            location.reload();
          },
        })
      )
    );
  }
  const est = await storageEstimate();
  $("#vault-usage").textContent = est
    ? `${formatBytes(est.usage)} used of about ${formatBytes(est.quota)} this browser will allow`
    : "This browser does not report a storage estimate.";
  $("#persist-state").textContent = (await isPersisted())
    ? "This vault is already marked as persistent."
    : "Not persistent yet. The browser may evict it if storage runs low.";
}

/* ------------------------------------------------------------------ rail */

function wireRail() {
  dom.statsBtn.addEventListener("click", () => setView(state.view === "stats" ? "index" : "stats"));
  dom.backBtn.addEventListener("click", () => {
    dom.workspace.dataset.pane = "index";
    indexList.track.focus();
  });
  $("#kb-toggle").addEventListener("click", () => {
    const open = dom.keyboardHelp.hidden;
    dom.keyboardHelp.hidden = !open;
    $("#kb-toggle").setAttribute("aria-expanded", String(open));
  });
  window.addEventListener("resize", () => {
    positionModeIndicator();
    if (window.innerWidth >= 768) dom.workspace.dataset.pane = "both";
    else if (dom.workspace.dataset.pane === "both") dom.workspace.dataset.pane = "index";
  });
}

function setView(view) {
  state.view = view;
  dom.workspace.dataset.view = view;
  dom.statsBtn.setAttribute("aria-pressed", String(view === "stats"));
  // below 768 only one pane is on screen, so switching view also switches pane
  if (window.innerWidth < 768) dom.workspace.dataset.pane = view === "stats" ? "reader" : "index";
  if (view === "stats") {
    statsView.render(parsing ? `Statistics finish when indexing finishes. ${progressPercent()} percent read.` : "");
  }
}

function progressPercent() {
  const p = state.parsing;
  if (!p || !p.total) return 0;
  return Math.round((p.read / p.total) * 100);
}

/* --------------------------------------------------------------- guides */

function wireGuides() {
  const tabs = $$("#guide-tabs [role='tab']");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => selectGuide(tab.id));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const i = tabs.indexOf(tab);
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      selectGuide(next.id);
    });
  });

  function selectGuide(id) {
    tabs.forEach((tab) => {
      const on = tab.id === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
  }
}

/* -------------------------------------------------------------- semantic */

function updateSemanticEntry() {
  const enough = state.records.length >= 40;
  const expandedBtn = $('.mode__btn[data-mode="expanded"]', dom.modeToggle);
  if (expandedBtn) {
    expandedBtn.disabled = state.records.length < 40;
    expandedBtn.setAttribute("aria-disabled", String(expandedBtn.disabled));
    expandedBtn.title = expandedBtn.disabled ? "Needs at least 40 conversations to learn related terms." : "";
  }
  dom.semanticEnable.hidden = !enough;
  positionModeIndicator();
}

function wireSemantic() {
  dom.semanticEnable.addEventListener("click", () => {
    const open = dom.semanticPanel.hidden;
    dom.semanticPanel.hidden = !open;
    dom.semanticEnable.setAttribute("aria-expanded", String(open));
  });
  $("#semantic-go").addEventListener("click", () => {
    const docs = state.records.map((r) => ({
      id: r.id,
      text: `${r.title}\n${r.nodes.slice(0, 6).map((n) => n.text).join("\n")}`,
    }));
    if (!semantic.enable(docs)) {
      showNotice(dom.pageNotice, {
        ...FAILURES["semantic-failed"](),
        actions: [{ label: "Try again", onClick: () => $("#semantic-go").click() }],
      });
    }
  });
  $("#semantic-not-now").addEventListener("click", () => {
    dom.semanticPanel.hidden = true;
    dom.semanticEnable.setAttribute("aria-expanded", "false");
  });

  semantic.onChange((s) => {
    const line = $("#semantic-state");
    if (s.state === "downloading") {
      line.textContent = s.progress.total
        ? `Downloading the model: ${formatBytes(s.progress.loaded)} of ${formatBytes(s.progress.total)}`
        : "Downloading the model";
      dom.semanticEnable.textContent = "Cancel download";
    } else if (s.state === "building") {
      line.textContent = `Building vectors: ${num(s.progress.done)} of ${num(s.progress.of)} conversations`;
    } else if (s.state === "ready") {
      line.textContent = "Meaning search is ready. It runs in this tab.";
      dom.semanticPanel.hidden = true;
      dom.semanticEnable.hidden = true;
      const btn = $('.mode__btn[data-mode="meaning"]', dom.modeToggle);
      if (btn) {
        btn.hidden = false;
        btn.disabled = false;
      }
      positionModeIndicator();
    } else if (s.state === "failed") {
      line.textContent = "";
      dom.semanticEnable.textContent = "Enable meaning search";
      showNotice(dom.pageNotice, {
        ...FAILURES["semantic-failed"](),
        actions: [{ label: "Try again", onClick: () => $("#semantic-go").click() }],
      });
    } else if (s.state === "cancelled") {
      line.textContent = "Download cancelled. Keyword search is unaffected.";
      dom.semanticEnable.textContent = "Enable meaning search";
    }
  });
}

/* -------------------------------------------------------------- keyboard */

function wireKeyboard() {
  let gPressed = false;
  document.addEventListener("keydown", (e) => {
    const target = e.target;
    const typing =
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      dom.q.focus();
      dom.q.select();
      return;
    }
    if (e.key === "Escape") {
      if (!dom.exportPopover.hidden) {
        toggleExport(false);
        return;
      }
      if (!dom.vaultPanel.hidden) {
        toggleVaultPanel(false);
        return;
      }
      if (!dom.wizard.hidden) {
        dom.wizard.hidden = true;
        resetDropzone();
        return;
      }
      if (!dom.keyboardHelp.hidden) {
        dom.keyboardHelp.hidden = true;
        $("#kb-toggle").setAttribute("aria-expanded", "false");
        return;
      }
      if (window.innerWidth < 768 && dom.workspace.dataset.pane === "reader") {
        dom.workspace.dataset.pane = "index";
        return;
      }
    }
    if (typing) return;

    if (e.key === "/") {
      e.preventDefault();
      dom.q.focus();
      dom.q.select();
    } else if (e.key === "?") {
      e.preventDefault();
      const open = dom.keyboardHelp.hidden;
      dom.keyboardHelp.hidden = !open;
      $("#kb-toggle").setAttribute("aria-expanded", String(open));
    } else if (e.key === "j" || e.key === "k") {
      e.preventDefault();
      reader.moveMessage(e.key === "j" ? 1 : -1);
    } else if (e.key === "n") {
      e.preventDefault();
      reader.step(e.shiftKey ? -1 : 1);
    } else if (e.key === "N") {
      e.preventDefault();
      reader.step(-1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (state.mode !== "loaded") return;
      e.preventDefault();
      indexList.move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      if (state.mode !== "loaded" || indexList.active < 0) return;
      indexList.select(indexList.active, !e.shiftKey);
    } else if (e.key === "g") {
      gPressed = true;
      setTimeout(() => {
        gPressed = false;
      }, 900);
    } else if (gPressed && (e.key === "s" || e.key === "i")) {
      e.preventDefault();
      gPressed = false;
      setView(e.key === "s" ? "stats" : "index");
    } else if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      const forkIndex = [...reader.forks.keys()][0];
      if (forkIndex !== undefined) reader.switchBranch(forkIndex, e.key === "]" ? 1 : -1);
    }
  });
}

/* ---------------------------------------------------------------- status */

let statusTimer = 0;
function setStatus(text, clearAfter) {
  dom.statusText.textContent = text;
  dom.status.dataset.filled = text ? "true" : "false";
  clearTimeout(statusTimer);
  if (clearAfter) {
    statusTimer = setTimeout(() => {
      dom.statusText.textContent = "";
      dom.status.dataset.filled = "false";
    }, clearAfter);
  }
}

/* ------------------------------------------------------------------ init */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    boot();
    wireSemantic();
  });
} else {
  boot();
  wireSemantic();
}

export { state, on, emit };
