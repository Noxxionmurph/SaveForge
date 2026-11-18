// The shape of the per-game tables (data-ff1.ts, data-ff2.ts, data-ff3.ts), which scripts/gen-ffpr-data.py writes from
// the Steam games' own master data. Ids are the games' "content" ids, the numbers the save uses for every item, piece of
// gear, spell and key term.

/** [content id, name] */
export type Named = readonly [number, string];

/**
 * A piece of gear: [content id, name, 0 weapon / 1 armor, slots it can go in (bit 0 = equipment slot 1 ... bit 4 = slot
 * 5), who can wear it (bit 0 = job or character 1 ...), 1 if it takes both hands].
 */
export type Gear = readonly [number, string, 0 | 1, number, number, 0 | 1];

/** A Final Fantasy spell: [ability id, content id, name, spell level 1-8, who can learn it (bit 0 = class 1), 1 white / 2 black]. */
export type Spell = readonly [number, number, string, number, number, 1 | 2];

/** A Final Fantasy II spell: [ability id at level 1, content id at level 1, name]. Level n is both ids plus n - 1. */
export type SpellGroup = readonly [number, number, string];

export interface PrData {
  game: 'ff1' | 'ff2' | 'ff3';
  /** The games' own limits (game_constant_int). */
  max: { gil: number; item: number; level: number; exp: number; hp: number; mp: number; stat: number };
  /** Job names by job id - 1 (Final Fantasy II: the characters, by the save's jobId). */
  jobs: readonly string[];
  /** Job ids in the order the Job menu lists them. */
  jobOrder: readonly number[];
  /** Consumables, in the game's sort order. */
  items: readonly Named[];
  /** Key items (importantOwendItemList), in the game's sort order. */
  keyItems: readonly Named[];
  gear: readonly Gear[];
  /** What each of the five equipment slots holds when nothing is in it (the games' "Empty" and "None" entries). */
  empty: readonly number[];
  /**
   * Starting numbers by characterStatusId: [hp, mp, strength, vitality, agility, intelligence, spirit, magic, luck,
   * spell charges for spell levels 1-8]. The save keeps only what was gained on top of these.
   */
  base: Readonly<Record<string, readonly number[]>>;
  /**
   * Total Exp for each level from 1 (the save keeps the total). Final Fantasy II has no levels: its 16 entries are the
   * weapon-skill and spell-level totals.
   */
  exp: readonly number[];
  /** Final Fantasy III: total job points for each job level from 1. */
  jobExp?: readonly number[];
  /** Ailments the game keeps after a battle: [condition id, name]. */
  conditions: readonly Named[];
  spells?: readonly Spell[];
  spellGroups?: readonly SpellGroup[];
  /** Final Fantasy II: the words learned with Ask and Learn. */
  keyTerms?: readonly Named[];
}

/** Where each stat sits in a `base` row, and the save field that holds what was gained on top. */
export const BASE = { hp: 0, mp: 1, strength: 2, vitality: 3, agility: 4, intelligence: 5, spirit: 6, magic: 7, luck: 8, charges: 9 } as const;
