// AES-128 on single 16-byte blocks, plus CBC with a zero IV (all that PSP savedata needs). Plain table-free code: it runs
// synchronously in the browser and in Node, where WebCrypto would force everything async and add PKCS#7 padding.

const SBOX = new Uint8Array(256);
const INV = new Uint8Array(256);
{
  // Build the S-box from the multiplicative inverse in GF(2^8) and the affine map.
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
}
const xt = (b: number) => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (a: number, b: number) => { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; };

/** The 11 round keys (176 bytes) for a 16-byte key. */
export function expandKey(key: Uint8Array): Uint8Array {
  const w = new Uint8Array(176);
  w.set(key);
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
    if (i % 16 === 0) {
      [t0, t1, t2, t3] = [SBOX[t1] ^ rcon, SBOX[t2], SBOX[t3], SBOX[t0]];
      rcon = xt(rcon);
    }
    w[i] = w[i - 16] ^ t0; w[i + 1] = w[i - 15] ^ t1; w[i + 2] = w[i - 14] ^ t2; w[i + 3] = w[i - 13] ^ t3;
  }
  return w;
}

function encryptBlock(rk: Uint8Array, s: Uint8Array): void {
  for (let i = 0; i < 16; i++) s[i] ^= rk[i];
  for (let round = 1; round <= 10; round++) {
    const t = new Uint8Array(16);
    // SubBytes + ShiftRows (state is column-major: byte r + 4c).
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) t[r + 4 * c] = SBOX[s[r + 4 * ((c + r) & 3)]];
    if (round < 10) {
      for (let c = 0; c < 4; c++) {
        const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3];
        s[4 * c] = xt(a0) ^ xt(a1) ^ a1 ^ a2 ^ a3;
        s[4 * c + 1] = a0 ^ xt(a1) ^ xt(a2) ^ a2 ^ a3;
        s[4 * c + 2] = a0 ^ a1 ^ xt(a2) ^ xt(a3) ^ a3;
        s[4 * c + 3] = xt(a0) ^ a0 ^ a1 ^ a2 ^ xt(a3);
      }
    } else s.set(t);
    for (let i = 0; i < 16; i++) s[i] ^= rk[round * 16 + i];
  }
}

function decryptBlock(rk: Uint8Array, s: Uint8Array): void {
  for (let i = 0; i < 16; i++) s[i] ^= rk[160 + i];
  for (let round = 9; round >= 0; round--) {
    const t = new Uint8Array(16);
    // InvShiftRows + InvSubBytes.
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) t[r + 4 * ((c + r) & 3)] = INV[s[r + 4 * c]];
    for (let i = 0; i < 16; i++) t[i] ^= rk[round * 16 + i];
    if (round > 0) {
      for (let c = 0; c < 4; c++) {
        const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3];
        s[4 * c] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
        s[4 * c + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
        s[4 * c + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
        s[4 * c + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
      }
    } else s.set(t);
  }
}

/** AES-128-CBC encrypt with a zero IV, in place. Length must be a multiple of 16. */
export function cbcEncrypt(key: Uint8Array, data: Uint8Array): void {
  const rk = expandKey(key);
  const prev = new Uint8Array(16);
  for (let o = 0; o < data.length; o += 16) {
    const b = data.subarray(o, o + 16);
    for (let i = 0; i < 16; i++) b[i] ^= prev[i];
    encryptBlock(rk, b);
    prev.set(b);
  }
}

/** AES-128-CBC decrypt with a zero IV, in place. Length must be a multiple of 16. */
export function cbcDecrypt(key: Uint8Array, data: Uint8Array): void {
  const rk = expandKey(key);
  let prev = new Uint8Array(16);
  for (let o = 0; o < data.length; o += 16) {
    const b = data.subarray(o, o + 16);
    const c = b.slice();
    decryptBlock(rk, b);
    for (let i = 0; i < 16; i++) b[i] ^= prev[i];
    prev = c;
  }
}
