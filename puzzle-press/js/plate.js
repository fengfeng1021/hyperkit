/* The plate table: empty frame, thumbnail matrix, single page inspector.
   Thumbnails are painted lazily as they scroll into view and at most six per
   animation frame, so a 258 page book never locks the main thread. */

import { el, clear, icon, $ } from './dom.js';
import { call } from './fx.js';
import { renderPage } from './thumbs.js';
import { rectFor } from './layout.js';
import { trimRect } from './kdp.js';

const PER_FRAME = 6;

export class Plate {
  constructor(app) {
    this.app = app;
    this.host = $('#plate-body');
    this.bar = $('#plate-bar');
    this.queue = [];
    this.pending = false;
    this.observer = null;
  }

  renderFrame() {
    const { state } = this.app;
    /* the frame is back, so the four crosses belong to it again */
    call('runStop');
    this.bar.hidden = true;
    clear(this.host);
    this.host.appendChild(this.app.frameWrap);
    const frame = $('#frame');
    if (frame) frame.style.setProperty('aspect-ratio', state.trimId === 'letter' ? '8.5 / 11' : '6 / 9');
  }

  renderMatrix() {
    const { state } = this.app;
    const plan = state.plan;
    this.teardown();
    clear(this.host);

    this.bar.hidden = false;
    clear(this.bar);
    plan.sections.forEach((s) => {
      this.bar.appendChild(
        el(
          'button',
          {
            type: 'button',
            class: 'sect-btn',
            onclick: () => {
              const node = this.host.querySelector(`[data-page="${s.from}"]`);
              if (node) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
            },
          },
          [document.createTextNode(s.label), el('b', { text: `${s.from}-${s.to}` })],
        ),
      );
    });

    const matrix = el('div', { class: 'matrix', role: 'grid', 'aria-label': '落版台頁面縮圖' });
    plan.pages.forEach((page) => {
      matrix.appendChild(this.thumbNode(page));
    });
    this.host.appendChild(matrix);
    this.matrix = matrix;
    this.observe();
  }

  thumbNode(page) {
    const { state } = this.app;
    const puzzle = page.kind === 'puzzle' ? state.puzzles[page.puzzleIndex] : null;
    const ratio = state.plan.geo.pageHpt / state.plan.geo.pageWpt;

    const canvas = el('canvas', { 'aria-hidden': 'true' });
    canvas.style.aspectRatio = `1 / ${ratio}`;
    canvas.style.width = '100%';

    const node = el(
      'button',
      {
        type: 'button',
        class: 'thumb',
        role: 'gridcell',
        dataset: { page: page.n, kind: page.kind },
        'aria-label': this.thumbLabel(page, puzzle),
        tabindex: page.n === 1 ? '0' : '-1',
        onclick: () => this.app.openInspector(page.n),
      },
      [canvas, el('span', { class: 'thumb-folio', text: String(page.n) })],
    );

    const ready = page.kind !== 'puzzle' || puzzle;
    node.classList.toggle('is-pending', !ready);
    if (ready) node.appendChild(this.markNode(page, puzzle));
    node.dataset.ready = ready ? '1' : '0';
    /* a sheet that already has content gets swept in on its first paint; a
       pending silhouette waits until its puzzle actually arrives */
    if (ready) node.dataset.sweep = '1';
    return node;
  }

  markNode(page, puzzle) {
    if (page.kind !== 'puzzle') return el('span', { class: 'thumb-mark' });
    if (!puzzle || !puzzle.verify) return el('span', { class: 'thumb-mark unverified' });
    if (puzzle.verify.pass) return el('span', { class: 'thumb-mark verified' });
    const bad = el('span', { class: 'thumb-mark failed', title: puzzle.verify.reason });
    bad.appendChild(icon('slash'));
    return bad;
  }

  thumbLabel(page, puzzle) {
    const kind = {
      title: '書名頁',
      toc: '目錄',
      howto: '使用說明',
      puzzle: '題目頁',
      divider: '解答分隔頁',
      answer: '答案頁',
      blank: '補頁',
    }[page.kind];
    const state = puzzle
      ? puzzle.verify
        ? puzzle.verify.pass
          ? '已驗證'
          : `未通過：${puzzle.verify.reason}`
        : '尚未驗證'
      : page.kind === 'puzzle'
        ? '尚未生成'
        : '';
    return `第 ${page.n} 頁，${kind}${page.kind === 'puzzle' ? `，題目 ${page.puzzleIndex + 1}` : ''}${state ? `，${state}` : ''}`;
  }

  /** One puzzle arrived: repaint just the pages that show it. */
  updateFor(puzzleIndex) {
    if (!this.matrix) return;
    const { state } = this.app;
    state.plan.pages.forEach((page) => {
      const shows =
        (page.kind === 'puzzle' && page.puzzleIndex === puzzleIndex) ||
        (page.kind === 'answer' && page.answers.includes(puzzleIndex)) ||
        page.kind === 'toc';
      if (!shows) return;
      const node = this.matrix.querySelector(`[data-page="${page.n}"]`);
      if (!node) return;
      const puzzle = page.kind === 'puzzle' ? state.puzzles[page.puzzleIndex] : null;
      /* only a sheet that was a silhouette a moment ago earns the roller pass.
         the contents page is repainted on every single puzzle and must not */
      if (node.classList.contains('is-pending')) node.dataset.sweep = '1';
      node.classList.remove('is-pending');
      node.dataset.ready = '1';
      node.setAttribute('aria-label', this.thumbLabel(page, puzzle));
      const oldMark = node.querySelector('.thumb-mark');
      const mark = this.markNode(page, puzzle);
      const promoted = oldMark && oldMark.classList.contains('unverified') && mark.classList.contains('verified');
      if (oldMark) oldMark.replaceWith(mark);
      else node.appendChild(mark);
      if (promoted) call('verified', mark);
      this.enqueue(node);
    });
  }

  observe() {
    if (this.observer) this.observer.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            this.enqueue(e.target);
            this.observer.unobserve(e.target);
          }
        });
      },
      { root: this.host, rootMargin: '240px' },
    );
    this.matrix.querySelectorAll('.thumb').forEach((n) => this.observer.observe(n));
  }

  enqueue(node) {
    if (this.queue.includes(node)) return;
    this.queue.push(node);
    if (!this.pending) {
      this.pending = true;
      requestAnimationFrame(() => this.drain());
    }
  }

  drain() {
    const { state } = this.app;
    let n = 0;
    while (this.queue.length && n < PER_FRAME) {
      const node = this.queue.shift();
      n += 1;
      if (!node.isConnected) continue;
      const page = state.plan.pages[Number(node.dataset.page) - 1];
      const canvas = node.querySelector('canvas');
      if (!page || !canvas) continue;
      const width = node.clientWidth || 132;
      try {
        renderPage(canvas, page, state.plan, state.puzzles, this.app.meta(), { width });
        node.classList.add('is-painted');
        if (node.dataset.sweep === '1') {
          delete node.dataset.sweep;
          call('sheet', node);
        }
      } catch (err) {
        node.classList.add('is-failed');
        delete node.dataset.sweep;
      }
    }
    if (this.queue.length) requestAnimationFrame(() => this.drain());
    else this.pending = false;
  }

  teardown() {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    this.queue = [];
    this.matrix = null;
  }

  /* ---------- inspector ---------- */

  renderInspector(pageNumber) {
    const { state } = this.app;
    const plan = state.plan;
    const page = plan.pages[pageNumber - 1];
    this.teardown();
    clear(this.host);
    this.bar.hidden = true;

    const canvas = el('canvas', { 'aria-hidden': 'true' });
    const sheet = el('div', { class: 'insp-sheet' }, [canvas]);

    const layers = el('div', { class: 'insp-layers' });
    [
      ['trim', '裁切線 trim'],
      ['bleed', '出血 bleed'],
      ['gutter', 'Gutter'],
      ['safe', '安全區'],
    ].forEach(([k, label]) => {
      const input = el('input', {
        type: 'checkbox',
        id: `layer-${k}`,
        checked: state.annotations[k],
        onchange: (e) => {
          state.annotations[k] = e.target.checked;
          this.paintInspector(canvas, page);
        },
      });
      layers.appendChild(el('label', { for: `layer-${k}` }, [input, document.createTextNode(label)]));
    });

    const bar = el('div', { class: 'insp-bar' }, [
      el('button', { type: 'button', class: 'btn-hair', onclick: () => this.app.closeInspector() }, '回落版台'),
      el('span', { class: 'insp-count', text: `第 ${pageNumber} 頁 / 共 ${plan.pageCount} 頁` }),
      el(
        'button',
        {
          type: 'button',
          class: 'btn-hair',
          disabled: pageNumber <= 1,
          onclick: () => this.app.openInspector(pageNumber - 1),
        },
        '上一頁',
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'btn-hair',
          disabled: pageNumber >= plan.pageCount,
          onclick: () => this.app.openInspector(pageNumber + 1),
        },
        '下一頁',
      ),
      layers,
    ]);

    const r = rectFor(page, plan);
    const t = trimRect(page.n, plan.trim, plan.bleed);
    const facts = el('dl', { class: 'insp-facts' }, [
      fact('裁切線 trim', `${plan.trim.w} × ${plan.trim.h} in`, `${t.w} × ${t.h} pt`),
      fact('出血 bleed', plan.bleed ? '+0.125 in' : '關閉', plan.bleed ? '上、下、外三邊' : '內側從不出血'),
      fact('Gutter', `${plan.gutterIn} in`, `${plan.pageCount} 頁落在 ${plan.tier.label} 級距`, true),
      fact('安全區', `${plan.geo.outerIn} in`, `內容區 ${r.w} × ${r.h} pt`),
      fact('頁面位置', page.n % 2 === 1 ? '右頁（gutter 在左）' : '左頁（gutter 在右）', `第 ${page.n} 頁`),
    ]);

    const reroll =
      page.kind === 'puzzle' && state.puzzles[page.puzzleIndex]
        ? el(
            'button',
            {
              type: 'button',
              class: 'btn-hair',
              onclick: () => this.app.rerollOne(page.puzzleIndex),
            },
            `重擲第 ${page.puzzleIndex + 1} 題`,
          )
        : null;
    const rerollNote =
      page.kind === 'puzzle'
        ? el('p', {
            class: 'note',
            text: `只有第 ${page.puzzleIndex + 1} 題會變，其餘 ${plan.count - 1} 題不動。子種子是 hash(seed, 題型, 題號)。`,
          })
        : null;

    const side = el('div', {}, [facts, reroll, rerollNote].filter(Boolean));
    this.host.appendChild(el('div', { class: 'inspector' }, [bar, el('div', { class: 'insp-stage' }, [sheet, side])]));
    this.paintInspector(canvas, page);
  }

  paintInspector(canvas, page) {
    const { state } = this.app;
    const avail = Math.max(240, Math.min(this.host.clientWidth - 280, 560));
    const maxH = Math.max(320, this.host.clientHeight - 120);
    const byH = maxH / (state.plan.geo.pageHpt / state.plan.geo.pageWpt);
    renderPage(canvas, page, state.plan, state.puzzles, this.app.meta(), {
      width: Math.min(avail, byH),
      annotate: true,
      layers: state.annotations,
    });
  }
}

function fact(name, value, why, isGutter) {
  return el('div', { class: `insp-fact${isGutter ? ' is-gutter' : ''}` }, [
    el('dt', { text: name }),
    el('dd', { text: value }),
    el('dd', { text: why }),
  ]);
}
