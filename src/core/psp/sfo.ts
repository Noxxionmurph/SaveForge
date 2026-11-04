// PARAM.SFO, the PSP's key/value file that goes with every save folder: reading its strings, and rewriting the hashes
// a real PSP checks after a save file changes. The hash update follows SED / psp-savedata-endecrypter
// (UpdateSavedataHashes): the file's own hash goes in its SAVEDATA_FILE_LIST entry, then SAVEDATA_PARAMS gets the
// hashes of the whole SFO.

import { savedataHash } from './savedata.ts';

interface Param { key: string; type: number; len: number; at: number }

function params(sfo: Uint8Array): Param[] | null {
  if (sfo.length < 20 || sfo[0] !== 0 || sfo[1] !== 0x50 || sfo[2] !== 0x53 || sfo[3] !== 0x46) return null;
  const v = new DataView(sfo.buffer, sfo.byteOffset, sfo.byteLength);
  const keys = v.getUint32(8, true), data = v.getUint32(12, true), count = v.getUint32(16, true);
  if (20 + count * 16 > sfo.length) return null;
  const out: Param[] = [];
  for (let i = 0; i < count; i++) {
    const e = 20 + i * 16;
    let key = '';
    for (let j = keys + v.getUint16(e, true); j < sfo.length && sfo[j]; j++) key += String.fromCharCode(sfo[j]);
    out.push({ key, type: v.getUint16(e + 2, true), len: v.getUint32(e + 4, true), at: data + v.getUint32(e + 12, true) });
  }
  return out;
}

/** A text value from PARAM.SFO (e.g. "SAVEDATA_DIRECTORY"), or null. */
export function sfoString(sfo: Uint8Array, key: string): string | null {
  const p = params(sfo)?.find((x) => x.key === key);
  if (!p || p.at + p.len > sfo.length) return null;
  let s = '';
  for (let i = p.at; i < p.at + p.len && sfo[i]; i++) s += String.fromCharCode(sfo[i]);
  return s;
}

/** The hash PARAM.SFO holds for save file `name` (16 bytes), or null. */
export function sfoFileHash(sfo: Uint8Array, name: string): Uint8Array | null {
  const at = fileEntry(sfo, name);
  return at < 0 ? null : sfo.slice(at + 0x0d, at + 0x1d);
}

/** SAVEDATA_FILE_LIST is a list of 0x20-byte entries: a 13-byte name, then the file's hash. */
function fileEntry(sfo: Uint8Array, name: string): number {
  const p = params(sfo)?.find((x) => x.key === 'SAVEDATA_FILE_LIST');
  if (!p) return -1;
  for (let at = p.at; at + 0x20 <= p.at + p.len && at + 0x20 <= sfo.length; at += 0x20) {
    let n = '';
    for (let i = at; i < at + 13 && sfo[i]; i++) n += String.fromCharCode(sfo[i]);
    if (n === name) return at;
  }
  return -1;
}

/** PARAM.SFO with the new hash for save file `name` and freshly computed SFO hashes. Returns null if it can't be done. */
export function updateSfoHashes(sfo: Uint8Array, name: string, fileHash: Uint8Array): Uint8Array | null {
  const out = sfo.slice();
  const entry = fileEntry(out, name);
  const p = params(out)?.find((x) => x.key === 'SAVEDATA_PARAMS');
  if (entry < 0 || !p || p.len < 0x80) return null;
  out.set(fileHash.subarray(0, 16), entry + 0x0d);
  const at = p.at;
  const mode = (out[at] >> 4) & 0xf, check = out[at] & 0xf;
  out.fill(0, at, at + 0x80);
  if (mode & 4) {
    out.set(savedataHash(out, 6), at + 0x20);
    out[at] |= 0x41;
    out.set(savedataHash(out, 5), at + 0x70);
  } else if (mode & 2) {
    out.set(savedataHash(out, 4), at + 0x20);
    out[at] |= 0x21;
    out.set(savedataHash(out, 3), at + 0x70);
  } else {
    out.set(savedataHash(out, 2), at + 0x20);
    out[at] |= 0x01;
  }
  if (check & 1) out.set(savedataHash(out, 1), at + 0x10);
  return out;
}
