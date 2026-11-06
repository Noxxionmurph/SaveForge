import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILE_SIZE, QUICK_SAVE, SRAM_SIZE, checksum, fileBase, fileOk, storedChecksum } from '../src/core/ff1wsc/layout.ts';
import { buildFf1WscSample } from '../src/core/ff1wsc/sample.ts';
import { CLASSES, Ff1WscSave, asSaved, canLearn, decodeName } from '../src/core/ff1wsc/save.ts';
import { ARMOR, ARMOR_SLOT, CONSUMABLES, KEY_ITEMS, SPELLS, WEAPONS } from '../src/core/ff1wsc/tables.ts';
import { detectGames, openSave } from '../src/core/registry.ts';

test('sample: opens as the WonderSwan Color game and round-trips', async () => {
  const d = buildFf1WscSample();
  assert.equal(d.length, SRAM_SIZE);
  assert.deepEqual(detectGames(d).map((m) => m.module.id), ['final-fantasy-wsc']);
  const s = (await openSave(d))!.save as Ff1WscSave;
  assert.deepEqual(s.usedFiles.map((f) => f.index), [0]);
  assert.deepEqual(s.files[0].party.map((c) => c.name), ['ブロム', 'レン', 'Ivy', 'オレン']);
  assert.deepEqual(s.serialize(), d);
});

test('sample: everyone can wear their gear and know their spells', () => {
  for (const c of new Ff1WscSave(buildFf1WscSample()).files[0].party) {
    for (let g = 0; g < 5; g++) if (c.gear(g)) assert.ok(c.canWear(g, c.gear(g)), `${c.name} gear ${g}`);
    for (const sp of c.spells) assert.ok(canLearn(c.cls, sp), `${c.name} ${SPELLS[sp - 1]}`);
  }
});

test('checksum: the sum of the file as u16 words, one per file from 0x1BB2', () => {
  const d = buildFf1WscSample();
  assert.equal(storedChecksum(d, 0), checksum(d, 0));
  let sum = 0;
  for (let i = 0; i < FILE_SIZE; i += 2) sum += d[0x30 + i] | (d[0x31 + i] << 8);
  assert.equal(d[0x1bb2] | (d[0x1bb3] << 8), sum & 0xffff);
  assert.equal(fileBase(QUICK_SAVE), 0x1830);
});

test('edits land where the game reads them, and redo the checksum', () => {
  const s = new Ff1WscSave(buildFf1WscSample());
  const f = s.files[0];
  f.gil = 123_456;
  const c = f.party[0];
  c.name = 'クラウド';
  c.level = 50;
  c.exp = 123_456;
  c.cls = 8;
  c.setGear(0, WEAPONS.indexOf('Excalibur') + 1);
  c.setGear(4, ARMOR.indexOf('Protect Ring') + 1);
  f.party[1].ailment = 0x08;
  f.party[2].setMaxMp(8, 9);
  f.setCount('item', CONSUMABLES.indexOf('Potion') + 1, 99);
  f.setCount('weapon', WEAPONS.indexOf('Masamune') + 1, 1);
  f.setKeyItem(KEY_ITEMS.indexOf('Oxyale') + 1, true);
  f.setKeyItem(KEY_ITEMS.indexOf('Lute') + 1, false);
  const out = s.serialize();
  assert.ok(fileOk(out, 0));
  const r = 0x30 + 0x15d;
  assert.equal(out[0x30 + 0x13f] | (out[0x30 + 0x140] << 8) | (out[0x30 + 0x141] << 16), 123_456);
  assert.equal(out[r], 8);
  assert.equal(out[r + 3], 50);
  assert.equal(out[r + 0x2b], 0x40 + WEAPONS.indexOf('Excalibur'));
  assert.equal(out[r + 0x2f], 0x70 + ARMOR.indexOf('Protect Ring'));
  assert.equal(decodeName(out, r + 0x16), 'クラウド');
  assert.equal(out[r + 0x58 + 1], 0x08);
  const again = new Ff1WscSave(out).files[0];
  assert.equal(again.count('item', CONSUMABLES.indexOf('Potion') + 1), 99);
  assert.equal(again.count('weapon', WEAPONS.indexOf('Masamune') + 1), 1);
  assert.ok(again.hasKeyItem(KEY_ITEMS.indexOf('Oxyale') + 1));
  assert.ok(!again.hasKeyItem(1));
  // key items stay a gap-free list
  const keys = [...out.subarray(0x30 + 0x73, 0x30 + 0x93)];
  assert.ok(keys.indexOf(0) === -1 || keys.slice(keys.indexOf(0)).every((v) => v === 0));
});

test('bag: removing an item closes the gap', () => {
  const s = new Ff1WscSave(buildFf1WscSample());
  const f = s.files[0];
  f.setCount('item', CONSUMABLES.indexOf('Potion') + 1, 0);
  const out = s.serialize();
  const at = 0x30 + 0x93;
  assert.notEqual(out[at], 0);
  assert.equal(new Ff1WscSave(out).files[0].items.length, 9);
});

test('names: kana, letters and digits, four at most, 0xFB after a short one', () => {
  assert.equal(asSaved('あいうえお'), 'あいうえ');
  assert.equal(asSaved('A b!'), 'Ab');
  const s = new Ff1WscSave(buildFf1WscSample());
  s.files[0].party[0].name = '8ZUv';
  const out = s.serialize();
  // what the game wrote for a name typed as 8 Z U v
  assert.deepEqual([...out.subarray(0x30 + 0x15d + 0x16, 0x30 + 0x15d + 0x1a)], [0xdd, 0xba, 0xb5, 0xd0]);
  s.files[0].party[0].name = 'あ';
  assert.deepEqual([...s.serialize().subarray(0x30 + 0x15d + 0x16, 0x30 + 0x15d + 0x1a)], [0x00, 0xfb, 0xfb, 0xfb]);
});

test('tables: classes, armor places, sizes', () => {
  assert.deepEqual(CLASSES.map((c) => c.id), [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13]);
  assert.equal(WEAPONS.length, 40);
  assert.equal(ARMOR.length, 40);
  assert.equal(SPELLS.length, 64);
  assert.equal(KEY_ITEMS.length, 17);
  assert.deepEqual([1, 2, 3, 4].map((k) => ARMOR_SLOT.filter((x) => x === k).length), [16, 9, 7, 8]);
  assert.ok(canLearn(4, SPELLS.indexOf('Cure') + 1));
  assert.ok(!canLearn(4, SPELLS.indexOf('Holy') + 1));
  assert.ok(canLearn(12, SPELLS.indexOf('Holy') + 1));
});
