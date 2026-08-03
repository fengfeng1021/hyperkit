/* ==========================================================================
   verdict.js
   One sentence you could read out loud to the person you share the loan with.
   It rewrites itself as the parameters move; the emphasised fragments are the
   only place besides the crossing point where the signal colour is allowed.
   ========================================================================== */

import { fmt } from './format.js';

const t = (text) => ({ text });
const em = (text) => ({ text, em: true });
const num = (text) => ({ text, em: true, mono: true });

export function buildVerdict(result) {
  if (!result) {
    return {
      state: 'empty',
      segments: [t('載入情境後，這裡會出現一句你可以念給另一半聽的結論。')],
      action: null,
    };
  }

  const p = result.params;
  const N = result.months;
  const a = result.paths.a.net[N];
  const b = result.paths.b.net[N];
  const gap = b - a;
  const years = Math.round(N / 12);

  /* Cash gap comes first: nothing else on the page is meaningful until the
     monthly budget actually covers the instalment. */
  if (result.shortfallMonths.length) {
    const need = Math.ceil(result.basePmt / 1000) * 1000;
    return {
      state: 'shortfall',
      segments: [
        t('你的每月可支配 '), num(fmt.moneyNT(p.monthly)),
        t(' 低於本息月付 '), num(fmt.moneyNT(result.basePmt)),
        t('。三條路徑都會出現缺口，先把可支配調到 '), num(fmt.moneyNT(need)), t(' 以上。'),
      ],
      action: { label: '調到剛好夠', value: need },
    };
  }

  const beText = result.breakeven === null ? null : fmt.pct(result.breakeven, 2);
  const tail = beText
    ? [t('翻轉門檻是年化 '), num(beText), t('：低於這個數字，提前還款才會贏。')]
    : [t('在 -10% 到 20% 的範圍內都找不到翻轉門檻。')];

  const THRESHOLD_NAME = {
    lump: '你手上這筆 ',
    annual: '你一年的可支配現金 ',
    floor: '',
  };
  const decisiveClause = () => (result.decisiveMonth > 0
    ? [
      t('，到'), num(fmt.monthLabel(result.decisiveMonth)),
      t(`差距才會大過${THRESHOLD_NAME[result.thresholdKind]}`), num(fmt.moneyNT(result.threshold)),
    ]
    : [t('，而且差距全程都小於 '), num(fmt.moneyNT(result.threshold))]);

  /* When the return sits above the threshold there is no crossing to find,
     because prepayment behaves like a risk-free bond paying the after-tax
     mortgage rate. Saying so is more useful than inventing a crossing. */
  if (result.crossMonth === 0) {
    return {
      state: 'always-ahead',
      segments: [
        t('在你設定的年化 '), num(fmt.pct(p.investPct)),
        t(' 之下，投資每一年都領先，'), t(`第 ${years} 年多出 `), num(fmt.moneyNT(gap)),
        ...decisiveClause(),
        t('。'), ...tail,
      ],
      action: null,
    };
  }

  if (result.crossMonth < 0) {
    return {
      state: 'no-crossing',
      segments: [
        t('在你設定的年化 '), num(fmt.pct(p.investPct)),
        t(` 之下，投資在 ${years} 年內都沒有追上提前還款，差 `), num(fmt.moneyNT(-gap)),
        ...decisiveClause(),
        t('。'), ...tail,
      ],
      action: null,
    };
  }

  return {
    state: 'crossing',
    segments: [
      t('在你設定的年化 '), num(fmt.pct(p.investPct)),
      t(' 之下，投資會在'), num(fmt.monthLabel(result.crossMonth)),
      t('追過提前還款，'), t(`第 ${years} 年後多出 `), num(fmt.moneyNT(gap)),
      t('。'), ...tail,
    ],
    action: null,
  };
}

export function paintVerdict(node, verdict) {
  node.textContent = '';
  node.dataset.state = verdict.state;
  verdict.segments.forEach((seg) => {
    if (!seg || !seg.text) return;
    if (seg.em) {
      const s = document.createElement('strong');
      s.className = seg.mono ? 'em em--mono' : 'em';
      s.textContent = seg.text;
      node.appendChild(s);
    } else {
      node.appendChild(document.createTextNode(seg.text));
    }
  });
}
