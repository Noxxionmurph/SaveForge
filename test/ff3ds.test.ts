import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { unwrapSave } from '../src/core/container.ts';
import { LENGTH, SAVE_SIZE, SLOT_SPACING, detectFf3Ds, slotBase, slotOk, writeChecksum } from '../src/core/ff3ds/layout.ts';
import { buildFf3DsSample } from '../src/core/ff3ds/sample.ts';
import {
  AILMENTS, BAG_SIZE, Ff3DsSave, JOBS, KO, MAX_GIL, STAT_KEYS, canEquip, expFor, growth, itemName, levelFor, pairs, spellLevel, spellsOfLevel,
} from '../src/core/ff3ds/save.ts';
import { ARMOR, ITEMS, SPELLS, WEAPONS } from '../src/core/ff3ds/tables.ts';
import { asSaved } from '../src/core/ff3ds/text.ts';
import { buildFf3NesSample } from '../src/core/ff3nes/sample.ts';
import { buildSampleSave } from '../src/core/gen3/sample.ts';
import { detectGames, openSave } from '../src/core/registry.ts';

const ALL = [...ITEMS, ...WEAPONS, ...ARMOR, ...SPELLS];
const id = (name: string) => ALL.find((x) => x[1] === name)![0];
const job = (name: string) => JOBS.indexOf(name);
const stats = (c: { stat(k: typeof STAT_KEYS[number]): number }) => STAT_KEYS.map((k) => c.stat(k));
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

test('sample: opens as Final Fantasy III (Nintendo DS) only and round-trips', async () => {
  const d = buildFf3DsSample();
  assert.equal(d.length, SAVE_SIZE);
  assert.ok(slotOk(d, 0));
  assert.equal(detectFf3Ds(d), 'ok');
  assert.deepEqual(detectGames(d).map((m) => m.module.id), ['final-fantasy-3-ds']);
  const s = (await openSave(d))!.save as Ff3DsSave;
  assert.deepEqual(s.usedSlots.map((x) => x.label), ['Slot 1']);
  const slot = s.usedSlots[0];
  assert.deepEqual(slot.party.map((c) => c.name), ['Luneth', 'Arc', 'Refia', 'Ingus']);
  assert.deepEqual(slot.party.map((c) => c.jobName), ['Warrior', 'Black Mage', 'White Mage', 'Monk']);
  assert.deepEqual(slot.party.map((c) => c.hero), [0, 1, 2, 3]);
  assert.equal(slot.party[0].jobLevel(job('Warrior')), 6);
  assert.equal(slot.party[0].jobLevel(0), 4);
  assert.equal(slot.gil, 4_820);
  assert.deepEqual(slot.jobsOpen.map((j) => JOBS[j]), ['Freelancer', 'Warrior', 'Monk', 'White Mage', 'Black Mage', 'Red Mage', 'Thief']);
  assert.equal(slot.count(id('Potion')), 14);
  assert.equal(slot.stored(id('Leather Shield')), 2);
  assert.deepEqual(slot.keyItems.map(itemName), ['Folding Canoe']);
  assert.equal(itemName(slot.party[0].gear(0)), 'Longsword');
  assert.equal(slot.party[1].gear(1), 0);
  assert.deepEqual(slot.party[1].spells.map(itemName), ['Fire', 'Blizzard', 'Sleep', 'Thunder']);
  for (const c of slot.party) {
    assert.equal(levelFor(c.exp), c.level, `${c.name}'s exp fits the level`);
    assert.deepEqual(stats(c), growth(c.job, c.level).stats);
  }
  assert.deepEqual(s.serialize(), d);
});

test('stats, MP, experience and who can equip what come from the game', () => {
  // As the real game has them at level 99 (a save, and a job change made in the game).
  assert.deepEqual(growth(job('Onion Knight'), 99), { stats: [99, 99, 99, 99, 99], maxMp: [49, 43, 36, 30, 23, 17, 10, 4] });
  assert.deepEqual(growth(job('Warrior'), 99).stats, [71, 63, 71, 45, 45]);
  assert.deepEqual(growth(job('Thief'), 99).stats, [63, 63, 99, 45, 38]);
  assert.deepEqual(growth(job('Warrior'), 50).maxMp, [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.ok(JOBS.every((_, j) => growth(j, 99).stats.every((v) => v <= 99) && growth(j, 1).stats.every((v) => v >= 1)));
  assert.equal(expFor(1), 0);
  assert.equal(expFor(2), 16);
  assert.equal(expFor(99), 9_999_999);
  assert.equal(levelFor(15), 1);
  assert.equal(levelFor(16), 2);
  assert.equal(levelFor(9_999_999), 99);
  assert.ok(canEquip(job('Onion Knight'), id('Onion Sword')));
  assert.ok(!canEquip(job('Ninja'), id('Onion Sword')));
  assert.ok(JOBS.every((_, j) => canEquip(j, id('Ribbon'))));
  assert.ok(canEquip(job('White Mage'), id('Cure')) && !canEquip(job('Black Mage'), id('Cure')));
  assert.ok(!JOBS.some((_, j) => canEquip(j, id('Shuriken'))), 'shuriken are thrown, never held');
});

test('hands pair as in the Equip menu', () => {
  assert.ok(pairs(id('Longsword'), id('Leather Shield')));
  assert.ok(pairs(id('Leather Shield'), id('Leather Shield')), 'two shields');
  assert.ok(pairs(id('Longsword'), id('Dagger')));
  assert.ok(pairs(id('Bow'), id('Wooden Arrow')) && pairs(id('Wooden Arrow'), id('Bow')));
  assert.ok(!pairs(id('Bow'), id('Leather Shield')));
  assert.ok(!pairs(id('Wooden Arrow'), id('Longsword')));
  assert.ok(!pairs(id('Madhura Harp'), id('Dagger')) && pairs(id('Madhura Harp'), 0));
});

test('level and exp stay in step, and stats and MP follow the level', () => {
  const arc = new Ff3DsSave(buildFf3DsSample()).usedSlots[0].party[1];
  arc.level = 20;
  assert.equal(arc.exp, expFor(20));
  assert.deepEqual(stats(arc), growth(job('Black Mage'), 20).stats);
  assert.equal(arc.maxMp(1), growth(job('Black Mage'), 20).maxMp[0]);
  arc.exp = expFor(30) + 5;
  assert.equal(arc.level, 30);
  arc.exp = 0;
  assert.equal(arc.level, 1);
  assert.ok(arc.mp(1) <= arc.maxMp(1), 'MP stays within the new max');
});

test('changing jobs works as the Job menu does, and gear the new job can’t use goes to the bag', () => {
  const s = new Ff3DsSave(buildFf3DsSample());
  const slot = s.usedSlots[0];
  const luneth = slot.party[0];
  const r = slotBase(0) + 0x70;
  const moved = luneth.changeJob(job('Black Mage'), slot);
  assert.deepEqual(moved.map(itemName), ['Longsword', 'Leather Shield']);
  assert.equal(luneth.jobName, 'Black Mage');
  assert.deepEqual([2, 3, 4].map((g) => itemName(luneth.gear(g))), ['Leather Cap', 'Leather Armor', 'Bronze Bracers'], 'a Black Mage keeps the rest');
  assert.equal(luneth.gear(0), 0);
  assert.equal(slot.count(id('Longsword')), 1);
  assert.equal(slot.count(id('Leather Shield')), 1);
  assert.deepEqual(stats(luneth), growth(job('Black Mage'), 12).stats);
  assert.equal(luneth.maxMp(1), growth(job('Black Mage'), 12).maxMp[0]);
  assert.equal(luneth.wornStat('str'), luneth.stat('str'), 'nothing worn adds to strength now');
  assert.equal(u32(s.data, r + 0x100), job('Warrior'), 'the job before is kept');
  // The Black Mage's battle commands are filled in and put in the battle menu, as the game does.
  assert.deepEqual([...s.data.subarray(r + 0x2d2, r + 0x2d6)], [1, 5, 3, 4]);
  assert.equal(s.data[r + 0x104 + 5 * 0x14 + 8 + 2], 5);
  assert.equal(s.data[r + 0x2e8], 0, 'no battles of getting used to it');
  assert.equal(luneth.jobLevel(job('Warrior')), 6, 'the Warrior job level stays');
  assert.equal(luneth.jobLevel(job('Black Mage')), 1);
  luneth.changeJob(job('Warrior'), slot);
  assert.deepEqual([...s.data.subarray(r + 0x2d2, r + 0x2d6)], [1, 11, 3, 4]);
  const out = new Ff3DsSave(s.serialize());
  assert.equal(out.usedSlots[0].party[0].jobName, 'Warrior');
  assert.equal(out.usedSlots[0].count(id('Longsword')), 1);
});

test('gear: only what the job can wear, hands that pair, arrows by the stack', () => {
  const s = new Ff3DsSave(buildFf3DsSample());
  const slot = s.usedSlots[0];
  const luneth = slot.party[0];
  assert.equal(luneth.setGear(0, id('Staff')), false, 'Warriors can’t use staves');
  assert.equal(luneth.setGear(2, id('Potion')), false, 'a potion is not a helmet');
  assert.equal(luneth.gearCount(0), 1);
  assert.ok(luneth.setGear(0, id('Bow')));
  assert.equal(luneth.gear(1), 0, 'a shield doesn’t go with a bow');
  assert.ok(luneth.setGear(1, id('Wooden Arrow')));
  assert.equal(luneth.gearCount(1), 99);
  luneth.setArrows(1, 40);
  assert.equal(luneth.gearCount(1), 40);
  assert.ok(luneth.setGear(0, id('Longsword')));
  assert.equal(luneth.gear(1), 0, 'nor arrows with a sword');
  assert.ok(luneth.setGear(4, id('Power Bracers')));
  const bracers = ARMOR.find((a) => a[1] === 'Power Bracers')![4];
  assert.equal(luneth.wornStat('str'), Math.min(99, luneth.stat('str') + bracers[0]));
  luneth.setStat('str', 98);
  assert.equal(luneth.wornStat('str'), 99);
});

test('spells: three a level, only what the job can learn', () => {
  assert.equal(spellLevel(id('Cure')), 1);
  assert.equal(spellLevel(id('Bahamur')), 8);
  assert.equal(spellLevel(id('Potion')), 0);
  assert.deepEqual(spellsOfLevel(1).map(itemName), ['Cure', 'Poisona', 'Sight', 'Fire', 'Blizzard', 'Sleep', 'Escape']);
  const refia = new Ff3DsSave(buildFf3DsSample()).usedSlots[0].party[2];
  assert.deepEqual(refia.spellsAt(1).map(itemName), ['Cure', 'Poisona']);
  assert.equal(refia.learn(id('Fire')), false, 'White Mages can’t learn black magic');
  assert.ok(refia.learn(id('Sight')));
  assert.equal(refia.learn(id('Fire')), false);
  refia.forget(id('Cure'));
  assert.deepEqual(refia.spellsAt(1).map(itemName), ['Poisona', 'Sight']);
});

test('ailments: the bits the cure items clear in the game, KO going with 0 HP', () => {
  // In the game: Phoenix Down 01, Gold Needle 02, Maiden's Kiss 04, Echo Herbs 08, Mallet 10, Eye Drops 20, Antidote 40.
  assert.deepEqual(AILMENTS, [[0x01, 'KO'], [0x02, 'Stone'], [0x04, 'Toad'], [0x08, 'Silence'], [0x10, 'Mini'], [0x20, 'Blind'], [0x40, 'Poison']]);
  const d = buildFf3DsSample();
  const at = slotBase(0) + 0x70 + 0x2ec + 0x43; // Arc's ailments
  d[at] = 0x80; // the game's own bookkeeping bit, set after a field cure
  writeChecksum(d, 0);
  const s = new Ff3DsSave(d);
  const arc = s.usedSlots[0].party[1];
  assert.equal(arc.status, 0x80);
  assert.ok(!arc.has(KO));
  arc.setAilment(0x40, true);
  arc.setAilment(0x04, true);
  assert.equal(arc.status, 0xc4);
  arc.setAilment(KO, true);
  assert.equal(arc.hp, 0);
  arc.setAilment(KO, false);
  assert.equal(arc.hp, 1, 'up again with 1 HP');
  assert.ok(!arc.has(KO));
  arc.hp = 0;
  assert.ok(arc.has(KO), '0 HP is KO');
  arc.hp = 50;
  assert.ok(!arc.has(KO));
  arc.setAilment(KO, true);
  arc.restore();
  assert.equal(arc.status, 0x80, 'restoring cures everything and leaves the game’s bit');
  assert.equal(arc.hp, arc.maxHp);
  arc.setAilment(0x02, true);
  const changes = new Ff3DsSave(s.serialize()).describeChanges(new Ff3DsSave(d)).flatMap((g) => g.lines);
  assert.ok(changes.includes('Now Stone'));
  arc.setAilment(0x02, false);
  arc.hp = 0;
  const ko = new Ff3DsSave(s.serialize());
  assert.equal(ko.data[at], 0x81);
  assert.ok(ko.describeChanges(new Ff3DsSave(d)).flatMap((g) => g.lines).includes('Now KO'));
});

test('the bag: stacks of 99, written back only when it changed, empty places dropped then', () => {
  const d = buildFf3DsSample();
  // The game leaves the odd place with a count of 0 behind; put one between two items.
  const bag = slotBase(0) + 0xc28;
  d.copyWithin(bag + 3 * 4, bag + 2 * 4, bag + 7 * 4);
  d.set([0x9d, 0xff, 0, 0], bag + 2 * 4);
  writeChecksum(d, 0);
  const fixed = new Ff3DsSave(d).serialize();
  const s = new Ff3DsSave(fixed);
  assert.deepEqual(s.serialize(), fixed, 'untouched, the bag is left as it was');
  const slot = s.usedSlots[0];
  assert.equal(slot.bag.length, 7);
  assert.ok(slot.add(id('Potion'), 90));
  assert.equal(slot.count(id('Potion')), 99);
  assert.ok(slot.maxElixirs());
  assert.equal(slot.count(id('Elixir')), 99);
  assert.equal(slot.add(5201), false, 'key items are not added to the bag');
  slot.chocobo.push({ id: id('Ribbon'), count: 4 });
  const out = s.serialize();
  const again = new Ff3DsSave(out).usedSlots[0];
  assert.deepEqual(again.bag.map((x) => itemName(x.id)), ['Potion', 'Phoenix Down', 'Eye Drops', 'Antidote', 'Echo Herbs', 'Dagger', 'Poison', 'Elixir']);
  assert.deepEqual([...out.subarray(bag + 8 * 4, bag + 9 * 4)], [0xff, 0xff, 0, 0], 'the rest are empty places');
  assert.equal(again.stored(id('Ribbon')), 4);
  assert.deepEqual(again.keyItems.map(itemName), ['Folding Canoe'], 'key items stay');
  for (let i = 0; i < BAG_SIZE + 10; i++) slot.add(ALL[i % ALL.length][0]);
  assert.ok(slot.bag.length <= BAG_SIZE);
});

test('the Quicksave opens with the slots, and a slot that fails the check is left out', () => {
  const d = buildFf3DsSample();
  const q = slotBase(3);
  d.copyWithin(q, 0, SLOT_SPACING);
  d[q + LENGTH] = 0x30;
  const s = new Ff3DsSave(d);
  s.slots[3].gil = 1;
  const out = s.serialize();
  assert.ok(slotOk(out, 3), 'the Quicksave’s check covers its longer record');
  const again = new Ff3DsSave(out);
  assert.deepEqual(again.usedSlots.map((x) => x.label), ['Slot 1', 'Quicksave']);
  assert.deepEqual(again.summary().map((l) => l.label), ['SLOT 1', 'QUICKSAVE']);
  assert.equal(again.slots[3].gil, 1);
  assert.equal(again.slots[0].gil, 4_820);
  out[0x100] ^= 1;
  assert.deepEqual(new Ff3DsSave(out).usedSlots.map((x) => x.label), ['Quicksave']);
});

test('other saves are not taken for III DS, nor it for them; a damaged one is not opened', () => {
  assert.ok(!detectGames(buildFf3NesSample()).some((m) => m.module.id === 'final-fantasy-3-ds'));
  assert.ok(!detectGames(buildSampleSave('emerald')).some((m) => m.module.id === 'final-fantasy-3-ds'));
  assert.equal(detectFf3Ds(new Uint8Array(SAVE_SIZE)), null);
  const d = buildFf3DsSample();
  d[0x200] ^= 1;
  assert.equal(detectFf3Ds(d), 'bad-checksum');
  assert.throws(() => new Ff3DsSave(d));
});

test('edits read back and serialize() makes the slot add up again', () => {
  const s = new Ff3DsSave(buildFf3DsSample());
  const slot = s.usedSlots[0];
  const [luneth, arc] = slot.party;
  luneth.name = 'Kaito 9!';
  assert.equal(luneth.name, 'Kaito9');
  assert.equal(asSaved('Lé on'), 'Lon');
  assert.equal(asSaved('O’Neil!'), "O'Neil");
  assert.equal(asSaved('(=;+:,./?)'), '(=;+:,');
  luneth.level = 120;
  assert.equal(luneth.level, 99);
  luneth.maxHp = 12_000; luneth.hp = 12_000;
  assert.equal(luneth.hp, 9_999);
  luneth.setJobLevel(job('Ninja'), 40);
  assert.equal(luneth.jobLevel(job('Ninja')), 40);
  arc.setMaxMp(3, 9); arc.setMp(3, 20);
  assert.equal(arc.mp(3), 9);
  arc.hp = 1;
  arc.restore();
  assert.equal(arc.hp, arc.maxHp);
  assert.equal(arc.mp(1), arc.maxMp(1));
  slot.gil = 99_999_999;
  assert.equal(slot.gil, MAX_GIL);
  slot.setJobOpen(job('Ninja'), true);
  slot.setJobOpen(job('Thief'), false);
  slot.setJobOpen(0, false);
  assert.ok(slot.jobOpen(0), 'the Freelancer is always there');
  const out = s.serialize();
  assert.ok(slotOk(out, 0));
  const again = new Ff3DsSave(out);
  assert.equal(again.usedSlots[0].party[0].name, 'Kaito9');
  assert.ok(again.usedSlots[0].jobOpen(job('Ninja')) && !again.usedSlots[0].jobOpen(job('Thief')));
  const changes = again.describeChanges(new Ff3DsSave(buildFf3DsSample())).flatMap((g) => g.lines);
  assert.ok(changes.includes('Name: Luneth → Kaito9'));
  assert.ok(changes.includes('Gil: 4,820 → 9,999,999'));
  assert.ok(changes.includes('Level: 12 → 99'));
  assert.ok(changes.includes('Ninja job level: 1 → 40'));
  assert.ok(changes.includes('Job menu: Ninja added'));
  assert.ok(changes.includes('Job menu: Thief taken out'));
});

test('DeSmuME .dsv and Action Replay .duc files open as the save inside', () => {
  const sav = buildFf3DsSample();
  const footer = new Uint8Array(122);
  const snip = '|<--Snip above here to create a raw sav by excluding this DeSmuME savedata footer:';
  footer.set([...snip].map((c) => c.charCodeAt(0)));
  new DataView(footer.buffer).setUint32(snip.length, sav.length, true);
  new DataView(footer.buffer).setUint32(snip.length + 4, sav.length, true);
  footer.set([...'|-DESMUME SAVE-|'].map((c) => c.charCodeAt(0)), 106);
  const dsv = new Uint8Array([...sav, ...footer]);
  const u = unwrapSave(dsv);
  assert.equal(u.format, 'DeSmuME');
  assert.deepEqual(u.data, sav);
  assert.deepEqual(u.wrap(u.data), dsv);
  const s = new Ff3DsSave(u.data);
  s.usedSlots[0].gil = 777;
  const back = unwrapSave(u.wrap(s.serialize()));
  assert.equal(new Ff3DsSave(back.data).usedSlots[0].gil, 777);

  const header = new Uint8Array(500);
  header.set([...'ARDS000000000001FINAL FANTASY III'].map((c) => c.charCodeAt(0)));
  const duc = unwrapSave(new Uint8Array([...header, ...sav]));
  assert.equal(duc.format, 'Action Replay DS');
  assert.deepEqual(duc.data, sav);
  assert.equal(duc.saveAs, '.sav');
});

// Set FF3DS_FILE to a real save (raw, .dsv or .duc) to check it opens, round-trips and takes an edit. Nothing from it is
// printed or stored.
const real = process.env.FF3DS_FILE;
test('a real save in FF3DS_FILE opens, round-trips and takes an edit', { skip: real && existsSync(real) ? false : 'set FF3DS_FILE to a real save to run' }, () => {
  const u = unwrapSave(new Uint8Array(readFileSync(real!)));
  assert.equal(detectFf3Ds(u.data), 'ok');
  const s = new Ff3DsSave(u.data);
  assert.deepEqual(s.serialize(), u.data);
  for (const slot of s.usedSlots) {
    for (const c of slot.party) {
      assert.equal(levelFor(c.exp), c.level);
      assert.ok(c.name.length >= 1 && c.name.length <= 6);
      assert.ok(c.spells.every((sp) => spellLevel(sp) > 0));
    }
    assert.ok(slot.bag.every((x) => itemName(x.id) !== `Item ${x.id}`), 'every bag item has a name');
  }
  s.usedSlots[0].party[0].level = 50;
  const out = s.serialize();
  assert.ok(s.usedSlots.every((slot) => slotOk(out, slot.index)));
});
