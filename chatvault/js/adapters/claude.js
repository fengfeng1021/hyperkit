/* Claude conversations.json.

   Flat message list, so the tree logic in conversation.js degenerates to a
   chain: each node's parent is the previous node. Text lives either in `text`
   or in a `content` array of typed blocks, and both shapes appear in exports
   from different months. */

import { finalize, dedupeKey } from "../conversation.js";

const ROLE = { human: "human", user: "human", assistant: "assistant" };

function textOf(msg) {
  if (typeof msg.text === "string" && msg.text.trim()) return msg.text;
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => {
        if (typeof b === "string") return b;
        if (!b || typeof b !== "object") return "";
        if (typeof b.text === "string") return b.text;
        if (b.type === "tool_use" && b.input) return "";
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

function stamp(v, fallback) {
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return fallback;
}

export function adaptClaude(record) {
  const list = record.chat_messages || [];
  const createdAt = stamp(record.created_at, Date.now());
  const nodes = [];
  let prev = null;
  list.forEach((msg, i) => {
    const role = ROLE[msg.sender || msg.role];
    if (!role) return;
    const text = textOf(msg).trim();
    if (!text) return;
    const id = msg.uuid || `${record.uuid || "c"}-${i}`;
    nodes.push({
      id,
      parent: prev,
      role,
      text,
      t: stamp(msg.created_at, createdAt + i * 1000),
    });
    prev = id;
  });
  if (!nodes.length) return null;

  const convId = record.uuid || record.id || null;
  return finalize({
    id: dedupeKey("claude", convId, record.name, createdAt, nodes[0].text),
    source: "claude",
    convId,
    title: (record.name || record.title || "").trim() || "未命名對話",
    createdAt,
    updatedAt: stamp(record.updated_at, 0),
    nodes,
    head: nodes[nodes.length - 1].id,
    model: record.model || null,
  });
}
