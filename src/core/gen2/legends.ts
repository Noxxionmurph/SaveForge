// Gold, Silver and Crystal's one-off Pokémon (pret/pokegold and pokecrystal). Each stands on the map as an object
// whose event flag hides it once set (the "disappear" after its battle); Lugia and Ho-Oh are shown by their map's
// callback until their "fought" event is set, which the scripts set before the battle even starts, so running away
// loses them too. The roaming dogs live in wRoamMon1-3: the battle ending in a win or a catch zeroes the species (and
// the map) for good, and putting back what InitRoamMons wrote sends one roaming again.
//
// Crystal's Suicune at Tin Tower is left out: it comes back only with that map's scene, which isn't kept with the flags.

import type { Legend } from '../legends.ts';
import type { Gen2Game } from './layout.ts';

/** wEventFlags and wRoamMon1 in the save (the game data starts with wPlayerID at 0x2009). */
export const EVENT_FLAGS: Record<Gen2Game, number> = { gs: 0x261f, crystal: 0x2600 };
export const ROAM_MONS: Record<Gen2Game, number> = { gs: 0x2b82, crystal: 0x2b5d };
/** roam_struct: species, level, map group, map number, HP (0 = new stats when met), DVs. */
const ROAM_SIZE = 7;
/** Set at the Burned Tower when the dogs run off: until then nothing roams. */
export const RELEASED_THE_BEASTS = 0x7b;

export interface Gen2Legend extends Legend {
  /** Set when it's gone (the object's own flag, or "fought" for Lugia and Ho-Oh). */
  goneEvent?: number;
  /** Events to clear to bring it back. */
  events?: readonly number[];
  /** A roaming dog: its wRoamMon slot (0-2) and where InitRoamMons starts it (map group, number). */
  roam?: { slot: number; species: number; map: readonly [number, number] };
  games: readonly Gen2Game[];
}

const BOTH = ['gs', 'crystal'] as const;

export const GEN2_LEGENDS: readonly Gen2Legend[] = [
  { name: 'Sudowoodo', place: 'Route 36', dex: [185], goneEvent: 0x6f8, events: [0x2a, 0x6f8], games: BOTH, note: 'Water it with the SquirtBottle.' },
  { name: 'Red Gyarados', place: 'Lake of Rage', dex: [130], shiny: true, goneEvent: 0x751, events: [0x751], games: BOTH },
  { name: 'Snorlax', place: 'Vermilion City', dex: [143], goneEvent: 0x770, events: [0x750, 0x770], games: BOTH, note: 'Wake it with the radio’s Poké Flute station.' },
  { name: 'Lugia', place: 'Whirl Islands', dex: [249], goneEvent: 0x318, events: [0x318], games: BOTH, note: 'Needs the Silver Wing.' },
  { name: 'Ho-Oh', place: 'Tin Tower', dex: [250], goneEvent: 0x317, events: [0x317], games: BOTH, note: 'Needs the Rainbow Wing.' },
  { name: 'Raikou', place: 'Roaming Johto', dex: [243], roam: { slot: 0, species: 243, map: [2, 5] }, games: BOTH },
  { name: 'Entei', place: 'Roaming Johto', dex: [244], roam: { slot: 1, species: 244, map: [10, 4] }, games: BOTH },
  { name: 'Suicune', place: 'Roaming Johto', dex: [245], roam: { slot: 2, species: 245, map: [1, 12] }, games: ['gs'] },
];

export const legendsFor = (game: Gen2Game) => GEN2_LEGENDS.filter((l) => l.games.includes(game));

const bit = (d: Uint8Array, base: number, n: number) => !!(d[base + (n >> 3)] & (1 << (n & 7)));
const clearBit = (d: Uint8Array, base: number, n: number) => { d[base + (n >> 3)] &= ~(1 << (n & 7)); };

export function gen2LegendGone(d: Uint8Array, game: Gen2Game, l: Gen2Legend): boolean {
  if (l.roam) return bit(d, EVENT_FLAGS[game], RELEASED_THE_BEASTS) && d[ROAM_MONS[game] + l.roam.slot * ROAM_SIZE] === 0;
  return bit(d, EVENT_FLAGS[game], l.goneEvent!);
}

export function bringBackGen2Legend(d: Uint8Array, game: Gen2Game, l: Gen2Legend): void {
  for (const e of l.events ?? []) clearBit(d, EVENT_FLAGS[game], e);
  if (l.roam) {
    const at = ROAM_MONS[game] + l.roam.slot * ROAM_SIZE;
    d.set([l.roam.species, 40, l.roam.map[0], l.roam.map[1], 0, 0, 0], at);
  }
}
