// Gen 3's one-off Pokémon (pret/pokeruby, pokeemerald and pokefirered data/maps/*/scripts.inc).
//
// Ruby and Sapphire hide each one with its object's flag, set as the battle starts, so running away loses it as well.
// Emerald sets a "defeated" flag when you win or catch (and a "caught" one for the event-island Pokémon); the map's
// script shows the Pokémon again on the way in while those are clear. Emerald's Hall of Fame already clears the
// defeated flags of the event-island Pokémon (not the caught ones), so only the others stay away for good.
//
// The roaming Latias or Latios has its own card (the roamer): ticking "Roaming" there sends it off again.

import type { Legend } from '../legends.ts';
import type { Gen3Game } from './data.ts';

export interface Gen3Legend extends Legend {
  /** Flags any one of which means it has gone. */
  gone: readonly number[];
  /** Flags to clear to bring it back (the gone ones, and its object's hide flag). */
  clear: readonly number[];
  /** Variables to set as well: [var, value]. */
  vars?: readonly (readonly [number, number])[];
}

const RS: readonly Gen3Legend[] = [
  { name: 'Regirock', place: 'Desert Ruins', dex: [377], gone: [0x3a7], clear: [0x3a7] },
  { name: 'Regice', place: 'Island Cave', dex: [378], gone: [0x3a8], clear: [0x3a8] },
  { name: 'Registeel', place: 'Ancient Tomb', dex: [379], gone: [0x3a9], clear: [0x3a9] },
  // FLAG_HIDE_LEGEND_MON_CAVE_OF_ORIGIN, and VAR_CAVE_OF_ORIGIN_B4F_STATE back to 0 so the scene plays again.
  { name: 'Groudon or Kyogre', place: 'Cave of Origin', dex: [383, 382], gone: [0x339], clear: [0x339], vars: [[0x409b, 0]],
    note: 'Groudon in Ruby, Kyogre in Sapphire.' },
  { name: 'Rayquaza', place: 'Sky Pillar', dex: [384], gone: [0x305], clear: [0x305] },
  // FLAG_ENCOUNTERED_LATIAS_OR_LATIOS, FLAG_HIDE_LATIOS_OR_LATIAS_STATIONARY.
  { name: 'Latias or Latios', place: 'Southern Island', dex: [380, 381], gone: [0xce], clear: [0xce, 0x38f],
    note: 'Latias in Ruby, Latios in Sapphire. Needs the Eon Ticket.' },
];

const EMERALD: readonly Gen3Legend[] = [
  { name: 'Sudowoodo', place: 'Battle Frontier', dex: [185], gone: [0x1c6], clear: [0x1c6, 0x34a] },
  { name: 'Regirock', place: 'Desert Ruins', dex: [377], gone: [0x1bb], clear: [0x1bb, 0x3a7] },
  { name: 'Regice', place: 'Island Cave', dex: [378], gone: [0x1bc], clear: [0x1bc, 0x3a8] },
  { name: 'Registeel', place: 'Ancient Tomb', dex: [379], gone: [0x1bd], clear: [0x1bd, 0x3a9] },
  { name: 'Kyogre', place: 'Marine Cave', dex: [382], gone: [0x1be], clear: [0x1be, 0x30e], note: 'Ask at the Weather Institute where it is.' },
  { name: 'Groudon', place: 'Terra Cave', dex: [383], gone: [0x1bf], clear: [0x1bf, 0x30f], note: 'Ask at the Weather Institute where it is.' },
  { name: 'Rayquaza', place: 'Sky Pillar', dex: [384], gone: [0x1c0], clear: [0x1c0, 0x50] },
  { name: 'Latias or Latios', place: 'Southern Island', dex: [380, 381], gone: [0x1c8, 0x1c9], clear: [0x1c8, 0x1c9],
    note: 'Needs the Eon Ticket.' },
  { name: 'Mew', place: 'Faraway Island', dex: [151], gone: [0x1c7, 0x1ca], clear: [0x1c7, 0x1ca, 0x2ce], note: 'Needs the Old Sea Map.' },
  { name: 'Deoxys', place: 'Birth Island', dex: [386], gone: [0x1ac, 0x1ad], clear: [0x1ac, 0x1ad, 0x2fb], note: 'Needs the Aurora Ticket.' },
  { name: 'Lugia', place: 'Navel Rock', dex: [249], gone: [0x91, 0x1dd], clear: [0x91, 0x1dd, 0x320], note: 'Needs the Mystic Ticket.' },
  { name: 'Ho-Oh', place: 'Navel Rock', dex: [250], gone: [0x92, 0x1dc], clear: [0x92, 0x1dc, 0x321], note: 'Needs the Mystic Ticket.' },
];

// FireRed and LeafGreen (pokefirered data/maps/*/scripts.inc) set FLAG_FOUGHT_* when you win or catch, and the map's
// script shows the Pokémon again while it's clear. Running from Lugia, Ho-Oh or Deoxys sets a "flew away" flag that hides
// it as well. Each Snorlax hides with its object's flag as the battle starts, win, lose or run (FLAG_WOKE_UP_ROUTE_12_SNORLAX
// only changes what the binoculars on Route 11 show).
const FRLG: readonly Gen3Legend[] = [
  { name: 'Snorlax', place: 'Route 12', dex: [143], gone: [0x54], clear: [0x54, 0x253], note: 'Needs the Poké Flute.' },
  { name: 'Snorlax', place: 'Route 16', dex: [143], gone: [0x80], clear: [0x80], note: 'Needs the Poké Flute.' },
  { name: 'Articuno', place: 'Seafoam Islands', dex: [144], gone: [0x2be], clear: [0x2be, 0x82] },
  { name: 'Zapdos', place: 'Power Plant', dex: [145], gone: [0x2bf], clear: [0x2bf, 0x5d] },
  { name: 'Moltres', place: 'Mt. Ember', dex: [146], gone: [0x2bd], clear: [0x2bd, 0x52] },
  { name: 'Mewtwo', place: 'Cerulean Cave', dex: [150], gone: [0x2bc], clear: [0x2bc, 0x81] },
  { name: 'Lugia', place: 'Navel Rock', dex: [249], gone: [0x2f2, 0x2f5], clear: [0x2f2, 0x2f5, 0x9b], note: 'Needs the Mystic Ticket.' },
  { name: 'Ho-Oh', place: 'Navel Rock', dex: [250], gone: [0x2f3, 0x2f6], clear: [0x2f3, 0x2f6, 0x9c], note: 'Needs the Mystic Ticket.' },
  { name: 'Deoxys', place: 'Birth Island', dex: [386], gone: [0x2e4, 0x2f7], clear: [0x2e4, 0x2f7, 0x99], note: 'Needs the Aurora Ticket.' },
];

export const GEN3_LEGENDS: Record<Gen3Game, readonly Gen3Legend[]> = { rs: RS, emerald: EMERALD, frlg: FRLG };
