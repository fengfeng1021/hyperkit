/**
 * js/render/shader.js
 * The whole product argument, in about ninety lines of GLSL.
 *
 * One scalar, u_displaceScale, gates five things at once:
 *   1. the design's sample coordinate slides along the height gradient
 *   2. a normal parallax term sinks the design into the fold
 *   3. the design starts receiving the diffuse light the cloth receives
 *   4. ambient occlusion presses on the ink
 *   5. the weave bites the ink and the seam eats its edge
 *
 * The FABRIC is lit at all times, whatever that scalar is. If the cloth went
 * flat too, FLAT would look like an unfinished render and the comparison
 * would be dishonest. Only the print changes.
 */

export const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_field;   // R height  G occlusion  B heather  A thread
uniform sampler2D u_shape;   // R cover   G print      B shading  A seam
uniform sampler2D u_design;

uniform vec2  u_fieldTexel;
uniform float u_aspect;

uniform vec3  u_fabric;
uniform vec3  u_bg;

uniform float u_hasDesign;
uniform vec2  u_designCenter;
uniform vec2  u_designExtent;
uniform float u_designRot;

uniform int   u_blend;

uniform float u_displaceScale;
uniform float u_shadowMix;
uniform float u_fiberMix;
uniform float u_seamBite;

uniform float u_dispAmount;
uniform float u_parallax;
uniform float u_weaveBite;
uniform float u_relief;
uniform float u_weaveFreq;

uniform vec3  u_light;
uniform float u_intensity;
uniform float u_printGuard;

const float TAU = 6.28318530718;

void main() {
  vec2 uv = v_uv;

  vec4 shape = texture(u_shape, uv);
  float cover     = shape.r;
  float printMask = shape.g;
  float detail    = 0.55 + shape.b * 0.9;
  float seam      = shape.a;

  vec4 fld = texture(u_field, uv);
  float h       = fld.r;
  float ao      = fld.g;
  float heather = fld.b;
  float thread  = fld.a;

  // Two stencils over the same height field, because lighting and
  // displacement want different scales of it. One texel apart is the fibre,
  // and that is what should catch the light. Five texels apart is the fold,
  // and only the fold should move the ink - driving the warp off the tight
  // stencil put fibre-scale jitter into the sample coordinate and tore the
  // edges of the mark into confetti.
  vec2 tx = u_fieldTexel;
  float hL = texture(u_field, uv - vec2(tx.x, 0.0)).r;
  float hR = texture(u_field, uv + vec2(tx.x, 0.0)).r;
  float hA = texture(u_field, uv - vec2(0.0, tx.y)).r;
  float hB = texture(u_field, uv + vec2(0.0, tx.y)).r;

  vec2 slope = vec2((hR - hL) / (2.0 * tx.x), (hB - hA) / (2.0 * tx.y));
  vec3 N = normalize(vec3(-slope.x * u_relief * 0.05, -slope.y * u_relief * 0.05, 1.0));

  vec2 wx = tx * 5.0;
  float gL = textureLod(u_field, uv - vec2(wx.x, 0.0), 2.0).r;
  float gR = textureLod(u_field, uv + vec2(wx.x, 0.0), 2.0).r;
  float gA = textureLod(u_field, uv - vec2(0.0, wx.y), 2.0).r;
  float gB = textureLod(u_field, uv + vec2(0.0, wx.y), 2.0).r;
  vec2 foldSlope = vec2((gR - gL) / (2.0 * wx.x), (gB - gA) / (2.0 * wx.y));
  float foldH = (gL + gR + gA + gB + textureLod(u_field, uv, 2.0).r) * 0.2;
  vec3 foldN = normalize(vec3(-foldSlope.x * u_relief * 0.05, -foldSlope.y * u_relief * 0.05, 1.0));

  // ---- the displacement itself -----------------------------------------
  // Two terms: the slope drags the sample along the face of the fold, the
  // normal sinks it into the fold's depth. Both used to be written in raw uv,
  // which meant the shift was a fixed fraction of the STAGE and could reach
  // most of a small design's own width - the mark came apart into confetti
  // instead of bending. Everything below is measured against the design's own
  // extent, and tanh keeps the deepest crease at the limit instead of past it.
  vec2 raw = foldSlope * 0.0022 * u_dispAmount
           + (foldN.xy / max(foldN.z, 0.25)) * (foldH - 0.5) * u_parallax * 0.42;
  float lim = 0.05 * min(u_designExtent.x, u_designExtent.y);
  vec2 disp = lim * tanh(raw / max(lim, 1e-5)) * u_displaceScale;

  vec2 q = (uv - u_designCenter) * vec2(u_aspect, 1.0) + disp;
  float cr = cos(u_designRot);
  float sr = sin(u_designRot);
  vec2 qr = vec2(q.x * cr + q.y * sr, -q.x * sr + q.y * cr);
  vec2 duv = qr / max(u_designExtent, vec2(1e-4)) + 0.5;

  vec4 ink = texture(u_design, duv);
  float inside = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
  float inkA = ink.a * inside * u_hasDesign;

  // ---- light -----------------------------------------------------------
  // A lit tee is a narrow range. The earlier constants ran to 1.4 and, once
  // multiplied by heather and weave, clipped every fold to pure white.
  float ndl = max(dot(N, u_light), 0.0);
  float lit = 0.62 + ndl * u_intensity * 0.72;

  // ---- weave -----------------------------------------------------------
  float fiber = 0.5;
  if (u_weaveFreq > 0.0) {
    vec2 wv = (uv * vec2(u_aspect, 1.0) + slope * 0.0018) * u_weaveFreq;
    float aa = clamp(1.0 - max(fwidth(wv.x), fwidth(wv.y)) * 1.8, 0.0, 1.0);
    fiber = 0.5 + 0.25 * (sin(wv.x * TAU) + sin(wv.y * TAU)) * aa;
  }
  float slub = 0.95 + 0.10 * thread;

  // ---- fabric ----------------------------------------------------------
  vec3 fabric = u_fabric;
  fabric *= (0.95 + 0.10 * heather);
  fabric *= (0.94 + 0.12 * fiber) * slub;
  fabric *= detail;
  fabric *= mix(1.0, ao, 0.85);
  fabric *= lit;

  // ---- ink, gated by the one scalar ------------------------------------
  vec3 inkC = ink.rgb;
  inkC *= mix(1.0, lit, u_displaceScale);
  inkC *= mix(1.0, ao, 0.9 * u_shadowMix);
  inkC *= mix(1.0, 0.86 + 0.28 * fiber, u_displaceScale * u_weaveBite * u_fiberMix);
  inkA *= mix(1.0, 1.0 - seam * 0.85, u_displaceScale * u_seamBite);
  inkA *= mix(u_printGuard, 1.0, printMask);

  // ---- blend -----------------------------------------------------------
  vec3 base = fabric;
  vec3 res = inkC;
  if (u_blend == 1) {
    res = base * inkC;
  } else if (u_blend == 2) {
    res = 1.0 - (1.0 - base) * (1.0 - inkC);
  } else if (u_blend == 3) {
    res = mix(2.0 * base * inkC, 1.0 - 2.0 * (1.0 - base) * (1.0 - inkC), step(0.5, base));
  }
  vec3 col = mix(base, clamp(res, 0.0, 1.0), clamp(inkA, 0.0, 1.0));

  vec3 bg = u_bg * min(detail, 1.0);
  fragColor = vec4(mix(bg, col, cover), 1.0);
}`;
