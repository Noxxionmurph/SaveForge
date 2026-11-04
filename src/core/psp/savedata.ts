// PSP savedata encryption (the firmware's chnnlsv module), so a game's encrypted save file can be opened and written back
// in the browser. Behaviour follows the documented reverse engineering of the PSP's savedata crypto (jpcsp's CryptoEngine,
// cielavenir's psp-savedata-endecrypter): a file is a 16-byte header followed by the data XORed with a keystream made by
// AES-decrypting a numbered list of blocks, and the hashes in PARAM.SFO are an AES-CBC MAC over the file.
//
// Everything is built from KIRK commands 4 and 7: AES-128-CBC with a zero IV and a key chosen by seed (keys.ts). Only the
// modes games use after firmware 2.5 are here: 5 with a game key, 1 without.

import { cbcDecrypt, cbcEncrypt } from './aes.ts';
import { KIRK_KEYS, SD_HASH_KEYS } from './keys.ts';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!, (b) => parseInt(b, 16));
const kirkKey = new Map<number, Uint8Array>(Object.entries(KIRK_KEYS).map(([k, v]) => [Number(k), hex(v)]));
const HK = SD_HASH_KEYS.map(hex);
const keyFor = (seed: number) => { const k = kirkKey.get(seed); if (!k) throw new Error(`no KIRK key for seed ${seed}`); return k; };
const xor = (dst: Uint8Array, src: Uint8Array, n = 16, at = 0) => { for (let i = 0; i < n; i++) dst[at + i] ^= src[i]; };
const isNull = (key: Uint8Array | null) => !key || key.every((b) => b === 0);
const le32 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >>> 8) & 0xff; d[o + 2] = (v >>> 16) & 0xff; d[o + 3] = (v >>> 24) & 0xff; };

/** The KIRK seed a hashing mode uses. */
const MODE_SEED: Record<number, number> = { 1: 0x03, 2: 0x05, 3: 0x0c, 4: 0x0d, 6: 0x11 };
const modeSeed = (mode: number) => MODE_SEED[mode] ?? 0x10;

// ---------- the keystream ("member" context) ----------

interface Stream { mode: number; counter: number; iv: Uint8Array }

/** XOR `data[off..off+len)` with the next stretch of keystream (len <= 0x800, a multiple of 16). */
function cryptMember(ctx: Stream, data: Uint8Array, off: number, len: number): void {
  // The 16-byte seed for this file, unwrapped with the mode's KIRK key.
  const seed = ctx.iv.slice();
  let finalSeed: number;
  if (ctx.mode === 1) {
    cbcDecrypt(keyFor(0x04), seed);
    finalSeed = 0x53;
  } else if (ctx.mode === 5) {
    xor(seed, HK[6]);
    cbcDecrypt(keyFor(0x12), seed);
    xor(seed, HK[5]);
    finalSeed = 0x64;
  } else {
    throw new Error(`unsupported savedata mode ${ctx.mode}`);
  }
  // The block before this stretch (the previous counter value), which the first block of CBC output is XORed with.
  const before = new Uint8Array(16);
  if (ctx.counter !== 1) { before.set(seed.subarray(0, 12)); le32(before, 12, ctx.counter - 1); }
  // A list of blocks: the first 12 bytes of the seed and a little-endian counter, decrypted to make the keystream.
  const list = new Uint8Array(len);
  for (let i = 0; i < len; i += 16) {
    list.set(seed.subarray(0, 12), i);
    le32(list, i + 12, ctx.counter++);
  }
  cbcDecrypt(keyFor(finalSeed), list);
  xor(list, before);
  for (let i = 0; i < len; i++) data[off + i] ^= list[i];
}

function setMember(ctx: Stream, data: Uint8Array): void {
  let at = 0;
  for (; data.length - at >= 0x800; at += 0x800) cryptMember(ctx, data, at, 0x800);
  cryptMember(ctx, data, at, data.length - at);
}

function streamFor(mode: number, header: Uint8Array, key: Uint8Array | null): Stream {
  const iv = header.slice(0, 16);
  if (!isNull(key)) xor(iv, key!);
  return { mode, counter: 1, iv };
}

// ---------- the MAC ("index" context) ----------

/** An AES-CBC MAC with the mode's KIRK key, fed in pieces; the last (partial or whole) block is held back. */
class Mac {
  private readonly mode: number;
  private readonly key = new Uint8Array(16);
  private readonly pad = new Uint8Array(16);
  private padSize = 0;
  constructor(mode: number) { this.mode = mode; }

  update(data: Uint8Array): void {
    let length = data.length;
    if (this.padSize + length <= 16) { this.pad.set(data, this.padSize); this.padSize += length; return; }
    const kirk = keyFor(modeSeed(this.mode));
    let kLen = this.padSize;
    const carried = this.pad.slice(0, kLen);
    this.padSize = (this.padSize + length) & 0x0f || 0x10;
    length -= this.padSize;
    this.pad.set(data.subarray(length, length + this.padSize));
    let off = 0;
    while (length > 0) {
      const block = Math.min(0x800, length + kLen);
      const buf = new Uint8Array(block);
      buf.set(carried.subarray(0, kLen));
      buf.set(data.subarray(off, off + block - kLen), kLen);
      xor(buf, this.key);
      cbcEncrypt(kirk, buf);
      this.key.set(buf.subarray(block - 16, block));
      length -= block - kLen;
      off += block - kLen;
      kLen = 0;
    }
  }

  /** The finished MAC, optionally bound to a game key. */
  digest(gameKey: Uint8Array | null): Uint8Array {
    const seed = modeSeed(this.mode);
    const kirk = keyFor(seed);
    // CMAC-style subkey: AES of zero, doubled in GF(2^128) (twice when the last block is partial, and then padded).
    const sub = new Uint8Array(16);
    cbcEncrypt(kirk, sub);
    const double = () => {
      const carry = sub[0] & 0x80 ? 0x87 : 0;
      for (let i = 0; i < 15; i++) sub[i] = ((sub[i] << 1) | (sub[i + 1] >> 7)) & 0xff;
      sub[15] = ((sub[15] << 1) ^ carry) & 0xff;
    };
    double();
    const last = this.pad.slice();
    if (this.padSize < 16) {
      double();
      last[this.padSize] = 0x80;
      last.fill(0, this.padSize + 1);
    }
    xor(last, sub);
    xor(last, this.key);
    cbcEncrypt(kirk, last);
    const result = last;
    if (this.mode === 5 || this.mode === 6) xor(result, HK[4]);
    else if (this.mode === 3 || this.mode === 4) xor(result, HK[1]);
    if (this.mode === 2 || this.mode === 4 || this.mode === 6) {
      // The firmware runs this through KIRK command 5, which uses a key unique to each console. The PC tools can't, so
      // the buffer is left as it was: what gets encrypted is the command's own header (mode 4, seed 0x100). The PSP
      // accepts saves hashed this way (SED and psp-savedata-endecrypter have written them for years).
      const header = new Uint8Array(16);
      le32(header, 0, 4);
      le32(header, 12, 0x100);
      cbcEncrypt(kirk, header);
      result.set(header);
    }
    if (gameKey) {
      xor(result, gameKey);
      cbcEncrypt(kirk, result);
    }
    return result;
  }
}

// ---------- files ----------

const aligned = (n: number) => (n + 15) & ~15;

/** Decrypt a savedata file (header + data) with the game's key (or null for mode 1). */
export function decryptSavedata(file: Uint8Array, gameKey: Uint8Array | null): Uint8Array {
  if (file.length < 16) throw new Error('This file is too short to be PSP savedata.');
  const mode = isNull(gameKey) ? 1 : 5;
  const body = new Uint8Array(aligned(file.length - 16));
  body.set(file.subarray(16));
  setMember(streamFor(mode, file, gameKey), body);
  return body.slice(0, file.length - 16);
}

/**
 * Encrypt `plain` into a savedata file. `header` is the file's 16-byte header: reuse the original file's to keep its
 * keystream (a real PSP makes a random one each save). Returns the file and the hash that goes in PARAM.SFO's
 * SAVEDATA_FILE_LIST entry for it.
 */
export function encryptSavedata(plain: Uint8Array, gameKey: Uint8Array | null, header: Uint8Array): { file: Uint8Array; hash: Uint8Array } {
  const mode = isNull(gameKey) ? 1 : 5;
  const body = new Uint8Array(aligned(plain.length));
  body.set(plain);
  const mac = new Mac(mode);
  mac.update(header.slice(0, 16));
  setMember(streamFor(mode, header, gameKey), body);
  body.fill(0, plain.length);
  mac.update(body);
  const file = new Uint8Array(16 + plain.length);
  file.set(header.subarray(0, 16));
  file.set(body.subarray(0, plain.length), 16);
  // The firmware binds the file hash to the key even when it is all zeros (mode 1).
  return { file, hash: mac.digest(gameKey ?? new Uint8Array(16)) };
}

/** A MAC of `data` in a hashing mode (PARAM.SFO's hashes). */
export function savedataHash(data: Uint8Array, mode: number): Uint8Array {
  const mac = new Mac(mode);
  mac.update(data);
  return mac.digest(null);
}
