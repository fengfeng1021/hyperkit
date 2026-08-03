/* Structural feature detection.

   Never filename based. A file called conversations.json can be any of three
   formats and a file called export-2025.json can be all of them. Each detector
   asks about structure that only that exporter produces. */

export const SOURCES = {
  chatgpt: { id: "chatgpt", label: "ChatGPT" },
  claude: { id: "claude", label: "Claude" },
  gemini: { id: "gemini", label: "Gemini" },
  custom: { id: "custom", label: "自訂" },
};

/**
 * @param {any} record a single top-level element of the export
 * @returns {{source:string, confidence:number, reason:string}|null}
 */
export function detectRecord(record) {
  if (!record || typeof record !== "object") return null;

  // ChatGPT: a message tree keyed by node id, plus the id of the leaf that the
  // export considers current. Both must be present; mapping alone is not enough.
  if (record.mapping && typeof record.mapping === "object" && !Array.isArray(record.mapping)) {
    const nodes = Object.values(record.mapping);
    const looksLikeTree = nodes.some((n) => n && typeof n === "object" && "parent" in n && "children" in n);
    if (looksLikeTree) {
      return {
        source: "chatgpt",
        confidence: "current_node" in record ? 1 : 0.8,
        reason: "mapping 裡有 parent／children 節點，還有一個 current_node 葉節點",
      };
    }
  }

  // Claude: a flat array of messages with a sender of human or assistant.
  if (Array.isArray(record.chat_messages)) {
    const first = record.chat_messages[0];
    if (!first || (first && ("sender" in first || "text" in first || "content" in first))) {
      return {
        source: "claude",
        confidence: 1,
        reason: "chat_messages 陣列，每一則都帶 sender 欄位",
      };
    }
  }

  // Gemini via Google Takeout: My Activity records, one per prompt or response.
  if (typeof record.header === "string" && typeof record.title === "string" && "time" in record) {
    if (/gemini|bard/i.test(record.header)) {
      return {
        source: "gemini",
        confidence: 1,
        reason: "Takeout 活動紀錄，帶 Gemini header 和時間戳",
      };
    }
  }
  if (Array.isArray(record.turns) || Array.isArray(record.conversation_turns)) {
    return { source: "gemini", confidence: 0.7, reason: "Gemini 對話匯出檔裡的 turn 清單" };
  }

  return null;
}

/** Detect from an HTML document body. Takeout ships Gemini history as HTML. */
export function detectHtml(text) {
  const head = text.slice(0, 4000);
  if (!/<html|<!doctype html/i.test(head)) return null;
  if (/mdl-grid|content-cell|outer-cell/i.test(text.slice(0, 200000))) {
    return { source: "gemini", confidence: 0.9, reason: "由 content-cell 區塊組成的 Takeout 活動頁面" };
  }
  return { source: "custom", confidence: 0.3, reason: "HTML 文件，沒有認得出來的活動標記" };
}

/** Candidate files inside a zip, most likely first. Structure is checked later. */
export function rankZipEntries(entries) {
  const score = (name) => {
    const n = name.toLowerCase();
    if (n.endsWith("/") || n.startsWith("__macosx")) return -1;
    let s = 0;
    if (n.endsWith(".json")) s += 10;
    if (n.endsWith(".html") || n.endsWith(".htm")) s += 6;
    if (/conversations?\.json$/.test(n)) s += 40;
    if (/chat.*\.json$/.test(n)) s += 12;
    if (/myactivity/.test(n)) s += 20;
    if (/gemini|bard/.test(n)) s += 8;
    if (/users?\.json$|projects?\.json$|shared|feedback|message_feedback/.test(n)) s -= 12;
    return s;
  };
  return entries
    .map((e) => ({ entry: e, score: score(e.name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length)
    .map((x) => x.entry);
}

/** A stable hash of an unknown record's key shape, so a mapping can be remembered. */
export function shapeHash(record, depth = 0) {
  if (record === null || typeof record !== "object") return typeof record;
  if (Array.isArray(record)) return depth > 3 ? "[]" : `[${record.length ? shapeHash(record[0], depth + 1) : ""}]`;
  const keys = Object.keys(record).sort().slice(0, 40);
  if (depth > 3) return `{${keys.join(",")}}`;
  return `{${keys.map((k) => `${k}:${shapeHash(record[k], depth + 1)}`).join(",")}}`;
}

/** Every leaf-ish key path in a record, for the field mapping wizard. */
export function keyPaths(record, prefix = "", out = [], depth = 0) {
  if (depth > 4 || record === null || typeof record !== "object") return out;
  if (Array.isArray(record)) {
    if (record.length) keyPaths(record[0], `${prefix}[]`, out, depth + 1);
    return out;
  }
  for (const k of Object.keys(record)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const v = record[k];
    const type = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
    out.push({ path, type, sample: previewValue(v) });
    if (v && typeof v === "object") keyPaths(v, path, out, depth + 1);
  }
  return out;
}

function previewValue(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array of ${v.length}`;
  if (typeof v === "object") return `object with ${Object.keys(v).length} keys`;
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}...` : s;
}

/** Read a value out of a record by a path produced by keyPaths. */
export function readPath(record, path) {
  if (!path) return undefined;
  let cur = record;
  for (const seg of path.split(".")) {
    if (cur == null) return undefined;
    if (seg.endsWith("[]")) {
      cur = cur[seg.slice(0, -2)];
      if (!Array.isArray(cur)) return undefined;
      cur = cur[0];
    } else {
      cur = cur[seg];
    }
  }
  return cur;
}

/** Read an array-valued path (does not descend into the first element). */
export function readArrayPath(record, path) {
  if (!path) return undefined;
  let cur = record;
  for (const seg of path.split(".")) {
    if (cur == null) return undefined;
    cur = seg.endsWith("[]") ? cur[seg.slice(0, -2)] : cur[seg];
    if (Array.isArray(cur) && seg.endsWith("[]")) return cur;
  }
  return Array.isArray(cur) ? cur : undefined;
}
