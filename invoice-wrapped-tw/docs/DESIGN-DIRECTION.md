# DESIGN-DIRECTION.md / 發票回顧

指派世界（pinned brief，來自 `hyperkit/docs/VISUAL-WORLDS.md` 第 1 項，不可更改）：
**收銀機列印的那捲紙 + 電子發票載具條碼掃描。暗底、深靛近黑、朱橘紅唯一 accent、Archivo / Noto Sans TC / Martian Mono、齒孔與掃描光帶、圓角 2px 或 0。**

---

## 1. 方向契約六區塊（逐字寫入 `index.html` `<body>` 第一個子節點）

```html
<!--
THESIS
  這台機器已經替你記了一整年的帳，你只是從來沒有把那捲紙拉出來看過。
  這個站的工作是把 22 KB 的原始 CSV 變成一個你會截圖的畫面，
  而且全程不把那份資料交給任何人，包括我。
  它是一台離線的印表機，不是一個雲端服務，也不是一個理財教練。
  它報數字，給脈絡，不下判斷。

OWN-WORLD
  收銀機吐紙的那一刻，加上載具條碼被掃過的那一道紅光。
  不是紙的懷舊（沒有米白、沒有牛皮、沒有黃銅），是機器輸出資料的當下。
  地是深靛近黑 #0B0D17，油墨只有一種：朱橘紅 #FF4D2E，統一發票紅的現代化。
  白是熱感應紙的白 #F4F6FB，不是純白，因為這是深夜關燈後在看的畫面。
  材質語彙：齒孔邊緣、撕裂的鋸齒、掃描光帶、等寬對齊的資料列、
  條碼那種粗細交替的節奏。圓角只有 0 與 2px 兩種。
  分類不用彩虹色，這個世界只有一種油墨，濃淡就是分類。

STORY
  待命 → 進紙 → 解析（看得見的逐列印字）→ 攤開（儀表板，自由亂點）
  → 收攏成敘事（全螢幕十屏）→ 撕下一張帶走（直式圖卡）。
  情緒曲線：好奇 → 一點點被冒犯（214 次）→ 想給別人看。
  轉場靠材質：紙帶吐出、撕開、捲起，不靠淡入淡出。

FIRST VIEWPORT
  左：兩行標題「一整年的消費 / 都在這捲紙上。」Archivo 800 / wdth 112，
      副文一句話講完離線與時間成本，一顆朱橘紅實心 CTA「載入範例資料」。
  右：進紙口本體。1px 虛線框、上下齒孔、一條 2px 朱橘紅掃描光帶 2.4 秒往返，
      內含唯一的檔案按鈕。它不是插圖，它是真的可以用的控制項。
  首屏文字元素恰好四個。沒有 eyebrow，沒有捲動提示，沒有裝飾字串，
  沒有假儀表板截圖，沒有大數字統計模板。數字要等使用者的資料進來才出現。

FORM
  版面是收據的邏輯：等寬右對齊的金額欄、每五列一條 hairline（不是每列都有線）、
  群組之間用空白而不是卡片邊框。禁止 icon + 標題 + 敘述的等大卡片網格。
  字階：Archivo（顯示，最大 5.75rem）／Noto Sans TC（中文內文）／
  Martian Mono（發票號碼、金額、日期，只用於資料與量測）。
  一組 accent 鎖定全頁：朱橘紅。錯誤與警示也用它，配合 1px 描邊與自繪圖示區分，
  不引入第二個色相。成功狀態沒有顏色，只有紙白。
  深度靠帶偏移的柔陰影（tint 到靛藍），不用零偏移光暈。
  動效只有一個被創作的時刻：第三屏「你的第二個家」。其餘全是回饋與狀態轉換。
  內容預設可見，GSAP 掛掉時整頁照常運作。

FINISH
  unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
```

---

## 2. 色彩 token（唯一來源：`css/tokens.css`）

對比比值以 WCAG 2.1 相對亮度公式實算，非估計。

### 2.1 底層（Ink / 深靛近黑家族）

| Token | Hex | 角色 | 對比（vs `--paper`） |
|---|---|---|---|
| `--ink-void` | `#06070E` | 最深層。overlay 底、按鈕上的文字色、圖卡背景 | 18.59:1 |
| `--ink-base` | `#0B0D17` | 頁面背景。全站唯一的 body 底色 | 17.91:1 |
| `--ink-raised` | `#12141F` | 抬升面：hover 列、面板底、空熱力格 | 16.95:1 |
| `--ink-panel` | `#171A28` | 浮起面板：tooltip、展開面板、圖卡控制區 | 15.99:1 |
| `--line-1` | `#1D2030` | 最細分隔線（每五列一條） | - |
| `--line-2` | `#2B2F44` | 預設邊框、進紙口虛線 | - |
| `--line-3` | `#363B54` | hover 邊框、強調分隔 | - |

不使用純黑 `#000000`。`--ink-void` 保留一點靛藍。

### 2.2 紙白（Paper / 熱感應紙）

| Token | Hex | 角色 | 對比 vs `--ink-base` | vs `--ink-panel` |
|---|---|---|---|---|
| `--paper` | `#F4F6FB` | 主要文字、標題、選中態 | **17.91:1** | 15.99:1 |
| `--paper-dim` | `#AEB4CC` | 次要內文、章節敘述 | **9.41:1** | 8.40:1 |
| `--paper-mute` | `#8790AC` | 表頭、meta、placeholder | **6.10:1** | 5.45:1 |
| `--paper-faint` | `#7A82A0` | 第三層說明、單位標籤 | **5.10:1** | 4.55:1 |
| `--paper-off` | `#565D78` | 僅 disabled 控制項（WCAG 對 disabled 無要求，另配 `opacity` 與 `cursor`） | 3.02:1 | - |

全部由靛藍色相調出（H≈232），**沒有一個是中性灰**。這是「彩色表面上的次要文字不准用灰色」的具體執行。

### 2.3 唯一 accent（Vermilion / 朱橘紅）

| Token | Hex | 角色 | 對比 |
|---|---|---|---|
| `--vermilion` | `#FF4D2E` | 主 accent：CTA 填色、掃描光帶、選中框、錯誤描邊 | 5.86:1 vs `--ink-base`（AA 內文級）；`--ink-void` 在其上 6.08:1 |
| `--vermilion-bright` | `#FF7A5C` | hover 填色、**focus ring** | 7.55:1 vs `--ink-base` |
| `--vermilion-deep` | `#C4321A` | 按下態、reduced-motion 下的靜止光帶、紙白底上的 accent 文字 | 5.09:1 vs `--paper` |
| `--vermilion-wash` | `rgb(255 77 46 / .12)` | dragover 底色、選中列底色 | 疊在 `--ink-base` 上實際亮度仍讓 `--paper` 維持 16.4:1 |
| `--vermilion-hair` | `rgb(255 77 46 / .32)` | 1px 標記線、圖表輔助線 | - |

**主 CTA 的對比**：`--vermilion` 填底 + `--ink-void` 文字 = 6.08:1，過 AA 內文級。

### 2.4 單一油墨階（Ramp / 分類與熱度共用）

這個世界只有一種油墨。分類不靠色相區分，靠**濃淡 + 條紋密度 + 自繪圖示**三重編碼（對色覺辨識障礙同時友善）。

| Token | Hex | 熱力圖用途 | 分類用途 | 條紋密度 |
|---|---|---|---|---|
| `--ramp-0` | `#12141F` | 無消費 | - | - |
| `--ramp-1` | `#4A1A10` | 最低五分位 | 其他 | 0 條 |
| `--ramp-2` | `#7E2A16` | 第二五分位 | 電商 | 1 條 / 12px |
| `--ramp-3` | `#B23A1D` | 中位 | 藥妝 | 2 條 |
| `--ramp-4` | `#FF4D2E` | 第四五分位 | 交通 | 3 條 |
| `--ramp-5` | `#FF8A63` | 高 | 餐飲 | 4 條 |
| `--ramp-6` | `#FFC5B0` | 最高 | 超商 / 超市 | 5 條 |

熱力格內不放文字（數值走 tooltip），因此不需要格內對比。圖例文字一律在 `--ink-base` 上用 `--paper-mute`。
泡泡上若印店名，`--ramp-1` 到 `--ramp-3` 用 `--paper`（5.52:1 以上），`--ramp-4` 到 `--ramp-6` 用 `--ink-void`（6.08:1 以上）。切換門檻寫死在 `--ramp-4`。

### 2.5 沒有的顏色

- 沒有綠色成功、沒有黃色警告、沒有紅色錯誤（錯誤就是 accent 本身 + 描邊 + 圖示）
- 沒有第二個 accent 色相
- 沒有藍紫光暈、沒有霓虹發光
- 沒有任何米白、黃銅、赭石、暖灰

---

## 3. 字型與字階

### 3.1 三個家族

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Martian+Mono:wght@300..700&family=Noto+Sans+TC:wght@400;500;700&display=swap">
```

| 角色 | 家族 | Fallback 堆疊 | 使用範圍 |
|---|---|---|---|
| 顯示 | `Archivo`（可變，`wdth` 62-125 / `wght` 400-900） | `"Arial Narrow", "Helvetica Neue", system-ui, sans-serif` | 標題、章節大數字、按鈕、wordmark |
| 中文 / 內文 | `Noto Sans TC` | `"PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif` | 所有中文段落與 UI 文字 |
| 資料 | `Martian Mono`（可變 `wght` 300-700） | `"SFMono-Regular", Consolas, "Liberation Mono", monospace` | 金額、日期、發票號碼、統編、百分比、列數 |

**等寬字的使用界線**：只用於數字、識別碼、量測值。任何一段散文、任何一個標籤文字都不准用等寬。這是避開「等寬字當科技感戲服」的執行規則。

### 3.2 字階

| Token | 值 | 行高 | 字距 | 字重 / 寬度 | 用途 |
|---|---|---|---|---|---|
| `--fs-chapter` | `clamp(3.25rem, 11vw, 5.75rem)` | 0.92 | -0.04em | Archivo 900 / wdth 125 | 回顧章節的主數字（上限 5.75rem，未超過 6rem） |
| `--fs-hero` | `clamp(2.5rem, 6.2vw, 4.25rem)` | 0.98 | -0.035em | Archivo 800 / wdth 112 | 首屏 H1（最多 2 行） |
| `--fs-h2` | `clamp(1.75rem, 3.2vw, 2.5rem)` | 1.08 | -0.02em | Archivo 700 / wdth 100 | 區塊標題 |
| `--fs-h3` | `1.3125rem`（21px） | 1.25 | -0.01em | Archivo 600 / wdth 100 | 面板標題、章節副標 |
| `--fs-lead` | `1.0625rem`（17px） | 1.6 | 0 | Noto Sans TC 400 | 章節敘述、首屏副文 |
| `--fs-body` | `0.9375rem`（15px） | 1.65 | 0 | Noto Sans TC 400 | 一般內文、UI |
| `--fs-meta` | `0.8125rem`（13px） | 1.5 | 0 | Noto Sans TC 400 | 說明文字、tooltip |
| `--fs-micro` | `0.6875rem`（11px） | 1.4 | 0.06em | Noto Sans TC 500 | 表頭、單位、圖例 |
| `--fs-num-xl` | `clamp(2rem, 5vw, 3.25rem)` | 1 | -0.02em | Martian Mono 600 | 年度數列的六個主數字 |
| `--fs-num` | `0.875rem`（14px） | 1.5 | -0.01em | Martian Mono 400 | 表格內的金額、日期、發票號碼 |
| `--fs-num-sm` | `0.75rem`（12px） | 1.4 | 0 | Martian Mono 400 | 圖表軸標 |

**字重階梯明顯**：400（內文）/ 500（micro 標籤）/ 600（h3、數字）/ 700（h2）/ 800（hero）/ 900（chapter）。相鄰兩級不會同時出現在同一個視覺群組裡。

**行寬**：`--measure-prose: 68ch`（散文區塊）、`--measure-chapter: 42ch`（回顧章節，短句節奏）、`--measure-caption: 46ch`。

**`font-variant-numeric: tabular-nums`** 對所有 Martian Mono 用法強制開啟，確保欄位垂直對齊。

---

## 4. 間距、圓角、陰影

### 4.1 間距階（收據列節奏，base = 4px，行高 28px）

| Token | 值 | 典型用途 |
|---|---|---|
| `--sp-1` | `0.25rem` (4) | icon 與文字之間 |
| `--sp-2` | `0.5rem` (8) | 群組內元素間隙、熱力格 gap 的兩倍 |
| `--sp-3` | `0.75rem` (12) | 按鈕內距（垂直）、表格 cell 內距 |
| `--sp-4` | `1rem` (16) | 按鈕內距（水平）、標題與其下方內文 |
| `--sp-5` | `1.5rem` (24) | 面板內距、卡片內元素間 |
| `--sp-6` | `2rem` (32) | 群組之間 |
| `--sp-7` | `3rem` (48) | 標題**上方**（＝其下方 `--sp-4` 的 3 倍） |
| `--sp-8` | `4rem` (64) | 區塊之間（桌機） |
| `--sp-9` | `6rem` (96) | 大區塊之間 |
| `--sp-10` | `8.5rem` (136) | 首屏與下一區塊之間 |
| `--row-h` | `1.75rem` (28) | 收據列的固定列高，全站的垂直節奏單位 |
| `--gutter` | `clamp(1rem, 4vw, 2.5rem)` | 頁面左右留白 |
| `--shell` | `1240px` | 內容最大寬度 |

**節奏規則**：標題上方空間永遠是下方的 2 到 3 倍（`--sp-7` 上 / `--sp-4` 下）。群組內用 `--sp-2` 到 `--sp-3`，群組之間用 `--sp-6` 以上。整頁只用這一套。

### 4.2 圓角（成文規則，不混用）

| Token | 值 | 適用 |
|---|---|---|
| `--r-data` | `0` | 所有資料表面：收據列、熱力格、流向節點、圖表、明細表、紙帶 |
| `--r-ui` | `2px` | 所有控制項與容器：按鈕、輸入框、下拉、面板、tooltip、標記帶 |
| `--r-round` | `50%` | 只有店家泡泡（圓形是資料語意：面積編碼金額） |

沒有 pill、沒有 8px、沒有 12px、沒有 16px。任何一個 `border-radius` 不在這三個 token 裡就是錯的。

### 4.3 陰影（帶偏移 + 柔模糊，色調偏靛藍）

```css
--shadow-row:    0 1px 0 rgb(6 7 14 / .55);
--shadow-panel:  0 2px 4px -2px rgb(4 5 12 / .70),
                 0 12px 28px -12px rgb(4 5 12 / .80);
--shadow-lift:   0 4px 8px -4px rgb(4 5 12 / .75),
                 0 24px 56px -20px rgb(4 5 12 / .90);
--shadow-inset:  inset 0 1px 0 rgb(244 246 251 / .06);
```

零偏移的彩色光暈一個都沒有。抬升面同時使用 `--shadow-panel` 與 `--shadow-inset`（上緣一條 6% 紙白的內陰影，模擬紙張邊緣受光）。

### 4.4 動效時長與緩動

| Token | 值 | 用途 |
|---|---|---|
| `--t-tap` | `90ms` | `:active` 按下 |
| `--t-quick` | `160ms` | hover、focus、tooltip |
| `--t-base` | `260ms` | 展開、篩選、面板 |
| `--t-panel` | `420ms` | 大面積轉場、進紙口收摺 |
| `--t-story` | `1200ms` | 章節數字滾動 |
| `--t-scan` | `2400ms` | idle 掃描光帶單趟 |
| `--e-out` | `cubic-bezier(.16, 1, .3, 1)` | 主要出場曲線（指數型 ease-out） |
| `--e-out-2` | `cubic-bezier(.22, .61, .36, 1)` | hover、微互動 |
| `--e-in` | `cubic-bezier(.55, 0, 1, .45)` | 收合、離場 |
| `--e-inout` | `cubic-bezier(.65, 0, .35, 1)` | 位置重排 |

GSAP 對應：`power4.out`（＝ `--e-out` 的近似）、`power3.out`、`power2.out`（hover）、`power2.inOut`（重排）、`expo.out`（Flip）。**沒有任何一處使用 `ease: "none"`**，除了必須線性的掃描光帶循環與 ScrollTrigger 的 containerAnimation（本專案未使用）。

### 4.5 z-index（五級，不得新增）

```css
--z-base: 0;  --z-raised: 10;  --z-sticky: 100;  --z-overlay: 500;  --z-toast: 700;
```

---

## 5. 元件清單與視覺規格

### 5.1 `nav.masthead`
高 64px（桌機上限 80px，實際 64px），單行，`position: sticky; top: 0`，底 `--ink-base` + `backdrop-filter: blur(12px)` + 下緣 1px `--line-1`。
左：wordmark「發票回顧」Archivo 800 / wdth 100 / 1rem + 一個 14px 的自繪條碼標記（5 條粗細不等的直線，`--vermilion`）。
右：離線指示燈（6px 方形 `--vermilion` + 11px `--paper-mute` 文字）、「回 Hyperkit」`--paper-dim` 文字連結。
< 768px：wordmark + 指示燈方形（文字隱藏，`aria-label` 保留），「回 Hyperkit」收進 nav 右側的文字連結但字級降到 `--fs-micro`。

### 5.2 `.feed-slot`（進紙口）
桌機 `min-height: 320px`，`border: 1px dashed --line-2`，`border-radius: --r-data`（0）。
上下緣齒孔：`repeating-radial-gradient(circle at 0 50%, --ink-base 0 4px, transparent 4px 8px)` 做出半圓咬邊，間距 12px。
掃描光帶：`::after` 絕對定位，高 2px，寬 100%，`background: linear-gradient(90deg, transparent, --vermilion 18%, --vermilion 82%, transparent)`，GSAP `yoyo: true, repeat: -1, ease: "sine.inOut"`。
內部：`--fs-h3` 提示文字（`--paper`）+ `.btn-secondary`（選擇 CSV 檔案）+ `--fs-meta` 格式說明（`--paper-mute`）。
狀態依 `docs/INTERACTION.md` §3.1。

### 5.3 `.btn-primary`
`background: --vermilion`，`color: --ink-void`，`padding: --sp-3 --sp-5`，`--r-ui`，Archivo 700 / `--fs-body`，`--shadow-panel`。
hover：`--vermilion-bright` + `translateY(-1px)` + `--shadow-lift`，`--t-quick --e-out-2`。
active：`translateY(0) scale(.985)`，`--t-tap`。
focus-visible：`outline: 2px solid --vermilion-bright; outline-offset: 3px`。
loading：寬度鎖定，左側 12px 方形印字頭以 `steps(4)` 跳動。
桌機下文字絕不換行（`white-space: nowrap`）。

### 5.4 `.btn-secondary`
`background: transparent`，`border: 1px solid --line-3`，`color: --paper`。
hover：`background: --ink-raised`，`border-color: --paper-mute`。
其餘同 primary 的 focus / active 規格。

### 5.5 `.btn-ghost`
無框無底，`color: --paper-dim`，hover 時 `color: --paper` + 底線（`text-decoration-thickness: 1px; text-underline-offset: 3px`）。用於「換一個檔案」「清除篩選」這類低權重動作。

### 5.6 `.receipt-row`（收據列，全站最重要的排版單元）
`display: grid`，桌機 `grid-template-columns: 92px 1fr 108px 132px`（日期 / 店名 / 金額 / 發票號碼），`height: --row-h`，`align-items: center`，`gap: --sp-3`。
日期與發票號碼 `--fs-num` + `--paper-mute`；店名 `--fs-body` + `--paper`；金額 `--fs-num` + `--paper` + `text-align: right` + `tabular-nums`。
分隔：`&:nth-child(5n) { border-bottom: 1px solid --line-1 }`。不是每列都有線。
hover：`background: --ink-raised`，`box-shadow: inset 1px 0 0 --vermilion`（1px，未超過禁令上限）。
< 768px 切成兩行式：第一行店名 + 金額，第二行日期 + 發票號碼（`--fs-num-sm`），列高改 `calc(--row-h * 2)`。

### 5.7 `.stat-strip`（年度數列）
六欄等寬，欄間 1px `--line-1` 垂直分隔（只有分隔，沒有卡片外框）。
每欄：標籤 `--fs-micro` `--paper-mute` 在上，數字 `--fs-num-xl` `--paper` 在下，間距 `--sp-2`。
第六欄（最常去的店）是文字不是數字，改用 Archivo 600 `--fs-h3`。
資料尚未進來時數字位置印 `- - -`（`--paper-off`），資料進來後同一個節點用 GSAP `snap: 1` 滾到終值。
< 768px：兩欄 × 三列，欄間分隔改為水平 1px `--line-1`。

### 5.8 `.heatmap`
`role="grid"`，7 列（週一到週日）× 24 欄（0 到 23 時），格子 `min(1.4vw, 18px)` 見方，`gap: 2px`，`--r-data`。
左側週幾標籤 `--fs-micro` `--paper-mute`，`position: sticky; left: 0`。
底部時間軸只印 0 / 6 / 12 / 18 / 23。
圖例：`--ramp-0` 到 `--ramp-6` 七個小方塊 + 「少」「多」兩個 `--fs-micro` 標籤。
< 768px：容器 `overflow-x: auto` + `scroll-snap-type: x proximity`，格子固定 14px。

### 5.9 `.bubble-field`（canvas）
`<canvas>` + 一層 DOM `.bubble-tooltip`（`--ink-panel` 底、`--r-ui`、`--shadow-panel`、`--fs-meta`）。
DPR 處理：`canvas.width = cssW * devicePixelRatio`，`ctx.scale(dpr, dpr)`。
泡泡填色為 `--ramp-N`，另疊該分類的條紋（`ctx.createPattern` 產生的 1px `--ink-void` 斜線，密度見 §2.4）。
選中泡泡：2px `--vermilion-bright` 描邊 + 半徑 ×1.08。
canvas 旁必附一個視覺隱藏但螢幕閱讀器可讀的 `<table>`，內容為前 20 名店家的金額與次數。這是 canvas 視覺化唯一誠實的無障礙做法。

### 5.10 `.flow`（分類 → 店家）
SVG。節點 12px 寬實心條（`--ramp-N`），連線 cubic bezier `path`（`fill` 用來源分類色，`fill-opacity: .35`）。
節點標籤在條的外側，`--fs-meta` `--paper-dim`，金額 `--fs-num-sm` `--paper-mute`。
hover 與 focus 規格見 `INTERACTION.md` §3.5。
< 768px 不渲染，改為 `<details>` 分類清單。

### 5.11 `.chapter`（回顧章節）
`min-height: 100dvh`，`scroll-snap-align: start`，內容置中 `max-width: --measure-chapter`。
版面：大數字（`--fs-chapter`，Martian Mono 或 Archivo 依語意）在上，一句話敘述（`--fs-lead` `--paper-dim`）在下，`--sp-5` 間距。
每屏只有一個主張，不放兩個並列的統計。
右上角常駐一個 `--fs-micro` 的進度指示（`03 / 10`）。這是**唯一**允許的編號，因為使用者在一個線性體驗裡真的需要知道還有多久。

### 5.12 `.share-card`（離屏 canvas，1080 × 1920）
底 `--ink-void`，四邊 64px 齒孔邊緣，頂部 wordmark，中段大數字（Archivo 900，以 `ctx.fillText` 繪製，繪圖前 `await document.fonts.ready`），底部一條自繪條碼（真實 Code 128 編碼該年度總筆數，不是隨機線條）+ 站點網址。
四種版型：`ledger`（六個數字的收據）/ `single`（一個巨大數字）/ `ring`（年輪 + 造訪次數）/ `heat`（熱力圖 + 一句話）。
範例資料模式下右下角固定印「範例資料」。
遮蔽金額開關開啟時，所有金額以等高的 `--vermilion` 實心方塊覆蓋（像是被塗黑的收據），不是打馬賽克。

### 5.13 `.notice`（提示 / 錯誤）
`--ink-panel` 底，1px `--vermilion` 框（錯誤）或 1px `--line-3` 框（資訊），`--r-ui`，左側 16px 自繪圖示（同一套 1.5px 筆畫），文字 `--paper`，說明 `--paper-dim`，右側動作按鈕 `.btn-ghost`。
**不使用 border-left 加粗的做法**。框是四邊等寬 1px。

### 5.14 `.tag`（篩選標籤）
`--vermilion-wash` 底、1px `--vermilion-hair` 框、`--paper` 文字、`--fs-meta`、`--r-ui`、右側 12px 的自繪 × 圖示。
hover：底色提到 `rgb(255 77 46 / .2)`。

### 5.15 圖示系統
全部自繪 SVG，`stroke-width: 1.5`，`stroke-linecap: square`（直角，呼應世界），`viewBox="0 0 24 24"`，`currentColor`。
共 11 個：檔案、資料夾、下載、關閉、展開、收合、方向箭頭、搜尋、資訊、警示、條碼。
六個分類圖示另成一套：超商、超市、餐飲、交通、藥妝、電商，同樣 1.5px 直角筆畫。
**零 emoji，零 Unicode 字元當圖示。**

---

## 6. 為了避開 AI 預設，這個專案刻意不做的三件事

### 6.1 不做分類彩虹色盤

AI 預設：一有分類就發六個色相（藍綠黃橘紫紅），美其名為「categorical palette」。
這個專案的做法：**整個世界只有一種油墨**。分類靠單一朱橘紅油墨階的濃淡（`--ramp-1` 到 `--ramp-6`）、條紋密度（0 到 5 條 / 12px）、自繪圖示三重編碼。
代價：需要多做兩套編碼（條紋 pattern 與六個分類圖示）。
換到的東西：色覺辨識障礙使用者也分得出來、整頁色彩鎖死不會在第七個區塊冒出綠色、而且它真的像一台單色熱感應印表機印出來的東西。

### 6.2 不做 hero 大數字統計模板

AI 預設：首屏正中央一個 `NT$248,310`，下面一行小標籤「年度總消費」，旁邊三個輔助統計。
這個專案的做法：**首屏一個數字都沒有**。首屏是一台待命的機器，數字要等使用者的資料進來才被印出來。「它會算出什麼」那一區的六個位置在零資料時全部是 `- - -`，這是誠實的空狀態，也讓後續數字滾進來的那一刻有東西可對比。
代價：首屏少了一個抓眼球的大數字。
換到的東西：這個站不會謊稱它已經知道你的什麼。而且假數字（`92%`、`4.1×`）的問題根本不會發生。

### 6.3 不做圓角卡片網格與柔陰影

AI 預設：`grid-cols-3` + `rounded-2xl` + `shadow-lg` + 每格 icon / 標題 / 敘述。
這個專案的做法：資料表面圓角一律 `0`，控制項一律 `2px`，沒有第三個值。資料的分群靠**空白與每五列一條 hairline**，不靠卡片邊框。沒有任何一處出現「icon + 標題 + 一段敘述」的等大三欄。陰影只在真的抬升的表面上出現（面板、tooltip、按下的按鈕），而且一律帶偏移與柔模糊，色調 tint 到靛藍。
代價：版面需要靠對齊與節奏撐住，比丟一堆卡片難做。
換到的東西：它看起來像收據，不像一個 Tailwind starter。

---

## 7. 招牌動效時刻逐幀規格：第 3 屏「你的第二個家」

### 7.1 前置狀態

- 泡泡雲在 canvas 上，力學已收斂並停止 rAF。
- 冠軍店家（範例資料為 7-ELEVEN，214 次）在 canvas 上有已知座標 `(cx, cy, r)`。
- 一個 DOM 元素 `.champion`（`position: absolute`，內含店名與一個 `.champion-num` 數字節點）此刻 `visibility: hidden`，尺寸與位置由 JS 設定為與 canvas 上的冠軍泡泡**完全重合**。
- 年輪 canvas `#ring` 尺寸 0，位於畫面中央。
- **HTML 預設狀態**：店名、「214」、敘述文字全部已在 DOM 且可見。CSS 不寫 `opacity: 0`。GSAP 掛掉時這一屏是一段可讀的文字加一張靜態泡泡圖。

### 7.2 ScrollTrigger 設定

```js
ScrollTrigger.create({
  trigger: '#ch-home',
  start: 'top top',          // 依 BUILD-STANDARD，pin 一律 top top
  end: '+=2000',             // reduced-motion 下改為 '+=600'
  pin: true,
  pinSpacing: true,
  anticipatePin: 1,
  onUpdate: (self) => {
    if (self.progress > 0.02 && !played) { played = true; tlHome.play(); }
    if (self.progress < 0.02 && played)  { played = false; tlHome.reverse(); }
    // 退場段落用手動 progress，避免在同一個 trigger 上混用 scrub 與 toggleActions
    tlExit.progress(gsap.utils.clamp(0, 1, (self.progress - 0.72) / 0.28));
  }
});
```

`tlHome` 是 `paused: true` 的授權時間軸（總長 3.42s）。`tlExit` 是 `paused: true` 的退場時間軸，由 `progress()` 手動驅動。兩者都建立在 `gsap.matchMedia()` 的 `no-preference` 分支內。

### 7.3 `tlHome` 逐幀

| 時間 | 目標 | 動作 | 參數 |
|---|---|---|---|
| `0.00s` | 216 個非冠軍泡泡（JS 物件陣列） | `scale: 1 -> 0.3`，`alpha: 1 -> 0`，`x/y` 沿著離心方向推到視野外（`r * 2.6` 倍距離） | `duration: 0.9`, `ease: "power2.in"`, `stagger: { each: 0.008, from: "random" }`。總散開時間 0.9 + 216×0.008 ≈ 2.63s，但下一段在 0.55s 就開始，兩者重疊 |
| `0.00s` | `<canvas id="bubbles">` 元素本身 | CSS `filter: blur(0px) -> blur(8px)` | `duration: 1.1`, `ease: "power2.in"`。**用單一 CSS filter 取代逐泡泡 ctx.filter**，216 次 canvas blur 會掉到 20fps，整層 blur 是 GPU 合成，維持 60fps |
| `0.50s` | canvas 上的冠軍泡泡 | 從 canvas 清除（`champion.hidden = true`），同一幀 `.champion` DOM 元素 `visibility: visible`。因為兩者座標與半徑相同，肉眼看不出交接 | `gsap.set`，0 duration |
| `0.55s` | `.champion` | `Flip.getState('.champion')` 已在 0.50s 取得；此刻加上 `.champion--center` class（`position: fixed; left: 50%; top: 50%; width: 60vh; height: 60vh; transform: translate(-50%,-50%)`），呼叫 `Flip.from(state, {...})` | `duration: 1.0`, `ease: "expo.out"`, `scale: true`, `absolute: true` |
| `0.75s` | `.champion-logo`（店名文字） | `autoAlpha: 1 -> 0`, `scale: 1 -> 0.86` | `duration: 0.35`, `ease: "power2.in"` |
| `1.10s` | `.champion-num`（數字節點） | `autoAlpha: 0 -> 1` 同時 tween 一個 proxy `{v: 0}` 到 `{v: 214}`，`snap: { v: 1 }`，`onUpdate` 寫入 `textContent`。字級 `--fs-chapter`，Archivo 900 / wdth 125 | `duration: 1.2`, `ease: "power3.out"` |
| `2.30s` | 年輪 canvas `#ring`（214 個小方塊的 proxy 陣列） | 這一幀是**數字落定的同一幀**（1.10 + 1.20 = 2.30）。214 個方塊各自 `scale: 0 -> 1`, `alpha: 0 -> 1` | `duration: 0.28`, `ease: "back.out(2.2)"`, `stagger: 0.004`。總長 0.28 + 214×0.004 = 1.136s |
| `2.30s` | `#ring` 容器 | `rotation: -6 -> 0`（整圈微微就位） | `duration: 1.14`, `ease: "power2.out"` |
| `3.10s` | 敘述文字 `.chapter-note`（「你今年走進這家店的次數，比一年裡的週末還多。」） | `y: 16 -> 0`, `autoAlpha: .35 -> 1` | `duration: 0.55`, `ease: "power3.out"` |

**總長 3.42s（0.00 到 3.42）。**

年輪幾何：內半徑 = 冠軍泡泡半徑 × 1.18，方塊 6 × 6px，214 個平均分佈於 360 度（每格 1.682 度），從 12 點鐘方向順時針排列，依日期排序。方塊填色為該次消費金額在該店家內的分位對應的 `--ramp-3` 到 `--ramp-6`，因此年輪本身就是一張環形熱力圖，不是裝飾。

### 7.4 動效結束後的可互動殘留

- `#ring` canvas 掛 `pointermove`：以 `atan2(y - cy, x - cx)` 算出角度 → 反推索引 → 顯示 tooltip「03/14（五）NT$118」。
- `#ring` 掛 `tabindex="0"`，左右鍵移動索引，`aria-live` 播報同樣內容。
- 這讓 214 個方塊從「一個動畫」變成「一個可查詢的資料視覺化」，這是動效被動機驅動而非裝飾的證明。

### 7.5 `tlExit`（由捲動 progress 0.72 到 1.00 手動驅動）

| 進度 | 目標 | 動作 |
|---|---|---|
| 0 到 0.55 | `#ring` 的 214 個方塊 | 半徑從 `R` 收縮到 0（proxy 陣列的 `radius` 屬性），同時 `alpha` 依索引 stagger 降到 0 |
| 0 到 0.55 | `.champion-num` | `scale: 1 -> 0.15`, `autoAlpha: 1 -> 0` |
| 0.35 到 1.0 | `.ring-seed`（一個 8px `--vermilion` 方塊） | 從畫面中央移動到下一屏月度折線圖上「12 月」那個資料點的座標（該座標在 `ScrollTrigger.refresh` 時重算），走 `motionPath` 的一段二次貝茲（不需要 MotionPathPlugin，用 `x`/`y` 兩個 tween 配 `power2.in` / `power1.out` 組出弧線） |
| 0.85 到 1.0 | 下一屏折線圖的「12 月」資料點 | `scale: 1 -> 1.6 -> 1`，接住那顆種子 |

### 7.6 `prefers-reduced-motion` 分支

```js
const mm = gsap.matchMedia();
mm.add({
  reduce: '(prefers-reduced-motion: reduce)',
  ok: '(prefers-reduced-motion: no-preference)'
}, (ctx) => {
  if (ctx.conditions.reduce) {
    // 直接設定終值：冠軍居中、數字顯示 214、年輪全部畫出、其餘泡泡隱藏
    setChampionFinalState();
    return;              // 不建立任何 tween 與 ScrollTrigger pin
  }
  buildSignatureTimeline();
});
```

reduced-motion 下第 3 屏仍然完整：一個置中的大泡泡、214、一整圈年輪、一句敘述，而且年輪仍可 hover 查詢。使用者少的是過程，不是內容。

### 7.7 效能契約

- 216 個泡泡的散開是**一次 GSAP tween 打在物件陣列上**，每幀只做一次 canvas 重繪（`ticker` 裡讀陣列狀態畫），不是 216 個獨立 tween 各自碰 DOM。
- 模糊用 CSS `filter` 打在 canvas 元素上（GPU 合成），不是 `ctx.filter`。
- 年輪 214 個方塊同樣是 proxy 陣列 + 單一 canvas 重繪。
- Flip 只作用在**一個** DOM 元素上。
- `will-change: transform` 只在 `.champion` 於 0.50s 加上，時間軸結束時移除。
- 目標：整段 3.42s 在 1280×800 的 M 級筆電上維持 60fps；退場 scrub 段落每幀成本 < 4ms。
