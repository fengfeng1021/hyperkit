/* ==========================================================================
   serialize.js
   URL hash and localStorage.

   The hash is deliberately human-readable rather than compressed. This is a
   tool whose whole pitch is that you can audit it; its share link should be
   auditable too.

     #s1~餘額~利率~年限月~寬限月~現金~月可支配~年化~波動~房價~房價漲幅
        ~稅率~模式~提前還款方式~seed~路徑數~列舉扣除~計轉貸~還款比例

   Missing trailing fields fall back to defaults (backward compatible).
   Extra fields are ignored (forward compatible).
   ========================================================================== */

import { HASH_VERSION, STORE_PREFIX, DEFAULTS, BOUNDS } from './assumptions.js';
import { clamp } from './format.js';

const ORDER = [
  'balance', 'ratePct', 'termMonths', 'graceMonths', 'lump', 'monthly',
  'investPct', 'volPct', 'homeValue', 'homeGrowthPct', 'taxPct',
  'mode', 'prepayMode', 'seed', 'paths', 'itemized', 'refinance', 'prepayShare',
];

const DECIMALS = {
  ratePct: 3, investPct: 2, volPct: 2, homeGrowthPct: 2,
};

export function encode(p) {
  const parts = ORDER.map((k) => {
    const d = DECIMALS[k] ?? 0;
    const v = Number(p[k]);
    if (!Number.isFinite(v)) return String(DEFAULTS[k]);
    return d ? String(Number(v.toFixed(d))) : String(Math.round(v));
  });
  return `${HASH_VERSION}~${parts.join('~')}`;
}

/**
 * Is this fragment one of ours, or is it just an in-page anchor?
 *
 * The page also uses the fragment for navigation (#top, #bench, #params, and
 * the skip link), and a share link is the only kind that may overwrite the
 * user's numbers. Without this test, jumping to a section wiped every field
 * back to defaults and raised a "this link is broken" toast about a link
 * nobody had shared.
 */
export function isShareHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  return raw.startsWith(`${HASH_VERSION}~`);
}

/**
 * @returns {{params: object, ok: boolean, reason: string, raw: string}}
 */
export function decode(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const params = { ...DEFAULTS };
  if (!raw) return { params, ok: true, reason: 'empty', raw };

  const parts = raw.split('~');
  if (parts[0] !== HASH_VERSION) {
    return { params, ok: false, reason: 'version', raw };
  }
  if (parts.length < 9) {
    return { params, ok: false, reason: 'truncated', raw };
  }

  let bad = 0;
  ORDER.forEach((key, idx) => {
    const token = parts[idx + 1];
    if (token === undefined || token === '') return;       // fall back to default
    const n = Number(token);
    if (!Number.isFinite(n)) { bad++; return; }
    params[key] = n;
  });

  const normalized = normalize(params);
  return { params: normalized, ok: bad === 0, reason: bad ? 'field' : 'ok', raw };
}

/** Bring any params object into a legal, self-consistent state. */
export function normalize(input) {
  const p = { ...DEFAULTS, ...input };

  p.balance   = clamp(p.balance,   BOUNDS.balance).value;
  p.homeValue = clamp(p.homeValue, BOUNDS.homeValue).value;
  p.ratePct   = clamp(p.ratePct,   BOUNDS.ratePct).value;
  p.monthly   = clamp(p.monthly,   BOUNDS.monthly).value;
  p.seed      = Math.round(clamp(p.seed, BOUNDS.seed).value);
  p.paths     = Math.round(clamp(p.paths, BOUNDS.paths).value);

  let years = clamp(Math.round(p.termMonths / 12), BOUNDS.termYears).value;
  p.termMonths = Math.round(years * 12);

  let graceYears = Math.round(p.graceMonths / 12);
  graceYears = clamp(graceYears, { min: 0, max: Math.max(0, years - 1) }).value;
  p.graceMonths = Math.round(graceYears * 12);

  p.lump = clamp(p.lump, { min: 0, max: p.balance }).value;

  p.investPct     = clamp(p.investPct,     BOUNDS.investPct).value;
  p.volPct        = clamp(p.volPct,        BOUNDS.volPct).value;
  p.homeGrowthPct = clamp(p.homeGrowthPct, BOUNDS.homeGrowthPct).value;
  p.taxPct        = clamp(p.taxPct,        BOUNDS.taxPct).value;
  p.prepayShare   = clamp(p.prepayShare,   BOUNDS.prepayShare).value;

  p.mode       = p.mode ? 1 : 0;
  p.prepayMode = p.prepayMode ? 1 : 0;
  p.itemized   = p.itemized ? 1 : 0;
  p.refinance  = p.refinance ? 1 : 0;

  return p;
}

/* ---------------------------------------------------------------- storage */

let storageBroken = false;

export function storageAvailable() {
  return !storageBroken;
}

export function readStore(key, fallback = null) {
  try {
    const v = localStorage.getItem(STORE_PREFIX + key);
    if (v === null) return fallback;
    return JSON.parse(v);
  } catch (err) {
    return fallback;
  }
}

/** @returns {{ok: boolean, error: Error|null}} */
export function writeStore(key, value) {
  try {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
    storageBroken = false;
    return { ok: true, error: null };
  } catch (err) {
    storageBroken = true;
    return { ok: false, error: err };
  }
}

export function clearStore() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORE_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
    storageBroken = false;
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export function shareURL(p) {
  const base = location.href.split('#')[0];
  return `${base}#${encode(p)}`;
}
