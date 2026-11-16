// Red, Blue and Yellow's Hall of Fame (pret/pokered: sHallOfFame in SRAM bank 0 at 0x598, 50 teams of 6 records of 16
// bytes: species (internal index), level, an 11-byte name, three spare). wNumHoFTeams counts every win; once 50 are
// saved the game drops the oldest, so the newest sits last.

import type { HallOfFame, HofEntry } from '../hallOfFame.ts';
import { DEX_TO_INTERNAL, INTERNAL_TO_DEX, speciesName } from './data.ts';
import { decodeText, encodeText } from './text.ts';

export const HOF_AT = 0x598;
export const HOF_COUNT_AT = 0x284e; // wNumHoFTeams (the same file offset in Yellow)
const MON = 0x10, TEAM = 6 * MON, CAPACITY = 50;

export function readGen1HallOfFame(d: Uint8Array): HallOfFame {
  const total = d[HOF_COUNT_AT];
  const entries: HofEntry[] = [];
  const saved = Math.min(total, CAPACITY);
  for (let t = 0; t < saved; t++) {
    const mons: HofEntry['mons'] = [];
    for (let m = 0; m < 6; m++) {
      const o = HOF_AT + t * TEAM + m * MON;
      const dex = INTERNAL_TO_DEX[d[o]] ?? 0;
      if (!dex) break;
      mons.push({ dex, level: d[o + 1], name: decodeText(d.subarray(o + 2, o + 13)) || speciesName(d[o]) });
    }
    if (mons.length) entries.push({ win: total - saved + t + 1, mons });
  }
  return { entries: entries.reverse(), total };
}

/** Writes `teams` (oldest first) as the Hall of Fame, for the sample save and the tests. */
export function writeGen1HallOfFame(d: Uint8Array, teams: { dex: number; level: number; name: string }[][], total = teams.length): void {
  d.fill(0, HOF_AT, HOF_AT + CAPACITY * TEAM);
  teams.slice(-CAPACITY).forEach((team, t) => team.forEach((m, i) => {
    const o = HOF_AT + t * TEAM + i * MON;
    d[o] = DEX_TO_INTERNAL[m.dex]; d[o + 1] = m.level;
    d.set(encodeText(m.name, 11), o + 2);
  }));
  d[HOF_COUNT_AT] = total;
}
