// A made-up Final Fantasy III (PSP) save folder, built in code, for tests and the browser checks: a zip of
// NPUH10125DATA00/ with an encrypted PLAYDATA.BIN and a PARAM.SFO whose hashes match it. Nothing here comes from a real
// game file. It holds the DS sample's game (../ff3ds/sample.ts) in the PSP's places, and like that one it fills in only
// what the editor reads.

import { writeSampleGame } from '../ff3ds/sample.ts';
import { le } from '../bytes.ts';
import { buildSfo } from '../ff1psp/sample.ts';
import { encryptSavedata } from '../psp/savedata.ts';
import { updateSfoHashes } from '../psp/sfo.ts';
import { makeZipFiles } from '../zip.ts';
import { GAME_CODE, LENGTH, PLAIN_SIZE, SAVE_NAME, TAG } from './container.ts';
import { PSP_LAYOUT } from './save.ts';

const KEY = Uint8Array.from('BE041579E29FC790DF308ACE331AFF6B'.match(/../g)!, (b) => parseInt(b, 16));
export const SAMPLE_FOLDER = `${GAME_CODE}DATA00`;

/** The decrypted sample. */
export function buildFf3PspPlain(): Uint8Array {
  const d = new Uint8Array(PLAIN_SIZE);
  le.setU32(d, LENGTH, PLAIN_SIZE);
  d.set(new TextEncoder().encode('EUREKA data'), TAG);
  writeSampleGame(d, 0, PSP_LAYOUT);
  return d;
}

/** The sample as a zip of the save folder, ready to open. */
export function buildFf3PspSample(): Uint8Array {
  const header = Uint8Array.from({ length: 16 }, (_, i) => (i * 53 + 7) & 0xff);
  const { file, hash } = encryptSavedata(buildFf3PspPlain(), KEY, header);
  const detail = 'Play time: 003 : 25 : 00\nLuneth Lv:12 Arc Lv:11\nRefia Lv:11 Ingus Lv:12';
  const sfo = updateSfoHashes(buildSfo(SAMPLE_FOLDER, SAVE_NAME, 'Save data', detail), SAVE_NAME, hash)!;
  return makeZipFiles([
    { name: `${SAMPLE_FOLDER}/PARAM.SFO`, data: sfo },
    { name: `${SAMPLE_FOLDER}/${SAVE_NAME}`, data: file },
  ]);
}
