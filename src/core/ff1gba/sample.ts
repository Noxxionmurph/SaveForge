// A made-up Dawn of Souls save, built in code, for tests and the browser checks. Nothing here comes from a real game
// file. It fills in only what the editor reads (File 1's party, bag, gil, play time and key items), so it opens here but
// is not a save the game itself would start from: the map, story flags and window settings it would also need are left
// blank. That's why the landing page has no Dawn of Souls sample button.

import { FF1, HEADER_SIZE, MAGIC, SRAM_SIZE, writeChecksum } from './layout.ts';
import { ARMOR, CONSUMABLES, KEY_ITEMS, SPELLS, WEAPONS } from './tables.ts';

const id = (list: readonly string[], name: string) => {
  const i = list.indexOf(name);
  if (i < 0) throw new Error(`sample: no ${name}`);
  return i + 1;
};

interface Member {
  name: string; cls: number; level: number; exp: number; hp: number; mp: number;
  stats: [number, number, number, number, number];
  gear: [string, string, string, string, string]; spells?: string[];
}

const PARTY: Member[] = [
  { name: 'Brom', cls: 0, level: 24, exp: 31_250, hp: 512, mp: 0, stats: [38, 20, 9, 31, 17],
    gear: ['Flame Sword', 'Iron Shield', 'Helm', 'Iron Armor', 'Bronze Gloves'] },
  { name: 'Wren', cls: 1, level: 23, exp: 29_480, hp: 371, mp: 0, stats: [24, 36, 13, 18, 30],
    gear: ['Saber', '', 'Leather Cap', 'Leather Armor', 'Leather Gloves'] },
  { name: 'Ivy', cls: 4, level: 22, exp: 27_903, hp: 298, mp: 96, stats: [15, 14, 33, 20, 12],
    gear: ['Healing Staff', '', 'Leather Cap', 'Light Robe', ''], spells: ['Cure', 'Dia', 'Protect', 'Blindna', 'Silence', 'Invis', 'Cura', 'Heal', 'Diara', 'Life', 'Vox', 'Poisona'] },
  { name: 'Oren', cls: 5, level: 22, exp: 27_655, hp: 254, mp: 112, stats: [9, 18, 38, 12, 20],
    gear: ['Staff', '', '', 'Silver Armlet', ''], spells: ['Fire', 'Sleep', 'Thunder', 'Blizzard', 'Dark', 'Slow', 'Fira', 'Hold', 'Thundara', 'Blizzara', 'Haste', 'Confuse'] },
];

const BAG: [number, string, number][] = [
  [1, 'Potion', 24], [1, 'Hi-Potion', 6], [1, 'Ether', 4], [1, 'Phoenix Down', 5], [1, 'Antidote', 9], [1, 'Gold Needle', 3],
  [1, 'Eye Drops', 4], [1, 'Echo Grass', 2], [1, 'Tent', 3], [1, 'Cottage', 1], [1, 'Sleeping Bag', 2],
  [2, 'Longsword', 1], [2, 'Dagger', 2], [3, 'Chain Mail', 1], [3, 'Buckler', 1],
];
const KEYS = ['Lute', 'Mystic Key', 'Nitro Powder', 'Canoe', 'Crown'];

const fullWidth = (c: string) => {
  const code = c.charCodeAt(0);
  return code >= 97 ? 0x8281 + code - 97 : code >= 65 ? 0x8260 + code - 65 : 0x824f + code - 48;
};

export function buildFf1GbaSample(): Uint8Array {
  const d = new Uint8Array(SRAM_SIZE).fill(0xff);
  d.set(MAGIC);
  d.set([HEADER_SIZE, 0, 0, 0], 0x20);
  const s = FF1.base;
  d.fill(0, s, s + FF1.size);
  d.set(MAGIC, s);
  const v = new DataView(d.buffer);
  PARTY.forEach((m, i) => {
    const r = s + 0x22 + i * 0x48;
    v.setUint16(r, 2, true);
    [...m.name].forEach((c, k) => v.setUint16(r + 2 + k * 2, fullWidth(c), false));
    d[r + 0x0f] = m.cls;
    d[r + 0x11] = m.level;
    v.setUint32(r + 0x12, m.exp, true);
    v.setUint16(r + 0x16, m.hp - 23 * i, true);
    v.setUint16(r + 0x18, m.hp, true);
    v.setUint16(r + 0x1a, m.mp, true);
    v.setUint16(r + 0x1c, m.mp, true);
    d.set(m.stats, r + 0x1f);
    m.gear.forEach((g, k) => { d[r + 0x2a + k] = g ? id(k === 0 ? WEAPONS : ARMOR, g) : 0; });
    for (const name of m.spells ?? []) { // three places per spell level
      const sp = id(SPELLS, name), lv = ((sp - 1) & 31) >> 2;
      const k = [0, 1, 2].find((x) => !d[r + 0x2f + lv * 3 + x]);
      if (k === undefined) throw new Error(`sample: too many level ${lv + 1} spells`);
      d[r + 0x2f + lv * 3 + k] = sp;
    }
  });
  BAG.forEach(([cat, name, n], i) => d.set([cat, id(cat === 1 ? CONSUMABLES : cat === 2 ? WEAPONS : ARMOR, name), n], s + 0x144 + i * 4));
  v.setUint32(s + 0x40c, 18_420, true);
  v.setUint32(s + 0x410, 9 * 3600 + 41 * 60, true);
  for (const k of KEYS) {
    const n = id(KEY_ITEMS, k);
    d[s + 0x747 - ((n - 1) >> 3)] |= 0x80 >> ((n - 1) & 7);
  }
  writeChecksum(d, s, FF1.size);
  return d;
}
