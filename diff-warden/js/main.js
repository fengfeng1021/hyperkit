/* main.js — boot、stage 切換、與所有面板的接線。
   這一頁沒有後端。key 只在 provider.js 裡被放進標頭，其他地方都不碰它。 */

import {
  supportsFSA, pickDirectory, pickViaInput, walk, permissionState, requestPermission,
  DEFAULT_EXCLUDES, validPattern,
} from './fs.js';
import { markBaseline, diffAgainst, importGraph, fmtWhen, fmtShort } from './baseline.js';
import * as store from './store.js';
import { PROVIDERS, findModel, money, PRICE_SOURCE, costOf } from './pricing.js';
import { estimate, planBatches, fmtK, fmtInt } from './budget.js';
import { streamReview, ProviderError, testKey, buildBody, previewBody } from './provider.js';
import { makeFingerprint, filePattern, ruleFor, normalizeMessage } from './fingerprint.js';
import { Strip, sevLabel, sevRank } from './strip.js';
import { verify, sortDefects, renderDefect, excerptNode, defectText, isCross } from './defects.js';
import { buildMarkdown, downloadMarkdown, downloadJSON, copyText } from './report.js';
import { SAMPLE_PROJECT, SAMPLE_FILES, SAMPLE_DEFECTS, SAMPLE_RUNS, SAMPLE_USAGE } from './sample.js';

const $ = (id) => document.getElementById(id);
const body = document.body;

/* ------------------------------------------------------------------ motion
   動效層是可拆的。這個物件是它唯一的接點：js/motion.js 會把 driver 掛上來，
   沒掛上（GSAP 沒載到、prefers-reduced-motion、檔案被擋）時每一個呼叫點都走
   下面那條同步的預設路徑，畫面照樣完整。 */

const W = (window.warden = {
  strip: null,
  hooks: {},          // onStrike / onListRendered / onRulesRendered / onFinish / onSupOpen
  stageDriver: null,  // (stage, apply) => void
  progressDriver: null,
  replayDriver: null, // (list, emit, done) => void
});

function fire(name, arg) {
  const fn = W.hooks[name];
  if (typeof fn === 'function') { try { fn(arg); } catch (err) { console.error(err); } }
}

/* ------------------------------------------------------------------ state */

const S = {
  specimen: null,
  entries: [],
  excluded: 0,
  skipped: 0,
  excludes: [...DEFAULT_EXCLUDES],
  baseline: null,
  changed: [],
  plan: [],
  fileMap: new Map(),
  defects: [],
  suppressed: [],
  rules: [],
  runs: [],
  provider: 'anthropic',
  model: '',
  budget: 60000,
  demo: false,
  running: false,
  abort: null,
  lastUsage: null,
  lastCost: 0,
  lastEstimate: null,
  scanning: false,
  focusIndex: -1,
  filter: '',
  crossOnly: false,
  sort: 'default',
  openExcerpts: new Set(),
};

let strip = null;

/* ------------------------------------------------------------------- boot */

async function boot() {
  strip = new Strip($('strip'));
  W.strip = strip;
  strip.onSelect = (d) => focusDefectById(d.id);
  strip.onHover = (d) => hotRow(d ? d.id : null);

  S.provider = store.settings.provider();
  S.budget = store.settings.budget();
  fillModels();
  wire();
  detectSupport();
  renderBudget();

  try {
    S.rules = await store.listRules(false);
    S.runs = await store.listRuns(false);
  } catch (err) { storageFault(err); }
  renderRules();
  renderHistory();
  renderStatus();

  const lastId = store.settings.lastSpecimen();
  if (lastId) {
    let rec = null;
    try { rec = await store.get('specimens', lastId); } catch { rec = null; }
    if (rec && rec.handle) {
      const spec = { id: rec.id, name: rec.name, kind: rec.kind, handle: rec.handle };
      const perm = await permissionState(spec);
      if (perm === 'granted') {
        setStage('deck');
        await applySpecimen(spec, true);
        return;
      }
      if (perm === 'prompt' || perm === 'denied') {
        S.specimen = spec;
        setStage('deck');
        renderSpecimenRecord();
        specimenFault(perm);
        await loadBaselineFor(spec.id);
        renderBaseline();
        renderPrep();
        return;
      }
    }
  }
  setStage('bed');
}

function detectSupport() {
  const ok = supportsFSA();
  const chip = $('chip-support');
  chip.textContent = ok ? '持久授權可用' : '單次選取模式';
  chip.dataset.on = ok ? '1' : '0';
  $('bed-cap').textContent = ok
    ? 'File System Access API 可用，資料夾授權可以續用，第二次回來直接進工作台。'
    : '這個瀏覽器沒有 File System Access API，所以無法記住資料夾授權。功能完整，只是每次回來都要重選一次資料夾。基準線與判讀規則仍會保留在本機。';
}

function setStage(stage) {
  if (body.dataset.stage === stage) return;
  const apply = () => {
    body.dataset.stage = stage;
    if (stage === 'deck') requestAnimationFrame(() => strip && strip.draw());
  };
  if (W.stageDriver) W.stageDriver(stage, apply);
  else apply();
}

function setScanProgress(p) {
  if (W.progressDriver) W.progressDriver(p);
  else strip.setProgress(p);
}

/* ------------------------------------------------------------- specimen */

async function pickFolder() {
  try {
    const spec = supportsFSA() ? await pickDirectory() : await pickViaInput();
    if (!spec) return;
    if (S.demo) await leaveDemo(false);
    setStage('deck');
    await applySpecimen(spec, false);
  } catch (err) {
    if (err && err.name === 'AbortError') return;   // 使用者取消挑選器，不是失敗
    live('無法開啟資料夾：' + (err && err.message ? err.message : String(err)));
  }
}

async function applySpecimen(spec, restored) {
  if (W.cancelReplay) W.cancelReplay();
  S.specimen = spec;
  S.demo = false;
  body.dataset.demo = 'false';
  $('demo-band').hidden = true;
  clearFault('main-fault');
  clearFault('specimen');

  const saved = store.settings.excludes(spec.id);
  S.excludes = saved && saved.length ? saved : [...DEFAULT_EXCLUDES];
  renderExcludes();

  if (spec.kind === 'fsa') {
    try {
      await store.put('specimens', {
        id: spec.id, name: spec.name, handle: spec.handle, kind: spec.kind,
        createdAt: Date.now(), lastOpenedAt: Date.now(),
      });
      store.settings.setLastSpecimen(spec.id);
    } catch (err) { storageFault(err); }
  }

  await loadBaselineFor(spec.id);
  await rescan();
  renderBaseline();
  renderSpecimenRecord();
  renderPrep();
  if (restored) live(`已續用上次的資料夾 ${spec.name}`);
}

async function loadBaselineFor(id) {
  try { S.baseline = await store.get('baselines', id) || null; }
  catch { S.baseline = null; }
}

async function rescan() {
  if (!S.specimen) return;
  $('specimen-name').textContent = S.specimen.name;
  live('讀取資料夾…');
  try {
    const r = await walk(S.specimen, S.excludes, (seen) => {
      $('specimen-meta').textContent = `讀取中 ${fmtInt(seen)}`;
      live(`讀取資料夾 ${fmtInt(seen)}`);
    });
    S.entries = r.entries;
    S.excluded = r.excluded;
    S.skipped = r.skipped;
    $('specimen-meta').textContent =
      `${fmtInt(r.entries.length)} 個可讀檔案　已排除 ${fmtInt(r.excluded)}　跳過 ${fmtInt(r.skipped)}（二進位或過大）`;
    live('閒置');
    if (!r.entries.length) emptyFolderFault();
  } catch (err) {
    if (err && err.name === 'NotAllowedError') { specimenFault('prompt'); return; }
    live('讀取失敗：' + (err.message || err));
  }
  renderSpecimenRecord();
  updateGate();
}

/* ------------------------------------------------------------- baseline */

async function doBaseline() {
  if (!S.specimen || !S.entries.length || S.scanning) return;
  S.scanning = true;
  const btn = $('btn-baseline');
  const ctrl = new AbortController();
  S.abort = ctrl;
  btn.dataset.busy = '1';
  try {
    const bl = await markBaseline(S.entries, (i, n) => {
      btn.textContent = `雜湊中 ${fmtInt(i)} / ${fmtInt(n)}`;
      live(`計算基準線 ${fmtInt(i)} / ${fmtInt(n)}`);
    }, ctrl.signal);
    bl.specimenId = S.specimen.id;
    await store.put('baselines', bl);
    S.baseline = bl;
    S.changed = [];
    S.plan = [];
    live(`基準線已標記，${fmtInt(Object.keys(bl.files).length)} 個檔案`);
  } catch (err) {
    if (err && err.name === 'AbortError') live('已取消，保留舊的基準線');
    else if (err && err.name === 'NotAllowedError') specimenFault('prompt');
    else storageFault(err);
  } finally {
    S.scanning = false;
    S.abort = null;
    btn.dataset.busy = '0';
    btn.textContent = '標記基準線';
    renderBaseline();
    renderStatus();
    renderPrep();
    updateGate();
  }
}

async function doDiff() {
  if (!S.baseline || !S.entries.length || S.scanning) return;
  S.scanning = true;
  const btn = $('btn-diff');
  const ctrl = new AbortController();
  S.abort = ctrl;
  btn.dataset.busy = '1';
  try {
    const r = await diffAgainst(S.baseline, S.entries, (i, n) => {
      btn.textContent = `掃描中 ${fmtInt(i)} / ${fmtInt(n)}`;
      live(`比對變動 ${fmtInt(i)} / ${fmtInt(n)}`);
    }, ctrl.signal);
    S.changed = r.changed;
    S.fileMap = new Map(r.changed.map((f) => [f.path, { text: f.text, lines: (f.text.match(/\n/g) || []).length + 1 }]));
    recomputePlan();
    live(r.changed.length
      ? `${r.changed.length} 個檔案有變動`
      : '自基準線以來沒有檔案變動');
    if (!r.changed.length) noChangeFault();
    else clearFault('main-fault');
  } catch (err) {
    if (err && err.name === 'AbortError') live('已取消掃描');
    else if (err && err.name === 'NotAllowedError') specimenFault('prompt');
    else live('掃描失敗：' + (err.message || err));
  } finally {
    S.scanning = false;
    S.abort = null;
    btn.dataset.busy = '0';
    btn.textContent = '掃描變動';
    renderBaseline();
    updateGate();
  }
}

function renderBaseline() {
  $('baseline-when').textContent = S.baseline
    ? `已標記 ${fmtWhen(S.baseline.markedAt)}　${fmtInt(Object.keys(S.baseline.files).length)} 檔`
    : '尚未標記';
  const bDiff = $('btn-diff');
  const note = $('baseline-note');
  if (!S.baseline) {
    bDiff.setAttribute('aria-disabled', 'true');
    note.textContent = '尚未標記基準線，掃描變動不能按';
  } else {
    bDiff.removeAttribute('aria-disabled');
    note.textContent = S.changed.length
      ? `${S.changed.length} 個檔案自基準線以來有變動`
      : '按「掃描變動」比對現況';
  }
  $('btn-baseline').textContent = S.baseline ? '重新標記基準線' : '標記基準線';
}

/* -------------------------------------------------------------- excludes */

function renderExcludes() {
  const wrap = $('exclude-chips');
  wrap.textContent = '';
  S.excludes.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'xchip';
    b.append(document.createTextNode(p));
    b.insertAdjacentHTML('beforeend',
      '<svg class="ic" aria-hidden="true"><use href="#i-x"/></svg>');
    b.setAttribute('aria-label', `刪除排除規則 ${p}`);
    b.addEventListener('click', () => removeExclude(i));
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeExclude(i); }
    });
    b.addEventListener('dblclick', () => editExclude(i, b));
    wrap.appendChild(b);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'xchip xchip-add';
  add.insertAdjacentHTML('beforeend', '<svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg>');
  add.append(document.createTextNode('新增'));
  add.addEventListener('click', () => editExclude(-1, add));
  wrap.appendChild(add);

  $('exclude-note').textContent = S.excludes.length
    ? `${S.excludes.length} 條規則。改動後檔案計數會立刻重算。`
    : '沒有排除規則，將讀取整個資料夾（可能很慢）';
}

function editExclude(index, anchor) {
  const input = document.createElement('input');
  input.className = 'xchip-in';
  input.value = index >= 0 ? S.excludes[index] : '';
  input.placeholder = 'dist/ 或 *.min.js';
  anchor.replaceWith(input);
  input.focus();
  input.select();
  const err = document.createElement('p');
  err.className = 'note';

  const commit = async () => {
    const v = input.value.trim();
    if (!v) { renderExcludes(); return; }
    if (!validPattern(v)) {
      input.dataset.bad = '1';
      err.textContent = '這不是有效的路徑樣式，例如 dist/ 或 *.min.js';
      if (!err.isConnected) input.after(err);
      input.focus();
      return;
    }
    if (index >= 0) S.excludes[index] = v; else S.excludes.push(v);
    persistExcludes();
    renderExcludes();
    await rescan();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); renderExcludes(); }
  });
  input.addEventListener('blur', () => { if (input.isConnected) commit(); });
}

async function removeExclude(i) {
  S.excludes.splice(i, 1);
  persistExcludes();
  renderExcludes();
  await rescan();
}

function persistExcludes() {
  if (S.specimen) store.settings.setExcludes(S.specimen.id, S.excludes);
}

/* -------------------------------------------------------- provider / key */

function fillModels() {
  const p = PROVIDERS[S.provider];
  const sel = $('in-model');
  sel.textContent = '';
  p.models.forEach((m) => {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.label;
    sel.appendChild(o);
  });
  const saved = store.settings.model(S.provider);
  S.model = saved && p.models.some((m) => m.id === saved) ? saved : p.models[0].id;
  sel.value = S.model;

  document.querySelectorAll('#seg-provider .seg-b').forEach((b) => {
    b.setAttribute('aria-checked', b.dataset.provider === S.provider ? 'true' : 'false');
  });
  $('in-key').value = store.settings.key(S.provider);
  $('key-note').textContent = `存在這台電腦的 localStorage，只會送到 ${p.host}`;
  renderPrice();
  updateKeyChip();
}

function renderPrice() {
  const m = findModel(S.provider, S.model);
  $('price-note').textContent =
    `輸入 $${m.in.toFixed(2)} / 輸出 $${m.out.toFixed(2)} 每百萬 token${m.note ? '。' + m.note : ''}`;
  $('price-src').textContent = PRICE_SOURCE;
}

function updateKeyChip() {
  const key = $('in-key').value.trim();
  const chip = $('chip-key');
  if (key) {
    chip.textContent = `${PROVIDERS[S.provider].label} 已設定`;
    chip.dataset.on = '1';
  } else {
    chip.textContent = '未設定 API key';
    chip.dataset.on = '0';
  }
}

async function doTestKey() {
  const key = $('in-key').value.trim();
  const btn = $('btn-testkey');
  if (!key) { $('key-note').textContent = '先填入 API key 再測試'; return; }
  btn.dataset.busy = '1';
  btn.textContent = '連線中';
  try {
    await testKey({ provider: S.provider, model: S.model, key });
    $('key-note').textContent = `已驗證，${S.model} 可用`;
    clearFault('scan');
  } catch (err) {
    keyFault(err);
  } finally {
    btn.dataset.busy = '0';
    btn.textContent = '測試連線';
  }
}

/* ------------------------------------------------------------ plan / budget */

function recomputePlan() {
  if (!S.changed.length) { S.plan = []; renderPlan(); return; }
  const planned = planBatches(S.changed, S.budget);
  S.plan = planned.map((p) => ({ ...p, selected: p.batch === 1 }));
  renderPlan();
}

function selectedFiles() {
  return S.plan.filter((f) => f.selected);
}

function renderPlan() {
  const tb = $('ftbody');
  tb.textContent = '';
  S.plan.forEach((f, i) => {
    const tr = document.createElement('tr');
    tr.dataset.on = f.selected ? '1' : '0';
    if (f.batch !== 1) tr.dataset.over = '1';

    const c1 = document.createElement('td');
    c1.className = 'c-chk';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = f.selected;
    cb.setAttribute('aria-label', `送出 ${f.path}`);
    cb.addEventListener('change', () => {
      S.plan[i].selected = cb.checked;
      tr.dataset.on = cb.checked ? '1' : '0';
      renderBudget();
      renderStripFiles();
      updateGate();
    });
    c1.appendChild(cb);

    const c2 = document.createElement('td');
    c2.className = 'f-path';
    c2.textContent = f.path;

    const c3 = document.createElement('td');
    c3.className = 'c-num';
    c3.textContent = f.status === 'new'
      ? `+${fmtInt(f.addedLines)}`
      : `+${fmtInt(f.addedLines)} / -${fmtInt(f.removedLines)}`;

    const c4 = document.createElement('td');
    c4.className = 'f-why';
    c4.textContent = f.why;
    if (f.oversize) {
      // 不靜默截斷，也不靜默跳過：給一條真的能走的復原路徑
      const fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'btn btn-xs btn-ghost';
      fix.textContent = '加進排除規則';
      fix.addEventListener('click', async () => {
        const pat = f.path.split('/').pop();
        if (!S.excludes.includes(pat)) S.excludes.push(pat);
        persistExcludes();
        renderExcludes();
        await rescan();
        S.changed = S.changed.filter((c) => c.path !== f.path);
        recomputePlan();
        live(`已把 ${pat} 加進排除規則`);
      });
      c4.append(' ', fix);
    }

    const c5 = document.createElement('td');
    c5.className = 'c-num';
    c5.textContent = fmtK(f.tokens);

    tr.append(c1, c2, c3, c4, c5);
    tb.appendChild(tr);
  });

  $('ftable-foot').textContent = S.excluded
    ? `另有 ${fmtInt(S.excluded)} 個檔案被排除規則濾掉，${fmtInt(S.skipped)} 個因為是二進位或超過 1 MB 而跳過。`
    : '';
  renderBudget();
  renderStripFiles();
}

function renderBudget() {
  const sel = selectedFiles();
  const est = estimate(sel, S.provider, S.model);
  S.lastEstimate = est;
  const batches = new Set(S.plan.filter((f) => f.batch > 0).map((f) => f.batch)).size || 0;
  $('ro-tokens').textContent = fmtInt(est.total);
  $('ro-cost').textContent = money(est.cost);
  $('ro-batch').textContent = String(Math.max(batches, sel.length ? 1 : 0));
  $('ro-files').textContent = String(sel.length);
  $('filepick-sum').textContent = S.plan.length
    ? `${S.plan.length} 選 ${sel.length}　${fmtK(est.total)} token`
    : '';
  const pct = (S.budget - 20000) / (200000 - 20000);
  $('budget-cursor').style.left = (pct * 100) + '%';
  updateGate();
}

function renderStripFiles() {
  if (S.demo) return;
  const files = selectedFiles().map((f) => ({
    path: f.path, size: f.size,
    lines: (S.fileMap.get(f.path) || {}).lines || Math.max(1, Math.round(f.size / 40)),
  }));
  strip.setFiles(files);
  $('strip-empty').hidden = files.length > 0 && S.defects.length > 0;
  $('strip-empty').textContent = files.length ? '已就位，尚未掃描' : '尚未掃描';
}

function updateGate() {
  const btn = $('btn-review');
  const note = $('review-note');
  if (S.running) return;
  const key = $('in-key').value.trim();
  const sel = selectedFiles();
  let reason = '';
  if (!S.specimen && !S.demo) reason = '尚未選擇資料夾';
  else if (!key) reason = '尚未填入 API key';
  else if (!sel.length) reason = S.changed.length ? '沒有選中任何檔案' : '先按「掃描變動」找出有變動的檔案';
  if (reason) {
    btn.setAttribute('aria-disabled', 'true');
    note.textContent = reason;
  } else {
    btn.removeAttribute('aria-disabled');
    note.textContent = `送出 ${sel.length} 個檔案，估 ${money(S.lastEstimate ? S.lastEstimate.cost : 0)}`;
  }
}

/* ---------------------------------------------------------------- review */

async function doReview() {
  if ($('btn-review').getAttribute('aria-disabled') === 'true') return;
  if (S.running) { cancelReview(); return; }

  const key = $('in-key').value.trim();
  const sel = selectedFiles();
  const files = sel.map((f) => ({ path: f.path, text: (S.fileMap.get(f.path) || {}).text || '' }));
  const edges = importGraph(files.map((f) => ({ path: f.path, text: f.text })));
  const sent = new Set(files.map((f) => f.path));

  S.running = true;
  S.defects = [];
  S.suppressed = [];
  S.openExcerpts.clear();
  strip.setDefects([]);
  setScanProgress(0);
  $('strip-empty').hidden = true;
  $('prep-panel').hidden = true;
  clearFault('main-fault');
  renderDefects();

  const btn = $('btn-review');
  btn.textContent = `審查中 0/${files.length}`;
  btn.dataset.busy = '1';
  $('review-note').textContent = '按此取消，已收到的缺陷會保留';
  live(`審查中，送出 ${files.length} 個檔案`);

  const ctrl = new AbortController();
  S.abort = ctrl;

  const expected = S.lastEstimate ? S.lastEstimate.outTok * 4 : 8000;
  let chars = 0;
  let found = 0;

  try {
    const res = await streamReview({
      provider: S.provider, model: S.model, key, files, edges,
      note: S.baseline ? `這些檔案自 ${fmtWhen(S.baseline.markedAt)} 的基準線以來有變動。` : '',
      signal: ctrl.signal,
      onChunk: (n) => {
        chars += n;
        setScanProgress(Math.min(0.98, chars / Math.max(expected, 1)));
      },
      onDefect: (raw) => {
        found += 1;
        btn.textContent = `審查中 ${Math.min(found, files.length)}/${files.length}`;
        acceptDefect(raw, S.fileMap, sent);
      },
    });
    await finishRun(res, files, sent);
  } catch (err) {
    setScanProgress(null);
    if (err instanceof ProviderError && err.kind === 'aborted') {
      live(`已取消，已收到 ${S.defects.length} 條`);
      mainFault('已取消這次審查', `已收到的 ${S.defects.length} 條缺陷保留在畫面上，可以照常匯出。探傷帶上未掃到的欄位維持暗色。`, [
        { label: '重新審查', act: () => doReview() },
      ]);
    } else {
      reviewFault(err);
    }
    await afterRun(null, files, sent, true);
  }
}

function cancelReview() {
  if (S.abort) S.abort.abort();
}

function acceptDefect(raw, fileMap, sent) {
  const d = verify(raw, fileMap, sent);
  const hit = ruleFor(d, S.rules);
  if (hit) {
    S.suppressed.push({ defect: d, rule: hit });
    store.bumpRule(hit.fingerprint, Date.now()).then((r) => {
      if (r) {
        const i = S.rules.findIndex((x) => x.fingerprint === r.fingerprint);
        if (i >= 0) S.rules[i] = r;
        renderRules();
      }
    }).catch(() => {});
    renderSuppressed();
    return;
  }
  S.defects.push(d);
  strip.addStrike(d);
  renderDefects();
  // 招牌時刻：圈記、引線、缺陷列落定，全部掛在這一條上（js/motion.js）
  fire('onStrike', d);
}

async function finishRun(res, files, sent) {
  S.lastUsage = res.usage;
  const est = S.lastEstimate;
  const inTok = res.usage.inTok || (est ? est.inTok : 0);
  const outTok = res.usage.outTok || (est ? est.outTok : 0);
  S.lastCost = costOf(S.provider, S.model, inTok, outTok);

  let msg = `已完成，${S.defects.length} 條，實際 ${money(S.lastCost)}`;
  if (est && inTok) {
    const diff = Math.round(((inTok - est.inTok) / Math.max(est.inTok, 1)) * 100);
    msg += `（估 ${fmtK(est.inTok)} / 實際 ${fmtK(inTok)} 輸入 token，${diff >= 0 ? '高' : '低'} ${Math.abs(diff)}%）`;
  }
  live(msg);

  if (res.truncated) {
    mainFault('這一批的輸出被長度上限截斷',
      `已收到 ${S.defects.length} 條。把預算調低讓它分成兩批重跑，通常就能拿到完整的清單。`,
      [{ label: '重新審查', act: () => doReview() }]);
  } else if (res.salvaged) {
    mainFault('這一批的回覆格式不完整',
      `已從串流中救回 ${S.defects.length} 條完整的缺陷，剩下的部分格式壞掉無法解析。`,
      [{ label: '重跑這一批', act: () => doReview() }]);
  } else if (!S.defects.length && !S.suppressed.length) {
    zeroDefectPanel(files, inTok, outTok);
  }

  await afterRun({ inTok, outTok }, files, sent, false);
}

async function afterRun(usage, files, sent, aborted) {
  S.running = false;
  S.abort = null;
  const btn = $('btn-review');
  btn.dataset.busy = '0';
  btn.textContent = '重新審查';
  updateGate();
  if (!aborted) {
    $('review-note').textContent = `上次 ${S.defects.length} 條，${money(S.lastCost)}`;
  }
  strip.setDefects(S.defects);
  renderDefects();
  renderSuppressed();

  if (!aborted || S.defects.length) {
    const run = {
      id: 'run:' + Date.now(),
      specimenId: S.specimen ? S.specimen.id : 'demo',
      at: Date.now(),
      model: S.model,
      provider: S.provider,
      count: S.defects.length,
      suppressed: S.suppressed.length,
      cost: S.lastCost,
      usage: usage || null,
      demo: S.demo,
      defects: S.defects,
      sent: files.map((f) => f.path),
    };
    try {
      const dropped = await store.saveRun(run);
      S.runs = await store.listRuns(S.demo);
      if (dropped) live(`已自動清除 ${dropped} 份最舊的歷史報告（上限 ${store.RUN_LIMIT} 次）`);
    } catch (err) { storageFault(err); }
    renderHistory();
    renderStatus();
  }
  checkStorage();

  if (W.hooks.onFinish) fire('onFinish', { aborted, count: S.defects.length });
  else strip.setProgress(null);
}

/* ---------------------------------------------------------------- defects */

function renderDefects() {
  const list = $('defect-list');
  let arr = sortDefects(S.defects, S.sort);
  if (S.crossOnly) arr = arr.filter(isCross);
  if (S.filter) {
    const q = S.filter.toLowerCase();
    arr = arr.filter((d) => (d.file + ' ' + d.title + ' ' + d.why + ' ' + d.category).toLowerCase().includes(q));
  }
  list.textContent = '';
  arr.forEach((d) => {
    const li = renderDefect(d, {
      toggleExcerpt: (dd, node, btn) => {
        const open = S.openExcerpts.has(dd.id);
        if (open) {
          S.openExcerpts.delete(dd.id);
          const ex = node.querySelector('.code');
          if (ex) ex.remove();
          btn.textContent = '展開節錄';
        } else {
          S.openExcerpts.add(dd.id);
          node.querySelector('div').appendChild(excerptNode(dd));
          btn.textContent = '收合節錄';
        }
      },
      dismiss: (dd, node) => openConfirm(dd, node),
      copy: async (dd, btn) => {
        const ok = await copyText(defectText(dd));
        btn.lastChild.textContent = ok ? '已複製' : '複製失敗';
        setTimeout(() => { btn.lastChild.textContent = '複製'; }, 1600);
      },
    });
    if (S.openExcerpts.has(d.id) && d.excerpt) li.querySelector('div').appendChild(excerptNode(d));
    list.appendChild(li);
  });
  $('defect-count').textContent = String(arr.length);
  $('defect-empty').hidden = arr.length > 0 || (!S.defects.length && !S.running && !S.demo && !hasResult());
  if (arr.length === 0 && S.defects.length > 0) {
    $('defect-empty').hidden = false;
    $('defect-empty').querySelector('.empty-h').textContent = '篩選後沒有符合的缺陷';
    $('defect-empty').querySelector('.empty-b').textContent = '清空篩選欄或關掉「只看跨檔案」。';
  } else if (!S.defects.length) {
    $('defect-empty').hidden = false;
    $('defect-empty').querySelector('.empty-h').textContent = '還沒有掃描結果';
    $('defect-empty').querySelector('.empty-b').textContent =
      '左邊架上一個資料夾、標記基準線、按「開始審查」。沒有 API key 的話，先按上方的「看範例報告」。';
  } else {
    $('defect-empty').hidden = true;
  }
  $('btn-export').setAttribute('aria-disabled', S.defects.length ? 'false' : 'true');
  const first = list.querySelector('.drow');
  if (first) first.tabIndex = 0;
  S.focusIndex = -1;
  fire('onListRendered');
}

function hasResult() { return S.defects.length > 0 || S.suppressed.length > 0; }

function hotRow(id) {
  document.querySelectorAll('.drow[data-hot]').forEach((n) => delete n.dataset.hot);
  if (!id) return;
  const n = document.querySelector(`.drow[data-id="${id}"]`);
  if (n) n.dataset.hot = '1';
}

function focusDefectById(id) {
  const n = document.querySelector(`.drow[data-id="${id}"]`);
  if (!n) return;
  n.scrollIntoView({ block: 'center', behavior: 'smooth' });
  n.tabIndex = 0;
  n.focus();
}

/* ------------------------------------------------------- dismiss / rules */

function openConfirm(d, node) {
  if (node.querySelector('.confirm')) return;
  const pat = filePattern(d.file);
  const box = document.createElement('div');
  box.className = 'confirm';
  box.innerHTML = `
    <p class="confirm-h">建立判讀規則：類別 + 訊息樣式 + 檔案樣式</p>
    <label><input type="checkbox" checked data-k="cat"> 這個類別　<code>${escapeHtml(d.category)}</code></label>
    <label><input type="checkbox" checked data-k="msg"> 相似的訊息　<code>${escapeHtml(normalizeMessage(d.title + ' ' + d.why).slice(0, 60))}</code></label>
    <label><input type="checkbox" data-k="path"> 只在這個路徑　<code>${escapeHtml(pat)}</code>（不勾 = 整個試件都套用）</label>
    <p class="note" data-preview></p>`;
  const acts = document.createElement('div');
  acts.className = 'row-btns';
  const ok = document.createElement('button');
  ok.type = 'button'; ok.className = 'btn btn-xs btn-primary'; ok.textContent = '建立規則';
  const no = document.createElement('button');
  no.type = 'button'; no.className = 'btn btn-xs btn-ghost'; no.textContent = '取消';
  acts.append(ok, no);
  box.appendChild(acts);
  node.querySelector('div').appendChild(box);

  const read = () => ({
    category: box.querySelector('[data-k="cat"]').checked ? d.category : '',
    messagePattern: box.querySelector('[data-k="msg"]').checked ? normalizeMessage(d.title + ' ' + d.why) : '',
    filePattern: box.querySelector('[data-k="path"]').checked ? pat : '',
  });
  const preview = () => {
    const draft = read();
    const n = S.defects.filter((x) => ruleFor(x, [{ ...draft, fingerprint: 'draft' }])).length;
    box.querySelector('[data-preview]').textContent =
      `這條規則會擋掉本次結果裡的 ${n} 條（含這一條）。`;
  };
  box.querySelectorAll('input').forEach((i) => i.addEventListener('change', preview));
  preview();

  no.addEventListener('click', () => box.remove());
  ok.addEventListener('click', async () => {
    const draft = read();
    const { fingerprint } = await makeFingerprint({
      category: draft.category, message: draft.messagePattern, pattern: draft.filePattern,
    });
    const rule = {
      fingerprint,
      name: draft.category || d.title.slice(0, 20),
      category: draft.category,
      messagePattern: draft.messagePattern,
      filePattern: draft.filePattern,
      hits: 1,
      createdAt: Date.now(),
      lastHitAt: Date.now(),
      isNew: true,
      demo: S.demo,
    };
    try { await store.saveRule(rule); } catch (err) { storageFault(err); }
    S.rules.unshift(rule);
    const moved = S.defects.filter((x) => ruleFor(x, [rule]));
    S.defects = S.defects.filter((x) => !moved.includes(x));
    moved.forEach((m) => S.suppressed.push({ defect: m, rule }));
    strip.setDefects(S.defects);
    renderRules();
    renderDefects();
    renderSuppressed();
    renderStatus();
    live(`已建立判讀規則，本次略過 ${moved.length} 條`);
  });
  ok.focus();
}

function renderSuppressed() {
  const wrap = $('suppressed');
  if (!S.suppressed.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  $('sup-rules').textContent = String(S.rules.length);
  $('sup-count').textContent = String(S.suppressed.length);
  const ul = $('sup-body');
  ul.textContent = '';
  S.suppressed.forEach((s, i) => {
    const li = document.createElement('li');
    const t = document.createElement('span');
    t.textContent = `${s.defect.file}:${s.defect.line}　${s.defect.title}`;
    const by = document.createElement('span');
    by.className = 'sup-by';
    by.textContent = `被規則「${s.rule.name}」擋下`;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-xs btn-ghost';
    b.insertAdjacentHTML('beforeend', '<svg class="ic" aria-hidden="true"><use href="#i-restore"/></svg>');
    b.append(document.createTextNode('回收'));
    b.addEventListener('click', () => {
      S.suppressed.splice(i, 1);
      S.defects.push(s.defect);
      strip.setDefects(S.defects);
      renderDefects();
      renderSuppressed();
      live(`已回收 1 條缺陷`);
    });
    li.append(t, by, b);
    ul.appendChild(li);
  });
}

function renderRules() {
  const list = $('rules-list');
  list.textContent = '';
  $('rules-count').textContent = String(S.rules.length);
  $('chip-assets').textContent = `規則 ${S.rules.length}`;
  $('chip-assets').dataset.on = S.rules.length ? '1' : '0';
  $('rules-empty').hidden = S.rules.length > 0;
  $('rules-nth').textContent = `現在是第 ${S.runs.length + 1} 次。`;

  S.rules.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'rule-row';
    row.dataset.fp = r.fingerprint || '';
    if (r.isNew) row.dataset.new = '1';
    const top = document.createElement('div');
    top.className = 'rule-top';
    const nm = document.createElement('span');
    nm.className = 'rule-name'; nm.textContent = r.name || '未命名規則';
    const hits = document.createElement('span');
    hits.className = 'rule-hits'; hits.textContent = `命中 ${r.hits || 0}`;
    top.append(nm, hits);
    const fp = document.createElement('p');
    fp.className = 'rule-fp';
    fp.textContent = (r.messagePattern || '（任何訊息）').slice(0, 60);
    const when = document.createElement('p');
    when.className = 'rule-when';
    when.textContent = `${r.filePattern || '整個試件'}　最後 ${fmtShort(r.lastHitAt)}`;
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'icon-btn rule-del';
    del.setAttribute('aria-label', `刪除規則 ${r.name}`);
    del.insertAdjacentHTML('beforeend', '<svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg>');
    del.addEventListener('click', () => confirmDeleteRule(r, row));
    row.append(top, fp, when, del);
    list.appendChild(row);
  });
  fire('onRulesRendered');
}

function confirmDeleteRule(rule, row) {
  if (row.querySelector('.row-btns')) return;
  const box = document.createElement('div');
  box.className = 'row-btns';
  const y = document.createElement('button');
  y.type = 'button'; y.className = 'btn btn-xs btn-ghost'; y.textContent = '確定刪除';
  const n = document.createElement('button');
  n.type = 'button'; n.className = 'btn btn-xs btn-ghost'; n.textContent = '取消';
  box.append(y, n);
  row.appendChild(box);
  n.addEventListener('click', () => box.remove());
  y.addEventListener('click', async () => {
    try { await store.del('rules', rule.fingerprint); } catch (err) { storageFault(err); }
    S.rules = S.rules.filter((x) => x.fingerprint !== rule.fingerprint);
    renderRules();
    renderStatus();
    live('已刪除 1 條判讀規則');
  });
  y.focus();
}

async function exportRules() {
  const payload = {
    format: 'diff-warden-rules',
    version: 1,
    exportedAt: new Date().toISOString(),
    rules: S.rules.map(({ isNew, ...r }) => r),
  };
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  downloadJSON(payload, `diff-warden-rules-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`);
  $('rules-note').textContent = `已匯出 ${S.rules.length} 條規則。`;
}

async function importRules(file) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { $('rules-note').textContent = '這不是有效的 JSON 檔。'; return; }
  if (!data || data.format !== 'diff-warden-rules' || !Array.isArray(data.rules)) {
    $('rules-note').textContent = '格式不符：需要 format 為 diff-warden-rules 的檔案。';
    return;
  }
  let added = 0;
  let merged = 0;
  for (const r of data.rules) {
    if (!r || !r.fingerprint) continue;
    const exist = S.rules.find((x) => x.fingerprint === r.fingerprint);
    if (exist) {
      exist.hits = (exist.hits || 0) + (r.hits || 0);
      exist.lastHitAt = Math.max(exist.lastHitAt || 0, r.lastHitAt || 0);
      try { await store.saveRule(exist); } catch (err) { storageFault(err); }
      merged += 1;
    } else {
      const rule = { ...r, demo: S.demo };
      try { await store.saveRule(rule); } catch (err) { storageFault(err); }
      S.rules.unshift(rule);
      added += 1;
    }
  }
  renderRules();
  renderStatus();
  $('rules-note').textContent = `匯入 ${added + merged} 條，其中 ${merged} 條已存在，已合併。`;
}

/* ---------------------------------------------------------------- history */

function renderHistory() {
  const wrap = $('hist');
  wrap.textContent = '';
  const runs = S.demo ? SAMPLE_RUNS : S.runs;
  if (!runs.length) {
    wrap.className = 'hist hist-empty';
    $('hist-note').textContent = '第一次審查後，這裡會開始記錄';
    return;
  }
  wrap.className = 'hist';
  const max = Math.max(...runs.map((r) => (r.count || 0) + (r.suppressed || 0)), 1);
  const shown = runs.slice(-12);
  shown.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hist-b';
    const total = (r.count || 0) + (r.suppressed || 0);
    const bar = document.createElement('i');
    bar.style.height = ((r.count || 0) / max * 100) + '%';
    const sup = document.createElement('i');
    sup.className = 'sup';
    sup.style.height = ((r.suppressed || 0) / max * 100) + '%';
    b.append(bar, sup);
    b.title = `${fmtShort(r.at)}　${r.count} 條　略過 ${r.suppressed}　${money(r.cost || 0)}　${r.model || ''}`;
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => loadRun(r));
    wrap.appendChild(b);
  });

  const oldAxis = wrap.parentNode.querySelector('.hist-x');
  if (oldAxis) oldAxis.remove();
  const xs = document.createElement('div');
  xs.className = 'hist-x';
  const a = document.createElement('span');
  a.textContent = fmtShort(shown[0].at);
  const z = document.createElement('span');
  z.textContent = fmtShort(shown[shown.length - 1].at);
  xs.append(a, z);
  wrap.after(xs);

  const first = runs[0];
  const last = runs[runs.length - 1];
  $('hist-note').textContent = runs.length === 1
    ? '只有一次紀錄，再跑一次就能比較'
    : `第 1 次 ${first.count} 條 → 第 ${runs.length} 次 ${last.count} 條${S.demo ? '（範例）' : ''}`;
}

function loadRun(run) {
  if (!run.defects || !run.defects.length) { live('這次紀錄沒有存下缺陷內容'); return; }
  S.defects = run.defects;
  S.suppressed = [];
  strip.setFiles((run.sent || []).map((p) => ({ path: p, size: 2000, lines: 120 })));
  strip.setDefects(S.defects);
  renderDefects();
  renderSuppressed();
  live(`已載入 ${fmtWhen(run.at)} 的報告，${run.count} 條`);
}

/* ------------------------------------------------------------------ prep */

function renderPrep() {
  const panel = $('prep-panel');
  if (S.demo || !S.runs.length || !S.specimen) { panel.hidden = true; return; }
  const last = S.runs[S.runs.length - 1];
  const est = S.lastEstimate;
  panel.hidden = false;
  panel.textContent = '';
  const h = document.createElement('p');
  h.className = 'prep-h';
  h.textContent = `上次是 ${fmtShort(last.at)}，${last.count} 條，${money(last.cost || 0)}。這次已經幫你準備好：`;
  const dl = document.createElement('dl');
  dl.className = 'prep-grid';
  const rows = [
    ['基準線', S.baseline ? `${fmtWhen(S.baseline.markedAt)}　${S.changed.length} 個檔案有變動` : '尚未標記'],
    ['排除規則', `${S.excludes.length} 條　已濾掉 ${fmtInt(S.excluded)} 個檔案`],
    ['判讀規則', `${S.rules.length} 條　上次擋掉 ${last.suppressed || 0} 條重複的`],
    ['預算與模型', `${fmtK(S.budget)}，${S.model}　估 ${money(est ? est.cost : 0)}`],
  ];
  rows.forEach(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  });
  panel.append(h, dl);
}

function renderSpecimenRecord() {
  const dl = $('specimen-record');
  dl.textContent = '';
  const rows = S.specimen ? [
    ['資料夾', S.specimen.name],
    ['授權模式', S.specimen.kind === 'fsa' ? '持久授權' : '單次選取'],
    ['可讀檔案', fmtInt(S.entries.length)],
    ['已排除', fmtInt(S.excluded)],
    ['排除規則', `${S.excludes.length} 條（已記住）`],
    ['預算', `${fmtK(S.budget)}（已記住）`],
  ] : [['試件', S.demo ? '範例 nabe-orders' : '尚未架設']];
  rows.forEach(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  });
}

function renderStatus() {
  $('sb-assets').textContent =
    ` 基準線 ${S.baseline ? 1 : 0}　判讀規則 ${S.rules.length}　歷史 ${S.runs.length}`;
}

function live(msg) { $('sb-live').textContent = msg; }

/* ----------------------------------------------------------------- faults */

function faultNode(title, bodyHtml, actions) {
  const wrap = document.createElement('div');
  wrap.className = 'fault';
  wrap.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-warn"/></svg>';
  const box = document.createElement('div');
  const h = document.createElement('p'); h.className = 'fault-h'; h.textContent = title;
  const b = document.createElement('div'); b.className = 'fault-b'; b.innerHTML = bodyHtml;
  box.append(h, b);
  if (actions && actions.length) {
    const acts = document.createElement('div');
    acts.className = 'fault-acts';
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn btn-sm btn-ghost'; btn.textContent = a.label;
      btn.addEventListener('click', a.act);
      acts.appendChild(btn);
    });
    box.appendChild(acts);
  }
  wrap.appendChild(box);
  return wrap;
}

function mainFault(title, text, actions) {
  const n = $('main-fault');
  n.textContent = '';
  n.appendChild(faultNode(title, `<p>${escapeHtml(text)}</p>`, actions));
  n.hidden = false;
}

function clearFault(which) {
  if (which === 'main-fault') { $('main-fault').hidden = true; return; }
  if (which === 'specimen') { const b = $('specimen-body'); if (b.dataset.fault) restoreSpecimenBody(); return; }
  if (which === 'scan') { /* 掃描設定面板的警示是就地取代金鑰欄位，見 keyFault */ }
}

let specimenBackup = null;
function specimenFault(perm) {
  const b = $('specimen-body');
  if (!specimenBackup) specimenBackup = b.cloneNode(true);
  b.dataset.fault = '1';
  b.textContent = '';
  const name = S.specimen ? S.specimen.name : '這個資料夾';
  if (perm === 'denied') {
    b.appendChild(faultNode('這個資料夾的授權被拒絕了',
      '<p>可以在網址列左側的圖示裡改回允許，或直接重新選一次資料夾。</p>',
      [{ label: '重新選擇資料夾', act: pickFolder }]));
  } else {
    b.appendChild(faultNode('需要重新授權這個資料夾',
      '<p>瀏覽器重啟後授權會回到待確認狀態。基準線與判讀規則都還在。</p>',
      [{ label: `重新授權 ${name}`, act: async () => {
        const r = await requestPermission(S.specimen);
        if (r === 'granted') { restoreSpecimenBody(); await applySpecimen(S.specimen, true); }
        else specimenFault('denied');
      } }]));
  }
}

function restoreSpecimenBody() {
  if (!specimenBackup) return;
  const b = $('specimen-body');
  b.replaceWith(specimenBackup);
  specimenBackup = null;
  $('deck-pick').addEventListener('click', pickFolder);
}

function emptyFolderFault() {
  mainFault('這個資料夾裡沒有可讀的檔案',
    `${fmtInt(S.excluded)} 個檔案被排除規則濾掉了，或這個資料夾裡沒有純文字原始碼。`,
    [{ label: '換一個資料夾', act: pickFolder }]);
}

function noChangeFault() {
  const n = $('main-fault');
  n.textContent = '';
  n.appendChild(faultNode(
    `自 ${fmtWhen(S.baseline && S.baseline.markedAt)} 的基準線以來，沒有檔案變動`,
    '<p>如果 agent 剛剛才寫完，可能是基準線標記在那之後。</p>',
    [
      { label: '重新標記基準線', act: doBaseline },
      { label: `改為審查全部 ${fmtInt(S.entries.length)} 個檔案`, act: reviewAll },
    ]));
  n.hidden = false;
}

async function reviewAll() {
  const all = [];
  for (const e of S.entries) {
    let text = '';
    try { text = await e.read(); } catch { continue; }
    all.push({ path: e.path, size: e.size, status: 'modified', churn: e.size,
               addedLines: 0, removedLines: 0, text, read: e.read });
  }
  S.changed = all;
  S.fileMap = new Map(all.map((f) => [f.path, { text: f.text, lines: (f.text.match(/\n/g) || []).length + 1 }]));
  recomputePlan();
  const est = S.lastEstimate;
  const batches = new Set(S.plan.filter((f) => f.batch > 0).map((f) => f.batch)).size;
  const allTokens = S.plan.reduce((a, f) => a + (f.tokens || 0), 0);
  mainFault('改為審查全部檔案',
    `${fmtInt(all.length)} 個檔案約 ${fmtK(allTokens)} token，將分 ${batches} 批。第 1 批已勾選好，估 ${money(est ? est.cost : 0)}。要送出請按左邊的「開始審查」。`,
    [{ label: '知道了', act: () => clearFault('main-fault') }]);
}

function zeroDefectPanel(files, inTok, outTok) {
  const n = $('main-fault');
  n.textContent = '';
  n.appendChild(faultNode(`掃了 ${files.length} 個檔案，沒有找到缺陷`,
    `<p>被略過 ${S.suppressed.length} 條（依你的 ${S.rules.length} 條判讀規則）。<br>
     實際用量 ${fmtK(inTok)} 輸入 / ${fmtK(outTok)} 輸出 token，約 ${escapeHtml(money(S.lastCost))}。<br>
     模型 ${escapeHtml(S.model)}。</p>
     <p>如果你覺得應該要有問題，可以換一個更強的模型再掃一次，或先確認檔案真的送出去了。</p>`,
    [
      { label: '檢視送出內容', act: showPayload },
      { label: '重新審查', act: doReview },
    ]));
  n.hidden = false;
}

function keyFault(err) {
  const p = PROVIDERS[S.provider];
  const kind = err instanceof ProviderError ? err.kind : 'network';
  const note = $('key-note');
  if (kind === 'auth') {
    note.textContent = `這把 key 被供應商拒絕了：${p.label} 回覆 401 authentication_error。可能是 key 打錯、已被撤銷，或屬於另一個組織。key 沒有被清掉，你可以直接修改。`;
  } else if (kind === 'quota') {
    note.textContent = '這個帳號沒有額度了。這是帳單問題，不是設定問題。加值後這裡不用重設，直接再按一次就好。';
  } else if (kind === 'ratelimit') {
    note.textContent = `打太快了，供應商要求等 ${err.retryAfter || 20} 秒。`;
  } else if (kind === 'network') {
    note.textContent = '請求沒有送到供應商，瀏覽器層就被擋下了。可能是網路、proxy、或廣告阻擋器擋掉了 ' + p.host + '。本站送出 Anthropic 請求時已帶 anthropic-dangerous-direct-browser-access 標頭。';
  } else {
    note.textContent = `${p.label} 回覆：${err.message || err}`;
  }
}

function reviewFault(err) {
  const p = PROVIDERS[S.provider];
  const kind = err instanceof ProviderError ? err.kind : 'network';
  const retry = { label: '重試', act: doReview };
  const payload = { label: '檢視送出內容', act: showPayload };
  if (kind === 'auth') {
    mainFault('這把 key 被供應商拒絕了',
      `${p.label} 回覆 401 authentication_error。可能是 key 打錯、已被撤銷，或屬於另一個組織。key 沒有被自動清掉。`,
      [{ label: '重新輸入 key', act: () => { $('in-key').focus(); $('in-key').select(); } }]);
  } else if (kind === 'quota') {
    mainFault('這個帳號沒有額度了',
      `${p.label} 回覆 insufficient_quota。這是帳單問題，不是設定問題。加值後這裡不用重設，直接再按一次就好。`, [retry]);
  } else if (kind === 'ratelimit') {
    mainFault(`打太快了，供應商要求等 ${err.retryAfter || 20} 秒`,
      `已收到的 ${S.defects.length} 條缺陷保留在畫面上。等一下再按重試即可續掃。`, [retry]);
  } else if (kind === 'network') {
    const n = $('main-fault');
    n.textContent = '';
    n.appendChild(faultNode('請求沒有送到供應商',
      `<p>瀏覽器層就被擋下了，通常是這三個原因之一：</p>
       <ol><li>網路斷線或有 proxy 攔截</li>
       <li>廣告阻擋器 / 隱私擴充套件擋掉了 ${escapeHtml(p.host)}</li>
       <li>供應商暫時不接受瀏覽器直連</li></ol>
       <p>本站送出 Anthropic 請求時已帶 <code>anthropic-dangerous-direct-browser-access: true</code> 標頭，這是瀏覽器直連的必要條件。若問題持續，先試著在無痕視窗開啟。</p>`,
      [retry, payload]));
    n.hidden = false;
  } else {
    mainFault('供應商回覆了一個錯誤', `${p.label}：${err.message || err}`, [retry, payload]);
  }
  live('審查失敗');
}

function storageFault(err) {
  const n = $('storage-fault');
  const quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message || '')));
  n.textContent = '';
  n.appendChild(faultNode(
    quota ? '本機儲存空間滿了' : '本機儲存寫入失敗',
    quota
      ? '<p>判讀規則沒有存進去。歷史報告佔用最多空間。</p>'
      : `<p>IndexedDB 回覆：${escapeHtml(String(err && err.message || err))}。判讀規則可能沒有存進去。</p>`,
    [
      { label: '匯出全部規則為 JSON', act: exportRules },
      { label: '刪掉最舊的 10 份歷史報告', act: async () => {
        const runs = await store.listRuns(false);
        for (const r of runs.slice(0, 10)) await store.del('runs', r.id);
        S.runs = await store.listRuns(false);
        renderHistory(); renderStatus();
        n.hidden = true;
      } },
    ]));
  n.hidden = false;
}

async function checkStorage() {
  const p = await store.storagePressure();
  if (p !== null && p > 0.8) {
    $('sb-assets').textContent += `　儲存空間 ${Math.round(p * 100)}%`;
  }
}

/* ------------------------------------------------------------------ demo */

async function loadSample() {
  S.demo = true;
  body.dataset.demo = 'true';
  S.specimen = null;
  S.entries = [];
  S.changed = [];
  S.plan = [];
  S.excluded = 2104;
  S.excludes = [...DEFAULT_EXCLUDES];
  renderExcludes();
  setStage('deck');
  $('demo-band').hidden = false;
  $('prep-panel').hidden = true;
  clearFault('main-fault');

  S.rules = await store.listRules(true).catch(() => []);
  S.runs = SAMPLE_RUNS;

  $('specimen-name').textContent = SAMPLE_PROJECT + '（範例，虛構專案）';
  $('specimen-meta').textContent = '10 個檔案 / 已排除 2,104　Node + Express + SQLite，剛被 agent 加上退款功能';
  $('baseline-when').textContent = '範例基準線　11 個檔案有變動';

  strip.setFiles(SAMPLE_FILES.map((f) => ({ path: f.path, size: f.size, lines: f.lines })));
  const sent = new Set(SAMPLE_FILES.map((f) => f.path));
  const fileMap = new Map(SAMPLE_FILES.map((f) => [f.path, { text: '', lines: f.lines }]));
  S.defects = [];
  S.suppressed = [];
  const queue = [];
  SAMPLE_DEFECTS.forEach((raw) => {
    const d = verify({ ...raw, endLine: null }, fileMap, sent);
    d.lineVerified = true;
    d.severity = raw.severity;
    d.excerpt = raw.excerpt.map((l) => ({ ...l, hit: l.n === raw.line }));
    const hit = ruleFor(d, S.rules);
    if (hit) S.suppressed.push({ defect: d, rule: hit });
    else queue.push(d);
  });
  strip.setDefects([]);
  $('strip-empty').hidden = true;
  S.lastUsage = SAMPLE_USAGE;
  S.lastCost = SAMPLE_USAGE.cost;

  renderDefects();
  renderSuppressed();
  renderRules();
  renderHistory();
  renderSpecimenRecord();
  renderStatus();
  $('btn-export').setAttribute('aria-disabled', 'false');
  $('review-note').textContent = '範例模式：這份報告已經產生好了';

  // 訪客是靠這一段看到招牌時刻的：掃描游標等速走過探傷帶，游標經過哪一欄，
  // 那一欄的缺陷才浮出來。沒有動效層時整份報告直接就在那裡，內容一模一樣。
  const emit = (d) => {
    if (!S.demo) return;
    S.defects.push(d);
    strip.addStrike(d);
    renderDefects();
    fire('onStrike', d);
  };
  const done = () => {
    if (!S.demo) return;
    renderDefects();
    if (W.hooks.onFinish) fire('onFinish', { demo: true, count: S.defects.length });
    else strip.setProgress(null);
    live(`範例報告已載入，${S.defects.length} 條缺陷，其中 ${S.defects.filter(isCross).length} 條跨檔案`);
  };
  if (W.replayDriver) {
    live(`範例報告掃描中，${queue.length} 條缺陷`);
    W.replayDriver(queue, emit, done);
  } else {
    S.defects = queue;
    strip.setDefects(S.defects);
    done();
  }
}

async function leaveDemo(goBed) {
  if (W.cancelReplay) W.cancelReplay();
  await store.clearDemo().catch(() => {});
  S.demo = false;
  body.dataset.demo = 'false';
  $('demo-band').hidden = true;
  S.defects = [];
  S.suppressed = [];
  strip.clear();
  S.rules = await store.listRules(false).catch(() => []);
  S.runs = await store.listRuns(false).catch(() => []);
  renderRules(); renderHistory(); renderDefects(); renderSuppressed(); renderStatus();
  $('strip-empty').hidden = false;
  if (goBed && !S.specimen) setStage('bed');
  live('已離開範例，示範資料已清除');
}

/* --------------------------------------------------------------- drawers */

let lastFocus = null;

function showExport() {
  if (!S.defects.length) return;
  const md = buildMarkdown({
    project: S.demo ? SAMPLE_PROJECT : (S.specimen ? S.specimen.name : 'project'),
    at: Date.now(),
    defects: sortDefects(S.defects, S.sort),
    suppressed: S.suppressed.length,
    rulesCount: S.rules.length,
    model: S.model,
    provider: PROVIDERS[S.provider].label,
    sentFiles: S.demo ? SAMPLE_FILES.map((f) => ({ path: f.path, why: '範例' })) : selectedFiles(),
    excludedCount: S.excluded,
    excludeRules: S.excludes,
    baselineAt: S.baseline ? S.baseline.markedAt : (S.demo ? Date.now() - 864e5 : 0),
    usage: S.lastUsage,
    cost: S.lastCost,
    demo: S.demo,
    batches: new Set(S.plan.filter((f) => f.batch > 0).map((f) => f.batch)).size || 1,
  });
  $('export-body').textContent = md;
  openDrawer('export-drawer');
}

function showPayload() {
  const sel = selectedFiles();
  const files = S.demo
    ? SAMPLE_FILES.map((f) => ({ path: f.path, text: '（範例模式沒有真實檔案內容）' }))
    : sel.map((f) => ({ path: f.path, text: (S.fileMap.get(f.path) || {}).text || '' }));
  const body = buildBody({
    provider: S.provider, model: S.model, files,
    edges: importGraph(files), note: '', stream: true,
  });
  $('payload-body').textContent =
    `// 這是實際會送往 ${PROVIDERS[S.provider].endpoint} 的 request body。\n`
    + `// API key 不在裡面：它只出現在 HTTP 標頭。\n\n`
    + previewBody(body).slice(0, 40000);
  openDrawer('payload-drawer');
}

function openDrawer(id) {
  lastFocus = document.activeElement;
  $(id).hidden = false;
  const btn = $(id).querySelector('button');
  if (btn) btn.focus();
}
function closeDrawer(id) {
  $(id).hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

function openSheet() {
  lastFocus = document.activeElement;
  $('sheet-scrim').hidden = false;
  $('sheet-close').focus();
}
function closeSheet() {
  $('sheet-scrim').hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/* ---------------------------------------------------------------- wiring */

function wire() {
  $('bed-pick').addEventListener('click', pickFolder);
  $('deck-pick').addEventListener('click', pickFolder);
  $('demo-pick').addEventListener('click', pickFolder);
  $('bed-sample').addEventListener('click', loadSample);
  $('demo-exit').addEventListener('click', () => leaveDemo(true));

  $('btn-baseline').addEventListener('click', doBaseline);
  $('btn-diff').addEventListener('click', () => {
    if ($('btn-diff').getAttribute('aria-disabled') === 'true') return;
    if (S.scanning) { cancelReview(); if (S.abort) S.abort.abort(); return; }
    doDiff();
  });

  document.querySelectorAll('#seg-provider .seg-b').forEach((b) => {
    b.addEventListener('click', () => {
      S.provider = b.dataset.provider;
      store.settings.setProvider(S.provider);
      fillModels();
      renderBudget();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const all = [...document.querySelectorAll('#seg-provider .seg-b')];
      const i = all.indexOf(b);
      const nx = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      nx.focus(); nx.click();
    });
  });

  $('in-key').addEventListener('input', () => {
    store.settings.setKey(S.provider, $('in-key').value.trim());
    updateKeyChip();
    updateGate();
  });
  $('btn-eye').addEventListener('click', () => {
    const i = $('in-key');
    const show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    $('btn-eye').setAttribute('aria-label', show ? '隱藏 API key' : '顯示 API key');
  });
  $('btn-testkey').addEventListener('click', doTestKey);

  $('in-model').addEventListener('change', () => {
    S.model = $('in-model').value;
    store.settings.setModel(S.provider, S.model);
    renderPrice();
    renderBudget();
  });

  const bslider = $('in-budget');
  bslider.value = String(S.budget);
  bslider.addEventListener('input', () => {
    S.budget = parseInt(bslider.value, 10);
    store.settings.setBudget(S.budget);
    recomputePlan();
    renderSpecimenRecord();
  });

  $('btn-review').addEventListener('click', doReview);
  $('btn-payload').addEventListener('click', showPayload);
  $('btn-export').addEventListener('click', () => {
    if ($('btn-export').getAttribute('aria-disabled') === 'true') return;
    showExport();
  });

  $('in-filter').addEventListener('input', () => { S.filter = $('in-filter').value.trim(); renderDefects(); });
  $('in-sort').addEventListener('change', () => { S.sort = $('in-sort').value; renderDefects(); });
  $('btn-cross').addEventListener('click', () => {
    S.crossOnly = !S.crossOnly;
    $('btn-cross').setAttribute('aria-pressed', String(S.crossOnly));
    renderDefects();
  });

  $('sup-toggle').addEventListener('click', () => {
    const open = $('sup-toggle').getAttribute('aria-expanded') === 'true';
    $('sup-toggle').setAttribute('aria-expanded', String(!open));
    $('sup-body').hidden = open;
    if (!open) fire('onSupOpen');
  });

  $('btn-rules-export').addEventListener('click', exportRules);
  $('btn-rules-import').addEventListener('click', () => $('rules-file').click());
  $('rules-file').addEventListener('change', () => {
    const f = $('rules-file').files[0];
    if (f) importRules(f);
    $('rules-file').value = '';
  });

  $('export-close').addEventListener('click', () => closeDrawer('export-drawer'));
  $('payload-close').addEventListener('click', () => closeDrawer('payload-drawer'));
  $('export-dl').addEventListener('click', () =>
    downloadMarkdown($('export-body').textContent, S.demo ? SAMPLE_PROJECT : (S.specimen ? S.specimen.name : 'project')));
  $('export-copy').addEventListener('click', async (e) => {
    const ok = await copyText($('export-body').textContent);
    e.currentTarget.lastChild.textContent = ok ? '已複製' : '複製失敗';
    setTimeout(() => { e.currentTarget.lastChild.textContent = '複製全文'; }, 1600);
  });
  $('payload-copy').addEventListener('click', async (e) => {
    const ok = await copyText($('payload-body').textContent);
    e.currentTarget.lastChild.textContent = ok ? '已複製' : '複製失敗';
    setTimeout(() => { e.currentTarget.lastChild.textContent = '複製全文'; }, 1600);
  });

  $('chip-help').addEventListener('click', openSheet);
  $('sheet-close').addEventListener('click', closeSheet);
  $('sheet-scrim').addEventListener('mousedown', (e) => { if (e.target === $('sheet-scrim')) closeSheet(); });
  $('sheet').addEventListener('keydown', trapFocus);

  $('chip-support').addEventListener('click', () => {
    if (body.dataset.stage === 'bed') {
      document.querySelector('#sup-h').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      live(supportsFSA()
        ? '這個瀏覽器有 File System Access API，資料夾授權可以續用。'
        : '這個瀏覽器沒有 File System Access API，每次回來都要重選資料夾。基準線與判讀規則仍保留在本機。');
    }
  });
  $('chip-key').addEventListener('click', () => {
    if (body.dataset.stage === 'bed') return;
    showPane('rail-left');
    $('in-key').focus();
    $('in-key').scrollIntoView({ block: 'center' });
  });
  $('chip-assets').addEventListener('click', () => {
    if (body.dataset.stage === 'bed') return;
    if (window.innerWidth < 768) { showPane('rail-right'); return; }
    if (window.innerWidth < 1024) {
      body.dataset.rail = body.dataset.rail === 'open' ? '' : 'open';
      if (body.dataset.rail === 'open') $('rail-right').querySelector('button').focus();
      return;
    }
    $('rail-right').scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.querySelectorAll('.dtab').forEach((t) => {
    t.addEventListener('click', () => showPane(t.dataset.pane));
  });
  showPane('stage-main');

  $('defect-list').addEventListener('keydown', listKeys);
  document.addEventListener('keydown', globalKeys);
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      ['rail-left', 'stage-main', 'rail-right'].forEach((p) => { $(p).hidden = false; });
    } else if (![...document.querySelectorAll('.dtab')].some((t) => t.getAttribute('aria-selected') === 'true')) {
      showPane('stage-main');
    }
    strip && strip.draw();
  });
}

function showPane(id) {
  if (window.innerWidth >= 768) return;
  ['rail-left', 'stage-main', 'rail-right'].forEach((p) => { $(p).hidden = p !== id; });
  document.querySelectorAll('.dtab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.pane === id)));
  if (id === 'stage-main') requestAnimationFrame(() => strip && strip.draw());
}

function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const nodes = [...$('sheet').querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])')]
    .filter((n) => n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function listKeys(e) {
  const rows = [...$('defect-list').querySelectorAll('.drow')];
  if (!rows.length) return;
  const cur = rows.indexOf(document.activeElement.closest('.drow'));
  const move = (i) => {
    rows.forEach((r) => { r.tabIndex = -1; });
    const n = rows[Math.max(0, Math.min(rows.length - 1, i))];
    n.tabIndex = 0;
    n.focus();
  };
  if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(cur + 1); }
  else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(cur - 1); }
  else if (e.key === 'Home') { e.preventDefault(); move(0); }
  else if (e.key === 'End') { e.preventDefault(); move(rows.length - 1); }
  else if (e.key === 'Enter' || e.key === 'e') {
    const btn = [...rows[cur].querySelectorAll('button')].find((b) => /節錄/.test(b.textContent));
    if (btn) { e.preventDefault(); btn.click(); }
  } else if (e.key === 'x') {
    const btn = [...rows[cur].querySelectorAll('button')].find((b) => /不管/.test(b.textContent));
    if (btn) { e.preventDefault(); btn.click(); }
  } else if (e.key === 'c') {
    const btn = [...rows[cur].querySelectorAll('button')].find((b) => /複製/.test(b.textContent));
    if (btn) { e.preventDefault(); btn.click(); }
  }
}

function globalKeys(e) {
  if (e.key === 'Escape') {
    const inline = document.querySelector('.xchip-in') || document.querySelector('.confirm');
    if (inline) { e.preventDefault(); if (inline.classList.contains('confirm')) inline.remove(); else renderExcludes(); return; }
    if (S.openExcerpts.size) {
      const last = [...S.openExcerpts].pop();
      S.openExcerpts.delete(last);
      renderDefects();
      return;
    }
    if (!$('export-drawer').hidden) { closeDrawer('export-drawer'); return; }
    if (!$('payload-drawer').hidden) { closeDrawer('payload-drawer'); return; }
    if (body.dataset.rail === 'open') { body.dataset.rail = ''; return; }
    if (!$('sheet-scrim').hidden) { closeSheet(); return; }
    return;
  }
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const k = e.key.toLowerCase();
  if (k === 'o') { e.preventDefault(); pickFolder(); }
  else if (k === 'b') { e.preventDefault(); doBaseline(); }
  else if (k === 'd') { e.preventDefault(); doDiff(); }
  else if (k === 'r') { e.preventDefault(); doReview(); }
  else if (k === '/') { e.preventDefault(); $('in-filter').focus(); }
  else if (k === 'f') { e.preventDefault(); $('btn-cross').click(); }
  else if (k === 's') { e.preventDefault(); if (!$('suppressed').hidden) $('sup-toggle').click(); }
  else if (k === 'm') { e.preventDefault(); showExport(); }
  else if (e.key === '?') { e.preventDefault(); openSheet(); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot().catch((err) => {
  console.error(err);
  live('啟動失敗：' + (err && err.message ? err.message : String(err)));
  setStage('bed');
});
