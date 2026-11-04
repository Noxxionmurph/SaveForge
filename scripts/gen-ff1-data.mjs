// Generates src/core/ff1nes/tables.ts (names, equipment stats and permissions, spell permissions, the Exp table and the
// new-game tables for Final Fantasy on the NES) from Disch's disassembly of the US release. Run only when you want to
// regenerate the tables:
//
//   git clone --depth 1 https://github.com/Entroper/FF1Disassembly /tmp/ff1
//   node scripts/gen-ff1-data.mjs "/tmp/ff1/Final Fantasy Disassembly"
//
// The bank_XX.dat files in the disassembly are the game's own data banks (each mapped at $8000), so names and numbers
// are read straight from them; the few tables that live in code banks are parsed from the .asm source.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2] && resolve(process.argv[2]);
if (!src) { console.error('Usage: node scripts/gen-ff1-data.mjs <path to "Final Fantasy Disassembly">'); process.exit(1); }
const bank = (n) => readFileSync(join(src, `bank_${n}.dat`));
const asm = (n) => readFileSync(join(src, `bank_${n}.asm`), 'utf8');
const at = (b, addr) => addr - 0x8000;
const problems = [];

// ---- text: table_standard.tbl, with the little equipment icons spelled out as words ----
const TBL = new Map();
for (const line of readFileSync(join(src, 'table_standard.tbl'), 'latin1').split(/\r?\n/)) {
  const m = line.match(/^([0-9A-F]{2})=(.*)$/);
  if (m) TBL.set(parseInt(m[1], 16), m[2]);
}
const ICONS = { '@S': ' Sword', '@H': ' Hammer', '@K': ' Knife', '@X': ' Axe', '@F': ' Staff', '@N': ' Nunchuck', '@A': ' Armor', '@s': ' Shield', '@h': ' Helmet', '@G': ' Gauntlet', '@B': ' Bracelet', '@T': ' Shirt', '@P': ' Potion' };
const d0A = bank('0A');
const ptr = at(d0A, 0xb700);
const raw = [];
for (let i = 0; i < 256; i++) {
  let o = at(d0A, d0A[ptr + 2 * i] | (d0A[ptr + 2 * i + 1] << 8));
  let s = '';
  while (d0A[o] !== 0) s += TBL.get(d0A[o++]) ?? '?';
  raw.push(s);
}
const tidy = (s) => {
  for (const [k, v] of Object.entries(ICONS)) s = s.replace(k, v);
  return s.replace(/\s+/g, ' ').trim();
};
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

// Key items 1..17 (the game writes them in capitals), then the six consumables.
const KEY_ITEMS = raw.slice(0x01, 0x12).map((s) => { const t = s.trim(); return t === 'TNT' ? t : titleCase(t); });
const CONSUMABLES = raw.slice(0x16, 0x1c).map((s) => tidy(titleCase(s.trim().replace(/@P$/, '')) + (s.includes('@P') ? '@P' : '')));
const WEAPONS = raw.slice(0x1c, 0x44).map(tidy);
const ARMOR = raw.slice(0x44, 0x6c).map(tidy);
const SPELLS = raw.slice(0xb0, 0xf0).map((s) => s.trim());
if (KEY_ITEMS[0] !== 'Lute' || KEY_ITEMS[16] !== 'Canoe') problems.push(`key items: ${KEY_ITEMS}`);
if (WEAPONS[0] !== 'Wooden Nunchuck' || WEAPONS[39] !== 'Masmune') problems.push(`weapons: ${WEAPONS[0]} .. ${WEAPONS[39]}`);
if (ARMOR[0] !== 'Cloth' || ARMOR[39] !== 'ProRing') problems.push(`armor: ${ARMOR[0]} .. ${ARMOR[39]}`);
if (SPELLS[0] !== 'CURE' || SPELLS[63] !== 'XXXX') problems.push(`spells: ${SPELLS[0]} .. ${SPELLS[63]}`);

// ---- equipment stats (bank 0C, from its bin/ files): weapons 8 bytes (hit, damage, crit, ...), armor 4 bytes (evade, absorb, resist, spell) ----
const bin = (name) => readFileSync(join(src, 'bin', name));
const wd = bin('0C_8000_weapondata.bin');
const ad = bin('0C_8140_armordata.bin');
const WEAPON_STATS = Array.from({ length: 40 }, (_, i) => [...wd.subarray(i * 8, i * 8 + 3)]);
const ARMOR_STATS = Array.from({ length: 40 }, (_, i) => [...ad.subarray(i * 4, i * 4 + 3)]);

// ---- tables in code (bank 0E): equip permissions, armor types, magic permissions ----
const e = asm('0E');
const block = (label, until) => {
  const i = e.indexOf(`\n${label}:`);
  if (i < 0) throw new Error(`missing ${label}`);
  const rest = e.slice(i + label.length + 2);
  return rest.slice(0, until ? rest.search(until) : undefined);
};
const nums = (text) => [...text.replace(/;[^\n]*/g, '').matchAll(/\$([0-9A-Fa-f]+)|\b(\d+)\b/g)].map((m) => (m[1] ? parseInt(m[1], 16) : Number(m[2])));
const WEAPON_PERMS = nums(block('lut_WeaponPermissions', /\n;;;/)).slice(0, 40);
const ARMOR_PERMS = nums(block('lut_ArmorPermissions', /\n;;/)).slice(0, 40);
const ARMOR_TYPES = nums(block('lut_ArmorTypes', /\n;;;/)).slice(0, 40);
const magic = block('lut_MagicPermisPtr', /\n;;;/);
const MAGIC_PERMS = ['FT', 'TH', 'BB', 'RM', 'WM', 'BM', 'KN', 'NJ', 'MA', 'RW', 'WW', 'BW'].map((c) => {
  const m = magic.match(new RegExp(`@${c}:\\s*\\.BYTE([^\\n]*)`));
  return nums(m[1]);
});
if (WEAPON_PERMS.length !== 40 || ARMOR_PERMS.length !== 40 || ARMOR_TYPES.length !== 40) problems.push('permission table lengths');
if (MAGIC_PERMS.some((p) => p.length !== 8)) problems.push('magic permission lengths');

// ---- Exp needed to reach each level (bank 0B) ----
const b = asm('0B');
const expText = b.slice(b.indexOf('lut_ExpToAdvance:'), b.indexOf('; unused byte'));
const EXP = [...expText.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
if (EXP.length !== 49 || EXP[0] !== 40 || EXP[48] !== 989641) problems.push(`exp table: ${EXP.length}`);

// ---- level-up data (bank 0B, $9094): 2 bytes per level, 49 levels, 6 base classes ----
const LEVEL_UP = [...readFileSync(join(src, 'bin', '0B_9094_levelupdata.bin'))];
if (LEVEL_UP.length !== 49 * 2 * 6) problems.push(`level up data: ${LEVEL_UP.length}`);

// ---- new game (bank 00): first page of the save, the object flags page, and each class's starting stats ----
const d00 = bank('00');
const INIT_PAGE0 = [...d00.subarray(at(d00, 0xb000), at(d00, 0xb000) + 0x100)];
const INIT_FLAGS = [...d00.subarray(at(d00, 0xaf00), at(d00, 0xaf00) + 0x100)];
const START_STATS = Array.from({ length: 6 }, (_, c) => [...d00.subarray(at(d00, 0xb040) + c * 16 + 1, at(d00, 0xb040) + c * 16 + 11)]);
if (INIT_PAGE0[0x1c] !== 0x90 || INIT_PAGE0[0x1d] !== 0x01) problems.push('starting gold is not 400');

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const j = (v) => JSON.stringify(v);
const hex = (a) => `[${a.map((n) => `0x${n.toString(16).padStart(2, '0')}`).join(',')}]`;
const out = `// Generated by scripts/gen-ff1-data.mjs from Disch's Final Fantasy (NES, US) disassembly. Do not edit by hand.

/** Key items, 1-based as stored (index 0 here is item 1, the Lute). */
export const KEY_ITEMS: readonly string[] = ${j(KEY_ITEMS)};
/** Tent, Cabin, House, Heal Potion, Pure Potion, Soft Potion. */
export const CONSUMABLES: readonly string[] = ${j(CONSUMABLES)};
/** Weapons, 1-based as stored (index 0 here is weapon 1). */
export const WEAPONS: readonly string[] = ${j(WEAPONS)};
export const ARMOR: readonly string[] = ${j(ARMOR)};
/** All 64 spells: level = index >> 3; within a level the first four are white magic, the last four black. */
export const SPELLS: readonly string[] = ${j(SPELLS)};

/** Per weapon: hit rate bonus, damage bonus, critical rate. */
export const WEAPON_STATS: readonly (readonly number[])[] = ${j(WEAPON_STATS)};
/** Per armor: evade penalty, absorb bonus, elemental resistance bits. */
export const ARMOR_STATS: readonly (readonly number[])[] = ${j(ARMOR_STATS)};
/** Per weapon / armor: a bit per class (Fighter 0x800 ... Black Wizard 0x001); set = that class can't equip it. */
export const WEAPON_PERMS: readonly number[] = ${j(WEAPON_PERMS)};
export const ARMOR_PERMS: readonly number[] = ${j(ARMOR_PERMS)};
/** 0 body, 1 shield, 2 helmet, 3 gloves: only one of each can be worn. */
export const ARMOR_TYPES: readonly number[] = ${j(ARMOR_TYPES)};
/** Per class, a byte per spell level; bit 7 is the level's first spell. Set = can't learn it. */
export const MAGIC_PERMS: readonly (readonly number[])[] = ${j(MAGIC_PERMS)};

/** Total Exp needed to reach level 2 .. 50. */
export const EXP_TO_LEVEL: readonly number[] = ${j(EXP)};
/** Level-up data: 49 levels x 2 bytes for each of the six base classes (promoted classes share it). */
export const LEVEL_UP: readonly number[] = ${hex(LEVEL_UP)};

/** The first page of a new game's save (vehicles, map position, 400 gold). */
export const INIT_PAGE0: readonly number[] = ${hex(INIT_PAGE0)};
/** A new game's object flags page. */
export const INIT_FLAGS: readonly number[] = ${hex(INIT_FLAGS)};
/** Per base class: HP, Str, Agi, Int, Vit, Luck, damage, hit rate, evade, magic defense. */
export const START_STATS: readonly (readonly number[])[] = ${j(START_STATS)};
`;
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '../src/core/ff1nes/tables.ts'), out);
console.log('wrote src/core/ff1nes/tables.ts');
