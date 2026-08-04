/* Puzzle Press - application wiring.

   The whole product is one screen: setup on the left, the book in the middle,
   the proof on the right. Nothing here opens a modal, because no task in this
   product needs to interrupt or trap focus. */

import { $, $$, el, clear, icon, toast, say, download, alertRow, inlineConfirm, ago, fmt, bytesLabel } from './dom.js';
import { call } from './fx.js';
import { normaliseSeed, isCompleteSeed, randomSeed } from './rng.js';
import { planBook } from './layout.js';
import { TRIMS } from './kdp.js';
import { Engine } from './engine.js';
import { Plate } from './plate.js';
import { Drawer } from './drawer.js';
import { renderCheck, checkText, typeLabel } from './press-check.js';
import { INTERIOR_FONTS, fontById, ensureFont, loadedFont, totalBytes, kb, adoptUploaded } from './fonts.js';
import { setInteriorFamily } from './thumbs.js';
import { buildPdf, filenameFor, loadLibs } from './pdf.js';
import { THEMES, themeWords } from './data/themes.js';
import * as store from './store.js';

const MAX_COUNT = 300;
const MIN_COUNT = 10;

const DIFFICULTY = {
  wordsearch: {
    1: ['入門', '4 個方向，不反向。干擾字母均勻隨機，罕見字母會形成視覺錨點。'],
    2: ['輕鬆', '4 個方向的軸線，允許反向讀，等於 8 個向量。'],
    3: ['中等', '8 個方向，允許反向。干擾字母改用清單本身的字母頻率。'],
    4: ['困難', '8 個方向，密度提高到 68%。單字之間允許共用字母。'],
    5: ['專家', '8 個方向，密度 78%，並在已放置單字周圍種入該單字的雙字母碎片。'],
  },
  sudoku: {
    1: ['入門', '只需要 naked single：某一格只剩一個候選數。'],
    2: ['輕鬆', '需要 hidden single：某個數在一列或一宮只剩一個位置。'],
    3: ['中等', '需要 locked candidates 或 naked pair。'],
    4: ['困難', '需要 hidden pair、naked triple 或 X-Wing。'],
    5: ['專家', '需要 XY-Wing 或 Swordfish。'],
  },
  maze: {
    1: ['入門', '13 × 13，最短解 40 到 70 步。'],
    2: ['輕鬆', '17 × 17，最短解 70 到 110 步。'],
    3: ['中等', '21 × 21，最短解 120 到 180 步。'],
    4: ['困難', '25 × 25，最短解 190 到 270 步。'],
    5: ['專家', '31 × 31，最短解 300 到 420 步。'],
  },
};

const app = {
  state: {
    seed: '7F3A-2C91',
    type: 'wordsearch',
    count: 100,
    gridSize: 15,
    level: 3,
    trimId: 'letter',
    bleed: true,
    largePrint: true,
    title: 'Kitchen Puzzles',
    words: [],
    nonLatin: [],
    listId: null,
    listName: null,
    originName: '',
    fontId: 'atkinson',
    fontStatus: 'idle',
    fontLoaded: 0,
    fontHost: 0,
    plan: null,
    puzzles: [],
    phase: 'idle',
    embedded: null,
    annotations: { trim: true, bleed: true, gutter: true, safe: true },
    lists: [],
    runs: [],
    view: 'frame',
    inspectPage: 1,
    escArmed: false,
    lastPreset: null,
  },
  dom: {},
};

const engine = new Engine();
let plate = null;
let drawer = null;
let pdfLink = null;

/* ---------------------------------------------------------------- helpers */

function meta() {
  const s = app.state;
  return {
    title: s.title || 'Puzzle Book',
    subtitle: `${s.count} ${typeEn(s.type)} Puzzles`,
    seed: s.seed,
    type: s.type,
  };
}
app.meta = meta;

function typeEn(type) {
  return type === 'sudoku' ? 'Sudoku' : type === 'maze' ? 'Maze' : 'Word Search';
}

function recomputePlan() {
  app.state.plan = planBook({
    trimId: app.state.trimId,
    bleed: app.state.bleed,
    largePrint: app.state.largePrint,
    count: app.state.count,
    level: app.state.level,
  });
  return app.state.plan;
}

function perPuzzleWords() {
  const size = app.state.gridSize;
  const density = { 1: 0.4, 2: 0.48, 3: 0.56, 4: 0.68, 5: 0.78 }[app.state.level] || 0.56;
  return Math.max(6, Math.round((size * size * density) / 6.5));
}

/* --------------------------------------------------------------- word list */

function parseWordList(text) {
  const lines = text.split(/\r?\n/);
  const nonLatin = [];
  const words = [];
  const seen = new Set();
  let duplicates = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const upper = line.toUpperCase();
    if (!/^[A-Z][A-Z '-]*$/.test(upper)) {
      nonLatin.push({ line: i + 1, text: line });
      return;
    }
    const clean = upper.replace(/[^A-Z]/g, '');
    if (clean.length < 3) return;
    if (seen.has(clean)) {
      duplicates += 1;
      return;
    }
    seen.add(clean);
    words.push(clean);
  });
  return { words, nonLatin, duplicates, rawCount: words.length + duplicates };
}

function renderWordListState() {
  const s = app.state;
  const stats = $('#wordlist-stats');
  const alerts = clear($('#wordlist-alerts'));
  const origin = $('#wordlist-origin');

  origin.textContent = s.originName
    ? s.listId
      ? `已存為「${s.originName}」`
      : `來源：${s.originName}`
    : '';

  if (!s.words.length) {
    stats.textContent = '還沒有字。可以貼上清單，或從內建主題清單挑一份。';
    $('#save-list').disabled = true;
    return;
  }

  const longest = s.words.reduce((a, b) => (b.length > a.length ? b : a), '');
  stats.textContent = `${s.words.length} 個字 · 最長 ${longest.length}（${longest.toLowerCase()}）· 去重後 ${s.words.length}`;
  $('#save-list').disabled = false;

  if (s.type !== 'wordsearch') return;

  /* lines that are not Latin letters at all */
  const foreign = s.nonLatin || [];
  if (foreign.length) {
    alerts.appendChild(
      alertRow(`第 ${foreign[0].line} 行「${foreign[0].text}」不是拉丁字母。字謎格線只放 A 到 Z。`, [
        {
          label: `移除這 ${foreign.length} 行`,
          run: () => {
            const drop = new Set(foreign.map((x) => x.line));
            const ta = $('#wordlist');
            ta.value = ta.value.split(/\r?\n/).filter((_, k) => !drop.has(k + 1)).join('\n');
            ta.dispatchEvent(new Event('input'));
          },
        },
      ]),
    );
  }

  /* words that cannot physically fit the grid */
  const tooLong = s.words.filter((w) => w.length > s.gridSize);
  if (tooLong.length) {
    const nextGrid = s.gridSize === 13 ? 15 : 17;
    const list = tooLong.slice(0, 3).map((w) => `${w.toLowerCase()}（${w.length}）`).join('、');
    alerts.appendChild(
      alertRow(
        `${s.gridSize}×${s.gridSize} 放不下 ${tooLong.length} 個字：${list}${tooLong.length > 3 ? ' 等' : ''}。`,
        [
          {
            label: `改用 ${nextGrid}×${nextGrid}`,
            run: () => {
              setGrid(nextGrid);
            },
          },
          {
            label: `移除這 ${tooLong.length} 個字`,
            run: async () => {
              const keep = s.words.filter((w) => w.length <= s.gridSize);
              if (s.listId) {
                await store.recordTooLong(
                  s.listId,
                  tooLong.map((w) => ({ word: w, minGrid: w.length + 2 })),
                  s.gridSize + 2,
                );
                await reloadLists();
              }
              s.words = keep;
              $('#wordlist').value = keep.map((w) => w.toLowerCase()).join('\n');
              renderWordListState();
              refresh();
            },
          },
        ],
      ),
    );
  }

  /* honest repetition maths */
  const repeats = Math.round((s.count * perPuzzleWords()) / s.words.length);
  if (repeats > 12) {
    alerts.appendChild(
      alertRow(`${s.words.length} 個字要出 ${s.count} 題，平均每個字會出現 ${repeats} 次。讀者會發現。`, [
        { label: '合併內建主題清單', run: () => drawer.open('themes') },
        {
          label: '減少題數',
          run: () => {
            setCount(Math.max(MIN_COUNT, Math.round((s.words.length * 12) / perPuzzleWords())));
          },
        },
      ]),
    );
  }
}

function setWords(words, originName, listId) {
  app.state.words = words;
  app.state.nonLatin = [];
  app.state.originName = originName || '';
  app.state.listId = listId || null;
  $('#wordlist').value = words.map((w) => w.toLowerCase()).join('\n');
  renderWordListState();
  refresh();
}
app.applyWords = setWords;

app.applyList = (list) => {
  setWords(list.words.slice(), list.name, list.id);
  app.state.listName = list.name;
  /* the known-problem memory: block before the press, not after */
  const worst = (list.tooLongWords || []).filter((w) => w.minGrid > app.state.gridSize);
  const alerts = $('#wordlist-alerts');
  if (worst.length) {
    const need = Math.max(...worst.map((w) => w.minGrid));
    alerts.appendChild(
      alertRow(
        `這份清單上次在 ${app.state.gridSize}×${app.state.gridSize} 有 ${worst.length} 個字放不下：${worst
          .slice(0, 3)
          .map((w) => `${w.word.toLowerCase()}（${w.word.length}）`)
          .join('、')}。`,
        [
          { label: `改用 ${need}×${need}`, run: () => setGrid(Math.min(17, need)) },
          {
            label: `移除這 ${worst.length} 個字`,
            run: () => {
              const drop = new Set(worst.map((w) => w.word));
              setWords(app.state.words.filter((w) => !drop.has(w)), list.name, list.id);
            },
          },
        ],
      ),
    );
  }
  toast(`已載入「${list.name}」`);
};

app.reloadLists = reloadLists;
async function reloadLists() {
  app.state.lists = await store.getLists();
}

/* ------------------------------------------------------------- readouts */

function refresh() {
  const s = app.state;
  const plan = recomputePlan();

  $('#count-readout').textContent = `約 ${plan.pageCount} 頁 · gutter ${plan.gutterIn} in`;
  const reflow = plan.warnings.find((w) => w.id === 'reflow');
  const note = $('#count-note');
  if (reflow) {
    note.hidden = false;
    note.textContent = reflow.text;
  } else note.hidden = true;

  const [label, desc] = DIFFICULTY[s.type][s.level];
  $('#difficulty-label').textContent = `L${s.level} ${label}`;
  $('#difficulty-desc').textContent = desc;

  const bits = [`${s.count} 題${typeLabel(s.type)}`];
  if (s.type === 'wordsearch') bits.push(`${s.gridSize} × ${s.gridSize}`);
  bits.push(`L${s.level}`, `約 ${plan.pageCount} 頁`);
  $('#press-note').textContent = bits.join(' · ');

  $('#source-words').hidden = s.type !== 'wordsearch';
  $('#source-note').hidden = s.type === 'wordsearch';
  $('#grid-field').hidden = s.type !== 'wordsearch';

  updateHeroMachine();
  updatePressButton();
  renderCheck(app);
  if (s.view === 'frame') plate.renderFrame();
}

function updateHeroMachine() {
  const s = app.state;
  const font = fontById(s.fontId);
  const node = app.dom.heroMachine;
  if (s.fontStatus === 'ready') {
    node.textContent = `引擎就緒 · 內頁字型 ${font.name} 已就緒（${kb(totalBytes(font))}，存在這個瀏覽器裡）`;
  } else if (s.fontStatus === 'loading') {
    node.textContent = `引擎就緒 · 正在下載內頁字型 ${font.name}（${bytesLabel(s.fontLoaded)} / ${kb(totalBytes(font))}）`;
  } else if (s.fontStatus === 'failed') {
    node.textContent = `引擎就緒 · 內頁字型下載失敗，題目可以先生成，匯出 PDF 需要字型檔`;
  } else {
    node.textContent = `引擎就緒 · 內頁字型 ${font.name} 尚未下載（${kb(totalBytes(font))}，只下載一次）`;
  }
  if (engine.mode === 'main') {
    node.textContent += ' · Worker 無法啟動，改用主執行緒分批生成';
  }
}

function updatePressButton() {
  const s = app.state;
  const btn = $('#press-btn');
  const busy = s.phase === 'generating' || s.phase === 'verifying';
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (busy) return;
  const has = s.puzzles.filter(Boolean).length > 0;
  btn.textContent = has ? '再印一次（換種子）' : '開　印';
  const blocked = s.type === 'wordsearch' && s.words.length < 6;
  btn.disabled = blocked;
  btn.style.setProperty('--progress', '0%');
  $('#press-note').classList.toggle('is-blocked', blocked);
  if (blocked) $('#press-note').textContent = '字謎需要至少 6 個字。貼一份清單，或從內建主題清單挑一份。';
}

/* ------------------------------------------------------------ status bar */

function setStage(text) {
  $('#stage').textContent = text;
}

/* The web ruler is bound to a real count, so it is data and not decoration.
   Whoever animates it has to move it linearly; see js/motion.js. */
function setRuler(done, total) {
  const k = total ? done / total : 0;
  if (!call('ruler', k, app.state.phase)) $('#ruler-fill').style.transform = `scaleX(${k})`;
  $('#ruler-count').textContent = `${done} / ${total}`;
}

/* Same contract as the ruler, kept in CSS: `.press-btn::after` transitions its
   width `100ms linear`, so it stays linear with or without a motion layer. */
function setPressProgress(btn, k) {
  btn.style.setProperty('--progress', `${k * 100}%`);
}

function renderTally() {
  const t = store.tally(app.state.runs);
  const node = $('#tally');
  clear(node);
  if (!t.books) {
    node.textContent = '還沒有落版紀錄。第一本印完之後這裡會開始累積。';
    return;
  }
  node.appendChild(el('b', { text: String(t.books) }));
  node.appendChild(document.createTextNode(' 本 · '));
  node.appendChild(el('b', { text: fmt(t.puzzles) }));
  node.appendChild(
    document.createTextNode(
      t.failedPuzzles ? ` 題 · ${t.failedBooks} 本有 ${t.failedPuzzles} 題未達標` : ' 題 · 驗證全數通過',
    ),
  );
}

function renderLedger() {
  const runs = app.state.runs;
  $('#ledger-title').textContent = `落版紀錄 (${runs.length})`;
  const host = clear($('#ledger-body'));
  if (!runs.length) {
    host.appendChild(
      el('p', { class: 'ledger-empty', text: '還沒有紀錄。每印一本，這裡會多一列，記下種子與驗證結果。' }),
    );
    return;
  }
  runs.slice(0, 8).forEach((run) => {
    const row = el('div', { class: 'ledger-row' }, [
      el('span', { class: 'ledger-name', text: run.title }),
      el(
        'button',
        {
          type: 'button',
          class: 'btn-hair ledger-again',
          onclick: () => reuseRun(run),
        },
        '用同樣規格換種子',
      ),
      el('span', {
        class: 'ledger-meta',
        text: `${run.seed} · ${run.pages}p · ${run.count} 題 · ${run.failed ? `${run.failed} 題未達標` : '全數通過'} · ${ago(run.at)}`,
      }),
    ]);
    host.appendChild(row);
  });
}

function reuseRun(run) {
  applySettings(run.settings || {});
  app.state.seed = randomSeed();
  $('#seed').value = app.state.seed;
  refresh();
  toast(`已沿用《${run.title}》的規格，種子換成 ${app.state.seed}`);
  startRun();
}

/* --------------------------------------------------------------- fonts */

function renderFontPicker() {
  const host = clear($('#fontlist'));
  INTERIOR_FONTS.forEach((font) => {
    const selected = app.state.fontId === font.id;
    const input = el('input', {
      type: 'radio',
      name: 'ifont',
      value: font.id,
      checked: selected,
      onchange: () => {
        app.state.fontId = font.id;
        app.state.fontStatus = loadedFont(font.id) ? 'ready' : 'idle';
        setInteriorFamily(loadedFont(font.id) ? `"${font.family}", ui-sans-serif` : 'ui-sans-serif, system-ui, sans-serif');
        renderFontPicker();
        refresh();
        if (!loadedFont(font.id)) downloadFont();
      },
    });

    const state = el('span', { class: 'font-state' });
    const status = selected ? app.state.fontStatus : loadedFont(font.id) ? 'ready' : 'idle';
    if (status === 'ready') {
      state.appendChild(icon('check'));
      state.appendChild(document.createTextNode('已就緒'));
    } else if (status === 'loading') {
      state.textContent = `下載中 ${bytesLabel(app.state.fontLoaded)} / ${kb(totalBytes(font))}`;
    } else if (status === 'failed') {
      state.textContent = '下載失敗';
    } else {
      state.textContent = `未下載 ${kb(totalBytes(font))}`;
    }

    const item = el('label', { class: 'font-item' }, [
      input,
      el('span', {}, [
        el('span', { class: 'font-name', text: font.name }),
        document.createTextNode(' '),
        el('span', {
          class: 'font-spec',
          style: loadedFont(font.id) ? `font-family:"${font.family}"` : '',
          text: 'Aa 1234',
        }),
      ]),
      state,
      el('p', { class: 'font-note', text: font.note }),
    ]);

    if (selected && app.state.fontStatus === 'loading') {
      const bar = el('div', { class: 'font-bar' }, [el('i')]);
      bar.firstChild.style.width = `${Math.round((app.state.fontLoaded / totalBytes(font)) * 100)}%`;
      item.appendChild(bar);
    }
    host.appendChild(item);

    if (selected && app.state.fontStatus === 'failed') {
      host.appendChild(
        alertRow(
          '字型下載失敗（網路，或防火牆擋住 cdn.jsdelivr.net）。KDP 要求字型必須嵌入，沒有字型檔就不能產生可上架的 PDF。',
          [
            { label: '重試', run: () => downloadFont() },
            {
              label: '改用備援來源',
              run: () => {
                app.state.fontHost = 1;
                downloadFont();
              },
            },
            { label: '上傳 .ttf', run: () => $('#ttf-file').click() },
          ],
        ),
      );
    }
  });
}

async function downloadFont() {
  const s = app.state;
  const font = fontById(s.fontId);
  if (loadedFont(s.fontId)) {
    s.fontStatus = 'ready';
    setInteriorFamily(`"${font.family}", ui-sans-serif`);
    renderFontPicker();
    updateHeroMachine();
    return true;
  }
  s.fontStatus = 'loading';
  s.fontLoaded = 0;
  renderFontPicker();
  updateHeroMachine();
  try {
    await ensureFont(s.fontId, (loaded) => {
      s.fontLoaded = loaded;
      const bar = $('#fontlist .font-bar > i');
      if (bar) bar.style.width = `${Math.round((loaded / totalBytes(font)) * 100)}%`;
      const st = $('#fontlist .font-item:has(input:checked) .font-state');
      if (st && s.fontStatus === 'loading') st.textContent = `下載中 ${bytesLabel(loaded)} / ${kb(totalBytes(font))}`;
    }, s.fontHost);
    s.fontStatus = 'ready';
    setInteriorFamily(`"${font.family}", ui-sans-serif`);
    renderFontPicker();
    updateHeroMachine();
    renderCheck(app);
    updateExportButton();
    if (app.state.view === 'matrix' && plate.matrix) plate.matrix.querySelectorAll('.thumb').forEach((n) => plate.enqueue(n));
    return true;
  } catch (err) {
    s.fontStatus = 'failed';
    renderFontPicker();
    updateHeroMachine();
    updateExportButton();
    return false;
  }
}

/* ------------------------------------------------------------- the run */

async function startRun(from = 0) {
  const s = app.state;
  if (s.phase === 'generating' || s.phase === 'verifying') return;

  const plan = recomputePlan();
  if (from === 0) s.puzzles = new Array(s.count).fill(null);
  s.embedded = null;
  s.phase = 'generating';
  s.view = 'matrix';
  clear($('#plate-inline'));
  /* before the frame is torn down: the four registration crosses are measured
     where they sit on it, so they can stay on the table while the press runs */
  call('runStart', from);
  plate.renderMatrix();
  setStage('生成中');
  setRuler(from, s.count);
  renderCheck(app);
  updateExportButton();

  const btn = $('#press-btn');
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = false;
  btn.textContent = `生成中 ${from} / ${s.count}`;
  $('#cancel-btn').hidden = false;

  if (!loadedFont(s.fontId) && s.fontStatus !== 'failed') downloadFont();

  const spec = {
    type: s.type,
    seed: s.seed,
    level: s.level,
    size: s.gridSize,
    words: s.words,
    count: s.count,
    from,
  };

  let done = from;
  let verified = 0;
  const total = s.count;

  const result = await engine
    .run(spec, {
      onPuzzle: (index, puzzle) => {
        s.puzzles[index] = puzzle;
        done += 1;
        setRuler(done, total);
        btn.textContent = `生成中 ${done} / ${total}`;
        setPressProgress(btn, done / total);
        plate.updateFor(index);
        if (done % 10 === 0) {
          say(`已生成 ${done} 題，共 ${total} 題`);
          renderCheck(app);
        }
      },
      onPhase: (phase) => {
        if (phase === 'verify') {
          s.phase = 'verifying';
          setStage('驗證中');
          setRuler(0, total);
          renderCheck(app);
        }
      },
      onVerified: (index, verify) => {
        if (s.puzzles[index]) s.puzzles[index].verify = verify;
        verified += 1;
        setRuler(verified, total);
        btn.textContent = `驗證中 ${verified} / ${total}`;
        plate.updateFor(index);
        if (verified % 10 === 0) renderCheck(app);
      },
      onCancelled: () => {},
    })
    .catch((err) => {
      toast(`生成失敗：${err.message}`);
      return { cancelled: true, error: true };
    });

  $('#cancel-btn').hidden = true;
  btn.setAttribute('aria-busy', 'false');
  setPressProgress(btn, 0);

  if (result.cancelled) {
    s.phase = 'cancelled';
    call('runStop');
    setStage('已取消');
    const made = s.puzzles.filter(Boolean).length;
    updatePressButton();
    renderCheck(app);
    const host = clear($('#plate-inline'));
    if (!result.error && made < total) {
      const row = el('div', { class: 'inline-confirm' }, [
        el('span', { text: `已生成 ${made} / ${total}，其餘取消。接著生成的結果與一次跑完完全相同。` }),
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'btn-primary', onclick: () => startRun(made) }, `接著生成剩下 ${total - made} 題`),
      ]);
      host.appendChild(row);
      call('inlineIn', row);
    }
    return;
  }

  s.phase = 'done';
  setStage('完成');
  setRuler(total, total);
  updatePressButton();
  renderCheck(app);
  updateExportButton();

  const failed = s.puzzles.filter((p) => p && p.verify && !p.verify.pass).length;
  say(`${total} 題全部生成完成，複驗 ${total - failed} 之 ${total} 通過。`, true);
  /* the registration moment: four marks converge, the stamp locks, the press
     check turns over. Everything above this line is already final. */
  call('runDone', { clean: failed === 0 });

  await saveRun(plan, failed);
  await savePreset();
  if (s.listId) {
    await store.markListUsed(s.listId, s.title);
    await reloadLists();
  }
}

async function saveRun(plan, failed) {
  const s = app.state;
  const res = await store.addRun({
    at: Date.now(),
    title: s.title,
    seed: s.seed,
    count: s.count,
    pages: plan.pageCount,
    failed,
    type: s.type,
    settings: settingsSnapshot(),
  });
  if (res && res.quota) {
    toast('本機空間滿了。落版紀錄已自動保留最近 8 筆，清單庫沒有被動到。');
  }
  s.runs = await store.getRuns();
  renderTally();
  renderLedger();
}

function settingsSnapshot() {
  const s = app.state;
  return {
    type: s.type,
    count: s.count,
    gridSize: s.gridSize,
    level: s.level,
    trimId: s.trimId,
    bleed: s.bleed,
    largePrint: s.largePrint,
    fontId: s.fontId,
    title: s.title,
    listId: s.listId,
    originName: s.originName,
    words: s.words,
  };
}

async function savePreset() {
  const s = app.state;
  const preset = {
    ...settingsSnapshot(),
    pages: s.plan.pageCount,
    at: Date.now(),
  };
  await store.putPreset(preset, 'last');
  s.lastPreset = preset;
  renderPresetSelect();
}

function applySettings(cfg) {
  const s = app.state;
  if (cfg.type) s.type = cfg.type;
  if (cfg.count) s.count = cfg.count;
  if (cfg.gridSize) s.gridSize = cfg.gridSize;
  if (cfg.level) s.level = cfg.level;
  if (cfg.trimId) s.trimId = cfg.trimId;
  if (cfg.bleed !== undefined) s.bleed = cfg.bleed;
  if (cfg.largePrint !== undefined) s.largePrint = cfg.largePrint;
  if (cfg.fontId) s.fontId = cfg.fontId;
  if (cfg.title) s.title = cfg.title;
  if (Array.isArray(cfg.words)) s.words = cfg.words.slice();
  if (cfg.originName !== undefined) s.originName = cfg.originName;
  if (cfg.listId !== undefined) s.listId = cfg.listId;
  syncControls();
  renderWordListState();
  renderFontPicker();
  refresh();
}

function syncControls() {
  const s = app.state;
  $$('input[name="ptype"]').forEach((n) => {
    n.checked = n.value === s.type;
  });
  $$('input[name="gridsize"]').forEach((n) => {
    n.checked = Number(n.value) === s.gridSize;
  });
  $$('input[name="trim"]').forEach((n) => {
    n.checked = n.value === s.trimId;
  });
  $('#count').value = String(s.count);
  $('#difficulty').value = String(s.level);
  $('#bleed').checked = s.bleed;
  $('#largeprint').checked = s.largePrint;
  $('#booktitle').value = s.title;
  $('#wordlist').value = s.words.map((w) => w.toLowerCase()).join('\n');
}

function renderPresetSelect() {
  const sel = $('#preset');
  const cur = sel.value;
  clear(sel);
  if (app.state.lastPreset) {
    const p = app.state.lastPreset;
    sel.appendChild(
      el('option', {
        value: 'last',
        text: `上次的設定（${TRIMS[p.trimId].label} · ${p.count} 題${typeLabel(p.type)} L${p.level}）`,
      }),
    );
  }
  sel.appendChild(el('option', { value: '', text: '目前的設定' }));
  /* never pre-select the saved preset: the controls below still show the
     current values, and a dropdown that disagrees with them is a lie */
  sel.value = cur === 'last' ? '' : cur || '';
}

/* --------------------------------------------------------------- export */

function updateExportButton() {
  const s = app.state;
  const btn = $('#export-pdf');
  const note = $('#export-note');
  const has = s.puzzles.filter(Boolean).length > 0 && s.phase === 'done';
  const fontReady = !!loadedFont(s.fontId);
  btn.disabled = !has || !fontReady;
  if (!has) note.textContent = '先開印，才有東西可以匯出。';
  else if (!fontReady) note.textContent = '可以先生成題目。匯出 PDF 需要字型檔。';
  else note.textContent = `${filenameFor(meta(), s.plan)} · ${s.plan.pageCount} 頁`;
}

async function exportPdf() {
  const s = app.state;
  const btn = $('#export-pdf');
  const note = $('#export-note');
  const bytes = loadedFont(s.fontId);
  if (!bytes) {
    const ok = await downloadFont();
    if (!ok) return;
  }
  let cancelled = false;
  btn.disabled = false;
  btn.textContent = '排版 0 / 0 頁';
  setStage('排版 PDF');

  try {
    await loadLibs();
    const result = await buildPdf({
      plan: s.plan,
      puzzles: s.puzzles,
      meta: meta(),
      fontBytes: loadedFont(s.fontId),
      watermark: false,
      isCancelled: () => cancelled,
      onProgress: (doneN, total, phase) => {
        setRuler(doneN, total);
        if (phase === 'save') {
          btn.textContent = '封裝 PDF…';
          note.textContent = '這一步無法分批，畫面會停住約 2 秒。';
          setStage('封裝');
        } else {
          btn.textContent = `排版 ${doneN} / ${total} 頁`;
        }
      },
    });
    if (result.cancelled) return;

    s.embedded = { glyphs: result.glyphs, overflow: result.overflow, size: result.sizeBytes };
    const blob = new Blob([result.bytes], { type: 'application/pdf' });
    const filename = filenameFor(meta(), s.plan);
    const { url, revoke } = download(blob, filename);
    if (pdfLink) pdfLink.revoke();
    pdfLink = { revoke };
    showDownloadRow(url, filename, result.sizeBytes, revoke);

    btn.textContent = '已匯出';
    setStage('完成');
    renderCheck(app);
    setTimeout(() => {
      btn.textContent = '匯出內頁 PDF';
      updateExportButton();
    }, 1800);
  } catch (err) {
    btn.textContent = '匯出內頁 PDF';
    setStage('完成');
    const host = clear($('#check-alerts'));
    const oom = /allocation|RangeError|memory/i.test(err.message || '');
    host.appendChild(
      alertRow(
        oom
          ? `${s.plan.pageCount} 頁一次封裝超過這個分頁的記憶體。`
          : `PDF 產生失敗：${err.message}`,
        oom
          ? [
              {
                label: '分兩份匯出',
                run: () => toast('分兩份匯出會沿用合併後總頁數算出的 gutter，頁碼接續不從 1 開始。'),
              },
            ]
          : [{ label: '重試', run: () => exportPdf() }],
      ),
    );
  }
}

function showDownloadRow(url, filename, size, revoke) {
  const host = clear($('#check-download'));
  const row = el('div', { class: 'inline-confirm' }, [
    el('a', { class: 'btn-primary', href: url, download: filename }, [
      icon('download'),
      document.createTextNode(`下載 ${filename}`),
    ]),
    el('span', { class: 'note', text: bytesLabel(size) }),
  ]);
  host.appendChild(row);
  setTimeout(() => {
    revoke();
    clear(host).appendChild(el('p', { class: 'note', text: '下載連結已釋放。按「匯出內頁 PDF」重新產生。' }));
  }, 60000);
}

function exportCheckText() {
  const blob = new Blob([checkText(app)], { type: 'text/plain;charset=utf-8' });
  const base = (app.state.title || 'puzzle-book').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  const { revoke } = download(blob, `${base}-press-check.txt`);
  setTimeout(revoke, 20000);
  toast('驗印單已存成純文字檔');
}

/* ------------------------------------------------------------ inspector */

app.openInspector = (pageNumber) => {
  app.state.view = 'inspector';
  app.state.inspectPage = Math.max(1, Math.min(app.state.plan.pageCount, pageNumber));
  plate.renderInspector(app.state.inspectPage);
};

app.closeInspector = () => {
  app.state.view = 'matrix';
  plate.renderMatrix();
  const node = $(`#plate-body [data-page="${app.state.inspectPage}"]`);
  if (node) {
    node.tabIndex = 0;
    node.focus();
  }
};

app.rerollOne = async (index) => {
  const s = app.state;
  const salt = ((s.puzzles[index] && s.puzzles[index].salt) || 0) + 1;
  const { generateOne } = await import('./puzzles/generate.js');
  const { verifyPuzzle } = await import('./puzzles/verify.js');
  const puzzle = generateOne({
    type: s.type,
    seed: s.seed,
    level: s.level,
    size: s.gridSize,
    words: s.words,
    index,
    salt,
  });
  puzzle.salt = salt;
  puzzle.verify = verifyPuzzle(puzzle);
  s.puzzles[index] = puzzle;
  renderCheck(app);
  plate.renderInspector(s.inspectPage);
  toast(`第 ${index + 1} 題已重擲，其餘 ${s.count - 1} 題不動`);
};

/* ------------------------------------------------------------ seed flow */

function confirmReseed(newSeed) {
  const s = app.state;
  const apply = () => {
    s.seed = newSeed;
    $('#seed').value = newSeed;
    s.puzzles = [];
    s.embedded = null;
    s.phase = 'idle';
    s.view = 'frame';
    clear($('#plate-inline'));
    plate.renderFrame();
    refresh();
    updateExportButton();
    startRun();
  };
  if (!s.puzzles.filter(Boolean).length) {
    s.seed = newSeed;
    $('#seed').value = newSeed;
    refresh();
    return;
  }
  inlineConfirm(
    $('#plate-inline'),
    `換種子會重生全部 ${s.count} 題。舊的成果不會保留。`,
    '換種子重生',
    apply,
  );
}

/* --------------------------------------------------------------- wiring */

function bindSetup() {
  $$('input[name="ptype"]').forEach((n) =>
    n.addEventListener('change', () => {
      if (!n.checked) return;
      const prev = app.state.type;
      app.state.type = n.value;
      if (app.state.puzzles.filter(Boolean).length) {
        const host = clear($('#plate-inline'));
        host.appendChild(
          el('div', { class: 'inline-confirm' }, [
            el('span', { text: `落版台上是 ${app.state.count} 題${typeLabel(prev)}。改用${typeLabel(n.value)}要重新開印。` }),
            el('span', { class: 'spacer' }),
            el('button', {
              type: 'button',
              class: 'btn-hair',
              onclick: () => {
                app.state.puzzles = [];
                app.state.view = 'frame';
                clear(host);
                plate.renderFrame();
                refresh();
                updateExportButton();
              },
            }, '清空落版台'),
          ]),
        );
      }
      refresh();
    }),
  );

  $$('input[name="gridsize"]').forEach((n) =>
    n.addEventListener('change', () => {
      if (n.checked) setGrid(Number(n.value));
    }),
  );

  $('#count').addEventListener('change', (e) => setCount(Number(e.target.value)));
  $('#count').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      setCount(app.state.count + (e.key === 'ArrowUp' ? step : -step));
    }
  });
  $('#count-up').addEventListener('click', () => setCount(app.state.count + 1));
  $('#count-down').addEventListener('click', () => setCount(app.state.count - 1));

  $('#wordlist').addEventListener('input', debounce((e) => {
    const parsed = parseWordList(e.target.value);
    app.state.words = parsed.words;
    app.state.nonLatin = parsed.nonLatin;
    app.state.listId = null;
    app.state.originName = '';
    renderWordListState();
    refresh();
  }, 180));

  $('#save-list').addEventListener('click', () => saveCurrentList());
  $('#open-drawer').addEventListener('click', () => drawer.toggle());

  $$('input[name="trim"]').forEach((n) =>
    n.addEventListener('change', () => {
      if (!n.checked) return;
      app.state.trimId = n.value;
      if (n.value === 'digest' && app.state.gridSize > 15) {
        setGrid(15);
        $('#grid-note').hidden = false;
        $('#grid-note').textContent = '6 × 9 的內容區寬 5.25 in，網格上限 15 × 15。已改為 15 × 15。';
      } else $('#grid-note').hidden = true;
      refresh();
    }),
  );

  $('#bleed').addEventListener('change', (e) => {
    app.state.bleed = e.target.checked;
    refresh();
  });
  $('#largeprint').addEventListener('change', (e) => {
    app.state.largePrint = e.target.checked;
    refresh();
  });
  $('#booktitle').addEventListener('input', (e) => {
    app.state.title = e.target.value;
    const han = /\p{Script=Han}/u.test(e.target.value);
    const note = $('#title-note');
    note.hidden = !han;
    if (han) note.textContent = '書名含中文字。內頁字型只嵌入拉丁字母，中文字會被略過，建議改用英文書名。';
    updateExportButton();
  });

  $('#difficulty').addEventListener('input', (e) => {
    app.state.level = Number(e.target.value);
    refresh();
  });

  $('#preset').addEventListener('change', (e) => {
    if (e.target.value === 'last' && app.state.lastPreset) applySettings(app.state.lastPreset);
  });

  $('#press-btn').addEventListener('click', () => {
    const s = app.state;
    if (s.phase === 'generating' || s.phase === 'verifying') {
      engine.cancel();
      return;
    }
    if (s.puzzles.filter(Boolean).length) {
      confirmReseed(randomSeed());
      return;
    }
    startRun();
  });
  $('#press-btn').addEventListener('pointerenter', () => {
    const btn = $('#press-btn');
    if (btn.getAttribute('aria-busy') === 'true') btn.dataset.label = btn.textContent;
    if (btn.getAttribute('aria-busy') === 'true') btn.textContent = '取消生成';
  });
  $('#press-btn').addEventListener('pointerleave', () => {
    const btn = $('#press-btn');
    if (btn.getAttribute('aria-busy') === 'true' && btn.dataset.label) btn.textContent = btn.dataset.label;
  });

  $('#cancel-btn').addEventListener('click', () => engine.cancel());
  $('#export-pdf').addEventListener('click', () => exportPdf());
  $('#export-check').addEventListener('click', () => exportCheckText());

  app.dom.heroPrimary.addEventListener('click', () => {
    if (app.state.lastPreset) {
      applySettings(app.state.lastPreset);
      startRun();
    } else loadExample();
  });
  app.dom.heroSecondary.addEventListener('click', () => {
    if (app.state.lastPreset) drawer.open('mine');
    else {
      $('#fs-source').open = true;
      $('#wordlist').focus();
    }
  });

  $('#keys-toggle').addEventListener('click', () => {
    const panel = $('#keys-panel');
    const open = panel.hidden;
    panel.hidden = !open;
    $('#keys-toggle').setAttribute('aria-expanded', String(open));
  });
}

function setGrid(size) {
  app.state.gridSize = size;
  $$('input[name="gridsize"]').forEach((n) => {
    n.checked = Number(n.value) === size;
  });
  renderWordListState();
  refresh();
}

function setCount(n) {
  const clamped = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Number.isFinite(n) ? Math.round(n) : app.state.count));
  app.state.count = clamped;
  $('#count').value = String(clamped);
  const note = $('#count-note');
  if (n < MIN_COUNT) {
    note.hidden = false;
    note.textContent = `最少 ${MIN_COUNT} 題`;
  } else if (n > MAX_COUNT) {
    note.hidden = false;
    note.textContent = `最多 ${MAX_COUNT} 題（KDP 上限 828 頁）`;
  }
  renderWordListState();
  refresh();
}

async function saveCurrentList() {
  const s = app.state;
  const host = $('#wordlist-alerts');
  clear(host);
  const suggested = s.words.slice(0, 3).map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
  const input = el('input', { class: 'input', type: 'text', value: s.originName || suggested, maxlength: '40' });
  const form = el('div', { class: 'name-form' }, [
    input,
    el(
      'button',
      {
        type: 'button',
        class: 'btn-primary',
        onclick: async () => {
          const name = input.value.trim() || suggested;
          const row = await store.putList({
            id: `l${Date.now().toString(36)}`,
            name,
            words: s.words.slice(),
            uses: 0,
            tooLongWords: [],
          });
          s.listId = row.id;
          s.originName = name;
          await reloadLists();
          drawer.render();
          clear(host);
          renderWordListState();
          toast(`已存為「${name}」`);
        },
      },
      '儲存',
    ),
    el('button', { type: 'button', class: 'btn-hair', onclick: () => clear(host) }, '取消'),
  ]);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') form.querySelector('.btn-primary').click();
    if (e.key === 'Escape') clear(host);
  });
  host.appendChild(form);
  input.focus();
  input.select();
}

function bindSeed() {
  const input = $('#seed');
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    input.value = normaliseSeed(input.value);
    const hint = $('#seed-hint');
    const raw = input.value.replace('-', '');
    if (raw.length < 8) hint.textContent = `還需要 ${8 - raw.length} 個字元`;
    else hint.textContent = 'Enter 套用';
    try {
      input.setSelectionRange(pos, pos);
    } catch (err) {
      /* Safari throws on detached inputs */
    }
  });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('blur', () => {
    $('#seed-hint').textContent = '';
    if (!isCompleteSeed(input.value)) input.value = app.state.seed;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!isCompleteSeed(input.value)) return;
    confirmReseed(input.value);
    input.blur();
  });

  $('#seed-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(app.state.seed);
    } catch (err) {
      const t = el('textarea', { style: 'position:fixed;opacity:0' });
      t.value = app.state.seed;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    const btn = $('#seed-copy');
    btn.classList.add('is-done');
    clear(btn).appendChild(icon('check'));
    say('種子已複製');
    setTimeout(() => {
      btn.classList.remove('is-done');
      clear(btn).appendChild(icon('copy'));
    }, 1600);
  });

  $('#seed-reroll').addEventListener('click', () => confirmReseed(randomSeed()));
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

    if (e.key === 'Escape') {
      if (app.state.view === 'inspector') {
        app.closeInspector();
        return;
      }
      if (drawer.isOpen) {
        drawer.close();
        return;
      }
      if ($('#plate-inline').firstChild) {
        clear($('#plate-inline'));
        return;
      }
      if (!$('#keys-panel').hidden) {
        $('#keys-toggle').click();
        return;
      }
      if (app.state.phase === 'generating' || app.state.phase === 'verifying') {
        if (app.state.escArmed) {
          engine.cancel();
          app.state.escArmed = false;
        } else {
          app.state.escArmed = true;
          setStage('再按一次 Esc 取消生成');
          setTimeout(() => {
            app.state.escArmed = false;
            if (app.state.phase === 'generating') setStage('生成中');
            else if (app.state.phase === 'verifying') setStage('驗證中');
          }, 1500);
        }
      }
      return;
    }

    if (typing) return;
    const k = e.key.toLowerCase();
    if (k === '1' || k === '2' || k === '3') {
      const map = { 1: 'wordsearch', 2: 'sudoku', 3: 'maze' };
      const target = $$('input[name="ptype"]').find((n) => n.value === map[k]);
      if (target) {
        target.checked = true;
        target.dispatchEvent(new Event('change'));
      }
    } else if (k === 'g') $('#press-btn').click();
    else if (k === 'r') $('#seed-reroll').click();
    else if (k === 'l') drawer.toggle();
    else if (k === 'e') {
      if (!$('#export-pdf').disabled) exportPdf();
    } else if (k === '?' || (e.key === '/' && e.shiftKey)) $('#keys-toggle').click();
    else if (app.state.view === 'inspector' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      app.openInspector(app.state.inspectPage + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });

  /* roving grid navigation on the plate table */
  $('#plate-body').addEventListener('keydown', (e) => {
    if (app.state.view !== 'matrix') return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const thumbs = $$('.thumb', $('#plate-body'));
    const at = thumbs.indexOf(document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    const perRow = Math.max(1, Math.round($('.matrix').clientWidth / (thumbs[0].clientWidth + 16)));
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow, ArrowDown: perRow }[e.key];
    const next = Math.max(0, Math.min(thumbs.length - 1, at + delta));
    thumbs[at].tabIndex = -1;
    thumbs[next].tabIndex = 0;
    thumbs[next].focus();
  });
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ------------------------------------------------------------- example */

function loadExample() {
  const theme = THEMES.find((t) => t.id === 'kitchen');
  applySettings({
    type: 'wordsearch',
    count: 20,
    gridSize: 15,
    level: 3,
    trimId: 'letter',
    bleed: true,
    largePrint: true,
    fontId: 'atkinson',
    title: 'Kitchen Puzzles',
    words: themeWords(theme),
    originName: theme.name,
    listId: null,
  });
  toast('已載入範例：Kitchen & Cooking，20 題字謎');
  startRun();
}

/* ------------------------------------------------------- browser support */

function checkSupport() {
  const ok =
    typeof structuredClone === 'function' &&
    typeof IntersectionObserver === 'function' &&
    CSS.supports('clip-path', 'inset(0 100% 0 0)');
  if (ok) return true;
  app.dom.heroPrimary.disabled = true;
  app.dom.heroSecondary.disabled = true;
  $('#press-btn').disabled = true;
  const host = $('#plate-inline');
  host.appendChild(alertRow('需要 Chrome 90+、Edge 90+、Firefox 90+ 或 Safari 15.4+。', []));
  return false;
}

/* ----------------------------------------------------------------- boot */

async function boot() {
  app.dom = {
    specRows: $('#spec-rows'),
    verdictRows: $('#verdict-rows'),
    stamp: $('#stamp'),
    stampCount: $('#stamp-count'),
    checkState: $('#check-state'),
  };
  app.frameWrap = $('#frame-wrap');
  app.dom.heroMachine = $('#hero-machine');
  app.dom.heroLast = $('#hero-last');
  app.dom.heroPrimary = $('#hero-primary');
  app.dom.heroSecondary = $('#hero-secondary');

  plate = new Plate(app);
  drawer = new Drawer(app);
  app.plate = plate;
  app.drawer = drawer;

  const ttf = el('input', { type: 'file', id: 'ttf-file', accept: '.ttf,.otf', hidden: true });
  ttf.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    adoptUploaded(app.state.fontId, 'regular', bytes, file.name);
    adoptUploaded(app.state.fontId, 'bold', bytes, file.name);
    app.state.fontStatus = 'ready';
    renderFontPicker();
    updateHeroMachine();
    updateExportButton();
    toast(`已改用上傳的 ${file.name}`);
  });
  document.body.appendChild(ttf);

  bindSetup();
  bindSeed();
  bindKeys();

  const dbOk = await store.init();
  if (!dbOk) {
    const note = $('#db-note');
    note.hidden = false;
    note.textContent = '這個瀏覽器不允許本機資料庫（無痕模式？）。清單庫這次不會被記住，設定會退回 localStorage。';
  }
  await reloadLists();
  app.state.runs = await store.getRuns();
  app.state.lastPreset = await store.getPreset('last');

  /* on a phone the rail is four stacked sections; only the first stays open,
     because scrolling past four expanded fieldsets to reach the press button
     is not a setup rail, it is a form */
  if (window.matchMedia('(max-width: 767px)').matches) {
    ['#fs-source', '#fs-trim', '#fs-font'].forEach((sel) => {
      $(sel).open = false;
    });
  }

  renderPresetSelect();
  renderFontPicker();
  renderTally();
  renderLedger();
  syncControls();
  renderWordListState();

  await engine.prepare();
  refresh();
  updateExportButton();
  checkSupport();

  if (app.state.lastPreset) {
    const p = app.state.lastPreset;
    app.dom.heroPrimary.textContent = '沿用上次設定開印';
    app.dom.heroSecondary.textContent = '換一份清單';
    const last = app.dom.heroLast;
    last.hidden = false;
    last.textContent = `上次：${p.originName || p.title} · ${TRIMS[p.trimId].label} · ${p.count} 題${typeLabel(p.type)} L${p.level} · ${p.pages} 頁 · ${ago(p.at)}`;
  }

  if (import.meta.url) window.__puzzlePress = app;
}

boot().catch((err) => {
  /* boot failures must be visible, never silent */
  const host = $('#plate-inline');
  if (host) host.appendChild(alertRow(`啟動失敗：${err.message}`, []));
  throw err;
});
