// Final Fantasy I (Dawn of Souls, GBA) save model: the three Final Fantasy I files of the cartridge (see layout.ts).
// Every field reads and writes the save's bytes directly; serialize() redoes the checksum of each file that loaded.
// Offsets were found by comparing real saves with new ones made in mGBA, and checked by loading edited saves in mGBA:
// the party, the bag, gil, key items and ailments all show up in the game's menus.

import { clamp } from '../bytes.ts';
import type { ChangeGroup, EditableSave, SummaryLine } from '../types.ts';
import { FF1, FILE_COUNT, fileBase, fileOk, writeChecksum } from './layout.ts';
import { ARMOR, ARMOR_JOBS, ARMOR_SLOT, CONSUMABLES, KEY_ITEMS, SPELLS, SPELL_JOBS, WEAPONS, WEAPON_JOBS } from './tables.ts';

export const CLASS_NAMES = [
  'Warrior', 'Thief', 'Monk', 'Red Mage', 'White Mage', 'Black Mage',
  'Knight', 'Ninja', 'Master', 'Red Wizard', 'White Wizard', 'Black Wizard',
] as const;
export const GEAR_SLOTS = ['Weapon', 'Shield', 'Helmet', 'Body', 'Gloves'] as const;
/** Ailments the menu shows, by the status bits the save keeps. */
export const AILMENTS = [{ bit: 0, label: 'None' }, { bit: 1, label: 'KO' }, { bit: 2, label: 'Stone' }, { bit: 4, label: 'Poison' }] as const;

export const MAX_GIL = 999_999;
export const MAX_LEVEL = 99;
export const MAX_EXP = 9_999_999;
export const MAX_HP = 999;
export const MAX_MP = 999;
export const MAX_STAT = 99;
export const MAX_ITEM = 99;
export const NAME_LENGTH = 6;
export const SPELLS_PER_LEVEL = 3;

/** Offsets inside a Final Fantasy I file. */
const FILE = { chars: 0x22, charStride: 0x48, items: 0x144, itemCount: 178, gil: 0x40c, playTime: 0x410, keyItemsEnd: 0x748 };
/** Offsets inside a character record. */
const CH = {
  name: 0x02, cls: 0x0f, status: 0x10, level: 0x11, exp: 0x12, hp: 0x16, maxHp: 0x18, mp: 0x1a, maxMp: 0x1c,
  str: 0x1f, agi: 0x20, int: 0x21, sta: 0x22, luck: 0x23, gear: 0x2a, spells: 0x2f,
};
const SPELL_SLOTS = 24;

/** The four Orbs in the order the menu and the load screen show them. */
export const ORB_NAMES = ['Fire', 'Earth', 'Wind', 'Water'] as const;
/** Each Orb's story flag as [offset, bit], in ORB_NAMES order: the load screen and the menu both draw the Orbs from these,
 * and the game keeps no other copy (checked in mGBA by lighting them in a fresh save and letting the game save again). */
const ORB_FLAGS: readonly (readonly [number, number])[] = [[0x72a, 0x08], [0x72a, 0x02], [0x72c, 0x04], [0x72b, 0x20]];

export const STAT_KEYS = ['str', 'agi', 'int', 'sta', 'luck'] as const;
export type StatKey = typeof STAT_KEYS[number];
export const STAT_LABELS: Record<StatKey, string> = { str: 'Strength', agi: 'Agility', int: 'Intellect', sta: 'Stamina', luck: 'Luck' };

export const CATEGORIES = { item: 1, weapon: 2, armor: 3 } as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_NAMES: Record<Category, readonly string[]> = { item: CONSUMABLES, weapon: WEAPONS, armor: ARMOR };

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const setU16 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >> 8) & 0xff; };
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const setU32 = (d: Uint8Array, o: number, v: number) => { for (let i = 0; i < 4; i++) d[o + i] = (v >>> (8 * i)) & 0xff; };

export const canEquipWeapon = (cls: number, id: number) => id > 0 && !!(WEAPON_JOBS[id - 1] & (1 << cls));
export const canEquipArmor = (cls: number, id: number) => id > 0 && !!(ARMOR_JOBS[id - 1] & (1 << cls));
export const canLearn = (cls: number, spell: number) => spell > 0 && !!(SPELL_JOBS[spell - 1] & (1 << cls));
export const spellLevel = (spell: number) => (((spell - 1) & 31) >> 2) + 1;
export const armorFor = (slot: number) => ARMOR.map((_, i) => i + 1).filter((id) => ARMOR_SLOT[id - 1] === slot - 1);

// ---------- names: full-width Shift-JIS, two bytes a letter ----------

const PUNCTUATION: Record<string, number> = { '.': 0x8144, ',': 0x8143, '!': 0x8149, '?': 0x8148, "'": 0x8166, '-': 0x815d, '&': 0x8195 };
const ENCODE = new Map<string, number>();
for (let i = 0; i < 26; i++) { ENCODE.set(String.fromCharCode(65 + i), 0x8260 + i); ENCODE.set(String.fromCharCode(97 + i), 0x8281 + i); }
for (let i = 0; i < 10; i++) ENCODE.set(String(i), 0x824f + i);
for (const [c, v] of Object.entries(PUNCTUATION)) ENCODE.set(c, v);
const DECODE = new Map([...ENCODE].map(([c, v]) => [v, c]));

export function decodeName(d: Uint8Array, o: number): string {
  let s = '';
  for (let i = 0; i < NAME_LENGTH; i++) {
    const v = (d[o + i * 2] << 8) | d[o + i * 2 + 1];
    if (!v) break;
    s += v === 0x8140 ? ' ' : DECODE.get(v) ?? '?';
  }
  return s.trimEnd();
}
export const asSaved = (text: string) => [...text].filter((c) => ENCODE.has(c)).slice(0, NAME_LENGTH).join('');

// ---------- a character ----------

export class Ff1GbaChar {
  private readonly d: Uint8Array;
  private readonly o: number;
  readonly index: number;
  constructor(d: Uint8Array, fileAt: number, index: number) {
    this.d = d;
    this.index = index;
    this.o = fileAt + FILE.chars + index * FILE.charStride;
  }

  get name() { return decodeName(this.d, this.o + CH.name); }
  set name(text: string) {
    const clean = asSaved(text);
    if (clean === this.name) return; // keep letters this editor can't show, unless the name really changed
    const at = this.o + CH.name;
    this.d.fill(0, at, at + NAME_LENGTH * 2);
    [...clean].forEach((c, i) => { const v = ENCODE.get(c)!; this.d[at + i * 2] = v >> 8; this.d[at + i * 2 + 1] = v & 0xff; });
  }
  get cls() { return this.d[this.o + CH.cls]; }
  set cls(v: number) { this.d[this.o + CH.cls] = clamp(v, 0, 11); }
  /** The menu's ailment: 0 none, 1 KO, 2 stone, 4 poison (other bits only matter in battle and are kept). */
  get ailment() { const s = this.d[this.o + CH.status]; return s & 1 ? 1 : s & 2 ? 2 : s & 4 ? 4 : 0; }
  set ailment(v: number) {
    const at = this.o + CH.status;
    this.d[at] = (this.d[at] & ~7) | (v & 7);
    if (v === 1) this.hp = 0;
    else if (this.hp === 0) this.hp = 1;
  }
  get level() { return this.d[this.o + CH.level]; }
  set level(v: number) { this.d[this.o + CH.level] = clamp(v, 1, MAX_LEVEL); }
  get exp() { return u32(this.d, this.o + CH.exp); }
  set exp(v: number) { setU32(this.d, this.o + CH.exp, clamp(v, 0, MAX_EXP)); }
  get hp() { return u16(this.d, this.o + CH.hp); }
  set hp(v: number) { setU16(this.d, this.o + CH.hp, clamp(v, 0, this.maxHp)); }
  get maxHp() { return u16(this.d, this.o + CH.maxHp); }
  set maxHp(v: number) { setU16(this.d, this.o + CH.maxHp, clamp(v, 1, MAX_HP)); if (this.hp > this.maxHp) this.hp = this.maxHp; }
  get mp() { return u16(this.d, this.o + CH.mp); }
  set mp(v: number) { setU16(this.d, this.o + CH.mp, clamp(v, 0, this.maxMp)); }
  get maxMp() { return u16(this.d, this.o + CH.maxMp); }
  set maxMp(v: number) { setU16(this.d, this.o + CH.maxMp, clamp(v, 0, MAX_MP)); if (this.mp > this.maxMp) this.mp = this.maxMp; }
  stat(k: StatKey) { return this.d[this.o + CH[k]]; }
  setStat(k: StatKey, v: number) { this.d[this.o + CH[k]] = clamp(v, 1, MAX_STAT); }

  gear(slot: number) { return this.d[this.o + CH.gear + slot]; }
  setGear(slot: number, id: number) {
    const max = slot === 0 ? WEAPONS.length : ARMOR.length;
    if (id < 0 || id > max || (slot > 0 && id && ARMOR_SLOT[id - 1] !== slot - 1)) return;
    this.d[this.o + CH.gear + slot] = id;
  }
  canWear(slot: number, id: number) { return slot === 0 ? canEquipWeapon(this.cls, id) : canEquipArmor(this.cls, id); }

  // Spells sit in fixed places: three per spell level, level 1 in places 0-2, level 2 in 3-5 and so on, 0 for an empty
  // place. The magic menu shows each place on its level's row.
  get spells(): number[] {
    return [...this.d.subarray(this.o + CH.spells, this.o + CH.spells + SPELL_SLOTS)].filter((s) => s > 0 && s <= 64);
  }
  knows(spell: number) { return this.spells.includes(spell); }
  /** Learn or forget a spell. Learning fails (returns false) when its level already has three. */
  setKnows(spell: number, on: boolean): boolean {
    if (on === this.knows(spell)) return true;
    const at = this.o + CH.spells + (spellLevel(spell) - 1) * SPELLS_PER_LEVEL;
    for (let k = 0; k < SPELLS_PER_LEVEL; k++) {
      const v = this.d[at + k];
      if (on && !v) { this.d[at + k] = spell; return true; }
      if (!on && v === spell) { this.d[at + k] = 0; return true; }
    }
    return false;
  }

  restore() { if (this.ailment === 1) this.ailment = 0; this.hp = this.maxHp; this.mp = this.maxMp; }
}

// ---------- a file ----------

export interface ItemStack { cat: Category; id: number; count: number }
const CAT_BY_NUMBER: Record<number, Category> = { 1: 'item', 2: 'weapon', 3: 'armor' };

export class Ff1GbaFile {
  private readonly d: Uint8Array;
  readonly at: number;
  readonly number: number;
  readonly used: boolean;
  readonly party: Ff1GbaChar[];
  constructor(d: Uint8Array, index: number) {
    this.d = d;
    this.number = index + 1;
    this.at = fileBase(FF1, index);
    this.used = fileOk(d, FF1, index);
    this.party = [0, 1, 2, 3].map((i) => new Ff1GbaChar(d, this.at, i));
  }
  get gil() { return u32(this.d, this.at + FILE.gil); }
  set gil(v: number) { setU32(this.d, this.at + FILE.gil, clamp(v, 0, MAX_GIL)); }
  get playTime() { return u32(this.d, this.at + FILE.playTime); }

  // The bag is 178 four-byte cells [category, id, count, x]. The fourth byte belongs to a separate list that shares
  // the space, so it is never moved or cleared.
  private cell(i: number) { return this.at + FILE.items + i * 4; }
  get items(): ItemStack[] {
    const out: ItemStack[] = [];
    for (let i = 0; i < FILE.itemCount; i++) {
      const at = this.cell(i);
      const cat = CAT_BY_NUMBER[this.d[at]];
      if (!cat || !this.d[at + 1]) continue;
      const have = out.find((x) => x.cat === cat && x.id === this.d[at + 1]);
      if (have) have.count += this.d[at + 2];
      else out.push({ cat, id: this.d[at + 1], count: this.d[at + 2] });
    }
    return out;
  }
  count(cat: Category, id: number) { return this.items.find((x) => x.cat === cat && x.id === id)?.count ?? 0; }
  setCount(cat: Category, id: number, count: number) {
    if (id < 1 || id > CATEGORY_NAMES[cat].length) return;
    const n = clamp(count, 0, MAX_ITEM);
    let placed = false;
    for (let i = 0; i < FILE.itemCount; i++) {
      const at = this.cell(i);
      if (CAT_BY_NUMBER[this.d[at]] !== cat || this.d[at + 1] !== id) continue;
      if (placed || !n) { this.d[at] = 0; this.d[at + 1] = 0; this.d[at + 2] = 0; continue; }
      this.d[at + 2] = n;
      placed = true;
    }
    if (placed || !n) return;
    // a new item goes in the first free cell, as the game does
    for (let i = 0; i < FILE.itemCount; i++) {
      const at = this.cell(i);
      if (CAT_BY_NUMBER[this.d[at]] && this.d[at + 1]) continue;
      this.d[at] = CATEGORIES[cat]; this.d[at + 1] = id; this.d[at + 2] = n;
      return;
    }
  }
  get bagFull() { return this.items.length >= FILE.itemCount; }

  /** Orb `i` (see ORB_NAMES), lit or dark. */
  orbLit(i: number) {
    const [o, bit] = ORB_FLAGS[i];
    return (this.d[this.at + o] & bit) !== 0;
  }
  setOrb(i: number, on: boolean) {
    const [o, bit] = ORB_FLAGS[i];
    this.d[this.at + o] = on ? this.d[this.at + o] | bit : this.d[this.at + o] & ~bit;
  }

  /** Key items are bits counting down from the top bit of the byte before +0x748: id 1 (the Lute) is bit 7 of +0x747. */
  private keyBit(id: number) { return { at: this.at + FILE.keyItemsEnd - 1 - ((id - 1) >> 3), bit: 0x80 >> ((id - 1) & 7) }; }
  hasKeyItem(id: number) { const { at, bit } = this.keyBit(id); return (this.d[at] & bit) !== 0; }
  setKeyItem(id: number, on: boolean) {
    if (id < 1 || id > KEY_ITEMS.length) return;
    const { at, bit } = this.keyBit(id);
    this.d[at] = on ? this.d[at] | bit : this.d[at] & ~bit;
  }
}

// ---------- the whole save ----------

export const formatPlayTime = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;

export class Ff1GbaSave implements EditableSave {
  readonly data: Uint8Array;
  readonly files: Ff1GbaFile[];
  constructor(data: Uint8Array) {
    this.data = data.slice();
    this.files = Array.from({ length: FILE_COUNT }, (_, i) => new Ff1GbaFile(this.data, i));
    if (!this.usedFiles.length) throw new Error('This Dawn of Souls save has no Final Fantasy I files.');
  }
  get usedFiles() { return this.files.filter((f) => f.used); }

  serialize(): Uint8Array {
    const out = this.data.slice();
    for (const f of this.usedFiles) writeChecksum(out, f.at, FF1.size);
    return out;
  }

  summary(): SummaryLine[] {
    return this.usedFiles.map((f) => ({
      label: `FILE ${f.number}`,
      value: `${f.party[0].name || '—'} Lv ${f.party[0].level} · ${f.gil.toLocaleString('en-US')} gil · ${formatPlayTime(f.playTime)}`,
    }));
  }

  describeChanges(before: EditableSave): ChangeGroup[] {
    return describeChanges(before as Ff1GbaSave, this);
  }
}

function describeChanges(b: Ff1GbaSave, a: Ff1GbaSave): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const add = (title: string, lines: string[]) => {
    if (lines.length) groups.push(lines.length > 12 ? { title, lines: lines.slice(0, 12), more: lines.length - 12 } : { title, lines });
  };
  const several = a.usedFiles.length > 1;
  const ailment = (v: number) => AILMENTS.find((x) => x.bit === v)!.label;
  for (const fa of a.usedFiles) {
    const fb = b.files[fa.number - 1];
    const prefix = several ? `File ${fa.number}: ` : '';
    fa.party.forEach((ca, i) => {
      const cb = fb.party[i];
      const lines: string[] = [];
      const diff = (label: string, x: string | number, y: string | number) => {
        if (x !== y) lines.push(`${label}: ${typeof x === 'number' ? x.toLocaleString('en-US') : x} → ${typeof y === 'number' ? y.toLocaleString('en-US') : y}`);
      };
      diff('Name', cb.name, ca.name);
      diff('Class', CLASS_NAMES[cb.cls], CLASS_NAMES[ca.cls]);
      diff('Level', cb.level, ca.level);
      diff('Exp', cb.exp, ca.exp);
      diff('HP', `${cb.hp}/${cb.maxHp}`, `${ca.hp}/${ca.maxHp}`);
      diff('MP', `${cb.mp}/${cb.maxMp}`, `${ca.mp}/${ca.maxMp}`);
      diff('Ailment', ailment(cb.ailment), ailment(ca.ailment));
      for (const k of STAT_KEYS) diff(STAT_LABELS[k], cb.stat(k), ca.stat(k));
      GEAR_SLOTS.forEach((slot, g) => {
        const names = g === 0 ? WEAPONS : ARMOR;
        diff(slot, names[cb.gear(g) - 1] ?? 'None', names[ca.gear(g) - 1] ?? 'None');
      });
      for (const s of ca.spells) if (!cb.knows(s)) lines.push(`Learned ${SPELLS[s - 1]}`);
      for (const s of cb.spells) if (!ca.knows(s)) lines.push(`Forgot ${SPELLS[s - 1]}`);
      const same = fa.party.filter((c) => c.name === ca.name).length > 1;
      add(prefix + (ca.name ? (same ? `${ca.name} (${i + 1})` : ca.name) : `Member ${i + 1}`), lines);
    });
    const items: string[] = [];
    if (fb.gil !== fa.gil) items.push(`Gil: ${fb.gil.toLocaleString('en-US')} → ${fa.gil.toLocaleString('en-US')}`);
    for (const cat of Object.keys(CATEGORIES) as Category[]) {
      CATEGORY_NAMES[cat].forEach((name, i) => {
        const x = fb.count(cat, i + 1), y = fa.count(cat, i + 1);
        if (x !== y) items.push(`${name}: ${x} → ${y}`);
      });
    }
    KEY_ITEMS.forEach((name, i) => {
      if (fb.hasKeyItem(i + 1) !== fa.hasKeyItem(i + 1)) items.push(`${name}: ${fa.hasKeyItem(i + 1) ? 'added' : 'removed'}`);
    });
    add(`${prefix}Items`, items);
    add(`${prefix}Orbs`, ORB_NAMES.flatMap((n, i) => fb.orbLit(i) === fa.orbLit(i) ? [] : [`${n} Orb: ${fa.orbLit(i) ? 'lit' : 'dark'}`]));
  }
  return groups;
}
