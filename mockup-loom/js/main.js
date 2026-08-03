/**
 * js/main.js
 * Wiring. The loom is threaded before anyone asks it for anything: on first
 * paint there is already a rendered tee on the stage, with folds, weave and
 * occlusion, and no design on it yet.
 *
 * This file owns state and orchestration only. Every calculation lives in a
 * module next to the thing it calculates.
 */

import { $, el, cssVar } from './util/dom.js';
import { loadSettings, saveSettings } from './util/store.js';
import { webgl2Supported, LoomGL } from './render/gl.js';
import { Loom2D } from './render/fallback2d.js';
import { Oven } from './render/oven.js';
import {
  FORMS, getForm, colorway, printUV, templateSlug, templateLabel,
  applyToRenderer, defaultPlacement, outsidePrintArea, peekMaps
} from './templates/index.js';
import { outputSize } from './templates/forms.js';
import { DesignStore } from './designs.js';
import { buildSampleSet, calibrationGrid } from './samples.js';
import { Stage } from './stage.js';
import { Placement } from './placement.js';
import { WeaveSwitch } from './weave-switch.js';
import { Batch } from './batch.js';
import { Segmented } from './ui/segmented.js';
import { NumberField, Slider } from './ui/controls.js';
import { LightDial } from './ui/light-dial.js';
import { Dropzone } from './ui/dropzone.js';
import { DesignList } from './ui/design-list.js';
import { TemplatePicker } from './ui/template-picker.js';
import { BannerHost } from './ui/banner.js';
import { toast } from './ui/toast.js';
import { KeyboardOverlay } from './ui/keys.js';
import { ZipWriter, selfTest } from './export/zip.js';
import { planPaths, DEFAULT_PATTERN, GROUPINGS, hasIllegal, expand } from './export/naming.js';
import { buildManifest } from './export/manifest.js';
import { buildTreeLines, renderTree } from './export/tree.js';
import { installMotion } from './motion.js';

const BLENDS = [
  { id: '0', label: '正常' },
  { id: '1', label: '色彩增值' },
  { id: '2', label: '濾色' },
  { id: '3', label: '覆蓋' }
];

/* ---------------------------------------------------------------------- */
/* State                                                                    */
/* ---------------------------------------------------------------------- */

const settings = loadSettings();
const store = new DesignStore();

const state = {
  mode: 'single',
  formId: settings.formId,
  colorwayId: settings.colorwayId,
  colorwayByForm: {},
  form: getForm(settings.formId),
  cw: null,
  placement: null,
  designAspect: 1,
  light: {
    azimuth: settings.azimuth,
    elevation: settings.elevation,
    intensity: settings.intensity
  },
  blend: settings.blend,
  outputWidth: settings.outputWidth,
  pattern: settings.pattern || DEFAULT_PATTERN,
  grouping: settings.grouping,
  reduced: false,
  exported: true
};
state.cw = colorway(state.form, state.colorwayId);
state.colorwayByForm[state.formId] = state.cw.id;
state.placement = defaultPlacement(state.form);

/* ---------------------------------------------------------------------- */
/* Chrome                                                                   */
/* ---------------------------------------------------------------------- */

const banner = new BannerHost($('#banner-host'));
const toastHost = $('#toast-host');

installChecker();

let renderer = null;
let oven = null;

try {
  if (webgl2Supported()) {
    renderer = new LoomGL($('#gl-stage'));
    oven = new Oven({ reduced: false });
  } else {
    throw new Error('no-webgl2');
  }
} catch (err) {
  state.reduced = true;
  renderer = new Loom2D($('#gl-stage'));
  oven = new Oven({ reduced: true });
  banner.show({
    id: 'reduced',
    text: '這個瀏覽器沒有 WebGL2，所以印花不會吃進皺褶。擺放、疊色、輸出都還是正常的。',
    detail: [
      '設計會平貼在布上，不跟著折。',
      '布料的明暗和陰影是先烤好的，不是即時打光。',
      '其他都能用，包含批次和 ZIP 輸出。'
    ]
  });
}

const stage = new Stage({
  stageEl: $('#stage'),
  innerEl: $('#stage-inner'),
  canvas: $('#gl-stage'),
  printbox: $('#printbox'),
  pframe: $('#pframe'),
  guides: $('#guides'),
  readout: $('#stage-readout'),
  seedEl: $('#stage-seed')
});
stage.setRenderer(renderer);

const placement = new Placement({
  stage,
  state,
  onChange: () => { syncRenderer(); syncPlacementFields(); }
});

const weave = new WeaveSwitch({
  root: $('.weave'),
  button: $('#weave-switch'),
  knob: $('#weave-knob'),
  fill: $('#weave-fill'),
  labelFlat: $('#weave-flat'),
  labelWoven: $('#weave-woven'),
  note: $('#weave-note'),
  verdict: $('#weave-verdict'),
  uniforms: renderer.uniforms,
  onFrame: () => renderer.requestFrame(),
  onFirstUse: () => { settings.switchUsed = true; persist(); }
});
weave.setUsed(!!settings.switchUsed);
weave.setEnabled(false, state.reduced ? '這個要 WebGL2 才動得了。' : '先放一張設計上去，才看得出差別。');
if (state.reduced) $('#weave-note').dataset.sticky = 'true';

/* ---------------------------------------------------------------------- */
/* Panels                                                                   */
/* ---------------------------------------------------------------------- */

const modeSeg = new Segmented($('#mode-host'), {
  name: '模式',
  options: [{ id: 'single', label: '單張' }, { id: 'batch', label: '批次' }],
  value: 'single',
  onChange: (id) => setMode(id)
});

const blendSeg = new Segmented($('#blend-host'), {
  name: '疊色',
  labelledBy: 'h-blend',
  options: BLENDS,
  value: String(state.blend),
  onChange: (id) => {
    state.blend = Number(id);
    syncBlendHint();
    syncRenderer();
    persist();
  }
});

const foldersSeg = new Segmented($('#folders-host'), {
  name: '資料夾',
  labelledBy: 'h-folders',
  options: GROUPINGS,
  value: state.grouping,
  onChange: (id) => { state.grouping = id; refreshNamePreview(); persist(); }
});

const fields = {};
const fieldHost = $('#placement-fields');
fields.x = new NumberField(fieldHost, {
  label: 'X', value: state.placement.x * 100, min: -20, max: 120, step: 0.5,
  precision: 1, suffix: '%', onChange: (v) => { state.placement.x = v / 100; syncRenderer(); }
});
fields.y = new NumberField(fieldHost, {
  label: 'Y', value: state.placement.y * 100, min: -20, max: 120, step: 0.5,
  precision: 1, suffix: '%', onChange: (v) => { state.placement.y = v / 100; syncRenderer(); }
});
fields.scale = new NumberField(fieldHost, {
  label: '大小', value: state.placement.scale * 100, min: 4, max: 400, step: 1,
  precision: 0, suffix: '%', onChange: (v) => { state.placement.scale = v / 100; syncRenderer(); }
});
fields.rotation = new NumberField(fieldHost, {
  label: '角度', value: state.placement.rotation, min: -180, max: 180, step: 1,
  precision: 0, suffix: ' 度', onChange: (v) => { state.placement.rotation = v; syncRenderer(); }
});

const dial = new LightDial($('#dial-host'), {
  value: state.light.azimuth,
  onChange: (v) => { state.light.azimuth = v; syncRenderer(); },
  onCommit: () => { persist(); relightWall(); }
});

const elevation = new Slider($('#elevation-host'), {
  label: '高度', value: state.light.elevation, min: 0, max: 90, suffix: ' 度',
  onChange: (v) => { state.light.elevation = v; syncRenderer(); },
  onCommit: () => persist()
});

const intensity = new Slider($('#intensity-host'), {
  label: '強度', value: state.light.intensity, min: 0, max: 100,
  onChange: (v) => { state.light.intensity = v; syncRenderer(); },
  onCommit: () => persist()
});

if (state.reduced) {
  dial.setDisabled(true);
  elevation.setDisabled(true);
  intensity.setDisabled(true);
  $('#light-hint').hidden = false;
}

const picker = new TemplatePicker({
  gridHost: $('#tpl-grid'),
  swatchHost: $('#swatches'),
  state,
  onForm: (id) => selectForm(id),
  onColorway: (id) => selectColorway(id),
  thumbnailFor: (form, cw) => {
    const maps = peekMaps(form.id);
    if (!maps) return null;
    return oven.thumbnail(form, cw, maps, state.light, 128);
  }
});

const designList = new DesignList($('#design-list'), $('#design-wrap'), store, {
  mode: 'single',
  onUse: (id) => { store.select(id); },
  onRemove: (id) => removeDesign(id)
});

const dropzone = new Dropzone({
  zone: $('#dropzone'),
  input: $('#file-input'),
  rowsHost: $('#file-rows'),
  summaryEl: $('#skip-summary'),
  titleEl: $('#dz-title'),
  onDesigns: (list) => { store.add(list); markNew(list); }
});

const keysOverlay = new KeyboardOverlay($('#keys-overlay'), $('#keys-close'));

const batch = new Batch({
  grid: $('#wall-grid'),
  emptyEl: $('#wall-empty'),
  oven,
  onProgress: (done, total, failed) => onBatchProgress(done, total, failed),
  onStateChange: () => syncBatchButtons()
});

/* ---------------------------------------------------------------------- */
/* Motion                                                                   */
/*                                                                          */
/* Installed after every control exists and before boot() paints, so the    */
/* first placement of each marker is a placement and not a travel. Under    */
/* prefers-reduced-motion this returns an inert object and every module      */
/* above keeps the instant write it already had.                            */
/* ---------------------------------------------------------------------- */

const motion = installMotion({
  weave,
  dial,
  batch,
  picker,
  designList,
  segments: [modeSeg, blendSeg, foldersSeg],
  tplGrid: $('#tpl-grid')
});

/* ---------------------------------------------------------------------- */
/* Output panel                                                             */
/* ---------------------------------------------------------------------- */

const sizeSelect = $('#out-size');
sizeSelect.value = String(state.outputWidth);
sizeSelect.addEventListener('change', () => {
  state.outputWidth = Number(sizeSelect.value);
  refreshNamePreview();
  persist();
});

const patternInput = $('#name-pattern');
patternInput.value = state.pattern;
patternInput.addEventListener('input', () => {
  state.pattern = patternInput.value;
  refreshNamePreview();
});
patternInput.addEventListener('change', () => persist());

$('#preview-tree').addEventListener('click', () => showTree());
$('#fit-to-area').addEventListener('click', () => placement.fitToArea());
$('#fit-to-area-2').addEventListener('click', () => placement.fitToArea());
$('#load-samples').addEventListener('click', () => loadSamples());
$('#export-zip').addEventListener('click', () => exportZip());
$('#render-batch').addEventListener('click', () => runBatch());
$('#cancel-batch').addEventListener('click', () => batch.cancel());
$('#select-all').addEventListener('click', () => {
  const all = store.checkedItems.length === store.length && picker.checked.size === FORMS.length;
  store.setAllChecked(!all);
  picker.setAllChecked(!all);
  syncBatchCounts();
});

/* ---------------------------------------------------------------------- */
/* State plumbing                                                           */
/* ---------------------------------------------------------------------- */

store.onChange(() => {
  const design = store.selected;
  state.designAspect = design ? design.aspect : 1;
  renderer.setDesign(design ? design.source : null);
  weave.setEnabled(!state.reduced && store.length > 0,
    state.reduced ? '這個要 WebGL2 才動得了。' : (store.length ? '' : '先放一張設計上去，才看得出差別。'));
  stage.pframe.hidden = !design;
  syncRenderer();
  syncPlacementFields();
  syncBatchCounts();
  syncExportButton();
  refreshNamePreview();
});

function persist() {
  const ok = saveSettings({
    formId: state.formId,
    colorwayId: state.colorwayId,
    azimuth: state.light.azimuth,
    elevation: state.light.elevation,
    intensity: state.light.intensity,
    blend: state.blend,
    outputWidth: state.outputWidth,
    pattern: state.pattern,
    grouping: state.grouping,
    keysSeen: settings.keysSeen,
    switchUsed: settings.switchUsed
  });
  if (!ok) $('#settings-note').hidden = false;
}

function syncRenderer() {
  applyToRenderer(renderer, {
    form: state.form,
    cw: state.cw,
    placement: state.placement,
    designAspect: state.designAspect,
    light: state.light,
    blend: state.blend,
    printGuard: 0.25
  });
  renderer.uniforms.hasDesign = store.selected ? 1 : 0;
  renderer.requestFrame();

  const design = store.selected;
  stage.setFrame(placement.box(), state.placement.rotation, !!design);
  const outside = design && outsidePrintArea(state.form, state.placement, state.designAspect);
  $('#stage-notice').hidden = !outside;
  state.exported = false;
}

function syncPlacementFields() {
  fields.x.set(state.placement.x * 100, false);
  fields.y.set(state.placement.y * 100, false);
  fields.scale.set(state.placement.scale * 100, false);
  fields.rotation.set(state.placement.rotation, false);
}

function syncBlendHint() {
  $('#blend-hint').hidden = !(state.blend === 2 && state.cw.dark);
}

async function selectForm(id) {
  if (state.formId !== id) {
    state.formId = id;
    state.form = getForm(id);
    state.colorwayId = state.colorwayByForm[id] || state.form.defaultColorway;
    state.cw = colorway(state.form, state.colorwayId);
    const pa = printUV(state.form);
    state.placement.x = pa.cx;
    state.placement.y = pa.cy;
  }
  picker.renderSelection();
  syncBlendHint();
  await mountForm();
  persist();
}

function selectColorway(id) {
  state.colorwayId = id;
  state.colorwayByForm[state.formId] = id;
  state.cw = colorway(state.form, id);
  picker.renderSwatches();
  syncBlendHint();
  syncRenderer();
  picker.refreshThumb(state.form, state.cw);
  persist();
}

async function mountForm() {
  const maps = await picker.ensureMaps(state.form);
  renderer.setMaps(maps.shape, maps.field);
  stage.setForm(state.form);
  stage.setSeed(`程式算出來的，不是拍的。種子 ${maps.seed}`);
  syncRenderer();
  syncPlacementFields();
  picker.refreshThumb(state.form, state.cw);
  refreshNamePreview();
}

/* ---------------------------------------------------------------------- */
/* Designs                                                                  */
/* ---------------------------------------------------------------------- */

function loadSamples() {
  const btn = $('#load-samples');
  const existing = new Set(store.items.map((d) => d.id));
  const made = buildSampleSet().filter((d) => !existing.has(d.id));
  if (!made.length) {
    btn.textContent = '範例已經在裡面了';
    setTimeout(() => { btn.textContent = '載入範例設計'; }, 1600);
    return;
  }
  store.add(made);
  store.select(made[0].id);
  markNew(made);
}

function markNew(list) {
  requestAnimationFrame(() => {
    for (const d of list) {
      const node = $(`.dthumb[data-id="${CSS.escape(d.id)}"]`);
      if (!node) continue;
      node.classList.add('is-new');
      setTimeout(() => node.classList.remove('is-new'), 400);
    }
  });
}

function removeDesign(id) {
  const removed = store.remove(id);
  if (!removed) return;
  toast(toastHost, {
    text: `已移除 ${removed.item.name}`,
    onUndo: () => store.restore(removed.item, removed.index)
  });
}

/* ---------------------------------------------------------------------- */
/* Modes                                                                    */
/* ---------------------------------------------------------------------- */

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  $('#wall').hidden = mode !== 'batch';
  designList.setMode(mode);
  picker.setMode(mode);
  if (mode === 'batch' && picker.checked.size === 0) picker.setAllChecked(true);
  syncBatchCounts();
  syncExportButton();
}

/* ---------------------------------------------------------------------- */
/* Batch                                                                    */
/* ---------------------------------------------------------------------- */

function currentJobs() {
  const designs = store.checkedItems;
  const templates = picker.checkedTemplates();
  const jobs = [];
  let index = 0;
  for (const d of designs) {
    for (const t of templates) {
      const size = outputSize(t.form, state.outputWidth);
      jobs.push(makeJob(d, t.form, t.cw, size, index++));
    }
  }
  return jobs;
}

function makeJob(design, form, cw, size, index) {
  const maps = peekMaps(form.id);
  return {
    key: `${design.id}|${form.id}|${cw.id}`,
    index,
    form,
    formId: form.id,
    cw,
    colorwayId: cw.id,
    maps,
    designKey: design.id,
    designSource: design.source,
    designAspect: design.aspect,
    designSlug: design.fileBase,
    designSample: design.sample,
    placement: { ...state.placement },
    light: { ...state.light },
    blend: state.blend,
    blendLabel: BLENDS[state.blend].label,
    woven: !state.reduced,
    w: size.w,
    h: size.h,
    templateSlug: templateSlug(form, cw),
    templateLabel: templateLabel(form, cw),
    seed: form.seed,
    file: ''
  };
}

function syncBatchCounts() {
  const d = store.checkedItems.length;
  const t = state.mode === 'batch' ? picker.checked.size : 0;
  const n = d * t;
  // The figure counts to its new value: ticking a design changed how much
  // work is about to happen, and that is worth two tenths of a second.
  motion.rollFigure($('#wall-count'), n, (v) => `${v} 張`);
  $('#wall-sub').textContent = `${d} 個設計 × ${t} 個版型`;
  const renderBtn = $('#render-batch');
  renderBtn.textContent = `開始算 ${n} 張`;
  renderBtn.setAttribute('aria-disabled', String(n === 0));
  $('#select-all').textContent = `全選 ${store.length} × ${FORMS.length}`;
  $('#wall-empty').hidden = n > 0 || batch.hasResults;
  $('#wall-empty').textContent = store.length === 0
    ? '按上面載入範例設計，或把自己的圖拖進來，再挑下面的版型。'
    : '左邊挑設計，下面挑版型。';

  const hint = $('#wall-hint');
  if (n > 2000) {
    hint.hidden = false;
    hint.textContent = `一次算 ${n} 張太多了。先取消掉一些設計或版型。`;
  } else if (n > 400) {
    hint.hidden = false;
    const gb = ((n * state.outputWidth * state.outputWidth * 4) / 1073741824).toFixed(1);
    hint.textContent =
      `${n} 張 ${state.outputWidth} px 大概會吃掉 ${gb} GB 記憶體。分頁如果卡住，就分兩批算。`;
  } else if (n > 60 && window.matchMedia('(max-width: 767px)').matches) {
    hint.hidden = false;
    hint.textContent = '手機一次算太多會很慢，建議控制在 60 張以內。';
  } else {
    hint.hidden = true;
  }
}

async function runBatch() {
  const jobs = currentJobs();
  if (!jobs.length || jobs.length > 2000) return;

  // Every checked form needs its maps before the queue can start.
  for (const form of FORMS) {
    if (!picker.checked.has(form.id)) continue;
    await picker.ensureMaps(form);
  }
  for (const job of jobs) job.maps = peekMaps(job.formId);

  const plan = planPaths(jobs, {
    pattern: state.pattern, grouping: state.grouping, date: new Date()
  });
  plan.paths.forEach((entry, i) => { jobs[i].file = entry.file; jobs[i].path = entry.path; });

  batch.plan(jobs);
  $('#wall-empty').hidden = true;
  await batch.start();
  motion.setArrivalMode('render');
  syncExportButton();
  if (batch.failed.length) {
    const hint = $('#wall-hint');
    hint.hidden = false;
    hint.textContent = '';
    hint.appendChild(document.createTextNode(
      `${jobs.length} 張裡有 ${batch.failed.length} 張記憶體不夠，沒算完。`
    ));
    hint.appendChild(el('button', {
      type: 'button', class: 'btn btn-text', text: `重算這 ${batch.failed.length} 張`,
      onclick: () => batch.retryFailed()
    }));
  }
}

/**
 * A working button shows the real count and a real fill, and stays clickable.
 * Nothing in this build spins an indeterminate circle at anybody.
 */
function setButtonProgress(btn, label, ratio) {
  btn.textContent = label;
  if (ratio === null) return;
  const bar = el('span', { class: 'btn-progress' });
  bar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  btn.appendChild(bar);
}

function onBatchProgress(done, total) {
  const btn = $('#render-batch');
  if (batch.running) {
    setButtonProgress(btn, `算到 ${done} / ${total}`, done / Math.max(1, total));
  } else {
    setButtonProgress(btn, `開始算 ${total} 張`, null);
  }
}

function syncBatchButtons() {
  $('#cancel-batch').hidden = !batch.running;
  const busy = batch.running;
  designList.setBusy(busy);
  dropzone.setDisabled(busy, busy ? '正在算，算完再加設計' : null);
  syncExportButton();
}

/**
 * Letting go of the light dial repaints the whole wall, so every card's
 * shadow turns at once. This is the proof that the cards are renders and not
 * cached thumbnails, which is the only reason the effect is worth the cost.
 *
 * The cards cross-fade rather than arriving: nothing new was made here, the
 * same renders are standing under a different key light.
 */
let relightTimer = null;
function relightWall() {
  if (state.mode !== 'batch' || !batch.hasResults || batch.running) return;
  clearTimeout(relightTimer);
  relightTimer = setTimeout(() => {
    motion.setArrivalMode('relight');
    runBatch();
  }, 300);
}

/* ---------------------------------------------------------------------- */
/* Export                                                                   */
/* ---------------------------------------------------------------------- */

function exportableJobs() {
  if (state.mode === 'batch' && batch.hasResults) {
    return batch.orderedResults().map((r) => r.job);
  }
  const design = store.selected;
  if (!design) return [];
  const size = outputSize(state.form, state.outputWidth);
  const job = makeJob(design, state.form, state.cw, size, 0);
  job.maps = peekMaps(state.form.id);
  job.woven = !state.reduced && weave.woven;
  return [job];
}

function syncExportButton() {
  const btn = $('#export-zip');
  const why = $('#export-why');
  if (batch.running) {
    btn.setAttribute('aria-disabled', 'true');
    why.hidden = false;
    why.textContent = '等這批算完再輸出。';
    return;
  }
  const n = exportableJobs().length;
  btn.setAttribute('aria-disabled', String(n === 0));
  why.hidden = n > 0;
  if (n === 0) why.textContent = '先算一張出來再輸出。';
}

function currentPlan() {
  const jobs = exportableJobs();
  return planPaths(jobs, { pattern: state.pattern, grouping: state.grouping, date: new Date() });
}

function refreshNamePreview() {
  const design = store.selected || store.items[0];
  const size = outputSize(state.form, state.outputWidth);
  const sample = {
    designSlug: design ? design.fileBase : 'loom-monogram',
    templateSlug: templateSlug(state.form, state.cw),
    formId: state.form.id,
    colorwayId: state.cw.id,
    w: size.w,
    h: size.h,
    blendLabel: BLENDS[state.blend].label,
    index: 0
  };
  $('#name-preview').textContent = expand(state.pattern || DEFAULT_PATTERN, sample);

  const err = $('#name-error');
  if (hasIllegal(state.pattern)) {
    err.hidden = false;
    err.textContent = '檔名裡這幾個字元會被拿掉：/ \\ : * ? " < >';
  } else {
    err.hidden = true;
  }
}

function showTree() {
  const plan = currentPlan();
  if (!plan.paths.length) {
    const err = $('#export-error');
    err.hidden = false;
    err.textContent = '現在還沒有東西可以輸出。先放一張設計上去，再算一次。';
    return;
  }
  $('#export-error').hidden = true;
  const lines = buildTreeLines(plan.root, plan.paths);
  renderTree($('#export-tree'), lines);
  motion.drawTree($('#export-tree'));
  const err = $('#name-error');
  if (plan.duplicates > 0) {
    err.hidden = false;
    err.textContent = '這個規則會取出一樣的檔名。加上 {template} 就不會撞名。';
  }
}

async function exportZip() {
  const btn = $('#export-zip');
  if (btn.getAttribute('aria-disabled') === 'true') return;
  const errEl = $('#export-error');
  errEl.hidden = true;

  const label = '輸出 ZIP';
  setButtonProgress(btn, label, 0);

  try {
    selfTest();
  } catch (err) {
    setButtonProgress(btn, label, null);
    errEl.hidden = false;
    errEl.textContent = '打包程式自我檢查沒過，所以一個檔案都沒寫出來。重新整理頁面再試一次。';
    return;
  }

  const date = new Date();
  const jobs = exportableJobs();
  const plan = planPaths(jobs, { pattern: state.pattern, grouping: state.grouping, date });
  const lines = buildTreeLines(plan.root, plan.paths);
  renderTree($('#export-tree'), lines);
  motion.drawTree($('#export-tree'));

  const zip = new ZipWriter(date);
  let done = 0;

  try {
    for (const entry of plan.paths) {
      const job = entry.job;
      let blob = batch.results.get(job.key)?.blob;
      if (!blob) {
        job.maps = job.maps || peekMaps(job.formId);
        blob = await oven.render(job);
      }
      const buf = new Uint8Array(await blob.arrayBuffer());
      zip.add(entry.path, buf);
      done++;
      setButtonProgress(btn, `寫入 ${done} / ${plan.paths.length}`, done / plan.paths.length);
      if (zip.bytes > 2 * 1024 * 1024 * 1024) {
        throw new Error(`這包 ZIP 大概會有 ${(zip.bytes / 1073741824).toFixed(1)} GB。分開輸出吧：先照設計匯一次，再照版型匯一次。`);
      }
    }

    const manifest = buildManifest({
      paths: plan.paths,
      light: state.light,
      blendLabel: BLENDS[state.blend].label,
      outputWidth: state.outputWidth,
      date,
      reduced: state.reduced,
      renamed: plan.duplicates
    });
    zip.add(`${plan.root}/MANIFEST.txt`, new TextEncoder().encode(manifest));

    const blob = zip.build();
    const name = `${plan.root}.zip`;
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    state.exported = true;
    setButtonProgress(btn, `已存下 ${name}`, null);
    setTimeout(() => setButtonProgress(btn, label, null), 1600);
  } catch (err) {
    setButtonProgress(btn, label, null);
    errEl.hidden = false;
    errEl.textContent = err && err.message
      ? err.message
      : '下載沒能開始。少選幾個檔案再試一次。';
  }
}

/* ---------------------------------------------------------------------- */
/* Keyboard                                                                 */
/* ---------------------------------------------------------------------- */

function inField(target) {
  return target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable);
}

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (keysOverlay.isOpen) { keysOverlay.close(); return; }
    if (placement.cancelDrag()) return;
    if (dial.cancelDrag()) return;
    if (document.activeElement === stage.pframe) { stage.pframe.blur(); return; }
    return;
  }
  if (inField(ev.target) || ev.metaKey || ev.ctrlKey || ev.altKey) return;

  const k = ev.key.toLowerCase();
  if (k === 'w') { weave.toggle(); ev.preventDefault(); }
  else if (k === 'f' && !ev.repeat) { weave.peek(true); ev.preventDefault(); }
  else if (k === 'b') {
    const next = (state.blend + 1) % BLENDS.length;
    blendSeg.set(String(next), true);
    ev.preventDefault();
  } else if (k === 'e') { exportZip(); ev.preventDefault(); }
  else if (k === 'r' && state.mode === 'batch') { runBatch(); ev.preventDefault(); }
  else if (ev.key === '?') { keysOverlay.toggle(); settings.keysSeen = true; persist(); ev.preventDefault(); }
  else if (/^[1-6]$/.test(ev.key)) {
    selectForm(FORMS[Number(ev.key) - 1].id);
    ev.preventDefault();
  }
});

window.addEventListener('keyup', (ev) => {
  if (ev.key.toLowerCase() === 'f') weave.peek(false);
});

window.addEventListener('beforeunload', (ev) => {
  if (!batch.hasResults || state.exported) return;
  ev.preventDefault();
  ev.returnValue = '';
});

/* ---------------------------------------------------------------------- */
/* Context loss                                                             */
/* ---------------------------------------------------------------------- */

if (!state.reduced) {
  const canvas = $('#gl-stage');
  let lostTimer = null;
  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    renderer.lost = true;
    banner.show({ id: 'lost', text: '繪圖環境斷掉了，正在接回來。', tone: 'error' });
    lostTimer = setTimeout(() => {
      banner.show({
        id: 'lost-hard',
        text: '接不回繪圖環境了。',
        tone: 'error',
        action: { label: '重新整理頁面', run: () => window.location.reload() }
      });
    }, 6000);
    if (batch.running) {
      batch.cancel();
      banner.show({
        id: 'lost-batch',
        text: `算到 ${batch.total} 張裡的第 ${batch.done} 張就停了。已經算好的都還在。`,
        tone: 'error'
      });
    }
  });
  canvas.addEventListener('webglcontextrestored', async () => {
    clearTimeout(lostTimer);
    renderer.lost = false;
    renderer._build();
    await mountForm();
    renderer.setDesign(store.selected ? store.selected.source : null);
    weave.apply(weave.woven ? 1 : 0);
    banner.show({ id: 'restored', text: '接回來了。' });
    banner.autoClearAfter(2000);
  });
}

/* ---------------------------------------------------------------------- */
/* Responsive: the mode switch lives under the stage on a phone             */
/* ---------------------------------------------------------------------- */

const narrow = window.matchMedia('(max-width: 767px)');
function placeModeSwitch() {
  const host = $('#mode-host');
  if (narrow.matches) {
    host.classList.add('is-mobile');
    $('.stagewrap').appendChild(host);
    dropzone.setMobileCopy(true);
  } else {
    host.classList.remove('is-mobile');
    $('.topbar').insertBefore(host, $('.topbar-actions'));
    dropzone.setMobileCopy(false);
  }
  syncBatchCounts();
}
narrow.addEventListener('change', placeModeSwitch);

/* Tabs, used below 1280 only. The panels stay in the DOM at all widths. */
const tabs = Array.from(document.querySelectorAll('#tabstrip [role="tab"]'));
const wide = window.matchMedia('(min-width: 1280px)');
function selectTab(id) {
  for (const t of tabs) {
    const on = t.id === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    if (panel) panel.hidden = wide.matches ? false : !on;
  }
}
tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.id)));
function applyTabs() {
  if (wide.matches) {
    for (const t of tabs) document.getElementById(t.getAttribute('aria-controls')).hidden = false;
  } else {
    selectTab(tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.id || tabs[0].id);
  }
}
wide.addEventListener('change', applyTabs);

/* ---------------------------------------------------------------------- */
/* Boot                                                                     */
/* ---------------------------------------------------------------------- */

function installChecker() {
  const a = cssVar('--checker-a') || '#F2F1EF';
  const b = cssVar('--checker-b') || '#DCDAD6';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
    `<rect width="8" height="8" fill="${a}"/>` +
    `<rect width="4" height="4" fill="${b}"/>` +
    `<rect x="4" y="4" width="4" height="4" fill="${b}"/></svg>`;
  document.documentElement.style.setProperty(
    '--checker-img', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  );
}

async function boot() {
  document.body.dataset.mode = 'single';
  placeModeSwitch();
  applyTabs();
  picker.renderSelection();
  syncBlendHint();

  await mountForm();
  syncBatchCounts();
  syncExportButton();
  refreshNamePreview();

  // Controls whose geometry depends on layout get one settling pass once the
  // first real layout exists. They are already correct, this just makes sure
  // they are correct at the right size.
  requestAnimationFrame(() => {
    dial.set(dial.value, false);
    elevation.set(elevation.value, false);
    intensity.set(intensity.value, false);
    weave.apply(weave.woven ? 1 : 0);
  });

  // The calibration card is a development tool: a straight grid that must
  // bend visibly when the switch is thrown, and must be perfectly straight
  // when it is not.
  if (new URLSearchParams(location.search).get('calib') === '1') {
    const canvas = calibrationGrid();
    store.add([{
      id: 'calibration-grid', name: 'calibration-grid.png', fileBase: 'calibration-grid',
      source: canvas, width: canvas.width, height: canvas.height, aspect: 1,
      sample: true, soft: false
    }]);
  }

  // Warm the other five forms in the background so the picker shows real
  // renders rather than empty squares, without ever blocking the first paint.
  for (const form of FORMS) {
    if (form.id === state.formId) continue;
    await new Promise((r) => setTimeout(r, 60));
    try {
      await picker.ensureMaps(form);
      const cw = colorway(form, state.colorwayByForm[form.id] || form.defaultColorway);
      await picker.refreshThumb(form, cw);
    } catch (err) {
      // A single template failing to generate must not stop the others.
    }
  }
  // The oven's cached maps now belong to the last warmed form.
  oven._mapsKey = '';
}

boot();
