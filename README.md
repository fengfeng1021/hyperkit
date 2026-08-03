# HYPERKIT

六個瀏覽器工具。全部在你的裝置上運算——沒有上傳、沒有帳號、沒有額度。

**線上站台：** https://fengfeng1021.github.io/hyperkit/

---

## 這六個工具

| 工具 | 做什麼 | 給誰 |
|---|---|---|
| [發票回顧 / Invoice Wrapped](./invoice-wrapped-tw/) | 把財政部載具的消費明細 CSV 變成一份年度消費回顧與分享圖卡 | 台灣一般消費者 |
| [房貸沙盤 / Mortgage Sandbox](./mortgage-sandbox-tw/) | 提前還款、投資、寬限期三條淨資產曲線放在同一張三十年時間軸上對撞 | 有房貸的人 |
| [去背熔爐 / Cutout Forge](./cutout-forge/) | 整批商品圖在瀏覽器內去背，不限張數 | 電商賣家 |
| [情境織機 / Mockup Loom](./mockup-loom/) | 設計稿套上商品情境，圖案沿布料皺褶彎折 | POD 與設計賣家 |
| [漸層工坊 / GradientKit](./gradientkit/) | OKLCH 感知均勻插值、mesh 漸層、顆粒噪點消色帶 | 前端與設計師 |
| [對話金庫 / ChatVault](./chatvault/) | ChatGPT / Claude / Gemini 匯出檔秒開與全文搜尋 | AI 重度使用者 |

每個工具都內建「載入範例資料」，不需要準備任何檔案就能看到完整成果。

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

任何靜態伺服器都可以（ES modules 需要 HTTP，不能用 `file://` 開啟含 module 的頁面）：

```bash
npx http-server . -p 8791 -c-1
```

然後開 http://localhost:8791/

## 文件

- [`docs/BUILD-STANDARD.md`](./docs/BUILD-STANDARD.md) — 所有子專案的硬性建置契約
- [`docs/VISUAL-WORLDS.md`](./docs/VISUAL-WORLDS.md) — 六個視覺世界的指派與交叉檢查表
- [`docs/HUB-DIRECTION.md`](./docs/HUB-DIRECTION.md) — 首頁的方向契約
- 各站的 `PRODUCT.md`、`docs/INTERACTION.md`、`docs/DESIGN-DIRECTION.md`

## 授權

MIT
