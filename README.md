# HYPERKIT

八個瀏覽器工具。全部在你的裝置上運算——沒有上傳、沒有帳號、沒有額度。

**線上站台：** https://fengfeng1021.github.io/hyperkit/

---

## 這八個工具

| 工具 | 做什麼 | 給誰 |
|---|---|---|
| [發票回顧 / Invoice Wrapped](./invoice-wrapped-tw/) | 把財政部載具的消費明細 CSV 變成一份年度消費回顧與分享圖卡 | 台灣一般消費者 |
| [房貸沙盤 / Mortgage Sandbox](./mortgage-sandbox-tw/) | 提前還款、投資、寬限期三條淨資產曲線放在同一張三十年時間軸上對撞 | 有房貸的人 |
| [去背熔爐 / Cutout Forge](./cutout-forge/) | 整批商品圖在瀏覽器內去背，不限張數 | 電商賣家 |
| [情境織機 / Mockup Loom](./mockup-loom/) | 設計稿套上商品情境，圖案沿布料皺褶彎折 | POD 與設計賣家 |
| [漸層工坊 / GradientKit](./gradientkit/) | OKLCH 感知均勻插值、mesh 漸層、顆粒噪點消色帶 | 前端與設計師 |
| [對話金庫 / ChatVault](./chatvault/) | ChatGPT / Claude / Gemini 匯出檔秒開與全文搜尋 | AI 重度使用者 |
| [產碼審查台 / Diff Warden](./diff-warden/) | 選一個本機資料夾，用你自己的 API key 審查 agent 剛寫的那批程式碼 | 用 agent 寫程式的人 |
| [益智書排版廠 / Puzzle Press](./puzzle-press/) | 一份單字清單進去，可以上架 KDP 的內頁 PDF 出來 | 低內容出版者 |

每個工具都內建「載入範例資料」，不需要準備任何檔案就能看到完整成果。

## 前六個與後兩個的差別

前六個是從「有人在抱怨」出發選的題目。做工很細，但事後檢討下來，
沒有一個會有人付錢——它們全是一次性、無留存的工具，算完就走。
[誠實的檢討寫在這裡](./docs/VISUAL-WORLDS.md#第二批從付費證據反推的題目)。

後兩個把篩選條件倒過來：先找**已經有人掏錢**的事，再看純前端能不能做掉。
[`docs/PORTFOLIO-V2.json`](./docs/PORTFOLIO-V2.json) 記錄了完整的證據鏈與被刷掉的候選，
包含每一個題目「最可能怎麼死」的評估。

## 共同的三個原則

**一、運算在你這邊。** 六個工具沒有任何後端。CSV 解析、財務模擬、影像去背、WebGL 合成、
全文索引、向量嵌入全部在你的瀏覽器分頁裡跑完。這不是隱私行銷詞，是架構事實——
打開開發者工具的 Network 面板，處理過程中不會有任何請求離開這台電腦。

**二、零建置。** 原生 HTML、原生 CSS、原生 ES modules。沒有 npm install、沒有 bundler、
沒有框架編譯。把任何一個資料夾複製到任何一台靜態伺服器上就能跑；直接用瀏覽器打開
`index.html` 也能跑。GitHub Pages 服務的就是這個 repo 的原始檔案本身。

**三、六個世界，不是六個模板。** 每個工具有自己的色彩、字型、材質與動效語言，
從它的使用場景推導出來，而不是從同一份設計系統長出來。
設計契約寫在 [`docs/VISUAL-WORLDS.md`](./docs/VISUAL-WORLDS.md)，
每個站的方向契約則寫在自己 `index.html` 的第一個 HTML 註解裡。

## 技術

- **動效**：[GSAP 3.13](https://gsap.com/)（ScrollTrigger / Flip / Draggable / SplitText / DrawSVG），全部走 CDN
- **影像**：WebGPU + [transformers.js](https://github.com/huggingface/transformers.js)（RMBG）／WebGL2 fragment shader／Canvas 2D／OffscreenCanvas
- **資料**：IndexedDB、Web Worker、串流 JSON 解析、自己實作的倒排索引與 BM25
- **色彩**：自己實作的 sRGB ↔ OKLab ↔ OKLCH 轉換與 CSS Color 4 色域映射
- **無障礙**：完整鍵盤路徑、`prefers-reduced-motion`、`forced-colors`、對比比值逐一標註在各站的 `tokens.css`

## 本機執行

ES modules 需要 HTTP，不能用 `file://` 開啟含 module 的頁面。repo 內附了一支零依賴的靜態伺服器：

```bash
node tools/serve.mjs
```

然後開 http://localhost:4173/ （用 `PORT=xxxx` 換 port）。

它比 `npx http-server` 多做兩件這個專案需要的事：正確的 `.wasm` / `.woff2` MIME，
以及 `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` 標頭——
去背熔爐的 WebGPU 推論路徑需要它們才拿得到 `SharedArrayBuffer`。

## tools/

兩支開發期腳本，不是站台的一部分（GitHub Pages 會服務它們，但沒有任何頁面引用）。

**`tools/serve.mjs`** — 上面那支靜態伺服器。

**`tools/shot.mjs`** — CDP 驅動的截圖與主控台檢查工具。這個專案的每一次版面驗證都是用它做的：

```bash
node tools/shot.mjs "http://localhost:4173/cutout-forge/" out.png --wait 3000 --click "text:載入 6 張範例" --after 8000 --w 375 --h 812
```

它啟動一個真的 Chrome、跑完 JS、可以點擊與執行 JS、然後截圖，並回報頁面的
console error / warning、未捕捉的例外、以及資源載入失敗——那些是 headless 的
`--screenshot` 拿不到的。`--rm` 會以 `prefers-reduced-motion: reduce` 開啟頁面。
沒有 Chrome 時用 `CHROME=<執行檔路徑>` 指定，Edge 也可以。

產出建議都丟進 `.local/`，那個目錄已經在 `.gitignore` 裡。

## 文件

- [`docs/BUILD-STANDARD.md`](./docs/BUILD-STANDARD.md) — 所有子專案的硬性建置契約
- [`docs/VISUAL-WORLDS.md`](./docs/VISUAL-WORLDS.md) — 六個視覺世界的指派與交叉檢查表
- [`docs/HUB-DIRECTION.md`](./docs/HUB-DIRECTION.md) — 首頁的方向契約
- 各站的 `PRODUCT.md`、`docs/INTERACTION.md`、`docs/DESIGN-DIRECTION.md`

## 授權

MIT
