/**
 * js/batch.js
 * N designs times M templates, rendered one per animation frame so the tab
 * keeps breathing, and never more than one WebGL context however long the
 * queue is. Cards exist before their render does, so the wall never reflows
 * under the seller's cursor.
 *
 * Blob URLs are revoked whenever a card is replaced or the wall is cleared.
 * Five hundred renders that never release their URLs is how a tab dies.
 */

import { el, schedule } from './util/dom.js';

const FRAME_BUDGET_MS = 24;

export class Batch {
  constructor(refs) {
    Object.assign(this, refs);
    this.jobs = [];
    this.cards = new Map();
    this.results = new Map();
    this.running = false;
    this.cursor = 0;
    this.failed = [];
    this.done = 0;
  }

  get total() { return this.jobs.length; }
  get hasResults() { return this.results.size > 0; }

  /** Lay out every card first. Nothing moves once rendering starts. */
  plan(jobs) {
    this.clear();
    this.jobs = jobs;
    for (const job of jobs) {
      const card = this._card(job);
      this.grid.appendChild(card.node);
      this.cards.set(job.key, card);
    }
    this.emptyEl.hidden = jobs.length > 0;
  }

  clear() {
    for (const [, r] of this.results) URL.revokeObjectURL(r.url);
    this.results.clear();
    this.cards.clear();
    this.grid.textContent = '';
    this.jobs = [];
    this.failed = [];
    this.done = 0;
    this.cursor = 0;
  }

  _card(job) {
    const self = this;
    const bar = el('span', { class: 'wcard-bar' });
    const shot = el('div', { class: 'wcard-shot' }, [bar, el('span', { class: 'wcard-wait' })]);
    const name = el('p', { class: 'wcard-name', text: job.file, title: job.file });
    const meta = el('p', {
      class: 'wcard-meta',
      text: `${job.templateLabel}・${job.blendLabel}・光 ${job.light.azimuth} 度`
    });
    const actions = el('div', { class: 'wcard-actions' });
    const node = el('div', {
      class: 'wcard',
      tabindex: '-1',
      'data-key': job.key,
      'aria-label': job.file
    }, [shot, name, meta, actions]);

    return {
      node, shot, bar, name, actions,
      progress(p) { bar.style.width = `${Math.round(p * 100)}%`; },
      /**
       * One image, arriving. `.is-done` lands at the exact moment this card's
       * GPU work finished, so the wall's rhythm is the machine's rhythm and
       * not a stagger somebody chose. js/motion.js listens on onCardShown.
       */
      show(url) {
        bar.style.width = '0%';
        shot.textContent = '';
        const img = el('img', { src: url, alt: '', class: 'wcard-img', loading: 'lazy' });
        shot.appendChild(img);
        node.classList.add('is-done');
        self.onCardShown?.(img, node);
        return img;
      },
      fail(onRetry) {
        node.classList.add('is-failed');
        shot.textContent = '';
        name.textContent = '這張沒算出來';
        actions.textContent = '';
        actions.appendChild(el('button', {
          type: 'button', class: 'btn btn-text', text: '重算', onclick: onRetry
        }));
      }
    };
  }

  async start() {
    if (this.running || !this.jobs.length) return;
    this.running = true;
    this.cursor = 0;
    this.done = 0;
    this.failed = [];
    this.onStateChange?.();
    await this._pump();
  }

  cancel() {
    this.running = false;
    this.onStateChange?.();
  }

  /** One render per frame, skipping a frame whenever the last one ran long. */
  _pump() {
    return new Promise((resolve) => {
      const step = async () => {
        if (!this.running || this.cursor >= this.jobs.length) {
          this.running = false;
          this.onStateChange?.();
          resolve();
          return;
        }
        const job = this.jobs[this.cursor++];
        const card = this.cards.get(job.key);
        const t0 = performance.now();
        card?.progress(0.35);
        try {
          const blob = await this.oven.render(job);
          if (!this.running) { resolve(); return; }
          const url = URL.createObjectURL(blob);
          const prev = this.results.get(job.key);
          if (prev) URL.revokeObjectURL(prev.url);
          this.results.set(job.key, { job, blob, url });
          card?.show(url);
          this._wireActions(card, job, url);
          this.done++;
        } catch (err) {
          this.failed.push(job);
          card?.fail(() => this._retryOne(job));
        }
        this.onProgress?.(this.done, this.jobs.length, this.failed.length);
        const spent = performance.now() - t0;
        if (spent > FRAME_BUDGET_MS) schedule(() => schedule(step));
        else schedule(step);
      };
      schedule(step);
    });
  }

  async _retryOne(job) {
    const card = this.cards.get(job.key);
    if (!card) return;
    card.node.classList.remove('is-failed');
    card.name.textContent = job.file;
    try {
      const blob = await this.oven.render(job);
      const url = URL.createObjectURL(blob);
      this.results.set(job.key, { job, blob, url });
      card.show(url);
      this._wireActions(card, job, url);
      this.failed = this.failed.filter((j) => j.key !== job.key);
      this.done++;
      this.onProgress?.(this.done, this.jobs.length, this.failed.length);
    } catch (err) {
      card.fail(() => this._retryOne(job));
    }
  }

  _wireActions(card, job, url) {
    card.actions.textContent = '';
    card.actions.appendChild(el('a', {
      class: 'btn btn-text', href: url, target: '_blank', rel: 'noopener', text: '開啟'
    }));
    card.actions.appendChild(el('a', {
      class: 'btn btn-text', href: url, download: job.file, text: '下載'
    }));
  }

  /** Retry every job that ran out of memory or otherwise failed. */
  async retryFailed() {
    const list = [...this.failed];
    this.failed = [];
    for (const job of list) await this._retryOne(job);
  }

  orderedResults() {
    return this.jobs.map((j) => this.results.get(j.key)).filter(Boolean);
  }
}
