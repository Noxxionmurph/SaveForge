// The event islands the S.S. Tidal sails to from Lilycove once you hold their ticket (Mystery Gift items in the real
// games). The ferry attendant checks two things (pokeemerald and pokeruby data/maps/LilycoveCity_Harbor/scripts.inc):
// the ticket in the Key Items pocket and a system flag the Mystery Gift sets alongside it (FLAG_ENABLE_SHIP_* in
// Emerald, FLAG_SYS_HAS_EON_TICKET in Ruby and Sapphire). The ferry only takes you after the Hall of Fame
// (FLAG_SYS_GAME_CLEAR), and the legendary only waits there until you have met it (the "met" flags below).

import type { Gen3Game } from './data.ts';

export interface EventIsland {
  name: string;
  /** Who waits there. */
  legend: string;
  /** The ticket's item id. */
  item: number;
  /** The flag the ferry attendant checks along with the ticket. */
  flag: number;
  /** Per legendary there, flags any one of which means it has been met (caught, knocked out or battled). */
  met: readonly (readonly number[])[];
}

export const EVENT_ISLANDS: Record<Gen3Game, readonly EventIsland[]> = {
  rs: [
    { name: 'Southern Island', legend: 'Latias or Latios', item: 275, flag: 0x853, met: [[0xce]] },
  ],
  emerald: [
    { name: 'Southern Island', legend: 'Latias or Latios', item: 275, flag: 0x8b3, met: [[0x1c8, 0x1c9]] },
    { name: 'Birth Island', legend: 'Deoxys', item: 371, flag: 0x8d5, met: [[0x1ad]] },
    { name: 'Faraway Island', legend: 'Mew', item: 376, flag: 0x8d6, met: [[0x1c7, 0x1ca]] },
    { name: 'Navel Rock', legend: 'Lugia and Ho-Oh', item: 370, flag: 0x8e0, met: [[0x91, 0x1dd], [0x92, 0x1dc]] },
  ],
};
