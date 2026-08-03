/* Worker host for the read pipeline.

   Thin on purpose: everything real is in ../pipeline.js so that the
   main-thread fallback runs the same code. This file only marshals messages and
   makes sure nothing escapes as an uncaught error, because an uncaught error in
   a worker is invisible to the user and loud in the console. */

import { ingest, IngestError } from "../pipeline.js";
import { indexTransferables } from "../index-build.js";

let cancelled = false;

self.addEventListener("error", (e) => {
  e.preventDefault();
  post({ type: "error", code: "worker-error", detail: { message: String(e.message || e) } });
});
self.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  post({ type: "error", code: "worker-error", detail: { message: String((e.reason && e.reason.message) || e.reason) } });
});

function post(msg, transfer) {
  try {
    self.postMessage(msg, transfer || []);
  } catch (err) {
    self.postMessage({ type: "error", code: "post-failed", detail: { message: String(err && err.message) } });
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  if (msg.type !== "ingest") return;

  cancelled = false;
  const started = performance.now();
  try {
    const result = await ingest(msg.file, { mapping: msg.mapping, entryName: msg.entryName, force: msg.force }, (e) => {
      if (!cancelled) post(e);
    });
    if (cancelled) {
      post({ type: "cancelled" });
      return;
    }
    post(
      {
        type: "done",
        records: result.records,
        index: result.index,
        tabTerms: result.tabTerms,
        sourceName: result.sourceName,
        truncated: result.truncated,
        ms: performance.now() - started,
      },
      indexTransferables(result.index)
    );
  } catch (err) {
    if (err instanceof IngestError) {
      post({ type: "error", code: err.code, detail: err.detail });
    } else {
      console.debug("chatvault worker", err);
      post({ type: "error", code: "unexpected", detail: { message: String((err && err.message) || err) } });
    }
  }
};
