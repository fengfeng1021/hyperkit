/**
 * js/templates/index.js
 * The template registry. A template is a form plus a colourway; the expensive
 * half (the maps) belongs to the form alone, so changing colour is free and
 * only the first visit to a form pays for generation.
 *
 * This is also the seam a future photographic template pack would slot into:
 * anything that can hand back a shape map and a field map is a template, and
 * the shader never needs to know which one it got.
 */

import { FORMS, getForm, printUV } from './forms.js';
import { colorwaysFor, colorway } from './colorways.js';
import { buildTemplateMaps } from '../loom/weave.js';

const mapCache = new Map();
const inFlight = new Map();

export { FORMS, getForm, printUV, colorwaysFor, colorway };

export function templateSlug(form, cw) {
  return `${form.id}-${cw.id}`;
}

export function templateLabel(form, cw) {
  return `${form.label} / ${cw.label}`;
}

export function allTemplates() {
  const out = [];
  for (const form of FORMS) {
    for (const cw of colorwaysFor(form)) {
      out.push({ form, cw, id: templateSlug(form, cw), label: templateLabel(form, cw) });
    }
  }
  return out;
}

export function hasMaps(formId) {
  return mapCache.has(formId);
}

export function peekMaps(formId) {
  return mapCache.get(formId) || null;
}

/** Generate once per form, then hand out the cached maps forever. */
export function loadMaps(form, onProgress) {
  if (mapCache.has(form.id)) return Promise.resolve(mapCache.get(form.id));
  if (inFlight.has(form.id)) return inFlight.get(form.id);

  const job = buildTemplateMaps(form, onProgress).then((maps) => {
    mapCache.set(form.id, maps);
    inFlight.delete(form.id);
    return maps;
  }).catch((err) => {
    inFlight.delete(form.id);
    throw err;
  });

  inFlight.set(form.id, job);
  return job;
}

/* ---------------------------------------------------------------------- */
/* Placement maths. All of it lives here so the stage, the oven and the    */
/* keyboard path can never disagree about where the design is.            */
/* ---------------------------------------------------------------------- */

export function defaultPlacement(form) {
  const pa = printUV(form);
  return { x: pa.cx, y: pa.cy, scale: 0.85, rotation: 0 };
}

/**
 * scale is expressed as a fraction of the print area width, which is the only
 * number a seller can reason about ("it covers most of the chest").
 */
export function designExtent(form, placement, designAspect) {
  const w = form.print.w * placement.scale;
  const h = w / (designAspect || 1);
  return [w, h];
}

export function fitScale(form, designAspect) {
  const paW = form.print.w;
  const paH = form.print.h;
  const w = Math.min(paW, paH * (designAspect || 1));
  return w / paW;
}

/** Design bounding box in uv, used by the on-stage placement frame. */
export function placementBoxUV(form, placement, designAspect) {
  const [w, h] = designExtent(form, placement, designAspect);
  return {
    x: placement.x - w / form.aspect / 2,
    y: placement.y - h / 2,
    w: w / form.aspect,
    h
  };
}

/** True when any corner of the design leaves the print area. */
export function outsidePrintArea(form, placement, designAspect) {
  const box = placementBoxUV(form, placement, designAspect);
  const pa = printUV(form);
  const rot = (placement.rotation * Math.PI) / 180;
  const cx = placement.x;
  const cy = placement.y;
  const hw = box.w / 2;
  const hh = box.h / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  for (const [dx, dy] of corners) {
    const px = cx + dx * c - dy * s;
    const py = cy + dx * s + dy * c;
    if (px < pa.x - 1e-4 || px > pa.x + pa.w + 1e-4) return true;
    if (py < pa.y - 1e-4 || py > pa.y + pa.h + 1e-4) return true;
  }
  return false;
}

/** Push every render-affecting value into a renderer's uniform object. */
export function applyToRenderer(renderer, opts) {
  const { form, cw, placement, designAspect, light, blend, printGuard } = opts;
  const u = renderer.uniforms;
  u.aspect = form.aspect;
  u.fabric = cw.rgb.map((v) => v / 255);
  u.weaveFreq = form.weaveFreq;
  u.relief = form.relief;
  u.dispAmount = form.dispAmount;
  u.parallax = form.parallax;
  u.weaveBite = 1;
  u.blend = blend;
  u.azimuth = light.azimuth;
  u.elevation = light.elevation;
  u.intensity = light.intensity / 100;
  u.printGuard = printGuard;
  if (placement) {
    u.designCenter = [placement.x, placement.y];
    u.designExtent = designExtent(form, placement, designAspect);
    u.designRot = (placement.rotation * Math.PI) / 180;
  }
}
