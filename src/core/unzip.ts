// Read a ZIP archive in memory: the entry list, and each entry's bytes (stored or deflated). Synchronous, so a zipped
// save folder can be detected and opened like any other file. Deflate follows RFC 1951.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** The entries of a ZIP archive (directories left out), or null if `data` isn't one this can read. Never throws. */
export function readZip(data: Uint8Array): ZipEntry[] | null {
  try {
    return entries(data);
  } catch {
    return null;
  }
}

function entries(data: Uint8Array): ZipEntry[] | null {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 22 || v.getUint32(0, true) !== 0x04034b50) return null;
  // The end-of-central-directory record is the last thing in the file, before a comment of up to 64 KB.
  let eocd = -1;
  for (let o = data.length - 22; o >= Math.max(0, data.length - 22 - 0xffff); o--) {
    if (v.getUint32(o, true) === 0x06054b50) { eocd = o; break; }
  }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let at = v.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(at, true) !== 0x02014b50) return null;
    const method = v.getUint16(at + 10, true);
    const size = v.getUint32(at + 20, true);
    const rawSize = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const extraLen = v.getUint16(at + 30, true);
    const commentLen = v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(data.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (v.getUint32(local, true) !== 0x04034b50) return null;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const packed = data.subarray(start, start + size);
    if (method === 0) out.push({ name, data: packed.slice() });
    else if (method === 8) out.push({ name, data: inflate(packed, rawSize) });
    else return null;
  }
  return out;
}

// ---------- inflate ----------

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** A canonical Huffman code as (count per length, symbols in code order). */
interface Huffman { counts: Uint16Array; symbols: Uint16Array }

function huffman(lengths: ArrayLike<number>): Huffman {
  const counts = new Uint16Array(16);
  for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++;
  counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  const symbols = new Uint16Array(lengths.length);
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts, symbols };
}

/** Inflate raw deflate data. `size` is the expected output length. */
export function inflate(src: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let pos = 0, bitBuf = 0, bitCnt = 0, at = 0;
  const bits = (n: number) => {
    while (bitCnt < n) {
      if (at >= src.length) throw new Error('deflate data ends early');
      bitBuf |= src[at++] << bitCnt;
      bitCnt += 8;
    }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  };
  const decode = (h: Huffman) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = h.counts[len];
      if (code - count < first) return h.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('bad deflate code');
  };
  const fixedLit = huffman(Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)));
  const fixedDist = huffman(new Array(30).fill(5));
  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0;
      const len = src[at] | (src[at + 1] << 8);
      at += 4;
      out.set(src.subarray(at, at + len), pos);
      at += len;
      pos += len;
      continue;
    }
    let lit = fixedLit, dist = fixedDist;
    if (type === 2) {
      const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) cl[CL_ORDER[i]] = bits(3);
      const clh = huffman(cl);
      const lengths = new Uint8Array(nlen + ndist);
      for (let i = 0; i < nlen + ndist;) {
        const sym = decode(clh);
        if (sym < 16) lengths[i++] = sym;
        else {
          let rep = 0, val = 0;
          if (sym === 16) { val = lengths[i - 1]; rep = 3 + bits(2); }
          else if (sym === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          while (rep--) lengths[i++] = val;
        }
      }
      lit = huffman(lengths.subarray(0, nlen));
      dist = huffman(lengths.subarray(nlen));
    } else if (type !== 1) throw new Error('bad deflate block');
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) out[pos++] = sym;
      else if (sym === 256) break;
      else {
        const l = LEN_BASE[sym - 257] + bits(LEN_EXTRA[sym - 257]);
        const ds = decode(dist);
        const d = DIST_BASE[ds] + bits(DIST_EXTRA[ds]);
        for (let k = 0; k < l; k++, pos++) out[pos] = out[pos - d];
      }
    }
  }
  return out;
}
