# Diff Warden - 設計方向

> 視覺世界由 `docs/VISUAL-WORLDS.md` 第 7 項指派並鎖定（pinned brief），不執行 concept-seed。
> 這份文件把那個世界展開成可以照著實作的 token 表與元件規格。
> `css/tokens.css` 是唯一顏色來源，之後的樣式檔不得出現裸 hex。

---

## 1. 方向契約（六區塊全文）

以下六段會逐字寫進 `index.html` `<body>` 的第一個子節點作為 HTML 註解。
本專案的契約以繁體中文書寫（介面語言即中文，PRODUCT 與 INTERACTION 亦然），
`FINISH` 一段依規定逐字使用英文原句。

### THESIS

這個介面主張一件事：agent 寫出來的三千行程式碼，是一個可以被架上檢測台、掃過一遍、
然後在座標上標出裂紋的**物件**，不是一段需要跟人討論的話。
每一個表面決定都在服務這個主張。缺陷是列不是段落，因為這份東西要能被第三個人讀。
探傷帶存在是為了把「哪個檔案的哪一行」變成一個座標而不是一句描述。
判讀規則庫佔掉整條右軌，因為使用者累積下來的判斷是這台儀器唯一比 agent 強的地方。
畫面上任何無法回推到「這是一份可以交出去的檢測報告」的元素都被移除。

### OWN-WORLD

材料探傷檢測。參考物是超音波探傷儀的讀數窗、應力測試機的曲線紙、
非破壞檢測報告上的缺陷標註、X 光片上被圈起來的裂紋。
機殼是深棕黑，因為那是暗房與儀器外殼的顏色，不是「深色模式」。
螢光讀數是酸黃綠，那是儀器在暗處唯一發亮的東西，所以它是唯一的 accent，
而且它從不當背景大面積出現，只當**線、標記、與一個填色按鈕**。
文字是冷白，刻意與暖底衝突，因為讀數是外加上去的資訊，不屬於機殼。
等寬字在這裡是合法的：檔案路徑與行號是**位址與量測值**，不是科技感戲服。

明確不是：聊天泡泡、對話介面、機器人吉祥物、任何 AI 產品的紫藍光暈。

### STORY

頁面開場是一張空的檢測台：一張量測網格、四個角標圈出試件範圍、一句話、兩顆按鈕、
以及一行誠實的硬體能力讀數。它是空的，因為儀器在裝上東西之前本來就是空的。
使用者選了資料夾，網格**不重繪**，角標飛到工作台四角，兩條軌從左右進來。
同一台儀器，現在裝上了東西。接下來的九十秒畫面是一台正在工作的機器：
掃描游標依真實批次進度前進，每解析出一條缺陷就在座標上敲一個圈記、
垂一條引線、讓缺陷列在引線末端落定。跨檔案的缺陷會先拉一條弧線把兩個檔案接起來，
那兩百毫秒是整個介面最重要的一段。掃完，游標消失，圈記留在原位，
右軌的歷史刻度尺長出今天這一根，而它比上一根矮。房間安靜下來，
畫面剩下一份可以按下匯出的報告。

### FIRST VIEWPORT

滿版高度，不捲動。masthead 56px，左邊返回 hyperkit，中間站名，
右邊三顆真實狀態晶片（瀏覽器支援、金鑰、本機資產）。
底下是檢測台：`#14100E` 上的 32px 量測網格，內縮 24px 一條 1px 細線，
四個 12px 酸黃綠角標同時是試件範圍的邊界。
內容靠左，垂直位置在中線上方 4vh，只有四個文字元素：
標題 `這批程式碼哪裡會爆，先架上去掃一遍`（兩行，最大 56px，**不帶句末句號**）、
一行 30 字的說明、一顆酸黃綠填色主按鈕與一顆 hairline 次按鈕、
以及一行真實的能力讀數 `File System Access API 可用，授權可續用`。
沒有 eyebrow、沒有捲動提示、沒有統計數字、沒有 logo 牆、沒有版本標籤。

### FORM

一個 accent，鎖定：酸黃綠 `#C6F24E`。**沒有第二個色相**，連錯誤警示都沒有。
警示靠表面明度反轉、1px 外框與一個畫出來的三角圖示，
因為一台只有一個螢光色的儀器不會為了報錯突然長出紅燈。
嚴重度是同一色相的四階明度，並且**永遠搭配圈記幾何與文字標籤**這兩個冗餘通道，
所以在灰階、在色盲、在一張列印出來的報告上都讀得出來。
其餘是五階暖棕黑表面（`#0B0908` 到 `#2B211B`）與五階冷白文字階。
深度來自有偏移、有柔和模糊、色相取自機殼的黑色陰影；零彩色光暈。
圓角只有兩個值：2px 給所有控制項與面板，0 給 canvas 與程式碼讀數窗（那是切出來的窗口）。
字型 Chivo 講介面的話，Chivo Mono 講機器量到的數，中文接 Noto Sans TC，分工是強制的不是美感的。
間距 4px 基底，群組內緊、群組間鬆，標題上方永遠比下方多。
動效從已經可見的狀態出發、指數型 ease-out；唯一的線性是掃描游標，
因為掃描是等速量測，給它緩動會把儀器變成裝飾。

### FINISH

unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md

---

## 2. 色彩 token

所有對比值以 WCAG 2.x 相對亮度公式計算，格式為（前景 on 背景）。
數值在 `css/tokens.css` 的註解裡逐行標註，本節說明**為什麼**是這些值。

### 2.1 表面（五階暖棕黑）

暖棕黑是機殼與暗房的顏色。色相約 20 度，飽和度極低。
它與 `invoice-wrapped-tw` 的深靛近黑（藍向）和 `cutout-forge` 的深炭黑（中性）都不同。

| token | hex | 用途 |
|---|---|---|
| `--well` | `#0B0908` | 讀數窗、程式碼節錄、送出內容檢視。比機殼更深的凹陷 |
| `--bed` | `#14100E` | 頁面地面。檢測台與主台 |
| `--panel` | `#1B1613` | 兩條軌、面板、缺陷列 hover |
| `--panel-2` | `#241C18` | 列 hover 的再上一階、規則列 hover |
| `--fault-plate` | `#2B211B` | **只有**警示板。這是全站最亮的表面，本身就是訊號 |

`--grid` `#221A16`（1.11 on bed）是 32px 量測網格的線色。它幾乎看不見，這是對的：
網格是被感覺到的紋理，不是被閱讀的內容。

### 2.2 文字（五階冷白）

冷白（色相偏青，約 165 度，飽和度 2%）壓在暖棕黑上。這個冷暖衝突是刻意的：
讀數是儀器投射上去的資訊，它不屬於機殼。**不使用中性灰**。

| token | hex | on bed | on panel | on well | on plate | 用途 |
|---|---|---|---|---|---|---|
| `--fg` | `#F2F4F3` | 17.12 | 16.24 | 17.99 | 14.23 | 標題、缺陷標題、主要數值 |
| `--fg-2` | `#CBCFCE` | 12.03 | 11.41 | 12.64 | 10.00 | 內文、情境描述、面板標籤 |
| `--fg-3` | `#A5AAA9` | 8.04 | 7.62 | 8.44 | 6.68 | 次要說明、helper、指紋摘要 |
| `--fg-4` | `#888E8D` | 5.68 | 5.38 | 5.96 | 4.72 | 文字下限。軸標籤、時間戳 |
| `--fg-disabled` | `#5C6261` | 3.04 | 2.88 | 3.19 | 2.53 | **僅 disabled**（WCAG 豁免） |

`--fg-4` 是刻意選在「在最亮的表面 `--fault-plate` 上仍有 4.72」的位置。
文字階的下限由最不利的表面決定，不是由最常用的表面決定。

### 2.3 Accent：酸黃綠（唯一 accent，全頁鎖定）

| token | hex | 對比 | 用途 |
|---|---|---|---|
| `--accent` | `#C6F24E` | 14.60 on bed / 13.85 on panel | 主按鈕填色、focus ring、掃描游標、角標、選中標記 |
| `--accent-hi` | `#DBFF7C` | 16.76 on bed | 主按鈕 hover 的提亮一階 |
| `--accent-dim` | `#A8D633` | 11.11 on bed | 歷史刻度尺的刻痕、次級標記 |
| `--ink-on-accent` | `#14100E` | 14.60 on accent / 16.76 on accent-hi | 酸黃綠填色上的文字 |

**紀律**：酸黃綠不做大面積背景。全站唯一的填色使用是主按鈕（約 300×40px）與選中的分段。
其他全部是 1px 到 2.5px 的線與標記。理由：儀器上發亮的是讀數，不是機殼。
一旦大面積使用，這個世界就變成「霓虹深色模式」，那是另一個（而且很爛的）世界。

### 2.4 嚴重度：同一色相的四階明度

`VISUAL-WORLDS.md` 明確禁止紅綠燈式三色標示。四階明度取自 accent 的色相。

| 嚴重度 | token | hex | 對比 on bed | 圈記幾何 | 文字標籤 |
|---|---|---|---|---|---|
| 阻斷 | `--sev-1` | `#E2FF85` | 17.00 | 實心圓 r=9 + 2.5px 外環 + 十字準星 | `阻斷` |
| 高 | `--sev-2` | `#B4E04A` | 12.34 | 空心圓 r=7，2px 描邊 + 十字準星 | `高` |
| 中 | `--sev-3` | `#86A832` | 6.90 | 空心圓 r=5.5，1.5px 虛線描邊 | `中` |
| 低 | `--sev-4` | `#6B8529` | 4.51 | 開口記號 r=4，1px 描邊，缺口朝上 | `低` |

**誠實的限制**：相鄰兩階之間的互相對比只有 1.38 到 1.79，
單靠明度不足以在小尺寸上可靠區分。所以嚴重度**永遠**用三個冗餘通道同時編碼：
明度階、圈記幾何、文字標籤。文字標籤在缺陷列上不可隱藏，在 Markdown 匯出裡也必定存在。
這不是把問題繞過去，這是承認明度階單獨不夠用之後正確的做法。

### 2.5 線與邊框

| token | hex | 對比 on bed | 用途 |
|---|---|---|---|
| `--grid` | `#221A16` | 1.11 | 32px 量測網格 |
| `--rule` | `#352C26` | 1.39 | 列間分隔、面板內分組線 |
| `--rule-strong` | `#4A3E36` | 1.83 | 面板外框、chip 邊框 |
| `--rule-x` | `#63534A` | 2.58 | hover 邊框、警示板外框 |
| `--field-line` | `#857569` | 4.27 | **表單輸入框邊框**。WCAG 1.4.11 要求非文字控制項 ≥ 3:1，這裡取 4.27 留餘裕 |

### 2.6 警示：沒有第二個色相

這是本專案最需要說明的決定。`VISUAL-WORLDS.md` 指定「酸黃綠唯一 accent」，
所以錯誤狀態**不引入紅色或橙色**。警示的辨識度來自四個非色相通道：

1. 表面反轉：警示板是全站最亮的表面 `--fault-plate` `#2B211B`，在暗機殼上它自己會跳出來
2. 1px `--rule-x` 外框，把它從周圍的無框面板中切出來
3. 一個畫出來的 `i-warn` 三角圖示，`--fg` 冷白，stroke 1.5
4. 位置：它**取代**造成錯誤的那個控制區，使用者的眼睛本來就在那裡

比起一個紅色小圓點，一整塊控制區被換成寫著「發生什麼 + 為什麼 + 你現在可以做什麼」的板子
更難被忽略。這個決定同時讓報告在黑白列印時仍然完整。

### 2.7 探傷帶專用色

| token | hex | 對比 on bed | 用途 |
|---|---|---|---|
| `--strip-idle` | `#3E3B2A` | 1.68 | 尚未掃描的檔案欄底色（去飽和的 accent 色相） |
| `--strip-hit` | `#5A6B2E` | 3.22 | 擊點時該欄的一次亮度閃動（60ms 起、回落） |

掃描游標的拖尾是 `--accent` 到 `--strip-idle` 的 24px 線性插值，
在 canvas 裡用 `createLinearGradient` 畫。**這是亮度衰減，不是光暈**：
它有明確的方向（向左）與明確的長度（24px），不是圍繞著發光體的模糊圓。

### 2.8 跨專案色彩隔離檢查

| 專案 | 明暗 | 主色家族 | Accent | 是否衝突 |
|---|---|---|---|---|
| 1 發票回顧 | 暗 | 深靛近黑 `#0B0D17`（藍向） | 朱橘紅 `#FF4D2E` | 底色藍向 vs 本專案棕向；accent 紅 vs 黃綠 |
| 3 去背熔爐 | 暗 | 深炭黑 `#0E0E10`（中性） | 電光青 `#22E5C8` | 底色中性 vs 本專案棕向；accent 青 vs 黃綠 |
| 5 漸層工坊 | 純黑 | `#000` / `#0A0A0A` | 無 | 本專案有明確 accent 且底色帶棕 |
| **7 產碼審查台** | **暗** | **深棕黑 `#14100E`（暖，色相 20）** | **酸黃綠 `#C6F24E`** | |

三個暗色專案的底色分別是藍向、中性、暖棕向；三個 accent 分別在色相 12 度、168 度、76 度。
沒有重複。

---

## 3. 字型與字階

### 3.1 字型

```css
--font-ui:   "Chivo", "Noto Sans TC", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono: "Chivo Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Noto Sans TC", monospace;
```

Google Fonts（已驗證 200，並在真實瀏覽器裡渲染確認過）：

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chivo:ital,wght@0,300..900;1,400&family=Chivo+Mono:wght@400..600&family=Noto+Sans+TC:wght@100..900&display=swap" rel="stylesheet">
```

三家**都取可變軸範圍**（`300..900` / `400..600` / `100..900`），不取靜態實例。
理由是實測發現的：字階裡有 720、640、620、450 這些非整百字重，
若載入靜態 400/500/700，中文會被吸附到 700 而拉丁字是 720，同一行會出現兩種粗度。
取可變軸之後三家都能精確落在指定值上。

`Noto Sans TC` 放在拉丁顯示字**之後**，兩個堆疊都要放：
Chivo 與 Chivo Mono 都沒有 CJK 字符，少了這一層，半句中文會掉進系統預設字。
放在後面則拉丁字母與數字仍然解析到前面那一家。

為什麼是 Chivo：它是 Omnibus-Type 的 grotesque，字腔緊、末端切平、數字有明確的方形肩，
在小尺寸下讀得出來而不變成一團。它有搭配的等寬版本 Chivo Mono，
所以介面字與量測字是**同一個設計者的同一套骨架**，這在一台儀器上是必要的。
它不在 `BUILD-STANDARD.md` §3.1 的訓練資料預設清單裡，也不是 Inter，不是襯線。

### 3.2 字階

| 角色 | size | line-height | tracking | weight | 用在哪 |
|---|---|---|---|---|---|
| display | `clamp(2.25rem, 5.2vw, 3.5rem)` | 1.06 | -0.028em | 720 | 檢測台標題（僅此一處） |
| h2 | `clamp(1.375rem, 2.2vw, 1.75rem)` | 1.16 | -0.018em | 640 | 清單標頭、首屏下方三段的標題 |
| h3 | `1.0625rem` (17px) | 1.32 | -0.008em | 620 | 缺陷標題、匯出預覽標題 |
| panel | `0.8125rem` (13px) | 1.30 | 0.01em | 600 | 軌上的面板標題（見下方紀律） |
| body | `0.9375rem` (15px) | 1.62 | 0 | 400 | 缺陷情境、說明文字 |
| ui | `0.8125rem` (13px) | 1.42 | 0.004em | 500 | 按鈕、標籤、表格內容 |
| ui-sm | `0.75rem` (12px) | 1.36 | 0.01em | 500 | helper、旁註、時間戳 |
| mono | `0.8125rem` (13px) | 1.55 | 0 | 450 | 檔案路徑、行號、程式碼節錄 |
| mono-sm | `0.6875rem` (11px) | 1.40 | 0.01em | 500 | 探傷帶軸標籤、欄位計數 |
| readout | `clamp(1.5rem, 2.6vw, 1.75rem)` | 1.10 | -0.01em | 500 mono | 讀數窗的 token 與金額，`tabular-nums` |

顯示字最大 56px，遠低於 6rem 上限。字距下限 -0.028em，高於 -0.04em 的地板。

**面板標題的紀律**：軌上的面板標題（`試件` `基準線` `排除規則` `掃描設定` `判讀規則` `審查歷史`）
**不使用大寫、不使用寬字距**。它們是 13px/600 的一般字，`--fg-2`，右側接一條延伸到面板邊緣的 1px `--rule`。
這是儀器面板的標記方式，而且它同時避開了 eyebrow / kicker 的視覺簽名。全站零 eyebrow。

**行寬**：`--measure-body: 64ch`。Chivo 的 `0` 字寬約 0.55em，
64ch 在 15px 下約 528px，混排的中英文大約落在 68 個拉丁字元或 34 個中文字一行，
兩者都在舒適區。**這個值在建置時要用真實文案在 1280 / 768 / 375 三個寬度實測，
overflow 就改值，不是改文案。**

**斜體**：Chivo Italic 只用在一個地方，就是被略過缺陷清單裡的 `被規則「X」擋下`。
該行有降部字母的可能，所以 line-height 下限 1.1、`padding-bottom: 0.08em`。

---

## 4. 間距、圓角、陰影、動效

### 4.1 間距（4px 基底）

```
--s-1  2      --s-6  16     --s-11 60
--s-2  4      --s-7  20     --s-12 84
--s-3  6      --s-8  24     --s-13 120
--s-4  8      --s-9  32
--s-5  12     --s-10 44
```

節奏規則：

- 群組內：`--s-2` 到 `--s-4`（label 與 input、圈記與標題）
- 群組間：`--s-6` 到 `--s-8`（面板內兩個區塊之間）
- 面板之間：`--s-9`
- 標題上方 / 下方：工作台內 `--s-9` / `--s-5`（32 / 12，上方是下方的 2.67 倍）；
  檢測台下方的捲動段落 `--s-12` / `--s-8`（84 / 24，3.5 倍）
- 面板內距：`--s-6`（16px）。缺陷列上下 `--s-6`，左右 `--s-7`

### 4.2 圓角（兩值系統，規則明寫）

```
--r:   2px   /* 所有控制項、面板、chip、按鈕、警示板 */
--r-0: 0     /* canvas、程式碼讀數窗、探傷帶、量測網格 */
```

規則一句話：**任何是「窗口」的東西是直角，任何是「零件」的東西是 2px。**
沒有 pill、沒有圓形按鈕、沒有 12px 卡片。世界指定 2px，就只有 2px。

### 4.3 陰影（有偏移、有柔和模糊、色相取自機殼）

```css
--shadow-panel:   0 1px 2px rgba(6,4,3,.40), 0 2px 10px rgba(6,4,3,.30);
--shadow-raised:  0 2px 5px rgba(6,4,3,.44), 0 12px 28px -8px rgba(6,4,3,.52);
--shadow-drawer:  0 8px 20px -6px rgba(6,4,3,.55), 0 28px 64px -20px rgba(6,4,3,.62);
--shadow-well:    inset 0 1px 0 rgba(242,244,243,.05), inset 0 10px 18px -12px rgba(6,4,3,.70);
--shadow-rule-b:  inset 0 -1px 0 var(--rule);
```

每一個都有真實偏移與模糊。`rgba(6,4,3)` 是比 `--well` 更深的暖黑，
所以陰影落在暖底上不會顯得髒。**零彩色光暈**，酸黃綠從不出現在任何 `box-shadow` 裡。

`--shadow-well` 的第一段是一條 5% 冷白的上緣內光，那是切出來的窗口邊緣接到光的樣子，
不是玻璃效果。

### 4.4 動效時長與緩動

```css
--dur-1:      110ms;  /* hover、active、chip 切換 */
--dur-2:      180ms;  /* 面板展開、分段切換、節錄展開 */
--dur-3:      300ms;  /* 抽屜、匯出預覽側拉 */
--dur-4:      520ms;  /* 檢測台 -> 工作台 */
--dur-strike: 420ms;  /* 一次擊點的完整時間軸 */
--dur-row:    260ms;  /* 缺陷列落定 */
--dur-cursor: 450ms;  /* 掃描游標 quickTo 的追隨時間 */

--ease-out:    cubic-bezier(.16, 1, .3, 1);      /* 預設，約 power4.out */
--ease-settle: cubic-bezier(.22, 1.10, .36, 1);  /* 極小 overshoot，零件卡進定位 */
--ease-in-out: cubic-bezier(.65, 0, .35, 1);     /* 抽屜 */
--ease-in:     cubic-bezier(.55, 0, 1, .45);     /* 只用於離場 */
```

**線性只有一處**：掃描游標的位移（`ease: "none"`）。掃描是等速量測，
給它緩動會把儀器變成裝飾。這個例外寫在這裡，其他地方出現線性就是錯誤。

`@media (prefers-reduced-motion: reduce)` 把所有 `--dur-*` 壓到 1ms，
GSAP 端另用 `gsap.matchMedia()` 處理（見 `docs/INTERACTION.md` §5.5）。
CSS 裡沒有任何 `opacity: 0` 等 JS 來救。

### 4.5 量測網格

32px 見方，1px `--grid` 線，用 `repeating-linear-gradient` 畫在 `--bed` 上。
它從檢測台一路延續到工作台的主台**且不重繪**，這是 STORY 裡「同一台儀器」的物質證據。
軌與面板是不透明的 `--panel`，蓋住網格，所以網格只在主台可見。

每 4 格（128px）加一條稍亮的線（`--rule` 的 40% alpha）作為主刻度，
呼應探傷帶的縱軸刻度。這不是裝飾線條：它與探傷帶的 25% / 50% / 75% 行號刻度對齊。

---

## 5. 元件清單與視覺規格

| # | 元件 | 規格重點 |
|---|---|---|
| 1 | masthead | 高 56px，1px 底線 `--rule`，`--panel` 底。左返回連結、中站名（ui 13px/600 `--fg`）、右三顆晶片 |
| 2 | 狀態晶片 | 高 24px，2px 圓角，1px 邊框，內距 `--s-3` `--s-5`，ui-sm。啟用態邊框 `--accent`，其餘 `--rule-x` |
| 3 | 檢測台（bed） | `min-height: 100dvh`，32px 網格，內縮 24px 1px `--rule` 框，四角 12px `--accent` 角標（2px 筆畫，L 形） |
| 4 | 主按鈕 | `--accent` 填色，`--ink-on-accent` 文字，高 40px，內距 `--s-7`，2px 圓角。hover `--accent-hi`。桌機不換行 |
| 5 | 次按鈕 | 透明底，1px `--rule-x` 邊框，`--fg` 文字，同尺寸。hover 邊框 `--field-line` + 底色 `--panel` |
| 6 | 軌面板 | `--panel` 底，無邊框無陰影，面板之間 `--s-9` 間距 + 1px `--rule` 分隔。**不是卡片** |
| 7 | 面板標題 | panel 字階，`--fg-2`，右側 1px `--rule` 延伸至面板右緣。零大寫、零寬字距 |
| 8 | chip（排除規則） | 高 24px，1px `--rule-strong`，mono-sm，2px 圓角。hover 邊框 `--rule-x` + 右側 `×` |
| 9 | 分段控制 | 1px `--rule-x` 外框包住整組，段間 1px 分隔。選中段 `--accent` 底 + `--ink-on-accent` 字 |
| 10 | 表單輸入 | 高 36px，`--well` 底，1px `--field-line` 邊框，2px 圓角。label 在上方 `--s-2` 間距 |
| 11 | 預算刻度尺 | 一條 1px `--rule-strong` 水平軸 + 4 個 6px 刻痕 + 數字（mono-sm `--fg-4`）。游標是 12×20 的 `--accent` 方塊，2px 圓角。原生 `<input type="range">` 疊在上面透明 |
| 12 | 讀數窗 | `--well` 底，`--r-0` 直角，`--shadow-well`，內距 `--s-6`。三行 readout 數字（mono，`tabular-nums`）+ mono-sm 標籤 |
| 13 | 檔案挑選表 | 列高 36px，列間 1px `--rule` 底線（只有底線，不是上下都有）。hover 底色 `--panel-2`。選中列左緣 1px `--accent` |
| 14 | 探傷帶 | `<canvas>`，高 128px（< 768px 為 64px），`--r-0`。1px 網格 + 四角角標 + 檔案欄 + 圈記 + 游標 |
| 15 | 缺陷列 | 底線 1px `--rule`，上下內距 `--s-6`，左右 `--s-7`。左欄 32px 放圈記，右側動作列 ui 13px hairline 按鈕 |
| 16 | 程式碼節錄 | `--well` 底，`--r-0`，mono 13px，行號欄右對齊 `--fg-4` 寬 40px，缺陷行左緣 2px `--accent` + 底色 `--panel` |
| 17 | 略過條 | 全寬一列，`--panel` 底，`--fg-2` 文字，計數 `--accent`。展開後子列 `--fg-3` |
| 18 | 規則列 | 1px `--rule` 底線，規則名 ui `--fg`，指紋摘要 mono-sm `--fg-3`，命中數 mono-sm `--accent-dim` |
| 19 | 歷史刻度尺 | 高 72px。每根刻痕寬 10px，間距 `--s-4`，`--accent-dim` 填色，被略過段 `--strip-idle`。軸線 1px `--rule-strong`，日期 mono-sm `--fg-4` |
| 20 | 警示板 | `--fault-plate` 底，1px `--rule-x` 外框，2px 圓角，內距 `--s-7`。`i-warn` 24px `--fg` + h3 標題 + body 說明 + 動作按鈕 |
| 21 | 匯出預覽 | 右側側拉 480px，`--well` 底，`--shadow-drawer`，mono 13px。底部固定兩顆按鈕 |
| 22 | 狀態列 | 高 28px（永遠保留，防 CLS），`--panel` 底，1px 上邊線，ui-sm。三段：資產讀數 / 當前操作 / 授權狀態 |
| 23 | 快捷鍵表 | 全站唯一 modal。`--panel` 底，`--shadow-drawer`，最大寬 520px，`role="dialog" aria-modal="true"` |

### 圖示系統

自繪 SVG sprite，`<symbol>` 放在 `<body>` 開頭。統一規格：24×24 viewBox、
`stroke-width: 1.5`、`stroke-linecap: square`、`stroke-linejoin: miter`、`fill: none`。
方形端點與尖角是刻意的：這個世界裡的線是刻出來的，不是畫筆畫的。

18 個：`i-folder` `i-caliper` `i-datum` `i-strike` `i-crosshair` `i-dismiss` `i-restore`
`i-download` `i-copy` `i-chevron` `i-leader` `i-warn` `i-check` `i-key` `i-eye` `i-trash` `i-plus` `i-x`。

**零 emoji、零 Unicode 字元當圖示。** 這一條在實作時最容易破功的三個地方，先寫死：

| 想用的字元 | 改用 |
|---|---|
| `↳` 跨檔案的第二個位置 | `i-leader`：一條 8px 下折引線，stroke 1.5，方形端點 |
| `▸` `▾` 展開收合標記 | `i-chevron`，用 `transform: rotate()` 轉向，`--dur-2` 過場 |
| `●` `○` `◆` 嚴重度標記 | canvas 或 inline SVG 畫的圈記（幾何規格見 §2.4） |

`docs/INTERACTION.md` 的版面草圖裡出現的 `↳` `▸` `‹` 是**文字稿的速記**，不是實作規格。
實作時全部換成 sprite 裡的 symbol，`‹ 返回 hyperkit` 也用 `i-chevron`。

---

## 6. 為了避開 AI 預設，這個專案刻意不做的三件事

### 6.1 零對話介面

這是一個接 LLM 的產品，而 LLM 產品的 AI 預設就是聊天視窗。這個站**沒有任何一個地方**
長得像對話：沒有訊息氣泡、沒有頭像、沒有輸入框等你打字、沒有「思考中」的三個點、
沒有逐字打字機效果、沒有第一人稱語氣（「我發現了…」）。

模型的串流輸出在被渲染之前就先被解析成物件。**原始文字從不以散文形式出現在畫面上。**
連錯誤訊息都是報告用語（「Anthropic 回覆 401 authentication_error」）而不是助理用語
（「抱歉，我無法…」）。

這一條不只是視覺潔癖：它就是產品定位。使用者花錢買的正是「不是聊天回覆」。
如果介面看起來像聊天，這個產品在第一眼就輸給了免費的 Cursor。

### 6.2 零紅綠燈嚴重度

四階嚴重度全部在同一個色相（酸黃綠）的明度階上，
再加上圈記幾何與文字標籤兩個冗餘通道。**沒有紅色、沒有橙色、沒有綠色勾勾。**
連錯誤警示板都沒有第二個色相（見 §2.6）。

代價是：明度階單獨不足以區分相鄰兩級（互相對比只有 1.38 到 1.79）。
所以幾何與文字標籤不是裝飾，是必要的。這個代價是划算的，因為換到的是
一份在黑白列印、在色盲、在螢幕截圖被壓縮之後仍然完整可讀的報告，
而「可以交給別人看」正是這個產品被付錢的理由之一。

### 6.3 零旋轉載入指示器與進度環

沒有 spinner、沒有進度環、沒有骨架屏的呼吸動畫、沒有跑馬燈、沒有任何無限循環。

一個等待狀態在這個站裡只有兩種合法表現：
**一個位置**（掃描游標在探傷帶上的座標）與**一個數字**（`審查中 3/8`、`讀取中 1,842 / 2,422`）。
兩者都必須來自真實訊號（已完成批次數、SSE 收到的 token 數、已雜湊的檔案數），
不得由計時器估算。

理由：旋轉指示器是「我不知道還要多久」的委婉說法。一台探傷儀不會這樣說話，
而且這個產品的信任基礎就是「它告訴你的都是量到的」。假的進度條會把這個基礎拆掉。

---

## 7. 動效預算與招牌時刻

| 動效 | 動機（一句話） | 時長 |
|---|---|---|
| 檢測台 -> 工作台 | 狀態轉換：同一台儀器，現在裝上了東西 | 520ms |
| **擊點（招牌）** | 回饋 + 階層：找到了，而且在這個座標 | 420ms × N |
| 掃描游標 | 狀態：真實進度的位置表示，取代 spinner | 持續，linear |
| 缺陷列落定 | 回饋：清單正在被建立 | 260ms |
| 略過條展開 | 敘事：你的規則今天做了工 | 260ms |
| 歷史刻痕生長 | 敘事：這一根比上一根矮 | 420ms |
| 命中數滾動 | 回饋：你建立的規則命中了 | 320ms |
| hover / active | 回饋 | 110ms |

沒有捲動觸發的進場動畫（工作台本來就不捲動）。
檢測台下方的三段說明**不做 scroll reveal**：它們是三段短文字，
給它們進場動畫只會延遲閱讀，沒有任何一個合法動機能解釋它。
因此本專案不引入 ScrollTrigger，只引入 `gsap.min.js`。

招牌時刻的完整逐格規格在 `docs/INTERACTION.md` §5。

---

## 8. 技術契約（實作前要逐項確認）

| 項目 | 狀態 |
|---|---|
| `window.showDirectoryPicker()` | Chromium 系可用。`'showDirectoryPicker' in window` 偵測 |
| `FileSystemDirectoryHandle` 存 IndexedDB | handle 可結構化複製，可直接 `put` |
| `handle.queryPermission({mode:'read'})` | 回訪時先查，`prompt` 需使用者手勢才能 `requestPermission()` |
| `<input type="file" webkitdirectory>` fallback | Safari / Firefox 皆支援，取得 `File` 的 `webkitRelativePath` |
| `crypto.subtle.digest('SHA-256', buf)` | 需 secure context。`localhost` 與 `https://` 都算 |
| Anthropic 瀏覽器直連 | 必帶 `x-api-key`、`anthropic-version: 2023-06-01`、`anthropic-dangerous-direct-browser-access: true` |
| OpenAI 瀏覽器直連 | `Authorization: Bearer <key>`，`POST /v1/chat/completions` |
| SSE 串流解析 | `fetch` + `response.body.getReader()` + `TextDecoder`，手動切 `data:` 行 |
| `AbortController` | 取消審查與取消雜湊 |
| Google Fonts Chivo / Chivo Mono / Noto Sans TC | 已驗證 HTTP 200 |
| GSAP 3.13.0 CDN | 只引 `gsap.min.js`，不引 ScrollTrigger |
| 全站相對路徑 | `./css/` `./js/` `../index.html` |

## 9. 檔案結構

```
diff-warden/
  index.html            方向契約註解 + SVG sprite + 兩個 stage 的標記
  css/
    tokens.css          唯一顏色來源
    style.css
  js/
    main.js             ES module entry，boot 與 stage 切換
    fs.js               showDirectoryPicker / webkitdirectory 雙路徑
    baseline.js         遞迴列檔、SHA-256、變動比對
    store.js            IndexedDB（specimens / baselines / rules / runs）
    budget.js           token 與花費估算、分批
    pricing.js          單價表，標明取得日期
    provider.js         Anthropic / OpenAI 送出與 SSE 解析
    prompt.js           系統提示與輸出 schema
    fingerprint.js      規則指紋與正規化
    defects.js          缺陷清單渲染、排序、篩選、行號驗證
    strip.js            探傷帶 canvas 與擊點動效
    report.js           Markdown 產出與匯出
    sample.js           nabe-orders 範例報告
    motion.js           GSAP 動效層。招牌時刻「擊點」與上架轉場。
                        main.js 只提供掛載點（window.warden），這一層拆掉站台照常運作
  assets/
  PRODUCT.md
  README.md
  docs/
    INTERACTION.md
    DESIGN-DIRECTION.md
```
