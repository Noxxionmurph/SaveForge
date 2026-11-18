// Final Fantasy (WonderSwan Color, Japan) save model: the eight save files and the quick save (see layout.ts).
// Every field reads and writes the save's bytes directly; serialize() redoes the checksum of each used file.
// Offsets were found by saving in Mednafen's WonderSwan core and by writing values into a save and reading them back in
// the game's menus (status, equip, magic and item screens all show them).

import { clamp } from '../bytes.ts';
import type { ChangeGroup, EditableSave, SummaryLine } from '../types.ts';
import { FILE_COUNT, QUICK_SAVE, fileBase, fileUsed, writeChecksum } from './layout.ts';
import { ARMOR, ARMOR_JOBS, ARMOR_SLOT, CONSUMABLES, KEY_ITEMS, SPELLS, SPELL_JOBS, WEAPONS, WEAPON_JOBS } from './tables.ts';

/** Class names by the number the save keeps. 6 and 7 aren't classes; the promoted ones are 8-13. */
export const CLASSES: { id: number; name: string }[] = [
  'Warrior', 'Thief', 'Monk', 'Red Mage', 'White Mage', 'Black Mage', '', '',
  'Knight', 'Ninja', 'Master', 'Red Wizard', 'White Wizard', 'Black Wizard',
].map((name, id) => ({ id, name })).filter((c) => c.name);
export const className = (cls: number) => CLASSES.find((c) => c.id === cls)?.name ?? `Class ${cls}`;

/** The gear places in the order the save keeps them. */
export const GEAR_SLOTS = ['Weapon', 'Body', 'Shield', 'Helmet', 'Gloves'] as const;
/** The equip screen's order: weapon, shield, helmet, body, gloves. */
export const GEAR_ORDER = [0, 2, 3, 1, 4] as const;
/** Ailments by status bit, as the menus name them (the same bits as the NES game). */
export const AILMENTS = [
  { bit: 0, label: 'None' }, { bit: 0x01, label: 'KO' }, { bit: 0x02, label: 'Stone' }, { bit: 0x04, label: 'Poison' },
  { bit: 0x08, label: 'Blind' }, { bit: 0x10, label: 'Paralysis' }, { bit: 0x20, label: 'Sleep' },
  { bit: 0x40, label: 'Silence' }, { bit: 0x80, label: 'Confusion' },
] as const;

export const MAX_GIL = 999_999;
export const MAX_LEVEL = 50;
export const MAX_EXP = 9_999_999;
export const MAX_HP = 999;
export const MAX_MP = 9;
export const MAX_STAT = 99;
export const MAX_ITEM = 99;
export const NAME_LENGTH = 4;
export const SPELLS_PER_LEVEL = 3;

/** Offsets inside a save file. */
const FILE = { keyItems: 0x73, keySlots: 32, bag: 0x93, bagSlots: 86, gil: 0x13f, steps: 0x143, hours: 0x147, chars: 0x15d, charStride: 0x58 };
/** Offsets inside a character. */
const CH = {
  cls: 0x00, status: 0x01, level: 0x03, exp: 0x04, hp: 0x08, maxHp: 0x0a, str: 0x0c, agi: 0x0d, int: 0x0e, vit: 0x0f, luck: 0x10,
  name: 0x16, mp: 0x1b, maxMp: 0x23, gear: 0x2b, spells: 0x30,
};
const SPELL_SLOTS = 24;

/** The four Orbs in the order the menu shows them. */
export const ORB_NAMES = ['Fire', 'Earth', 'Wind', 'Water'] as const;
/** Each Orb's story flag as [offset, bit], in ORB_NAMES order. The game copies the four into bits 0-3 of ORB_BITS, which
 * the menu draws from, so an Orb is lit or dark in both places. Found by lighting them in Mednafen: a save with only the
 * flags set gets ORB_BITS filled in when the game saves again. */
const ORB_FLAGS: readonly (readonly [number, number])[] = [[0x30, 0x08], [0x30, 0x02], [0x32, 0x04], [0x31, 0x20]];
const ORB_BITS = 0x14b;

export const STAT_KEYS = ['str', 'agi', 'int', 'vit', 'luck'] as const;
export type StatKey = typeof STAT_KEYS[number];
export const STAT_LABELS: Record<StatKey, string> = { str: 'Strength', agi: 'Agility', int: 'Intelligence', vit: 'Vitality', luck: 'Luck' };

/** Bag categories and the first save id of each (an item's number in its list + base - 1). */
export const CATEGORIES = { item: 0x20, weapon: 0x40, armor: 0x70 } as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_NAMES: Record<Category, readonly string[]> = { item: CONSUMABLES, weapon: WEAPONS, armor: ARMOR };
const categoryOf = (id: number): Category | null => {
  for (const cat of Object.keys(CATEGORIES) as Category[]) {
    const n = id - CATEGORIES[cat] + 1;
    if (n >= 1 && n <= CATEGORY_NAMES[cat].length) return cat;
  }
  return null;
};

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const setU16 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >> 8) & 0xff; };
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const setU32 = (d: Uint8Array, o: number, v: number) => { for (let i = 0; i < 4; i++) d[o + i] = (v >>> (8 * i)) & 0xff; };

export const canEquipWeapon = (cls: number, n: number) => n > 0 && !!(WEAPON_JOBS[n - 1] & (1 << cls));
export const canEquipArmor = (cls: number, n: number) => n > 0 && !!(ARMOR_JOBS[n - 1] & (1 << cls));
export const canLearn = (cls: number, spell: number) => spell > 0 && !!(SPELL_JOBS[spell - 1] & (1 << cls));
export const spellLevel = (spell: number) => (((spell - 1) & 31) >> 2) + 1;
/** Armor numbers (1-40) for one of the four armor places (1 body ... 4 gloves). */
export const armorFor = (slot: number) => ARMOR.map((_, i) => i + 1).filter((n) => ARMOR_SLOT[n - 1] === slot);

// ---------- names: the game's own characters, 4 a name, 0xFB after a short one ----------

const HIRAGANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
  + 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょ';
const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'
  + 'ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポァィゥェォッャュョ';
const ENCODE = new Map<string, number>();
[...HIRAGANA].forEach((c, i) => ENCODE.set(c, i));
[...KATAKANA].forEach((c, i) => ENCODE.set(c, 0x50 + i));
for (let i = 0; i < 26; i++) { ENCODE.set(String.fromCharCode(65 + i), 0xa1 + i); ENCODE.set(String.fromCharCode(97 + i), 0xbb + i); }
for (let i = 0; i < 10; i++) ENCODE.set(String(i), 0xd5 + i);
ENCODE.set('ー', 0xf1);
const DECODE = new Map([...ENCODE].map(([c, v]) => [v, c]));
const PAD = 0xfb;

export function decodeName(d: Uint8Array, o: number): string {
  let s = '';
  for (let i = 0; i < NAME_LENGTH; i++) {
    const v = d[o + i];
    if (v === PAD || v === 0xff) break;
    s += DECODE.get(v) ?? '?';
  }
  return s;
}
/** What a typed name becomes: kana, letters, digits and ー, up to four. */
export const asSaved = (text: string) => [...text].filter((c) => ENCODE.has(c)).slice(0, NAME_LENGTH).join('');

// ---------- a character ----------

export class Ff1WscChar {
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
    if (clean === this.name || !clean) return; // keep what this editor can't show unless the name really changed
    const at = this.o + CH.name;
    this.d.fill(PAD, at, at + NAME_LENGTH);
    [...clean].forEach((c, i) => { this.d[at + i] = ENCODE.get(c)!; });
  }
  get cls() { return this.d[this.o + CH.cls]; }
  set cls(v: number) { if (CLASSES.some((c) => c.id === v)) this.d[this.o + CH.cls] = v; }
  /** The status byte's first ailment, as the menu shows it (0 for none). */
  get ailment() { const s = this.d[this.o + CH.status]; return s ? s & -s : 0; }
  set ailment(v: number) {
    this.d[this.o + CH.status] = v & 0xff;
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
  stat(k: StatKey) { return this.d[this.o + CH[k]]; }
  setStat(k: StatKey, v: number) { this.d[this.o + CH[k]] = clamp(v, 1, MAX_STAT); }

  /** Spell charges (MP) for spell level 1-8: current and max. */
  mp(level: number) { return this.d[this.o + CH.mp + level - 1]; }
  maxMp(level: number) { return this.d[this.o + CH.maxMp + level - 1]; }
  setMp(level: number, v: number) { this.d[this.o + CH.mp + level - 1] = clamp(v, 0, this.maxMp(level)); }
  setMaxMp(level: number, v: number) {
    this.d[this.o + CH.maxMp + level - 1] = clamp(v, 0, MAX_MP);
    if (this.mp(level) > this.maxMp(level)) this.setMp(level, this.maxMp(level));
  }
  get hasMp() { return [1, 2, 3, 4, 5, 6, 7, 8].some((l) => this.maxMp(l) > 0); }

  /**
   * Gear place 0-4 in the save's order (weapon, body, shield, helmet, gloves): the weapon's or armor's number in its
   * list (1-40), 0 for nothing. The save keeps item ids (0x40+ weapons, 0x70+ armor).
   */
  gear(slot: number) {
    const id = this.d[this.o + CH.gear + slot];
    if (!id) return 0;
    const n = id - (slot === 0 ? CATEGORIES.weapon : CATEGORIES.armor) + 1;
    return n >= 1 && n <= 40 ? n : 0;
  }
  setGear(slot: number, n: number) {
    if (n < 0 || n > 40 || (slot > 0 && n && ARMOR_SLOT[n - 1] !== slot)) return;
    this.d[this.o + CH.gear + slot] = n ? n - 1 + (slot === 0 ? CATEGORIES.weapon : CATEGORIES.armor) : 0;
  }
  canWear(slot: number, n: number) { return slot === 0 ? canEquipWeapon(this.cls, n) : canEquipArmor(this.cls, n); }

  // Spells sit in fixed places, three per spell level: level 1 in places 0-2, level 2 in 3-5 and so on, 0 for an empty
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

  restore() {
    if (this.ailment === 1) this.ailment = 0;
    this.hp = this.maxHp;
    for (let l = 1; l <= 8; l++) this.setMp(l, this.maxMp(l));
  }
}

// ---------- a save file ----------

export interface ItemStack { cat: Category; n: number; count: number }

export class Ff1WscFile {
  private readonly d: Uint8Array;
  readonly at: number;
  readonly index: number;
  readonly used: boolean;
  readonly party: Ff1WscChar[];
  constructor(d: Uint8Array, index: number) {
    this.d = d;
    this.index = index;
    this.at = fileBase(index);
    this.used = fileUsed(d, index);
    this.party = [0, 1, 2, 3].map((i) => new Ff1WscChar(d, this.at, i));
  }
  get label() { return this.index === QUICK_SAVE ? 'Quick save' : `File ${this.index + 1}`; }
  get gil() { return u32(this.d, this.at + FILE.gil); }
  set gil(v: number) { setU32(this.d, this.at + FILE.gil, clamp(v, 0, MAX_GIL)); }
  get steps() { return u32(this.d, this.at + FILE.steps); }
  /** Play time as hours, minutes and seconds (the save also keeps frames). */
  get playTime() {
    const o = this.at + FILE.hours;
    return { h: this.d[o], m: this.d[o + 1], s: this.d[o + 2] };
  }

  // The bag is 86 two-byte cells [item id, count]; the item screen shows them in order. Weapons and armor that aren't
  // worn live here too.
  private cell(i: number) { return this.at + FILE.bag + i * 2; }
  get items(): ItemStack[] {
    const out: ItemStack[] = [];
    for (let i = 0; i < FILE.bagSlots; i++) {
      const at = this.cell(i);
      const id = this.d[at];
      const cat = categoryOf(id);
      if (!cat || !this.d[at + 1]) continue;
      const n = id - CATEGORIES[cat] + 1;
      const have = out.find((x) => x.cat === cat && x.n === n);
      if (have) have.count += this.d[at + 1];
      else out.push({ cat, n, count: this.d[at + 1] });
    }
    return out;
  }
  count(cat: Category, n: number) { return this.items.find((x) => x.cat === cat && x.n === n)?.count ?? 0; }
  setCount(cat: Category, n: number, count: number) {
    if (n < 1 || n > CATEGORY_NAMES[cat].length) return;
    const id = CATEGORIES[cat] + n - 1;
    const c = clamp(count, 0, MAX_ITEM);
    let placed = false;
    for (let i = 0; i < FILE.bagSlots; i++) {
      const at = this.cell(i);
      if (this.d[at] !== id) continue;
      if (placed || !c) { this.d[at] = 0; this.d[at + 1] = 0; continue; }
      this.d[at + 1] = c;
      placed = true;
    }
    if (!placed && c) {
      const free = Array.from({ length: FILE.bagSlots }, (_, i) => i).find((i) => !categoryOf(this.d[this.cell(i)]) || !this.d[this.cell(i) + 1]);
      if (free !== undefined) { this.d[this.cell(free)] = id; this.d[this.cell(free) + 1] = c; }
    }
    this.compactBag();
  }
  /** The item screen stops at the first empty cell, so keep the bag's items together at the front. */
  private compactBag() {
    const cells: [number, number][] = [];
    for (let i = 0; i < FILE.bagSlots; i++) {
      const at = this.cell(i);
      if (this.d[at] && this.d[at + 1]) cells.push([this.d[at], this.d[at + 1]]);
    }
    for (let i = 0; i < FILE.bagSlots; i++) {
      const at = this.cell(i);
      const [id, c] = cells[i] ?? [0, 0];
      this.d[at] = id; this.d[at + 1] = c;
    }
  }
  get bagFull() { return this.items.length >= FILE.bagSlots; }

  /** Orb `i` (see ORB_NAMES), lit or dark. */
  orbLit(i: number) {
    const [o, bit] = ORB_FLAGS[i];
    return (this.d[this.at + o] & bit) !== 0;
  }
  setOrb(i: number, on: boolean) {
    const [o, bit] = ORB_FLAGS[i];
    const flip = (at: number, b: number) => { this.d[at] = on ? this.d[at] | b : this.d[at] & ~b; };
    flip(this.at + o, bit);
    flip(this.at + ORB_BITS, 1 << i);
  }

  // Key items: a list of 32 item ids (1-17) at +0x73, in the order they were found.
  private get keyList() { return [...this.d.subarray(this.at + FILE.keyItems, this.at + FILE.keyItems + FILE.keySlots)]; }
  hasKeyItem(k: number) { return this.keyList.includes(k); }
  setKeyItem(k: number, on: boolean) {
    if (k < 1 || k > KEY_ITEMS.length || on === this.hasKeyItem(k)) return;
    const list = this.keyList.filter((v) => v && v !== k);
    if (on) list.push(k);
    for (let i = 0; i < FILE.keySlots; i++) this.d[this.at + FILE.keyItems + i] = list[i] ?? 0;
  }
}

// ---------- the whole save ----------

export const formatPlayTime = (t: { h: number; m: number }) => `${t.h}:${String(t.m).padStart(2, '0')}`;

export class Ff1WscSave implements EditableSave {
  readonly data: Uint8Array;
  readonly files: Ff1WscFile[];
  constructor(data: Uint8Array) {
    this.data = data.slice();
    this.files = Array.from({ length: FILE_COUNT }, (_, i) => new Ff1WscFile(this.data, i));
    if (!this.usedFiles.length) throw new Error('This Final Fantasy (WonderSwan Color) save has no saved games.');
  }
  get usedFiles() { return this.files.filter((f) => f.used); }

  serialize(): Uint8Array {
    const out = this.data.slice();
    for (const f of this.usedFiles) writeChecksum(out, f.index);
    return out;
  }

  summary(): SummaryLine[] {
    return this.usedFiles.map((f) => ({
      label: f.label.toUpperCase(),
      value: `${f.party[0].name || '—'} Lv ${f.party[0].level} · ${f.gil.toLocaleString('en-US')} gil · ${formatPlayTime(f.playTime)}`,
    }));
  }

  describeChanges(before: EditableSave): ChangeGroup[] {
    return describeChanges(before as Ff1WscSave, this);
  }
}

function describeChanges(b: Ff1WscSave, a: Ff1WscSave): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const add = (title: string, lines: string[]) => {
    if (lines.length) groups.push(lines.length > 12 ? { title, lines: lines.slice(0, 12), more: lines.length - 12 } : { title, lines });
  };
  const several = a.usedFiles.length > 1;
  const ailment = (v: number) => AILMENTS.find((x) => x.bit === v)?.label ?? 'Other';
  for (const fa of a.usedFiles) {
    const fb = b.files[fa.index];
    const prefix = several ? `${fa.label}: ` : '';
    fa.party.forEach((ca, i) => {
      const cb = fb.party[i];
      const lines: string[] = [];
      const diff = (label: string, x: string | number, y: string | number) => {
        if (x !== y) lines.push(`${label}: ${typeof x === 'number' ? x.toLocaleString('en-US') : x} → ${typeof y === 'number' ? y.toLocaleString('en-US') : y}`);
      };
      diff('Name', cb.name, ca.name);
      diff('Class', className(cb.cls), className(ca.cls));
      diff('Level', cb.level, ca.level);
      diff('Exp', cb.exp, ca.exp);
      diff('HP', `${cb.hp}/${cb.maxHp}`, `${ca.hp}/${ca.maxHp}`);
      for (let l = 1; l <= 8; l++) diff(`MP L${l}`, `${cb.mp(l)}/${cb.maxMp(l)}`, `${ca.mp(l)}/${ca.maxMp(l)}`);
      diff('Ailment', ailment(cb.ailment), ailment(ca.ailment));
      for (const k of STAT_KEYS) diff(STAT_LABELS[k], cb.stat(k), ca.stat(k));
      GEAR_ORDER.forEach((g) => {
        const names = g === 0 ? WEAPONS : ARMOR;
        diff(GEAR_SLOTS[g], names[cb.gear(g) - 1] ?? 'None', names[ca.gear(g) - 1] ?? 'None');
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
