// The Route 117 Day-Care in Ruby, Sapphire and Emerald (pokeemerald include/global.h struct DayCare, pokeruby struct
// DayCare). Two Pokémon in box format; for each, a letter if it arrived holding Mail and the steps it has walked there
// (added to its experience when it's taken back); then the egg the old man is keeping, as the personality value the
// egg will have (0 for none).
//
//   Emerald, SaveBlock1 0x3030: per Pokémon 0x8C bytes (Pokémon, mail at +0x50, steps at +0x88), egg (u32) at +0x118.
//   Ruby and Sapphire, 0x2F9C: both Pokémon first (0x50 each), both letters at +0xA0 (0x38 each), both step counts at
//   +0x110, egg (u16) at +0x118.
//   FireRed and LeafGreen (the Four Island Day-Care, pokefirered include/global.h), 0x2F80: laid out as Emerald's, but
//   the egg is a u16. Route 5's one-Pokémon Day-Care is kept elsewhere (route5DayCareMon) and left as it is.

import { le } from '../bytes.ts';
import { EGG_GROUPS } from './tables.ts';
import { genderOf, type Gen3Game } from './data.ts';

const { u16, u32 } = le;

export interface DayCareLayout {
  mon(i: number): number;
  mail(i: number): number;
  steps(i: number): number;
  egg: number;
  eggBytes: 2 | 4;
}

export const DAYCARE: Record<Gen3Game, DayCareLayout> = {
  emerald: { mon: (i) => 0x3030 + i * 0x8c, mail: (i) => 0x3030 + i * 0x8c + 0x50, steps: (i) => 0x3030 + i * 0x8c + 0x88, egg: 0x3148, eggBytes: 4 },
  rs: { mon: (i) => 0x2f9c + i * 0x50, mail: (i) => 0x2f9c + 0xa0 + i * 0x38, steps: (i) => 0x2f9c + 0x110 + i * 4, egg: 0x30b4, eggBytes: 2 },
  frlg: { mon: (i) => 0x2f80 + i * 0x8c, mail: (i) => 0x2f80 + i * 0x8c + 0x50, steps: (i) => 0x2f80 + i * 0x8c + 0x88, egg: 0x3098, eggBytes: 2 },
};

/** FLAG_PENDING_DAYCARE_EGG: the old man waits outside with an egg (the same number in Ruby, Sapphire and Emerald). */
export const PENDING_EGG_FLAG: Record<Gen3Game, number> = { rs: 0x86, emerald: 0x86, frlg: 0x266 };
/** The mail fields the games check: a letter is there when its item (struct Mail itemId, at +0x20) isn't 0. */
export const MAIL_ITEM = 0x20;
const MAIL_BYTES = 0x22;
/** The room each letter has, names included, in both layouts. */
const MAIL_SLOT = 0x38;
const DITTO = 13, NO_EGGS = 15;

export const hasDayCareMail = (sb1: Uint8Array, L: DayCareLayout, i: number): boolean => u16(sb1, L.mail(i) + MAIL_ITEM) !== 0;
export const dayCareSteps = (sb1: Uint8Array, L: DayCareLayout, i: number): number => u32(sb1, L.steps(i));
export const eggPersonality = (sb1: Uint8Array, L: DayCareLayout): number =>
  (L.eggBytes === 4 ? u32(sb1, L.egg) : u16(sb1, L.egg)) >>> 0;

/** An empty letter, as ClearDaycareMonMail leaves it: no words, no name, Bulbasaur, no item; the names after it zeroed. */
export function clearDayCareMail(sb1: Uint8Array, L: DayCareLayout, i: number): void {
  const at = L.mail(i);
  for (let w = 0; w < 9; w++) { sb1[at + w * 2] = 0xff; sb1[at + w * 2 + 1] = 0xff; }
  sb1.fill(0xff, at + 0x12, at + 0x1a);
  sb1.fill(0, at + 0x1a, at + 0x1e);
  sb1[at + 0x1e] = 1; sb1[at + 0x1f] = 0;
  sb1[at + 0x20] = 0; sb1[at + 0x21] = 0;
  // Then the trainer and Pokémon names kept with the letter (and the languages in Emerald): all zero.
  sb1.fill(0, at + MAIL_BYTES, at + MAIL_SLOT);
}

interface Parent { species: number; pid: number; otId: number }

/**
 * How likely the pair is to make an egg (GetDaycareCompatibilityScore): 0 never, 20 low, 50 medium, 70 high. Ditto
 * breeds with anything that can breed at all (but not with another Ditto); otherwise the two need opposite genders and
 * an egg group in common.
 */
export function compatibility(a: Parent, b: Parent): number {
  const ga = EGG_GROUPS[a.species - 1], gb = EGG_GROUPS[b.species - 1];
  if (!ga || !gb) return 0;
  if (ga[0] === NO_EGGS || gb[0] === NO_EGGS) return 0;
  if (ga[0] === DITTO && gb[0] === DITTO) return 0;
  if (ga[0] === DITTO || gb[0] === DITTO) return a.otId === b.otId ? 20 : 50;
  const xa = genderOf(a.species, a.pid), xb = genderOf(b.species, b.pid);
  if (xa === xb || xa === 'none' || xb === 'none') return 0;
  if (!ga.some((g) => gb.includes(g))) return 0;
  if (a.species === b.species) return a.otId === b.otId ? 50 : 70;
  return a.otId !== b.otId ? 50 : 20;
}
