// The three ways a Final Fantasy (PSP) save can arrive, and how each goes back:
// - a zip of the save folder (ULUS10251DATA00/ with SAVE.BIN, PARAM.SFO and icons): SAVE.BIN is decrypted, and the
//   edited file is encrypted again with the folder's PARAM.SFO hashes updated, so a real PSP accepts it;
// - SAVE.BIN on its own: decrypted and encrypted again (fine for PPSSPP, which doesn't check PARAM.SFO);
// - the decrypted data (from a save tool or PPSSPP's debugger): written back as it came.

import { decryptSavedata, encryptSavedata } from '../psp/savedata.ts';
import { sfoString, updateSfoHashes } from '../psp/sfo.ts';
import { readZip, type ZipEntry } from '../unzip.ts';
import { makeZipFiles } from '../zip.ts';

/** The game's savedata key (US, ULUS10251), from Apollo Save Tool's PSP/gamekeys.txt. */
const GAME_KEY = Uint8Array.from('437BEAA762302FB7C8762C17CFF01460'.match(/../g)!, (b) => parseInt(b, 16));
export const GAME_CODE = 'ULUS10251';

/** The decrypted save: a 4-byte header, then 20 files of 0x10A4 bytes. */
export const SLOT_SIZE = 0x10a4;
export const SLOT_COUNT = 20;
export const PLAIN_SIZE = 4 + SLOT_COUNT * SLOT_SIZE;
export const SAVE_BIN_SIZE = PLAIN_SIZE + 16;

export type Wrapper = 'folder' | 'savebin' | 'plain';

export interface Opened {
  plain: Uint8Array;
  wrapper: Wrapper;
  /** The file as it should be saved, for edited decrypted data. */
  rebuild(plain: Uint8Array): Uint8Array;
}

/** Is this decrypted data shaped like this game's save? Checks every file in use. */
export function plausiblePlain(d: Uint8Array): boolean {
  if (d.length !== PLAIN_SIZE) return false;
  let used = 0;
  for (let n = 0; n < SLOT_COUNT; n++) {
    const s = 4 + n * SLOT_SIZE;
    if (d[s + 1] === 0) {
      if (d.subarray(s, s + 0x400).some((b) => b !== 0)) return false;
      continue;
    }
    if (d[s + 1] !== 1) return false;
    used++;
    for (let i = 0; i < 4; i++) {
      const r = s + 0x24 + i * 0x5c;
      const level = d[r] | (d[r + 1] << 8) | (d[r + 2] << 16) | (d[r + 3] << 24);
      if (level < 1 || level > 99 || d[r - 2] > 11) return false;
    }
  }
  return used > 0;
}

function fromSaveBin(bin: Uint8Array): Uint8Array | null {
  if (bin.length !== SAVE_BIN_SIZE) return null;
  const plain = decryptSavedata(bin, GAME_KEY);
  return plausiblePlain(plain) ? plain : null;
}

const base = (name: string) => name.slice(name.lastIndexOf('/') + 1).toUpperCase();

/** Open any of the three forms, or null if it isn't this game's save. Never throws. */
export function openFf1Psp(data: Uint8Array): Opened | null {
  try {
    if (data.length === PLAIN_SIZE) {
      return plausiblePlain(data) ? { plain: data.slice(), wrapper: 'plain', rebuild: (p) => p.slice() } : null;
    }
    if (data.length === SAVE_BIN_SIZE) {
      const plain = fromSaveBin(data);
      const header = data.slice(0, 16);
      return plain && { plain, wrapper: 'savebin', rebuild: (p) => encryptSavedata(p, GAME_KEY, header).file };
    }
    const zip = readZip(data);
    return zip ? fromFolder(zip) : null;
  } catch {
    return null;
  }
}

function fromFolder(entries: ZipEntry[]): Opened | null {
  const bin = entries.find((e) => base(e.name) === 'SAVE.BIN');
  if (!bin) return null;
  const folder = bin.name.slice(0, bin.name.length - 'SAVE.BIN'.length);
  const sfo = entries.find((e) => e.name.toUpperCase() === `${folder}PARAM.SFO`.toUpperCase());
  if (sfo && !(sfoString(sfo.data, 'SAVEDATA_DIRECTORY') ?? '').startsWith(GAME_CODE)) return null;
  const plain = fromSaveBin(bin.data);
  if (!plain) return null;
  const header = bin.data.slice(0, 16);
  return {
    plain,
    wrapper: 'folder',
    rebuild(p) {
      const { file, hash } = encryptSavedata(p, GAME_KEY, header);
      const newSfo = sfo && updateSfoHashes(sfo.data, base(bin.name), hash);
      return makeZipFiles(entries.map((e) => ({
        name: e.name,
        data: e === bin ? file : e === sfo && newSfo ? newSfo : e.data,
      })));
    },
  };
}
