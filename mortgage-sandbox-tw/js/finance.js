/* ==========================================================================
   finance.js
   The maths. This file is the entire trust basis of the product, so every
   step matches the formula printed in the drawer that explains it.

   Conventions
     t = 0        the instant before the first payment. The lump sum lands here.
     t = 1..N     each month. Interest is charged on the opening balance,
                  principal is what is left of the payment, balance closes.
     arrays are length N+1 and index 0 is the t=0 state.
   ========================================================================== */

import { TW, REFINANCE_TOTAL } from './assumptions.js';

export function monthlyRate(annualPct) {
  return annualPct / 100 / 12;
}

/** PMT = P * i / (1 - (1+i)^-n). Degenerates to P/n when i is zero. */
export function pmt(P, i, n) {
  if (!(n > 0)) return P;
  if (P <= 0) return 0;
  if (i === 0) return P / n;
  const d = 1 - Math.pow(1 + i, -n);
  if (d <= 0) return P / n;
  return (P * i) / d;
}

/** Months still needed to clear `bal` at a fixed `payment`. */
export function remainingTerm(bal, i, payment) {
  if (bal <= 0) return 0;
  if (i === 0) return Math.ceil(bal / payment);
  const x = 1 - (bal * i) / payment;
  if (x <= 0) return Infinity; // the payment does not even cover the interest
  return Math.ceil(-Math.log(x) / Math.log(1 + i));
}

/** Geometric monthly return. The arithmetic shortcut annual/12 overstates. */
export function monthlyReturn(annualPct) {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

const EPS = 0.005; // half a cent: below this the loan is considered cleared

/* --------------------------------------------------------------------------
   One path's loan side. Everything here is deterministic: it does not depend
   on investment returns at all, which is what makes the Monte Carlo cheap.
   -------------------------------------------------------------------------- */
function runPath(kind, p) {
  const N = p.termMonths;
  const i = monthlyRate(p.ratePct);
  const G = kind === 'c' ? Math.min(p.graceMonths, N - 1) : 0;

  const balance   = new Float64Array(N + 1);
  const payment   = new Float64Array(N + 1);
  const interest  = new Float64Array(N + 1);
  const principal = new Float64Array(N + 1);
  const prepay    = new Float64Array(N + 1);
  const penalty   = new Float64Array(N + 1);
  const contrib   = new Float64Array(N + 1);
  const cash      = new Float64Array(N + 1);
  const refund    = new Float64Array(N + 1);

  const cost = p.refinance ? REFINANCE_TOTAL : 0;

  let bal = p.balance;
  let cashBal = -cost;
  let pmtNow = pmt(bal, i, N);
  const gracePmt = kind === 'c' && G > 0 ? pmt(bal, i, N - G) : null;

  let initialPrincipalPaid = 0;
  let initialPenalty = 0;
  let initialPenaltyRate = 0;

  /* ---- t = 0 : where the lump sum goes ---- */
  if (kind === 'a') {
    initialPenaltyRate = TW.prepayLockMonths > 0 ? TW.prepayPenaltyRate : 0;
    const budget = p.lump * (p.prepayShare / 100);
    const principalPart = Math.max(0, Math.min(budget / (1 + initialPenaltyRate), bal));
    initialPrincipalPaid = principalPart;
    initialPenalty = principalPart * initialPenaltyRate;
    bal -= principalPart;
    prepay[0] = principalPart;
    penalty[0] = initialPenalty;
    contrib[0] = Math.max(0, p.lump - principalPart - initialPenalty);
    if (p.prepayMode === 1 && bal > EPS) pmtNow = pmt(bal, i, N);
  } else {
    contrib[0] = p.lump;
  }
  if (bal < EPS) bal = 0;
  balance[0] = bal;
  cash[0] = cashBal;

  const shortfallMonths = [];
  let totalInterest = 0;
  let totalPenalty = initialPenalty;
  let totalRefund = 0;
  let payoffMonth = bal === 0 ? 0 : null;
  let firstPayment = 0;

  for (let t = 1; t <= N; t++) {
    let free;

    if (bal <= 0) {
      free = p.monthly;
    } else {
      const int_ = bal * i;
      let pay;
      if (kind === 'c' && t <= G) {
        pay = int_;                                   // interest only, principal untouched
      } else {
        pay = Math.min(pmtNow, bal + int_);           // final instalment closes the balance
      }
      const prin = pay - int_;
      bal -= prin;
      if (bal < EPS) bal = 0;

      interest[t]  = int_;
      payment[t]   = pay;
      principal[t] = prin;
      totalInterest += int_;
      if (t === 1) firstPayment = pay;
      free = p.monthly - pay;
    }

    if (free < 0) {
      cashBal += free;              // a real cash gap, carried as negative cash
      shortfallMonths.push(t);
      free = 0;
    }

    if (kind === 'a' && bal > 0) {
      const rate = t < TW.prepayLockMonths ? TW.prepayPenaltyRate : 0;
      const pp = Math.max(0, Math.min(free / (1 + rate), bal));
      const pen = pp * rate;
      bal -= pp;
      if (bal < EPS) bal = 0;
      prepay[t] = pp;
      penalty[t] = pen;
      totalPenalty += pen;
      contrib[t] = Math.max(0, free - pp - pen);
      if (p.prepayMode === 1 && bal > 0 && t < N) pmtNow = pmt(bal, i, N - t);
    } else {
      contrib[t] = free;
    }

    if (kind === 'c' && t === G && gracePmt !== null) pmtNow = gracePmt;

    if (payoffMonth === null && bal === 0) payoffMonth = t;

    /* Interest deduction settles once a year. Same rule on all three paths so
       the comparison stays clean: the refund lands in cash, it is not
       reinvested and it is not thrown at the loan. */
    if (p.itemized && t % 12 === 0) {
      let annualInterest = 0;
      for (let k = t - 11; k <= t; k++) annualInterest += interest[k];
      const deductible = Math.min(
        Math.max(0, annualInterest - TW.savingsDeductionUsed),
        TW.interestDeductionCap,
      );
      const r = deductible * (p.taxPct / 100);
      refund[t] = r;
      totalRefund += r;
      cashBal += r;
    }

    balance[t] = bal;
    cash[t] = cashBal;
  }

  return {
    kind, balance, payment, interest, principal, prepay, penalty, contrib, cash, refund,
    shortfallMonths, totalInterest, totalPenalty, totalTaxRefund: totalRefund,
    payoffMonth, firstPayment, gracePmt,
    initialPrincipalPaid, initialPenalty, initialPenaltyRate,
  };
}

/** Investment account: previous balance compounds, this month's inflow lands. */
export function accumulate(contrib, rM) {
  const n = contrib.length;
  const inv = new Float64Array(n);
  inv[0] = contrib[0];
  for (let t = 1; t < n; t++) inv[t] = inv[t - 1] * (1 + rM) + contrib[t];
  return inv;
}

function accumulateFinal(contrib, rM) {
  let v = contrib[0];
  for (let t = 1; t < contrib.length; t++) v = v * (1 + rM) + contrib[t];
  return v;
}

function homeValueSeries(p, N) {
  const hv = new Float64Array(N + 1);
  const g = Math.pow(1 + p.homeGrowthPct / 100, 1 / 12);
  let v = p.homeValue;
  hv[0] = v;
  for (let t = 1; t <= N; t++) { v *= g; hv[t] = v; }
  return hv;
}

function netSeries(path, hv) {
  const n = hv.length;
  const net = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    net[t] = hv[t] - path.balance[t] + path.invest[t] + path.cash[t];
  }
  return net;
}

/* --------------------------------------------------------------------------
   The annual return at which B and A end level. Monotonic in r, so bisection
   converges cleanly. Defined on terminal net worth, not on "a crossing exists",
   because the terminal definition has exactly one solution.
   -------------------------------------------------------------------------- */
function solveBreakeven(a, b, hv, lo = -10, hi = 20) {
  const N = hv.length - 1;
  const endHome = hv[N];
  const f = (rPct) => {
    const rM = monthlyReturn(rPct);
    const netA = endHome - a.balance[N] + accumulateFinal(a.contrib, rM) + a.cash[N];
    const netB = endHome - b.balance[N] + accumulateFinal(b.contrib, rM) + b.cash[N];
    return netB - netA;
  };
  const flo = f(lo);
  const fhi = f(hi);
  if (flo > 0) return null;   // B wins even at the floor
  if (fhi < 0) return null;   // A wins even at the ceiling
  let a0 = lo, b0 = hi;
  for (let k = 0; k < 60; k++) {
    const mid = (a0 + b0) / 2;
    if (f(mid) < 0) a0 = mid; else b0 = mid;
    if (b0 - a0 < 0.0001) break;
  }
  return (a0 + b0) / 2;
}

/* --------------------------------------------------------------------------
   Public entry point.
   -------------------------------------------------------------------------- */
export function simulate(p) {
  const N = p.termMonths;
  const rM = monthlyReturn(p.investPct);
  const hv = homeValueSeries(p, N);

  const paths = { a: runPath('a', p), b: runPath('b', p), c: runPath('c', p) };
  for (const k of ['a', 'b', 'c']) {
    paths[k].invest = accumulate(paths[k].contrib, rM);
    paths[k].net = netSeries(paths[k], hv);
  }

  /* The crossing is the month after which investing stays ahead for good.
     Not the first month it pokes above: path A starts one prepayment penalty
     behind, so a naive "first time B > A" would answer month 0 every time and
     the whole point of the chart would be lost. */
  let crossMonth = -1;
  if (paths.b.net[N] >= paths.a.net[N]) {
    crossMonth = 0;
    for (let t = N; t >= 1; t--) {
      if (paths.b.net[t] < paths.a.net[t]) { crossMonth = t + 1; break; }
    }
  }
  const alwaysAhead = crossMonth === 0;

  /* The month the decision starts to matter.
     Prepayment is a risk-free bond paying the after-tax mortgage rate, so
     above the breakeven return investing leads at every horizon and a
     sign-crossing simply does not exist. Pretending otherwise is what the
     competitors do. What is real, and what people actually asked for, is:
     from which month is the gap bigger than the pile of money you are
     deciding about? Before that month the answer barely matters. */
  const annualCash = p.monthly * 12;
  const threshold = Math.max(p.lump, annualCash, 100000);
  const thresholdKind = threshold === p.lump && p.lump >= annualCash ? 'lump'
    : threshold === annualCash ? 'annual' : 'floor';
  let decisiveMonth = -1;
  for (let t = N; t >= 0; t--) {
    if (Math.abs(paths.b.net[t] - paths.a.net[t]) < threshold) { decisiveMonth = t + 1; break; }
  }
  if (decisiveMonth === -1) decisiveMonth = 0;     // never below threshold, not even at t=0
  if (decisiveMonth > N) decisiveMonth = -1;       // never above threshold within the term

  const markMonth = crossMonth > 0 ? crossMonth : decisiveMonth;
  const markKind = crossMonth > 0 ? 'cross' : 'decisive';
  const leader = paths.b.net[N] >= paths.a.net[N] ? 'b' : 'a';

  const breakeven = solveBreakeven(paths.a, paths.b, hv);

  const basePmt = pmt(p.balance, monthlyRate(p.ratePct), N);

  let min = Infinity, max = -Infinity;
  for (const k of ['a', 'b', 'c']) {
    const s = paths[k].net;
    for (let t = 0; t <= N; t++) {
      if (s[t] < min) min = s[t];
      if (s[t] > max) max = s[t];
    }
  }

  return {
    params: p,
    months: N,
    homeValue: hv,
    paths,
    basePmt,
    crossMonth,
    decisiveMonth,
    markMonth,
    markKind,
    leader,
    threshold,
    thresholdKind,
    alwaysAhead,
    breakeven,
    shortfallMonths: paths.b.shortfallMonths,
    domain: { min, max },
    band: null,          // filled in by the Monte Carlo pass when it runs
  };
}

/** Re-run only what changes when the return assumption moves. Cheap. */
export function reprice(result, investPct) {
  const rM = monthlyReturn(investPct);
  const hv = result.homeValue;
  for (const k of ['a', 'b', 'c']) {
    result.paths[k].invest = accumulate(result.paths[k].contrib, rM);
    result.paths[k].net = netSeries(result.paths[k], hv);
  }
  return result;
}
