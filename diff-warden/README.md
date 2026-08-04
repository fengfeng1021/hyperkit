# 產碼審查台 / diff-warden

把 agent 剛寫進資料夾的那批程式碼架上檢測台，掃一遍，得到一份**可以交給別人看的缺陷清單**。

原始碼不上傳到任何第三方。審查請求由你的瀏覽器直接送往你自己的 API key 所屬的供應商。

線上位置：<https://fengfeng1021.github.io/hyperkit/diff-warden/>

---

## 這是什麼

Cursor / Claude Code 幫你寫了三千行，跑起來了，測試（如果有的話）過了，但你沒有逐行讀過。
你知道「跑得起來」跟「不會爆」是兩件事，而跨檔案的問題你就算逐行讀也會漏掉。

這個工具做三件 agent 對話做不好的事：

1. **跨檔案的結構化缺陷清單** —— 每一條有 `檔案:行號`、嚴重度、類別、以及「什麼情況下會爆」。
   跨檔案的缺陷永遠排在最前面，並用引線把兩個位置接起來。這是列，不是一段散文。
2. **可累積的誤報記憶** —— 每一條可以按「這類我不管」，產生一條規則指紋存在本機。
   下次同類的東西直接不顯示，清單頂端寫著「已依你的 16 條判讀規則自動略過 8 條」，可展開回收。
3. **可以交給別人看的報告檔案** —— 匯出 Markdown，標頭帶審查範圍聲明（幾個檔案、為什麼是這些、
   排除了什麼、用哪個模型、套用幾條判讀規則）。這是它能被信任的原因。

## 怎麼用

1. 開啟頁面，按 **選擇資料夾**（沒有 API key 就先按 **看範例報告**，零門檻看完整輸出）。
2. 按 **標記基準線**：遞迴讀檔、算 SHA-256、存進本機 IndexedDB。這不解析 `.git`，
   所以在沒有版本控制的資料夾上一樣能用。
3. 讓 agent 去寫程式碼。回來按 **掃描變動**，得到有變動的檔案清單。
4. 填入你自己的 API key，確認讀數窗上的**估算 token 與估算花費**，按 **開始審查**。
5. 逐條看。用不上的按「這類我不管」。按 **匯出 Markdown**。

第二次以後打開這一頁，畫面已經是工作台：資料夾授權續用、基準線在、排除規則在、
判讀規則在、預算與模型都記住了。你只要按一顆按鈕。

### 快捷鍵

`o` 選資料夾 · `b` 標記基準線 · `d` 掃描變動 · `r` 開始審查 · `/` 篩選 · `f` 只看跨檔案 ·
`s` 略過條 · `m` 匯出預覽 · `?` 快捷鍵表 · `Esc` 由內而外關閉一層。
在缺陷清單內：`↑` `↓` 移動、`Enter` 展開節錄、`x` 這類我不管、`c` 複製。

## 技術要點

| 項目 | 做法 |
|---|---|
| 選資料夾 | `window.showDirectoryPicker()`；handle 可結構化複製，直接 `put` 進 IndexedDB，回訪用 `queryPermission({mode:'read'})` 續用 |
| 非 Chromium | `<input type="file" webkitdirectory>` 一次選整個資料夾，功能完整，只是沒有持久授權 |
| 基準線 | 遞迴列檔 → `crypto.subtle.digest('SHA-256', …)` → IndexedDB。比對現況得出變動清單 |
| 檔案挑選 | 依變動量排序，單次上限預設 60k token，超出就分批。表格上有「為什麼被選」欄，可覆寫 |
| 關聯圖 | 本機正規表示式解析相對路徑的 `import` / `require`，隨檔案一起送出。不是語意索引 |
| 串流 | `fetch` + `response.body.getReader()` + `TextDecoder`，手動切 `data:` 行。模型輸出 JSONL，每收到一個換行就解析出一條缺陷，所以缺陷是一條一條浮現的 |
| 行號驗證 | 每一條缺陷的行號都在本機對照過檔案內容。超出範圍就標記「行號未能對應」並降一階，不是照樣顯示 |
| 規則指紋 | `sha256(類別 + '\|' + 正規化訊息 + '\|' + 檔案樣式)`。正規化會去掉行號、引號內容與數字 |
| 儲存 | IndexedDB：`specimens` / `baselines` / `rules` / `runs`。localStorage：key、供應商、模型、預算、排除規則 |
| 建置 | 零 build。原生 HTML + CSS + ES modules，全站相對路徑 |

### 送出的請求長什麼樣

Anthropic：

```
POST https://api.anthropic.com/v1/messages
x-api-key: <你的 key>
anthropic-version: 2023-06-01
anthropic-dangerous-direct-browser-access: true
```

最後那個標頭是瀏覽器直連的必要條件，沒有它會被 CORS 擋掉。

OpenAI：`POST https://api.openai.com/v1/chat/completions`，`Authorization: Bearer <你的 key>`。

介面上有一個一級控制項 **檢視送出內容**，會顯示實際的 request body（key 不在裡面，它只在標頭）。
這是有 NDA 的人唯一能自己驗證的方式，所以它不是彩蛋。

## 隱私

- **這個站沒有後端。** 沒有分析、沒有錯誤回報服務、沒有 cookie。
- 資料流向只有四個節點：**本機資料夾 → 你的瀏覽器 → 你自己的 API key → 供應商**。沒有第五個。
- 唯一的外部資源是 Google Fonts（字型檔）。它不接觸你的檔案，也不接觸你的 key。
- 檔案內容只在你按下「開始審查」時，送往你選定的供應商。送出前你可以逐個取消勾選，
  也可以先看過完整的 request body。
- 基準線、判讀規則、歷史報告都存在你的瀏覽器裡（IndexedDB）。清除瀏覽器資料會一起清掉，
  所以規則庫有 **匯出 / 匯入 JSON**，按鈕就在右軌規則庫底下，不藏在三層選單裡。

## 誠實的限制

- **瀏覽器支援不對等。** File System Access API 只有 Chromium 系（Chrome / Edge / Opera）有，
  Firefox 與 Safari 完全沒有。後者走 `webkitdirectory`，功能完整，但**沒有持久授權**：
  每次回來都要重選一次資料夾。這件事寫在首頁，不藏在 FAQ。
- **API key 存在 localStorage，是明文。** 瀏覽器沒有更安全的選項：任何前端加密的金鑰
  也必須存在同一個地方。如果這台電腦不是只有你用，建議用一把限額的 key。
- **費用是你付給供應商的。** 這個站不經手任何金流，也拿不到你的用量。
  單價表寫在 `js/pricing.js` 並標明取得日期（2026-08），**不是即時報價**，實際以帳單為準。
  送出前顯示估算，收到回應後顯示實際用量與估算落差（估準與估不準都顯示）。
- **模型會出錯。** 行號有本機驗證，但「這個缺陷是不是真的」沒有辦法自動判斷。
  這份報告是給人看的起點，不是判決。
- **一次一個資料夾。** 第一版不做整 repo 語意索引、不解析 `.git`、不串 GitHub / GitLab、
  不做 CI、不自動套用修補、不做多 repo、不做行內編輯。你旁邊本來就開著編輯器。
- **超過 1 MB 的單檔與二進位檔會被跳過**，表尾會寫出跳過幾個。
- **歷史報告最多保留 40 次**，超過自動汰舊（規則庫永不自動刪）。

## 檔案結構

```
diff-warden/
  index.html          方向契約註解 + SVG sprite + 兩個 stage
  css/tokens.css      唯一顏色來源，每個顏色都標了對比比值
  css/style.css
  js/main.js          boot、stage 切換、面板接線
  js/fs.js            showDirectoryPicker / webkitdirectory 雙路徑
  js/baseline.js      遞迴列檔、SHA-256、變動比對、import 關係圖
  js/store.js         IndexedDB 與 localStorage
  js/budget.js        token 與花費估算、挑檔與分批
  js/pricing.js       單價表（標明取得日期）
  js/provider.js      Anthropic / OpenAI 送出與 SSE 解析
  js/prompt.js        系統提示與 JSONL 輸出格式
  js/fingerprint.js   規則指紋與訊息正規化
  js/defects.js       行號驗證、排序、渲染
  js/strip.js         探傷帶 canvas
  js/report.js        Markdown 產出與匯出
  js/sample.js        nabe-orders 範例報告
  js/motion.js        GSAP 動效層（招牌時刻「擊點」；整層可拆）
  PRODUCT.md          產品真實
  docs/INTERACTION.md 互動規格
  docs/DESIGN-DIRECTION.md 視覺契約
```

## 授權

MIT（見 repo 根目錄的 `LICENSE`）。
