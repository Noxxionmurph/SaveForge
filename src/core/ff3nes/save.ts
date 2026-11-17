// Final Fantasy III (Famicom) save model: the three save slots of the cartridge (see layout.ts). Every field reads and
// writes the slot's bytes directly; serialize() redoes the check byte of each slot that loaded. Offsets are from
// everything8215's RAM map (github.com/everything8215/ff3, field-ram.txt), relative to $6000:
//
//   $600B guest, $601B capacity points, $601C gil (3 bytes), $6021 bits 0-4 the crystals' jobs, $60C0 bag ids (32),
//   $60E0 bag counts, $6100 + $40n character part 1, $6200 + $40n part 2, $6300 the Fat Chocobo's count of each item id.
//
// Levels and job levels are kept as level - 1 (the menus add one). The record holds the current job's level at $6110 and
// every job's at $6210 + 2 * job; the game copies between them when the job changes. Stats and max MP follow from the
// job and level alone (the job's own numbers plus a level-up entry per level, tables.ts), so changing either here
// works them out again the way the game does.

import { clamp } from '../bytes.ts';
import type { ChangeGroup, EditableSave, SummaryLine } from '../types.ts';
import { JOB_COUNT, SLOT_COUNT, slotBase, slotOk, writeChecksum } from './layout.ts';
import { EQUIP, EXP_TABLE, GUESTS, ITEMS, ITEM_KINDS, JOBS, JOB_STATS, LEVEL_UP, MP_START, STAT_BONUS } from './tables.ts';
import { NAME_LENGTH, decodeName, encodeName } from './text.ts';

export { GUESTS, ITEMS, ITEM_KINDS, JOBS };
export const MAX_LEVEL = 99;
export const MAX_EXP = 9_999_999;
export const MAX_HP = 9_999;
export const MAX_MP = 99;
export const MAX_STAT = 99;
export const MAX_GIL = 9_999_999;
export const MAX_CP = 255;
export const MAX_COUNT = 99;
export const BAG_SIZE = 32;
export const SPELLS_PER_LEVEL = 3;
/** Arrows the Equip menu moves into a hand at most (3C/9CF6). */
export const QUIVER = 20;

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** The crystals in the order the story hands them out (event switches $08-$0C, bits 0-4 of $6021). The Job menu lists
 * jobs 0 to the last job of the newest crystal, and only counts a crystal when all the earlier ones are there too
 * (3F/F38A). The Onion Kid is always there. */
export const CRYSTALS: readonly { name: string; jobs: readonly number[] }[] = [
  { name: 'Wind', jobs: range(1, 5) },
  { name: 'Fire', jobs: range(6, 9) },
  { name: 'Water', jobs: range(10, 16) },
  { name: 'Earth', jobs: range(17, 19) },
  { name: 'Eureka', jobs: range(20, 21) },
];

/** Can job `job` wear item `id`, or learn spell `id`? */
export const canEquip = (job: number, id: number) => !!(EQUIP[id] & (1 << job));
/** The lowest level that can take job `job` (3D/AE23). */
export const minLevel = (job: number) => JOB_STATS[job][1] + 1;
/** The experience level `level` starts at. */
export const expFor = (level: number) => (level <= 1 ? 0 : EXP_TABLE[Math.min(level, MAX_LEVEL) - 2]);
/** The level `exp` experience makes. */
export function levelFor(exp: number): number {
  let lv = 1;
  while (lv < MAX_LEVEL && exp >= EXP_TABLE[lv - 1]) lv++;
  return lv;
}

const levelUps: Uint8Array[] = [];
const levelUp = (job: number) => (levelUps[job] ??= Uint8Array.from(LEVEL_UP[job].match(/../g)!, (x) => parseInt(x, 16)));
/** Stats (strength, agility, vitality, intelligence, spirit) and max MP (spell levels 1-8) of `job` at `level`, worked
 * out as the Job menu does (3D/AB8F): the job's own numbers plus one level-up entry for each level past the first, every
 * stat and max MP capped at 99. A level up in battle adds the next entry the same way (35/BF0B). */
export function growth(job: number, level: number): { stats: number[]; maxMp: number[] } {
  const row = JOB_STATS[job];
  const stats = row.slice(2, 7);
  const maxMp = [...MP_START[row[7]]];
  const ups = levelUp(job);
  for (let i = 0; i < clamp(level, 1, MAX_LEVEL) - 1; i++) {
    const a = ups[i * 2], b = ups[i * 2 + 1];
    for (let k = 0; k < 5; k++) if (a & (0x80 >> k)) stats[k] = Math.min(MAX_STAT, stats[k] + (a & 7));
    for (let lv = 0; lv < 8; lv++) if (b & (1 << lv)) maxMp[lv] = Math.min(MAX_MP, maxMp[lv] + 1);
  }
  return { stats, maxMp };
}

export const STAT_KEYS = ['str', 'agi', 'vit', 'int', 'spi'] as const;
export type StatKey = typeof STAT_KEYS[number];
export const STAT_LABELS: Record<StatKey, string> = { str: 'Strength', agi: 'Agility', vit: 'Vitality', int: 'Intelligence', spi: 'Spirit' };

/** Status bits ($6102), top bit first. Bit 0 is bookkeeping for the menus, not an ailment. */
export const AILMENTS: readonly [number, string][] = [
  [0x80, 'KO'], [0x40, 'Stone'], [0x20, 'Toad'], [0x10, 'Silence'], [0x08, 'Mini'], [0x04, 'Blind'], [0x02, 'Poison'],
];
const AILMENT_BITS = 0xfe;

export const GEAR_SLOTS = ['Right hand', 'Left hand', 'Head', 'Body', 'Arms'] as const;
/** Part-2 offsets of each gear slot, in GEAR_SLOTS order. Arrows count down from the byte after each hand. */
const GEAR_AT = [0x03, 0x05, 0x00, 0x01, 0x02];

export const KIND = {
  weapon: range(0x01, 0x4e),
  arrow: range(0x4f, 0x56),
  shield: range(0x58, 0x61),
  head: range(0x62, 0x71),
  body: range(0x72, 0x8a),
  arms: range(0x8b, 0x97),
  key: range(0x98, 0xa4),
  item: range(0xa6, 0xc7),
  spell: range(0xc8, 0xff),
} as const;
const HAND = [...KIND.weapon, ...KIND.arrow, ...KIND.shield];
export const GEAR_CHOICES: readonly (readonly number[])[] = [HAND, HAND, KIND.head, KIND.body, KIND.arms];
export const isArrow = (id: number) => id >= 0x4f && id <= 0x56;
/** 0 weapon or shield, 1 bow, 2 arrows, 3 harp (3C/9D2F). */
const handType = (id: number) => (id >= 0x46 && id < 0x4a ? 3 : id >= 0x4a && id < 0x4f ? 1 : isArrow(id) ? 2 : 0);
/** Can these two go in the two hands together? Weapons and shields pair up, a bow pairs with arrows, a harp goes
 * alone (3C/9D4B). */
export function pairs(a: number, b: number): boolean {
  if (!a || !b) return true;
  const x = handType(a), y = handType(b);
  return (x === 0 && y === 0) || (x === 1 && y === 2) || (x === 2 && y === 1);
}

/** Spell item ids 0xC8-0xFF run from level 8 down to level 1, seven to a level: three black, three white, a summon. */
export const spellLevel = (id: number) => 8 - Math.floor((id - 0xc8) / 7);
const spellBit = (id: number) => 1 << ((id - 0xc8) % 7);
/** The spells of `level` (1-8), in the order the game lists them. */
export const spellsOfLevel = (level: number) => range(0xc8 + (8 - level) * 7, 0xc8 + (8 - level) * 7 + 6);
export const SCHOOLS: Record<string, string> = { black: 'Black', white: 'White', summon: 'Summon' };

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const setU16 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >> 8) & 0xff; };
const u24 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8) | (d[o + 2] << 16);
const setU24 = (d: Uint8Array, o: number, v: number) => { d[o] = v & 0xff; d[o + 1] = (v >> 8) & 0xff; d[o + 2] = (v >> 16) & 0xff; };

export class Ff3Char {
  private readonly d: Uint8Array;
  /** Part 1 ($6100 + $40n) and part 2 ($6200 + $40n). */
  private readonly o: number;
  private readonly o2: number;
  readonly index: number;
  constructor(d: Uint8Array, slotAt: number, index: number) {
    this.d = d;
    this.index = index;
    this.o = slotAt + 0x100 + index * 0x40;
    this.o2 = slotAt + 0x200 + index * 0x40;
  }

  get job() { return this.d[this.o] % JOB_COUNT; }
  get jobName() { return JOBS[this.job]; }

  get name() { return decodeName(this.d.subarray(this.o + 6, this.o + 6 + NAME_LENGTH)); }
  set name(text: string) { if (text !== this.name) this.d.set(encodeName(text), this.o + 6); }

  /** Level 1-99. The game keeps it in step with exp: exp moves to the new level's start if it's out of range, and stats
   * and max MP become what the job has at that level. */
  get level() { return this.d[this.o + 1] + 1; }
  set level(v: number) {
    const lv = clamp(v, 1, MAX_LEVEL);
    if (lv === this.level) return;
    this.d[this.o + 1] = lv - 1;
    if (levelFor(this.exp) !== lv) setU24(this.d, this.o + 3, expFor(lv));
    this.grow();
  }
  /** Experience; the level follows it. */
  get exp() { return u24(this.d, this.o + 3); }
  set exp(v: number) {
    setU24(this.d, this.o + 3, clamp(v, 0, MAX_EXP));
    const lv = levelFor(this.exp);
    if (lv !== this.level) { this.d[this.o + 1] = lv - 1; this.grow(); }
  }

  /** HP; 0 HP and KO go together, as they do in the game. */
  get hp() { return u16(this.d, this.o + 0x0c); }
  set hp(v: number) {
    setU16(this.d, this.o + 0x0c, clamp(v, 0, this.maxHp));
    if (!this.hp !== this.has(0x80)) this.d[this.o + 2] ^= 0x80;
  }
  get maxHp() { return u16(this.d, this.o + 0x0e); }
  set maxHp(v: number) { setU16(this.d, this.o + 0x0e, clamp(v, 1, MAX_HP)); if (this.hp > this.maxHp) this.hp = this.maxHp; }

  /** Job level 1-99 of job `j`. The current job's lives in the record itself, the others in the per-job list. */
  jobLevel(j: number) { return (j === this.job ? this.d[this.o + 0x10] : this.d[this.o2 + 0x10 + j * 2]) + 1; }
  setJobLevel(j: number, v: number) {
    const lv = clamp(v, 1, MAX_LEVEL) - 1;
    if (j === this.job) this.d[this.o + 0x10] = lv;
    this.d[this.o2 + 0x10 + j * 2] = lv;
  }

  /** A stat without gear. The record also keeps each stat with gear (+$05), redone here as the game does it. */
  stat(k: StatKey) { return this.d[this.o + 0x12 + STAT_KEYS.indexOf(k)]; }
  /** A stat with gear: what battles use. */
  wornStat(k: StatKey) { return this.d[this.o + 0x17 + STAT_KEYS.indexOf(k)]; }
  setStat(k: StatKey, v: number) {
    this.d[this.o + 0x12 + STAT_KEYS.indexOf(k)] = clamp(v, 1, MAX_STAT);
    this.refreshWorn();
  }
  /** Stats with gear: each worn piece that gives a stat adds 5, up to 99 (battle algorithm $05, 31/AB68). */
  private refreshWorn() {
    for (let k = 0; k < 5; k++) {
      let v = this.d[this.o + 0x12 + k];
      for (let g = 0; g < GEAR_SLOTS.length; g++) if (STAT_BONUS[this.gear(g)] & (0x10 >> k)) v += 5;
      this.d[this.o + 0x17 + k] = Math.min(MAX_STAT, v);
    }
  }
  /** Stats and max MP become what the job has at this level; MP stays unless it's over the new max. */
  private grow() {
    const { stats, maxMp } = growth(this.job, this.level);
    stats.forEach((v, k) => { this.d[this.o + 0x12 + k] = v; });
    this.refreshWorn();
    maxMp.forEach((v, i) => this.setMaxMp(i + 1, v));
  }

  /** Does the Job menu let this character take `job`? It lists the jobs the crystals have handed out and wants a lowest
   * level (3D/AE23). It also wants capacity and bare hands; the editor charges nothing and moves gear itself. */
  canBecome(job: number, open: readonly number[]) { return job !== this.job && open.includes(job) && this.level >= minLevel(job); }
  /** Take `job` the way the Job menu does (3D/AB8F): the old job's level is put by and the new job's taken out, and stats
   * and max MP become the new job's at this level. Spells stay. Gear the new job can't use goes into the bag (it stays
   * on when the bag is full). Returns what went into the bag. */
  changeJob(job: number, slot: Ff3Slot): number[] {
    if (!Number.isInteger(job) || job < 0 || job >= JOB_COUNT || job === this.job) return [];
    const moved: number[] = [];
    for (let g = 0; g < GEAR_SLOTS.length; g++) {
      const id = this.gear(g);
      if (!id || canEquip(job, id)) continue;
      if (slot.add(id, g < 2 ? Math.max(1, this.arrows(g)) : 1)) { this.clearGear(g); moved.push(id); }
    }
    const old = this.job;
    this.d[this.o2 + 0x10 + old * 2] = this.d[this.o + 0x10];
    this.d[this.o2 + 0x11 + old * 2] = this.d[this.o + 0x11];
    this.d[this.o] = job;
    this.d[this.o + 0x10] = this.d[this.o2 + 0x10 + job * 2];
    this.d[this.o + 0x11] = this.d[this.o2 + 0x11 + job * 2];
    this.grow();
    return moved;
  }

  /** Spell charges of `level` (1-8): [current, max] at $6130 + 2 * (level - 1). */
  mp(level: number) { return this.d[this.o + 0x30 + (level - 1) * 2]; }
  maxMp(level: number) { return this.d[this.o + 0x31 + (level - 1) * 2]; }
  setMp(level: number, v: number) { this.d[this.o + 0x30 + (level - 1) * 2] = clamp(v, 0, this.maxMp(level)); }
  setMaxMp(level: number, v: number) {
    this.d[this.o + 0x31 + (level - 1) * 2] = clamp(v, 0, MAX_MP);
    if (this.mp(level) > this.maxMp(level)) this.setMp(level, this.maxMp(level));
  }

  get status() { return this.d[this.o + 2]; }
  has(bit: number) { return !!(this.status & bit); }
  get ailing() { return !!(this.status & AILMENT_BITS); }
  setAilment(bit: number, on: boolean) {
    this.d[this.o + 2] = on ? this.status | bit : this.status & ~bit;
    if (bit === 0x80) this.hp = on ? 0 : Math.max(this.hp, 1);
  }

  get backRow() { return !!(this.d[this.o2 + 0x0f] & 1); }
  set backRow(v: boolean) { this.d[this.o2 + 0x0f] = v ? this.d[this.o2 + 0x0f] | 1 : this.d[this.o2 + 0x0f] & ~1; }

  gear(slot: number) { return this.d[this.o2 + GEAR_AT[slot]]; }
  /** How many of a hand's item (0 right, 1 left): the arrows left, else 1. Taking it off puts that many in the bag. */
  arrows(hand: number) { return this.d[this.o2 + GEAR_AT[hand] + 1]; }
  setArrows(hand: number, v: number) { if (isArrow(this.gear(hand))) this.d[this.o2 + GEAR_AT[hand] + 1] = clamp(v, 1, MAX_COUNT); }
  /** What gear slot `slot` can take: that kind of item, if this job can wear it. */
  gearChoices(slot: number): number[] { return GEAR_CHOICES[slot].filter((id) => ITEMS[id] && canEquip(this.job, id)); }
  /** Equip `id` (0 = nothing) as the Equip menu would: arrows come 20 to a hand, anything else 1 (3C/9CF6). If the
   * other hand holds something that doesn't pair with it, that hand is emptied. Returns false if the job can't wear it. */
  setGear(slot: number, id: number): boolean {
    if (id && !this.gearChoices(slot).includes(id)) return false;
    if (id && slot < 2 && !pairs(id, this.gear(1 - slot))) this.clearGear(1 - slot);
    this.d[this.o2 + GEAR_AT[slot]] = id;
    if (slot < 2) this.d[this.o2 + GEAR_AT[slot] + 1] = !id ? 0 : isArrow(id) ? QUIVER : 1;
    this.refreshWorn();
    return true;
  }
  private clearGear(slot: number) {
    this.d[this.o2 + GEAR_AT[slot]] = 0;
    if (slot < 2) this.d[this.o2 + GEAR_AT[slot] + 1] = 0;
    this.refreshWorn();
  }

  /** Known spells, a bit per spell in one byte per level ($6207 + level - 1). The menus show three per level. */
  knows(id: number) { return !!(this.d[this.o2 + 6 + spellLevel(id)] & spellBit(id)); }
  get spells(): number[] { return KIND.spell.filter((id) => this.knows(id)).sort((a, b) => spellLevel(a) - spellLevel(b) || a - b); }
  spellsAt(level: number) { return spellsOfLevel(level).filter((id) => this.knows(id)); }
  /** False when the job can't learn it or that level already holds three spells. */
  learn(id: number): boolean {
    if (!KIND.spell.includes(id)) return false;
    if (this.knows(id)) return true;
    if (!canEquip(this.job, id) || this.spellsAt(spellLevel(id)).length >= SPELLS_PER_LEVEL) return false;
    this.d[this.o2 + 6 + spellLevel(id)] |= spellBit(id);
    return true;
  }
  forget(id: number) { if (KIND.spell.includes(id)) this.d[this.o2 + 6 + spellLevel(id)] &= ~spellBit(id); }

  /** Full HP and spell charges, ailments gone. */
  restore() {
    this.d[this.o + 2] &= ~AILMENT_BITS;
    this.hp = this.maxHp;
    for (let lv = 1; lv <= 8; lv++) this.setMp(lv, this.maxMp(lv));
  }
}

export class Ff3Slot {
  private readonly d: Uint8Array;
  readonly at: number;
  readonly number: number;
  readonly used: boolean;
  readonly party: Ff3Char[];
  constructor(d: Uint8Array, index: number) {
    this.d = d;
    this.number = index + 1;
    this.at = slotBase(index);
    this.used = slotOk(d, index);
    this.party = Array.from({ length: 4 }, (_, i) => new Ff3Char(d, this.at, i));
  }
  get gil() { return u24(this.d, this.at + 0x1c); }
  set gil(v: number) { setU24(this.d, this.at + 0x1c, clamp(v, 0, MAX_GIL)); }
  get cp() { return this.d[this.at + 0x1b]; }
  set cp(v: number) { this.d[this.at + 0x1b] = clamp(v, 0, MAX_CP); }
  /** Who's travelling with the party (0 = nobody). */
  get guest() { return GUESTS[this.d[this.at + 0x0b]] ?? ''; }

  /** How many crystals' jobs the Job menu offers (0-5): the crystals counted in order, up to the first one missing. */
  get crystals() {
    let n = 0;
    while (n < CRYSTALS.length && this.d[this.at + 0x21] & (1 << n)) n++;
    return n;
  }
  /** Has crystal `n` (0 Wind ... 4 Eureka) handed out its jobs, as far as the Job menu goes? */
  crystal(n: number) { return n < this.crystals; }
  /** Opening a crystal opens the ones before it; closing one closes the ones after. */
  setCrystal(n: number, on: boolean) {
    const mask = on ? (2 << n) - 1 : 0x1f & ~((1 << n) - 1);
    this.d[this.at + 0x21] = on ? this.d[this.at + 0x21] | mask : this.d[this.at + 0x21] & ~mask;
  }
  /** The jobs the Job menu offers. */
  get jobsOpen(): number[] { return [0, ...CRYSTALS.slice(0, this.crystals).flatMap((c) => c.jobs)]; }

  /** The bag: 32 places of [item id, count]. */
  id(i: number) { return this.d[this.at + 0xc0 + i]; }
  qty(i: number) { return this.id(i) ? this.d[this.at + 0xe0 + i] : 0; }
  get bag(): { id: number; qty: number }[] { return Array.from({ length: BAG_SIZE }, (_, i) => ({ id: this.id(i), qty: this.qty(i) })); }
  count(id: number) { return this.bag.filter((x) => x.id === id).reduce((n, x) => n + x.qty, 0); }
  get free() { return this.bag.filter((x) => !x.id).length; }
  /** Can the editor put `id` in the bag? Key items move the story on, so no. */
  static bagItem(id: number) { return !!ITEMS[id] && !KIND.key.includes(id); }
  setAt(i: number, id: number, qty: number) {
    if (id && !Ff3Slot.bagItem(id)) return;
    this.d[this.at + 0xc0 + i] = id;
    this.d[this.at + 0xe0 + i] = id ? clamp(qty, 1, MAX_COUNT) : 0;
  }
  /** Add `qty` of `id` the way the game does: onto its stack, else into the first empty place. False when there's no room. */
  add(id: number, qty = 1): boolean {
    if (!Ff3Slot.bagItem(id)) return false;
    let i = this.bag.findIndex((x) => x.id === id);
    if (i < 0) i = this.bag.findIndex((x) => !x.id);
    if (i < 0) return false;
    this.setAt(i, id, this.qty(i) + qty);
    return true;
  }

  /** What the Fat Chocobo is keeping: a count for every item id. */
  stored(id: number) { return this.d[this.at + 0x300 + id]; }
  setStored(id: number, v: number) { if (!v || Ff3Slot.bagItem(id)) this.d[this.at + 0x300 + id] = clamp(v, 0, MAX_COUNT); }
  get storedIds(): number[] { return Array.from({ length: 256 }, (_, id) => id).filter((id) => id && this.stored(id)); }
}

export class Ff3NesSave implements EditableSave {
  readonly data: Uint8Array;
  readonly slots: Ff3Slot[];
  constructor(data: Uint8Array) {
    this.data = data.slice();
    this.slots = Array.from({ length: SLOT_COUNT }, (_, i) => new Ff3Slot(this.data, i));
    if (!this.usedSlots.length) throw new Error('None of this Final Fantasy III save’s slots pass the game’s save check.');
  }
  get usedSlots() { return this.slots.filter((s) => s.used); }

  serialize(): Uint8Array {
    const out = this.data.slice();
    for (const s of this.usedSlots) writeChecksum(out, s.at);
    return out;
  }

  summary(): SummaryLine[] {
    return this.usedSlots.map((s) => ({
      label: `SLOT ${s.number}`,
      value: `${s.party[0].name || '—'} · L${s.party[0].level} · ${s.gil.toLocaleString('en-US')} gil`,
    }));
  }

  describeChanges(before: EditableSave): ChangeGroup[] {
    const b = before as Ff3NesSave;
    const groups: ChangeGroup[] = [];
    const add = (title: string, lines: string[]) => {
      if (lines.length) groups.push(lines.length > 12 ? { title, lines: lines.slice(0, 12), more: lines.length - 12 } : { title, lines });
    };
    const several = this.usedSlots.length > 1;
    const itemName = (id: number) => ITEMS[id] || (id ? `Item ${id}` : 'None');
    const num = (v: string | number) => (typeof v === 'number' ? v.toLocaleString('en-US') : v);
    for (const sa of this.usedSlots) {
      const sb = b.slots[sa.number - 1];
      const prefix = several ? `Slot ${sa.number}: ` : '';
      sa.party.forEach((ca, i) => {
        const cb = sb.party[i];
        const lines: string[] = [];
        const diff = (label: string, x: string | number, y: string | number) => { if (x !== y) lines.push(`${label}: ${num(x)} → ${num(y)}`); };
        diff('Name', cb.name, ca.name);
        diff('Job', cb.jobName, ca.jobName);
        diff('Level', cb.level, ca.level);
        diff('Exp', cb.exp, ca.exp);
        diff('HP', `${cb.hp}/${cb.maxHp}`, `${ca.hp}/${ca.maxHp}`);
        for (const k of STAT_KEYS) diff(STAT_LABELS[k], cb.stat(k), ca.stat(k));
        for (let lv = 1; lv <= 8; lv++) diff(`Level ${lv} MP`, `${cb.mp(lv)}/${cb.maxMp(lv)}`, `${ca.mp(lv)}/${ca.maxMp(lv)}`);
        JOBS.forEach((n, j) => diff(`${n} job level`, cb.jobLevel(j), ca.jobLevel(j)));
        AILMENTS.forEach(([bit, n]) => { if (cb.has(bit) !== ca.has(bit)) lines.push(ca.has(bit) ? `Now ${n}` : `Cured ${n}`); });
        GEAR_SLOTS.forEach((n, g) => diff(n, itemName(cb.gear(g)), itemName(ca.gear(g))));
        for (const id of ca.spells) if (!cb.knows(id)) lines.push(`Learned ${ITEMS[id]}`);
        for (const id of cb.spells) if (!ca.knows(id)) lines.push(`Forgot ${ITEMS[id]}`);
        add(prefix + (ca.name || `Character ${i + 1}`), lines);
      });
      const items: string[] = [];
      if (sb.gil !== sa.gil) items.push(`Gil: ${num(sb.gil)} → ${num(sa.gil)}`);
      if (sb.cp !== sa.cp) items.push(`Capacity: ${sb.cp} → ${sa.cp}`);
      const ids = new Set([...sa.bag, ...sb.bag].map((x) => x.id).filter(Boolean));
      for (const id of ids) {
        const x = sb.count(id), y = sa.count(id);
        if (x !== y) items.push(`${itemName(id)}: ${x} → ${y}`);
      }
      for (let id = 1; id < 256; id++) {
        if (sb.stored(id) !== sa.stored(id)) items.push(`Fat Chocobo, ${itemName(id)}: ${sb.stored(id)} → ${sa.stored(id)}`);
      }
      const crystalName = (n: number) => (n ? `${CRYSTALS[n - 1].name} crystal` : 'none');
      if (sb.crystals !== sa.crystals) items.push(`Jobs from crystals: ${crystalName(sb.crystals)} → ${crystalName(sa.crystals)}`);
      add(`${prefix}Items and jobs`, items);
    }
    return groups;
  }
}
