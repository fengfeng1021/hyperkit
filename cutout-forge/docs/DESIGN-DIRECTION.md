# Cutout Forge - 設計方向

被指派的視覺世界（pinned brief，不可更改）：**工業製程監控台**。暗底、深炭黑 `#0E0E10` 家族、電光青 `#22E5C8` 為主 accent、熔爐橙 `#FF7A18` 僅用於錯誤與警告、中性灰階做 UI 層級、Geist / Geist Mono、棋盤格透明底、掃描光帶、1px 網格、佇列狀態燈、圓角 4px。

---

## 1. 方向契約（六區塊全文）

以下六段將逐字寫進 `index.html` `<body>` 的第一個子節點（HTML 註解）。

### THESIS

This interface argues one thing: the cost of the two-hundred-and-first photo is zero, and you can watch that be true. Every surface decision serves that proof. The wall of thumbnails exists so the batch is countable at a glance; the scan bands exist so progress is measured, not implied; the ledger exists so the money you did not spend is a number you can screenshot. Nothing on this page decorates. If an element cannot be traced back to "this proves the batch is real," it is removed.

### OWN-WORLD

An industrial process monitor. Not cyberpunk, not a dark-mode dashboard template, not a neon terminal. The reference is the screen bolted to the side of a machine that is currently running: a measurement grid underneath everything, hairline rules instead of card edges, status lamps that differ by shape as well as colour, monospace only where a real quantity is being read (file names, pixel dimensions, elapsed seconds, dollars). Electric cyan is the instrument colour: it is the beam, the fill line, the lamp. It is never a mood. Forge orange is the fault colour and appears nowhere else, so that when it appears the eye goes straight to it. The transparency checkerboard is the one true texture on the page, and it belongs to the product photo, not to the chrome.

### STORY

The page opens as a bare measurement bed: a grid, four corner marks, one sentence, two buttons, and an honest line of hardware status. It is empty on purpose, because emptiness is what a machine looks like before you load it. The moment files land, the bed fills from the centre outward with a wave of thumbnails, and the page changes character from a claim to a workload. For the next few minutes the surface is a monitor: beams sweep, lamps change shape, one number climbs in the left rail. When the last photo resolves, the wall reorganises itself into what the operator must do next, the ledger swells once, and the room goes quiet. The final state is a receipt.

### FIRST VIEWPORT

Full height, no scroll. A masthead 56 px tall carrying a back link, the product name, and a live engine chip. Below it, the floor: a 32 px measurement grid on `#0E0E10`, inset by 24 px with a 1 px rule and four 12 px cyan corner marks that also mark the drop boundary. Centred and lifted 6 vh above middle, four text elements and nothing else: the headline `Cut out 200 product photos without uploading one.` at up to 68 px; one line of 13 words underneath; a filled cyan primary button beside a hairline secondary button; and a single line of real hardware status reading `WebGPU ready · model not downloaded yet (44 MB, one time)`. The left rail is present but quiet, showing only the output preset that will be used, so the visitor already knows what they are about to get. There is no eyebrow, no scroll cue, no logo wall, no statistic block.

### FORM

One accent, locked: cyan `#22E5C8`. One fault colour, locked: orange `#FF7A18`. Everything else is a nine-step neutral ramp from `#08090A` to `#F4F6F6`. Depth is built from surface luminance steps and black shadows with real offset and blur; there is no coloured halo anywhere. Radius is a three-value system with a stated rule: 0 for anything that is an image edge, 2 for chips and checkboxes, 4 for every control, panel, and popover. Nothing is a pill. Type is Geist for everything the interface says and Geist Mono for everything the machine measures, and the split is enforced, not aesthetic. Spacing runs on a 4 px base with tight groups and generous separation between them, and every heading carries more space above it than below. Motion is exponential ease-out from an already-visible state, except for the scan beam, which is linear because a scan is a constant-rate measurement and easing it would turn an instrument into an ornament.

### FINISH

unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md

---

## 2. 色彩 token（唯一顏色來源）

對比比值以 WCAG 2.1 相對亮度公式實算，非估計。

### 2.1 表面（九階中性 ramp）

| Token | Hex | 角色 | 對 `--ink-hi` 的對比 |
|---|---|---|---|
| `--forge-void` | `#08090A` | 頁面最底層、masthead 與 status rail 背景 | 18.37:1 |
| `--forge-bed` | `#0E0E10` | FLOOR 主背景（指派家族的基準色） | 17.78:1 |
| `--forge-plate` | `#141518` | 左軌背景、dragover 時的 FLOOR | 16.83:1 |
| `--forge-rail` | `#1B1D21` | 抬起的表面：tile chrome、popover、按鈕次要底 | 15.56:1 |
| `--forge-slot` | `#232629` | 內凹：輸入框、進度條軌道、disclosure 展開區 | 14.02:1 |
| `--forge-line` | `#2C3033` | 1px 分隔線（對 bed 1.45:1，是線不是文字） | - |
| `--forge-line-strong` | `#3A3F44` | 1px 控制項外框、hover 邊 | - |

### 2.2 文字

| Token | Hex | 角色 | 對比 |
|---|---|---|---|
| `--ink-hi` | `#F4F6F6` | 標題、主要數值、按鈕文字 | bed **17.78:1** / rail **15.56:1** |
| `--ink` | `#C6CBCB` | 內文、標籤 | bed **11.76:1** / rail **10.29:1** |
| `--ink-mid` | `#949B9B` | 次要說明、meta、來源註記 | bed **6.81:1** / rail **5.96:1** / slot **5.37:1** |
| `--ink-low` | `#8A9292` | placeholder、輸入框內提示 | slot **4.79:1** / bed **6.07:1** ✅ ≥ 4.5 |
| `--ink-off` | `#767D7D` | **僅** disabled 標籤（WCAG 1.4.3 豁免），必須同時有斜線 hatch | rail 4.02:1 |

彩色表面上的次要文字一律從該色相調出，**不用灰色**：cyan 面上用 `--cyan-ink`，orange 面上用 `--forge-orange-ink`。

### 2.3 Accent：電光青（唯一 accent，全頁鎖定）

| Token | Hex | 角色 | 對比 |
|---|---|---|---|
| `--cyan` | `#22E5C8` | 掃描帶、進度前景、狀態燈、主按鈕底、focus 相關線 | bed **12.04:1** / rail **10.54:1** |
| `--cyan-bright` | `#5BF3DC` | hover、focus ring | bed **14.05:1** / rail **12.29:1** |
| `--cyan-deep` | `#0FA891` | active 壓下、1px 邊框、角標 | bed **6.46:1** / slot **5.09:1** |
| `--cyan-ink` | `#04231F` | **青色填色上的文字** | 對 `--cyan` **10.36:1** / 對 `--cyan-bright` **12.09:1** |
| `--cyan-wash` | `rgb(34 229 200 / 0.10)` | 極輕的區域底色（選取列） | 疊在 bed 上約 `#17322F`，`--cyan` 於其上 8.55:1 |
| `--cyan-veil` | `rgb(34 229 200 / 0.24)` | 掃描帶的兩側衰減 | - |

### 2.4 Fault：熔爐橙（只有錯誤與警告，別處零出現）

| Token | Hex | 角色 | 對比 |
|---|---|---|---|
| `--forge-orange` | `#FF7A18` | 失敗燈號、`Check edges` 邊框、警告文字 | bed **7.39:1** / rail **6.47:1** |
| `--forge-orange-ink` | `#2A1000` | 橙色填色上的文字 | 對 `--forge-orange` **6.86:1** |
| `--forge-orange-wash` | `rgb(255 122 24 / 0.12)` | failed tile 底、warm-up 失敗橫條 | 疊在 bed 約 `#33200F`，`--forge-orange` 於其上 5.94:1 |

**成功狀態用 `--cyan`，不引入綠色。** 全站色相總數 = 2。

### 2.5 棋盤格（透明底）

| Token | Hex | 說明 |
|---|---|---|
| `--checker-a` | `#262A2C` | 12px 方格 |
| `--checker-b` | `#33373A` | 12px 方格（對 a 為 1.21:1，刻意極低，讓商品跳出來） |

`< 768px` 時方格改 8px。

### 2.6 跨專案色彩隔離檢查

| 專案 | 主色家族 | Accent |
|---|---|---|
| invoice-wrapped-tw | 深靛近黑 `#0B0D17` | 朱橘紅 `#FF4D2E` |
| **cutout-forge** | **深炭黑 `#0E0E10`（中性，無藍偏）** | **電光青 `#22E5C8`** |

與 #1 的區隔成立：#1 是暖橘紅為主且底色帶靛藍；本站是**中性**炭黑 + **冷青**。`--forge-orange #FF7A18` 與 #1 的 `#FF4D2E` 明顯不同（橙 vs 朱紅），且本站的橙只在錯誤狀態出現，佔畫面比例極低，不會構成色彩家族衝突。

---

## 3. 字型與字階

### 3.1 字型

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

已驗證兩個家族都在 Google Fonts 上（`fonts.gstatic.com/s/geist/v5/...`）。

- `--font-ui: 'Geist', system-ui, sans-serif` - 介面說的每一句話
- `--font-mono: 'Geist Mono', ui-monospace, monospace` - **只用於機器量到的東西**：檔名、像素尺寸、耗時秒數、佇列編號、金額、百分比、色碼。不用於標題、按鈕、標籤。這條界線是硬的。

### 3.2 字階

| Token | 值 | 字重 / 字距 | 用途 |
|---|---|---|---|
| `--fs-display` | `clamp(2.25rem, 1.35rem + 3.6vw, 4.25rem)` | 600 / `-0.035em` / `line-height: 1.02` | FORGE BED 標題（最大 68px，遠低於 6rem 上限） |
| `--fs-ledger` | `clamp(1.75rem, 1.2rem + 2vw, 2.5rem)` | mono 500 / `-0.02em` | 省錢金額 |
| `--fs-lead` | `1.0625rem` (17px) | 400 / `-0.01em` / `1.5` | BED 副標，`max-width: 46ch`（單行主張，非長文） |
| `--fs-h2` | `1.375rem` (22px) | 600 / `-0.02em` | INSPECTOR 檔名、warm-up 標題 |
| `--fs-h3` | `1rem` (16px) | 600 / `-0.01em` | 左軌區塊標題 |
| `--fs-body` | `0.9375rem` (15px) | 400 / `-0.005em` / `1.6` | 內文，`max-width: var(--measure)` |
| `--fs-ui` | `0.8125rem` (13px) | 500 / `0` / `1.4` | 按鈕、標籤、控制項 |
| `--fs-meta` | `0.71875rem` (11.5px) | 400 / `0.01em` / `1.45` | 來源註記、tile 檔名、狀態列 |
| `--measure` | `68ch` | - | 長文行寬（落在 65 到 75ch） |

級距比約 1.22 到 1.4，字重只用 400 / 500 / 600 / 700 四級，階梯明顯。

**斜體**：全站不使用斜體顯示字，因此不涉及降部裁切問題。強調一律用字重或尺寸。

---

## 4. 間距、圓角、陰影、動效

### 4.1 間距（4px 基底）

| Token | 值 | 典型用途 |
|---|---|---|
| `--sp-1` | 2px | 燈號與文字之間 |
| `--sp-2` | 4px | 圖示與標籤 |
| `--sp-3` | 8px | tile gap、控制項內縱向 |
| `--sp-4` | 12px | 按鈕內距（縱） |
| `--sp-5` | 16px | 控制項之間、按鈕內距（橫） |
| `--sp-6` | 24px | 左軌區塊內距、FLOOR 內縮 |
| `--sp-7` | 32px | 左軌區塊之間 |
| `--sp-8` | 48px | BED 標題與副標之外的呼吸 |
| `--sp-9` | 64px | 標題**上方**的空間（永遠大於下方） |
| `--sp-10` | 96px | 桌機 BED 上緣留白上限（不超過 pt-24 等效） |

節奏規則：群組內用 `--sp-2` / `--sp-3`；群組之間用 `--sp-6` / `--sp-7`；標題上方比下方大一階（例如上 `--sp-7`、下 `--sp-5`）。

### 4.2 圓角（三值系統，規則明寫）

| Token | 值 | 適用 |
|---|---|---|
| `--r-0` | 0 | **影像邊緣**：tile、canvas、棋盤格、INSPECTOR 大圖、縮圖矩陣 |
| `--r-1` | 2px | chip、checkbox、狀態燈方點、小標記 |
| `--r-2` | 4px | 按鈕、輸入框、面板、popover、進度條、分割線握把 |

**沒有 pill、沒有 `border-radius: 999px`、沒有圓形頭像。** 影像是直角裁切的，控制項是 4px 的，兩者永不互換。

### 4.3 陰影（有偏移、有柔和模糊，零彩色光暈）

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgb(0 0 0 / 0.45)` | tile chrome 浮出 |
| `--shadow-2` | `0 4px 12px -2px rgb(0 0 0 / 0.55)` | popover、disclosure |
| `--shadow-3` | `0 12px 32px -8px rgb(0 0 0 / 0.65)` | 快捷鍵 `<dialog>` |
| `--ring-inset` | `inset 0 0 0 1px rgb(34 229 200 / var(--ring, 0))` | 顯影瞬間的 1px 內環 |

**明確禁止**：`box-shadow: 0 0 Npx <colour>`（零偏移彩色光暈）、`filter: drop-shadow(0 0 …)`、任何 `text-shadow`。

### 4.4 動效時長與緩動

| Token | 值 | 用途 |
|---|---|---|
| `--dur-tap` | 120ms | hover / active |
| `--dur-ui` | 220ms | 狀態切換、色彩過場 |
| `--dur-reveal` | 420ms | mask 顯影 |
| `--dur-pop` | 80ms | 顯影微彈（40ms 去 + 40ms 回） |
| `--dur-flip` | 700ms | 完成時的 Flip 重排 |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 指數型 ease-out，CSS 預設 |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | 雙向過場 |

GSAP 對應：`power3.out`（進場）、`power2.inOut`（顯影）、`power2.out` / `power2.in`（微彈）、`back.out(1.4)`（Ledger 收尾）、`ease: "none"` **只用於掃描帶**，理由已在 INTERACTION.md §5.2 記載。

`gsap.defaults({ duration: 0.42, ease: "power3.out" })`。

### 4.5 網格與棋盤格材質

```css
--grid-bed: repeating-linear-gradient(0deg, var(--forge-line) 0 1px, transparent 1px 32px),
            repeating-linear-gradient(90deg, var(--forge-line) 0 1px, transparent 1px 32px);
--checker: conic-gradient(
    var(--checker-a)   0deg  90deg,
    var(--checker-b)  90deg 180deg,
    var(--checker-a) 180deg 270deg,
    var(--checker-b) 270deg 360deg) 0 0 / 24px 24px;
```

`--checker-size` 是重複的 **tile**，可見方格是它的一半：24px tile = 12px 方格。
`--grid-bed` 疊在 `--forge-bed` 上，整體 `opacity: 0.4`。`< 768px` 時網格 24px、棋盤 tile 16px（8px 方格）。

---

## 5. 元件清單與視覺規格

按出現順序。每一項的完整狀態機在 `docs/INTERACTION.md`，這裡只列視覺規格。

| # | 元件 | 尺寸與樣式 |
|---|---|---|
| 1 | **Masthead** | h 56px，底 `--forge-void`，下邊 1px `--forge-line`。左：`‹ hyperkit` 13px `--ink-mid`，hover `--ink-hi` + 1px 底線。中：`Cutout Forge` 15px 600 `--ink-hi`。右：engine chip / rate / `?`。桌機單行。 |
| 2 | **Engine chip** | h 26px，內距 10px，`--r-1`，1px 邊，13px。左側 6px 方點（`--r-1`）。狀態色見 §2。 |
| 3 | **Forge bed** | FLOOR 全區。底 `--forge-bed` + `--grid-bed`。內縮 24px 的 1px `--forge-line` 框 + 四角 12px `--cyan-deep` 2px 角標（dragover 時角標 24px、框 2px `--cyan`）。 |
| 4 | **Primary button** | h 44px（BED）/ 36px（左軌），內距 `--sp-5`，`--r-2`，底 `--cyan`，字 `--cyan-ink` 13px 600。hover `--cyan-bright`，active `--cyan-deep` + `translateY(1px)`。桌機不換行。 |
| 5 | **Ghost button** | 同高，透明底，1px `--forge-line-strong`，字 `--ink`。hover 邊 `--cyan-deep`、字 `--ink-hi`。 |
| 6 | **Fault button** | 只用於 `Retry N failed`。透明底，1px `--forge-orange`，字 `--forge-orange`。hover 底 `--forge-orange-wash`。 |
| 7 | **Queue tile** | 正方形，`--r-0`，1px `--forge-line` 外框。三層畫布 + chrome。gap 8px。矩陣 `grid-template-columns: repeat(auto-fill, minmax(148px, 1fr))`。 |
| 8 | **Status lamp** | 8px 方形 `--r-1`。實心 = 進行中或完成；空心方點 = 等待；空心方框 = 失敗；三角 = 需檢查。**形狀差異先於顏色差異。** |
| 9 | **Scan band** | 高 2px 的 `--cyan` 實線，上下各 3% 的 `--cyan-veil` 衰減。無外擴光暈。 |
| 10 | **Tile chrome** | 底部 28px 條，底 `rgb(8 9 10 / 0.82)`，`backdrop-filter: blur(6px)`（**這是為了在任意商品圖上維持文字可讀，是特定效果不是裝飾**）。檔名 11.5px mono `--ink`，右側尺寸 11.5px mono `--ink-mid`。 |
| 11 | **Intake rail** | w 304px，底 `--forge-plate`，右邊 1px `--forge-line`。區塊之間 1px `--forge-line` 分隔 + `--sp-7` 間距。區塊標題 16px 600 `--ink-hi`，上 `--sp-7` 下 `--sp-5`。 |
| 12 | **Preset row** | h 40px，checkbox 14px `--r-1`。hover 整列底 `--forge-rail`。展開區底 `--forge-slot`，左側 1px `--cyan-deep` 直線。來源註記 11.5px `--ink-mid`。 |
| 13 | **Input / number field** | h 32px，底 `--forge-slot`，1px `--forge-line-strong`，`--r-2`，字 13px mono `--ink-hi`，placeholder `--ink-low`。focus 邊 `--cyan`。 |
| 14 | **Range slider** | 軌 3px `--forge-slot`，已填段 `--cyan`，握把 12×16px 方形 `--r-1` 底 `--ink-hi`。**無填充背景軌道的裝飾層。** |
| 15 | **Queue progress** | 高 3px，`--r-0`，底 `--forge-slot`，前景 `--cyan`。下方一行 11.5px mono。 |
| 16 | **Ledger** | 標籤 13px `--ink-mid`；金額 `--fs-ledger` mono 500 `--ink-hi`；註腳 11.5px `--ink-mid`。無框、無卡片，靠 `--sp-7` 與一條上緣 1px `--forge-line` 與上一區隔開。 |
| 17 | **Export button** | 佔滿左軌寬，h 48px，`--r-2`。進度時內底一條 2px `--cyan-ink` 線。 |
| 18 | **Folder tree** | 匯出時在按鈕上方即時長出，11.5px mono `--ink-mid`，縮排 12px，用 `└─` `├─` 的純文字結構線（這是檔案樹的慣例寫法，不是裝飾符號）。 |
| 19 | **Inspector** | 左圖右欄（264px）。大圖四周 `--sp-6` 留白，底為 `--checker`。量測欄標籤 11.5px `--ink-mid`、數值 13px mono `--ink-hi`，鍵值以 1px `--forge-line` 分隔（**只有下邊線，不上下都畫**）。 |
| 20 | **Split handle** | 32×32 `--r-2`，底 `--forge-rail`，1px `--cyan`，內含 12px 的左右箭頭 SVG（自繪，1.5px stroke，與全站圖示同一筆畫）。分割線 2px `--cyan`，拖曳時 3px。 |
| 21 | **Warm-up bar** | h 72px，底 `--forge-plate`，下邊 1px `--forge-line`。進度條高 4px。**推開矩陣，不覆蓋。** |
| 22 | **Status rail** | h 36px，底 `--forge-void`，上邊 1px `--forge-line`。全部 11.5px：左側 mono 讀數，右側 alert slot。 |
| 23 | **Shortcuts dialog** | `<dialog>`，w 560px，底 `--forge-rail`，1px `--forge-line-strong`，`--r-2`，`--shadow-3`。backdrop `rgb(8 9 10 / 0.72)`。兩欄鍵位表。 |
| 24 | **圖示系統** | 全部自繪 SVG，`stroke-width: 1.5`，`stroke-linecap: square`（呼應直角的世界），24×24 viewBox。共 9 個：箭頭左右、加號、暫停、播放、重試環、垂直省略號、下載、三角警示、勾。**零 emoji、零 Unicode 字元當圖示。** |

---

## 6. 為了避開 AI 預設，這個專案刻意不做的三件事

### 6.1 不做任何發光（zero glow）

暗底 + 青色 accent 的 AI 預設反射動作是 neon outer glow：`box-shadow: 0 0 20px var(--accent)`、`filter: drop-shadow(0 0 8px)`、bloom、光暈圓球背景。**本專案的 CSS 裡不會出現任何零偏移的彩色陰影。**

替代做法：青色只以三種形態存在 - **1px 的線**、**2px 的帶**、**實心填色**。深度完全由表面明度階（`#08090A` → `#0E0E10` → `#141518` → `#1B1D21` → `#232629`，五階）與帶偏移的黑色陰影建立。連招牌動效裡的「邊緣迸光」都被改寫成 `inset 0 0 0 1px` 的內環閃一次，因為內環是線，外暈是霧。

理由：這是量測工具。發光讓青色讀起來像氛圍；不發光讓青色讀起來像儀器讀數。而且它讓 `--forge-orange` 一出現就真的搶眼。

### 6.2 不做卡片（zero cards）

沒有「同尺寸卡片 = 圖示 + 標題 + 敘述」的區塊，沒有 feature grid，沒有 bento，沒有任何有陰影的圓角容器裝著文字。整個左軌的分區靠 **1px hairline + `--sp-7` 的間距 + 表面明度差**，不靠邊框盒子。

唯一長得像卡片的東西是 queue tile，而它是 `--r-0` 直角、內容是真實影像、沒有陰影 - 它是一張照片，不是一個容器。

理由：這個工具的價值主張是「工作流」，不是「功能列表」。功能由那個真的在跑的佇列證明。放三張功能卡片會等於承認工具本身不夠有說服力。

### 6.3 首屏不放任何統計數字

沒有 hero metric（大數字 + 小標籤 + 輔助統計），沒有「已處理 1,200,000 張」的假社群證明，沒有 sparkline，沒有進度環。**省錢計數器在使用者處理完第一張圖之前，完全不存在於 DOM。**

首屏唯一的數字是 `200`（在標題句子裡當名詞用）與 `44 MB`（真實的模型大小）。兩者都是句子的一部分，不是被框起來展示的指標。

理由：這一站賣的是「不用相信我，你自己按一下就知道」。任何在使用者行動之前就展示的數字，都是要求他先相信我們 - 而這正是 PRODUCT.md 裡標記為「使用者進站時處於提防狀態」要避開的東西。數字必須是他自己造出來的，那才截得了圖。

**額外自我約束（不列入三項但同樣執行）**：不用玻璃模糊當裝飾（唯一的 `backdrop-filter` 用在 tile 底部條，功能是讓文字在任意商品圖上可讀）；不用等寬字當科技感戲服（mono 只給真實量值）；不用章節編號；不用 eyebrow；不用漸層文字；不用 marquee。

---

## 7. 動效預算與招牌時刻

- **招牌時刻只有一個**：THE POUR（INTERACTION.md §5）。它由使用者丟入檔案觸發，畫面上發生的具體視覺事件是「200 張縮圖從中央鋪開、逐張被掃描帶推過、在完成瞬間被徑向 mask 擦除成透明底」。
- **其他地方不重複這套進場。** 左軌、masthead、status rail、Inspector 全部沒有進場動畫，它們直接在最終狀態出現。
- 頁面沒有 scroll-telling，因此**不使用 ScrollTrigger**。只引入 `gsap.min.js` 與 `Flip.min.js`（已驗證 `https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/Flip.min.js` 回應 200）。
- 動效素材超出 transform/opacity：`mask-image`（顯影）、`clip-path`（對比分割線）、`backdrop-filter`（tile chrome）、CSS 自訂屬性經 `@property` 註冊後可插值（`--scan`、`--erase`、`--ring`、`--split`）。
- `prefers-reduced-motion` 用 `gsap.matchMedia()` 實作，內容預設可見，CSS 內零 `opacity: 0` 寫死。

---

## 8. 技術契約（已逐項驗證存在）

| 資源 | URL | 驗證 |
|---|---|---|
| GSAP core | `https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js` | HTTP 200 |
| GSAP Flip | `https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/Flip.min.js` | HTTP 200 |
| transformers.js | `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5` | `/+esm` HTTP 200，486 KB |
| zip.js | `https://cdn.jsdelivr.net/npm/@zip.js/zip.js@2.7.57/+esm` | HTTP 200，174 KB |
| Geist / Geist Mono | Google Fonts `css2?family=Geist&family=Geist+Mono` | 回傳真實 `@font-face`，`gstatic.com/s/geist/v5/` |
| 模型 | `briaai/RMBG-1.4` | repo 含 `onnx/model.onnx` (176 MB)、`onnx/model_fp16.onnx` (88 MB)、`onnx/model_quantized.onnx` (44 MB)、`config.json`、`preprocessor_config.json` |

模型載入的正確寫法（`config.json` 的 `model_type` 是 `SegformerForSemanticSegmentation`，transformers.js 不認得 BriaRMBG 架構，必須覆寫成 `custom`）：

```js
import { AutoModel, AutoProcessor, RawImage, env }
  from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5";

const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
  config: { model_type: "custom" },
  device: hasWebGPU ? "webgpu" : "wasm",
  dtype: hasWebGPU ? "fp16" : "q8",     // fp16 = 88 MB, q8 = 44 MB
  progress_callback: onWarmupProgress,   // 驅動 warm-up 進度條
});

const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
  config: {
    do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
    image_mean: [0.5, 0.5, 0.5], image_std: [1, 1, 1],
    feature_extractor_type: "ImageFeatureExtractor",
    resample: 2, rescale_factor: 1 / 255,
    size: { width: 1024, height: 1024 },
  },
});
```

`env.allowLocalModels = false`。所有本地資源路徑一律相對（`./css/tokens.css`、`./js/main.js`、`../mockup-loom/`）。

---

## 9. 檔案結構

```
cutout-forge/
  index.html            # 方向契約註解在 <body> 第一個子節點
  css/
    tokens.css          # 唯一顏色來源
    style.css           # 版面與元件
  js/
    main.js             # ES module entry：DOM 綁定、狀態機
    queue.js            # 佇列、並行控制、記憶體壓力
    engine.js           # 模型載入、WebGPU 偵測、warm-up 進度
    chroma.js           # 保底 chroma-key（純 JS，零依賴）
    worker.js           # 推論與 chroma-key 的 Worker
    compose.js          # alpha 合成、feather、despill、preset 重構圖
    exporter.js         # ZIP 打包、命名、manifest
    motion.js           # GSAP：THE POUR、Flip、matchMedia
    samples.js          # 6 張 Canvas 範例商品圖
  assets/
    icons.svg           # 9 個自繪圖示的 sprite
  PRODUCT.md
  docs/INTERACTION.md
  docs/DESIGN-DIRECTION.md
  README.md
```
