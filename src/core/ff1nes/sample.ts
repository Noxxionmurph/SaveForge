// A made-up Final Fantasy (NES) save, built in code, for the "Try a sample save" button and for tests. Nothing here comes
// from a real game: it starts from the game's own new-game tables, then gives a party of four some levels, gear, spells
// and the first Orb, so every part of the editor has something to show.

import { BLOCK, SAVE_SIZE, SAVED } from './layout.ts';
import { Ff1NesSave } from './save.ts';
import { ARMOR, INIT_FLAGS, INIT_PAGE0, SPELLS, START_STATS, WEAPONS } from './tables.ts';

const weapon = (name: string) => WEAPONS.indexOf(name) + 1;
const armor = (name: string) => ARMOR.indexOf(name) + 1;
const spell = (name: string) => SPELLS.indexOf(name);

/** A save as the game writes it right after New Game, before the party is made (no characters yet). */
export function blankFf1NesSave(): Uint8Array {
  const block = new Uint8Array(BLOCK);
  block.set(INIT_PAGE0, 0);
  block.set(INIT_FLAGS, 0x200);
  block[0x14] = 1; // on foot
  for (let i = 0; i < 4; i++) block[0x100 + i * 0x40 + 0x16] = 40; // Exp to level 2
  block[0xfe] = 0x55;
  block[0xff] = 0xaa;
  const file = new Uint8Array(SAVE_SIZE);
  file.set(block, SAVED);
  return file;
}

interface Member {
  name: string; cls: number; level: number; hp: number;
  stats: [number, number, number, number, number];
  weapons: string[]; armor: string[]; spells?: string[]; mp?: number[];
}

const PARTY: Member[] = [
  { name: 'Brom', cls: 0, level: 14, hp: 248, stats: [33, 13, 6, 25, 13], weapons: ['Long Sword', 'Silver Knife'], armor: ['Iron Armor', 'Iron Shield', 'Iron Helmet', 'Copper Gauntlet'] },
  { name: 'Wren', cls: 1, level: 14, hp: 186, stats: [17, 30, 12, 13, 26], weapons: ['Sabre'], armor: ['Wooden Armor', 'Buckler'] },
  { name: 'Ivy', cls: 4, level: 13, hp: 151, stats: [12, 11, 25, 17, 11], weapons: ['Iron Hammer'], armor: ['Cloth', 'Cap'],
    spells: ['CURE', 'HARM', 'LAMP', 'INVS', 'CUR2', 'HEAL', 'PURE'], mp: [6, 5, 4, 2] },
  { name: 'Oren', cls: 5, level: 13, hp: 128, stats: [5, 17, 30, 6, 16], weapons: ['Small Knife'], armor: ['Cloth'],
    spells: ['FIRE', 'SLEP', 'LIT', 'ICE', 'DARK', 'FIR2', 'LIT2', 'HOLD'], mp: [6, 5, 4, 2] },
];

export function buildFf1NesSample(): Uint8Array {
  const s = new Ff1NesSave(blankFf1NesSave());
  const b = s.block;
  PARTY.forEach((m, i) => {
    const c = s.party[i];
    const base = START_STATS[m.cls % 6];
    const o = 0x100 + i * 0x40;
    b[o] = m.cls;
    c.name = m.name;
    // Sub-stats as a new game sets them (bank_0F NewGame_LoadStartingStats), grown a little per level.
    b[o + 0x20] = base[6] + Math.floor(m.stats[0] / 2) - Math.floor(base[1] / 2); // damage
    b[o + 0x21] = base[7] + m.level * 2; // hit %
    b[o + 0x23] = base[8] + m.level; // evade %
    b[o + 0x25] = base[9] + m.level * 2; // magic defense
    m.stats.forEach((v, k) => c.setStat((['str', 'agi', 'int', 'vit', 'luck'] as const)[k], v));
    c.setLevel(m.level);
    c.setExp(c.exp + 211);
    c.maxHp = m.hp;
    c.hp = m.hp - 17 * i;
    m.weapons.forEach((w, k) => c.setGear('weapon', k, { id: weapon(w), equipped: k === 0 }));
    m.armor.forEach((a, k) => c.setGear('armor', k, { id: armor(a), equipped: true }));
    const slots = new Map<number, number>();
    for (const name of m.spells ?? []) {
      const sp = spell(name), lv = sp >> 3, k = slots.get(lv) ?? 0;
      c.setSpell(lv, k, sp);
      slots.set(lv, k + 1);
    }
    (m.mp ?? []).forEach((v, lv) => { c.setMaxMp(lv, v); c.setMp(lv, Math.max(0, v - 1)); });
  });
  s.gold = 4_210;
  for (const id of [1, 5, 10]) s.setKeyItem(id, true); // Lute, Key, Rod
  s.setOrb(3, true); // Earth
  [6, 1, 0, 18, 6, 3].forEach((n, i) => s.setCount(i, n));
  s.ship = true;
  s.bridge = true;
  s.canalDug = true;
  const file = s.serialize();
  file.set(file.subarray(SAVED, SAVED + BLOCK), 0); // the working copy, as right after saving
  return file;
}
