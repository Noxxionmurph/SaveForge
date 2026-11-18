// A made-up Final Fantasy II (WonderSwan Color) save, built in code, for tests and the browser checks. Nothing here comes
// from a real game file. It fills in only what the editor reads (the map and story bytes stay zero), so the game itself
// wouldn't start from it.

import { MAGIC, SAVE_SIZE, slotBase, writeChecksum } from './layout.ts';
import { RECORD } from './save.ts';
import { encodeName } from './text.ts';

interface Member { id: number; name: string; hp: number; mp: number; stats: number[]; gear: number[]; skills: number[]; spells: [number, number][] }
// Firion, Maria and Guy after Fynn, then the guests' records, which the game fills in from the start (nobody is in
// the fourth place). Gear: right, left, head, body, arms (item ids; 0x30 is an empty hand).
const PARTY: Member[] = [
  { id: 0, name: 'Firion', hp: 312, mp: 24, stats: [22, 16, 20, 11, 10, 12], gear: [0x55, 0x32, 0x70, 0x7b, 0x8e], skills: [1, 1, 5, 1, 1, 2, 1, 4], spells: [[1, 3], [21, 2]] },
  { id: 0x41, name: 'Maria', hp: 240, mp: 60, stats: [13, 21, 14, 18, 19, 20], gear: [0x69, 0x30, 0x70, 0x7b, 0], skills: [1, 1, 1, 3, 1, 1, 5, 1], spells: [[21, 4], [3, 2]] },
  { id: 2, name: 'Guy', hp: 390, mp: 16, stats: [27, 13, 24, 8, 9, 10], gear: [0x62, 0x32, 0x71, 0x7c, 0x8f], skills: [3, 1, 1, 1, 6, 1, 1, 2], spells: [[2, 1]] },
  { id: 3, name: 'Minwu', hp: 175, mp: 80, stats: [10, 20, 20, 16, 48, 40], gear: [0x42, 0x30, 0, 0x8a, 0], skills: [1, 1, 1, 5, 1, 1, 1, 1], spells: [[21, 5], [22, 2]] },
  { id: 4, name: 'Josef', hp: 235, mp: 5, stats: [24, 24, 24, 10, 10, 10], gear: [0x30, 0x30, 0, 0x7b, 0x8e], skills: [2, 1, 1, 1, 1, 1, 1, 1], spells: [] },
  { id: 5, name: 'Gordon', hp: 64, mp: 5, stats: [22, 22, 22, 22, 22, 22], gear: [0x4d, 0x30, 0, 0x7c, 0x8f], skills: [1, 1, 3, 1, 1, 1, 1, 1], spells: [] },
  { id: 6, name: 'Leila', hp: 150, mp: 20, stats: [18, 26, 18, 16, 10, 10], gear: [0x44, 0x30, 0, 0x86, 0], skills: [1, 3, 1, 1, 1, 1, 1, 1], spells: [[1, 2]] },
  { id: 7, name: 'Ricard', hp: 549, mp: 5, stats: [40, 26, 32, 16, 26, 5], gear: [0x63, 0x3d, 0x73, 0x7f, 0x92], skills: [1, 1, 1, 1, 1, 6, 1, 1], spells: [] },
  { id: 8, name: 'Leon', hp: 1098, mp: 5, stats: [53, 45, 46, 36, 16, 32], gear: [0x62, 0x61, 0x75, 0x82, 0x94], skills: [1, 1, 5, 1, 7, 1, 1, 1], spells: [] },
];

export function buildFf2WscSample(): Uint8Array {
  const d = new Uint8Array(SAVE_SIZE);
  d.set(new TextEncoder().encode(MAGIC), 0x10);
  const at = slotBase(0);
  d[at + 4] = 1;
  d[at + 5] = 0x0f;
  const gil = 18_350;
  for (let i = 0; i < 4; i++) d[at + 0x422 + i] = (gil >> (8 * i)) & 0xff;
  [0x10, 0x10, 0x10, 0x11, 0x12, 0x17, 0x19, 0x9c].forEach((id, i) => { d[at + 0x426 + i] = id; });
  d[at + 0x5a6] = 2; d[at + 0x5a7] = 1; d[at + 0x5d3] = 2; // key terms: Mythril, learned after Wild Rose
  PARTY.forEach((m, i) => {
    const o = at + 6 + i * RECORD;
    d[o] = m.id;
    d.set(encodeName(m.name), o + 1);
    const u16 = (off: number, v: number) => { d[o + off] = v & 0xff; d[o + off + 1] = v >> 8; };
    u16(0x08, m.hp); u16(0x0a, m.hp); u16(0x0c, m.mp); u16(0x0e, m.mp);
    m.stats.forEach((v, k) => { d[o + 0x10 + k] = v; d[o + 0x20 + k] = v; });
    m.gear.forEach((g, k) => { d[o + 0x19 + k] = g; });
    for (let k = 0; k < 24; k++) d[o + 0x41 + k * 2] = 1;
    m.skills.forEach((lv, k) => { d[o + 0x41 + k * 2] = lv; });
    m.spells.forEach(([id, lv], k) => { d[o + 0x30 + k] = id; d[o + 0x51 + k * 2] = lv; });
  });
  writeChecksum(d, at);
  return d;
}
