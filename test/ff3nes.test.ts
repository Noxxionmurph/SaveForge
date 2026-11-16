import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_SIZE, detectFf3Nes, slotBase, slotOk, slotSum } from '../src/core/ff3nes/layout.ts';
import { buildFf3NesSample } from '../src/core/ff3nes/sample.ts';
import { Ff3NesSave, ITEMS, JOBS, MAX_GIL, spellLevel, spellsOfLevel } from '../src/core/ff3nes/save.ts';
import { asSaved } from '../src/core/ff3nes/text.ts';
import { buildFf1NesSample } from '../src/core/ff1nes/sample.ts';
import { buildFf2NesSample } from '../src/core/ff2nes/sample.ts';
import { detectGames, openSave } from '../src/core/registry.ts';

test('sample: opens as Final Fantasy III (Famicom) only and round-trips', async () => {
  const d = buildFf3NesSample();
  assert.equal(d.length, SAVE_SIZE);
  assert.ok(slotOk(d, 0));
  assert.equal(detectFf3Nes(d), 'ok');
  assert.deepEqual(detectGames(d).map((m) => m.module.id), ['final-fantasy-3-nes']);
  const s = (await openSave(d))!.save as Ff3NesSave;
  assert.equal(s.usedSlots.length, 1);
  const slot = s.usedSlots[0];
  assert.deepEqual(slot.party.map((c) => c.name), ['Luneth', 'Arc', 'Refia', 'Ingus']);
  assert.deepEqual(slot.party.map((c) => c.jobName), ['Fighter', 'White Wizard', 'Black Wizard', 'Monk']);
  assert.deepEqual(slot.party.map((c) => c.level), [12, 11, 11, 12]);
  assert.equal(slot.party[0].jobLevel(1), 6);
  assert.equal(slot.party[0].jobLevel(0), 10);
  assert.equal(slot.gil, 4_820);
  assert.equal(slot.cp, 23);
  assert.deepEqual(slot.jobsOpen, [0, 1, 2, 3, 4, 5]);
  assert.equal(slot.count(0xa6), 14);
  assert.equal(slot.stored(0x58), 2);
  assert.equal(ITEMS[slot.party[0].gear(0)], 'Long Sword');
  assert.deepEqual(slot.party[1].spells.map((id) => ITEMS[id]), ['Cure', 'Pure', 'Aero', 'Cure2']);
  assert.deepEqual(s.serialize(), d);
});

test('the other Famicom Final Fantasy saves are not taken for III, nor III for them', () => {
  assert.ok(!detectGames(buildFf1NesSample()).some((m) => m.module.id === 'final-fantasy-3-nes'));
  assert.ok(!detectGames(buildFf2NesSample()).some((m) => m.module.id === 'final-fantasy-3-nes'));
  assert.equal(detectFf3Nes(new Uint8Array(SAVE_SIZE)), null);
});

test('a slot that fails the check: detected as damaged, not opened', () => {
  const d = buildFf3NesSample();
  d[slotBase(0) + 0x40] ^= 1;
  assert.equal(detectFf3Nes(d), 'bad-checksum');
  assert.throws(() => new Ff3NesSave(d));
});

test('spells: seven a level from Flare down to Chocobo, three known at most', () => {
  assert.equal(spellLevel(0xc8), 8);
  assert.equal(spellLevel(0xff), 1);
  assert.deepEqual(spellsOfLevel(1).map((id) => ITEMS[id]), ['Fire', 'Ice', 'Sleep', 'Cure', 'Pure', 'Sight', 'Chocb']);
  assert.deepEqual(spellsOfLevel(8).map((id) => ITEMS[id]), ['Flare', 'Death', 'Meteo', 'WWind', 'Life2', 'Holy', 'Baham']);
  const s = new Ff3NesSave(buildFf3NesSample());
  const refia = s.usedSlots[0].party[2];
  assert.deepEqual(refia.spellsAt(1).map((id) => ITEMS[id]), ['Fire', 'Ice']);
  assert.ok(refia.learn(ITEMS.indexOf('Sleep')));
  assert.equal(refia.learn(ITEMS.indexOf('Cure')), false, 'level 1 already holds three');
  refia.forget(ITEMS.indexOf('Ice'));
  assert.ok(refia.learn(ITEMS.indexOf('Cure')));
  assert.ok(refia.learn(ITEMS.indexOf('Flare')));
  // The level byte for level 8 is $620E: the last of the eight.
  assert.equal(s.data[slotBase(0) + 0x200 + 2 * 0x40 + 0x0e], 0x01);
});

test('edits read back and serialize() makes the slot add up to $FF again', () => {
  const s = new Ff3NesSave(buildFf3NesSample());
  const slot = s.usedSlots[0];
  const [luneth, arc] = slot.party;
  luneth.name = 'Kaito 9!';
  assert.equal(luneth.name, 'Kaito');
  assert.equal(asSaved('Lé on'), 'Lon');
  luneth.level = 120;
  assert.equal(luneth.level, 99);
  luneth.maxHp = 9999; luneth.hp = 9999;
  luneth.setStat('str', 99);
  assert.equal(luneth.stat('str'), 99);
  luneth.setJobLevel(1, 99);
  luneth.setJobLevel(JOBS.indexOf('Ninja'), 40);
  assert.equal(luneth.jobLevel(1), 99);
  assert.equal(luneth.jobLevel(21), 40);
  luneth.setGear(0, ITEMS.indexOf('Masamune'));
  luneth.setGear(1, ITEMS.indexOf('Yoichi Arrow'));
  assert.equal(luneth.arrows(1), 99);
  luneth.setGear(2, ITEMS.indexOf('Potion'));
  assert.equal(ITEMS[luneth.gear(2)], 'Leather Helm', 'a potion is not a helmet');
  arc.setMaxMp(3, 9); arc.setMp(3, 20);
  assert.equal(arc.mp(3), 9);
  arc.setAilment(0x80, true);
  assert.equal(arc.hp, 0);
  arc.restore();
  assert.ok(!arc.ailing);
  assert.equal(arc.hp, arc.maxHp);
  slot.gil = 99_999_999;
  assert.equal(slot.gil, MAX_GIL);
  slot.cp = 999;
  assert.equal(slot.cp, 255);
  assert.ok(slot.add(ITEMS.indexOf('Elixir'), 120));
  assert.equal(slot.count(ITEMS.indexOf('Elixir')), 99);
  assert.ok(slot.add(ITEMS.indexOf('Potion'), 50));
  assert.equal(slot.count(ITEMS.indexOf('Potion')), 64, 'stacks onto the Potions already there');
  assert.equal(slot.add(ITEMS.indexOf('Magic Key')), false, 'key items are not added to the bag');
  slot.setStored(ITEMS.indexOf('Ribbon'), 4);
  slot.setCrystal(4, true);
  assert.ok(slot.jobsOpen.includes(JOBS.indexOf('Ninja')));
  const out = s.serialize();
  assert.equal(slotSum(out, slotBase(0)), 0xff);
  const again = new Ff3NesSave(out);
  assert.equal(again.usedSlots[0].party[0].name, 'Kaito');
  assert.equal(again.usedSlots[0].stored(ITEMS.indexOf('Ribbon')), 4);
  const changes = again.describeChanges(new Ff3NesSave(buildFf3NesSample())).flatMap((g) => g.lines);
  assert.ok(changes.includes('Name: Luneth → Kaito'));
  assert.ok(changes.includes('Gil: 4,820 → 9,999,999'));
  assert.ok(changes.includes('Fat Chocobo, Ribbon: 0 → 4'));
  assert.ok(changes.includes('Eureka crystal jobs: open'));
  assert.ok(changes.includes('Ninja job level: 1 → 40'));
});
