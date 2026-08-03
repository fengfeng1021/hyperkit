/**
 * js/util/store.js
 * Settings only. Never a design, never an image, never a file name a seller
 * typed into the pattern field would be enough to identify their work by.
 *
 * Everything here is under a kilobyte and every path fails quietly: private
 * mode is a legitimate way to use this tool, not a problem to nag about.
 */

const KEY = 'mockup-loom.settings';

export const DEFAULT_SETTINGS = {
  formId: 'tee',
  colorwayId: 'studio-grey',
  azimuth: 315,
  elevation: 42,
  intensity: 70,
  blend: 1,
  outputWidth: 2000,
  pattern: '{design}__{template}__{w}x{h}',
  grouping: 'by-design',
  keysSeen: false,
  switchUsed: false
};

let failed = false;

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('shape');
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
    return { ...DEFAULT_SETTINGS };
  }
}

/** Returns false once, and only once, when saving genuinely stopped working. */
export function saveSettings(settings) {
  const payload = JSON.stringify(settings);
  try {
    localStorage.setItem(KEY, payload);
    return true;
  } catch (err) {
    try {
      localStorage.removeItem(KEY);
      localStorage.setItem(KEY, payload);
      return true;
    } catch (err2) {
      if (failed) return false;
      failed = true;
      return false;
    }
  }
}
