// Minimal ZIP writer (store method, no compression). Used where the host only lets pages save allow-listed file
// types, so a ".sav" travels inside a ".zip", and for save folders (PSP) that go back as a zip of the folder.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build a ZIP archive containing one stored file. */
export function makeZip(fileName: string, data: Uint8Array): Uint8Array {
  return makeZipFiles([{ name: fileName, data }]);
}

/** Build a ZIP archive of stored (uncompressed) files, in the order given. Names may include folders ("DIR/FILE"). */
export function makeZipFiles(files: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  // DOS date/time: 2020-01-01 00:00:00 (fixed, so output is deterministic).
  const dosTime = 0, dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const { data } = file;
    const crc = crc32(data);
    const size = data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);          // version needed
    local.setUint16(6, 0x0800, true);      // flags: UTF-8 names
    local.setUint16(8, 0, true);           // method: stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);       // compressed size
    local.setUint32(22, size, true);       // uncompressed size
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);          // extra length

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);        // version made by
    central.setUint16(6, 20, true);        // version needed
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);   // local header offset

    parts.push(new Uint8Array(local.buffer), name, data);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + size;
  }
  const centralLen = centrals.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);    // entries on this disk
  end.setUint16(10, files.length, true);   // total entries
  end.setUint32(12, centralLen, true);
  end.setUint32(16, offset, true);         // central directory offset

  const out = new Uint8Array(offset + centralLen + 22);
  let o = 0;
  for (const part of [...parts, ...centrals, new Uint8Array(end.buffer)]) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
