// A made-up Final Fantasy III (Famicom) save, built in code, for tests and the browser checks. Nothing here comes from a
// real game file. It fills in only what the editor reads (the map and story bytes stay zero), so the game itself
// wouldn't start from it.

import { SAVE_SIZE, slotBase, writeChecksum } from './layout.ts';
import { encodeName } from './text.ts';

interface Member { name: string; job: number; level: number; jobLevel: number; hp: number; stats: number[]; gear: number[]; mp: number[]; spells: number[] }
// Four Onion Kids after the Wind Crystal. Gear: head, body, arms, right, left (item ids).
const PARTY: Member[] = [
  { name: 'Luneth', job: 1, level: 12, jobLevel: 6, hp: 160, stats: [17, 12, 15, 6, 6], gear: [0x62, 0x73, 0x8b, 0x24, 0x58], mp: [], spells: [] },
  { name: 'Arc', job: 3, level: 11, jobLevel: 5, hp: 104, stats: [8, 10, 9, 9, 15], gear: [0x62, 0x72, 0, 0x0e, 0], mp: [6, 4], spells: [0xfc, 0xfd, 0xf5, 0xee] },
  { name: 'Refia', job: 4, level: 11, jobLevel: 5, hp: 98, stats: [7, 11, 8, 16, 9], gear: [0x62, 0x72, 0, 0x09, 0], mp: [6, 4], spells: [0xf9, 0xfa, 0xf2, 0xeb] },
  { name: 'Ingus', job: 2, level: 12, jobLevel: 7, hp: 178, stats: [18, 13, 16, 5, 7], gear: [0x67, 0x79, 0, 0, 0], mp: [], spells: [] },
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
    const exp = m.level * m.level * 18;
    d[o + 3] = exp & 0xff; d[o + 4] = (exp >> 8) & 0xff;
    d.set(encodeName(m.name), o + 6);
    d[o + 0x0c] = m.hp & 0xff; d[o + 0x0d] = m.hp >> 8; d[o + 0x0e] = m.hp & 0xff; d[o + 0x0f] = m.hp >> 8;
    d[o + 0x10] = m.jobLevel - 1;
    m.stats.forEach((v, k) => { d[o + 0x12 + k] = v; d[o + 0x17 + k] = v; });
    m.mp.forEach((v, k) => { d[o + 0x30 + k * 2] = v; d[o + 0x31 + k * 2] = v; });
    m.gear.forEach((id, k) => { d[o2 + k + (k >= 4 ? 1 : 0)] = id; });
    for (const id of m.spells) d[o2 + 6 + (8 - Math.floor((id - 0xc8) / 7))] |= 1 << ((id - 0xc8) % 7);
    d[o2 + 0x10 + m.job * 2] = m.jobLevel - 1;
    d[o2 + 0x10] = 9; // everyone was an Onion Kid to job level 10 first
  });
  writeChecksum(d, at);
  return d;
}
