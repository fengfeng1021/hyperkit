/* Node check for js/color.js. Not shipped to the browser, not part of a build:
   run it by hand with `node tools/check-color.mjs` after touching the math.

   It asserts the hex -> OKLCH -> hex round trip on 4096 evenly spaced colors
   plus 2000 random ones, that the Bayer recursion and its closed form agree,
   that powerless-hue carry works, and that white on black is exactly 21:1. */

import { selfTest } from '../js/color.js';

const failures = selfTest();
if (failures.length) {
  console.error(`${failures.length} failures`);
  for (const f of failures.slice(0, 40)) console.error('  ' + f);
  process.exit(1);
}
console.log('color.js: all checks passed');
