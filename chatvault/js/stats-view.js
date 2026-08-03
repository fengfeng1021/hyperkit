/* Statistics view. Replaces the reading pane; the index stays where it is,
   because a modal would throw away the place the user was standing in.

   Everything drawn here is computed from the vault in stats.js. The month
   series and the hour distribution are canvas bars with a hairline baseline and
   no background track, because a filled track is a dashboard habit, not
   information. */

import { el, clear, num, day, month } from "./dom.js";
import { computeStats, formatSpan } from "./stats.js";
import { state } from "./state.js";

const CSS = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class StatsView {
  constructor(root, { onTermClick, onOpenConversation }) {
    this.root = root;
    this.onTermClick = onTermClick;
    this.onOpenConversation = onOpenConversation;
    this.data = null;
    this.resizeObserver = new ResizeObserver(() => this.paintCanvases());
    this.resizeObserver.observe(root);
  }

  render(progressNote) {
    clear(this.root);
    if (!state.index || !state.records.length) return;
    this.data = computeStats(state.index, state.records);
    const d = this.data;

    if (progressNote) {
      this.root.append(el("p", { class: "stats__progress", text: progressNote }));
    }

    const headline = el("div", { class: "stats__headline" });
    headline.append(
      statLine(num(d.conversations), "段對話"),
      statLine(num(d.messages), "則訊息"),
      statLine(formatSpan(d.earliest, d.latest), `從 ${month(d.earliest)} 到 ${month(d.latest)}`)
    );
    this.root.append(headline);

    if (d.perSource.length > 1) {
      const row = el("p", { class: "stats__sources" });
      row.append(
        document.createTextNode(
          d.perSource.map(([s, n]) => `${labelOf(s)} ${num(n)} 段`).join("、")
        )
      );
      this.root.append(row);
    }

    this.root.append(el("h3", { class: "stats__head", text: "每個月的訊息量" }));
    this.monthCanvas = el("canvas", { class: "stats__canvas stats__canvas--months", role: "img" });
    this.root.append(this.monthCanvas);
    this.root.append(
      el("p", {
        class: "stats__caption",
        text: d.monthSeries.length
          ? `最密集的一個月：${busiestLabel(d.monthSeries)}。`
          : "這份資料裡沒有帶日期的訊息。",
      })
    );

    this.root.append(el("h3", { class: "stats__head", text: "你都幾點在打字" }));
    this.hourCanvas = el("canvas", { class: "stats__canvas stats__canvas--hours", role: "img" });
    this.root.append(this.hourCanvas);
    this.root.append(el("p", { class: "stats__caption", text: hourCaption(d.hours) }));

    this.root.append(el("h3", { class: "stats__head", text: "你都在問什麼" }));
    const tags = el("div", { class: "tagstrip" });
    for (const item of d.vocabulary) {
      tags.append(
        el("button", {
          type: "button",
          class: "tag",
          onclick: () => this.onTermClick && this.onTermClick(item.term),
          title: `${item.term} 出現在 ${num(item.conversations)} 段對話裡`,
          text: item.term,
        })
      );
    }
    if (!d.vocabulary.length) {
      tags.append(el("p", { class: "stats__caption", text: "你自己的訊息裡還沒有重複出現的主題詞。" }));
    }
    this.root.append(tags);
    this.root.append(
      el("p", {
        class: "stats__caption",
        text: "只取自你說的話，並且對每段對話都出現的詞降低權重。",
      })
    );

    this.root.append(el("h3", { class: "stats__head", text: "最長的一段對話" }));
    if (d.longest) {
      const line = el("p", { class: "stats__longest" });
      line.append(
        el("button", {
          type: "button",
          class: "linkbtn linkbtn--strong",
          text: d.longest.title,
          onclick: () => this.onOpenConversation && this.onOpenConversation(d.longest.id),
        }),
        el("span", { text: ` ${num(d.longest.msgCount)} 則訊息` })
      );
      this.root.append(line);
    }

    this.paintCanvases();
  }

  paintCanvases() {
    if (!this.data) return;
    if (this.monthCanvas) this.paintMonths();
    if (this.hourCanvas) this.paintHours();
  }

  paintMonths() {
    const canvas = this.monthCanvas;
    const series = this.data.monthSeries;
    const ctx = prepare(canvas, 132);
    if (!ctx) return;
    const { w, h } = ctx;
    if (!series.length) return;
    const ink = CSS("--ink");
    const amber = CSS("--amber");
    const rule = CSS("--rule-strong");
    const ink3 = CSS("--ink-3");
    const max = Math.max(1, ...series.map((s) => s.count));
    const peak = series.reduce((a, b) => (b.count > a.count ? b : a), series[0]);
    const gap = 2;
    const barW = Math.max(2, (w - 8) / series.length - gap);
    const baseline = h - 20;
    ctx.c.font = `500 11px ui-monospace, monospace`;
    ctx.c.textBaseline = "top";
    let lastYear = null;
    series.forEach((s, i) => {
      const x = 4 + i * (barW + gap);
      const bh = Math.round((s.count / max) * (baseline - 10));
      ctx.c.fillStyle = s === peak ? amber : ink;
      ctx.c.fillRect(Math.round(x), baseline - bh, barW, bh);
      if (s.year !== lastYear) {
        ctx.c.fillStyle = ink3;
        ctx.c.fillText(String(s.year), Math.round(x), baseline + 5);
        lastYear = s.year;
      }
    });
    ctx.c.fillStyle = rule;
    ctx.c.fillRect(0, baseline + 0.5, w, 1);
    canvas.setAttribute(
      "aria-label",
      `從 ${series[0].key} 到 ${series[series.length - 1].key} 每個月的訊息量。最密集的是 ${peak.key}，共 ${peak.count} 則。`
    );
  }

  paintHours() {
    const canvas = this.hourCanvas;
    const hours = this.data.hours;
    const ctx = prepare(canvas, 96);
    if (!ctx) return;
    const { w, h } = ctx;
    const ink = CSS("--ink");
    const amber = CSS("--amber");
    const rule = CSS("--rule-strong");
    const ink3 = CSS("--ink-3");
    const max = Math.max(1, ...hours);
    const gap = 3;
    const barW = Math.max(3, (w - 8) / 24 - gap);
    const baseline = h - 18;
    ctx.c.font = `500 11px ui-monospace, monospace`;
    ctx.c.textBaseline = "top";
    hours.forEach((count, i) => {
      const x = 4 + i * (barW + gap);
      const bh = Math.round((count / max) * (baseline - 8));
      ctx.c.fillStyle = count === max ? amber : ink;
      ctx.c.fillRect(Math.round(x), baseline - bh, barW, bh);
      if (i % 6 === 0) {
        ctx.c.fillStyle = ink3;
        ctx.c.fillText(String(i).padStart(2, "0"), Math.round(x), baseline + 4);
      }
    });
    ctx.c.fillStyle = rule;
    ctx.c.fillRect(0, baseline + 0.5, w, 1);
    canvas.setAttribute("aria-label", hourCaption(hours));
  }
}

function prepare(canvas, cssHeight) {
  const rect = canvas.getBoundingClientRect();
  // an unmeasured canvas still gets drawn and still gets its text description,
  // rather than shipping an empty element with no accessible content
  const width = rect.width || 720;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const c = canvas.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, width, cssHeight);
  return { c, w: width, h: cssHeight };
}

function statLine(value, label) {
  return el("p", { class: "stats__stat" }, el("strong", { text: value }), el("span", { text: ` ${label}` }));
}

function busiestLabel(series) {
  const peak = series.reduce((a, b) => (b.count > a.count ? b : a), series[0]);
  return `${peak.key}，共 ${num(peak.count)} 則`;
}

function hourCaption(hours) {
  const max = Math.max(...hours);
  if (!max) return "這份資料裡沒有帶日期的訊息。";
  const at = hours.indexOf(max);
  const total = hours.reduce((a, b) => a + b, 0);
  const night = hours.slice(0, 6).reduce((a, b) => a + b, 0);
  const share = Math.round((night / Math.max(1, total)) * 100);
  return `你最常發訊息的時段是 ${String(at).padStart(2, "0")}:00。有 ${share}% 的訊息落在午夜到早上六點之間。`;
}

function labelOf(source) {
  return { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", custom: "自訂" }[source] || source;
}

export { day };
