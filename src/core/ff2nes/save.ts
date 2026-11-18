// Final Fantasy II (Famicom) save model: the four save slots of the cartridge (see layout.ts). Every field reads and
// writes the slot's bytes directly; serialize() redoes the check byte of each slot that loaded. Offsets are from
// everything8215's RAM map (github.com/everything8215/ff2, ram-map.txt), relative to $6000, and were checked by loading
// edited saves in the game.
//
// Item ids are the same as Dawn of Souls (GBA), so the names come from that version's table.

import { clamp } from '../bytes.ts';
import { KEY_TERMS, KeyTermList, type KeyTermFormat } from '../ff2gba/keyterms.ts';
import { ITEMS as GBA_ITEMS, SPELLS } from '../ff2gba/tables.ts';
import type { ChangeGroup, EditableSave, SummaryLine } from '../types.ts';
import { SLOT_COUNT, slotBase, slotOk, writeChecksum } from './layout.ts';
import { NAME_LENGTH, asSaved, decodeName, encodeName } from './text.ts';

export { KEY_TERMS, SPELLS };
export const MAX_GIL = 9_999_999;
export const MAX_HP = 9_999;
export const MAX_MP = 999;
export const MAX_STAT = 99;
export const MAX_SKILL = 16;
export const SPELL_SLOTS = 16;
export const BAG_SIZE = 32;
export const EMPTY_HAND = 0x30;

/** The item names the Famicom version has: Dawn of Souls added a few at the end and one bow. */
export const ITEMS: readonly string[] = GBA_ITEMS.map((n, id) => (id >= 0xc0 || id === 0x6e || id === 0x0f ? '' : n));

/** Who each character id is, for the portraits: the three heroes, then the people who join for a while. */
export const PORTRAITS = ['firion', 'maria', 'guy', 'minwu', 'josef', 'gordon', 'leila', 'ricard', 'leon'] as const;
export const GUEST_NAMES = ['Firion', 'Maria', 'Guy', 'Minwu', 'Josef', 'Gordon', 'Leila', 'Ricard', 'Leon'] as const;
/** In the order the save keeps them (and the status screen shows them, top to bottom, left to right). */
export const WEAPON_SKILLS = ['Unarmed', 'Shield', 'Knife', 'Sword', 'Staff', 'Spear', 'Axe', 'Bow'] as const;
export const STAT_KEYS = ['str', 'agi', 'sta', 'int', 'spi', 'mag'] as const;
export type StatKey = typeof STAT_KEYS[number];
export const STAT_LABELS: Record<StatKey, string> = { str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intelligence', spi: 'Spirit', mag: 'Magic' };
export const GEAR_SLOTS = ['Right hand', 'Left hand', 'Head', 'Body', 'Arms'] as const;

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const KIND = {
  key: range(0x01, 0x0e),
  item: range(0x10, 0x2e),
  shield: range(0x31, 0x39),
  weapon: range(0x3a, 0x6f).filter((id) => ITEMS[id]),
  head: range(0x70, 0x79),
  body: range(0x7a, 0x8d),
  arms: range(0x8e, 0x97),
  tome: range(0x98, 0xbf),
} as const;
export const GEAR_CHOICES: readonly (readonly number[])[] = [
  [...KIND.weapon, ...KIND.shield], [...KIND.weapon, ...KIND.shield], KIND.head, KIND.body, KIND.arms,
];

/**
 * Where one version keeps a save slot's fields. The Famicom game and its WonderSwan Color remake (../ff2wsc/) share the
 * engine, so one model serves both; these are the numbers that differ.
 */
export interface Ff2SlotFormat {
  slotCount: number;
  slotAt(n: number): number;
  slotOk(d: Uint8Array, n: number): boolean;
  writeChecksum(d: Uint8Array, at: number): void;
  /** How many character records the editor shows (the party places). */
  charCount: number;
  /** A character's record, and the part with the skill and spell levels (the Famicom version splits them). */
  charAt(slotAt: number, i: number): [number, number];
  /** Is record `i` in the party? */
  present(d: Uint8Array, o: number, o2: number, i: number): boolean;
  ch: { id: number; name: number; hp: number; maxHp: number; mp: number; maxMp: number; stats: number; worn: number; spells: number;
    right: number; left: number; head: number; body: number; arms: number };
  ch2: { skills: number; spellLevels: number };
  /** Levels: which byte of the [level, progress] pair holds the level, and what's added to store it. */
  levelByte: 0 | 1;
  levelStoredAs: (level: number) => number;
  spellByte: (id: number) => number;
  spellId: (byte: number) => number;
  /** What an empty hand is saved as. */
  emptyHandByte: number;
  gil: number; gilBytes: 3 | 4;
  keyItems: number | null;
  keyTerms: KeyTermFormat;
  bag: number; bagSize: number;
  weaponSkills: readonly string[];
  name: { length: number; decode(b: Uint8Array): string; encode(t: string): Uint8Array; asSaved(t: string): string };
}

export const NES_FORMAT: Ff2SlotFormat = {
  slotCount: SLOT_COUNT, slotAt: slotBase, slotOk, writeChecksum,
  charCount: 4,
  charAt: (at, i) => [at + 0x100 + i * 0x40, at + 0x200 + i * 0x40],
  present: (d, _o, o2, i) => i < 3 || !(d[o2 + 0x35] & 0x80),
  ch: { id: 0x00, name: 0x02, hp: 0x08, maxHp: 0x0a, mp: 0x0c, maxMp: 0x0e, stats: 0x10, worn: 0x20, spells: 0x30,
    head: 0x19, body: 0x1a, arms: 0x1b, right: 0x1c, left: 0x1d },
  ch2: { skills: 0x00, spellLevels: 0x10 },
  levelByte: 0, levelStoredAs: (lv) => lv - 1,
  spellByte: (id) => id + 0x97, spellId: (v) => (v >= 0x98 && v <= 0xbf ? v - 0x97 : 0),
  emptyHandByte: 0,
  gil: 0x1c, gilBytes: 3, keyItems: 0x1a, bag: 0x60, bagSize: BAG_SIZE,
  keyTerms: { at: 0x80, add: 0xf0, count: null },
  weaponSkills: WEAPON_SKILLS,
  name: { length: NAME_LENGTH, decode: decodeName, encode: encodeName, asSaved },
};

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const setU16 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >> 8) & 0xff; };
const readLe = (d: Uint8Array, o: number, n: number) => { let v = 0; for (let i = n - 1; i >= 0; i--) v = v * 256 + d[o + i]; return v; };
const writeLe = (d: Uint8Array, o: number, n: number, v: number) => { for (let i = 0; i < n; i++) { d[o + i] = v & 0xff; v = Math.floor(v / 256); } };

export interface Spell { slot: number; id: number; level: number; exp: number }

export class Ff2NesChar {
  private readonly d: Uint8Array;
  private readonly o: number;
  private readonly o2: number;
  private readonly f: Ff2SlotFormat;
  readonly index: number;
  constructor(d: Uint8Array, slotAt: number, index: number, f: Ff2SlotFormat = NES_FORMAT) {
    this.d = d;
    this.f = f;
    this.index = index;
    [this.o, this.o2] = f.charAt(slotAt, index);
  }
  /** Character id 0-8 (Firion ... Leon). */
  get who() { return this.d[this.o + this.f.ch.id] & 0x0f; }
  get portrait() { return PORTRAITS[this.who] ?? 'firion'; }
  /** The fourth place is empty when no one is travelling with the heroes. */
  get present() { return this.f.present(this.d, this.o, this.o2, this.index); }

  get name() { return this.f.name.decode(this.d.subarray(this.o + this.f.ch.name, this.o + this.f.ch.name + this.f.name.length)); }
  set name(text: string) {
    if (text === this.name) return;
    this.d.set(this.f.name.encode(text), this.o + this.f.ch.name);
  }
  get hp() { return u16(this.d, this.o + this.f.ch.hp); }
  set hp(v: number) { setU16(this.d, this.o + this.f.ch.hp, clamp(v, 0, this.maxHp)); }
  get maxHp() { return u16(this.d, this.o + this.f.ch.maxHp); }
  set maxHp(v: number) { setU16(this.d, this.o + this.f.ch.maxHp, clamp(v, 1, MAX_HP)); if (this.hp > this.maxHp) this.hp = this.maxHp; }
  get mp() { return u16(this.d, this.o + this.f.ch.mp); }
  set mp(v: number) { setU16(this.d, this.o + this.f.ch.mp, clamp(v, 0, this.maxMp)); }
  get maxMp() { return u16(this.d, this.o + this.f.ch.maxMp); }
  set maxMp(v: number) { setU16(this.d, this.o + this.f.ch.maxMp, clamp(v, 0, MAX_MP)); if (this.mp > this.maxMp) this.mp = this.maxMp; }

  /** A stat without gear. The record also keeps each stat with the gear's bonus; that copy moves by the same amount. */
  stat(k: StatKey) { return this.d[this.o + this.f.ch.stats + STAT_KEYS.indexOf(k)]; }
  setStat(k: StatKey, v: number) {
    const i = STAT_KEYS.indexOf(k);
    const before = this.stat(k), after = clamp(v, 1, MAX_STAT);
    this.d[this.o + this.f.ch.stats + i] = after;
    const worn = this.o + this.f.ch.worn + i;
    this.d[worn] = clamp(this.d[worn] + after - before, 1, MAX_STAT);
  }

  /** A [level, progress] pair at `at`, in the order and form this version keeps it. */
  private level(at: number) { return { level: this.d[at + this.f.levelByte] - this.f.levelStoredAs(0), exp: this.d[at + 1 - this.f.levelByte] }; }
  private setLevel(at: number, level: number) { this.d[at + this.f.levelByte] = this.f.levelStoredAs(clamp(level, 1, MAX_SKILL)); }
  private clearLevel(at: number) { this.d[at + this.f.levelByte] = this.f.levelStoredAs(1); this.d[at + 1 - this.f.levelByte] = 0; }

  /** Weapon skill 0-7 (see the format's weaponSkills), level 1-16, and the progress to the next level. */
  skill(i: number) { return this.level(this.o2 + this.f.ch2.skills + i * 2); }
  setSkillLevel(i: number, level: number) { this.setLevel(this.o2 + this.f.ch2.skills + i * 2, level); }

  /** Known spells in their 16 places. Spell ids are 1-40, in spell-book order. */
  get spells(): Spell[] {
    const out: Spell[] = [];
    for (let slot = 0; slot < SPELL_SLOTS; slot++) {
      const id = this.spellId(slot);
      if (id) out.push({ slot, id, ...this.level(this.spellLevelAt(slot)) });
    }
    return out;
  }
  private spellLevelAt(slot: number) { return this.o2 + this.f.ch2.spellLevels + slot * 2; }
  private spellId(slot: number) { return this.f.spellId(this.d[this.o + this.f.ch.spells + slot]); }
  knows(id: number) { return this.spells.some((s) => s.id === id); }
  learn(id: number): boolean {
    if (id < 1 || id > SPELLS.length) return false;
    if (this.knows(id)) return true;
    for (let slot = 0; slot < SPELL_SLOTS; slot++) {
      if (this.spellId(slot)) continue;
      this.d[this.o + this.f.ch.spells + slot] = this.f.spellByte(id);
      this.clearLevel(this.spellLevelAt(slot));
      return true;
    }
    return false;
  }
  forget(id: number) {
    for (const s of this.spells) {
      if (s.id !== id) continue;
      this.d[this.o + this.f.ch.spells + s.slot] = 0;
      this.clearLevel(this.spellLevelAt(s.slot));
    }
  }
  setSpellLevel(id: number, level: number) {
    const s = this.spells.find((x) => x.id === id);
    if (s) this.setLevel(this.spellLevelAt(s.slot), level);
  }

  private gearAt(slot: number) { const c = this.f.ch; return this.o + [c.right, c.left, c.head, c.body, c.arms][slot]; }
  gear(slot: number) { return this.d[this.gearAt(slot)]; }
  /** An empty hand is saved as the format's emptyHandByte (0 on the Famicom, the "Hands" item on the WonderSwan). */
  setGear(slot: number, id: number) {
    if (id !== 0 && id !== EMPTY_HAND && !GEAR_CHOICES[slot].includes(id)) return;
    const empty = id === 0 || id === EMPTY_HAND;
    this.d[this.gearAt(slot)] = empty ? (slot < 2 ? this.f.emptyHandByte : 0) : id;
  }
  isEmpty(slot: number) { const g = this.gear(slot); return g === 0 || g === EMPTY_HAND; }

  restore() { this.hp = this.maxHp; this.mp = this.maxMp; }
}

export class Ff2NesSlot {
  private readonly d: Uint8Array;
  private readonly f: Ff2SlotFormat;
  readonly at: number;
  readonly number: number;
  readonly used: boolean;
  readonly characters: Ff2NesChar[];
  /** The key terms learned (see ../ff2gba/keyterms.ts). */
  readonly keyTerms: KeyTermList;
  constructor(d: Uint8Array, index: number, f: Ff2SlotFormat = NES_FORMAT) {
    this.d = d;
    this.f = f;
    this.number = index + 1;
    this.at = f.slotAt(index);
    this.used = f.slotOk(d, index);
    this.characters = Array.from({ length: f.charCount }, (_, i) => new Ff2NesChar(d, this.at, i, f));
    this.keyTerms = new KeyTermList(d, this.at, f.keyTerms);
  }
  get party(): Ff2NesChar[] { return this.characters.filter((c) => c.present); }
  get gil() { return readLe(this.d, this.at + this.f.gil, this.f.gilBytes); }
  set gil(v: number) { writeLe(this.d, this.at + this.f.gil, this.f.gilBytes, clamp(v, 0, MAX_GIL)); }

  /** Key item k (1-14): a bit in $601A/$601B, item k at bit k. Versions that keep them elsewhere say none. */
  hasKey(k: number) { const at = this.f.keyItems; return at !== null && !!(this.d[this.at + at + (k >> 3)] & (1 << (k & 7))); }

  /** The bag: places of one item each (neither version stacks them). */
  get bag(): number[] { return Array.from({ length: this.f.bagSize }, (_, i) => this.d[this.at + this.f.bag + i]); }
  count(id: number) { return this.bag.filter((x) => x === id).length; }
  get free() { return this.bag.filter((x) => !x).length; }
  /** Put `id` in the first empty place; false when the bag is full. */
  add(id: number): boolean {
    if (!ITEMS[id] || id === EMPTY_HAND || KIND.key.includes(id)) return false;
    const i = this.bag.indexOf(0);
    if (i < 0) return false;
    this.d[this.at + this.f.bag + i] = id;
    return true;
  }
  /** Empty bag place `i`. */
  removeAt(i: number) { this.d[this.at + this.f.bag + i] = 0; }
  setAt(i: number, id: number) { if (!id || (ITEMS[id] && id !== EMPTY_HAND && !KIND.key.includes(id))) this.d[this.at + this.f.bag + i] = id; }
}

export class Ff2NesSave implements EditableSave {
  readonly data: Uint8Array;
  readonly slots: Ff2NesSlot[];
  readonly format: Ff2SlotFormat;
  constructor(data: Uint8Array, format: Ff2SlotFormat = NES_FORMAT) {
    this.data = data.slice();
    this.format = format;
    this.slots = Array.from({ length: format.slotCount }, (_, i) => new Ff2NesSlot(this.data, i, format));
    if (!this.usedSlots.length) throw new Error('None of this Final Fantasy II save’s slots pass the game’s save check.');
  }
  get usedSlots() { return this.slots.filter((s) => s.used); }

  serialize(): Uint8Array {
    const out = this.data.slice();
    for (const s of this.usedSlots) this.format.writeChecksum(out, s.at);
    return out;
  }

  summary(): SummaryLine[] {
    return this.usedSlots.map((s) => ({
      label: `SLOT ${s.number}`,
      value: `${s.party[0].name || '—'} · ${s.gil.toLocaleString('en-US')} gil`,
    }));
  }

  describeChanges(before: EditableSave): ChangeGroup[] {
    const b = before as Ff2NesSave;
    const groups: ChangeGroup[] = [];
    const add = (title: string, lines: string[]) => {
      if (lines.length) groups.push(lines.length > 12 ? { title, lines: lines.slice(0, 12), more: lines.length - 12 } : { title, lines });
    };
    const several = this.usedSlots.length > 1;
    const itemName = (id: number) => ITEMS[id] || (id ? `Item ${id}` : 'None');
    for (const sa of this.usedSlots) {
      const sb = b.slots[sa.number - 1];
      const prefix = several ? `Slot ${sa.number}: ` : '';
      sa.characters.forEach((ca, i) => {
        if (!ca.present) return;
        const cb = sb.characters[i];
        const lines: string[] = [];
        const diff = (label: string, x: string | number, y: string | number) => {
          if (x !== y) lines.push(`${label}: ${typeof x === 'number' ? x.toLocaleString('en-US') : x} → ${typeof y === 'number' ? y.toLocaleString('en-US') : y}`);
        };
        diff('Name', cb.name, ca.name);
        diff('HP', `${cb.hp}/${cb.maxHp}`, `${ca.hp}/${ca.maxHp}`);
        diff('MP', `${cb.mp}/${cb.maxMp}`, `${ca.mp}/${ca.maxMp}`);
        for (const k of STAT_KEYS) diff(STAT_LABELS[k], cb.stat(k), ca.stat(k));
        this.format.weaponSkills.forEach((n, s) => diff(`${n} skill`, cb.skill(s).level, ca.skill(s).level));
        GEAR_SLOTS.forEach((n, g) => diff(n, cb.isEmpty(g) ? 'None' : itemName(cb.gear(g)), ca.isEmpty(g) ? 'None' : itemName(ca.gear(g))));
        for (const s of ca.spells) {
          const was = cb.spells.find((x) => x.id === s.id);
          if (!was) lines.push(`Learned ${SPELLS[s.id - 1]} (level ${s.level})`);
          else if (was.level !== s.level) lines.push(`${SPELLS[s.id - 1]}: level ${was.level} → ${s.level}`);
        }
        for (const s of cb.spells) if (!ca.knows(s.id)) lines.push(`Forgot ${SPELLS[s.id - 1]}`);
        add(prefix + (ca.name || GUEST_NAMES[ca.who] || `Character ${i + 1}`), lines);
      });
      const items: string[] = [];
      if (sb.gil !== sa.gil) items.push(`Gil: ${sb.gil.toLocaleString('en-US')} → ${sa.gil.toLocaleString('en-US')}`);
      const ids = new Set([...sa.bag, ...sb.bag].filter(Boolean));
      for (const id of ids) {
        const x = sb.count(id), y = sa.count(id);
        if (x !== y) items.push(`${itemName(id)}: ${x} → ${y}`);
      }
      add(`${prefix}Items`, items);
      add(`${prefix}Key terms`, KEY_TERMS.flatMap((n, k) => (sa.keyTerms.knows(k + 1) === sb.keyTerms.knows(k + 1) ? []
        : [`${n}: ${sa.keyTerms.knows(k + 1) ? 'learned' : 'forgotten'}`])));
    }
    return groups;
  }
}
