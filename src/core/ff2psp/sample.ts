// A made-up Final Fantasy II (PSP) save folder, built in code, for the "Try a sample save" button and for tests: a zip of
// ULUS1026300/ with an encrypted SAVEDATA.SAV and a PARAM.SFO whose hashes match it. Nothing here comes from a real game
// file. Like the Dawn of Souls one (../ff2gba/sample.ts) it fills in only what the editor reads: File 1 holds Firion,
// Maria, Guy and Leon near the end of the game, the other guests' records (which the game fills in from the start), the
// name typed for Leon at the start (+0x750) and the story's 15 key terms.

import { buildSfo } from '../ff1psp/sample.ts';
import { encryptSavedata } from '../psp/savedata.ts';
import { updateSfoHashes } from '../psp/sfo.ts';
import { makeZipFiles } from '../zip.ts';
import { FILE_BASE, GAME_CODE, MAGIC, PLAIN_SIZE, SAVE_NAME } from './container.ts';
import { ITEMS, PSP_FORMAT, SPELLS } from './save.ts';

const KEY = Uint8Array.from('4D4158484954504F494E540001000000'.match(/../g)!, (b) => parseInt(b, 16));
const FOLDER = `${GAME_CODE}00`;

const item = (name: string) => {
  const i = ITEMS.indexOf(name);
  if (i < 0) throw new Error(`sample: no ${name}`);
  return i;
};
const fullWidth = (c: string) => {
  const code = c.charCodeAt(0);
  return code >= 97 ? 0x8281 + code - 97 : code >= 65 ? 0x8260 + code - 65 : 0x824f + code - 48;
};

interface Member {
  id: number; name: string; hp: number; mp: number; stats: [number, number, number, number, number, number];
  skills: number[]; gear: [string, string, string, string, string]; spells: [string, number][];
}
const PARTY: Member[] = [
  { id: 0, name: 'Firion', hp: 2140, mp: 210, stats: [52, 40, 46, 22, 20, 24], skills: [2, 6, 3, 11, 1, 4, 1, 3],
    gear: ['Blood Sword', 'Aegis Shield', 'Diamond Helm', 'Diamond Armor', 'Diamond Gloves'], spells: [['Fire', 8], ['Cure', 6], ['Haste', 4]] },
  { id: 1, name: 'Maria', hp: 1620, mp: 480, stats: [30, 46, 34, 44, 40, 41], skills: [1, 3, 1, 4, 1, 1, 10, 1],
    gear: ['Artemis Bow', 'Hands', 'Gold Hairpin', 'Black Robe', 'Protect Ring'], spells: [['Blizzard', 9], ['Thunder', 7], ['Haste', 5], ['Flare', 2]] },
  { id: 2, name: 'Guy', hp: 2590, mp: 140, stats: [60, 30, 58, 14, 16, 18], skills: [4, 2, 1, 2, 1, 1, 12, 1],
    gear: ['Gigantaxe', 'Mythril Shield', 'Giant\'s Helm', 'Golden Armor', 'Power Armlet'], spells: [['Berserk', 5], ['Life', 3]] },
  { id: 8, name: 'Leon', hp: 2310, mp: 160, stats: [56, 34, 50, 18, 12, 20], skills: [1, 5, 1, 9, 1, 1, 1, 1],
    gear: ['Ragnarok', 'Ice Shield', 'Diamond Helm', 'Genji Armor', 'Diamond Gloves'], spells: [['Teleport', 3]] },
];
/** The other guests, in their own records (character ids 3-7). */
const GUESTS: Member[] = [
  { id: 3, name: 'Minwu', hp: 1180, mp: 520, stats: [20, 28, 26, 30, 44, 40], skills: [1, 1, 1, 7, 1, 1, 1, 1],
    gear: ['Mage\'s Staff', 'Hands', '', 'White Robe', ''], spells: [['Cure', 9], ['Life', 5], ['Esuna', 4], ['Barrier', 3]] },
  { id: 4, name: 'Josef', hp: 1581, mp: 5, stats: [30, 24, 30, 10, 10, 10], skills: [4, 1, 1, 1, 1, 1, 1, 1],
    gear: ['Hands', 'Hands', '', 'Leather Armor', 'Leather Gloves'], spells: [] },
  { id: 5, name: 'Gordon', hp: 940, mp: 60, stats: [32, 30, 30, 24, 22, 24], skills: [1, 2, 1, 6, 1, 1, 1, 1],
    gear: ['Longsword', 'Mythril Shield', 'Bronze Helm', 'Bronze Armor', 'Bronze Gloves'], spells: [['Cure', 2]] },
  { id: 6, name: 'Leila', hp: 1020, mp: 90, stats: [28, 40, 28, 22, 14, 16], skills: [1, 4, 6, 1, 1, 1, 1, 1],
    gear: ['Dagger', 'Hands', '', 'Leather Armor', ''], spells: [['Fire', 4], ['Blizzard', 2]] },
  { id: 7, name: 'Ricard', hp: 1690, mp: 40, stats: [48, 34, 42, 16, 26, 8], skills: [1, 2, 1, 1, 1, 9, 1, 1],
    gear: ['Mythril Spear', 'Mythril Shield', 'Bronze Helm', 'Bronze Armor', 'Bronze Gloves'], spells: [] },
];
/** Leon's record is the ninth, as in the game. */
const LEON = 8;
const BAG: [string, number][] = [
  ['Potion', 40], ['Hi-Potion', 18], ['Phoenix Down', 9], ['Ether', 12], ['Elixir', 3], ['Cottage', 4], ['Gold Needle', 5],
  ['Longinus', 1], ['Ultima Tome', 1], ['Revive Tome', 1], ['Ring', 1],
];

/** The decrypted save. */
export function buildFf2PspPlain(): Uint8Array {
  const d = new Uint8Array(PLAIN_SIZE);
  d.set(MAGIC);
  const s = FILE_BASE;
  d.set(MAGIC, s);
  const v = new DataView(d.buffer);
  [...PARTY, ...GUESTS].forEach((m, i) => {
    const r = s + PSP_FORMAT.chars + m.id * PSP_FORMAT.charStride;
    d[r + 2] = m.id;
    [...m.name].forEach((c, k) => v.setUint16(r + 4 + k * 2, fullWidth(c), false));
    v.setUint16(r + 0x14, m.hp - 41 * i, true);
    v.setUint16(r + 0x16, m.hp, true);
    v.setUint16(r + 0x18, m.mp, true);
    v.setUint16(r + 0x1a, m.mp, true);
    d.set(m.stats, r + 0x1c);
    d.set(m.stats, r + 0x2c);
    m.gear.forEach((g, k) => { d[r + 0x25 + k] = g ? item(g) : 0; });
    m.spells.forEach(([name, lv], k) => { d[r + 0x3c + k] = SPELLS.indexOf(name) + 1; d[r + 0x5c + k * 2 + 1] = lv; });
    m.skills.forEach((lv, k) => { d[r + 0x4c + k * 2 + 1] = lv; });
  });
  d[s + PSP_FORMAT.guest] = LEON;
  [...'Leon'].forEach((c, k) => v.setUint16(s + 0x750 + k * 2, fullWidth(c), false));
  // Key terms, most recent first: the story's 15, learned in order (none of the Arcane Labyrinth's words yet).
  for (let k = 0; k < 15; k++) d[s + 0x6fc + k] = 15 - k;
  d[s + 0x74f] = 15;
  v.setUint32(s + PSP_FORMAT.steps, 21_840, true);
  v.setUint32(s + PSP_FORMAT.gil, 486_320, true);
  v.setUint32(s + PSP_FORMAT.playTime, 22 * 3600 + 14 * 60, true);
  BAG.forEach(([name, n], i) => { d[s + PSP_FORMAT.bagIds + i] = item(name); d[s + PSP_FORMAT.bagCounts + i] = n; });
  PSP_FORMAT.writeChecksum(d, s);
  return d;
}

/** The sample as a zip of the save folder, ready to open. */
export function buildFf2PspSample(): Uint8Array {
  const header = Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 0xff);
  const { file, hash } = encryptSavedata(buildFf2PspPlain(), KEY, header);
  const sfo = updateSfoHashes(buildSfo(FOLDER, SAVE_NAME, 'Final Fantasy II', 'Final Fantasy II game data'), SAVE_NAME, hash)!;
  return makeZipFiles([
    { name: `${FOLDER}/PARAM.SFO`, data: sfo },
    { name: `${FOLDER}/${SAVE_NAME}`, data: file },
  ]);
}
