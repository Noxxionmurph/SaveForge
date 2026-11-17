// Generates src/core/ff3ds/tables.ts (names, who can equip what, the stat, MP and experience tables of Final Fantasy III
// on the Nintendo DS) straight from the game. Run only when you want to regenerate the tables:
//
//   node scripts/gen-ff3ds-data.mjs "<path to a Final Fantasy III (USA) DS ROM>.nds"
//
// Never commit the ROM. Everything comes from files at the root of the ROM's file system:
//  - eureka_item.msd, eureka_menu.msd: the game's English text. "MSDA", a u32 version, a u32 count, a u32 0, then per
//    string a u32 id, 4 flag bytes and a u32 offset; the strings are NUL-terminated ASCII. Job names are menu strings
//    50105-50127.
//  - item_parameter.pak: a u32 count (5), then (u32 offset, u32 size) of five tables at 0x10: items (44-byte records),
//    weapons (56), armor (60), spells (52) and key items (28). Every record starts with a u16 type, the u16 id the save
//    uses and the u16 id of its name. Weapons and armor keep stat bonuses at 0x0A-0x0E (strength, vitality, agility,
//    intellect, mind) and a u32 at 0x24 with bit n set when job n can equip them; spells keep the same job bits at 0x24
//    and their level - 1 at 0x28. A weapon's type: 7 bow, 8 arrows, 16 harp. An armor's: 0 shield, 1 head, 2 body, 3 arms.
//  - player_job_status_table.bbd: per job, a growth curve for each of the five stats and an MP table number (0: no MP).
//  - player_statusup_table.bbd: the eight growth curves, a stat at each level 1-99.
//  - mp01.bbd-mp07.bbd: the MP tables, max MP of spell levels 1-8 at each level 1-99.
//  - exp.bbd: the experience each level 1-99 starts at.
//  - player_initialize_paramter.bbd: each job's battle commands (5 u16, 12 bytes a job).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = process.argv[2] && resolve(process.argv[2]);
if (!path) { console.error('Usage: node scripts/gen-ff3ds-data.mjs <Final Fantasy III (USA)>.nds'); process.exit(1); }
const rom = readFileSync(path);
if (rom.toString('latin1', 0x0c, 0x10) !== 'AFFE') throw new Error('Not the Final Fantasy III (USA) DS ROM (game code AFFE)');

// The ROM's file system: name table (FNT) and allocation table (FAT), offsets in the header.
const fnt = rom.readUInt32LE(0x40);
const fat = rom.readUInt32LE(0x48);
const rootFiles = new Map();
{
  let p = fnt + rom.readUInt32LE(fnt);
  let id = rom.readUInt16LE(fnt + 4);
  for (let len = rom[p++]; len; len = rom[p++]) {
    const name = rom.toString('latin1', p, p + (len & 0x7f));
    p += len & 0x7f;
    if (len & 0x80) p += 2; // a directory: its id follows
    else rootFiles.set(name, id++);
  }
}
function file(name) {
  const id = rootFiles.get(name);
  if (id === undefined) throw new Error(`no ${name} in the ROM`);
  return rom.subarray(rom.readUInt32LE(fat + id * 8), rom.readUInt32LE(fat + id * 8 + 4));
}

function msd(name) {
  const d = file(name);
  if (d.toString('latin1', 0, 4) !== 'MSDA') throw new Error(`${name} is not MSDA text`);
  const out = new Map();
  for (let i = 0; i < d.readUInt32LE(8); i++) {
    const at = d.readUInt32LE(16 + i * 12 + 8);
    out.set(d.readUInt32LE(16 + i * 12), d.toString('latin1', at, d.indexOf(0, at)));
  }
  return out;
}
const itemText = msd('eureka_item.msd');
const menuText = msd('eureka_menu.msd');

const JOBS = Array.from({ length: 23 }, (_, j) => menuText.get(50105 + j));
if (JOBS[0] !== 'Freelancer' || JOBS[1] !== 'Onion Knight' || JOBS[22] !== 'Ninja') throw new Error(`jobs: ${JOBS}`);

const pak = file('item_parameter.pak');
if (pak.readUInt32LE(0) !== 5) throw new Error('item_parameter.pak: expected 5 tables');
const STRIDE = [44, 56, 60, 52, 28];
const records = STRIDE.map((stride, t) => {
  const at = pak.readUInt32LE(0x10 + t * 8), size = pak.readUInt32LE(0x14 + t * 8);
  if (size % stride) throw new Error(`table ${t}: size ${size} is not a multiple of ${stride}`);
  return Array.from({ length: size / stride }, (_, i) => pak.subarray(at + i * stride, at + (i + 1) * stride));
});
const nameOf = (r) => {
  const s = itemText.get(r.readUInt16LE(4));
  if (!s) throw new Error(`no name for item ${r.readUInt16LE(2)}`);
  return s;
};
const bonus = (r) => [...r.subarray(0x0a, 0x0f)];

const ITEMS = records[0].map((r) => [r.readUInt16LE(2), nameOf(r)]);
const WEAPONS = records[1].filter((r) => r.readUInt16LE(2) !== 1000) // 1000 is "Unarmed"
  .map((r) => [r.readUInt16LE(2), nameOf(r), r.readUInt16LE(0), r.readUInt32LE(0x24), bonus(r)]);
const ARMOR = records[2].map((r) => [r.readUInt16LE(2), nameOf(r), r.readUInt16LE(0), r.readUInt32LE(0x24), bonus(r)]);
// White 4001-4024, black 4101-4124 and the summons 4201-4208; each summon has two more records (4211-4228) for what it
// does when an Evoker calls it, which the save never names.
const SPELLS = records[3].filter((r) => r.readUInt16LE(0) <= 2 && r.readUInt16LE(2) % 100 <= 24 && !(r.readUInt16LE(0) === 2 && r.readUInt16LE(2) > 4208))
  .map((r) => [r.readUInt16LE(2), nameOf(r), r.readUInt16LE(0), r[0x28] + 1, r.readUInt32LE(0x24)]);
const KEY_ITEMS = records[4].map((r) => [r.readUInt16LE(2), nameOf(r)]);

const byId = new Map([...ITEMS, ...WEAPONS, ...ARMOR, ...SPELLS, ...KEY_ITEMS].map((x) => [x[0], x]));
const want = { 5001: 'Potion', 5011: 'Elixir', 1127: 'Excalibur', 1129: 'Onion Sword', 3124: 'Ribbon', 3249: 'Onion Armor', 4001: 'Cure', 4124: 'Meteor', 4208: 'Bahamur' };
for (const [id, name] of Object.entries(want)) if (byId.get(Number(id))?.[1] !== name) throw new Error(`item ${id}: ${byId.get(Number(id))?.[1]}, wanted ${name}`);
if (byId.get(1129)[3] !== 0b10 || byId.get(3124)[3] !== 0x7fffff) throw new Error('equip masks not where expected');
if (SPELLS.length !== 56 || SPELLS.some(([, , school, level]) => school > 2 || level < 1 || level > 8)) throw new Error('spell table');

const grades = file('player_job_status_table.bbd');
const JOB_GRADES = JOBS.map((_, j) => [...grades.subarray(j * 6, j * 6 + 6)]);
if (JOB_GRADES[1].join() !== '7,7,7,7,7,6' || JOB_GRADES[2].join() !== '2,3,2,5,5,0') throw new Error('job status table');
const curves = file('player_statusup_table.bbd');
if (curves.length !== 8 * 99) throw new Error('growth curves');
const STAT_CURVES = Array.from({ length: 8 }, (_, c) => curves.subarray(c * 99, c * 99 + 99).toString('hex'));
const MP_TABLES = Array.from({ length: 7 }, (_, t) => {
  const d = file(`mp0${t + 1}.bbd`);
  if (d.length !== 99 * 8) throw new Error(`mp0${t + 1}.bbd`);
  return d.toString('hex');
});
if (MP_TABLES[5].slice(98 * 16) !== '312b241e17110a04') throw new Error('MP table 6 at level 99');
const exp = file('exp.bbd');
const EXP_TABLE = Array.from({ length: 99 }, (_, i) => exp.readUInt32LE(i * 4));
if (EXP_TABLE[0] !== 0 || EXP_TABLE[1] !== 16 || EXP_TABLE.some((v, i) => i && v <= EXP_TABLE[i - 1])) throw new Error('exp table');
const init = file('player_initialize_paramter.bbd');
const COMMANDS = JOBS.map((_, j) => Array.from({ length: 5 }, (_, k) => init.readUInt16LE(j * 12 + k * 2)));
if (COMMANDS[1].join() !== '1,46,3,4,0') throw new Error('battle commands');

const rows = (a) => `[\n${a.map((v) => `  ${JSON.stringify(v).replace(/,/g, ', ')},`).join('\n')}\n]`;
const out = `// Generated by scripts/gen-ff3ds-data.mjs from the game itself (Final Fantasy III, Nintendo DS, USA). Do not edit by hand.

/** Job names, by the job number the save keeps (0 Freelancer ... 22 Ninja). */
export const JOBS: readonly string[] = ${rows(JOBS)};
/** Items: [save id, name], in the game's order. */
export const ITEMS: readonly (readonly [number, string])[] = ${rows(ITEMS)};
/** Weapons: [save id, name, type (1 knife, 2 sword, 5 staff, 6 rod, 7 bow, 8 arrows, 9 book, 10 claws, 11 hammer, 12 axe,
 * 13 spear, 14 boomerang, 15 bell, 16 harp, 17 katana, 18 shuriken), job bits, stat bonuses (strength, vitality, agility,
 * intellect, mind)]. */
export const WEAPONS: readonly (readonly [number, string, number, number, readonly number[]])[] = ${rows(WEAPONS)};
/** Armor: [save id, name, slot (0 shield, 1 head, 2 body, 3 arms), job bits, stat bonuses]. */
export const ARMOR: readonly (readonly [number, string, number, number, readonly number[]])[] = ${rows(ARMOR)};
/** Spells: [save id, name, school (0 white, 1 black, 2 summon), level 1-8, job bits]. */
export const SPELLS: readonly (readonly [number, string, number, number, number])[] = ${rows(SPELLS)};
/** Key items: [save id, name]. */
export const KEY_ITEMS: readonly (readonly [number, string])[] = ${rows(KEY_ITEMS)};
/** Per job: the growth curve (STAT_CURVES) of strength, vitality, agility, intellect and mind, then its MP table
 * (MP_TABLES, counted from 1; 0 means no MP). */
export const JOB_GRADES: readonly (readonly number[])[] = ${rows(JOB_GRADES)};
/** Eight growth curves (hex): a stat at each level 1-99. */
export const STAT_CURVES: readonly string[] = ${rows(STAT_CURVES)};
/** Seven MP tables (hex): max MP of spell levels 1-8 at each level 1-99, 8 bytes a level. */
export const MP_TABLES: readonly string[] = ${rows(MP_TABLES)};
/** The experience each level 1-99 starts at. */
export const EXP_TABLE: readonly number[] = ${rows(EXP_TABLE)};
/** Each job's battle commands, as the game sets them up the first time a character takes the job. */
export const COMMANDS: readonly (readonly number[])[] = ${rows(COMMANDS)};
`;
writeFileSync(new URL('../src/core/ff3ds/tables.ts', import.meta.url), out);
console.log(`wrote src/core/ff3ds/tables.ts: ${ITEMS.length} items, ${WEAPONS.length} weapons, ${ARMOR.length} armor, ${SPELLS.length} spells, ${KEY_ITEMS.length} key items`);
