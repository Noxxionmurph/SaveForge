// Red, Blue and Yellow's one-off Pokémon (pret/pokered and pokeyellow). They stand on the map like trainers: winning
// or catching sets their "beaten" event and hides them (EndTrainerBattle calls HideObject), and the Snorlax scripts do
// the same once you've woken one. Each one's sprite has a bit in wToggleableObjectFlags (set = hidden); Yellow's list
// has a few more entries, so some of the bits sit further along.
//
// Save offsets (sMainData 0x25A3 holds wMainDataStart onwards): wToggleableObjectFlags 0x2852, wEventFlags 0x29F3.

import type { Legend } from '../legends.ts';

export const TOGGLE_FLAGS = 0x2852;
export const EVENT_FLAGS = 0x29f3;

export interface Gen1Legend extends Legend {
  /** Its sprite's bit in wToggleableObjectFlags: Red and Blue, Yellow. */
  toggle: readonly [rb: number, yellow: number];
  /** The events to clear (same numbers in all three games). */
  events: readonly number[];
}

export const GEN1_LEGENDS: readonly Gen1Legend[] = [
  { name: 'Snorlax', place: 'Route 12', dex: [143], toggle: [0x1d, 0x1e], events: [0x48e, 0x48f], note: 'Wake it with the Poké Flute.' },
  { name: 'Snorlax', place: 'Route 16', dex: [143], toggle: [0x21, 0x22], events: [0x4c8, 0x4c9], note: 'Wake it with the Poké Flute.' },
  { name: 'Zapdos', place: 'Power Plant', dex: [145], toggle: [0x55, 0x55], events: [0x469] },
  { name: 'Moltres', place: 'Victory Road', dex: [146], toggle: [0x5b, 0x5b], events: [0x53e] },
  { name: 'Articuno', place: 'Seafoam Islands', dex: [144], toggle: [0xe3, 0xeb], events: [0x9da] },
  { name: 'Mewtwo', place: 'Cerulean Cave', dex: [150], toggle: [0xd1, 0xd7], events: [0x8c1] },
];

const bit = (d: Uint8Array, base: number, n: number) => !!(d[base + (n >> 3)] & (1 << (n & 7)));
const clearBit = (d: Uint8Array, base: number, n: number) => { d[base + (n >> 3)] &= ~(1 << (n & 7)); };

export function gen1LegendGone(d: Uint8Array, l: Gen1Legend, yellow: boolean): boolean {
  return bit(d, TOGGLE_FLAGS, l.toggle[yellow ? 1 : 0]);
}

export function bringBackGen1Legend(d: Uint8Array, l: Gen1Legend, yellow: boolean): void {
  clearBit(d, TOGGLE_FLAGS, l.toggle[yellow ? 1 : 0]);
  for (const e of l.events) clearBit(d, EVENT_FLAGS, e);
}
