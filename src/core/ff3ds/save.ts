// Final Fantasy III save model, for the Nintendo DS (the three save slots and the Quicksave, see layout.ts) and the PSP
// (one game a save, see ../ff3psp/save.ts), which keeps the same records in other places. Character fields read and
// write the bytes directly; the bag, the key items and the Fat Chocobo are lists, written back by serialize(), which on
// the DS also redoes each slot's check value. Offsets were worked out from real saves and checked in the game. On the DS:
//
//   +0x70 + 0x2EC n  character n (0-3): +0x01 name (13 bytes), +0x0E which of the four heroes, +0x0F level, +0x10 exp,
//                    +0x18 HP, +0x1C max HP, +0x20 [current, max] MP of spell levels 1-8, +0x30 the current MP again
//                    (the game keeps both the same), +0x38 strength, vitality, agility, intellect and mind, +0x3D the
//                    same with gear, +0x43 ailments, +0x86 gear (right hand, left hand, head, body, arms: u16 item, a
//                    count, a byte left alone), +0x9C spells (u32, three places per spell level), +0xFC job, +0x100 the
//                    job before it, +0x104 + 0x14 j job j's record (its level, then progress; from +8 its battle
//                    commands), +0x2D2 the battle commands in use, +0x2E8 battles left before the character is used to
//                    a new job.
//   +0xC28           items, (u16 item, u16 count) each: the bag (384), key items (64) and the Fat Chocobo (384).
//   +0x1928          gil; +0x192C play time in seconds; +0x2578 the Job menu is open; +0x28D9 + j job j is in it.
//
// The PSP's character records are 0x2F8 bytes from 0xCB0 with a 25-byte name, so everything from +0x0E on sits 0x0C bytes
// later; an empty spell place holds -999 there and an empty hand FFFF. Ff3Layout says where each version keeps what.
//
// Stats and max MP follow from the job and level alone (tables.ts); the game works them out again on the Status screen
// and when a battle starts, and attack, defense and the rest (+0x44-0x85) catch up with the gear in the next battle (on
// the PSP, as soon as its Equipment or Status screen opens).

import { type BagItem, clamp, le } from '../bytes.ts';
import type { ChangeGroup, EditableSave, SummaryLine } from '../types.ts';
import { QUICKSAVE, SLOT_COUNT, slotBase, slotOk, writeChecksum } from './layout.ts';
import { ARMOR, COMMANDS, EXP_TABLE, ITEMS, JOBS, JOB_GRADES, KEY_ITEMS, MP_TABLES, SPELLS, STAT_CURVES, WEAPONS } from './tables.ts';
import { DS_NAMES, type NameCodec } from './text.ts';

export { JOBS };
export const JOB_COUNT = JOBS.length;
export const MAX_LEVEL = 99;
export const MAX_EXP = 9_999_999;
export const MAX_HP = 9_999;
export const MAX_MP = 99;
export const MAX_STAT = 99;
export const MAX_GIL = 9_999_999;
export const MAX_COUNT = 99;
export const BAG_SIZE = 384;
export const KEY_SIZE = 64;
export const CHOCOBO_SIZE = 384;
export const SPELLS_PER_LEVEL = 3;
/** Ailments (+0x43), one bit each; the cure items clear the same bits in the game. The top bit is the game's own
 * bookkeeping (a field cure sets it), not an ailment, so it is left alone. */
export const AILMENTS: readonly [number, string][] = [
  [0x01, 'KO'], [0x02, 'Stone'], [0x04, 'Toad'], [0x08, 'Silence'], [0x10, 'Mini'], [0x20, 'Blind'], [0x40, 'Poison'],
];
export const KO = 0x01;
const AILMENT_BITS = 0x7f;
/** An empty gear place, and an empty item place. */
const NO_GEAR = 0xff9d;
const NO_ITEM = 0xffff;
/** What an empty spell place holds on the PSP (-999); the DS leaves 0. */
const NO_SPELL_PSP = 0xfffffc19;
const ELIXIR = 5011;

/** Where a version of the game keeps things. Slot-wide offsets count from the start of the slot (the PSP's save is one). */
export interface Ff3Layout {
  readonly slotCount: number;
  slotAt(n: number): number;
  slotOk(d: Uint8Array, n: number): boolean;
  slotLabel(n: number): string;
  /** Redo slot n's check value, if the version has one. */
  writeChecksum(d: Uint8Array, n: number): void;
  /** Character records: the first at `party`, `stride` bytes apart; past the name, fields sit `shift` bytes later than on the DS. */
  readonly party: number;
  readonly stride: number;
  readonly shift: number;
  readonly names: NameCodec;
  readonly items: number;
  readonly gil: number;
  /** Play time in seconds. */
  readonly seconds: number;
  /** The Job menu is open; job j is in it at `jobs` + j. */
  readonly jobMenu: number;
  readonly jobs: number;
  /** What the game writes for an empty spell place, and for an empty hand. */
  readonly noSpell: number;
  readonly noHand: number;
}

export const DS_LAYOUT: Ff3Layout = {
  slotCount: SLOT_COUNT,
  slotAt: slotBase,
  slotOk,
  slotLabel: (n) => (n === QUICKSAVE ? 'Quicksave' : `Slot ${n + 1}`),
  writeChecksum,
  party: 0x70, stride: 0x2ec, shift: 0, names: DS_NAMES,
  items: 0xc28, gil: 0x1928, seconds: 0x192c, jobMenu: 0x2578, jobs: 0x28d9,
  noSpell: 0, noHand: NO_GEAR,
};

type Kind = 'item' | 'weapon' | 'armor' | 'spell' | 'key';
interface Info { readonly name: string; readonly kind: Kind; readonly type: number; readonly jobs: number; readonly bonus: readonly number[]; readonly level: number }
const NO_BONUS = [0, 0, 0, 0, 0];
const INFO = new Map<number, Info>();
for (const [id, name] of ITEMS) INFO.set(id, { name, kind: 'item', type: 0, jobs: 0, bonus: NO_BONUS, level: 0 });
for (const [id, name, type, jobs, bonus] of WEAPONS) INFO.set(id, { name, kind: 'weapon', type, jobs, bonus, level: 0 });
for (const [id, name, type, jobs, bonus] of ARMOR) INFO.set(id, { name, kind: 'armor', type, jobs, bonus, level: 0 });
for (const [id, name, type, level, jobs] of SPELLS) INFO.set(id, { name, kind: 'spell', type, jobs, bonus: NO_BONUS, level });
/** The game names both of Sara's Pendants alike; its descriptions tell them apart. */
const KEY_NAMES: Record<number, string> = { 5214: "Sara's Pendant (broken)", 5215: "Sara's Pendant (restored)" };
for (const [id, name] of KEY_ITEMS) INFO.set(id, { name: KEY_NAMES[id] ?? name, kind: 'key', type: 0, jobs: 0, bonus: NO_BONUS, level: 0 });
/** Key items, in the game's order: the story's, then the cards for mastering each job (job level 99, as real saves
 * show) and the Metal Card for beating the Iron Giant. */
export const STORY_ITEMS: readonly number[] = KEY_ITEMS.filter(([, n]) => !n.endsWith(' Card')).map(([id]) => id);
export const JOB_CARDS: readonly number[] = KEY_ITEMS.filter(([, n]) => n.endsWith(' Card')).map(([id]) => id);

export const SCHOOLS = ['White', 'Black', 'Summon'] as const;
export const itemName = (id: number) => INFO.get(id)?.name ?? `Item ${id}`;
export const isSpell = (id: number) => INFO.get(id)?.kind === 'spell';
/** Spell level 1-8, or 0 for anything that isn't a spell. */
export const spellLevel = (id: number) => INFO.get(id)?.level ?? 0;
export const spellSchool = (id: number) => SCHOOLS[INFO.get(id)?.type ?? 0];
/** The spells of `level` (1-8) in the game's order: three white, three black, a summon. */
export const spellsOfLevel = (level: number) => SPELLS.filter((s) => s[3] === level).map((s) => s[0]);
/** Can job `job` wear item `id`, or learn spell `id`? */
export const canEquip = (job: number, id: number) => job >= 0 && job < JOB_COUNT && !!((INFO.get(id)?.jobs ?? 0) & (1 << job));
/** What the bag and the Fat Chocobo can hold: items, weapons, armor and spells. Key items move the story on, so no. */
export const storable = (id: number) => { const k = INFO.get(id)?.kind; return !!k && k !== 'key'; };
/** Everything storable, in the game's order (items, weapons, armor, then spells). */
export const STORABLE: readonly number[] = [...ITEMS, ...WEAPONS, ...ARMOR, ...SPELLS].map((x) => x[0]);

export const GEAR_SLOTS = ['Right hand', 'Left hand', 'Head', 'Body', 'Arms'] as const;
const HAND = [...WEAPONS.map((w) => w[0]), ...ARMOR.filter((a) => a[2] === 0).map((a) => a[0])];
export const GEAR_CHOICES: readonly (readonly number[])[] = [HAND, HAND, ...[1, 2, 3].map((slot) => ARMOR.filter((a) => a[2] === slot).map((a) => a[0]))];
const weaponType = (id: number) => (INFO.get(id)?.kind === 'weapon' ? INFO.get(id)!.type : -1);
export const isArrow = (id: number) => weaponType(id) === 8;
/** 0 weapon or shield, 1 bow, 2 arrows, 3 harp. */
const handType = (id: number) => ({ 7: 1, 8: 2, 16: 3 } as Record<number, number>)[weaponType(id)] ?? 0;
/** Can these two go in the two hands together? As in the Equip menu: weapons and shields pair up (two shields too), a
 * bow pairs with arrows, a harp goes alone. */
export function pairs(a: number, b: number): boolean {
  if (!a || !b) return true;
  const x = handType(a), y = handType(b);
  return (x === 0 && y === 0) || (x === 1 && y === 2) || (x === 2 && y === 1);
}

/** The experience level `level` starts at. */
export const expFor = (level: number) => EXP_TABLE[clamp(level, 1, MAX_LEVEL) - 1];
/** The level `exp` experience makes. */
export function levelFor(exp: number): number {
  let lv = 1;
  while (lv < MAX_LEVEL && exp >= EXP_TABLE[lv]) lv++;
  return lv;
}

const hex = (s: string) => Uint8Array.from(s.match(/../g)!, (x) => parseInt(x, 16));
const curves = STAT_CURVES.map(hex);
const mpTables = MP_TABLES.map(hex);
/** Stats (strength, vitality, agility, intellect, mind) and max MP (spell levels 1-8) of `job` at `level`, as the game
 * works them out: each stat from its growth curve, MP from the job's MP table. */
export function growth(job: number, level: number): { stats: number[]; maxMp: number[] } {
  const lv = clamp(level, 1, MAX_LEVEL);
  const g = JOB_GRADES[clamp(job, 0, JOB_COUNT - 1)];
  return {
    stats: g.slice(0, 5).map((c) => curves[c][lv - 1]),
    maxMp: Array.from({ length: 8 }, (_, k) => (g[5] ? mpTables[g[5] - 1][(lv - 1) * 8 + k] : 0)),
  };
}

export const STAT_KEYS = ['str', 'vit', 'agi', 'int', 'mnd'] as const;
export type StatKey = typeof STAT_KEYS[number];
export const STAT_LABELS: Record<StatKey, string> = { str: 'Strength', vit: 'Vitality', agi: 'Agility', int: 'Intellect', mnd: 'Mind' };

export class Ff3DsChar {
  private readonly d: Uint8Array;
  /** Where the record starts, and where its fields from +0x0E on count from (the same on the DS). */
  private readonly r: number;
  private readonly o: number;
  private readonly L: Ff3Layout;
  readonly index: number;
  constructor(d: Uint8Array, slotAt: number, index: number, layout: Ff3Layout = DS_LAYOUT) {
    this.d = d;
    this.index = index;
    this.L = layout;
    this.r = slotAt + layout.party + index * layout.stride;
    this.o = this.r + layout.shift;
  }
  /** How names are kept: how many letters, and what the file will hold. */
  get names(): NameCodec { return this.L.names; }

  /** Which of the four heroes this is (0 Luneth, 1 Arc, 2 Refia, 3 Ingus, whatever their names now). */
  get hero() { return this.d[this.o + 0x0e] & 3; }
  get job() { const j = le.u32(this.d, this.o + 0xfc); return j < JOB_COUNT ? j : 0; }
  get jobName() { return JOBS[this.job]; }

  get name() { return this.L.names.decode(this.d.subarray(this.r + 1, this.r + 1 + this.L.names.bytes)); }
  set name(text: string) { if (text !== this.name) this.d.set(this.L.names.encode(text), this.r + 1); }

  /** Level 1-99, kept in step with exp: exp moves to the new level's start if it's out of range, and stats and max MP
   * become what the job has at that level. */
  get level() { return clamp(this.d[this.o + 0x0f], 1, MAX_LEVEL); }
  set level(v: number) {
    const lv = clamp(v, 1, MAX_LEVEL);
    if (lv === this.level) return;
    this.d[this.o + 0x0f] = lv;
    if (levelFor(this.exp) !== lv) le.setU32(this.d, this.o + 0x10, expFor(lv));
    this.grow();
  }
  /** Experience; the level follows it. */
  get exp() { return le.u32(this.d, this.o + 0x10); }
  set exp(v: number) {
    le.setU32(this.d, this.o + 0x10, clamp(v, 0, MAX_EXP));
    const lv = levelFor(this.exp);
    if (lv !== this.level) { this.d[this.o + 0x0f] = lv; this.grow(); }
  }

  /** HP; 0 HP and KO go together, as they do in the game. */
  get hp() { return le.u32(this.d, this.o + 0x18); }
  set hp(v: number) {
    le.setU32(this.d, this.o + 0x18, clamp(v, 0, this.maxHp));
    if (!this.hp !== this.has(KO)) this.d[this.o + 0x43] ^= KO;
  }
  get maxHp() { return le.u32(this.d, this.o + 0x1c); }
  set maxHp(v: number) { le.setU32(this.d, this.o + 0x1c, clamp(v, 1, MAX_HP)); if (this.hp > this.maxHp) this.hp = this.maxHp; }

  get status() { return this.d[this.o + 0x43]; }
  has(bit: number) { return !!(this.status & bit); }
  /** Turn an ailment on or off. KO takes HP to 0; getting up from it leaves 1 HP. */
  setAilment(bit: number, on: boolean) {
    if (bit === KO) { this.hp = on ? 0 : Math.max(this.hp, 1); return; }
    this.d[this.o + 0x43] = on ? this.status | bit : this.status & ~bit;
  }

  /** Job level 1-99 of job `j`. */
  jobLevel(j: number) { return clamp(this.d[this.o + 0x104 + j * 0x14], 1, MAX_LEVEL); }
  setJobLevel(j: number, v: number) { this.d[this.o + 0x104 + j * 0x14] = clamp(v, 1, MAX_LEVEL); }

  /** A stat without gear. */
  stat(k: StatKey) { return this.d[this.o + 0x38 + STAT_KEYS.indexOf(k)]; }
  /** A stat with gear: what the menus show. */
  wornStat(k: StatKey) { return this.d[this.o + 0x3d + STAT_KEYS.indexOf(k)]; }
  setStat(k: StatKey, v: number) {
    this.d[this.o + 0x38 + STAT_KEYS.indexOf(k)] = clamp(v, 1, MAX_STAT);
    this.refreshWorn();
  }
  /** Stats with gear: each piece worn adds its bonuses, up to 99. */
  private refreshWorn() {
    const add = [0, 0, 0, 0, 0];
    for (let g = 0; g < GEAR_SLOTS.length; g++) INFO.get(this.gear(g))?.bonus.forEach((v, k) => { add[k] += v; });
    for (let k = 0; k < 5; k++) this.d[this.o + 0x3d + k] = Math.min(MAX_STAT, this.d[this.o + 0x38 + k] + add[k]);
  }
  /** Stats and max MP become what the job has at this level; MP stays unless it's over the new max. */
  private grow() {
    const { stats, maxMp } = growth(this.job, this.level);
    stats.forEach((v, k) => { this.d[this.o + 0x38 + k] = v; });
    this.refreshWorn();
    maxMp.forEach((v, i) => this.setMaxMp(i + 1, v));
  }

  /** Take `job` the way the Job menu does: the job's battle commands come in, and stats and max MP become the new job's
   * at this level. Spells stay. Gear the new job can't use goes into the bag (it stays on when the bag is full). The
   * battles a new job takes to get used to are skipped. Returns what went into the bag. */
  changeJob(job: number, slot: Ff3DsSlot): number[] {
    if (!Number.isInteger(job) || job < 0 || job >= JOB_COUNT || job === this.job) return [];
    const moved: number[] = [];
    for (let g = 0; g < GEAR_SLOTS.length; g++) {
      const id = this.gear(g);
      if (!id || canEquip(job, id)) continue;
      if (slot.add(id, Math.max(1, this.gearCount(g)))) { this.clearGear(g); moved.push(id); }
    }
    le.setU32(this.d, this.o + 0x100, this.job);
    le.setU32(this.d, this.o + 0xfc, job);
    // A job's commands are filled in the first time someone takes it; the first four are the battle menu.
    const cmd = this.o + 0x104 + job * 0x14 + 8;
    if ([0, 1, 2, 3, 4].every((k) => !le.u16(this.d, cmd + k * 2))) COMMANDS[job].forEach((c, k) => le.setU16(this.d, cmd + k * 2, c));
    for (let k = 0; k < 4; k++) this.d[this.o + 0x2d2 + k] = le.u16(this.d, cmd + k * 2);
    this.d[this.o + 0x2e8] = 0;
    this.grow();
    return moved;
  }

  /** Spell charges of `level` (1-8): [current, max] at +0x20 + 2 * (level - 1), and the current ones again from +0x30. */
  mp(level: number) { return this.d[this.o + 0x20 + (level - 1) * 2]; }
  maxMp(level: number) { return this.d[this.o + 0x21 + (level - 1) * 2]; }
  setMp(level: number, v: number) {
    const mp = clamp(v, 0, this.maxMp(level));
    this.d[this.o + 0x20 + (level - 1) * 2] = mp;
    this.d[this.o + 0x30 + (level - 1)] = mp;
  }
  setMaxMp(level: number, v: number) {
    this.d[this.o + 0x21 + (level - 1) * 2] = clamp(v, 0, MAX_MP);
    if (this.mp(level) > this.maxMp(level)) this.setMp(level, this.maxMp(level));
  }

  /** What gear place `slot` holds (0 = nothing). */
  gear(slot: number) { const id = le.u16(this.d, this.o + 0x86 + slot * 4); return id === NO_GEAR || id === NO_ITEM ? 0 : id; }
  /** How many of it: the arrows left, else 1. Taking it off puts that many in the bag. */
  gearCount(slot: number) { return this.gear(slot) ? this.d[this.o + 0x88 + slot * 4] : 0; }
  setArrows(hand: number, v: number) { if (hand < 2 && isArrow(this.gear(hand))) this.d[this.o + 0x88 + hand * 4] = clamp(v, 1, MAX_COUNT); }
  /** What gear place `slot` can take: that kind of thing, if this job can wear it. */
  gearChoices(slot: number): number[] { return GEAR_CHOICES[slot].filter((id) => canEquip(this.job, id)); }
  /** Equip `id` (0 = nothing): arrows come 99 to a hand, anything else 1. If the other hand holds something that
   * doesn't pair with it, that hand is emptied. Returns false if the job can't wear it. */
  setGear(slot: number, id: number): boolean {
    if (id === this.gear(slot)) return true;
    if (id && !this.gearChoices(slot).includes(id)) return false;
    if (!id) { this.clearGear(slot); return true; }
    if (slot < 2 && !pairs(id, this.gear(1 - slot))) this.clearGear(1 - slot);
    le.setU16(this.d, this.o + 0x86 + slot * 4, id);
    this.d[this.o + 0x88 + slot * 4] = isArrow(id) ? MAX_COUNT : 1;
    this.refreshWorn();
    return true;
  }
  private clearGear(slot: number) {
    le.setU16(this.d, this.o + 0x86 + slot * 4, slot < 2 ? this.L.noHand : NO_GEAR);
    this.d[this.o + 0x88 + slot * 4] = 0;
    this.refreshWorn();
  }

  /** The spells known at `level` (1-8): up to three. */
  spellsAt(level: number): number[] {
    return [0, 1, 2].map((k) => le.u32(this.d, this.o + 0x9c + ((level - 1) * 3 + k) * 4)).filter((id) => id && id !== NO_SPELL_PSP);
  }
  get spells(): number[] { return Array.from({ length: 8 }, (_, i) => this.spellsAt(i + 1)).flat(); }
  knows(id: number) { const lv = spellLevel(id); return lv > 0 && this.spellsAt(lv).includes(id); }
  /** False when the job can't learn it or its level already holds three spells. */
  learn(id: number): boolean {
    const lv = spellLevel(id);
    if (!lv) return false;
    if (this.knows(id)) return true;
    const row = this.spellsAt(lv);
    if (!canEquip(this.job, id) || row.length >= SPELLS_PER_LEVEL) return false;
    this.writeSpells(lv, [...row, id]);
    return true;
  }
  forget(id: number) { const lv = spellLevel(id); if (lv) this.writeSpells(lv, this.spellsAt(lv).filter((x) => x !== id)); }
  private writeSpells(level: number, ids: number[]) {
    for (let k = 0; k < SPELLS_PER_LEVEL; k++) le.setU32(this.d, this.o + 0x9c + ((level - 1) * 3 + k) * 4, ids[k] ?? this.L.noSpell);
  }

  /** Full HP and spell charges, ailments gone. */
  restore() {
    this.d[this.o + 0x43] &= ~AILMENT_BITS;
    this.hp = this.maxHp;
    for (let lv = 1; lv <= 8; lv++) this.setMp(lv, this.maxMp(lv));
  }
}

export class Ff3DsSlot {
  private readonly d: Uint8Array;
  private readonly L: Ff3Layout;
  readonly index: number;
  readonly at: number;
  readonly used: boolean;
  readonly party: Ff3DsChar[];
  /** The bag and what the Fat Chocobo keeps, in the game's order; serialize() writes them back if they changed. */
  readonly bag: BagItem[];
  readonly chocobo: BagItem[];
  /** The key items, in the order the game got them. */
  private readonly keys: BagItem[];
  private readonly was: string;
  constructor(d: Uint8Array, index: number, layout: Ff3Layout = DS_LAYOUT) {
    this.d = d;
    this.L = layout;
    this.index = index;
    this.at = layout.slotAt(index);
    this.used = layout.slotOk(d, index);
    this.party = Array.from({ length: 4 }, (_, i) => new Ff3DsChar(d, this.at, i, layout));
    this.bag = this.used ? this.readList(0, BAG_SIZE) : [];
    this.keys = this.used ? this.readList(BAG_SIZE, KEY_SIZE) : [];
    this.chocobo = this.used ? this.readList(BAG_SIZE + KEY_SIZE, CHOCOBO_SIZE) : [];
    this.was = JSON.stringify([this.bag, this.keys, this.chocobo]);
  }
  get isQuicksave() { return this.L === DS_LAYOUT && this.index === QUICKSAVE; }
  /** "Slot 1"-"Slot 3" as the DS's Load screen numbers them, or "Quicksave" (what Continue on the title screen loads). */
  get label() { return this.L.slotLabel(this.index); }

  get gil() { return le.u32(this.d, this.at + this.L.gil); }
  set gil(v: number) { le.setU32(this.d, this.at + this.L.gil, clamp(v, 0, MAX_GIL)); }
  /** Play time in seconds. */
  get seconds() { return le.u32(this.d, this.at + this.L.seconds); }

  /** Is job `j` in the Job menu? The Freelancer always is. */
  jobOpen(j: number) { return j === 0 || !!this.d[this.at + this.L.jobs + j]; }
  /** Opening a job also opens the Job menu itself, which the story keeps shut until the first crystal. */
  setJobOpen(j: number, on: boolean) {
    if (j <= 0 || j >= JOB_COUNT) return;
    this.d[this.at + this.L.jobs + j] = on ? 1 : 0;
    if (on) this.d[this.at + this.L.jobMenu] = 1;
  }
  get jobsOpen(): number[] { return JOBS.map((_, j) => j).filter((j) => this.jobOpen(j)); }

  private readList(from: number, n: number): BagItem[] {
    const out: BagItem[] = [];
    for (let i = 0; i < n; i++) {
      const o = this.at + this.L.items + (from + i) * 4;
      const id = le.u16(this.d, o), count = le.u16(this.d, o + 2);
      // A place the game emptied reads FFFF; it also leaves the odd place with a count of 0, which it doesn't show.
      if (id !== NO_ITEM && count) out.push({ id, count: Math.min(count, MAX_COUNT) });
    }
    return out;
  }
  private writeList(out: Uint8Array, from: number, n: number, items: BagItem[]) {
    const list = items.filter((x) => x.id && x.id !== NO_ITEM && x.count > 0).slice(0, n);
    for (let i = 0; i < n; i++) {
      const o = this.at + this.L.items + (from + i) * 4;
      le.setU16(out, o, list[i] ? list[i].id : NO_ITEM);
      le.setU16(out, o + 2, list[i] ? clamp(list[i].count, 1, MAX_COUNT) : 0);
    }
  }
  /** Write the bag, the key items and the Fat Chocobo's list into `out`, if any of them changed. */
  writeLists(out: Uint8Array) {
    if (JSON.stringify([this.bag, this.keys, this.chocobo]) === this.was) return;
    this.writeList(out, 0, BAG_SIZE, this.bag);
    this.writeList(out, BAG_SIZE, KEY_SIZE, this.keys);
    this.writeList(out, BAG_SIZE + KEY_SIZE, CHOCOBO_SIZE, this.chocobo);
  }

  get keyItems(): number[] { return this.keys.map((x) => x.id); }
  hasKeyItem(id: number) { return this.keys.some((x) => x.id === id); }
  /** Give or take a key item. One of each, added at the end of the list as the game does. */
  setKeyItem(id: number, on: boolean): boolean {
    if (INFO.get(id)?.kind !== 'key') return false;
    const i = this.keys.findIndex((x) => x.id === id);
    if (!on) { if (i >= 0) this.keys.splice(i, 1); return true; }
    if (i >= 0) return true;
    if (this.keys.length >= KEY_SIZE) return false;
    this.keys.push({ id, count: 1 });
    return true;
  }

  count(id: number) { return this.bag.filter((x) => x.id === id).reduce((n, x) => n + x.count, 0); }
  stored(id: number) { return this.chocobo.filter((x) => x.id === id).reduce((n, x) => n + x.count, 0); }
  /** Add `qty` of `id` to the bag the way the game does: onto its stack (99 at most), else in a new place. False when the
   * bag is full. */
  add(id: number, qty = 1): boolean {
    if (!storable(id)) return false;
    const it = this.bag.find((x) => x.id === id);
    if (it) { it.count = Math.min(MAX_COUNT, it.count + qty); return true; }
    if (this.bag.length >= BAG_SIZE) return false;
    this.bag.push({ id, count: clamp(qty, 1, MAX_COUNT) });
    return true;
  }
  /** Top the bag up to 99 Elixirs. */
  maxElixirs(): boolean {
    const it = this.bag.find((x) => x.id === ELIXIR);
    if (it) { it.count = MAX_COUNT; return true; }
    return this.add(ELIXIR, MAX_COUNT);
  }
}

export class Ff3DsSave implements EditableSave {
  readonly data: Uint8Array;
  readonly slots: Ff3DsSlot[];
  private readonly layout: Ff3Layout;
  constructor(data: Uint8Array, layout: Ff3Layout = DS_LAYOUT) {
    this.data = data.slice();
    this.layout = layout;
    this.slots = Array.from({ length: layout.slotCount }, (_, i) => new Ff3DsSlot(this.data, i, layout));
    if (!this.usedSlots.length) throw new Error('None of this Final Fantasy III save’s slots pass the game’s save check.');
  }
  get usedSlots() { return this.slots.filter((s) => s.used); }

  serialize(): Uint8Array {
    const out = this.data.slice();
    for (const s of this.usedSlots) {
      s.writeLists(out);
      this.layout.writeChecksum(out, s.index);
    }
    return out;
  }

  summary(): SummaryLine[] {
    return this.usedSlots.map((s) => ({
      label: s.label.toUpperCase(),
      value: `${s.party[0].name || '—'} · L${s.party[0].level} · ${s.gil.toLocaleString('en-US')} gil`,
    }));
  }

  describeChanges(before: EditableSave): ChangeGroup[] {
    const b = before as Ff3DsSave;
    const groups: ChangeGroup[] = [];
    const add = (title: string, lines: string[]) => {
      if (lines.length) groups.push(lines.length > 12 ? { title, lines: lines.slice(0, 12), more: lines.length - 12 } : { title, lines });
    };
    const several = this.usedSlots.length > 1;
    const gearName = (id: number) => (id ? itemName(id) : 'None');
    const num = (v: string | number) => (typeof v === 'number' ? v.toLocaleString('en-US') : v);
    for (const sa of this.usedSlots) {
      const sb = b.slots[sa.index];
      const prefix = several ? `${sa.label}: ` : '';
      sa.party.forEach((ca, i) => {
        const cb = sb.party[i];
        const lines: string[] = [];
        const diff = (label: string, x: string | number, y: string | number) => { if (x !== y) lines.push(`${label}: ${num(x)} → ${num(y)}`); };
        diff('Name', cb.name, ca.name);
        diff('Job', cb.jobName, ca.jobName);
        diff('Level', cb.level, ca.level);
        diff('Exp', cb.exp, ca.exp);
        diff('HP', `${cb.hp}/${cb.maxHp}`, `${ca.hp}/${ca.maxHp}`);
        AILMENTS.forEach(([bit, n]) => { if (cb.has(bit) !== ca.has(bit)) lines.push(ca.has(bit) ? `Now ${n}` : `Cured ${n}`); });
        for (const k of STAT_KEYS) diff(STAT_LABELS[k], cb.stat(k), ca.stat(k));
        for (let lv = 1; lv <= 8; lv++) diff(`Level ${lv} MP`, `${cb.mp(lv)}/${cb.maxMp(lv)}`, `${ca.mp(lv)}/${ca.maxMp(lv)}`);
        JOBS.forEach((n, j) => diff(`${n} job level`, cb.jobLevel(j), ca.jobLevel(j)));
        GEAR_SLOTS.forEach((n, g) => {
          const x = cb.gear(g), y = ca.gear(g);
          if (x !== y) diff(n, gearName(x), gearName(y));
          else if (isArrow(y)) diff(`${n}: arrows`, cb.gearCount(g), ca.gearCount(g));
        });
        for (const id of ca.spells) if (!cb.knows(id)) lines.push(`Learned ${itemName(id)}`);
        for (const id of cb.spells) if (!ca.knows(id)) lines.push(`Forgot ${itemName(id)}`);
        add(prefix + (ca.name || `Character ${i + 1}`), lines);
      });
      const items: string[] = [];
      if (sb.gil !== sa.gil) items.push(`Gil: ${num(sb.gil)} → ${num(sa.gil)}`);
      for (const id of new Set([...sb.bag, ...sa.bag].map((x) => x.id))) {
        const x = sb.count(id), y = sa.count(id);
        if (x !== y) items.push(`${itemName(id)}: ${x} → ${y}`);
      }
      for (const id of new Set([...sb.chocobo, ...sa.chocobo].map((x) => x.id))) {
        const x = sb.stored(id), y = sa.stored(id);
        if (x !== y) items.push(`Fat Chocobo, ${itemName(id)}: ${x} → ${y}`);
      }
      for (const id of [...STORY_ITEMS, ...JOB_CARDS]) {
        if (sb.hasKeyItem(id) !== sa.hasKeyItem(id)) items.push(`${itemName(id)}: ${sa.hasKeyItem(id) ? 'added' : 'removed'}`);
      }
      JOBS.forEach((n, j) => { if (sb.jobOpen(j) !== sa.jobOpen(j)) items.push(sa.jobOpen(j) ? `Job menu: ${n} added` : `Job menu: ${n} taken out`); });
      add(`${prefix}Items and jobs`, items);
    }
    return groups;
  }
}
