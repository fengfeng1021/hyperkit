/* Authoring source for assets/sample-vault.json.
   Run:  node assets/_build-sample.mjs
   This file is not loaded by the site. It exists so the sample export stays
   readable and editable instead of being a wall of generated JSON.

   The conversations are written in Traditional Chinese because the sample has
   to show a Taiwanese reader what the search is doing at a glance. Code blocks
   stay in their original language: they are output, not prose. */

const C = (s) => s.replace(/\n\s*\|/g, "\n").trim();

export const CONVERSATIONS = [
  {
    title: "被限流的 API 該怎麼指數退避",
    t: "2025-02-11T09:42:00Z",
    msgs: [
      ["h", C(`合作廠商的 API 一直回我們 429。現在的做法是重試三次、每次固定等 1 秒，但一到他們的尖峰
        |時段還是整個垮掉。重試策略到底該長什麼樣？`)],
      ["a", C(`問題就出在固定等 1 秒。所有被限流的用戶端都等一樣的 1 秒，然後在同一個瞬間再打過去，
        |等於你把造成 429 的那根尖峰原封不動重建了一次。你需要三件事：指數成長、上限，還有抖動。

        |\`\`\`js
        |async function withBackoff(fn, { tries = 6, base = 250, cap = 20_000 } = {}) {
        |  let attempt = 0;
        |  for (;;) {
        |    try {
        |      return await fn();
        |    } catch (err) {
        |      if (!isRetryable(err) || attempt >= tries - 1) throw err;
        |      const ceiling = Math.min(cap, base * 2 ** attempt);
        |      const wait = Math.random() * ceiling; // full jitter
        |      await new Promise((r) => setTimeout(r, wait));
        |      attempt++;
        |    }
        |  }
        |}
        |\`\`\`

        |這是所謂的 full jitter：等待時間是 0 到上限之間的均勻分布，而不是直接等上限。順利的情況下
        |你會多付一點延遲，換來的是用戶端一多就非常明顯的碰撞率下降。`)],
      ["h", "伺服器會告訴我們該等多久嗎？我有時候看到 Retry-After 這個 header。"],
      ["a", C(`有 \`Retry-After\` 就照做。那是權威答案，你的退避只是猜測。

        |常見的寫法是：header 在就用 header，不在就退回帶抖動的指數退避；而且 header 想把你推過你自己
        |設的上限時，不要默默照做，至少記一筆 log。

        |\`\`\`js
        |function waitFor(res, attempt, base, cap) {
        |  const header = res.headers.get("retry-after");
        |  if (header) {
        |    const seconds = Number(header);
        |    const ms = Number.isFinite(seconds)
        |      ? seconds * 1000
        |      : Date.parse(header) - Date.now();
        |    if (ms > 0) return Math.min(ms, cap);
        |  }
        |  return Math.random() * Math.min(cap, base * 2 ** attempt);
        |}
        |\`\`\`

        |還有一件值得做的事：只重試 429、502、503、504 和網路錯誤。重試 400 只是拿你的配額去燒一個
        |永遠不會成功的請求。`)],
      ["h", "那總時間預算呢？六次、每次上限 20 秒，等於一個請求可以拖到兩分鐘。"],
      ["a", C(`給整個操作一個截止時間，不要去數次數。次數是時間的代理指標，而且是很差的那種。

        |傳一個帶 deadline 的 \`AbortSignal\` 進去，每次睡之前檢查一次，最後一次睡眠要縮短，讓你剛好
        |在截止時間失敗、而不是超過之後才失敗。

        |呼叫端如果是使用者在等的請求，3 到 5 秒的預算通常是對的，而且應該快速失敗、退到快取或降級的
        |回應。呼叫端如果是背景工作，5 分鐘預算配一個高很多的上限就沒問題。`)],
    ],
    branches: [
      {
        at: 3,
        alt: [
          ["a", C(`在動重試策略之前，先確認你到底該不該重試。

            |大部分的 429 風暴其實是併發量問題，只是穿了一件重試的外衣。如果你有 40 個 worker 一起從
            |同一個佇列拉任務，去打一個每秒只允許 10 個請求的 API，那沒有任何退避策略救得了你，它只會
            |把失敗換個地方發生。

            |解法是在流量離開你的行程之前，先用一個客戶端限流器把它整形：

            |\`\`\`js
            |class TokenBucket {
            |  constructor(rate, burst) {
            |    this.rate = rate; this.burst = burst;
            |    this.tokens = burst; this.last = Date.now();
            |  }
            |  async take() {
            |    for (;;) {
            |      const now = Date.now();
            |      this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
            |      this.last = now;
            |      if (this.tokens >= 1) { this.tokens -= 1; return; }
            |      await new Promise((r) => setTimeout(r, ((1 - this.tokens) / this.rate) * 1000));
            |    }
            |  }
            |}
            |\`\`\`

            |前面擋了一個 bucket 之後，退避才會回到它原本該有的位置：例外路徑。`)],
          ["h", "有道理。可是他們文件寫得很模糊，速率我要怎麼抓？"],
          ["a", C(`量出來。先把 bucket 設低到整整一天都看不到 429，然後每次調高 20%，直到出現第一個 429，
            |再退回上一階。

            |把 429 的次數當成一個 metric 記起來，讓這個數字是看得見的，而不是團隊裡的口耳相傳。

            |如果對方是按金鑰給額度、而你手上有好幾把金鑰，限流器要掛在每一把金鑰上，不是掛在每一個
            |行程上，否則你會用不完自己付錢買的配額。`)],
        ],
      },
    ],
  },

  {
    title: "Postgres 為什麼不用我建的索引？",
    t: "2025-01-23T14:05:00Z",
    msgs: [
      ["h", C(`我在 \`events(created_at)\` 上建了索引，這個查詢還是走 sequential scan：
        |\`SELECT * FROM events WHERE created_at > now() - interval '7 days'\`。表有四千萬列。為什麼？`)],
      ["a", C(`最可能的原因是：七天佔全表的比例太大，planner 判斷索引不划算。

        |寬表的 index scan 每一列都要隨機抓一次 page，sequential scan 則是照順序讀。選擇性一旦超過大約
        |5% 到 10%，sequential scan 是真的比較快。

        |先看 planner 怎麼想：

        |\`\`\`sql
        |EXPLAIN (ANALYZE, BUFFERS)
        |SELECT * FROM events WHERE created_at > now() - interval '7 days';
        |\`\`\`

        |比對最上層節點的預估列數和實際列數。差很多就是統計資訊過期了，\`ANALYZE events;\` 就是解法。
        |預估準確卻還是選 sequential scan，那 planner 大概是對的。`)],
      ["h", "預估很接近。但我其實只要三個欄位，不需要整列。"],
      ["a", C(`那就把這件事講出來，順便把那幾個欄位放進索引，讓它自己就能回答查詢：

        |\`\`\`sql
        |CREATE INDEX CONCURRENTLY events_created_at_covering
        |  ON events (created_at) INCLUDE (event_type, user_id);
        |\`\`\`

        |這樣 \`SELECT created_at, event_type, user_id FROM events WHERE created_at > ...\` 就能走
        |index-only scan，讀的 page 數比走 heap 少非常多。

        |兩個要注意的地方。visibility map 必須夠新，不然 Postgres 還是要回 heap 檢查 tuple 可見性，
        |所以這種寫入量的表要確認 autovacuum 跟得上。另外 \`INCLUDE\` 的欄位不能拿來過濾或排序，只能
        |用來回傳。`)],
      ["h", "還有什麼常見的原因會讓索引用不到？"],
      ["a", C(`有四個一直在發生：

        |在索引欄位上套函式或轉型。\`WHERE date(created_at) = '2025-01-01'\` 用不到 \`created_at\` 的
        |索引。改寫成範圍查詢，或者對 \`date(created_at)\` 建一個表達式索引。

        |欄位和參數型別對不上，最常見的是經過 ORM 之後的 \`text\` 對 \`varchar\`，或 \`bigint\` 對
        |\`numeric\`。

        |\`LIKE '%foo%'\` 開頭的萬用字元。B-tree 幫不上忙，那是 trigram 索引的工作。

        |還有 \`random_page_cost\` 在 SSD 上還留著預設的 4.0。現在的硬碟設 1.1 比較接近現實，而且它會
        |直接改變這類查詢的計畫選擇。`)],
    ],
  },

  {
    title: "IndexedDB 交易一直自己關掉",
    t: "2025-03-04T21:18:00Z",
    msgs: [
      ["h", C(`批次匯入五萬筆資料，大概跑到一半就噴
        |"TransactionInactiveError: Failed to execute 'put' on 'IDBObjectStore'"。前面幾千筆都很正常。`)],
      ["a", C(`IndexedDB 的交易只在還有未完成請求時才活著。一旦微任務佇列排空、而這個交易上沒有待處理的
        |請求，瀏覽器就會把它 commit 掉。所以在迴圈裡 \`await\` 任何不是 IndexedDB 請求的東西，交易就
        |死了：

        |\`\`\`js
        |// broken: the fetch lets the transaction commit before the loop resumes
        |const tx = db.transaction("records", "readwrite");
        |for (const r of records) {
        |  const extra = await fetch(r.url);   // transaction dies here
        |  tx.objectStore("records").put({ ...r, extra });
        |}
        |\`\`\`

        |先把所有非同步的工作做完，再開交易，然後同步寫進去。`)],
      ["h", "我的迴圈裡沒有 fetch，但我每一個 put 都有 await。"],
      ["a", C(`await 每一個 put 通常沒問題，因為包住 \`request.onsuccess\` 的 promise 是在同一個交易
        |生命週期內完成的。

        |但只要你的包裝多繞了一個微任務、或者你 \`await Promise.all\` 了不相關的東西、又或者你用
        |\`for await\` 跑一個會 yield 的非同步產生器，就會踩到同一個失敗。

        |比較可靠的寫法是「一次射完再收」：所有 put 都不 await，最後 await 交易本身。

        |\`\`\`js
        |function writeChunk(db, rows) {
        |  return new Promise((resolve, reject) => {
        |    const tx = db.transaction("records", "readwrite");
        |    const store = tx.objectStore("records");
        |    for (const row of rows) store.put(row);
        |    tx.oncomplete = () => resolve(rows.length);
        |    tx.onabort = tx.onerror = () => reject(tx.error);
        |  });
        |}
        |\`\`\`

        |一批切 200 到 1000 筆。五萬筆包成一個交易是能跑，但會吃掉大量記憶體，也沒有任何東西可以拿來
        |回報進度，而且一旦 abort 你就全部重來。`)],
      ["h", "每一批都開一次交易，成本會不會很高？"],
      ["a", C(`有一點固定成本，主要是 commit 的 fsync。

        |實務上一批 500 的吞吐量已經很接近一個巨大交易，同時你還拿到了進度訊號，以及一個你講得清楚的
        |回滾單位。

        |拿 \`performance.now()\` 包住 \`writeChunk\` 量一下，用你自己的資料試 100、500、2000。過了幾百
        |之後曲線就夠平了，確切數字很少有影響。`)],
    ],
  },

  {
    title: "三欄工作區要用 grid 還是 flexbox",
    t: "2024-11-30T10:12:00Z",
    msgs: [
      ["h", C(`我要做一個三欄版面：固定 244px 的篩選面板、固定 372px 的清單，還有一個彈性寬度的閱讀區。
        |用 flexbox 還是 grid？`)],
      ["a", C(`grid，而且差距不小。你的欄寬是容器的性質，不是子元素的性質。用 grid 你可以把整個版面寫在
        |一個地方：

        |\`\`\`css
        |.workspace {
        |  display: grid;
        |  grid-template-columns: 244px 372px minmax(0, 1fr);
        |  min-height: 100dvh;
        |}
        |\`\`\`

        |用 flexbox 的話，你得把 \`flex: 0 0 244px\` 這種宣告分散到三條子元素規則裡，而且閱讀區還是得加
        |\`min-width: 0\`，才不會被長單字撐爆版面。grid 用 \`minmax(0, 1fr)\` 同時解決這件事，還把意圖
        |留在讀的人會去找的容器上。`)],
      ["h", "那寬度變窄的時候會壞在哪裡？"],
      ["a", C(`不要讓它自己塌，重新宣告一次 template。大概像這樣：

        |\`\`\`css
        |@media (max-width: 1119px) {
        |  .workspace { grid-template-columns: 300px minmax(0, 1fr); }
        |  .workspace > .filters { position: fixed; inset: 0 auto 0 0; width: 300px; }
        |}
        |@media (max-width: 767px) {
        |  .workspace { grid-template-columns: minmax(0, 1fr); }
        |}
        |\`\`\`

        |我自己的規則是：每一個多欄版面都要在同一個區塊裡宣告它自己在 768px 以下的行為。「它會自然塌
        |下來」正是你最後會看到 372px 的清單塞在 375px 的手機裡、旁邊留 3px 閱讀區的原因。`)],
    ],
  },

  {
    title: "搜尋框防抖動不要吃掉最後一個字",
    t: "2025-04-18T16:44:00Z",
    msgs: [
      ["h", C(`我的搜尋 debounce 有時候會吃掉最後一個字。使用者打「postgres」，送出去的查詢卻是
        |「postgre」。我用的是 150ms 的 trailing debounce。`)],
      ["a", C(`那不是 debounce 吃字，是舊的回應贏了競態。

        |兩個請求同時在飛，先發的後回，就把新的結果蓋掉了。debounce 只是降低發生機率，不是消滅它。

        |給每個查詢一個序號，不是最新的就丟掉：

        |\`\`\`js
        |let seq = 0;
        |async function run(query) {
        |  const mine = ++seq;
        |  const results = await search(query);
        |  if (mine !== seq) return;  // a newer query started, drop this
        |  render(results, query);
        |}
        |\`\`\`

        |如果搜尋要打遠端，再幫每個查詢加一個 \`AbortController\`，把前一個取消掉，才不用為你註定要丟掉
        |的工作付錢。`)],
      ["h", "debounce 應該用 leading 還是 trailing？"],
      ["a", C(`trailing，但要搭配一次立即的本地更新。

        |感覺最快的做法是：每次按鍵都同步更新便宜的那些 UI（查詢文字回顯、清除按鈕、查詢字串本身的
        |語法標色），只有昂貴的排序才進 debounce。

        |本地索引的話 90 到 120ms 是甜蜜點。低於 80ms 你等於每一次按鍵都重排一次，卻感覺不出差別；
        |超過 200ms 就開始有延遲感。

        |還有一件事：按 Enter 和失焦時要立刻把 debounce 沖掉。打完字馬上按 Enter 的人不該還在等計時器。`)],
    ],
  },

  {
    title: "迴圈裡的 borrow checker 錯誤",
    t: "2024-12-09T11:30:00Z",
    msgs: [
      ["h", C(`Rust 不讓我編譯這段，我看不懂為什麼：

        |\`\`\`rust
        |let mut cache: HashMap<String, Vec<u32>> = HashMap::new();
        |for key in keys {
        |    let entry = cache.entry(key.clone()).or_default();
        |    entry.push(compute(&cache));
        |}
        |\`\`\`
        |錯誤是 "cannot borrow \`cache\` as immutable because it is also borrowed as mutable"。`)],
      ["a", C(`這個錯誤完全正確，而且它正在擋一個真的 bug。

        |\`entry\` 活著的期間持有 \`cache\` 的可變借用，\`compute(&cache)\` 卻在同一時間想要不可變借用。
        |如果允許，\`compute\` 就有可能看到一個「\`or_default()\` 剛塞進去、馬上就要被改寫」的空 vector。

        |先算，再借：

        |\`\`\`rust
        |for key in keys {
        |    let value = compute(&cache);
        |    cache.entry(key).or_default().push(value);
        |}
        |\`\`\`

        |順便我也把 \`clone()\` 拿掉了，因為 \`entry\` 是吃 key 的所有權，而 \`keys\` 本來就被迴圈消耗掉。`)],
      ["h", "如果 compute 真的需要看到它等一下要寫進去的那個 entry 呢？"],
      ["a", C(`那你手上是一個 read-modify-write，就把它明講出來。把舊值取出來、算完、再放回去：

        |\`\`\`rust
        |for key in keys {
        |    let current = cache.remove(&key).unwrap_or_default();
        |    let next = compute(&current, &cache);
        |    cache.insert(key, next);
        |}
        |\`\`\`

        |這樣多付一次雜湊查找，換來資料流一目了然。如果 profiling 說那次查找真的有差，\`get_mut\` 配
        |\`std::mem::take\` 可以避開移除，但先有量測數字再去碰它。`)],
    ],
  },

  {
    title: "把 1.2 GB 的 Docker image 瘦下來",
    t: "2025-05-06T08:55:00Z",
    msgs: [
      ["h", C(`我們的 Node 服務 image 有 1.2 GB，光是拉映像檔部署就要四分鐘。該從哪裡開始？`)],
      ["a", C(`先看，不要猜。\`docker history --no-trunc <image>\` 會列出每一層的大小，前三層通常就佔了
        |九成。

        |Node image 的常見兇手是：基底映像檔、含 dev 相依套件的 \`node_modules\`，還有從來沒清掉的建置
        |產物。

        |多階段建置可以解掉大部分：

        |\`\`\`dockerfile
        |FROM node:22-bookworm AS build
        |WORKDIR /app
        |COPY package*.json ./
        |RUN npm ci
        |COPY . .
        |RUN npm run build && npm prune --omit=dev

        |FROM node:22-bookworm-slim
        |WORKDIR /app
        |COPY --from=build /app/node_modules ./node_modules
        |COPY --from=build /app/dist ./dist
        |USER node
        |CMD ["node", "dist/server.js"]
        |\`\`\`

        |光是換成 slim 基底，通常就差了 700 MB。`)],
      ["h", "alpine 值得為了它放棄 slim 嗎？"],
      ["a", C(`有時候值得，而且它有實際代價。

        |Alpine 用 musl 而不是 glibc。那些只提供 glibc 預編譯二進位檔的原生模組，要嘛退回從原始碼編譯
        |——建置變慢、image 反而變大——要嘛直接失敗。musl 底下 DNS 解析行為的長期差異也咬過不少對外
        |查詢很多的服務。

        |我的原則：從 \`-slim\` 開始。除非你量過拉映像檔的時間、而且它真的有影響，並且確認過每一個原生
        |相依套件都有 musl 版本，才考慮換 alpine。

        |從 1.2 GB 追到 220 MB 值得追，從 220 MB 追到 150 MB 通常不值得。`)],
    ],
    branches: [
      {
        at: 1,
        alt: [
          ["a", C(`在優化 image 之前，先確認慢的到底是不是 image 大小。

            |1.2 GB 拉四分鐘大約是 40 Mbit/s，看起來像是走公網、而且完全沒有分層快取。有兩個問題值得
            |先回答：

            |你的節點在不同次部署之間有重用分層嗎？如果每次部署只有應用程式碼會變、而那段程式碼在最後
            |一層，那拉下來應該是幾 MB，不是 1.2 GB。如果每次部署都整包重拉，多半是你的 \`COPY . .\` 放
            |在 \`npm ci\` 上面，每一個 commit 都讓相依層失效。

            |還有，同一個區域裡有 registry 或 pull-through cache 嗎？把 registry 搬到叢集旁邊，效果常常
            |比你在 Dockerfile 裡能做的任何事都大。`)],
          ["h", "你說對了，我們是先 copy 整包 repo 才安裝。順序調一下？"],
          ["a", C(`對，順便補一個 \`.dockerignore\`。排序原則是：最少變動的檔案先 copy。

            |\`\`\`dockerfile
            |COPY package*.json ./
            |RUN npm ci            # cached unless the lockfile changes
            |COPY . .              # invalidated on every commit, but it is a small layer
            |RUN npm run build
            |\`\`\`

            |\`.dockerignore\` 至少要有 \`node_modules\`、\`.git\`、\`dist\`，還有測試用的 fixture。把本機
            |的 \`node_modules\` 複製進建置上下文，是同時拖慢建置、又悄悄把錯誤架構的二進位檔送上線的
            |經典做法。`)],
        ],
      },
    ],
  },

  {
    title: "跟團隊解釋 BM25",
    t: "2025-06-02T13:20:00Z",
    msgs: [
      ["h", C(`我要跟不做搜尋的同事解釋，為什麼我們要從「數符合的字有幾個」換成 BM25。最短的誠實說法
        |是什麼？`)],
      ["a", C(`三個概念，照順序講。

        |罕見的字比較重要。有人搜「postgres vacuum」時，幾乎每一篇文件都有「postgres」，只有少數幾篇
        |有「vacuum」。命中「vacuum」帶來的資訊多得多。這就是 IDF：一個字的權重，隨著含有它的文件數
        |變少而變高。

        |重複出現的邊際效益會遞減。一篇說了 40 次「vacuum」的文件，並不會比說兩次的相關 40 倍。BM25
        |會飽和：詞頻的貢獻會逐漸拉平，由一個通常叫 k1 的參數控制。

        |長文件要被扣分。一萬字的頁面本來就容易不小心含到你的關鍵字。BM25 會除以文件長度相對於平均值
        |的比例，由 b 控制。

        |合起來，一個詞在一篇文件裡的分數是：

        |\`\`\`
        |idf(t) * ( tf * (k1 + 1) ) / ( tf + k1 * (1 - b + b * len/avglen) )
        |\`\`\`

        |文件總分就是所有查詢詞的加總。`)],
      ["h", "k1 和 b 要設多少？"],
      ["a", C(`從 k1 = 1.2、b = 0.75 開始。這是最早 TREC 研究用的值，對一般散文來說是合理的預設。

        |如果你的文件很長、而且重複真的代表相關，k1 可以往 2.0 調。

        |如果你的文件長度差異巨大、而且那個差異跟相關性無關，b 可以往 0.3 降——當「一篇文件」其實是
        |一則聊天訊息時特別常見：兩個字的訊息和兩千字的訊息，可能一樣切題。

        |不要兩個一起調，也不要在你手上還沒有一組「已知正確答案的查詢」之前就開始調。沒有那組東西，
        |你只是在搬數字而已。`)],
    ],
  },

  {
    title: "解析 200 MB 的 JSON 又不讓分頁凍住",
    t: "2025-07-14T19:02:00Z",
    msgs: [
      ["h", C(`使用者把一個 200 MB 的 JSON 丟進我的網頁應用，分頁整整卡死 30 秒。JSON.parse 是同步的。
        |我有哪些選擇？`)],
      ["a", C(`把它移出主執行緒，並且不要再把它當成一份文件來解析。

        |Web Worker 解決了 UI 凍結，但沒有解決記憶體尖峰：200 MB 丟進 \`JSON.parse\` 還是會配置整張物件
        |圖。如果檔案是一個紀錄陣列——大多數匯出檔都是——你可以在最上層把它切開，一個元素一個元素解析。

        |\`\`\`js
        |// inside the worker
        |async function* topLevelArrayItems(stream) {
        |  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
        |  let buf = "", depth = 0, start = -1, inStr = false, esc = false;
        |  for (;;) {
        |    const { value, done } = await reader.read();
        |    if (done) break;
        |    buf += value;
        |    for (let i = 0; i < buf.length; i++) {
        |      const ch = buf[i];
        |      if (inStr) {
        |        if (esc) esc = false;
        |        else if (ch === "\\\\") esc = true;
        |        else if (ch === '"') inStr = false;
        |        continue;
        |      }
        |      if (ch === '"') { inStr = true; continue; }
        |      if (ch === "{" || ch === "[") { if (depth === 1 && start < 0) start = i; depth++; }
        |      else if (ch === "}" || ch === "]") {
        |        depth--;
        |        if (depth === 1 && start >= 0) { yield JSON.parse(buf.slice(start, i + 1)); start = -1; }
        |      }
        |    }
        |    // keep only the unconsumed tail
        |    buf = start >= 0 ? buf.slice(start) : "";
        |    if (start >= 0) start = 0;
        |  }
        |}
        |\`\`\`

        |這樣記憶體峰值就是一筆紀錄，不是整個檔案，而且每一塊處理完都可以回報進度。`)],
      ["h", "我手上只有解碼後的字串，要怎麼用位元組回報進度？"],
      ["a", C(`在解碼之前先數。把位元組計數器掛在原始串流上，放在文字解碼器的上游：

        |\`\`\`js
        |let seen = 0;
        |const counted = file.stream().pipeThrough(new TransformStream({
        |  transform(chunk, controller) {
        |    seen += chunk.byteLength;
        |    if (seen % (1 << 20) < chunk.byteLength) postMessage({ type: "progress", seen, total: file.size });
        |    controller.enqueue(chunk);
        |  },
        |}));
        |\`\`\`

        |這樣你拿到的是真實的位元組百分比，而不是一段編出來的動畫。這件事有差：使用者分得出來進度條
        |是不是真的在反映工作。`)],
    ],
  },

  {
    title: "rebase 失手之後把 commit 救回來",
    t: "2024-10-21T17:26:00Z",
    msgs: [
      ["h", "我 rebase 到錯的分支上還 force push 了。三天的 commit 不見了。真的沒救了嗎？"],
      ["a", C(`幾乎可以確定還在。Git 預設至少 30 天內不會真的刪掉任何東西。

        |\`\`\`sh
        |git reflog --date=iso
        |\`\`\`

        |往下找到 rebase 開始前的那一筆，長得像
        |\`abc1234 HEAD@{18}: rebase (start): checkout origin/main\`。它前面那個 commit 就是你當時的分支。

        |\`\`\`sh
        |git branch rescue abc1234
        |git log --oneline rescue
        |\`\`\`

        |先確認內容沒錯，再去動你的分支。`)],
      ["h", "我這台的 reflog 只回溯到今天早上。我昨天重新 clone 過。"],
      ["a", C(`那就去看遠端。force push 也不會馬上刪掉伺服器上的舊物件。

        |如果是 GitHub，events API 還留著前一個 head SHA：

        |\`\`\`sh
        |gh api repos/:owner/:repo/events --jq '.[] | select(.type=="PushEvent") | [.created_at, .payload.before, .payload.head] | @tsv'
        |\`\`\`

        |從那個覆蓋掉你工作的 push 裡取出 \`before\` 的 SHA，直接抓下來：

        |\`\`\`sh
        |git fetch origin abc1234
        |git branch rescue FETCH_HEAD
        |\`\`\`

        |如果有同事本機還 checkout 著那個分支，他的 reflog 就是另一份副本。開始做任何高難度操作之前先
        |問一下，因為最便宜的復原方式通常是別人的筆電。`)],
      ["h", "下次要怎麼讓這件事不要那麼可怕？"],
      ["a", C(`用 \`--force-with-lease\` 取代 \`--force\`。只要遠端在你上次 fetch 之後有動過，它就會拒絕
        |推送——而那正好就是你即將摧毀別人或自己工作的那個情況。

        |把它設成預設：

        |\`\`\`sh
        |git config --global alias.pushf 'push --force-with-lease'
        |\`\`\`

        |伺服器那邊，共用的分支通通打開 branch protection。\`--force-with-lease\` 防的是本機視角過期，
        |branch protection 防的是本機視角很有自信。`)],
    ],
  },

  {
    title: "三個環境的 Terraform 模組怎麼擺",
    t: "2025-01-08T09:15:00Z",
    msgs: [
      ["h", C(`我們有 dev、staging、prod。現在是三個複製出來的目錄，而且已經各自漂移了。有沒有不會漂移
        |的擺法？`)],
      ["a", C(`一組模組，三個只負責餵變數的薄根目錄。規則是：任何資源都不准在環境目錄裡宣告。

        |\`\`\`
        |modules/
        |  service/          main.tf variables.tf outputs.tf
        |  network/
        |envs/
        |  dev/              main.tf (module calls only) terraform.tfvars backend.tf
        |  staging/
        |  prod/
        |\`\`\`

        |每個 \`envs/*/main.tf\` 就是幾個 module 區塊。哪天你發現自己在 \`envs/prod\` 裡寫
        |\`aws_instance\`，漂移就是從那裡開始的。把它搬進模組，用變數傳進去。`)],
      ["h", "那些只有 prod 才有的東西呢？像是唯讀複本。"],
      ["a", C(`做成一個預設為 0 的變數，不要拆成另一個模組。

        |\`\`\`hcl
        |variable "replica_count" {
        |  type    = number
        |  default = 0
        |}

        |resource "aws_db_instance" "replica" {
        |  count               = var.replica_count
        |  replicate_source_db = aws_db_instance.primary.identifier
        |  instance_class      = var.replica_instance_class
        |}
        |\`\`\`

        |這樣 dev 和 prod 跑的是同一條程式碼路徑，差別只是 tfvars 裡的一個數字。你要避免的失敗模式是：
        |某個資源只存在於 prod，因此也只在 prod 被測試到。`)],
      ["h", "各環境要共用同一個 state 檔嗎？"],
      ["a", C(`不要。每個環境獨立的 state、獨立的 backend 設定，最好連憑證也分開。

        |共用 state 代表一次瞄準 dev 的 \`terraform apply\` 有可能鎖住或弄壞 prod，而且一個壞掉的 state
        |檔會一次帶走三個環境。三份 \`backend.tf\` 帶來的那一點重複，是整套設定裡最便宜的保險。`)],
    ],
  },

  {
    title: "SQLite 的 WAL 模式與並行讀取",
    t: "2024-09-17T15:40:00Z",
    msgs: [
      ["h", C(`我們在高負載下一直出現 SQLITE_BUSY。有人說打開 WAL。它到底改變了什麼？`)],
      ["a", C(`預設的 rollback journal 模式下，寫入者會對資料庫檔案上獨佔鎖，所以寫入進行中讀取者會被
        |擋住，寫入者也要等讀取者做完。

        |改成 write-ahead logging 之後，寫入會進到獨立的 \`-wal\` 檔，讀取者則繼續讀主資料庫上他們開始
        |時的快照。一個寫入者和多個讀取者可以同時進行。

        |\`\`\`sql
        |PRAGMA journal_mode = WAL;
        |PRAGMA synchronous = NORMAL;
        |PRAGMA busy_timeout = 5000;
        |\`\`\`

        |\`journal_mode\` 會持久化，一個資料庫設一次就好。另外兩個是連線層級的，每開一條連線都要設。`)],
      ["h", "那它解決不了什麼？"],
      ["a", C(`寫入對寫入。WAL 一次仍然只允許一個寫入者，所以你的 BUSY 如果來自兩個行程同時寫，WAL 幫
        |不上忙，\`busy_timeout\` 也只是把「立刻報錯」換成「慢慢報錯」。

        |它在大部分網路檔案系統上也不能用，因為 WAL 的索引放在共享記憶體裡。

        |還有 \`-wal\` 檔會一直長，直到 checkpoint 跑起來。在持續有讀取流量的情況下，checkpoint 可能被
        |餓死，檔案就會無上限地長，這一點常常嚇到人。盯著檔案大小，如果它在長，就排一個離峰時段跑
        |\`PRAGMA wal_checkpoint(TRUNCATE)\`。`)],
    ],
  },

  {
    title: "ingress 偶爾回 502",
    t: "2025-02-27T11:47:00Z",
    msgs: [
      ["h", C(`大約每 500 個請求會有一個從 nginx ingress 拿到 502。Pod 看起來很健康，沒有重啟、沒有
        |OOM，應用程式的 log 對那些請求完全沒有紀錄。`)],
      ["a", C(`失敗的請求在應用程式端沒有 log，這就是線索：nginx 根本沒拿到可用的回應，通常代表上游連線
        |在它底下被關掉了。經典原因是 keepalive 逾時設定對不齊。

        |nginx 會保留一條到你 pod 的閒置連線。你的應用伺服器則會按照自己的閒置逾時把那條連線關掉。
        |如果應用程式的逾時比 nginx 短，就會有一個時間窗：nginx 把請求送進一條應用程式剛剛關掉的連線，
        |於是你拿到 502。

        |Node 的 \`server.keepAliveTimeout\` 預設是 5 秒，nginx 上游 keepalive 通常是 60。把應用程式拉到
        |比反向代理高：

        |\`\`\`js
        |const server = app.listen(8080);
        |server.keepAliveTimeout = 75_000;
        |server.headersTimeout = 80_000;  // must exceed keepAliveTimeout
        |\`\`\``)],
      ["h", "改完好很多，但還不是零。還有什麼？"],
      ["a", C(`Pod 終止。Kubernetes 刪 pod 時會送 SIGTERM，同時把 pod 從 endpoints 清單移除，但這兩件事
        |是各自傳播的。ingress controller 有可能還在把流量導向一個已經開始關機的 pod。

        |解法是一個活得比 endpoint 傳播還久的 \`preStop\` sleep：

        |\`\`\`yaml
        |lifecycle:
        |  preStop:
        |    exec:
        |      command: ["sh", "-c", "sleep 10"]
        |terminationGracePeriodSeconds: 40
        |\`\`\`

        |容器在那段 sleep 期間會繼續服務，之後才開始自己的優雅關機，而那時候已經沒有新流量進來了。
        |配上前面的 keepalive 修正，滾動更新期間的零星 502 通常可以真的歸零。`)],
    ],
  },

  {
    title: "寫一份真的有人看的 changelog",
    t: "2024-08-29T14:33:00Z",
    msgs: [
      ["h", C(`我們的 changelog 是從 commit message 自動產生的，沒有人看。我應該改成手寫嗎？`)],
      ["a", C(`手寫，但把產生出來的清單當成素材，不是當成成品。

        |這兩份文件的工作不一樣。產生的清單回答「有哪些 commit 進來了」，changelog 回答「對我來說什麼
        |變了」。

        |可行的寫法是：

        |照「讀的人現在可以做什麼」分組，不要照 commit 類型分。「搜尋現在看得懂加引號的整句」是一個
        |標題，「feat(search): add phrase parser」不是。

        |破壞性變更放最前面，遷移步驟直接寫在裡面。要點連結才看得到遷移指南的人，多半會盲升然後回報
        |一個 bug。

        |講清楚某個修正對踩到它的人代表什麼。「修好了匯入超過 2 GB 檔案時的崩潰」勝過「fix: off-by-one
        |in chunk offset」。

        |讀的人觀察不到的東西一律略過。內部重構、沒有行為變化的相依升級、CI 設定，那些屬於 commit log，
        |不屬於 changelog。`)],
      ["h", "一則條目應該多長？"],
      ["a", C(`大部分一則一行；只要是改了預設值或拿掉某個能力的，寫一小段。

        |如果一則需要超過一段，那它是一篇文章，changelog 應該連過去。

        |一個好用的檢查方式：把整個版本的條目唸出聲。如果你在唸完條目之前先喘不過氣，不是這個版本太
        |大，就是條目寫得太囉嗦。`)],
    ],
  },

  {
    title: "TypeScript 泛型一直被放寬成 string",
    t: "2025-03-19T10:08:00Z",
    msgs: [
      ["h", C(`我希望回傳型別收斂到字面量的 key，結果它永遠回 \`string\`：

        |\`\`\`ts
        |function keysOf<T>(obj: T): (keyof T)[] {
        |  return Object.keys(obj) as (keyof T)[];
        |}
        |const k = keysOf({ a: 1, b: 2 });  // want "a" | "b"
        |\`\`\``)],
      ["a", C(`這段其實是會動的。\`keysOf({a: 1, b: 2})\` 會得到 \`("a" | "b")[]\`。

        |你看到 \`string[]\` 的話，那個物件是從某個已經被放寬的地方來的，最常見的是用 \`let\` 宣告的變數，
        |或是明寫了 \`Record<string, number>\` 的註記。

        |\`\`\`ts
        |const wide: Record<string, number> = { a: 1, b: 2 };
        |keysOf(wide);              // string[], correctly

        |const narrow = { a: 1, b: 2 } as const;
        |keysOf(narrow);            // ("a" | "b")[]
        |\`\`\`

        |泛型有在做它的事。資訊是在進到它之前就掉了。`)],
      ["h", "它是從函式參數傳進來的。跨呼叫邊界要怎麼保住字面量型別？"],
      ["a", C(`約束參數，讓推論有理由保持收斂。

        |光一個 \`T\` 會推成放寬後的型別，\`T extends Record<string, unknown>\` 一樣放寬；你要的是讓 key
        |型別自己成為一個推論位置。

        |\`\`\`ts
        |function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
        |  const out = {} as Pick<T, K>;
        |  for (const k of keys) out[k] = obj[k];
        |  return out;
        |}

        |pick({ a: 1, b: "x", c: true }, ["a", "c"]);  // { a: number; c: boolean }
        |\`\`\`

        |\`readonly K[]\` 是關鍵：用可變的 \`K[]\` 時 TypeScript 也很願意把 \`K\` 推成 \`"a" | "c"\`，但
        |陣列字面量傳給可變陣列參數，在某些位置會更急著放寬。readonly 那個寫法才是可靠的。`)],
    ],
    branches: [
      {
        at: 1,
        alt: [
          ["a", C(`在動用泛型之前，先確認你到底要不要用 \`Object.keys\`。它回 \`string[]\` 是刻意的、也是
            |正確的，不是 TypeScript 的 bug。

            |TypeScript 的物件型別是開放的：因為結構型別，一個 \`{a: number}\` 型別的值在執行期完全可能
            |帶著額外屬性。所以 \`Object.keys\` 真的有可能回傳不在 \`keyof T\` 裡的 key：

            |\`\`\`ts
            |interface Point { x: number; y: number }
            |const p3 = { x: 1, y: 2, z: 3 };
            |const p: Point = p3;
            |Object.keys(p);  // ["x","y","z"] at runtime
            |\`\`\`

            |你轉型成 \`(keyof T)[]\`，就是在斷言一件型別系統檢查不到的事。對你自己建出來的物件來說這通常
            |沒問題，對跨過 API 邊界的物件來說就是一個真的 bug。加轉型之前先決定你是哪一種情況。`)],
          ["h", "它是我在同一個檔案裡定義的設定物件。所以轉型是安全的？"],
          ["a", C(`是，而且你可以讓它「因為建構方式而安全」，不是「因為斷言而安全」。

            |把 key 定義成唯一的事實來源，物件型別從它推導出來：

            |\`\`\`ts
            |const FIELDS = ["title", "createdAt", "source"] as const;
            |type Field = (typeof FIELDS)[number];      // "title" | "createdAt" | "source"
            |type Config = { [K in Field]: string };

            |const config: Config = { title: "t", createdAt: "c", source: "s" };
            |for (const f of FIELDS) console.log(config[f]);   // f is Field, no cast
            |\`\`\`

            |這樣往 \`FIELDS\` 加一個欄位，就會在每一個需要處理它的地方變成編譯錯誤——那才是你真正想要
            |的性質。`)],
        ],
      },
    ],
  },

  {
    title: "量 p99 延遲又不騙自己",
    t: "2025-04-02T13:55:00Z",
    msgs: [
      ["h", C(`我們的儀表板把 12 台實例的 p99 平均成一個數字。有人說那是錯的。為什麼？`)],
      ["a", C(`因為百分位數不能平均。12 個 p99 的平均值不是合併母體的 p99，而且通常低很多——那正是最
        |危險的錯法。

        |舉個簡單的例子：11 台很閒、p99 是 5ms，1 台卡住、p99 是 4000ms。12 個 p99 的平均大約是 338ms。
        |但全部請求的真實 p99 取決於每台各服務了多少請求；如果那台卡住是因為慢請求都跑去它那裡，真實
        |p99 會比 338 慘得多。

        |你要的是把底層的直方圖加總，而不是把算好的百分位數加總。Prometheus 的 histogram 做得對：

        |\`\`\`
        |histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
        |\`\`\`

        |注意 \`sum by (le)\` 是在 quantile 裡面，不是外面。`)],
      ["h", "我們的 client library 匯出的是 summary 不是 histogram。這個能改嗎？"],
      ["a", C(`能，而且你應該改。

        |summary 是在每一台實例上算好分位數再匯出，那正是不能加總的東西。histogram 匯出的是各個 bucket
        |的計數，而計數可以相加。代價是你得先決定 bucket 邊界，而且分位數是 bucket 內的內插值，不是精確
        |數字。

        |挑 bucket 時要夾住你的 SLO。目標是 300ms 的話，在 250、300、400 有 bucket 才講得出有用的話；
        |多數函式庫的預設 bucket 到 10 秒就結束，而且 1 到 2.5 之間什麼都沒有，那個區間的 p99 估計基本
        |上是編的。`)],
      ["h", "要多少請求量，p99 才有意義？"],
      ["a", C(`一個時間窗裡至少幾百筆，最好幾千筆。

        |50 筆請求的 p99 就是最慢的那一兩筆，那是雜訊。

        |一個好用的紀律是：在儀表板上把請求數放在百分位數旁邊。數量掉下去的時候，所有人都看得出來是
        |百分位數變吵了，而不是服務變快了。`)],
    ],
  },

  {
    title: "把 moment.js 換成瀏覽器內建的東西",
    t: "2024-11-12T16:20:00Z",
    msgs: [
      ["h", C(`我們為了「格式化日期」和「加幾天」這兩件事，載了 290 KB 的 moment 加語系資料。要換成
        |什麼？`)],
      ["a", C(`格式化的話，什麼都不用換：\`Intl.DateTimeFormat\` 是內建的，而且做得比 moment 好，因為它
        |用的是平台自己的語系資料，不是自己再帶一份。

        |\`\`\`js
        |const fmt = new Intl.DateTimeFormat("zh-TW", {
        |  year: "numeric", month: "long", day: "numeric",
        |});
        |fmt.format(new Date());   // "2024年11月12日"
        |\`\`\`

        |formatter 建一次就重複用。在清單裡每次呼叫都建一個，慢得量得出來。

        |相對時間的話，\`Intl.RelativeTimeFormat\` 不用函式庫就能處理「3 天前」。`)],
      ["h", "那運算和時區呢？我擔心的是那一塊。"],
      ["a", C(`那塊確實是平台一直缺東西的地方，直到最近。\`Temporal\` 就是答案，現行瀏覽器已經有了，
        |不過上線前記得先對一下你的支援矩陣。

        |\`\`\`js
        |const start = Temporal.PlainDate.from("2024-11-12");
        |const end = start.add({ days: 45 });
        |end.toString();  // "2024-12-27"

        |const meeting = Temporal.ZonedDateTime.from({
        |  timeZone: "Asia/Taipei", year: 2024, month: 11, day: 12, hour: 9,
        |});
        |meeting.withTimeZone("Europe/Lisbon").toString();
        |\`\`\`

        |跟 \`Date\` 最重要的差別是：\`PlainDate\` 完全沒有時區，而那正是生日或截止日該有的樣子。日期
        |類的 bug 有一半來自把日曆日期存成一個時間點，然後在另一個時區把它算出來。`)],
      ["h", "遷移策略？我們有大概 200 個檔案用到 moment。"],
      ["a", C(`不要一次做完。

        |先寫一個薄薄的 \`dates.js\`，只匯出你實際會用到的那六七個操作，內部先用 moment 實作，再把呼叫
        |端一個個搬過來。那是機械式的改動，review 很快。

        |然後在 \`dates.js\` 裡把實作換掉，一次就好。你的測試涵蓋的是七個函式，不是 200 個呼叫點，出事
        |也只要 revert 一個檔案。

        |中間任何一個時間點都是可以出貨的狀態——那才是大型遷移能收尾的關鍵性質。`)],
    ],
  },

  {
    title: "完全跑在瀏覽器裡的全文搜尋",
    t: "2025-05-21T20:11:00Z",
    msgs: [
      ["h", C(`我想對大約三萬份文件做搜尋，而且不要伺服器。在 JavaScript 裡做倒排索引實際嗎？還是我
        |乾脆用子字串比對就好？`)],
      ["a", C(`完全實際，而且子字串比對很快就會讓你失望：沒有排序、沒有詞形處理、沒有整句處理，而且每
        |一次按鍵都對三萬份文件跑 \`indexOf\`，比正經的索引查找還慢。

        |核心結構是一張「詞 → posting list」的表：

        |\`\`\`js
        |// term -> { docs: Int32Array, tfs: Uint16Array, pos: Int32Array, off: Int32Array }
        |\`\`\`

        |匯入時用一般陣列建，建完再一次封成 typed array。typed array 對比數字陣列大約省四倍記憶體，
        |更重要的是它把資料放在一整塊連續配置裡，而不是三萬個小配置——那才是 GC 停頓消失的真正原因。`)],
      ["h", "位置資訊我需要嗎？看起來很貴。"],
      ["a", C(`只有你要整句搜尋才需要，而你多半是要的。位置資訊大約會讓索引大一倍。有兩件事讓它負擔得起：

        |差值編碼。同一份文件裡的位置是遞增的，所以存間隔就好。多數間隔都很小，即使放在固定寬度的陣列
        |裡，值小本身就很省。

        |設上限。一份文件只存前面幾百次出現的位置。超過那個點的整句命中幾乎不會改變排序，而你換到一個
        |最壞情況的記憶體上界。

        |千萬不要做的是：用「所有詞都出現」來假裝整句搜尋。那會安靜地回傳錯誤結果，而使用者看不出來，
        |那比沒有這個功能更糟。`)],
      ["h", "三萬份文件建索引大概要多久？"],
      ["a", C(`筆電上，在 worker 裡幾秒鐘，前提是你的斷詞是單一 regex 掃過一遍，而且能不為每個 token 配
        |一個字串就盡量不配。

        |真正吃時間的通常不是索引，而是你在斷詞之前對每份文件做的事。舉例來說，用一長串 \`.replace()\`
        |做正規化，等於把每份文件複製好幾份。一次寫得好的 regex 加一次小寫轉換，通常就夠了。`)],
    ],
  },

  {
    title: "輪替 refresh token 會弄壞什麼",
    t: "2025-06-19T09:37:00Z",
    msgs: [
      ["h", C(`我們要開啟 refresh token 輪替。我該預期什麼東西會壞？`)],
      ["a", C(`併發，而且幾乎馬上就會壞。

        |開了輪替之後，用掉一個 refresh token 就會讓它失效並換一個新的。如果同一個用戶端有兩個請求在
        |同一瞬間發現 access token 過期，兩個都會去 refresh。一個成功，另一個拿著剛剛失效的 token 去
        |換；而你如果開了重用偵測，第二次嘗試看起來就像被偷的 token，於是你撤銷整個 token family，使用
        |者莫名其妙被登出。

        |解法是在用戶端做 single-flight refresh：

        |\`\`\`js
        |let inFlight = null;
        |function refresh() {
        |  if (!inFlight) {
        |    inFlight = doRefresh().finally(() => { inFlight = null; });
        |  }
        |  return inFlight;
        |}
        |\`\`\`

        |所有呼叫端都 await 同一個 promise，網路上就只會發生一次 refresh。`)],
      ["h", "那兩個瀏覽器分頁呢？它們的 JavaScript context 是分開的。"],
      ["a", C(`那是第二個會壞的地方，而且記憶體裡的那道防線幫不上忙。以下按工作量排序：

        |把 token 存在所有分頁共用的地方，然後用鎖來協調。\`navigator.locks\` 就是為這件事設計的：

        |\`\`\`js
        |await navigator.locks.request("token-refresh", async () => {
        |  const current = await readTokens();
        |  if (!isExpired(current.access)) return;   // another tab already refreshed
        |  await doRefresh(current.refresh);
        |});
        |\`\`\`

        |或者把 refresh 搬進 shared worker 或 service worker，從結構上就只有一個 refresher。

        |或者把 refresh token 放進 HttpOnly cookie，由伺服器負責輪替，並且在一小段寬限時間內仍接受前一
        |個 token。10 到 30 秒的寬限期可以消掉幾乎所有誤判，同時讓重用偵測仍然有意義。`)],
    ],
  },


  {
    title: "把 serverless API 的冷啟動壓下來",
    t: "2024-12-18T18:49:00Z",
    msgs: [
      ["h", C(`我們的 p99 沒問題，但 p99.9 是 4 秒，而且全都是冷啟動。預留併發的費用比整個函式本身還貴。
        |還有別的選擇嗎？`)],
      ["a", C(`把兩半分開處理：平台給你容器所需的時間，以及你的程式碼變成可服務所需的時間。你能控制的
        |只有第二半，而在多數 Node 和 Python 函式裡，它是比較大的那一半。

        |先量。在模組載入時記一個時間戳，在第一次呼叫的 handler 裡再記一個。如果模組載入是 1.8 秒，
        |工作就在那裡。

        |常見原因照發生頻率排：只用其中一個 client 卻整包 import 整個 SDK；在模組層級初始化資料庫連線
        |池，而那個函式常常根本不碰資料庫；同步從磁碟讀設定檔——更糟的是從遠端 secrets store 讀。

        |\`\`\`js
        |// eager: paid on every cold start
        |import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
        |const db = new DynamoDBClient({});

        |// lazy: paid only when actually used
        |let db;
        |const getDb = async () => (db ??= new (await import("@aws-sdk/client-dynamodb")).DynamoDBClient({}));
        |\`\`\``)],
      ["h", "打包有用嗎？還是那只是迷思？"],
      ["a", C(`有用，而且量得出來。

        |單一打包檔可以省掉數千次檔案系統 stat 和模組解析。從一整棵 \`node_modules\` 換成一個 esbuild
        |輸出，模組載入時間常常直接少掉好幾百毫秒。再加上 tree shaking，連被解析的量都變少。

        |比較接近迷思的，是「把部署包從 40 MB 縮到 10 MB」本身有多大幫助。下載通常不是瓶頸，解析並執行
        |你的頂層程式碼才是。`)],
    ],
  },

  {
    title: "面試被要求設計短網址服務",
    t: "2024-10-02T19:15:00Z",
    msgs: [
      ["h", C(`我被要求設計短網址服務，然後我直接跳到雜湊。回饋是我問的問題不夠多。我該問什麼？`)],
      ["a", C(`有四個問題會實質改變設計，而且每一個都有一種答案會讓雜湊方案直接失效：

        |短碼可以被猜到嗎？如果有人能列舉，遞增 ID 就出局，你需要足夠熵的隨機值，讓掃描不切實際。

        |同一個長網址可以對到兩個不同短碼嗎？可以的話你不需要去重，設計會簡單非常多。不行的話，你需要
        |用長網址反查，那是一個高基數欄位上的第二個索引。

        |連結會過期嗎？可以編輯或刪除嗎？過期會把一個只寫一次的儲存變成需要清理路徑的東西，而且徹底改變
        |你的快取失效故事。

        |讀寫比是多少？到了 1000:1，整個設計就是一個快取設計，資料庫幾乎只是實作細節。`)],
      ["h", "假設不可猜、不去重、不過期、讀寫比 1000:1。那形狀長怎樣？"],
      ["a", C(`產生 64 個隨機位元，base62 編成 11 個字元，插入時加唯一性約束，碰撞很罕見、撞到就重試。
        |不需要協調、不需要計數器、不需要 ID 服務。64 位元下你可以存到一兆筆連結，碰撞機率才開始有意思，
        |而且重試迴圈本來就處理掉了。

        |讀取就是 key-value 查找，前面擺快取，直接從快取回 301 或 302。

        |這個選擇要刻意：301 會被瀏覽器永久快取，於是你的點擊分析會失準，被刪掉的連結也還能用；302 則
        |讓每一次點擊都回到你這裡。大多數短網址服務用 302 正是因為這個原因，而能講清楚為什麼，就是這題
        |在考的大部分內容。`)],
    ],
  },

  {
    title: "讓 CLI 感覺起來很快",
    t: "2025-07-01T08:24:00Z",
    msgs: [
      ["h", C(`大家說我們的 CLI 感覺很鈍，但指令本身只跑 300ms。那應該像瞬間完成才對。我們哪裡做錯了？`)],
      ["a", C(`很可能那 300ms 大部分花在指令開始之前。分開計時：

        |\`\`\`sh
        |time mycli --version        # startup only
        |time mycli do-the-thing     # startup plus work
        |\`\`\`

        |如果 \`--version\` 要 250ms，你有的是啟動問題，不是工作問題。

        |在 Node 裡，那幾乎都是頂層 import：一整包參數解析器、一個顏色函式庫、一個會打網路的更新檢查，
        |還有每一個子指令的 SDK，不管用不用得到都載進來。

        |子指令模組改成延遲載入，而且在你印出任何東西之前，絕對不要打網路。`)],
      ["h", "我們啟動時確實有更新檢查。不過它是非同步的。"],
      ["a", C(`非同步救不了你——只要你 await 它就沒用，只要行程必須等它結束才能退出也沒用。

        |更新檢查應該跑在一個分離的背景行程裡，把結果寫成檔案，下一次執行時讀那個檔案。這樣快路徑上
        |的成本就只是一次檔案讀取。

        |「感覺很快」的另一半根本不是速度，是回饋。就算只是印出操作名稱，也要在大約 100ms 內印出第一行。
        |一個 300ms 什麼都不印、然後一次吐完的 CLI，感覺比一個 30ms 就印出標題、再慢慢補完的還慢。邊做
        |邊 flush，不要把整個結果緩衝起來。`)],
      ["h", "顏色和轉圈圈的成本量得出來嗎？"],
      ["a", C(`轉圈圈會，如果你用每秒 60 幀在 SSH 連線上重畫：你是在一條高延遲鏈路上一直送跳脫序列，
        |是真的會拖慢指令。每秒 10 幀就很夠了。

        |另外畫任何東西之前先檢查 \`isTTY\`。寫進 log 檔或 CI pipeline 的轉圈圈，是幾千行的垃圾，最後
        |一定會有人要 grep 過它。`)],
    ],
  },

  {
    title: "WebSocket 重連迴圈把伺服器打爆",
    t: "2025-08-08T22:05:00Z",
    msgs: [
      ["h", C(`我們的 WebSocket 伺服器一重啟，所有用戶端就立刻重連，然後它又倒了。我們是斷線後 1 秒重連。
        |要怎麼止住這波踩踏？`)],
      ["a", C(`跟 HTTP 重試是同一個碰撞問題，而且更嚴重，因為每一個用戶端都在同一瞬間發現斷線。

        |你需要帶抖動的指數退避，而且只有在連線穩定一段時間之後才重置退避。

        |\`\`\`js
        |let attempt = 0, stableTimer = null;

        |function connect() {
        |  const ws = new WebSocket(url);

        |  ws.addEventListener("open", () => {
        |    stableTimer = setTimeout(() => { attempt = 0; }, 10_000);
        |  });

        |  ws.addEventListener("close", () => {
        |    clearTimeout(stableTimer);
        |    const ceiling = Math.min(30_000, 500 * 2 ** attempt);
        |    attempt++;
        |    setTimeout(connect, ceiling / 2 + Math.random() * (ceiling / 2));
        |  });
        |}
        |\`\`\`

        |那個 10 秒的穩定計時器就是大家會漏掉的部分。沒有它的話，一個接受連線又馬上斷掉的伺服器，會在
        |每一輪把你的退避重置成零，你又回到一個緊迫迴圈。`)],
      ["h", "分頁被切到背景時，我應該停止重連嗎？"],
      ["a", C(`暫停，可以；放棄，不要。

        |監聽 \`visibilitychange\`：文件隱藏時停止排程重連，重新可見時立刻試一次。

        |瀏覽器本來就會節流背景分頁的計時器，那會把你精心調過的退避變成不可預測的東西，所以明確接管控制
        |比較好。

        |另外也處理 \`navigator.onLine\`。機器根本沒有網路時，燒退避次數沒有意義。在 \`online\` 事件時重置
        |次數並立刻連線，因為那種情況下斷線從來就不是伺服器的錯。`)],
    ],
  },


  {
    title: "虛擬捲動的清單往上捲就會跳動",
    t: "2025-08-14T10:41:00Z",
    msgs: [
      ["h", C(`我的虛擬清單往下捲很順，往上捲就一直跳。列高是變動的，量到之前我先用估計值。`)],
      ["a", C(`很典型。往上捲進還沒量過的列時，你把估計值換成真實高度，視窗上方的內容總高度就變了，而
        |瀏覽器會維持 \`scrollTop\` 不動，於是內容看起來就跳了一下。

        |解法是自己做捲動錨定：套用新的量測之後，算出錨點列的偏移量變了多少，在同一幀裡把差值加回
        |\`scrollTop\`。

        |\`\`\`js
        |const anchorIndex = firstVisibleIndex;
        |const before = offsetOf(anchorIndex);
        |applyMeasurements(newHeights);
        |const after = offsetOf(anchorIndex);
        |container.scrollTop += after - before;
        |\`\`\`

        |要同步做，在繪製之前。放進 \`setTimeout\` 的話，使用者會先看到跳動、再看到修正，那比只有跳動
        |更糟。`)],
      ["h", "量測要用 ResizeObserver 還是 getBoundingClientRect？"],
      ["a", C(`持續變動用 \`ResizeObserver\`，剛渲染完一列之後的第一次量測用 \`getBoundingClientRect\`。

        |對剛插入的列在迴圈裡讀 \`getBoundingClientRect\`，如果你先把全部讀完再寫，就只有一次 layout
        |flush；如果讀寫交錯，那就是 layout thrash。先批次讀，再批次寫。

        |另外量測結果要用穩定的列 key 快取，不要用索引。清單一重新排序，用索引當 key 的快取會讓每一列
        |同時拿到錯的高度，那就是同一種跳動，但發生在所有地方。`)],
      ["h", "有沒有辦法乾脆不要變動列高？"],
      ["a", C(`有時候可以，而且值得考慮。

        |如果高度差異來自文字換行，你常常可以夾成固定行數，得到固定列高，整個問題就消失了。三萬筆、每
        |一列剛好 92px 的清單，不需要量測、不需要 observer、也不需要錨定：第 n 列的偏移量就是 n 乘 92。

        |內容本質上就形態各異的時候才用變動列高，例如聊天訊息。對一份「標題加中繼資料」的清單來說，固定
        |列高不是妥協，它就是比較好的設計。`)],
    ],
  },
];
