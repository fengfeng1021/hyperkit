/**
 * js/export/zip.js
 * A ZIP writer, written here rather than pulled from a CDN.
 *
 * Method 0 (STORE) only. PNG data is already deflated; running it through
 * deflate a second time buys nothing and costs a seller two minutes on a five
 * hundred file batch. Every entry gets a real CRC32, folder entries are
 * written explicitly so Windows Explorer and Finder both open the archive
 * without complaint, and offsets are checked against the end of central
 * directory before the Blob is handed back.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
}
function dosDate(d) {
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
}

class ByteWriter {
  constructor() { this.parts = []; this.length = 0; }
  push(u8) { this.parts.push(u8); this.length += u8.length; }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); this.push(b); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this.push(b); }
  bytes(u8) { this.push(u8); }
}

const utf8 = new TextEncoder();

export class ZipWriter {
  constructor(date = new Date()) {
    this.entries = [];
    this.date = date;
    this.dirs = new Set();
    this.bytes = 0;
  }

  /** `data` is a Uint8Array. Paths use forward slashes. */
  add(path, data) {
    const clean = String(path).replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = clean.split('/');
    let prefix = '';
    for (let i = 0; i < parts.length - 1; i++) {
      prefix += parts[i] + '/';
      this.dirs.add(prefix);
    }
    this.entries.push({ path: clean, data, dir: false });
    this.bytes += data.length;
    return this;
  }

  get fileCount() { return this.entries.length; }

  /** Assemble the archive. Throws rather than returning a broken Blob. */
  build() {
    const all = [];
    for (const d of [...this.dirs].sort()) all.push({ path: d, data: new Uint8Array(0), dir: true });
    for (const e of this.entries) all.push(e);

    const time = dosTime(this.date);
    const date = dosDate(this.date);

    const local = new ByteWriter();
    const central = new ByteWriter();
    let offset = 0;

    for (const entry of all) {
      const name = utf8.encode(entry.path);
      const sum = entry.dir ? 0 : crc32(entry.data);
      const size = entry.data.length;

      local.u32(0x04034b50);
      local.u16(20);
      local.u16(0x0800);        // UTF-8 names
      local.u16(0);             // STORE
      local.u16(time);
      local.u16(date);
      local.u32(sum);
      local.u32(size);
      local.u32(size);
      local.u16(name.length);
      local.u16(0);
      local.bytes(name);
      if (size) local.bytes(entry.data);

      central.u32(0x02014b50);
      central.u16(20);
      central.u16(20);
      central.u16(0x0800);
      central.u16(0);
      central.u16(time);
      central.u16(date);
      central.u32(sum);
      central.u32(size);
      central.u32(size);
      central.u16(name.length);
      central.u16(0);
      central.u16(0);
      central.u16(0);
      central.u16(0);
      central.u32(entry.dir ? 0x10 : 0);
      central.u32(offset);
      central.bytes(name);

      offset += 30 + name.length + size;
    }

    const centralSize = central.length;
    const centralOffset = offset;

    const end = new ByteWriter();
    end.u32(0x06054b50);
    end.u16(0);
    end.u16(0);
    end.u16(all.length);
    end.u16(all.length);
    end.u32(centralSize);
    end.u32(centralOffset);
    end.u16(0);

    if (centralOffset !== local.length) {
      throw new Error('zip offsets do not line up');
    }
    if (all.length > 0xffff) {
      throw new Error('too many entries for a plain ZIP');
    }
    if (centralOffset + centralSize > 0xffffffff) {
      throw new Error('archive is too large for a plain ZIP');
    }

    return new Blob([...local.parts, ...central.parts, ...end.parts], { type: 'application/zip' });
  }
}

/**
 * A one-file archive built and measured before the real export runs.
 * If the writer is broken this fails in milliseconds instead of after the
 * seller has waited two minutes for five hundred renders.
 */
export function selfTest() {
  const w = new ZipWriter(new Date(2026, 0, 1, 12, 0, 0));
  const payload = utf8.encode('mockup-loom zip self test');
  w.add('probe/readme.txt', payload);
  const blob = w.build();
  const expected = 30 + 'probe/'.length + 0
    + 30 + 'probe/readme.txt'.length + payload.length
    + 46 + 'probe/'.length
    + 46 + 'probe/readme.txt'.length
    + 22;
  if (blob.size !== expected) throw new Error('zip self test size mismatch');
  if (crc32(payload) === 0) throw new Error('crc32 is not running');
  return true;
}
