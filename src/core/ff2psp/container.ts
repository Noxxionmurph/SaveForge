// The ways a Final Fantasy II (PSP) save can arrive, and how each goes back (as for Final Fantasy I, see
// ../ff1psp/container.ts): a zip of the save folder (ULUS1026300/ with SAVEDATA.SAV and PARAM.SFO), SAVEDATA.SAV on its
// own, or the decrypted data.

import { decryptSavedata, encryptSavedata } from '../psp/savedata.ts';
import { sfoString, updateSfoHashes } from '../psp/sfo.ts';
import { readZip, type ZipEntry } from '../unzip.ts';
import { makeZipFiles } from '../zip.ts';

/** The game's savedata key (US, ULUS10263), from Apollo Save Tool's PSP/gamekeys.txt. */
const GAME_KEY = Uint8Array.from('4D4158484954504F494E540001000000'.match(/../g)!, (b) => parseInt(b, 16));
export const GAME_CODE = 'ULUS10263';
export const SAVE_NAME = 'SAVEDATA.SAV';

/** The decrypted save: a 0x30-byte header, then 20 files of 0xF40 bytes, then the Soul of Rebirth files and more. */
export const PLAIN_SIZE = 0x20000;
export const FILE_BASE = 0x30;
export const FILE_SIZE = 0xf40;
export const FILE_COUNT = 20;
export const SAVE_FILE_SIZE = PLAIN_SIZE + 16;
/** The text every file (and the header) starts with: "ファイナルファンタジーⅡsave" in Shift-JIS, then 00 01 00 03. */
export const MAGIC = Uint8Array.from([
  0x83, 0x74, 0x83, 0x40, 0x83, 0x43, 0x83, 0x69, 0x83, 0x8b, 0x83, 0x74, 0x83, 0x40, 0x83, 0x93,
  0x83, 0x5e, 0x83, 0x57, 0x81, 0x5b, 0x87, 0x55, 0x73, 0x61, 0x76, 0x65, 0x00, 0x01, 0x00, 0x03,
]);
export const hasMagic = (d: Uint8Array, at: number) => MAGIC.every((b, i) => d[at + i] === b);

export type Wrapper = 'folder' | 'savefile' | 'plain';
export interface Opened {
  plain: Uint8Array;
  wrapper: Wrapper;
  rebuild(plain: Uint8Array): Uint8Array;
}

export const plausiblePlain = (d: Uint8Array) => d.length === PLAIN_SIZE && hasMagic(d, 0);

function fromSaveFile(bin: Uint8Array): Uint8Array | null {
  if (bin.length !== SAVE_FILE_SIZE) return null;
  const plain = decryptSavedata(bin, GAME_KEY);
  return plausiblePlain(plain) ? plain : null;
}

const base = (name: string) => name.slice(name.lastIndexOf('/') + 1).toUpperCase();

/** Open any of the three forms, or null if it isn't this game's save. Never throws. */
export function openFf2Psp(data: Uint8Array): Opened | null {
  try {
    if (data.length === PLAIN_SIZE) return plausiblePlain(data) ? { plain: data.slice(), wrapper: 'plain', rebuild: (p) => p.slice() } : null;
    if (data.length === SAVE_FILE_SIZE) {
      const plain = fromSaveFile(data);
      const header = data.slice(0, 16);
      return plain && { plain, wrapper: 'savefile', rebuild: (p) => encryptSavedata(p, GAME_KEY, header).file };
    }
    const zip = readZip(data);
    return zip ? fromFolder(zip) : null;
  } catch {
    return null;
  }
}

function fromFolder(entries: ZipEntry[]): Opened | null {
  const bin = entries.find((e) => base(e.name) === SAVE_NAME);
  if (!bin) return null;
  const folder = bin.name.slice(0, bin.name.length - SAVE_NAME.length);
  const sfo = entries.find((e) => e.name.toUpperCase() === `${folder}PARAM.SFO`.toUpperCase());
  if (sfo && !(sfoString(sfo.data, 'SAVEDATA_DIRECTORY') ?? '').startsWith(GAME_CODE)) return null;
  const plain = fromSaveFile(bin.data);
  if (!plain) return null;
  const header = bin.data.slice(0, 16);
  return {
    plain,
    wrapper: 'folder',
    rebuild(p) {
      const { file, hash } = encryptSavedata(p, GAME_KEY, header);
      const newSfo = sfo && updateSfoHashes(sfo.data, base(bin.name), hash);
      return makeZipFiles(entries.map((e) => ({ name: e.name, data: e === bin ? file : e === sfo && newSfo ? newSfo : e.data })));
    },
  };
}
