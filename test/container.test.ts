import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { sharkPortChecksum, unwrapSave } from '../src/core/container.ts';
import { Gen3Save } from '../src/core/gen3/save.ts';
import { buildSampleSave } from '../src/core/gen3/sample.ts';
import { detectGames } from '../src/core/registry.ts';

/** A SharkPort file around `save`, laid out as mGBA writes one (src/gba/sharkport.c). */
function sharkPortFile(save: Uint8Array, title = 'POKEMON FIRE', code = 'BPRE'): Uint8Array {
  const parts: number[] = [];
  const u32 = (v: number) => parts.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  const str = (s: string) => { u32(s.length); for (const c of s) parts.push(c.charCodeAt(0)); };
  str('SharkPortSave'); u32(0x000f0000); str(title); str('9/23/2026 11:08:10 AM'); str('');
  u32(0x1c + save.length);
  const header = new Uint8Array(0x1c);
  header.set([...title + code].map((c) => c.charCodeAt(0)));
  header[0x14] = 1;
  const payload = new Uint8Array([...header, ...save]);
  for (const b of payload) parts.push(b);
  u32(sharkPortChecksum(payload));
  return new Uint8Array(parts);
}

test('a plain save passes through untouched', () => {
  const sav = buildSampleSave('frlg');
  const u = unwrapSave(sav);
  assert.equal(u.format, null);
  assert.equal(u.data, sav);
  assert.equal(u.wrap(sav), sav);
});

test('a SharkPort .sps opens as the save inside, and an edit goes back in with a fresh checksum', () => {
  const sav = buildSampleSave('frlg');
  const sps = sharkPortFile(sav);
  assert.equal(sps.length, sav.length + 102);
  assert.equal(detectGames(sps).length, 0, 'not recognised before unwrapping');
  const u = unwrapSave(sps);
  assert.equal(u.format, 'SharkPort');
  assert.deepEqual(u.data, sav);
  assert.equal(detectGames(u.data)[0].module.id, 'pokemon-frlg');
  assert.deepEqual(u.wrap(u.data), sps, 'an unedited save round-trips byte for byte');
  const s = new Gen3Save(u.data);
  s.money = 777777;
  const out = u.wrap(s.serialize());
  assert.equal(out.length, sps.length);
  const back = unwrapSave(out);
  assert.equal(new Gen3Save(back.data).money, 777777);
  const dv = new DataView(out.buffer);
  assert.equal(dv.getUint32(out.length - 4, true), sharkPortChecksum(out.subarray(out.length - 4 - 0x1c - sav.length, out.length - 4)));
});

test('a damaged SharkPort header is left as it is', () => {
  const sps = sharkPortFile(buildSampleSave('emerald')).slice(0, 200);
  assert.equal(unwrapSave(sps).format, null);
});

// Set SPS_FILE to a real .sps to check it opens and round-trips. Nothing from it is printed or stored.
const real = process.env.SPS_FILE;
test('a real .sps in SPS_FILE opens and round-trips', { skip: real && existsSync(real) ? false : 'set SPS_FILE to a real .sps to run' }, () => {
  const raw = new Uint8Array(readFileSync(real!));
  const u = unwrapSave(raw);
  assert.equal(u.format, 'SharkPort');
  assert.equal(detectGames(u.data).length, 1);
  assert.deepEqual(u.wrap(u.data), raw);
});

test('RetroArch .srm files and saves with extra bytes on the end open and keep them', async () => {
  const { openSave } = await import('../src/core/registry.ts');
  const { buildSampleSave: gen2 } = await import('../src/core/gen2/sample.ts');
  for (const save of [buildSampleSave('frlg'), buildSampleSave('emerald'), gen2('crystal')]) {
    for (const extra of [0x2000, 48]) {
      const file = new Uint8Array(save.length + extra);
      file.set(save); file.fill(0xff, save.length);
      const found = await openSave(file);
      assert.ok(found, `${save.length} + ${extra}`);
      assert.deepEqual(found.save.serialize(), file);
    }
  }
});

test('a GameShark Advance SP .gsv opens as the save inside, and saves as a plain .sav', () => {
  const sav = buildSampleSave('emerald');
  const gsv = new Uint8Array(0x430 + sav.length);
  gsv.set([...'ADVSAVEG'].map((c) => c.charCodeAt(0)));
  gsv.set([...'POKEMON EMER'].map((c) => c.charCodeAt(0)), 0xc);
  const dv = new DataView(gsv.buffer);
  dv.setUint32(0x1c, 6, true); // 128 KB flash
  dv.setUint32(0x42c, 0x12345678, true);
  gsv.set(sav, 0x430);
  const u = unwrapSave(gsv);
  assert.equal(u.format, 'GameShark SP');
  assert.equal(u.saveAs, '.sav');
  assert.deepEqual(u.data, sav);
  assert.equal(detectGames(u.data)[0].module.id, 'pokemon-emerald');
  assert.deepEqual(u.wrap(u.data), sav);
});
