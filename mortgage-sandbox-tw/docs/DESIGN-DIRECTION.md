# 設計方向 / DESIGN-DIRECTION

指派世界：`VISUAL-WORLDS.md` 第 2 號「房貸沙盤」。pinned brief，未執行 concept-seed，未偏離。

---

## 1. 方向契約六區塊（逐字寫入 `index.html` `<body>` 第一個子節點）

```html
<!--
DIRECTION CONTRACT / mortgage-sandbox-tw

THESIS
這個工具唯一的產品是「可被追問的計算」。使用者不是來看漂亮圖表，是來決定一筆七位數的錢往哪走。
因此畫面上每一個數字都必須能被點開，看到公式本身、看到代入值、看到出處，或看到「這是假設不是資料」
的誠實標示。介面的工作是讓一個沒有財務背景的人，在 20 分鐘內親手把結論翻轉一次，並且相信那個翻轉。
競品給答案，這裡給的是「答案對哪些假設敏感」的地圖。可信度來自算式攤開，不來自視覺說服。

OWN-WORLD
工程製圖圖紙。整頁是一張雙層方格紙（8px 細格 / 40px 粗格，1px hairline），座標軸是 hairline，
標註走製圖的引線與標註框，所有金額、利率、年期一律 JetBrains Mono 等寬對齊、tabular-nums。
冷白 #F7F9FC 底，普魯士藍 #12305C 三個明度階作為結構與資料，暖橘 #E86A2B 是全站唯一訊號色，
只出現在交叉點、結論句與領先標記。三條路徑不用彩虹配色，用同一色相的三個明度階加三種線型分辨，
色盲與黑白列印下依然成立。可信度來自「這是被畫出來、被量測過的」，不是「這很漂亮」。

STORY
首屏是一張已經畫好座標軸但還沒有標註的圖紙：x 軸有完整 30 年刻度，y 軸留白，圖面中央一條製圖尺寸線
寫著「這張圖還沒有數字」。按下「載入範例情境」，三條曲線由左往右畫出來（0.9 秒），數字滾進標題欄。
抓住時間軸把手往右拖，曲線端點跟著跑、三組讀數同步滾動；拖到投資曲線越過提前還款曲線的那一格，
交叉點爆出環形波、往上長出引線、展開標註框逐字打出「第 11 年 3 個月，投資開始領先」，
右側區域被橘色淡塊由左往右擦滿。把報酬率滑桿往下拉，整段標註反向收回、交叉點沿曲線滑到更晚的年份
重新爆開。結論在你手上翻轉的那一秒，就是這個產品的論點。

FIRST VIEWPORT
頂部 56px 單行導覽（字標、返回 hyperkit、複製分享連結）。其下 5/7 分割：左側是製圖標題欄
（title block），內含標題兩行、副文 18 字一行、主動作「載入範例情境」與次動作「用我自己的數字」，
hero 文字元素共 4 個，無 eyebrow、無 trust strip、無 scroll cue；右側 7 欄是淨資產圖的上緣、
完整 30 年 x 軸、空狀態的尺寸線標註、時間軸 scrubber 與三條線型的 legend。
1280x800 下主動作不需捲動即可按到。<768px 改為標題欄在上、圖表在下（高 320px），主動作仍在首屏。

FORM
方格紙底 8px 細格 / 40px 粗格 1px hairline。圓角三階且各有其職：資料面與表格 0px、控制項 2px、
抽屜與情境卡 4px。陰影一律帶偏移與柔和模糊，色相調成冷藍，零偏移彩色光暈禁止。
字型 Schibsted Grotesk（顯示）+ Noto Sans TC（中文）+ JetBrains Mono（所有數值）。
間距以 8px 為節拍，標題上方空間永遠大於下方。全頁沒有卡片牆、沒有 eyebrow、沒有漸層文字、
沒有玻璃模糊、沒有等寬字當科技感戲服（等寬只用於金額、利率、年期、公式）。

FINISH
unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->
```

---

## 2. 色彩 token

明暗：**亮**。由使用場景決定，不是由品類決定：白天或傍晚，桌機，坐下來研究一筆七位數的決策，需要長時間閱讀數字。圖紙本來就是白的。

**本專案不提供深色模式**，因為 `VISUAL-WORLDS.md` 已把明暗鎖定為亮，且六個子專案的明暗必須互不重疊。`html { color-scheme: light; }` 明確宣告，避免瀏覽器把原生表單控制項換成深色版本。

### 2.1 表面

| token | hex | 角色 | 對比（vs 內文 `--ink-700`） |
|---|---|---|---|
| `--paper` | `#F7F9FC` | 頁面底色。冷白，非米白 | 12.42:1 |
| `--paper-sunk` | `#EEF2F8` | 凹陷面：輸入井、滑桿軌、表格交替列、hover 底 | 11.66:1 |
| `--paper-raised` | `#FFFFFF` | 抬升面：抽屜、情境卡、標註框、toast 內卡 | 13.10:1 |

### 2.2 墨階（普魯士藍單一色相，八階）

| token | hex | 角色 | vs `--paper` | vs `--paper-raised` |
|---|---|---|---|---|
| `--ink-900` | `#0B2140` | 標題、讀數大字、toast 底 | **15.25:1** | 16.08:1 |
| `--ink-700` | `#12305C` | 內文、主要按鈕底、路徑 A 曲線、focus ring 外環 | **12.42:1** | 13.10:1 |
| `--ink-600` | `#1D4176` | 表格數值、hover 態文字 | **9.62:1** | 10.15:1 |
| `--ink-500` | `#2E5C96` | 次要文字、欄位 label、軸刻度數字、路徑 B 曲線 | **6.45:1** | 6.80:1 |
| `--ink-400` | `#46688F` | 三級文字、預設值顯示、來源標示 | **5.47:1** | 5.77:1 |
| `--ink-300` | `#4E80B8` | **控制項邊界**、路徑 C 曲線、圖示描邊、disabled 文字 | **3.90:1** | 4.11:1 |
| `--ink-200` | `#A9C1E0` | 純裝飾：情境卡縮圖底線、非資訊性分隔 | 1.75:1 | 1.84:1 |
| `--ink-100` | `#DCE4EF` | 純裝飾：最淺的填充 | 1.22:1 | 1.28:1 |

**規則**：`--ink-300` 是可承載資訊的最淺一階（非文字 UI 元件需 >= 3:1，它是 3.90:1）。`--ink-200` 與 `--ink-100` 只能用在移除後不損失任何資訊的地方。任何文字都不得使用這兩階。

### 2.3 圖紙結構

| token | hex | 角色 |
|---|---|---|
| `--grid-fine` | `#E7EDF6` | 8px 細格線，1px |
| `--grid-major` | `#D5DEEC` | 40px 粗格線，1px |
| `--rule` | `#C3D0E3` | 裝飾性 hairline：區塊分隔、表格每 5 列分隔、頁尾線 |

`--rule` 對比 1.48:1，因此**不得**用作互動元件的邊界（那需要 >= 3:1，用 `--ink-300`）。它只做視覺分節。

### 2.4 訊號色（唯一 accent，橘）

| token | hex / 值 | 角色 | 對比 |
|---|---|---|---|
| `--signal` | `#E86A2B` | 圖形標記：交叉點圓、環形波、引線、標註框外框、已改動標記、線上垂直標線 | 3.05:1 vs paper（非文字，>= 3:1 通過） |
| `--signal-ink` | `#B8480F` | **文字**版本：結論句的強調段、錯誤訊息、範例情境標記文字 | **5.01:1** vs paper，5.29:1 vs white |
| `--signal-wash` | `rgba(232,106,43,.09)` | 交叉點右側的「這之後投資贏」淡塊 | 裝飾層 |
| `--signal-tint` | `rgba(232,106,43,.08)` | clamped 欄位閃爍、drop-valid 目標格 | 裝飾層 |

**鎖定規則**：橘色在全站只出現在三種情況：(1) 交叉點與其標註，(2) 結論句被強調的數字，(3) 「這個值被你改過」的標記。導覽、按鈕、連結、legend、表格一律沒有橘色。第 7 個 section 不會冒出第二個 accent。

**沒有紅綠**。領先與落後不用紅綠表示（會破壞單一 accent 鎖定，且色盲不友善）。領先用橘色標記加 500 字重，落後用一般字重加前置 `-`。錯誤狀態用 `--signal-ink` 加底部 2px 底線，不用紅色、不用 border-left。

### 2.5 三條路徑曲線

| 路徑 | token | hex | 線寬 | 線型 | 對比 |
|---|---|---|---|---|---|
| A 全額提前還款 | `--path-a` | `#12305C` | 2.5px | 實線 | 12.42:1 |
| B 只繳月付，差額投資 | `--path-b` | `#2E5C96` | 2px | dash `8 4` | 6.45:1 |
| C 寬限期 + 投資 | `--path-c` | `#4E80B8` | 2px | dash `2 4`，`stroke-linecap: round`（點線） | 3.90:1 |

蒙地卡羅扇形：`--fan-stroke: rgba(46,92,150,.045)`，1000 條疊加。P10 / P90 邊界 `--ink-300` 1px dash `4 4`；P50 `--ink-500` 1px 實線。

---

## 3. 字型與字階

### 3.1 字族

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+TC:wght@400;500;700&family=Schibsted+Grotesk:wght@400;500;700;800&display=swap">
```

| token | 堆疊 | 用途 |
|---|---|---|
| `--ff-display` | `"Schibsted Grotesk", "Noto Sans TC", system-ui, sans-serif` | 頁面標題、區塊標題、按鈕標籤 |
| `--ff-text` | `"Noto Sans TC", "Schibsted Grotesk", system-ui, sans-serif` | 所有中文內文、label、helper |
| `--ff-mono` | `"JetBrains Mono", ui-monospace, SFMono-Regular, monospace` | **只用於**金額、利率、年期、月份、公式、seed、CSV 欄位。不當科技感戲服 |

中文與拉丁混排時 `--ff-text` 讓 Noto Sans TC 在前，因為中文是主體；純數字容器一律切到 `--ff-mono` 並加 `font-variant-numeric: tabular-nums`，讓數字滾動時不抖動。

### 3.2 字階

| token | rem | px | 用途 |
|---|---|---|---|
| `--fs-3xs` | 0.6875 | 11 | **僅限** 座標軸刻度數字、mono 單位後綴、範例標記。不得用於句子 |
| `--fs-2xs` | 0.75 | 12 | legend、抽屜來源行、表格微標籤 |
| `--fs-xs` | 0.8125 | 13 | 欄位 label、helper、鍵盤提示 |
| `--fs-sm` | 0.875 | 14 | 表格內文、抽屜內文、情境卡數值 |
| `--fs-base` | 1 | 16 | 內文 |
| `--fs-md` | 1.125 | 18 | 首屏副文、結論句、輸入框內的值 |
| `--fs-lg` | 1.375 | 22 | 區塊標題（參數台、假設明細表等） |
| `--fs-xl` | 1.75 | 28 | 三路徑讀數 |
| `--fs-2xl` | 2.25 | 36 | 結論列的主要金額 |
| `--fs-display` | `clamp(2rem, 1.2rem + 3.4vw, 3.5rem)` | 32 → 56 | 頁面標題，唯一一次。上限 3.5rem，遠低於 6rem 天花板 |

### 3.3 字重、字距、行高

| token | 值 | 說明 |
|---|---|---|
| `--fw-regular` | 400 | 內文 |
| `--fw-medium` | 500 | label、強調段、選中態 |
| `--fw-bold` | 700 | 區塊標題、讀數 |
| `--fw-black` | 800 | 頁面標題（僅 Schibsted Grotesk） |
| `--ls-display` | -0.03em | 頁面標題。字距下限 -0.04em，這裡留了餘裕 |
| `--ls-heading` | -0.015em | 區塊標題 |
| `--ls-body` | 0 | 中文不加字距 |
| `--ls-mono` | -0.01em | 等寬數值，讓長金額不過寬 |
| `--lh-tight` | 1.12 | 頁面標題 |
| `--lh-snug` | 1.3 | 區塊標題、結論句 |
| `--lh-body` | 1.75 | 中文內文（中文需要比拉丁更鬆的行距） |
| `--lh-data` | 1.2 | mono 讀數 |
| `--measure` | 34em | 中文內文行寬上限，約 34 個全形字，換算約 68ch，落在 65 到 75ch 區間內 |
| `--measure-narrow` | 26em | 抽屜、helper 等窄欄內文 |

字重階梯明顯：400 / 500 / 700 / 800 四階，相鄰階差 >= 100，視覺上分得開。級距階梯在 14 / 16 / 18 / 22 / 28 / 36 / 56，每階至少 1.14 倍。

標題斷行：`text-wrap: balance`（標題）與 `text-wrap: pretty`（內文）。頁面標題手動插 `<br>` 的斷點只在 >= 900px 生效，以 `<span class="brk">` 加 media query 控制，避免小螢幕斷在奇怪的地方。

**斜體**：全站不使用斜體顯示字。中文無真斜體，Schibsted Grotesk 的斜體在此無用途。因此不涉及降部裁切問題。

---

## 4. 間距、圓角、陰影、線寬

### 4.1 間距階（8px 節拍，對齊方格紙）

| token | 值 | 用途 |
|---|---|---|
| `--sp-1` | 4px | 圖示與文字之間、單位後綴 |
| `--sp-2` | 8px | 群組內元素間距（label 到 input） |
| `--sp-3` | 12px | 按鈕內距（垂直）、表格 cell padding |
| `--sp-4` | 16px | 群組內較大間距、卡片內距 |
| `--sp-5` | 24px | 群組之間 |
| `--sp-6` | 32px | 子區塊之間、標題下方 |
| `--sp-7` | 48px | 區塊內欄距 |
| `--sp-8` | 64px | **標題上方**、區塊之間（行動） |
| `--sp-9` | 96px | 區塊之間（桌機） |
| `--sp-10` | 128px | 頁首與頁尾的呼吸 |

**節奏規則（貫穿全頁）**：
- 群組內：`--sp-2`；群組之間：`--sp-5`；子區塊之間：`--sp-6`；區塊之間：桌機 `--sp-9`、行動 `--sp-8`。
- **標題上方永遠大於下方**：區塊標題 `margin-block: var(--sp-8) var(--sp-4)`（64 / 16，比例 4:1）。子標題 `margin-block: var(--sp-6) var(--sp-3)`（32 / 12）。
- 版心：`--container: 1240px`，左右內距桌機 `--sp-7`、平板 `--sp-5`、行動 `--sp-4`。

### 4.2 圓角（三階，各有其職，全站遵守）

| token | 值 | 適用對象 |
|---|---|---|
| `--r-flat` | 0 | 圖表繪圖面、座標軸、方格底紋、表格 cell、legend 線段、scrubber 軌 |
| `--r-ctl` | 2px | 所有互動控制項：按鈕、輸入框、滑桿 thumb、分段切換、開關、chip 刪除鈕、toast |
| `--r-panel` | 4px | 浮起的面：抽屜、情境卡、標註框（annotation pill）、快捷鍵 dialog |

規則被寫死成一句話：**資料是直角，控制是 2px，浮起的面是 4px。** 沒有第四種圓角，沒有 pill 全圓角。

### 4.3 陰影（冷藍調，皆有偏移與柔和模糊）

| token | 值 |
|---|---|
| `--sh-hairline` | `0 0 0 1px rgba(18,48,92,.10)` |
| `--sh-1` | `0 1px 2px rgba(11,33,64,.07), 0 0 0 1px rgba(18,48,92,.09)` |
| `--sh-2` | `0 6px 16px -4px rgba(11,33,64,.14), 0 1px 3px rgba(11,33,64,.08)` |
| `--sh-3` | `0 18px 40px -12px rgba(11,33,64,.22), 0 3px 8px rgba(11,33,64,.10)` |
| `--sh-focus` | `0 0 0 2px var(--paper), 0 0 0 4px var(--ink-700)` |
| `--sh-focus-sunk` | `0 0 0 2px var(--paper-sunk), 0 0 0 4px var(--ink-700)` |

零偏移的彩色光暈不存在於這個 token 表。每一層都有 y 位移與模糊半徑，陰影色相是背景的冷藍（`rgba(11,33,64,...)`），不是純黑。

### 4.4 線寬與圖紙格線

| token | 值 |
|---|---|
| `--hair` | 1px |
| `--grid-pitch-fine` | 8px |
| `--grid-pitch-major` | 40px |
| `--stroke-icon` | 1.25 |
| `--axis-w` | 1px |
| `--plot-h` | `clamp(320px, 46vh, 520px)` |

方格底紋以 `repeating-linear-gradient` 實作，兩層疊加（細格在下、粗格在上），`background-attachment: local`，並在 `@media (prefers-reduced-transparency)` 或列印時降到只留粗格。

### 4.5 動效 token

| token | 值 | 用途 |
|---|---|---|
| `--t-tap` | 90ms | `:active` 的按下位移 |
| `--t-ui` | 160ms | hover、focus、色彩過場 |
| `--t-move` | 300ms | 抽屜展開、分段指示塊滑動、卡片吸附 |
| `--t-reveal` | 560ms | 曲線繪入的單條時間 |
| `--t-signature` | 1180ms | 招牌動效時刻總長 |
| `--e-out` | `cubic-bezier(.16,1,.3,1)` | 預設。指數型 ease-out，從已可見狀態出發 |
| `--e-out-soft` | `cubic-bezier(.25,.8,.35,1)` | 較溫和的 out，用於色彩與陰影 |
| `--e-inout` | `cubic-bezier(.7,0,.3,1)` | 只用於「交叉點沿曲線滑到新位置」這種兩端都靜止的位移 |

GSAP 對應：`--e-out` ≈ `power4.out`、`--e-out-soft` ≈ `power2.out`、`--e-inout` ≈ `power3.inOut`。**線性緩動不作為預設**，只在蒙地卡羅進度條這種真的等速的地方出現。

---

## 5. 元件清單與視覺規格

編號對應實作檔案中的 class 前綴。

### 5.1 `sheet` 圖紙底層
整頁的 `<body>` 背景。兩層 `repeating-linear-gradient`：細格 `--grid-fine` 1px / 8px，粗格 `--grid-major` 1px / 40px。格線原點對齊版心左緣，讓內容真的落在格上。列印時只留粗格。

### 5.2 `nav` 導覽列
高 56px（上限 80px 內），sticky，底 `rgba(247,249,252,.92)` + `backdrop-filter: blur(6px)`（這是為了讓格線在捲動時不干擾導覽文字的**特定效果**，不是裝飾），下緣 1px `--rule`。單行三個元素：字標（`--ff-display` 700 16px `--ink-900`）、返回 hyperkit（`--fs-xs` `--ink-500`）、複製分享連結（`.btn--quiet`）。桌機不換行，行動裝置縮字標為「沙盤」。

### 5.3 `titleblock` 製圖標題欄
藍圖的 title block：外框 1px `--ink-300`，內部以 1px `--rule` 分成三格（標題格、副文格、動作格）。這是全頁唯一有外框的文字區塊，因為它就是圖框的標題欄。
- 標題：`--ff-display` 800，`--fs-display`，`--ink-900`，`--ls-display`，`--lh-tight`，最多 2 行。
- 副文：`--ff-text` 400，`--fs-md`，`--ink-500`（6.45:1），18 字內一行。
- 動作格：`.btn--primary` + `.btn--quiet` 並排，桌機不換行。
- 右上角範例標記：1px `--signal` 外框，`--r-ctl`，內含 `--ff-mono` `--fs-3xs` `--signal-ink` 的「範例情境」。

### 5.4 `plot` 淨資產圖
`<svg>` 疊在 `<canvas>` 之上。canvas 畫 1000 條蒙地卡羅（`--fan-stroke`），SVG 畫座標軸、三條主曲線、游標線、交叉點標註。
- 繪圖面圓角 `--r-flat`，左與下各一條 1px `--ink-300` 座標軸（軸是資訊，需 3:1）。
- y 軸刻度：每 500 萬一格，label `--ff-mono` `--fs-3xs` `--ink-500`，格線 `--grid-major` 1px。
- x 軸刻度：每年 4px 短刻度，每 5 年 10px 長刻度加年份。
- `role="img"`，`<title>` `<desc>` 即時更新，旁附 `.sr-only` 資料表。

### 5.5 `legend` 圖例
三列，每列：24px 長的**真實線型樣本**（實線 / dash 8 4 / dash 2 4）+ 路徑名 `--fs-2xs` `--ink-600` + 該路徑第 30 年金額 `--ff-mono`。空狀態時線段降到 `--ink-300`。按 `1` `2` `3` 高亮時，對應列加 1px `--ink-700` 外框。

### 5.6 `scrubber` 時間軸游標
軌高 32px，`--paper-sunk` 底、上下 1px `--rule`。handle 14x28 實心 `--ink-700`，`--r-ctl`，`--sh-2`，中央兩根 1px `--paper` 縱紋。游標線 1px `--ink-500` dash `2 3` 貫穿圖面。狀態見 `INTERACTION.md` §2.5。

### 5.7 `readout` 三路徑讀數
三欄，每欄：路徑名（`--fs-2xs` `--ink-500`）+ 金額（`--ff-mono` `--fs-xl` `--ink-900` tabular-nums）+ 與路徑 A 的差額（`--ff-mono` `--fs-xs`，領先為 `--signal-ink` 500 字重，落後為 `--ink-500` 400 字重加前置 `-`）。欄與欄之間 1px `--rule` 垂直分隔，不是卡片。

### 5.8 `numfield` 數值輸入
label 在上（`--fs-xs` `--ink-500`），輸入框（底 `--paper-raised`，1px `--ink-300`，`--r-ctl`，值 `--ff-mono` `--fs-md` `--ink-900`），右側單位後綴（`--ff-mono` `--fs-3xs` `--ink-500`），下方 helper（`--fs-xs` `--ink-400`，5.47:1）。狀態見 `INTERACTION.md` §2.3。

### 5.9 `slider` 製圖滑桿
軌 2px `--paper-sunk` + 上緣 1px `--rule`；刻度線每 5 單位 4px、主刻度 8px 加數字；fill 2px `--ink-700`；thumb 12x12 實心 `--ink-700` `--r-ctl` `--sh-1`；thumb 上方 20px 處即時數值（`--ff-mono` `--fs-sm` `--ink-900`）。原生 `<input type="range">` 加樣式。

### 5.10 `segment` 分段切換
外框 1px `--ink-300`，`--r-ctl`，內部 1px `--ink-300` 分隔。選中項底 `--ink-700` 字 `--paper`（13.10:1），選取塊用 GSAP Flip 滑動 0.26s `power3.out`。`role="radiogroup"`。

### 5.11 `switch` 開關（採列舉扣除、計入轉貸成本）
36x20 軌，`--r-ctl`（不是 pill，這裡是製圖的撥桿不是 iOS 開關）：關 = 底 `--paper-sunk` + 1px `--ink-300`，開 = 底 `--ink-700`。滑塊 16x16 `--paper-raised` `--sh-1`，位移 300ms `--e-out`。label 在右側。

### 5.12 `drawer` 這個數字怎麼來的
原生 `<details>`。summary 是 12x12 方框內含引線問號圖示。展開內容：底 `--paper-raised`，1px `--ink-300`，`--r-panel`，`--sh-2`，上緣一條 2px x 8px 的 `--signal` 引出線起點標記（不是彩色 border-left）。三段：公式（`--ff-mono`，底 `--paper-sunk`，`--r-flat`，可選取）／代入值（變數名左、值右對齊，皆 mono）／來源（`--fs-2xs` `--ink-400`）。

### 5.13 `pill` 交叉點標註框
底 `--paper-raised`，1px `--signal`，`--r-panel`，`--sh-2`，內距 `--sp-2` `--sp-3`。文字 `--fs-sm` `--ink-900`，其中年月為 `--ff-mono` 500。底部有一個 6px 的三角形指向引線，用 SVG `polygon` 繪製。

### 5.14 `chip` 情境卡
底 `--paper-raised`，1px `--ink-300`，`--r-panel`，`--sh-1`。內容：名稱（可就地編輯，`--fs-sm` 500）、三個第 30 年金額（`--ff-mono` `--fs-sm` 右對齊）、交叉年月、48x24 的三線縮圖（真實資料，非裝飾）。全頁唯一的卡片。

### 5.15 `btn` 按鈕（三階）
- `--primary`：底 `--ink-700`，字 `--paper`（13.10:1），`--r-ctl`，padding `--sp-3` `--sp-5`，`--sh-1`。
- `--quiet`：透明底，1px `--ink-300`，字 `--ink-700`。
- `--bare`：純文字連結樣式，字 `--ink-600`，hover 加 1px 底線（`text-underline-offset: 3px`）。
桌機一律不換行（`white-space: nowrap`），標籤最多 5 個中文字。同一意圖全站只有一種標籤。

### 5.16 `verdict` 結論列
滿版單行陳述句，`--fs-md` `--lh-snug` `--ink-700`，最大寬 `--measure`。強調段 `--signal-ink` 500 字重（不是漸層、不是螢光筆底）。右側兩個 `.btn--bare` 導流連結，附 `--fs-2xs` `--ink-400` 的「推薦連結」標示。上下各一條 1px `--rule`。

### 5.17 `ledger` 假設明細表
製圖的 schedule 排版：三欄（假設名 / 值 / 來源），每列高 44px，**不在每列畫線**，每 5 列一條 1px `--grid-major`。值欄 `--ff-mono` 右對齊。每列末端一個 `drawer` 觸發器。

### 5.18 `sheet-table` 攤還表
表頭 sticky，下緣 1px `--ink-300`。列不畫線，每 5 列一條 1px `--grid-major`，交替底色 `--paper` / `--paper-sunk`。數字 mono、tabular-nums、右對齊。hover 該列時圖上對應 x 浮出 1px `--signal` 標線。

### 5.19 `toast` 訊息條
底 `--ink-900`，字 `--paper`（16.08:1），`--r-ctl`，`--sh-3`，最大寬 340px，右下角。`role="status"` 或 `role="alert"`。

### 5.20 `icons` 圖示系統
取自 **Tabler Icons**（MIT），內聯為 `assets/icons.svg` 的 `<symbol>` sprite，統一覆寫 `stroke-width: 1.25`、`stroke-linecap: square`、`stroke-linejoin: miter`，讓它符合製圖的方角語言。24x24 viewBox。需要的圖示：`help-circle`（改為方框引線問號）、`link`、`arrow-back-up`、`chevron-down`、`download`、`trash`、`grip-vertical`、`plus`、`minus`、`check`、`alert-triangle`。
**沒有 emoji，沒有 Unicode 字元當圖示。**

---

## 6. 響應式

| 斷點 | 版面 |
|---|---|
| >= 1200px | 工作台 5/7 split；參數台 4 欄；比較欄 3 格並排；讀數 3 欄 |
| 960 - 1199px | 工作台 5/7 split（標題欄字級降到 `--fs-2xl`）；參數台 2 欄；比較欄 3 格；讀數 3 欄 |
| 768 - 959px | 工作台改垂直堆疊（標題欄上、圖表下，`--plot-h` 360px）；參數台 2 欄；比較欄 2 格 + 橫向捲動；讀數 3 欄 |
| < 768px | 全部單欄；`--plot-h` 320px；參數台 1 欄；比較欄 1 格 + 橫向 scroll-snap；讀數改 3 列並縮到 `--fs-lg`；legend 直排；x 軸刻度改每 10 年 |

每個多欄版面都在同一個 component 的 CSS 裡明確宣告 `< 768px` 行為，不假設「它自己會排好」。高度一律 `min-height: 100dvh`，不用 `100vh`。

---

## 7. 為了避開 AI 預設，這個專案刻意不做的三件事

### 1. 不做行銷 hero，也不做 hero 大數字模板

首屏沒有「NT$ 1,842,000 / 30 年後的差距 / 三個輔助統計」這種 hero-metric 構成。首屏就是**工作台本身**：圖表、座標軸、控制項直接在那裡。

理由：這是一個工具不是一個 landing page。把首屏讓給行銷數字，等於承認產品本身不夠看。而且 hero 大數字必然是一個編造的數字（使用者還沒輸入任何東西），那正好違反本專案的信任前提。

### 2. 不用卡片牆當頁面結構

全頁只有**一種**卡片：情境卡，因為情境確實是一個可以被拿起來、拖到比較欄的離散物件。除此之外沒有任何「圖示 + 標題 + 敘述」的等高卡片列。

功能不被拆成六張卡；假設走製圖明細表的列式排版，說明走 inline 抽屜（開在它解釋的那個數字旁邊，不是另一個 section 的卡片）。沒有巢狀卡片，沒有三欄等高功能卡。

### 3. 不用彩虹配色區分三條路徑

三條曲線是同一個色相（普魯士藍）的三個明度階，加上三種線型（實線 / 長虛線 / 點線）。橘色整站只出現在交叉點、結論句的強調段、以及「這個值被你改過」的標記。沒有紅綠表示好壞，沒有第二個 accent。

理由有三：(a) 藍圖上本來就只有一種筆的顏色，區分靠筆寬與線型；(b) 明度加線型的區分在色盲與黑白列印下依然成立，彩虹配色不行；(c) 三條路徑不是三個品牌，它們是同一張圖上的三支筆，用三個對比色會讓它們看起來像在互相競爭，而這張圖的論點是「它們是同一個世界的三種走法」。

---

## 8. 交叉檢查（對照 `VISUAL-WORLDS.md` 的六專案表）

| 項目 | 指派 | 本專案實作 | 符合 |
|---|---|---|---|
| 明暗 | 亮 | `#F7F9FC` 冷白，`color-scheme: light`，無深色模式 | 是 |
| 主色家族 | 冷白 + 普魯士藍 | `#F7F9FC` / `#0B2140` 到 `#4E80B8` 八階 | 是 |
| Accent | 暖橘 | `#E86A2B`（圖形）與 `#B8480F`（文字），僅交叉點與結論 | 是 |
| 顯示字型 | Schibsted Grotesk | 顯示 Schibsted Grotesk，中文 Noto Sans TC，等寬 JetBrains Mono | 是 |
| 材質語言 | 1px 方格底紋、hairline 座標軸、製圖引線與標註 pill、圓角 0-4px | 全部實作，圓角三階 0 / 2 / 4 | 是 |
| 介面語言 | 繁體中文 | 是 | 是 |
| 米色 | 明確禁止 | 調色盤中無任何暖色中性，全部冷藍偏移 | 是 |
