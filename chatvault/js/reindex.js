/* Rebuild the index from records already in the vault.

   Used on a second visit, and after a merge that changed the record set. It
   yields to the event loop between blocks so that reopening a large vault never
   blocks the main thread for more than a few milliseconds at a time. */

import { IndexBuilder } from "./index-build.js";
import { readingPath } from "./conversation.js";

const BLOCK = 60;

export async function buildIndexFor(records, onProgress) {
  const started = performance.now();
  const builder = new IndexBuilder();
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const { path } = readingPath(rec);
    const onPath = new Set(path.map((k) => rec.nodes[k].id));
    onPath.add("#title");
    rec.pathIds = [...onPath].filter((x) => x !== "#title");
    builder.addConversation(rec, onPath);
    if (i % BLOCK === BLOCK - 1) {
      if (onProgress) onProgress(i + 1, records.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const index = builder.seal();
  return { index, ms: performance.now() - started };
}
