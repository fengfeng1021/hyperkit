/* ==========================================================================
   samples.js
   Example scenarios. Every number here is illustrative, not market data, and
   the interface flags anything loaded from this file as 範例情境 until you
   change something.

   Three of them, because the three moments people actually open this tool are
   different problems: the bonus just landed, the grace period is about to end,
   and the rate just moved.
   ========================================================================== */

export const SAMPLE_SCENARIOS = [
  {
    id: 'bonus',
    name: '年終入帳，62 萬要放哪',
    note: '一般房貸利率、剩 28 年、每月能拿出 5.8 萬。這是最常見的那一題。',
    params: {
      homeValue: 14800000,
      balance: 10500000,
      ratePct: 2.28,
      termMonths: 336,
      graceMonths: 36,
      lump: 620000,
      monthly: 58000,
      prepayShare: 100,
      investPct: 6.0,
      volPct: 15.0,
      homeGrowthPct: 2.0,
      taxPct: 12,
      mode: 0,
      prepayMode: 0,
      seed: 20260101,
      paths: 1000,
      itemized: 1,
      refinance: 0,
    },
  },
  {
    id: 'grace-ending',
    name: '寬限期剩一年，月付要跳了',
    note: '新青安利率、寬限 5 年、剩 33 年。期滿後月付會一次跳上來，先看清楚跳多少。',
    params: {
      homeValue: 12600000,
      balance: 9700000,
      ratePct: 1.775,
      termMonths: 396,
      graceMonths: 60,
      lump: 350000,
      monthly: 42000,
      prepayShare: 100,
      investPct: 6.0,
      volPct: 15.0,
      homeGrowthPct: 2.0,
      taxPct: 5,
      mode: 0,
      prepayMode: 0,
      seed: 20260215,
      paths: 1000,
      itemized: 0,
      refinance: 0,
    },
  },
  {
    id: 'rate-up',
    name: '升息一碼，該不該轉貸',
    note: '利率 2.6%、剩 22 年、稅率 20%，並且把轉貸的一次性成本計進來。',
    params: {
      homeValue: 18500000,
      balance: 12800000,
      ratePct: 2.6,
      termMonths: 264,
      graceMonths: 0,
      lump: 900000,
      monthly: 76000,
      prepayShare: 60,
      investPct: 6.0,
      volPct: 15.0,
      homeGrowthPct: 1.5,
      taxPct: 20,
      mode: 1,
      prepayMode: 1,
      seed: 20260320,
      paths: 1000,
      itemized: 1,
      refinance: 1,
    },
  },
];
