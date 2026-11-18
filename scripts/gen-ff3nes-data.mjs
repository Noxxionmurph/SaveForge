// Generates src/core/ff3nes/tables.ts (names, job numbers and who can equip what, for Final Fantasy III on the Famicom
// with the English fan translation) straight from the game. Run only when you want to regenerate the tables:
//
//   node scripts/gen-ff3nes-data.mjs "<path to a Final Fantasy III (Japan) ROM with the English patch>.nes"
//
// Never commit the ROM. Where things live (from everything8215's disassembly, github.com/everything8215/ff3):
//  - Text: pointers at 0x30010, two bytes per string. A string's bytes are letters (0x80-0x89 digits, 0x8A-0xA3 A-Z,
//    0xA4-0xBD a-z, 0xFF space), two-letter codes 0x28-0x5B whose letters sit in two tables in the last bank
//    (3F/F4E1 first letter, 3F/F515 second), a few tiles for squeezed letters and punctuation, and icons (sword,
//    helm, black magic...) in front of weapon, armor and spell names. String 0x400 + n names item n, 0x1E2 + n job n,
//    0x1F7 + n guest n.
//  - Bank 39 (file 0x72010): job numbers, 8 bytes a job; the experience a level needs, 3 bytes a level, right after;
//    then 98 level-up entries a job (2 bytes: which stats rise and by how much, which spell levels gain a max MP);
//    the MP a job starts with at 39/BB88 (8 bytes, one a spell level).
//  - Who can equip what: byte 7 of an item's 8-byte properties (bank 30, 0x61410 + id * 8; a spell's properties sit
//    at id - 0x30) picks a 3-byte entry at 0x910 whose bits are the jobs (bit n of the 24 = job n). Byte 6 holds the
//    +5 stat bonuses of weapons and armor.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = process.argv[2] && resolve(process.argv[2]);
if (!path) { console.error('Usage: node scripts/gen-ff3nes-data.mjs <Final Fantasy III ROM, English patch>.nes'); process.exit(1); }
const rom = readFileSync(path);
if (rom.length !== 0x80010 || rom.readUInt32BE(0) !== 0x4e45531a) throw new Error('Not a 512 KB iNES ROM');

const bank = (n, addr, base) => 0x10 + n * 0x2000 + (addr - base);
const PAIR1 = bank(0x3f, 0xf4e1, 0xe000);
const PAIR2 = bank(0x3f, 0xf515, 0xe000);
const LETTER = new Map([[0xff, ' ']]);
for (let i = 0; i < 10; i++) LETTER.set(0x80 + i, String(i));
for (let i = 0; i < 26; i++) { LETTER.set(0x8a + i, String.fromCharCode(65 + i)); LETTER.set(0xa4 + i, String.fromCharCode(97 + i)); }
// Tiles the translation uses to squeeze letters in. The runs only appear together.
const RUNS = [
  [[0xda, 0xdb, 0xdc, 0xdd, 0xde, 0xdf], 'omancer'], [[0xd7, 0xd8, 0xd9], 'lack'], [[0xd5, 0xd6], 'ite'],
  [[0xd0, 0xd1], 'ili'], [[0xd0, 0xd2], 'ill'], [[0xcd], 'il'], [[0xce], 'li'], [[0xcf], 'll'], [[0x7d], "'s"],
  [[0xbf], "'"], [[0xc1], '.'], [[0xc2], '-'], [[0xc5], '?'],
];
const ICONS = {
  0xe0: 'shield', 0xe1: 'robe', 0xe2: 'armor', 0xe3: 'helm', 0xe4: 'glove', 0xe5: 'ring', 0xe6: 'claw', 0xe7: 'nunchuck',
  0xe8: 'book', 0xe9: 'rod', 0xea: 'staff', 0xeb: 'hammer', 0xec: 'spear', 0xed: 'knife', 0xee: 'axe', 0xef: 'sword',
  0xf0: 'katana', 0xf1: 'harp', 0xf2: 'bow', 0xf3: 'arrow', 0xf4: 'bell', 0xf5: 'boomerang', 0xf6: 'shuriken',
  0x72: 'summon', 0x74: 'white', 0x75: 'black',
};

/** String n as [icon kind, text]. */
function text(n) {
  const lo = rom[0x30010 + 2 * n];
  const hi = rom[0x30011 + 2 * n];
  let p = 0x10 + (0x18 + (hi >> 5)) * 0x2000 + (((hi & 0x1f) << 8) | lo);
  let kind = '';
  let out = '';
  for (let b = rom[p]; b !== 0; b = rom[p]) {
    const run = RUNS.find(([bytes]) => bytes.every((x, i) => rom[p + i] === x));
    if (run) { out += run[1]; p += run[0].length; continue; }
    p++;
    if (b >= 0x28 && b < 0x5c) out += LETTER.get(rom[PAIR1 + b - 0x28]) + LETTER.get(rom[PAIR2 + b - 0x28]);
    else if (LETTER.has(b)) out += LETTER.get(b);
    else if (ICONS[b] && !out && !kind) kind = ICONS[b];
    else throw new Error(`string 0x${n.toString(16)}: unknown byte 0x${b.toString(16)}`);
  }
  return [kind, out.trim()];
}

// Weapon and armor names are short words behind an icon; the icon becomes a word after the name ("Long" + sword =
// "Long Sword") unless the name already says what it is.
const NOUN = {
  claw: 'Claw', nunchuck: 'Nunchuck', rod: 'Rod', staff: 'Staff', hammer: 'Hammer', axe: 'Axe', spear: 'Spear',
  knife: 'Knife', sword: 'Sword', book: 'Book', bell: 'Bell', harp: 'Harp', bow: 'Bow', arrow: 'Arrow', shield: 'Shield',
  helm: 'Helm', ring: 'Ring', glove: 'Glove', armor: 'Armor', robe: 'Armor',
};
const WHOLE = /(Claw|Knife|Axe|Bow|Mail|Belt|Robe|Suit|Hood|band|Ribbon|Cloth|Kenpo|Gauntlet|Boomerng|FullMoon|Shuriken|Nunchuck|Tonfa|Staff|Hammer|Dagger)$/;
const ITEMS = [];
const KINDS = [];
for (let id = 0; id < 256; id++) {
  let [kind, s] = text(0x400 + id);
  if (id === 0 || s === '?') s = '';
  if (s === '3-Part') s = '3-Part Nunchuck';
  else if (s && NOUN[kind] && !WHOLE.test(s)) s = `${s} ${NOUN[kind]}`;
  ITEMS.push(s);
  KINDS.push(kind);
}
const want = { 0x24: 'Long Sword', 0x37: 'Masamune', 0x39: 'Onion Sword', 0x71: 'Ribbon', 0xa6: 'Potion', 0xa8: 'Elixir', 0xc8: 'Flare', 0xff: 'Chocb' };
for (const [id, name] of Object.entries(want)) if (ITEMS[id] !== name) throw new Error(`item ${id}: ${ITEMS[id]}, wanted ${name}`);

const LONG = { OnionKid: 'Onion Kid', 'WhiteWiz.': 'White Wizard', 'BlackWiz.': 'Black Wizard', 'Red Wiz.': 'Red Wizard', 'M.Knight': 'Magic Knight' };
const JOBS = Array.from({ length: 22 }, (_, j) => { const s = text(0x1e2 + j)[1]; return LONG[s] ?? s; });
if (JOBS[0] !== 'Onion Kid' || JOBS[21] !== 'Ninja') throw new Error(`jobs: ${JOBS}`);
const GUESTS = [''].concat(Array.from({ length: 8 }, (_, g) => text(0x1f8 + g)[1]));

const B39 = 0x72010;
const JOB_STATS = Array.from({ length: 22 }, (_, j) => [...rom.subarray(B39 + j * 8, B39 + j * 8 + 8)]);
if (JOB_STATS[0].slice(2, 7).join() !== '5,5,5,5,5') throw new Error('job table not where expected');
const EXP_TABLE = Array.from({ length: 98 }, (_, i) => rom.readUIntLE(B39 + 0xb0 + i * 3, 3));
if (EXP_TABLE[0] !== 16 || EXP_TABLE.some((v, i) => i && v <= EXP_TABLE[i - 1]) || EXP_TABLE[97] > 9_999_999) throw new Error('exp table');
const MP_START = Array.from({ length: 10 }, (_, i) => [...rom.subarray(B39 + 0x1b88 + i * 8, B39 + 0x1b90 + i * 8)]);
if (Math.max(...JOB_STATS.map((s) => s[7])) >= MP_START.length) throw new Error('mp table');
const LEVEL_PTRS = bank(0x3d, 0xad59, 0xa000);
const LEVEL_UP = JOB_STATS.map((_, j) => {
  const at = B39 + rom.readUInt16LE(LEVEL_PTRS + 2 * j) - 0x8000;
  if (at !== B39 + 0x1d6 + j * 0xc4) throw new Error(`level-up pointer for job ${j}`);
  return rom.subarray(at, at + 0xc4).toString('hex');
});

const EQUIP = ITEMS.map((_, id) => {
  if (!id || (id >= 0x98 && id < 0xc8) || id === 0x57) return 0;
  const p = 0x61410 + (id >= 0xc8 ? id - 0x30 : id) * 8;
  const e = 0x910 + (rom[p + 7] & 0x7f) * 3;
  return (rom[e] << 16) | (rom[e + 1] << 8) | rom[e + 2];
});
if (EQUIP[0x39] !== 1 || EQUIP[0x71] !== 0x3fffff) throw new Error('equip table');
// Byte 6 of weapon and armor properties, bits 7-3: +5 strength, agility, vitality, intelligence, spirit while worn.
const STAT_BONUS = ITEMS.map((_, id) => (id < 0x98 ? rom[0x61410 + id * 8 + 6] >> 3 : 0));
if (STAT_BONUS[0x39] !== 0x1c) throw new Error('stat bonus table');

const list = (a) => `[\n${a.map((s) => `  ${JSON.stringify(s)},`).join('\n')}\n]`;
const rows = (a, per) => `[\n${Array.from({ length: Math.ceil(a.length / per) }, (_, i) => `  ${a.slice(i * per, i * per + per).map((v) => (Array.isArray(v) ? `[${v.join(', ')}]` : JSON.stringify(v))).join(', ')},`).join('\n')}\n]`;
const out = `// Generated by scripts/gen-ff3nes-data.mjs from the game itself (English fan translation). Do not edit by hand.
// Final Fantasy III (Famicom): names by save id, job numbers and who can equip what.

/** Every item by the id the save uses: weapons 0x01-0x56, shields 0x58-0x61, helmets 0x62-0x71, armor 0x72-0x8A,
 * gloves and rings 0x8B-0x97, Magic Key and Carrot 0x98-0x99, key items 0x9A-0xA3, Midget Bread 0xA4, items 0xA6-0xC7,
 * spells 0xC8-0xFF. */
export const ITEMS: readonly string[] = ${list(ITEMS)};
/** The icon the game draws in front of each name: the kind of weapon or armor, or the school of a spell. */
export const ITEM_KINDS: readonly string[] = ${list(KINDS)};
/** Job names, spelled out where the game abbreviates them. */
export const JOBS: readonly string[] = ${list(JOBS)};
/** Who travels with the party, by the guest number the save keeps (0: nobody). */
export const GUESTS: readonly string[] = ${list(GUESTS)};
/** Per job: [physical/magical index << 4 | lawful/chaotic index, lowest level - 1, strength, agility, vitality,
 * intelligence, spirit, row of MP_START]. */
export const JOB_STATS: readonly (readonly number[])[] = ${rows(JOB_STATS, 1)};
/** The experience a character needs for level n + 2. */
export const EXP_TABLE: readonly number[] = ${rows(EXP_TABLE, 10)};
/** Max MP a job starts with, spell levels 1-8. */
export const MP_START: readonly (readonly number[])[] = ${rows(MP_START, 1)};
/** Per job, 98 level-up entries of 2 bytes (hex): bits 7-3 of the first byte say strength, agility, vitality,
 * intelligence or spirit rise, bits 2-0 by how much; bit n of the second byte, spell level n + 1 gains a max MP. */
export const LEVEL_UP: readonly string[] = ${list(LEVEL_UP)};
/** Per item id: bit n set when job n can equip the item or learn the spell. */
export const EQUIP: readonly number[] = ${rows(EQUIP, 8)};
/** Per weapon or armor id: +5 to strength (bit 4), agility (3), vitality (2), intelligence (1), spirit (0) while worn. */
export const STAT_BONUS: readonly number[] = ${rows(STAT_BONUS, 16)};
`;
writeFileSync(new URL('../src/core/ff3nes/tables.ts', import.meta.url), out);
console.log('wrote src/core/ff3nes/tables.ts');
