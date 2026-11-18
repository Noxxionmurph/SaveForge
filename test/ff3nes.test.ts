import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_SIZE, detectFf3Nes, slotBase, slotOk, slotSum } from '../src/core/ff3nes/layout.ts';
import { buildFf3NesSample } from '../src/core/ff3nes/sample.ts';
import {
  Ff3NesSave, ITEMS, JOBS, KIND, MAX_GIL, QUIVER, canEquip, expFor, growth, levelFor, minLevel, spellLevel, spellsOfLevel,
} from '../src/core/ff3nes/save.ts';
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
  for (const c of slot.party) {
    assert.equal(levelFor(c.exp), c.level, `${c.name}'s exp fits the level`);
    assert.deepEqual(['str', 'agi', 'vit', 'int', 'spi'].map((k) => c.stat(k as 'str')), growth(c.job, c.level).stats);
  }
  assert.deepEqual(s.serialize(), d);
});

test('job numbers, levels and who can equip what come from the game', () => {
  assert.deepEqual(growth(0, 1), { stats: [5, 5, 5, 5, 5], maxMp: [0, 0, 0, 0, 0, 0, 0, 0] });
  assert.deepEqual(growth(JOBS.indexOf('Sage'), 1).maxMp, [20, 15, 10, 5, 4, 3, 2, 1]);
  assert.deepEqual(growth(JOBS.indexOf('Fighter'), 12).stats, [18, 18, 10, 5, 6]);
  assert.ok(growth(JOBS.indexOf('Ninja'), 99).stats.every((v) => v <= 99));
  assert.equal(expFor(1), 0);
  assert.equal(expFor(2), 16);
  assert.equal(expFor(99), 9_999_682);
  assert.equal(levelFor(15), 1);
  assert.equal(levelFor(16), 2);
  assert.equal(levelFor(9_999_999), 99);
  assert.equal(minLevel(JOBS.indexOf('Knight')), 10);
  assert.equal(minLevel(JOBS.indexOf('Ninja')), 40);
  const job = (n: string) => JOBS.indexOf(n);
  const item = (n: string) => ITEMS.indexOf(n);
  assert.ok(canEquip(job('Onion Kid'), item('Onion Sword')));
  assert.ok(!canEquip(job('Ninja'), item('Onion Sword')));
  assert.ok(JOBS.every((_, j) => canEquip(j, item('Ribbon'))));
  assert.deepEqual(JOBS.filter((_, j) => canEquip(j, item('Flare'))), ['Warlock', 'Sage']);
  assert.ok(canEquip(job('White Wizard'), item('Cure')) && !canEquip(job('Black Wizard'), item('Cure')));
});

test('level and exp stay in step, and stats follow the level', () => {
  const luneth = new Ff3NesSave(buildFf3NesSample()).usedSlots[0].party[0];
  luneth.level = 20;
  assert.equal(luneth.exp, expFor(20));
  assert.deepEqual(luneth.stat('str'), growth(1, 20).stats[0]);
  luneth.exp = expFor(30) + 5;
  assert.equal(luneth.level, 30);
  assert.equal(luneth.stat('agi'), growth(1, 30).stats[1]);
  luneth.exp = 0;
  assert.equal(luneth.level, 1);
  assert.equal(luneth.stat('str'), 10, 'a level 1 Fighter has the job’s own strength');
});

test('changing jobs works as the Job menu does, and gear the new job can’t use goes to the bag', () => {
  const s = new Ff3NesSave(buildFf3NesSample());
  const slot = s.usedSlots[0];
  const [luneth, arc] = slot.party;
  const ninja = JOBS.indexOf('Ninja'), blackWizard = JOBS.indexOf('Black Wizard'), sage = JOBS.indexOf('Sage');
  assert.ok(luneth.canBecome(blackWizard, slot.jobsOpen));
  assert.ok(!luneth.canBecome(ninja, slot.jobsOpen), 'the Eureka jobs are not open yet');
  slot.setCrystal(4, true);
  assert.equal(slot.crystals, 5, 'opening the last crystal opens the ones before it');
  assert.ok(!luneth.canBecome(ninja, slot.jobsOpen), 'Ninjas start at level 40');
  luneth.level = 40;
  assert.ok(luneth.canBecome(ninja, slot.jobsOpen));
  slot.setCrystal(1, false);
  assert.deepEqual(slot.jobsOpen, [0, 1, 2, 3, 4, 5], 'closing Fire closes everything after it');
  slot.setCrystal(4, true);

  const moved = luneth.changeJob(blackWizard, slot);
  assert.deepEqual(moved.map((id) => ITEMS[id]), ['Long Sword', 'Leather Shield']);
  assert.equal(luneth.jobName, 'Black Wizard');
  assert.equal(ITEMS[luneth.gear(2)], 'Leather Helm', 'a Black Wizard can keep the helmet');
  assert.equal(luneth.gear(0), 0);
  assert.equal(slot.count(ITEMS.indexOf('Long Sword')), 1);
  assert.deepEqual(['str', 'agi', 'vit', 'int', 'spi'].map((k) => luneth.stat(k as 'str')), growth(blackWizard, 40).stats);
  assert.equal(luneth.maxMp(1), growth(blackWizard, 40).maxMp[0]);
  assert.equal(luneth.jobLevel(blackWizard), 1);
  assert.equal(luneth.jobLevel(1), 6, 'the Fighter job level is put by');
  luneth.changeJob(1, slot);
  assert.equal(luneth.jobLevel(1), 6, 'and taken out again');

  arc.level = 40;
  arc.changeJob(sage, slot);
  assert.ok(arc.learn(ITEMS.indexOf('Sight')));
  assert.equal(arc.learn(ITEMS.indexOf('Fire')), false, 'level 1 already holds three');
  assert.ok(arc.learn(ITEMS.indexOf('Flare')));
  // The level byte for level 8 is $620E: the last of the eight.
  assert.equal(s.data[slotBase(0) + 0x200 + 1 * 0x40 + 0x0e], 0x01);
  const out = new Ff3NesSave(s.serialize());
  assert.equal(out.usedSlots[0].party[1].jobName, 'Sage');
});

test('gear: only what the job can wear, hands that pair, arrows by the quiver', () => {
  const s = new Ff3NesSave(buildFf3NesSample());
  const luneth = s.usedSlots[0].party[0];
  const item = (n: string) => ITEMS.indexOf(n);
  assert.equal(luneth.setGear(0, item('Masamune')), false, 'Fighters can’t use katanas');
  assert.equal(luneth.setGear(2, item('Potion')), false, 'a potion is not a helmet');
  assert.equal(ITEMS[luneth.gear(2)], 'Leather Helm');
  assert.equal(luneth.arrows(0), 1, 'a sword counts as one');
  assert.ok(luneth.setGear(0, item('Bow')));
  assert.equal(luneth.gear(1), 0, 'a bow doesn’t go with a shield');
  assert.ok(luneth.setGear(1, item('Iron Arrow')));
  assert.equal(luneth.arrows(1), QUIVER);
  luneth.setArrows(1, 99);
  assert.equal(luneth.arrows(1), 99);
  assert.ok(luneth.setGear(0, item('Long Sword')));
  assert.equal(luneth.gear(1), 0, 'nor arrows with a sword');
  assert.ok(luneth.setGear(4, item('Power Ring')));
  assert.equal(luneth.wornStat('str'), luneth.stat('str') + 5);
  luneth.setStat('str', 97);
  assert.equal(luneth.wornStat('str'), 99);
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

test('spells: seven a level from Flare down to Chocobo, only what the job can learn', () => {
  assert.equal(spellLevel(0xc8), 8);
  assert.equal(spellLevel(0xff), 1);
  assert.deepEqual(spellsOfLevel(1).map((id) => ITEMS[id]), ['Fire', 'Ice', 'Sleep', 'Cure', 'Pure', 'Sight', 'Chocb']);
  assert.deepEqual(spellsOfLevel(8).map((id) => ITEMS[id]), ['Flare', 'Death', 'Meteo', 'WWind', 'Life2', 'Holy', 'Baham']);
  const s = new Ff3NesSave(buildFf3NesSample());
  const refia = s.usedSlots[0].party[2];
  assert.deepEqual(refia.spellsAt(1).map((id) => ITEMS[id]), ['Fire', 'Ice']);
  assert.equal(refia.learn(ITEMS.indexOf('Cure')), false, 'Black Wizards can’t learn white magic');
  assert.equal(refia.learn(ITEMS.indexOf('Flare')), false, 'nor Flare');
  assert.ok(refia.learn(ITEMS.indexOf('Sleep')));
  refia.forget(ITEMS.indexOf('Ice'));
  assert.deepEqual(refia.spellsAt(1).map((id) => ITEMS[id]), ['Fire', 'Sleep']);
});

test('edits read back and serialize() makes the slot add up to $FF again', () => {
  const s = new Ff3NesSave(buildFf3NesSample());
  const slot = s.usedSlots[0];
  const [luneth, arc] = slot.party;
  luneth.name = 'Kaito 9!';
  assert.equal(luneth.name, 'Kaito');
  assert.equal(asSaved('Lé on'), 'L on');
  assert.equal(asSaved('Phillip'), 'Phillip', 'the il, li and ll tiles squeeze a seventh letter in');
  assert.equal(asSaved("O'Neil!"), "O'Neil!");
  assert.equal(asSaved('Abcdefgh'), 'Abcdef');
  luneth.level = 120;
  assert.equal(luneth.level, 99);
  luneth.maxHp = 9999; luneth.hp = 9999;
  luneth.setStat('str', 99);
  assert.equal(luneth.stat('str'), 99);
  luneth.setJobLevel(1, 99);
  luneth.setJobLevel(JOBS.indexOf('Ninja'), 40);
  assert.equal(luneth.jobLevel(1), 99);
  assert.equal(luneth.jobLevel(21), 40);
  assert.ok(luneth.setGear(0, ITEMS.indexOf('King Sword')));
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
  assert.ok(slot.add(ITEMS.indexOf('Magic Key'), 2));
  assert.equal(slot.count(ITEMS.indexOf('Magic Key')), 3, 'Magic Keys are bought and stacked like any item');
  assert.equal(slot.add(ITEMS.indexOf('Horn')), false, 'key items come one at a time, through setKeyItem()');
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
  assert.ok(changes.includes('Jobs from crystals: Wind crystal → Eureka crystal'));
  assert.ok(changes.includes('Right hand: Long Sword → King Sword'));
  assert.ok(changes.includes('Ninja job level: 1 → 40'));
});

test('key items: the ones the Fat Chocobo won’t take (3D/B4C8), given one each in the first empty place (3B/B6F4)', () => {
  assert.deepEqual(KIND.key.map((id) => ITEMS[id]),
    ['Horn', 'Eye', 'Time Gear', 'EurekaKey', 'Wind Fang', 'Fire Fang', 'WaterFang', 'EarthFang', 'Lute', 'Sylx Key']);
  const s = new Ff3NesSave(buildFf3NesSample());
  const slot = s.usedSlots[0];
  const horn = ITEMS.indexOf('Horn'), eye = ITEMS.indexOf('Eye');
  const first = slot.bag.findIndex((x) => !x.id);
  assert.ok(slot.setKeyItem(horn, true));
  assert.ok(slot.setKeyItem(horn, true));
  assert.deepEqual(slot.bag.flatMap((x, i) => (x.id === horn ? [[i, x.qty]] : [])), [[first, 1]], 'one Horn, once');
  assert.ok(slot.setKeyItem(eye, true));
  assert.equal(slot.id(first + 1), eye);
  assert.equal(slot.setKeyItem(ITEMS.indexOf('Potion'), true), false, 'not a key item');
  slot.setStored(horn, 1);
  assert.equal(slot.stored(horn), 0, 'the Fat Chocobo won’t take it');
  slot.setStored(ITEMS.indexOf('Carrot'), 3);
  assert.equal(slot.stored(ITEMS.indexOf('Carrot')), 3, 'but he takes Carrots');
  assert.ok(slot.setKeyItem(horn, false));
  assert.equal(slot.id(first), 0);
  assert.equal(slot.qty(first), 0);
  for (let i = 0; i < 32; i++) if (!slot.id(i)) slot.setAt(i, ITEMS.indexOf('Elixir'), 1);
  assert.equal(slot.setKeyItem(horn, true), false, 'no room in the bag');

  const out = s.serialize();
  assert.equal(slotSum(out, slotBase(0)), 0xff);
  const again = new Ff3NesSave(out).usedSlots[0];
  assert.ok(again.hasKeyItem(eye));
  assert.ok(!again.hasKeyItem(horn));
  const changes = new Ff3NesSave(out).describeChanges(new Ff3NesSave(buildFf3NesSample())).flatMap((g) => g.lines);
  assert.ok(changes.includes('Eye: added'));
  assert.ok(!changes.some((l) => l.startsWith('Horn')));
  const back = new Ff3NesSave(buildFf3NesSample()).describeChanges(new Ff3NesSave(out)).flatMap((g) => g.lines);
  assert.ok(back.includes('Eye: removed'));
});
