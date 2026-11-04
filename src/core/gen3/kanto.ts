// What only FireRed and LeafGreen have (pret/pokefirered include/global.h, include/constants/flags.h): the Vs. Seeker's
// battery, the Fame Checker, the "Previously on your quest" recap and the Fly destinations, Sevii Islands among them.

import { le } from '../bytes.ts';

const { u16, setU16 } = le;

/** SaveBlock1 offsets. */
export const KANTO = {
  /** trainerRematchStepCounter: the low byte is the Vs. Seeker's battery (steps walked with it in the bag, full at 100),
   * the high byte counts steps since it was last used. */
  vsSeeker: 0x638,
  /** struct FameCheckerSaveData[16], 4 bytes each (the compiler pads the u16 of bit fields): pickState in bits 0-1,
   * the facts found in bits 2-13. */
  fameChecker: 0x3a54,
  /** struct QuestLogScene[4], 0x668 bytes each; startType (byte 0) is 0 for an empty scene. */
  questLog: 0x1300, questLogScene: 0x668, questLogScenes: 4,
};

export const VS_SEEKER_FULL = 100;
export const VS_SEEKER_ITEM = 362;

/** The Fame Checker's people (FAMECHECKER_*), in the game's order. */
export const FAME_PEOPLE = [
  'Professor Oak', 'Daisy', 'Brock', 'Misty', 'Lt. Surge', 'Erika', 'Koga', 'Sabrina', 'Blaine', 'Lorelei', 'Bruno',
  'Agatha', 'Lance', 'Bill', 'Mr. Fuji', 'Giovanni',
] as const;
/** FCPICKSTATE_*: not in the list, a silhouette, or met (shown in colour). */
export const FAME_STATES = [{ value: 0, label: 'Not yet' }, { value: 1, label: 'Heard of' }, { value: 2, label: 'Met' }] as const;
const FAME_STRIDE = 4;
/** Each person has six facts to find. */
export const FAME_FACTS = 6;

export interface FamePerson { state: number; facts: number }

export function readFame(sb1: Uint8Array): FamePerson[] {
  return FAME_PEOPLE.map((_, i) => {
    const v = u16(sb1, KANTO.fameChecker + i * FAME_STRIDE);
    return { state: v & 3, facts: (v >> 2) & ((1 << FAME_FACTS) - 1) };
  });
}

/** Writes only the people that changed, keeping the bits the editor doesn't know. */
export function writeFame(sb1: Uint8Array, list: FamePerson[], before: FamePerson[]): void {
  list.forEach((p, i) => {
    if (p.state === before[i].state && p.facts === before[i].facts) return;
    const at = KANTO.fameChecker + i * FAME_STRIDE;
    const keep = u16(sb1, at) & ~(3 | (((1 << FAME_FACTS) - 1) << 2));
    setU16(sb1, at, keep | (p.state & 3) | ((p.facts & ((1 << FAME_FACTS) - 1)) << 2));
  });
}

/** How many scenes the recap on Continue will play. */
export function questLogScenes(sb1: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < KANTO.questLogScenes; i++) if (sb1[KANTO.questLog + i * KANTO.questLogScene] !== 0) n++;
  return n;
}

/** Empty every scene, as the game leaves them before anything is recorded (pokefirered src/quest_log.c ResetQuestLog). */
export function clearQuestLog(sb1: Uint8Array): void {
  sb1.fill(0, KANTO.questLog, KANTO.questLog + KANTO.questLogScenes * KANTO.questLogScene);
}

// ---------- Fly ----------

export interface FlySpot { name: string; flag: number; region: 'kanto' | 'sevii' }

/** The places Fly can take you, each with its FLAG_WORLD_MAP_* (set the first time you arrive). Fly's map only shows
 * the part of the world you're in (pokefirered src/region_map.c), so the islands are reached from the islands. */
export const FLY_SPOTS: readonly FlySpot[] = [
  ...['Pallet Town', 'Viridian City', 'Pewter City', 'Cerulean City', 'Lavender Town', 'Vermilion City', 'Celadon City',
    'Fuchsia City', 'Cinnabar Island', 'Indigo Plateau', 'Saffron City'].map((name, i) => ({ name, flag: 0x890 + i, region: 'kanto' as const })),
  { name: 'Route 4', flag: 0x8a2, region: 'kanto' },
  { name: 'Route 10', flag: 0x8a3, region: 'kanto' },
  { name: 'One Island', flag: 0x89b, region: 'sevii' },
  { name: 'Two Island', flag: 0x89c, region: 'sevii' },
  { name: 'Three Island', flag: 0x89d, region: 'sevii' },
  { name: 'Four Island', flag: 0x89e, region: 'sevii' },
  { name: 'Five Island', flag: 0x89f, region: 'sevii' },
  { name: 'Six Island', flag: 0x8a1, region: 'sevii' },
  { name: 'Seven Island', flag: 0x8a0, region: 'sevii' },
];

/** VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F: how far the Sevii Islands story has got. 1 once Bill has brought you
 * to One Island (the Tri-Pass), 5 once Celio has given you the Rainbow Pass. The Seagallop checks it. */
export const VAR_SEVII_STORY = 0x4076;
export const SEVII_RAINBOW_PASS = 5;
