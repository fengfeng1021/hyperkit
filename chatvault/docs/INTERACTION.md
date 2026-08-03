# ChatVault - 互動規格

這份文件在任何樣式之前完成。所有 UI 字串以英文逐字列出，實作時原樣使用。
標記 `[copy]` 的即為介面上的文字，不可改寫成別的說法。

---

## 0. 兩個頁面狀態

整個 `index.html` 只有兩個頂層狀態，由 `document.documentElement.dataset.vault` 控制：

| 狀態 | 條件 | 畫面 |
|---|---|---|
| `empty` | IndexedDB 裡沒有任何對話 | 入口版面（第 4 節）。首屏是 hero + 投放區。 |
| `loaded` | 金庫裡至少有一則對話 | 工作台版面（第 5 節）。三欄目錄櫃。 |

狀態切換不重新載入頁面。`empty → loaded` 的轉場就是招牌動效時刻（第 6 節）。

不使用 modal 作為主要流程容器。整份規格裡只有一個確認對話（清空金庫），因為那是唯一需要保護焦點且不可復原的動作。

---

## 1. 核心迴圈

### 進站看到什麼

零資料的訪客看到一個投放區（drop zone），它佔據首屏右側約 46% 寬、高度 380px，材質是紙灰底 + 上緣一道 3px 的墨色抽屜前緣 + 一個實心的抽屜把手形狀。左側是標題與兩個動作。

首屏四個文字元素，沒有 eyebrow：

1. H1 `[copy] Two years of conversations. One search box.`
2. 副文（17 字）`[copy] Drop a ChatGPT, Claude, or Gemini export. Parsed, indexed, and read in this tab. Nothing uploads.`
3. 主要動作 `[copy] Choose export file`（投放區本身也是這個按鈕的點擊區）
4. 次要動作 `[copy] Load sample vault`

首屏沒有信任標語條、沒有版本標籤、沒有捲動提示、沒有統計數字。

### 第一個動作

兩條路，兩條都必須在 3 秒內給出可見結果。

**路 A：拖入自己的檔案。** 拖曳進入時投放區進入 `dragover` 狀態；放開後立刻進入 `parsing`，抽屜開始被卡片填滿（招牌動效）。第一批 200 則對話大約在 400ms 內抵達，計數器開始跑，右側的索引清單同時出現可點的卡片。使用者在索引還沒跑完時就能開始讀。

**路 B：點 `Load sample vault`。** 載入 `assets/sample-vault.json`（24 個真實可讀的技術對話，ChatGPT 格式，含 3 個有分支的對話）。走**完全相同**的解析與索引管線，不走捷徑。動效時刻照跑，只是快很多（約 1.2 秒）。範例金庫載入後在 rail 上出現一個持續存在的標記 `[copy] Sample vault` 與 `[copy] Clear`，讓使用者清楚這不是他的資料。

### 得到什麼

索引完成的那一刻，畫面上出現三件事：

1. 抽屜前緣往下滑出畫面，露出後方的三欄工作台。
2. 計數器落定在真實數字：`[copy] 3,271 conversations. 214,908 messages. Indexed in 11.2 s. Nothing left this tab.`（數字全部來自實際運算）
3. 搜尋框自動取得焦點，游標在裡面閃。這是整個產品的邀請。

接著使用者打第一個字。從第一個字元開始，搜尋框下方 120px 高的**脊條（spine strip）**就開始重排：不符合的卡片薄片降到 8% 墨色並縮到 0.35 高，命中的變成全墨並長高，前三名往上凸出來。這是動效即結果本身。

### 為什麼回來或分享

- **回來的節奏由匯出行為決定。** 每次新的匯出檔丟進來，ChatVault 自動去重合併，只索引新增的對話，並在頂端顯示 `[copy] 412 new conversations added. 2,859 were already in your vault.` 使用者的封存動作天然是週期性的（每季、每次換工具、每次要備份）。
- **分享的觸發點是統計面板。** 「你這兩年最常問什麼」是一個會想給別人看的答案，而且它證明了工具的價值。
- **留存的真正原因是搜尋成功。** 只要有一次「三個月前那段程式碼」被十五秒找回來，這個分頁就會被加進書籤。

---

## 2. 資訊架構

### 2.1 `empty` 狀態的區塊與閱讀順序

五個區塊，五種不同的版面家族，零個 eyebrow：

| # | 區塊 | 版面家族 | 內容 |
|---|---|---|---|
| 1 | Hero + 投放區 | 非對稱雙欄（左文 54% / 右投放區 46%） | 上述四個元素 |
| 2 | `[copy] How your export gets read` | 三列不等寬清單（僅列間 1px 底線，最後一列無線） | 三種格式的**結構特徵偵測規則**，逐條寫實：ChatGPT 看 `mapping` + `current_node`；Claude 看 `chat_messages[]` + `sender`；Gemini 看 Takeout 的 activity 結構。第四列是通用 fallback。 |
| 3 | `[copy] Getting your export` | 分頁式揭露（三個 tab：ChatGPT / Claude / Gemini） | 每家的實際步驟與等待時間預期。文字為真實步驟，不是佔位。 |
| 4 | `[copy] What this page requests from the network` | 左敘述 / 右等寬清單（右欄承載真實資料，非填充文字） | 逐條列出全部外部請求與用途。 |
| 5| 頁尾 | 單行 | 回 Hyperkit hub 的相對連結 `../index.html`、這是什麼、鍵盤說明入口。 |

首屏內容 = 區塊 1 完整可見（1280×800 與 375×812 都要）。

### 2.2 `loaded` 狀態的版面

桌機 ≥ 1120px：

```
┌─ rail (64px 高, 單行) ──────────────────────────────────────────────┐
│ ChatVault │ [search field, 佔滿中段] │ Stats │ Import │ Hyperkit    │
├───────────┴────────────────────────────────────────────────────────┤
│ spine strip (120px 高, canvas, 只在有查詢時出現)                     │
├──────────────┬─────────────────────┬───────────────────────────────┤
│ DRAWER 244px │ INDEX 372px         │ READING PANE  fluid           │
│ 篩選抽屜      │ 虛擬捲動的卡片清單    │ 虛擬捲動的訊息清單             │
│              │                     │                               │
└──────────────┴─────────────────────┴───────────────────────────────┘
```

- **DRAWER（左）**：來源篩選、角色篩選、日期範圍、`has code`、以及已儲存的查詢。全部用文字標籤，不用圖示欄。
- **INDEX（中）**：對話卡片。有查詢時依 BM25 排序並顯示命中片段；無查詢時依日期排序。
- **READING PANE（右）**：選中對話的全文，含分支切換、程式碼區塊、匯出選單。

768px 到 1119px：DRAWER 收成覆蓋式面板，由 rail 上的 `[copy] Filters` 開關；INDEX 縮到 300px；READING PANE 流動。

< 768px：單欄堆疊導覽。預設顯示 INDEX。點卡片後 READING PANE 由右側滑入覆蓋（`x: 100%` → `0`），左上角出現 `[copy] Back to index`。DRAWER 變成底部抽屜（由下往上，高度 72vh）。搜尋框固定在頂端，rail 收成兩行以內但總高不超過 112px（桌機規則的 80px 上限只約束桌機）。

`Stats` 不是 modal，是把 READING PANE 換成統計視圖，INDEX 保持在原地。

---

## 3. 完整狀態機

以下每一個可互動物件都列出 idle / hover / focus / active / loading / success / error / empty / disabled。沒有的狀態寫「不適用」並說明原因。
共用約定：
- focus ring 一律 `outline: 2px solid var(--focus)` + `outline-offset: 2px`，`--focus` = `#8A5F06`（對紙灰底 5.03:1）。所有互動元件都必須可見。
- `:active` 一律 `transform: translateY(1px)`，時長 `--dur-1`（120ms）。
- 進入 hover 用 `--dur-1` + `--ease-out`；離開用同樣時長，不做延遲。

---

### 3.1 Drop zone（投放區 / `#dropzone`）

同時是 empty 狀態的 hero 物件與招牌動效的舞台。它是一個 `<button>` 包住的 `<label for="file-input">`，不是裝飾。

| 狀態 | 視覺 | 進入事件 | 離開事件 |
|---|---|---|---|
| idle | 紙灰底 `--surface-recessed`，上緣 3px `--ink` 抽屜前緣，內部置中一行 `[copy] Drop your export here` 與下方較小的 `[copy] or click to choose a file`。內側 1px `--rule` 虛線框（dash 6/4）。`--shadow-drawer` | 初始 / 任何流程取消後 | 任一下方事件 |
| hover | 虛線框轉實線並變 `--rule-strong`；抽屜把手形狀 `y: -2`；底陰影加深到 `--shadow-drawer-hover` | `pointerenter` | `pointerleave` |
| focus | idle 視覺 + focus ring 包住整個投放區 | `Tab` 抵達 | 焦點離開 |
| active | `translateY(1px)`，陰影縮到 `--shadow-card` | `pointerdown` / `Space` / `Enter` | `pointerup` |
| dragover | 底色轉 `--amber-wash`，虛線框轉 2px 實線 `--amber`，中央文字換成 `[copy] Release to read this file`，抽屜前緣 `y: -6` 並停住（表示抽屜被拉開） | `dragenter` / `dragover`（`preventDefault`） | `dragleave`（僅當 relatedTarget 在區外）/ `drop` |
| loading（= parsing） | 見第 6 節招牌動效。文字換成兩行：`[copy] Reading <filename>` 與即時的 `[copy] 142.6 MB of 340.2 MB · 1,840 conversations` | `drop` 或 `change` 後 worker 回報第一個 progress | `done` / `error` / `cancel` |
| success | 抽屜前緣下滑出畫面，計數器落定，頁面切到 `loaded` | worker `done` | 立即，不停留 |
| error | 投放區保持原位，內部換成 notice 元件（3.16），底色 `--alert-wash`，上緣抽屜前緣轉 `--alert` | worker `error` 或前置檢查失敗 | 使用者按 `[copy] Try another file` 回 idle |
| empty | 不適用。投放區的 idle 就是 empty 的表達。 | | |
| disabled | 僅在 parsing 期間：投放區不接受第二個檔案，文字下方顯示 `[copy] Finish reading this file first`，`aria-disabled="true"`，游標 `not-allowed`。取消鍵 `[copy] Cancel` 保持可用。 | parsing 開始 | parsing 結束 |

拖曳細節：`dragenter` / `dragover` / `drop` 都要 `preventDefault()`；`dragleave` 用計數器（enter +1 / leave -1）避免子元素造成閃爍。整個 `document` 也綁 `dragover` + `drop` 的 `preventDefault`，避免使用者放歪時瀏覽器直接開檔。

---

### 3.2 Search field（`#q`）

單一輸入框，承載全部查詢語法。右側有一個 `[copy] Syntax` 揭露觸發器。

| 狀態 | 視覺 | 進入 | 離開 |
|---|---|---|---|
| idle（空） | 1px `--rule-strong` 下框線（不是四邊框），placeholder `[copy] Search every conversation`（`--ink-3`，5.82:1） | 初始 | 輸入或聚焦 |
| hover | 下框線轉 `--ink-3` | `pointerenter` | `pointerleave` |
| focus | 下框線轉 2px `--amber`，focus ring 套在整個欄位外框；右側出現鍵盤提示 `[copy] Esc to clear` | `focus` | `blur` |
| active（輸入中） | 每個字元觸發 debounce 90ms 的查詢；查詢執行期間右側出現 1px 高的 `--amber` 進度線由左掃到右（真實進度，非假動畫） | `input` | debounce 結束 |
| loading | 只有在需要 IndexedDB 分頁讀取（> 5,000 命中）時出現。進度線改成不確定的往復掃描，並在脊條上方顯示 `[copy] Ranking 5,281 matches` | 查詢耗時 > 200ms | 結果回來 |
| success | 不做獨立視覺。結果本身就是成功狀態：脊條重排 + 索引清單重排 + 計數 `[copy] 214 conversations · 1,097 messages` | 每次查詢完成 | 下次查詢 |
| error（語法錯） | 欄位下框線轉 `--alert`，下方一行 `[copy] Unclosed quote. Add a closing " or remove it.` 或 `[copy] after:2025-13 is not a date. Use after:2025-03 or after:2025-03-14.` 已解析成功的部分仍然執行 | 解析器回報 | 語法修正 |
| empty（無結果） | 見 3.17 空結果面板 | 命中數 0 | 查詢變更 |
| disabled | 僅在 `empty` 頁面狀態時不存在（rail 上沒有搜尋框）。金庫載入後永不 disabled。 | | |

**語法（`[copy]` 揭露面板逐字內容）**

```
"exact phrase"   words must appear next to each other
-word            exclude conversations containing this word
+word            this word is required
role:human       only your messages        role:assistant
source:chatgpt   also claude, gemini
after:2025-03    before:2025-06-01
has:code         only conversations containing a code block
```

---

### 3.3 Search mode toggle（Exact / Expanded）

兩段式切換，在搜尋框正下方靠左。

| 狀態 | 視覺 |
|---|---|
| idle | 兩個標籤 `[copy] Exact` / `[copy] Expanded`，選中的底色 `--ink`、字色 `--paper`（15.22:1），未選中的字色 `--ink-2` |
| hover（未選中） | 未選中項底色 `--surface-recessed` |
| focus | 群組用 roving tabindex；focus ring 在目前項 |
| active | 切換瞬間選中底塊用 GSAP 從舊位置 `x` 滑到新位置，`--dur-2` / `--ease-out` |
| loading | 首次切到 Expanded 且共現矩陣尚未建立時：標籤換成 `[copy] Building related terms`，並顯示真實百分比。矩陣建立在 worker，不卡畫面 |
| success | 切到 Expanded 後，若查詢已有延伸詞，下方出現 3.4 的 chips |
| error | 不適用。共現矩陣純本機運算，唯一失敗是資料太少 |
| empty | 金庫少於 40 個對話時 Expanded 被 disabled，tooltip `[copy] Needs at least 40 conversations to learn related terms.` |
| disabled | 同上。`aria-disabled` + 字色 `--ink-disabled`，不套 hover |

---

### 3.4 Expansion chips（延伸詞 chips）

Expanded 模式下，系統加進查詢的每一個詞都以 chip 顯示，可個別刪除。這是「使用者永遠知道系統為什麼給他這個結果」的實作。

| 狀態 | 視覺 |
|---|---|
| idle | `--amber-wash` 底，`--ink` 字，2px 圓角，左側詞、右側 `×` 形狀（SVG，1.5px stroke），格式 `[copy] docker → compose 0.35`（權重顯示到小數兩位） |
| hover | 底色加深一階 `--amber-wash-strong`，`×` 轉 `--alert` |
| focus | focus ring |
| active | `translateY(1px)` |
| loading / success / error | 不適用。刪除是同步操作，立即重排結果 |
| empty | 沒有延伸詞時整列不渲染，不留空盒子 |
| disabled | 不適用 |

刪除某個 chip 後，該詞在本次 session 內被記入 `expansionBlocklist`，往後不再被自動加入，並在 chips 列右側出現 `[copy] Restore removed terms (2)`。

---

### 3.5 Filter drawer（左側抽屜）

四組控制項，全部是文字標籤。

**來源 chips**（`ChatGPT` / `Claude` / `Gemini` / `Custom`，只渲染金庫裡實際存在的來源）

| 狀態 | 視覺 |
|---|---|
| idle（未選） | 1px `--rule-strong` 外框，透明底，`--ink-2` 字 |
| idle（已選） | `--ink` 底、`--paper` 字，左側顯示該來源的 SVG 標記（1.5px stroke，同一套） |
| hover | 未選：外框轉 `--ink-3`。已選：底色轉 `--ink-soft` |
| focus | focus ring |
| active | `translateY(1px)` |
| disabled | 該來源在目前查詢下命中為 0 時：字色 `--ink-disabled`，右側顯示 `0`，仍可點（點下去會顯示為什麼是 0） |
| empty | 只有一個來源時整組不渲染 |

**角色切換**：三選一 `[copy] Anyone` / `[copy] You asked` / `[copy] Assistant said`，狀態同 3.3。

**日期範圍**：兩個 `<input type="month">`，加上一排快捷 `[copy] Last 30 days` / `[copy] This year` / `[copy] All time`。錯誤狀態：起始晚於結束時，兩欄下框線轉 `--alert`，下方 `[copy] The start month is after the end month. Swap them?` 附一個 `[copy] Swap` 按鈕。

**`has code` 開關**：標準 checkbox，標籤 `[copy] Only conversations with code`。

抽屜底部固定一列 `[copy] Clear all filters (3)`，括號內是目前生效的條件數；為 0 時整列不渲染。

---

### 3.6 Spine strip（脊條 / canvas）

搜尋框下方 120px 高的 canvas，每一則對話是一片 3px 高的薄片，按時間由左到右排列（最舊在左）。它是招牌動效的延續與搜尋結果的即時讀數。

| 狀態 | 視覺 |
|---|---|
| idle（無查詢） | 全部薄片以 `--ink` 60% 濃度繪製，高度依訊息數對數縮放（2px 到 14px）。上緣有琥珀色標籤標記出年份分界 |
| hover | 游標所在的薄片變全墨並長高 1.6 倍；上方浮出 1 行標籤：對話標題（截斷至 42 字）+ 日期。用 `mousemove` 換算 x 座標找 index，不用 DOM |
| focus | canvas 本身 `tabindex="0"`；聚焦後方向鍵左右移動游標薄片，`Enter` 開啟該對話 |
| active | 點擊時該薄片閃一次 `--amber` 全高，`--dur-1` |
| loading（索引中） | 見第 6 節。薄片一批一批從右側飛入落定 |
| success（有查詢） | 不符合的薄片 `--dur-2` 內降到 8% 濃度並縮到 0.35 高；命中的升到全墨並長高 1.4 倍；前三名再多長 1.8 倍且頂部畫一條 2px `--amber` 標籤 |
| error | 不適用 |
| empty（金庫空） | 不渲染。脊條只存在於 `loaded` |
| disabled | 不適用 |

reduced-motion：所有變化以 `gsap.set` 立即套用，不 tween。canvas 內容永遠是完整的，不依賴動效才可見。

---

### 3.7 Index list（虛擬捲動的卡片清單）

| 狀態 | 視覺 |
|---|---|
| idle | 卡片列，固定列高 92px（桌機）/ 104px（< 768px）。列之間 1px `--rule`，最後一列無線 |
| hover | 卡片底色 `--surface-card`（比紙灰亮），左緣凸出 1px 的 `--amber` 標籤片（寬 3px、高 20px、位於卡片上緣下方 12px 處），`--dur-1` |
| focus | 卡片可聚焦（`tabindex` roving），focus ring 內縮 2px |
| active | 選中的卡片：底色 `--surface-card`，左緣標籤片變成 5px 寬全高 `--amber`，標題字重 600 |
| loading | 索引尚未跑到這一批時：骨架列，形狀與真卡片一致（標題條 62% 寬、次行 40% 寬、右上日期塊），底色 `--surface-recessed`，用 1.6s 的位置位移微光（不是圓形 spinner） |
| success | 不適用（清單本身即結果） |
| error | 單筆對話解析失敗時，該卡片顯示 `[copy] This conversation could not be read. Its raw record is still exportable.` 並附 `[copy] Export raw` |
| empty | 見 3.17 |
| disabled | 不適用 |

**卡片內容**（無查詢時）：標題（Literata 600，1 行截斷）、來源標記 + 日期 + 訊息數（Public Sans 12px，`--ink-3`）。
**卡片內容**（有查詢時）：標題、命中片段 1 行（命中詞用 3.11 的 hit-mark 標起）、右上角 BM25 分數的相對條（1px 高、無背景槽、寬度為 `score / topScore`）。若命中在非當前分支，片段後方加 `[copy] on an alternate branch`。

虛擬化：容器高 `total * rowHeight` 的 spacer，只渲染可視範圍 ± 6 列。捲動監聽掛在**容器**上（非 `window`），`passive: true`，handler 只寫入 `pendingScrollTop`；真正的重繪在 `gsap.ticker` 回呼裡每幀最多做一次。這是刻意的例外並記錄於此：禁止的是 `window` 捲動監聽驅動動畫，虛擬清單的容器監聽 + 每幀批次重繪是正確做法。

---

### 3.8 Message row（訊息列）

| 狀態 | 視覺 |
|---|---|
| idle（human） | 左側 3px `--amber` 直線標記（僅 1px 以上的彩色左框禁令針對卡片裝飾；此處是訊息歸屬標記，寬度固定 3px 且是資訊本身），角色標籤 `[copy] You` 用 Public Sans 12px `--ink-3`，內文 Literata 17px / 1.62 / 68ch |
| idle（assistant） | 無左側標記，角色標籤 `[copy] Assistant`，內文同上但底色 `--surface-card`，左右 padding 20px |
| hover | 右上角浮出兩個動作：`[copy] Copy` 與 `[copy] Link`（產生 `#c=<convId>&m=<idx>` 的 hash，可貼回瀏覽器跳回同一則） |
| focus | 訊息列 `tabindex="-1"`，被程式聚焦時套 focus ring 並平滑捲到視窗中央 |
| active | 不適用（訊息列不是按鈕） |
| loading | 首次渲染某則超長訊息（> 40,000 字）時：先渲染前 8,000 字，尾端一列 `[copy] Show the remaining 34,120 characters` |
| success | 複製成功：`Copy` 換成 `[copy] Copied`，1.6 秒後換回。不用 toast |
| error | 複製失敗（無剪貼簿權限）：換成 `[copy] Copy blocked by the browser. Select the text and press Ctrl+C.`，停留 4 秒 |
| empty | 整個對話沒有可見訊息時：`[copy] This conversation has no visible messages. It contained only system instructions.` |
| disabled | 不適用 |

---

### 3.9 Branch switcher（分支切換器）

只出現在有兄弟節點的訊息上，貼在該訊息角色標籤右側。

| 狀態 | 視覺 |
|---|---|
| idle | `[copy] ‹ 2 / 3 ›` 三段：左箭頭 SVG、`2 / 3` 等寬字、右箭頭 SVG。1px `--rule-strong` 外框，2px 圓角 |
| hover | 箭頭轉 `--ink`，外框轉 `--ink-3` |
| focus | 個別箭頭可聚焦，focus ring |
| active | 箭頭 `translateY(1px)` |
| loading | 重算路徑通常 < 5ms。若該對話超過 8,000 則訊息，顯示 `[copy] Rebuilding branch` 並在 worker 重算 |
| success | 切換後：新路徑上「與舊路徑不同」的訊息從 `autoAlpha: 0.35, y: 8` 進場到預設狀態，`--dur-2` / `--ease-out`，stagger 0.03；相同的訊息完全不動。這讓使用者一眼看見分支差在哪裡 |
| error | 分支資料損壞（parent 指向不存在的節點）：`[copy] This branch is unreachable in the export. Showing the main path.` 並自動退回 `current_node` 路徑 |
| empty | 沒有分支時整個元件不渲染，不顯示 `1 / 1` |
| disabled | 已在第一則時左箭頭 `aria-disabled`，字色 `--ink-disabled`，不套 hover |

---

### 3.10 Code block（程式碼區塊 + 自寫語法高亮）

| 狀態 | 視覺 |
|---|---|
| idle | 底色 `--surface-code`（`#EDEDE8`，與紙灰只差一階），無外框，上緣 1px `--rule`。左上語言標籤（Public Sans 11px，`--ink-3`），右上 `[copy] Copy`。內文 Spline Sans Mono 13px / 1.62 |
| hover | `Copy` 由 `--ink-3` 轉 `--ink` |
| focus | `Copy` 可聚焦；程式碼區塊本身 `tabindex="0"` 且可用方向鍵水平捲動（超寬時） |
| active | `Copy` `translateY(1px)` |
| loading | 不適用。高亮是同步的單次掃描 |
| success | `Copy` → `[copy] Copied`，1.6 秒 |
| error | 語言無法辨識時不報錯，退回 `plain` 並把語言標籤顯示為 `[copy] plain text` |
| empty | 空的 code fence 不渲染成區塊，當作普通換行 |
| disabled | 不適用 |

超長保護：單一區塊超過 20,000 字時跳過高亮，語言標籤旁加 `[copy] Highlighting skipped for a very long block`。這是誠實的降級，不是靜默失敗。

---

### 3.11 Hit mark（搜尋命中標記）

`<mark>` 元素。底色 `--hit`（`#F0D48A`），字色 `--ink`（11.78:1），無圓角，`padding: 0 1px`。
目前聚焦的那一個命中額外加下緣 2px `--amber-deep`。
沒有 hover / focus / active（它是文字，不是控制項）。

READING PANE 右緣有一列命中指示：`[copy] 4 matches` 加 `‹ ›`，用 `n` / `Shift+n` 也能在命中之間跳。

---

### 3.12 Export menu（匯出選單，popover 非 modal）

觸發器在 READING PANE 右上：`[copy] Export`。

| 狀態 | 視覺 |
|---|---|
| idle | 觸發器 1px `--rule-strong` 外框 |
| hover | 外框 `--ink-3` |
| focus | focus ring |
| active（開啟） | popover 由觸發器下緣展開：`clipPath: inset(0 0 100% 0)` → `inset(0)`，`--dur-2` / `--ease-out`。內容：`[copy] This conversation as Markdown` / `[copy] This conversation as JSON` / 分隔線 / `[copy] All 214 results as Markdown (.zip)` / `[copy] All 214 results as JSON`。批次項的數字是目前篩選後的實際數量 |
| loading | 批次匯出時該列換成真實進度 `[copy] Packing 88 of 214` |
| success | 下載觸發後 popover 關閉，rail 下方狀態列顯示 `[copy] Saved chatvault-chatgpt-20260803.zip (4.2 MB)`，6 秒後淡出 |
| error | 記憶體不足或 Blob 建立失敗：`[copy] The export is too large to build in one file. Narrow the filter and try again.` popover 保持開啟 |
| empty | 篩選後 0 筆時批次項 disabled 並顯示 `[copy] No conversations in the current filter` |
| disabled | 同上 |

Esc 關閉並把焦點還給觸發器。點外部關閉。

---

### 3.13 Stats view（統計視圖）

取代 READING PANE 的內容，INDEX 保持原位。內含五個真實運算的區塊：

1. 頂行三個數字（對話數、訊息數、時間跨度），Literata 顯示字級，非 hero-metric 模板（沒有 accent 大數字 + 小標籤 + 輔助統計的三連）。
2. 每月訊息量長條序列（canvas，墨色長條，最高的一個月用琥珀）。
3. 一天中的時段分佈（24 格）。
4. `[copy] What you asked about` 的詞彙標籤條：只取 `role:human` 的訊息，stopword 過濾，長度 ≥ 3，依 `tf × log(N / df_conversations)` 排序取前 24。以標籤片形式排列（呼應卡片凸出的標籤），點任一個直接把該詞填入搜尋框。
5. `[copy] Longest conversation` 一行，附標題與跳轉連結。

| 狀態 | 說明 |
|---|---|
| loading | 索引未完成時顯示 `[copy] Statistics finish when indexing finishes. 68% read.` 並即時更新，已算好的區塊照常顯示 |
| empty | 不適用（進到 `loaded` 就一定有資料） |
| error | 單一區塊運算失敗時只換掉該區塊，其他照常 |
| hover / focus / active | 只有詞彙標籤與長條有互動（同 3.5 chips 的規則） |
| disabled | 不適用 |

---

### 3.14 Field mapping wizard（通用 fallback 對映精靈）

偵測不到已知格式時，在投放區原地展開（不是 modal，因為使用者需要同時看到檔案內容與對映結果）。

四個下拉，選項來自**實際解析出的第一個物件的鍵路徑**（含巢狀，如 `chat.messages[].body`）：

```
[copy] Conversation title      →  <select>
[copy] Created at              →  <select>
[copy] Messages array          →  <select>
[copy] Message role field      →  <select>
[copy] Message text field      →  <select>
```

右側即時預覽前三則訊息。

| 狀態 | 視覺 |
|---|---|
| idle | 全部下拉未選，預覽區顯示 `[copy] Pick the fields on the left to see a preview.` |
| hover / focus / active | 標準表單控制項狀態 |
| loading | 讀取第一個物件時（大檔可能要 1 到 2 秒）顯示 `[copy] Reading the first record` |
| success | 五個都選好且預覽有內容時，主要動作由 disabled 轉為可用：`[copy] Use this mapping`。按下後解析全檔，並把對映以「鍵形狀雜湊」為 key 存進 `localStorage`，下次同型檔案自動套用 |
| error | 對映後預覽為空：`[copy] That field is empty in the first three records. Try another field.` |
| empty | 檔案第一個物件沒有任何陣列型欄位：`[copy] No message list found in this file. ChatVault needs an array of messages inside each record.` 附 `[copy] Show the raw structure` 展開鍵樹 |
| disabled | `Use this mapping` 在五個欄位選滿之前 disabled，並在旁註明還缺哪幾個：`[copy] Still needed: messages array, text field` |

---

### 3.15 Vault manager（金庫管理）

在 rail 的 `Import` 旁，展開為一個面板：每個來源一列（來源名、對話數、佔用估計、`[copy] Remove`），底部是 `navigator.storage.estimate()` 的真實使用量與 `[copy] Keep this vault when storage runs low`（呼叫 `navigator.storage.persist()`）。

`[copy] Clear the whole vault` 是唯一使用確認對話的動作：要求輸入 `delete`，說明 `[copy] This cannot be undone. Your original export files are not touched.` 確認鈕在輸入正確前 disabled。

---

### 3.16 Notice（行內通知元件）

錯誤與警告的統一容器。不用 toast（toast 會消失，錯誤不該消失）。

- 結構：1px 上框線（`--alert` 或 `--amber-deep`）、`--alert-wash` 或 `--amber-wash` 底、標題（Public Sans 600 13px）、說明（Literata 15px）、一到兩個動作。
- 沒有圖示。沒有彩色圓點。標題本身說明嚴重度。
- hover / focus / active 只作用在內含的動作按鈕上。
- 每一則 notice 都必須同時回答「發生什麼事」與「怎麼繼續」。第 8 節逐條列出。

---

### 3.17 Empty result panel（無結果）

不是 `No results`。是一個可操作的診斷。

```
[copy] Nothing matches "kubernetes ingress" with these filters.
```
下方逐條列出目前生效的每一個條件，每一條都是可點掉的 chip，並附上「拿掉這條會有幾筆」的真實預估（用同一個索引重跑一次不含該條件的查詢，成本 < 20ms）：

```
[copy] role:human        drop this → 41 matches
[copy] after:2025-03     drop this → 12 matches
[copy] source:claude     drop this → 3 matches
```

若拿掉全部條件仍是 0，改顯示：
```
[copy] "kubernetes ingress" does not appear anywhere in your vault.
[copy] The closest terms in your vault are: kubernetes, ingest, nginx.
```
（closest terms 來自 trigram 相似度，是真的算出來的。）

---

### 3.18 Rail（頂列）

桌機單行，高 64px（上限 80px）。左：wordmark（Literata 600，非圖示）。中：搜尋框。右：`[copy] Stats` / `[copy] Import` / `[copy] Hyperkit`（相對連結 `../index.html`）。
`empty` 狀態的 rail 只有 wordmark 與 `Hyperkit`，沒有搜尋框（沒東西可搜）。
狀態列（parse 進度、匯出結果）貼在 rail 下緣，是一條 28px 的獨立列，只在有內容時佔位（用 `height` 動畫避免內容跳動時的 CLS：預留 28px 的固定槽，內容以 `autoAlpha` 進出）。

---

### 3.19 Semantic search enabler（選配的語意搜尋）

搜尋模式切換右側的一個文字連結 `[copy] Enable meaning search`。

| 狀態 | 視覺 |
|---|---|
| idle | 文字連結，`--ink-3`，底線 1px dotted |
| hover / focus / active | 標準連結狀態 + focus ring |
| 確認步驟 | 點擊後在原地展開說明（非 modal）：`[copy] This downloads a 23 MB sentence model from huggingface.co, once. It runs in this tab. Your conversations are never sent anywhere.` 兩個動作：`[copy] Download the model` / `[copy] Not now` |
| loading | 真實下載進度 `[copy] Downloading the model: 8.4 MB of 23.1 MB`，接著 `[copy] Building vectors: 1,204 of 3,271 conversations`（在 worker，可取消） |
| success | 連結換成第三個搜尋模式 `[copy] Meaning`，加入 3.3 的切換群組 |
| error | `[copy] Meaning search is unavailable: the model could not be downloaded. Keyword search is unaffected.` 附 `[copy] Try again`。**任何失敗都必須被 catch 住，主控台不得出現未捕捉的錯誤** |
| empty | 金庫少於 40 個對話時不渲染這個入口 |
| disabled | 下載進行中，連結變成 `[copy] Cancel download` |

實作硬性條件：模組以 `await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/+esm')` 動態載入，**寫在 worker 內的 try/catch 裡，只在使用者確認後才執行**。頁面初次載入不得有任何與此相關的網路請求。失敗時走上面的 error 文案，不進主控台。

---

## 4. 首次到訪（零資料）看到什麼

`empty` 狀態的完整構成已在第 2.1 節列出。此處補上構成細節，這一屏必須是被精心構成的畫面而不是「暫無資料」：

- **左欄**是排版。H1 用 Literata 620 字重、`opsz 72`、`clamp(2.75rem, 6.2vw, 4.5rem)`、`-0.02em`、行高 1.06。兩行斷行由 `text-wrap: balance` 加上一個明確的 `<br>` 保險（`Two years of conversations.` / `One search box.`）。
- **右欄**是那個抽屜。它有真實的物理性：上緣 3px 的墨色前緣、一個 44×8px 的把手形狀、底部 `--shadow-drawer` 的偏移柔影。它不是插圖，它是投放區本身，可點、可拖入、可用鍵盤觸發。
- **底部**沒有捲動提示。區塊 2 的第一列標題在 1280×800 下露出約 40px，這就是捲動的邀請。
- **手機（375px）**：左右欄變成上下。H1 縮到 2.25rem，抽屜高度降到 240px，`Load sample vault` 與 `Choose export file` 並排成兩個等寬按鈕。首屏仍完整容納四個元素。
- 沒有 hero 統計數字、沒有「已被 X 人使用」、沒有 logo 牆（這個產品沒有客戶，捏造就是造假）。

**範例金庫的存在理由**：訪客多半沒有帶著匯出檔來。`Load sample vault` 是這個站有沒有價值的分水嶺，因此它必須走完全相同的管線，而且範例內容必須是真實可讀的技術對話（24 則，含 3 個有分支的），不是佔位文字。

---

## 5. 鍵盤路徑

### 5.1 Tab 順序

**`empty` 狀態**
1. Skip link `[copy] Skip to import`（僅聚焦時可見）
2. wordmark（`<a href="./index.html">`）
3. `Hyperkit`
4. Drop zone
5. `Load sample vault`
6. 區塊 2 內的可展開列（若有）
7. 區塊 3 的三個 tab（roving tabindex，群組內用左右鍵）
8. 區塊 4 內的連結
9. 頁尾連結

**`loaded` 狀態**
1. Skip link `[copy] Skip to search`
2. wordmark
3. Search field
4. `Syntax` 揭露
5. 搜尋模式切換（roving）
6. Expansion chips（若有，每個可聚焦）
7. `Stats` / `Import` / `Hyperkit`
8. Filter drawer 內所有控制項（來源 chips 為 roving 群組）
9. Spine strip（單一 tab stop，內部用左右鍵）
10. Index list（單一 tab stop，內部用上下鍵，`aria-activedescendant`）
11. Reading pane 的 `Export`、命中導覽、然後是訊息內容區（單一 tab stop，內部用 `j` / `k`）

< 768px 時，被覆蓋的欄位以 `inert` 移出 tab 序列，不留幽靈 tab stop。

### 5.2 快捷鍵

| 鍵 | 行為 |
|---|---|
| `/` 或 `Ctrl/Cmd + K` | 聚焦搜尋框並全選現有查詢。輸入框已聚焦時 `/` 正常輸入字元 |
| `Esc` | 搜尋框有內容 → 清空並保持聚焦；搜尋框已空 → 失焦並把焦點還給 index list；popover / 抽屜 / 精靈開啟 → 關閉並還原焦點到觸發器；確認對話 → 取消 |
| `↑` / `↓` | 在 index list 內移動選取（搜尋框聚焦時也生效，不需先離開輸入框） |
| `Enter` | 開啟選取的對話並把焦點移到 reading pane 的標題 |
| `Shift + Enter` | 開啟但焦點留在 index list（連續瀏覽） |
| `j` / `k` | reading pane 內下一則 / 上一則訊息 |
| `[` / `]` | 目前聚焦訊息的上一個 / 下一個分支 |
| `n` / `Shift + n` | 下一個 / 上一個搜尋命中（跨訊息，會自動捲動） |
| `Ctrl/Cmd + Enter`（搜尋框內） | 執行查詢並包含非當前分支的訊息 |
| `?` | 展開鍵盤說明面板（rail 下方的 disclosure，非 modal）。再按 `?` 或 `Esc` 收起 |
| `g` 然後 `s` | 切到 Stats |
| `g` 然後 `i` | 切回 Index |

所有快捷鍵在 `input` / `textarea` / `contenteditable` 聚焦時只有 `Esc`、`Ctrl/Cmd+K`、`↑`/`↓`、`Ctrl/Cmd+Enter` 生效。

### 5.3 Esc 行為總表

由內而外逐層退出，一次一層，永遠把焦點還給觸發它的元素：
確認對話 → 匯出 popover → 對映精靈 → 手機版覆蓋面板 → 鍵盤說明 → 搜尋框內容 → 搜尋框焦點。

---

## 6. 招牌動效時刻：The Drawer Fills

**一句話動機**：把無法避免的索引等待變成可觀看的事件，而且這個事件本身就是「索引已經建好了」的證明；索引完成後，同一組視覺元素直接變成搜尋結果的即時讀數。

指派的世界是圖書館卡片目錄櫃，因此這個時刻是**抽屜被卡片填滿**，不是粒子星雲。粒子星雲屬於暗色世界，在這裡是錯誤。

### 六個階段

**階段 1 - 抽屜拉開（0 到 0.24s）**
`drop` 事件後，投放區的墨色前緣 `y: -6`，`--dur-2` / `--ease-out`；內部從虛線框轉為一個空的抽屜內腔（底部一道 `inset` 陰影，透視上收 6%）。canvas 掛載。

**階段 2 - 卡片飛入（貫穿整個解析期）**
worker 每解析完約 200 則對話送回一批。每一批在 canvas 上是一疊 3px 高的薄片，從抽屜右後方（x 超出右緣 12%、y 高於落點 40px、`scale 0.86`）飛向各自的落點。
- GSAP：一個 `gsap.timeline()` 每批一條，`stagger: { each: 0.004, from: "end" }`，`duration: 0.64`，`ease: "power4.out"`（指數型 ease-out），落地用 `--ease-settle` 做 40ms 的極小過衝。
- 薄片飛行時拖 0.35 秒的殘影：canvas 每幀不清空，而是疊一層 `--paper` 的 8% alpha 矩形，形成自然衰減的尾跡。
- 落點由該對話的時間戳決定 x（最舊在左），由該批次的序號決定 y 的層疊高度。抽屜因此是**由後往前、一層一層變厚**的。
- 效能：GSAP 只 tween 一組數值物件（每個薄片一個 `{x, y, s, a}`），一個 `gsap.ticker` 回呼統一畫。DOM 節點數為 1（canvas）。上限 4,000 個薄片；超過時每 N 則對話合併為一片並在完成文案標註實際數量。

**階段 3 - 標籤升起（索引階段，與階段 2 交錯）**
倒排索引每完成一個區段，就從已建立的高頻詞裡取一個尚未出現的詞，在卡片疊的上緣升起一片琥珀標籤（寬度依詞長，高 14px，寫著那個詞）。
- `y: +18 → 0`、`autoAlpha: 0 → 1`、`duration: 0.42`、`ease: "power3.out"`、`stagger: 0.06`。
- 標籤排滿一列後整列以 `x` 緩慢左移（`ease: "none"`，因為這是持續位移不是進場），新的標籤從右邊補進來。全頁只有這一處持續位移，不構成第二個 marquee。
- 這是索引存在的視覺證據：使用者看見的是自己的詞。

**階段 4 - 合攏（完成瞬間，0.42s）**
整疊卡片 `y: +6` 再回到 0，`duration: 0.42`、`ease: "power2.out"`（壓縮與回彈，像整理一疊紙）。同時一道 1px 的 `--amber` 索引線由左掃到右，`duration: 0.36`、`ease: "power2.inOut"`。

**階段 5 - 前緣落下、工作台露出（0.52s）**
抽屜前緣 `y: +120%` 滑出畫面下方，`ease: "power3.in"`（進入型，因為它是離場）。同時後方的三欄工作台以 `clipPath: inset(0 0 100% 0)` → `inset(0)` 揭開，`duration: 0.52`、`ease: "power4.out"`，兩者以 `"<0.08"` 交疊。
中央落下計數器文字（真實數字）：
`[copy] 3,271 conversations. 214,908 messages. Indexed in 11.2 s. Nothing left this tab.`
文字以 `y: 10 → 0` + `autoAlpha`，`duration: 0.4`，位置 `"<0.16"`。

**階段 6 - 卡片疊變成脊條（0.44s）**
同一個 canvas 從抽屜位置移動並壓縮到搜尋框下方的 120px 脊條位置（`y` + `scaleY`，`ease: "power4.out"`）。它不消失，它變成了工具的一部分。從此每一次按鍵，脊條就是搜尋結果（3.6 的 success 狀態）。

### 為什麼這是一個時刻而不是四散的效果

階段 1 到 6 是一條連續的敘事：抽屜打開、卡片進來、標籤長出來、抽屜合上、前緣落下、卡片疊變成你的搜尋工具。同一個 canvas、同一組薄片，從頭到尾沒有換過主角。頁面其他地方**不重複**這套進場動畫：篩選、切分支、開匯出選單各自有自己的短促回饋（120 到 300ms），不做進場 stagger。

### reduced-motion

用 `gsap.matchMedia()`：

```js
const mm = gsap.matchMedia();
mm.add({ reduce: "(prefers-reduced-motion: reduce)", ok: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
  if (ctx.conditions.reduce) return;   // canvas 仍然逐批繪製，只是不 tween
  /* 階段 1 到 6 的 timeline 寫在這裡 */
});
```

reduce 條件下：
- canvas 仍然畫，但每批用 `gsap.set` 直接落定，沒有飛行與殘影。
- 標籤直接出現，不升起。
- 前緣不滑動，直接切換 `empty → loaded`。
- 計數器直接顯示最終數字。
- 脊條的搜尋回饋改成瞬間套用。

內容在任何情況下都是預設可見的。CSS 裡不得出現任何 `opacity: 0` 等 JS 來救的寫法；所有動效起點都是「已經可見」的狀態，或者是動態建立的 canvas 內容。

---

## 7. 效能契約（互動層面）

- 主執行緒任何一次同步工作 > 50ms 視為缺陷。解析、索引、共現矩陣、embedding 全在 worker。
- 搜尋從按鍵到畫面重排 < 120ms（含 90ms debounce），20 萬則訊息規模。
- 虛擬清單 DOM 節點數固定：index list ≤ 22 列，reading pane ≤ 28 則訊息（含測量快取與 `ResizeObserver` 修正）。
- canvas 動效期間維持 60fps：每幀一次 `clearRect` 加一輪迴圈，不做 per-sliver 的 DOM 操作。
- 索引以 typed array 存放：`Int32Array` 文件 id、`Uint16Array` 詞頻、`Uint8Array` 的 delta varint 位置串 + `Uint32Array` 偏移表。

---

## 8. 失敗路徑總表

每一條都有：偵測方式、逐字文案、復原動作。文案同時說明「發生什麼事」與「怎麼繼續」。

| # | 情況 | 偵測 | 文案（逐字） | 復原 |
|---|---|---|---|---|
| 1 | 用 `file://` 開啟 | `location.protocol === 'file:'` | `[copy] ChatVault needs to be served over http. ES modules and Web Workers are blocked on file:// URLs.` 第二行等寬：`[copy] python -m http.server 8000` | 顯示一個可複製的指令列；頁面其餘內容仍然渲染（可讀，不可用） |
| 2 | 格式無法辨識 | 四種結構特徵全部不符 | `[copy] We could not match this file to a known export format. Map the fields yourself and ChatVault will remember this shape.` | 直接展開對映精靈（3.14） |
| 3 | JSON 中途損壞 / 截斷 | 串流分割器在 EOF 時仍有未閉合的深度 | `[copy] Parsing stopped at conversation 1,842 of about 3,300. The file looks truncated after 148.2 MB. What was read is saved and searchable.` | 兩個動作 `[copy] Keep what was read` / `[copy] Discard and start over` |
| 4 | zip 內沒有可辨識的檔案 | 中央目錄掃完沒有命中 | `[copy] That zip has 14 files but none look like a conversation export. ChatVault looks for conversations.json, a chat_messages array, or a Google Takeout activity file.` | 列出 zip 內全部檔名（可捲動），每一個都可點選「就用這個」 |
| 5 | 瀏覽器不支援 `DecompressionStream` | `typeof DecompressionStream === 'undefined'` | `[copy] This browser cannot unzip inside the page. Unzip the export yourself and drop conversations.json instead.` | 投放區回到 idle，接受 `.json` |
| 6 | IndexedDB 配額不足 | 捕捉 `QuotaExceededError` | `[copy] Your vault needs about 340 MB but this browser allowed 210 MB. Already-read conversations are safe.` | 三個動作：`[copy] Keep this vault when storage runs low`（`navigator.storage.persist()`）、`[copy] Remove a source`、`[copy] Import one export at a time` |
| 7 | Worker 無法建立 | `new Worker()` 拋錯 | `[copy] Background parsing is unavailable here. ChatVault can parse on the main thread, but the tab may freeze for a while on large files.` | `[copy] Parse anyway` / `[copy] Cancel` |
| 8 | 查詢無結果 | 命中數 0 | 見 3.17 | 逐條可點掉的條件 chip + 真實預估 |
| 9 | 語意模型下載失敗 | worker 內 `import()` 或 fetch 拋錯 | `[copy] Meaning search is unavailable: the model could not be downloaded. Keyword search is unaffected.` | `[copy] Try again`。主控台不得留下未捕捉錯誤 |
| 10 | 重複匯入 | 去重鍵命中 | `[copy] 412 new conversations added. 2,859 were already in your vault.`（這是成功不是錯誤，用琥珀色 notice 不用警示色） | 無需動作，6 秒後淡出 |
| 11 | 單一對話過大（> 5,000 則） | 訊息數檢查 | reading pane 分頁：`[copy] Showing the latest 1,000 of 6,412 messages.` | `[copy] Load 1,000 earlier` |
| 12 | 分支資料損壞 | parent 指向不存在節點 | `[copy] This branch is unreachable in the export. Showing the main path.` | 自動退回 `current_node` 路徑 |
| 13 | 剪貼簿被封鎖 | `navigator.clipboard.writeText` reject | `[copy] Copy blocked by the browser. Select the text and press Ctrl+C.` | 自動選取該段文字 |
| 14 | 匯出檔太大無法組成 Blob | `new Blob` 拋錯或 > 1.8 GB | `[copy] The export is too large to build in one file. Narrow the filter and try again.` | popover 保持開啟，篩選條件仍在 |
| 15 | 檔案是空的或 0 bytes | `file.size === 0` | `[copy] That file is empty. Check that the download finished.` | 投放區回 idle |

**不做的事**：不用 `alert()`、不用 `confirm()`、不用會自動消失的錯誤 toast、不用只寫「發生錯誤」的訊息、不把技術錯誤字串直接丟給使用者（原始錯誤寫進 `console.debug`，介面上給人話）。

---

## 9. 無障礙契約

- 全部互動元件用原生語意元素（`button` / `a` / `input` / `select`）。自訂元件補 `role` + `aria-*`。
- index list 用 `role="listbox"` + `aria-activedescendant`；卡片 `role="option"`。
- 搜尋結果數量變更時，`aria-live="polite"` 的 region 播報 `[copy] 214 conversations, 1,097 messages`（節流 600ms，避免每個字元都播報）。
- 解析進度用 `role="progressbar"` + `aria-valuenow`（真實位元組百分比）。
- canvas 有 `role="img"` + 即時更新的 `aria-label`，內容是文字版摘要；canvas 內的資訊在 DOM 裡有等價的可存取形式（index list 本身）。
- focus ring 一律可見，不得 `outline: none` 而不補等價指示。
- 對比：內文與 placeholder ≥ 4.5:1，大字 ≥ 3:1，逐一在 DESIGN-DIRECTION.md 的 token 表列出實測比值。
- 所有色彩承載的資訊都有第二個編碼：來源用標記形狀 + 文字、命中用底色 + `<mark>` 語意、錯誤用標題文字而非顏色。
