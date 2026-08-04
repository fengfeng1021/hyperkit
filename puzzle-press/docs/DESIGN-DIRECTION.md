# Puzzle Press - 設計方向

被指派的視覺世界（pinned brief，不可更改，見 `docs/VISUAL-WORLDS.md` 第 8 項）：**印刷廠**。
亮。紙白 `#F0F0EE` 家族（中性冷紙白）／印刷黑 `#111`／洋紅 `#E5007E` 為唯一 accent
（套印記號、裁切線、選取狀態）／中性灰階做機台與面板。
顯示與 UI `Familjen Grotesk`／等寬 `Courier Prime`／中文 `Noto Sans TC`。
材質語言：裁切線與出血框、套印十字標、頁面縮圖的落版排列、**圓角 0**。

---

## 1. 方向契約（六區塊全文）

以下六段逐字寫進 `index.html` `<body>` 的第一個子節點（HTML 註解）。

### THESIS

This interface argues one thing: the difference between a book that ships and a book that gets rejected is a set of numbers somebody has to get right, and this machine gets them right in front of you. Every surface decision serves that proof. The imposition floor exists so the book is countable page by page before it is a file; the press check exists so the gutter bracket, the bleed arithmetic, the uniqueness verdict and the embedded glyph count are readable side by side; the registration stamp exists so the moment of "this one is clean" has a shape. Nothing here decorates. If an element cannot be traced back to "this proves the file will pass," it is removed.

### OWN-WORLD

A print shop. Not a craft bindery, not a calligraphy studio, not paper nostalgia. The reference is the imposition sheet taped to the plate table: trim lines and bleed frames, registration crosses at the sheet edges, page thumbnails laid out in signature order, spec values written in typewriter monospace because they are measurements and not voice. Magenta is the process ink, and it is used the way a press uses it: for register marks, for crop lines, for the one selected item. It is never a mood and never a gradient. Everything else is paper, black, and the neutral grey of machine housing. Corners are square everywhere, because a printed page is a cut edge and a cut edge has no radius.

### STORY

The page opens as a bare plate table holding one empty 8.5 by 11 frame, crop marks already at its corners, and a press check on the right that is already doing arithmetic on a book that does not exist yet. That is the argument: before you have spent anything, you can see what this machine measures. The moment you press, the frame is replaced by sheets arriving one at a time, each swept in left to right as if a roller passed over it, each carrying a small solid mark that becomes a registration cross when its puzzle has been verified. For the next minute the surface is a running press: a web ruler climbs in the status bar, the stamp ring draws itself around the edge of the count. When the last sheet lands, the four corner registers fly to the centre, lock into one cross, the ring closes, and the verdict rows on the right turn over one after another. The final state is a document you can hand to somebody.

### FIRST VIEWPORT

Full height, no page scroll. A masthead 56 px tall carrying the back link, the product name, the seed field in monospace, and a reroll mark. Below it three columns: setup at 336 px, the plate table filling the middle, press check at 308 px. The plate table holds one white 8.5 by 11 sheet at up to 520 px tall, sitting on the paper-grey table with a real offset shadow, magenta crop marks at its four corners and registration crosses at its four edge midpoints. Printed on that sheet, four text elements and nothing else: the headline `一份清單進去，一本可以上架的內頁 PDF 出來。` at up to 60 px; one line reading `數獨保證唯一解，迷宮保證唯一路徑，gutter 依頁數自動套 KDP 級距。`; a filled magenta primary button beside a hairline secondary; and one honest machine line reading `引擎就緒 · 內頁字型 Atkinson Hyperlegible 尚未下載（54 KB，只下載一次）`. The setup column already carries defaults and the press check already carries eight estimated spec rows. There is no eyebrow, no section number, no scroll cue, no logo wall, no statistic block.

### FORM

One accent, locked: process magenta. Three tokens carry it and each has a stated job: `#E5007E` for marks and rules only, never text; `#C4006A` for anything magenta that carries or sits under text; `#8E004C` for pressed and stroked states. Everything else is a six-step neutral ramp from `#FFFFFF` stock through `#F0F0EE` paper to `#2A2A28` machine. Errors introduce no second hue: a row with a problem inverts to the machine colour with magenta hairlines above and below, which is what a print shop does to a bad form. Depth is a real offset shadow tinted from the ink, never a coloured halo. Radius is zero, everywhere, with no exceptions, because this world cuts its edges. Type is Familjen Grotesk for everything the interface says and Courier Prime for everything the press measures, and the split is enforced, not aesthetic: trim sizes, page counts, seeds, gutters, glyph counts and puzzle numbers are monospace; nothing else is. Spacing runs on a 4 px base with tight groups, generous separation, and more space above a heading than below it. Motion is exponential ease-out from an already-visible state, with two deliberate exceptions that are data and not decoration: the web ruler and the font download bar, which are linear because they are bound to real counts.

### FINISH

unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md

---

## 2. 色彩 token

對比比值以 WCAG 2.x 相對亮度公式實算（非估計），格式為 `前景 on 背景`。

### 2.1 表面（六階中性 ramp）

| Token | Hex | 角色 |
|---|---|---|
| `--stock` | `#FFFFFF` | **紙面**。頁面縮圖、所有輸入控制項的底。全站唯一的純白，因為使用者要用它判斷成品。 |
| `--paper` | `#F0F0EE` | 頁面底 / 落版台檯面（指派家族的基準色）。 |
| `--panel` | `#E4E4E2` | 備料台與驗印單的面板底（機台面）。 |
| `--slot` | `#D6D6D3` | 凹槽：進度軌、滑桿軌道、未生成的頁面剪影。 |
| `--rule` | `#C9C9C5` | 1px 分隔線與 leader dots。對 paper 1.46:1，是線不是文字。 |
| `--rule-strong` | `#8A8A85` | 控制項邊框。**3.04:1 on paper / 3.47:1 on stock**，符合 WCAG 1.4.11（UI 元件邊界 ≥ 3:1）。 |
| `--machine` | `#2A2A28` | 狀態列、選取的分段控制、反白警示列。 |

### 2.2 文字（三階 + disabled）

| Token | Hex | 角色 | 對比 |
|---|---|---|---|
| `--ink` | `#111111` | 標題、題號、主要數值、按鈕文字 | stock **18.88:1** / paper **16.55:1** / panel **14.83:1** |
| `--ink-2` | `#3A3A38` | 內文、標籤 | stock **11.40:1** / paper **9.99:1** / panel **8.96:1** |
| `--ink-3` | `#5C5C58` | 次要說明、meta、依據標註、**placeholder** | stock **6.72:1** / paper **5.89:1** / panel **5.27:1** / slot **4.61:1** |
| `--ink-disabled` | `#8C8C87` | **僅** disabled 標籤（WCAG 1.4.3 豁免） | paper 2.96:1，**必須同時有 45° hatch 底紋** |
| `--paper-fg` | `#F0F0EE` | 深色機台上的主要文字 | machine **12.60:1** |
| `--paper-2` | `#B9B9B5` | 深色機台上的次要文字與刻度線 | machine **7.31:1** |

彩色表面上的次要文字一律從該色相調出，不用灰色：洋紅面上用 `--magenta-ink` 或 `--ink`。

### 2.3 Accent：印刷洋紅（唯一 accent，全頁鎖定，三個 token 各有職務）

| Token | Hex | 職務 | 對比 |
|---|---|---|---|
| `--magenta` | `#E5007E` | **只用於 1 到 3px 的記號與線**：套印十字、裁切線、選取指示器、走紙填充、驗印章圓環。**永不承載文字。** | paper **3.97:1** / stock **4.53:1**（圖形，1.4.11 門檻 3:1 ✓）；machine 3.86:1 |
| `--magenta-ink` | `#C4006A` | **承載文字的洋紅**，以及主按鈕填色 | paper **5.18:1** / stock **5.91:1**；白字 on 它 **5.91:1** |
| `--magenta-deep` | `#8E004C` | `:active` 壓下、1px 描邊 | paper **8.16:1**；白字 on 它 **9.31:1** |
| `--magenta-wash` | `#FBE0EF` | 選取列底、gutter 標註帶、翻牌閃動 | `--ink` on 它 **15.30:1** / `--magenta-ink` on 它 **4.79:1** |
| `--magenta-lift` | `#FF4FA8` | **只在 `--machine` 深底上**的洋紅文字（狀態列、反白警示列） | machine **4.75:1** |

### 2.4 錯誤：不引入第二個色相

印刷廠沒有紅綠燈。錯誤的視覺語言是「這一版有問題，整版標黑」：

```
反白警示列 = 底 --machine + 文字 --paper-fg（12.60:1）
             + 上下各 1px --magenta（3.86:1 on machine，圖形 ✓）
             + 列首一個自繪的 slash 圖示（形狀冗餘，不只靠顏色）
```

`role="alert"`。成功狀態用 `--magenta` 的套印十字表示，**不引入綠色**。
全站色相總數 = **1**（洋紅），其餘全是中性階。

### 2.5 跨專案色彩隔離檢查

| 專案 | 明暗 | 主色家族 | Accent |
|---|---|---|---|
| chatvault | 亮 | 冷紙灰 `#F2F2EF` | 琥珀 `#C8901A` |
| **puzzle-press** | **亮** | **紙白 `#F0F0EE`（中性冷）** | **印刷洋紅 `#E5007E`** |

與 #6 的區隔成立：色相完全不同（琥珀 h≈43 vs 洋紅 h≈327），
材質語言不同（索引卡的邊與標籤凸出 vs 裁切線與套印十字），
字型家族不同（Literata 襯線 vs Familjen Grotesk 無襯線）。
與 #2 房貸沙盤的區隔：#2 是冷白 + 普魯士藍 + 暖橘，本站零藍零橘。

---

## 3. 字型

### 3.1 載入

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:ital,wght@0,400..700;1,400..700&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
```

三個家族都已驗證存在於 Google Fonts（規劃時實測 HTTP 200）。

### 3.2 堆疊

```css
--font-ui:   "Familjen Grotesk", "Noto Sans TC", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: "Courier Prime", "Noto Sans TC", ui-monospace, "SF Mono", Menlo, monospace;
```

`Noto Sans TC` 放在拉丁顯示字之後，包含等寬堆疊在內：
Familjen Grotesk 與 Courier Prime 都沒有 CJK glyph，若回退到系統 sans，
半句中文會掉進另一個字體。拉丁與數字仍解析到前面那個家族。

### 3.3 等寬字的使用界線（硬規則）

`Courier Prime` **只用於印刷機量到的東西**：trim 尺寸、pt 值、頁數、頁碼、gutter 值、
種子碼、題號、glyph 數、位元組數、百分比、走紙計數。

**不用於**：標題、按鈕標籤、說明文字、清單名稱、難度標籤。
這條界線是硬的。等寬字在這裡是合法的（它們是量測），不是「科技感戲服」。

Courier Prime 的 x-height 偏小，同級數下視覺比 Familjen Grotesk 小約 8%，
所以等寬字階比對應的 UI 字階大一級（`--t-mono-size: 0.875rem` 與 `--t-ui-size: 0.8125rem` 視覺等高）。

### 3.4 字階

| Token | size | line-height | letter-spacing | weight | 用途 |
|---|---|---|---|---|---|
| display | `clamp(2.25rem, 4.6vw, 3.75rem)` | 1.05 | -0.025em | 600 | H1（hero 標題），60px 上限遠低於 6rem |
| h2 | `clamp(1.375rem, 2.4vw, 1.75rem)` | 1.16 | -0.015em | 600 | 區塊標題（驗印單的「規格」「驗證」） |
| h3 | `1.0625rem` | 1.28 | -0.01em | 600 | fieldset 標題、Inspector 頁次 |
| body | `0.9375rem` | 1.58 | 0 | 400 | 說明文字 |
| ui | `0.8125rem` | 1.40 | 0.005em | 500 | 按鈕、標籤、控制項文字 |
| ui-sm | `0.75rem` | 1.35 | 0.01em | 500 | meta、依據標註、統計列 |
| mono | `0.875rem` | 1.50 | 0 | 400 | 規格值、頁數、題號 |
| mono-sm | `0.75rem` | 1.40 | 0.01em | 400 | 縮圖上的頁碼、刻度數字 |
| mono-lg | `1.0625rem` | 1.30 | 0.02em | 400 | masthead 的種子碼 |

字距下限 `-0.025em`（規範上限是 -0.04em，這裡沒有用到底）。
標題斷行用 `text-wrap: balance`。

**行寬**：`--measure: 66ch`（拉丁說明文字）、`--measure-cjk: 34em`（中文段落，約 34 字一行）。
兩者實作時以真實內容在 1280 / 768 / 375 三個寬度量測後定案，
`ch` 是 "0" 的前進寬度而不是平均字元寬，不能直接當字元數用。

**斜體**：本站只有一處用斜體（驗印單的 `▸ 為什麼不是 100？` 展開內文中的技巧名稱，
如 *naked single*）。這些詞不含 `y g j p q` 以外的降部風險，
但仍統一套用 `line-height: 1.15` 與 `padding-bottom: 0.08em` 的降部保留。

---

## 4. 間距、圓角、陰影、動效

### 4.1 間距階（4px base）

`2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 44 / 60 / 84`

節奏規則（貫穿全頁）：
- 群組**內**：`--s-4`(8) 到 `--s-5`(12)
- 群組**間**：`--s-9`(32) 到 `--s-10`(44)
- 標題**上方** `--s-10`(44)，標題**下方** `--s-6`(16)。上方是下方的 2.75 倍。
- 面板內距 `--s-7`(20)，`< 768px` 時 `--s-6`(16)

### 4.2 圓角

```css
--r: 0;
```

**一個值，零例外。** 沒有 pill 按鈕、沒有圓形頭像、沒有 8px 卡片。
理由寫在世界裡：印刷品是裁切出來的，裁切邊沒有半徑。
唯一的圓形是驗印章的圓環，那是一個 SVG 圖形（套印記號本身就是圓 + 十字），不是 UI 圓角。

### 4.3 陰影（每一個都有偏移與柔和模糊，從印刷黑調出，無零偏移光暈）

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-sheet` | `0 1px 2px rgb(17 17 17 / .10), 0 3px 10px -2px rgb(17 17 17 / .10)` | 落版台上的每一張頁面縮圖（紙離開檯面 1mm 的樣子） |
| `--shadow-sheet-hover` | `0 2px 4px rgb(17 17 17 / .12), 0 8px 20px -4px rgb(17 17 17 / .16)` | 縮圖 hover |
| `--shadow-lift` | `0 2px 6px rgb(17 17 17 / .14), 0 12px 32px -8px rgb(17 17 17 / .20)` | 清單庫抽屜 |
| `--shadow-panel` | `inset 0 1px 0 rgb(255 255 255 / .55), inset 0 -1px 0 rgb(17 17 17 / .06)` | 面板的凹陷（機台面的板金接縫） |
| `--shadow-slot` | `inset 0 1px 2px rgb(17 17 17 / .10)` | 進度軌與滑桿軌道的凹槽 |

**沒有硬偏移方塊陰影**（`4px 4px 0`）。這個世界不是 neobrutalist。

### 4.4 動效

| Token | 值 | 用途 |
|---|---|---|
| `--dur-1` | `120ms` | hover、`:active`、驗證標記閃動 |
| `--dur-2` | `200ms` | 面板切換、就地確認列、標記形狀變化 |
| `--dur-3` | `320ms` | 清單庫抽屜滑出 |
| `--dur-roll` | `240ms` | 單張縮圖的滾筒刷過（招牌動效第一拍） |
| `--dur-reg` | `640ms` | 套印收攏（第三拍） |
| `--dur-stamp` | `560ms` | 驗印章圓環畫出 |

| Token | 值 | 用途 |
|---|---|---|
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | 預設（≈ `power4.out`） |
| `--ease-roll` | `cubic-bezier(.22, .61, .36, 1)` | 滾筒刷過（≈ `power2.out`，機械等速感） |
| `--ease-stamp` | `cubic-bezier(.34, 1.4, .5, 1)` | 驗印章落下的微幅過衝 |
| `--ease-in` | `cubic-bezier(.55, 0, 1, .45)` | **只用於退場** |

**沒有 linear 當預設。** 全站只有兩處用 `ease: "none"`：走紙標尺與字型下載條，
因為它們綁在真實計數上，是資料不是動效。

`@media (prefers-reduced-motion: reduce)` 下所有 `--dur-*` 降為 `1ms`；
GSAP 側用 `gsap.matchMedia()` 直接跳過整段時間軸（見 `docs/INTERACTION.md` 6.3）。
**CSS 裡沒有任何 `opacity: 0` 或初始 `clip-path` 等 JS 來救。**

---

## 5. 元件清單與視覺規格

圖示系統：`assets/icons.svg`（SVG symbol sprite），24 × 24 viewBox，**1.5px stroke，統一端點與轉角**。
14 個：`crop-mark`、`registration`、`reroll`、`drawer`、`sheet`、`stack`、`check`、`slash`、
`copy`、`download`、`cancel`、`plus`、`minus`、`chevron`。
**禁 emoji、禁 Unicode 字元當圖示。**

| # | 元件 | 視覺規格 |
|---|---|---|
| 1 | Masthead | h 56px，底 `--paper`，下緣 1px `--rule`。三段：返回連結（hairline 按鈕）／產品名（`--t-h3`）／右側種子組。 |
| 2 | SeedField | 白底 + 1px `--rule-strong`，h 32px，內距 8px。左側 8px 洋紅 `registration` 圖示，內容 `--t-mono-lg`，右側 `copy` 與 `reroll` 兩個 24px 圖示按鈕。 |
| 3 | SetupRail | w 336px，底 `--panel` + `--shadow-panel`，右緣 1px `--rule`。內距 20px。四個 `<fieldset>`，各以 `<legend>`（`--t-h3`）起頭，之間 1px `--rule` 分隔，上下留白 32px。 |
| 4 | PuzzleTypeSelect | 三段控制，共用外框 1px `--rule-strong`，h 36px，等分。選中段：底 `--machine`，字 `--paper-fg`，左上角 6px `--magenta` 直角標記。 |
| 5 | CountStepper | 中央 `<input>` w 80px 白底等寬置中，左右各 32×32 方形按鈕（`minus` / `plus`），共用外框。下方 `--t-mono` `--ink-2` 的即時頁數回饋。 |
| 6 | WordListInput | `<textarea>` 白底 1px `--rule-strong`，h 160px，`--t-mono` `0.8125rem`（單字清單是資料）。下方統計列 `--t-mono-sm`。 |
| 7 | ListLibraryDrawer | w 380px，底 `--stock`，`--shadow-lift`，左緣 1px `--rule-strong`。頂部 44px 分頁列，底部 44px 固定動作列。列高 68px，1px `--rule` 分隔。 |
| 8 | ListRow | 三行：名稱（`--t-ui` 600）／meta（`--t-ui-sm` `--ink-3`）／問題行（僅在有 `tooLongWords` 時，`slash` 圖示 + `--ink-2`）。選中：底 `--magenta-wash` + 左緣 3px `--magenta`。 |
| 9 | ThemeListPicker | 同抽屜的第二分頁。列高 52px，兩行。checkbox 是 16px 方形，選中時填 `--magenta-ink` + 白色 `check`。 |
| 10 | TrimSelect | 兩張實際比例版框，h 56px，1px `--rule-strong`，內部 `--stock`。四角 6px `crop-mark`（`--magenta`），選中時 2px 框 + 角標長 10px。 |
| 11 | ToggleSwitch | **方形**，28 × 16px 軌道（`--slot` + `--shadow-slot`），12px 方形把手（`--stock` + 1px `--rule-strong`）。開啟時軌道 `--magenta-ink`，把手移到右端。無圓角。 |
| 12 | DifficultySlider | 軌道 h 4px `--slot` + `--shadow-slot`，5 個 1px `--rule-strong` 刻度線。把手 12 × 16px 方形 `--ink`（hover `--magenta-ink`，active `--magenta-deep`）。下方說明區固定 3 行高（避免 CLS）。 |
| 13 | FontPicker | 三列，各 64px。左側樣張 `Aa 1234`（`--t-h3`，該字型渲染），右側狀態文字 `--t-ui-sm`。選中：底 `--magenta-wash` + 左緣 3px `--magenta`。 |
| 14 | PressButton | 整寬，h 52px，填 `--magenta-ink`，字 `--stock` `--t-ui` 600，字距 0.08em（`開 印` 兩字之間全形空格）。sticky bottom。 |
| 15 | ImpositionSheet | flex 1，底 `--paper`，內距 32px（`<768px` 16px）。頂部 36px 分區標籤列（sticky）。 |
| 16 | EmptyFrame | 實際比例白紙面，`max-height: min(62vh, 520px)`，`--shadow-sheet`。四角 L 形 1px `--magenta` 裁切線（長 16px，離角 8px），四邊中點 12px `registration` 十字。 |
| 17 | PageThumb | 比例鎖 trim。白紙面 + `--shadow-sheet`。內容是 `<canvas>`（`aria-hidden`）。右下角 8px 驗證標記。hover：`--shadow-sheet-hover` + `translateY(-2px)`。 |
| 18 | PageInspector | 就地取代矩陣。頂部 44px 返回列。頁面居中最大化。四層標註：trim 1px `--magenta` 實線、bleed 1px `--magenta` 虛線 3-3、gutter `--magenta-wash` 填色帶、安全區 1px `--rule-strong` 虛線。引線 1px `--ink-3` + 3px 方點 + `--t-mono-sm` 標註文字。 |
| 19 | PressCheckPanel | w 308px，底 `--panel` + `--shadow-panel`，左緣 1px `--rule`。內距 20px。 |
| 20 | RegistrationStamp | 56px SVG。圓環 `stroke-width: 1.5`，十字 `stroke-width: 1`，中心 `--t-mono-sm` 頁數。 |
| 21 | SpecRow | 兩欄 grid `1fr auto`，依據佔滿跨欄的第二行。名稱 `--t-ui` `--ink-2`；名稱與值之間 `border-bottom: 1px dotted var(--rule)` 的 leader；值 `--t-mono` `--ink` 右對齊；依據 `--t-ui-sm` `--ink-3` 佔滿第二行。 |
| 22 | VerdictRow | 同 SpecRow，值前多一個 16px 的 `check` / `slash` 圖示。 |
| 23 | AlertRow | 底 `--machine`，字 `--paper-fg`，上下各 1px `--magenta`，內距 12px 16px。列首 16px `slash` 圖示（`--magenta-lift`）。內含的按鈕是 1px `--magenta-lift` 外框 + 透明底 + `--paper-fg` 字。 |
| 24 | WebRuler | h 40px 狀態列內，w 240px。底 `--machine`，1px `--paper-2` 的 10 段刻度，填充 `--magenta`（h 6px）。右端 `--t-mono` `--paper-fg` 計數。 |
| 25 | TallyStrip | `--t-ui-sm` `--paper-2`，數字部分 `--t-mono-sm` `--paper-fg`。 |
| 26 | RunLedger | `<details>`，展開後 8 列，列高 44px。每列：書名 / 種子（`--t-mono-sm`）/ 頁數 / 結果圖示。hover 顯示 `[用同樣規格換種子]`。 |
| 27 | Toast | 右下，w 320px，底 `--machine`，字 `--paper-fg`，`--shadow-lift`，3.5s 自動消失。**僅用於暫態確認**（種子已複製、清單已儲存）。所有需要決定的事都用就地確認列，不用 toast。 |
| 28 | InlineConfirm | 就地確認列。底 `--magenta-wash`，上下 1px `--magenta`，內距 12px。3 秒無操作自動取消。**取代全站所有 modal 與 `confirm()`。** |

**modal 的使用：零。** 沒有任何一個任務需要中斷或保護焦點。
抽屜是覆蓋不是 modal（可以一邊看落版台一邊挑清單），Inspector 是就地取代。

---

## 6. 為了避開 AI 預設，刻意不做的三件事

### 6.1 不做「三張等寬功能卡」，也不做任何行銷區塊

這個介面**沒有 section**。沒有 feature grid、沒有 pricing table、沒有 FAQ 手風琴、
沒有 testimonial、沒有「它如何運作」的三步驟。整個頁面是一台機器，高度固定 `100dvh`。

代價是它看起來不像一個「網站」。這正是目的：買家不是來讀的，是來出書的。
**證明放在驗印單裡，不放在卡片裡。** 驗印單是三欄 grid 的資料列，不是圖示加標題加敘述的容器。

（順帶取消的還有：eyebrow、章節編號 01/02/03、hero 大數字統計、scroll cue、
底部裝飾文字條、locale 時間條、版本標籤、假截圖。全部零出現。）

### 6.2 不做圓角、不做柔陰影卡片、不做玻璃模糊

`--r: 0`，零例外。深度只有兩種來源：
1px 實線（機台的板金接縫與版框），與**紙張離開檯面**的投影（有偏移、有柔和模糊、從印刷黑調出）。

沒有 `backdrop-filter`、沒有半透明玻璃層、沒有零偏移的彩色光暈。
`blur` 在全站只出現一次，是招牌動效第三拍的 1.2px 景深，**用來把焦點推向驗印章**，
0.64 秒內進出，不是常駐裝飾。

### 6.3 不用進度環、不用 sparkline、不用彩色狀態點

進度是一把**有刻度的走紙標尺**（線性、有 10 段刻度、右端是實數計數），
不是圓環也不是柔陰影圓角矩形。

狀態用**形狀**區分，不只用顏色：
未驗證 = 3px 實心方塊，已驗證 = 8px 套印十字，未達標 = 斜線 hatch。
色盲使用者、單色列印、截圖壓縮之後都仍然可辨。

**沒有任何彩色狀態圓點**（nav 前面、列表前面、標籤前面）。
錯誤不用紅色（見 2.4），成功不用綠色。全站色相總數 = 1。

---

## 7. 交付前的機械檢查

| 檢查 | 通過條件 |
|---|---|
| 裸 hex | `css/style.css` 與 `js/` 內零裸 hex，顏色全部走 `var(--*)` |
| 對比 | 內文與 placeholder ≥ 4.5:1；大字與 UI 元件邊界 ≥ 3:1；已逐一列於第 2 節 |
| 圓角 | 全站 `border-radius` 只出現 `var(--r)`，值為 0 |
| 等寬字界線 | `--font-mono` 只出現在量測值上，不出現在標題、按鈕、說明 |
| 破折號 | 全站可見文字零 em-dash（U+2014）與 en-dash（U+2013）。範圍一律用半形連字號，句子一律拆開或用逗號 |
| eyebrow | 零。全站 `text-transform: uppercase` + 大字距的小標籤數量 = 0 |
| 色相 | 除中性階外只有洋紅一個色相 |
| 相對路徑 | 所有 `href` / `src` / `import` 為 `./` 或 `../` 開頭 |
| 預設可見 | CSS 內零 `opacity: 0` 與零初始 `clip-path` 等 JS 救援 |
| GSAP plugin | 只載入 `gsap.min.js`，零 plugin |
| 主控台 | 375 / 768 / 1280 三個寬度，完整跑一次流程，零錯誤零警告 |
| 鍵盤 | 不用滑鼠可完成：載入範例 → 開印 → 開 Inspector → 匯出 PDF |
| reduced motion | 開啟後功能完全相同，只是沒有過場 |
