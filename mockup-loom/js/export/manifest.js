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

  L.push(`Mockup Loom export - ${y}-${m}-${d}`);
  L.push('Templates in this export are procedurally generated (noise-based), not photographic.');
  if (reduced) L.push('Rendered in reduced mode (no WebGL2): displacement disabled.');
  L.push('');
  L.push(`Light      azimuth ${light.azimuth}, elevation ${light.elevation}, intensity ${light.intensity}`);
  L.push(`Blend      ${blendLabel}`);
  L.push(`Output     ${outputWidth} px on the width of each form`);
  L.push(`Files      ${paths.length}`);
  if (renamed) L.push(`Renamed    ${renamed} file names collided and were suffixed`);
  L.push('');

  for (const entry of paths) {
    const j = entry.job;
    L.push(entry.path.split('/').slice(1).join('/'));
    L.push(`  design    ${j.designSlug}${j.designSample ? ' (sample)' : ''}`);
    L.push(`  template  ${j.templateLabel} (seed ${j.seed})`);
    L.push(`  size      ${j.w} x ${j.h}`);
    L.push(
      `  placement x ${fmt(j.placement.x)}  y ${fmt(j.placement.y)}` +
      `  scale ${fmt(j.placement.scale)}  rotation ${Math.round(j.placement.rotation)}`
    );
    L.push(`  weave     ${j.woven ? 'woven (displacement on)' : 'flat (displacement off)'}`);
  }

  L.push('');
  L.push('Nothing in this export left your browser. The templates were generated');
  L.push('from their seeds on this machine and can be regenerated identically.');
  L.push('');

  return L.join('\n');
}

function fmt(v) {
  return Number(v).toFixed(3);
}
