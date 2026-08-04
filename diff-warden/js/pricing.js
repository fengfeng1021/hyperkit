/* pricing.js — 單價表。
   單價依 2026-08 公告，以美金 / 每百萬 token 計。
   這不是即時報價：實際以供應商帳單為準。
   Anthropic 的 claude-sonnet-5 目前有導入期優惠價（2026-08-31 前 $2 / $10），
   本表用的是優惠價，並在 UI 上標明。 */

export const PRICE_SOURCE = '單價依 2026-08 公告，實際以供應商帳單為準';

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    host: 'api.anthropic.com',
    endpoint: 'https://api.anthropic.com/v1/messages',
    keyHint: 'sk-ant-',
    models: [
      { id: 'claude-sonnet-5', label: 'claude-sonnet-5（預設）', in: 2.00, out: 10.00,
        note: '導入期優惠價，2026-08-31 前 $2 / $10，之後回到 $3 / $15' },
      { id: 'claude-opus-5', label: 'claude-opus-5', in: 5.00, out: 25.00, note: '' },
      { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5（便宜但較淺）', in: 1.00, out: 5.00, note: '' },
    ],
  },
  openai: {
    label: 'OpenAI',
    host: 'api.openai.com',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    keyHint: 'sk-',
    models: [
      { id: 'gpt-5', label: 'gpt-5', in: 1.25, out: 10.00, note: '' },
      { id: 'gpt-5-mini', label: 'gpt-5-mini', in: 0.25, out: 2.00, note: '' },
      { id: '__custom__', label: '自行輸入模型代號…', in: 1.25, out: 10.00,
        note: '單價沿用 gpt-5 估算，實際以帳單為準' },
    ],
  },
};

export function findModel(provider, id) {
  const p = PROVIDERS[provider];
  if (!p) return null;
  return p.models.find((m) => m.id === id) || p.models[0];
}

/** 花費（美金）。tokens 為實際或估算的 token 數。 */
export function costOf(provider, modelId, inTok, outTok) {
  const m = findModel(provider, modelId);
  if (!m) return 0;
  return (inTok / 1e6) * m.in + (outTok / 1e6) * m.out;
}

export function money(v) {
  if (!isFinite(v)) return '$0.00';
  if (v > 0 && v < 0.01) return '<$0.01';
  return '$' + v.toFixed(2);
}
