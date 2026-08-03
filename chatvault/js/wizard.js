/* Field mapping wizard.

   Opens in place, inside the drop zone, not as a modal: the user needs to see
   the file's own structure and the resulting preview at the same time, and a
   dialog would hide one to show the other.

   The select options are real key paths read out of the first record of the
   actual file. Nothing here is a guess about what the format might contain. */

import { el, clear } from "./dom.js";
import { MAPPING_FIELDS, previewMapping, rememberMapping } from "./adapters/generic.js";

export class MappingWizard {
  constructor(host, { onApply, onCancel }) {
    this.host = host;
    this.onApply = onApply;
    this.onCancel = onCancel;
    this.mapping = { title: "", createdAt: "", messages: "", role: "", text: "" };
    this.record = null;
  }

  /** @param {{paths:{path:string,type:string,sample:string}[], sample:string}} detail */
  open(detail) {
    this.paths = detail.paths || [];
    try {
      this.record = detail.sample ? JSON.parse(detail.sample) : null;
    } catch {
      this.record = null;
    }
    this.mapping = guessMapping(this.paths);
    this.render();
    this.host.hidden = false;
    const first = this.host.querySelector("select");
    if (first) first.focus();
  }

  close() {
    this.host.hidden = true;
    clear(this.host);
  }

  render() {
    clear(this.host);
    const wrap = el("div", { class: "wizard" });
    wrap.append(
      el("h3", { class: "wizard__title", text: "自己指認欄位" }),
      el("p", {
        class: "wizard__lead",
        text: "下面每個選項都是這個檔案第一筆紀錄裡真的存在的 key。指認一次，對話金庫就會記住這個結構。",
      })
    );

    const arrayPaths = this.paths.filter((p) => p.type === "array");
    if (!arrayPaths.length) {
      wrap.append(
        el("p", {
          class: "wizard__error",
          text: "這個檔案裡找不到訊息清單。對話金庫需要每一筆紀錄裡有一個訊息陣列。",
        })
      );
      const details = el("details", { class: "disclosure" });
      details.append(el("summary", { text: "看原始結構" }));
      const list = el("ul", { class: "wizard__paths" });
      for (const p of this.paths.slice(0, 120)) {
        list.append(el("li", {}, el("code", { text: p.path }), el("span", { text: ` ${p.type}` })));
      }
      details.append(list);
      wrap.append(details);
      wrap.append(this.actions(true));
      this.host.append(wrap);
      return;
    }

    const grid = el("div", { class: "wizard__grid" });
    const left = el("div", { class: "wizard__fields" });
    for (const field of MAPPING_FIELDS) {
      const id = `map-${field.key}`;
      const select = el("select", {
        id,
        class: "field",
        onchange: (e) => {
          this.mapping[field.key] = e.target.value;
          this.render();
          const again = this.host.querySelector(`#${id}`);
          if (again) again.focus();
        },
      });
      select.append(el("option", { value: "", text: "未指定" }));
      const options =
        field.wants === "array"
          ? arrayPaths
          : this.paths.filter((p) => p.type !== "array" && p.type !== "object");
      for (const p of options) {
        const option = el("option", { value: p.path, text: `${p.path}   ${p.sample}` });
        if (this.mapping[field.key] === p.path) option.selected = true;
        select.append(option);
      }
      left.append(el("div", { class: "wizard__field" }, el("label", { for: id, text: field.label }), select));
    }
    grid.append(left);

    const right = el("div", { class: "wizard__preview" });
    const ready = MAPPING_FIELDS.every((f) => this.mapping[f.key]);
    let rows = [];
    if (ready && this.record) rows = previewMapping(this.record, this.mapping, 3);
    if (!ready) {
      right.append(el("p", { class: "wizard__hint", text: "在左邊選好欄位，這裡會出現預覽。" }));
    } else if (!rows.length) {
      right.append(
        el("p", {
          class: "wizard__error",
          text: "前三筆紀錄裡這個欄位都是空的，換一個欄位試試。",
        })
      );
    } else {
      for (const row of rows) {
        right.append(
          el(
            "div",
            { class: `wizard__msg wizard__msg--${row.role}` },
            el("span", { class: "wizard__role", text: row.role === "human" ? "你" : "AI" }),
            el("p", { text: row.text })
          )
        );
      }
    }
    grid.append(right);
    wrap.append(grid);
    wrap.append(this.actions(false, ready && rows.length > 0));
    this.host.append(wrap);
  }

  actions(onlyCancel, enabled) {
    const row = el("div", { class: "wizard__actions" });
    if (!onlyCancel) {
      const missing = MAPPING_FIELDS.filter((f) => !this.mapping[f.key]).map((f) => f.label.toLowerCase());
      const apply = el("button", {
        type: "button",
        class: "btn btn--solid",
        text: "就用這組對應",
        disabled: !enabled,
        onclick: () => {
          if (this.record) rememberMapping(this.record, this.mapping);
          this.onApply(this.mapping);
        },
      });
      row.append(apply);
      if (missing.length) row.append(el("p", { class: "wizard__missing", text: `還缺：${missing.join("、")}` }));
    }
    row.append(
      el("button", { type: "button", class: "btn btn--line", text: "取消", onclick: () => this.onCancel() })
    );
    return row;
  }
}

function guessMapping(paths) {
  const find = (re, type) => {
    const hit = paths.find((p) => re.test(p.path) && (!type || p.type === type));
    return hit ? hit.path : "";
  };
  const messages = find(/messages|turns|items|entries|chat/i, "array");
  return {
    title: find(/title|name|subject/i),
    createdAt: find(/created|date|time|timestamp/i),
    messages,
    role: messages ? find(new RegExp(`^${escapeRe(messages)}\\.(role|sender|author|from)`, "i")) : "",
    text: messages ? find(new RegExp(`^${escapeRe(messages)}\\.(text|content|body|message)`, "i")) : "",
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
