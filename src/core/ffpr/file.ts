// Opening a Pixel Remaster (Steam) save: unwrap it (crypto.ts), read the JSON losslessly (json.ts), and work out which
// game it's from. One slot file is one save; the games also keep a system file (bestiary, unlocks) beside the slots,
// which has no "userData" and isn't opened here.

import { openPrFile, sealPrFile } from './crypto.ts';
import { Doc, Num, Packed, type Json, type JsonObject } from './json.ts';

export type PrGame = 'ff1' | 'ff2' | 'ff3' | 'ff4' | 'ff5' | 'ff6';

export interface PrOpened {
  json: string;
  bom: boolean;
  game: PrGame | null;
}

// detect() runs once per module and three modules share this format, so the (fairly slow) unwrap is done once per file.
const cache = new WeakMap<Uint8Array, PrOpened | null>();

/** The save inside `data` if it's a Pixel Remaster slot file, or null. Never throws. */
export function openPr(data: Uint8Array): PrOpened | null {
  if (cache.has(data)) return cache.get(data)!;
  let out: PrOpened | null = null;
  try {
    const { json, bom } = openPrFile(data);
    if (json.startsWith('{"id":') && json.includes('"userData":"')) out = { json, bom, game: whichGame(new Doc(json)) };
  } catch {
    out = null;
  }
  cache.set(data, out);
  return out;
}

const list = (doc: Doc, owner: JsonObject, key: string, parent?: Packed): Json[] => {
  const p = doc.open(owner, key, parent).obj.target;
  return Array.isArray(p) ? p : [];
};

/**
 * Which game a slot is from. The six games write the same fields, so this goes by what each one fills in: Final Fantasy
 * II's characters carry ten weapon-skill entries, III's carry its two extra skill entries and one job entry per job
 * unlocked, V adds its own fields to the save, and I's characters have none of those and a class from 1-12.
 */
export function whichGame(doc: Doc): PrGame | null {
  try {
    const userNode = doc.open(doc.root, 'userData');
    const user = userNode.obj;
    if ('braveBladeEscapeCount' in user || 'wonderWandIndex' in user) return 'ff5';
    const chars = list(doc, user, 'ownedCharacterList', userNode);
    if (!chars.length) return null;
    const listNode = doc.open(user, 'ownedCharacterList', userNode);
    const target = listNode.obj.target as Json[];
    const votes = new Map<PrGame, number>();
    for (let i = 0; i < target.length; i++) {
      const ch = doc.open(target, i, listNode).obj;
      const skillKeys = (doc.open(ch, 'skillLevelTargets').obj.keys as Json[] | undefined)?.length ?? 0;
      const jobs = (doc.open(ch, 'jobList').obj.target as Json[] | undefined)?.length ?? 0;
      const job = ch.jobId instanceof Num ? ch.jobId.value : 0;
      let g: PrGame | null = null;
      if (skillKeys === 10) g = 'ff2';
      else if (skillKeys === 2) g = 'ff3';
      else if (skillKeys === 0 && jobs === 6 && job >= 1 && job <= 12) g = 'ff1';
      if (g) votes.set(g, (votes.get(g) ?? 0) + 1);
    }
    let best: PrGame | null = null, bestN = 0;
    for (const [g, n] of votes) if (n > bestN) { best = g; bestN = n; }
    return bestN * 2 > target.length ? best : null;
  } catch {
    return null;
  }
}

export { sealPrFile };
