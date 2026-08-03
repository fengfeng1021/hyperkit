/* Generic fallback: the user tells ChatVault where the fields are.

   The mapping is stored under a hash of the record's key shape, so the second
   export of the same unknown format is recognised without asking again. */

import { finalize, dedupeKey } from "../conversation.js";
import { readPath, readArrayPath, shapeHash } from "../detect.js";

const STORE_KEY = "chatvault.mappings.v1";

export function loadMappings() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch (err) {
    console.debug("chatvault: mapping store unreadable", err);
    return {};
  }
}

export function rememberMapping(record, mapping) {
  try {
    const all = loadMappings();
    all[shapeHash(record)] = mapping;
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
    return true;
  } catch (err) {
    console.debug("chatvault: mapping could not be stored", err);
    return false;
  }
}

export function recallMapping(record) {
  return loadMappings()[shapeHash(record)] || null;
}

function stamp(v, fallback) {
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return fallback;
}

function normaliseRole(v) {
  const s = String(v || "").toLowerCase();
  if (/assistant|bot|model|ai|gpt|claude|gemini/.test(s)) return "assistant";
  return "human";
}

/**
 * @param {any} record
 * @param {{title:string, createdAt:string, messages:string, role:string, text:string}} mapping
 * @param {number} i index of the record inside the file, for id fallback
 */
export function adaptGeneric(record, mapping, i = 0) {
  const list = readArrayPath(record, mapping.messages);
  if (!Array.isArray(list) || !list.length) return null;
  const createdAt = stamp(readPath(record, mapping.createdAt), Date.now());
  const title = String(readPath(record, mapping.title) || "").trim();

  const nodes = [];
  let prev = null;
  list.forEach((msg, j) => {
    const text = String(readPath(msg, stripArrayPrefix(mapping.text, mapping.messages)) ?? "").trim();
    if (!text) return;
    const role = normaliseRole(readPath(msg, stripArrayPrefix(mapping.role, mapping.messages)));
    const id = `x${i}-${j}`;
    nodes.push({ id, parent: prev, role, text, t: createdAt + j * 1000 });
    prev = id;
  });
  if (!nodes.length) return null;

  return finalize({
    id: dedupeKey("custom", record.id || record.uuid || null, title, createdAt, nodes[0].text),
    source: "custom",
    convId: record.id || record.uuid || `x${i}`,
    title: title || `Record ${i + 1}`,
    createdAt,
    updatedAt: 0,
    nodes,
    head: nodes[nodes.length - 1].id,
    model: null,
  });
}

/** `chat.messages[].body` relative to `chat.messages[]` becomes `body`. */
function stripArrayPrefix(path, arrayPath) {
  if (!path) return path;
  if (arrayPath && path.startsWith(`${arrayPath}.`)) return path.slice(arrayPath.length + 1);
  return path;
}

/** Preview the first `n` messages a mapping would produce. */
export function previewMapping(record, mapping, n = 3) {
  const rec = adaptGeneric(record, mapping, 0);
  if (!rec) return [];
  return rec.nodes.slice(0, n).map((node) => ({ role: node.role, text: node.text.slice(0, 320) }));
}

export const MAPPING_FIELDS = [
  { key: "title", label: "Conversation title", wants: "string" },
  { key: "createdAt", label: "Created at", wants: "string" },
  { key: "messages", label: "Messages array", wants: "array" },
  { key: "role", label: "Message role field", wants: "string" },
  { key: "text", label: "Message text field", wants: "string" },
];
