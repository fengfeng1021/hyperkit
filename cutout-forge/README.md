# Cutout Forge

Batch background removal for e-commerce product photos, running entirely inside the
browser tab. No account, no credits, no upload limit, no watermark.

Live: `https://fengfeng1021.github.io/hyperkit/cutout-forge/`
Back to the hub: [`../index.html`](../index.html)

---

## What it is

A seller gets 200 photos back from a shoot the day before a launch. Every SaaS tool
charges per photo, caps the free tier at a quarter of a megapixel, and hands back a
cutout that still has to be resized, matted onto white, renamed, and foldered before
Amazon will accept it.

Cutout Forge does the whole job in one pass, on your own machine:

- **Batch queue** with start, pause, resume, retry, remove, and undo. The 201st photo
  behaves exactly like the first.
- **Two cutout engines**, both real, both shipping:
  - `briaai/RMBG-1.4` through transformers.js, WebGPU with a WASM fallback.
  - A chroma-key flood fill written from scratch in this repo, zero dependencies,
    always available even with the network unplugged.
- **Platform presets** for Shopify, Amazon, Etsy and Shopee: square size, the share of
  the frame the product must fill, transparent PNG and white JPEG, and a naming
  template. All editable, all persisted.
- **Structured ZIP export** foldered by platform and format, with a `_manifest.csv`
  recording which engine produced each file and which ones were flagged.
- **A before and after inspector** with a draggable divider, 1:1 pixel view, live
  feather and despill, and a measurement column of numbers we actually computed.
- **A savings ledger** that only appears after the first photo is finished, at a rate
  you set yourself.

## How to use it

1. Open the page. Press **Load 6 sample products** if you want to see it work before
   trusting it with your own files. The samples are drawn on a canvas in your browser
   and go through the identical pipeline.
2. Or drag a folder of photos anywhere onto the floor, or press **Choose photos**.
3. The queue starts on its own. Watch the wall, or park the tab and come back.
4. Tick the platforms you sell on in the left rail. Open **Edit** on any row to change
   the size, the fill percentage, the file formats, the JPEG quality or the naming.
5. Click any thumbnail to inspect the edge. Drag the divider, or use the arrow keys.
6. Press **Export**. A ZIP lands in your downloads.

### Keyboard

`O` open files · `S` load samples · `P` start, pause, resume · `E` export · `?` this
list · `Esc` step back one layer. Inside the wall: arrow keys move, `Enter` opens,
`Space` selects, `Ctrl+A` selects all, `Delete` removes, `R` retries. Inside the
inspector: `[` and `]` step between photos, `Z` toggles 1:1.

## Privacy

**Your photos never leave this tab.** There is no server, no upload endpoint, and no
analytics. You can verify it: open the network panel, run a batch, and watch nothing
go out. Pull the ethernet cable and the batch keeps running.

**The model weights are downloaded once** from `huggingface.co` via the jsDelivr CDN,
about 88 MB on WebGPU or 44 MB on WASM, and then live in your browser's Cache Storage
so the second visit opens instantly and offline. That download is the only network
request this tool makes after the page itself loads, and you can skip it entirely with
**Skip and use chroma-key**.

These are two different statements and they are kept separate on purpose. Fonts come
from Google Fonts; if that bothers you, the page falls back to system UI and monospace
faces without any loss of function.

Settings (presets, rate, feather and despill defaults) are stored in `localStorage`.
Nothing else is persisted. The queue itself is deliberately not saved.

## Technical notes

Static files only. No build step, no npm, no bundler, no framework. Open `index.html`
and it runs.

### Memory

Two hundred 24-megapixel JPEGs decoded at full resolution is roughly 19 GB of pixel
data, which is how a batch tool kills a laptop. The rules here:

- Display decode is capped at **512 px on the long edge** via
  `createImageBitmap(file, { resizeWidth, resizeQuality: 'medium' })`.
- Pixel dimensions are read from the **file header** (JPEG SOF, PNG IHDR, WebP, ISO
  BMFF `ispe`) so we can plan the decode without ever holding the full image.
- The only thing retained per photo is a **512 px mask**, about 256 KB. Two hundred
  photos is roughly 50 MB.
- Full resolution is opened **one photo at a time, during export only**, and released
  before the next one is touched. The decode is also capped at the largest size the
  selected presets actually need, so a 1024 px Shopee JPEG never costs 8000 px of
  memory.
- Concurrency is `clamp(round(hardwareConcurrency / 2), 1, 4)` and halves itself on a
  decode failure, saying so in the status rail.

### The chroma-key path

`js/chroma.js`, pure JavaScript, no dependencies, runs in a worker.

1. Sample a 2 px frame from all four edges.
2. Convert to CIE Lab, take the median as the background, take the 90th percentile of
   delta-E76 as the spread.
3. Tolerance is `clamp(spread * 1.6, 6, 22)`.
4. Mark every pixel within tolerance.
5. Label connected components. A component is background if it touches the border, or
   if it is large enough to be an intentional hole. That second clause is why the
   middle of a ring is cut out while sensor noise inside the product is not.
6. Two 3x3 morphological closings, then three box-blur passes for the feather.

Honest range: solid or near-solid studio sweeps, which is most product photography.
Outside it: fur, hair, glass, gradients, cluttered rooms. When the background measures
as not solid enough the photo is flagged rather than silently passed.

### Flagging

A photo is marked **needs a look** when the alpha coverage is below 2% or above 97%,
when the chroma-key background spread exceeds 12, or when more than 6% of pixels sit
between alpha 0.08 and 0.92. These are heuristics, and the interface says `need a
look`, never `failed`.

### Yielding

The batch yields between photos with a `MessageChannel` round trip, not
`requestAnimationFrame`. Sellers park this tab and go work in their store admin, and
rAF stops firing the moment a tab is hidden, which would freeze the queue. Timers are
throttled to one second in background tabs. A message-channel macrotask is neither
throttled nor stopped.

### ZIP

`js/zipwriter.js` writes stored (uncompressed) entries with real CRC32, local headers,
a central directory and an EOCD record. PNG and JPEG are already compressed, so
deflating them again costs main-thread time for a couple of percent. Entries are held
as `Blob`s, which the browser keeps on disk rather than in the JS heap, so a large
export does not sit in memory as byte arrays. Exports over 1.9 GB split into numbered
volumes, each carrying the full manifest.

### Files

```
cutout-forge/
  index.html          direction contract, sprite, shell
  css/
    tokens.css        the only source of colour
    style.css         layout and components
  js/
    main.js           DOM wiring, keyboard, alerts, views
    queue.js          queue, concurrency, memory pressure
    engine.js         hardware probe, model warm-up, inference
    chroma.js         chroma-key algorithm, feather, metrics
    worker.js         worker wrapper around chroma.js
    pool.js           worker pool with an inline fallback
    compose.js        alpha application, despill, reframing
    presets.js        platform presets and their editor
    exporter.js       export pipeline, naming, manifest
    zipwriter.js      store-only ZIP writer
    inspector.js      before and after view, measurements
    ledger.js         savings counter
    samples.js        six canvas-drawn sample products
    util.js           helpers, header parsing, storage
```

### Notes on the build

- The icon sprite is inlined in `index.html` rather than fetched from
  `assets/icons.svg`, so `<use>` resolves when the page is opened straight off disk
  with `file://`.
- The thumbnail wall is `role="listbox"` with `role="option"` items and a roving
  tabindex. `role="grid"` would require a `role="row"` wrapper per row, which the CSS
  grid layout has no place for; listbox carries the multi-select semantics correctly.
- `--scan`, `--erase` and `--split` are registered with `inherits: true` because each
  is set on a parent and read by a child.
- The model download reports its real size for the detected device: 88 MB for WebGPU
  fp16, 44 MB for WASM q8. The direction contract quotes 44 MB; the live readout tells
  you which one you are actually getting.
- Motion lives entirely in `js/motion.js`, attached to the named hooks listed at the
  bottom of `js/main.js`. It is additive: every state is complete and legible with no
  animation running at all, so the page is unchanged if GSAP is blocked and nothing
  registers under `prefers-reduced-motion`.
- The one authored moment is the wall developing: a centre-out arrival stagger, a
  constant-rate scan beam per tile, and a radial `mask-image` dissolve that fires the
  instant the beam clears the bottom edge. The beam is the cause and the cutout is the
  effect, which is why it always finishes its run before a photo develops.
- `transform` on a `.tile` is a single shared channel and is sequenced by hand:
  the arrival is landed before the wall is measured for Flip, in-flight flinches are
  landed before the regroup takes over, and no flinch starts while a regroup runs.
  The standalone `scale` property is **not** available as a second channel — GSAP
  folds its computed value into `transform` and writes `scale: none` inline the first
  time it builds a transform cache for an element.
- A backgrounded tab stops `requestAnimationFrame` and therefore GSAP. On
  `visibilitychange` the motion layer lands every in-flight tween, so a seller who
  switches to their store admin mid-batch comes back to a correct DOM rather than to
  half-rendered tweens.

## Next

Transparent PNGs from here drop straight into [Mockup Loom](../mockup-loom/).
