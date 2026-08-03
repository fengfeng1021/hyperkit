# ChatVault

A card catalogue for the AI conversations you already had. Drop a ChatGPT, Claude or Gemini
export into the page and it is parsed, indexed and searchable in the same browser tab. There is
no server, no account and no upload endpoint anywhere in the code.

Part of [Hyperkit](../index.html).

---

## What it is

Every AI provider will hand you your history as a file, and every one of those files is
unreadable. ChatGPT gives you a message tree keyed by node id. Claude gives you a flat array
whose text lives in one of two different shapes depending on the month. Google gives you an
activity log that is not grouped into conversations at all. All three are routinely hundreds of
megabytes, which is enough to make the browser's own JSON parser lock the tab.

ChatVault turns any of them into an index: BM25 ranking, phrase search, exclusions, role and
date filters, hit highlighting, and a jump straight to the message that matched.

The thing it does that other viewers do not: **it keeps the branches.** A ChatGPT export is a
tree, because every regenerate and every edited prompt adds a sibling node. Flattening that tree
by timestamp, which is what most viewers do, produces conversations the user never had, with two
answers to the same question stacked back to back. ChatVault walks the parent chain from
`current_node`, indexes the other branches as well, marks a hit that landed on one, and gives
you a switcher at every fork.

## Using it

Serve the folder over http and open `index.html`:

```
python -m http.server 8000
```

Then either drop your own export, or press **Load sample vault**. The sample is 47 real
technical conversations in genuine ChatGPT export shape, three of them branched, and it goes
through exactly the same parser, indexer and storage path as your own file does. Nothing about
it is a shortcut.

### Getting your own export

- **ChatGPT**: Settings, Data controls, Export data. Link arrives by email, expires after 24
  hours. Drop the whole zip.
- **Claude**: Settings, Privacy, Export data. Drop the whole zip.
- **Gemini**: Google Takeout, deselect everything, select My Activity in JSON, restrict to
  Gemini Apps. Drop the archive, or `MyActivity.json` or `MyActivity.html` on its own.

If none of the three structures match, ChatVault opens a mapping wizard whose dropdown options
are the real key paths of the first record in your file. The mapping is stored under a hash of
that file's key shape, so the next export of the same format is read without asking again.

### The query language

It all goes in the one field, and it is printed next to the field rather than hidden in a doc.

```
"exact phrase"   words must appear next to each other
-word            exclude conversations containing this word
+word            this word is required
role:human       only your messages        role:assistant
source:chatgpt   also claude, gemini
after:2025-03    before:2025-06-01
has:code         only conversations containing a code block
```

Search modes: **Exact** uses your words as written. **Expanded** adds terms that travel with
your words inside your own vault, and shows each one as a removable chip with its weight, so the
result set never contains a surprise you cannot trace. **Meaning** appears only after you
explicitly download a sentence model, and is described below.

### Keyboard

`/` or `Ctrl+K` focuses search. `Up` and `Down` move through the index even while typing.
`Enter` opens, `Shift+Enter` opens without leaving the list. `j` and `k` move between messages,
`[` and `]` switch branch, `n` and `Shift+n` jump between hits. `g` then `s` shows statistics,
`g` then `i` returns. `Esc` unwinds one layer at a time. `?` opens the full list.

## How it works

No build step, no bundler, no framework. Native HTML, native CSS custom properties, native ES
modules, GSAP from a CDN for the drawer animation.

**Reading a large file.** The file never reaches `JSON.parse` whole. `js/stream-json.js` is a
chunked splitter that tracks string and escape state and hands one array element at a time to
the adapter, so peak memory is one conversation rather than the file. Byte progress is counted
upstream of the text decoder, which is why the number on screen is the real position in the
file. Zips are opened by reading the end-of-central-directory record from the tail and
decompressing only the member that looks like an export (`js/zip.js`), so a 340 MB archive costs
a few kilobytes to open. All of it runs inside a Web Worker; when a worker cannot be constructed
the same pipeline module runs on the main thread, after saying so.

**The index.** Built with plain arrays during ingest, then sealed into typed arrays:
`Int32Array` document ids, `Uint16Array` term frequencies, and delta-encoded positions in a flat
`Int32Array` with an offset table (`js/index-build.js`). A document is one message, not one
conversation, so "which message said this" is a real answer. Ranking is BM25 with `k1 = 1.2` and
`b = 0.62`; b is lower than the usual 0.75 because a chat message's length says very little
about its relevance. Positions are real, so phrase search is a real adjacency check rather than
"all the words are present", which returns wrong results the user cannot see.

**Storage.** IndexedDB, written in transactions of 200 records that roll back whole. A second
import of an overlapping export merges rather than overwrites, keyed on the export's own
conversation id and falling back to a content hash where there is none. Clearing the vault is
the only destructive action and requires typing `delete`.

**Rendering.** Both long lists are virtualised. The index list has fixed row heights, so offsets
are arithmetic. The reading pane measures, caches by row key, and corrects `scrollTop` in the
same frame when a measurement changes, so scrolling up into unmeasured messages does not jump.
Scroll listeners are passive, on the container, and only record a number; repaints are batched
to one per frame through `js/frame.js`, which uses `gsap.ticker` when GSAP is present and
`requestAnimationFrame` when it is not.

**Code blocks.** A hand-written tokenizer (`js/highlight.js`), one scan, ten languages, no
library. Keywords are marked with weight rather than a hue, because this palette is ink, amber
and burnt earth and a rainbow of token colours would break it. Blocks over 20,000 characters
skip highlighting and say so on screen rather than failing silently.

**Statistics.** Real counts, a month series and an hour distribution drawn to canvas, and a
subject list taken only from your own messages, stopword filtered and weighted by
`tf * log(N / conversation frequency)`, which is what turns a word count into a list of topics.

## Privacy

Four hosts, all listed in the page itself so they can be checked against the Network panel:

| Host | What for |
|---|---|
| `fonts.googleapis.com` | the stylesheet for Literata, Public Sans and Spline Sans Mono |
| `fonts.gstatic.com` | the font files |
| `cdn.jsdelivr.net` | GSAP; also the sentence-model runtime, but only if you turn meaning search on |
| `huggingface.co` | model weights, only after you press Download the model |

There is no analytics, no error reporting, and no endpoint in this page capable of sending your
conversations anywhere. Once the page and its fonts are cached you can disconnect and keep
using it.

Meaning search is optional and off by default. Pressing the button loads
`@huggingface/transformers` inside a worker, downloads `Xenova/all-MiniLM-L6-v2`, and builds
vectors locally. Every part of that path is wrapped so that a failure produces a sentence on
screen and leaves keyword search untouched, rather than an uncaught error in the console.

Your vault lives in IndexedDB in this browser profile. Removing it removes it. There is no copy
anywhere else, which is the trade this design makes on purpose.

## Layout of the folder

```
index.html                  direction contract comment is the first child of <body>
css/tokens.css              the only source of colour, type, spacing, radius and motion values
css/style.css               layout and components, no bare hex
js/main.js                  state machine and event wiring
js/pipeline.js              bytes in, conversations and an index out (worker and fallback share it)
js/stream-json.js           chunked top-level array splitter
js/zip.js  js/zip-write.js  zip reader, and a store-only writer for batch export
js/detect.js                structural format detection, never filename based
js/adapters/                chatgpt.js  claude.js  gemini.js  generic.js
js/conversation.js          the branch model: parent chains, forks, path selection
js/index-build.js           inverted index, sealed into typed arrays
js/search.js                query parsing, BM25, phrases, filters, expansion, diagnostics
js/store.js                 IndexedDB schema, chunked transactions, merge on re-import
js/reindex.js               rebuild the index from a stored vault, yielding between blocks
js/vlist.js                 fixed-height and measured-height virtual lists
js/highlight.js             the code tokenizer
js/stats.js  js/stats-view.js
js/exporter.js              Markdown and JSON, single and batch
js/spine.js                 the spine strip: the live readout of every query
js/drawer-canvas.js         the drawer that fills while the file is read
js/reader.js  js/index-list.js  js/wizard.js  js/notice.js  js/semantic.js
js/worker/parse-worker.js   worker host for the pipeline
js/worker/embed-worker.js   optional embeddings, guarded end to end
assets/sample-vault.json    47 authored conversations in ChatGPT export shape
assets/_sample-source*.mjs  the readable source those conversations were written in
assets/_build-sample.mjs    generator, run once, not loaded by the site
```

## The motion layer

`js/motion.js` (GSAP 3.13 from the CDN, core only, no plugins) holds one authored moment and
three confirmations, and nothing else. It is imported by `main.js` for its side effects and
subscribes to the events on `js/state.js`. If the CDN never answers, or the reader has asked
for reduced motion, it registers nothing: every element it touches is already rendered at its
resting state, so the catalogue is complete and simply still.

**Opening the drawer**, in six phases, driven by the real import:

1. A dragged file lifts the drop zone and thickens its ink front edge.
2. `ingest:start` opens an amber mark at the top of the cavity. Every card enters there.
3. `ingest:batch` throws that batch from the mark into the stack, staggered `0.004s` apart from
   the centre, each sliver trailing two ghosts along its own flight path. The stack is a
   histogram of the archive over time, so the drawer fills with a real profile, ring by ring. A
   small export is parsed in one tick, so rings queue behind each other rather than arriving in
   the same millisecond.
4. `ingest:indexProgress` raises one amber tab per term pulled out of the inverted index while
   it is being built, and slides the row left by exactly that tab's width.
5. `vault:closing` seals: one 1.06 breath of the whole stack, one pass of light end to end, and
   the stack compresses into a single 3px line.
6. The drawer front travels the depth of the cavity and shuts, the entry page steps back, and
   the cabinet wipes in from the top while that same line of slivers opens outward from the
   centre as the spine strip.

`adoptVault()` awaits phase 5 and 6 through `vault:closing`, with a 2.6 second ceiling: if the
seal cannot run at all, for instance in a background tab where the animation frame callback
never fires, the vault opens anyway.

**Then the spine strip is the search.** `SpineStrip.applyResults()` writes target values and
calls the `transition` hook the motion layer installs, which travels the strip oldest to newest
as one wave: hits to full ink, everything else to 0.08 alpha and a third of the height. One
proxy tween drives every conversation, so the cost is the same for a 47 card sample and a vault
of several thousand. Without the hook, `applyResults()` settles to the same values immediately,
which is the same readout.

**The three confirmations** are the drop zone under a dragged file, the export menu opening out
of its own button with `clipPath`, and, after a branch switch, the messages that actually differ
resolving out of a blur while everything the two branches share stays exactly where it is.

Durations and easings live in `css/tokens.css` as `--dur-1` through `--dur-4`, `--dur-batch`,
`--dur-trail`, `--ease-out`, `--ease-settle`, `--ease-in-out` and `--ease-in`. The GSAP
equivalents are `power4.out` as the default, `power3.out` for tabs and confirmations,
`power3.inOut` for the compression, `power3.in` for the drawer front, and `none` only where the
value is data rather than motion.

## Known limits

- Gemini's Takeout format does not record conversation boundaries, so ChatVault groups turns by
  a 30 minute gap. The reading pane says so rather than pretending the grouping came from
  Google.
- Meaning search downloads about 23 MB once. On a browser without WebGPU it falls back to WASM,
  which is slower to build vectors but works. Keyword search is unaffected either way.
- A single conversation over 5,000 messages is paged in the reading pane, newest first, with a
  control to load earlier ones. It is fully indexed regardless.
- The zip writer used for batch export is store-only. The archive is valid everywhere but is not
  compressed.
- The first import holds the workspace back for up to about two seconds while the drawer shuts.
  That is a deliberate trade: the seal is what proves the file was read here. It happens once
  per import, never on a return visit, never on a second import into an open vault, and not at
  all under reduced motion.
