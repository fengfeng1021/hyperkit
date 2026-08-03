/* The drawer canvas: the stage for the signature moment.

   This module owns the data and the drawing. Every sliver is written at its
   resting position the moment its batch arrives, so the drawer fills correctly
   with motion switched off and the canvas is never blank waiting for a tween.

   The motion layer (js/motion.js) tweens these same value objects and calls
   markDirty(). It writes:
     s.ox / s.oy   flight offset, decays to 0; a non-zero offset also draws the
                   two trailing ghosts that make a sliver read as thrown
     s.scale       width multiplier while landing
     s.alpha
     this.field    { scale } one breath of the whole stack when indexing ends
     this.mouth    { a } the amber mark the slivers are thrown from
     this.sweep    { p, a } one pass of light across the finished stack
   All five default to their resting values, so nothing here depends on GSAP.

   Mount points and stable names for that layer:
     .drawer-canvas          the canvas element
     .dropzone__plate        the drawer front plate
     .dropzone__pull         the pull on the plate
     .tabstrip               the row that amber index tabs rise into
     .tabstrip__tab          one tab, one real term from the index
*/

import { onFrame } from "./frame.js";

const CSS = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const MAX_SLIVERS = 4000;

export class DrawerCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.slivers = [];
    this.lastBatch = [];
    this.merged = 1; // conversations represented by one sliver once past the cap
    this.dirty = true;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.range = { min: Infinity, max: -Infinity };
    this.colours = null;

    // Written by the motion layer, read by draw(). Resting values only.
    this.field = { scale: 1 };
    this.mouth = { a: 0 };
    this.sweep = { p: 0, a: 0 };

    this.measure = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (this.cssWidth === rect.width && this.cssHeight === rect.height && this.dpr === dpr) return true;
      this.dpr = dpr;
      this.cssWidth = rect.width;
      this.cssHeight = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      this.relayout();
      return true;
    };
    this.resize = () => {
      this.measure();
      this.dirty = true;
    };
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    this.stopFrame = onFrame(() => {
      if (this.dirty) {
        this.dirty = false;
        this.draw();
      }
    });
  }

  reset() {
    this.slivers = [];
    this.lastBatch = [];
    this.merged = 1;
    this.range = { min: Infinity, max: -Infinity };
    this.field.scale = 1;
    this.mouth.a = 0;
    this.sweep.p = 0;
    this.sweep.a = 0;
    this.dirty = true;
  }

  markDirty() {
    this.dirty = true;
  }

  /** @param {{id:string,createdAt:number,msgCount:number}[]} cards
   *  @returns {object[]} the slivers this batch added, at their resting values */
  addBatch(cards) {
    const start = this.slivers.length;
    for (const card of cards) {
      if (this.slivers.length >= MAX_SLIVERS) {
        this.merged++;
        continue;
      }
      const t = card.createdAt || 0;
      if (t < this.range.min) this.range.min = t;
      if (t > this.range.max) this.range.max = t;
      this.slivers.push({
        t,
        msgs: card.msgCount || 1,
        x: 0,
        y: 0,
        ox: 0,
        oy: 0,
        w: 3,
        h: 3,
        scale: 1,
        alpha: 1,
      });
    }
    this.relayout();
    this.lastBatch = this.slivers.slice(start);
    this.dirty = true;
    this.draw();
    return this.lastBatch;
  }

  /* The stack is a histogram, not a row: a sliver goes into the column its
     conversation belongs to in time, on top of whatever is already there. The
     drawer therefore fills with the actual shape of the archive, which is the
     same shape the spine strip carries for the rest of the session. */
  relayout() {
    if (!this.cssWidth || !this.slivers.length) return;
    const pad = 26;
    const usable = Math.max(1, this.cssWidth - pad * 2);
    const n = this.slivers.length;
    let w = Math.max(2, Math.min(6, usable / n + 1.2));
    let step = w + 1;
    let cols = Math.max(1, Math.floor(usable / step));
    // A small vault would otherwise lie almost flat along the floor. Widening
    // the columns until the stack averages about three cards deep gives every
    // size of archive a profile, without changing what the profile means.
    const wanted = Math.max(6, Math.ceil(n / 3));
    if (wanted < cols) {
      cols = wanted;
      step = usable / cols;
      w = Math.max(3, Math.min(14, step - 2));
    }
    const floorY = this.cssHeight - 34;
    const span = this.range.max - this.range.min;
    const flat = !(span > 0);

    if (!this.stack || this.stack.length !== cols) this.stack = new Int32Array(cols);
    this.stack.fill(0);

    const colOf = (s, i) => {
      const u = flat ? i / Math.max(1, n - 1) : (s.t - this.range.min) / span;
      return Math.max(0, Math.min(cols - 1, Math.floor(u * cols)));
    };
    for (let i = 0; i < n; i++) this.stack[colOf(this.slivers[i], i)]++;
    let tallest = 1;
    for (let i = 0; i < cols; i++) if (this.stack[i] > tallest) tallest = this.stack[i];

    /* One card is drawn at whatever size lets the whole stack stand about a
       third of the way up the drawer. Forty seven conversations get thick
       cards, three thousand get thin ones, and both look like a filled drawer
       rather than a line on the floor. */
    const rowStep = Math.max(4, Math.min(9, Math.round((this.cssHeight * 0.34) / tallest)));
    const h = Math.max(3, Math.min(8, rowStep - 1));
    const maxRows = Math.max(1, Math.floor((this.cssHeight - 76) / rowStep));

    this.stack.fill(0);
    for (let i = 0; i < n; i++) {
      const s = this.slivers[i];
      const col = colOf(s, i);
      const row = this.stack[col]++;
      s.x = pad + col * step;
      s.w = w;
      s.h = h;
      s.y = floorY - Math.min(row, maxRows) * rowStep - h;
    }
    this.floorY = floorY;
    this.mouthX = pad + usable / 2;
  }

  readColours() {
    this.colours = {
      recessed: CSS("--surface-recessed") || "#E7E7E2",
      ink: CSS("--ink") || "#1C1C1A",
      amber: CSS("--amber") || "#C8901A",
      rule: CSS("--rule") || "#D2D2CB",
    };
  }

  draw() {
    const { ctx } = this;
    if (!ctx) return;
    if (!this.measure()) return;
    if (!this.colours) this.readColours();
    const c = this.colours;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cw = this.cssWidth;
    const chh = this.cssHeight;
    ctx.clearRect(0, 0, cw, chh);

    if (this.mouth.a > 0) {
      ctx.globalAlpha = this.mouth.a;
      ctx.fillStyle = c.amber;
      ctx.fillRect(Math.round((this.mouthX || cw / 2) - 14), 0, 28, 2);
      ctx.globalAlpha = 1;
    }

    if (this.slivers.length) {
      const fs = this.field.scale;
      const originY = this.floorY || chh;
      if (fs !== 1) {
        ctx.save();
        ctx.translate(cw / 2, originY);
        ctx.scale(fs, fs);
        ctx.translate(-cw / 2, -originY);
      }

      for (const s of this.slivers) {
        const ox = s.ox;
        const oy = s.oy;
        const wide = Math.max(0.5, s.w * s.scale);
        if (ox * ox + oy * oy > 1) {
          // two ghosts further back along the flight path: a card thrown into
          // the drawer, not a card teleported into it
          ctx.fillStyle = c.ink;
          ctx.globalAlpha = s.alpha * 0.2;
          ctx.fillRect(Math.round(s.x + ox * 1.95), Math.round(s.y + oy * 1.95), wide, s.h);
          ctx.globalAlpha = s.alpha * 0.36;
          ctx.fillRect(Math.round(s.x + ox * 1.42), Math.round(s.y + oy * 1.42), wide, s.h);
        }
        const x = Math.round(s.x + ox);
        const y = Math.round(s.y + oy);
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = c.ink;
        ctx.fillRect(x, y, wide, s.h);
        ctx.globalAlpha = s.alpha * 0.35;
        ctx.fillStyle = c.rule;
        ctx.fillRect(x, y + s.h, wide, 1);
      }
      ctx.globalAlpha = 1;
      if (fs !== 1) ctx.restore();
    }

    if (this.sweep.a > 0) {
      const x = this.sweep.p * (cw + 200) - 100;
      const g = ctx.createLinearGradient(x - 70, 0, x + 70, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${this.sweep.a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, chh);
    }
  }

  destroy() {
    this.observer.disconnect();
    if (this.stopFrame) this.stopFrame();
  }
}

/** The amber tab strip: one real term per rise, never a decorative word. */
export class TabStrip {
  constructor(host) {
    this.host = host;
    this.terms = [];
  }

  reset() {
    this.terms = [];
    this.host.textContent = "";
  }

  push(term) {
    if (!term || this.terms.includes(term)) return;
    this.terms.push(term);
    const tab = document.createElement("span");
    tab.className = "tabstrip__tab";
    tab.textContent = term;
    this.host.append(tab);
    while (this.host.childElementCount > 26) this.host.firstElementChild.remove();
  }
}
