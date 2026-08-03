# 漸層工坊 GradientKit

一個在 OKLCH 而不是 sRGB 裡插值的漸層編輯器。它會指出灰帶最嚴重的那一點在哪，並給你可以直接
上線的 CSS，連真正能用的備援一起。

線上版：`https://fengfeng1021.github.io/hyperkit/gradientkit/`

---

## 這是什麼

其他漸層產生器都在 sRGB 裡插值，這在物理上就避不開兩個高彩度顏色中間那條掉色的灰帶。漸層工坊
在 OKLCH 裡插值，量出 sRGB 那條路賠掉多少彩度，然後把數字印出來。

整個產品就是這一句話。網格、顆粒、抖色、各種輸出、對比量測、色覺模擬，存在的理由都是為了讓這
一句話在工作上真的用得上。

介面本身沒有任何色相。純黑、白色髮絲線、一階灰。一個有品牌色的色彩工具是壞掉的儀器，所以這裡
成功不是綠色、錯誤不是紅色、focus 也不是藍色。畫面上每一個你看到的色相都是你自己的。

## 怎麼用

打開就好。不用註冊、沒有空白畫面、沒有導覽流程：儀器已經在跑了，標本也已經上好。

1. **按空白鍵。** 載物台上會出現一條接縫。左邊是 OKLCH 插值的結果，右邊是你原本所在的色彩空
   間。方括號會框住最糟的那一點，把真正的彩度差印出來。接縫可以拖，斜坡上任何位置都能比。
2. **改。** 在載物台下面那把尺上拖色標，點尺就插一個新的，連點色標把手會開出顏色小面板，裡面
   有 hex 加 L、C、H。數字可以直接打，也可以拖欄位標籤來刷。
3. **複製。** 右欄早就備好 CSS 了，含 `@supports` 區塊，以及從 OKLCH 曲線重新取九個位置抓下
   來的 sRGB 備援。SVG、Tailwind v4 和 PNG 都在隔壁分頁。
4. **分享。** 按「複製連結」會把整個漸層塞進網址。收到連結的人打開是一份可以改的文件，不是一
   張截圖。

**手邊沒有素材？** 列上的「載入範例櫃」會載入十二組漸層標本和三組網格，把工作區換成「深空」、
把顆粒打開、順便填好對比量測。一鍵就有一個完整、有內容的結果。同一份資料也放在
`assets/reference-set.json`，你想用讀的、或餵給自己的工具都可以。

### 鍵盤

| 按鍵 | 動作 |
|---|---|
| `Space` | 拿目前的色彩空間跟 OKLCH 比一次 |
| `1` `2` `3` | 線性、放射、圓錐 |
| `Q` `W` `E` `R` | 切到 sRGB、HSL、OKLab、OKLCH，不跑比對 |
| `M` | 在漸層和網格之間切換 |
| `G` / `D` | 顆粒開關、抖色開關 |
| `C` | 輪流切換色覺模擬 |
| `T` | 跳到對比量測 |
| `+` / `-` | 在最寬的空隙加一個色標、刪掉目前選到的 |
| `[` `]` | 在色標或網格點之間移動 |
| `Ctrl/Cmd + C` `S` `Z` | 複製目前開著的分頁、存到本機、復原（加 Shift 是重做） |
| `?` | 快速鍵面板 |
| `Esc` | 取消拖曳、關掉小面板、還原欄位 |

每一個值都能用鍵盤操作，包含色標位置、色標顏色和網格點。色標把手是真的 slider，帶
`aria-valuetext`，載物台則會在每次變動後重新產生自己的描述文字。

## 技術細節

純靜態頁面。沒有 build step、沒有 bundler、沒有 framework、沒有 runtime 相依。原生 HTML、CSS
custom properties 和 ES modules。從任何一台 web server 打開 `index.html` 就能跑。

### 色彩運算是手寫的

`js/color.js` 實作了整條鏈，而且一個東西都沒 import：

- sRGB 轉 linear-sRGB 用完整的分段轉換函式，而且保留正負號，所以超出色域的中間值能撐過來回轉
  換。`pow(c, 2.2)` 這種偷吃步在任何地方都沒用，包含 shader 裡——那正是多數 WebGL 漸層工具在
  暗部悄悄失準的地方。
- linear-sRGB 轉 OKLab 和轉回來，用 Bjorn Ottosson 的矩陣、全精度，並且用 `cbrt` 而不是
  `pow(x, 1/3)`，因為 `l`、`m`、`s` 在色域對應過程中真的會變成負的。
- OKLab 轉 OKLCH，無彩色的色相是 `NaN` 而絕不是 `0`。硬塞一個假的色相 0，正是讓黑到橘的斜坡
  繞過紅色的那個 bug。
- 色域對應照 CSS Color 4 第 13.2 節：對彩度做二分搜尋，用 Delta E OK 當接受條件，而不是天真
  地逐通道裁切。被裁到的彩度和 Delta E 都會在顏色小面板裡以實際數字呈現。
- 色相沿最短弧插值，並處理無色相端點的色相沿用。
- WCAG 2.1 相對亮度與對比比值。APCA 刻意不實作：它的規格還在改，而送出一個之後會變的數字，會
  砸掉這個工具唯一在賣的東西。

`tools/check-color.mjs` 會驗 4096 個等距顏色加 2000 個隨機顏色的 `hex -> OKLCH -> hex` 來回轉
換、驗 Bayer 遞迴跟它的封閉解一致、驗無色相沿用、驗白底黑字剛好是 21:1。動過運算之後記得跑
`node tools/check-color.mjs`。

### 算圖

`js/render.js` 是一支 WebGL2 fragment shader，是 `js/gradient.js` 的 GPU 雙胞胎。同樣的轉換、
同樣的最短弧色相插值，以及同一套色域搜尋的固定 12 次迭代版本——因為沒有上界的迴圈對 GLSL 編
譯器很不友善。

- Device pixel ratio 上限壓在 2，把 fragment 成本框住。
- 有序抖色是用標準遞迴產生的 8x8 Bayer 矩陣，在 gamma 編碼空間、8-bit 寫入前一刻以剛好 `1/255`
  的幅度施加。這就是把你在放大鏡裡看到的色帶消掉的東西。
- 顆粒是在線性光下施加的 hash noise，所以它在暗部的行為像底片，而不是加成式地把畫面洗白。顆粒
  大小改的是顆粒本身的尺寸，不只是密度。
- 色覺矩陣在線性光下施加，而且永遠不會進到輸出檔案裡。
- 如果沒有 WebGL2、shader link 失敗、或 context 掉了，載物台會退到 Canvas2D 路徑，跑同樣的運
  算但線性解析度只有六分之一，而且會講出來。無論走哪條路，輸出都維持全解析度，以 256px 為單位
  分塊算，每塊之間讓出主執行緒。

### 網格

`N` 個控制點，每個帶一個 OKLab 顏色和一個半徑，在 OKLab 裡用反距離加權混合。用 OKLab 而不是
sRGB，就是色團交界不會出現灰縫的原因，跟漸層那邊的道理一樣。

### 輸出

- **CSS**：一段 sRGB，色標是從 OKLCH 曲線上重新取九個位置抓下來的；再加一段 `@supports`，裡面
  是真正的 `oklch()` 值。兩段在給你複製之前，都先在你的瀏覽器裡用 `CSS.supports()` 來回驗過。
  備援絕不是兩個色標硬猜的。
- **SVG**：真的 `linearGradient` 和 `radialGradient`，用 `objectBoundingBox` 單位，角度放在
  `gradientTransform`，重新取樣成十七個 sRGB 色標。圓錐在 SVG 裡沒有對應的原生元素，所以那個
  分頁改成嵌一張 512px 的點陣圖，內容就是載物台上看到的，而且會明講。
- **Tailwind**：v4 的 `@theme`，不是 v3 的 config 物件。
- **PNG**：用同一支 shader 直接在目標尺寸算，所以抖色和顆粒是全解析度長出來的。裝置配不出
  4096px 就退到 2048px，而且會告訴你。

### 狀態

網址 hash 帶了全部：`#gk1&k=g&t=l&a=200&i=oklch&s=071033@0,4FE3C1@78,EAFFF7@100&d=1`。解析是完
備的：每個欄位各自驗證，壞掉的欄位退回自己的預設值而不是中止整段解析，而且不存在任何一條讀
hash 會丟例外的路徑。寫入用 `history.replaceState`，所以改漸層不會把上一頁按鈕塞滿幾百筆記錄。

復原是 50 步的環狀緩衝。整個拖曳手勢算一筆；同一個欄位在 600ms 內的連續編輯會合併成一筆。

## 隱私

全部都在你的分頁裡跑。

- 不用帳號、沒有伺服器、不上傳、沒有分析、沒有 cookie。
- 你存的漸層放進這個瀏覽器的 `localStorage`，key 是 `gk.saved.v1`，不會去別的地方。如果瀏覽器
  擋掉儲存，面板會講清楚，並改推分享連結，而不是直接壞掉。
- 丟進來的圖只在記憶體裡解碼，用來讀出四個顏色，從不上傳也不留存。
- 分享連結把漸層帶在網址裡，所以分享不會在任何地方留下記錄。
- 這一頁唯一會發出的網路請求，是 Google Fonts 的字型和 CDN 上的 GSAP。把它們擋掉，工具照樣能用。

## 檔案

```
gradientkit/
  index.html              direction contract、完整結構
  css/tokens.css          唯一可以出現色票字面值的地方
  css/style.css           版面、元件、狀態、斷點
  js/color.js             色彩科學，純函式，零 import
  js/gradient.js          取樣、斜坡、彩度損失、CPU 光柵化
  js/render.js            WebGL2 shader 加 Canvas2D 備援
  js/state.js             store、hash schema、復原環
  js/presets.js           範例櫃（示範資料）
  js/output.js            CSS、SVG、Tailwind、PNG 的產生
  js/outputs.js           輸出分頁與程式碼區塊
  js/track.js             尺規、色標把手、顏色小面板
  js/sweep.js             比對接縫和它的數字
  js/panels.js            色覺、放大鏡、對比量測、本機收藏
  js/sections.js          比較條與範例櫃層架
  js/controls.js          數字欄位、slider、開關、radio group
  js/extract.js           從丟進來的圖抓四個色標
  js/library.js           localStorage，含配額與無痕模式處理
  js/notice.js            唯一的訊息介面
  js/icons.js             Lucide 的 path data，內嵌
  js/main.js              組裝、影格排程、鍵盤
  assets/reference-set.json  範例櫃的可攜資料
  tools/check-color.mjs   手動執行，不屬於任何 build
```

## 動效掛勾

動效層是 `js/motion.js`，在 `main.js` 之後載入，整支刪掉也不會改變這一頁說的話或做的事。它補間
的是純數字，再透過下面這組 API 寫回去；接縫本身沒有動到任何 DOM 元素，這就是它能維持 60fps 的
原因。

只有三件事會動，不多不少。掃描是那個招牌時刻：2.4 秒等速前進、在量到的最糟點停下來框住它並打
出真正的百分比、走完剩下的路、一次 1.5% 的呼吸、程式碼的擦亮、接縫停在那個發現上。另外兩個是
插值色彩空間控制項上只出現一次的首訪光環，以及調整顆粒時推進的顆粒相位。沒有任何東西跟捲動綁
在一起，所以 ScrollTrigger 不會被載入。

`window.GradientKit` 對外開放 `store`、`renderer`、`sweep`、`track`、`announce`、`notice`、
`scheduleFast` 和 `renderNow`。

| 掛勾 | 位置 | 動效層拿它做什麼 |
|---|---|---|
| `renderer.setSweep(x, shake, fromSpace)` | `js/render.js` | 把 `x` 從 0 補間到 1 來驅動接縫。`shake` 是只施加在接縫上的像素位移。 |
| `sweep.choreograph(fn)` | `js/sweep.js` | 註冊落點序列。回傳 `true` 掃描就不碰接縫；什麼都不註冊的話，接縫會立刻落在量到的點上——那就是 reduced-motion 的行為。 |
| `renderer.setGrainPhase(v)` | `js/render.js` | 只影響預覽的顆粒相位，加在 seed 上。永遠不會進到輸出。 |
| `.gk-sweep`、`.gk-sweep-rail`、`.gk-sweep-line`、`.gk-sweep-grip` | 載物台覆蓋層 | 接縫。`--seam`（百分比）和 `--shake` 是 `.gk-sweep` 上的 custom property；transform 掛在軌道上，所以接縫不需要量測任何東西，也撐得住視窗縮放。 |
| `.gk-sweep-label` | 載物台覆蓋層 | `sRGB < \| > OKLCH`，在前 240ms 的行程中淡入。 |
| `.gk-sweep-bracket` | 載物台覆蓋層 | 死區方框。用 `clip-path` 由左往右畫出來，收尾時放大到 1.06 並淡出。 |
| `.gk-sweep-deficit` | 載物台覆蓋層 | 量到的百分比。在方框底下逐字打出來。 |
| `.gk-stage-canvas` | 載物台 | 接縫落定後 1.5% 的呼吸。只動 transform。 |
| `.gk-code-wipe` | 輸出面板 | 變動行的高亮。補間 `clip-path`；填色用 `--user-mid-wash`，也就是這個漸層自己的中間色，絕不是綠色。 |
| `.gk-stop` | 尺規 | Hover、拖曳，以及放開後 220ms 的落定。留在 CSS 裡，動效層不碰。 |
| `.gk-spaces::after` | 左欄 | 只出現一次的首訪光環，由 `--pulse` custom property 驅動。讀 `document.documentElement.dataset.firstVisit`。 |
| `.gk-stage.is-scanning` | 載物台 | 掃描期間掛上。把 hover 十字線和讀數藏起來，免得兩台儀器搶同一片像素。 |
| `.gk-notice`、`.gk-sheet`、`.gk-btn--arm::after` | 各處 | 留在 CSS。短的功能性轉場不需要時間軸。 |
| `.gk-tile`、`.gk-band` | B、C 區塊 | 刻意不做動效。這一版沒有捲動揭露的編排。 |

全部都包在 `gsap.matchMedia()` 裡，帶一個 `reduce` 分支。在 reduced motion 下不會註冊
choreographer，所以接縫直接落在量到的最糟點上，方框已經畫好、百分比已經印出來，而且可以用指標
和方向鍵拖：課上完了，只是節奏交給使用者。樣式表裡沒有任何一個元素設成 `opacity: 0` 等
JavaScript 來救，四個一開始隱藏的元素在需要之前根本不在 DOM 裡，所以就算 script 掛了也不會留
下一片空白。每一段序列都可以打斷：碰接縫、按 Esc、或載入一個範例，都會在同一個影格內停下來把
控制權交還。

## 出處

- OKLab 與色域對應依照 Bjorn Ottosson 的推導和 CSS Color 4 規格。
- 色覺缺陷矩陣出自 Machado、Oliveira 與 Fernandes，2009 年。
- 圖示：[Lucide](https://lucide.dev)，ISC 授權，path data 內嵌在 `js/icons.js`。
- 字型：Sora、Fragment Mono 與 Noto Sans TC，都走 Google Fonts。

隸屬於 [hyperkit](../index.html)。
