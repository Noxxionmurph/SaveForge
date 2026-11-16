// Ruby, Sapphire, Emerald, FireRed and LeafGreen's Hall of Fame (pret/pokeemerald src/hall_of_fame.c, save.c): flash
// sectors 28 and 29 hold up to 50 teams of 6 records of 20 bytes (trainer ID with secret ID, personality, species in 9
// bits and level in 7, a 10-byte name), oldest first; once 50 are saved the game drops the oldest. Unlike the rest of
// the file these two sectors never rotate. Game stat 10 counts every win.

import type { HallOfFame, HofEntry } from '../hallOfFame.ts';
import { le } from '../bytes.ts';
import { EGG_SPECIES, dexOf, speciesName } from './data.ts';
import { SECTOR, SECTOR_DATA, SIGNATURE, sectorChecksum } from './layout.ts';
import { decodeText, encodeText } from './text.ts';

const { u16, u32, setU16, setU32 } = le;
const HOF_SECTOR = 28, MON = 20, TEAM = 6 * MON, CAPACITY = 50;

/** The two sectors' data back to back, or null when the file has no Hall of Fame sectors. */
function hofBytes(d: Uint8Array): Uint8Array | null {
  const out = new Uint8Array(2 * SECTOR_DATA);
  for (let i = 0; i < 2; i++) {
    const o = (HOF_SECTOR + i) * SECTOR;
    if (d.length < o + SECTOR || u32(d, o + 0xff8) !== SIGNATURE || u16(d, o + 0xff4) !== HOF_SECTOR + i) return null;
    out.set(d.subarray(o, o + SECTOR_DATA), i * SECTOR_DATA);
  }
  return out;
}

/** `entered` is the game's count of wins (game stat 10): it says how many teams the game has dropped. */
export function readGen3HallOfFame(d: Uint8Array, entered: number): HallOfFame {
  const hof = hofBytes(d);
  if (!hof) return { entries: [], total: null };
  const teams: HofEntry['mons'][] = [];
  for (let t = 0; t < CAPACITY; t++) {
    const mons: HofEntry['mons'] = [];
    for (let m = 0; m < 6; m++) {
      const o = t * TEAM + m * MON;
      const word = u16(hof, o + 8);
      const species = word & 0x1ff;
      if (!species) break;
      const dex = dexOf(species);
      if (!dex || species === EGG_SPECIES) continue;
      const tid = u32(hof, o), pid = u32(hof, o + 4);
      const shiny = (((tid & 0xffff) ^ (tid >>> 16) ^ (pid & 0xffff) ^ (pid >>> 16)) & 0xffff) < 8;
      mons.push({ dex, level: word >> 9, name: decodeText(hof.subarray(o + 10, o + 20)) || speciesName(dex), shiny });
    }
    if (!mons.length) break;
    teams.push(mons);
  }
  const total = Math.max(entered, teams.length);
  const first = total - teams.length + 1;
  return { entries: teams.map((mons, i) => ({ win: first + i, mons })).reverse(), total };
}

/** Writes `teams` (oldest first) into the Hall of Fame sectors, with their footers, for the sample save and the tests. */
export function writeGen3HallOfFame(d: Uint8Array, trainerId: number,
  teams: { species: number; level: number; name: string; personality?: number }[][]): void {
  const hof = new Uint8Array(2 * SECTOR_DATA);
  teams.slice(-CAPACITY).forEach((team, t) => team.forEach((m, i) => {
    const o = t * TEAM + i * MON;
    setU32(hof, o, trainerId); setU32(hof, o + 4, m.personality ?? 0x1234abcd);
    setU16(hof, o + 8, m.species | (m.level << 9));
    hof.set(encodeText(m.name, 10, undefined, 10), o + 10);
  }));
  for (let i = 0; i < 2; i++) {
    const o = (HOF_SECTOR + i) * SECTOR;
    d.fill(0, o, o + SECTOR);
    d.set(hof.subarray(i * SECTOR_DATA, (i + 1) * SECTOR_DATA), o);
    setU16(d, o + 0xff4, HOF_SECTOR + i);
    setU16(d, o + 0xff6, sectorChecksum(d, o, SECTOR_DATA));
    setU32(d, o + 0xff8, SIGNATURE);
    setU32(d, o + 0xffc, 1);
  }
}
