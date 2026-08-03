# HYPERKIT — 建置標準（所有子專案必讀）

這份文件是每個子專案的硬性契約。違反任何一條 = 未完成。

---

## 1. 部署現實（決定一切技術選擇）

站點發佈於 **GitHub Pages project site**：`https://fengfeng1021.github.io/hyperkit/`

每個子專案服務於子路徑：`https://fengfeng1021.github.io/hyperkit/<slug>/`

因此：

- **禁止任何絕對路徑資源引用**。`/assets/x.png`、`/style.css`、`href="/"` 全部會 404。
  一律使用相對路徑：`./style.css`、`../index.html`、`assets/x.png`。
- **禁止 build step**。沒有 npm install、沒有 bundler、沒有框架編譯。
  Pages 直接服務 repo 內容，任何需要編譯的東西都不會存在於線上。
- 每個子專案是**自足的靜態資料夾**：`index.html` + 本地 CSS/JS/assets。
  直接用瀏覽器開啟 `index.html` 就要能完整運作。

## 2. 技術棧（固定）

| 項目 | 選擇 | 理由 |
|---|---|---|
| 標記 | 原生 HTML5 | 無 build |
| 樣式 | 原生 CSS + CSS 自訂屬性 token 系統 | 無 build、完全掌控 |
| 腳本 | 原生 ES Modules（`<script type="module">`） | 現代瀏覽器原生支援 |
| 動效 | **GSAP 3（CDN，含 ScrollTrigger 等所需 plugin）** | 使用者指定 |
| 狀態 | `localStorage` / `IndexedDB` | 無後端 |
| 字型 | Google Fonts `<link>` + `preconnect` + `display=swap` | 無 build 下的務實選擇 |
| 圖示 | 自 icon library 取 SVG path，或以世界語言自繪的一致 SVG 系統 | 禁 emoji 當圖示 |

**禁止**：Tailwind CDN（生產環境不適用）、React/Vue（需 build）、jQuery、Bootstrap。

GSAP 引入（放 `</body>` 前）：

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"></script>
```

只引入實際用到的 plugin。用到才引入。

## 3. 設計契約（三個 skill 共同作用）

每個子專案在動工前必須：

1. 撰寫該專案的 `PRODUCT.md`（產品真實：機制、受眾、使用場景、這個介面必須證明什麼）
2. 執行 `node C:/Users/Administrator/.claude/skills/impeccable/scripts/concept-seed.mjs --scope direction --mode <mode>`
   取得被**指派**的視覺方向。這一步的存在意義是阻止每次都收斂到同一種 AI 預設美學。
   指派結果必須被採用（除非它在產品真實上根本行不通，且需具名說明理由）。
3. 在 `index.html` `<body>` 的第一個子節點寫入方向契約 HTML 註解，六個區塊：
   `THESIS` / `OWN-WORLD` / `STORY` / `FIRST VIEWPORT` / `FORM` / `FINISH`

### 3.1 絕對禁止（impeccable craft-floor + taste 反 slop 合併）

**版面骨架**
- 以「同尺寸卡片＝圖示＋標題＋敘述」當作頁面結構。卡片是懶惰容器，巢狀卡片永遠是錯的。
- hero 大數字＋小標籤＋輔助統計的模板。
- **標題上方的 eyebrow / kicker 小標**（`text-[11px] uppercase tracking-[0.2em]` 那種）。這是硬禁令，不是預設值。標題自己撐得住。
- 章節編號 01 / 02 / 03，除非序號本身承載讀者需要的資訊。
- 不需要中斷或保護焦點的任務卻用 modal。
- 「左大標題＋右小段解釋」的分裂式 section header。
- 連續第 3 個 image+text 左右交錯 section。
- 一頁超過一個 marquee。

**表面習慣**
- **漸層文字**。強調靠字重或尺寸。
- 玻璃/模糊當裝飾（而非特定效果）。
- 卡片/列表/callout 上超過 1px 的彩色 `border-left`。
- 硬偏移陰影 `box-shadow: 4px 4px 0`，除非世界本身真的是 neobrutalist。
- sparkline、進度環、柔陰影圓角矩形當作內容的替身。
- 等寬字當「科技感」戲服（等寬字只用於程式碼、資料、量測）。
- 系統顯示字體（Impact / Arial Black / 平台預設 sans）當作自有世界的顯示字。
- **emoji 或 Unicode 字元當圖示系統**。圖示是畫出來的，統一筆畫與字重。
- 亮/暗由品類決定。要從使用場景決定：誰、在哪、什麼環境光。

**字型禁令**
- 預設 `Inter`：禁。除非明確要求中性/Linear 風格或無障礙優先。
- **襯線字當預設**：極度禁止。「感覺有創意/高級/編輯感」不是理由。
- 明確禁止當預設：`Fraunces`、`Instrument Serif`。
- 訓練資料預設清單（要用需有無可取代的理由）：Playfair Display、Cormorant、Lora、Crimson、Newsreader、Syne、Space Grotesk、Space Mono、IBM Plex、Inter-as-display、DM Sans、DM Serif、Outfit、Plus Jakarta Sans、Instrument Sans。
- 標題內強調某個字：用**同一字體**的 italic 或 bold。禁止在 sans 標題裡插一個襯線字。
- italic 顯示字含 `y g j p q` 降部時，`leading` 最小 1.1 並保留 `padding-bottom`。

**色彩禁令**
- AI 紫 / 藍色光暈美學：禁為預設。
- 高級消費品調色盤（米白＋黃銅＋濃縮咖啡色）：禁為預設。
  具體禁止：背景 `#f5f1ea` `#f7f5f1` `#fbf8f1` `#efeae0` `#ece6db` `#faf7f1` `#e8dfcb`；
  accent `#b08947` `#b6553a` `#9a2436` `#9c6e2a` `#bc7c3a` `#7d5621`；
  文字 `#1a1714` `#1a1814` `#1b1814`。
- 一個專案一組調色盤。選定 accent 後全頁鎖定，不得第 7 個 section 突然冒出另一個顏色。
- 六個子專案**不得使用同一個色彩家族**。互相檢查。

**其他**
- 假精確數字（`92%`、`4.1×`、`5.8mm`）除非有真實來源或明確標示為範例。
- div 拼出來的假截圖、假儀表板、假終端機。
- 手繪裝飾性 SVG 插圖當主視覺。

### 3.2 必須達成（可驗證的成品檢查，非意圖）

- **對比**：內文與 placeholder ≥ 4.5:1，大字 ≥ 3:1。彩色表面上的次要文字從該色相調出來，**不准用灰色**。
- **深度**：陰影要有偏移與柔和模糊。零偏移的彩色光暈是裝飾不是深度。
- **間距**：群組內緊、群組間鬆；標題**上方**空間大於下方。一套間距節奏貫穿全頁。
- **字排**：內文行寬 65–75ch；顯示字最大 6rem；字距下限 -0.04em；標題斷行平衡；級距與字重階梯明顯。用真實內容在每個斷點測試溢出。
- **狀態**：hover / disabled / loading / error / empty 全部要有。加上真實內容、可運作的控制項、響應式構成、鍵盤 focus。
- **文案**：控制項用動作命名；錯誤訊息說明問題與復原方式。
- **響應式**：`min-h-[100dvh]` 而非 `100vh`。每個多欄版面都要明確宣告 < 768px 的行為。
- **導覽**：桌機單行，高度上限 80px。
- **CTA**：桌機不得換行；同一意圖只用一種標籤。
- **hero**：必須容納於首屏。標題最多 2 行，副文最多 20 字、4 行。hero 文字元素最多 4 個。

## 4. 動效契約（GSAP）

- **動效必須被動機驅動**。加任何動畫前先回答：它傳達什麼？合法答案：階層（把注意力導向正確的東西）、敘事（依序揭露內容）、回饋（確認使用者動作）、狀態轉換。不合法答案：「看起來很酷」。一句話講不出理由就砍掉。
- **一個被創作的時刻，而非四散的效果**。不是每個 section 都用同一套進場動畫。
- 每個專案必須有一個**招牌動效時刻**（signature moment）：使用者做了某個具體動作，畫面上發生一個具體視覺事件。這是該產品最值得投入資源的那一個互動瞬間。
- 緩動：從**已經可見**的預設狀態出發，用指數型 ease-out。禁止線性緩動當預設。
- 動效素材不只有 transform 與 opacity：`filter: blur`、`backdrop-filter`、`clip-path`、`mask`、`box-shadow` 在能維持流暢時都屬於調色盤。
- **`prefers-reduced-motion` 必須實作**，用 `gsap.matchMedia()`：
  ```js
  const mm = gsap.matchMedia();
  mm.add({ reduce: "(prefers-reduced-motion: reduce)", ok: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
    if (ctx.conditions.reduce) return;  // 內容保持預設可見狀態
    /* 動效在這裡 */
  });
  ```
- 內容預設可見。動效失敗時使用者仍看得到東西。禁止 `opacity: 0` 寫死在 CSS 裡等 JS 來救。
- ScrollTrigger pin：`start: "top top"`，不是 `"top center"`。
- 用 transform 別名（`x` `y` `scale` `rotation`），不要動 `width`/`height`/`top`/`left`。
- 淡入淡出用 `autoAlpha` 而非 `opacity`（避免看不見的元素擋住點擊）。

## 5. 互動邏輯先行

寫任何樣式之前，先在該專案的 `docs/INTERACTION.md` 寫下：

1. **核心迴圈**：進站看到什麼 → 第一個動作是什麼 → 得到什麼 → 為什麼會再回來或分享
2. **每個可互動物件的完整狀態機**：idle / hover / focus / active / loading / success / error / empty / disabled
3. **鍵盤路徑**：Tab 順序、快捷鍵、Esc 行為
4. **首次到訪體驗**：沒有任何資料時看到什麼（empty state 必須是被精心構成的，不是「暫無資料」）
5. **失敗路徑**：API key 錯誤、檔案格式錯誤、瀏覽器不支援、localStorage 滿了

## 6. 檔案結構（每個子專案）

```
<slug>/
  index.html          # 含方向契約註解
  css/
    tokens.css        # 該專案專屬的設計 token（顏色、字階、間距、圓角、動效時間）
    style.css
  js/
    main.js           # ES module entry
    <feature>.js
  assets/
  PRODUCT.md
  docs/INTERACTION.md
  README.md           # 這個工具是什麼、怎麼用、技術要點
```

## 7. 完成定義

一個子專案完成 = 以下全部為真：

- [ ] `index.html` 直接用瀏覽器開啟可完整運作，主控台零錯誤
- [ ] 所有資源路徑為相對路徑
- [ ] 方向契約註解在 `<body>` 第一個子節點
- [ ] 招牌動效時刻已實作且流暢（60fps）
- [ ] 完整狀態機：hover / focus / active / loading / error / empty 都可觸發且都好看
- [ ] 鍵盤可完整操作，focus ring 可見
- [ ] `prefers-reduced-motion` 下內容完整可用
- [ ] 375px / 768px / 1280px 三個寬度都不破版
- [ ] 對比檢查通過
- [ ] 真實內容，非 lorem ipsum；文案是產品自己的語言
- [ ] 從 hub 首頁可進入，且專案內有返回 hub 的路徑
