/**
 * js/render/gl.js
 * One WebGL2 context, one program, one quad. Nothing clever, because the
 * clever part is the shader and the honesty is in never creating more than
 * two contexts for the whole page (interactive stage plus export oven).
 */

import { VERT, FRAG } from './shader.js';
import { schedule } from '../util/dom.js';

export function webgl2Supported() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch (err) {
    return false;
  }
}

const DEFAULT_UNIFORMS = () => ({
  displaceScale: 0,
  shadowMix: 0,
  fiberMix: 0,
  seamBite: 0,
  dispAmount: 1,
  parallax: 0.55,
  weaveBite: 1,
  relief: 1,
  weaveFreq: 260,
  intensity: 0.7,
  azimuth: 315,
  elevation: 42,
  blend: 1,
  printGuard: 0.25,
  hasDesign: 0,
  designCenter: [0.5, 0.5],
  designExtent: [0.3, 0.3],
  designRot: 0,
  fabric: [0.72, 0.71, 0.7],
  bg: [0.463, 0.463, 0.463],
  aspect: 1
});

export class LoomGL {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
      powerPreference: 'high-performance'
    });
    if (!this.gl) throw new Error('webgl2-unavailable');

    this.uniforms = DEFAULT_UNIFORMS();
    this.lost = false;
    this._pending = false;
    this._build();
  }

  _build() {
    const gl = this.gl;
    const prog = linkProgram(gl, VERT, FRAG);
    this.program = prog;
    gl.useProgram(prog);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;

    this.u = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i);
      this.u[info.name] = gl.getUniformLocation(prog, info.name);
    }

    // Every sampler starts complete, so the very first frame is the stage
    // grey rather than a black flash while the first template generates.
    this.texField = makeTexture(gl);
    fill1x1(gl, [128, 200, 128, 128]);
    this.texShape = makeTexture(gl);
    fill1x1(gl, [0, 0, 128, 0]);
    this.texDesign = makeTexture(gl);
    fill1x1(gl, [0, 0, 0, 0]);

    gl.uniform1i(this.u.u_field, 0);
    gl.uniform1i(this.u.u_shape, 1);
    gl.uniform1i(this.u.u_design, 2);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  /** Upload a template's two maps. */
  setMaps(shapeImage, fieldImage) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texShape);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shapeImage);
    gl.bindTexture(gl.TEXTURE_2D, this.texField);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fieldImage);
    // The shader reads the fold off a mip level rather than off the base, so
    // that the ink is displaced by the fold and not by the eight-bit terracing
    // of a single texel. The stage always magnifies this texture, so MAG_FILTER
    // still decides everything the eye sees directly.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.fieldSize = fieldImage.width;
  }

  /** `source` is an ImageBitmap, canvas or ImageData. null clears the print. */
  setDesign(source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texDesign);
    if (!source) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0]));
      this.uniforms.hasDesign = 0;
      return;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.uniforms.hasDesign = 1;
  }

  resize(w, h) {
    const cw = Math.max(1, Math.round(w));
    const ch = Math.max(1, Math.round(h));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
  }

  /** Coalesces multiple state changes into one paint. */
  requestFrame() {
    if (this._pending || this.lost) return;
    this._pending = true;
    schedule(() => {
      this._pending = false;
      this.draw();
    });
  }

  draw() {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) return;
    const u = this.uniforms;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texField);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texShape);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texDesign);

    const t = 1 / (this.fieldSize || 512);
    gl.uniform2f(this.u.u_fieldTexel, t, t);
    gl.uniform1f(this.u.u_aspect, u.aspect);
    gl.uniform3f(this.u.u_fabric, u.fabric[0], u.fabric[1], u.fabric[2]);
    gl.uniform3f(this.u.u_bg, u.bg[0], u.bg[1], u.bg[2]);
    gl.uniform1f(this.u.u_hasDesign, u.hasDesign);
    gl.uniform2f(this.u.u_designCenter, u.designCenter[0], u.designCenter[1]);
    gl.uniform2f(this.u.u_designExtent, u.designExtent[0], u.designExtent[1]);
    gl.uniform1f(this.u.u_designRot, u.designRot);
    gl.uniform1i(this.u.u_blend, u.blend | 0);
    gl.uniform1f(this.u.u_displaceScale, u.displaceScale);
    gl.uniform1f(this.u.u_shadowMix, u.shadowMix);
    gl.uniform1f(this.u.u_fiberMix, u.fiberMix);
    gl.uniform1f(this.u.u_seamBite, u.seamBite);
    gl.uniform1f(this.u.u_dispAmount, u.dispAmount);
    gl.uniform1f(this.u.u_parallax, u.parallax);
    gl.uniform1f(this.u.u_weaveBite, u.weaveBite);
    gl.uniform1f(this.u.u_relief, u.relief);
    gl.uniform1f(this.u.u_weaveFreq, u.weaveFreq);
    gl.uniform1f(this.u.u_intensity, u.intensity);
    gl.uniform1f(this.u.u_printGuard, u.printGuard);

    const L = lightVector(u.azimuth, u.elevation);
    gl.uniform3f(this.u.u_light, L[0], L[1], L[2]);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    [this.texField, this.texShape, this.texDesign].forEach((t) => gl.deleteTexture(t));
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}

/**
 * Azimuth 0 is north, increasing clockwise, which is how a photographer
 * describes a key light. uv space has y pointing down, so north is -y.
 */
export function lightVector(azimuthDeg, elevationDeg) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const ch = Math.cos(el);
  return [Math.sin(az) * ch, -Math.cos(az) * ch, Math.sin(el)];
}

function fill1x1(gl, rgba) {
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array(rgba));
}

function makeTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

function linkProgram(gl, vsrc, fsrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error('link failed: ' + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('compile failed: ' + log);
  }
  return s;
}
