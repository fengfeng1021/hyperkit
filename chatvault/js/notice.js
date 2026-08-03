/* Inline notices.

   Not toasts. An error that disappears on a timer is an error the user cannot
   act on, and every failure in this product has a recovery action attached to
   it. No icons and no coloured dots: the title says how bad it is. */

import { el, clear } from "./dom.js";

/**
 * @param {HTMLElement} host
 * @param {{tone:'alert'|'amber', title:string, body?:string, mono?:string,
 *          actions?:{label:string, onClick:Function, primary?:boolean}[],
 *          list?:string[], autoDismiss?:number}} spec
 */
export function showNotice(host, spec) {
  clear(host);
  host.hidden = false;
  const box = el("div", { class: `notice notice--${spec.tone || "alert"}`, role: spec.tone === "amber" ? "status" : "alert" });
  box.append(el("p", { class: "notice__title", text: spec.title }));
  if (spec.body) box.append(el("p", { class: "notice__body", text: spec.body }));
  if (spec.mono) box.append(el("pre", { class: "notice__mono", text: spec.mono }));
  if (spec.list && spec.list.length) {
    const list = el("ul", { class: "notice__list" });
    for (const item of spec.list) list.append(el("li", { text: item }));
    box.append(list);
  }
  if (spec.node) box.append(spec.node);
  if (spec.actions && spec.actions.length) {
    const row = el("div", { class: "notice__actions" });
    for (const action of spec.actions) {
      row.append(
        el("button", {
          type: "button",
          class: `btn btn--${action.primary ? "solid" : "line"} btn--sm`,
          text: action.label,
          onclick: action.onClick,
        })
      );
    }
    box.append(row);
  }
  host.append(box);
  if (spec.autoDismiss) {
    setTimeout(() => {
      if (host.contains(box)) hideNotice(host);
    }, spec.autoDismiss);
  }
  return box;
}

export function hideNotice(host) {
  clear(host);
  host.hidden = true;
}

/** Every failure path in the spec, in one place, each with words and a way out. */
export const FAILURES = {
  "file-protocol": () => ({
    tone: "alert",
    title: "ChatVault needs to be served over http.",
    body: "ES modules and Web Workers are blocked on file:// URLs.",
    mono: "python -m http.server 8000",
  }),
  "empty-file": () => ({
    tone: "alert",
    title: "That file is empty.",
    body: "Check that the download finished.",
  }),
  "no-decompression": () => ({
    tone: "alert",
    title: "This browser cannot unzip inside the page.",
    body: "Unzip the export yourself and drop conversations.json instead.",
  }),
  "zip-no-candidate": (d) => ({
    tone: "alert",
    title: `That zip has ${d.count} files but none look like a conversation export.`,
    body: "ChatVault looks for conversations.json, a chat_messages array, or a Google Takeout activity file.",
  }),
  "bad-zip": () => ({
    tone: "alert",
    title: "That zip could not be opened.",
    body: "The central directory is missing or damaged. Try downloading the export again.",
  }),
  "unknown-format": () => ({
    tone: "alert",
    title: "We could not match this file to a known export format.",
    body: "Map the fields yourself and ChatVault will remember this shape.",
  }),
  "no-conversations": (d) => ({
    tone: "alert",
    title: `Nothing readable in that file. ${d.seen} records were scanned.`,
    body: "Every record was empty or held only system instructions.",
  }),
  "worker-unavailable": () => ({
    tone: "alert",
    title: "Background parsing is unavailable here.",
    body: "ChatVault can parse on the main thread, but the tab may freeze for a while on large files.",
  }),
  quota: (d) => ({
    tone: "alert",
    title: `Your vault needs about ${d.needed} but this browser allowed ${d.allowed}.`,
    body: "Already-read conversations are safe.",
  }),
  "export-too-large": () => ({
    tone: "alert",
    title: "The export is too large to build in one file.",
    body: "Narrow the filter and try again.",
  }),
  "clipboard-blocked": () => ({
    tone: "alert",
    title: "Copy blocked by the browser.",
    body: "Select the text and press Ctrl+C.",
  }),
  "branch-unreachable": () => ({
    tone: "alert",
    title: "This branch is unreachable in the export.",
    body: "Showing the main path.",
  }),
  "semantic-failed": () => ({
    tone: "alert",
    title: "Meaning search is unavailable: the model could not be downloaded.",
    body: "Keyword search is unaffected.",
  }),
  unexpected: (d) => ({
    tone: "alert",
    title: "That file could not be read to the end.",
    body: "Nothing already in your vault was changed. The technical detail is in the browser console.",
    mono: d && d.message ? String(d.message).slice(0, 240) : undefined,
  }),
};
