/* provider.js — Anthropic / OpenAI 直連與 SSE 串流解析。
   key 只在這裡被放進標頭，其餘任何地方都不碰它。
   Anthropic 瀏覽器直連必帶 anthropic-dangerous-direct-browser-access: true，
   沒有這個標頭會被 CORS 擋掉。 */

import { PROVIDERS } from './pricing.js';
import { SYSTEM, buildUserContent } from './prompt.js';

export class ProviderError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.kind = kind;          // auth | quota | ratelimit | network | server | bad | aborted
    this.detail = detail || '';
    this.retryAfter = 0;
  }
}

function anthropicHeaders(key) {
  return {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function openaiHeaders(key) {
  return { 'content-type': 'application/json', authorization: 'Bearer ' + key };
}

export function buildBody({ provider, model, files, edges, note, stream }) {
  const user = buildUserContent(files, edges, note);
  if (provider === 'anthropic') {
    return {
      model,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
      stream: !!stream,
    };
  }
  return {
    model,
    stream: !!stream,
    stream_options: stream ? { include_usage: true } : undefined,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
  };
}

/** 給「檢視送出內容」用：把 request body 轉成可讀文字，key 不在裡面。 */
export function previewBody(body) {
  const clone = JSON.parse(JSON.stringify(body));
  return JSON.stringify(clone, null, 2);
}

async function classify(res) {
  let text = '';
  try { text = await res.text(); } catch { /* ignore */ }
  let type = '';
  let msg = text.slice(0, 400);
  try {
    const j = JSON.parse(text);
    type = (j.error && (j.error.type || j.error.code)) || j.type || '';
    msg = (j.error && j.error.message) || msg;
  } catch { /* keep raw */ }

  if (res.status === 401 || res.status === 403 || /authentication|invalid_api_key/i.test(type)) {
    return new ProviderError('auth', msg, type);
  }
  if (/insufficient_quota|credit_balance/i.test(type + ' ' + msg)) {
    return new ProviderError('quota', msg, type);
  }
  if (res.status === 429) {
    const e = new ProviderError('ratelimit', msg, type);
    e.retryAfter = parseInt(res.headers.get('retry-after') || '0', 10) || 0;
    return e;
  }
  if (res.status >= 500) return new ProviderError('server', msg, type);
  return new ProviderError('bad', msg || `HTTP ${res.status}`, type);
}

/** 用 1 個 token 的最小請求驗證 key。回 true 就是真的可用。 */
export async function testKey({ provider, model, key }) {
  const p = PROVIDERS[provider];
  const body = provider === 'anthropic'
    ? { model, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }
    : { model, max_completion_tokens: 1, messages: [{ role: 'user', content: 'ok' }] };
  let res;
  try {
    res = await fetch(p.endpoint, {
      method: 'POST',
      headers: provider === 'anthropic' ? anthropicHeaders(key) : openaiHeaders(key),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError('network', String(err && err.message || err));
  }
  if (!res.ok) throw await classify(res);
  await res.text().catch(() => '');
  return true;
}

/**
 * 送出一批檔案並串流回缺陷。
 * onDefect(obj)   每解析出一個完整 JSON 物件呼叫一次
 * onChunk(chars)  每收到一段文字呼叫一次（用來推進掃描游標）
 * 回傳 { usage: {inTok, outTok}, truncated, salvaged, raw }
 */
export async function streamReview(opts) {
  const { provider, model, key, files, edges, note, signal, onDefect, onChunk } = opts;
  const p = PROVIDERS[provider];
  const body = buildBody({ provider, model, files, edges, note, stream: true });

  let res;
  try {
    res = await fetch(p.endpoint, {
      method: 'POST',
      headers: provider === 'anthropic' ? anthropicHeaders(key) : openaiHeaders(key),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new ProviderError('aborted', '已取消');
    throw new ProviderError('network', String(err && err.message || err));
  }
  if (!res.ok) throw await classify(res);
  if (!res.body) throw new ProviderError('bad', '回應沒有可讀的串流');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const usage = { inTok: 0, outTok: 0 };
  let sse = '';
  let text = '';
  let pending = '';
  let stopReason = '';
  let count = 0;

  const flushLines = () => {
    let nl;
    while ((nl = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, nl);
      pending = pending.slice(nl + 1);
      const obj = tryParse(line);
      if (obj) { count += 1; onDefect && onDefect(obj); }
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sse += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = sse.indexOf('\n')) >= 0) {
        const raw = sse.slice(0, idx).trim();
        sse = sse.slice(idx + 1);
        if (!raw.startsWith('data:')) continue;
        const payload = raw.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let ev;
        try { ev = JSON.parse(payload); } catch { continue; }
        const piece = extractText(provider, ev, usage);
        if (piece) {
          text += piece;
          pending += piece;
          flushLines();
          onChunk && onChunk(piece.length);
        }
        const sr = extractStop(provider, ev);
        if (sr) stopReason = sr;
      }
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const e = new ProviderError('aborted', '已取消');
      e.partial = { usage, count };
      throw e;
    }
    throw new ProviderError('network', String(err && err.message || err));
  }

  // 收尾：最後一段可能沒有換行
  const tail = tryParse(pending);
  if (tail) { count += 1; onDefect && onDefect(tail); pending = ''; }

  const salvaged = pending.trim().length > 0;
  return {
    usage,
    truncated: stopReason === 'max_tokens' || stopReason === 'length',
    salvaged,
    count,
    raw: text,
  };
}

function extractText(provider, ev, usage) {
  if (provider === 'anthropic') {
    if (ev.type === 'message_start' && ev.message && ev.message.usage) {
      usage.inTok = ev.message.usage.input_tokens || 0;
    }
    if (ev.type === 'message_delta' && ev.usage) {
      usage.outTok = ev.usage.output_tokens || usage.outTok;
    }
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
      return ev.delta.text || '';
    }
    return '';
  }
  if (ev.usage) {
    usage.inTok = ev.usage.prompt_tokens || usage.inTok;
    usage.outTok = ev.usage.completion_tokens || usage.outTok;
  }
  const c = ev.choices && ev.choices[0];
  return (c && c.delta && c.delta.content) || '';
}

function extractStop(provider, ev) {
  if (provider === 'anthropic') {
    return (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) || '';
  }
  const c = ev.choices && ev.choices[0];
  return (c && c.finish_reason) || '';
}

function tryParse(line) {
  let s = String(line || '').trim();
  if (!s) return null;
  if (s.startsWith('```')) return null;
  if (s.startsWith('[') || s === ']' || s === ',') s = s.replace(/^[[,]\s*/, '').replace(/[,\]]\s*$/, '');
  if (s.endsWith(',')) s = s.slice(0, -1);
  if (!s.startsWith('{')) return null;
  let obj;
  try { obj = JSON.parse(s); } catch { return null; }
  if (!obj || typeof obj !== 'object' || !obj.file) return null;
  return obj;
}
