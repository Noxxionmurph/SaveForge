// Raw deflate (RFC 1951) compressor: one block with the fixed Huffman codes, LZ77 matches found through 3-byte hash
// chains. Not as tight as zlib's dynamic codes, but close on repetitive text such as JSON, and small. Every result is
// inflated again and compared, and stored blocks are used instead if that ever fails, so a compressor bug can never
// produce a broken file.

import { inflate } from './unzip.ts';

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

const WINDOW = 32768;
const MAX_MATCH = 258;
const CHAIN = 48;

class Bits {
  buf = new Uint8Array(1024);
  pos = 0;
  acc = 0;
  n = 0;
  /** `count` bits of `v`, least significant first (deflate's order for headers and extra bits). */
  put(v: number, count: number): void {
    this.acc |= v << this.n;
    this.n += count;
    while (this.n >= 8) {
      if (this.pos === this.buf.length) {
        const b = new Uint8Array(this.buf.length * 2);
        b.set(this.buf);
        this.buf = b;
      }
      this.buf[this.pos++] = this.acc & 0xff;
      this.acc >>>= 8;
      this.n -= 8;
    }
  }
  /** A Huffman code: its bits go most significant first. */
  code(c: number, len: number): void {
    let r = 0;
    for (let i = 0; i < len; i++) r |= ((c >> i) & 1) << (len - 1 - i);
    this.put(r, len);
  }
  done(): Uint8Array {
    if (this.n > 0) this.put(0, 8 - this.n);
    return this.buf.slice(0, this.pos);
  }
}

function literal(out: Bits, sym: number): void {
  if (sym < 144) out.code(0x30 + sym, 8);
  else if (sym < 256) out.code(0x190 + sym - 144, 9);
  else if (sym < 280) out.code(sym - 256, 7);
  else out.code(0xc0 + sym - 280, 8);
}

function match(out: Bits, len: number, dist: number): void {
  let l = LEN_BASE.length - 1;
  while (LEN_BASE[l] > len) l--;
  literal(out, 257 + l);
  if (LEN_EXTRA[l]) out.put(len - LEN_BASE[l], LEN_EXTRA[l]);
  let d = DIST_BASE.length - 1;
  while (DIST_BASE[d] > dist) d--;
  out.code(d, 5);
  if (DIST_EXTRA[d]) out.put(dist - DIST_BASE[d], DIST_EXTRA[d]);
}

function compress(data: Uint8Array): Uint8Array {
  const out = new Bits();
  out.put(1, 1); // last block
  out.put(1, 2); // fixed Huffman codes
  const head = new Int32Array(1 << 15).fill(-1);
  const prev = new Int32Array(WINDOW).fill(-1);
  const n = data.length;
  const hash = (i: number) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & 0x7fff;
  const insert = (i: number) => {
    if (i + 2 >= n) return;
    const h = hash(i);
    prev[i & (WINDOW - 1)] = head[h];
    head[h] = i;
  };
  let i = 0;
  while (i < n) {
    let bestLen = 0, bestDist = 0;
    if (i + 2 < n) {
      let j = head[hash(i)], chain = CHAIN;
      const limit = Math.min(MAX_MATCH, n - i);
      while (j >= 0 && i - j <= WINDOW && chain-- > 0) {
        if (data[j + bestLen] === data[i + bestLen]) {
          let l = 0;
          while (l < limit && data[j + l] === data[i + l]) l++;
          if (l > bestLen) { bestLen = l; bestDist = i - j; if (l === limit) break; }
        }
        const next = prev[j & (WINDOW - 1)];
        if (next >= j) break;
        j = next;
      }
    }
    if (bestLen >= 3) {
      match(out, bestLen, bestDist);
      for (let k = 0; k < bestLen; k++) insert(i + k);
      i += bestLen;
    } else {
      literal(out, data[i]);
      insert(i);
      i++;
    }
  }
  literal(out, 256);
  return out.done();
}

/** Raw deflate as stored (uncompressed) blocks: always valid deflate. */
export function storeDeflate(data: Uint8Array): Uint8Array {
  const n = Math.max(1, Math.ceil(data.length / 0xffff));
  const out = new Uint8Array(data.length + n * 5);
  let at = 0;
  for (let i = 0; i < n; i++) {
    const chunk = data.subarray(i * 0xffff, (i + 1) * 0xffff);
    out[at] = i === n - 1 ? 1 : 0;
    out[at + 1] = chunk.length & 0xff; out[at + 2] = chunk.length >> 8;
    out[at + 3] = ~chunk.length & 0xff; out[at + 4] = (~chunk.length >> 8) & 0xff;
    out.set(chunk, at + 5);
    at += 5 + chunk.length;
  }
  return out;
}

/** Raw deflate of `data`, checked by inflating it again. */
export function deflateRaw(data: Uint8Array): Uint8Array {
  try {
    const packed = compress(data);
    const back = inflate(packed, data.length);
    if (back.length === data.length && back.every((b, k) => b === data[k])) return packed;
  } catch {
    /* fall through to stored blocks */
  }
  return storeDeflate(data);
}
