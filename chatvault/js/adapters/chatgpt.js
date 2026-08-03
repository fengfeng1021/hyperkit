/* ChatGPT conversations.json.

   The export is a message TREE. Every regenerate and every edited prompt adds a
   sibling. Flattening it by create_time, which is what most viewers do, invents
   conversations the user never had: two answers to the same question appear
   back to back as if the assistant said both.

   This adapter keeps every node and its parent link, records which leaf the
   export considers current, and leaves path selection to conversation.js. */

import { finalize, dedupeKey } from "../conversation.js";

const ROLE = { user: "human", assistant: "assistant", system: "system", tool: "system" };

function textOf(message) {
  const c = message.content;
  if (!c) return "";
  if (typeof c === "string") return c;
  if (Array.isArray(c.parts)) {
    return c.parts
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          if (typeof p.text === "string") return p.text;
          if (p.content_type === "image_asset_pointer") return "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if (typeof c.text === "string") return c.text;
  if (c.content_type === "code" && typeof c.text === "string") return c.text;
  return "";
}

function isVisible(node) {
  const m = node.message;
  if (!m || !m.author) return false;
  const role = ROLE[m.author.role];
  if (!role || role === "system") return false;
  if (m.metadata && m.metadata.is_visually_hidden_from_conversation) return false;
  if (m.author.role === "tool") return false;
  return textOf(m).trim().length > 0;
}

export function adaptChatGPT(record) {
  const mapping = record.mapping || {};
  const ids = Object.keys(mapping);
  if (!ids.length) return null;

  // Nearest visible ancestor, so that hidden system and tool nodes collapse away
  // without breaking the parent chain.
  const visibleParent = new Map();
  const resolve = (id, guard = 0) => {
    if (id == null || guard > 4096) return null;
    if (visibleParent.has(id)) return visibleParent.get(id);
    const node = mapping[id];
    if (!node) return null;
    const answer = isVisible(node) ? id : resolve(node.parent, guard + 1);
    visibleParent.set(id, answer);
    return answer;
  };

  const nodes = [];
  for (const id of ids) {
    const node = mapping[id];
    if (!isVisible(node)) continue;
    const m = node.message;
    nodes.push({
      id,
      parent: resolve(node.parent) || null,
      role: ROLE[m.author.role],
      text: textOf(m).trim(),
      t: (m.create_time || record.create_time || 0) * 1000,
    });
  }
  if (!nodes.length) return null;

  const head = resolve(record.current_node) || null;
  const convId = record.conversation_id || record.id || null;
  const createdAt = (record.create_time || 0) * 1000 || nodes[0].t;

  return finalize({
    id: dedupeKey("chatgpt", convId, record.title, createdAt, nodes[0].text),
    source: "chatgpt",
    convId,
    title: (record.title || "").trim() || "Untitled conversation",
    createdAt,
    updatedAt: (record.update_time || 0) * 1000 || 0,
    nodes,
    head,
    model: record.default_model_slug || null,
  });
}
