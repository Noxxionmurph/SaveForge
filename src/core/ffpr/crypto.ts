// The Pixel Remaster (Steam) save wrapper: the file is Base64 text (sometimes after a UTF-8 BOM) of Rijndael with a
// 256-bit block and 256-bit key, CBC, zero padding, over raw-deflated UTF-8 JSON. Key and IV are fixed for every game:
// PBKDF2-SHA1 of the game's password and salt (10 rounds), bytes 0-31 and 32-63, worked out once and written here.
// Rijndael-256 is not AES (AES fixes the block at 128 bits), so WebCrypto can't do it; it is done here by hand.

import { deflateRaw } from '../deflate.ts';
import { inflate } from '../unzip.ts';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!, (h) => parseInt(h, 16));
const KEY = hex('61090700b9c3b8b9421599e79ca57b87bea932d3797bad7663ed4dde0a943cc5');
const IV = hex('0224f9771fdb6e0e3bd508d7b795bf2e0cbd176942680a637b12bc6273db2ebb');

const NB = 8; // block words (columns)
const NR = 14; // rounds for a 256-bit key or block
const BLOCK = 4 * NB;

// Standard 32-bit table implementation (each column a big-endian word, row 0 in the top byte). For a 256-bit block,
// ShiftRows moves rows 1, 2 and 3 by 1, 3 and 4 columns (Rijndael spec, Nb = 8), not AES's 1, 2 and 3.
const S = new Uint8Array(256);
const SI = new Uint8Array(256);
const TE = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
const TD = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
const xt = (a: number) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
function mul(a: number, b: number): number {
  let r = 0;
  while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; }
  return r;
}
const ror8 = (w: number) => ((w >>> 8) | (w << 24)) >>> 0;
(() => {
  const rotl = (x: number, n: number) => ((x << n) | (x >> (8 - n))) & 0xff;
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0); // p * 3
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09; // q / 3
    S[p] = (q ^ rotl(q, 1) ^ rotl(q, 2) ^ rotl(q, 3) ^ rotl(q, 4) ^ 0x63) & 0xff;
  } while (p !== 1);
  S[0] = 0x63;
  for (let i = 0; i < 256; i++) SI[S[i]] = i;
  for (let x = 0; x < 256; x++) {
    const s = S[x], si = SI[x];
    let e = ((mul(s, 2) << 24) | (s << 16) | (s << 8) | mul(s, 3)) >>> 0;
    let d = ((mul(si, 14) << 24) | (mul(si, 9) << 16) | (mul(si, 13) << 8) | mul(si, 11)) >>> 0;
    for (let t = 0; t < 4; t++) { TE[t][x] = e; TD[t][x] = d; e = ror8(e); d = ror8(d); }
  }
})();

/** Encryption round keys, (NR + 1) x NB words; and the decryption ones (InvMixColumns applied to the middle rounds). */
const [EK, DK] = (() => {
  const nk = KEY.length / 4, total = NB * (NR + 1);
  const w = new Uint32Array(total);
  for (let i = 0; i < nk; i++) w[i] = ((KEY[4 * i] << 24) | (KEY[4 * i + 1] << 16) | (KEY[4 * i + 2] << 8) | KEY[4 * i + 3]) >>> 0;
  let rcon = 1;
  const sub = (t: number) => ((S[t >>> 24] << 24) | (S[(t >>> 16) & 0xff] << 16) | (S[(t >>> 8) & 0xff] << 8) | S[t & 0xff]) >>> 0;
  for (let i = nk; i < total; i++) {
    let t = w[i - 1];
    if (i % nk === 0) {
      t = (sub(((t << 8) | (t >>> 24)) >>> 0) ^ (rcon << 24)) >>> 0;
      rcon = xt(rcon);
    } else if (nk > 6 && i % nk === 4) t = sub(t);
    w[i] = (w[i - nk] ^ t) >>> 0;
  }
  const d = w.slice();
  for (let i = NB; i < NR * NB; i++) {
    const k = w[i];
    d[i] = (TD[0][S[k >>> 24]] ^ TD[1][S[(k >>> 16) & 0xff]] ^ TD[2][S[(k >>> 8) & 0xff]] ^ TD[3][S[k & 0xff]]) >>> 0;
  }
  return [w, d];
})();

const st = new Uint32Array(NB), tmp = new Uint32Array(NB);

function load(src: Uint8Array, o: number): void {
  for (let c = 0; c < NB; c++, o += 4) st[c] = ((src[o] << 24) | (src[o + 1] << 16) | (src[o + 2] << 8) | src[o + 3]) >>> 0;
}
function store(dst: Uint8Array, o: number): void {
  for (let c = 0; c < NB; c++, o += 4) {
    const w = st[c];
    dst[o] = w >>> 24; dst[o + 1] = w >>> 16; dst[o + 2] = w >>> 8; dst[o + 3] = w;
  }
}

/** Encrypt the block in `st` in place. */
function encryptState(): void {
  for (let c = 0; c < NB; c++) st[c] ^= EK[c];
  for (let r = 1; r < NR; r++) {
    for (let c = 0; c < NB; c++) {
      tmp[c] = TE[0][st[c] >>> 24] ^ TE[1][(st[(c + 1) & 7] >>> 16) & 0xff] ^ TE[2][(st[(c + 3) & 7] >>> 8) & 0xff]
        ^ TE[3][st[(c + 4) & 7] & 0xff] ^ EK[r * NB + c];
    }
    st.set(tmp);
  }
  for (let c = 0; c < NB; c++) {
    tmp[c] = ((S[st[c] >>> 24] << 24) | (S[(st[(c + 1) & 7] >>> 16) & 0xff] << 16) | (S[(st[(c + 3) & 7] >>> 8) & 0xff] << 8)
      | S[st[(c + 4) & 7] & 0xff]) ^ EK[NR * NB + c];
  }
  st.set(tmp);
}

/** Decrypt the block in `st` in place (the equivalent inverse cipher). */
function decryptState(): void {
  for (let c = 0; c < NB; c++) st[c] ^= DK[NR * NB + c];
  for (let r = NR - 1; r > 0; r--) {
    for (let c = 0; c < NB; c++) {
      tmp[c] = TD[0][st[c] >>> 24] ^ TD[1][(st[(c + 7) & 7] >>> 16) & 0xff] ^ TD[2][(st[(c + 5) & 7] >>> 8) & 0xff]
        ^ TD[3][st[(c + 4) & 7] & 0xff] ^ DK[r * NB + c];
    }
    st.set(tmp);
  }
  for (let c = 0; c < NB; c++) {
    tmp[c] = ((SI[st[c] >>> 24] << 24) | (SI[(st[(c + 7) & 7] >>> 16) & 0xff] << 16) | (SI[(st[(c + 5) & 7] >>> 8) & 0xff] << 8)
      | SI[st[(c + 4) & 7] & 0xff]) ^ DK[c];
  }
  st.set(tmp);
}

export function encryptBlock(block: Uint8Array): Uint8Array {
  const out = new Uint8Array(BLOCK);
  load(block, 0); encryptState(); store(out, 0);
  return out;
}

export function decryptBlock(block: Uint8Array): Uint8Array {
  const out = new Uint8Array(BLOCK);
  load(block, 0); decryptState(); store(out, 0);
  return out;
}

function cbcDecrypt(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let o = 0; o + BLOCK <= data.length; o += BLOCK) {
    load(data, o);
    decryptState();
    store(out, o);
    const prev = o === 0 ? IV : data.subarray(o - BLOCK, o);
    for (let i = 0; i < BLOCK; i++) out[o + i] ^= prev[i];
  }
  return out;
}

function cbcEncrypt(data: Uint8Array): Uint8Array {
  // Zero padding up to whole blocks (at least one), as the game's cipher pads.
  const out = new Uint8Array(Math.max(BLOCK, Math.ceil(data.length / BLOCK) * BLOCK));
  out.set(data);
  for (let o = 0; o < out.length; o += BLOCK) {
    const prev = o === 0 ? IV : out.subarray(o - BLOCK, o);
    for (let i = 0; i < BLOCK; i++) out[o + i] ^= prev[i];
    load(out, o);
    encryptState();
    store(out, o);
  }
  return out;
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Base64 bytes of a Pixel Remaster save (BOM and trailing whitespace allowed), or null if it isn't that shape. */
export function base64Body(file: Uint8Array): { bom: boolean; body: Uint8Array } | null {
  const bom = file.length >= 3 && file[0] === 0xef && file[1] === 0xbb && file[2] === 0xbf;
  let end = file.length;
  while (end > 0 && (file[end - 1] === 0x0a || file[end - 1] === 0x0d || file[end - 1] === 0x20)) end--;
  const body = file.subarray(bom ? 3 : 0, end);
  if (body.length < 64) return null;
  for (let i = 0; i < Math.min(body.length, 256); i++) {
    const c = body[i];
    if (!((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2f)) return null;
  }
  return { bom, body };
}

function fromBase64(text: string): Uint8Array {
  let t = text;
  while (t.length % 4) t += '=';
  if (!B64.test(t)) throw new Error('not Base64');
  const bin = atob(t);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function toBase64(data: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The JSON text inside a Pixel Remaster save file. Throws if it doesn't decrypt and inflate. */
export function openPrFile(file: Uint8Array): { json: string; bom: boolean } {
  const b = base64Body(file);
  if (!b) throw new Error('not a Pixel Remaster save');
  const sealed = fromBase64(new TextDecoder('latin1').decode(b.body));
  if (sealed.length % BLOCK) throw new Error('not whole cipher blocks');
  const packed = cbcDecrypt(sealed);
  const json = new TextDecoder('utf-8', { fatal: true }).decode(inflate(packed));
  return { json, bom: b.bom };
}

/** A Pixel Remaster save file holding `json`, in the same wrapper the game writes. */
export function sealPrFile(json: string, bom: boolean): Uint8Array {
  const text = toBase64(cbcEncrypt(deflateRaw(new TextEncoder().encode(json))));
  const body = new TextEncoder().encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}
