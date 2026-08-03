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
    title: "對話金庫必須用 http 開啟。",
    body: "file:// 開的頁面不能用 ES module 和 Web Worker。在資料夾裡起一個本機伺服器就好：",
    mono: "python -m http.server 8000",
  }),
  "empty-file": () => ({
    tone: "alert",
    title: "這個檔案是空的。",
    body: "先確認下載有沒有跑完。",
  }),
  "no-decompression": () => ({
    tone: "alert",
    title: "這個瀏覽器沒辦法在頁面裡解壓縮。",
    body: "請自己把匯出檔解開，改丟裡面的 conversations.json。",
  }),
  "zip-no-candidate": (d) => ({
    tone: "alert",
    title: `這個 zip 裡有 ${d.count} 個檔案，但沒有一個看起來像對話匯出檔。`,
    body: "對話金庫找的是 conversations.json、chat_messages 陣列，或 Google Takeout 的活動紀錄檔。",
  }),
  "bad-zip": () => ({
    tone: "alert",
    title: "這個 zip 打不開。",
    body: "中央目錄缺失或損毀。重新下載一次匯出檔再試。",
  }),
  "unknown-format": () => ({
    tone: "alert",
    title: "這個檔案對不上任何已知的匯出格式。",
    body: "你自己指認一次欄位，對話金庫會把這個結構記起來。",
  }),
  "no-conversations": (d) => ({
    tone: "alert",
    title: `這個檔案裡沒有讀得到的內容，掃過 ${d.seen} 筆紀錄。`,
    body: "每一筆不是空的，就是只有系統指令。",
  }),
  "worker-unavailable": () => ({
    tone: "alert",
    title: "這裡沒辦法在背景解析。",
    body: "對話金庫可以改在主執行緒解析，但檔案大的話分頁會卡住一陣子。",
  }),
  quota: (d) => ({
    tone: "alert",
    title: `這份資料大約需要 ${d.needed}，但這個瀏覽器只給 ${d.allowed}。`,
    body: "已經讀進來的對話沒有受影響。",
  }),
  "export-too-large": () => ({
    tone: "alert",
    title: "要匯出的量太大，塞不進一個檔案。",
    body: "把篩選條件縮小一點再試一次。",
  }),
  "clipboard-blocked": () => ({
    tone: "alert",
    title: "瀏覽器擋下了複製。",
    body: "請把文字選起來，按 Ctrl+C。",
  }),
  "branch-unreachable": () => ({
    tone: "alert",
    title: "匯出檔裡走不到這條分支。",
    body: "改顯示主線。",
  }),
  "semantic-failed": () => ({
    tone: "alert",
    title: "語意搜尋用不了：模型下載失敗。",
    body: "關鍵字搜尋不受影響。",
  }),
  unexpected: (d) => ({
    tone: "alert",
    title: "這個檔案沒辦法讀到最後。",
    body: "金庫裡原有的東西都沒有被動到。技術細節在瀏覽器主控台。",
    mono: d && d.message ? String(d.message).slice(0, 240) : undefined,
  }),
};
