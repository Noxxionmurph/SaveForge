import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { unwrapSave } from '../src/core/container.ts';
import { FF1, SRAM_SIZE, checksum, detectDawnOfSouls, fileOk, storedChecksum, writeChecksum } from '../src/core/ff1gba/layout.ts';
import { buildFf1GbaSample } from '../src/core/ff1gba/sample.ts';
import { Ff1GbaSave, ORB_NAMES, asSaved, canLearn, spellLevel } from '../src/core/ff1gba/save.ts';
import { ARMOR, ARMOR_SLOT, KEY_ITEMS, SPELLS, WEAPONS } from '../src/core/ff1gba/tables.ts';
import { detectGames, openSave } from '../src/core/registry.ts';

test('sample: opens as Dawn of Souls and round-trips', async () => {
  const d = buildFf1GbaSample();
  assert.equal(d.length, SRAM_SIZE);
  assert.deepEqual(detectGames(d).map((m) => m.module.id), ['final-fantasy-gba']);
  const opened = await openSave(d);
  const s = opened!.save as Ff1GbaSave;
  assert.deepEqual(s.usedFiles.map((f) => f.number), [1]);
  assert.deepEqual(s.files[0].party.map((c) => c.name), ['Brom', 'Wren', 'Ivy', 'Oren']);
  assert.deepEqual(s.serialize(), d);
});

test('sample: every character can wear their gear and know their spells', () => {
  for (const c of new Ff1GbaSave(buildFf1GbaSample()).files[0].party) {
    for (let g = 0; g < 5; g++) if (c.gear(g)) assert.ok(c.canWear(g, c.gear(g)), `${c.name} gear ${g}`);
    for (const sp of c.spells) assert.ok(canLearn(c.cls, sp), `${c.name} ${SPELLS[sp - 1]}`);
  }
});

test('edits redo the file checksum', () => {
  const s = new Ff1GbaSave(buildFf1GbaSample());
  const f = s.files[0];
  f.gil = 123_456;
  f.party[0].name = 'Cid';
  f.party[0].level = 50;
  f.party[1].ailment = 2;
  f.party[2].setStat('int', 99);
  f.setCount('item', 1, 99);
  f.setCount('weapon', WEAPONS.indexOf('Excalibur') + 1, 1);
  f.setKeyItem(KEY_ITEMS.indexOf('Oxyale') + 1, true);
  f.setKeyItem(KEY_ITEMS.indexOf('Lute') + 1, false);
  const out = s.serialize();
  assert.equal(storedChecksum(out, FF1.base), checksum(out, FF1.base, FF1.size));
  assert.ok(fileOk(out, FF1, 0));
  const again = new Ff1GbaSave(out).files[0];
  assert.equal(again.gil, 123_456);
  assert.equal(again.party[0].name, 'Cid');
  assert.equal(again.party[0].level, 50);
  assert.equal(again.party[1].ailment, 2);
  assert.equal(again.party[2].stat('int'), 99);
  assert.equal(again.count('item', 1), 99);
  assert.equal(again.count('weapon', WEAPONS.indexOf('Excalibur') + 1), 1);
  assert.ok(again.hasKeyItem(KEY_ITEMS.indexOf('Oxyale') + 1));
  assert.ok(!again.hasKeyItem(1));
});

test('key items: id 1 is the top bit of +0x747, counting down (checked in the game)', () => {
  const s = new Ff1GbaSave(buildFf1GbaSample());
  const f = s.files[0];
  for (let k = 1; k <= 36; k++) f.setKeyItem(k, false);
  f.setKeyItem(1, true); f.setKeyItem(17, true); f.setKeyItem(36, true);
  const at = FF1.base;
  assert.equal(s.data[at + 0x747], 0x80);
  assert.equal(s.data[at + 0x745], 0x80);
  assert.equal(s.data[at + 0x743], 0x10);
});

test('orbs: one story flag each, the same bits as the WonderSwan game (checked in the game)', () => {
  const s = new Ff1GbaSave(buildFf1GbaSample());
  const f = s.files[0];
  const at = f.at;
  for (let i = 0; i < 4; i++) f.setOrb(i, false);
  const before = [...s.data.subarray(at + 0x72a, at + 0x72d)];
  f.setOrb(ORB_NAMES.indexOf('Fire'), true);
  f.setOrb(ORB_NAMES.indexOf('Water'), true);
  const out = s.serialize();
  assert.ok(fileOk(out, FF1, 0));
  assert.equal(out[at + 0x72a], before[0] | 0x08);
  assert.equal(out[at + 0x72b], before[1] | 0x20);
  assert.equal(out[at + 0x72c], before[2]);
  const again = new Ff1GbaSave(out).files[0];
  assert.deepEqual(ORB_NAMES.map((_, i) => again.orbLit(i)), [true, false, false, true]);
});

test('the bag keeps the fourth byte of every cell', () => {
  const d = buildFf1GbaSample();
  for (let i = 0; i < 178; i++) d[FF1.base + 0x144 + i * 4 + 3] = (i * 37) & 0xff;
  writeChecksum(d, FF1.base, FF1.size);
  const s = new Ff1GbaSave(d);
  const f = s.files[0];
  f.setCount('item', 1, 0);
  f.setCount('armor', ARMOR.indexOf('Ribbon') + 1, 4);
  for (let i = 0; i < 178; i++) assert.equal(s.data[FF1.base + 0x144 + i * 4 + 3], (i * 37) & 0xff);
  assert.equal(f.count('item', 1), 0);
  assert.equal(f.count('armor', ARMOR.indexOf('Ribbon') + 1), 4);
});

test('a KO character has 0 HP, and reviving gives 1', () => {
  const c = new Ff1GbaSave(buildFf1GbaSample()).files[0].party[0];
  c.ailment = 1;
  assert.equal(c.hp, 0);
  c.ailment = 0;
  assert.equal(c.hp, 1);
  c.ailment = 1;
  c.restore();
  assert.equal(c.ailment, 0);
  assert.equal(c.hp, c.maxHp);
});

test('magic: three places per spell level, as the magic menu shows them (checked in the game)', () => {
  const s = new Ff1GbaSave(buildFf1GbaSample());
  const c = s.files[0].party[3]; // Black Mage, levels 1-4 full
  const at = FF1.base + 0x22 + 3 * 0x48 + 0x2f;
  const places = () => [...s.data.subarray(at, at + 24)];
  places().forEach((sp, i) => { if (sp) assert.equal(spellLevel(sp), Math.floor(i / 3) + 1, SPELLS[sp - 1]); });
  assert.equal(c.setKnows(SPELLS.indexOf('Flare') + 1, true), true);
  assert.equal(places()[21], SPELLS.indexOf('Flare') + 1);
  assert.equal(c.setKnows(SPELLS.indexOf('Focus') + 1, true), false); // level 1 is full
  assert.equal(c.setKnows(SPELLS.indexOf('Sleep') + 1, false), true);
  assert.equal(places()[1], 0);
  assert.equal(c.setKnows(SPELLS.indexOf('Focus') + 1, true), true);
  assert.equal(places()[1], SPELLS.indexOf('Focus') + 1);
});

test('names are full-width letters and digits', () => {
  assert.equal(asSaved('Cid Highwind!'), 'CidHig');
  const s = new Ff1GbaSave(buildFf1GbaSample());
  s.files[0].party[0].name = 'Ab3';
  const at = FF1.base + 0x22 + 2;
  assert.deepEqual([...s.data.subarray(at, at + 8)], [0x82, 0x60, 0x82, 0x82, 0x82, 0x52, 0, 0]);
});

test('armor goes in the right slot', () => {
  for (const [name, slot] of [['Clothes', 2], ['Genji Armor', 2], ['Leather Shield', 0], ['Ribbon', 1], ['Genji Gloves', 3]] as const) {
    assert.equal(ARMOR_SLOT[ARMOR.indexOf(name)], slot, name);
  }
});

test('other files are not taken; a save without Final Fantasy I files says so', () => {
  assert.equal(detectDawnOfSouls(new Uint8Array(SRAM_SIZE)), null);
  const d = buildFf1GbaSample();
  d[FF1.base + 0x100] ^= 1; // breaks File 1's checksum
  assert.equal(detectDawnOfSouls(d), 'empty');
  assert.throws(() => new Ff1GbaSave(d), /no Final Fantasy I files/);
});

test('diff names what changed', () => {
  const before = new Ff1GbaSave(buildFf1GbaSample());
  const after = new Ff1GbaSave(buildFf1GbaSample());
  after.files[0].party[0].level = 30;
  after.files[0].setKeyItem(KEY_ITEMS.indexOf('Chime') + 1, true);
  const lines = after.describeChanges(before).flatMap((g) => [g.title, ...g.lines]);
  assert.ok(lines.includes('Level: 24 → 30'));
  assert.ok(lines.includes('Chime: added'));
});

// Real saves are never committed. DOS_SAVE=<file> runs these on one (a .sav, or a .sps from a phone).
const real = process.env.DOS_SAVE;
test('a real save opens, its gear and spells fit the tables, and it round-trips', { skip: !real || !existsSync(real) }, () => {
  const d = unwrapSave(new Uint8Array(readFileSync(real!))).data;
  if (detectDawnOfSouls(d, 1) !== 'ok') return; // only Final Fantasy II files
  const s = new Ff1GbaSave(d);
  for (const f of s.usedFiles) for (const c of f.party) {
    for (let g = 0; g < 5; g++) if (c.gear(g)) assert.ok(c.canWear(g, c.gear(g)), `${c.name} gear ${g}`);
    for (const sp of c.spells) assert.ok(canLearn(c.cls, sp), `${c.name} ${SPELLS[sp - 1]}`);
  }
  assert.deepEqual(s.serialize(), d);
});
