/* Export: Markdown and JSON, one conversation or the whole current result set.

   The batch numbers on the menu are the real count of the current filter, not a
   round number, because a batch export that quietly writes a different number
   of files than it promised is the kind of thing that stops people trusting an
   archive tool. */

import { readingPath } from "./conversation.js";
import { buildZip } from "./zip-write.js";
import { SOURCES } from "./detect.js";

const MAX_BLOB = 1.8 * 1024 * 1024 * 1024;

export class ExportTooLarge extends Error {}

function isoDay(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "undated";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function safeName(title, id) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || `conversation-${id.slice(-8)}`;
}

export function toMarkdown(rec, choices) {
  const { path } = readingPath(rec, choices);
  const lines = [];
  lines.push(`# ${rec.title}`);
  lines.push("");
  lines.push(`Source: ${SOURCES[rec.source] ? SOURCES[rec.source].label : rec.source}`);
  lines.push(`Started: ${isoDay(rec.createdAt)}`);
  lines.push(`Messages on this path: ${path.length} of ${rec.nodes.length} stored`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const i of path) {
    const node = rec.nodes[i];
    lines.push(`## ${node.role === "human" ? "You" : "Assistant"}`);
    lines.push("");
    lines.push(node.text);
    lines.push("");
  }
  return lines.join("\n");
}

export function toJson(rec, choices) {
  const { path, forks } = readingPath(rec, choices);
  const onPath = new Set(path);
  return JSON.stringify(
    {
      chatvault: 1,
      id: rec.id,
      source: rec.source,
      title: rec.title,
      createdAt: new Date(rec.createdAt).toISOString(),
      hasCode: rec.hasCode,
      branchPoints: [...forks.keys()].map((i) => ({ index: path.indexOf(i), options: forks.get(i).siblings.length })),
      messages: rec.nodes.map((node, i) => ({
        role: node.role,
        text: node.text,
        at: node.t ? new Date(node.t).toISOString() : null,
        onCurrentPath: onPath.has(i),
        parent: node.parent,
        id: node.id,
      })),
    },
    null,
    2
  );
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { filename, size: blob.size };
}

export function exportOne(rec, format, choices) {
  const stamp = isoDay(rec.createdAt);
  if (format === "json") {
    const text = toJson(rec, choices);
    return download(new Blob([text], { type: "application/json" }), `${stamp}-${safeName(rec.title, rec.id)}.json`);
  }
  const text = toMarkdown(rec, choices);
  return download(new Blob([text], { type: "text/markdown" }), `${stamp}-${safeName(rec.title, rec.id)}.md`);
}

/**
 * @param {object[]} records
 * @param {'markdown'|'json'} format
 * @param {(done:number,total:number)=>void} onProgress
 */
export async function exportMany(records, format, onProgress) {
  const today = isoDay(Date.now());
  if (format === "json") {
    const parts = [];
    let bytes = 0;
    for (let i = 0; i < records.length; i++) {
      const text = toJson(records[i]);
      bytes += text.length;
      if (bytes > MAX_BLOB) throw new ExportTooLarge();
      parts.push(text);
      if (onProgress && i % 20 === 0) {
        onProgress(i + 1, records.length);
        await tick();
      }
    }
    const blob = new Blob([`[\n${parts.join(",\n")}\n]`], { type: "application/json" });
    return download(blob, `chatvault-${today}.json`);
  }

  const files = [];
  const used = new Set();
  let bytes = 0;
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    let name = `${isoDay(rec.createdAt)}-${safeName(rec.title, rec.id)}.md`;
    let n = 2;
    while (used.has(name)) name = `${isoDay(rec.createdAt)}-${safeName(rec.title, rec.id)}-${n++}.md`;
    used.add(name);
    const text = toMarkdown(rec);
    bytes += text.length;
    if (bytes > MAX_BLOB) throw new ExportTooLarge();
    files.push({ name, text });
    if (onProgress && i % 20 === 0) {
      onProgress(i + 1, records.length);
      await tick();
    }
  }
  if (onProgress) onProgress(records.length, records.length);
  let blob;
  try {
    blob = buildZip(files);
  } catch (err) {
    console.debug("chatvault: zip build failed", err);
    throw new ExportTooLarge();
  }
  return download(blob, `chatvault-${today}.zip`);
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
