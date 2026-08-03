/* ==========================================================================
   The ledger. It does not exist in the DOM until the first photo resolves,
   because a savings number shown before you have done anything is a claim,
   and this page does not make claims it has not already proved.

   The rate is yours to set, and the disclosure says plainly that we do not
   track anyone's pricing. A fake number here would undo everything the rest
   of the interface is trying to establish.
   ========================================================================== */

import { el, storage, fmtMoney } from './util.js';

const KEY = 'cutout-forge.rate.v1';

const RATES = [
  { id: 'plan200', label: 'Subscription, $29 / 200', value: 0.145 },
  { id: 'payg', label: 'Pay as you go', value: null },
  { id: 'custom', label: 'Custom rate', value: null },
];

export class Ledger {
  constructor(mount) {
    this.mount = mount;
    this.node = null;
    this.count = 0;
    this.shown = 0;
    const saved = storage.get(KEY, { id: 'plan200', value: 0.145 });
    this.rateId = saved.id || 'plan200';
    this.rate = Number.isFinite(saved.value) ? saved.value : 0.145;
    this.milestone = 0;
    /* Motion layer replaces this with a tweened proxy. Until then the number
       is simply correct, which is the state that must never depend on GSAP. */
    this.animate = null;
  }

  get amount() { return this.count * (this.rate || 0); }
  get rateSet() { return Number.isFinite(this.rate) && this.rate > 0; }

  /** The queue was emptied, so the receipt goes with it. */
  reset() {
    if (this.node) { this.node.remove(); this.node = null; this.els = null; }
    this.count = 0;
    this.shown = 0;
    this.milestone = 0;
  }

  setCount(n) {
    const first = this.count === 0 && n > 0;
    this.count = n;
    if (n > 0 && !this.node) this._build();
    if (first) this.mount.dispatchEvent(new CustomEvent('ledger:first', { bubbles: true }));
    this._paint();
  }

  _build() {
    const amount = el('strong', { class: 'ledger__amount mono', id: 'ledgerAmount' }, ['$0.00']);
    const basis = el('p', { class: 'ledger__basis', id: 'ledgerBasis' });

    const select = el('select', { class: 'select', id: 'ledgerRate', 'aria-label': 'Rate you are comparing against' });
    for (const r of RATES) select.append(el('option', { value: r.id, text: r.label, selected: r.id === this.rateId }));

    const custom = el('input', {
      class: 'input', type: 'number', step: '0.005', min: '0', id: 'ledgerCustom',
      placeholder: '0.145', 'aria-label': 'Your rate per photo in dollars',
    });
    const customWrap = el('div', { class: 'ledger__custom' }, [custom]);

    select.addEventListener('change', () => {
      this.rateId = select.value;
      if (this.rateId === 'plan200') {
        this.rate = 0.145;
        customWrap.classList.remove('is-open');
      } else {
        this.rate = Number(custom.value) > 0 ? Number(custom.value) : NaN;
        customWrap.classList.add('is-open');
        custom.focus();
      }
      this._persist();
      this._paint();
    });

    custom.addEventListener('input', () => {
      const v = Number(custom.value);
      this.rate = v > 0 ? v : NaN;
      this._persist();
      this._paint();
    });

    if (this.rateId !== 'plan200') {
      customWrap.classList.add('is-open');
      if (this.rateSet) custom.value = String(this.rate);
    }

    const why = el('details', { class: 'ledger__why' }, [
      el('summary', { text: 'Where does this number come from?' }),
      el('p', {
        text: 'We do not track competitor pricing. Set the rate you actually pay. The count is your photo count times your rate.',
      }),
    ]);

    this.node = el('section', { class: 'rail__section ledger', 'aria-labelledby': 'ledgerLabel' }, [
      el('h2', { class: 'ledger__label', id: 'ledgerLabel', text: 'You have not spent' }),
      amount,
      basis,
      el('div', { class: 'ledger__rate' }, [select]),
      customWrap,
      why,
    ]);

    this.els = { amount, basis, custom, customWrap, select };
    this.mount.append(this.node);
  }

  _persist() { storage.set(KEY, { id: this.rateId, value: this.rate }); }

  _paint() {
    if (!this.node) return;
    const { amount, basis } = this.els;

    if (!this.rateSet) {
      amount.textContent = 'Set your rate';
      amount.classList.add('is-unset');
      basis.textContent = `${this.count} photo${this.count === 1 ? '' : 's'} done. Enter what you pay per photo.`;
      return;
    }

    amount.classList.remove('is-unset');
    const target = this.amount;

    if (this.animate) {
      this.animate(this.shown, target, v => { amount.textContent = fmtMoney(v); });
    } else {
      amount.textContent = fmtMoney(target);
    }
    this.shown = target;

    /* The rate keeps three decimals: 0.145 rounded to 0.15 would misstate the
       basis of a number this whole page is asking to be trusted on. */
    const rateText = '$' + this.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
    basis.textContent = `${this.count} photo${this.count === 1 ? '' : 's'} at ${rateText} each`;

    const hundreds = Math.floor(target / 100);
    if (hundreds > this.milestone) {
      this.milestone = hundreds;
      amount.classList.add('is-milestone');
      clearTimeout(this._msTimer);
      this._msTimer = setTimeout(() => amount.classList.remove('is-milestone'), 1000);
    }
  }
}
