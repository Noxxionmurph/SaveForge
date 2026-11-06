// Registry of supported games. To add one: write its module under src/games/ and list it here.
import pokemonGen1 from '../games/pokemon-gen1.ts';
import pokemonCrystal from '../games/pokemon-crystal.ts';
import pokemonEmerald from '../games/pokemon-emerald.ts';
import pokemonGen2 from '../games/pokemon-gen2.ts';
import pokemonGen3 from '../games/pokemon-gen3.ts';
import pokemonFrlg from '../games/pokemon-frlg.ts';
import finalFantasyNes from '../games/final-fantasy-nes.ts';
import finalFantasyGba from '../games/final-fantasy-gba.ts';
import finalFantasy2Gba from '../games/final-fantasy-2-gba.ts';
import finalFantasy2Nes from '../games/final-fantasy-2-nes.ts';
import finalFantasy2Psp from '../games/final-fantasy-2-psp.ts';
import finalFantasy2Wsc from '../games/final-fantasy-2-wsc.ts';
import finalFantasyPsp from '../games/final-fantasy-psp.ts';
import finalFantasyWsc from '../games/final-fantasy-wsc.ts';
import type { Detection, EditableSave, GameModule } from './types.ts';

export const GAMES: GameModule[] = [
  pokemonGen1,
  pokemonGen2,
  pokemonCrystal,
  pokemonGen3,
  pokemonFrlg,
  pokemonEmerald,
  finalFantasyNes,
  finalFantasyGba,
  finalFantasy2Gba,
  finalFantasyPsp,
  finalFantasyWsc,
  finalFantasy2Nes,
  finalFantasy2Psp,
  finalFantasy2Wsc,
  // megaManBattleNetwork... goes here.
];

export interface Match {
  module: GameModule;
  detection: Detection;
}

/** Every module whose detect() accepts the file, most confident first. A throwing detector never breaks the others. */
export function detectGames(data: Uint8Array): Match[] {
  const matches: Match[] = [];
  for (const module of GAMES) {
    try {
      const detection = module.detect(data);
      if (detection) matches.push({ module, detection });
    } catch {
      /* a buggy detector must not take the whole site down */
    }
  }
  return matches.sort((a, b) => Number(b.detection.confidence === 'certain') - Number(a.detection.confidence === 'certain'));
}

/** Convenience for tests/scripts: load with the single unambiguous match, or null. */
export async function openSave(data: Uint8Array): Promise<{ module: GameModule; save: EditableSave } | null> {
  const matches = detectGames(data);
  if (matches.length !== 1) return null;
  return { module: matches[0].module, save: await matches[0].module.load(data) };
}

/** Games grouped by series, for the landing page. */
export function gamesByFamily(): Map<string, GameModule[]> {
  const out = new Map<string, GameModule[]>();
  for (const g of GAMES) out.set(g.family, [...(out.get(g.family) ?? []), g]);
  return out;
}
