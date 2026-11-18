// Final Fantasy I, II and III Pixel Remaster (Steam) save model. One slot file is one save: JSON in the wrapper that
// crypto.ts opens, whose inner objects are themselves JSON strings (json.ts keeps every one it doesn't touch exactly as
// the game wrote it). The three games share the layout; data-ff<n>.ts has each one's names and starting numbers.
//
// What the save keeps, as found in the games' own code and tables (and checked on files the games wrote):
// - userData.ownedCharacterList: every character met. corpsList: the party, as owned-character ids (0 = empty place).
// - A character's level is parameter.addtionalLevel and currentExp is the total Exp. Max HP and MP, the stats and Final
//   Fantasy I's spell charges are kept as what was gained on top of the starting numbers (character_status), so the
//   number the menu shows is base + "addtional...".
// - equipmentList: five slots, each {contentId, count}; an empty slot holds the game's "Empty"/"None" entry.
// - normalOwnedItemList: the bag (items, weapons and armor) as {contentId, count}; importantOwendItemList: key items.
// - Final Fantasy II: skillLevelTargets (weapon-skill totals, keys 0-7 Sword, Knife, Spear, Axe, Staff, Bow, Shield,
//   Unarmed), spells in abilityList and abilityDictionary[3] (one ability per spell level), ownedKeyWaordList.
// - Final Fantasy III: jobList (one entry per job, with its level and total job points), releasedJobs.

import type { ChangeGroup, EditableSave, SummaryLine } from '../types.ts';
import { BASE, type PrData } from './data.ts';
import { openPr, sealPrFile } from './file.ts';
import { Doc, Num, Packed, asNum, num, parse, stringify, type Json, type JsonObject } from './json.ts';

export type PrGameId = PrData['game'];

/** Longest name the editor writes. The games' name screens allow 6-8 letters; longer names spill out of the menus. */
export const NAME_LENGTH = 8;

export type StatKey = 'strength' | 'vitality' | 'agility' | 'intelligence' | 'spirit' | 'magic' | 'luck';
const STAT_FIELD: Record<StatKey, string> = {
  strength: 'addtionalPower', vitality: 'addtionalVitality', agility: 'addtionalAgility', intelligence: 'addtionalIntelligence',
  spirit: 'addtionalSpirit', magic: 'addtionalMagic', luck: 'addtionalLuck',
};
/** The stats each game's Status screen lists, in its order and words. Final Fantasy III works its stats out from the job
 *  and level, so they aren't offered there. */
export const STATS: Record<PrGameId, readonly { key: StatKey; label: string }[]> = {
  ff1: [{ key: 'strength', label: 'Strength' }, { key: 'agility', label: 'Agility' }, { key: 'intelligence', label: 'Intellect' },
    { key: 'vitality', label: 'Stamina' }, { key: 'luck', label: 'Luck' }],
  ff2: [{ key: 'strength', label: 'Strength' }, { key: 'vitality', label: 'Stamina' }, { key: 'spirit', label: 'Spirit' },
    { key: 'agility', label: 'Agility' }, { key: 'intelligence', label: 'Intellect' }, { key: 'magic', label: 'Magic' }],
  ff3: [],
};

/** Equipment slot names by slot number - 1, in each game's words. */
export const SLOT_NAMES: Record<PrGameId, readonly string[]> = {
  ff1: ['Weapon', 'Shield', 'Body', 'Head', 'Arms'],
  ff2: ['Right hand', 'Left hand', 'Body', 'Head', 'Arms'],
  ff3: ['Right hand', 'Left hand', 'Body', 'Head', 'Arms'],
};
/** The slots in the Equip menu's order: hands, head, body, arms. */
export const SLOT_ORDER = [1, 2, 4, 3, 5] as const;

/** Final Fantasy II's weapon skills in the Status screen's order, by skillLevelTargets key. */
export const FF2_SKILLS = [
  { key: 7, label: 'Unarmed' }, { key: 1, label: 'Knife' }, { key: 0, label: 'Sword' }, { key: 4, label: 'Staff' },
  { key: 3, label: 'Axe' }, { key: 2, label: 'Spear' }, { key: 5, label: 'Bow' }, { key: 6, label: 'Shield' },
] as const;
/** Final Fantasy I's Orbs in owendCrystalFlags order. */
export const ORB_NAMES = ['Earth', 'Fire', 'Water', 'Wind'] as const;
/** A Final Fantasy II character can know 16 spells, each up to level 16. */
export const FF2_SPELL_SLOTS = 16;
export const FF2_SKILL_MAX = 16;
/** Final Fantasy I's spell charges per spell level top out at 9. */
export const FF1_MAX_CHARGES = 9;
/** Arrows put in a hand come as a stack of this many. */
export const ARROW_STACK = 20;
/** abilityDictionary key for the Magic command (Final Fantasy II). */
const MAGIC_COMMAND = 3;

const isObj = (v: Json | undefined): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Num);
const arr = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : []);
const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

/**
 * A list stored as {"target":[...]} whose entries are each a JSON string ({"contentId":2,"count":9}). Entries can be
 * added and removed, so they're kept here and the list is rebuilt on save; entries never changed keep their exact text.
 */
class EntryList {
  private node: Packed;
  private entries: { raw: string | null; obj: JsonObject }[];
  private dirty = false;
  constructor(node: Packed) {
    this.node = node;
    this.entries = arr(node.obj.target).flatMap((s) => {
      if (typeof s !== 'string') return [];
      const obj = parse(s);
      return isObj(obj) ? [{ raw: s, obj }] : [];
    });
  }
  get all(): readonly JsonObject[] { return this.entries.map((e) => e.obj); }
  find(test: (o: JsonObject) => boolean): JsonObject | undefined { return this.entries.find((e) => test(e.obj))?.obj; }
  edit(o: JsonObject): void {
    const e = this.entries.find((x) => x.obj === o);
    if (e) e.raw = null;
    this.changed();
  }
  push(o: JsonObject): void { this.entries.push({ raw: null, obj: o }); this.changed(); }
  remove(o: JsonObject): void {
    const i = this.entries.findIndex((x) => x.obj === o);
    if (i >= 0) { this.entries.splice(i, 1); this.changed(); }
  }
  private changed(): void { this.dirty = true; this.node.touch(); }
  /** Put the entries back into the document, ahead of writing it out. */
  flush(): void {
    if (this.dirty) this.node.obj.target = this.entries.map((e) => e.raw ?? stringify(e.obj));
  }
}

/** keys/values pairs ({"keys":[1,2],"values":[0,0]}) as a lookup by key. */
const kv = (o: JsonObject) => ({ keys: arr(o.keys).map(asNum), values: arr(o.values) });

export class PrChar {
  readonly id: number;
  readonly statusId: number;
  private s: PrSave;
  private node: Packed;
  private param: Packed;
  private _jobs: Packed[] | null = null;
  private _abilities: EntryList | null = null;
  private _magic: EntryList | null = null;

  constructor(s: PrSave, node: Packed) {
    this.s = s;
    this.node = node;
    this.id = asNum(node.obj.id);
    this.statusId = asNum(node.obj.characterStatusId);
    this.param = s.doc.open(node.obj, 'parameter', node);
  }

  private get o(): JsonObject { return this.node.obj; }
  private get p(): JsonObject { return this.param.obj; }
  private get data(): PrData { return this.s.data; }
  private base(i: number): number { return this.data.base[String(this.statusId)]?.[i] ?? 0; }
  private setNum(node: Packed, key: string, v: number): void {
    if (asNum(node.obj[key]) === v && node.obj[key] instanceof Num) return;
    node.obj[key] = num(v);
    node.touch();
  }

  get name(): string { return typeof this.o.name === 'string' ? this.o.name : ''; }
  set name(v: string) { this.o.name = v.slice(0, NAME_LENGTH); this.node.touch(); }

  /** The class (Final Fantasy I, 1-12), the character (II, 1-9) or the job (III, 1-22). */
  get job(): number { return asNum(this.o.jobId); }
  set job(v: number) { this.setNum(this.node, 'jobId', v); }
  get jobName(): string { return this.data.jobs[this.job - 1] ?? '—'; }

  get level(): number { return asNum(this.p.addtionalLevel); }
  set level(v: number) {
    const lv = clampInt(v, 1, this.data.max.level);
    this.setNum(this.param, 'addtionalLevel', lv);
    // Keep the Exp inside the new level, so "Next Level in" reads right and the next battle doesn't undo the change.
    const lo = this.data.exp[lv - 1] ?? 0, hi = this.data.exp[lv] ?? Infinity;
    if (this.exp < lo || this.exp >= hi) this.exp = lo;
  }
  get exp(): number { return asNum(this.o.currentExp); }
  set exp(v: number) { this.setNum(this.node, 'currentExp', clampInt(v, 0, this.data.max.exp)); }

  get hp(): number { return asNum(this.p.currentHP); }
  set hp(v: number) { this.setNum(this.param, 'currentHP', clampInt(v, 0, this.maxHp)); }
  /** The lowest Max HP the editor writes: the starting HP (the save can't keep less than nothing gained). */
  get minMaxHp(): number { return Math.max(1, this.base(BASE.hp)); }
  get maxHp(): number { return Math.min(this.data.max.hp, this.base(BASE.hp) + asNum(this.p.addtionalMaxHp)); }
  set maxHp(v: number) {
    this.setNum(this.param, 'addtionalMaxHp', clampInt(v, this.minMaxHp, this.data.max.hp) - this.base(BASE.hp));
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  /** Final Fantasy II's MP (I and III use spell charges instead). */
  get mp(): number { return asNum(this.p.currentMP); }
  set mp(v: number) { this.setNum(this.param, 'currentMP', clampInt(v, 0, this.maxMp)); }
  get minMaxMp(): number { return this.base(BASE.mp); }
  get maxMp(): number { return Math.min(this.data.max.mp, this.base(BASE.mp) + asNum(this.p.addtionalMaxMp)); }
  set maxMp(v: number) {
    this.setNum(this.param, 'addtionalMaxMp', clampInt(v, this.minMaxMp, this.data.max.mp) - this.base(BASE.mp));
    if (this.mp > this.maxMp) this.mp = this.maxMp;
  }

  /** Final Fantasy I's spell charges for spell level 1-8: left now, and the most. */
  charge(lv: number): number { return this.countAt('currentMpCountList', lv); }
  setCharge(lv: number, v: number): void { this.setCountAt('currentMpCountList', lv, clampInt(v, 0, this.maxCharge(lv))); }
  minMaxCharge(lv: number): number { return this.base(BASE.charges + lv - 1); }
  maxCharge(lv: number): number { return Math.min(FF1_MAX_CHARGES, this.minMaxCharge(lv) + this.countAt('addtionalMaxMpCountList', lv)); }
  setMaxCharge(lv: number, v: number): void {
    this.setCountAt('addtionalMaxMpCountList', lv, clampInt(v, this.minMaxCharge(lv), FF1_MAX_CHARGES) - this.minMaxCharge(lv));
    if (this.charge(lv) > this.maxCharge(lv)) this.setCharge(lv, this.maxCharge(lv));
  }
  private countAt(list: string, lv: number): number {
    const { keys, values } = kv(this.s.doc.open(this.p, list, this.param).obj);
    return asNum(values[keys.indexOf(lv)]);
  }
  private setCountAt(list: string, lv: number, v: number): void {
    const node = this.s.doc.open(this.p, list, this.param);
    const { keys, values } = kv(node.obj);
    const i = keys.indexOf(lv);
    if (i < 0 || asNum(values[i]) === v) return;
    values[i] = num(v);
    node.touch();
  }

  /** A stat as the Status screen shows it. */
  stat(k: StatKey): number { return Math.min(this.data.max.stat, this.base(BASE[k]) + asNum(this.p[STAT_FIELD[k]])); }
  minStat(k: StatKey): number { return Math.max(1, this.base(BASE[k])); }
  setStat(k: StatKey, v: number): void {
    this.setNum(this.param, STAT_FIELD[k], clampInt(v, this.minStat(k), this.data.max.stat) - this.base(BASE[k]));
  }

  // ---------- ailments ----------

  private get conditionNode(): Packed { return this.s.doc.open(this.p, 'currentConditionList', this.param); }
  get conditions(): number[] { return arr(this.conditionNode.obj.target).map(asNum); }
  hasCondition(id: number): boolean { return this.conditions.includes(id); }
  setCondition(id: number, on: boolean): void {
    if (this.hasCondition(id) === on) return;
    const node = this.conditionNode;
    const list = arr(node.obj.target);
    node.obj.target = on ? [...list, num(id)] : list.filter((v) => asNum(v) !== id);
    node.touch();
    if (id === this.s.koId) {
      // The game keeps a fallen character at 0 HP, and brings one back with some.
      if (on) this.setNum(this.param, 'currentHP', 0);
      else if (this.hp === 0) this.hp = 1;
    }
  }
  get fallen(): boolean { return this.hasCondition(this.s.koId); }

  /** Full HP and MP (and charges), and no ailments: an inn stay. */
  restore(): void {
    for (const id of this.conditions) this.setCondition(id, false);
    this.hp = this.maxHp;
    if (this.data.game === 'ff2') this.mp = this.maxMp;
    if (this.data.game === 'ff1') for (let lv = 1; lv <= 8; lv++) this.setCharge(lv, this.maxCharge(lv));
  }

  // ---------- equipment ----------

  private gearNode(slot: number): Packed | null {
    const eq = this.s.doc.open(this.o, 'equipmentList', this.node);
    const { keys, values } = kv(eq.obj);
    const i = keys.indexOf(slot);
    return i >= 0 && typeof values[i] === 'string' ? this.s.doc.open(values, i, eq) : null;
  }
  /** What's in equipment slot 1-5, as a content id; 0 when it's empty. */
  gear(slot: number): number {
    const id = asNum(this.gearNode(slot)?.obj.contentId);
    return id === this.data.empty[slot - 1] ? 0 : id;
  }
  /** Put a piece of gear (or nothing, 0) in a slot. A two-handed weapon empties the other hand. */
  setGear(slot: number, id: number): void {
    const node = this.gearNode(slot);
    if (!node || this.gear(slot) === id) return;
    node.obj.contentId = num(id || this.data.empty[slot - 1]);
    node.obj.count = num(id && this.s.isArrow(id) ? ARROW_STACK : 1);
    node.touch();
    if (slot <= 2 && id && this.s.gearInfo(id)?.[5]) this.setGear(3 - slot, 0);
    const other = slot <= 2 ? this.gear(3 - slot) : 0;
    if (slot <= 2 && id && other && this.s.gearInfo(other)?.[5]) this.setGear(3 - slot, 0);
  }
  /** How many are equipped in a slot: the arrows in a Final Fantasy III quiver, 1 for anything else. */
  gearCount(slot: number): number { return this.gear(slot) ? Math.max(1, asNum(this.gearNode(slot)?.obj.count)) : 0; }
  setGearCount(slot: number, n: number): void {
    const node = this.gearNode(slot);
    if (!node || !this.gear(slot)) return;
    this.setNum(node, 'count', clampInt(n, 1, this.data.max.item));
  }
  /**
   * Change class (Final Fantasy I) or job (III). In III, gear the new job can't use goes back to the bag, as the Job
   * menu does it; the ids moved are returned.
   */
  changeJob(id: number): number[] {
    if (this.job === id) return [];
    this.job = id;
    const moved: number[] = [];
    if (this.data.game !== 'ff3') return moved;
    for (let slot = 1; slot <= 5; slot++) {
      const g = this.gear(slot);
      if (!g || this.canWear(g)) continue;
      const n = this.gearCount(slot);
      this.setGear(slot, 0);
      this.s.setCount(g, this.s.count(g) + n);
      moved.push(g);
    }
    this.setJobLevel(id, this.jobLevel(id));
    return moved;
  }
  /** Whether the Equip menu lets this character wear it. */
  canWear(id: number): boolean {
    const g = this.s.gearInfo(id);
    return !!g && !!(g[4] & (1 << (this.job - 1)));
  }

  // ---------- Final Fantasy II: weapon skills and spells ----------

  private get skillNode(): Packed { return this.s.doc.open(this.o, 'skillLevelTargets', this.node); }
  /** A weapon skill's level 1-16 (skillLevelTargets keeps the total). */
  skillLevel(key: number): number {
    const { keys, values } = kv(this.skillNode.obj);
    return levelFor(this.data.exp, asNum(values[keys.indexOf(key)]));
  }
  setSkillLevel(key: number, lv: number): void {
    lv = clampInt(lv, 1, FF2_SKILL_MAX);
    if (this.skillLevel(key) === lv) return;
    const node = this.skillNode;
    const { keys, values } = kv(node.obj);
    const i = keys.indexOf(key);
    if (i < 0) return;
    values[i] = num(this.data.exp[lv - 1] ?? 0);
    node.touch();
  }

  private get abilities(): EntryList {
    return this._abilities ??= this.s.track(new EntryList(this.s.doc.open(this.o, 'abilityList', this.node)));
  }
  /** The Magic command's list (abilityDictionary[3]), made when the character learns a first spell. */
  private magicList(create: boolean): EntryList | null {
    if (this._magic) return this._magic;
    const dict = this.s.doc.open(this.o, 'abilityDictionary', this.node);
    const keys = arr(dict.obj.keys), values = arr(dict.obj.values);
    let i = keys.findIndex((k) => asNum(k) === MAGIC_COMMAND);
    if (i < 0) {
      if (!create) return null;
      dict.obj.keys = [...keys, num(MAGIC_COMMAND)];
      dict.obj.values = [...values, '{"target":[]}'];
      dict.touch();
      i = keys.length;
    }
    return this._magic = this.s.track(new EntryList(this.s.doc.open(arr(dict.obj.values), i, dict)));
  }
  /** Spells known, as [spell group index into data.spellGroups, level 1-16], in the order learned. */
  get spells(): [number, number][] {
    const out: [number, number][] = [];
    for (const a of this.abilities.all) {
      const hit = this.s.spellOf(asNum(a.abilityId));
      if (hit) out.push(hit);
    }
    return out;
  }
  spellLevel(group: number): number { return this.spells.find(([g]) => g === group)?.[1] ?? 0; }
  /** Learn a spell at level 1, change its level, or forget it (level 0). False when the 16 places are full. */
  setSpell(group: number, lv: number): boolean {
    const groups = this.data.spellGroups ?? [];
    const g = groups[group];
    if (!g) return false;
    lv = clampInt(lv, 0, FF2_SKILL_MAX);
    const now = this.spellLevel(group);
    if (now === lv) return true;
    if (!now && this.spells.length >= FF2_SPELL_SLOTS) return false;
    const [firstAbility, firstContent] = g;
    const order = this.s.doc.open(this.o, 'additionOrderOwnedAbilityIds', this.node);
    const sort = this.s.doc.open(this.o, 'sortOrderOwnedAbilityIds', this.node);
    const replaceIn = (node: Packed, from: number, to: number | null) => {
      const list = arr(node.obj.target);
      if (!list.some((v) => asNum(v) === from)) return false;
      node.obj.target = to === null ? list.filter((v) => asNum(v) !== from) : list.map((v) => (asNum(v) === from ? num(to) : v));
      node.touch();
      return true;
    };
    const entry = (level: number): JsonObject => ({
      abilityId: num(firstAbility + level - 1), contentId: num(firstContent + level - 1), skillLevel: num(this.data.exp[level - 1] ?? 0),
    });
    const magic = this.magicList(lv > 0);
    if (now) {
      const oldAbility = firstAbility + now - 1, oldContent = firstContent + now - 1;
      const isOld = (o: JsonObject) => asNum(o.abilityId) === oldAbility;
      for (const list of [this.abilities, magic]) {
        const o = list?.find(isOld);
        if (!o || !list) continue;
        if (lv) { Object.assign(o, entry(lv)); list.edit(o); } else list.remove(o);
      }
      replaceIn(order, oldContent, lv ? firstContent + lv - 1 : null);
      replaceIn(sort, oldContent, lv ? firstContent + lv - 1 : null);
    } else {
      this.abilities.push(entry(lv));
      magic?.push(entry(lv));
      order.obj.target = [...arr(order.obj.target), num(firstContent + lv - 1)];
      order.touch();
    }
    if (lv) this.s.noteLearned(firstAbility + lv - 1);
    return true;
  }

  // ---------- Final Fantasy III: jobs ----------

  private get jobNodes(): Packed[] {
    if (this._jobs) return this._jobs;
    const list = this.s.doc.open(this.o, 'jobList', this.node);
    const target = arr(list.obj.target);
    return this._jobs = target.map((_, i) => this.s.doc.open(target, i, list));
  }
  private jobEntry(id: number): Packed | undefined { return this.jobNodes.find((n) => asNum(n.obj.id) === id); }
  /** The character's level in a job (1 for a job never used). */
  jobLevel(id: number): number { return Math.max(1, asNum(this.jobEntry(id)?.obj.level)); }
  /** Make sure the character has an entry for a job (the game keeps one per job handed out). */
  addJob(id: number): Packed {
    const had = this.jobEntry(id);
    if (had) return had;
    const list = this.s.doc.open(this.o, 'jobList', this.node);
    const target = arr(list.obj.target);
    target.push(`{"id":${id},"level":1,"currentProficiency":0}`);
    list.touch();
    this._jobs = null;
    return this.s.doc.open(target, target.length - 1, list);
  }
  setJobLevel(id: number, lv: number): void {
    lv = clampInt(lv, 1, this.data.max.level);
    const node = this.addJob(id);
    if (asNum(node.obj.level) === lv) return;
    node.obj.level = num(lv);
    // Job points are kept as a total, like Exp.
    node.obj.currentProficiency = num(this.data.jobExp?.[lv - 1] ?? 0);
    node.touch();
  }
}

/** Which level a total reaches in a table of totals per level (level 1 at index 0). */
export function levelFor(table: readonly number[], total: number): number {
  let lv = 1;
  while (lv < table.length && total >= table[lv]) lv++;
  return lv;
}

export function formatPlayTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export class PrSave implements EditableSave {
  readonly data: PrData;
  readonly doc: Doc;
  readonly bom: boolean;
  readonly chars: PrChar[];
  /** The party's four places, in order; null for an empty one. */
  readonly party: (PrChar | null)[];
  readonly koId: number;
  private user: Packed;
  private lists: EntryList[] = [];
  private _bag: EntryList | null = null;
  private _keys: EntryList | null = null;
  private gearById: Map<number, PrData['gear'][number]>;
  private spellByAbility = new Map<number, [number, number]>();

  constructor(file: Uint8Array, data: PrData) {
    const opened = openPr(file);
    if (!opened) throw new Error('This isn’t a Pixel Remaster save.');
    if (opened.game !== data.game) {
      throw new Error(opened.game ? `This save is from ${GAME_NAMES[opened.game as PrGameId] ?? 'another Pixel Remaster game'}.` : 'This save is from another Pixel Remaster game.');
    }
    this.data = data;
    this.bom = opened.bom;
    this.doc = new Doc(opened.json);
    this.user = this.doc.open(this.doc.root, 'userData');
    this.koId = data.conditions.find(([, n]) => n === 'KO')?.[0] ?? -1;
    this.gearById = new Map(data.gear.map((g) => [g[0], g]));
    (data.spellGroups ?? []).forEach(([first], g) => { for (let lv = 1; lv <= FF2_SKILL_MAX; lv++) this.spellByAbility.set(first + lv - 1, [g, lv]); });
    const list = this.doc.open(this.u, 'ownedCharacterList', this.user);
    const target = arr(list.obj.target);
    this.chars = target.map((_, i) => new PrChar(this, this.doc.open(target, i, list)));
    const corps = this.doc.open(this.u, 'corpsList', this.user);
    const places = arr(corps.obj.target).map((s) => {
      const o = typeof s === 'string' ? parse(s) : s;
      return isObj(o) ? asNum(o.characterId) : 0;
    });
    this.party = places.map((id) => (id ? this.chars.find((c) => c.id === id) ?? null : null));
  }

  private get u(): JsonObject { return this.user.obj; }
  /** @internal */ track(list: EntryList): EntryList { this.lists.push(list); return list; }
  /** @internal */ gearInfo(id: number) { return this.gearById.get(id); }
  /** @internal */ spellOf(abilityId: number): [number, number] | undefined { return this.spellByAbility.get(abilityId); }
  /** @internal The party's record of every spell ever learned (Final Fantasy II). */
  noteLearned(abilityId: number): void {
    if (!('learnedAbilityList' in this.u)) return;
    const node = this.doc.open(this.u, 'learnedAbilityList', this.user);
    const list = arr(node.obj.target);
    if (list.some((v) => asNum(v) === abilityId)) return;
    node.obj.target = [...list, num(abilityId)];
    node.touch();
  }

  get members(): PrChar[] { return this.party.filter((c): c is PrChar => c !== null); }

  get gil(): number { return asNum(this.u.owendGil); }
  set gil(v: number) { this.u.owendGil = num(clampInt(v, 0, this.data.max.gil)); this.user.touch(); }

  /** Seconds played, as the save screen counts it. */
  get playTime(): number { return asNum(this.u.playTime); }
  /** The screenshot the load screen shows (a PNG), as a data: URL, or null. */
  get picture(): string | null {
    const p = this.doc.root.pictureData;
    return typeof p === 'string' && p.length > 100 ? `data:image/png;base64,${p}` : null;
  }

  // ---------- the bag ----------

  private get bag(): EntryList { return this._bag ??= this.track(new EntryList(this.doc.open(this.u, 'normalOwnedItemList', this.user))); }
  /** How many of an item, weapon or piece of armor are in the bag. */
  count(id: number): number { return asNum(this.bag.find((o) => asNum(o.contentId) === id)?.count); }
  setCount(id: number, n: number): void {
    n = clampInt(n, 0, this.data.max.item);
    const e = this.bag.find((o) => asNum(o.contentId) === id);
    if (asNum(e?.count) === n) return;
    if (e && n) { e.count = num(n); this.bag.edit(e); return; }
    if (e) { this.bag.remove(e); return; }
    this.bag.push({ contentId: num(id), count: num(n) });
    // The bag's sort order lists every item ever held; a new one goes on the end.
    const sort = this.doc.open(this.u, 'normalOwnedItemSortIdList', this.user);
    const ids = arr(sort.obj.target);
    if (!ids.some((v) => asNum(v) === id)) { sort.obj.target = [...ids, num(id)]; sort.touch(); }
  }

  private get keys(): EntryList { return this._keys ??= this.track(new EntryList(this.doc.open(this.u, 'importantOwendItemList', this.user))); }
  hasKeyItem(id: number): boolean { return !!this.keys.find((o) => asNum(o.contentId) === id); }
  setKeyItem(id: number, on: boolean): void {
    const e = this.keys.find((o) => asNum(o.contentId) === id);
    if (!!e === on) return;
    if (e) this.keys.remove(e);
    else this.keys.push({ contentId: num(id), count: num(1) });
  }

  // ---------- simple lists on userData ----------

  private flagList(key: string): Packed | null { return key in this.u ? this.doc.open(this.u, key, this.user) : null; }
  private hasIn(key: string, id: number): boolean { return arr(this.flagList(key)?.obj.target).some((v) => asNum(v) === id); }
  private setIn(key: string, id: number, on: boolean): void {
    const node = this.flagList(key);
    if (!node || this.hasIn(key, id) === on) return;
    const list = arr(node.obj.target);
    node.obj.target = on ? [...list, num(id)] : list.filter((v) => asNum(v) !== id);
    node.touch();
  }

  /** Final Fantasy I's four Orbs (owendCrystalFlags), lit or dark. */
  orb(i: number): boolean { return arr(this.flagList('owendCrystalFlags')?.obj.target)[i] === true; }
  setOrb(i: number, on: boolean): void {
    const node = this.flagList('owendCrystalFlags');
    const list = arr(node?.obj.target);
    if (!node || i >= list.length || list[i] === on) return;
    list[i] = on;
    node.touch();
  }

  /** Final Fantasy II's key terms, learned with Ask and Learn. */
  hasKeyTerm(id: number): boolean { return this.hasIn('ownedKeyWaordList', id); }
  setKeyTerm(id: number, on: boolean): void { this.setIn('ownedKeyWaordList', id, on); }

  /** Final Fantasy III: jobs the crystals have handed out, which the Job menu offers. */
  get releasedJobs(): number[] { return arr(this.flagList('releasedJobs')?.obj.target).map(asNum); }
  jobOpen(id: number): boolean { return this.hasIn('releasedJobs', id); }
  /** Hand a job out or take it back. The Onion Knight, and a job someone has now, stay. */
  setJobOpen(id: number, on: boolean): void {
    if (!on && (id === 1 || this.chars.some((c) => c.job === id))) return;
    this.setIn('releasedJobs', id, on);
    if (on) for (const c of this.chars) c.addJob(id);
  }
  /** Whether a piece of gear is arrows (Final Fantasy III equips them as a stack). */
  isArrow(id: number): boolean { return this.data.game === 'ff3' && /Arrow$/.test(this.gearInfo(id)?.[1] ?? ''); }

  // ---------- output ----------

  serialize(): Uint8Array {
    for (const l of this.lists) l.flush();
    return sealPrFile(this.doc.text(), this.bom);
  }

  summary(): SummaryLine[] {
    const lead = this.members[0];
    const who = lead ? `${lead.name || lead.jobName}${this.data.game === 'ff2' ? '' : ` Lv ${lead.level}`}` : '—';
    return [{ label: 'SAVE', value: `${who} · ${this.gil.toLocaleString('en-US')} gil · ${formatPlayTime(this.playTime)}` }];
  }

  describeChanges(before: EditableSave): ChangeGroup[] {
    return describeChanges(before as PrSave, this);
  }
}

export const GAME_NAMES: Record<PrGameId, string> = {
  ff1: 'Final Fantasy (Pixel Remaster)',
  ff2: 'Final Fantasy II (Pixel Remaster)',
  ff3: 'Final Fantasy III (Pixel Remaster)',
};

function describeChanges(b: PrSave, a: PrSave): ChangeGroup[] {
  const d = a.data;
  const groups: ChangeGroup[] = [];
  const add = (title: string, lines: string[]) => {
    if (lines.length) groups.push(lines.length > 12 ? { title, lines: lines.slice(0, 12), more: lines.length - 12 } : { title, lines });
  };
  const fmt = (x: string | number) => (typeof x === 'number' ? x.toLocaleString('en-US') : x);
  const gearName = (id: number) => (id ? a.gearInfo(id)?.[1] ?? `#${id}` : 'Nothing');
  const condName = (id: number) => d.conditions.find(([c]) => c === id)?.[1] ?? `#${id}`;
  for (const ca of a.chars) {
    const cb = b.chars.find((c) => c.id === ca.id);
    if (!cb) continue;
    const lines: string[] = [];
    const diff = (label: string, x: string | number, y: string | number) => { if (x !== y) lines.push(`${label}: ${fmt(x)} → ${fmt(y)}`); };
    diff('Name', cb.name, ca.name);
    if (d.game !== 'ff2') diff(d.game === 'ff1' ? 'Class' : 'Job', cb.jobName, ca.jobName);
    if (d.game !== 'ff2') { diff('Level', cb.level, ca.level); diff('Exp', cb.exp, ca.exp); }
    diff('HP', `${cb.hp}/${cb.maxHp}`, `${ca.hp}/${ca.maxHp}`);
    if (d.game === 'ff2') diff('MP', `${cb.mp}/${cb.maxMp}`, `${ca.mp}/${ca.maxMp}`);
    if (d.game === 'ff1') for (let lv = 1; lv <= 8; lv++) diff(`Level ${lv} charges`, `${cb.charge(lv)}/${cb.maxCharge(lv)}`, `${ca.charge(lv)}/${ca.maxCharge(lv)}`);
    for (const st of STATS[d.game]) diff(st.label, cb.stat(st.key), ca.stat(st.key));
    for (const id of ca.conditions) if (!cb.hasCondition(id)) lines.push(`Now ${condName(id) === 'KO' ? 'KO' : condName(id).toLowerCase()}`);
    for (const id of cb.conditions) if (!ca.hasCondition(id)) lines.push(`Cured of ${condName(id) === 'KO' ? 'KO' : condName(id).toLowerCase()}`);
    for (const slot of SLOT_ORDER) {
      diff(SLOT_NAMES[d.game][slot - 1], gearName(cb.gear(slot)), gearName(ca.gear(slot)));
      if (cb.gear(slot) === ca.gear(slot) && a.isArrow(ca.gear(slot))) diff(`${SLOT_NAMES[d.game][slot - 1]} arrows`, cb.gearCount(slot), ca.gearCount(slot));
    }
    if (d.game === 'ff2') {
      for (const sk of FF2_SKILLS) diff(sk.label, cb.skillLevel(sk.key), ca.skillLevel(sk.key));
      (d.spellGroups ?? []).forEach(([, , name], g) => {
        const x = cb.spellLevel(g), y = ca.spellLevel(g);
        if (x === y) return;
        lines.push(!x ? `Learned ${name} (Lv ${y})` : !y ? `Forgot ${name}` : `${name}: Lv ${x} → Lv ${y}`);
      });
    }
    if (d.game === 'ff3') {
      for (const id of d.jobOrder) diff(`${d.jobs[id - 1]} level`, cb.jobLevel(id), ca.jobLevel(id));
    }
    const label = ca.name || (d.game === 'ff2' ? ca.jobName : `Character ${ca.id}`);
    const same = a.chars.filter((c) => (c.name || c.jobName) === (ca.name || ca.jobName)).length > 1;
    add(same ? `${label} (${ca.id})` : label, lines);
  }
  const items: string[] = [];
  if (b.gil !== a.gil) items.push(`Gil: ${fmt(b.gil)} → ${fmt(a.gil)}`);
  for (const [id, name] of [...d.items, ...d.gear.map((g) => [g[0], g[1]] as const)]) {
    const x = b.count(id), y = a.count(id);
    if (x !== y) items.push(`${name}: ${x} → ${y}`);
  }
  add('Items', items);
  const keys: string[] = [];
  for (const [id, name] of d.keyItems) {
    if (b.hasKeyItem(id) !== a.hasKeyItem(id)) keys.push(`${a.hasKeyItem(id) ? 'Got' : 'Lost'} ${name}`);
  }
  if (d.game === 'ff1') ORB_NAMES.forEach((n, i) => { if (b.orb(i) !== a.orb(i)) keys.push(`${n} Orb ${a.orb(i) ? 'lit' : 'dark'}`); });
  if (d.game === 'ff2') {
    for (const [id, name] of d.keyTerms ?? []) if (b.hasKeyTerm(id) !== a.hasKeyTerm(id)) keys.push(`${a.hasKeyTerm(id) ? 'Learned' : 'Forgot'} “${name}”`);
  }
  add(d.game === 'ff2' ? 'Key items and key terms' : 'Key items', keys);
  if (d.game === 'ff3') {
    add('Jobs', d.jobOrder.filter((id) => a.jobOpen(id) !== b.jobOpen(id)).map((id) => `${d.jobs[id - 1]} ${a.jobOpen(id) ? 'handed out' : 'taken back'}`));
  }
  return groups;
}

