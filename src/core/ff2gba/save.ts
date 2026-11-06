// Final Fantasy II (Dawn of Souls, GBA) save model: the three Final Fantasy II files of the cartridge (see
// ../ff1gba/layout.ts). Every field reads and writes the save's bytes directly; serialize() redoes the checksum of each
// file that loaded. Offsets were found by comparing a real save with the game's menus, and checked by loading edited
// saves in mGBA: names, HP and MP, stats, weapon skills, spells, gear, the fourth party member, gil and the bag all show
// up in the game, and the game works out attack, defence and the like again from the gear.

import { clamp } from '../bytes.ts';
import { FF2, FILE_COUNT, fileBase, fileOk, writeChecksum } from '../ff1gba/layout.ts';
import type { ChangeGroup, EditableSave, SummaryLine } from '../types.ts';
import { ITEMS, SPELLS } from './tables.ts';

export const MAX_GIL = 999_999;
export const MAX_HP = 9_999;
export const MAX_MP = 999;
export const MAX_STAT = 99;
export const MAX_SKILL = 16;
export const MAX_ITEM = 99;
export const NAME_LENGTH = 6;
export const SPELL_SLOTS = 16;
export const BAG_SIZE = 150;
export const EMPTY_HAND = 0x30;

/** Who each character record is, for the portraits: the three heroes, then the people who join for a while. */
export const PORTRAITS = ['firion', 'maria', 'guy', 'minwu', 'josef', 'gordon', 'leila', 'ricard'] as const;
export const WEAPON_SKILLS = ['Unarmed', 'Knife', 'Sword', 'Staff', 'Axe', 'Spear', 'Bow', 'Shield'] as const;
export const STAT_KEYS = ['str', 'agi', 'sta', 'int', 'spi', 'mag'] as const;
export type StatKey = typeof STAT_KEYS[number];
export const STAT_LABELS: Record<StatKey, string> = { str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intelligence', spi: 'Spirit', mag: 'Magic' };
export const GEAR_SLOTS = ['Right hand', 'Left hand', 'Head', 'Body', 'Arms'] as const;

/** Item ids by kind (see tables.ts). */
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const KIND = {
  item: range(0x10, 0x2e),
  shield: range(0x31, 0x39),
  weapon: range(0x3a, 0x6f),
  head: range(0x70, 0x79),
  body: range(0x7a, 0x8d),
  arms: range(0x8e, 0x97),
  tome: range(0x98, 0xbf),
} as const;
/** What each gear slot takes. Either hand holds a weapon or a shield. */
export const GEAR_CHOICES: readonly (readonly number[])[] = [
  [...KIND.weapon, ...KIND.shield], [...KIND.weapon, ...KIND.shield], KIND.head, KIND.body, KIND.arms,
];

/**
 * Where one version keeps its Final Fantasy II files, and what it has in them. Dawn of Souls (GBA) and the PSP
 * Anniversary edition share the file layout apart from these numbers (the PSP character records are two bytes shorter,
 * and it adds Leon's record and some gear), so one model serves both.
 */
export interface Ff2Format {
  fileCount: number;
  fileAt(index: number): number;
  fileOk(d: Uint8Array, index: number): boolean;
  writeChecksum(d: Uint8Array, at: number): void;
  /** Offsets inside a file. */
  chars: number; charStride: number; charCount: number;
  guest: number; steps: number; gil: number; playTime: number; bagIds: number; bagCounts: number;
  maxGil: number;
  items: readonly string[];
  spells: readonly string[];
  kind: typeof KIND;
  gearChoices: readonly (readonly number[])[];
  portraits: readonly string[];
  /** The game shows guests under their own names whatever the save says (checked on the PSP), so only the four
   * heroes can be renamed. */
  guestNamesFixed?: boolean;
}

export const GBA_FORMAT: Ff2Format = {
  fileCount: FILE_COUNT,
  fileAt: (i) => fileBase(FF2, i),
  fileOk: (d, i) => fileOk(d, FF2, i),
  writeChecksum: (d, at) => writeChecksum(d, at, FF2.size),
  chars: 0x22, charStride: 0x80, charCount: 8, guest: 0x4b2, steps: 0x4a4, gil: 0x4a8, playTime: 0x4ac, bagIds: 0x4b4, bagCounts: 0x54a,
  maxGil: MAX_GIL, items: ITEMS, spells: SPELLS, kind: KIND, gearChoices: GEAR_CHOICES, portraits: PORTRAITS,
};
/** Offsets inside a character record. */
const CH = {
  id: 0x02, name: 0x04, hp: 0x14, maxHp: 0x16, mp: 0x18, maxMp: 0x1a, stats: 0x1c, gear: 0x25, worn: 0x2c,
  spells: 0x3c, skills: 0x4c, spellLevels: 0x5c,
};

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const setU16 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >> 8) & 0xff; };
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const setU32 = (d: Uint8Array, o: number, v: number) => { for (let i = 0; i < 4; i++) d[o + i] = (v >>> (8 * i)) & 0xff; };

// ---------- names: full-width Shift-JIS, as in Final Fantasy I ----------

const PUNCTUATION: Record<string, number> = { '.': 0x8144, ',': 0x8143, '!': 0x8149, '?': 0x8148, "'": 0x8166, '-': 0x815d, '&': 0x8195 };
const ENCODE = new Map<string, number>();
for (let i = 0; i < 26; i++) { ENCODE.set(String.fromCharCode(65 + i), 0x8260 + i); ENCODE.set(String.fromCharCode(97 + i), 0x8281 + i); }
for (let i = 0; i < 10; i++) ENCODE.set(String(i), 0x824f + i);
for (const [c, v] of Object.entries(PUNCTUATION)) ENCODE.set(c, v);
const DECODE = new Map([...ENCODE].map(([c, v]) => [v, c]));
export const asSaved = (text: string) => [...text].filter((c) => ENCODE.has(c)).slice(0, NAME_LENGTH).join('');

// ---------- a character ----------

export interface Spell { slot: number; id: number; level: number; exp: number }

export class Ff2GbaChar {
  private readonly d: Uint8Array;
  private readonly o: number;
  private readonly f: Ff2Format;
  readonly index: number;
  constructor(d: Uint8Array, fileAt: number, index: number, f: Ff2Format = GBA_FORMAT) {
    this.d = d;
    this.index = index;
    this.f = f;
    this.o = fileAt + f.chars + index * f.charStride;
  }
  /** Who the record holds (its id, not its place: the PSP's Soul of Rebirth files put Minwu and Scott first). */
  get portrait() { return this.f.portraits[this.d[this.o + CH.id] & 0x0f] ?? this.f.portraits[this.index] ?? 'firion'; }

  get name() {
    let s = '';
    for (let i = 0; i < NAME_LENGTH; i++) {
      const at = this.o + CH.name + i * 2;
      const v = (this.d[at] << 8) | this.d[at + 1];
      if (!this.d[at]) break;
      s += v === 0x8140 ? ' ' : DECODE.get(v) ?? '?';
    }
    return s.trimEnd();
  }
  set name(text: string) {
    const clean = asSaved(text);
    if (clean === this.name) return;
    const at = this.o + CH.name;
    this.d.fill(0, at, at + NAME_LENGTH * 2);
    [...clean].forEach((c, i) => { const v = ENCODE.get(c)!; this.d[at + i * 2] = v >> 8; this.d[at + i * 2 + 1] = v & 0xff; });
  }
  get hp() { return u16(this.d, this.o + CH.hp); }
  set hp(v: number) { setU16(this.d, this.o + CH.hp, clamp(v, 0, this.maxHp)); }
  get maxHp() { return u16(this.d, this.o + CH.maxHp); }
  set maxHp(v: number) { setU16(this.d, this.o + CH.maxHp, clamp(v, 1, MAX_HP)); if (this.hp > this.maxHp) this.hp = this.maxHp; }
  get mp() { return u16(this.d, this.o + CH.mp); }
  set mp(v: number) { setU16(this.d, this.o + CH.mp, clamp(v, 0, this.maxMp)); }
  get maxMp() { return u16(this.d, this.o + CH.maxMp); }
  set maxMp(v: number) { setU16(this.d, this.o + CH.maxMp, clamp(v, 0, MAX_MP)); if (this.mp > this.maxMp) this.mp = this.maxMp; }

  /** A stat without gear. The record also keeps each stat with the gear's bonus; that copy moves by the same amount. */
  stat(k: StatKey) { return this.d[this.o + CH.stats + STAT_KEYS.indexOf(k)]; }
  setStat(k: StatKey, v: number) {
    const i = STAT_KEYS.indexOf(k);
    const before = this.stat(k), after = clamp(v, 1, MAX_STAT);
    this.d[this.o + CH.stats + i] = after;
    const worn = this.o + CH.worn + i;
    this.d[worn] = clamp(this.d[worn] + after - before, 1, MAX_STAT);
  }

  /** Weapon skill 0-7 (see WEAPON_SKILLS): level 1-16 and its progress to the next level, 0-99. */
  skill(i: number) { return { level: this.d[this.o + CH.skills + i * 2 + 1], exp: this.d[this.o + CH.skills + i * 2] }; }
  setSkillLevel(i: number, level: number) { this.d[this.o + CH.skills + i * 2 + 1] = clamp(level, 1, MAX_SKILL); }

  /** Known spells in their 16 places (the magic menu shows them two to a row). */
  get spells(): Spell[] {
    const out: Spell[] = [];
    for (let slot = 0; slot < SPELL_SLOTS; slot++) {
      const id = this.d[this.o + CH.spells + slot];
      if (id >= 1 && id <= this.f.spells.length) out.push({ slot, id, level: this.d[this.o + CH.spellLevels + slot * 2 + 1], exp: this.d[this.o + CH.spellLevels + slot * 2] });
    }
    return out;
  }
  knows(id: number) { return this.spells.some((s) => s.id === id); }
  /** Learn a spell at level 1 in the first free place; false when all 16 places are taken. */
  learn(id: number): boolean {
    if (id < 1 || id > this.f.spells.length) return false;
    if (this.knows(id)) return true;
    for (let slot = 0; slot < SPELL_SLOTS; slot++) {
      if (this.d[this.o + CH.spells + slot]) continue;
      this.d[this.o + CH.spells + slot] = id;
      this.d[this.o + CH.spellLevels + slot * 2] = 0;
      this.d[this.o + CH.spellLevels + slot * 2 + 1] = 1;
      return true;
    }
    return false;
  }
  forget(id: number) {
    for (const s of this.spells) {
      if (s.id !== id) continue;
      this.d[this.o + CH.spells + s.slot] = 0;
      this.d[this.o + CH.spellLevels + s.slot * 2] = 0;
      this.d[this.o + CH.spellLevels + s.slot * 2 + 1] = 0;
    }
  }
  setSpellLevel(id: number, level: number) {
    const s = this.spells.find((x) => x.id === id);
    if (s) this.d[this.o + CH.spellLevels + s.slot * 2 + 1] = clamp(level, 1, MAX_SKILL);
  }

  /** Gear slot 0-4 (right hand, left hand, head, body, arms): the item id. An empty hand is EMPTY_HAND, other empty slots 0. */
  gear(slot: number) { return this.d[this.o + CH.gear + slot]; }
  setGear(slot: number, id: number) {
    const empty = slot < 2 ? EMPTY_HAND : 0;
    if (id !== empty && id !== 0 && !this.f.gearChoices[slot].includes(id)) return;
    this.d[this.o + CH.gear + slot] = id === 0 ? empty : id;
  }
  isEmpty(slot: number) { const g = this.gear(slot); return g === 0 || g === EMPTY_HAND; }

  restore() { this.hp = this.maxHp; this.mp = this.maxMp; }
}

// ---------- a file ----------

export class Ff2GbaFile {
  private readonly d: Uint8Array;
  readonly at: number;
  readonly number: number;
  readonly used: boolean;
  readonly characters: Ff2GbaChar[];
  private readonly f: Ff2Format;
  constructor(d: Uint8Array, index: number, f: Ff2Format = GBA_FORMAT) {
    this.d = d;
    this.f = f;
    this.number = index + 1;
    this.at = f.fileAt(index);
    this.used = f.fileOk(d, index);
    this.characters = Array.from({ length: f.charCount }, (_, i) => new Ff2GbaChar(d, this.at, i, f));
  }
  /** Firion, Maria and Guy, and whoever is travelling with them in the fourth place (if anyone). */
  get party(): Ff2GbaChar[] {
    const guest = this.d[this.at + this.f.guest];
    return guest >= 3 && guest < this.f.charCount ? [...this.characters.slice(0, 3), this.characters[guest]] : this.characters.slice(0, 3);
  }
  get gil() { return u32(this.d, this.at + this.f.gil); }
  set gil(v: number) { setU32(this.d, this.at + this.f.gil, clamp(v, 0, this.f.maxGil)); }
  get steps() { return u32(this.d, this.at + this.f.steps); }
  get playTime() { return u32(this.d, this.at + this.f.playTime); }

  // The bag: 150 item ids, then their 150 counts.
  get bag(): { id: number; count: number }[] {
    const out: { id: number; count: number }[] = [];
    for (let i = 0; i < BAG_SIZE; i++) {
      const id = this.d[this.at + this.f.bagIds + i];
      if (id) out.push({ id, count: this.d[this.at + this.f.bagCounts + i] });
    }
    return out;
  }
  count(id: number) { return this.bag.filter((x) => x.id === id).reduce((n, x) => n + x.count, 0); }
  setCount(id: number, count: number) {
    if (id < 1 || id >= this.f.items.length || !this.f.items[id] || id === EMPTY_HAND) return;
    const n = clamp(count, 0, MAX_ITEM);
    let placed = false;
    for (let i = 0; i < BAG_SIZE; i++) {
      if (this.d[this.at + this.f.bagIds + i] !== id) continue;
      if (placed || !n) { this.d[this.at + this.f.bagIds + i] = 0; this.d[this.at + this.f.bagCounts + i] = 0; continue; }
      this.d[this.at + this.f.bagCounts + i] = n;
      placed = true;
    }
    if (placed || !n) return;
    for (let i = 0; i < BAG_SIZE; i++) {
      if (this.d[this.at + this.f.bagIds + i]) continue;
      this.d[this.at + this.f.bagIds + i] = id;
      this.d[this.at + this.f.bagCounts + i] = n;
      return;
    }
  }
  get bagFull() { return this.bag.length >= BAG_SIZE; }
}

// ---------- the whole save ----------

export const formatPlayTime = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;

export class Ff2GbaSave implements EditableSave {
  readonly data: Uint8Array;
  readonly files: Ff2GbaFile[];
  readonly format: Ff2Format;
  constructor(data: Uint8Array, format: Ff2Format = GBA_FORMAT) {
    this.data = data.slice();
    this.format = format;
    this.files = Array.from({ length: format.fileCount }, (_, i) => new Ff2GbaFile(this.data, i, format));
    if (!this.usedFiles.length) throw new Error(format === GBA_FORMAT ? 'This Dawn of Souls save has no Final Fantasy II files.' : 'This save has no Final Fantasy II files.');
  }
  get usedFiles() { return this.files.filter((f) => f.used); }

  serialize(): Uint8Array {
    const out = this.data.slice();
    for (const f of this.usedFiles) this.format.writeChecksum(out, f.at);
    return out;
  }

  summary(): SummaryLine[] {
    return this.usedFiles.map((f) => ({
      label: `FILE ${f.number}`,
      value: `${f.party[0].name || '—'} · ${f.gil.toLocaleString('en-US')} gil · ${formatPlayTime(f.playTime)}`,
    }));
  }

  describeChanges(before: EditableSave): ChangeGroup[] {
    const b = before as Ff2GbaSave;
    const groups: ChangeGroup[] = [];
    const add = (title: string, lines: string[]) => {
      if (lines.length) groups.push(lines.length > 12 ? { title, lines: lines.slice(0, 12), more: lines.length - 12 } : { title, lines });
    };
    const several = this.usedFiles.length > 1;
    const itemName = (id: number) => this.format.items[id] || (id ? `Item ${id}` : 'None');
    for (const fa of this.usedFiles) {
      const fb = b.files[fa.number - 1];
      const prefix = several ? `File ${fa.number}: ` : '';
      fa.characters.forEach((ca, i) => {
        const cb = fb.characters[i];
        const lines: string[] = [];
        const diff = (label: string, x: string | number, y: string | number) => {
          if (x !== y) lines.push(`${label}: ${typeof x === 'number' ? x.toLocaleString('en-US') : x} → ${typeof y === 'number' ? y.toLocaleString('en-US') : y}`);
        };
        diff('Name', cb.name, ca.name);
        diff('HP', `${cb.hp}/${cb.maxHp}`, `${ca.hp}/${ca.maxHp}`);
        diff('MP', `${cb.mp}/${cb.maxMp}`, `${ca.mp}/${ca.maxMp}`);
        for (const k of STAT_KEYS) diff(STAT_LABELS[k], cb.stat(k), ca.stat(k));
        WEAPON_SKILLS.forEach((n, s) => diff(`${n} skill`, cb.skill(s).level, ca.skill(s).level));
        GEAR_SLOTS.forEach((n, g) => diff(n, cb.isEmpty(g) ? 'None' : itemName(cb.gear(g)), ca.isEmpty(g) ? 'None' : itemName(ca.gear(g))));
        for (const s of ca.spells) {
          const was = cb.spells.find((x) => x.id === s.id);
          if (!was) lines.push(`Learned ${this.format.spells[s.id - 1]} (level ${s.level})`);
          else if (was.level !== s.level) lines.push(`${this.format.spells[s.id - 1]}: level ${was.level} → ${s.level}`);
        }
        for (const s of cb.spells) if (!ca.knows(s.id)) lines.push(`Forgot ${this.format.spells[s.id - 1]}`);
        add(prefix + (ca.name || `Character ${i + 1}`), lines);
      });
      const items: string[] = [];
      if (fb.gil !== fa.gil) items.push(`Gil: ${fb.gil.toLocaleString('en-US')} → ${fa.gil.toLocaleString('en-US')}`);
      this.format.items.forEach((name, id) => {
        if (!name || id === EMPTY_HAND) return;
        const x = fb.count(id), y = fa.count(id);
        if (x !== y) items.push(`${name}: ${x} → ${y}`);
      });
      add(`${prefix}Items`, items);
    }
    return groups;
  }
}
