/* Chunked streaming splitter for a top-level JSON array.

   The whole file is never handed to JSON.parse. The splitter tracks string and
   escape state so that braces inside string literals cannot confuse it, and it
   parses one array element at a time. Peak memory is one element plus the
   current chunk, not the file.

   Byte progress is counted upstream of the text decoder, so the number on
   screen is bytes of the actual file rather than a guess.

   A file whose top level is an object rather than an array is buffered and
   parsed once at the end. Those are the generic-fallback shapes and they are
   small in practice; the multi-hundred-megabyte exports are all arrays. */

const CH = { quote: 34, backslash: 92, lbrace: 123, rbrace: 125, lbracket: 91, rbracket: 93 };

export class JsonArrayReader {
  constructor(stream, totalBytes) {
    this.stream = stream;
    this.totalBytes = totalBytes || 0;
    this.bytesRead = 0;
    this.truncated = false;
    this.topLevelIsArray = null;
    this.itemsSeen = 0;
  }

  /**
   * @param {(bytesRead:number,total:number)=>void} [onProgress]
   * @returns {AsyncGenerator<any>}
   */
  async *items(onProgress) {
    const self = this;
    let counted = this.stream;
    if (typeof TransformStream !== "undefined") {
      counted = this.stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            self.bytesRead += chunk.byteLength || chunk.length || 0;
            if (onProgress) onProgress(self.bytesRead, self.totalBytes);
            controller.enqueue(chunk);
          },
        })
      );
    }
    const reader = counted.pipeThrough(new TextDecoderStream()).getReader();

    let buf = "";
    let scan = 0; // next index in buf to examine
    let depth = 0;
    let start = -1;
    let inStr = false;
    let esc = false;
    let started = false;
    let objectBuffer = null;

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      if (objectBuffer !== null) {
        objectBuffer.push(value);
        continue;
      }

      buf += value;
      for (let i = scan; i < buf.length; i++) {
        const ch = buf.charCodeAt(i);
        if (inStr) {
          if (esc) esc = false;
          else if (ch === CH.backslash) esc = true;
          else if (ch === CH.quote) inStr = false;
          continue;
        }
        if (ch === CH.quote) {
          inStr = true;
          continue;
        }
        if (!started) {
          if (ch === CH.lbracket) {
            started = true;
            this.topLevelIsArray = true;
            depth = 1;
          } else if (ch === CH.lbrace) {
            this.topLevelIsArray = false;
            objectBuffer = [buf.slice(i)];
            break;
          }
          continue;
        }
        if (ch === CH.lbrace || ch === CH.lbracket) {
          if (depth === 1 && start < 0) start = i;
          depth++;
        } else if (ch === CH.rbrace || ch === CH.rbracket) {
          depth--;
          if (depth === 1 && start >= 0) {
            const el = safeParse(buf.slice(start, i + 1));
            start = -1;
            if (el !== undefined) {
              this.itemsSeen++;
              yield el;
            }
          }
        }
      }
      if (objectBuffer !== null) continue;

      scan = buf.length;
      const keepFrom = start >= 0 ? start : scan;
      if (keepFrom > 0) {
        buf = buf.slice(keepFrom);
        scan -= keepFrom;
        if (start >= 0) start = 0;
      }
      // guard against a single element larger than a reasonable record
      if (buf.length > 64 * 1024 * 1024) {
        this.truncated = true;
        break;
      }
    }

    if (objectBuffer !== null) {
      const whole = safeParse(objectBuffer.join(""));
      if (whole && typeof whole === "object") {
        const arr = firstArrayOfObjects(whole);
        if (arr) {
          for (const el of arr) {
            this.itemsSeen++;
            yield el;
          }
        } else {
          this.itemsSeen++;
          yield whole;
        }
      } else {
        this.truncated = true;
      }
      return;
    }

    if (depth > 0 || inStr) this.truncated = true;
  }
}

/** Find the most plausible array of records inside a top-level object. */
export function firstArrayOfObjects(obj) {
  let best = null;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0] !== null) {
      if (!best || v.length > best.length) best = v;
    }
  }
  return best;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    console.debug("chatvault: element skipped", err);
    return undefined;
  }
}

/** Read an entire stream as text. Used for HTML exports and small files. */
export async function readAllText(stream, onProgress, total) {
  const reader = stream.getReader();
  const parts = [];
  let bytes = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength || value.length || 0;
    parts.push(decoder.decode(value, { stream: true }));
    if (onProgress) onProgress(bytes, total || 0);
  }
  parts.push(decoder.decode());
  return parts.join("");
}
