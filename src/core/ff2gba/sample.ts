// A made-up Final Fantasy II (Dawn of Souls) save, built in code, for tests and the browser checks. Nothing here comes
// from a real game file. Like the Final Fantasy I one (../ff1gba/sample.ts) it fills in only what the editor reads, so
// the game itself wouldn't start from it.

import { FF2, HEADER_SIZE, MAGIC, SRAM_SIZE, writeChecksum } from '../ff1gba/layout.ts';
import { ITEMS, SPELLS } from './tables.ts';

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
  name: string; hp: number; mp: number; stats: [number, number, number, number, number, number];
  skills: number[]; gear: [string, string, string, string, string]; spells: [string, number][];
}
// Firion, Maria, Guy and Minwu early on, after Fynn falls, then the other guests' records, which the game fills in from
// the start. Leon's has no name until he joins: the one typed for him at the start waits at + 0x700.
const PARTY: Member[] = [
  { name: 'Firion', hp: 412, mp: 38, stats: [24, 18, 21, 12, 10, 11], skills: [1, 2, 5, 1, 1, 2, 1, 4],
    gear: ['Mythril Sword', 'Bronze Shield', 'Leather Cap', 'Leather Armor', 'Leather Gloves'], spells: [['Fire', 3], ['Cure', 2]] },
  { name: 'Maria', hp: 298, mp: 74, stats: [14, 22, 15, 18, 20, 21], skills: [1, 1, 1, 3, 1, 1, 5, 1],
    gear: ['Longbow', 'Hands', 'Leather Cap', 'Leather Armor', ''], spells: [['Cure', 4], ['Blizzard', 2], ['Protect', 1]] },
  { name: 'Guy', hp: 505, mp: 20, stats: [28, 14, 25, 8, 9, 10], skills: [3, 1, 1, 1, 6, 1, 1, 2],
    gear: ['Battle Axe', 'Bronze Shield', 'Bronze Helm', 'Bronze Armor', 'Bronze Gloves'], spells: [['Thunder', 1]] },
  { name: 'Minwu', hp: 240, mp: 120, stats: [12, 16, 14, 16, 30, 26], skills: [1, 1, 1, 6, 1, 1, 1, 1],
    gear: ['Mage\'s Staff', 'Hands', '', 'White Robe', ''], spells: [['Cure', 6], ['Life', 3], ['Esuna', 2], ['Barrier', 2]] },
  { name: 'Josef', hp: 1581, mp: 5, stats: [30, 24, 30, 10, 10, 10], skills: [4, 1, 1, 1, 1, 1, 1, 1],
    gear: ['Hands', 'Hands', '', 'Leather Armor', 'Leather Gloves'], spells: [] },
  { name: 'Gordon', hp: 128, mp: 5, stats: [22, 22, 22, 22, 22, 22], skills: [1, 1, 3, 1, 1, 1, 1, 1],
    gear: ['Longsword', 'Hands', '', 'Bronze Armor', 'Bronze Gloves'], spells: [] },
  { name: 'Leila', hp: 248, mp: 20, stats: [18, 26, 18, 16, 10, 10], skills: [1, 3, 1, 1, 1, 1, 1, 1],
    gear: ['Dagger', 'Hands', '', 'Leather Armor', ''], spells: [['Fire', 2]] },
  { name: 'Ricard', hp: 549, mp: 5, stats: [40, 26, 32, 16, 26, 5], skills: [1, 1, 1, 1, 1, 6, 1, 1],
    gear: ['Mythril Spear', 'Bronze Shield', 'Bronze Helm', 'Bronze Armor', 'Bronze Gloves'], spells: [] },
  { name: '', hp: 1098, mp: 5, stats: [53, 45, 46, 36, 16, 32], skills: [1, 1, 5, 1, 7, 1, 1, 1],
    gear: ['Mythril Sword', 'Bronze Shield', 'Bronze Helm', 'Bronze Armor', 'Bronze Gloves'], spells: [] },
];
const BAG: [string, number][] = [
  ['Potion', 18], ['Antidote', 6], ['Gold Needle', 3], ['Phoenix Down', 2], ['Ether', 2], ['Cottage', 1],
  ['Longsword', 1], ['Bronze Armor', 1], ['Fire Tome', 1], ['Ring', 1],
];

export function buildFf2GbaSample(): Uint8Array {
  const d = new Uint8Array(SRAM_SIZE).fill(0xff);
  d.set(MAGIC);
  d.set([HEADER_SIZE, 0, 0, 0], 0x20);
  const s = FF2.base;
  d.fill(0, s, s + FF2.size);
  d.set(MAGIC, s);
  const v = new DataView(d.buffer);
  PARTY.forEach((m, i) => {
    const r = s + 0x22 + i * 0x80;
    d[r + 2] = i;
    [...m.name].forEach((c, k) => v.setUint16(r + 4 + k * 2, fullWidth(c), false));
    v.setUint16(r + 0x14, m.hp - 17 * i, true);
    v.setUint16(r + 0x16, m.hp, true);
    v.setUint16(r + 0x18, m.mp, true);
    v.setUint16(r + 0x1a, m.mp, true);
    d.set(m.stats, r + 0x1c);
    d.set(m.stats, r + 0x2c);
    m.gear.forEach((g, k) => { d[r + 0x25 + k] = g ? item(g) : 0; });
    m.spells.forEach(([name, lv], k) => { d[r + 0x3c + k] = SPELLS.indexOf(name) + 1; d[r + 0x5c + k * 2 + 1] = lv; });
    m.skills.forEach((lv, k) => { d[r + 0x4c + k * 2 + 1] = lv; });
  });
  d[s + 0x4b2] = 3;
  [...'Leon'].forEach((c, k) => v.setUint16(s + 0x700 + k * 2, fullWidth(c), false));
  v.setUint32(s + 0x4a4, 4_210, true);
  v.setUint32(s + 0x4a8, 3_250, true);
  v.setUint32(s + 0x4ac, 2 * 3600 + 7 * 60, true);
  BAG.forEach(([name, n], i) => { d[s + 0x4b4 + i] = item(name); d[s + 0x54a + i] = n; });
  d[s + 0x6cc] = 2; d[s + 0x6cd] = 1; d[s + 0x6ff] = 2; // key terms: Mythril, learned after Wild Rose
  writeChecksum(d, s, FF2.size);
  return d;
}
