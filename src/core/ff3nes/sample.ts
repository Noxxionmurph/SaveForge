// A made-up Final Fantasy III (Famicom) save, built in code, for tests and the browser checks. Nothing here comes from a
// real game file. It fills in only what the editor reads (the map and story bytes stay zero), so the game itself
// wouldn't start from it. Stats and max MP are what the game gives each job at that level.

import { SAVE_SIZE, slotBase, writeChecksum } from './layout.ts';
import { expFor, growth } from './save.ts';
import { STAT_BONUS } from './tables.ts';
import { encodeName } from './text.ts';

interface Member { name: string; job: number; level: number; jobLevel: number; hp: number; gear: number[]; mp: number[]; spells: number[] }
// Four Onion Kids after the Wind Crystal. Gear: head, body, arms, right hand, left hand (item ids).
const PARTY: Member[] = [
  { name: 'Luneth', job: 1, level: 12, jobLevel: 6, hp: 160, gear: [0x62, 0x73, 0, 0x24, 0x58], mp: [], spells: [] },
  { name: 'Arc', job: 3, level: 11, jobLevel: 5, hp: 104, gear: [0x62, 0x72, 0x8b, 0x0e, 0], mp: [11, 4, 2], spells: [0xfc, 0xfd, 0xf5, 0xee] },
  { name: 'Refia', job: 4, level: 11, jobLevel: 5, hp: 98, gear: [0x62, 0x72, 0, 0x09, 0], mp: [13, 3, 3], spells: [0xf9, 0xfa, 0xf2, 0xeb] },
  { name: 'Ingus', job: 2, level: 12, jobLevel: 7, hp: 178, gear: [0x67, 0x79, 0, 0, 0], mp: [], spells: [] },
];

export function buildFf3NesSample(): Uint8Array {
  const d = new Uint8Array(SAVE_SIZE);
  const at = slotBase(0);
  const gil = 4_820;
  d[at + 0x1c] = gil & 0xff; d[at + 0x1d] = (gil >> 8) & 0xff;
  d[at + 0x1b] = 23; // capacity
  d[at + 0x21] = 0x01; // the Wind Crystal's jobs
  d[at + 0x14] = 7; // save count
  [[0xa6, 14], [0xa7, 3], [0xa9, 2], [0xaf, 5], [0xae, 4], [0xb1, 1], [0x98, 1]].forEach(([id, n], i) => { d[at + 0xc0 + i] = id; d[at + 0xe0 + i] = n; });
  d[at + 0x300 + 0x58] = 2; // the Fat Chocobo keeps two Leather Shields
  PARTY.forEach((m, i) => {
    const o = at + 0x100 + i * 0x40, o2 = at + 0x200 + i * 0x40;
    d[o] = m.job;
    d[o + 1] = m.level - 1;
    const exp = expFor(m.level) + 37 * m.level;
    d[o + 3] = exp & 0xff; d[o + 4] = (exp >> 8) & 0xff;
    d.set(encodeName(m.name), o + 6);
    d[o + 0x0c] = m.hp & 0xff; d[o + 0x0d] = m.hp >> 8; d[o + 0x0e] = m.hp & 0xff; d[o + 0x0f] = m.hp >> 8;
    d[o + 0x10] = m.jobLevel - 1;
    const { stats, maxMp } = growth(m.job, m.level);
    stats.forEach((v, k) => {
      d[o + 0x12 + k] = v;
      d[o + 0x17 + k] = Math.min(99, v + 5 * m.gear.filter((id) => STAT_BONUS[id] & (0x10 >> k)).length);
    });
    maxMp.forEach((v, k) => { d[o + 0x30 + k * 2] = Math.min(v, m.mp[k] ?? 0); d[o + 0x31 + k * 2] = v; });
    // Head, body, arms at +0-2; each hand is [item, how many] at +3 and +5.
    [0, 1, 2, 3, 5].forEach((off, k) => { d[o2 + off] = m.gear[k]; if (k > 2 && m.gear[k]) d[o2 + off + 1] = 1; });
    for (const id of m.spells) d[o2 + 6 + (8 - Math.floor((id - 0xc8) / 7))] |= 1 << ((id - 0xc8) % 7);
    d[o2 + 0x10 + m.job * 2] = m.jobLevel - 1;
    d[o2 + 0x10] = 9; // everyone was an Onion Kid to job level 10 first
  });
  writeChecksum(d, at);
  return d;
}
