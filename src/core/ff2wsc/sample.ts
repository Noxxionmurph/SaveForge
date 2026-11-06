// A made-up Final Fantasy II (WonderSwan Color) save, built in code, for tests and the browser checks. Nothing here comes
// from a real game file. It fills in only what the editor reads (the map and story bytes stay zero), so the game itself
// wouldn't start from it.

import { MAGIC, SAVE_SIZE, slotBase, writeChecksum } from './layout.ts';
import { RECORD } from './save.ts';
import { encodeName } from './text.ts';

interface Member { id: number; name: string; hp: number; mp: number; stats: number[]; gear: number[]; skills: number[]; spells: [number, number][] }
// Firion, Maria and Guy after Fynn. Gear: right, left, head, body, arms (item ids; 0x30 is an empty hand).
const PARTY: Member[] = [
  { id: 0, name: 'Firion', hp: 312, mp: 24, stats: [22, 16, 20, 11, 10, 12], gear: [0x55, 0x32, 0x70, 0x7b, 0x8e], skills: [1, 1, 5, 1, 1, 2, 1, 4], spells: [[1, 3], [21, 2]] },
  { id: 0x41, name: 'Maria', hp: 240, mp: 60, stats: [13, 21, 14, 18, 19, 20], gear: [0x69, 0x30, 0x70, 0x7b, 0], skills: [1, 1, 1, 3, 1, 1, 5, 1], spells: [[21, 4], [3, 2]] },
  { id: 2, name: 'Guy', hp: 390, mp: 16, stats: [27, 13, 24, 8, 9, 10], gear: [0x62, 0x32, 0x71, 0x7c, 0x8f], skills: [3, 1, 1, 1, 6, 1, 1, 2], spells: [[2, 1]] },
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
