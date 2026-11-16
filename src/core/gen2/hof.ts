// Gold, Silver and Crystal's Hall of Fame (pret/pokecrystal, pokegold: sHallOfFame, SRAM bank 1: 30 teams of 0x62
// bytes, the newest first). A team is its win number, six records of 16 bytes (species, trainer ID, DVs, level, a
// 10-byte name), and a terminator. Eggs are left out of the party when the game records a team.

import type { HallOfFame, HofEntry } from '../hallOfFame.ts';
import { isSpecies, speciesName } from './data.ts';
import { decodeText, encodeText } from './text.ts';
import type { Gen2Game } from './layout.ts';

export const HOF_AT: Record<Gen2Game, number> = { gs: 0x321a, crystal: 0x32c0 };
const TEAM = 0x62, MON = 0x10, CAPACITY = 30;

const SHINY_ATK = [2, 3, 6, 7, 10, 11, 14, 15];
/** Shiny Gen 2 Pokémon: Defense, Speed and Special DVs of 10, and an Attack DV of 2, 3, 6, 7, 10, 11, 14 or 15. */
const isShiny = (b1: number, b2: number) => (b1 & 15) === 10 && (b2 >> 4) === 10 && (b2 & 15) === 10 && SHINY_ATK.includes(b1 >> 4);

export function readGen2HallOfFame(d: Uint8Array, game: Gen2Game): HallOfFame {
  const entries: HofEntry[] = [];
  for (let t = 0; t < CAPACITY; t++) {
    const o = HOF_AT[game] + t * TEAM;
    const win = d[o];
    if (!win) break;
    const mons: HofEntry['mons'] = [];
    for (let m = 0; m < 6; m++) {
      const r = o + 1 + m * MON;
      const species = d[r];
      if (!isSpecies(species)) break;
      mons.push({ dex: species, level: d[r + 5], name: decodeText(d.subarray(r + 6, r + 16)) || speciesName(species), shiny: isShiny(d[r + 3], d[r + 4]) });
    }
    if (mons.length) entries.push({ win, mons });
  }
  return { entries, total: entries.length ? entries[0].win : 0 };
}

/** Writes `teams` (oldest first) as the Hall of Fame, newest first as the game keeps it, for the sample save and the tests. */
export function writeGen2HallOfFame(d: Uint8Array, game: Gen2Game, teams: { dex: number; level: number; name: string; shiny?: boolean }[][]): void {
  d.fill(0, HOF_AT[game], HOF_AT[game] + CAPACITY * TEAM);
  [...teams].reverse().slice(0, CAPACITY).forEach((team, t) => {
    const o = HOF_AT[game] + t * TEAM;
    d[o] = teams.length - t;
    team.forEach((m, i) => {
      const r = o + 1 + i * MON;
      d[r] = m.dex; d[r + 1] = 0x30; d[r + 2] = 0x39; // trainer ID 12345
      d.set(m.shiny ? [0xaa, 0xaa] : [0x57, 0x68], r + 3);
      d[r + 5] = m.level;
      d.set(encodeText(m.name, 11).subarray(0, 10), r + 6);
    });
    d[o + 1 + team.length * MON] = 0xff;
  });
}
