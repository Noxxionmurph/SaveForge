// A made-up Final Fantasy II (Famicom) save, built in code, for tests and the browser checks. Nothing here comes from a
// real game file. It fills in only what the editor reads (the map and story bytes stay zero), so the game itself
// wouldn't start from it.

import { SAVE_SIZE, slotBase, writeChecksum } from './layout.ts';
import { encodeName } from './text.ts';

interface Member { id: number; name: string; hp: number; mp: number; stats: number[]; gear: number[]; skills: number[]; spells: [number, number][] }
// Firion, Maria and Guy after Fynn, with Minwu in the fourth place. Gear: right, left, head, body, arms (item ids).
const PARTY: Member[] = [
  { id: 0, name: 'Firion', hp: 312, mp: 24, stats: [22, 16, 20, 11, 10, 12], gear: [0x55, 0x32, 0x70, 0x7b, 0x8e], skills: [1, 4, 1, 5, 1, 2, 1, 1], spells: [[1, 3], [21, 2]] },
  { id: 1, name: 'Maria', hp: 240, mp: 60, stats: [13, 21, 14, 18, 19, 20], gear: [0x69, 0, 0x70, 0x7b, 0], skills: [1, 1, 1, 1, 3, 1, 1, 5], spells: [[21, 4], [3, 2]] },
  { id: 2, name: 'Guy', hp: 390, mp: 16, stats: [27, 13, 24, 8, 9, 10], gear: [0x62, 0x32, 0x71, 0x7c, 0x8f], skills: [3, 2, 1, 1, 1, 1, 6, 1], spells: [[2, 1]] },
  { id: 3, name: 'Minwu', hp: 220, mp: 110, stats: [12, 15, 14, 16, 30, 26], gear: [0x42, 0, 0x70, 0x8a, 0], skills: [1, 1, 1, 1, 6, 1, 1, 1], spells: [[21, 6], [22, 3], [27, 2]] },
];

export function buildFf2NesSample(): Uint8Array {
  const d = new Uint8Array(SAVE_SIZE);
  const at = slotBase(0);
  const gil = 18_350;
  d[at + 0x1c] = gil & 0xff; d[at + 0x1d] = (gil >> 8) & 0xff; d[at + 0x1e] = gil >> 16;
  d[at + 0x1a] = 0x02; // the Ring
  d[at + 0x80] = 0xf2; d[at + 0x81] = 0xf1; // key terms: Mythril, learned after Wild Rose
  [0x10, 0x10, 0x10, 0x11, 0x12, 0x17, 0x19, 0x9c].forEach((id, i) => { d[at + 0x60 + i] = id; });
  PARTY.forEach((m, i) => {
    const o = at + 0x100 + i * 0x40, o2 = at + 0x200 + i * 0x40;
    d[o] = m.id;
    d.set(encodeName(m.name), o + 2);
    const u16 = (off: number, v: number) => { d[o + off] = v & 0xff; d[o + off + 1] = v >> 8; };
    u16(0x08, m.hp); u16(0x0a, m.hp); u16(0x0c, m.mp); u16(0x0e, m.mp);
    m.stats.forEach((v, k) => { d[o + 0x10 + k] = v; d[o + 0x20 + k] = v; });
    [0x1c, 0x1d, 0x19, 0x1a, 0x1b].forEach((off, k) => { d[o + off] = m.gear[k]; });
    m.spells.forEach(([id, lv], k) => { d[o + 0x30 + k] = 0x97 + id; d[o2 + 0x10 + k * 2] = lv - 1; });
    m.skills.forEach((lv, k) => { d[o2 + k * 2] = lv - 1; });
    d[o2 + 0x35] = 0x01; // front row, present
  });
  writeChecksum(d, at);
  return d;
}
