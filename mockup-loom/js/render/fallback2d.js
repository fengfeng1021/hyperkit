/**
 * js/render/fallback2d.js
 * Reduced mode. No WebGL2 means no displacement, so we say so and keep
 * everything else: placement, colourways, blending, batch and ZIP export.
 *
 * The cloth is still shaded here, it is just shaded once and baked, rather
 * than lit per pixel from a normal. The design sits flat on it.
 */

import { schedule } from '../util/dom.js';

export class Loom2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.uniforms = {
      aspect: 1,
      fabric: [0.72, 0.71, 0.7],
      bg: [0.463, 0.463, 0.463],
      blend: 1,
      hasDesign: 0,
      designCenter: [0.5, 0.5],
      designExtent: [0.3, 0.3],
      designRot: 0,
      printGuard: 0.25,
      displaceScale: 0,
      shadowMix: 0,
      fiberMix: 0,
      seamBite: 0,
      intensity: 0.7,
      azimuth: 315,
      elevation: 42
    };
    this.reduced = true;
    this.lost = false;
    this._pending = false;
    this._maps = null;
    this._design = null;
    this._bakedKey = '';
  }

  setMaps(shapeImage, fieldImage) {
    this._maps = { shape: shapeImage, field: fieldImage };
    this._bakedKey = '';
  }

  setDesign(source) {
    this._design = source || null;
    this.uniforms.hasDesign = source ? 1 : 0;
  }

  resize(w, h) {
    const cw = Math.max(1, Math.round(w));
    const ch = Math.max(1, Math.round(h));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
  }

  requestFrame() {
    if (this._pending) return;
    this._pending = true;
    schedule(() => {
      this._pending = false;
      this.draw();
    });
  }

  /** Bake fabric colour, baked structure and occlusion into three layers. */
  _bake() {
    const u = this.uniforms;
    const key = u.fabric.join(',') + '|' + (this._maps.shape.width) + '|' + u.intensity;
    if (key === this._bakedKey) return;

    const shape = this._maps.shape;
    const field = this._maps.field;
    const W = shape.width;
    const H = shape.height;

    const base = document.createElement('canvas');
    base.width = W; base.height = H;
    const mask = document.createElement('canvas');
    mask.width = W; mask.height = H;
    const coverMask = document.createElement('canvas');
    coverMask.width = W; coverMask.height = H;
    const outMask = document.createElement('canvas');
    outMask.width = W; outMask.height = H;
    const shade = document.createElement('canvas');
    shade.width = W; shade.height = H;

    const baseData = new Uint8ClampedArray(W * H * 4);
    const maskData = new Uint8ClampedArray(W * H * 4);
    const coverData = new Uint8ClampedArray(W * H * 4);
    const outData = new Uint8ClampedArray(W * H * 4);
    const shadeData = new Uint8ClampedArray(W * H * 4);

    const sd = shape.data;
    const fd = field.data;
    const fw = field.width;
    const bg = u.bg.map((v) => v * 255);
    const fab = u.fabric.map((v) => v * 255);

    for (let y = 0; y < H; y++) {
      const fy = Math.min(fw - 1, ((y / H) * fw) | 0);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const fi = (fy * fw + Math.min(fw - 1, ((x / W) * fw) | 0)) * 4;

        const cover = sd[i] / 255;
        const print = sd[i + 1] / 255;
        const detail = 0.55 + (sd[i + 2] / 255) * 0.9;
        const ao = fd[fi + 1] / 255;
        const heather = fd[fi + 2] / 255;
        const thread = fd[fi + 3] / 255;

        // Same constants as the GLSL path, so reduced mode is a quieter
        // version of the same cloth rather than a different-looking product.
        const lit = 0.62 + 0.48 * u.intensity;
        let k = detail * (0.15 + 0.85 * ao) * (0.95 + 0.10 * heather) * (0.95 + 0.10 * thread) * lit;
        const bgk = Math.min(1, detail);

        for (let c = 0; c < 3; c++) {
          const cloth = fab[c] * k;
          const stage = bg[c] * bgk;
          baseData[i + c] = stage + (cloth - stage) * cover;
        }
        baseData[i + 3] = 255;

        maskData[i] = 255; maskData[i + 1] = 255; maskData[i + 2] = 255;
        maskData[i + 3] = cover * print * 255;
        coverData[i] = 255; coverData[i + 1] = 255; coverData[i + 2] = 255;
        coverData[i + 3] = cover * 255;
        outData[i] = 255; outData[i + 1] = 255; outData[i + 2] = 255;
        outData[i + 3] = cover * (1 - print) * 255;

        const g = Math.min(255, k * 255);
        shadeData[i] = g; shadeData[i + 1] = g; shadeData[i + 2] = g;
        shadeData[i + 3] = 255;
      }
    }

    base.getContext('2d').putImageData(new ImageData(baseData, W, H), 0, 0);
    mask.getContext('2d').putImageData(new ImageData(maskData, W, H), 0, 0);
    coverMask.getContext('2d').putImageData(new ImageData(coverData, W, H), 0, 0);
    outMask.getContext('2d').putImageData(new ImageData(outData, W, H), 0, 0);
    shade.getContext('2d').putImageData(new ImageData(shadeData, W, H), 0, 0);

    this._baked = { base, mask, coverMask, outMask, shade, W, H };
    this._bakedKey = key;
  }

  draw() {
    if (!this._maps) return;
    this._bake();
    const u = this.uniforms;
    const ctx = this.ctx;
    const { base, mask, coverMask, outMask, shade } = this._baked;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base, 0, 0, cw, ch);

    if (!this._design) return;

    // The design, placed and shaded, on its own layer.
    const ink = document.createElement('canvas');
    ink.width = cw; ink.height = ch;
    const ic = ink.getContext('2d');

    const cx = u.designCenter[0] * cw;
    const cy = u.designCenter[1] * ch;
    const dw = (u.designExtent[0] / u.aspect) * cw;
    const dh = u.designExtent[1] * ch;

    ic.save();
    ic.translate(cx, cy);
    ic.rotate(u.designRot);
    ic.imageSmoothingQuality = 'high';
    ic.drawImage(this._design, -dw / 2, -dh / 2, dw, dh);
    ic.restore();

    ic.globalCompositeOperation = 'multiply';
    ic.drawImage(shade, 0, 0, cw, ch);

    ic.globalCompositeOperation = 'destination-in';
    if (u.printGuard >= 1) {
      // Export clips hard to the print area. No ink ever leaves it.
      ic.drawImage(mask, 0, 0, cw, ch);
    } else {
      // Preview keeps out-of-area ink visible but faint, so the warning in
      // the interface has something to point at.
      ic.drawImage(coverMask, 0, 0, cw, ch);
      ic.globalCompositeOperation = 'destination-out';
      ic.globalAlpha = 1 - u.printGuard;
      ic.drawImage(outMask, 0, 0, cw, ch);
      ic.globalAlpha = 1;
    }

    const modes = ['source-over', 'multiply', 'screen', 'overlay'];
    ctx.globalCompositeOperation = modes[u.blend] || 'source-over';
    ctx.drawImage(ink, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  dispose() {}
}
