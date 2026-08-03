/**
 * js/export/manifest.js
 * MANIFEST.txt is plain text, not JSON, because a person opens it.
 * Line two is the honesty line and it is not optional.
 */

export function buildManifest({ paths, light, blendLabel, outputWidth, date, reduced, renamed }) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const L = [];

  L.push(`情境織機 輸出紀錄 - ${y}-${m}-${d}`);
  L.push('這批版型都是程式用雜訊算出來的，沒有一張是照片。');
  if (reduced) L.push('這批是在精簡模式下算的（沒有 WebGL2）：印花沒有吃進皺褶。');
  L.push('');
  L.push(`光線   方位 ${light.azimuth}、高度 ${light.elevation}、強度 ${light.intensity}`);
  L.push(`疊色   ${blendLabel}`);
  L.push(`尺寸   每個版型的寬邊 ${outputWidth} px`);
  L.push(`檔案   ${paths.length} 個`);
  if (renamed) L.push(`改名   有 ${renamed} 個檔名撞到，後面補了編號`);
  L.push('');

  for (const entry of paths) {
    const j = entry.job;
    L.push(entry.path.split('/').slice(1).join('/'));
    L.push(`  設計  ${j.designSlug}${j.designSample ? '（範例）' : ''}`);
    L.push(`  版型  ${j.templateLabel}（種子 ${j.seed}）`);
    L.push(`  尺寸  ${j.w} x ${j.h}`);
    L.push(
      `  擺放  x ${fmt(j.placement.x)}  y ${fmt(j.placement.y)}` +
      `  大小 ${fmt(j.placement.scale)}  角度 ${Math.round(j.placement.rotation)}`
    );
    L.push(`  織法  ${j.woven ? '服貼（印花吃進皺褶）' : '平貼（印花沒吃進去）'}`);
  }

  L.push('');
  L.push('這批圖沒有任何一張離開過你的瀏覽器。版型是在這台機器上');
  L.push('用種子算出來的，換一台機器也算得出一模一樣的結果。');
  L.push('');

  return L.join('\n');
}

function fmt(v) {
  return Number(v).toFixed(3);
}
