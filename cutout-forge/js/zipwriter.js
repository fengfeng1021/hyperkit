/* ==========================================================================
   Store-only ZIP writer. No dependency, no bundler, about 120 lines.

   PNG and JPEG are already compressed, so deflating them again buys a couple
   of percent for a lot of main-thread time. Everything goes in stored, and
   the archive opens in Finder, Explorer, and every unzip tool.

   Entries are held as Blobs, which the browser keeps on disk rather than in
   the JS heap, so a 900 MB export does not sit in memory as byte arrays.
   ========================================================================== */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export class ZipWriter {
  constructor() {
    this.parts = [];
    this.entries = [];
    this.offset = 0;
    this.names = new Set();
  }

  get size() { return this.offset; }
  get count() { return this.entries.length; }

  /** Adds a directory entry so the folder shows up even before it has files. */
  addFolder(path) {
    const name = path.endsWith('/') ? path : path + '/';
    if (this.names.has(name)) return false;
    this._write(name, new Uint8Array(0), 0, 0, 0x10);
    return true;
  }

  /** Text entry, written synchronously. Used for _manifest.csv. */
  addText(path, text) {
    const bytes = new TextEncoder().encode(text);
    this._write(this._uniqueName(path), bytes, crc32(bytes), bytes.length, 0);
  }

  _uniqueName(path) {
    let name = path;
    let n = 1;
    while (this.names.has(name)) {
      const dot = path.lastIndexOf('.');
      name = dot > 0 ? `${path.slice(0, dot)}-${n}${path.slice(dot)}` : `${path}-${n}`;
      n++;
    }
    return name;
  }

  async add(path, blob) {
    let name = path;
    let n = 1;
    while (this.names.has(name)) {
      const dot = path.lastIndexOf('.');
      name = dot > 0 ? `${path.slice(0, dot)}-${n}${path.slice(dot)}` : `${path}-${n}`;
      n++;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    this._write(name, bytes, crc32(bytes), bytes.length, 0);
    return name;
  }

  _write(name, bytes, crc, size, externalAttrs) {
    const nameBytes = new TextEncoder().encode(name);
    const { time, date } = dosDateTime(new Date());

    const header = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);        // version needed
    dv.setUint16(6, 0x0800, true);    // UTF-8 names
    dv.setUint16(8, 0, true);         // stored
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    this.entries.push({ nameBytes, crc, size, time, date, offset: this.offset, externalAttrs });
    this.parts.push(header);
    if (size) this.parts.push(bytes);
    this.offset += header.length + size;
    this.names.add(name);
  }

  close() {
    const central = [];
    let centralSize = 0;

    for (const e of this.entries) {
      const rec = new Uint8Array(46 + e.nameBytes.length);
      const dv = new DataView(rec.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true);       // version made by
      dv.setUint16(6, 20, true);       // version needed
      dv.setUint16(8, 0x0800, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, e.time, true);
      dv.setUint16(14, e.date, true);
      dv.setUint32(16, e.crc, true);
      dv.setUint32(20, e.size, true);
      dv.setUint32(24, e.size, true);
      dv.setUint16(28, e.nameBytes.length, true);
      dv.setUint16(30, 0, true);
      dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true);
      dv.setUint16(36, 0, true);
      dv.setUint32(38, e.externalAttrs, true);
      dv.setUint32(42, e.offset, true);
      rec.set(e.nameBytes, 46);
      central.push(rec);
      centralSize += rec.length;
    }

    const end = new Uint8Array(22);
    const dv = new DataView(end.buffer);
    dv.setUint32(0, 0x06054b50, true);
    dv.setUint16(8, this.entries.length, true);
    dv.setUint16(10, this.entries.length, true);
    dv.setUint32(12, centralSize, true);
    dv.setUint32(16, this.offset, true);

    return new Blob([...this.parts, ...central, end], { type: 'application/zip' });
  }
}
