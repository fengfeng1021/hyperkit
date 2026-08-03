/* ==========================================================================
   Engine: hardware probe, model warm-up, inference, and the honest downgrade
   ladder underneath it.

     model (webgpu)  fp16 weights on your GPU
     model (wasm)    quantised weights on the CPU, 6 to 10 times slower
     chroma-key      our own flood fill, no download, always available

   Every failure in this file ends at a mode that still produces a result.
   None of them ends at a button that does nothing.

   Your photos are never sent anywhere. The model weights are downloaded once
   from huggingface.co and then live in the browser's Cache Storage. Those are
   two different things and the interface states them separately.
   ========================================================================== */

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';
const MODEL_ID = 'briaai/RMBG-1.4';
const CACHE_NAME = 'transformers-cache';
const IMPORT_TIMEOUT = 20000;
const STALL_AFTER = 8000;

const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(engine.snapshot()); };

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

export const engine = {
  /* capabilities, all measured not assumed */
  caps: { webgpu: false, worker: false, bitmap: false, offscreen: false, caches: false },
  device: 'wasm',          // 'webgpu' | 'wasm'
  mode: 'model',           // 'model' | 'chroma'  (what the queue will use)
  modelStatus: 'idle',     // idle | warming | compiling | ready | stalled | failed
  cached: 'unknown',       // unknown | yes | no | unavailable
  concurrency: 2,
  warm: { loaded: 0, total: 0, pct: 0, knownTotal: false },
  lastError: '',
  consecutiveModelFailures: 0,

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  get weightsMB() { return this.device === 'webgpu' ? 88 : 44; },

  snapshot() {
    return {
      state: this.chipState(), device: this.device, mode: this.mode,
      modelStatus: this.modelStatus, cached: this.cached,
      concurrency: this.concurrency, warm: { ...this.warm }, lastError: this.lastError,
    };
  },

  chipState() {
    if (this.mode === 'chroma') return 'chroma';
    if (this.modelStatus === 'warming' || this.modelStatus === 'compiling') return 'warming';
    if (this.modelStatus === 'ready') return this.cached === 'yes' ? 'offline-ready' : this.device;
    if (this.device === 'webgpu') return 'webgpu';
    if (this.caps.bitmap) return 'wasm';
    return 'probing';
  },

  /* ------------------------------------------------------------- probing */

  async probe() {
    this.caps.bitmap = typeof createImageBitmap === 'function';
    this.caps.offscreen = typeof OffscreenCanvas === 'function';
    this.caps.worker = typeof Worker === 'function';
    this.caps.caches = typeof caches === 'object' && caches !== null;

    const cores = navigator.hardwareConcurrency || 4;
    this.concurrency = Math.min(4, Math.max(1, Math.round(cores / 2)));
    this.cores = cores;

    if (navigator.gpu && typeof navigator.gpu.requestAdapter === 'function') {
      try {
        const adapter = await withTimeout(navigator.gpu.requestAdapter(), 4000, 'gpu probe timed out');
        if (adapter) { this.caps.webgpu = true; this.device = 'webgpu'; }
      } catch { /* no adapter, WASM it is */ }
    }

    if (this.caps.caches) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        this.cached = keys.some(r => r.url.includes('RMBG')) ? 'yes' : 'no';
      } catch { this.cached = 'unavailable'; }
    } else {
      this.cached = 'unavailable';
    }

    emit();
    return this.snapshot();
  },

  /** The single line of hardware truth under the two buttons. */
  bedLine() {
    if (!this.caps.bitmap) {
      return 'This browser cannot decode images off the main thread. Try Chrome, Edge, or Firefox 110+.';
    }
    if (this.mode === 'chroma') {
      /* Names the trade both ways round. "No download" is what you gain,
         "flat backdrops" is where it holds, and the model is named as the
         thing that covers the rest, so nothing here reads as a failure. */
      return 'Chroma-key · no download, exact on flat studio backdrops · the model handles fur, hair and glass';
    }
    if (this.modelStatus === 'ready') {
      return `${this.device === 'webgpu' ? 'WebGPU' : 'WASM'} · model loaded, ready to run`;
    }
    if (this.cached === 'yes') {
      return `${this.device === 'webgpu' ? 'WebGPU ready' : 'WASM'} · model already cached, opens offline`;
    }
    if (this.device === 'webgpu') {
      return `WebGPU ready · model not downloaded yet (${this.weightsMB} MB, one time)`;
    }
    return `No WebGPU here · WASM is 6 to 10 times slower (${this.weightsMB} MB model, one time)`;
  },

  /* -------------------------------------------------------- model warm-up */

  _lib: null,
  _model: null,
  _processor: null,
  _loading: null,
  _stallTimer: null,
  _fileTotals: new Map(),
  _fileLoaded: new Map(),

  useChroma(reason) {
    this.mode = 'chroma';
    this.modelStatus = this.modelStatus === 'ready' ? 'ready' : 'idle';
    if (reason) this.lastError = reason;
    this._clearStall();
    emit();
  },

  useModel() {
    this.mode = 'model';
    this.lastError = '';
    emit();
  },

  _clearStall() { clearTimeout(this._stallTimer); this._stallTimer = null; },

  _armStall(onStall) {
    this._clearStall();
    this._stallTimer = setTimeout(() => {
      if (this.modelStatus === 'warming') {
        this.modelStatus = 'stalled';
        emit();
        onStall && onStall();
      }
    }, STALL_AFTER);
  },

  /**
   * Downloads and compiles the model. Resolves true when the model is usable,
   * false when we gave up and switched to chroma-key. Never rejects.
   */
  async ensureModel({ onProgress, onStall } = {}) {
    if (this.modelStatus === 'ready') return true;
    if (this.mode === 'chroma') return false;
    if (this._loading) return this._loading;

    this._loading = (async () => {
      this.modelStatus = 'warming';
      this.warm = { loaded: 0, total: 0, pct: 0, knownTotal: false };
      emit();
      this._armStall(onStall);

      try {
        if (!this._lib) {
          this._lib = await withTimeout(import(/* @vite-ignore */ TRANSFORMERS_URL), IMPORT_TIMEOUT, 'model host unreachable');
          this._lib.env.allowLocalModels = false;
          if (this._lib.env.backends?.onnx?.wasm) this._lib.env.backends.onnx.wasm.proxy = false;
        }

        const { AutoModel, AutoProcessor } = this._lib;

        const progress_callback = (info) => {
          if (info.status === 'progress' && info.file) {
            if (Number.isFinite(info.total) && info.total > 0) this._fileTotals.set(info.file, info.total);
            this._fileLoaded.set(info.file, info.loaded || 0);
            let loaded = 0, total = 0;
            for (const v of this._fileLoaded.values()) loaded += v;
            for (const v of this._fileTotals.values()) total += v;
            const knownTotal = total > 0;
            this.warm = { loaded, total, knownTotal, pct: knownTotal ? Math.min(100, (loaded / total) * 100) : 0 };
            this.modelStatus = 'warming';
            this._armStall(onStall);
            emit();
            onProgress && onProgress(this.warm);
          } else if (info.status === 'done' || info.status === 'ready') {
            this._armStall(onStall);
          }
        };

        /* RMBG-1.4 declares model_type SegformerForSemanticSegmentation, which
           transformers.js has no mapping for. Overriding it to "custom" makes
           it build from the base class, which is the path that works.
           logSeverityLevel 3 keeps onnxruntime's own execution-provider
           chatter out of the console. */
        this._model = await AutoModel.from_pretrained(MODEL_ID, {
          config: { model_type: 'custom' },
          device: this.device === 'webgpu' ? 'webgpu' : 'wasm',
          dtype: this.device === 'webgpu' ? 'fp16' : 'q8',
          session_options: { logSeverityLevel: 3 },
          progress_callback,
        });

        this.modelStatus = 'compiling';
        emit();

        this._processor = await AutoProcessor.from_pretrained(MODEL_ID, {
          config: {
            do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
            image_mean: [0.5, 0.5, 0.5], image_std: [1, 1, 1],
            feature_extractor_type: 'ImageFeatureExtractor',
            resample: 2, rescale_factor: 1 / 255,
            size: { width: 1024, height: 1024 },
          },
          progress_callback,
        });

        this._clearStall();
        this.modelStatus = 'ready';
        if (this.caps.caches) {
          try {
            const cache = await caches.open(CACHE_NAME);
            const keys = await cache.keys();
            this.cached = keys.length ? 'yes' : 'no';
          } catch { this.cached = 'unavailable'; }
        }
        emit();
        return true;
      } catch (err) {
        this._clearStall();
        this.modelStatus = 'failed';
        this.lastError = String((err && err.message) || err);
        this.mode = 'chroma';
        emit();
        return false;
      } finally {
        this._loading = null;
      }
    })();

    return this._loading;
  },

  async clearCache() {
    if (!this.caps.caches) return false;
    try {
      await caches.delete(CACHE_NAME);
      this.cached = 'no';
      this._model = null; this._processor = null;
      this.modelStatus = 'idle';
      emit();
      return true;
    } catch { return false; }
  },

  /* ------------------------------------------------------------ inference */

  _gate: Promise.resolve(),

  /**
   * Runs the segmentation model on RGBA pixels and returns a mask of the same
   * width and height, 0 background to 255 product. Throws on failure so the
   * queue can count it and drop a rung on the ladder.
   */
  async run(rgba, w, h) {
    if (this.modelStatus !== 'ready' || !this._model || !this._processor) {
      throw new Error('model is not loaded');
    }
    // One inference at a time: the GPU queue is the real bottleneck and
    // parallel calls only make the memory spike worse.
    const turn = this._gate.then(() => this._infer(rgba, w, h));
    this._gate = turn.catch(() => {});
    return turn;
  },

  async _infer(rgba, w, h) {
    const { RawImage } = this._lib;
    const image = new RawImage(new Uint8ClampedArray(rgba), w, h, 4).rgb();
    const inputs = await this._processor(image);
    const pixel_values = inputs.pixel_values || inputs.input || Object.values(inputs)[0];
    const result = await this._model({ input: pixel_values });
    const tensor = result.output ?? result.logits ?? Object.values(result)[0];
    const first = tensor[0] ?? tensor;
    const raw = await RawImage.fromTensor(first.mul(255).to('uint8')).resize(w, h);
    const out = new Uint8Array(w * h);
    const ch = raw.channels || 1;
    for (let i = 0; i < out.length; i++) out[i] = raw.data[i * ch];
    return out;
  },
};
