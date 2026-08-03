# Mockup Loom - 方向契約與設計系統

視覺世界由 `docs/VISUAL-WORLDS.md` 指派並鎖定（第 4 號：情境織機）。本文件是把那個世界展開成可實作的規格。
不執行 concept-seed：pinned brief 勝過隨機指派。

---

## 1. 方向契約（六區塊全文）

以下英文全文逐字寫入 `index.html` 的 `<body>` 第一個子節點，格式為 HTML 註解。

```html
<!--
THESIS
The print bends with the cloth, not on top of it. Every pixel of this interface exists to
make one 300ms difference undeniable, and then to let a seller repeat that difference five
hundred times without paying anyone. If the FLAT to WOVEN switch does not read as obviously
different to a non-technical person in two seconds, this build has failed and no amount of
finish elsewhere redeems it.

OWN-WORLD
A textile and print workshop working under photographic light. Jacquard punch cards, swatch
books, dye vats, the shuttle passing through the warp. The chrome is a neutral studio grey
with no measurable colour cast, because the whole point is judging whether a green looks
right on a grey shirt, and a warm interface would lie about that. Deep olive is the working
colour of the workshop; brick red is the mark the shuttle leaves. Surfaces are guillotine
cut: zero radius everywhere, hairline rules instead of card edges, no glass, no glow, no
gradient. Bricolage Grotesque runs its width axis the way a loom runs its warp, wide and
heavy for the one display word, condensed for the dense control rails. Fragment Mono carries
every number on the page, because every number here is a measurement.

STORY
The loom is already threaded. Before you have given it anything, it has woven a shirt and it
is showing you the folds. You put a mark on that shirt and it lies there flat, like a sticker
somebody stuck on a photograph. You throw the switch and the cloth takes it: the mark sinks
into every fold, the weave bites into the ink, the seam eats a little of the edge. Then you
do that four designs by six templates at a time and walk away with a folder that is already
named correctly. Nothing was uploaded. Nothing was locked behind a price.

FIRST VIEWPORT
At 1280x800 with no scroll: the wordmark and the mode switch in a 64px bar; the left rail
with one primary action, a drop target and the line about designs never leaving the tab; the
stage holding a fully rendered grey tee with visible folds, weave and ambient occlusion and
no design on it yet; the print area marked with a hairline; the procedural seed labelled
honestly under the render; the FLAT / WOVEN switch directly below the stage at the largest
type size on the page; the light dial in the right rail. No hero, no headline, no marketing
copy, no scroll cue. The first thing the visitor sees is the tool already working.

FORM
Three columns at 1280 and up (300 / 1fr / 320), one stage-first stack below 768. Radius 0
across the entire interface; the only circles are the two physical grips (light dial handle,
rotate handle) and that exception is written into the token file. Depth comes from a hairline
ladder at three weights plus exactly two shadows, both with offset and blur, both reserved
for the render surface and the dragged frame. One accent pair, locked: olive for action,
brick for state and for the woven condition, and brick appears in exactly three roles on the
whole page. Uppercase is permitted only at or above 2rem, which means only the two switch
labels. Fabric colours live in JavaScript, never in CSS, because they are content.

FINISH
unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, and DESIGN.md
-->
```

---

## 2. 設計讀取與三個轉盤

**Design read**: 這是 print-on-demand 賣家的**工作台**，不是 landing page。
受眾在不耐煩且懷疑的狀態下進站，需要在 30 秒內被說服。
語言是「攝影棚 + 織品工坊」，收斂到原生 CSS + 中性工作灰 + 可變字寬的 grotesque + 真實運算的 WebGL 表面。

- `DESIGN_VARIANCE: 5`：這是工具介面。不對稱要來自「Stage 遠大於兩側 rail」這個真實的資訊層級，不是裝飾性的錯位。
- `MOTION_INTENSITY: 6`：一個招牌時刻 + 三個回饋性動效。不做 scroll 敘事，因此不載入 ScrollTrigger。
- `VISUAL_DENSITY: 6`：控制項密集但要能長時間看。介於 daily app 與 cockpit 之間。數字一律等寬。

`design-taste-frontend` 的 Section 13 明確排除 dashboard 與 product UI。
本專案是 product UI，因此該 skill 的 landing-page 版面規則（hero、eyebrow 數量、zigzag、logo wall、bento）
不適用於本站，因為本站**沒有這些區塊**。仍然完全適用的是：
反 AI 預設的色彩與字型紀律、狀態完整性、對比、破折號禁令、動效必須被動機驅動、reduced motion。

---

## 3. 色彩 token（唯一來源：`css/tokens.css`）

### 3.1 中性階（攝影棚工作灰）

`#E6E4E1` 與 `#2A2A28` 是 VISUAL-WORLDS.md 指定的兩端，中間階由此內插並保持通道差 <= 5/255。
Stage 是唯一 R=G=B 完全相等的表面，這是刻意的：**只有算圖那塊是校正過的中性，其餘 chrome 容許 3 到 5 階暖漂移。**

| Token | Hex | 角色 | 對比（vs 主要背景 `#E6E4E1`） |
|---|---|---|---|
| `--grey-000` | `#F2F1EF` | 抬升面：輸入框、樣本卡面、按鈕上的文字 | 1.12（面，非文字） |
| `--grey-050` | `#E6E4E1` | App chrome 背景（指定值） | 基準 |
| `--grey-100` | `#DCDAD6` | 左右 rail 背景 | 1.10 |
| `--grey-200` | `#CFCDC9` | 軌道、分隔填充 | 1.25 |
| `--grey-300` | `#B7B5B1` | disabled 填充 | 1.62 |
| `--grey-400` | `#8B8985` | disabled 文字（僅用於 disabled，允許低對比且已標 `aria-disabled`） | 2.83 |
| `--grey-500` | `#6E6C68` | 圖形元素、hairline 加重、非文字符號 | 4.13（>= 3:1 圖形門檻） |
| `--grey-600` | `#55534F` | **次要文字** | **6.05** |
| `--grey-700` | `#3A3937` | 深面 | 8.9 |
| `--grey-800` | `#2A2A28` | 深色 chip、橫幅底、Stage 外框（指定值） | 11.33 |
| `--ink` | `#1E1E1C` | **主要文字** | **13.16** |
| `--stage` | `#767676` | 算圖舞台底（R=G=B，完全中性，約 18% 反射率灰卡） | 3.58（面，非文字） |

深色面（`--grey-800` `#2A2A28`）上的文字：

| Token | Hex | 角色 | 對比 vs `#2A2A28` |
|---|---|---|---|
| `--on-dark` | `#E6E4E1` | 深色面上的主要文字 | **11.33** |
| `--on-dark-2` | `#B8B6B2` | 深色面上的次要文字 | **7.10** |
| `--olive-lift` | `#9AAE63` | 深色面上的 olive | **5.90** |
| `--brick-lift` | `#E08A6B` | 深色面上的 brick | **5.49** |

次要文字全部由對應色相調出，**沒有任何一階是純灰混白**（見 `--brick-lift` `--olive-lift` 的做法）。

### 3.2 Accent：深橄欖（動作）

| Token | Hex | 角色 | 對比 |
|---|---|---|---|
| `--olive` | `#4A5233` | 主要按鈕填充、選取外框、進度線、勾選標記 | `--grey-000` 文字在其上 = **7.31**；作為文字在 `#E6E4E1` 上 = **6.50** |
| `--olive-deep` | `#363C25` | hover / active 填充 | `--grey-000` 在其上 = 9.9 |
| `--olive-lift` | `#9AAE63` | 深色面上的 olive 對應色 | 見上表 |

### 3.3 Accent：磚紅（狀態）

磚紅在全站**只有三個角色**，超出即為錯誤：
1. `WOVEN` 狀態（開關軌道填充、`WOVEN` 標籤文字、判詞的下緣線）
2. Stage 上設計的置放框與把手
3. 錯誤與破壞性狀態（錯誤文字、失敗卡片外框、焦點環外圈）

| Token | Hex | 角色 | 對比 |
|---|---|---|---|
| `--brick` | `#B5462F` | **填充與圖形專用，不作為內文顏色**（在 `#E6E4E1` 上僅 4.26） | `--grey-000` 文字在其上 = **4.79** |
| `--brick-deep` | `#93331F` | 填充的 hover / active | |
| `--brick-ink` | `#8E3320` | **磚紅系的文字色**（錯誤訊息、`WOVEN` 標籤） | 在 `#E6E4E1` 上 = **6.26**；在 `#F2F1EF` 上 = **7.03**；在 `#DCDAD6` 上 = **5.36** |
| `--brick-lift` | `#E08A6B` | 深色面上的磚紅文字 | 見 3.1 表 |

**紀律**：`--brick` 與 `--brick-ink` 是兩個不同用途的 token，不可互換。
凡是「文字」就用 `--brick-ink`，凡是「面或線」就用 `--brick`。
lint 規則：CSS 中 `color:` 屬性不得出現 `var(--brick)`。

### 3.4 線與遮罩

| Token | 值 | 角色 |
|---|---|---|
| `--rule-hair` | `rgba(30, 30, 28, 0.14)` | 群組內的分隔線 |
| `--rule-firm` | `rgba(30, 30, 28, 0.28)` | 群組之間、面的邊界 |
| `--rule-hard` | `rgba(30, 30, 28, 0.52)` | 強調邊界（Stage 外框） |
| `--rule-on-dark` | `rgba(242, 241, 239, 0.18)` | 深色面上的線 |
| `--scrim` | `rgba(30, 30, 28, 0.08)` | dragover 時的全視窗遮罩 |
| `--checker-a` / `--checker-b` | `#F2F1EF` / `#DCDAD6` | 透明區棋盤格（4px） |

### 3.5 焦點環（雙色，因為焦點可能落在任意亮度的算圖上）

```
--focus-inner: var(--grey-000);   /* 2px 內圈 */
--focus-outer: var(--brick);      /* 2px 外圈 */
--focus-offset: 2px;
```
在任何背景上，內外兩圈必有一圈達到 3:1 以上。

### 3.6 布料顏色不在這裡

模板的布色（heather grey、natural canvas、black、bone、ochre 等）是**內容**不是介面，
定義在 `js/templates/colorways.js`，以 sRGB 陣列形式傳給 shader。
CSS 中不得出現任何布料顏色。這是「一個專案一組調色盤」的執行方式。

---

## 4. 字型與字階

### 4.1 字型

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800&family=Fragment+Mono&display=swap">
```

（已驗證兩個家族在 Google Fonts 上都回傳實際 woff2，非 fallback。）

- **Bricolage Grotesque**（可變：`opsz` 12-96、`wdth` 75-100、`wght` 200-800）：所有顯示與 UI 文字。
  `wdth` 軸是這個世界的核心手法：**顯示字走 wdth 100（寬），密集的控制列走 wdth 82（窄）**，
  對應織品的經緯疏密。這不是裝飾，是讓 300px 寬的 rail 裡的標籤能保持 12px 而不擠。
- **Fragment Mono**：**只用於數字、檔名、尺寸、座標、角度、seed**。
  不作為「科技感」的戲服，不用於任何句子。

`font-feature-settings: "tnum" 1` 套用在所有數值上，避免拖曳時數字寬度跳動。

### 4.2 字階

| Token | size / line-height | wght | wdth | tracking | 用途 |
|---|---|---|---|---|---|
| `--t-display` | `3.25rem / 1.02` | 800 | 100 | `-0.035em` | 只有 `FLAT` / `WOVEN` 兩個字 |
| `--t-figure` | `2rem / 1.06` | 700 | 96 | `-0.02em` | Wall empty state 的 `16 renders`、大數值 |
| `--t-title` | `1.25rem / 1.2` | 650 | 92 | `-0.01em` | 站名、rail 區塊標題 |
| `--t-body` | `0.9375rem / 1.55` | 450 | 100 | `0` | 說明文字、錯誤訊息（max-width 68ch） |
| `--t-label` | `0.75rem / 1.25` | 600 | 82 | `0.005em` | 控制項標籤（sentence case，**永不 uppercase**） |
| `--t-micro` | `0.6875rem / 1.35` | 500 | 82 | `0.01em` | 註記、seed、檔名下的說明 |
| `--t-num` | `0.8125rem / 1.2` | 400 (Mono) | - | `0` | 所有數值 |
| `--t-num-lg` | `1.125rem / 1.1` | 400 (Mono) | - | `-0.01em` | 光源盤中心的角度、Stage 上的座標 |

**規則**：
- 顯示字最大 `3.25rem`（遠低於 6rem 上限）。這是工作台，不是海報。
- tracking 下限 `-0.035em`（未觸及 -0.04em 底線）。
- **Uppercase 只允許在 `--t-display`**（>= 2rem）。任何 12px 或 11px 的 uppercase + wide tracking 微標籤在本站是禁令。
- 內文行寬上限 68ch，`text-wrap: pretty` 用於段落，`text-wrap: balance` 用於標題。
- 沒有 italic 顯示字，因此不需處理降部裁切；若日後加入，`line-height` 下限 1.1 + `padding-bottom: 0.08em`。

### 4.3 為什麼不是別的字

`Bricolage Grotesque` 由 VISUAL-WORLDS.md 指派。它同時滿足兩件事：
可變寬度軸讓「同一個字體」既能當寬重的 display 又能當窄的 UI 標籤（避免混用兩個家族），
而它的字碗與字腳有輕微的手感不規則，呼應織品而不淪為「手寫感」。
禁止清單（Inter、Space Grotesk、DM Sans、Fraunces、Instrument Serif 等）全部未使用。全站零襯線。

---

## 5. 間距、尺寸、形狀

### 5.1 間距階（4px 基底）

`--sp-1: 4px` / `--sp-2: 8px` / `--sp-3: 12px` / `--sp-4: 16px` / `--sp-5: 20px` /
`--sp-6: 24px` / `--sp-8: 32px` / `--sp-10: 40px` / `--sp-14: 56px` / `--sp-18: 72px`

**節奏規則（貫穿全頁，無例外）**：
- 控制群組**內**：`--sp-2`（8px）
- 控制群組**之間**：`--sp-6`（24px）+ 一條 `--rule-hair`
- 區塊標題**上方**：`--sp-6`（24px）；標題**下方**：`--sp-2`（8px）。上方永遠大於下方。
- Rail 內距：`--sp-4` 左右、`--sp-5` 上下
- Stage 四周留白：`--sp-8`（桌機）、`--sp-4`（< 768px）
- Stage 與 Weave Switch 之間：`--sp-5`（20px）。這是全站最緊的「大元素之間」的距離，因為它們在語義上是一組。

### 5.2 尺寸

| Token | 值 | 用途 |
|---|---|---|
| `--bar-h` | `64px`（< 768px 為 `56px`） | TopBar 高度（低於 80px 上限） |
| `--rail-l` | `300px` | 左欄 |
| `--rail-r` | `320px` | 右欄 |
| `--ctl-h` | `32px` | 輸入框、segmented 段、滑桿軌道高 |
| `--btn-h` | `40px` | 主要按鈕 |
| `--hit-min` | `44px` | 觸控最小點擊區（不足者用透明 padding 補足） |
| `--switch-w` / `--switch-h` | `220px` / `44px` | Weave Switch 軌道 |
| `--dial` | `148px` | 光源盤直徑（< 768px 最小 132px） |
| `--thumb` | `72px` | 設計縮圖 |
| `--tpl-thumb` | `56px` | 模板縮圖 |
| `--swatch` | `24px` | 布色色塊 |

### 5.3 圓角：全站 0

```
--radius: 0;
--radius-grip: 50%;   /* 唯一例外，見下 */
```

**唯一的例外，明文寫成規則**：只有「實體握把」是圓的。
共兩個：光源盤的握把、設計的旋轉把手。它們是圓的因為使用者要用手指抓住它們轉動，
圓形是這個動作的形狀語言。其餘一切（按鈕、輸入框、縮圖、卡片、色塊、勾選標記、開關軌道與把手）一律直角。
樣本卡是被裁刀切出來的，不是被磨圓的。

### 5.4 陰影：全站兩個，都有偏移與模糊

```
--shadow-stage: 0 2px 0 rgba(30,30,28,.10), 0 18px 40px -18px rgba(30,30,28,.45);
--shadow-lift:  0 1px 0 rgba(30,30,28,.08), 0 8px 20px -12px rgba(30,30,28,.35);
```

- `--shadow-stage`：只用在算圖畫布下方。這是全站唯一「浮起來」的東西，因為它是實物。
- `--shadow-lift`：只用在拖曳中的置放框與展開的布色托盤。

**零偏移的彩色光暈、任何 glow、任何 `4px 4px 0` 硬偏移在本站不存在。**
所有其他層級靠 `--rule-hair` / `--rule-firm` / `--rule-hard` 三階 hairline 表達。

---

## 6. 動效 token 與規則

| Token | 值 | 用途 |
|---|---|---|
| `--dur-tap` | `90ms` | 按下回饋（scale / translateY） |
| `--dur-ui` | `180ms` | 選取框移動、標籤 crossfade、hover |
| `--dur-panel` | `280ms` | 面板讓位、托盤展開 |
| `--dur-signature` | `300ms` | 招牌開關的 shader 純量 |
| `--dur-knob` | `420ms` | 開關把手的超彈行程 |
| `--dur-card` | `420ms` | 批次卡片進場 |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | CSS 預設出場曲線（指數型 ease-out） |
| `--ease-inout` | `cubic-bezier(.65, 0, .35, 1)` | 雙向過場 |

GSAP 對應：`power2.inOut`（shader 純量）、`back.out(2.2)`（把手，全站唯一超調）、
`expo.out`（卡片進場）、`power3.out`（判詞）、`power2.out`（光源 quickTo）。
**線性緩動全站禁用**（唯一例外：決定式進度條的寬度，因為它代表真實時間）。

### 6.1 動效清單與各自的一句話動機（超過此清單即為越界）

| 動效 | 動機（一句話） |
|---|---|
| Weave Switch timeline | 狀態轉換：這是產品的全部論點，0.3 秒內證明位移是真的 |
| 批次卡片進場（blur + scale + autoAlpha） | 回饋：這一張的 GPU 工作剛剛完成，節奏跟著真實運算走 |
| 光源盤拖曳 + 全牆陰影同步轉向 | 回饋 + 證明：陰影是算出來的，不是縮圖快取 |
| ZIP 資料夾樹逐行畫出 | 敘事：讓使用者在按下之前就知道會拿到什麼結構 |
| 選取框位置 tween（模板、blend segment） | 階層：把注意力從舊選項帶到新選項 |
| 設計清單首次出現時，縮圖依序落位（stagger 0.03） | 階層：清單長出來了，這件事需要被看見 |
| 批次數字滾動（`snap: 1`） | 回饋：你的勾選直接改變了將要發生的運算量 |

**不做的動效**：頁面載入進場、scroll reveal、parallax、marquee、任何無限迴圈、任何裝飾性 pulse。
因此**不載入 ScrollTrigger**，只載入 `gsap.min.js`。

**兩處與本表原始規劃不同，理由記在 `js/motion.js` 對應段落的註解裡：**

1. 原訂「Templates 區往下讓位」在實作出來的版面裡**不存在這個位移**。左欄 designs
   panel 是固定高度的 grid row（`auto` 但受視窗高度收斂）且 `overflow-y: auto`，
   長出縮圖只會產生內部捲動，不會把下方 Templates 推開；實測位移為 0。
   為不存在的事件做動畫等於捏造事件，所以改為對**真正發生的事件**（清單誕生）
   施加動效，動機不變。
2. 不載入 `Draggable.min.js`。`type: "rotation"` 會旋轉傳給它的元素本身，
   套在光源盤上會連十二道固定刻度一起轉走——羅盤必須不動，動的只有光。
   `js/ui/light-dial.js` 既有的 pointer capture 已正確處理角度與 Escape 還原。

---

## 7. 元件清單與視覺規格

所有元件的完整狀態機在 `docs/INTERACTION.md` 第 3 節；此處是視覺規格。

| # | 元件 | 檔案 | 視覺規格 |
|---|---|---|---|
| 1 | **TopBar** | `js/ui/topbar.js` | 高 `--bar-h`，底部 1px `--rule-firm`，背景 `--grey-050`。左：站名 `--t-title`（`Mockup Loom`，wdth 92 wght 650）。中：mode segmented。右：`Export ZIP` 按鈕 + `Hyperkit` 文字連結。單行，桌機不換行 |
| 2 | **SegmentedControl** | `js/ui/segmented.js` | 高 `--ctl-h`，外框 1px `--rule-firm`，內部 1px 分隔。選取段背景 `--ink` 文字 `--grey-000`，背景位置以 GSAP tween。`role="radiogroup"` |
| 3 | **Button** | `css/style.css` | 高 `--btn-h`，radius 0，無陰影。primary = `--olive` 填充 + `--grey-000` 文字；secondary = 透明 + 1px `--rule-firm` + `--ink` 文字；text = 無框 + `--olive` 文字 + 1px 底線 hover 時出現 |
| 4 | **Dropzone** | `js/ui/dropzone.js` | 高 96px，2px dash / 3px gap 的 1px 虛線 `--rule-firm`。dragover 時 2px 實線 `--olive`。底下一行 `--t-micro` `--grey-600` 的隱私句 |
| 5 | **DesignThumb** | `js/ui/design-list.js` | `--thumb` 見方，棋盤格底（`--checker-a` / `--checker-b`，4px），下方檔名 `--t-micro` 截斷。selected 左側 3px `--brick` |
| 6 | **TemplatePicker** | `js/ui/template-picker.js` | 6 個 `--tpl-thumb` 縮圖排成 3x2，縮圖是該模板的真實算圖縮小。選取框 2px `--olive`，位置 tween |
| 7 | **ColorwayTray** | `js/ui/template-picker.js` | 選中模板下方展開，`--swatch` 色塊橫排，間距 `--sp-2`。選中者外圈 2px `--ink` + 中央 8x8 `--grey-000` 方孔（打孔卡語言）。展開用 `--shadow-lift` |
| 8 | **Stage** | `js/stage.js` | 背景 `--stage`（純中性），外框 1px `--rule-hard`，canvas 帶 `--shadow-stage`。左下角 seed 標籤：1px 上緣線 + `--t-micro` |
| 9 | **PlacementFrame** | `js/placement.js` | 1px `--brick` 框（idle 40% 不透明），4 個 8x8 實心方把手，1 個 10px 圓形旋轉把手（`--radius-grip`）。拖曳時三分法參考線 1px `--grey-000` 30% |
| 10 | **WeaveSwitch** | `js/weave-switch.js` | 軌道 `--switch-w` x `--switch-h`，radius 0，1px `--rule-hard` 外框。把手 44x44 實心 `--ink`。兩側標籤 `--t-display` uppercase。判詞在其下方 `--t-body`，帶 1px `--brick` 上緣線 |
| 11 | **NumberField** | `js/ui/number-field.js` | 高 `--ctl-h`，背景 `--grey-000`，1px `--rule-firm`。數值用 `--t-num`。左右各一個 16px 寬的減/增區（滑鼠按住可連續，觸控 44px 熱區） |
| 12 | **LightDial** | `js/ui/light-dial.js` | `--dial` 直徑，外圈 1px `--rule-firm`，12 道刻度（正北 8px，其餘 4px，1px `--grey-500`）。握把 14px 圓 `--olive`。中心角度 `--t-num-lg`。pointer capture 直接算角度（**不用** Draggable，理由見第 6 節） |
| 13 | **Slider** | `js/ui/slider.js` | 軌道 4px 高 `--grey-200`，已填部分 `--olive`。把手 14x14 **方形**（不是圓，因為它不是握把是刻度指示）。右側數值 `--t-num` |
| 14 | **BatchWall** | `js/batch.js` | CSS Grid `repeat(auto-fill, minmax(180px, 1fr))`，gap `--sp-3`。卡片無圓角無陰影，1px `--rule-hair` 外框，下方檔名 `--t-num` 截斷 |
| 15 | **ExportTree** | `js/export/tree.js` | 等寬樹狀文字（`--t-num`），縮排 2ch，資料夾名 `--ink` wght 600、檔名 `--grey-600`。逐行畫出 |
| 16 | **Banner** | `js/ui/banner.js` | 高 32px，背景 `--grey-800`，文字 `--on-dark`。**不是紅色**（降級不是錯誤）。錯誤型橫幅才用 `--brick` 左側 3px 標記 |
| 17 | **InlineError** | `css/style.css` | `--brick-ink` 文字 + 1px `--brick` 底線。永遠緊貼出錯的那個控制項下方，永不用 toast |
| 18 | **Toast** | `js/ui/toast.js` | 只用於「可復原的破壞性動作」（移除設計）。左下角，`--grey-800` 底，含 `Undo` 文字按鈕，8 秒 |
| 19 | **KeyboardOverlay** | `js/ui/keys.js` | 全站唯一的 `role="dialog"`。`--grey-050` 底，兩欄鍵位表，鍵帽是 1px `--rule-firm` 方框 + `--t-num` |
| 20 | **IconSet** | `js/ui/icons.js` | 自繪 SVG，統一 1.5px stroke、`stroke-linecap: square`（呼應直角世界）、24x24 viewBox。只有 6 個：`add`、`remove`、`check`、`download`、`rotate`、`chevron`。**零 emoji、零 Unicode 符號當圖示** |

### 7.1 沒有的元件（刻意）

沒有 Card 元件、沒有 Modal、沒有 Tooltip（改用永久可見的行內說明）、
沒有 Badge/Pill、沒有 Accordion（桌機）、沒有 Avatar、沒有 Tab（除了 < 1280px 的抽屜）。

---

## 8. 為了避開 AI 預設，這個專案刻意不做的三件事

### 一：全站沒有圓角，也沒有柔和陰影的浮動矩形

AI 預設會把每個群組包成一張 `border-radius: 12px` + `box-shadow: 0 4px 12px rgba(0,0,0,.08)` 的白卡，
然後把卡片再塞進卡片。本站的 `--radius` 是 `0`，且**只有兩個陰影 token，兩個都只給真實物件用**
（算圖畫布、拖曳中的框）。所有其他層級一律靠 `--rule-hair` / `--rule-firm` / `--rule-hard` 三階 hairline。

世界理由：布料樣本冊的卡片是被裁刀切出來的直角，打孔卡也是。
圓角在這個工坊裡不存在。

**這件事會被檢查的方式**：`grep -c "border-radius" css/*.css` 的結果只能出現在 `--radius-grip` 的兩個握把上。

### 二：沒有 glow、沒有漸層、沒有玻璃，狀態不用彩色圓點表示

AI 預設會用 `linear-gradient` 當按鈕、用 `backdrop-filter: blur` 當面板、
用一顆綠色小圓點表示 online、用紫藍光暈表示 active。
本站：**零 `linear-gradient`、零 `backdrop-filter`、零 `filter: drop-shadow`**（`filter: blur` 只在卡片進場的 GSAP tween 裡出現，是動效不是裝飾）。

狀態一律用**形狀與字重**表達：
- 未勾選 = 1px 空心方；已勾選 = `--olive` 實心方加畫出來的勾
- 未選中 = wght 500；選中 = wght 700 + 2px `--olive` 外框
- 進行中 = 一條決定式的 2px 線在推進（有實數），不是不定式 spinner

磚紅被限制在三個角色（見 3.3），超出即為錯誤。

世界理由：染坊裡分辨布料靠的是織法與厚薄，不是螢光。

### 三：沒有 hero、沒有行銷區塊、沒有 scroll 敘事

AI 預設會在工具上面裝一個 landing page：大標題、副標、兩顆 CTA、
三張「圖示 + 標題 + 敘述」的等寬卡片、`01 / 02 / 03` 的 how it works、
底部再放一條 marquee 與一句 "Trusted by"。

本站首次繪製時，畫面上就是**已經算好的一張布**與那個開關。
沒有標題、沒有副標、沒有 eyebrow、沒有 scroll cue、沒有 `Scroll to explore`、
沒有可以捲過去才會到達工具的東西。Single 模式下整頁根本不可捲動。
唯一在 Stage 下方生長的內容是批次的結果牆，而那是使用者自己造出來的。

同時因此**不載入 ScrollTrigger**：沒有 scroll 敘事就不該引入 scroll 外掛。

世界理由：織機不需要一張海報介紹自己。你走進工坊，機器已經在轉。

---

## 9. 建置前檢查（開工時逐項對照）

- [ ] `index.html` `<body>` 第一個子節點是第 1 節的六區塊註解全文，FINISH 那行逐字相符
- [ ] 所有資源路徑相對（`./css/...`、`./js/...`），零 `/` 開頭
- [ ] 只載入 `gsap.min.js`，不載 ScrollTrigger、不載 Draggable（理由見第 6 節）
- [ ] CSS 中零裸 hex，全部走 `var(--...)`；布料顏色只在 JS
- [ ] `color:` 屬性不出現 `var(--brick)`（文字用 `--brick-ink`）
- [ ] `border-radius` 只出現在 `--radius-grip` 的兩個握把
- [ ] 零 `linear-gradient`、零 `backdrop-filter`、零 emoji、零 `—` 與 `–`
- [ ] 零 uppercase 微標籤（uppercase 只出現在 `--t-display`）
- [ ] 沒有 CSS 寫死的 `opacity: 0`；內容預設可見
- [ ] `prefers-reduced-motion` 走 `gsap.matchMedia()`，reduce 時功能不打折
- [ ] 375 / 768 / 1280 三個寬度用真實內容測過，無溢出
- [ ] `FLAT` / `WOVEN` 用校正網格卡驗過，差異肉眼可辨
- [ ] 匯出的 ZIP 在 Windows 檔案總管與 macOS Finder 都能直接解壓
- [ ] 主控台零錯誤、零警告
- [ ] 從 hub 可進入，站內有 `Hyperkit` 返回連結
- [ ] 完成後產出 finish review、verdict 與 `DESIGN.md`
