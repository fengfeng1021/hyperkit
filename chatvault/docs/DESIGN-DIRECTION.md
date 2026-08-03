# ChatVault - 設計方向

指派世界：VISUAL-WORLDS.md #6，圖書館卡片目錄櫃 / 檔案索引。Pinned brief，不執行 concept-seed，不自行更改。

Design read（一行）：`Reading this as: a local-first archive tool for AI power users, with a library card-catalogue language, leaning toward native CSS tokens + Literata + one authored canvas moment.`

Dials：`DESIGN_VARIANCE: 6` / `MOTION_INTENSITY: 6` / `VISUAL_DENSITY: 6`
理由：這是長時間閱讀 + 高密度資料檢索的工具，不是 landing page。VARIANCE 壓到 6（三欄目錄櫃是功能決定的骨架，不是可自由變形的版面）；MOTION 維持 6（一個招牌時刻 + 短促回饋，其餘靜止）；DENSITY 拉到 6（幾千張卡片的清單本來就密，但內文區必須回到 68ch 的閱讀密度）。

---

## 1. 方向契約（六區塊全文）

以下內容原樣寫入 `index.html` 中 `<body>` 的第一個子節點，作為 HTML 註解。

```html
<!--
  DIRECTION CONTRACT - chatvault

  THESIS
  A card catalogue for the conversations you already had. The product's one job is to
  prove, in the first three seconds, that a 340 MB export can be opened, indexed, and
  searched without a single byte leaving this tab. Every design decision serves either
  legibility of long-form text or the credibility of that claim. The interface is a
  naming and finding system, not a viewer.

  OWN-WORLD
  The library card catalogue cabinet. Drawers, index cards, tabs that stand proud of the
  card edge, hairline rules, cross-references. Cool paper grey ground (#F2F2EF), deep ink
  text (#1C1C1A), amber index tabs (#C8901A) as the single accent. Literata carries both
  display and body because this is a long-reading product and the serif is functional
  here, not decorative. Public Sans carries UI labels; Spline Sans Mono carries code and
  measured quantities. Corner radius is locked at 2px because a cut card edge is not
  round. No dark mode: this world is paper under a desk lamp, and the brief pins it light.

  STORY
  Empty drawer, filling drawer, full catalogue. The visitor arrives at a physical drawer
  front and drops a file into it. Slivers of card fly in batch by batch, back to front,
  and the drawer visibly thickens. Amber tabs rise from the stack, each one a real term
  pulled from the inverted index being built. The drawer closes, its front plate drops
  away, and the three-column cabinet behind it is revealed. The same stack of card slivers
  then compresses into a 120px spine strip under the search field, where it stays for the
  rest of the session as the live readout of every query. The animation is not decoration
  around the search; it is the search result.

  FIRST VIEWPORT
  Left 54%: an H1 in two lines, one 17-word subline, one primary action, one secondary
  action. Nothing else. No eyebrow, no metric strip, no logo wall, no scroll cue.
  Right 46%: the drop zone rendered as a drawer front, 380px tall, with a 3px ink top
  edge, a solid pull, and an offset soft shadow. It is a real control, not an illustration.
  At 1280x800 the first row of the next section shows about 40px, which is the only
  invitation to scroll the page needs.

  FORM
  Three columns at desktop: drawer (244px, filters, worded labels), index (372px,
  virtualised cards), reading pane (fluid, 68ch measure). One hairline system at 1px.
  One radius at 2px. One accent, amber, used for index tabs, search hits, and the active
  selection only. Shadows always carry an offset and a soft blur; there are no zero-offset
  halos. Spacing is tight inside a group and generous between groups, with more space
  above a heading than below it. Icons are a single drawn SVG set at 1.5px stroke and
  appear in exactly four places. There are no icon-only buttons and no icon rail, because
  a catalogue is a system of names.

  FINISH
  unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
```

---

## 2. 色彩 token（唯一顏色來源）

全部實測對比比值，計算依 WCAG 2.x 相對亮度公式。`css/tokens.css` 是唯一定義處，後續樣式不得出現裸 hex。

### 2.1 表面

| Token | Hex | 角色 | 對比（對 `--ink` #1C1C1A） |
|---|---|---|---|
| `--paper` | `#F2F2EF` | 頁面底。冷紙灰，不是米黃 | 15.22:1 |
| `--surface-card` | `#FAFAF8` | 索引卡、assistant 訊息底、popover | 16.33:1 |
| `--surface-recessed` | `#E7E7E2` | 抽屜內腔、篩選面板、骨架列、rail 下緣 | 13.76:1 |
| `--surface-code` | `#EDEDE8` | 程式碼區塊底 | 14.53:1 |
| `--surface-inverse` | `#1C1C1A` | 選中的 chip、模式切換的作用段 | `--paper` 對它 15.22:1 |

### 2.2 文字

| Token | Hex | 角色 | 對 `--paper` | 對 `--surface-card` | 對 `--surface-recessed` |
|---|---|---|---|---|---|
| `--ink` | `#1C1C1A` | 主要文字、標題、內文 | 15.22:1 | 16.33:1 | 13.76:1 |
| `--ink-2` | `#45453F` | 次要文字、說明段 | 8.60:1 | 9.23:1 | 7.78:1 |
| `--ink-3` | `#5E5E57` | 中介資料、placeholder、角色標籤 | 5.82:1 | 6.25:1 | 5.27:1 |
| `--ink-4` | `#67675F` | 程式碼註解、最輕的說明 | 5.08:1 | 5.45:1 | 4.59:1 |
| `--ink-disabled` | `#7E7E76` | disabled 標籤（WCAG 對 disabled 無強制） | 3.72:1 | 3.99:1 | 3.30:1 |

`--ink-2` 到 `--ink-4` 全部由 `--ink` 的色相（暖度極低的中性偏綠灰，hue 60、sat 極低）提亮而來，不是純灰，符合「彩色表面上的次要文字從該色相調出來」。

### 2.3 線

| Token | Hex | 角色 | 對 `--paper` |
|---|---|---|---|
| `--rule` | `#D2D2CB` | 預設 1px 分隔線（列間、區塊間） | 1.35:1（非文字，僅作分隔） |
| `--rule-strong` | `#B4B4AC` | 輸入框下框線、chip 外框、卡片外緣 | 1.86:1 |

### 2.4 Accent（琥珀，全站唯一）

| Token | Hex | 角色 | 對比 |
|---|---|---|---|
| `--amber` | `#C8901A` | 標籤片、選中卡片的左緣標籤、脊條命中標記、搜尋框聚焦框線。**僅用於面與線，不用於文字** | 對 `--paper` 2.51:1（不足以承載文字，因此規則明訂不用於文字） |
| `--amber-deep` | `#8A5F06` | 需要用琥珀色表達的文字、focus ring、程式碼字串 token | 對 `--paper` 5.03:1 ✓、對 `--surface-card` 5.40:1 ✓、對 `--surface-code` 4.81:1 ✓ |
| `--amber-wash` | `#F6E7C4` | 延伸詞 chip 底、成功型 notice 底、投放區 dragover 底 | `--ink` 對它 13.94:1 ✓、`--ink-3` 對它 5.33:1 ✓ |
| `--amber-wash-strong` | `#EFD9A8` | 上者的 hover 一階 | `--ink` 對它 12.4:1 ✓ |
| `--hit` | `#F0D48A` | 搜尋命中 `<mark>` 底色 | `--ink` 對它 11.78:1 ✓ |
| `--ink-on-amber` | `#1C1C1A` | 琥珀面上的文字 | 對 `--amber` 6.06:1 ✓ |

### 2.5 警示（語意用，唯一的第二個色相，不作裝飾）

| Token | Hex | 角色 | 對比 |
|---|---|---|---|
| `--alert` | `#A62B1F` | 錯誤文字、錯誤上框線、刪除動作 | 對 `--paper` 6.27:1 ✓、對 `--surface-card` 6.73:1 ✓ |
| `--alert-wash` | `#F7E2DE` | 錯誤 notice 底 | `--alert` 對它 5.65:1 ✓、`--ink` 對它 13.73:1 ✓ |

**沒有綠色。** 成功狀態以琥珀 + 文字表達（`Copied`、`412 new conversations added`）。這讓整站維持一個 accent 加一個語意色，不會在第七個區塊冒出第三種顏色。

### 2.6 程式碼 token 色（自寫高亮器用，底色 `--surface-code`）

| Token | Hex | 用途 | 對 `--surface-code` |
|---|---|---|---|
| `--code-key` | `#1C1C1A` @ 650 字重 | 關鍵字（用字重不用色相） | 14.53:1 ✓ |
| `--code-str` | `#8A5F06` | 字串 | 4.81:1 ✓ |
| `--code-num` | `#8C3B12` | 數字、布林、null | 6.50:1 ✓ |
| `--code-com` | `#67675F` italic | 註解 | 4.86:1 ✓ |
| `--code-punct` | `#5E5E57` | 標點與運算子 | 5.56:1 ✓ |

五個 token 全部落在紙灰世界的色域內（墨、琥珀、燒赭、灰），沒有引入新的色彩家族。

### 2.7 焦點

`--focus: #8A5F06`（= `--amber-deep`）。所有 focus ring 為 `outline: 2px solid var(--focus); outline-offset: 2px`。在 `--surface-inverse` 上（深底 chip）改用 `--amber`（對 `--ink` 6.06:1 ✓）。

### 2.8 跨專案交叉檢查

| 專案 | 明暗 | 主色家族 | Accent |
|---|---|---|---|
| chatvault | 亮 | 冷紙灰 `#F2F2EF` | 琥珀 `#C8901A` |
| mockup-loom（最接近的鄰居） | 中性工作灰 | 中性攝影灰 | 磚紅 `#B5462F` |

紙灰是冷的（hue 60，極低飽和，偏綠），mockup-loom 的工作灰是**無色偏**中性；琥珀（hue 40 高明度）與磚紅（hue 12 低明度）在色相與明度上都拉開。無衝突。
禁用清單逐一核對：背景不是 `#f5f1ea` `#f7f5f1` `#fbf8f1` `#efeae0` `#ece6db` `#faf7f1` `#e8dfcb` 任何一個；accent 不是 `#b08947` `#b6553a` `#9a2436` `#9c6e2a` `#bc7c3a` `#7d5621` 任何一個；文字不是 `#1a1714` `#1a1814` `#1b1814` 任何一個。

---

## 3. 字型

| 角色 | 字體 | 載入 |
|---|---|---|
| 顯示 + 內文 | **Literata**（variable，含 `opsz 7..72` 與 `wght 300..700`，含 italic） | Google Fonts `<link>` + `preconnect` + `display=swap` |
| UI 標籤 | **Public Sans**（variable `wght 300..800`） | 同上 |
| 等寬 | **Spline Sans Mono**（variable `wght 300..700`） | 同上 |

Literata 是這個作品集**唯一**允許使用襯線的專案，理由在 VISUAL-WORLDS.md 明訂：長文閱讀的功能理由 + 目錄卡片的排印傳統。禁用清單核對：不是 Fraunces、不是 Instrument Serif、不是 Playfair、不是 Cormorant。
Spline Sans Mono 的選擇理由：避開其他五個專案已佔用的 Martian Mono / JetBrains Mono / Geist Mono / Fragment Mono，且不在訓練資料預設清單（Space Mono、IBM Plex Mono）上。

載入（`<head>`）：

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,300..700;1,7..72,400..600&family=Public+Sans:wght@300..800&family=Spline+Sans+Mono:wght@300..700&display=swap">
```

### 3.1 字階

| Token | 字體 | 尺寸 | 行高 | 字距 | 字重 | opsz | 用途 |
|---|---|---|---|---|---|---|---|
| `--t-display` | Literata | `clamp(2.75rem, 6.2vw, 4.5rem)` | 1.06 | -0.02em | 620 | 72 | H1（上限 4.5rem，遠低於 6rem 上限） |
| `--t-h2` | Literata | `clamp(1.75rem, 3vw, 2.375rem)` | 1.14 | -0.015em | 600 | 36 | 區塊標題 |
| `--t-h3` | Literata | `1.3125rem` | 1.25 | -0.01em | 600 | 20 | 對話標題（reading pane）、統計小節 |
| `--t-card` | Literata | `1rem` | 1.32 | -0.005em | 560 | 16 | 索引卡標題 |
| `--t-read` | Literata | `1.0625rem` | 1.62 | 0 | 400 | 16 | 訊息內文。measure 68ch |
| `--t-body` | Literata | `0.9375rem` | 1.58 | 0 | 400 | 14 | 說明段。measure 66ch |
| `--t-ui` | Public Sans | `0.8125rem` | 1.40 | 0.005em | 500 | - | 按鈕、chip、篩選標籤 |
| `--t-ui-sm` | Public Sans | `0.75rem` | 1.35 | 0.01em | 500 | - | 中介資料、角色標籤、卡片次行 |
| `--t-mono` | Spline Sans Mono | `0.8125rem` | 1.62 | 0 | 400 | - | 程式碼、位元組數、計數、查詢語法 |
| `--t-mono-sm` | Spline Sans Mono | `0.6875rem` | 1.4 | 0.02em | 500 | - | 標籤片上的詞（脊條上方） |

字距下限 -0.02em，未觸及 -0.04em 底線。
級距比：4.5 / 2.375 / 1.3125 / 1.0625 / 0.8125，相鄰比值 1.89 / 1.81 / 1.24 / 1.31，顯示層與內文層之間有明顯斷層，內文層之間細分。
字重階梯：400（內文）/ 500（UI）/ 560（卡片標題）/ 600（小標）/ 620（H1），每一階可辨。

### 3.2 排印規則

- 內文 measure 固定 68ch（落在 65 到 75ch 內），reading pane 在 1280px 以上以 `max-width` 鎖住，欄位變寬時內文靠左不拉長。
- H1 兩行斷行以 `text-wrap: balance` 加一個明確 `<br>` 保險。
- Italic 只用在程式碼註解與 `[copy] on an alternate branch` 這類標註。行高一律 ≥ 1.1 並保留 `padding-bottom: 0.08em`（Literata italic 的 `y g j p q` 降部）。
- 標題強調一律用同一字體的字重或尺寸，不在 Literata 標題裡插入 Public Sans，也不用漸層文字。
- 不使用任何 `text-transform: uppercase` + `letter-spacing: 0.18em` 的小標。全站零 eyebrow。

---

## 4. 間距、圓角、陰影、動效

### 4.1 間距階（4px 基準）

```
--s-1: 2px    --s-2: 4px    --s-3: 6px    --s-4: 8px
--s-5: 12px   --s-6: 16px   --s-7: 20px   --s-8: 24px
--s-9: 32px   --s-10: 44px  --s-11: 60px  --s-12: 84px  --s-13: 120px
```

節奏規則（貫穿全頁）：
- 群組內：`--s-3` 到 `--s-5`（卡片內的標題與次行間 6px；chip 之間 8px）。
- 群組間：`--s-8` 到 `--s-10`（卡片列之間 0 但有 1px 線；篩選群組之間 24px）。
- 標題**上方**空間 = 下方的 2 倍（例：`margin-top: var(--s-11)` / `margin-bottom: var(--s-7)`，60 / 20）。
- 區塊之間（`empty` 頁面）：`--s-12`（84px）桌機、`--s-10`（44px）手機。
- 欄位內距：rail `0 var(--s-8)`；drawer `var(--s-8)`；index card `var(--s-6) var(--s-7)`；reading pane `var(--s-9) var(--s-10)`。

### 4.2 圓角（一套，鎖死）

```
--r: 2px        /* 卡片、chip、輸入框、popover、程式碼區塊，全部 */
--r-0: 0        /* 分隔線、canvas、標籤片的切口邊 */
```

沒有 pill、沒有 12px 卡片、沒有圓形按鈕。卡片是被裁切的紙，2px 是裁刀的圓度。

### 4.3 陰影（全部帶偏移 + 柔和模糊，色相取自墨色）

```
--shadow-card:        0 1px 2px rgba(28,28,26,.06), 0 2px 8px rgba(28,28,26,.05);
--shadow-raised:      0 2px 4px rgba(28,28,26,.07), 0 10px 24px -6px rgba(28,28,26,.11);
--shadow-drawer:      0 8px 18px -4px rgba(28,28,26,.13), 0 24px 60px -18px rgba(28,28,26,.18);
--shadow-drawer-hover:0 10px 22px -4px rgba(28,28,26,.16), 0 30px 72px -18px rgba(28,28,26,.22);
--shadow-inset-rule:  inset 0 -1px 0 var(--rule);
--shadow-drawer-cavity: inset 0 6px 14px -6px rgba(28,28,26,.20);
```

零偏移的彩色光暈不存在。硬偏移陰影（`4px 4px 0`）不存在，這個世界不是 neobrutalist。

### 4.4 動效 token

```
--dur-1: 120ms   /* 狀態回饋：hover、chip 切換、:active */
--dur-2: 180ms   /* 搜尋重排、標籤升起、popover 展開 */
--dur-3: 300ms   /* 面板切換、手機版覆蓋滑入 */
--dur-4: 520ms   /* 抽屜前緣落下、工作台揭開 */
--dur-batch: 640ms /* 一批卡片薄片的飛行 */

--ease-out:    cubic-bezier(.16, 1, .3, 1);      /* 指數型 ease-out，預設 */
--ease-settle: cubic-bezier(.22, 1.15, .36, 1);  /* 落定時的極小過衝 */
--ease-in-out: cubic-bezier(.65, 0, .35, 1);     /* 面板對調 */
--ease-in:     cubic-bezier(.55, 0, 1, .45);     /* 僅用於離場（前緣落下） */
```

GSAP 對應：`--ease-out` ≈ `power4.out`（預設）、標籤升起用 `power3.out`、合攏用 `power2.out`、離場用 `power3.in`、索引線掃描用 `power2.inOut`。
`ease: "none"` 只用在兩處且都是資料驅動而非動效：標籤列的持續左移、canvas 進度值對應真實位元組進度。
`gsap.defaults({ duration: 0.18, ease: "power4.out" })`。

---

## 5. 元件清單與視覺規格

編號對應 INTERACTION.md 第 3 節的狀態機。

| # | 元件 | 視覺規格 |
|---|---|---|
| 1 | **Drop zone** | 380px 高（手機 240px），`--surface-recessed` 底，上緣 3px `--ink` 實心前緣（抽屜面板），前緣中央 44×8px 的 `--ink` 把手（2px 圓角）。內腔 `--shadow-drawer-cavity`，外部 `--shadow-drawer`。內側 1px `--rule-strong` 虛線（dash 6/4），hover 轉實線。dragover 底色轉 `--amber-wash`、虛線轉 2px `--amber` 實線 |
| 2 | **Rail** | 高 64px（手機最多 112px 兩行），`--paper` 底，下緣 `--shadow-inset-rule`。wordmark 用 Literata 620 / 17px，不是圖示 |
| 3 | **Search field** | 只有下框線（1px `--rule-strong`），無四邊框。高 40px，內距 `0 var(--s-4)`，字體 `--t-read`（輸入的是自然語言，用襯線）。placeholder `--ink-3`（5.82:1）。focus 時下框線變 2px `--amber` |
| 4 | **Mode toggle** | 高 28px，1px `--rule-strong` 外框，`--r`。作用段 `--surface-inverse` 底 + `--paper` 字，非作用段透明 + `--ink-2` 字。作用段以 GSAP `x` 滑動 |
| 5 | **Expansion chip** | 高 24px，`--amber-wash` 底，`--ink` 字（13.94:1），`--r`，內距 `0 var(--s-3)`。右側 10×10px 的 `×`（SVG，1.5px stroke，`currentColor`） |
| 6 | **Source chip** | 高 28px，未選為 1px `--rule-strong` 外框 + `--ink-2` 字，已選為 `--surface-inverse` 底 + `--paper` 字。左側 12px 來源標記 SVG |
| 7 | **Spine strip** | 120px 高 canvas，滿版寬，底 `--paper`，上下各一道 1px `--rule`。薄片 3px 高、間距 1px、`--ink` 60% 起。命中時全墨；年份分界用 1px `--rule-strong` 直線加 `--t-mono-sm` 年份 |
| 8 | **Index card** | 列高 92px（手機 104px），底 `--paper`，hover / 選中轉 `--surface-card`。列間 1px `--rule`（最後一列無）。**左緣標籤片**：3px 寬 × 20px 高的 `--amber` 矩形，位於卡片上緣下方 12px，選中時變 5px 寬 × 全高。標題 `--t-card`，次行 `--t-ui-sm` / `--ink-3`。分數條：1px 高 `--amber`，**無背景槽**，寬度 = `score/topScore × 48px` |
| 9 | **Message row（human）** | 左側 3px `--amber` 直線（滿高），左內距 `--s-7`，底色 `--paper`。角色標籤 `--t-ui-sm` / `--ink-3` |
| 10 | **Message row（assistant）** | 無左線，底色 `--surface-card`，內距 `var(--s-7)`，上下與相鄰訊息間距 `--s-8` |
| 11 | **Branch switcher** | 高 22px，1px `--rule-strong` 外框，`--r`。箭頭 SVG 10×10、1.5px stroke。`2 / 3` 用 `--t-mono-sm` |
| 12 | **Code block** | `--surface-code` 底，上緣 1px `--rule`，無外框，內距 `var(--s-6)`。語言標籤左上 `--t-ui-sm` / `--ink-3`；`Copy` 右上。內文 `--t-mono`，`overflow-x: auto`，捲動條 `--rule-strong` |
| 13 | **Hit mark** | `<mark>`，`--hit` 底、`--ink` 字（11.78:1），`--r-0`，`padding: 0 1px`。目前聚焦命中加下緣 2px `--amber-deep` |
| 14 | **Export popover** | `--surface-card` 底，1px `--rule-strong` 外框，`--r`，`--shadow-raised`。列高 34px，hover 底色 `--surface-recessed`。分隔用 1px `--rule` |
| 15 | **Stats view** | 頂行三個數字用 `--t-h2`（不是 hero-metric 的大數字加小標籤模板，數字與說明同一行等重）。月長條 canvas：`--ink` 長條、最高月 `--amber`、基線 1px `--rule-strong`、無背景槽。詞彙標籤條：每個詞是一片凸出的標籤（上緣 2px `--amber`、底 `--surface-card`、`--t-ui`），呼應卡片標籤 |
| 16 | **Notice** | 上緣 1px（`--alert` 或 `--amber-deep`），底 `--alert-wash` 或 `--amber-wash`，內距 `var(--s-6) var(--s-7)`，`--r`。標題 Public Sans 600 13px，說明 `--t-body`。無圖示、無彩色圓點 |
| 17 | **Field mapping wizard** | 左右各半。左 5 個 `<select>`（高 34px，1px `--rule-strong`，`--r`），右預覽區 `--surface-card` 底 + 1px `--rule` 外框 |
| 18 | **Vault manager** | 每來源一列，列間 1px `--rule`。右側 `Remove` 為 `--alert` 文字按鈕。底部使用量用 `--t-mono` |
| 19 | **Skeleton row** | 形狀與 index card 一致：標題條 62% 寬 × 11px、次行 40% 寬 × 9px，底 `--surface-recessed`，`--r`。微光為 1.6s 的 `x` 位移（`--ease-in-out`，`repeat: -1`），reduced-motion 下改為靜態 |
| 20 | **Status line** | rail 下方固定 28px 槽，`--surface-recessed` 底。內容 `--t-ui-sm`，以 `autoAlpha` 進出，槽本身永遠佔位以避免 CLS |
| 21 | **Format guide tabs** | 三個 tab，1px 底線 `--rule`，作用 tab 底線改 2px `--ink`。標籤 `--t-ui` |
| 22 | **Privacy manifest** | 左敘述 `--t-body`，右側逐條請求用 `--t-mono` / `--ink-2`，每條之間 1px `--rule` |
| 23 | **Keyboard help** | disclosure，兩欄定義列表。鍵位用 `--t-mono` + 1px `--rule-strong` 外框的 18px 高小方塊 |

### 5.1 圖示系統

自繪的一套 SVG，`stroke-width: 1.5`、`stroke-linecap: round`、`stroke-linejoin: round`、`viewBox="0 0 16 16"`、`currentColor`。只出現在四個地方：

1. 來源標記（3 個，12px）：ChatGPT / Claude / Gemini 各一個抽象幾何標記，同一筆畫語言，不使用各家 logo。
2. 分支切換的左右 chevron（10px）。
3. `Copy` 的兩片矩形疊合（12px）。
4. `×` 關閉（10px）。

零 emoji、零 Unicode 字元當圖示、零裝飾性圓點、零圖示欄。

---

## 6. 為了避開 AI 預設，這個專案刻意不做的三件事

### 一、不做深色模式，也不做深淺切換

每一個 AI 產出的「開發者工具」都是深色優先加上一顆太陽／月亮切換鈕。這裡不做。理由有三層：
- **場景理由**：使用場景是長時間閱讀大量文字（PRODUCT.md 時刻 B），紙灰底 + 墨色文字是為連續閱讀最佳化的，不是為截圖好看。
- **世界理由**：卡片目錄櫃是實體紙張。一個發光的深色目錄櫃不存在。
- **契約理由**：VISUAL-WORLDS.md 明訂本專案為「亮」，pinned brief 勝過任何通用預設（含 design-taste-frontend 第 6.C 節的「深色模式必做」）。

省下來的力氣全部投進單一模式的品質：Literata 的 `opsz` 光學尺寸軸真的被用上（H1 用 72、內文用 16）、內文 measure 鎖 68ch、程式碼區塊有自寫的高亮器而不是灰底黑字。

### 二、不做卡片格

整個站沒有任何「等尺寸卡片 = 圖示 + 標題 + 敘述」的區塊。`empty` 頁面的三種格式說明是三列不等寬的清單（每列左邊是格式名、右邊是它的結構特徵，寬度由內容決定）；匯出教學是分頁揭露；隱私宣告是左敘述右資料清單；統計是長條與標籤條。

唯一叫做「卡片」的東西是索引卡，因為這個產品字面上就是一座卡片目錄。它有明確的功能定義（一則對話 = 一張卡），不是懶惰容器。巢狀卡片在任何情況下都不出現。

### 三、不做圖示欄，不做圖示按鈕

每個 AI 儀表板都有一條 56px 寬、全是無標籤圖示的左側欄，靠 tooltip 補救。這裡的左抽屜用**文字**：`Anyone` / `You asked` / `Assistant said` / `Only conversations with code` / `Last 30 days`。因為目錄的本質是命名系統，一個不敢把東西叫出名字的目錄是自相矛盾的。

圖示只在第 5.1 節列出的四個位置出現，全部有文字並列或有明確的 `aria-label`。連 `Copy` 都是圖示加文字，不是只有圖示。

---

## 7. 響應式

| 斷點 | 版面 | 明確宣告 |
|---|---|---|
| ≥ 1120px | 三欄：244 / 372 / fluid。reading pane 內文 68ch 靠左，不隨欄寬拉長 | rail 單行 64px |
| 768 到 1119px | 兩欄：index 300px + reading fluid。drawer 變為覆蓋式面板，由 `Filters` 開關，開啟時後方 `inert` | rail 仍單行；搜尋框縮短，`Stats` 保留文字 |
| < 768px | 單欄堆疊導覽。預設 index；點卡片後 reading pane `x: 100% → 0` 滑入覆蓋；`Back to index` 在左上。drawer 為底部抽屜 72vh。脊條高度降到 72px | rail 可兩行但總高 ≤ 112px；index 列高 104px；H1 降到 2.25rem；投放區降到 240px；兩個 CTA 並排等寬且不換行 |

高度一律 `min-height: 100dvh`，不用 `100vh`。
所有多欄版面在 `< 768px` 的行為在同一個元件的 CSS 區塊內明確寫出，不依賴「自然會塌」。

---

## 8. 檔案結構

```
chatvault/
  index.html                  方向契約註解在 <body> 第一個子節點
  css/
    tokens.css                本文件第 2 到 4 節的全部 token，唯一顏色來源
    style.css                 版面與元件
  js/
    main.js                   ES module entry，狀態機與事件接線
    detect.js                 結構特徵偵測（ChatGPT / Claude / Gemini / fallback）
    zip.js                    自寫 ZIP 讀取（EOCD + 中央目錄 + DecompressionStream）
    zip-write.js              自寫 store-only ZIP 寫入（批次匯出用）
    stream-json.js            分片串流 JSON 陣列切割器（不整檔 JSON.parse）
    adapters/chatgpt.js       mapping 樹還原 + 分支路徑
    adapters/claude.js
    adapters/gemini.js
    adapters/generic.js       對映精靈套用
    index-build.js            分詞、倒排索引、位置串、trigram、共現矩陣
    search.js                 查詢解析、BM25、片語、篩選、延伸
    store.js                  IndexedDB schema、交易、去重合併
    vlist.js                  虛擬捲動（固定高與變動高兩種）
    highlight.js              自寫語法高亮 tokenizer
    stats.js                  統計運算
    exporter.js               Markdown / JSON / 批次
    drawer-canvas.js          招牌動效 + 脊條
    worker/parse-worker.js    解析 + 索引 + 選配 embedding
  assets/
    sample-vault.json         24 個真實技術對話，含 3 個分支
    icons.svg                 自繪 SVG sprite
  PRODUCT.md
  docs/INTERACTION.md
  docs/DESIGN-DIRECTION.md
  README.md
  DESIGN.md                   完稿審查後產出（見 FINISH）
```

---

## 9. 完稿審查清單（FINISH 的具體項目）

建置結束時逐條核對並寫進 `DESIGN.md`：

- [ ] `index.html` 在 http 服務下開啟，主控台零錯誤（含未捕捉的 promise rejection）
- [ ] 所有資源路徑相對，無任何 `/` 開頭
- [ ] 方向契約註解為 `<body>` 第一個子節點，六區塊齊全，FINISH 行逐字正確
- [ ] 招牌動效六階段完整，60fps，`prefers-reduced-motion` 下內容完整可用
- [ ] CSS 內零裸 hex，全部走 `tokens.css`
- [ ] 零 em-dash（U+2014）與作為分隔用的 en-dash（U+2013），介面與文件皆是
- [ ] 零 eyebrow、零 emoji 圖示、零裝飾圓點、零捲動提示、零版本標籤
- [ ] 一個 accent（琥珀）+ 一個語意色（警示紅），全站無第三個色相
- [ ] 一套圓角（2px），一套 1px 線系統
- [ ] 對比逐一實測：內文與 placeholder ≥ 4.5:1，大字 ≥ 3:1
- [ ] 全部狀態可觸發：hover / focus / active / loading / success / error / empty / disabled
- [ ] 鍵盤可完整操作，第 5 節的快捷鍵全部生效，focus ring 可見
- [ ] 375 / 768 / 1280 三個寬度不破版，用真實內容測試溢出
- [ ] `Load sample vault` 走完整管線，24 個對話含 3 個可切換分支
- [ ] 第 8 節失敗路徑（INTERACTION.md）15 條全部可觸發且文案逐字正確
- [ ] 從 hub 可進入，站內有 `../index.html` 回 hub 的路徑
- [ ] 搜尋在 20 萬則訊息規模下，按鍵到重排 < 120ms
- [ ] `DESIGN.md` 已寫出：unreviewed and undocumented is unfinished
