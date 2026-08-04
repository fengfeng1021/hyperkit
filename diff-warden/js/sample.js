/* sample.js — 範例報告。
   專案 nabe-orders 是虛構的：一個小型訂單後台（Node + Express + SQLite，前端 vanilla JS），
   10 個檔案，剛被 agent 加上退款功能。這是接案者會遇到的真實形狀。
   16 條缺陷、3 條跨檔案、四個嚴重度都有。節錄是真的程式碼片段。
   其中 4 條是同一個類別（未處理的 rejection）：agent 在每一個新加的 async 進入點都套了同一個
   壞掉的錯誤處理寫法。這是 LLM 產碼最典型的成群問題，也是「標一次擋一批」唯一看得見的地方。 */

export const SAMPLE_PROJECT = 'nabe-orders';

export const SAMPLE_FILES = [
  { path: 'server/index.js',                 lines: 62,  size: 1840 },
  { path: 'server/lib/auth.js',              lines: 74,  size: 2210 },
  { path: 'server/lib/money.js',             lines: 41,  size: 980 },
  { path: 'server/lib/db.js',                lines: 88,  size: 2640 },
  { path: 'server/routes/orders.js',         lines: 196, size: 6120 },
  { path: 'server/routes/webhooks.js',       lines: 84,  size: 2480 },
  { path: 'server/jobs/reconcile.js',        lines: 57,  size: 1610 },
  { path: 'migrations/003_add_refunds.sql',  lines: 18,  size: 420 },
  { path: 'web/js/checkout.js',              lines: 168, size: 4980 },
  { path: 'web/js/cart.js',                  lines: 92,  size: 2410 },
];

const L = (n, t) => ({ n, t });

export const SAMPLE_DEFECTS = [
  {
    file: 'server/lib/auth.js', line: 41, severity: 'blocker', category: '認證',
    title: 'webhook 路由掛在驗證中介層之前，端點完全沒有驗證',
    why: 'app.use(requireSession) 在第 41 行才註冊，而 webhooks 路由在第 38 行就掛上去了。'
       + '任何人只要 POST 一筆 payment_intent.succeeded 到 /webhooks/stripe，就能把任意 order_id 標記為已付款。'
       + '這條路徑同時沒有驗簽，所以連 Stripe 的簽章都不會被檢查。',
    related: [{ file: 'server/routes/webhooks.js', line: 12 }],
    excerpt: [
      L(37, "const app = express();"),
      L(38, "app.use('/webhooks', require('../routes/webhooks'));"),
      L(39, ''),
      L(40, '// 以下所有路由都需要登入'),
      L(41, 'app.use(requireSession);'),
      L(42, "app.use('/orders', require('../routes/orders'));"),
    ],
  },
  {
    file: 'server/lib/money.js', line: 18, severity: 'blocker', category: '金額計算',
    title: '金額用浮點數乘 100 再取整，退款每筆少一分',
    why: 'parseFloat(amount) * 100 在 19.99 這種常見金額下會得到 1998.9999999999998，'
       + '接著 Math.floor 取整成 1998，比正確的 1999 少一分。'
       + '退款路徑用同一個函式，所以每退一筆就跟金流商對不起來一分，一個月後對帳差額會累積到看得見的程度。',
    related: [],
    excerpt: [
      L(16, 'function toCents(amount) {'),
      L(17, '  const n = parseFloat(amount);'),
      L(18, '  return Math.floor(n * 100);'),
      L(19, '}'),
    ],
  },
  {
    file: 'server/lib/db.js', line: 57, severity: 'high', category: '並發',
    title: '連線池上限 5，但對帳工作一次開 200 個查詢',
    why: '連線池在第 57 行設定 max: 5，而 reconcile.js 第 23 行用 Promise.all 對整批未結訂單同時發查詢。'
       + '上線後第一次跑對帳（訂單量到兩百筆左右）就會把池吃光，'
       + '此時所有進來的 HTTP 請求都拿不到連線，一起卡到 timeout。',
    related: [{ file: 'server/jobs/reconcile.js', line: 23 }],
    excerpt: [
      L(55, 'const pool = createPool({'),
      L(56, "  filename: process.env.DB_PATH,"),
      L(57, '  max: 5,'),
      L(58, '  idleTimeoutMillis: 30000,'),
      L(59, '});'),
    ],
  },
  {
    file: 'migrations/003_add_refunds.sql', line: 7, severity: 'high', category: '資料型別',
    title: 'refunds.amount 宣告成 INTEGER，但寫入的是浮點數',
    why: 'migration 把 amount 宣告為 INTEGER，而 orders.js 第 145 行寫入時傳的是 money.js 回傳值，'
       + '在部分路徑上仍是未取整的浮點數。SQLite 的型別親和性不會報錯，會靜靜截斷小數。'
       + '結果是退款金額被無聲截掉，而且錯誤只會在對帳時才被發現。',
    related: [{ file: 'server/routes/orders.js', line: 145 }],
    excerpt: [
      L(5, 'CREATE TABLE refunds ('),
      L(6, '  id TEXT PRIMARY KEY,'),
      L(7, '  amount INTEGER NOT NULL,'),
      L(8, '  order_id TEXT NOT NULL,'),
      L(9, '  created_at TEXT NOT NULL'),
      L(10, ');'),
    ],
  },
  {
    file: 'server/routes/orders.js', line: 88, severity: 'high', category: 'SQL 注入',
    title: 'ORDER BY 用字串插值把 query 參數接進 SQL',
    why: '同一句 SQL 的 WHERE 條件用了 ? 佔位符，看起來已經處理過參數化，但第 88 行的 ORDER BY 是字串插值。'
       + '只要送 ?sort=id;DROP TABLE refunds-- 這種 query，就能在同一個連線上執行任意 SQL。'
       + '這一行特別容易被漏掉，因為前後幾行都是安全的寫法。',
    related: [],
    excerpt: [
      L(85, 'const rows = await db.all(`'),
      L(86, '  SELECT * FROM orders'),
      L(87, '  WHERE customer_id = ?'),
      L(88, '  ORDER BY ${req.query.sort}'),
      L(89, '`, [req.session.customerId]);'),
    ],
  },
  /* ---- 同一個類別的一批：agent 加退款功能時，四個新的 async 進入點都是同一個寫法。
     措辭有自然的變異，但核心詞彙一致，所以一條判讀規則就會把四條一起擋掉。 ---- */
  {
    file: 'server/routes/orders.js', line: 142, severity: 'high', category: '未處理的 rejection',
    title: '退款路由的 async handler 沒有 catch，rejected promise 不會被接住',
    why: 'Express 4 不會接住 async handler 回傳的 rejected promise。'
       + 'DB 連線被對帳工作吃光時，第 145 行的 INSERT 會 reject，而這之後沒有人再碰這個請求：'
       + 'res 永遠不會被寫入，連線一直掛在那裡，直到 client 自己 timeout。'
       + '同時錯誤既不會進 errorHandler 也不會進 stdout，所以「一筆退款沒寫進去」這件事，你完全不會知道發生過。',
    related: [],
    excerpt: [
      L(142, "router.post('/:id/refund', async (req, res) => {"),
      L(143, '  const order = await getOrder(req.params.id);'),
      L(144, '  const cents = toCents(req.body.amount);'),
      L(145, "  await db.run('INSERT INTO refunds (order_id, amount) VALUES (?, ?)', [order.id, cents]);"),
      L(146, '  res.json({ ok: true });'),
      L(147, '});'),
    ],
  },
  {
    file: 'server/routes/orders.js', line: 169, severity: 'medium', category: '未處理的 rejection',
    title: '取消退款的 async handler 沒有 catch，rejected promise 一樣不會被接住',
    why: '跟建立退款那條同一個寫法：Express 4 不會接住 async handler 回傳的 rejected promise。'
       + '這條更麻煩的是它有兩個 await：金流商那邊已經 void 掉了，但第 172 行的 UPDATE 如果 reject，'
       + 'refunds 這筆就永遠停在 pending。前端看到的是逾時，客服看到的是一筆卡住的退款，兩邊都沒有錯誤訊息可查。',
    related: [],
    excerpt: [
      L(169, "router.post('/:id/refund/cancel', async (req, res) => {"),
      L(170, '  const refund = await getRefund(req.params.id);'),
      L(171, '  await gateway.voidRefund(refund.gatewayId);'),
      L(172, "  await db.run('UPDATE refunds SET status = ? WHERE id = ?', ['void', refund.id]);"),
      L(173, '  res.json({ ok: true });'),
      L(174, '});'),
    ],
  },
  {
    file: 'server/routes/webhooks.js', line: 27, severity: 'high', category: '未處理的 rejection',
    title: 'webhook 路由的 async handler 沒有 catch，rejected promise 會被靜靜吞掉',
    why: 'Express 4 不會接住 async handler 回傳的 rejected promise，Stripe 那一端只看得到逾時。'
       + '收不到 2xx 的 Stripe 會重送同一個 event，而第 48 行沒有做 event id 去重，'
       + '所以每一次 DB 抖動都會變成倉庫多出一張出貨單。這兩條單獨看都還好，湊在一起才是會賠錢的那種。',
    related: [],
    excerpt: [
      L(27, "router.post('/stripe', async (req, res) => {"),
      L(28, '  const event = JSON.parse(req.body);'),
      L(29, '  await recordEvent(event);'),
      L(30, '  res.json({ received: true });'),
      L(31, '});'),
    ],
  },
  {
    file: 'server/jobs/reconcile.js', line: 43, severity: 'high', category: '未處理的 rejection',
    title: '對帳排程的 async handler 沒有 catch，rejected promise 會直接打掉整個 process',
    why: 'Express 4 不會接住 rejected promise，至少還有一個請求會掛著；setInterval 連掛著都沒有。'
       + 'Node 15 之後 unhandledRejection 的預設行為是直接讓 process 以非零碼退出，'
       + '所以對帳跑到一半遇到一次 DB timeout，整個伺服器就沒了。pm2 會把它拉起來，下一分鐘再跑同一批、再倒一次，'
       + '在日誌裡看起來像是「伺服器每小時隨機重啟」，而真正的原因就在這幾行。',
    related: [],
    excerpt: [
      L(38, '// 每分鐘對一次帳'),
      L(39, 'async function handleTick() {'),
      L(40, '  await reconcileAll();'),
      L(41, '}'),
      L(42, ''),
      L(43, 'setInterval(handleTick, 60_000);'),
    ],
  },
  {
    file: 'web/js/checkout.js', line: 132, severity: 'high', category: '錯誤處理',
    title: 'fetch 沒有 catch，網路斷線時按鈕永遠停在「處理中」',
    why: '結帳的 fetch 只接了 then，沒有 catch，也沒有 finally。'
       + '網路斷線或伺服器回 502 時 promise 被 reject，按鈕的 disabled 狀態永遠不會解除，'
       + '使用者只能重整頁面，而重整會讓他重新送一次結帳。',
    related: [],
    excerpt: [
      L(130, "btn.disabled = true;"),
      L(131, "btn.textContent = '處理中';"),
      L(132, "fetch('/orders', { method: 'POST', body })"),
      L(133, '  .then((r) => r.json())'),
      L(134, '  .then((o) => { location.href = `/orders/${o.id}`; });'),
    ],
  },
  {
    file: 'server/index.js', line: 24, severity: 'medium', category: '錯誤處理',
    title: '錯誤處理 middleware 註冊在路由之前，接不到任何錯誤',
    why: 'Express 依註冊順序建立中介層鏈，錯誤處理 middleware 必須在所有路由之後。'
       + '第 24 行就註冊了它，所以路由裡 next(err) 丟出來的錯誤會一路掉到 Express 的預設處理器，'
       + '回給前端一個沒有訊息的 500，而且伺服器日誌裡也不會有結構化的錯誤紀錄。',
    related: [],
    excerpt: [
      L(22, 'app.use(express.json());'),
      L(23, ''),
      L(24, 'app.use(errorHandler);'),
      L(25, ''),
      L(26, "app.use('/orders', ordersRouter);"),
    ],
  },
  {
    file: 'server/routes/webhooks.js', line: 48, severity: 'medium', category: '冪等性',
    title: '同一個 event id 沒有去重，Stripe 重送會出兩次貨',
    why: 'Stripe 在沒有收到 2xx 時會重送同一個 event，而這裡直接依 event.type 建立出貨紀錄。'
       + '只要一次回應逾時，倉庫就會收到兩張出貨單。'
       + '正確的做法是先用 event.id 做唯一鍵寫入，重複時直接回 200。',
    related: [],
    excerpt: [
      L(46, "if (event.type === 'payment_intent.succeeded') {"),
      L(47, '  const orderId = event.data.object.metadata.order_id;'),
      L(48, "  await db.run('INSERT INTO shipments (order_id) VALUES (?)', [orderId]);"),
      L(49, '}'),
    ],
  },
  {
    file: 'web/js/cart.js', line: 64, severity: 'medium', category: '資料遷移',
    title: 'localStorage 的購物車沒有版本欄位，舊使用者一開頁就爆',
    why: '這次把購物車結構從陣列改成 { items: [...] }，但讀取時直接 JSON.parse 後就當新結構用。'
       + '任何在改版前把商品放進購物車的使用者，回來時 parsed.items 會是 undefined，'
       + '下一行的 .map 直接丟 TypeError，整個購物車頁面白畫面。',
    related: [],
    excerpt: [
      L(62, "const raw = localStorage.getItem('cart');"),
      L(63, 'const parsed = raw ? JSON.parse(raw) : { items: [] };'),
      L(64, 'return parsed.items.map(toLine);'),
    ],
  },
  {
    file: 'server/lib/db.js', line: 12, severity: 'medium', category: '並發',
    title: 'SQLite 沒開 WAL，對帳寫入時讀取請求全部排隊',
    why: '預設的 rollback journal 模式下，一個寫入交易會鎖住整個資料庫檔案。'
       + '對帳工作跑一批更新時，所有讀取請求都被擋在外面，'
       + '在使用者眼中就是「每天固定某個時間點網站會卡三十秒」。',
    related: [],
    excerpt: [
      L(10, 'const db = new Database(process.env.DB_PATH);'),
      L(11, "db.pragma('foreign_keys = ON');"),
      L(12, '// TODO: journal_mode'),
    ],
  },
  {
    file: 'server/routes/orders.js', line: 31, severity: 'low', category: '日誌',
    title: 'console.log 把整個付款 payload 寫進日誌',
    why: 'req.body 在結帳路由裡含有 email 與卡號末四碼。'
       + '這一行會把它們原樣寫進 stdout，而 stdout 通常會被收進第三方日誌服務。'
       + '這在有 NDA 或個資合規要求的專案裡是一個要解釋很久的問題。',
    related: [],
    excerpt: [
      L(29, "router.post('/', async (req, res, next) => {"),
      L(30, '  try {'),
      L(31, '    console.log(req.body);'),
      L(32, '    const order = await createOrder(req.body);'),
    ],
  },
  {
    file: 'web/js/checkout.js', line: 19, severity: 'low', category: '重複送出',
    title: '送出按鈕沒有 disabled 狀態，快速雙擊會送兩次',
    why: '按鈕在 submit handler 一開始沒有立刻 disable，快速雙擊會觸發兩次 fetch。'
       + '伺服器端有 idempotency key 所以不會重複扣款，'
       + '但會產生兩筆 pending 訂單，客服要手動清掉其中一筆。',
    related: [],
    excerpt: [
      L(17, "form.addEventListener('submit', (e) => {"),
      L(18, '  e.preventDefault();'),
      L(19, '  submitOrder(readForm());'),
      L(20, '});'),
    ],
  },
];

/** 示範用的歷史刻痕（明確標示為範例） */
export const SAMPLE_RUNS = [
  { id: 'demo:1', at: Date.now() - 26 * 864e5, count: 41, suppressed: 0,  cost: 0.31, model: 'claude-sonnet-5' },
  { id: 'demo:2', at: Date.now() - 19 * 864e5, count: 33, suppressed: 5,  cost: 0.27, model: 'claude-sonnet-5' },
  { id: 'demo:3', at: Date.now() - 12 * 864e5, count: 26, suppressed: 10, cost: 0.23, model: 'claude-sonnet-5' },
  { id: 'demo:4', at: Date.now() - 5 * 864e5,  count: 19, suppressed: 14, cost: 0.19, model: 'claude-sonnet-5' },
  { id: 'demo:5', at: Date.now(),              count: 16, suppressed: 16, cost: 0.13, model: 'claude-sonnet-5' },
];

export const SAMPLE_USAGE = { inTok: 44800, outTok: 4160, cost: 0.13 };
