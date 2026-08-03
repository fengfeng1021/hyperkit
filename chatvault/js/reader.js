/* The reading pane: one conversation, on one branch, with its code blocks
   highlighted and its search hits navigable.

   Message rows are virtualised by measured height. Branch switching recomputes
   the path and marks which rows actually changed, so the motion layer can enter
   only the difference; with motion off the pane simply redraws. */

import { el, clear, num, day, markTerms, icon } from "./dom.js";
import { readingPath } from "./conversation.js";
import { splitFences, highlight } from "./highlight.js";
import { MeasuredList } from "./vlist.js";
import { state, choicesFor, emit } from "./state.js";
import { showNotice, hideNotice, FAILURES } from "./notice.js";

const LONG_MESSAGE = 40000;
const LONG_HEAD = 8000;
const PAGE = 1000;

export class Reader {
  constructor(root) {
    this.root = root;
    this.header = root.querySelector(".reader__header");
    this.titleEl = root.querySelector(".reader__title");
    this.metaEl = root.querySelector(".reader__meta");
    this.noticeHost = root.querySelector(".reader__notice");
    this.viewport = root.querySelector(".reader__scroll");
    this.spacer = root.querySelector(".reader__spacer");
    this.track = root.querySelector(".reader__track");
    this.matchBar = root.querySelector(".matchbar");
    this.matchCount = root.querySelector(".matchbar__count");
    this.pagingHost = root.querySelector(".reader__paging");
    this.emptyEl = root.querySelector(".reader__empty");

    this.record = null;
    this.path = [];
    this.forks = new Map();
    this.expanded = new Set();
    this.window = { extra: 0 };
    this.terms = [];
    this.matches = [];
    this.matchIndex = 0;

    this.list = new MeasuredList(
      this.viewport,
      this.spacer,
      this.track,
      (i, row) => this.renderRow(i, row),
      220
    );

    root.querySelector(".matchbar__prev").addEventListener("click", () => this.step(-1));
    root.querySelector(".matchbar__next").addEventListener("click", () => this.step(1));
  }

  clearView() {
    this.record = null;
    this.path = [];
    this.list.setKeys([]);
    clear(this.track);
    this.list.pool = [];
    this.root.dataset.empty = "true";
    this.matchBar.hidden = true;
    hideNotice(this.noticeHost);
  }

  /** @param {object} record @param {string[]} terms */
  show(record, terms) {
    this.record = record;
    this.terms = terms || [];
    this.window.extra = 0;
    this.expanded.clear();
    this.root.dataset.empty = "false";
    hideNotice(this.noticeHost);
    this.recompute();
    this.viewport.scrollTop = 0;
  }

  recompute(previousKeys) {
    const rec = this.record;
    if (!rec) return;
    const choices = choicesFor(rec.id);
    const { path, forks, repaired } = readingPath(rec, choices);
    this.path = path;
    this.forks = forks;

    if (repaired) {
      showNotice(this.noticeHost, FAILURES["branch-unreachable"]());
    }

    this.titleEl.textContent = rec.title;
    clear(this.metaEl);
    const meta = [
      el("span", { class: "reader__source" }, icon(`src-${rec.source}`, 12), sourceLabel(rec.source)),
      el("span", { class: "reader__dot", "aria-hidden": "true", text: "/" }),
      el("span", { text: day(rec.createdAt) }),
      el("span", { class: "reader__dot", "aria-hidden": "true", text: "/" }),
      el("span", { text: `${num(path.length)} messages on this path` }),
    ];
    if (rec.nodes.length > path.length) {
      meta.push(
        el("span", { class: "reader__alt", text: `${num(rec.nodes.length - path.length)} on other branches` })
      );
    }
    this.metaEl.append(...meta);

    // A very long conversation is paged from the newest end, and the control
    // says how many of how many are on screen rather than truncating silently.
    let visible = path;
    this.paged = false;
    const shown = PAGE + this.window.extra;
    if (path.length > shown * 1.2) {
      this.paged = true;
      visible = path.slice(path.length - shown);
    }
    this.visible = visible;
    clear(this.pagingHost);
    this.pagingHost.hidden = !this.paged;
    if (this.paged) {
      this.pagingHost.append(
        el("p", {
          class: "reader__paging-note",
          text: `Showing the latest ${num(visible.length)} of ${num(path.length)} messages.`,
        }),
        el("button", {
          type: "button",
          class: "btn btn--line btn--sm",
          text: `Load ${num(Math.min(PAGE, path.length - visible.length))} earlier`,
          onclick: () => this.loadEarlier(),
        })
      );
    }

    const keys = visible.map((i) => `${rec.id}:${rec.nodes[i].id}`);
    this.changedKeys = previousKeys ? new Set(keys.filter((k) => !previousKeys.has(k))) : null;
    this.list.setKeys(keys);
    this.collectMatches();
    emit("reader:rendered", { record: rec, path, changed: this.changedKeys });
  }

  currentKeys() {
    return new Set((this.visible || []).map((i) => `${this.record.id}:${this.record.nodes[i].id}`));
  }

  switchBranch(nodeIndex, delta) {
    const rec = this.record;
    const fork = this.forks.get(nodeIndex);
    if (!fork) return;
    const next = fork.siblings[fork.pos + delta];
    if (next === undefined) return;
    const parentNode = rec.nodes[nodeIndex].parent;
    const key = parentNode === null || parentNode === undefined ? " root" : parentNode;
    const before = this.currentKeys();
    choicesFor(rec.id).set(key, rec.nodes[next].id);
    this.recompute(before);
  }

  renderRow(i, row) {
    const rec = this.record;
    if (!rec) return;
    const nodeIndex = this.visible[i];
    const node = rec.nodes[nodeIndex];
    const key = `${rec.id}:${node.id}`;
    if (row.dataset.key === key && row.dataset.terms === this.terms.join(" ")) return;
    row.dataset.key = key;
    row.dataset.terms = this.terms.join(" ");
    row.className = `vrow vrow--measured msg msg--${node.role}`;
    if (this.changedKeys && this.changedKeys.has(key)) row.classList.add("is-changed");
    clear(row);

    const head = el("div", { class: "msg__head" });
    head.append(el("span", { class: "msg__role", text: node.role === "human" ? "You" : "Assistant" }));

    const fork = this.forks.get(nodeIndex);
    if (fork) {
      head.append(this.branchSwitcher(nodeIndex, fork));
    }

    const actions = el("div", { class: "msg__actions" });
    const copyBtn = el(
      "button",
      {
        type: "button",
        class: "linkbtn",
        onclick: () => this.copy(node.text, copyBtn),
      },
      icon("copy", 12),
      el("span", { text: "Copy" })
    );
    const linkBtn = el("button", {
      type: "button",
      class: "linkbtn",
      text: "Link",
      onclick: () => {
        location.hash = `c=${encodeURIComponent(rec.id)}&m=${nodeIndex}`;
        linkBtn.textContent = "Link copied to the address bar";
        setTimeout(() => {
          linkBtn.textContent = "Link";
        }, 1600);
      },
    });
    actions.append(copyBtn, linkBtn);
    head.append(actions);
    row.append(head);

    const body = el("div", { class: "msg__body" });
    let text = node.text;
    const isLong = text.length > LONG_MESSAGE && !this.expanded.has(key);
    if (isLong) text = text.slice(0, LONG_HEAD);

    for (const part of splitFences(text)) {
      if (part.kind === "code") body.append(this.codeBlock(part));
      else body.append(this.prose(part.text));
    }

    if (isLong) {
      body.append(
        el("button", {
          type: "button",
          class: "btn btn--line btn--sm msg__more",
          text: `Show the remaining ${num(node.text.length - LONG_HEAD)} characters`,
          onclick: () => {
            this.expanded.add(key);
            row.dataset.key = "";
            this.list.cache.delete(key);
            this.list.setKeys(this.list.keys);
          },
        })
      );
    }
    row.append(body);
  }

  prose(text) {
    const wrap = el("div", { class: "prose" });
    const paragraphs = text.split(/\n{2,}/);
    for (const p of paragraphs) {
      if (!p.trim()) continue;
      const node = el("p");
      node.append(markTerms(p.replace(/\n/g, " "), this.terms));
      wrap.append(node);
    }
    return wrap;
  }

  codeBlock(part) {
    const result = highlight(part.text, part.lang);
    const block = el("figure", { class: "code" });
    const head = el("figcaption", { class: "code__head" });
    head.append(el("span", { class: "code__lang", text: result.language }));
    if (result.skipped) {
      head.append(el("span", { class: "code__note", text: "Highlighting skipped for a very long block" }));
    }
    const copy = el(
      "button",
      { type: "button", class: "linkbtn code__copy", onclick: () => this.copy(part.text, copy) },
      icon("copy", 12),
      el("span", { text: "Copy" })
    );
    head.append(copy);
    const pre = el("pre", { class: "code__pre", tabindex: "0" });
    const codeEl = el("code");
    codeEl.innerHTML = result.html;
    pre.append(codeEl);
    block.append(head, pre);
    return block;
  }

  branchSwitcher(nodeIndex, fork) {
    const wrap = el("div", { class: "branch", role: "group", "aria-label": "Branch at this message" });
    const prev = el(
      "button",
      {
        type: "button",
        class: "branch__arrow",
        "aria-label": "Previous branch",
        onclick: () => this.switchBranch(nodeIndex, -1),
      },
      icon("chev-left", 10)
    );
    const next = el(
      "button",
      {
        type: "button",
        class: "branch__arrow",
        "aria-label": "Next branch",
        onclick: () => this.switchBranch(nodeIndex, 1),
      },
      icon("chev-right", 10)
    );
    if (fork.pos === 0) {
      prev.disabled = true;
      prev.setAttribute("aria-disabled", "true");
    }
    if (fork.pos === fork.siblings.length - 1) {
      next.disabled = true;
      next.setAttribute("aria-disabled", "true");
    }
    wrap.append(prev, el("span", { class: "branch__count", text: `${fork.pos + 1} / ${fork.siblings.length}` }), next);
    return wrap;
  }

  async copy(text, button) {
    const label = button.querySelector("span") || button;
    const original = label.textContent;
    try {
      await navigator.clipboard.writeText(text);
      label.textContent = "Copied";
      setTimeout(() => {
        label.textContent = original;
      }, 1600);
    } catch (err) {
      console.debug("chatvault: clipboard blocked", err);
      label.textContent = "Copy blocked by the browser. Select the text and press Ctrl+C.";
      button.classList.add("is-error");
      setTimeout(() => {
        label.textContent = original;
        button.classList.remove("is-error");
      }, 4000);
    }
  }

  /** Count hits across the whole path, not only the rendered window. */
  collectMatches() {
    this.matches = [];
    if (!this.record || !this.terms.length) {
      this.matchBar.hidden = true;
      return;
    }
    const lowered = this.terms.map((t) => t.toLowerCase());
    (this.visible || []).forEach((nodeIndex, rowIndex) => {
      const text = this.record.nodes[nodeIndex].text.toLowerCase();
      let count = 0;
      for (const t of lowered) {
        let at = text.indexOf(t);
        while (at >= 0) {
          count++;
          at = text.indexOf(t, at + t.length);
        }
      }
      for (let k = 0; k < count; k++) this.matches.push({ rowIndex, k });
    });
    this.matchIndex = 0;
    this.matchBar.hidden = this.matches.length === 0;
    this.matchCount.textContent = `${num(this.matches.length)} ${this.matches.length === 1 ? "match" : "matches"}`;
  }

  step(delta) {
    if (!this.matches.length) return;
    this.matchIndex = (this.matchIndex + delta + this.matches.length) % this.matches.length;
    const target = this.matches[this.matchIndex];
    this.list.scrollToIndex(target.rowIndex, "center");
    this.matchCount.textContent = `${this.matchIndex + 1} of ${num(this.matches.length)}`;
    requestAnimationFrame(() => {
      const marks = this.track.querySelectorAll("mark.hit");
      marks.forEach((m) => m.classList.remove("is-current"));
      const row = [...this.track.children].find((r) => !r.hidden && r.dataset.key === this.keyAt(target.rowIndex));
      if (row) {
        const inRow = row.querySelectorAll("mark.hit");
        if (inRow[target.k]) inRow[target.k].classList.add("is-current");
      }
    });
  }

  keyAt(rowIndex) {
    const nodeIndex = this.visible[rowIndex];
    return nodeIndex === undefined ? "" : `${this.record.id}:${this.record.nodes[nodeIndex].id}`;
  }

  focusMessage(nodeIndex) {
    const rowIndex = (this.visible || []).indexOf(nodeIndex);
    if (rowIndex >= 0) this.list.scrollToIndex(rowIndex, "center");
  }

  moveMessage(delta) {
    const rows = [...this.track.children].filter((r) => !r.hidden);
    if (!rows.length) return;
    const top = this.viewport.scrollTop;
    const current = this.list.indexAt(top + 8);
    this.list.scrollToIndex(Math.max(0, Math.min(this.list.count - 1, current + delta)));
  }

  loadEarlier() {
    this.window.extra += PAGE;
    this.recompute(this.currentKeys());
  }
}

export function sourceLabel(source) {
  return { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", custom: "Custom" }[source] || source;
}

export { state };
