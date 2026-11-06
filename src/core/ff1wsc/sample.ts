// A made-up Final Fantasy (WonderSwan Color) save, built in code, for tests and the browser checks. File 1 holds a
// mid-game party in Corneria; its header, map position and window settings are the ones a new game saved at the
// Corneria inn has, so the game itself loads it too. Nothing else comes from a real game file.

import { MAGIC, SRAM_SIZE, fileBase, writeChecksum } from './layout.ts';
import { Ff1WscChar, asSaved } from './save.ts';
import { ARMOR, CONSUMABLES, KEY_ITEMS, SPELLS, WEAPONS } from './tables.ts';

const n = (list: readonly string[], name: string) => {
  const i = list.indexOf(name);
  if (i < 0) throw new Error(`sample: no ${name}`);
  return i + 1;
};

interface Member {
  name: string; cls: number; level: number; exp: number; hp: number;
  stats: [number, number, number, number, number];
  gear: [string, string, string, string, string]; // weapon, body, shield, helmet, gloves
  mp?: number[]; spells?: string[];
}

const PARTY: Member[] = [
  { name: 'ブロム', cls: 0, level: 24, exp: 31_250, hp: 512, stats: [38, 20, 9, 31, 17],
    gear: ['Flame Sword', 'Iron Armor', 'Iron Shield', 'Helm', 'Bronze Gloves'] },
  { name: 'レン', cls: 1, level: 23, exp: 29_480, hp: 371, stats: [24, 36, 13, 18, 30],
    gear: ['Saber', 'Leather Armor', '', 'Leather Cap', 'Leather Gloves'] },
  { name: 'Ivy', cls: 4, level: 22, exp: 27_903, hp: 298, stats: [15, 14, 33, 20, 12],
    gear: ['Hammer', 'Copper Armlet', '', 'Leather Cap', ''], mp: [9, 7, 5, 3],
    spells: ['Cure', 'Dia', 'Protect', 'Blindna', 'Silence', 'Invis', 'Cura', 'Heal', 'Diara', 'Life', 'Vox', 'Poisona'] },
  { name: 'オレン', cls: 5, level: 22, exp: 27_655, hp: 254, stats: [9, 18, 38, 12, 20],
    gear: ['Staff', 'Silver Armlet', '', '', ''], mp: [9, 7, 5, 3],
    spells: ['Fire', 'Sleep', 'Thunder', 'Blizzard', 'Dark', 'Slow', 'Fira', 'Hold', 'Thundara', 'Blizzara', 'Haste', 'Confuse'] },
];
const BAG: [number, string, number][] = [
  [0x20, 'Potion', 24], [0x20, 'Antidote', 9], [0x20, 'Gold Needle', 3], [0x20, 'Tent', 3], [0x20, 'Cottage', 1],
  [0x20, 'Sleeping Bag', 2], [0x40, 'Longsword', 1], [0x40, 'Dagger', 2], [0x70, 'Chain Mail', 1], [0x70, 'Buckler', 1],
];
const KEYS = ['Lute', 'Crown', 'Crystal Eye', 'Jolt Tonic', 'Mystic Key', 'Nitro Powder', 'Canoe'];

// What the game writes at the top of a file saved at the Corneria inn on a new game: "F1", the map and position,
// and the window colours of the CONFIG menu.
const HEAD: [number, number[]][] = [
  [0x00, [0x46, 0x31, 0x91, 0x9c, 0x3b, 0x00, 0x0c, 0x09, 0x00, 0xcb, 0x92, 0xd6, 0xe6]],
  [0x46, [0x80]],
  [0x4e, [0xa7, 0x03, 0x02, 0x00, 0x07, 0x01]],
  [0x60, [0xff, 0x0f, 0x00, 0x00, 0x00, 0x32, 0x03, 0x66, 0x06, 0x88, 0x08, 0xaa, 0x0a, 0xee, 0x0e, 0x49, 0x03, 0x39, 0x03]],
];

export function buildFf1WscSample(): Uint8Array {
  const d = new Uint8Array(SRAM_SIZE);
  [...MAGIC].forEach((c, i) => { d[0x10 + i] = c.charCodeAt(0); });
  d[0x1bb0] = 0x25; d[0x1bb1] = 0x01;
  const at = fileBase(0);
  for (const [o, bytes] of HEAD) d.set(bytes, at + o);

  PARTY.forEach((m, i) => {
    const r = at + 0x15d + i * 0x58;
    d[r] = m.cls;
    d[r + 3] = m.level;
    new DataView(d.buffer).setUint32(r + 4, m.exp, true);
    for (const o of [8, 10]) { d[r + o] = m.hp & 0xff; d[r + o + 1] = m.hp >> 8; }
    d.set(m.stats, r + 0x0c);
    d.fill(0xff, r + 0x48, r + 0x58);
    const c = new Ff1WscChar(d, at, i);
    d.fill(0xfb, r + 0x16, r + 0x1a);
    d[r + 0x1a] = 0xff;
    c.name = asSaved(m.name);
    (m.mp ?? []).forEach((v, l) => { d[r + 0x23 + l] = v; d[r + 0x1b + l] = v; });
    m.gear.forEach((g, slot) => { if (g) c.setGear(slot, n(slot === 0 ? WEAPONS : ARMOR, g)); });
    for (const s of m.spells ?? []) c.setKnows(n(SPELLS, s), true);
  });
  BAG.forEach(([base, name, count], i) => {
    d[at + 0x93 + i * 2] = base + n(base === 0x20 ? CONSUMABLES : base === 0x40 ? WEAPONS : ARMOR, name) - 1;
    d[at + 0x93 + i * 2 + 1] = count;
  });
  KEYS.forEach((k, i) => { d[at + 0x73 + i] = n(KEY_ITEMS, k); });
  new DataView(d.buffer).setUint32(at + 0x13f, 48_230, true);
  new DataView(d.buffer).setUint32(at + 0x143, 9_874, true);
  d.set([7, 42, 13, 0], at + 0x147);
  writeChecksum(d, 0);
  return d;
}
