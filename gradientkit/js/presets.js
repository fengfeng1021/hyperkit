/* ==========================================================================
   GradientKit - presets.js
   The reference set. 12 gradient specimens and 3 mesh fields, all authored
   here. Every one exists to demonstrate a specific color-science behaviour,
   which is why this is a reference set and not a gallery.

   Names come from optics, photography and materials processing, the world the
   interface already lives in. None are borrowed from uiGradients.

   This module is the source of truth. assets/reference-set.json is the same
   data as a portable file, linked from the page for people who want to read it
   or feed it to their own tooling. The module is what the button loads, so
   "Load reference set" works offline and from a file:// URL.
   ========================================================================== */

export const GRADIENT_PRESETS = [
  {
    id: 'deep-field',
    name: 'Deep Field',
    demonstrates: 'The default. sRGB drains about a third of the chroma a fifth of the way along this ramp. Press Space to watch it come back.',
    scene: {
      mode: 'gradient', type: 'linear', angle: 200, space: 'oklch', easing: 'linear',
      stops: [
        { hex: '#071033', pos: 0 },
        { hex: '#4FE3C1', pos: 78 },
        { hex: '#EAFFF7', pos: 100 },
      ],
    },
  },
  {
    id: 'sodium-lamp',
    name: 'Sodium Lamp',
    demonstrates: 'Powerless-hue carry. The near-black endpoint has no hue of its own, so it borrows the orange instead of bending through red.',
    scene: {
      mode: 'gradient', type: 'linear', angle: 165, space: 'oklch', easing: 'linear',
      stops: [
        { hex: '#1A0E00', pos: 0 },
        { hex: '#FF7A00', pos: 58 },
        { hex: '#FFD98A', pos: 100 },
      ],
    },
  },
  {
    id: 'anodize',
    name: 'Anodize',
    demonstrates: 'Two saturated stops and nothing in between, the way gradients actually get written. This is where sRGB turns chalky.',
    scene: {
      mode: 'gradient', type: 'linear', angle: 135, space: 'oklch', easing: 'linear',
      stops: [
        { hex: '#3A0D6B', pos: 0 },
        { hex: '#FFB38F', pos: 100 },
      ],
    },
  },
  {
    id: 'cold-cathode',
    name: 'Cold Cathode',
    demonstrates: 'Open the middle stop and push its chroma up: the gamut line reports the real clipped chroma and delta E, rather than silently clamping.',
    scene: {
      mode: 'gradient', type: 'linear', angle: 110, space: 'oklch', easing: 'linear',
      stops: [
        { hex: '#001417', pos: 0 },
        { hex: '#00B3A4', pos: 62 },
        { hex: '#C8FFF4', pos: 100 },
      ],
    },
  },
  {
    id: 'kiln',
    name: 'Kiln',
    demonstrates: 'Long hue travel, dark red to amber, where the short-arc rule decides whether the ramp passes through brown or stays lit.',
    scene: {
      mode: 'gradient', type: 'linear', angle: 90, space: 'oklch', easing: 'linear',
      stops: [
        { hex: '#240000', pos: 0 },
        { hex: '#FFB703', pos: 100 },
      ],
    },
  },
  {
    id: 'mineral-wash',
    name: 'Mineral Wash',
    demonstrates: 'Rectangular blending. Switch it to OKLCH on the same stops to feel exactly what the polar form adds.',
    scene: {
      mode: 'gradient', type: 'linear', angle: 160, space: 'oklab', easing: 'linear',
      stops: [
        { hex: '#0F1A17', pos: 0 },
        { hex: '#4C7A66', pos: 62 },
        { hex: '#D8E2DC', pos: 100 },
      ],
    },
  },
  {
    id: 'photoresist',
    name: 'Photoresist',
    demonstrates: 'Conic type, and the exact purple and cyan from this tool’s origin story.',
    scene: {
      mode: 'gradient', type: 'conic', angle: 45, space: 'oklch', easing: 'linear',
      stops: [
        { hex: '#14002E', pos: 0 },
        { hex: '#6D23B6', pos: 46 },
        { hex: '#00D4FF', pos: 100 },
      ],
    },
  },
  {
    id: 'overcast',
    name: 'Overcast',
    demonstrates: 'A near-neutral ramp. The comparison reports no meaningful dead zone, because there is none. Honesty over theatre.',
    scene: {
      mode: 'gradient', type: 'linear', angle: 180, space: 'oklab', easing: 'linear',
      stops: [
        { hex: '#1C1E20', pos: 0 },
        { hex: '#9AA3AA', pos: 55 },
        { hex: '#E8EDF1', pos: 100 },
      ],
    },
  },
  {
    id: 'ember-ring',
    name: 'Ember Ring',
    demonstrates: 'Radial type with an off-centre origin, and a hot-to-black ramp that gives up a quarter of its chroma in sRGB.',
    scene: {
      mode: 'gradient', type: 'radial', angle: 0, space: 'oklch', easing: 'linear',
      center: { x: 0.3, y: 0.3 }, radius: 0.9,
      stops: [
        { hex: '#FF5400', pos: 0 },
        { hex: '#08050A', pos: 100 },
      ],
    },
  },
  {
    id: 'aurora-sweep',
    name: 'Aurora Sweep',
    demonstrates: 'Four stops and a closed loop, where the first and last have to match exactly.',
    scene: {
      mode: 'gradient', type: 'conic', angle: 0, space: 'oklch', easing: 'linear',
      stops: [
        { hex: '#0B1026', pos: 0 },
        { hex: '#00E5A0', pos: 34 },
        { hex: '#7B5CFF', pos: 68 },
        { hex: '#0B1026', pos: 100 },
      ],
    },
  },
  {
    id: 'cyanotype',
    name: 'Cyanotype',
    demonstrates: 'Low-chroma blue where interpolation barely matters and dithering matters a lot. Put the loupe on it.',
    scene: {
      mode: 'gradient', type: 'linear', angle: 155, space: 'oklch', easing: 'linear',
      stops: [
        { hex: '#04141F', pos: 0 },
        { hex: '#0B5C8C', pos: 52 },
        { hex: '#7FD3F7', pos: 100 },
      ],
    },
  },
  {
    id: 'step-wedge',
    name: 'Step Wedge',
    demonstrates: 'The control specimen. Achromatic and deliberately sRGB, because banding is worst on a neutral ramp and this is where the dither loupe convinces.',
    scene: {
      mode: 'gradient', type: 'linear', angle: 90, space: 'srgb', easing: 'linear',
      stops: [
        { hex: '#101010', pos: 0 },
        { hex: '#E0E0E0', pos: 100 },
      ],
    },
  },
];

export const MESH_PRESETS = [
  {
    id: 'bloom',
    name: 'Bloom',
    demonstrates: 'Minimum viable field. Two warm and two cool lobes meeting in the centre.',
    scene: {
      mode: 'mesh', space: 'oklab', falloff: 2.4,
      mesh: [
        { hex: '#FF6A3D', x: 0.18, y: 0.22, r: 0.55 },
        { hex: '#FFC46B', x: 0.82, y: 0.16, r: 0.5 },
        { hex: '#1E3A8A', x: 0.16, y: 0.84, r: 0.6 },
        { hex: '#6D28D9', x: 0.86, y: 0.8, r: 0.52 },
      ],
    },
  },
  {
    id: 'interference',
    name: 'Interference',
    demonstrates: 'Where sRGB mesh tools produce grey seams and OKLab does not.',
    scene: {
      mode: 'mesh', space: 'oklab', falloff: 2.2,
      mesh: [
        { hex: '#00E5A0', x: 0.12, y: 0.5, r: 0.42 },
        { hex: '#FF2D95', x: 0.38, y: 0.18, r: 0.38 },
        { hex: '#1B2A6B', x: 0.5, y: 0.82, r: 0.44 },
        { hex: '#FFD166', x: 0.72, y: 0.32, r: 0.36 },
        { hex: '#06B6D4', x: 0.88, y: 0.66, r: 0.4 },
        { hex: '#7B5CFF', x: 0.28, y: 0.72, r: 0.34 },
        { hex: '#0B0F1A', x: 0.62, y: 0.54, r: 0.3 },
      ],
    },
  },
  {
    id: 'cross-section',
    name: 'Cross Section',
    demonstrates: 'The maximum point count. Performance ceiling, and the case that justifies WebGL.',
    scene: {
      mode: 'mesh', space: 'oklab', falloff: 2.6,
      mesh: [
        { hex: '#04141F', x: 0.06, y: 0.1, r: 0.34 },
        { hex: '#0B5C8C', x: 0.3, y: 0.06, r: 0.3 },
        { hex: '#7FD3F7', x: 0.62, y: 0.1, r: 0.28 },
        { hex: '#C8FFF4', x: 0.92, y: 0.14, r: 0.3 },
        { hex: '#00B3A4', x: 0.1, y: 0.4, r: 0.28 },
        { hex: '#1B2A6B', x: 0.4, y: 0.36, r: 0.3 },
        { hex: '#6E8BFF', x: 0.72, y: 0.44, r: 0.28 },
        { hex: '#B5179E', x: 0.94, y: 0.5, r: 0.3 },
        { hex: '#2B0A3D', x: 0.12, y: 0.74, r: 0.32 },
        { hex: '#FF5400', x: 0.42, y: 0.82, r: 0.28 },
        { hex: '#FFB703', x: 0.7, y: 0.9, r: 0.28 },
        { hex: '#240000', x: 0.94, y: 0.86, r: 0.3 },
      ],
    },
  },
];

export const DEFAULT_PRESET_ID = 'deep-field';

/** The complete state that `Load reference set` installs. Named here rather
 *  than inside the click handler so the same values are used by the README,
 *  by assets/reference-set.json, and by the first-visit path. */
export const REFERENCE_SET = {
  version: 'gk1',
  workbench: DEFAULT_PRESET_ID,
  grain: { amp: 14, size: 2 },
  dither: true,
  probe: { text: 'Shipping this on Friday', size: 32, weight: 600, fg: '#FFFFFF' },
  gradients: GRADIENT_PRESETS,
  meshes: MESH_PRESETS,
};

export function findPreset(id) {
  return GRADIENT_PRESETS.find((p) => p.id === id) || MESH_PRESETS.find((p) => p.id === id) || null;
}
