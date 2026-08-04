/* fs.js — 兩條取得資料夾的路徑。
   1. showDirectoryPicker()：只有 Chromium 系有，handle 可存 IndexedDB，授權可續用。
   2. <input type="file" webkitdirectory>：Safari / Firefox 都支援，功能完整，
      但沒有持久授權，每次回來都要重選。
   兩條路徑都回同一種 specimen 形狀，上層不需要分支。 */

export const DEFAULT_EXCLUDES = [
  'node_modules/', '.git/', 'dist/', 'build/', '.next/', '*.min.js', '*-lock.json',
];

/** 超過這個大小的檔案不讀進來（多半是二進位或打包產物） */
const MAX_FILE_BYTES = 1024 * 1024;

const TEXT_EXT = new Set([
  'js','jsx','ts','tsx','mjs','cjs','vue','svelte','py','rb','go','rs','java','kt','swift',
  'php','cs','c','h','cpp','hpp','m','scala','sh','bash','zsh','sql','graphql','prisma',
  'json','yml','yaml','toml','ini','env','conf','xml','html','htm','css','scss','sass','less',
  'md','mdx','txt','astro','tf','dockerfile','gitignore','lock',
]);

export function supportsFSA() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function isTextPath(path) {
  const base = path.split('/').pop() || '';
  if (!base.includes('.')) return /^(Dockerfile|Makefile|Procfile|LICENSE|README)$/i.test(base);
  const ext = base.split('.').pop().toLowerCase();
  return TEXT_EXT.has(ext);
}

/** 排除規則比對。以 `/` 結尾 = 目錄；含 `*` = glob；否則為子字串路徑片段。 */
export function isExcluded(path, patterns) {
  const segs = path.split('/');
  for (const raw of patterns) {
    const p = String(raw || '').trim();
    if (!p) continue;
    if (p.endsWith('/')) {
      const dir = p.slice(0, -1);
      if (segs.slice(0, -1).includes(dir)) return true;
      continue;
    }
    if (p.includes('*')) {
      const rx = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
      if (rx.test(segs[segs.length - 1]) || rx.test(path)) return true;
      continue;
    }
    if (segs.includes(p)) return true;
  }
  return false;
}

export function validPattern(p) {
  const s = String(p || '').trim();
  if (!s) return false;
  if (/[\\<>:"|?]/.test(s)) return false;
  try { new RegExp(s.replace(/\*/g, '.*')); } catch { return false; }
  return true;
}

/* -------------------------------------------------------------- picking */

export async function pickDirectory() {
  const handle = await window.showDirectoryPicker({ id: 'diff-warden', mode: 'read' });
  return {
    id: 'fsa:' + handle.name,
    name: handle.name,
    kind: 'fsa',
    handle,
  };
}

export function pickViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.webkitdirectory = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (v) => { if (done) return; done = true; input.remove(); resolve(v); };
    input.addEventListener('change', () => {
      const files = [...input.files];
      if (!files.length) { finish(null); return; }
      const root = (files[0].webkitRelativePath || files[0].name).split('/')[0];
      finish({
        id: 'picker:' + root,
        name: root,
        kind: 'picker',
        fileList: files,
      });
    });
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/* ------------------------------------------------------------ permission */

export async function permissionState(specimen) {
  if (!specimen || specimen.kind !== 'fsa' || !specimen.handle) return 'granted';
  if (!specimen.handle.queryPermission) return 'granted';
  try { return await specimen.handle.queryPermission({ mode: 'read' }); }
  catch { return 'prompt'; }
}

export async function requestPermission(specimen) {
  if (!specimen || specimen.kind !== 'fsa' || !specimen.handle) return 'granted';
  try { return await specimen.handle.requestPermission({ mode: 'read' }); }
  catch { return 'denied'; }
}

/* ------------------------------------------------------------------ walk */

/**
 * 遞迴列出檔案。回傳 { entries, excluded, skipped }
 * entries: [{ path, size, read() }]
 */
export async function walk(specimen, excludes, onProgress, signal) {
  const entries = [];
  let excluded = 0;
  let skipped = 0;
  let seen = 0;

  const consider = (path, size, read) => {
    seen += 1;
    if (onProgress && seen % 40 === 0) onProgress(seen, entries.length);
    if (isExcluded(path, excludes)) { excluded += 1; return; }
    if (!isTextPath(path)) { skipped += 1; return; }
    if (size > MAX_FILE_BYTES) { skipped += 1; return; }
    entries.push({ path, size, read });
  };

  if (specimen.kind === 'picker') {
    for (const f of specimen.fileList) {
      if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
      const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
      consider(rel, f.size, () => f.text());
    }
  } else if (specimen.kind === 'demo') {
    for (const f of specimen.fileList) consider(f.path, f.size, async () => f.text);
  } else {
    await walkHandle(specimen.handle, '', consider, excludes, signal);
  }

  if (onProgress) onProgress(seen, entries.length);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { entries, excluded, skipped, seen };
}

async function walkHandle(dir, prefix, consider, excludes, signal) {
  for await (const [name, handle] of dir.entries()) {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    const path = prefix ? prefix + '/' + name : name;
    if (handle.kind === 'directory') {
      if (isExcluded(path + '/x', excludes)) continue;
      await walkHandle(handle, path, consider, excludes, signal);
    } else {
      let size = 0;
      let fileRef = null;
      try { fileRef = await handle.getFile(); size = fileRef.size; }
      catch { continue; }
      consider(path, size, () => handle.getFile().then((f) => f.text()));
    }
  }
}
