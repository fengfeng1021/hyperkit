/* ==========================================================================
   GradientKit - render.js
   WebGL2 renderer plus a genuine Canvas2D fallback that uses the same math at
   lower resolution. The Stage never goes black-on-black: a missing context, a
   failed shader link and a lost context all land on the CPU path within one
   frame.

   The fragment shader is the GPU twin of js/gradient.js. Both use the exact
   piecewise sRGB transfer function, not the pow(c, 2.2) shortcut, which is
   where most WebGL gradient tools quietly lose accuracy in the darks.
   ========================================================================== */

import { CVD, parseHex, srgbToOklab } from './color.js';
import { rasterize, buildRamp } from './gradient.js';

const MAX_STOPS = 16;
const MAX_POINTS = 12;

const VERT = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_res;
uniform int   u_mode;
uniform int   u_type;
uniform float u_angle;
uniform vec2  u_center;
uniform float u_radius;

uniform int   u_stopCount;
uniform vec3  u_stopColor[${MAX_STOPS}];
uniform float u_stopPos[${MAX_STOPS}];
uniform int   u_easing;

uniform int   u_spaceA;
uniform int   u_spaceB;
uniform float u_sweep;
uniform float u_shake;

uniform int   u_pointCount;
uniform vec3  u_pointLab[${MAX_POINTS}];
uniform vec2  u_pointPos[${MAX_POINTS}];
uniform float u_pointRadius[${MAX_POINTS}];
uniform float u_falloff;

uniform float u_grainAmp;
uniform float u_grainSize;
uniform float u_grainSeed;
uniform int   u_dither;
uniform mat3  u_cvd;

const float PI = 3.141592653589793;

float s2l(float c){ float s = c < 0.0 ? -1.0 : 1.0; float a = abs(c);
  return s * (a <= 0.04045 ? a / 12.92 : pow((a + 0.055) / 1.055, 2.4)); }
float l2s(float c){ float s = c < 0.0 ? -1.0 : 1.0; float a = abs(c);
  return s * (a <= 0.0031308 ? 12.92 * a : 1.055 * pow(a, 1.0 / 2.4) - 0.055); }
vec3 s2l3(vec3 c){ return vec3(s2l(c.r), s2l(c.g), s2l(c.b)); }
vec3 l2s3(vec3 c){ return vec3(l2s(c.r), l2s(c.g), l2s(c.b)); }

float cbrtf(float x){ return sign(x) * pow(abs(x), 1.0 / 3.0); }

vec3 lin2oklab(vec3 c){
  float l = 0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b;
  float m = 0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b;
  float s = 0.0883024619*c.r + 0.2817188376*c.g + 0.6299787005*c.b;
  float l_ = cbrtf(l); float m_ = cbrtf(m); float s_ = cbrtf(s);
  return vec3(
    0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
    1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
    0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_);
}
vec3 oklab2lin(vec3 lab){
  float l_ = lab.x + 0.3963377774*lab.y + 0.2158037573*lab.z;
  float m_ = lab.x - 0.1055613458*lab.y - 0.0638541728*lab.z;
  float s_ = lab.x - 0.0894841775*lab.y - 1.2914855480*lab.z;
  float l = l_*l_*l_; float m = m_*m_*m_; float s = s_*s_*s_;
  return vec3(
     4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
    -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
    -0.0041960863*l - 0.7034186147*m + 1.7076147010*s);
}
bool inGamutLin(vec3 lin){
  vec3 c = l2s3(lin);
  return c.r >= -1e-4 && c.r <= 1.0001 &&
         c.g >= -1e-4 && c.g <= 1.0001 &&
         c.b >= -1e-4 && c.b <= 1.0001;
}
vec3 gamutMap(float L, float C, float H){
  if (L >= 1.0) return vec3(1.0);
  if (L <= 0.0) return vec3(0.0);
  float h = radians(H);
  vec2 dir = vec2(cos(h), sin(h));
  vec3 lin = oklab2lin(vec3(L, C * dir));
  if (inGamutLin(lin)) return clamp(l2s3(lin), 0.0, 1.0);
  float lo = 0.0; float hi = C;
  for (int i = 0; i < 12; i++){
    float mid = 0.5 * (lo + hi);
    if (inGamutLin(oklab2lin(vec3(L, mid * dir)))) lo = mid; else hi = mid;
  }
  return clamp(l2s3(oklab2lin(vec3(L, lo * dir))), 0.0, 1.0);
}

vec3 rgb2hsl(vec3 c){
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float l = 0.5 * (mx + mn);
  float d = mx - mn;
  if (d < 1e-9) return vec3(-1.0, 0.0, l);
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h;
  if (mx == c.r) h = ((c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0)) * 60.0;
  else if (mx == c.g) h = ((c.b - c.r) / d + 2.0) * 60.0;
  else h = ((c.r - c.g) / d + 4.0) * 60.0;
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t){
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl){
  if (hsl.y <= 0.0 || hsl.x < 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  float hk = mod(hsl.x, 360.0) / 360.0;
  return vec3(hue2rgb(p, q, hk + 1.0/3.0), hue2rgb(p, q, hk), hue2rgb(p, q, hk - 1.0/3.0));
}
float lerpHue(float h1, float h2, float t){
  float d = mod(h2 - h1 + 540.0, 360.0) - 180.0;
  return mod(h1 + d * t + 360.0, 360.0);
}

vec3 mixSpace(vec3 c1, vec3 c2, float t, int sp){
  if (sp == 0) return mix(c1, c2, t);
  if (sp == 1){
    vec3 a = rgb2hsl(c1); vec3 b = rgb2hsl(c2);
    float ha = a.x; float hb = b.x;
    if (ha < 0.0 && hb < 0.0){ ha = 0.0; hb = 0.0; }
    else if (ha < 0.0) ha = hb;
    else if (hb < 0.0) hb = ha;
    return clamp(hsl2rgb(vec3(lerpHue(ha, hb, t), mix(a.y, b.y, t), mix(a.z, b.z, t))), 0.0, 1.0);
  }
  vec3 la = lin2oklab(s2l3(c1));
  vec3 lb = lin2oklab(s2l3(c2));
  if (sp == 2){
    vec3 m = mix(la, lb, t);
    return gamutMap(m.x, length(m.yz), mod(degrees(atan(m.z, m.y)) + 360.0, 360.0));
  }
  float Ca = length(la.yz); float Cb = length(lb.yz);
  float Ha = Ca < 1e-7 ? -1.0 : mod(degrees(atan(la.z, la.y)) + 360.0, 360.0);
  float Hb = Cb < 1e-7 ? -1.0 : mod(degrees(atan(lb.z, lb.y)) + 360.0, 360.0);
  if (Ha < -0.5 && Hb < -0.5){ Ha = 0.0; Hb = 0.0; }
  else if (Ha < -0.5) Ha = Hb;
  else if (Hb < -0.5) Hb = Ha;
  return gamutMap(mix(la.x, lb.x, t), mix(Ca, Cb, t), lerpHue(Ha, Hb, t));
}

float applyEase(float t, int e){
  if (e == 1) return t * t * t;
  if (e == 2) return 1.0 - pow(1.0 - t, 3.0);
  if (e == 3) return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0;
  return t;
}

vec3 gradientColor(float t, int sp){
  if (u_stopCount <= 1) return u_stopColor[0];
  if (t <= u_stopPos[0]) return u_stopColor[0];
  for (int i = 0; i < ${MAX_STOPS - 1}; i++){
    if (i + 1 >= u_stopCount) break;
    float p0 = u_stopPos[i];
    float p1 = u_stopPos[i + 1];
    if (t <= p1){
      float span = p1 - p0;
      float lt = span > 1e-9 ? (t - p0) / span : 1.0;
      return mixSpace(u_stopColor[i], u_stopColor[i + 1], applyEase(clamp(lt, 0.0, 1.0), u_easing), sp);
    }
  }
  return u_stopColor[u_stopCount - 1];
}

vec3 meshColor(vec2 uv){
  vec3 lab = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < ${MAX_POINTS}; i++){
    if (i >= u_pointCount) break;
    vec2 d = (uv - u_pointPos[i]) / max(u_pointRadius[i], 1e-3);
    float d2 = dot(d, d) + 1e-5;
    float w = 1.0 / pow(d2, u_falloff * 0.5);
    lab += u_pointLab[i] * w;
    wsum += w;
  }
  lab /= max(wsum, 1e-6);
  return gamutMap(lab.x, length(lab.yz), mod(degrees(atan(lab.z, lab.y)) + 360.0, 360.0));
}

float hash(vec2 p){
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

float bayer8(ivec2 q){
  int x = q.x & 7;
  int y = q.y & 7;
  int v = 0;
  for (int i = 0; i < 3; i++){
    v = v * 4 + ((2 * ((x >> i) & 1) + 3 * ((y >> i) & 1)) & 3);
  }
  return float(v) / 64.0 - 0.5;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = vec2(frag.x / u_res.x, 1.0 - frag.y / u_res.y);
  vec2 px = uv * u_res;
  vec3 col;

  if (u_mode == 1){
    col = meshColor(uv);
  } else {
    float t;
    if (u_type == 1){
      vec2 c = u_center * u_res;
      float far = length(vec2(0.0) - c);
      far = max(far, length(vec2(u_res.x, 0.0) - c));
      far = max(far, length(vec2(0.0, u_res.y) - c));
      far = max(far, length(u_res - c));
      t = clamp(length(px - c) / max(far * u_radius, 1e-6), 0.0, 1.0);
    } else if (u_type == 2){
      vec2 c = u_center * u_res;
      float a = atan(px.x - c.x, -(px.y - c.y));
      t = fract(a / (2.0 * PI) - u_angle / 360.0);
    } else {
      float rad = radians(u_angle);
      vec2 dir = vec2(sin(rad), -cos(rad));
      float len = abs(u_res.x * dir.x) + abs(u_res.y * dir.y);
      t = clamp(0.5 + dot(px - u_res * 0.5, dir) / max(len, 1e-6), 0.0, 1.0);
    }
    int sp = u_spaceB;
    if (u_sweep >= 0.0){
      float seam = u_sweep + u_shake / max(u_res.x, 1.0);
      sp = uv.x < seam ? u_spaceB : u_spaceA;
    }
    col = gradientColor(t, sp);
  }

  vec3 lin = s2l3(col);
  if (u_grainAmp > 0.0){
    float n = hash(floor(frag / max(u_grainSize, 1.0)) + u_grainSeed) - 0.5;
    lin += n * u_grainAmp;
  }
  lin = u_cvd * lin;
  col = clamp(l2s3(clamp(lin, 0.0, 1.0)), 0.0, 1.0);
  if (u_dither == 1) col += bayer8(ivec2(frag)) / 255.0;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const UNIFORMS = [
  'u_res', 'u_mode', 'u_type', 'u_angle', 'u_center', 'u_radius',
  'u_stopCount', 'u_stopColor', 'u_stopPos', 'u_easing',
  'u_spaceA', 'u_spaceB', 'u_sweep', 'u_shake',
  'u_pointCount', 'u_pointLab', 'u_pointPos', 'u_pointRadius', 'u_falloff',
  'u_grainAmp', 'u_grainSize', 'u_grainSeed', 'u_dither', 'u_cvd',
];

const SPACE_ID = { srgb: 0, hsl: 1, oklab: 2, oklch: 3 };
const TYPE_ID = { linear: 0, radial: 1, conic: 2 };
const EASE_ID = { linear: 0, in: 1, out: 2, inout: 3 };

/** Row-major 3x3 to the column-major layout WebGL wants (transpose must be
 *  false in WebGL, so the transpose happens here). */
function toColumnMajor(m) {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log || 'shader compile failed');
  }
  return sh;
}

/* --------------------------------------------------------------------------
   GPU path
   -------------------------------------------------------------------------- */

function createGl(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  let program;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
    }
  } catch (err) {
    return { error: err };
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a_pos');
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  for (const name of UNIFORMS) u[name] = gl.getUniformLocation(program, name);

  return { gl, program, vao, u };
}

/* --------------------------------------------------------------------------
   Public renderer
   -------------------------------------------------------------------------- */

export function createRenderer(canvas, opts = {}) {
  const onFallback = opts.onFallback || (() => {});
  const onContextLost = opts.onContextLost || (() => {});

  let core = createGl(canvas);
  let kind = 'webgl2';
  let compileError = null;

  if (!core) {
    kind = 'canvas2d';
  } else if (core.error) {
    compileError = core.error;
    core = null;
    kind = 'canvas2d';
  }

  let ctx2d = null;
  let lowCanvas = null;
  const ensure2d = () => {
    if (!ctx2d) {
      ctx2d = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      lowCanvas = document.createElement('canvas');
    }
    return ctx2d;
  };
  if (kind === 'canvas2d') ensure2d();

  let width = 1;
  let height = 1;
  let scene = null;
  let sweep = { x: -1, shake: 0 };
  // Live-only grain phase. The motion layer advances it while a grain control
  // is being adjusted so the user sees the noise move rather than a frozen
  // still. It is never part of state and never reaches an export, which is
  // why exports of the same gradient stay byte-identical.
  let grainPhase = 0;
  let ramp = null;
  let rampKey = '';
  let lossCount = 0;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lossCount += 1;
    core = null;
    kind = 'canvas2d';
    ensure2d();
    onContextLost(lossCount);
    draw();
  });

  function rampFor(s) {
    const key = JSON.stringify([s.stops, s.space, s.easing]);
    if (key !== rampKey) {
      ramp = buildRamp(s.stops, s.space, s.easing, 512);
      rampKey = key;
    }
    return ramp;
  }

  function drawGl() {
    const { gl, program, vao, u } = core;
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    const stops = scene.stops.slice().sort((a, b) => a.pos - b.pos).slice(0, MAX_STOPS);
    const colors = new Float32Array(MAX_STOPS * 3);
    const positions = new Float32Array(MAX_STOPS);
    stops.forEach((s, i) => {
      const c = parseHex(s.hex) || { r: 0, g: 0, b: 0 };
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      positions[i] = s.pos / 100;
    });

    const pts = (scene.mesh || []).slice(0, MAX_POINTS);
    const lab = new Float32Array(MAX_POINTS * 3);
    const pos = new Float32Array(MAX_POINTS * 2);
    const rad = new Float32Array(MAX_POINTS);
    pts.forEach((p, i) => {
      const c = parseHex(p.hex) || { r: 0, g: 0, b: 0 };
      const l = srgbToOklab(c.r, c.g, c.b);
      lab[i * 3] = l.L;
      lab[i * 3 + 1] = l.a;
      lab[i * 3 + 2] = l.b;
      pos[i * 2] = p.x;
      pos[i * 2 + 1] = p.y;
      rad[i] = p.r;
    });

    gl.uniform2f(u.u_res, width, height);
    gl.uniform1i(u.u_mode, scene.mode === 'mesh' ? 1 : 0);
    gl.uniform1i(u.u_type, TYPE_ID[scene.type] ?? 0);
    gl.uniform1f(u.u_angle, scene.angle || 0);
    gl.uniform2f(u.u_center, scene.center?.x ?? 0.5, scene.center?.y ?? 0.5);
    gl.uniform1f(u.u_radius, scene.radius ?? 0.75);
    gl.uniform1i(u.u_stopCount, stops.length);
    gl.uniform3fv(u.u_stopColor, colors);
    gl.uniform1fv(u.u_stopPos, positions);
    gl.uniform1i(u.u_easing, EASE_ID[scene.easing] ?? 0);
    gl.uniform1i(u.u_spaceA, SPACE_ID[sweep.from ?? scene.space] ?? 3);
    gl.uniform1i(u.u_spaceB, SPACE_ID[scene.space] ?? 3);
    gl.uniform1f(u.u_sweep, sweep.x);
    gl.uniform1f(u.u_shake, sweep.shake);
    gl.uniform1i(u.u_pointCount, pts.length);
    gl.uniform3fv(u.u_pointLab, lab);
    gl.uniform2fv(u.u_pointPos, pos);
    gl.uniform1fv(u.u_pointRadius, rad);
    gl.uniform1f(u.u_falloff, scene.falloff ?? 2.4);
    gl.uniform1f(u.u_grainAmp, (scene.grain?.amp || 0) / 100 * 0.06);
    gl.uniform1f(u.u_grainSize, Math.max(1, scene.grain?.size || 1));
    gl.uniform1f(u.u_grainSeed, (scene.grainSeed || 0) + grainPhase);
    gl.uniform1i(u.u_dither, scene.dither ? 1 : 0);
    gl.uniformMatrix3fv(u.u_cvd, false, toColumnMajor(CVD[scene.vision] || CVD.normal));

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawCpu() {
    const c = ensure2d();
    // Roughly 1/6 linear resolution, which is why the fallback notice says
    // "lower resolution".
    const lw = Math.max(2, Math.round(width / 6));
    const lh = Math.max(2, Math.round(height / 6));
    lowCanvas.width = lw;
    lowCanvas.height = lh;
    const lctx = lowCanvas.getContext('2d');
    const data = rasterize(scene, lw, lh, {
      ramp: scene.mode === 'mesh' ? null : rampFor(scene),
      seed: (scene.grainSeed || 0) + grainPhase,
    });
    lctx.putImageData(new ImageData(data, lw, lh), 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, width, height);
    c.drawImage(lowCanvas, 0, 0, width, height);
  }

  function draw() {
    if (!scene || width < 1 || height < 1) return;
    if (core && kind === 'webgl2') {
      try {
        drawGl();
        return;
      } catch {
        core = null;
        kind = 'canvas2d';
        ensure2d();
        onFallback('draw');
      }
    }
    drawCpu();
  }

  return {
    get kind() { return kind; },
    get compileError() { return compileError; },
    canvas,

    setSize(cssW, cssH, dpr) {
      const d = Math.min(dpr || 1, 2);
      const w = Math.max(1, Math.round(cssW * d));
      const h = Math.max(1, Math.round(cssH * d));
      if (w === width && h === height) return false;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      return true;
    },
    get deviceWidth() { return width; },
    get deviceHeight() { return height; },

    render(next) {
      scene = next;
      draw();
    },

    /** Tween target for the signature moment. x < 0 disables the seam. */
    setSweep(x, shake = 0, from = null) {
      sweep = { x, shake, from: from || sweep.from };
      draw();
    },
    clearSweep() {
      sweep = { x: -1, shake: 0, from: null };
      draw();
    },
    get sweepState() { return sweep; },

    /** Preview-only grain phase. Tween target for the motion layer; ignored by
     *  every export path, which reads scene.grainSeed alone. */
    setGrainPhase(v) {
      const next = Number.isFinite(v) ? v : 0;
      if (next === grainPhase) return;
      grainPhase = next;
      draw();
    },

    /** Read one rendered pixel. nx, ny are normalized, origin top-left. */
    sampleAt(nx, ny) {
      const px = Math.max(0, Math.min(width - 1, Math.round(nx * width)));
      const py = Math.max(0, Math.min(height - 1, Math.round(ny * height)));
      if (core && kind === 'webgl2') {
        const out = new Uint8Array(4);
        core.gl.readPixels(px, height - 1 - py, 1, 1, core.gl.RGBA, core.gl.UNSIGNED_BYTE, out);
        return { r: out[0] / 255, g: out[1] / 255, b: out[2] / 255 };
      }
      const c = ensure2d();
      const d = c.getImageData(px, py, 1, 1).data;
      return { r: d[0] / 255, g: d[1] / 255, b: d[2] / 255 };
    },

    /** Read a rectangle of rendered pixels as RGBA rows, origin top-left.
     *  Returns { data, w, h }. Used by the contrast probe so the measurement
     *  includes grain, dither and gamut clipping rather than the ideal math. */
    readRect(nx, ny, nw, nh) {
      const x = Math.max(0, Math.min(width - 1, Math.floor(nx * width)));
      const y = Math.max(0, Math.min(height - 1, Math.floor(ny * height)));
      const w = Math.max(1, Math.min(width - x, Math.round(nw * width)));
      const h = Math.max(1, Math.min(height - y, Math.round(nh * height)));
      if (core && kind === 'webgl2') {
        const buf = new Uint8Array(w * h * 4);
        core.gl.readPixels(x, height - y - h, w, h, core.gl.RGBA, core.gl.UNSIGNED_BYTE, buf);
        // readPixels is bottom-up; flip so callers can index top-down.
        const out = new Uint8Array(w * h * 4);
        for (let row = 0; row < h; row++) {
          out.set(buf.subarray((h - 1 - row) * w * 4, (h - row) * w * 4), row * w * 4);
        }
        return { data: out, w, h };
      }
      const c = ensure2d();
      const img = c.getImageData(x, y, w, h);
      return { data: img.data, w, h };
    },

    dispose() {
      if (core) {
        const ext = core.gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
      core = null;
    },
  };
}

/* --------------------------------------------------------------------------
   Offscreen render for PNG export. Uses the same shader at the target size so
   dither and grain are applied at that resolution rather than upscaled.
   Falls back to the CPU rasterizer in tiles, yielding between tiles so the tab
   does not lock.
   -------------------------------------------------------------------------- */

export async function renderToCanvas(scene, size, onProgress = () => {}) {
  const w = size;
  const h = size;
  let canvas;
  if (typeof OffscreenCanvas === 'function') {
    canvas = new OffscreenCanvas(w, h);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
  }

  const r = createRenderer(canvas);
  if (r.kind === 'webgl2') {
    r.setSize(w, h, 1);
    // Simulation is a preview and is never baked into a file.
    r.render({ ...scene, vision: 'normal' });
    onProgress(1);
    return canvas;
  }

  // CPU path, 256px tiles with a yield between tiles so the tab does not lock.
  const ctx = canvas.getContext('2d');
  const tile = 256;
  const flat = { ...scene, vision: 'normal' };
  const ramp = scene.mode === 'mesh' ? null : buildRamp(scene.stops, scene.space, scene.easing, 512);
  const cols = Math.ceil(w / tile);
  const rows = Math.ceil(h / tile);
  let done = 0;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const tw = Math.min(tile, w - tx * tile);
      const th = Math.min(tile, h - ty * tile);
      const data = rasterize(flat, tw, th, {
        ramp,
        seed: scene.grainSeed || 0,
        offsetX: tx * tile,
        offsetY: ty * tile,
        fullW: w,
        fullH: h,
      });
      ctx.putImageData(new ImageData(data, tw, th), tx * tile, ty * tile);
      done += 1;
      onProgress(done / (cols * rows));
      await new Promise((res) => { setTimeout(res, 0); });
    }
  }
  return canvas;
}
