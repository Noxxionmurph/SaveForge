// A made-up Final Fantasy (PSP) save folder, built in code, for the "Try a sample save" button and for tests: a zip of
// ULUS10251DATA00/ with an encrypted SAVE.BIN and a PARAM.SFO whose hashes match it. Nothing here comes from a real
// game file: one save file (File 1) with a party of four partway through the game.

import { encryptSavedata } from '../psp/savedata.ts';
import { updateSfoHashes } from '../psp/sfo.ts';
import { makeZipFiles } from '../zip.ts';
import { GAME_CODE, PLAIN_SIZE } from './container.ts';
import { ARMOR, CONSUMABLES, KEY_ITEMS, NAME_GLYPHS, SPELLS, WEAPONS } from './tables.ts';

const KEY = Uint8Array.from('437BEAA762302FB7C8762C17CFF01460'.match(/../g)!, (b) => parseInt(b, 16));
const FOLDER = `${GAME_CODE}DATA00`;

const glyph = new Map(Object.entries(NAME_GLYPHS).map(([g, c]) => [c, Number(g)]));
const id = (list: readonly string[], name: string) => {
  const i = list.indexOf(name);
  if (i < 0) throw new Error(`sample: no ${name}`);
  return i + 1;
};

interface Member {
  name: string; cls: number; level: number; exp: number; hp: number; mp: number; magicLevel: number;
  stats: [number, number, number, number, number];
  gear: [string, string, string, string, string]; spells?: string[];
}

const PARTY: Member[] = [
  { name: 'Brom', cls: 0, level: 24, exp: 31_250, hp: 512, mp: 0, magicLevel: 0, stats: [38, 20, 9, 31, 17],
    gear: ['Flame Sword', 'Iron Shield', 'Helm', 'Iron Armor', 'Bronze Gloves'] },
  { name: 'Wren', cls: 1, level: 23, exp: 29_480, hp: 371, mp: 0, magicLevel: 0, stats: [24, 36, 13, 18, 30],
    gear: ['Saber', '', 'Leather Cap', 'Leather Armor', 'Leather Gloves'] },
  { name: 'Ivy', cls: 4, level: 22, exp: 27_903, hp: 298, mp: 96, magicLevel: 4, stats: [15, 14, 33, 20, 12],
    gear: ['Healing Staff', '', 'Leather Cap', 'Light Robe', ''], spells: ['Cure', 'Dia', 'Protect', 'Blindna', 'Silence', 'Invis', 'Cura', 'Heal', 'Diara', 'Life', 'Vox', 'Poisona'] },
  { name: 'Oren', cls: 5, level: 22, exp: 27_655, hp: 254, mp: 112, magicLevel: 4, stats: [9, 18, 38, 12, 20],
    gear: ['Staff', '', '', "Sage's Surplice", ''], spells: ['Fire', 'Sleep', 'Thunder', 'Blizzard', 'Dark', 'Slow', 'Fira', 'Hold', 'Thundara', 'Blizzara', 'Haste', 'Confuse'] },
];

const BAG: [number, string, number][] = [
  [1, 'Potion', 24], [1, 'Hi-Potion', 6], [1, 'Ether', 4], [1, 'Phoenix Down', 5], [1, 'Antidote', 9], [1, 'Gold Needle', 3],
  [1, 'Eye Drops', 4], [1, 'Echo Grass', 2], [1, 'Tent', 3], [1, 'Cottage', 1], [1, 'Sleeping Bag', 2],
  [2, 'Longsword', 1], [2, 'Dagger', 2], [3, 'Chain Mail', 1], [3, 'Buckler', 1],
];

/** The decrypted save. */
export function buildFf1PspPlain(): Uint8Array {
  const d = new Uint8Array(PLAIN_SIZE);
  d.set([0x12, 0x08, 0x02, 0x01]);
  const s = 4;
  d[s + 1] = 1;
  const v = new DataView(d.buffer);
  PARTY.forEach((m, i) => {
    const r = s + 0x24 + i * 0x5c;
    for (let k = 0; k < 7; k++) v.setUint16(r - 0x12 + k * 2, k < m.name.length ? glyph.get(m.name[k])! : 0xffff, true);
    d[r - 4] = i;
    d[r - 2] = m.cls;
    v.setUint32(r, m.level, true);
    v.setUint32(r + 4, m.exp, true);
    v.setUint16(r + 8, m.hp - 23 * i, true);
    v.setUint16(r + 0x0a, m.hp, true);
    v.setUint16(r + 0x0c, m.mp, true);
    v.setUint16(r + 0x0e, m.mp, true);
    d[r + 0x10] = m.magicLevel;
    d.set(m.stats, r + 0x11);
    m.gear.forEach((g, k) => { d[r + 0x1c + k] = g ? id(k === 0 ? WEAPONS : ARMOR, g) : 0; });
    (m.spells ?? []).forEach((sp, k) => { d[r + 0x21 + k] = id(SPELLS, sp); });
  });
  BAG.forEach(([cat, name, n], k) => d.set([cat, id(cat === 1 ? CONSUMABLES : cat === 2 ? WEAPONS : ARMOR, name), n], s + 0x174 + k * 3));
  v.setUint32(s + 0x3a4, 18_420, true); // gil
  v.setUint32(s + 0x3a8, 9 * 3600 + 41 * 60, true); // play time
  for (const name of ['Lute', 'Crown', 'Crystal Eye', 'Jolt Tonic', 'Mystic Key']) {
    const k = id(KEY_ITEMS, name) - 1;
    d[s + 0x71b - (k >> 3)] |= 0x80 >> (k & 7);
  }
  return d;
}

// ---------- PARAM.SFO ----------

/** A PARAM.SFO like the game writes, with the hashes left blank (updateSfoHashes fills them). Final Fantasy II's
 * sample (../ff2psp/sample.ts) passes its own folder, file and titles. */
export function buildSfo(folder = FOLDER, file = 'SAVE.BIN', title = 'Final Fantasy I', detail = 'Final Fantasy I game data'): Uint8Array {
  const text = (s: string, max: number) => ({ fmt: 0x204, data: new TextEncoder().encode(`${s}\0`), max });
  const fileList = new Uint8Array(0xc60);
  fileList.set(new TextEncoder().encode(file));
  const params = new Uint8Array(0x80);
  params[0] = 0x41;
  const entries: { key: string; fmt: number; data: Uint8Array; max: number }[] = [
    { key: 'CATEGORY', ...text('MS', 4) },
    { key: 'PARENTAL_LEVEL', fmt: 0x404, data: Uint8Array.of(4, 0, 0, 0), max: 4 },
    { key: 'SAVEDATA_DETAIL', ...text(detail, 1024) },
    { key: 'SAVEDATA_DIRECTORY', ...text(folder, 64) },
    { key: 'SAVEDATA_FILE_LIST', fmt: 0x4, data: fileList, max: fileList.length },
    { key: 'SAVEDATA_PARAMS', fmt: 0x4, data: params, max: params.length },
    { key: 'SAVEDATA_TITLE', ...text(title, 128) },
    { key: 'TITLE', ...text('FINAL FANTASY ', 128) },
  ];
  const keyBytes = entries.map((e) => new TextEncoder().encode(`${e.key}\0`));
  const keysLen = (keyBytes.reduce((n, k) => n + k.length, 0) + 3) & ~3;
  const keysAt = 20 + entries.length * 16;
  const dataAt = keysAt + keysLen;
  const size = dataAt + entries.reduce((n, e) => n + e.max, 0);
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out.set([0, 0x50, 0x53, 0x46, 1, 1, 0, 0]);
  v.setUint32(8, keysAt, true);
  v.setUint32(12, dataAt, true);
  v.setUint32(16, entries.length, true);
  let k = 0, dOff = 0;
  entries.forEach((e, i) => {
    const at = 20 + i * 16;
    v.setUint16(at, k, true);
    v.setUint16(at + 2, e.fmt, true);
    v.setUint32(at + 4, e.data.length, true);
    v.setUint32(at + 8, e.max, true);
    v.setUint32(at + 12, dOff, true);
    out.set(keyBytes[i], keysAt + k);
    out.set(e.data, dataAt + dOff);
    k += keyBytes[i].length;
    dOff += e.max;
  });
  return out;
}

/** The sample as a zip of the save folder, ready to open. */
export function buildFf1PspSample(): Uint8Array {
  const header = Uint8Array.from({ length: 16 }, (_, i) => (i * 29 + 7) & 0xff);
  const { file, hash } = encryptSavedata(buildFf1PspPlain(), KEY, header);
  const sfo = updateSfoHashes(buildSfo(), 'SAVE.BIN', hash)!;
  return makeZipFiles([
    { name: `${FOLDER}/PARAM.SFO`, data: sfo },
    { name: `${FOLDER}/SAVE.BIN`, data: file },
  ]);
}
