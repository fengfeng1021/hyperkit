/* ==========================================================================
   assumptions.js
   Every constant, bound, default and sample value in one file.
   Regulation changes touch this file and nothing else.

   Each entry in DRAWERS is what the "這個數字怎麼來的" drawer renders:
     formula  - the formula itself, as text, monospaced, selectable
     subs(ctx)- the substituted values, one variable per row
     source   - where the number comes from, or the honest admission that it
                is an assumption and not data.
   ========================================================================== */

export const HASH_VERSION = 's1';
export const STORE_PREFIX = 'mortgage-sandbox-tw:v1:';

/* --------------------------------------------------------------------------
   1. DEFAULTS - the neutral starting point when there is no URL hash.
   These are what the fields show before the user touches anything.
   -------------------------------------------------------------------------- */
export const DEFAULTS = {
  homeValue:     11000000,
  balance:        8000000,
  ratePct:           2.20,
  termMonths:         300,   // 25 年
  graceMonths:         24,   // 2 年（只有路徑 C 用）
  lump:            400000,
  monthly:          45000,
  prepayShare:        100,   // %，路徑 A 期初拿多少比例去還
  investPct:          6.0,
  volPct:            15.0,
  homeGrowthPct:      2.0,
  taxPct:              12,
  mode:                 0,   // 0 固定報酬, 1 蒙地卡羅
  prepayMode:           0,   // 0 縮短年限, 1 縮短月付
  seed:          20260101,
  paths:             1000,
  itemized:             1,
  refinance:            0,
};

/* --------------------------------------------------------------------------
   2. SAMPLE - the labelled example scenario. Loaded by 「載入範例情境」.
   These numbers are illustrative. They are not market data.
   -------------------------------------------------------------------------- */
export const SAMPLE = {
  homeValue:     14800000,
  balance:       10500000,
  ratePct:           2.28,
  termMonths:         336,   // 28 年
  graceMonths:         36,   // 3 年
  lump:            620000,
  monthly:          58000,
  prepayShare:        100,
  investPct:          6.0,
  volPct:            15.0,
  homeGrowthPct:      2.0,
  taxPct:              12,
  mode:                 0,
  prepayMode:           0,
  seed:          20260101,
  paths:             1000,
  itemized:             1,
  refinance:            0,
};

/* --------------------------------------------------------------------------
   3. BOUNDS - every numeric field. Out-of-range input is clamped, never
   rejected: the worst thing to show someone who mistyped is a blank chart.
   -------------------------------------------------------------------------- */
export const BOUNDS = {
  homeValue:     { min: 0,       max: 500000000, step: 100000, note: '房屋現值的計算範圍是 0 到 5 億。' },
  balance:       { min: 100000,  max: 200000000, step: 10000,  note: '貸款餘額的計算範圍是 10 萬到 2 億。' },
  ratePct:       { min: 0,       max: 20,        step: 0.01,   note: '年利率的計算範圍是 0% 到 20%。' },
  termYears:     { min: 1,       max: 40,        step: 1,      note: '這個工具的計算範圍是 1 到 40 年。' },
  graceYears:    { min: 0,       max: 39,        step: 1,      note: '寬限期不能等於或超過剩餘年限。' },
  lump:          { min: 0,       max: 200000000, step: 10000,  note: '超過貸款餘額的部分沒有地方還，已經夾到餘額。' },
  monthly:       { min: 0,       max: 2000000,   step: 1000,   note: '每月可支配的計算範圍是 0 到 200 萬。' },
  prepayShare:   { min: 0,       max: 100,       step: 5,      note: '' },
  investPct:     { min: -10,     max: 20,        step: 0.1,    note: '' },
  volPct:        { min: 0,       max: 60,        step: 0.5,    note: '' },
  homeGrowthPct: { min: -10,     max: 15,        step: 0.1,    note: '' },
  taxPct:        { min: 0,       max: 40,        step: 1,      note: '' },
  seed:          { min: 1,       max: 999999999, step: 1,      note: '種子的範圍是 1 到 999999999。' },
  paths:         { min: 100,     max: 2000,      step: 100,    note: '超過 2000 條會拖慢拖曳，已經夾到 2000。' },
};

/* --------------------------------------------------------------------------
   4. TAIWAN-SPECIFIC CONSTANTS
   -------------------------------------------------------------------------- */
export const TW = {
  /* 提前清償違約金：綁約期內按清償金額計收。以合約為準，這裡是常見的一種寫法。 */
  prepayPenaltyRate: 0.01,   // 綁約期內 1%
  prepayLockMonths:  36,     // 綁約 3 年

  /* 轉貸的一次性成本，三條路徑都要付，所以它不改變誰贏，只改變三條線的起點高度。 */
  refinanceCosts: [
    { name: '代書費（塗銷 + 設定）', amount: 8000 },
    { name: '抵押權設定登記規費',     amount: 4000 },
    { name: '地政士跑件與謄本',       amount: 3000 },
    { name: '徵信與帳戶管理費',       amount: 6000 },
  ],

  /* 所得稅法第 17 條：購屋借款利息列舉扣除，每戶每年上限 30 萬，
     且須先減除當年度已申報的儲蓄投資特別扣除額。 */
  interestDeductionCap: 300000,
  savingsDeductionUsed: 0,   // 你今年用掉的儲蓄投資特別扣除額。多數人是 0。

  /* 一鍵套用的利率參考值。以你的貸款合約為準。 */
  presets: {
    general: { label: '一般房貸', ratePct: 2.28, graceMonths: 36 },
    youth:   { label: '新青安',   ratePct: 1.775, graceMonths: 60 },
  },
};

export const REFINANCE_TOTAL = TW.refinanceCosts.reduce((s, c) => s + c.amount, 0);

/* --------------------------------------------------------------------------
   5. PATH METADATA
   -------------------------------------------------------------------------- */
export const PATHS = [
  { key: 'a', name: '全額提前還款',       short: 'A 提前還款', long: 'A 全額提前還款' },
  { key: 'b', name: '只繳月付，差額投資', short: 'B 只繳月付', long: 'B 只繳月付，差額投資' },
  { key: 'c', name: '寬限期 + 投資',      short: 'C 寬限期',   long: 'C 寬限期 + 投資' },
];

/* --------------------------------------------------------------------------
   6. DRAWERS - "這個數字怎麼來的"
   ctx = { p: params, r: result, fmt: formatters }
   subs returns [[變數名, 值]]
   -------------------------------------------------------------------------- */
const NOT_DATA = (what, val) =>
  `這是假設，不是資料。預設值 ${val}，請依你的情況調整。${what}`;

export const DRAWERS = {
  netWorth: {
    title: '淨資產怎麼算的',
    formula:
`淨資產(t) = 房屋價值(t) - 貸款餘額(t) + 投資部位(t) + 現金餘額(t)
房屋價值(t) = 房屋現值 × (1 + g)^(t/12)`,
    subs: ({ p, r, fmt, month }) => {
      const m = month ?? 0;
      const s = r ? r.paths.a : null;
      return [
        ['t（月）', String(m)],
        ['房屋現值', fmt.money(p.homeValue)],
        ['g（房價年漲幅）', fmt.pct(p.homeGrowthPct)],
        ['房屋價值(t)', s ? fmt.money(r.homeValue[m]) : '-'],
        ['貸款餘額(t)　路徑 A', s ? fmt.money(s.balance[m]) : '-'],
        ['投資部位(t)　路徑 A', s ? fmt.money(s.invest[m]) : '-'],
        ['現金餘額(t)　路徑 A', s ? fmt.money(s.cash[m]) : '-'],
        ['淨資產(t)　路徑 A', s ? fmt.money(s.net[m]) : '-'],
      ];
    },
    source: '「房屋淨值」是「房屋價值減貸款餘額」的另一種說法，不是額外的加項。規格草稿常見的寫法「房屋淨值 + 投資 - 剩餘貸款」會把貸款餘額扣兩次，本工具不採用。',
  },

  pmt: {
    title: '本息均攤的月付款',
    formula:
`i = 年利率 / 12
PMT = P × i / (1 - (1 + i)^-n)
利率為 0 時退化為 PMT = P / n`,
    subs: ({ p, r, fmt }) => [
      ['P（貸款餘額）', fmt.money(p.balance)],
      ['年利率', fmt.pct(p.ratePct)],
      ['i（月利率）', (p.ratePct / 100 / 12).toFixed(8)],
      ['n（剩餘期數）', `${p.termMonths} 期`],
      ['PMT', r ? fmt.money(r.basePmt) : '-'],
    ],
    source: '這是本息均攤（等額本息）的標準公式。把 i 誤寫成年利率、或用單利計算是最常見的錯法，兩者都會低估月付。',
  },

  schedule: {
    title: '逐月攤還的順序',
    formula:
`每一期：
  利息 = 期初餘額 × i
  本金 = PMT - 利息
  期末餘額 = 期初餘額 - 本金
最後一期：餘額不足時
  PMT = 期初餘額 × (1 + i)，餘額歸零`,
    subs: ({ p, r, fmt }) => {
      const s = r ? r.paths.b : null;
      return [
        ['第 1 期利息', s ? fmt.money(s.interest[1]) : '-'],
        ['第 1 期本金', s ? fmt.money(s.principal[1]) : '-'],
        ['第 1 期期末餘額', s ? fmt.money(s.balance[1]) : '-'],
        ['總利息（路徑 B）', s ? fmt.money(s.totalInterest) : '-'],
        ['最後一期', s ? `第 ${s.payoffMonth} 期` : '-'],
      ];
    },
    source: '先算利息再算本金，順序顛倒會讓本金多背一期利息。最後一期不做特別處理的話會留下幾毛錢的殘值或負餘額。',
  },

  prepay: {
    title: '提前還款之後怎麼重算',
    formula:
`縮短年限：月付不變，重算期數
  n' = ceil( -ln(1 - 餘額 × i / PMT) / ln(1 + i) )
縮短月付：期數不變，用新餘額重算月付
  PMT' = 餘額 × i / (1 - (1 + i)^-(n - t))`,
    subs: ({ p, r, fmt }) => {
      const s = r ? r.paths.a : null;
      return [
        ['方式', p.prepayMode === 1 ? '縮短月付' : '縮短年限'],
        ['期初提前還款本金', s ? fmt.money(s.initialPrincipalPaid) : '-'],
        ['期初違約金', s ? fmt.money(s.initialPenalty) : '-'],
        ['提前還款後餘額', s ? fmt.money(s.balance[0]) : '-'],
        ['清償月份', s ? (s.payoffMonth ? `第 ${s.payoffMonth} 期` : '未於期限內清償') : '-'],
        ['省下的利息（對照路徑 B）', (s && r) ? fmt.money(r.paths.b.totalInterest - s.totalInterest) : '-'],
      ];
    },
    source: '常見錯法是把「還款金額 ÷ 月付」直接從年限裡減掉。那會忽略提前還款當下省掉的是後面每一期的複利，低估縮短的期數。',
  },

  grace: {
    title: '寬限期怎麼算',
    formula:
`寬限期內：月付 = 期初餘額 × i（本金不動）
寬限期滿：以剩餘本金與剩餘期數重算
  PMT' = 餘額 × i / (1 - (1 + i)^-(n - G))`,
    subs: ({ p, r, fmt }) => {
      const s = r ? r.paths.c : null;
      return [
        ['G（寬限期）', `${p.graceMonths} 期（${(p.graceMonths / 12).toFixed(1)} 年）`],
        ['寬限期內月付', s ? fmt.money(s.payment[1]) : '-'],
        ['期滿後月付', s && s.gracePmt ? fmt.money(s.gracePmt) : '-'],
        ['原本的月付', r ? fmt.money(r.basePmt) : '-'],
        ['寬限期多付的利息', (s && r) ? fmt.money(s.totalInterest - r.paths.b.totalInterest) : '-'],
      ];
    },
    source: '寬限期是台灣房貸特有的產品結構，國外的試算器沒有這一段。期滿後沿用原月付是錯的，那等於憑空少還一段本金。',
  },

  monthly: {
    title: '每月的錢流去哪裡',
    formula:
`路徑 A：付當期月付 → 剩下的繼續提前還款 → 清償後才投資
路徑 B：付當期月付 → 差額全數投資
路徑 C：寬限期付利息 / 期滿付新月付 → 差額全數投資
三條路徑的每月現金流上限相同，都是 C`,
    subs: ({ p, r, fmt }) => [
      ['C（每月可支配）', fmt.money(p.monthly)],
      ['路徑 A 第 1 期月付', r ? fmt.money(r.paths.a.payment[1]) : '-'],
      ['路徑 B 第 1 期月付', r ? fmt.money(r.paths.b.payment[1]) : '-'],
      ['路徑 C 第 1 期月付', r ? fmt.money(r.paths.c.payment[1]) : '-'],
      ['出現現金缺口的月份', r ? (r.shortfallMonths.length ? `${r.shortfallMonths.length} 個月` : '沒有') : '-'],
    ],
    source: '起始資源不同的比較是假的比較。三條路徑的期初可動用現金與每月現金流上限完全相同，差別只在錢流向哪裡。',
  },

  basis: {
    title: '三條路徑的比較基準',
    formula:
`期初可動用現金 L：三條路徑相同
每月現金流上限 C：三條路徑相同
差別只在 L 和 (C - 當期房貸支出) 流向哪裡`,
    subs: ({ p, r, fmt }) => [
      ['L（期初可動用現金）', fmt.money(p.lump)],
      ['C（每月可支配）', fmt.money(p.monthly)],
      ['路徑 A 期初進本金', r ? fmt.money(r.paths.a.initialPrincipalPaid) : '-'],
      ['路徑 A 期初進投資', r ? fmt.money(r.paths.a.invest[0]) : '-'],
      ['路徑 B 期初進投資', r ? fmt.money(r.paths.b.invest[0]) : '-'],
      ['路徑 C 期初進投資', r ? fmt.money(r.paths.c.invest[0]) : '-'],
    ],
    source: '你不接受這個基準的話，整張圖對你就沒有意義。所以它寫在畫面上，不是只寫在文件裡。',
  },

  prepayShare: {
    title: '路徑 A 的還款比例',
    formula:
`進本金的金額 = min( L × 比例 / (1 + 違約金率), 貸款餘額 )
違約金 = 進本金的金額 × 違約金率
剩下的 L 進投資`,
    subs: ({ p, r, fmt }) => {
      const s = r ? r.paths.a : null;
      return [
        ['L（期初可動用現金）', fmt.money(p.lump)],
        ['比例', `${p.prepayShare}%`],
        ['違約金率', s ? fmt.pct(s.initialPenaltyRate * 100, 2) : '-'],
        ['進本金', s ? fmt.money(s.initialPrincipalPaid) : '-'],
        ['違約金', s ? fmt.money(s.initialPenalty) : '-'],
        ['進投資', s ? fmt.money(s.invest[0]) : '-'],
      ];
    },
    source: '違約金是從你拿出來的那筆錢裡扣的，不是額外再付一筆。所以真正進到本金的金額比你拿出來的少。',
  },

  penalty: {
    title: '提前清償違約金',
    formula: '違約金 = 清償本金 × 違約金率（僅綁約期內）',
    subs: ({ p, r, fmt }) => [
      ['綁約期', `${TW.prepayLockMonths} 個月`],
      ['綁約期內費率', fmt.pct(TW.prepayPenaltyRate * 100, 2)],
      ['綁約期後費率', '0.00%'],
      ['本次期初違約金', r ? fmt.money(r.paths.a.initialPenalty) : '-'],
      ['全期違約金合計', r ? fmt.money(r.paths.a.totalPenalty) : '-'],
    ],
    source: '各家銀行的綁約期與費率不同，也有按「原貸款金額」而非「清償金額」計收的寫法。這裡用常見的一種，請以你的合約為準。',
  },

  investPct: {
    title: '年化報酬怎麼變成月報酬',
    formula:
`幾何：r_m = (1 + 年化)^(1/12) - 1
投資部位(t) = 投資部位(t-1) × (1 + r_m) + 當期投入`,
    subs: ({ p, fmt }) => [
      ['年化（名目）', fmt.pct(p.investPct)],
      ['r_m（月報酬）', (Math.pow(1 + p.investPct / 100, 1 / 12) - 1).toFixed(8)],
      ['算術寫法（錯的）', (p.investPct / 100 / 12).toFixed(8)],
    ],
    source: NOT_DATA(
      '這是名目報酬，房貸利率也是名目，兩邊同基準才可比。若你要改用實質報酬，房價年漲幅也要一起改成實質，否則兩邊基準不同。',
      '6.0%'),
  },

  volPct: {
    title: '波動怎麼進到模擬裡',
    formula:
`sigma_m = 年化波動 / sqrt(12)
mu_m = ln(1 + 年化) / 12 - sigma_m^2 / 2
月報酬 = exp( mu_m + sigma_m × z ) - 1
z ~ 標準常態（Box-Muller）`,
    subs: ({ p, fmt }) => {
      const sm = p.volPct / 100 / Math.sqrt(12);
      const mu = Math.log(1 + p.investPct / 100) / 12 - (sm * sm) / 2;
      return [
        ['年化波動', fmt.pct(p.volPct)],
        ['sigma_m', sm.toFixed(8)],
        ['mu_m', mu.toFixed(8)],
        ['漂移修正 -sigma²/2', (-(sm * sm) / 2).toFixed(8)],
      ];
    },
    source: NOT_DATA(
      '漏掉 -sigma²/2 這一項，中位數會被系統性高估。波動的參考量級可查你要投資的那檔標的自己的歷史年化標準差，這裡不引用我們無法驗證的具體數字。',
      '15.0%'),
  },

  seed: {
    title: '亂數是怎麼產生的',
    formula:
`mulberry32(seed)：
  t = seed += 0x6D2B79F5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296

Box-Muller：z = sqrt(-2 ln u1) × cos(2π u2)，u1 排除 0`,
    subs: ({ p }) => [
      ['seed', String(p.seed)],
      ['路徑數', String(p.paths)],
      ['Math.random 使用次數', '0'],
    ],
    source: '整個模擬裡沒有一次 Math.random()。同一個 seed 一定產生同一張圖，這樣分享出去的連結別人打開才會看到一模一樣的結果，討論才成立。',
  },

  paths: {
    title: '路徑數怎麼影響結果',
    formula: 'P10 / P50 / P90 由每一個月的所有路徑排序後取分位數',
    subs: ({ p, r, fmt }) => [
      ['路徑數', String(p.paths)],
      ['模式', p.mode === 1 ? '蒙地卡羅' : '固定報酬'],
      ['第 30 年 P10', r && r.band ? fmt.money(r.band.p10[r.band.p10.length - 1]) : '-'],
      ['第 30 年 P50', r && r.band ? fmt.money(r.band.p50[r.band.p50.length - 1]) : '-'],
      ['第 30 年 P90', r && r.band ? fmt.money(r.band.p90[r.band.p90.length - 1]) : '-'],
      ['投資勝出的比例', r && r.band ? fmt.pct(r.band.winRate * 100, 1) : '-'],
    ],
    source: '路徑數越多，分位數越穩定，但拖曳越卡。1000 條在多數裝置上是可接受的折衷。',
  },

  homeValue: {
    title: '房屋價值怎麼隨時間變',
    formula: '房屋價值(t) = 房屋現值 × (1 + g)^(t/12)',
    subs: ({ p, r, fmt }) => [
      ['房屋現值', fmt.money(p.homeValue)],
      ['g', fmt.pct(p.homeGrowthPct)],
      ['第 30 年房屋價值', r ? fmt.money(r.homeValue[r.homeValue.length - 1]) : '-'],
    ],
    source: '房屋在三條路徑裡完全相同，它把三條線一起墊高，不改變誰贏。真正改變結論的是貸款餘額與投資部位的消長。',
  },

  homeGrowthPct: {
    title: '房價年漲幅',
    formula: '複利，逐月換算：(1 + g)^(1/12)',
    subs: ({ p, fmt }) => [
      ['房價年漲幅', fmt.pct(p.homeGrowthPct)],
      ['換算月成長', (Math.pow(1 + p.homeGrowthPct / 100, 1 / 12) - 1).toFixed(8)],
    ],
    source: NOT_DATA(
      '台灣各縣市差異極大，請用你標的區域的實際情況替換。可以查內政部不動產資訊平台的住宅價格指數。',
      '2.0%'),
  },

  taxPct: {
    title: '房貸利息扣除額怎麼算',
    formula:
`可扣除利息 = min( 當年度利息 - 儲蓄投資特別扣除額, 300000 )
可扣除利息 < 0 時以 0 計
退稅 = 可扣除利息 × 邊際稅率`,
    subs: ({ p, r, fmt }) => [
      ['邊際稅率', `${p.taxPct}%`],
      ['每戶每年上限', fmt.money(TW.interestDeductionCap)],
      ['已用掉的儲蓄投資特別扣除額', fmt.money(TW.savingsDeductionUsed)],
      ['採列舉扣除', p.itemized ? '是' : '否'],
      ['路徑 A 全期退稅合計', r ? fmt.money(r.paths.a.totalTaxRefund) : '-'],
      ['路徑 B 全期退稅合計', r ? fmt.money(r.paths.b.totalTaxRefund) : '-'],
      ['路徑 C 全期退稅合計', r ? fmt.money(r.paths.c.totalTaxRefund) : '-'],
    ],
    source: '所得稅法第 17 條：購屋借款利息列舉扣除，每戶每年上限 30 萬，且須先減除當年度已申報的儲蓄投資特別扣除額。實際適用要看你當年度是採標準扣除還是列舉扣除。退稅一律進到現金餘額，不再投入也不再拿去還款，三條路徑同一個規則，比較才乾淨。',
  },

  itemized: {
    title: '為什麼列舉扣除是一個開關',
    formula: '退稅只在「列舉扣除總額 > 標準扣除額」時才真的發生',
    subs: ({ p, fmt }) => [
      ['目前設定', p.itemized ? '計入退稅' : '不計入退稅'],
      ['邊際稅率', `${p.taxPct}%`],
    ],
    source: '多數人採標準扣除，房貸利息一毛都用不到。這個工具不知道你其他的列舉項目有多少，所以把它交給你決定。關掉它是保守的做法。',
  },

  refinance: {
    title: '轉貸成本包含什麼',
    formula: '一次性成本 = 代書費 + 設定登記規費 + 跑件謄本 + 徵信帳管費',
    subs: ({ fmt }) => [
      ...TW.refinanceCosts.map((c) => [c.name, fmt.money(c.amount)]),
      ['合計', fmt.money(REFINANCE_TOTAL)],
    ],
    source: '各家銀行與地區的收費不同，這是常見的量級，請以你實際詢價的結果替換。三條路徑都要付這筆，所以它不改變誰贏，只把三條線一起往下移。',
  },

  crossing: {
    title: '翻轉門檻與標註月份怎麼求的',
    formula:
`翻轉門檻：用二分法求解年化 r，使得
  淨資產B(n) = 淨資產A(n)
收斂到 0.01%

交叉月：最後一個 淨資產B(t) < 淨資產A(t) 的 t，再加一
決定性月份：最後一個 |淨資產B(t) - 淨資產A(t)| < 門檻 的 t，再加一
  門檻 = max(期初可動用現金, 每月可支配 × 12, 100000)`,
    subs: ({ r, fmt }) => [
      ['目前年化', r ? fmt.pct(r.params.investPct) : '-'],
      ['翻轉門檻年化', r ? (r.breakeven === null ? '在 -10% 到 20% 內找不到' : fmt.pct(r.breakeven, 2)) : '-'],
      ['交叉月', r ? (r.crossMonth > 0 ? `第 ${r.crossMonth} 月` : r.crossMonth === 0 ? '投資全程領先' : '期限內沒有交叉') : '-'],
      ['門檻金額', r ? fmt.money(r.threshold) : '-'],
      ['決定性月份', r ? (r.decisiveMonth >= 0 ? `第 ${r.decisiveMonth} 月` : '期限內差距都小於門檻') : '-'],
      ['第 n 期 A', r ? fmt.money(r.paths.a.net[r.paths.a.net.length - 1]) : '-'],
      ['第 n 期 B', r ? fmt.money(r.paths.b.net[r.paths.b.net.length - 1]) : '-'],
    ],
    source: '提前還款在數學上等於一張「利率等於你的稅後房貸利率」的無風險債券。因此只要投資報酬高過那個利率，投資在每一個年份都領先，根本不存在交叉點。競品畫出來的交叉點多半來自把年化除以 12 或漏掉稅的效果。這裡誠實處理：沒有交叉就說沒有交叉，改標「差距大過你正在決定的那筆錢」的月份，因為那才是這個決定開始有份量的時間點。',
  },
};

/* --------------------------------------------------------------------------
   7. LEDGER - which assumptions appear in the schedule table, in order.
   valueOf(ctx) returns the display string for the 值 column.
   -------------------------------------------------------------------------- */
export const LEDGER_ROWS = [
  { drawer: 'pmt',           name: '本息均攤月付款',       value: ({ r, fmt }) => r ? fmt.money(r.basePmt) : '-',                     src: '由你的餘額、利率、年限算出' },
  { drawer: 'investPct',     name: '投資年化報酬（名目）', value: ({ p, fmt }) => fmt.pct(p.investPct),                                src: '假設，不是資料' },
  { drawer: 'volPct',        name: '年化波動',             value: ({ p, fmt }) => fmt.pct(p.volPct),                                   src: '假設，不是資料' },
  { drawer: 'homeGrowthPct', name: '房價年漲幅',           value: ({ p, fmt }) => fmt.pct(p.homeGrowthPct),                            src: '保守假設，非預測' },
  { drawer: 'taxPct',        name: '綜所稅邊際稅率',       value: ({ p }) => `${p.taxPct}%`,                                           src: '你自己填的級距' },
  { drawer: 'taxPct',        name: '利息扣除額上限',       value: ({ fmt }) => `${fmt.money(TW.interestDeductionCap)} / 年`,           src: '所得稅法第 17 條' },
  { drawer: 'penalty',       name: '提前清償違約金率',     value: ({ fmt }) => `${fmt.pct(TW.prepayPenaltyRate * 100, 2)}（綁約 ${TW.prepayLockMonths} 個月內）`, src: '常見合約條款，以你的合約為準' },
  { drawer: 'refinance',     name: '轉貸一次性成本',       value: ({ fmt }) => fmt.money(REFINANCE_TOTAL),                             src: '常見量級，請自行詢價' },
  { drawer: 'grace',         name: '寬限期（路徑 C）',     value: ({ p }) => `${p.graceMonths} 期`,                                    src: '你自己填的' },
  { drawer: 'seed',          name: '模擬亂數種子',         value: ({ p }) => String(p.seed),                                           src: 'mulberry32，非 Math.random' },
  { drawer: 'paths',         name: '模擬路徑數',           value: ({ p }) => `${p.paths} 條`,                                          src: '你自己填的' },
  { drawer: 'netWorth',      name: '淨資產定義',           value: () => '房價 - 餘額 + 投資 + 現金',                                   src: '本工具的唯一定義' },
  { drawer: 'basis',         name: '比較基準',             value: ({ p, fmt }) => `L ${fmt.money(p.lump)} / C ${fmt.money(p.monthly)}`, src: '三條路徑相同' },
  { drawer: 'crossing',      name: '翻轉門檻',             value: ({ r, fmt }) => r ? (r.breakeven === null ? '找不到' : fmt.pct(r.breakeven, 2)) : '-', src: '二分法求解' },
];
