import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_SIZE, detectFf2Nes, slotBase, slotOk, slotSum } from '../src/core/ff2nes/layout.ts';
import { buildFf2NesSample } from '../src/core/ff2nes/sample.ts';
import { EMPTY_HAND, Ff2NesSave, ITEMS, KEY_TERMS, SPELLS, SPELL_SLOTS, WEAPON_SKILLS } from '../src/core/ff2nes/save.ts';
import { asSaved } from '../src/core/ff2nes/text.ts';
import { detectGames, openSave } from '../src/core/registry.ts';

test('sample: opens as Final Fantasy II (Famicom) only and round-trips', async () => {
  const d = buildFf2NesSample();
  assert.equal(d.length, SAVE_SIZE);
  assert.ok(slotOk(d, 0));
  assert.equal(detectFf2Nes(d), 'ok');
  assert.deepEqual(detectGames(d).map((m) => m.module.id), ['final-fantasy-2-nes']);
  const s = (await openSave(d))!.save as Ff2NesSave;
  const slot = s.usedSlots[0];
  assert.deepEqual(slot.party.map((c) => c.name), ['Firion', 'Maria', 'Guy', 'Minwu']);
  assert.deepEqual(slot.party.map((c) => c.portrait), ['firion', 'maria', 'guy', 'minwu']);
  assert.equal(slot.gil, 18_350);
  assert.ok(slot.hasKey(1));
  assert.deepEqual(s.serialize(), d);
});

test('a slot that fails the check: detected as damaged, not opened', () => {
  const d = buildFf2NesSample();
  d[slotBase(0) + 0x20] ^= 1;
  assert.equal(detectFf2Nes(d), 'bad-checksum');
  assert.throws(() => new Ff2NesSave(d));
  assert.equal(detectFf2Nes(new Uint8Array(SAVE_SIZE)), null);
});

test('edits read back and serialize() makes the slot add up to $FF again', () => {
  const s = new Ff2NesSave(buildFf2NesSample());
  const slot = s.usedSlots[0];
  const [firion, maria] = slot.party;
  firion.name = 'Kaito 9!';
  assert.equal(firion.name, 'Kaito');
  assert.equal(asSaved('Lé on'), 'Lon');
  firion.maxHp = 9999; firion.hp = 9999;
  firion.setStat('str', 99);
  assert.equal(firion.stat('str'), 99);
  firion.setSkillLevel(WEAPON_SKILLS.indexOf('Sword'), 16);
  assert.equal(firion.skill(3).level, 16);
  firion.setGear(0, ITEMS.indexOf('Masamune'));
  firion.setGear(1, EMPTY_HAND);
  assert.equal(firion.gear(0), ITEMS.indexOf('Masamune'));
  assert.ok(firion.isEmpty(1));
  maria.learn(SPELLS.indexOf('Ultima') + 1);
  maria.setSpellLevel(SPELLS.indexOf('Ultima') + 1, 16);
  assert.ok(maria.spells.some((x) => x.id === 40 && x.level === 16));
  for (let i = 1; i <= SPELL_SLOTS + 2; i++) maria.learn(i);
  assert.equal(maria.spells.length, SPELL_SLOTS);
  slot.gil = 99_999_999;
  assert.equal(slot.gil, 9_999_999);
  while (slot.add(ITEMS.indexOf('Elixir')));
  assert.equal(slot.free, 0);
  assert.equal(slot.add(ITEMS.indexOf('Potion')), false);
  assert.equal(slot.add(1), false, 'key items are not added to the bag');
  const out = s.serialize();
  assert.equal(slotSum(out, slotBase(0)), 0xff);
  const again = new Ff2NesSave(out);
  assert.equal(again.usedSlots[0].party[0].name, 'Kaito');
  assert.equal(again.usedSlots[0].count(ITEMS.indexOf('Elixir')), 24);
  const changes = again.describeChanges(new Ff2NesSave(buildFf2NesSample())).flatMap((g) => g.lines);
  assert.ok(changes.includes('Name: Firion → Kaito'));
  assert.ok(changes.includes('Gil: 18,350 → 9,999,999'));
});

test('the fourth place is empty when nobody travels with the heroes', () => {
  const d = buildFf2NesSample();
  d[slotBase(0) + 0x200 + 3 * 0x40 + 0x35] = 0x80;
  d[slotBase(0) + 0x2ff] = 0; d[slotBase(0) + 0x2ff] = slotSum(d, slotBase(0)) ^ 0xff;
  assert.deepEqual(new Ff2NesSave(d).usedSlots[0].party.map((c) => c.name), ['Firion', 'Maria', 'Guy']);
});

test('key terms: a new one goes first, a forgotten one closes up, stored as 0xF0 + its number', () => {
  const s = new Ff2NesSave(buildFf2NesSample());
  const slot = s.usedSlots[0];
  const at = slotBase(0) + 0x80;
  assert.deepEqual(slot.keyTerms.learned.map((k) => KEY_TERMS[k - 1]), ['Mythril', 'Wild Rose']);
  slot.keyTerms.set(KEY_TERMS.indexOf('Dreadnought') + 1, true);
  slot.keyTerms.set(KEY_TERMS.indexOf('Wild Rose') + 1, false);
  slot.keyTerms.set(KEY_TERMS.indexOf('Mythril') + 1, true); // already known: stays where it is
  const out = s.serialize();
  assert.ok(slotOk(out, 0));
  assert.deepEqual([...out.subarray(at, at + 4)], [0xf3, 0xf2, 0, 0]);
  const changes = new Ff2NesSave(out).describeChanges(new Ff2NesSave(buildFf2NesSample())).flatMap((g) => g.lines);
  assert.ok(changes.includes('Dreadnought: learned') && changes.includes('Wild Rose: forgotten'), changes.join('\n'));
  KEY_TERMS.forEach((_, k) => slot.keyTerms.set(k + 1, true));
  assert.equal(slot.keyTerms.learned.length, 15);
  assert.equal(slot.keyTerms.learned[0], 15);
  assert.equal(s.serialize()[at + 15], 0, 'the 16th place stays empty');
});
