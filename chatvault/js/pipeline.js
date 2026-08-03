/* The whole read path: bytes in, conversations and an index out.

   Lives in its own module because it has to run in two places. Normally it runs
   inside the Web Worker. When a Worker cannot be constructed, main.js imports
   this directly and runs it on the main thread after telling the user what that
   costs. One implementation, two hosts, no second code path to drift. */

import { JsonArrayReader, readAllText } from "./stream-json.js";
import { detectRecord, detectHtml, rankZipEntries, keyPaths } from "./detect.js";
import { adaptChatGPT } from "./adapters/chatgpt.js";
import { adaptClaude } from "./adapters/claude.js";
import { adaptGeminiHtml, geminiTurn, groupGemini } from "./adapters/gemini.js";
import { adaptGeneric } from "./adapters/generic.js";
import { readZipDirectory, openZipEntry, canUnzip, isZip, UnsupportedZip } from "./zip.js";
import { IndexBuilder } from "./index-build.js";
import { readingPath } from "./conversation.js";
import { isContentTerm } from "./tokenize.js";

const BATCH = 200;

export class IngestError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail || {};
  }
}

/**
 * @param {File|Blob} file
 * @param {{mapping?:object, entryName?:string, force?:string}} opts
 * @param {(event:object)=>void} emit
 */
export async function ingest(file, opts, emit) {
  if (!file || file.size === 0) throw new IngestError("empty-file", { name: file && file.name });

  let stream = null;
  let totalBytes = file.size;
  let sourceName = file.name || "export";
  let isHtml = false;

  if (await isZip(file)) {
    if (!canUnzip()) throw new IngestError("no-decompression", {});
    let entries;
    try {
      entries = await readZipDirectory(file);
    } catch (err) {
      throw new IngestError("bad-zip", { message: String(err && err.message) });
    }
    const ranked = rankZipEntries(entries);
    const wanted = opts.entryName ? entries.find((e) => e.name === opts.entryName) : ranked[0];
    if (!wanted) {
      throw new IngestError("zip-no-candidate", {
        count: entries.length,
        names: entries.map((e) => e.name).slice(0, 400),
      });
    }
    try {
      stream = await openZipEntry(file, wanted);
    } catch (err) {
      if (err instanceof UnsupportedZip) throw new IngestError("no-decompression", {});
      throw err;
    }
    totalBytes = wanted.uncompressedSize || file.size;
    sourceName = wanted.name;
    isHtml = /\.html?$/i.test(wanted.name);
    emit({ type: "entry", name: wanted.name, allNames: entries.map((e) => e.name) });
  } else {
    stream = file.stream();
    isHtml = /\.html?$/i.test(sourceName);
    if (!isHtml) {
      const head = await file.slice(0, 512).text();
      if (/^\s*<(!doctype|html)/i.test(head)) isHtml = true;
    }
  }

  const progress = (read, total) => emit({ type: "progress", read, total: total || totalBytes, name: sourceName });

  if (isHtml) {
    const text = await readAllText(stream, progress, totalBytes);
    const hint = detectHtml(text);
    if (!hint || hint.source !== "gemini") {
      throw new IngestError("unknown-format", { sample: null, paths: [] });
    }
    const records = adaptGeminiHtml(text);
    if (!records.length) throw new IngestError("unknown-format", { sample: null, paths: [] });
    // The HTML path has no streaming stage, so its cards arrive as one batch.
    emit({ type: "batch", count: records.length, slice: records.map(cardOf) });
    return finish(records, emit, sourceName, false);
  }

  const reader = new JsonArrayReader(stream, totalBytes);
  const records = [];
  const geminiTurns = [];
  let detected = opts.force || null;
  let firstRecord = null;
  let seen = 0;
  let skipped = 0;
  let emitted = 0;

  /* Cards are announced in batches so the drawer fills in visible rings rather
     than in one jump. The first three rings come early, so a small export still
     arrives in stages, and everything after that is a flat BATCH. */
  const nextThreshold = () => (emitted < 12 ? 12 : emitted < 40 ? 40 : emitted < 100 ? 100 : emitted + BATCH);
  const flush = () => {
    if (records.length <= emitted) return;
    const slice = records.slice(emitted).map(cardOf);
    emitted = records.length;
    emit({ type: "batch", count: emitted, slice });
  };

  for await (const raw of reader.items(progress)) {
    if (!raw) continue;
    seen++;
    if (firstRecord === null) firstRecord = raw;

    if (!detected) {
      const guess = detectRecord(raw);
      if (guess) {
        detected = guess.source;
        emit({ type: "detected", source: guess.source, reason: guess.reason, name: sourceName });
      } else if (opts.mapping) {
        detected = "custom";
      } else if (seen >= 3) {
        throw new IngestError("unknown-format", {
          sample: sampleOf(raw),
          paths: keyPaths(raw).slice(0, 220),
        });
      } else {
        continue;
      }
    }

    let rec = null;
    try {
      if (detected === "chatgpt") rec = adaptChatGPT(raw);
      else if (detected === "claude") rec = adaptClaude(raw);
      else if (detected === "gemini") {
        const turn = geminiTurn(raw);
        if (turn) geminiTurns.push(turn);
      } else if (detected === "custom" && opts.mapping) rec = adaptGeneric(raw, opts.mapping, seen - 1);
    } catch (err) {
      console.debug("chatvault: record skipped", err);
      skipped++;
    }
    if (rec) {
      records.push(rec);
      if (records.length >= nextThreshold()) flush();
    }
  }

  if (detected === "gemini" && geminiTurns.length) records.push(...groupGemini(geminiTurns));

  if (!detected) {
    throw new IngestError("unknown-format", {
      sample: firstRecord ? sampleOf(firstRecord) : null,
      paths: firstRecord ? keyPaths(firstRecord).slice(0, 220) : [],
    });
  }
  if (reader.truncated) {
    emit({
      type: "truncated",
      parsed: records.length,
      estimated: Math.round((records.length * totalBytes) / Math.max(1, reader.bytesRead)),
      bytes: reader.bytesRead,
      total: totalBytes,
    });
  }
  if (!records.length) {
    throw new IngestError("no-conversations", { seen, skipped, source: detected });
  }

  flush();
  return finish(records, emit, sourceName, reader.truncated);
}

/** The subset of a record the index list needs before the full record lands. */
export function cardOf(rec) {
  return {
    id: rec.id,
    source: rec.source,
    title: rec.title,
    createdAt: rec.createdAt,
    msgCount: rec.msgCount,
    hasCode: rec.hasCode,
  };
}

function sampleOf(raw) {
  try {
    const text = JSON.stringify(raw);
    return text.length > 6000 ? `${text.slice(0, 6000)}...` : text;
  } catch {
    return null;
  }
}

function finish(records, emit, sourceName, truncated) {
  emit({ type: "indexing", conversations: records.length });
  const builder = new IndexBuilder();
  const tabTerms = [];
  const seenTabTerms = new Set();
  // About twenty tabs whatever the size of the export, so a 47 conversation
  // sample and a 3,000 conversation vault both grow a full strip.
  const every = Math.max(1, Math.floor(records.length / 20));

  records.forEach((rec, i) => {
    const { path } = readingPath(rec);
    const onPath = new Set(path.map((k) => rec.nodes[k].id));
    onPath.add("#title");
    rec.pathIds = [...onPath].filter((x) => x !== "#title");
    builder.addConversation(rec, onPath);

    if (i % every === 0 || i === records.length - 1) {
      // pull one real term out of the index being built, so the tab strip in the
      // signature moment shows the user's own vocabulary rather than decoration
      const counts = builder.convTermCounts[i];
      let best = null;
      let bestN = 0;
      for (const [tid, n] of counts) {
        const word = builder.terms[tid];
        if (!isContentTerm(word) || seenTabTerms.has(word) || word.length > 14) continue;
        if (n > bestN) {
          bestN = n;
          best = word;
        }
      }
      if (best) {
        seenTabTerms.add(best);
        tabTerms.push(best);
      }
      emit({ type: "indexProgress", done: i + 1, total: records.length, term: best });
    }
  });

  const index = builder.seal();
  return { records, index, tabTerms, sourceName, truncated };
}
