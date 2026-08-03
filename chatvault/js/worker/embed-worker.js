/* Optional meaning search.

   Nothing in this file runs until the user has read what it downloads and
   pressed the button. The import is dynamic, inside try/catch, and any failure
   is reported as a message rather than left as an uncaught error, because an
   optional feature that fills the console is worse than an optional feature
   that is absent.

   The model runs in this worker. Conversation text goes in, vectors come out,
   and neither leaves the tab. */

const MODEL = "Xenova/all-MiniLM-L6-v2";
const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/+esm";

let extractor = null;
let cancelled = false;

self.addEventListener("error", (e) => {
  e.preventDefault();
  self.postMessage({ type: "failed", stage: "runtime", message: String(e.message || e) });
});
self.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  self.postMessage({ type: "failed", stage: "runtime", message: String((e.reason && e.reason.message) || e.reason) });
});

async function load() {
  if (extractor) return extractor;
  const lib = await import(/* @vite-ignore */ CDN);
  const pipeline = lib.pipeline || (lib.default && lib.default.pipeline);
  if (typeof pipeline !== "function") throw new Error("pipeline entry point missing");
  extractor = await pipeline("feature-extraction", MODEL, {
    dtype: "q8",
    progress_callback: (p) => {
      if (p && p.status === "progress" && p.total) {
        self.postMessage({ type: "download", loaded: p.loaded || 0, total: p.total, file: p.file || "" });
      }
    },
  });
  return extractor;
}

function normalise(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

self.onmessage = async (event) => {
  const msg = event.data || {};

  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }

  if (msg.type === "build") {
    cancelled = false;
    try {
      const model = await load();
      self.postMessage({ type: "ready" });
      const texts = msg.texts;
      const dims = 384;
      const out = new Float32Array(texts.length * dims);
      const BATCH = 8;
      for (let i = 0; i < texts.length; i += BATCH) {
        if (cancelled) {
          self.postMessage({ type: "cancelled" });
          return;
        }
        const slice = texts.slice(i, i + BATCH);
        const result = await model(slice, { pooling: "mean", normalize: true });
        const data = result.data;
        const stride = data.length / slice.length;
        for (let k = 0; k < slice.length; k++) {
          const vec = normalise(data.slice(k * stride, (k + 1) * stride));
          out.set(vec.subarray(0, dims), (i + k) * dims);
        }
        self.postMessage({ type: "vectors", done: Math.min(i + BATCH, texts.length), total: texts.length });
      }
      self.postMessage({ type: "built", vectors: out, dims }, [out.buffer]);
    } catch (err) {
      self.postMessage({ type: "failed", stage: "build", message: String((err && err.message) || err) });
    }
    return;
  }

  if (msg.type === "query") {
    try {
      const model = await load();
      const result = await model([msg.text], { pooling: "mean", normalize: true });
      const vec = normalise(result.data.slice(0, msg.dims || 384));
      self.postMessage({ type: "queryVector", vector: vec, id: msg.id }, [vec.buffer]);
    } catch (err) {
      self.postMessage({ type: "failed", stage: "query", message: String((err && err.message) || err) });
    }
  }
};
