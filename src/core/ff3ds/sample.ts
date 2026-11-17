// A made-up Final Fantasy III (Nintendo DS) save, built in code, for tests and the browser checks. Nothing here comes
// from a real game file. It fills in only what the editor reads (the map and story bytes stay zero), so the game itself
// wouldn't start from it. Stats and max MP are what the game gives each job at that level. writeSampleGame() also fills
// the PSP's sample (../ff3psp/sample.ts), which keeps the same game in other places.

import { le } from '../bytes.ts';
import { LENGTH, SAVE_SIZE, SLOT_SPACING, slotBase, writeChecksum } from './layout.ts';
import { DS_LAYOUT, expFor, growth, type Ff3Layout } from './save.ts';
import { ARMOR, COMMANDS, ITEMS, KEY_ITEMS, SPELLS, WEAPONS } from './tables.ts';

const MAGIC = 'cd1000\0EUReKa\0';
const ALL = [...ITEMS, ...WEAPONS, ...ARMOR, ...SPELLS, ...KEY_ITEMS];
const id = (name: string) => {
  const hit = ALL.find((x) => x[1] === name);
  if (!hit) throw new Error(`no ${name}`);
  return hit[0];
};
const bonus = new Map<number, readonly number[]>([...WEAPONS, ...ARMOR].map((x) => [x[0], x[4]]));

interface Member { name: string; job: number; level: number; jobLevel: number; hp: number; gear: string[]; mpUsed: number; spells: string[] }
// The four heroes after the Wind Crystal. Gear: right hand, left hand, head, body, arms ('' = nothing).
const PARTY: Member[] = [
  { name: 'Luneth', job: 2, level: 12, jobLevel: 6, hp: 168, gear: ['Longsword', 'Leather Shield', 'Leather Cap', 'Leather Armor', 'Bronze Bracers'], mpUsed: 0, spells: [] },
  { name: 'Arc', job: 5, level: 11, jobLevel: 5, hp: 98, gear: ['Staff', '', 'Leather Cap', 'Vest', 'Bronze Bracers'], mpUsed: 2, spells: ['Fire', 'Blizzard', 'Sleep', 'Thunder'] },
  { name: 'Refia', job: 4, level: 11, jobLevel: 5, hp: 104, gear: ['Staff', '', 'Leather Cap', 'Vest', ''], mpUsed: 3, spells: ['Cure', 'Poisona', 'Aero'] },
  { name: 'Ingus', job: 3, level: 12, jobLevel: 7, hp: 182, gear: ['Bronze Knuckles', 'Bronze Knuckles', 'Headband', 'Kenpo Gi', ''], mpUsed: 0, spells: [] },
];
const BAG: [string, number][] = [['Potion', 14], ['Phoenix Down', 3], ['Eye Drops', 2], ['Antidote', 5], ['Echo Herbs', 4], ['Dagger', 1], ['Poison', 1]];
const CHOCOBO: [string, number][] = [['Leather Shield', 2], ['Potion', 10]];
const KEYS = ['Folding Canoe'];
/** The Wind Crystal's jobs: Warrior, Monk, White Mage, Black Mage, Red Mage and Thief. */
const OPEN_JOBS = [2, 3, 4, 5, 6, 9];

export function buildFf3DsSample(): Uint8Array {
  const d = new Uint8Array(SAVE_SIZE);
  const at = slotBase(0);
  d.set([...MAGIC].map((c) => c.charCodeAt(0)), at);
  le.setU32(d, at + LENGTH, SLOT_SPACING);
  writeSampleGame(d, at, DS_LAYOUT);
  writeChecksum(d, 0);
  return d;
}

/** Write the sample game into the save slot at `at`, where `L` says each thing goes. */
export function writeSampleGame(d: Uint8Array, at: number, L: Ff3Layout): void {
  le.setU32(d, at + L.gil, 4_820);
  le.setU32(d, at + L.seconds, 3 * 3600 + 25 * 60); // play time
  d[at + L.jobMenu] = 1; // the Job menu is open
  for (const j of [0, ...OPEN_JOBS]) d[at + L.jobs + j] = 1;
  // Items: the bag from place 0, key items from place 384, the Fat Chocobo from place 448; FFFF marks an empty place.
  for (let i = 0; i < 832; i++) le.setU16(d, at + L.items + i * 4, 0xffff);
  const list = (from: number, items: [string, number][]) => items.forEach(([name, n], i) => {
    le.setU16(d, at + L.items + (from + i) * 4, id(name));
    le.setU16(d, at + L.items + 2 + (from + i) * 4, n);
  });
  list(0, BAG);
  list(384, KEYS.map((k) => [k, 1]));
  list(448, CHOCOBO);
  PARTY.forEach((m, i) => {
    const r = at + L.party + i * L.stride;
    const o = r + L.shift; // the fields after the name
    d[r] = 1;
    d.set(L.names.encode(m.name), r + 1);
    d[o + 0x0e] = i;
    d[o + 0x0f] = m.level;
    le.setU32(d, o + 0x10, expFor(m.level) + 37 * m.level);
    le.setU32(d, o + 0x18, m.hp);
    le.setU32(d, o + 0x1c, m.hp);
    const { stats, maxMp } = growth(m.job, m.level);
    maxMp.forEach((v, k) => {
      const mp = Math.max(0, v - (k === 0 ? m.mpUsed : 0));
      d[o + 0x20 + k * 2] = mp;
      d[o + 0x21 + k * 2] = v;
      d[o + 0x30 + k] = mp;
    });
    const gear = m.gear.map((g) => (g ? id(g) : 0));
    stats.forEach((v, k) => {
      d[o + 0x38 + k] = v;
      d[o + 0x3d + k] = Math.min(99, v + gear.reduce((n, g) => n + (bonus.get(g)?.[k] ?? 0), 0));
    });
    gear.forEach((g, k) => { le.setU16(d, o + 0x86 + k * 4, g || (k < 2 ? L.noHand : 0xff9d)); d[o + 0x88 + k * 4] = g ? 1 : 0; });
    for (let k = 0; k < 24; k++) le.setU32(d, o + 0x9c + k * 4, L.noSpell);
    const rows = new Map<number, number[]>();
    for (const sp of m.spells) {
      const level = SPELLS.find((x) => x[1] === sp)![3];
      rows.set(level, [...(rows.get(level) ?? []), id(sp)]);
    }
    for (const [level, ids] of rows) ids.forEach((sp, k) => le.setU32(d, o + 0x9c + ((level - 1) * 3 + k) * 4, sp));
    le.setU32(d, o + 0xfc, m.job);
    for (let j = 0; j < 23; j++) d[o + 0x104 + j * 0x14] = 1; // every job starts at job level 1
    // Everyone was a Freelancer first, to job level 4; a job's battle commands are filled in once someone takes it.
    for (const [j, jl] of [[0, 4], [m.job, m.jobLevel]]) {
      d[o + 0x104 + j * 0x14] = jl;
      COMMANDS[j].forEach((c, k) => le.setU16(d, o + 0x104 + j * 0x14 + 8 + k * 2, c));
    }
    COMMANDS[m.job].slice(0, 4).forEach((c, k) => { d[o + 0x2d2 + k] = c; });
  });
}
