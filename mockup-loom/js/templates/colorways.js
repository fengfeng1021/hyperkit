/**
 * js/templates/colorways.js
 * Fabric, ceramic, paper and vinyl colours.
 *
 * These are CONTENT, not interface. They are the only colours in this build
 * that are allowed to exist outside css/tokens.css, and they are here rather
 * than in CSS on purpose: the shader needs them as numbers, and a seller needs
 * to judge them on a neutral stage without the interface tinting the answer.
 *
 * `dark` drives one honest hint in the UI: Screen blending has almost no
 * effect on a dark surface, so we say so instead of disabling the control.
 */

const C = (id, label, hex, dark = false) => ({ id, label, hex, dark, rgb: hexToRgb(hex) });

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const COLORWAYS = {
  fabric: [
    C('studio-grey', 'Studio Grey', '#B9B7B4'),
    C('bone', 'Bone', '#E4E0D6'),
    C('natural', 'Natural', '#D3C4A6'),
    C('ochre', 'Ochre', '#B3771F'),
    C('forest', 'Forest', '#2E4034', true),
    C('black', 'Black', '#1B1B1B', true)
  ],
  rigid: {
    mug: [
      C('gloss-white', 'Gloss White', '#F1F1F1'),
      C('matte-black', 'Matte Black', '#1A1A1A', true),
      C('cobalt', 'Cobalt', '#1E3E7B', true)
    ],
    poster: [
      C('bright-white', 'Bright White', '#F5F5F3'),
      C('soft-white', 'Soft White', '#EAE7E0'),
      C('charcoal', 'Charcoal', '#2B2B2B', true)
    ],
    sticker: [
      C('white', 'White', '#F6F6F4'),
      C('kraft', 'Kraft', '#C9A97B'),
      C('black', 'Black', '#191919', true)
    ]
  }
};

export function colorwaysFor(form) {
  if (form.family === 'fabric') return COLORWAYS.fabric;
  return COLORWAYS.rigid[form.id] || COLORWAYS.fabric;
}

export function colorway(form, id) {
  const list = colorwaysFor(form);
  return list.find((c) => c.id === id) || list.find((c) => c.id === form.defaultColorway) || list[0];
}
