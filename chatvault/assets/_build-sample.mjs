/* Emits assets/sample-vault.json in real ChatGPT conversations.json shape.
   node assets/_build-sample.mjs
   Not loaded by the site. */
import { CONVERSATIONS as PART_1 } from "./_sample-source.mjs";
import { CONVERSATIONS_2 as PART_2 } from "./_sample-source-2.mjs";
import { writeFileSync } from "node:fs";

const CONVERSATIONS = [...PART_1, ...PART_2].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

let counter = 0;
const uid = (seed) => {
  counter++;
  const hex = (n) => n.toString(16).padStart(4, "0");
  const a = hex((seed * 7919 + counter * 104729) & 0xffff);
  const b = hex((seed * 6151 + counter * 3571) & 0xffff);
  const c = hex((seed * 233 + counter * 977) & 0xffff);
  return `aaa${a}-${b}-4${c.slice(1)}-8${a.slice(1)}-${b}${c}${a}`;
};

const ROLE = { h: "user", a: "assistant" };

function buildConversation(spec, ci) {
  const base = Date.parse(spec.t) / 1000;
  const mapping = {};
  let clock = base;

  const rootId = uid(ci);
  mapping[rootId] = { id: rootId, message: null, parent: null, children: [] };

  // system instruction node, exactly as ChatGPT exports emit it
  const sysId = uid(ci);
  mapping[sysId] = {
    id: sysId,
    message: {
      id: sysId,
      author: { role: "system", name: null, metadata: {} },
      create_time: base,
      update_time: null,
      content: { content_type: "text", parts: [""] },
      status: "finished_successfully",
      end_turn: true,
      weight: 0,
      metadata: { is_visually_hidden_from_conversation: true },
      recipient: "all",
    },
    parent: rootId,
    children: [],
  };
  mapping[rootId].children.push(sysId);

  function addNode(parentId, role, text) {
    clock += 40 + ((text.length * 13) % 220);
    const id = uid(ci);
    mapping[id] = {
      id,
      message: {
        id,
        author: { role: ROLE[role], name: null, metadata: {} },
        create_time: clock,
        update_time: null,
        content: { content_type: "text", parts: [text] },
        status: "finished_successfully",
        end_turn: role === "a" ? true : null,
        weight: 1,
        metadata: role === "a" ? { model_slug: "gpt-4o", default_model_slug: "gpt-4o" } : {},
        recipient: "all",
      },
      parent: parentId,
      children: [],
    };
    mapping[parentId].children.push(id);
    return id;
  }

  // main path
  const chain = [];
  let parent = sysId;
  for (const [role, text] of spec.msgs) {
    parent = addNode(parent, role, text);
    chain.push(parent);
  }
  const currentNode = parent;

  // alternate branches: sibling subtree hanging off the same parent as chain[at]
  for (const br of spec.branches || []) {
    const forkParent = mapping[chain[br.at]].parent;
    const savedClock = clock;
    clock = mapping[chain[br.at]].message.create_time - 30;
    let p = forkParent;
    for (const [role, text] of br.alt) p = addNode(p, role, text);
    clock = savedClock;
  }

  const convId = uid(ci);
  const last = Math.max(
    ...Object.values(mapping)
      .filter((n) => n.message)
      .map((n) => n.message.create_time)
  );

  return {
    title: spec.title,
    create_time: base,
    update_time: last,
    mapping,
    moderation_results: [],
    current_node: currentNode,
    plugin_ids: null,
    conversation_id: convId,
    conversation_template_id: null,
    gizmo_id: null,
    is_archived: false,
    safe_urls: [],
    default_model_slug: "gpt-4o",
    id: convId,
  };
}

const out = CONVERSATIONS.map(buildConversation);
const json = JSON.stringify(out);
writeFileSync(new URL("./sample-vault.json", import.meta.url), json);

const msgCount = out.reduce(
  (n, c) => n + Object.values(c.mapping).filter((x) => x.message && x.message.author.role !== "system").length,
  0
);
console.log(
  `conversations: ${out.length}  messages: ${msgCount}  branched: ${
    CONVERSATIONS.filter((c) => c.branches && c.branches.length).length
  }  bytes: ${json.length}`
);
