/* Minimal ZIP reader.

   Reads the end-of-central-directory record from the tail of the file, walks
   the central directory, and decompresses individual members with the
   platform's DecompressionStream. Nothing is buffered except the central
   directory itself, so a 340 MB archive costs a few kilobytes to open.

   Only the two methods that real exports use are supported: stored (0) and
   deflate (8). Anything else is reported honestly rather than silently
   producing garbage. */

const EOCD_SIG = 0x06054b50;
const EOCD64_LOC_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CDH_SIG = 0x02014b50;

export class UnsupportedZip extends Error {}

export function canUnzip() {
  return typeof DecompressionStream !== "undefined";
}

async function slice(file, start, end) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

export async function readZipDirectory(file) {
  const tailLen = Math.min(file.size, 66560);
  const tail = await slice(file, file.size - tailLen, file.size);

  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new UnsupportedZip("no end of central directory");

  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);

  if (count === 0xffff || cdOffset === 0xffffffff) {
    let loc = -1;
    for (let i = eocd - 20; i >= 0; i--) {
      if (tail.getUint32(i, true) === EOCD64_LOC_SIG) {
        loc = i;
        break;
      }
    }
    if (loc < 0) throw new UnsupportedZip("zip64 locator missing");
    const eocd64Offset = Number(tail.getBigUint64(loc + 8, true));
    const z = await slice(file, eocd64Offset, eocd64Offset + 56);
    if (z.getUint32(0, true) !== EOCD64_SIG) throw new UnsupportedZip("zip64 record missing");
    count = Number(z.getBigUint64(32, true));
    cdSize = Number(z.getBigUint64(40, true));
    cdOffset = Number(z.getBigUint64(48, true));
  }

  const cd = await slice(file, cdOffset, cdOffset + cdSize);
  const decoder = new TextDecoder("utf-8");
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== CDH_SIG) break;
    const method = cd.getUint16(p + 10, true);
    let compressedSize = cd.getUint32(p + 20, true);
    let uncompressedSize = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localOffset = cd.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));

    if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      let q = p + 46 + nameLen;
      const extraEnd = q + extraLen;
      while (q + 4 <= extraEnd) {
        const id = cd.getUint16(q, true);
        const size = cd.getUint16(q + 2, true);
        if (id === 0x0001) {
          let r = q + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(cd.getBigUint64(r, true));
            r += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(cd.getBigUint64(r, true));
            r += 8;
          }
          if (localOffset === 0xffffffff) localOffset = Number(cd.getBigUint64(r, true));
          break;
        }
        q += 4 + size;
      }
    }

    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** A ReadableStream of the decompressed member bytes. */
export async function openZipEntry(file, entry) {
  const head = await slice(file, entry.localOffset, entry.localOffset + 30);
  if (head.getUint32(0, true) !== 0x04034b50) throw new UnsupportedZip("local header missing");
  const nameLen = head.getUint16(26, true);
  const extraLen = head.getUint16(28, true);
  const start = entry.localOffset + 30 + nameLen + extraLen;
  const blob = file.slice(start, start + entry.compressedSize);

  if (entry.method === 0) return blob.stream();
  if (entry.method === 8) {
    if (!canUnzip()) throw new UnsupportedZip("DecompressionStream unavailable");
    return blob.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  }
  throw new UnsupportedZip(`compression method ${entry.method}`);
}

export function looksLikeZip(file) {
  return /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
}

export async function isZip(file) {
  if (file.size < 4) return false;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5 || head[2] === 7);
}
