import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { EMPTY_HAND, ITEMS, KEY_TERMS, SPELLS, SPELL_SLOTS } from '../src/core/ff2nes/save.ts';
import { SAVE_SIZE, detectFf2Wsc, slotBase, slotOk } from '../src/core/ff2wsc/layout.ts';
import { buildFf2WscSample } from '../src/core/ff2wsc/sample.ts';
import { BAG_SIZE, Ff2WscSave, WEAPON_SKILLS } from '../src/core/ff2wsc/save.ts';
import { asSaved } from '../src/core/ff2wsc/text.ts';
import { detectGames, openSave } from '../src/core/registry.ts';

test('sample: opens as Final Fantasy II (WonderSwan Color) only and round-trips', async () => {
  const d = buildFf2WscSample();
  assert.equal(d.length, SAVE_SIZE);
  assert.ok(slotOk(d, 0));
  assert.deepEqual(detectGames(d).map((m) => m.module.id), ['final-fantasy-2-wsc']);
  const s = (await openSave(d))!.save as Ff2WscSave;
  const slot = s.usedSlots[0];
  assert.equal(s.usedSlots.length, 1);
  assert.deepEqual(slot.party.map((c) => c.name), ['Firion', 'Maria', 'Guy']);
  assert.deepEqual(slot.party.map((c) => c.portrait), ['firion', 'maria', 'guy']);
  assert.equal(slot.gil, 18_350);
  assert.equal(slot.party[0].skill(WEAPON_SKILLS.indexOf('Sword')).level, 5);
  assert.deepEqual(slot.party[0].spells.map((x) => [SPELLS[x.id - 1], x.level]), [['Fire', 3], ['Cure', 2]]);
  assert.ok(slot.party[1].isEmpty(1));
  assert.deepEqual(s.serialize(), d);
});

test('a slot that fails the check is reported as damaged', () => {
  const d = buildFf2WscSample();
  d[slotBase(0) + 0x100] ^= 1;
  assert.equal(detectFf2Wsc(d), 'bad-checksum');
  assert.throws(() => new Ff2WscSave(d));
  assert.equal(detectFf2Wsc(new Uint8Array(SAVE_SIZE)), null);
});

test('edits read back and the slot checksum is redone', () => {
  const s = new Ff2WscSave(buildFf2WscSample());
  const slot = s.usedSlots[0];
  const [firion, maria] = slot.party;
  firion.name = 'Kieron 9';
  assert.equal(firion.name, 'Kieron');
  assert.equal(asSaved('Lé on'), 'Lon');
  firion.maxHp = 9999; firion.hp = 9999;
  firion.setStat('str', 99);
  firion.setSkillLevel(WEAPON_SKILLS.indexOf('Sword'), 16);
  firion.setGear(0, ITEMS.indexOf('Masamune'));
  firion.setGear(1, 0);
  assert.equal(firion.gear(1), EMPTY_HAND, 'an empty hand is saved as the Hands item');
  maria.learn(SPELLS.indexOf('Ultima') + 1);
  maria.setSpellLevel(SPELLS.indexOf('Ultima') + 1, 16);
  for (let i = 1; i <= SPELL_SLOTS + 2; i++) maria.learn(i);
  assert.equal(maria.spells.length, SPELL_SLOTS);
  maria.forget(SPELLS.indexOf('Fire') + 1);
  slot.gil = 99_999_999;
  while (slot.add(ITEMS.indexOf('Elixir')));
  assert.equal(slot.count(ITEMS.indexOf('Elixir')) + 8, BAG_SIZE);
  const out = s.serialize();
  assert.ok(slotOk(out, 0));
  const again = new Ff2WscSave(out).usedSlots[0];
  assert.equal(again.party[0].name, 'Kieron');
  assert.equal(again.party[0].hp, 9999);
  assert.equal(again.party[0].stat('str'), 99);
  assert.equal(again.party[0].skill(2).level, 16);
  assert.equal(again.party[0].gear(0), ITEMS.indexOf('Masamune'));
  assert.ok(again.party[1].spells.some((x) => x.id === 40 && x.level === 16));
  assert.equal(again.gil, 9_999_999);
  const changes = new Ff2WscSave(out).describeChanges(new Ff2WscSave(buildFf2WscSample())).flatMap((g) => g.lines);
  assert.ok(changes.includes('Name: Firion → Kieron'), changes.join('\n'));
  assert.ok(changes.includes('Sword skill: 5 → 16'));
  assert.ok(changes.includes('Gil: 18,350 → 9,999,999'));
});

test('the fourth member: slot + 5 names whose record is in the fourth place, 0x0F nobody', () => {
  const s = new Ff2WscSave(buildFf2WscSample());
  const slot = s.usedSlots[0];
  assert.equal(slot.guest, null);
  slot.setGuest(5);
  assert.deepEqual(slot.party.map((c) => c.name), ['Firion', 'Maria', 'Guy', 'Gordon']);
  assert.equal(slot.party[3].portrait, 'gordon');
  slot.party[3].setStat('str', 40);
  const out = s.serialize();
  assert.equal(out[slotBase(0) + 5], 5);
  assert.ok(slotOk(out, 0));
  const lines = new Ff2WscSave(out).describeChanges(new Ff2WscSave(buildFf2WscSample())).flatMap((g) => [g.title, ...g.lines]);
  assert.ok(lines.includes('Fourth member: Nobody → Gordon') && lines.includes('Strength: 22 → 40'), lines.join('\n'));
  slot.setGuest(null);
  assert.equal(s.serialize()[slotBase(0) + 5], 0x0f);
  assert.equal(slot.party.length, 3);
  // Gordon keeps his record, so his edit is still saved and still listed.
  const groups = s.describeChanges(new Ff2WscSave(buildFf2WscSample()));
  assert.deepEqual(groups.find((g) => g.title === 'Gordon')?.lines, ['Strength: 22 → 40']);
});

test('key terms: a new one goes first, a forgotten one closes up, and the count follows', () => {
  const s = new Ff2WscSave(buildFf2WscSample());
  const slot = s.usedSlots[0];
  const at = slotBase(0);
  assert.deepEqual(slot.keyTerms.learned.map((k) => KEY_TERMS[k - 1]), ['Mythril', 'Wild Rose']);
  slot.keyTerms.set(KEY_TERMS.indexOf('Ekmet Teloess') + 1, true);
  slot.keyTerms.set(KEY_TERMS.indexOf('Wild Rose') + 1, false);
  const out = s.serialize();
  assert.ok(slotOk(out, 0));
  assert.deepEqual([...out.subarray(at + 0x5a6, at + 0x5a9)], [15, 2, 0]);
  assert.equal(out[at + 0x5d3], 2);
  const changes = new Ff2WscSave(out).describeChanges(new Ff2WscSave(buildFf2WscSample())).flatMap((g) => g.lines);
  assert.ok(changes.includes('Ekmet Teloess: learned') && changes.includes('Wild Rose: forgotten'), changes.join('\n'));
  KEY_TERMS.forEach((_, k) => slot.keyTerms.set(k + 1, true));
  assert.equal(s.serialize()[at + 0x5d3], 15);
  KEY_TERMS.forEach((_, k) => slot.keyTerms.set(k + 1, false));
  const none = s.serialize();
  assert.deepEqual([...none.subarray(at + 0x5a6, at + 0x5b6)], new Array(16).fill(0));
  assert.equal(none[at + 0x5d3], 0);
});

// Real saves are never committed. FF2_WSC_SAVE=<file> runs this on one.
const real = process.env.FF2_WSC_SAVE;
test('a real save opens and round-trips', { skip: !real || !existsSync(real) }, () => {
  const d = new Uint8Array(readFileSync(real!));
  const s = new Ff2WscSave(d);
  assert.ok(s.usedSlots[0].party[0].name);
  assert.deepEqual(s.serialize(), d);
});
