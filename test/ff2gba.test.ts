import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { unwrapSave } from '../src/core/container.ts';
import { FF2, SRAM_SIZE, checksum, detectDawnOfSouls, fileOk, storedChecksum, writeChecksum } from '../src/core/ff1gba/layout.ts';
import { buildFf1GbaSample } from '../src/core/ff1gba/sample.ts';
import { buildFf2GbaSample } from '../src/core/ff2gba/sample.ts';
import { EMPTY_HAND, Ff2GbaSave, KEY_TERMS, SPELL_SLOTS, asSaved } from '../src/core/ff2gba/save.ts';
import { ITEMS, SPELLS } from '../src/core/ff2gba/tables.ts';
import { detectGames, openSave } from '../src/core/registry.ts';

const item = (n: string) => ITEMS.indexOf(n);
const spell = (n: string) => SPELLS.indexOf(n) + 1;

test('sample: opens as Final Fantasy II and round-trips', async () => {
  const d = buildFf2GbaSample();
  assert.equal(d.length, SRAM_SIZE);
  assert.deepEqual(detectGames(d).map((m) => m.module.id), ['final-fantasy-2-gba']);
  const s = (await openSave(d))!.save as Ff2GbaSave;
  const f = s.usedFiles[0];
  assert.deepEqual(f.party.map((c) => c.name), ['Firion', 'Maria', 'Guy', 'Minwu']);
  assert.deepEqual(f.party.map((c) => c.portrait), ['firion', 'maria', 'guy', 'minwu']);
  assert.deepEqual(s.serialize(), d);
});

test('a save with both games offers both; one with only Final Fantasy I files offers that', () => {
  const both = buildFf1GbaSample();
  both.set(buildFf2GbaSample().subarray(FF2.base, FF2.base + FF2.size), FF2.base);
  assert.deepEqual(detectGames(both).map((m) => m.module.id).sort(), ['final-fantasy-2-gba', 'final-fantasy-gba']);
  assert.deepEqual(detectGames(buildFf1GbaSample()).map((m) => m.module.id), ['final-fantasy-gba']);
  assert.equal(detectDawnOfSouls(buildFf2GbaSample(), 1), null);
});

test('edits redo the file checksum and read back', () => {
  const s = new Ff2GbaSave(buildFf2GbaSample());
  const f = s.usedFiles[0];
  const [firion, maria] = f.party;
  firion.name = 'Kaito';
  firion.maxHp = 9999; firion.hp = 9999;
  firion.setStat('str', 99);
  firion.setSkillLevel(2, 16);
  firion.setGear(0, item('Masamune'));
  firion.setGear(1, 0);
  firion.setSpellLevel(spell('Fire'), 16);
  assert.ok(firion.learn(spell('Ultima')));
  maria.forget(spell('Blizzard'));
  f.gil = 777_777;
  f.setCount(item('Elixir'), 9);
  f.setCount(item('Potion'), 0);
  const out = s.serialize();
  assert.equal(storedChecksum(out, FF2.base), checksum(out, FF2.base, FF2.size));
  assert.ok(fileOk(out, FF2, 0));
  const a = new Ff2GbaSave(out).usedFiles[0];
  assert.equal(a.party[0].name, 'Kaito');
  assert.equal(a.party[0].hp, 9999);
  assert.equal(a.party[0].stat('str'), 99);
  assert.equal(a.party[0].skill(2).level, 16);
  assert.equal(a.party[0].gear(0), item('Masamune'));
  assert.equal(a.party[0].gear(1), EMPTY_HAND);
  assert.equal(a.party[0].spells.find((x) => x.id === spell('Fire'))!.level, 16);
  assert.ok(a.party[0].knows(spell('Ultima')));
  assert.ok(!a.party[1].knows(spell('Blizzard')));
  assert.equal(a.gil, 777_777);
  assert.equal(a.count(item('Elixir')), 9);
  assert.equal(a.count(item('Potion')), 0);
});

test('a stat change moves the with-gear copy by the same amount', () => {
  const s = new Ff2GbaSave(buildFf2GbaSample());
  const at = FF2.base + 0x22 + 0x2c; // Firion's strength with gear
  s.data[at] += 10;
  const c = s.usedFiles[0].party[0];
  c.setStat('str', c.stat('str') + 5);
  assert.equal(s.data[at], 24 + 10 + 5);
});

test('spells: 16 places, a forgotten one leaves room', () => {
  const c = new Ff2GbaSave(buildFf2GbaSample()).usedFiles[0].party[3];
  for (let id = 1; id <= SPELLS.length; id++) c.learn(id);
  assert.equal(c.spells.length, SPELL_SLOTS);
  const missing = SPELLS.findIndex((_, i) => !c.knows(i + 1)) + 1;
  assert.equal(c.learn(missing), false);
  c.forget(spell('Cure'));
  assert.ok(c.learn(missing));
  assert.equal(c.spells.find((x) => x.id === missing)!.level, 1);
});

test('gear only goes where it fits; the fourth place follows the save', () => {
  const s = new Ff2GbaSave(buildFf2GbaSample());
  const c = s.usedFiles[0].party[0];
  c.setGear(2, item('Knight\'s Armor')); // armor on the head: refused
  assert.equal(c.gear(2), item('Leather Cap'));
  c.setGear(1, item('Aegis Shield'));
  assert.equal(c.gear(1), item('Aegis Shield'));
  s.data[FF2.base + 0x4b2] = 0xff;
  assert.equal(s.usedFiles[0].party.length, 3);
});

test('names, and the diff', () => {
  assert.equal(asSaved('Leon Highwind'), 'LeonHi');
  const before = new Ff2GbaSave(buildFf2GbaSample());
  const after = new Ff2GbaSave(buildFf2GbaSample());
  after.usedFiles[0].party[2].setSkillLevel(4, 9);
  after.usedFiles[0].party[2].learn(spell('Haste'));
  const lines = after.describeChanges(before).flatMap((g) => [g.title, ...g.lines]);
  assert.ok(lines.includes('Axe skill: 6 → 9'), lines.join('\n'));
  assert.ok(lines.includes('Learned Haste (level 1)'));
});

test('the fourth member: the guest byte names a record, 0x0F nobody, and Leon gets the name typed for him', () => {
  const s = new Ff2GbaSave(buildFf2GbaSample());
  const f = s.usedFiles[0];
  assert.equal(f.guest, 3);
  assert.ok(f.canPickGuest);
  f.setGuest(8);
  assert.deepEqual(f.party.map((c) => c.name), ['Firion', 'Maria', 'Guy', 'Leon']);
  assert.equal(f.party[3].portrait, 'leon');
  f.setGuest(null);
  const out = s.serialize();
  assert.equal(out[FF2.base + 0x4b2], 0x0f);
  assert.ok(fileOk(out, FF2, 0));
  assert.equal(new Ff2GbaSave(out).usedFiles[0].party.length, 3);
  f.setGuest(8);
  const lines = new Ff2GbaSave(s.serialize()).describeChanges(new Ff2GbaSave(buildFf2GbaSample())).flatMap((g) => g.lines);
  assert.deepEqual(lines, ['Fourth member: Minwu → Leon']);
});

test('a six-letter name gets the zero that ends it, over whatever was left after the old name', () => {
  const d = buildFf2GbaSample();
  const file = FF2.base, leon = file + 0x22 + 8 * 0x80, maria = file + 0x22 + 0x80;
  for (let i = 0; i < 16; i += 2) d.set([0xff, 0x80], leon + 4 + i); // Leon's record before he joins, as real saves have it
  d.set([0x82, 0x6b, 0x82, 0x85, 0x82, 0x8f, 0x82, 0x8e, 0x82, 0x88, 0x82, 0x81, 0, 0x82], file + 0x700); // "Leonha"
  d[maria + 0x10] = 0x66; // left over from a longer name
  writeChecksum(d, file, FF2.size);
  const s = new Ff2GbaSave(d);
  const f = s.usedFiles[0];
  f.setGuest(8);
  assert.equal(f.party[3].name, 'Leonha');
  assert.equal(s.data[leon + 0x10], 0);
  f.characters[1].name = 'Abcdef';
  assert.equal(s.data[maria + 0x10], 0);
});

test('key terms: a new one goes first, a forgotten one closes up, and the count follows', () => {
  const s = new Ff2GbaSave(buildFf2GbaSample());
  const f = s.usedFiles[0];
  assert.deepEqual(f.keyTerms!.learned.map((k) => KEY_TERMS[k - 1]), ['Mythril', 'Wild Rose']);
  f.keyTerms!.set(KEY_TERMS.indexOf('Sunfire') + 1, true);
  f.keyTerms!.set(KEY_TERMS.indexOf('Mythril') + 1, false);
  const out = s.serialize();
  assert.ok(fileOk(out, FF2, 0));
  assert.deepEqual([...out.subarray(FF2.base + 0x6cc, FF2.base + 0x6cf)], [7, 1, 0]);
  assert.equal(out[FF2.base + 0x6ff], 2);
  const changes = new Ff2GbaSave(out).describeChanges(new Ff2GbaSave(buildFf2GbaSample())).flatMap((g) => g.lines);
  assert.ok(changes.includes('Sunfire: learned') && changes.includes('Mythril: forgotten'), changes.join('\n'));
});

// Real saves are never committed. DOS_SAVE=<file> runs this on one (a .sav, or a .sps from a phone).
const real = process.env.DOS_SAVE;
test('a real save with Final Fantasy II files opens and round-trips', { skip: !real || !existsSync(real) }, () => {
  const d = unwrapSave(new Uint8Array(readFileSync(real!))).data;
  if (detectDawnOfSouls(d, 2) !== 'ok') return;
  const s = new Ff2GbaSave(d);
  for (const f of s.usedFiles) for (const c of f.characters) for (let g = 0; g < 5; g++) assert.ok(ITEMS[c.gear(g)] !== undefined);
  assert.deepEqual(s.serialize(), d);
});
