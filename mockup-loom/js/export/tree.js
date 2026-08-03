/**
 * js/export/tree.js
 * The folder preview. The seller reads this before pressing Export, so it has
 * to show real file names produced by the real pattern, not a sketch.
 *
 * Lines are emitted as separate elements with a stable class so the motion
 * pass can draw them one at a time. They are visible by default.
 */

const MAX_LINES = 40;

export function buildTreeLines(root, paths) {
  const tree = { name: root, dirs: new Map(), files: [] };
  for (const p of paths) {
    const parts = p.path.split('/').slice(1);
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.dirs.has(seg)) node.dirs.set(seg, { name: seg, dirs: new Map(), files: [] });
      node = node.dirs.get(seg);
    }
    node.files.push(parts[parts.length - 1]);
  }

  const lines = [{ text: `${root}/`, kind: 'dir', depth: 0 }];
  lines.push({ text: 'MANIFEST.txt', kind: 'file', depth: 1 });
  walk(tree, 1, lines);
  return lines;
}

function walk(node, depth, lines) {
  for (const f of node.files) lines.push({ text: f, kind: 'file', depth });
  for (const child of node.dirs.values()) {
    lines.push({ text: `${child.name}/`, kind: 'dir', depth });
    walk(child, depth + 1, lines);
  }
}

export function renderTree(el, lines) {
  el.textContent = '';
  const shown = lines.slice(0, MAX_LINES);
  const frag = document.createDocumentFragment();
  for (const line of shown) {
    const span = document.createElement('span');
    span.className = `tree-line ${line.kind === 'dir' ? 'tree-dir' : 'tree-file'}`;
    span.textContent = '  '.repeat(line.depth) + line.text + '\n';
    frag.appendChild(span);
  }
  if (lines.length > shown.length) {
    const more = document.createElement('span');
    more.className = 'tree-line tree-file';
    const n = lines.length - shown.length;
    more.textContent = `and ${n} more ${n === 1 ? 'file' : 'files'}\n`;
    frag.appendChild(more);
  }
  el.appendChild(frag);
  el.hidden = false;
  return shown.length;
}
