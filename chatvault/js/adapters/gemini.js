/* Gemini via Google Takeout.

   Takeout ships Gemini history as My Activity, either as JSON records or as one
   large HTML page. Neither is a conversation: each record is a single prompt,
   with the answer either in the same record's details or in the next record.
   The adapter groups consecutive records into sessions using a time gap, which
   is the best that the format allows, and says so in the reading pane rather
   than pretending the grouping came from Google. */

import { finalize, dedupeKey } from "../conversation.js";

const SESSION_GAP_MS = 30 * 60 * 1000;

function stripPrompt(title) {
  return title.replace(/^Prompted\s+/i, "").replace(/^Asked\s+/i, "").trim();
}

/** One Takeout activity record to a normalised turn, or null. */
export function geminiTurn(record) {
  if (!record || typeof record !== "object") return null;
  const t = Date.parse(record.time || record.timestamp || "");
  if (Number.isNaN(t)) return null;
  const title = String(record.title || "");
  const isPrompt = /^prompted\b/i.test(title) || !record.subtitles;
  const text = stripPrompt(title);
  if (!text) return null;
  const answer =
    (Array.isArray(record.details) && record.details.map((d) => d.name).filter(Boolean).join("\n")) || "";
  return { t, role: isPrompt ? "human" : "assistant", text, answer };
}

/** Group normalised turns into conversations by time gap. */
export function groupGemini(turns) {
  turns.sort((a, b) => a.t - b.t);
  const out = [];
  let current = null;
  for (const turn of turns) {
    if (!current || turn.t - current.last > SESSION_GAP_MS) {
      current = { start: turn.t, last: turn.t, turns: [] };
      out.push(current);
    }
    current.last = turn.t;
    current.turns.push(turn);
  }
  return out.map(toRecord).filter(Boolean);
}

function toRecord(group, i) {
  const nodes = [];
  let prev = null;
  let seq = 0;
  for (const turn of group.turns) {
    const id = `g${group.start}-${seq++}`;
    nodes.push({ id, parent: prev, role: turn.role, text: turn.text, t: turn.t });
    prev = id;
    if (turn.answer) {
      const aid = `g${group.start}-${seq++}`;
      nodes.push({ id: aid, parent: prev, role: "assistant", text: turn.answer, t: turn.t + 1 });
      prev = aid;
    }
  }
  if (!nodes.length) return null;
  const title = nodes[0].text.slice(0, 80).replace(/\s+/g, " ").trim() || "Gemini session";
  return finalize({
    id: dedupeKey("gemini", `${group.start}-${i}`, title, group.start, nodes[0].text),
    source: "gemini",
    convId: `${group.start}-${i}`,
    title,
    createdAt: group.start,
    updatedAt: group.last,
    nodes,
    head: nodes[nodes.length - 1].id,
    model: null,
    grouped: true,
  });
}

/** Parse the HTML form of My Activity. */
export function adaptGeminiHtml(text) {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(text, "text/html");
  const cells = doc.querySelectorAll(".content-cell, .mdl-typography--body-1");
  const turns = [];
  for (const cell of cells) {
    const raw = cell.textContent || "";
    const match = raw.match(/(\w{3}\s+\d{1,2},\s+\d{4},\s+[\d:]+\s*(?:AM|PM)?[^,]*)$/);
    const when = match ? Date.parse(match[1].replace(/\s+[A-Z]{2,4}$/, "")) : NaN;
    const body = (match ? raw.slice(0, match.index) : raw).trim();
    if (!body) continue;
    turns.push({
      t: Number.isNaN(when) ? Date.now() : when,
      role: /^prompted\b/i.test(body) ? "human" : "assistant",
      text: stripPrompt(body),
      answer: "",
    });
  }
  return groupGemini(turns);
}
