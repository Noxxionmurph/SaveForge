// The ways a Final Fantasy III (PSP) save can arrive, and how each goes back (as for Final Fantasy I and II, see
// ../ff2psp/container.ts): a zip of the save folder (NPUH10125DATA02/ and so on, with PLAYDATA.BIN and PARAM.SFO), PLAYDATA.BIN
// on its own, or the decrypted data. The folder NPUH10125 on its own holds the game's settings, not a save.

import { decryptSavedata, encryptSavedata } from '../psp/savedata.ts';
import { sfoString, updateSfoHashes } from '../psp/sfo.ts';
import { readZip, type ZipEntry } from '../unzip.ts';
import { makeZipFiles } from '../zip.ts';

/** The game's savedata key (US, NPUH10125), from Apollo Save Tool's PSP/gamekeys.txt. */
const GAME_KEY = Uint8Array.from('BE041579E29FC790DF308ACE331AFF6B'.match(/../g)!, (b) => parseInt(b, 16));
export const GAME_CODE = 'NPUH10125';
export const SAVE_NAME = 'PLAYDATA.BIN';

/** The decrypted save: one game, its own length at 0x20 and "EUREKA data" at 0x28, as in a DS save slot. */
export const PLAIN_SIZE = 0x3b78;
export const SAVE_FILE_SIZE = PLAIN_SIZE + 16;
export const LENGTH = 0x20;
export const TAG = 0x28;
const TAG_TEXT = [...'EUREKA data\0'].map((c) => c.charCodeAt(0));

export type Wrapper = 'folder' | 'savefile' | 'plain';
export interface Opened {
  plain: Uint8Array;
  wrapper: Wrapper;
  rebuild(plain: Uint8Array): Uint8Array;
}

const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
export const plausiblePlain = (d: Uint8Array) =>
  d.length === PLAIN_SIZE && u32(d, LENGTH) === PLAIN_SIZE && TAG_TEXT.every((b, i) => d[TAG + i] === b);

function fromSaveFile(bin: Uint8Array): Uint8Array | null {
  if (bin.length !== SAVE_FILE_SIZE) return null;
  const plain = decryptSavedata(bin, GAME_KEY);
  return plausiblePlain(plain) ? plain : null;
}

const base = (name: string) => name.slice(name.lastIndexOf('/') + 1).toUpperCase();

/** Open any of the three forms, or null if it isn't this game's save. Never throws. */
export function openFf3Psp(data: Uint8Array): Opened | null {
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
