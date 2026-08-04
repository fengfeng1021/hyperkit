# 去背熔爐 Cutout Forge

電商商品照批次去背，整套跑在瀏覽器分頁裡。不用帳號、不扣點數、沒有張數上限、不加浮水印。

線上版：`https://fengfeng1021.github.io/hyperkit/cutout-forge/`
回首頁：[`../index.html`](../index.html)

---

## 這是什麼

上架前一天，攝影師交回 200 張照片。市面上的 SaaS 工具張張收費，免費額度只給你四分之一百萬像素，而且吐回來的去背圖你還得自己縮放、墊白底、改檔名、分資料夾，Amazon 才肯收。

去背熔爐在你自己的機器上，一次把整段做完：

- **批次佇列**，可以開始、暫停、繼續、重跑、移除、復原。第 201 張跟第 1 張的行為完全一樣。
- **兩套去背引擎**，都是真的，都有出貨：
  - `briaai/RMBG-1.4`，透過 transformers.js 跑，WebGPU 優先，WASM 墊底。
  - 一套自己從頭寫的 chroma-key 泛洪填色，零依賴，網路線拔掉也還在。
- **平台輸出規格**，Shopify、Amazon、Etsy、Shopee：正方形尺寸、商品要佔畫面多少、透明 PNG 加白底 JPEG、檔名樣板。全部可改，全部會記住。
- **結構化 ZIP 匯出**，依平台與格式分好資料夾，附一份 `_manifest.csv`，記錄每個檔案是哪個引擎跑的、哪幾張被標記要看一下。
- **前後對照檢視器**，分隔線可拖曳、1:1 原始像素、羽化與去色溢即時預覽，還有一欄真的量出來的數字。
- **省錢帳本**，跑完第一張才會出現，單價由你自己填。

## 怎麼用

1. 開頁面。想先看它能不能用，按 **載入 6 張範例**。範例是在你瀏覽器裡用 canvas 畫出來的，走的流程跟真照片一模一樣。
2. 或是把一整個資料夾的照片拖到熔爐台上，也可以按 **選擇照片**。
3. 佇列會自己開始跑。看著照片牆，或是把分頁丟著去忙別的。
4. 在左欄勾你有在賣的平台。任一列按 **調整** 可以改尺寸、佔比、檔案格式、JPEG 品質、檔名樣板。
5. 點任何一張縮圖檢查邊緣。拖分隔線，或用方向鍵。
6. 按 **匯出**，ZIP 就掉進你的下載資料夾。

### 鍵盤

`O` 開啟檔案 · `S` 載入範例 · `P` 開始／暫停／繼續 · `E` 匯出 · `?` 這份清單 · `Esc` 退回上一層。在照片牆裡：方向鍵移動、`Enter` 開啟、`Space` 選取、`Ctrl+A` 全選、`Delete` 移除、`R` 重跑。在檢視器裡：`[` `]` 換上下一張、`Z` 切換 1:1。

## 隱私

**你的照片不會離開這個分頁。** 沒有伺服器、沒有上傳端點、沒有分析追蹤。你可以自己驗：打開網路面板，跑一批，看它什麼都沒送出去。把網路線拔掉，這批照樣跑完。

**模型權重只下載一次**，從 `huggingface.co` 經 jsDelivr CDN，WebGPU 大約 88 MB、WASM 大約 44 MB，之後就住在瀏覽器的 Cache Storage 裡，第二次開瞬間就好，離線也能開。頁面載完之後，那次下載是這個工具唯一發出的網路請求，而且你可以用 **跳過，直接用 chroma-key** 完全不下載。

這是兩件不同的事，所以在介面上是分開講的。字型來自 Google Fonts；如果你介意，頁面會退回系統的 UI 字型與等寬字，功能完全不受影響。

設定（輸出規格、單價、羽化與去色溢的預設值）存在 `localStorage`。其他什麼都不留。佇列本身是刻意不存的。

## 技術筆記

純靜態檔案。沒有 build step、沒有 npm、沒有 bundler、沒有框架。打開 `index.html` 就跑。

### 記憶體

200 張 24 百萬像素的 JPEG 全解析度解碼，大約是 19 GB 的像素資料 — 批次工具就是這樣把筆電弄死的。這裡的規矩：

- 顯示用的解碼一律限制在**長邊 512 px**，靠 `createImageBitmap(file, { resizeWidth, resizeQuality: 'medium' })`。
- 像素尺寸直接從**檔頭**讀出來（JPEG SOF、PNG IHDR、WebP、ISO BMFF `ispe`），所以規劃解碼時完全不需要先握著整張圖。
- 每張照片只留一份 **512 px 的 mask**，大約 256 KB。200 張大約 50 MB。
- 原始解析度**只在匯出時，一次開一張**，處理完馬上釋放才碰下一張。解碼上限也會壓到目前勾選規格真正需要的最大尺寸，所以一張 1024 px 的 Shopee JPEG 不會花掉 8000 px 的記憶體。
- 並行數是 `clamp(round(hardwareConcurrency / 2), 1, 4)`，解碼失敗時會自己減半，並在底部狀態列講出來。

### chroma-key 這條路

`js/chroma.js`，純 JavaScript、零依賴，跑在 worker 裡。

1. 從四個邊各取 2 px 的框當樣本。
2. 轉成 CIE Lab，取中位數當背景色，取 delta-E76 的 90 百分位當色差幅度。
3. 容差是 `clamp(spread * 1.6, 6, 22)`。
4. 標出所有落在容差內的像素。
5. 做連通區域標記。一個區塊如果碰到邊界，或大到足以判定是刻意的鏤空，就算背景。第二條就是為什麼戒指中間會被挖掉，而商品內部的感光雜訊不會。
6. 兩次 3x3 形態學閉運算，再三輪 box blur 做羽化。

老實講它的守備範圍：純色或接近純色的棚拍背景，也就是大部分的商品攝影。範圍外：毛料、頭髮、玻璃、漸層、雜亂的房間。當背景量出來不夠純，這張會被標記要看一下，而不是默默放行。

### 標記規則

alpha 覆蓋率低於 2% 或高於 97%、chroma-key 的背景色差超過 12、或是有超過 6% 的像素落在 alpha 0.08 到 0.92 之間，這張就會被標成 **要看一下**。這些是啟發式判斷，所以介面上寫的是「要看一下」，永遠不是「失敗」。

### 讓出執行緒

批次在照片之間是用 `MessageChannel` 往返讓出執行緒，不是 `requestAnimationFrame`。賣家會把這個分頁丟著，跑去後台改商品；分頁一被切到背景，rAF 就停了，佇列會凍住。計時器在背景分頁會被節流到一秒一次。message-channel 的 macrotask 既不節流也不停。

### ZIP

`js/zipwriter.js` 寫的是 stored（不壓縮）條目，含真正的 CRC32、local header、central directory 與 EOCD record。PNG 和 JPEG 本來就壓過了，再 deflate 一次只換來幾個百分點，卻要付出主執行緒的時間。條目以 `Blob` 保存，瀏覽器會把它放在硬碟而不是 JS heap，所以大量匯出不會變成一堆躺在記憶體裡的 byte array。超過 1.9 GB 的匯出會拆成編號的分卷，每一卷都帶完整的 manifest。

`_manifest.csv` 以 UTF-8 BOM 開頭，Excel 才不會把中文欄位讀成亂碼。

### 檔案

```
cutout-forge/
  index.html          direction contract、sprite、外殼
  css/
    tokens.css        顏色的唯一來源
    style.css         版面與元件
  js/
    main.js           DOM 接線、鍵盤、提示、視圖切換
    queue.js          佇列、並行數、記憶體壓力
    engine.js         硬體偵測、模型暖機、推論
    chroma.js         chroma-key 演算法、羽化、量測
    worker.js         chroma.js 的 worker 包裝
    pool.js           worker pool，附行內備援
    compose.js        alpha 套用、去色溢、重新構圖
    presets.js        平台輸出規格與它的編輯器
    exporter.js       匯出流程、命名、manifest
    zipwriter.js      只做 store 的 ZIP writer
    inspector.js      前後對照檢視、量測
    ledger.js         省錢計數器
    samples.js        六張 canvas 畫出來的範例商品
    util.js           工具函式、檔頭解析、儲存
```

### 建置上的幾點說明

- icon sprite 直接內嵌在 `index.html` 裡，而不是去抓 `assets/icons.svg`，這樣用 `file://` 直接開檔時 `<use>` 也解得出來。
- 縮圖牆是 `role="listbox"` 配 `role="option"` 項目與 roving tabindex。`role="grid"` 會要求每一列包一層 `role="row"`，而這個 CSS grid 版面沒有地方放；listbox 本來就正確帶著多選語意。
- `--scan`、`--erase`、`--split` 都註冊成 `inherits: true`，因為三個都是設在父層、由子層讀取。
- 模型下載會報出偵測到的裝置的真實大小：WebGPU fp16 是 88 MB，WASM q8 是 44 MB。direction contract 裡寫的是 44 MB；實際跑的是哪一個，看畫面上的即時讀數。
- 動效全部住在 `js/motion.js`，掛在 `js/main.js` 底部列出的具名 hook 上。它是加法：完全沒有動畫在跑時，每一個狀態都是完整而可讀的，所以 GSAP 被擋掉、什麼都沒註冊時，頁面照樣是對的；`prefers-reduced-motion` 底下也一樣。
- 唯一被創作的時刻是照片牆顯影：由中心往外的到場錯位、每格一道等速掃描光帶，以及光帶掃過下緣的瞬間觸發的放射狀 `mask-image` 溶解。光帶是因，去背圖是果，所以它一定會先跑完才讓照片顯影。
- `.tile` 上的 `transform` 是一條共用通道，是手動排序的：到場動畫先落地，才量測整面牆給 Flip；飛行中的抖動先落地，才交給重新分組；重新分組進行時不會有新的抖動開始。獨立的 `scale` 屬性**不能**當第二條通道用 — GSAP 會把它算出來的值折進 `transform`，並在第一次為某個元素建 transform cache 時寫下行內的 `scale: none`。
- 分頁被切到背景時 `requestAnimationFrame` 會停，GSAP 也就跟著停。動效層在 `visibilitychange` 時會把所有飛行中的 tween 直接落地，所以賣家跑去後台再回來，看到的是正確的 DOM，不是補到一半的 tween。

## 下一步

這裡輸出的透明 PNG 可以直接丟進[情境織機](../mockup-loom/)。
