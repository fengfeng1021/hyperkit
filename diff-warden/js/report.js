/* report.js — Markdown 報告。
   審查範圍聲明放在標頭而不是附註：它是這份文件能被信任的原因。 */

import { sevLabel } from './strip.js';
import { fmtWhen } from './baseline.js';
import { money } from './pricing.js';

export function buildMarkdown(ctx) {
  const {
    project, at, defects, suppressed, rulesCount, model, provider,
    sentFiles, excludedCount, excludeRules, baselineAt, usage, cost, demo, batches,
  } = ctx;

  const out = [];
  out.push(`# 程式碼審查報告 - ${project}`);
  out.push('');
  if (demo) out.push('> 範例報告（專案為虛構）。這份文件用來示範輸出格式。', '');
  out.push('| | |');
  out.push('|---|---|');
  out.push(`| 審查日期 | ${fmtWhen(at)} |`);
  out.push(`| 審查範圍 | ${sentFiles.length} 個檔案${baselineAt ? `（自 ${fmtWhen(baselineAt)} 的基準線起有變動者，依變動量排序）` : '（未使用基準線）'} |`);
  out.push(`| 被排除 | ${excludedCount.toLocaleString('en-US')} 個檔案（${excludeRules.length} 條排除規則：${excludeRules.join('、')}） |`);
  out.push(`| 分批 | ${batches || 1} 批 |`);
  out.push(`| 模型 | ${model}（${provider}） |`);
  out.push(`| 判讀規則 | 已套用 ${rulesCount} 條，自動略過 ${suppressed} 條 |`);
  if (usage) {
    out.push(`| 實際用量 | 輸入 ${usage.inTok.toLocaleString('en-US')} / 輸出 ${usage.outTok.toLocaleString('en-US')} token，約 ${money(cost)} |`);
  }
  out.push('');
  out.push('原始碼未上傳至任何第三方，審查請求由本機瀏覽器直接送往供應商。');
  out.push('');
  out.push('## 送出的檔案');
  out.push('');
  sentFiles.forEach((f) => out.push(`- \`${f.path}\` — ${f.why || ''}`));
  out.push('');
  out.push(`## 缺陷 ${defects.length} 條`);
  out.push('');

  if (!defects.length) {
    out.push('本次沒有找到缺陷。');
  }

  defects.forEach((d, i) => {
    out.push(`### ${i + 1}. ${d.title}`);
    out.push('');
    out.push(`- **嚴重度**：${sevLabel(d.severity)}`);
    out.push(`- **類別**：${d.category}`);
    out.push(`- **位置**：\`${d.file}:${d.line}\`${d.lineVerified ? '' : '（行號未能對應）'}`);
    if (d.related && d.related.length) {
      d.related.forEach((r) => out.push(`- **跨檔案**：\`${r.file}:${r.line}\``));
    }
    out.push('');
    out.push(d.why);
    if (d.excerpt) {
      out.push('');
      out.push('```');
      d.excerpt.forEach((l) => out.push(`${String(l.n).padStart(4, ' ')}${l.hit ? ' >' : '  '} ${l.t}`));
      out.push('```');
    }
    out.push('');
  });

  out.push('---');
  out.push('');
  out.push('由 diff-warden 產碼審查台在本機產生。原始碼未上傳。');
  return out.join('\n');
}

export function downloadMarkdown(text, project) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const name = `${project || 'review'}-review-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.md`;
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJSON(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
