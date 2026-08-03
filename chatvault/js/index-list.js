/* The index: virtualised conversation cards.

   Fixed row height, so offsets are arithmetic and there is no measurement pass.
   The DOM node count is bounded by the viewport, not by the vault size.

   The card is the one thing in this interface allowed to be called a card,
   because the product is literally a card catalogue and one card is one
   conversation. */

import { el, clear, num, day, markTerms, snippetAround, icon } from "./dom.js";
import { FixedList } from "./vlist.js";
import { state, effectiveFilters } from "./state.js";
import { parseQuery, runQuery, estimateWithout, closestTerms, queryWithout } from "./search.js";

export class IndexList {
  constructor(root, { onSelect, onQueryChange }) {
    this.root = root;
    this.viewport = root.querySelector(".index__scroll");
    this.spacer = root.querySelector(".index__spacer");
    this.track = root.querySelector(".index__track");
    this.emptyHost = root.querySelector(".index__empty");
    this.skeletonHost = root.querySelector(".index__skeleton");
    this.countEl = root.querySelector(".index__count");
    this.onSelect = onSelect;
    this.onQueryChange = onQueryChange;
    this.rows = [];
    this.terms = [];
    this.active = -1;

    this.list = new FixedList(this.viewport, this.spacer, this.track, (i, row) => this.renderRow(i, row), 92);
    this.applyRowHeight();
    this.media = window.matchMedia("(max-width: 767px)");
    this.media.addEventListener("change", () => this.applyRowHeight());

    this.track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.move(e.key === "ArrowDown" ? 1 : -1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (this.active >= 0) this.select(this.active, true);
      }
    });
  }

  applyRowHeight() {
    this.list.setRowHeight(window.innerWidth < 768 ? 104 : 92);
  }

  showSkeleton(n) {
    clear(this.skeletonHost);
    this.skeletonHost.hidden = false;
    for (let i = 0; i < n; i++) {
      this.skeletonHost.append(
        el(
          "div",
          { class: "skeleton" },
          el("span", { class: "skeleton__bar skeleton__bar--title" }),
          el("span", { class: "skeleton__bar skeleton__bar--meta" }),
          el("span", { class: "skeleton__bar skeleton__bar--date" })
        )
      );
    }
  }

  hideSkeleton() {
    this.skeletonHost.hidden = true;
    clear(this.skeletonHost);
  }

  /** @param {{conv:number,score:number,best:number}[]} rows */
  setRows(rows, terms, topScore) {
    this.rows = rows;
    this.terms = terms || [];
    this.topScore = topScore || 0;
    this.active = rows.length ? 0 : -1;
    this.list.setCount(rows.length);
    this.list.refresh();
    this.viewport.scrollTop = 0;
    this.emptyHost.hidden = rows.length > 0;
    if (!rows.length) this.renderEmpty();
    else clear(this.emptyHost);
  }

  recordFor(row) {
    const id = state.index.convIds[row.conv];
    return state.byId.get(id);
  }

  renderRow(i, row) {
    const entry = this.rows[i];
    if (!entry) return;
    const rec = this.recordFor(entry);
    if (!rec) return;
    const selected = state.selectedId === rec.id;
    row.className = `vrow card${selected ? " is-selected" : ""}${i === this.active ? " is-active" : ""}`;
    row.tabIndex = -1;
    row.id = `card-${i}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", selected ? "true" : "false");
    clear(row);
    row.onclick = () => this.select(i, true);

    row.append(el("span", { class: "card__tab", "aria-hidden": "true" }));

    const title = el("h3", { class: "card__title" });
    title.append(markTerms(rec.title, this.terms));
    row.append(title);

    if (entry.best >= 0 && this.terms.length) {
      const nodeIndex = state.index.docNode[entry.best];
      const text = nodeIndex >= 0 ? rec.nodes[nodeIndex].text : rec.title;
      const snippet = el("p", { class: "card__snippet" });
      snippet.append(markTerms(snippetAround(text, this.terms, 150), this.terms));
      const onPath = nodeIndex < 0 || (rec.pathIds && rec.pathIds.includes(rec.nodes[nodeIndex].id));
      if (!onPath) snippet.append(el("em", { class: "card__alt", text: "（在另一條分支上）" }));
      row.append(snippet);
    }

    const meta = el("p", { class: "card__meta" });
    meta.append(
      el("span", { class: "card__src" }, icon(`src-${rec.source}`, 12), sourceLabel(rec.source)),
      el("span", { class: "card__sep", "aria-hidden": "true", text: "/" }),
      el("span", { text: day(rec.createdAt) }),
      el("span", { class: "card__sep", "aria-hidden": "true", text: "/" }),
      el("span", { text: `${num(rec.msgCount)} 則訊息` })
    );
    row.append(meta);

    if (this.topScore > 0 && entry.score > 0) {
      const bar = el("span", { class: "card__score", "aria-hidden": "true" });
      bar.style.width = `${Math.max(4, Math.round((entry.score / this.topScore) * 48))}px`;
      row.append(bar);
    }
  }

  select(i, open) {
    if (i < 0 || i >= this.rows.length) return;
    this.active = i;
    const rec = this.recordFor(this.rows[i]);
    if (!rec) return;
    state.selectedId = rec.id;
    this.list.refresh();
    this.track.setAttribute("aria-activedescendant", `card-${i}`);
    if (this.onSelect) this.onSelect(rec, this.rows[i], open);
  }

  move(delta) {
    const next = Math.max(0, Math.min(this.rows.length - 1, this.active + delta));
    if (next === this.active) return;
    this.list.scrollToIndex(next);
    this.select(next, true);
  }

  setCount(text) {
    this.countEl.textContent = text;
  }

  /* -------------------------------------------------------- empty result */

  renderEmpty() {
    const host = this.emptyHost;
    clear(host);
    host.hidden = false;

    const parsed = state.parsed || parseQuery(state.query);
    const phrase = state.query.trim();
    const drawerConditions = drawerConditionList();
    const conditions = [...(parsed.conditions || []), ...drawerConditions];

    if (!phrase && !conditions.length) {
      host.append(el("p", { class: "empty__lead", text: "金庫是空的。" }));
      return;
    }

    host.append(
      el("p", {
        class: "empty__lead",
        text: phrase
          ? `在這些篩選條件下，沒有東西符合 ${quoted(phrase)}。`
          : "沒有東西符合這些篩選條件。",
      })
    );

    if (conditions.length) {
      const list = el("ul", { class: "empty__conditions" });
      for (const condition of conditions) {
        const estimate = this.estimate(condition);
        list.append(
          el(
            "li",
            {},
            el("button", {
              type: "button",
              class: "chip chip--drop",
              onclick: () => this.dropCondition(condition),
              text: condition.label,
            }),
            el("span", {
              class: "empty__estimate",
              text: `拿掉這個條件會有 ${num(estimate)} 筆`,
            })
          )
        );
      }
      host.append(list);
    }

    const bare = parseQuery(stripAllConditions(state.query));
    const withoutAnything = runQuery(state.index, bare, { includeAlternate: state.includeAlternate });
    if (withoutAnything.total.conversations === 0 && parsed.terms.length) {
      const near = [];
      for (const term of parsed.terms) near.push(...closestTerms(state.index, term, 3));
      host.append(
        el("p", {
          class: "empty__lead empty__lead--second",
          text: `${quoted(phrase)} 在整個金庫裡都沒有出現過。`,
        })
      );
      if (near.length) {
        host.append(
          el("p", { class: "empty__near", text: `金庫裡最接近的詞是：${[...new Set(near)].join("、")}。` })
        );
      }
    }
  }

  estimate(condition) {
    try {
      if (condition.source === "drawer") {
        const filters = { ...effectiveFilters() };
        delete filters[condition.filterKey];
        if (condition.filterKey === "date") {
          delete filters.after;
          delete filters.before;
        }
        return runQuery(state.index, state.parsed || parseQuery(state.query), {
          filters,
          includeAlternate: state.includeAlternate,
        }).total.conversations;
      }
      return estimateWithout(state.index, state.query, condition, {
        filters: effectiveFilters(),
        includeAlternate: state.includeAlternate,
      });
    } catch (err) {
      console.debug("chatvault: estimate failed", err);
      return 0;
    }
  }

  dropCondition(condition) {
    if (condition.source === "drawer") {
      if (condition.filterKey === "source") state.filters.source.clear();
      else if (condition.filterKey === "role") state.filters.role = undefined;
      else if (condition.filterKey === "hasCode") state.filters.hasCode = false;
      else if (condition.filterKey === "date") {
        state.filters.from = null;
        state.filters.to = null;
      }
      if (this.onQueryChange) this.onQueryChange(state.query, true);
      return;
    }
    if (this.onQueryChange) this.onQueryChange(queryWithout(state.query, condition), false);
  }
}

function stripAllConditions(query) {
  return query
    .split(/\s+/)
    .filter((t) => !/^[-+]/.test(t) && !/^(role|source|after|before|has):/i.test(t))
    .join(" ")
    .replace(/"/g, "");
}

function quoted(s) {
  return `"${s}"`;
}

export function drawerConditionList() {
  const f = state.filters;
  const out = [];
  if (f.source.size) {
    out.push({ source: "drawer", filterKey: "source", label: `來源：${[...f.source].map(sourceLabel).join("、")}` });
  }
  if (f.role) out.push({ source: "drawer", filterKey: "role", label: `說話的人：${f.role === "human" ? "你問的" : "AI 答的"}` });
  if (f.from || f.to) {
    const from = f.from ? monthLabel(f.from) : "最早";
    const to = f.to ? monthLabel(f.to) : "現在";
    out.push({ source: "drawer", filterKey: "date", label: `日期：${from} 到 ${to}` });
  }
  if (f.hasCode) out.push({ source: "drawer", filterKey: "hasCode", label: "只看有程式碼的對話" });
  return out;
}

function monthLabel(ms) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "?" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function sourceLabel(source) {
  return { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", custom: "自訂" }[source] || source;
}
