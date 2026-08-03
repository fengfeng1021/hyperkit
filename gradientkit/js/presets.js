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
    name: '深空',
    demonstrates: '預設的那一組。這條斜坡走到五分之一的地方，sRGB 會把三分之一的彩度吸掉。按空白鍵看它長回來。',
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
    name: '鈉燈',
    demonstrates: '無色相端點的色相沿用。接近全黑的那一端本身沒有色相，所以它直接借用橘色，而不是繞一圈彎進紅色裡。',
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
    name: '陽極',
    demonstrates: '兩個高彩度色標，中間什麼都不放——實務上漸層就是這樣寫的。也就是 sRGB 開始泛白的地方。',
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
    name: '冷陰極',
    demonstrates: '把中間那個色標打開，彩度往上推：色域那一行會告訴你實際被裁到多少彩度、Delta E 是多少，而不是默默夾掉。',
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
    name: '窯',
    demonstrates: '很長的色相位移，暗紅走到琥珀。短弧規則在這裡決定這條坡是會經過一段土色，還是一路都是亮的。',
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
    name: '礦石淡彩',
    demonstrates: '直角座標混色。同樣這幾個色標切到 OKLCH，就知道極座標到底多做了什麼。',
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
    name: '光阻',
    demonstrates: '圓錐型，用的正是當初讓這個工具誕生的那組紫和青。',
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
    name: '陰天',
    demonstrates: '接近中性的斜坡。比對之後會說沒有明顯的死區，因為真的沒有。誠實比表演重要。',
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
    name: '餘燼環',
    demonstrates: '放射型，原點不在正中間。從高溫走到全黑的坡在 sRGB 裡會賠掉四分之一的彩度。',
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
    name: '極光',
    demonstrates: '四個色標繞成一個封閉的圈，第一個和最後一個必須一模一樣才不會接出縫。',
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
    name: '藍曬',
    demonstrates: '低彩度的藍。這種情況插值幾乎沒差，抖色差很多。把放大鏡移上去看。',
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
    name: '灰階梯',
    demonstrates: '對照組。無彩色，而且故意用 sRGB——色帶在中性斜坡上最明顯，抖色放大鏡在這裡最有說服力。',
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
    name: '綻放',
    demonstrates: '最精簡的網格。兩個暖色團、兩個冷色團，在正中間碰頭。',
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
    name: '干涉',
    demonstrates: '別的 sRGB 網格工具在這裡會接出灰色的縫，OKLab 不會。',
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
    name: '剖面',
    demonstrates: '點數拉到上限。效能天花板，也是為什麼需要 WebGL 的那個例子。',
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
  probe: { text: '禮拜五就要上線', size: 32, weight: 600, fg: '#FFFFFF' },
  gradients: GRADIENT_PRESETS,
  meshes: MESH_PRESETS,
};

export function findPreset(id) {
  return GRADIENT_PRESETS.find((p) => p.id === id) || MESH_PRESETS.find((p) => p.id === id) || null;
}
