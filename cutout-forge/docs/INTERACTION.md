# Cutout Forge - 互動規格

**這份文件在任何樣式之前完成。所有 UI 字串以英文原文標註，實作時逐字使用。**

---

## 0. 資訊架構

不是 landing page，是**單畫面工作台**。沒有 scroll-telling，沒有 feature section，沒有 pricing table。頁面高度固定 `100dvh`，內部區域各自捲動。

### 0.1 桌機（≥ 1024px）版面

```
┌──────────────────────────────────────────────────────────────────────┐
│ MASTHEAD  h=56px                                                     │
│ ‹ hyperkit  │  Cutout Forge  │        [engine chip] [rate] [? keys]   │
├────────────────┬─────────────────────────────────────────────────────┤
│                │                                                     │
│  INTAKE RAIL   │  FLOOR                                              │
│  w=304px       │  (零資料時 = FORGE BED / 有佇列時 = 縮圖矩陣 /      │
│  獨立捲動      │   開啟單張時 = INSPECTOR)                           │
│                │                                                     │
│  · Sources     │                                                     │
│  · Output      │                                                     │
│  · Transport   │                                                     │
│  · Ledger      │                                                     │
│                │                                                     │
├────────────────┴─────────────────────────────────────────────────────┤
│ STATUS RAIL  h=36px                                                  │
│ engine · concurrency · memory · queue counts        [alert slot]     │
└──────────────────────────────────────────────────────────────────────┘
```

### 0.2 閱讀順序（第一次到訪，眼睛的實際路徑）

1. FLOOR 中央的標題（畫面上最大的字，佔 60% 的視覺重量）
2. 副標（一行，說明機制）
3. 兩個動作（主要 = 丟檔案，次要 = 載入範例）
4. 引擎狀態（誠實的技術現況，在動作正下方，小字但不是灰到看不見）
5. 左軌（此時是折疊的、低對比的，因為還沒有東西可設定）

**INTAKE RAIL 在零資料時不是空的**：它顯示 output preset 的預設值（Shopify + 透明 PNG），讓使用者知道「等一下會產出什麼」。Transport 與 Ledger 區塊在零資料時**不存在於 DOM**，不是 disabled 的空殼。

### 0.3 首屏內容清單（hero 紀律）

FLOOR 的零資料狀態就是 hero，必須容納於首屏，文字元素**恰好 4 個**：

| # | 元素 | 內容（逐字） | 限制 |
|---|---|---|---|
| 1 | 標題 | `Cut out 200 product photos without uploading one.` | 桌機 2 行以內 |
| 2 | 副標 | `Everything runs in this browser tab. No account, no credits, no upload limit.` | 13 字 |
| 3 | 動作組 | `Choose photos` / `Load 6 sample products` | 一主一次，桌機不換行 |
| 4 | 引擎讀數 | `WebGPU ready · model not downloaded yet (44 MB, one time)` | 單行 |

**沒有 eyebrow。沒有 scroll cue。沒有底部裝飾文字條。沒有信任 logo 牆。**

### 0.4 響應式

| 斷點 | 行為 |
|---|---|
| ≥ 1280px | 上表版面。縮圖矩陣 `repeat(auto-fill, minmax(148px, 1fr))` |
| 1024 to 1279px | INTAKE RAIL 縮到 264px。縮圖 `minmax(132px, 1fr)` |
| 768 to 1023px | INTAKE RAIL 變成 FLOOR 下方的橫向抽屜（`position: sticky; bottom: 0`），高度 auto，內部橫向捲動的區塊列。縮圖 `minmax(120px, 1fr)` |
| < 768px | 單欄。MASTHEAD 的 rate 與 keys 收進一個 `More` disclosure（不是漢堡選單，是 `<details>`）。INTAKE RAIL 成為 FLOOR 底部的固定工具列，只留 Transport + Export 兩顆按鈕，其餘設定收進 disclosure。縮圖 `minmax(104px, 1fr)`，每列 3 張。INSPECTOR 全螢幕接管。 |

所有多欄版面的 `< 768px` 行為都在同一份 CSS 區塊裡宣告，不依賴「應該會自己 wrap」。

---

## 1. 核心迴圈

```
進站
 └─ 看到：一句話主張 + 一個超大可拖放的 FLOOR + 「Load 6 sample products」
     └─ 第一個動作（懷疑者）：按範例 → 5 秒內 6 張顯影成透明底
     └─ 第一個動作（已相信者）：拖進 180 張自己的圖
         └─ 得到：縮圖矩陣立刻鋪滿（縮圖先出現，處理後到）
             → 掃描光帶逐張推進 → 顯影成棋盤格透明底
             → Ledger 計數器每完成一張跳動一次
             → 全部完成時，牆面 Flip 重排成 Ready / Check edges / Failed 三帶
                 └─ 抽檢：點一張進 INSPECTOR，拖曳分割線看前後
                     └─ 不滿意 → Retry（換模式）或 Remove
                 └─ 交付：選 preset → Export → ZIP 落地
                     └─ 完成畫面：「You have not spent $26.10」+ 下一步導流
```

**為什麼回來**：每次上新品就再跑一次。設定已存，第二次是零設定開跑（模型也已在 Cache API 裡，秒開）。
**為什麼分享**：完成計數器是可截圖的社群素材，而「不上傳、不限張數」是一句可以直接轉述的話。

---

## 2. 狀態機（每一個可互動物件）

通用約定：

- **Focus ring**：`outline: 2px solid var(--cyan-bright); outline-offset: 2px`。全站唯一寫法，**永不移除**，也不用 `:focus-visible` 以外的變體隱藏（鍵盤與滑鼠都給，只是滑鼠點擊後 `:focus-visible` 不觸發）。
- **Active**：`transform: translateY(1px)`。不用 scale，因為工作台上有大量小控制項，scale 會讓文字模糊。
- **Disabled**：`cursor: not-allowed`，文字 `--ink-off`，**外加 4px 間距的 45° 斜線 hatch 底紋**（不靠顏色單獨傳達），並且 `title` / `aria-describedby` 說明為什麼不能按。
- **Transition**：`120ms var(--ease-out)` for hover/active，`220ms` for 狀態切換。無過場的狀態切換一律標明。

---

### 2.1 FORGE BED（零資料時的 FLOOR / 全域拖放目標）

整個 FLOOR 區域都是拖放目標，不是中間一個小方框。

| 狀態 | 視覺 | 進入事件 | 離開事件 |
|---|---|---|---|
| idle | `--forge-bed` 底色。中央文字組。四周 1px `--line` 內縮 24px 的框，框的四角各有 12px 的 `--cyan-deep` 角標（像製程檢測的定位角）。 | 初始 / 佇列清空後 | 有檔案進入 |
| hover（滑鼠在 FLOOR 內移動） | 無變化。**不做游標跟隨效果。** | - | - |
| dragover | 底色提到 `--forge-plate`。內縮框改為 2px `--cyan`，四角角標長度變 24px（`transition: 180ms`）。中央文字換成 `Release to load 47 files`（即時檔數，從 `dataTransfer.items.length` 取）。 | `dragenter` / `dragover` on `document` | `dragleave`（需計數器抵銷子元素冒泡）或 `drop` |
| drop-reject（拖進來的全部不是圖片） | 內縮框轉 2px `--forge-orange`，文字 `No images in this drop. Supported: JPEG, PNG, WebP, AVIF.` 停留 2.4 秒後回 idle。 | `drop` 且合法檔案數 = 0 | 逾時 |
| loading（讀縮圖中） | FLOOR 立刻切成矩陣，見 2.4。BED 消失。 | `drop` / file input change 且有合法檔案 | - |
| unsupported-browser | BED 保持可見但兩顆按鈕 disabled，中央追加一列 `--forge-orange` 文字：`This browser cannot decode images off the main thread. Try Chrome, Edge, or Firefox 110+.` | 啟動偵測失敗（無 `createImageBitmap` 或無 `OffscreenCanvas`） | 不會離開 |

鍵盤：FORGE BED 本身不可 focus。檔案輸入由 `Choose photos` 按鈕代理。

---

### 2.2 `Choose photos`（主要按鈕）

包住一個 `<input type="file" multiple accept="image/*">`，用 `<button>` + `.click()` 代理（不是 `<label>` 假扮按鈕，因為要控制 focus 與 aria）。

| 狀態 | 視覺 |
|---|---|
| idle | 填色 `--cyan`，文字 `--cyan-ink`（對比 10.36:1）。radius 4px。高 44px。 |
| hover | 填色 `--cyan-bright`。無位移、無陰影變化。 |
| focus | 加 focus ring。 |
| active | `translateY(1px)`，填色 `--cyan-deep`。 |
| loading | 文字換 `Reading 47 files…`，左側加一個 12px 的**線性**進度條（不是圓環），填色不變。按鈕 `aria-busy="true"`，`pointer-events: none`。 |
| disabled | 只在 unsupported-browser 時。hatch 底紋 + `--ink-off`。 |

---

### 2.3 `Load 6 sample products`（次要按鈕）

範例資料以 Canvas 在瀏覽器端即時繪製（見 §7），不下載外部檔案。

| 狀態 | 視覺 |
|---|---|
| idle | 透明底，1px `--line-strong` 外框，文字 `--ink`。 |
| hover | 外框 `--cyan-deep`，文字 `--ink-hi`。 |
| focus / active | 同通用約定。 |
| loading | 文字 `Drawing samples…`，外框跑一條 1px 的 `--cyan` 線由左至右（`background-size` 動畫，非 spinner）。 |
| done | 按鈕從 DOM 移除（BED 已被矩陣取代）。 |

---

### 2.4 QUEUE TILE（縮圖，最重要的狀態機）

每張 tile 是 `<li>`，正方形，內含三層：
`[0] 棋盤格底` → `[1] 結果 canvas` → `[2] 原圖 canvas（會被 mask 擦除）` → `[3] chrome（檔名、狀態燈、選單鈕、掃描帶）`

**radius 0**（影像是直角裁切的），外框 1px `--line`。tile 之間 gap 8px。

| 狀態 | 燈號 | tile 視覺 | 檔名列 | 進入 | 離開 |
|---|---|---|---|---|---|
| `queued` | `--ink-mid` 空心方點 2px | 只有原圖，`filter: saturate(0.55) brightness(0.72)`。表示「還沒被處理」。 | 檔名 `--ink-mid` | 加入佇列 | 被 worker 取用 |
| `decoding` | `--ink-hi` 實心方點 | 原圖尚未就緒 → 顯示 1px 網格佔位（`--forge-slot` + `--line` 8px 網格），**不是骨架微光** | `Reading…` | 開始 `createImageBitmap` | bitmap 就緒 |
| `running` | `--cyan` 實心方點，**不閃爍** | 掃描光帶（見 §5）由上往下推進。原圖恢復全飽和。 | 檔名 `--ink-hi` + 右側 mono 顯示 `1024×1024` | worker 接手 | 收到 mask |
| `revealing` | `--cyan` | mask 擦除 + 0.08s 微彈 + 1px inset ring 閃一次 | 同上 | mask 抵達 | 0.5s 後 |
| `done` | `--cyan` 實心方點 | 棋盤格 + 去背結果。hover 才顯示 chrome。 | 檔名 `--ink` + mono 尺寸 | reveal 結束 | Retry / Remove |
| `flagged`（`Check edges`） | `--forge-orange` 實心方點 | 同 done，但 tile 外框改 1px `--forge-orange`，右上角一個 10px 的實心三角標記 | 檔名後追加 mono `soft edge` | alpha 邊緣信心值低於門檻（見 §6.3） | Retry / 使用者按 `Mark reviewed` |
| `failed` | `--forge-orange` 空心方框 | tile 底為 `--forge-orange-wash`，原圖降到 `opacity: 0.35`，中央一行 12px 文字寫失敗原因（見 §4 表） | 檔名 `--forge-orange` | 錯誤 | Retry / Remove |
| `paused`（佇列暫停時的 queued） | `--ink-mid` 空心方點 + 一條 1px 水平線穿過 | 同 queued，但角落顯示 `Hold` | 使用者按 Pause | Resume |
| `skipped` | `--ink-off` | tile 降到 `opacity: 0.4`，不參與匯出 | 使用者按 `Skip` 或格式不支援 | Undo |
| hover（任何狀態） | - | chrome 層 `autoAlpha` 0 → 1（120ms）。底部浮出一條 28px 的操作列：`Open` / `Retry` / `Remove`。**不做 3D 傾斜、不做 spotlight border。** | - | - | - |
| focus（鍵盤） | - | 同 hover 的 chrome，外加 focus ring。**tile 是 roving-tabindex 的網格項目。** | - | - | - |
| selected（多選） | - | 外框 2px `--cyan`，左上角出現 12px 實心方塊勾選標記 | `Space` 或點擊時按住 `Shift`/`Ctrl` | 再按一次 | - |

**empty tile 不存在**：矩陣的格數永遠等於檔案數，沒有補白格。

---

### 2.5 TRANSPORT（左軌 · 只在有佇列時存在）

一列三顆等寬按鈕 + 一條佇列進度線。

| 控制項 | idle | 條件與狀態 |
|---|---|---|
| `Start` | 主要填色 | 只在 `queued > 0` 且未在跑時出現。按下即變 `Pause`。 |
| `Pause` | 次要外框 | 跑動中出現。按下後：**不中斷進行中的那幾張**，只停止派新工作。按鈕變 `Resume (12 left)`。 |
| `Resume (12 left)` | 主要填色 | 括號內數字即時更新。 |
| `Retry 3 failed` | 外框 `--forge-orange`，文字 `--forge-orange` | 只在 `failed > 0` 時出現。按下後這 3 張回到 `queued` 並以**下一級 fallback 模式**重跑（WebGPU 失敗 → WASM；WASM 失敗 → chroma-key）。 |
| 佇列進度線 | 高 3px，`--forge-slot` 底，`--cyan` 前景，**無圓角、無背景填充軌道的裝飾**。下方一行 mono：`147 / 200 · 3 failed · 12 flagged` | 完成時整條轉為 `--cyan`，`aria-live="polite"` 播報 `All 200 done. 3 need attention.` |

預估時間：跑滿 5 張後才顯示，格式 `~2 min 40 s left`。之前顯示 `Measuring…`。永不顯示假的百分比。

---

### 2.6 OUTPUT PRESET（左軌）

不是 `<select>`，是一組可多選的 checkbox 列（因為賣家常常同時上兩個通路）。

| 平台 | 尺寸 | 商品佔比 | 輸出 | 命名 |
|---|---|---|---|---|
| Shopify | 2048 × 2048 | 90% | `.png` 透明 + `.jpg` 白底 | `{name}_shopify_01` |
| Amazon | 1600 × 1600 | 85% | `.jpg` 純白 255,255,255（主圖規範） | `{name}_amazon_MAIN` |
| Etsy | 2000 × 2000 | 92% | `.png` 透明 + `.jpg` 白底 | `{name}_etsy_01` |
| Shopee | 1024 × 1024 | 88% | `.jpg` 白底 | `{name}_shopee_01` |
| Transparent only | 原尺寸 | 100%（不重構圖） | `.png` | `{name}_cutout` |

- 每一列右側有一個 `Edit` disclosure，展開可改尺寸、佔比、格式、JPEG 品質、命名樣板。改動存 `localStorage`。
- 每一列下方有一行 11px `--ink-mid` 的來源註記，格式：`Platform guidance, checked YYYY-MM-DD. Edit if yours differs.` **實作時必須填入真實查核日期，不得留佔位字串。**
- 至少要勾一個。全部取消勾選時自動回勾 `Transparent only`，並在狀態列說明 `At least one output is required.`

| 狀態 | 視覺 |
|---|---|
| unchecked | 1px `--line-strong` 方框（radius 2px），標籤 `--ink` |
| checked | 方框填 `--cyan`，內含 `--cyan-ink` 的勾（畫出來的 SVG path，非 Unicode） |
| hover | 整列底色 `--forge-rail`，方框邊 `--cyan-deep` |
| focus | focus ring 套在整列上 |
| editing | 展開的設定區底色 `--forge-slot`，左側 1px `--cyan-deep` 直線（**1px，不是彩色粗邊**） |

---

### 2.7 LEDGER（省錢計數器 · 左軌底部）

**在使用者處理完第一張圖之前，這個區塊不存在於 DOM。**

```
You have not spent
$26.10
147 photos at $0.145 each
[rate: remove.bg 200-credit plan ▾]
```

- 金額用 `--font-mono`，`--fs-ledger`（40px），`--ink-hi`。這是頁面上第二大的數字。
- 費率下拉有三個選項 + 自訂：
  - `remove.bg 200-credit plan ($29 / 200)` → 0.145
  - `remove.bg pay as you go` → 使用者自填（預設空，選了會 focus 到輸入框）
  - `Custom rate` → 數字輸入，`step="0.005"`，`min="0"`
- 下拉旁一個 `?` disclosure，展開文字：`We do not track competitor pricing. Set the rate you actually pay. The count is your photo count times your rate.` 這段誠實聲明是必要的，不可省略。
- 每完成一張：金額用 proxy 物件 tween（**不使用任何 text plugin**），`snap` 到 0.01，時長 0.35s，`power2.out`。同時整個數字做一次 `scale 1 → 1.02 → 1`（0.12s）。
- 每跨過一個 $100 整數：數字顏色從 `--ink-hi` 切到 `--cyan`（220ms），停 1s 後切回。**不換色階、不加光暈。**

| 狀態 | 視覺 |
|---|---|
| absent | 不存在 |
| counting | 如上 |
| rate-unset（選了 pay as you go 但沒填） | 金額位置顯示 `Set your rate`，`--ink-mid`，下方輸入框自動 focus。**不顯示 $0.00 假裝有結果。** |
| batch-complete | 觸發 §5.4 的招牌收尾 |

---

### 2.8 EXPORT 按鈕與 ZIP

位於左軌最底，佔滿寬度，高 48px。

| 狀態 | 文案 | 視覺 |
|---|---|---|
| disabled | `Export` | hatch 底紋，`aria-describedby` 指向 `Nothing is done yet.` |
| ready | `Export 147 photos · 2 presets` | 填色 `--cyan` |
| hover | 同上 | `--cyan-bright` |
| packing | `Packing 84 / 294 files` | 填色不變，按鈕內底部一條 2px `--cyan-ink` 進度線由左長到右。`aria-busy` |
| writing | `Writing forge-export.zip` | 同上，進度線滿 |
| done | `Saved · Export again` | 220ms 內填色轉 `--cyan-deep` 再轉回，文案改變。3 秒後回 `ready` 文案。 |
| error | `Export failed. Try fewer presets.` | 填色轉 `--forge-orange`，`--forge-orange-ink` 文字。點一下回 `ready`。 |

ZIP 結構（依平台分資料夾，資料夾樹在打包時於按鈕上方**即時長出**，每建一層新增一列，`--ink-mid` mono，不做動畫特效）：

```
forge-export/
  shopify/
    png/  jpg/
  amazon/
    jpg/
  _manifest.csv        # 原檔名, 輸出檔名, 平台, 尺寸, 模式(model|chroma), 是否 flagged
```

`_manifest.csv` 是誠實度的一部分：使用者可以看到哪幾張是保底模式跑的。

---

### 2.9 INSPECTOR（單張抽檢 · 接管 FLOOR，不是 modal）

**不是 modal**，因為這個任務既不需要中斷也不需要保護焦點。它是 FLOOR 區域的內容切換，URL hash 變成 `#i/{id}`（可分享、可上一頁返回）。

版面：左側大圖（前後對比），右側 264px 的量測欄。

**對比分割線**：
- 一條 2px `--cyan` 垂直線，中央一個 32×32 的方形握把（radius 4px，`--forge-rail` 底 + 1px `--cyan` 邊，內含畫出來的左右箭頭 SVG）。
- 左半 = 原圖，右半 = 棋盤格 + 去背結果。用 `clip-path: inset(0 calc(100% - var(--split)) 0 0)` 疊層實作，`--split` 由指標位置驅動。
- **實作用 GSAP `quickTo`** 綁 `--split`，`duration: 0.18, ease: 'power3'`，避免每次 pointermove 都寫樣式。
- `pointerdown` 抓握把 → `setPointerCapture` → `pointermove` 更新 → `pointerup` 釋放。**不使用 `mousemove` on window。**

| 物件 | 狀態 |
|---|---|
| 握把 idle | `--forge-rail` 底，1px `--cyan` 邊 |
| 握把 hover | 邊 2px `--cyan-bright`，游標 `col-resize` |
| 握把 focus | focus ring；`←` `→` 各移動 2%，加 `Shift` 移動 10% |
| 握把 dragging | 底色 `--cyan`，箭頭轉 `--cyan-ink`；分割線加粗到 3px |
| 大圖 idle | 適配容器，四周留 24px |
| 大圖 zoomed | 點擊或按 `Z` 切到 1:1 像素檢視，游標變 `grab`，可拖曳平移。右上顯示 mono `1:1 · 2400×2400` |

右側量測欄（全部是真實計算值，不是裝飾）：

```
IMG_4821.JPG
2400 × 2400 · 3.1 MB
Mode      model (webgpu)
Time      1.42 s
Alpha     coverage 61.4%
          soft pixels 2.8%
Background  #F4F4F2 (sampled)

Edge
  Feather   [==o---] 1.5 px
  Despill   [==o---] 40%
  Matte     ( checker | white | black )

[ Retry with chroma-key ]
[ Remove from queue ]
```

- Feather / Despill 是 `<input type="range">`，改動**即時**重算該張的 alpha（只重算 alpha 合成，不重跑模型，所以是毫秒級）。放開 slider 才寫回結果 blob。
- Matte 是三選一的 radio group，只影響檢視，不影響輸出（輸出由 preset 決定）。
- `Retry with chroma-key` 在原本就是 chroma-key 模式時改成 `Retry with model`。

鍵盤：`Esc` 回矩陣（並把焦點還給原本那張 tile）。`[` / `]` 上一張 / 下一張（跳過 failed）。`Z` 切換 1:1。

---

### 2.10 ENGINE CHIP（masthead 右側）

一顆可點的狀態晶片，是整站誠實度的核心元件。

| 狀態 | 文案 | 視覺 |
|---|---|---|
| probing | `Checking hardware…` | `--ink-mid`，1px `--line-strong` 邊 |
| webgpu | `WebGPU` | `--cyan` 文字，1px `--cyan-deep` 邊，左側 6px 實心方點 |
| wasm | `WASM (slower)` | `--ink-hi` 文字，1px `--line-strong` 邊 |
| chroma | `Chroma-key mode` | `--forge-orange` 文字，1px `--forge-orange` 邊 |
| warming | `Warming 62%` | 邊框底部一條 2px `--cyan` 依比例長出 |
| offline-ready | `WebGPU · offline` | 同 webgpu，追加 mono 小字 `offline`。模型已在 Cache API 且已離線可跑時顯示。**這是「檔案沒離開」的可視證據。** |

點擊展開一個 popover（`<details>`，不是 modal），內容：

```
Engine            WebGPU (fp16, 88 MB)
Model             briaai/RMBG-1.4
Cached            yes, 88 MB in Cache API
Concurrency       3 of 8 cores
Your photos       never leave this tab
Model weights     downloaded once from huggingface.co

[ Switch to chroma-key mode ]
[ Clear cached model ]
```

`Your photos never leave this tab` 與 `Model weights downloaded once` 這兩行必須並列出現，把兩件事分開講清楚（見 PRODUCT.md §4.4）。

---

### 2.11 WARM-UP（模型預熱面板）

第一次需要模型時，在 FLOOR 上方浮出一條 72px 高的橫條（**不遮住縮圖矩陣，矩陣往下推**），因為使用者要能同時看到自己的圖已經進來了。

```
Warming the forge
Downloading the cutout model, 44 MB. This happens once.
[███████████████░░░░░░░░░░░]  62%  ·  27.3 / 44.0 MB  ·  ~14 s
                                      [ Skip and use chroma-key ]
```

- 進度條：高 4px，`--forge-slot` 底，`--cyan` 前景，**單向、無往復微光動畫**。
- 百分比與 MB 皆為真實 `Content-Length` 與 `ReadableStream` 累計值。**取不到 `Content-Length` 時不顯示百分比**，改顯示已下載 MB 與 `Size unknown`。
- `Skip and use chroma-key` 永遠可按。按下後放棄下載、切保底模式、佇列立刻開跑。
- 完成後橫條在 400ms 內縮到 0 高度並移除。

| 狀態 | 視覺 |
|---|---|
| downloading | 如上 |
| stalled（8 秒無位元組進來） | 副標換 `Download stalled.`，追加 `[ Retry ]`，主按鈕改為主要填色的 `Use chroma-key now` |
| failed | 整條轉 `--forge-orange-wash`，文字 `Could not reach the model host. Chroma-key mode is on and the queue is running.` 並**自動切換模式後開跑**，橫條 6 秒後自動收起 |
| compiling | 進度滿後短暫顯示 `Compiling shaders…`（WebGPU 首次），不假裝有百分比 |

---

### 2.12 ALERT SLOT（狀態列右側）

**不用 toast，不用 modal。** 所有非阻斷訊息落在狀態列右側的固定槽位，一次一則，`aria-live="polite"`。多則時排隊，每則至少停留 4 秒。

| 類型 | 視覺 | 例 |
|---|---|---|
| info | `--ink-mid` 文字 | `Concurrency lowered to 2 to keep memory stable.` |
| warn | `--forge-orange` 文字 + 左側 8px 實心三角 | `12 photos have soft edges. Open one to check.` |
| action | 文字後接一個底線 inline 按鈕 | `Removed IMG_4830.JPG. Undo` |

---

## 3. 鍵盤路徑

### 3.1 Tab 順序（DOM 順序即 Tab 順序，不用 `tabindex` 正值）

```
1  ‹ hyperkit（返回 hub）
2  Engine chip
3  Rate 下拉
4  ? Shortcuts
5  [FLOOR]  零資料時 → Choose photos → Load 6 sample products
          有佇列時 → 縮圖矩陣（單一 tab stop，內部方向鍵移動）
          Inspector 時 → 分割線握把 → Zoom → Feather → Despill → Matte → Retry → Remove
6  [INTAKE RAIL] Add more photos → preset 列（逐列）→ Transport → Rate → Export
7  [STATUS RAIL] alert 內的 inline 按鈕（若有）
```

### 3.2 縮圖矩陣的 roving tabindex

矩陣整體只有一個 tab stop。進入後：

| 鍵 | 行為 |
|---|---|
| `←` `→` `↑` `↓` | 移動焦點（`↑` `↓` 依實際欄數換行，欄數從 `getComputedStyle` 讀 grid） |
| `Home` / `End` | 該列首 / 末 |
| `Ctrl+Home` / `Ctrl+End` | 全部首 / 末 |
| `PageUp` / `PageDown` | 上下捲一屏的列數 |
| `Enter` | 開啟 INSPECTOR |
| `Space` | 切換選取 |
| `Shift + ↑↓←→` | 延伸選取 |
| `Ctrl+A` | 全選 |
| `Delete` / `Backspace` | 移除選取項（可 Undo） |
| `R` | 重試選取項 |

### 3.3 全域快捷鍵

只在焦點不在文字輸入框內時生效（`event.target.closest('input,textarea,select')` 檢查）。

| 鍵 | 行為 |
|---|---|
| `O` | 開啟檔案選擇 |
| `S` | 載入範例（僅零資料時） |
| `P` | Start / Pause / Resume 切換 |
| `E` | Export |
| `Z` | INSPECTOR 內 1:1 切換 |
| `[` `]` | INSPECTOR 內上一張 / 下一張 |
| `?` | 開啟快捷鍵面板 |
| `Esc` | 見下 |

**刻意不綁 `Space` 當全域暫停**，因為 `Space` 在按鈕上是「按下」，衝突會造成誤觸。

### 3.4 `Esc` 行為（由內而外，一次只退一層）

1. 快捷鍵面板開著 → 關閉
2. Engine popover 開著 → 關閉，焦點回 chip
3. Preset 的 Edit disclosure 展開 → 收合
4. INSPECTOR 開著 → 回矩陣，焦點回原 tile
5. 有選取項 → 取消選取
6. 佇列在跑 → **不做任何事**（不能用 Esc 中斷 8 分鐘的工作）
7. 以上皆無 → 不做任何事

### 3.5 快捷鍵面板

`?` 開啟，是一個 `<dialog>`（這裡用 modal 是正當的：它需要保護焦點且是短暫的參考查閱）。內容是上面兩張表的英文版，兩欄排列，`Esc` 或點外部關閉，關閉後焦點回到觸發元素。

---

## 4. 失敗路徑總表

每一列的「復原」欄位是使用者實際能按的東西，不是安慰文案。

| # | 失敗 | 偵測 | 使用者看到的文案（逐字） | 復原 |
|---|---|---|---|---|
| F1 | 無 WebGPU | `!navigator.gpu` | `No WebGPU here. Running on WASM, roughly 6 to 10 times slower. For 200 photos, try batches of 40.` | 自動走 WASM。chip 顯示 `WASM (slower)`。 |
| F2 | 模型 CDN 不可達 | fetch reject / 非 2xx / 逾時 20s | `Could not reach the model host. Chroma-key mode is on and the queue is running.` | **自動切 chroma-key 並開跑**。alert 內附 `Retry model` 連結。 |
| F3 | 模型下載中斷 | stream error 或 8s 無資料 | `Download stalled.` | `Retry` / `Use chroma-key now` 兩顆按鈕。 |
| F4 | 模型載入但推論丟錯 | worker `onerror` 連續 2 張 | `The model failed twice in a row. Switched to chroma-key for the rest of this batch.` | 自動降級，已完成的保留。 |
| F5 | 檔案格式不支援（HEIC / PSD / TIFF / SVG） | `createImageBitmap` reject | tile 上：`HEIC is not supported by this browser. Convert to JPEG first.`（依副檔名給對應句子） | tile 進 `skipped`，不計入總數。左軌顯示 `4 files skipped`，可展開看清單。 |
| F6 | 圖片過大（任一邊 > 12000px） | 讀 bitmap 後檢查 | `IMG_4830.JPG is 16000 px wide. Downscaling to 8000 px for export.` | 自動降尺寸並在 tile 標註 `resized`；`_manifest.csv` 記錄。 |
| F7 | 記憶體壓力 / decode 失敗 | `createImageBitmap` reject 且非格式問題 | `Concurrency lowered to 1 to keep memory stable.` | 並行數減半（最低 1），該張回 `queued` 自動重試一次。連兩次失敗才進 `failed`。 |
| F8 | Cache API 不可用（無痕模式） | `caches` undefined 或 open reject | `Private mode: the model will download again next time. Everything else works.` | 只提示一次，不阻斷。 |
| F9 | `localStorage` 滿 / 不可用 | try/catch on setItem | `Settings could not be saved in this browser. They will reset when you close the tab.` | 設定改用記憶體變數，功能不變。 |
| F10 | ZIP 過大（> 1.9 GB） | 打包前估算 | `This export is over 1.9 GB. Splitting into 3 files.` | 自動分卷 `forge-export-1of3.zip`，命名與 manifest 一致。 |
| F11 | 匯出時原圖重新解碼失敗 | 匯出迴圈 catch | `4 photos could not be re-opened at full size and were left out. They are listed in _manifest.csv.` | 其餘照常匯出，失敗清單寫進 manifest 並在 alert 提供 `Show them` 跳回矩陣篩選。 |
| F12 | 使用者關閉分頁但佇列未完成 | `beforeunload` | 瀏覽器原生確認（無法自訂文案） | 攔截。 |
| F13 | chroma-key 判定背景不夠純 | 邊界取樣的色彩變異超過門檻 | `This background is not solid enough for chroma-key. The cutout may be rough.` | tile 進 `flagged`，仍然產出結果（**不留空**）。 |
| F14 | 佇列全空但按了 Export | 按鈕本來就 disabled | `aria-describedby`: `Nothing is done yet.` | 不會發生。 |

---

## 5. 招牌動效時刻：THE POUR（顯影）

一句話說明它傳達什麼：**「我不用一張張等」這件事的視覺證明。** 這是敘事 + 狀態轉換，不是裝飾。

整個時刻由四個相扣的階段組成，只有**一個**被創作的時刻，其他頁面元素不重複這套進場。

### 5.1 階段一 · 鋪牆（0 → 約 1.2s，依張數）

檔案落地後，tile DOM 立刻建立。

```js
gsap.from(tiles, {
  scale: 0.6,
  autoAlpha: 0,
  duration: 0.5,
  ease: "power3.out",
  stagger: { each: 0.006, from: "center", grid: "auto" }
});
```

- 200 張 × 0.006 = 1.2s 的波，由中央往外。
- `gsap.from` 的起始值由 JS 施加，**CSS 裡沒有任何 `opacity: 0`**。動效被關掉時 tile 直接是可見的最終狀態。
- 超過 400 張時 `each` 自動降到 `0.003`，避免波長過久。

### 5.2 階段二 · 掃描（每張，與推論時間等長）

tile 進入 `running` 時：

```css
@property --scan { syntax: "<percentage>"; inherits: false; initial-value: -8%; }

.tile__scan {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg,
    transparent calc(var(--scan) - 7%),
    rgb(34 229 200 / 0.10) calc(var(--scan) - 3%),
    var(--cyan) var(--scan),
    rgb(34 229 200 / 0.10) calc(var(--scan) + 3%),
    transparent calc(var(--scan) + 7%));
}
```

```js
const scan = gsap.to(tile, { "--scan": "108%", duration: 1.1, ease: "none", repeat: -1 });
```

- **這裡用 `ease: "none"` 是正確的**：掃描帶代表「機器正在等速掃過」，加緩動會讓它讀起來像裝飾而不是量測。這是全站唯一允許線性緩動的地方，理由寫在這裡。
- 推論回來時 `scan.kill()`，並把 `--scan` 立刻設到當前值再交給階段三。
- **同時只有 `concurrency`（≤ 4）條掃描帶在跑**，效能無虞。
- 帶子是 2px 的線加上極窄的兩側衰減，**不是光暈**（見 DESIGN-DIRECTION 的三項刻意不做）。

### 5.3 階段三 · 顯影（每張 0.62s）

```css
@property --erase { syntax: "<percentage>"; inherits: false; initial-value: 0%; }

.tile__original {
  mask-image: radial-gradient(circle at 50% 50%,
    transparent var(--erase),
    #000 calc(var(--erase) + 16%));
  -webkit-mask-image: same;
}
```

```js
const tl = gsap.timeline({ onComplete: () => markDone(tile) });
tl.to(tile, { "--erase": "132%", duration: 0.42, ease: "power2.inOut" })
  .to(tile, { scale: 1.04, duration: 0.04, ease: "power2.out" }, 0.30)
  .to(tile, { scale: 1,    duration: 0.04, ease: "power2.in"  }, 0.34)
  .fromTo(tile, { "--ring": 0 }, { "--ring": 1, duration: 0.06, yoyo: true, repeat: 1, ease: "none" }, 0.30);
```

其中 `--ring` 驅動 `box-shadow: inset 0 0 0 1px rgb(34 229 200 / var(--ring))`。**inset 1px 的線，不是外擴光暈。**

因為每張的推論時間本來就參差（1.2s 到 3s 不等），200 張的顯影自然此起彼落。**不需要人工錯開，不要加 delay 假裝隨機。**

### 5.4 階段四 · 收尾（全批完成時，只觸發一次）

1. Ledger 數字在 0.6s 內 tween 到最終值（proxy 物件 + `onUpdate`，`snap` 0.01）。
2. 用 **Flip** 把整面牆重排成三個帶狀分群：`Ready` / `Check edges` / `Failed`。

```js
const state = Flip.getState(tiles);
applyGroupedLayout();           // 改 DOM 順序與 grid 區塊
Flip.from(state, { duration: 0.7, ease: "power3.inOut", stagger: 0.004, absolute: true });
```

   **為什麼是依「結果」分群而不是依「平台」分群**：平台是輸出設定，同一張圖會進所有勾選的平台，依平台分群會讓每張圖重複出現，無法傳達資訊。依結果分群直接告訴使用者「接下來要看哪幾張」，這是他當下唯一需要的決策。**這是對 PORTFOLIO.json 原始描述的一處刻意修正，理由如上。**
   若沒有 flagged 也沒有 failed，只重排成一個緊密的 `Ready` 區塊，並把 Export 按鈕升為主要填色。
3. Ledger 區塊做一次 `scale 1 → 1.06 → 1`（0.5s，`back.out(1.4)`）並把周圍 tile 的亮度降到 0.72 維持 1.5 秒後復原。**不做全螢幕接管**，因為使用者可能正在捲動抽檢，遮住畫面是對他的敵意。
4. 狀態列 `aria-live` 播報 `All 200 photos done. 12 need a look. Ready to export.`

### 5.5 `prefers-reduced-motion`

```js
const mm = gsap.matchMedia();
mm.add({
  reduce: "(prefers-reduced-motion: reduce)",
  ok: "(prefers-reduced-motion: no-preference)"
}, (ctx) => {
  if (ctx.conditions.reduce) return;   // tile 直接是最終狀態，掃描帶不建立
  /* 上述四階段全部在這裡 */
});
```

reduced-motion 下：
- tile 直接以最終狀態出現（`queued` 是暗的，`done` 是棋盤格的），狀態切換用 220ms 的 `opacity` 交叉淡入（這仍在合理範圍內，且可由 CSS `@media` 進一步關掉）。
- 掃描帶不建立；`running` 狀態改用 tile 頂端一條 2px `--cyan` 的**靜態**線 + 檔名旁的 mono 文字 `running`。
- Flip 重排改為直接重新排版，無過場。
- Ledger 數字直接跳到最終值。
- **所有資訊都還在，只是不動。**

---

## 6. 處理管線（互動相關的部分）

### 6.1 三種模式與它們的誠實邊界

| 模式 | 何時用 | 適用 | 不適用 | UI 如何說 |
|---|---|---|---|---|
| `model (webgpu)` | 有 WebGPU 且模型已載 | 幾乎所有商品圖，含髮絲與半透明 | 極端反光的玻璃 | chip: `WebGPU` |
| `model (wasm)` | 無 WebGPU | 同上，但慢 6 到 10 倍 | 大批次（建議分批 40 張） | chip: `WASM (slower)` + 一次性 alert |
| `chroma-key` | 模型不可用，或使用者主動選 | **純色 / 近純色背景的棚拍**（電商最常見） | 絨毛、髮絲、玻璃、雜亂或漸層背景 | chip: `Chroma-key mode`，Inspector 內每張標 `mode chroma` |

三種模式都會產出真實結果。**沒有任何路徑會停在「無法處理」。**

### 6.2 chroma-key 演算法（保底路徑必須真的能跑，這裡寫死規格）

1. 從 512px 縮圖取四邊各 2px 的邊框像素，共約 4000 個樣本。
2. 轉到近似 Lab（sRGB → linear → XYZ → Lab），取中位數為背景色 `bg`；計算樣本對 `bg` 的 ΔE76 的 90 百分位 `spread`。
3. `spread > 12` → 判定背景不夠純，走 F13：仍然執行，但標 `flagged`。
4. 容差 `tol = clamp(spread * 1.6, 6, 22)`。
5. 從四個角落開始**掃描線 flood fill**（顯式堆疊，非遞迴），ΔE(px, bg) < tol 的視為背景，得到二值遮罩。
6. 3×3 形態學閉運算兩次，填掉商品內部誤判的小洞。
7. alpha = 對二值遮罩做半徑 `feather`（預設 1.5px）的 box blur，取三次以近似高斯。
8. Despill：對 alpha 介於 0.05 與 0.95 的像素，`rgb -= despill * alpha_complement * (bg - luma(bg))`，去掉背景色溢到邊緣的色偏。
9. 遮罩在 512px 上算完，匯出時雙線性放大到原尺寸再套用（與模型路徑共用同一段合成程式）。

全程純 JS + `Uint8ClampedArray`，在 Web Worker 內執行，**零外部依賴**。單張 512px 約 10 到 30 ms。

### 6.3 `flagged`（Check edges）的判定

alpha 通道中 `0.08 < a < 0.92` 的像素比例即「soft pixel ratio」。

- `> 6%` → `flagged`，理由 `soft edge`（可能是絨毛，也可能是沒去乾淨）
- alpha 覆蓋率 `< 2%` 或 `> 97%` → `flagged`，理由 `almost nothing removed` / `almost everything removed`
- chroma-key 且 `spread > 12` → `flagged`，理由 `background not solid`

這三個門檻是**啟發式**，UI 文案必須說 `need a look`，不能說 `failed`。

### 6.4 記憶體規則（見 PRODUCT.md §4.2）

- 顯示：`createImageBitmap(file, { resizeWidth: 512, resizeHeight: 512, resizeQuality: 'medium' })`
- 推論輸入：512 bitmap → OffscreenCanvas 1024×1024 → Float32Array
- 結果暫存：只存 512×512 的 `Uint8ClampedArray` alpha（256 KB/張，200 張約 50 MB，可接受）
- 匯出：一次一張，`createImageBitmap(file)` 全解析度 → 合成 → `convertToBlob` → `bitmap.close()` → 交給 ZIP writer → 釋放
- 並行數：`clamp(round(navigator.hardwareConcurrency / 2), 1, 4)`，狀態列即時顯示 `3 of 8 cores`

---

## 7. 首次到訪的零資料狀態（範例資料）

### 7.1 empty state 的構成

FORGE BED 不是「暫無資料」。它是一個被構成的畫面：

- 背景是 `--forge-bed` 上一層 32px 的 1px 網格（`--line` 的 40% 透明度），像製程檢測台的量測底板。網格在 `< 768px` 改為 24px。
- 中央偏上（`align-content: center`，往上偏 6vh）是四個文字元素。
- 四角的 `--cyan-deep` 定位角標是唯一的「裝飾」，而它同時是拖放目標的邊界指示，有功能。
- **沒有插畫、沒有假截圖、沒有 3D 圖示。**

### 7.2 範例資料規格（6 張，Canvas 即時繪製，不下載外部檔案）

寫在 `js/samples.js`，回傳 6 個 `File` 物件（`canvas.convertToBlob` → `new File([blob], name, {type:'image/jpeg'})`），讓它們**走與真實檔案完全相同的管線**（這點很重要：範例不能走捷徑，否則證明不了任何事）。

| # | 檔名 | 尺寸 | 背景 | 商品 | 目的 |
|---|---|---|---|---|---|
| 1 | `sample_ceramic_mug.jpg` | 1400×1400 | 純白 `#FFFFFF` | 圓柱 + 環形把手，冷灰釉 `#8E9A9B`，左上柔和高光，右下投影 | 最簡單的情況，證明基本可行 |
| 2 | `sample_sneaker_box.jpg` | 1400×1400 | 淺灰 `#EDEDED` | 等角投影的立方體，三面明度不同，暖砂色 `#C8B49A` | 近純色背景 + 硬邊，chroma-key 也能過 |
| 3 | `sample_glass_bottle.jpg` | 1400×1400 | 純白 | 半透明圓柱，alpha 0.35，內部折射亮帶，深青瓶蓋 | 半透明，模型與 chroma-key 差異明顯 |
| 4 | `sample_wool_scarf.jpg` | 1400×1400 | 純白 | 圓角矩形 + 邊緣 400 根 1.5px 的隨機絨毛線段 | 觸發 `flagged`，證明系統會誠實標記 |
| 5 | `sample_watch_grad.jpg` | 1400×1400 | **垂直漸層** `#F2F2F2` → `#D6D6D6` | 圓環 + 錶帶矩形，深灰 `#33383B` | 漸層背景，chroma-key 會標 `background not solid` |
| 6 | `sample_earrings_pair.jpg` | 1400×1400 | 純白 | 兩個分離的細環（1.5px 線寬）+ 中央鏤空 | 細結構 + 多個不相連物件 + 鏤空，測試 flood fill 不會把鏤空當商品 |

繪製規則：

- 全部用 `OffscreenCanvas` + 2D context 畫幾何圖形，含 `createLinearGradient` / `createRadialGradient` 做的高光與陰影。
- 每張加一層極輕的雜訊（`ImageData` 上 ±2 的隨機值），讓它像真實相機輸出而不是向量圖，這樣才測得出容差邏輯。
- **不使用 emoji、不使用文字當商品、不畫插畫。**
- 匯出 JPEG quality 0.92，讓每張約 200 到 400 KB，接近真實棚拍檔案大小。

按下 `Load 6 sample products` 後：橫幅 alert `6 sample products loaded. They run through the same pipeline as your own photos.`

### 7.3 二次到訪

`localStorage` 存：preset 勾選與自訂值、費率設定、feather / despill 預設、上次的 concurrency。
**不存**佇列本身。二次到訪一樣是零資料的 FORGE BED，但左軌的 preset 已是上次的選擇，且 Engine chip 顯示 `offline` 表示模型已快取。

---

## 8. 導覽與返回 hub

- MASTHEAD 最左：`‹ hyperkit`，相對路徑 `../index.html`。文字連結，1px 底線 on hover，不是按鈕。
- 完成畫面（Export 成功後 3 秒內）在 Ledger 下方長出一列：
  `Next: drop these cutouts into a scene → Mockup Loom`，連結 `../mockup-loom/`。
  這是全站**唯一**的站外導流，不做 footer 六站 logo 牆。
- 高度：MASTHEAD 56px，單行，桌機不換行。

---

## 9. 無障礙檢查清單（實作時逐項驗）

- [ ] 所有互動元素可 Tab 到達，focus ring 在 `--forge-bed` 與 `--forge-rail` 上都達 12:1 以上對比
- [ ] 縮圖矩陣是 `role="grid"` + roving tabindex，每張 tile `aria-label` 為 `IMG_4821.JPG, done, 2400 by 2400`
- [ ] 佇列進度用 `role="progressbar"` + `aria-valuenow/min/max`
- [ ] 所有狀態變化（完成、失敗、降並行數）經 `aria-live="polite"` 播報，匯出失敗用 `assertive`
- [ ] 狀態燈號的顏色**永遠**伴隨形狀差異（實心方 / 空心方 / 空心框 / 三角），色盲可辨
- [ ] `Check edges` 與 `Failed` 除了橘色外，另有三角標記與文字
- [ ] range slider 有 `aria-valuetext`（`1.5 pixels`）
- [ ] 圖片 `<canvas>` 有 `role="img"` + `aria-label`
- [ ] 快捷鍵面板是唯一的 `<dialog>`，有 focus trap 與返回焦點
- [ ] 所有錯誤文案同時說明「問題是什麼」與「現在怎麼辦」
