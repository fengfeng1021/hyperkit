/* Small DOM and formatting helpers. No framework, no build step. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k in node && k !== "list" && typeof v !== "object") node[k] = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function icon(name, size = 12, extraClass = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `ic ${extraClass}`.trim());
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#ic-${name}`);
  svg.append(use);
  return svg;
}

const NF = new Intl.NumberFormat("en-US");
export const num = (n) => NF.format(Math.round(n));

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
export function day(ms) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "undated" : DAY.format(d);
}
export function month(ms) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "undated" : MONTH.format(d);
}

export function seconds(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/** Mark query terms inside a plain-text fragment. Returns a DocumentFragment. */
export function markTerms(text, terms, focusIndex = -1) {
  const frag = document.createDocumentFragment();
  if (!terms || !terms.length) {
    frag.append(document.createTextNode(text));
    return frag;
  }
  const escaped = terms
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) {
    frag.append(document.createTextNode(text));
    return frag;
  }
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(${escaped.join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  let last = 0;
  let seen = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) frag.append(document.createTextNode(text.slice(last, m.index)));
    const mark = document.createElement("mark");
    mark.textContent = m[0];
    mark.className = "hit";
    if (seen === focusIndex) mark.classList.add("is-current");
    mark.dataset.hit = String(seen);
    frag.append(mark);
    seen++;
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
  return frag;
}

/** A one-line context window around the first hit. */
export function snippetAround(text, terms, width = 160) {
  if (!terms || !terms.length) return text.slice(0, width).replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, width).replace(/\s+/g, " ").trim();
  const start = Math.max(0, at - Math.floor(width / 3));
  const raw = text.slice(start, start + width).replace(/\s+/g, " ").trim();
  return (start > 0 ? "..." : "") + raw + (start + width < text.length ? "..." : "");
}

export function trapEscape(node, onEscape) {
  const handler = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onEscape();
    }
  };
  node.addEventListener("keydown", handler);
  return () => node.removeEventListener("keydown", handler);
}
