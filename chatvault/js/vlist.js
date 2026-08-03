/* Virtual scrolling.

   Two variants, one file. Fixed row height for the index list, where the row is
   a card of known size; measured height for the reading pane, where a message
   is whatever length the user wrote.

   The scroll listener is on the CONTAINER, is passive, and only records a
   number. The repaint happens at most once per frame from the shared frame
   scheduler. That is the correct shape for a virtual list, and it is not the
   thing the motion guidance warns about, which is driving animation from a
   window scroll handler. */

import { onFrame } from "./frame.js";

const OVERSCAN = 6;

export class FixedList {
  /**
   * @param {HTMLElement} viewport scrolling element
   * @param {HTMLElement} spacer   element that carries the total height
   * @param {HTMLElement} track    element the rows live in
   * @param {(index:number, row:HTMLElement)=>void} renderRow
   */
  constructor(viewport, spacer, track, renderRow, rowHeight) {
    this.viewport = viewport;
    this.spacer = spacer;
    this.track = track;
    this.renderRow = renderRow;
    this.rowHeight = rowHeight;
    this.count = 0;
    this.pending = 0;
    this.rendered = { from: -1, to: -1 };
    this.pool = [];
    this.dirty = true;

    this.onScroll = () => {
      this.pending = this.viewport.scrollTop;
      this.dirty = true;
    };
    this.viewport.addEventListener("scroll", this.onScroll, { passive: true });
    this.stop = onFrame(() => this.tick());
    this.resizeObserver = new ResizeObserver(() => {
      this.dirty = true;
    });
    this.resizeObserver.observe(this.viewport);
  }

  setRowHeight(h) {
    if (h !== this.rowHeight) {
      this.rowHeight = h;
      this.rendered = { from: -1, to: -1 };
      this.dirty = true;
    }
  }

  setCount(n) {
    this.count = n;
    this.spacer.style.height = `${n * this.rowHeight}px`;
    this.rendered = { from: -1, to: -1 };
    this.dirty = true;
    // paint now rather than waiting for a frame: rows are content, and content
    // must not depend on an animation frame ever arriving
    this.tick();
  }

  refresh() {
    this.rendered = { from: -1, to: -1 };
    this.dirty = true;
    this.tick();
  }

  scrollToIndex(i, mode = "nearest") {
    const top = i * this.rowHeight;
    const bottom = top + this.rowHeight;
    const view = this.viewport.scrollTop;
    const height = this.viewport.clientHeight;
    if (mode === "center") this.viewport.scrollTop = top - height / 2 + this.rowHeight / 2;
    else if (top < view) this.viewport.scrollTop = top;
    else if (bottom > view + height) this.viewport.scrollTop = bottom - height;
    this.dirty = true;
  }

  tick() {
    if (!this.dirty) return;
    this.dirty = false;
    if (!(this.rowHeight > 0)) return;
    const scrollTop = this.viewport.scrollTop || 0;
    // a viewport that has not been measured yet still gets a full window of
    // rows, so the list is never blank waiting for a layout pass
    const height = this.viewport.clientHeight || 720;
    const first = Math.max(0, Math.floor(scrollTop / this.rowHeight) - OVERSCAN);
    const last = Math.max(first, Math.min(this.count, Math.ceil((scrollTop + height) / this.rowHeight) + OVERSCAN));
    if (first === this.rendered.from && last === this.rendered.to) return;
    this.rendered = { from: first, to: last };

    const need = last - first;
    while (this.pool.length < need) {
      const row = document.createElement("div");
      row.className = "vrow";
      this.track.appendChild(row);
      this.pool.push(row);
    }
    for (let k = 0; k < this.pool.length; k++) {
      const row = this.pool[k];
      const index = first + k;
      if (k < need && index < this.count) {
        row.style.transform = `translateY(${index * this.rowHeight}px)`;
        row.style.height = `${this.rowHeight}px`;
        row.hidden = false;
        this.renderRow(index, row);
      } else {
        row.hidden = true;
        row.innerHTML = "";
      }
    }
  }

  destroy() {
    this.viewport.removeEventListener("scroll", this.onScroll);
    this.resizeObserver.disconnect();
    if (this.stop) this.stop();
  }
}

/** Measured-height list for message rows. */
export class MeasuredList {
  constructor(viewport, spacer, track, renderRow, estimate) {
    this.viewport = viewport;
    this.spacer = spacer;
    this.track = track;
    this.renderRow = renderRow;
    this.estimate = estimate;
    this.count = 0;
    this.heights = [];
    this.offsets = [0];
    this.keys = [];
    this.cache = new Map();
    this.pool = [];
    this.dirty = true;
    this.rendered = { from: -1, to: -1 };

    this.onScroll = () => {
      this.dirty = true;
    };
    this.viewport.addEventListener("scroll", this.onScroll, { passive: true });
    this.stop = onFrame(() => this.tick());
    this.resizeObserver = new ResizeObserver(() => {
      this.cache.clear();
      this.setKeys(this.keys);
    });
    this.resizeObserver.observe(this.viewport);
  }

  setKeys(keys) {
    this.keys = keys;
    this.count = keys.length;
    this.heights = keys.map((k) => this.cache.get(k) || this.estimate);
    this.recomputeOffsets();
    this.rendered = { from: -1, to: -1 };
    this.dirty = true;
    this.tick();
  }

  recomputeOffsets() {
    const offsets = new Array(this.count + 1);
    offsets[0] = 0;
    for (let i = 0; i < this.count; i++) offsets[i + 1] = offsets[i] + this.heights[i];
    this.offsets = offsets;
    this.spacer.style.height = `${offsets[this.count]}px`;
  }

  indexAt(y) {
    let lo = 0;
    let hi = this.count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.offsets[mid + 1] <= y) lo = mid + 1;
      else if (this.offsets[mid] > y) hi = mid - 1;
      else return mid;
    }
    return Math.max(0, Math.min(this.count - 1, lo));
  }

  scrollToIndex(i, mode = "start") {
    if (i < 0 || i >= this.count) return;
    const top = this.offsets[i];
    if (mode === "center") this.viewport.scrollTop = top - this.viewport.clientHeight / 2 + this.heights[i] / 2;
    else this.viewport.scrollTop = top - 12;
    this.dirty = true;
  }

  tick() {
    if (!this.dirty || !this.count) return;
    this.dirty = false;
    const scrollTop = this.viewport.scrollTop || 0;
    const height = this.viewport.clientHeight || 720;
    const first = Math.max(0, this.indexAt(scrollTop) - 3);
    const last = Math.max(first, Math.min(this.count, this.indexAt(scrollTop + height) + 4));
    if (first === this.rendered.from && last === this.rendered.to) return;
    this.rendered = { from: first, to: last };

    const need = last - first;
    while (this.pool.length < need) {
      const row = document.createElement("div");
      row.className = "vrow vrow--measured";
      this.track.appendChild(row);
      this.pool.push(row);
    }

    // anchor: keep the first visible row where it was when heights change
    const anchorIndex = first;
    const before = this.offsets[anchorIndex];

    for (let k = 0; k < this.pool.length; k++) {
      const row = this.pool[k];
      const index = first + k;
      if (k < need && index < this.count) {
        row.hidden = false;
        row.style.transform = `translateY(${this.offsets[index]}px)`;
        this.renderRow(index, row);
      } else {
        row.hidden = true;
        row.innerHTML = "";
      }
    }

    // batch the reads after all the writes, then apply in one pass
    let changed = false;
    const measured = [];
    for (let k = 0; k < need; k++) {
      const index = first + k;
      const h = Math.max(24, Math.round(this.pool[k].getBoundingClientRect().height));
      measured.push(h);
      if (Math.abs(h - this.heights[index]) > 1) changed = true;
    }
    if (changed) {
      for (let k = 0; k < need; k++) {
        const index = first + k;
        this.heights[index] = measured[k];
        this.cache.set(this.keys[index], measured[k]);
      }
      this.recomputeOffsets();
      const after = this.offsets[anchorIndex];
      if (after !== before) this.viewport.scrollTop += after - before;
      for (let k = 0; k < need; k++) {
        this.pool[k].style.transform = `translateY(${this.offsets[first + k]}px)`;
      }
      this.rendered = { from: -1, to: -1 };
      this.dirty = true;
    }
  }

  destroy() {
    this.viewport.removeEventListener("scroll", this.onScroll);
    this.resizeObserver.disconnect();
    if (this.stop) this.stop();
  }
}
