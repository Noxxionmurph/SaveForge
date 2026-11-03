import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { itemChoices, placeChoices } from '../src/core/gen3/data.ts';
import { FLY_SPOTS, KANTO } from '../src/core/gen3/kanto.ts';
import { EMERALD, FRLG, RS, validSlots } from '../src/core/gen3/layout.ts';
import { GEN3_LAYOUTS, Gen3Save, detectGen3 } from '../src/core/gen3/save.ts';
import { blankGen3Save, buildSampleSave } from '../src/core/gen3/sample.ts';
import { openSave } from '../src/core/registry.ts';

const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

test('the FireRed and LeafGreen layout follows pokefirered: block sizes, the key at the end of SaveBlock2, new SaveBlock1 offsets', () => {
  assert.equal(FRLG.sb2Size, 0xf24);
  assert.equal(FRLG.sb1Size, 0x3d68);
  assert.equal(FRLG.keyAt, 0xf20);
  assert.deepEqual([FRLG.partyCount, FRLG.party, FRLG.money, FRLG.coins, FRLG.pcItems], [0x34, 0x38, 0x290, 0x294, 0x298]);
  assert.deepEqual([FRLG.items, FRLG.keyItems, FRLG.balls, FRLG.tmhm, FRLG.berries], [0x310, 0x3b8, 0x430, 0x464, 0x54c]);
  assert.deepEqual([FRLG.flags, FRLG.vars, FRLG.gameStats], [0xee0, 0x1000, 0x1200]);
  // Each pocket runs into the next.
  assert.equal(FRLG.pcItems + FRLG.pcItemsMax * 4, FRLG.items);
  assert.equal(FRLG.items + FRLG.itemsMax * 4, FRLG.keyItems);
  assert.equal(FRLG.keyItems + FRLG.keyItemsMax * 4, FRLG.balls);
  assert.equal(FRLG.balls + FRLG.ballsMax * 4, FRLG.tmhm);
  assert.equal(FRLG.tmhm + FRLG.tmhmMax * 4, FRLG.berries);
  assert.equal(FRLG.berries + FRLG.berriesMax * 4, FRLG.seenCopies[0]);
});

test('each Gen 3 game is told apart, though a FireRed file also fits Emerald\'s layout', async () => {
  const frlg = buildSampleSave('frlg');
  assert.ok(validSlots(frlg, FRLG).length && validSlots(frlg, EMERALD).length, 'both layouts fit');
  assert.equal(validSlots(frlg, RS).length, 0);
  assert.equal(detectGen3(frlg), 'frlg');
  assert.equal(detectGen3(blankGen3Save('frlg')), 'frlg');
  assert.equal(detectGen3(buildSampleSave('emerald')), 'emerald');
  assert.equal(detectGen3(buildSampleSave('rs')), 'rs');
  assert.equal((await openSave(frlg))?.module.id, 'pokemon-frlg');
  assert.equal((await openSave(buildSampleSave('emerald')))?.module.id, 'pokemon-emerald');
  assert.equal((await openSave(buildSampleSave('rs')))?.module.id, 'pokemon-gen3');
});

test('the FireRed sample reads back: trainer, party, bag under the key, Kanto badges, no Hoenn extras', () => {
  const s = new Gen3Save(buildSampleSave('frlg'));
  assert.equal(s.game, 'frlg');
  assert.equal(s.trainerName, 'LEAF');
  assert.equal(s.money, 23456);
  assert.equal(s.coins, 120);
  assert.equal(s.badges, 0b1111);
  assert.deepEqual(s.party.map((m) => m.species), [3, 25, 17, 175, 131]);
  assert.equal(s.party[0].metGame, 4); // FireRed
  assert.ok(s.pockets.key.some((it) => it.id === 362)); // Vs. Seeker
  assert.equal(s.hoenn, false);
  assert.equal(s.secretBase, null);
  assert.equal(s.frontier, null);
  assert.equal(s.rematches, null);
  assert.equal(s.kanto?.vsSeeker, 60);
  assert.equal(s.kanto?.fame[0].state, 2); // Professor Oak, from the start
  // Money is kept under the key: the raw word is not the amount.
  const d = buildSampleSave('frlg');
  const slot = validSlots(d, FRLG)[0];
  assert.notEqual(u32(d, slot.sectorOf[1] * 0x1000 + FRLG.money), 23456);
});

test('FireRed and LeafGreen edits round-trip: money, bag counts past 99, Fly, Fame Checker, Vs. Seeker, National Pokédex', () => {
  const s = new Gen3Save(buildSampleSave('frlg'));
  s.money = 999999;
  s.pockets.item = [{ id: 68, count: 999 }];
  s.nationalDex = true;
  const k = s.kanto!;
  k.vsSeeker = 100;
  const four = FLY_SPOTS.findIndex((p) => p.name === 'Four Island');
  k.fly[four] = true;
  k.fame[15] = { state: 2, facts: 0b111111 };
  const t = new Gen3Save(s.serialize());
  assert.equal(t.money, 999999);
  assert.deepEqual(t.pockets.item, [{ id: 68, count: 999 }]);
  assert.equal(t.nationalDex, true);
  assert.equal(t.kanto?.vsSeeker, 100);
  assert.equal(t.kanto?.fly[four], true);
  assert.ok(t['flag'](0x89e), 'FLAG_WORLD_MAP_FOUR_ISLAND');
  assert.deepEqual(t.kanto?.fame[15], { state: 2, facts: 0b111111 });
  // FireRed's own National Pokédex magic (0xB9 at SaveBlock2 0x1B), not Hoenn's.
  const d = s.serialize(), slot = validSlots(d, FRLG)[0];
  assert.equal(d[slot.sectorOf[0] * 0x1000 + 0x1b], 0xb9);
  const lines = t.describeChanges(new Gen3Save(buildSampleSave('frlg'))).flatMap((g) => g.lines);
  for (const want of ['Can fly to: Four Island', 'Giovanni: Not yet → Met, facts 0 → 6 of 6', 'Vs. Seeker: charged', 'National Pokédex unlocked']) {
    assert.ok(lines.includes(want), want);
  }
});

test('the quest log recap can be skipped: every scene is emptied', () => {
  const d = buildSampleSave('frlg');
  const s = new Gen3Save(d);
  assert.equal(s.questLogScenes, 0);
  // Pretend the game recorded a scene.
  const sb1 = s['sb1'] as Uint8Array;
  sb1[KANTO.questLog] = 1; sb1[KANTO.questLog + KANTO.questLogScene] = 2;
  const t = new Gen3Save(s.serialize());
  assert.equal(t.questLogScenes, 2);
  t.clearQuestLog = true;
  assert.equal(new Gen3Save(t.serialize()).questLogScenes, 0);
});

test('Kanto items and places: FireRed keeps its own key items and leaves out Hoenn\'s', () => {
  const keys = itemChoices(['key'], 'frlg').map((c) => c.id);
  for (const id of [260, 262, 265, 349, 362, 367, 370, 374]) assert.ok(keys.includes(id), String(id));
  for (const id of [259, 268, 273, 275, 375]) assert.ok(!keys.includes(id), String(id));
  const places = placeChoices('frlg').map((p) => p.name);
  assert.ok(places.includes('Pallet Town') && places.includes('Sevault Canyon'));
  assert.ok(!places.includes('Littleroot Town'));
  assert.equal(GEN3_LAYOUTS.frlg, FRLG);
});

test('event tickets in Kanto: the Mystic and Aurora Tickets, waiting on the Rainbow Pass', () => {
  const s = new Gen3Save(buildSampleSave('frlg'));
  assert.equal(s.islands.length, 2);
  assert.equal(s.ferryReady, false);
  assert.ok(s.setIsland(0, true));
  const t = new Gen3Save(s.serialize());
  assert.equal(t.islands[0], true);
  assert.ok(t.pockets.key.some((it) => it.id === 370));
  assert.ok(t['flag'](0x84a));
});

test('FireRed legends come back: flags cleared, others untouched', () => {
  const s = new Gen3Save(buildSampleSave('frlg'));
  const mewtwo = s.legends.findIndex((l) => l.name === 'Mewtwo');
  const sb1 = s['sb1'] as Uint8Array;
  const set = (n: number) => { sb1[FRLG.flags + (n >> 3)] |= 1 << (n & 7); };
  set(0x2bc); set(0x81);
  const t = new Gen3Save(s.serialize());
  assert.ok(t.legendGone(mewtwo));
  t.bringBack[mewtwo] = true;
  const back = new Gen3Save(t.serialize());
  assert.ok(!back.legendGone(mewtwo));
  assert.ok(!back['flag'](0x81));
});

// Set FRLG_SAV to a real FireRed or LeafGreen save to check it round-trips. Nothing from it is printed or stored.
const real = process.env.FRLG_SAV;
test('a real save in FRLG_SAV round-trips byte for byte', { skip: real && existsSync(real) ? false : 'set FRLG_SAV to a real save to run' }, async () => {
  const raw = new Uint8Array(readFileSync(real!));
  const found = await openSave(raw);
  assert.equal(found?.module.id, 'pokemon-frlg');
  assert.deepEqual(found!.save.serialize(), raw);
});
