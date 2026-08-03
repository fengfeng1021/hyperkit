/**
 * js/render/oven.js
 * The second and last WebGL context in this build. Five hundred renders go
 * through this one canvas one at a time; nothing here scales with batch size
 * except the blob list, and even that holds compressed PNG bytes rather than
 * ImageData.
 */

import { LoomGL } from './gl.js';
import { Loom2D } from './fallback2d.js';
import { applyToRenderer } from '../templates/index.js';

export class Oven {
  constructor({ reduced = false } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 64;
    this.canvas.height = 64;
    this.reduced = reduced;
    if (reduced) {
      this.renderer = new Loom2D(this.canvas);
    } else {
      this.renderer = new LoomGL(this.canvas, { preserveDrawingBuffer: true });
    }
    this._mapsKey = '';
    this._designKey = '';
  }

  /** Paint one job. Returns a PNG Blob. */
  async render(job) {
    const r = this.renderer;
    r.resize(job.w, job.h);

    if (this._mapsKey !== job.formId) {
      r.setMaps(job.maps.shape, job.maps.field);
      this._mapsKey = job.formId;
    }
    if (this._designKey !== job.designKey) {
      r.setDesign(job.designSource);
      this._designKey = job.designKey;
    }

    applyToRenderer(r, {
      form: job.form,
      cw: job.cw,
      placement: job.placement,
      designAspect: job.designAspect,
      light: job.light,
      blend: job.blend,
      printGuard: 1
    });

    const on = job.woven ? 1 : 0;
    r.uniforms.displaceScale = on;
    r.uniforms.shadowMix = on * 0.85;
    r.uniforms.fiberMix = on;
    r.uniforms.seamBite = on;
    r.uniforms.hasDesign = job.designSource ? 1 : 0;

    r.draw();

    const blob = await new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('render produced no image');
    return blob;
  }

  /** Small square preview of a template with no design on it. */
  async thumbnail(form, cw, maps, light, size = 128) {
    const r = this.renderer;
    const w = size;
    const h = Math.round(size / form.aspect);
    r.resize(w, h);
    r.setMaps(maps.shape, maps.field);
    r.setDesign(null);
    this._mapsKey = form.id;
    this._designKey = '';
    applyToRenderer(r, {
      form, cw, placement: null, designAspect: 1, light, blend: 1, printGuard: 1
    });
    r.uniforms.hasDesign = 0;
    r.uniforms.displaceScale = 1;
    r.draw();
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(this.canvas, 0, 0);
    return out;
  }

  dispose() {
    this.renderer.dispose();
  }
}
