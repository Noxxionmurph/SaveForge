import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checksum8, Gen1Save } from '../src/core/gen1/save.ts';
import { EVENT_FLAGS as G1_EVENTS, TOGGLE_FLAGS } from '../src/core/gen1/legends.ts';
import { blankGen1Save } from '../src/core/gen1/sample.ts';
import { Gen2Save } from '../src/core/gen2/save.ts';
import { EVENT_FLAGS as G2_EVENTS, RELEASED_THE_BEASTS, ROAM_MONS } from '../src/core/gen2/legends.ts';
import { GEN2_LAYOUTS, sum16 } from '../src/core/gen2/layout.ts';
import { blankGen2Save } from '../src/core/gen2/sample.ts';
import { Gen3Save } from '../src/core/gen3/save.ts';
import { blankGen3Save } from '../src/core/gen3/sample.ts';
import { legendLines } from '../src/core/legends.ts';

const setBit = (d: Uint8Array, base: number, n: number) => { d[base + (n >> 3)] |= 1 << (n & 7); };
const bit = (d: Uint8Array, base: number, n: number) => !!(d[base + (n >> 3)] & (1 << (n & 7)));

test('Gen 1: a hidden Articuno is brought back (sprite bit and beaten event), in Red and in Yellow', () => {
  for (const yellow of [false, true]) {
    const d = blankGen1Save('ASH', 'GARY', yellow);
    const s0 = new Gen1Save(d);
    const i = s0.legends.findIndex((l) => l.name === 'Articuno');
    const toggle = s0.legends[i].toggle[yellow ? 1 : 0];
    setBit(d, TOGGLE_FLAGS, toggle);
    setBit(d, G1_EVENTS, 0x9da);
    d[0x3523] = checksum8(d, 0x2598, 0x3523);
    const s = new Gen1Save(d);
    assert.equal(s.legendGone(i), true);
    assert.equal(s.legends.filter((_, j) => s.legendGone(j)).length, 1);
    s.bringBack[i] = true;
    assert.deepEqual(legendLines(s), ['Bring back Articuno (Seafoam Islands)']);
    const out = s.serialize();
    assert.equal(bit(out, TOGGLE_FLAGS, toggle), false);
    assert.equal(bit(out, G1_EVENTS, 0x9da), false);
    assert.ok(Gen1Save.checksumValid(out));
    assert.equal(new Gen1Save(out).legendGone(i), false);
  }
});

test('Gen 2: Lugia comes back, and a beaten roaming dog roams again from its first route', () => {
  for (const game of ['gs', 'crystal'] as const) {
    const L = GEN2_LAYOUTS[game];
    const d = blankGen2Save(game);
    setBit(d, G2_EVENTS[game], 0x318); // EVENT_FOUGHT_LUGIA
    setBit(d, G2_EVENTS[game], RELEASED_THE_BEASTS);
    const sum = sum16(d, L.gameData, L.gameDataEnd);
    d[L.checksum] = sum & 0xff; d[L.checksum + 1] = sum >> 8;
    const s = new Gen2Save(d, game);
    const lugia = s.legends.findIndex((l) => l.name === 'Lugia');
    const entei = s.legends.findIndex((l) => l.name === 'Entei');
    assert.equal(s.legends.some((l) => l.name === 'Suicune'), game === 'gs', 'Suicune only roams in Gold and Silver');
    assert.equal(s.legendGone(lugia), true);
    assert.equal(s.legendGone(entei), true, 'nothing in the roaming slot after the dogs ran off');
    s.bringBack[lugia] = true;
    s.bringBack[entei] = true;
    const out = s.serialize();
    assert.equal(bit(out, G2_EVENTS[game], 0x318), false);
    assert.deepEqual([...out.subarray(ROAM_MONS[game] + 7, ROAM_MONS[game] + 14)], [244, 40, 10, 4, 0, 0, 0]);
    const t = new Gen2Save(out, game);
    assert.equal(t.loadedFrom, 'main');
    assert.equal(t.legendGone(lugia), false);
    assert.equal(t.legendGone(entei), false);
  }
});

test('Gen 2: the dogs are not "gone" before the Burned Tower', () => {
  const s = new Gen2Save(blankGen2Save('crystal'), 'crystal');
  assert.equal(s.legends.some((_, i) => s.legendGone(i)), false);
});

test('Gen 3: Emerald clears the defeated and hide flags; Ruby resets the Cave of Origin scene', () => {
  const em = new Gen3Save(blankGen3Save('emerald'), 'emerald') as any;
  const regirock = em.legends.findIndex((l: any) => l.name === 'Regirock');
  for (const f of [0x1bb, 0x3a7]) em.sb1[em.L.flags + (f >> 3)] |= 1 << (f & 7);
  const e = new Gen3Save(em.serialize(), 'emerald');
  assert.equal(e.legendGone(regirock), true);
  e.bringBack[regirock] = true;
  const e2 = new Gen3Save(e.serialize(), 'emerald') as any;
  assert.equal(e2.legendGone(regirock), false);
  assert.equal(bit(e2.sb1, e2.L.flags, 0x3a7), false, 'hide flag cleared too');

  const rs = new Gen3Save(blankGen3Save('rs'), 'rs') as any;
  const cave = rs.legends.findIndex((l: any) => l.place === 'Cave of Origin');
  rs.sb1[rs.L.flags + (0x339 >> 3)] |= 1 << (0x339 & 7);
  rs.sb1[rs.L.vars + 0x9b * 2] = 1;
  const r = new Gen3Save(rs.serialize(), 'rs');
  assert.equal(r.legendGone(cave), true);
  r.bringBack[cave] = true;
  const r2 = new Gen3Save(r.serialize(), 'rs') as any;
  assert.equal(r2.legendGone(cave), false);
  assert.equal(r2.sb1[r2.L.vars + 0x9b * 2], 0, 'VAR_CAVE_OF_ORIGIN_B4F_STATE back to 0');
});
