// Final Fantasy (PSP, US) save model. The decrypted save holds up to 20 files (the game's save slots); each field reads
// and writes the decrypted bytes directly, and serialize() hands them back to the container (container.ts), which
// encrypts them again. Offsets were found with the PSP cheat database (CWCheat ULUS-10251) and the FF1 PSP
// Archipelago randomizer's RAM map, then checked against real saves. A file is the game's save block from +0xDC0,
// so a RAM address in that block is file offset + 0xDC0.

import { clamp } from '../bytes.ts';
import type { ChangeGroup, EditableSave, SummaryLine } from '../types.ts';
import { openFf1Psp, type Opened, PLAIN_SIZE, SLOT_COUNT, SLOT_SIZE, type Wrapper } from './container.ts';
import { ARMOR, ARMOR_JOBS, ARMOR_SLOT, CONSUMABLES, KEY_ITEMS, NAME_GLYPHS, SPELLS, SPELL_JOBS, WEAPONS, WEAPON_JOBS } from './tables.ts';

export const CLASS_NAMES = [
  'Warrior', 'Thief', 'Monk', 'Red Mage', 'White Mage', 'Black Mage',
  'Knight', 'Ninja', 'Master', 'Red Wizard', 'White Wizard', 'Black Wizard',
] as const;
export const GEAR_SLOTS = ['Weapon', 'Shield', 'Helmet', 'Body', 'Gloves'] as const;

export const MAX_GIL = 999_999;
export const MAX_LEVEL = 99;
export const MAX_EXP = 9_999_999;
export const MAX_HP = 999;
export const MAX_MP = 999;
export const MAX_STAT = 99;
export const MAX_MAGIC_LEVEL = 8;
export const MAX_ITEM = 99;
export const NAME_LENGTH = 6;
/** A character can know three spells of each spell level (24 in all), as in the original game. */
export const SPELLS_PER_LEVEL = 3;

/** Offsets inside a file. */
const SLOT = { used: 0x01, chars: 0x24, charStride: 0x5c, items: 0x174, itemCount: 185, gil: 0x3a4, playTime: 0x3a8, keyItems: 0x71b };
/** Offsets from a character's level field. Name, class and the fallen flag sit just before it. */
const CH = {
  name: -0x12, cls: -0x02, fallen: -0x01, level: 0x00, exp: 0x04, hp: 0x08, maxHp: 0x0a, mp: 0x0c, maxMp: 0x0e,
  magicLevel: 0x10, str: 0x11, agi: 0x12, int: 0x13, sta: 0x14, luck: 0x15, gear: 0x1c, spells: 0x21,
};
const SPELL_SLOTS = 24;

export const STAT_KEYS = ['str', 'agi', 'int', 'sta', 'luck'] as const;
export type StatKey = typeof STAT_KEYS[number];
export const STAT_LABELS: Record<StatKey, string> = { str: 'Strength', agi: 'Agility', int: 'Intellect', sta: 'Stamina', luck: 'Luck' };

/** Inventory categories, as the save's item records number them. */
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
/** Spell level 1-8 of spell id 1-64. */
export const spellLevel = (spell: number) => (((spell - 1) & 31) >> 2) + 1;
/** Armor ids that go in gear slot 1-4 (shield, helmet, body, gloves). */
export const armorFor = (slot: number) => ARMOR.map((_, i) => i + 1).filter((id) => ARMOR_SLOT[id - 1] === slot - 1);

// ---------- names ----------

const ENCODE = new Map<string, number>(Object.entries(NAME_GLYPHS).map(([g, c]) => [c, Number(g)]));
/** A name as the game shows it. Letters this editor can't show (the kana page of the name screen) read as "?". */
export function decodeName(d: Uint8Array, o: number): string {
  let s = '';
  for (let i = 0; i < 7; i++) {
    const g = u16(d, o + i * 2);
    if (g === 0xffff) break;
    s += NAME_GLYPHS[g] ?? '?';
  }
  return s.trimEnd();
}
/** Characters the name screen can't make are dropped. */
export const asSaved = (text: string) => [...text].filter((c) => ENCODE.has(c)).slice(0, NAME_LENGTH).join('').trimEnd();

// ---------- a character ----------

export class Ff1PspChar {
  private readonly d: Uint8Array;
  private readonly o: number;
  readonly index: number;
  constructor(d: Uint8Array, slotBase: number, index: number) {
    this.d = d;
    this.index = index;
    this.o = slotBase + SLOT.chars + index * SLOT.charStride;
  }

  get name() { return decodeName(this.d, this.o + CH.name); }
  set name(text: string) {
    const clean = asSaved(text);
    if (clean === this.name) return; // keep letters this editor can't show, unless the name really changed
    const at = this.o + CH.name;
    for (let i = 0; i < 7; i++) setU16(this.d, at + i * 2, 0xffff);
    [...clean].forEach((c, i) => setU16(this.d, at + i * 2, ENCODE.get(c)!));
  }
  get cls() { return this.d[this.o + CH.cls]; }
  set cls(v: number) { this.d[this.o + CH.cls] = clamp(v, 0, 11); }
  get fallen() { return this.d[this.o + CH.fallen] !== 0; }
  set fallen(v: boolean) { this.d[this.o + CH.fallen] = v ? 1 : 0; }
  get level() { return u32(this.d, this.o + CH.level); }
  set level(v: number) { setU32(this.d, this.o + CH.level, clamp(v, 1, MAX_LEVEL)); }
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
  get magicLevel() { return this.d[this.o + CH.magicLevel]; }
  set magicLevel(v: number) { this.d[this.o + CH.magicLevel] = clamp(v, 0, MAX_MAGIC_LEVEL); }
  stat(k: StatKey) { return this.d[this.o + CH[k]]; }
  setStat(k: StatKey, v: number) { this.d[this.o + CH[k]] = clamp(v, 1, MAX_STAT); }

  /** Gear slot 0-4 (weapon, shield, helmet, body, gloves): the item id, 0 for none. */
  gear(slot: number) { return this.d[this.o + CH.gear + slot]; }
  setGear(slot: number, id: number) {
    const max = slot === 0 ? WEAPONS.length : ARMOR.length;
    if (id < 0 || id > max || (slot > 0 && id && ARMOR_SLOT[id - 1] !== slot - 1)) return;
    this.d[this.o + CH.gear + slot] = id;
  }
  canWear(slot: number, id: number) { return slot === 0 ? canEquipWeapon(this.cls, id) : canEquipArmor(this.cls, id); }

  /** Known spells (ids 1-64), in the order the save lists them. */
  get spells(): number[] {
    return [...this.d.subarray(this.o + CH.spells, this.o + CH.spells + SPELL_SLOTS)].filter((s) => s > 0 && s <= 64);
  }
  knows(spell: number) { return this.spells.includes(spell); }
  /** Learn or forget a spell. Learning fails (returns false) when its level already has three. */
  setKnows(spell: number, on: boolean): boolean {
    let list = this.spells;
    if (on === list.includes(spell)) return true;
    if (on) {
      if (list.filter((s) => spellLevel(s) === spellLevel(spell)).length >= SPELLS_PER_LEVEL) return false;
      list.push(spell);
    } else list = list.filter((s) => s !== spell);
    // Grouped by spell level like the game's magic menu; within a level, the order they were learned.
    list = list.map((s, i) => ({ s, i })).sort((a, b) => spellLevel(a.s) - spellLevel(b.s) || a.i - b.i).map((x) => x.s);
    const at = this.o + CH.spells;
    this.d.fill(0, at, at + SPELL_SLOTS);
    this.d.set(list, at);
    return true;
  }

  restore() { this.fallen = false; this.hp = this.maxHp; this.mp = this.maxMp; }
}

// ---------- a file (save slot) ----------

export interface ItemStack { cat: Category; id: number; count: number }
const CAT_BY_NUMBER: Record<number, Category> = { 1: 'item', 2: 'weapon', 3: 'armor' };

export class Ff1PspFile {
  private readonly d: Uint8Array;
  private readonly s: number;
  readonly number: number;
  readonly party: Ff1PspChar[];
  constructor(d: Uint8Array, index: number) {
    this.d = d;
    this.number = index + 1;
    this.s = 4 + index * SLOT_SIZE;
    this.party = [0, 1, 2, 3].map((i) => new Ff1PspChar(d, this.s, i));
  }
  get used() { return this.d[this.s + SLOT.used] === 1; }
  get gil() { return u32(this.d, this.s + SLOT.gil); }
  set gil(v: number) { setU32(this.d, this.s + SLOT.gil, clamp(v, 0, MAX_GIL)); }
  /** Play time in seconds. */
  get playTime() { return u32(this.d, this.s + SLOT.playTime); }

  /** The bag, one entry per item (the game can hold one item in more than one stack; their counts are added up). */
  get items(): ItemStack[] {
    const out: ItemStack[] = [];
    for (let i = 0; i < SLOT.itemCount; i++) {
      const at = this.s + SLOT.items + i * 3;
      const cat = CAT_BY_NUMBER[this.d[at]];
      if (!cat || !this.d[at + 1]) continue;
      const have = out.find((x) => x.cat === cat && x.id === this.d[at + 1]);
      if (have) have.count += this.d[at + 2];
      else out.push({ cat, id: this.d[at + 1], count: this.d[at + 2] });
    }
    return out;
  }
  count(cat: Category, id: number) { return this.items.find((x) => x.cat === cat && x.id === id)?.count ?? 0; }
  /** Set how many of an item the bag holds (0 removes it). Items keep their place in the bag; new ones go at the end. */
  setCount(cat: Category, id: number, count: number) {
    if (id < 1 || id > CATEGORY_NAMES[cat].length) return;
    const n = clamp(count, 0, MAX_ITEM);
    const records: number[][] = [];
    let placed = false;
    for (let i = 0; i < SLOT.itemCount; i++) {
      const at = this.s + SLOT.items + i * 3;
      const r = [this.d[at], this.d[at + 1], this.d[at + 2]];
      if (!r[0] || !r[1]) continue;
      if (CAT_BY_NUMBER[r[0]] === cat && r[1] === id) {
        if (placed || !n) continue; // other stacks of the same item fold into the first
        r[2] = n;
        placed = true;
      }
      records.push(r);
    }
    if (!placed && n) records.push([CATEGORIES[cat], id, n]);
    const at = this.s + SLOT.items;
    this.d.fill(0, at, at + SLOT.itemCount * 3);
    records.slice(0, SLOT.itemCount).forEach((r, i) => this.d.set(r, at + i * 3));
  }

  /** Key items: one bit each, five bytes counting down from id 1 (bit 7 of the last byte). */
  hasKeyItem(id: number) {
    const at = this.s + SLOT.keyItems - ((id - 1) >> 3);
    return (this.d[at] & (0x80 >> ((id - 1) & 7))) !== 0;
  }
  setKeyItem(id: number, on: boolean) {
    if (id < 1 || id > KEY_ITEMS.length) return;
    const at = this.s + SLOT.keyItems - ((id - 1) >> 3);
    const bit = 0x80 >> ((id - 1) & 7);
    this.d[at] = on ? this.d[at] | bit : this.d[at] & ~bit;
  }
}

// ---------- the whole save ----------

export const formatPlayTime = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;

export class Ff1PspSave implements EditableSave {
  private readonly opened: Opened;
  readonly data: Uint8Array;
  readonly files: Ff1PspFile[];
  constructor(file: Uint8Array) {
    const opened = openFf1Psp(file);
    if (!opened) throw new Error('This is not a Final Fantasy (PSP) save.');
    this.opened = opened;
    this.data = opened.plain;
    this.files = Array.from({ length: SLOT_COUNT }, (_, i) => new Ff1PspFile(this.data, i));
  }
  get wrapper(): Wrapper { return this.opened.wrapper; }
  /** The files (save slots) in use. */
  get usedFiles() { return this.files.filter((f) => f.used); }

  serialize(): Uint8Array {
    if (this.data.length !== PLAIN_SIZE) throw new Error('save data has the wrong size');
    return this.opened.rebuild(this.data);
  }

  loadNote(): string | null {
    if (this.wrapper === 'savebin') {
      return 'You opened SAVE.BIN on its own. The edited file works in PPSSPP. A real PSP also checks PARAM.SFO, so to play it there, open a zip of the whole save folder instead.';
    }
    return null;
  }

  summary(): SummaryLine[] {
    return this.usedFiles.map((f) => ({
      label: `FILE ${f.number}`,
      value: `${f.party[0].name || '—'} Lv ${f.party[0].level} · ${f.gil.toLocaleString('en-US')} gil · ${formatPlayTime(f.playTime)}`,
    }));
  }

  describeChanges(before: EditableSave): ChangeGroup[] {
    return describeChanges(before as Ff1PspSave, this);
  }
}

function describeChanges(b: Ff1PspSave, a: Ff1PspSave): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const add = (title: string, lines: string[]) => {
    if (lines.length) groups.push(lines.length > 12 ? { title, lines: lines.slice(0, 12), more: lines.length - 12 } : { title, lines });
  };
  const several = a.usedFiles.length > 1;
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
      diff('Magic level', cb.magicLevel, ca.magicLevel);
      for (const k of STAT_KEYS) diff(STAT_LABELS[k], cb.stat(k), ca.stat(k));
      if (cb.fallen !== ca.fallen) lines.push(ca.fallen ? 'Fallen' : 'Revived');
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
  }
  return groups;
}
