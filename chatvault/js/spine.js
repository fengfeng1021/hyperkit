/* The spine strip.

   One sliver per conversation, oldest at the left, height scaled by message
   count. With no query it is the shape of the vault over time. With a query it
   is the result set: this is the live readout, not decoration around the search.

   It is also where the signature moment ends up. The motion layer added in the
   next pass tweens the same `slivers` array; this module owns the data, the
   geometry, the drawing and the keyboard model, and never animates on its own.
   Every sliver is drawn at its resting value from the first frame, so the strip
   is complete and readable whether or not the motion layer ever runs. */

import { onFrame } from "./frame.js";

const CSS = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class SpineStrip {
  constructor(canvas, { onHover, onActivate } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.slivers = []; // { conv, x, w, h, alpha, hit, rank, t }
    this.dirty = true;
    this.cursor = -1;
    this.hover = -1;
    this.onHover = onHover;
    this.onActivate = onActivate;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.colours = null;

    // Measure lazily from draw() as well as from the observer. A canvas that is
    // first laid out while its section is hidden never gets a useful observer
    // callback, and a canvas with a stale backing store draws at the wrong size.
    this.measure = () => {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (this.cssWidth === rect.width && this.cssHeight === rect.height && this.dpr === dpr) return true;
      this.dpr = dpr;
      this.cssWidth = rect.width;
      this.cssHeight = rect.height;
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      this.layout();
      return true;
    };
    this.resize = () => {
      this.measure();
      this.dirty = true;
    };
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);

    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const i = this.indexAt(e.clientX - rect.left);
      if (i !== this.hover) {
        this.hover = i;
        this.dirty = true;
        if (this.onHover) this.onHover(i);
      }
    });
    canvas.addEventListener("pointerleave", () => {
      this.hover = -1;
      this.dirty = true;
      if (this.onHover) this.onHover(-1);
    });
    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const i = this.indexAt(e.clientX - rect.left);
      if (i >= 0 && this.onActivate) this.onActivate(i);
    });
    canvas.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const step = e.key === "ArrowRight" ? 1 : -1;
        this.cursor = Math.max(0, Math.min(this.slivers.length - 1, (this.cursor < 0 ? 0 : this.cursor) + step));
        this.dirty = true;
        if (this.onHover) this.onHover(this.cursor);
      } else if (e.key === "Enter" && this.cursor >= 0 && this.onActivate) {
        e.preventDefault();
        this.onActivate(this.cursor);
      } else if (e.key === "Home") {
        e.preventDefault();
        this.cursor = 0;
        this.dirty = true;
        if (this.onHover) this.onHover(0);
      } else if (e.key === "End") {
        e.preventDefault();
        this.cursor = this.slivers.length - 1;
        this.dirty = true;
        if (this.onHover) this.onHover(this.cursor);
      }
    });

    this.stopFrame = onFrame(() => {
      if (this.dirty) {
        this.dirty = false;
        this.draw();
      }
    });
  }

  readColours() {
    this.colours = {
      paper: CSS("--paper") || "#F2F2EF",
      ink: CSS("--ink") || "#1C1C1A",
      amber: CSS("--amber") || "#C8901A",
      rule: CSS("--rule") || "#D2D2CB",
      ruleStrong: CSS("--rule-strong") || "#B4B4AC",
      ink3: CSS("--ink-3") || "#5E5E57",
    };
  }

  /** @param {{id:string,title:string,createdAt:number,msgCount:number}[]} cards */
  setData(cards) {
    this.cards = cards;
    this.slivers = cards.map((c, i) => ({
      i,
      id: c.id,
      t: c.createdAt,
      msgs: c.msgCount,
      alpha: 0.6,
      scale: 1,
      ta: 0.6, // target alpha and scale; equal to the live values until a
      ts: 1, // motion layer puts a transition between the two
      hit: false,
      rank: -1,
    }));
    this.layout();
    this.dirty = true;
    this.draw();
  }

  layout() {
    const n = this.slivers.length;
    if (!n || !this.cssWidth) return;
    const pad = 12;
    const usable = Math.max(1, this.cssWidth - pad * 2);
    const w = Math.max(1, Math.min(7, usable / n - 1));
    const gap = n * (w + 1) <= usable ? 1 : 0;
    const step = n > 1 ? Math.min(w + gap, usable / n) : usable;
    let maxMsgs = 1;
    for (const s of this.slivers) maxMsgs = Math.max(maxMsgs, s.msgs);
    const logMax = Math.log(1 + maxMsgs);
    for (let i = 0; i < n; i++) {
      const s = this.slivers[i];
      s.x = pad + i * step;
      s.w = Math.max(1, step - gap);
      s.baseH = 2 + (Math.log(1 + s.msgs) / logMax) * 12;
    }
    this.step = step;
    this.pad = pad;
  }

  indexAt(cssX) {
    if (!this.slivers.length || !this.step) return -1;
    const i = Math.round((cssX - this.pad) / this.step);
    return i >= 0 && i < this.slivers.length ? i : -1;
  }

  /**
   * @param {Map<number, {rank:number}>|null} hits conversation array index -> rank
   */
  applyResults(hitsByCard) {
    for (const s of this.slivers) {
      const hit = hitsByCard ? hitsByCard.get(s.i) : undefined;
      if (!hitsByCard) {
        s.hit = false;
        s.rank = -1;
        s.ta = 0.6;
        s.ts = 1;
      } else if (hit) {
        s.hit = true;
        s.rank = hit.rank;
        s.ta = 1;
        s.ts = hit.rank < 3 ? 1.8 : 1.4;
      } else {
        s.hit = false;
        s.rank = -1;
        s.ta = 0.08;
        s.ts = 0.35;
      }
    }
    // With a motion layer attached the strip travels to the new state; without
    // one it is simply in the new state, which is the same readout either way.
    if (this.transition) this.transition();
    else this.settle();
    this.dirty = true;
    this.draw();
  }

  settle() {
    for (const s of this.slivers) {
      s.alpha = s.ta;
      s.scale = s.ts;
    }
  }

  markDirty() {
    this.dirty = true;
  }

  draw() {
    const { ctx } = this;
    if (!ctx) return;
    if (!this.measure()) return;
    if (!this.colours) this.readColours();
    const c = this.colours;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cw = w / this.dpr;
    const ch = h / this.dpr;
    ctx.fillStyle = c.paper;
    ctx.fillRect(0, 0, cw, ch);

    if (!this.slivers.length) return;

    const baseline = ch - 22;

    // year boundaries, drawn under the slivers
    ctx.font = "500 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    let lastYear = null;
    ctx.textBaseline = "top";
    for (const s of this.slivers) {
      const year = new Date(s.t).getFullYear();
      if (Number.isNaN(year)) continue;
      if (lastYear !== null && year !== lastYear) {
        ctx.fillStyle = c.ruleStrong;
        ctx.fillRect(Math.round(s.x) - 1, 8, 1, ch - 24);
        ctx.fillStyle = c.ink3;
        ctx.fillText(String(year), Math.round(s.x) + 4, 6);
      }
      lastYear = year;
    }

    for (const s of this.slivers) {
      const height = Math.max(1.5, s.baseH * s.scale);
      ctx.globalAlpha = Math.max(0.05, s.alpha);
      ctx.fillStyle = c.ink;
      ctx.fillRect(Math.round(s.x), baseline - height, Math.max(1, s.w), height);
      if (s.hit && s.rank >= 0 && s.rank < 3) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.amber;
        ctx.fillRect(Math.round(s.x), baseline - height - 4, Math.max(2, s.w), 2);
      }
    }
    ctx.globalAlpha = 1;

    const marker = this.hover >= 0 ? this.hover : this.cursor;
    if (marker >= 0 && marker < this.slivers.length) {
      const s = this.slivers[marker];
      const height = Math.max(1.5, s.baseH * s.scale) * 1.6;
      ctx.fillStyle = c.ink;
      ctx.fillRect(Math.round(s.x), baseline - height, Math.max(2, s.w), height);
      ctx.fillStyle = c.amber;
      ctx.fillRect(Math.round(s.x), baseline + 2, Math.max(2, s.w), 3);
    }

    ctx.fillStyle = c.rule;
    ctx.fillRect(0, baseline + 0.5, cw, 1);
  }

  destroy() {
    this.observer.disconnect();
    if (this.stopFrame) this.stopFrame();
  }
}
