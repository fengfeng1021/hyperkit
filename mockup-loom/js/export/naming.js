/**
 * js/export/naming.js
 * File names and folder structure. The seller sees the result of this before
 * pressing Export, because "what will be in the folder" is the thing they are
 * actually buying from a mockup tool.
 */

export const TOKENS = ['design', 'template', 'form', 'colorway', 'w', 'h', 'blend', 'index'];
export const ILLEGAL = /[/\\:*?"<>|]/g;
export const DEFAULT_PATTERN = '{design}__{template}__{w}x{h}';
export const GROUPINGS = [
  { id: 'by-design', label: '依設計' },
  { id: 'by-template', label: '依版型' },
  { id: 'flat', label: '不分' }
];

export function hasIllegal(pattern) {
  ILLEGAL.lastIndex = 0;
  return ILLEGAL.test(pattern);
}

function sanitize(part) {
  return String(part).replace(ILLEGAL, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

/** Expand one pattern against one render job. Always returns a .png name. */
export function expand(pattern, job) {
  const values = {
    design: job.designSlug,
    template: job.templateSlug,
    form: job.formId,
    colorway: job.colorwayId,
    w: String(job.w),
    h: String(job.h),
    blend: job.blendLabel.toLowerCase(),
    index: String(job.index + 1).padStart(3, '0')
  };
  let out = pattern.replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m
  );
  out = sanitize(out).replace(/\.png$/i, '');
  if (!out) out = `${job.designSlug}-${job.index + 1}`;
  return out + '.png';
}

export function folderFor(grouping, job) {
  if (grouping === 'by-design') return `by-design/${job.designSlug}/`;
  if (grouping === 'by-template') return `by-template/${job.templateSlug}/`;
  return '';
}

export function rootFolder(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `mockup-loom-${y}-${m}-${d}`;
}

/**
 * Full path list for a batch. Duplicate names get -2, -3 and the caller is
 * told so it can offer the fix ("add {template} to keep them unique").
 */
export function planPaths(jobs, { pattern, grouping, date }) {
  const root = rootFolder(date);
  const seen = new Map();
  let duplicates = 0;
  const paths = jobs.map((job) => {
    const dir = folderFor(grouping, job);
    let file = expand(pattern, job);
    const key = dir + file.toLowerCase();
    if (seen.has(key)) {
      const n = seen.get(key) + 1;
      seen.set(key, n);
      duplicates++;
      file = file.replace(/\.png$/i, `-${n}.png`);
    } else {
      seen.set(key, 1);
    }
    return { job, path: `${root}/${dir}${file}`, file, dir };
  });
  return { root, paths, duplicates };
}
