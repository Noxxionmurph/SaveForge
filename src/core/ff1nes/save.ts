// Final Fantasy (NES, US) save model. Every field reads and writes the saved 1 KB block directly, so serialize() only has
// to put the block back and fix the checksum. Offsets are from Disch's disassembly (variables.inc), relative to $6400.

import { clamp } from '../bytes.ts';
import type { ChangeGroup, EditableSave, SummaryLine } from '../types.ts';
import {
  ARMOR, ARMOR_PERMS, ARMOR_STATS, ARMOR_TYPES, CONSUMABLES, EXP_TO_LEVEL, KEY_ITEMS, MAGIC_PERMS, SPELLS, WEAPONS, WEAPON_PERMS, WEAPON_STATS,
} from './tables.ts';
import { ASSERT_55, ASSERT_AA, BLOCK, CHECKSUM, SAVE_SIZE, SAVED, checksum, checksumOk, hasMarkers } from './layout.ts';
import { NAME_LENGTH, decodeName, encodeName } from './text.ts';

export const CLASS_NAMES = [
  'Fighter', 'Thief', 'Black Belt', 'Red Mage', 'White Mage', 'Black Mage',
  'Knight', 'Ninja', 'Master', 'Red Wizard', 'White Wizard', 'Black Wizard',
] as const;
export const AILMENTS = ['None', 'Dead', 'Stone', 'Poison'] as const;
export const ORB_NAMES = ['Fire', 'Water', 'Air', 'Earth'] as const;

export const MAX_GOLD = 999_999;
export const MAX_HP = 999;
export const MAX_STAT = 99;
export const MAX_LEVEL = 50;
export const MAX_EXP = 0xffffff;
export const MAX_ITEM = 99;
export const MAX_MP = 9;

const OFF = {
  shipVis: 0x00,
  airshipVis: 0x04,
  bridgeVis: 0x08,
  canalVis: 0x0c,
  hasCanoe: 0x12,
  gold: 0x1c,
  items: 0x20,
  chars: 0x100,
  magic: 0x300,
};
/** Inside a character's 64 bytes of stats. */
const CH = {
  class: 0x00, ailment: 0x01, name: 0x02, exp: 0x07, hp: 0x0a, maxHp: 0x0c,
  str: 0x10, agi: 0x11, int: 0x12, vit: 0x13, luck: 0x14, expToNext: 0x16, weapons: 0x18, armor: 0x1c,
  damage: 0x20, hit: 0x21, absorb: 0x22, evade: 0x23, resist: 0x24, magDef: 0x25, level: 0x26,
};
/** The airship's "raised" value: it flashes while counting up to $1F after the Floater, then stays. */
const AIRSHIP_UP = 0x1f;

export const STAT_KEYS = ['str', 'agi', 'int', 'vit', 'luck'] as const;
export type StatKey = typeof STAT_KEYS[number];
export const SUBSTAT_KEYS = ['damage', 'hit', 'absorb', 'evade', 'magDef'] as const;
export type SubstatKey = typeof SUBSTAT_KEYS[number];

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const setU16 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >> 8) & 0xff; };
const u24 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8) | (d[o + 2] << 16);
const setU24 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >> 8) & 0xff; d[o + 2] = (v >> 16) & 0xff; };

/** Can `cls` equip weapon `id` (1-based)? Same test as the game's equip menu (IsEquipLegal). */
export const canEquipWeapon = (cls: number, id: number) => !(WEAPON_PERMS[id - 1] & (0x800 >> cls));
export const canEquipArmor = (cls: number, id: number) => !(ARMOR_PERMS[id - 1] & (0x800 >> cls));
/** Can `cls` learn spell `spell` (0-63)? Same test as the magic shop. */
export const canLearn = (cls: number, spell: number) => !(MAGIC_PERMS[cls][spell >> 3] & (0x80 >> (spell & 7)));
/** Does `cls` learn anything at this spell level (0-7)? */
export const levelOpen = (cls: number, level: number) => MAGIC_PERMS[cls][level] !== 0xff;
export const usesMagic = (cls: number) => MAGIC_PERMS[cls].some((b) => b !== 0xff);

/** Total Exp a character has on reaching `level` (1-50). */
export const expForLevel = (level: number) => (level <= 1 ? 0 : EXP_TO_LEVEL[level - 2]);

/** One gear slot: the item (1-based, 0 = empty) and whether it is worn. */
export interface Gear { id: number; equipped: boolean }

/** One party member, read and written straight through to the save block. */
export class Ff1Char {
  private readonly d: Uint8Array;
  readonly index: number;
  constructor(d: Uint8Array, index: number) { this.d = d; this.index = index; }
  private get o() { return OFF.chars + this.index * 0x40; }
  private get m() { return OFF.magic + this.index * 0x40; }
  private get(k: keyof typeof CH) { return this.d[this.o + CH[k]]; }
  private set(k: keyof typeof CH, v: number) { this.d[this.o + CH[k]] = v & 0xff; }

  get cls() { return this.get('class'); }
  /** Changes class only (as the promotion at Bahamut does): stats, gear and spells stay. */
  set cls(v: number) { this.set('class', clamp(v, 0, 11)); }
  get ailment() { return this.get('ailment'); }
  set ailment(v: number) { this.set('ailment', clamp(v, 0, 3)); }
  get name() { return decodeName(this.d.subarray(this.o + CH.name, this.o + CH.name + NAME_LENGTH)); }
  set name(v: string) { this.d.set(encodeName(v), this.o + CH.name); }

  /** 1-50 (the game stores it 0-based). */
  get level() { return this.get('level') + 1; }
  get exp() { return u24(this.d, this.o + CH.exp); }
  get hp() { return u16(this.d, this.o + CH.hp); }
  set hp(v: number) { setU16(this.d, this.o + CH.hp, clamp(v, 0, MAX_HP)); }
  get maxHp() { return u16(this.d, this.o + CH.maxHp); }
  set maxHp(v: number) { setU16(this.d, this.o + CH.maxHp, clamp(v, 1, MAX_HP)); }

  /**
   * Set the level and move Exp to the start of it (if it is outside that level's range), keeping the "Exp for next level"
   * figure on the status screen right. Stats, HP and MP don't change: the game rolls those as you level up.
   */
  setLevel(level: number): void {
    const lv = clamp(level, 1, MAX_LEVEL);
    this.set('level', lv - 1);
    const lo = expForLevel(lv), hi = lv < MAX_LEVEL ? expForLevel(lv + 1) : Infinity;
    if (this.exp < lo || this.exp >= hi) setU24(this.d, this.o + CH.exp, lo);
    this.syncExpToNext();
  }
  /** Set Exp; the level follows, as it would after the next battle. */
  setExp(exp: number): void {
    const e = clamp(exp, 0, MAX_EXP);
    setU24(this.d, this.o + CH.exp, e);
    let lv = 1;
    while (lv < MAX_LEVEL && e >= expForLevel(lv + 1)) lv++;
    this.set('level', lv - 1);
    this.syncExpToNext();
  }
  /** The status screen's "next level" figure (the game keeps it in the save; 0 at level 50). */
  get expToNext() { return u16(this.d, this.o + CH.expToNext); }
  private syncExpToNext(): void {
    const lv = this.level;
    setU16(this.d, this.o + CH.expToNext, lv >= MAX_LEVEL ? 0 : Math.max(0, expForLevel(lv + 1) - this.exp) & 0xffff);
  }

  stat(k: StatKey) { return this.get(k); }
  setStat(k: StatKey, v: number) { this.set(k, clamp(v, 1, MAX_STAT)); }
  substat(k: SubstatKey) { return this.get(k); }
  setSubstat(k: SubstatKey, v: number) { this.set(k, clamp(v, 0, 255)); }

  weapon(slot: number): Gear { const b = this.d[this.o + CH.weapons + slot]; return { id: b & 0x7f, equipped: (b & 0x80) !== 0 && (b & 0x7f) !== 0 }; }
  armor(slot: number): Gear { const b = this.d[this.o + CH.armor + slot]; return { id: b & 0x7f, equipped: (b & 0x80) !== 0 && (b & 0x7f) !== 0 }; }

  /**
   * Change a weapon or armor slot. The game works out Damage, Hit %, Absorb, Evade % and elemental resistance from the
   * gear worn only when you leave its equip menu, so a change here takes the old gear's numbers off and puts the new
   * gear's on, step for step as the game's own routines do (UnadjustEquipStats / ReadjustEquipStats in bank_0F.asm).
   * Wearing a second weapon, or a second piece of the same armor type, takes the first one off, as in the game.
   */
  setGear(kind: 'weapon' | 'armor', slot: number, gear: Gear): void {
    const base = this.o + (kind === 'weapon' ? CH.weapons : CH.armor);
    this.unadjust(kind);
    const id = clamp(gear.id, 0, 40);
    const wear = gear.equipped && id !== 0;
    if (wear) {
      for (let i = 0; i < 4; i++) {
        if (i === slot) continue;
        const other = this.d[base + i];
        if (!(other & 0x80)) continue;
        if (kind === 'weapon' || ARMOR_TYPES[(other & 0x7f) - 1] === ARMOR_TYPES[id - 1]) this.d[base + i] = other & 0x7f;
      }
    }
    this.d[base + slot] = id | (wear ? 0x80 : 0);
    this.readjust(kind);
  }

  private worn(kind: 'weapon' | 'armor'): number[] {
    const base = this.o + (kind === 'weapon' ? CH.weapons : CH.armor);
    return [0, 1, 2, 3].map((i) => this.d[base + i]).filter((b) => b & 0x80 && b & 0x7f).map((b) => (b & 0x7f) - 1);
  }
  private isMonk() { return this.cls === 2 || this.cls === 8; }
  private unadjust(kind: 'weapon' | 'armor'): void {
    for (const id of this.worn(kind)) {
      if (kind === 'weapon') {
        this.set('hit', this.get('hit') - WEAPON_STATS[id][0]);
        this.set('damage', this.get('damage') - WEAPON_STATS[id][1]);
      } else {
        this.set('evade', this.get('evade') + ARMOR_STATS[id][0]);
      }
    }
    if (kind === 'weapon') { if (this.isMonk()) this.set('damage', 0); }
    else { this.set('absorb', 0); this.set('resist', 0); }
  }
  private readjust(kind: 'weapon' | 'armor'): void {
    for (const id of this.worn(kind)) {
      if (kind === 'weapon') {
        this.set('hit', this.get('hit') + WEAPON_STATS[id][0]);
        this.set('damage', this.get('damage') + WEAPON_STATS[id][1]);
      } else {
        this.set('evade', this.get('evade') - ARMOR_STATS[id][0]);
        this.set('absorb', this.get('absorb') + ARMOR_STATS[id][1]);
        this.set('resist', this.get('resist') | ARMOR_STATS[id][2]);
      }
    }
    if (!this.isMonk()) return;
    if (kind === 'weapon') {
      const dmg = this.get('damage');
      const str = this.get('str');
      // LSR then ADC: the bit shifted out of Strength comes back in as the carry.
      this.set('damage', dmg ? (str >> 1) + dmg + (str & 1) : this.level * 2);
    } else if (this.get('absorb') === 0) {
      this.set('absorb', this.level);
    }
  }

  /** The spell in slot 0-2 of a level (0-7), as 0-63, or -1 for an empty slot. */
  spell(level: number, slot: number): number {
    const v = this.d[this.m + level * 4 + slot];
    return v >= 1 && v <= 8 ? level * 8 + v - 1 : -1;
  }
  setSpell(level: number, slot: number, spell: number): void {
    this.d[this.m + level * 4 + slot] = spell < 0 ? 0 : (spell & 7) + 1;
  }
  mp(level: number) { return this.d[this.m + 0x20 + level]; }
  maxMp(level: number) { return this.d[this.m + 0x28 + level]; }
  setMp(level: number, v: number) { this.d[this.m + 0x20 + level] = clamp(v, 0, MAX_MP); }
  setMaxMp(level: number, v: number) { this.d[this.m + 0x28 + level] = clamp(v, 0, MAX_MP); }
}

export class Ff1NesSave implements EditableSave {
  /** The saved 1 KB block ($6400-$67FF), edited in place. */
  readonly block: Uint8Array;
  readonly party: Ff1Char[];
  private readonly file: Uint8Array;
  private readonly checksumWasOk: boolean;

  constructor(data: Uint8Array) {
    if (data.length < SAVE_SIZE) throw new Error(`Final Fantasy saves are ${SAVE_SIZE.toLocaleString('en-US')} bytes (got ${data.length.toLocaleString('en-US')}).`);
    this.file = data.slice();
    this.block = this.file.slice(SAVED, SAVED + BLOCK);
    if (!hasMarkers(this.block)) throw new Error('This file has no Final Fantasy save in it (the game has never saved to it).');
    this.checksumWasOk = checksumOk(this.block);
    this.party = [0, 1, 2, 3].map((i) => new Ff1Char(this.block, i));
  }

  get gold() { return u24(this.block, OFF.gold); }
  set gold(v: number) { setU24(this.block, OFF.gold, clamp(v, 0, MAX_GOLD)); }

  /** Key item 1-17 (Lute ... Canoe). */
  hasKeyItem(id: number) { return this.block[OFF.items + id] !== 0; }
  setKeyItem(id: number, on: boolean) { this.block[OFF.items + id] = on ? 1 : 0; }
  /** Orb 0-3 (Fire, Water, Air, Earth), lit or dark. */
  orbLit(i: number) { return this.block[OFF.items + 0x12 + i] !== 0; }
  setOrb(i: number, on: boolean) { this.block[OFF.items + 0x12 + i] = on ? 1 : 0; }
  /** Consumable 0-5 (Tent ... Soft Potion). */
  count(i: number) { return this.block[OFF.items + 0x16 + i]; }
  setCount(i: number, v: number) { this.block[OFF.items + 0x16 + i] = clamp(v, 0, MAX_ITEM); }

  get ship() { return this.block[OFF.shipVis] !== 0; }
  set ship(on: boolean) { this.block[OFF.shipVis] = on ? 1 : 0; }
  get airship() { return this.block[OFF.airshipVis] !== 0; }
  set airship(on: boolean) { this.block[OFF.airshipVis] = on ? AIRSHIP_UP : 0; }
  /** Riding the canoe needs this; the Canoe key item is only what shows in the item list. */
  get canoe() { return this.block[OFF.hasCanoe] !== 0; }
  set canoe(on: boolean) { this.block[OFF.hasCanoe] = on ? 1 : 0; }
  get bridge() { return this.block[OFF.bridgeVis] !== 0; }
  set bridge(on: boolean) { this.block[OFF.bridgeVis] = on ? 1 : 0; }
  /** The canal starts filled in; Nerrick clears it with the TNT. */
  get canalDug() { return this.block[OFF.canalVis] === 0; }
  set canalDug(on: boolean) { this.block[OFF.canalVis] = on ? 0 : 1; }

  serialize(): Uint8Array {
    const out = this.file.slice();
    const b = this.block.slice();
    b[ASSERT_55] = 0x55;
    b[ASSERT_AA] = 0xaa;
    // As SaveGame does: zero the checksum byte, sum, store the sum inverted. Then check, as Continue will.
    b[CHECKSUM] = 0;
    b[CHECKSUM] = checksum(b) ^ 0xff;
    for (let v = 0; v < 0x100 && !checksumOk(b); v++) b[CHECKSUM] = v;
    out.set(b, SAVED);
    return out;
  }

  loadNote(): string | null {
    return this.checksumWasOk ? null
      : "This file failed the game's save check, so Continue would start a new game. Saving fixes the check, so the game loads it as shown here.";
  }

  summary(): SummaryLine[] {
    return [
      ...this.party.map((c) => ({ label: c.name || '—', value: `${CLASS_NAMES[c.cls]} Lv ${c.level}` })),
      { label: 'GOLD', value: `${this.gold.toLocaleString('en-US')} G` },
    ];
  }

  describeChanges(before: EditableSave): ChangeGroup[] {
    return describeFf1Changes(before as Ff1NesSave, this);
  }
}

// The review list. Kept in this file because it is small and only reads the getters above.
function describeFf1Changes(b: Ff1NesSave, a: Ff1NesSave): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const add = (title: string, lines: string[]) => { if (lines.length) groups.push(lines.length > 12 ? { title, lines: lines.slice(0, 12), more: lines.length - 12 } : { title, lines }); };

  a.party.forEach((ca, i) => {
    const cb = b.party[i];
    // Party members can share a name (a new game's default is four of the same), so say which slot when they do.
    const shared = a.party.filter((c) => c.name === ca.name).length > 1;
    const who = !ca.name ? `Character ${i + 1}` : shared ? `${ca.name} (${i + 1})` : ca.name;
    const out: string[] = [];
    if (cb.name !== ca.name) out.push(`Name: ${cb.name || '—'} → ${ca.name || '—'}`);
    if (cb.cls !== ca.cls) out.push(`Class: ${CLASS_NAMES[cb.cls]} → ${CLASS_NAMES[ca.cls]}`);
    if (cb.level !== ca.level) out.push(`Level: ${cb.level} → ${ca.level}`);
    if (cb.exp !== ca.exp) out.push(`Exp: ${cb.exp.toLocaleString('en-US')} → ${ca.exp.toLocaleString('en-US')}`);
    if (cb.hp !== ca.hp || cb.maxHp !== ca.maxHp) out.push(`HP: ${cb.hp}/${cb.maxHp} → ${ca.hp}/${ca.maxHp}`);
    if (cb.ailment !== ca.ailment) out.push(`Status: ${AILMENTS[cb.ailment]} → ${AILMENTS[ca.ailment]}`);
    const statName = { str: 'Strength', agi: 'Agility', int: 'Intelligence', vit: 'Vitality', luck: 'Luck' } as const;
    for (const k of STAT_KEYS) if (cb.stat(k) !== ca.stat(k)) out.push(`${statName[k]}: ${cb.stat(k)} → ${ca.stat(k)}`);
    const subName = { damage: 'Damage', hit: 'Hit %', absorb: 'Absorb', evade: 'Evade %', magDef: 'Magic defense' } as const;
    for (const k of SUBSTAT_KEYS) if (cb.substat(k) !== ca.substat(k)) out.push(`${subName[k]}: ${cb.substat(k)} → ${ca.substat(k)}`);
    const gear = (c: Ff1Char, kind: 'weapon' | 'armor') => [0, 1, 2, 3].map((s) => (kind === 'weapon' ? c.weapon(s) : c.armor(s)));
    for (const kind of ['weapon', 'armor'] as const) {
      const names = kind === 'weapon' ? WEAPONS : ARMOR;
      const label = (g: Gear) => (g.id ? `${names[g.id - 1]}${g.equipped ? ' (worn)' : ''}` : 'empty');
      gear(cb, kind).forEach((g, s) => {
        const n = gear(ca, kind)[s];
        if (g.id !== n.id || g.equipped !== n.equipped) out.push(`${kind === 'weapon' ? 'Weapon' : 'Armor'} ${s + 1}: ${label(g)} → ${label(n)}`);
      });
    }
    const spells = (c: Ff1Char) => new Set(Array.from({ length: 24 }, (_, k) => c.spell(k / 3 | 0, k % 3)).filter((s) => s >= 0));
    const sb = spells(cb), sa = spells(ca);
    const learned = [...sa].filter((s) => !sb.has(s)).map((s) => SPELLS[s]);
    const forgot = [...sb].filter((s) => !sa.has(s)).map((s) => SPELLS[s]);
    if (learned.length) out.push(`Learned ${learned.join(', ')}`);
    if (forgot.length) out.push(`Forgot ${forgot.join(', ')}`);
    const mp = (c: Ff1Char) => Array.from({ length: 8 }, (_, l) => `${c.mp(l)}/${c.maxMp(l)}`).join(' ');
    if (mp(cb) !== mp(ca)) out.push(`MP (levels 1-8): ${mp(cb)} → ${mp(ca)}`);
    add(who, out);
  });

  const items: string[] = [];
  if (b.gold !== a.gold) items.push(`Gold: ${b.gold.toLocaleString('en-US')} → ${a.gold.toLocaleString('en-US')}`);
  CONSUMABLES.forEach((n, i) => { if (b.count(i) !== a.count(i)) items.push(`${n}: ${b.count(i)} → ${a.count(i)}`); });
  const gained = KEY_ITEMS.filter((_, i) => !b.hasKeyItem(i + 1) && a.hasKeyItem(i + 1));
  const lost = KEY_ITEMS.filter((_, i) => b.hasKeyItem(i + 1) && !a.hasKeyItem(i + 1));
  if (gained.length) items.push(`Added ${gained.join(', ')}`);
  if (lost.length) items.push(`Removed ${lost.join(', ')}`);
  add('Items', items);

  const world: string[] = [];
  ORB_NAMES.forEach((n, i) => { if (b.orbLit(i) !== a.orbLit(i)) world.push(`${n} Orb: ${a.orbLit(i) ? 'lit' : 'dark'}`); });
  const flag = (label: string, x: boolean, y: boolean, on: string, off: string) => { if (x !== y) world.push(`${label}: ${y ? on : off}`); };
  flag('Ship', b.ship, a.ship, 'yours', 'not yet');
  flag('Canoe', b.canoe, a.canoe, 'can ride', 'not yet');
  flag('Airship', b.airship, a.airship, 'raised', 'not yet');
  flag('Bridge north of Coneria', b.bridge, a.bridge, 'built', 'not yet');
  flag('Canal', b.canalDug, a.canalDug, 'dug', 'not yet');
  add('World', world);
  return groups;
}
