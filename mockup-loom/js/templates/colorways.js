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
    C('studio-grey', '棚拍灰', '#B9B7B4'),
    C('bone', '骨白', '#E4E0D6'),
    C('natural', '原胚色', '#D3C4A6'),
    C('ochre', '赭黃', '#B3771F'),
    C('forest', '森綠', '#2E4034', true),
    C('black', '黑', '#1B1B1B', true)
  ],
  rigid: {
    mug: [
      C('gloss-white', '亮面白', '#F1F1F1'),
      C('matte-black', '霧面黑', '#1A1A1A', true),
      C('cobalt', '鈷藍', '#1E3E7B', true)
    ],
    poster: [
      C('bright-white', '純白', '#F5F5F3'),
      C('soft-white', '柔白', '#EAE7E0'),
      C('charcoal', '炭灰', '#2B2B2B', true)
    ],
    sticker: [
      C('white', '白', '#F6F6F4'),
      C('kraft', '牛皮紙', '#C9A97B'),
      C('black', '黑', '#191919', true)
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
