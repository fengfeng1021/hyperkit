/* cashback.js
   回饋試算。這是全站唯一「給建議」的地方，而且是使用者自己按下去要求的。
   費率是可編輯的假設值，不是任何一張實際信用卡的條款；每個數字都能展開看怎麼算的。 */

import { el, esc } from './ui.js';
import { icon } from './icons.js';
import { money, pct, int } from './format.js';
import { CATEGORIES, FALLBACK_CATEGORY, RULES_VERSION, rulesAsJson } from './rules.js';
import { lsGet, lsSet } from './storage.js';

const ALL_CATS = [...CATEGORIES, FALLBACK_CATEGORY];

/** 三組可編輯的假設費率。刻意不掛任何銀行或卡別名稱。 */
const PLANS = [
  { id: 'flat', name: '無腦回饋型', note: '所有消費同一個費率', rates: { cvs: 1.2, mart: 1.2, food: 1.2, trans: 1.2, drug: 1.2, shop: 1.2, other: 1.2 } },
  { id: 'daily', name: '日常通路型', note: '超商超市高、電商低', rates: { cvs: 3.0, mart: 3.0, food: 2.0, trans: 1.0, drug: 2.0, shop: 0.5, other: 0.5 } },
  { id: 'online', name: '網購導向型', note: '電商與餐飲高、實體低', rates: { cvs: 0.5, mart: 0.5, food: 3.0, trans: 1.0, drug: 1.0, shop: 6.0, other: 0.5 } },
];

export function createCashback(root) {
  let summary = null;
  let rates = lsGet('cardrates', null) || PLANS.reduce((a, p) => ({ ...a, [p.id]: { ...p.rates } }), {});

  function render(s) {
    summary = s;
    root.innerHTML = '';
    if (!summary) return;

    root.append(el('p', { class: 'section-text', text: '下面的費率是可以改的假設值，不是任何一張實際信用卡的條款。把它改成你手上那張卡的實際費率，數字才有意義。' }));

    const table = el('div', { class: 'cashback' });
    const header = el('div', { class: 'cb-row cb-row--head' });
    header.append(el('span', { class: 'cb-cat', text: '分類' }));
    header.append(el('span', { class: 'cb-amt num', text: '你的消費' }));
    PLANS.forEach((p) => header.append(el('span', { class: 'cb-plan', text: p.name })));
    table.append(header);

    const catRows = ALL_CATS
      .map((c) => ({ def: c, data: summary.byCategory.find((x) => x.id === c.id) }))
      .filter((x) => x.data)
      .sort((a, b) => b.data.cents - a.data.cents);

    catRows.forEach(({ def, data }) => {
      const row = el('div', { class: 'cb-row' });
      row.append(el('span', { class: 'cb-cat' }, [
        el('span', { class: 'cb-icon', html: icon(def.icon, 14) }),
        el('span', { text: def.name }),
        el('span', { class: 'cb-share num', text: pct(data.cents, summary.totalCents, 0) }),
      ]));
      row.append(el('span', { class: 'cb-amt num', text: money(data.cents, { noCents: true }) }));
      PLANS.forEach((p) => {
        const cell = el('span', { class: 'cb-plan' });
        const inp = el('input', {
          type: 'number', class: 'input input-rate', min: '0', max: '30', step: '0.1',
          value: String(rates[p.id][def.id] ?? 0),
          'aria-label': `${p.name} 在${def.name}的回饋費率，百分比`,
        });
        inp.addEventListener('input', () => {
          const v = Math.max(0, Math.min(30, Number(inp.value) || 0));
          rates[p.id][def.id] = v;
          lsSet('cardrates', rates);
          totals();
        });
        cell.append(inp, el('span', { class: 'cb-unit', text: '%' }));
        row.append(cell);
      });
      table.append(row);
    });

    const totalRow = el('div', { class: 'cb-row cb-row--total' });
    totalRow.append(el('span', { class: 'cb-cat', text: '一整年回饋' }));
    totalRow.append(el('span', { class: 'cb-amt num', text: money(summary.totalCents, { noCents: true }) }));
    PLANS.forEach((p) => totalRow.append(el('span', { class: `cb-plan cb-total num`, 'data-plan': p.id, text: '-' })));
    table.append(totalRow);
    root.append(table);

    const how = el('details', { class: 'howto' });
    how.append(el('summary', { class: 'howto-summary' }, [
      el('span', { text: '這個數字怎麼算的' }),
      el('span', { class: 'howto-chev', html: icon('expand', 14) }),
    ]));
    const body = el('div', { class: 'howto-body' });
    how.append(body);
    root.append(how);

    const rulesBox = el('details', { class: 'howto' });
    rulesBox.append(el('summary', { class: 'howto-summary' }, [
      el('span', { text: `分類規則（版本 ${RULES_VERSION}）` }),
      el('span', { class: 'howto-chev', html: icon('expand', 14) }),
    ]));
    const rb = el('div', { class: 'howto-body' });
    rb.innerHTML = `<p class="howto-text">分類是店名關鍵字比對，由上而下第一個命中者勝出，沒有命中就是「其他」。
      這份表不是黑箱，你可以整份下載下來核對。</p>
      <ul class="rules-list">${ALL_CATS.map((c) => `
        <li><span class="rules-name">${esc(c.name)}</span>
        <span class="rules-kw">${esc((c.keywords || ['（未命中任何關鍵字時的預設）']).join('、'))}</span></li>`).join('')}</ul>`;
    const dl = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, [
      el('span', { html: icon('download', 14) }), el('span', { text: '下載這份規則 JSON' }),
    ]);
    dl.addEventListener('click', () => {
      const blob = new Blob([rulesAsJson()], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: `invoice-wrapped-category-rules-${RULES_VERSION}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    rb.append(dl);
    rulesBox.append(rb);
    root.append(rulesBox);

    totals();

    function totals() {
      const results = PLANS.map((p) => {
        const lines = catRows.map(({ def, data }) => {
          const r = rates[p.id][def.id] ?? 0;
          return { name: def.name, cents: data.cents, rate: r, back: Math.round(data.cents * r / 100) };
        });
        return { plan: p, lines, total: lines.reduce((a, l) => a + l.back, 0) };
      }).sort((a, b) => b.total - a.total);

      results.forEach((r) => {
        const cell = totalRow.querySelector(`[data-plan="${r.plan.id}"]`);
        if (cell) {
          cell.textContent = money(r.total, { noCents: true });
          cell.classList.toggle('is-best', r === results[0]);
        }
      });

      const best = results[0];
      body.innerHTML = `
        <p class="howto-text">回饋 = 每個分類的消費金額 × 該分類費率，再全部加起來。金額以「分」為單位的整數計算，
        最後一步才除以 100，所以不會出現浮點數誤差。異常列（負數或超過 10 億）不列入。</p>
        <div class="howto-calc">
          <p class="howto-calc-head">${esc(best.plan.name)}（目前試算最高）</p>
          ${best.lines.map((l) => `
            <div class="calc-row">
              <span class="calc-name">${esc(l.name)}</span>
              <span class="calc-eq num">${money(l.cents, { noCents: true })} × ${l.rate}%</span>
              <span class="calc-out num">${money(l.back, { noCents: true })}</span>
            </div>`).join('')}
          <div class="calc-row calc-row--sum">
            <span class="calc-name">合計</span>
            <span class="calc-eq num">${int(best.lines.length)} 個分類</span>
            <span class="calc-out num">${money(best.total, { noCents: true })}</span>
          </div>
        </div>
        <p class="howto-text">換算下來，這一年的整體回饋率是
          <b class="num">${pct(best.total, summary.totalCents, 2)}</b>。
          你的消費結構裡最大的一塊是
          <b>${esc(catRows[0]?.def.name || '')}</b>（${pct(catRows[0]?.data.cents || 0, summary.totalCents, 0)}），
          所以費率動這一格的影響最大。</p>`;
    }
  }

  return { render };
}
