# Mockup Loom - 互動規格（樣式之前必須先完成的一份）

這份文件先於任何 CSS。實作時以本文件為準；本文件與樣式衝突時，改樣式。

介面語言：**英文**。所有 `反引號` 內的字串是逐字出現在介面上的原文，不可翻譯、不可改寫。
全站禁用破折號 `—` 與 `–`，只用一般連字號 `-`。全站禁用 emoji。

---

## 0. 名詞表（實作時的 DOM / 模組命名）

| 名詞 | 意義 | 主要模組 |
|---|---|---|
| Stage | 中央的算圖畫布區，含 WebGL canvas 與置放控制點 | `js/stage.js` |
| Weave Switch | `FLAT` / `WOVEN` 開關，招牌時刻 | `js/weave-switch.js` |
| Design | 使用者的一張設計圖（記憶體中的 ImageBitmap + meta） | `js/designs.js` |
| Template | 一個「形制 + 布色」組合，程式生成 | `js/templates/*.js` |
| Field | 模板的 RGBA 資料貼圖：R=height、G=AO、B=fiber、A=seam | `js/loom/weave.js` |
| Wall | 批次模式的結果牆 | `js/batch.js` |
| Oven | 離屏匯出用的第二個 WebGL2 context | `js/render/oven.js` |
| Loom | 程序生成核心（noise / fbm / domain warp） | `js/loom/noise.js` |

---

## 1. 核心迴圈

### 1.1 進站看到什麼（零資料，第一次到訪）

首屏（1280x800 以上）已經有一張**完整算好的圖**：預設模板 `Heather Tee / Studio Grey` 已經被算出來並顯示在 Stage 上，
布料的皺褶、織紋、環境遮蔽都在，只是**上面還沒有任何設計**。

這不是佔位圖。這是「織機已經上好經線」的狀態。使用者看到的第一件事就是這個工具真的在算圖。

Stage 正下方是 Weave Switch，把手停在左側（`FLAT`），因為沒有設計而處於 disabled 狀態並帶一行說明
`Load a design to compare.`。
把手預設停在左側是刻意的：第一個設計進來時它不會跳位置，使用者的第一個動作永遠是「把它推到右邊」。

左欄最上方是唯一的主要行動：

```
Load the sample set
4 designs, ready to render
```

（按鈕標籤 `Load the sample set`，副標 `4 designs, ready to render`，副標不是按鈕的一部分，在按鈕下方。）

按鈕下方是拖放區與一行隱私說明。

### 1.2 第一個動作

有兩條路，兩條都在首屏內：

- **路徑 A（預期占多數）**：按 `Load the sample set`。
  4 個程式生成的設計立刻出現在左欄，第一個（`Loom Monogram`）自動被套到 Stage 上並算圖。
  Weave Switch 從 disabled 變成 enabled，把手**不移動**，仍停在 `FLAT`。
  **這是刻意的**：讓使用者的下一個動作是把它撥到 `WOVEN`，親手觸發那 0.3 秒。
  同時 Weave Switch 右側出現一行提示：`Press W or drag the switch.` 這行提示在第一次切換後永久消失。

- **路徑 B**：直接把自己的 PNG 拖進來（拖進視窗任何位置都接受）。結果同上。

### 1.3 得到什麼

撥動開關的 0.3 秒內，同一張圖案在同一張布上：
沿皺褶彎折、被環境遮蔽壓暗、被織紋咬出纖維感、邊緣被縫線吃掉一點。
右下角浮出一行判詞：`Nobody asks if this one is a composite.`

接著使用者會做的事（按實際發生機率排序，介面必須讓這三件事都在一次點擊之內）：

1. 來回撥 5 到 6 次開關（這是轉換發生的地方，所以開關必須可以被快速連續撥動而不積 bug）
2. 換模板（左欄第二區）
3. 抓住光源盤轉一圈看陰影跟著轉

然後：切到 `Batch` 模式，勾選 4 個設計 x 4 個模板，按 `Render 16`，牆開始長。
按 `Export ZIP`，先看到資料夾樹，再拿到檔案。

### 1.4 為什麼會回來或分享

**回來**：這是流程工具不是玩具。每一次上新品、每一次改設計、每一次要換平台規格尺寸，都要再跑一次。
回訪成本必須是零：不用登入、不用等載入、預設值記得上次的選擇（模板、光源、混合模式、命名規則、輸出尺寸都存在 localStorage，設計本身不存）。

**分享**：分享的觸發點是那個開關，不是成品。
賣家會在社群裡說「這個免費的還會跟著皺褶彎」。所以開關必須是整個介面上視覺權重最高的控制項，
而且必須在首屏、在 Stage 正下方、不需要滾動。

---

## 2. 資訊架構

### 2.1 版面（>= 1280px）

```
+------------------------------------------------------------------+
| TopBar  64px                                                     |
| Mockup Loom          [Single | Batch]        [Export ZIP]  [Hub] |
+------------+--------------------------------------+--------------+
|            |                                      |              |
| LEFT RAIL  |            STAGE                     | RIGHT RAIL   |
| 300px      |            1fr                       | 320px        |
|            |   +------------------------------+   |              |
| Designs    |   |                              |   | Placement    |
|  dropzone  |   |    WebGL canvas on the       |   | Blend        |
|  thumbs    |   |    neutral stage grey        |   | Light        |
|            |   |                              |   | Output       |
| Templates  |   +------------------------------+   |              |
|  6 forms   |                                      |              |
|  colorways |     [ FLAT (=====O) WOVEN ]          |              |
|            |     verdict line                     |              |
+------------+--------------------------------------+--------------+
| WALL (Batch 模式才存在，在 Stage 下方；Single 模式此區不存在)      |
+------------------------------------------------------------------+
```

**閱讀順序（設計上刻意的視線路徑）**：
Stage 上的圖 → 正下方的 Weave Switch → 左欄的 `Load the sample set` → 左欄模板 → 右欄控制 → TopBar 的 Export。

Stage 佔據視覺中心且面積最大，因為使用者要看的是結果不是控制項。
兩側 rail 用 `--grey-100` 背景與 1px hairline 與 Stage 分開，沒有卡片、沒有圓角、沒有陰影。

**首屏必須包含**（1280x800，不滾動）：
TopBar、左欄的主要行動與拖放區、Stage 上已算好的一張圖、Weave Switch、右欄的 Light 盤。
Output 區可以在右欄需要捲動才看到，其餘不行。

### 2.2 版面（768px 到 1279px）

- 兩側 rail 合併成 Stage **下方**的一條分頁式抽屜，四個分頁：`Designs` / `Templates` / `Adjust` / `Output`。
- Stage 佔滿寬度，高度 `min(56dvh, 520px)`。
- Weave Switch 依然緊貼 Stage 下緣，在抽屜上方。順序不可改。
- TopBar 的模式切換保留，`Export ZIP` 縮成只有文字沒有計數。

### 2.3 版面（< 768px）

- 單欄堆疊：TopBar（高度 56px，模式切換移到 Stage 下方）→ Stage（`min-h: 42dvh`）→ Weave Switch → 分頁抽屜 → Wall。
- 拖放不可用（行動裝置沒有拖放），改成 `Add designs` 的檔案選擇按鈕，文案改為 `Add designs` 而非 `Drop designs here`。
- Placement 的拖曳改為單指移動、雙指縮放與旋轉；數值輸入框依然存在。
- Light 盤最小 132px 直徑，低於此改為兩個滑桿（`Azimuth` / `Elevation`）。
- 批次上限提示：超過 60 張時顯示 `Large batches can be slow on phones. Consider 60 or fewer.`（不阻擋，只提示）

### 2.4 全站只有兩個模式，沒有第三層導覽

`Single` 與 `Batch` 是 TopBar 上的 segmented control。切換不清空狀態：
在 Single 選好的模板與光源，切到 Batch 之後是已勾選的預設。這是同一份狀態的兩個檢視。

---

## 3. 每一個可互動物件的完整狀態機

格式：**進入事件 → 視覺 → 離開事件**。所有時間值引用 `css/tokens.css` 的 `--dur-*`。

### 3.1 Weave Switch（招牌控制項）

軌道 220x44，圓角 0，把手 44x44 實心。整個元件是一個 `<button role="switch" aria-checked>`。

| 狀態 | 視覺 | 進入 | 離開 |
|---|---|---|---|
| `empty`（無設計） | 軌道 `--grey-200` 填充，把手 `--grey-300`，兩個標籤都 `--grey-500`。右側附一行 `Load a design to compare.` | 頁面載入且 `designs.length === 0` | 第一個設計就緒 |
| `idle-flat` | 把手在左，標籤 `FLAT` 為 `--ink` wght 800，`WOVEN` 為 `--grey-500` wght 500。軌道 `--grey-200` | 切到 flat 的 timeline 反轉結束 | hover / focus / 點擊 |
| `idle-woven` | 把手在右，`WOVEN` 為 `--brick-ink` wght 800，`FLAT` 為 `--grey-500`。軌道左側 `--brick` 填到把手位置 | 切到 woven 的 timeline 正放結束 | 同上 |
| `hover` | 把手上緣浮出 2px 的 `--olive` 頂邊；游標 `pointer`。無位移、無縮放（避免誤導成已切換） | `pointerenter` | `pointerleave` |
| `focus-visible` | 元件外圍 2px `--grey-000` + 再外 2px `--brick` 的雙色 ring（保證在任何背景上可見） | 鍵盤 focus | blur |
| `active` | 把手 `scale(0.96)`，`--dur-tap` | `pointerdown` | `pointerup` / `pointercancel` |
| `transitioning` | GSAP timeline 執行中。**不 disable**，重複點擊直接反轉現有 timeline（`tl.reversed(!tl.reversed())`），不排隊、不累積 | 點擊 / `W` 鍵 | timeline 完成 |
| `disabled` | 軌道與把手皆 `--grey-300`，標籤 `--grey-400`，`cursor: not-allowed`，`aria-disabled="true"`。旁邊必有一行說明原因 | 無設計，或降級模式（無 WebGL2） | 條件解除 |

**招牌時刻的完整規格見第 8 節。**

### 3.2 Design 拖放區（Dropzone）

| 狀態 | 視覺 | 進入 | 離開 |
|---|---|---|---|
| `idle` | 1px `--rule-firm` 虛線框（`dashed`，2px dash / 3px gap），內文 `Drop designs here` + 次行 `PNG, JPG or WEBP. Transparent PNG works best.` | 預設 | dragover |
| `hover` | 虛線變 `--olive`，內文 `--ink` | `pointerenter` | `pointerleave` |
| `dragover` | 整個視窗覆蓋一層 `--scrim`，拖放區框變 2px 實線 `--olive`，內文換成 `Release to add` | `dragenter`（掛在 window 上，全視窗接受） | `dragleave` / `drop` |
| `loading` | 每個檔案一列，列上是檔名（Fragment Mono）與一條 2px 高的 `--olive` 決定式進度線（不是不定式 spinner） | `drop` / 檔案選擇 | 解碼完成 |
| `success` | 縮圖出現在下方清單，最新的一個帶 `--olive` 左側 2px 標記 400ms 後淡出 | `createImageBitmap` 成功 | 400ms 後 |
| `error` | 該列變 `--brick-ink` 文字 + 1px `--brick` 底線，右側一個 `Remove` 文字按鈕。錯誤文案見第 6 節 | 解碼失敗 / 格式不符 / 過大 | 使用者按 `Remove` |
| `empty`（清單） | 不畫空框。清單區直接不存在，只留拖放區與主要行動按鈕 | `designs.length === 0` | 有設計時 |
| `disabled` | 批次算圖進行中時，拖放區壓暗至 `--grey-300` 並顯示 `Rendering. Add designs when it finishes.` | 批次開始 | 批次結束或取消 |

### 3.3 Design 縮圖（清單中的每一個）

- `idle`：72x72 棋盤格底（4px 格，`--grey-000` / `--grey-100`）顯示透明區，下方一行檔名（截斷至 18 字元 + `...`）。
- `hover`：底部浮出 `Use` 與 `Remove` 兩個文字動作，不是圖示。
- `selected`（Single 模式）：左側 3px `--brick` 實心標記 + 檔名 wght 700。同時只有一個 selected。
- `checked`（Batch 模式）：左上角一個 14x14 方形勾選標記，未勾為 1px `--rule-firm` 空心方，已勾為 `--olive` 實心方加白色勾（勾是畫出來的 SVG path，非 Unicode）。
- `focus-visible`：雙色 ring 同 3.1。
- `active`：`scale(0.98)`，`--dur-tap`。
- `error`：解碼失敗的縮圖顯示 1px `--brick` 外框與斜線填充，不顯示破圖 icon。
- `disabled`：批次進行中，全部縮圖 `pointer-events: none` 且 40% 亮度壓暗。

**鍵盤**：清單是 `role="listbox"`（Single）或 `role="group"` + checkbox（Batch）。
上下鍵移動、`Space` 選取/勾選、`Delete` 移除（移除前不跳 modal，直接移除並在 toast 提供 `Undo`，8 秒）。

### 3.4 Template 選擇器

6 個形制（`Tee`、`Hoodie`、`Tote`、`Mug`、`Poster`、`Sticker`），每個形制底下有布色（colorway）。
形制是一列 6 個 56x56 的縮圖（形制的剪影，用該形制的實際算圖縮小），布色是被選中形制下方展開的一排 24x24 色塊。

| 狀態 | 視覺 |
|---|---|
| `idle` | 縮圖 1px `--rule-hair` 外框，下方形制名（12px sentence case） |
| `hover` | 外框變 `--rule-firm`，形制名 `--ink` |
| `selected` | 外框 2px `--olive`，形制名 wght 700。選取框的位置以 GSAP 從舊位置 tween 到新位置（`--dur-ui`，`--ease-out`），不是瞬間跳 |
| `focus-visible` | 雙色 ring |
| `generating` | 該模板的 field 還在生成時，縮圖顯示 1px `--olive` 的頂邊由左往右填滿（決定式），不遮住已生成的部分 |
| `checked`（Batch） | 同 3.3 的方形勾選標記，位置在縮圖左上 |
| `disabled` | 不存在。所有模板永遠可用。這是產品承諾 |

**色塊（colorway）**：24x24 實心方，選中者外圈 2px `--ink` 且中央一個 8x8 的 `--grey-000` 方孔（形狀語言：打孔卡的孔）。
色塊本身是布料顏色，不是介面色，所以它們是唯一容許出現在 token 表以外顏色的地方，**必須集中定義在 `js/templates/colorways.js`，不得寫進 CSS**。

### 3.5 Stage 上的設計置放控制（Placement handles）

設計在 Stage 上有一個置放框：4 個角落的縮放把手（8x8 實心方）、1 個上方的旋轉把手（10px 圓，這是全站唯二的圓形，因為它是實體握把）。

| 狀態 | 視覺 | 說明 |
|---|---|---|
| `idle` | 置放框 1px `--brick`，把手 `--brick` 實心。框以 40% 不透明度顯示，不搶走圖的注意力 | |
| `hover-body` | 框變 100% 不透明，游標 `move` | |
| `dragging` | 框 100%，Stage 上疊一層 1px 的三分法參考線（`--grey-000` 30%），釋放後 200ms 淡出。同時 Stage 邊緣顯示目前 `x` `y` 的數值（Fragment Mono，右下角） | 拖曳中即時重算，位移一律走 shader，不動 DOM 幾何 |
| `scaling` | 對角把手為錨點；按住 `Shift` 解除等比（預設等比）。右下角數值改顯示 `scale` 百分比 | |
| `rotating` | 顯示一條從中心到旋轉把手的 1px 引線與角度數值；按住 `Shift` 吸附 15 度 | |
| `out-of-print-area` | 設計超出模板的可印範圍時，超出的部分在畫面上以 25% 不透明度顯示，並在 Stage 下緣出現 `Part of the design falls outside the print area.` + `Fit to area` 文字按鈕 | 這是警告不是錯誤，不阻擋匯出。實際輸出會被 print mask 裁掉，所以必須先講 |
| `focus-visible` | 置放框變 2px 並顯示雙色 ring；此時鍵盤可操作 | |
| `disabled` | 無設計時整個置放框不存在（不是壓暗，是不存在） | |

### 3.6 Light Dial（光源方位盤）

一個 148px 直徑的盤：外圈是 1px `--rule-firm` 的圓，圓周上有 12 個刻度（每 30 度，正北較長），
一個 14px 的實心圓握把在圓周上（pointer capture 直接算角度，不用 Draggable），盤中心顯示目前方位角數值（Fragment Mono）。
盤下方是 `Elevation` 滑桿（0 到 90 度）與 `Intensity` 滑桿（0 到 100）。

| 狀態 | 視覺 |
|---|---|
| `idle` | 握把 `--olive` 實心，盤內以一道極淡的 `--grey-000` 扇形表示目前光的方向 |
| `hover` | 握把外圈 2px `--olive` 40%，游標 `grab` |
| `dragging` | 游標 `grabbing`，握把 `scale(1.15)`，扇形亮度提高，中心數值即時更新。**Single 模式即時全解析度重算；Batch 模式拖曳中只重算可視範圍內的卡片且降到 1/4 解析度，放開後 300ms 補算全部** |
| `focus-visible` | 盤外圍雙色 ring；左右方向鍵 ±5 度，`Shift` + 方向鍵 ±1 度，`Home` 回到 315 度（預設，左上打光） |
| `active` | 握把 `scale(0.94)` `--dur-tap` |
| `disabled` | 降級模式（無 WebGL2）時整個盤壓暗並顯示 `Lighting needs WebGL2.` |

**預設值**：`azimuth 315`（左上）、`elevation 42`、`intensity 70`。左上打光是攝影棚慣例，不是隨便選的。

### 3.7 Blend 選擇器（segmented control）

4 段：`Normal` / `Multiply` / `Screen` / `Overlay`。預設 `Multiply`。

| 狀態 | 視覺 |
|---|---|
| `idle` | 一整條 1px `--rule-firm` 外框，內部以 1px 分隔線切成 4 段，文字 `--grey-600` |
| `hover` | 該段背景 `--grey-000`，文字 `--ink` |
| `selected` | 該段背景 `--ink`，文字 `--grey-000`。選取背景的位置以 GSAP tween 移動（`--dur-ui`） |
| `focus-visible` | 該段雙色 ring（ring 貼齊該段而非整條） |
| `disabled` | 無設計時整條壓暗；`Screen` 在深色布料上會幾乎無效，此時不 disable，改在下方顯示 `Screen has little effect on dark fabric.` |

**鍵盤**：`role="radiogroup"`，左右方向鍵在段之間移動並即時套用（不需要再按 Enter）。

### 3.8 主要按鈕（`Load the sample set`、`Render N`、`Export ZIP`）

| 狀態 | 視覺 |
|---|---|
| `idle` | `--olive` 實心，文字 `--grey-000`，高度 40px，圓角 0，無陰影 |
| `hover` | 背景 `--olive-deep`。無位移 |
| `active` | `translateY(1px)` + 背景 `--olive-deep`，`--dur-tap` |
| `focus-visible` | 雙色 ring |
| `loading` | 背景不變，文字換成進行中的實數（例：`Rendering 34 / 160`），按鈕左緣起一條 3px `--grey-000` 40% 的決定式進度條沿按鈕底部推進。按鈕不 disable，改為 `Cancel` 的次要行動出現在其右側 |
| `success` | 文字暫時換成 `Saved mockup-loom-2026-08-03.zip`，1.6 秒後恢復。無勾勾動畫、無彈跳 |
| `error` | 按鈕恢復 idle，錯誤以行內文字出現在按鈕**下方**（不是 toast），`--brick-ink`，附一個可執行的復原動作 |
| `disabled` | 背景 `--grey-300`，文字 `--grey-500`，`aria-disabled="true"`。**旁邊必定有一行說明為什麼**，永不出現無理由的死按鈕 |

`Export ZIP` 的 disabled 理由文案：
- 無成果時：`Render something first.`
- 批次進行中：`Wait for the render to finish.`

### 3.9 Batch Wall 的卡片

| 狀態 | 視覺 |
|---|---|
| `queued` | 卡片位置已存在（不是後來才插入，避免版面跳動），內容是棋盤格底 + 中央一條 1px `--rule-hair` 橫線，下方檔名（Fragment Mono，`--grey-500`） |
| `rendering` | 頂邊一條 2px `--olive` 由左至右推進 |
| `done` | 圖出現。GSAP：`blur 12px -> 0`、`scale 0.94 -> 1`、`autoAlpha 0 -> 1`，`--dur-card`，`expo.out`。每張卡片各自在 GPU 算完的那一刻觸發，不是固定 stagger |
| `hover` | 底部浮出 `Open` 與 `Download` 兩個文字動作 + 該卡的 render 設定摘要（模板、混合、光源角度） |
| `focus-visible` | 雙色 ring |
| `failed` | 卡片內容換成 1px `--brick` 外框與斜線填充，下方文字 `Render failed` + `Retry` 文字按鈕 |
| `empty`（整面牆） | 見 4.2 |

---

## 4. 首次到訪與 empty state

### 4.1 Stage 的 empty state（沒有設計）

**不是空白，不是「暫無資料」。** 是一張已經算好的布。

畫面內容：
- Stage 上是 `Heather Tee / Studio Grey` 的完整算圖：布料皺褶、織紋、領口羅紋、下襬縫線、環境遮蔽全在。
- 可印範圍以 1px `--grey-000` 40% 的虛線框標出，框內偏下一行小字：`Print area`。
- Stage 左下角一枚小標籤（不是 pill，是一行 11px 文字加一條 1px 上緣線）：
  `Procedural template - generated, not photographed. Seed 4417`
  （seed 是真實的生成種子，換模板會變，不是假數字。）

這個 empty state 本身就是產品證據：**在你還沒給我任何東西之前，我已經在算圖了。**

### 4.2 Wall 的 empty state（Batch 模式，尚未算過）

不畫空卡片格。畫的是**即將發生的事的實數**：

```
16 renders
4 designs x 4 templates

[ Render 16 ]
```

（`16 renders` 是 display-2 級距，`4 designs x 4 templates` 是 13px Fragment Mono。
數字隨勾選即時變動，變動時數字用 GSAP `snap: 1` 的 0.2 秒滾動，因為這是「你選的東西造成的結果」的即時回饋。）

若尚未勾選任何東西：

```
Nothing selected
Pick designs on the left and templates below them.

[ Select all 4 x 6 ]
```

按鈕 `Select all 4 x 6` 是真的可按的行動，數字反映實際清單長度。

### 4.3 Design 清單的 empty state

不存在空清單容器。只有拖放區與主要行動。清單區塊在第一個設計進來時才出現，
出現時整個左欄的 Templates 區以 GSAP `y` tween 往下讓位（`--dur-panel`，`--ease-out`），
不是瞬間跳動。這是唯一的版面位移動效，理由是「清單長出來了」需要被看見。

---

## 5. 鍵盤路徑

### 5.1 Tab 順序（Single 模式，>= 1280px）

```
1  Skip to stage（隱藏連結，focus 時出現在左上）
2  Wordmark / 回 Hyperkit hub 的連結
3  Mode segmented control（Single / Batch，左右方向鍵切換）
4  Export ZIP
5  Load the sample set
6  Dropzone（Enter 或 Space 開檔案選擇）
7  Design 清單（單一 tab stop，內部用方向鍵）
8  Template 形制列（單一 tab stop，方向鍵移動）
9  Colorway 色塊列（單一 tab stop，方向鍵移動）
10 Stage 的置放框（Enter 進入編輯模式，Esc 離開）
11 Weave Switch
12 Placement 的 X 數值
13 Placement 的 Y 數值
14 Placement 的 Scale 數值
15 Placement 的 Rotation 數值
16 Fit to area
17 Blend segmented control
18 Light dial
19 Elevation 滑桿
20 Intensity 滑桿
21 Output size 選單
22 Naming pattern 輸入框
23 Folder grouping segmented control
```

Batch 模式在 11 之後插入：Wall 的卡片網格（單一 tab stop，方向鍵移動）與 `Render N`。

**複合元件一律只佔一個 tab stop**（roving tabindex），否則 6 個模板加 4 個布色就會吃掉 10 次 Tab。

### 5.2 快捷鍵

只有 8 個。全部在 `?` 覆蓋層列出。焦點在輸入框內時全部失效。

| 鍵 | 動作 | 理由 |
|---|---|---|
| `W` | 切換 Weave Switch | 招牌動作要有鍵盤入口 |
| `F`（按住） | 暫時顯示 FLAT，放開回到原狀態 | 快速對照，不改變狀態 |
| `1` 到 `6` | 切換模板形制 | 比較模板是高頻動作 |
| `B` | 循環 Blend 模式 | |
| `E` | Export ZIP | |
| `R` | Batch 模式：開始算圖 | |
| `?` | 開/關快捷鍵覆蓋層 | |
| `Esc` | 見 5.3 | |

方向鍵在 Stage 置放框 focus 時：
- 方向鍵：移動 1px
- `Shift` + 方向鍵：移動 10px
- `[` / `]`：旋轉 -1 / +1 度（`Shift` 為 15 度）
- `-` / `=`：縮放 -1% / +1%

### 5.3 Esc 的行為（由內而外，一次只退一層）

1. 若 `?` 覆蓋層開著 → 關閉它，焦點回到觸發元素
2. 否則若正在拖曳（設計、光源盤、色塊托盤） → **取消該次拖曳並回復拖曳前的數值**（不是套用）
3. 否則若 Stage 置放框在編輯模式 → 離開編輯模式，focus 停在置放框
4. 否則若 colorway 托盤展開 → 收合
5. 否則若批次進行中 → 不做任何事（避免誤觸取消掉 2 分鐘的運算；取消必須點 `Cancel`）
6. 否則 → 不做任何事

### 5.4 焦點管理

- 全站禁止 `outline: none` 而不給替代。焦點環是 2px `--grey-000` 內圈 + 2px `--brick` 外圈的雙色環，
  offset 2px。雙色是因為焦點可能落在 Stage 上任意亮度的算圖之上。
- `:focus-visible` 才顯示環，`:focus` 不顯示（滑鼠點擊不該出現環）。
- 沒有任何 focus trap，因為**全站沒有 modal**。`?` 覆蓋層是一個 `role="dialog"` 但它只有一個 Esc 出口且不擋住底下的內容判讀，
  焦點循環限制在覆蓋層內。這是唯一需要保護焦點的地方，所以是唯一的覆蓋層。

---

## 6. 失敗路徑：全部列舉，每一條有文案與復原

文案原則：**說出問題 + 說出下一步**。不說 `Oops`、`Something went wrong`、`Error 500`。

### 6.1 瀏覽器不支援 WebGL2

**偵測**：`canvas.getContext('webgl2')` 回傳 null，或缺少 `EXT_color_buffer_float`（本站不需要 float buffer，所以只檢查 context）。

**行為**：進入 **Reduced mode**。不是壞掉，是少了一個功能。
- TopBar 下方出現一條 32px 高的橫幅（`--grey-800` 底，`--grey-000` 文字，非紅色，因為這不是錯誤）：
  `This browser has no WebGL2, so displacement is off. Placement, blending and export still work.`
  右側一個 `What changed` 文字按鈕，展開三行說明：
  ```
  The design sits flat on the fabric.
  Fabric shading and shadows are baked, not lit.
  Everything else, including batch and ZIP export, works.
  ```
- 合成改走 Canvas 2D：`drawImage` 置放 + `globalCompositeOperation` 對應 blend 模式 + 預先烘焙的 AO 層以 `multiply` 疊上。
- Weave Switch 進入 `disabled` 並顯示 `Needs WebGL2.`
- Light dial 進入 `disabled` 並顯示 `Lighting needs WebGL2.`
- 匯出仍然可用，且 MANIFEST.txt 額外寫一行 `Rendered in reduced mode (no WebGL2): displacement disabled.`

**不做的事**：不擋住整站、不叫使用者換瀏覽器、不顯示瀏覽器 logo 清單。

### 6.2 WebGL context lost

**偵測**：`webglcontextlost` 事件。

**行為**：
- 立刻 `preventDefault()`（讓 context 可以被還原）。
- Stage 顯示 `The graphics context was lost. Restoring.` 並保持最後一張成功的算圖在畫面上（用 2D canvas 快照墊著，畫面不會變黑）。
- 監聽 `webglcontextrestored`，重建所有 texture 與 program，重算目前這張，橫幅換成 `Restored.` 並 2 秒後消失。
- 若 6 秒內未還原：橫幅換成 `Could not restore the graphics context.` + `Reload the page` 按鈕。
- **批次進行中發生時**：暫停佇列，已完成的 blob 全部保留，還原後從中斷的那一張繼續。橫幅：
  `Paused at 128 of 320. Finished renders are safe.`

### 6.3 檔案格式錯誤

| 情況 | 文案 | 復原 |
|---|---|---|
| 非圖片檔（例如 `.psd` `.ai` `.pdf`） | `handcut-logo.psd is not an image the browser can read. Export it as PNG.` | 該列有 `Remove`；其餘檔案照常匯入 |
| SVG | `Vector SVG needs a fixed size to rasterize. Export it as a PNG at 2000 px wide.` | 同上 |
| 圖片解碼失敗（檔案損毀） | `warp-grid.png could not be decoded. The file may be damaged.` | 同上 |
| 尺寸過大（任一邊 > 8192px） | `shuttle.png is 12000 px wide. The maximum is 8192 px.` | 提供 `Downscale and add` 動作，按下就用 `createImageBitmap` 的 `resizeWidth` 縮到 8192 再匯入 |
| 尺寸過小（任一邊 < 200px） | `mark.png is 96 px wide. It will look soft at export size.` | 這是**警告不是錯誤**，檔案照常匯入，縮圖角落留一個 1px `--brick` 的三角標記 |
| 檔案 > 40MB | `banner.png is 62 MB. Files over 40 MB are skipped to keep the tab responsive.` | 該列有 `Add anyway` 供堅持的使用者，按下就試 |

錯誤一律**行內顯示在該檔案那一列**，不用 toast，因為使用者可能一次丟 50 個檔案，50 個 toast 是災難。
若一批之中有超過 3 個錯誤，清單頂端加一行摘要：`4 of 50 files were skipped.` + `Show only skipped` 篩選。

### 6.4 記憶體與規模

| 情況 | 行為 |
|---|---|
| 批次 > 400 張 | 按下 `Render N` 前先在按鈕下方顯示 `320 renders at 2000 x 2000 will use roughly 1 GB of memory. Render in two passes if the tab slows down.` 不阻擋 |
| 批次 > 2000 張 | 阻擋。`2400 renders is too many for one pass. Deselect some designs or templates.` 並顯示目前的 N x M |
| `createImageBitmap` 拋出 out of memory | 該張標記 `failed`，佇列繼續。全部結束後顯示 `12 of 320 renders ran out of memory. Retry them?` + `Retry 12` |
| ZIP 總大小 > 2GB | 匯出前擋下。`This ZIP would be about 2.4 GB. Split it: export by design, then by template.` 並提供 `Export first half` 與 `Export second half` 兩個真的能用的行動 |

### 6.5 localStorage

**只存設定，永不存設計。** 存的內容：最後選的模板與布色、光源三個值、blend、輸出尺寸、命名樣板、資料夾分組、`?` 提示是否已看過。
全部加起來 < 1KB。

| 情況 | 行為 |
|---|---|
| `setItem` 拋出 `QuotaExceededError` | 靜默重試一次（先 `removeItem` 舊 key）。再失敗則在右欄底部顯示一行 `Settings could not be saved. Your work on screen is not affected.`，不擋任何操作 |
| localStorage 被停用（隱私模式） | 完全不提示。整站以預設值運作。不顯示任何「請開啟 cookie」的字樣 |
| 讀到損毀的 JSON | `try/catch` 後直接用預設值，並清掉該 key |

### 6.6 離開頁面

只有在「有已算好但尚未匯出的成果」時，才註冊 `beforeunload`。
瀏覽器會顯示自己的原生對話框（文案無法自訂，這是規範）。
沒有未匯出成果時**不註冊**，避免每次重整都被攔。

### 6.7 匯出

| 情況 | 文案 |
|---|---|
| 使用者在寫 ZIP 途中按 `Cancel` | 立刻停止，已產生的 blob 釋放，按鈕回到 idle。無確認對話框 |
| `URL.createObjectURL` 失敗 | `The download could not start. Try exporting fewer files.` |
| 命名樣板產生重複檔名 | 自動加 `-2`、`-3` 後綴，並在 MANIFEST.txt 記錄。同時在命名樣板輸入框下方顯示 `Your pattern makes duplicate names. Add {template} to keep them unique.` |
| 命名樣板含非法字元（`/ \ : * ? " < > \|`） | 輸入框即時顯示 `These characters are removed from file names: / \ : * ? " < >` 並顯示樣板套用後的實際結果預覽 |

---

## 7. 匯出的資料夾樹（使用者按下之前先看到）

按 `Export ZIP` 後，右欄下方就地展開一個樹狀預覽（不是 modal）。
樹用 GSAP 逐行畫出來（每行 `autoAlpha 0 -> 1` + `x -6 -> 0`，`stagger 0.02`，`--ease-out`），
理由是「讓使用者看清楚他會拿到什麼」，這是敘事不是裝飾。超過 40 行時只畫前 40 行加一行 `and 480 more files`。

```
mockup-loom-2026-08-03/
  MANIFEST.txt
  by-design/
    loom-monogram/
      loom-monogram__tee-studio-grey__2000x2000.png
      loom-monogram__tote-natural__2000x2400.png
      ...
    warp-weft-grid/
      ...
```

- 根資料夾：`mockup-loom-{YYYY-MM-DD}`
- 分組（segmented control，3 選 1）：`By design`（預設） / `By template` / `Flat`
- 命名樣板（文字輸入框，預設 `{design}__{template}__{w}x{h}`）
  可用 token：`{design}` `{template}` `{form}` `{colorway}` `{w}` `{h}` `{blend}` `{index}`
  輸入框下方永遠顯示第一個檔案套用後的實際結果（即時），例如：
  `loom-monogram__tee-studio-grey__2000x2000.png`
- MANIFEST.txt 內容（純文字，非 JSON，因為要給人看）：
  ```
  Mockup Loom export - 2026-08-03
  Templates in this export are procedurally generated (noise-based), not photographic.

  Light      azimuth 315, elevation 42, intensity 70
  Blend      Multiply
  Output     2000 x 2000

  loom-monogram__tee-studio-grey__2000x2000.png
    design    loom-monogram (sample)
    template  Tee / Studio Grey (seed 4417)
    placement x 0.500  y 0.442  scale 0.340  rotation 0
  ...
  ```

**ZIP 實作**：自己寫（`js/export/zip.js`），STORE 方法（method 0，不壓縮），
因為 PNG 已經是 deflate 過的資料，再壓一次只換來 CPU 時間。
需要：local file header、central directory、EOCD、CRC32 查表。
**不引入任何第三方壓縮函式庫**，避免 CDN 路徑風險。

---

## 8. 招牌動效時刻：`FLAT` -> `WOVEN`

### 8.1 觸發

點擊 Weave Switch、點擊任一側標籤、按 `W`。三個入口共用同一個函式。

### 8.2 這 0.3 秒內同時發生的事

一條 GSAP timeline，建立一次，之後只 `play()` / `reverse()`，永不重建。
timeline 的 `onUpdate` 統一呼叫 `renderer.requestFrame()`，所以 shader 只在有變化時重畫。

```js
// js/weave-switch.js（規格，非最終程式碼）
const u = renderer.uniforms;              // 純物件，GSAP 直接 tween 它的數值欄位
const tl = gsap.timeline({
  paused: true,
  onUpdate: renderer.requestFrame,
  defaults: { ease: "power2.inOut" }
});

tl.to(knobEl,   { x: TRAVEL, duration: 0.42, ease: "back.out(2.2)" }, 0)
  .to(u,        { displaceScale: 1.0, duration: 0.30 }, 0)
  .to(u,        { shadowMix:     0.85, duration: 0.30, ease: "power2.out" }, 0)
  .to(u,        { fiberMix:      1.0,  duration: 0.24, ease: "power1.out" }, 0.04)
  .to(u,        { seamBite:      1.0,  duration: 0.30 }, 0)
  .to(labelFlat,  { autoAlpha: 0.38, duration: 0.18 }, 0)
  .to(labelWoven, { autoAlpha: 1.00, duration: 0.18 }, 0)
  .fromTo(verdictEl,
     { autoAlpha: 0, y: 6 },
     { autoAlpha: 1, y: 0, duration: 0.26, ease: "power3.out" }, 0.18);
```

`TRAVEL` = 軌道寬 - 把手寬 = 176px。`back.out(2.2)` 的超彈是**唯一**允許超調的動效，
因為它模擬的是實體撥桿過中點後被彈簧帶到底的手感。

### 8.3 shader 端 `u_displaceScale` 同時閘控五件事

這是「差異必須肉眼可見」的實作保證。同一個 0 到 1 的純量同時：

1. **UV 位移量**：設計的取樣座標沿高度場梯度偏移
   `duv += vec2(dhdx, dhdy) * u_dispAmount * u_displaceScale;`
   再加一個法線視差項讓圖案「陷進」皺褶：
   `duv += (N.xy / max(N.z, 0.2)) * h * u_parallax * u_displaceScale;`
2. **設計對漫射光的反應**：`ink *= mix(1.0, diffuse, u_displaceScale);`
3. **環境遮蔽壓在墨上**：`ink *= mix(1.0, ao, 0.9 * u_displaceScale);`
4. **織紋咬進墨裡**：`ink *= mix(1.0, 0.88 + 0.24 * fiber, u_displaceScale * u_weaveBite);`
5. **縫線吃邊**：`inkAlpha *= mix(1.0, 1.0 - seam * 0.85, u_displaceScale);`

**布料本身的打光永遠開著，不受這個純量影響。**
所以左右對照是誠實的：改變的只有印花，不是整張圖的算圖品質。
若布料的打光也跟著關掉，`FLAT` 那側會看起來像「沒算完」，那就變成假的對照。

### 8.4 校正卡（開發時的驗收工具）

`js/dev/calibration.js`：一個程式生成的等距直線網格 PNG（20x20 格），
以 `?calib=1` 載入時自動套用。
**驗收標準**：`WOVEN` 時網格線在皺褶處必須明顯彎曲，肉眼可辨；
`FLAT` 時必須完全筆直。若彎曲量不明顯，調高 `u_dispAmount` 直到明顯，
但不得大到讓網格線斷裂或自我交疊。這個檔案不進正式流程，僅開發時使用。

### 8.5 第二個高潮：Batch Wall + 光源掃過

每張卡片在自己的 GPU 工作完成的那一刻各自進場（規格見 3.9 `done`），
節奏因此跟著真實運算速度走，不是固定 stagger。實作用 `gsap.quickTo` 快取的 setter 避免每張都建立新 tween。

光源盤拖曳時，可視範圍內的卡片全部同時重算（1/4 解析度），
效果是整面牆的陰影一起轉向。這個效果的**動機**是：證明每一張都是真的在算，不是縮圖快取。

### 8.6 `prefers-reduced-motion`

用 `gsap.matchMedia()`：

```js
const mm = gsap.matchMedia();
mm.add({
  reduce: "(prefers-reduced-motion: reduce)",
  ok:     "(prefers-reduced-motion: no-preference)"
}, (ctx) => {
  if (ctx.conditions.reduce) {
    // 開關改為瞬間切換：tl.progress(target) 直接跳
    // 判詞直接顯示，無 y 位移
    // 卡片直接出現，無 blur、無 scale
    // 選取框、面板讓位全部改為瞬間
    return;
  }
  /* 完整動效在這裡 */
});
```

**reduced motion 下的功能完整性不打折**：位移、光源、批次、匯出全部照常。
少的只有過場。內容在 CSS 中一律預設可見，沒有任何 `opacity: 0` 等 JS 來救。

---

## 9. 效能與排程規則（影響互動手感，所以寫在這裡）

- **一個互動 context**（`gl-stage`，`preserveDrawingBuffer: false`）
  **一個匯出 context**（`gl-oven`，`preserveDrawingBuffer: true`，尺寸依輸出設定調整）。
  全站永遠只有這 2 個 WebGL context，不因卡片數量增加。
- Wall 上的卡片是 `<img>`（來自 blob URL），不是 canvas。所以 500 張卡片不會有 500 個 context。
- 算圖排程：`requestAnimationFrame` 驅動，每 frame 最多完成 1 張輸出。
  若某 frame 的耗時 > 24ms，下個 frame 跳過（讓 UI 呼吸）。
- Field 貼圖（模板的 noise 生成）只在第一次選到該模板時生成，之後快取在 `Map` 裡。
  生成期間顯示 3.4 的 `generating` 狀態。單一模板的生成必須 < 400ms（1024x1024，4 個 octave）；
  超過就降 octave 而不是讓使用者等。
- 拖曳（設計置放、光源盤）期間，Stage 以 `devicePixelRatio` 上限 1.0 算，放開後 120ms 內補算到 `min(dpr, 2)`。
- blob URL 在卡片被移除或批次重跑時必須 `URL.revokeObjectURL`，否則 500 張圖的記憶體不會釋放。

---

## 10. 文案總表（逐字，不可改寫）

### 主要行動
- `Load the sample set`
- `Render 16`（數字為實數）
- `Export ZIP`
- `Cancel`
- `Retry 12`（數字為實數）
- `Fit to area`
- `Select all 4 x 6`（數字為實數）

### 標籤（全部 sentence case，全站無 uppercase 微標籤）
- `Designs` / `Templates` / `Placement` / `Blend` / `Light` / `Output`
- `Azimuth` / `Elevation` / `Intensity`
- `Output size` / `File names` / `Folders`
- `By design` / `By template` / `Flat`
- `Normal` / `Multiply` / `Screen` / `Overlay`

### 開關（唯一容許 uppercase 的地方，因為是 display 級距）
- `FLAT` / `WOVEN`
- 判詞：`Nobody asks if this one is a composite.`
- 首次提示：`Press W or drag the switch.`

### 說明與狀態
- `Your designs stay in this tab. Nothing is uploaded.`
- `Drop designs here` / `PNG, JPG or WEBP. Transparent PNG works best.`
- `Add designs`（< 768px）
- `Release to add`
- `Procedural templates. Generated in your browser, not photographed.`
- `Procedural template - generated, not photographed. Seed 4417`
- `Print area`
- `Part of the design falls outside the print area.`
- `Screen has little effect on dark fabric.`
- `Load a design to compare.`
- `Needs WebGL2.` / `Lighting needs WebGL2.`
- `Render something first.` / `Wait for the render to finish.`
- `Nothing selected` / `Pick designs on the left and templates below them.`
- `Rendering. Add designs when it finishes.`
- `and 480 more files`（數字為實數）

### 頁尾 / 導覽
- 站名：`Mockup Loom`
- 回 hub：`Hyperkit`

**禁止出現在介面上的字**：
`Oops`、`Something went wrong`、`Coming soon`、`Pro`、`Upgrade`、`Unlock`、`Premium`、
`Powered by`、`Made with`、任何版本號、任何 `01 / 02 / 03` 編號、任何 emoji、任何破折號。
