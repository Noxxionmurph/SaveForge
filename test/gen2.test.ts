import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  DEX_NAMES, UNOWN, attackDvForGender, dvsForUnownLetter, expForLevel, genderOf, hpDv, isShiny, itemName, maxPp,
  shinyDvs, speciesName, unownLetter,
} from '../src/core/gen2/data.ts';
import { hpBarColour, hpBarPixels } from '../src/core/gen2/hp.ts';
import { gameTimeAt, readRtcFooter, startFor } from '../src/core/gen2/clock.ts';
import { DAYCARE, PARTY, copyMon, dropMon, moveMon, partyLeaveRefusal, removeMon } from '../src/core/gen2/roster.ts';
import { GEN2_LAYOUTS, Gen2Save, SAVE_SIZE, calcStats, newMon, sum16 } from '../src/core/gen2/save.ts';
import { blankGen2Save, buildSampleSave } from '../src/core/gen2/sample.ts';
import { decodeText, encodeText, nameProblems } from '../src/core/gen2/text.ts';
import { openSave } from '../src/core/registry.ts';
import { buildSampleSave as buildGen1Sample } from '../src/core/gen1/sample.ts';

const mainSum = (d: Uint8Array) => d[0x2d69] | (d[0x2d6a] << 8);
const backupSum = (d: Uint8Array) => d[0x7e6d] | (d[0x7e6e] << 8);

// ---------- data ----------

test('the tables cover all 251 Pokémon, with Gen 1 spellings for the first 151', () => {
  assert.equal(DEX_NAMES.length, 251);
  assert.equal(speciesName(1), 'Bulbasaur');
  assert.equal(speciesName(122), 'Mr. Mime');
  assert.equal(speciesName(152), 'Chikorita');
  assert.equal(speciesName(251), 'Celebi');
  assert.equal(itemName(0x92), 'Leftovers');
  assert.equal(itemName(0xbf), 'TM01');
});

test('experience curves match the game (Medium Slow level 100 is 1,059,860)', () => {
  assert.equal(expForLevel('Medium Slow', 100), 1059860);
  assert.equal(expForLevel('Medium Fast', 100), 1000000);
  assert.equal(expForLevel('Slow', 100), 1250000);
  assert.equal(expForLevel('Fast', 100), 800000);
});

test('gender comes from the Attack and Speed DVs and the species ratio', () => {
  // Chikorita is 1 in 8 female (ratio 31): Attack DV 1, Speed DV 15 gives 0x1F = 31, the last female value.
  assert.equal(genderOf(152, { atk: 1, def: 0, spe: 15, spc: 0 }), 'female');
  assert.equal(genderOf(152, { atk: 2, def: 0, spe: 0, spc: 0 }), 'male');
  assert.equal(genderOf(113, { atk: 15, def: 15, spe: 15, spc: 15 }), 'female'); // Chansey, always female
  assert.equal(genderOf(106, { atk: 0, def: 0, spe: 0, spc: 0 }), 'male'); // Hitmonlee, always male
  assert.equal(genderOf(UNOWN, { atk: 0, def: 0, spe: 0, spc: 0 }), 'none');
  const dvs = { atk: 15, def: 3, spe: 9, spc: 4 };
  const atk = attackDvForGender(207, dvs, 'female');
  assert.equal(genderOf(207, { ...dvs, atk }), 'female');
});

test('shininess: Defense, Speed and Special of 10 and a matching Attack DV', () => {
  assert.ok(isShiny({ atk: 14, def: 10, spe: 10, spc: 10 }));
  assert.ok(!isShiny({ atk: 13, def: 10, spe: 10, spc: 10 }));
  assert.ok(!isShiny({ atk: 15, def: 15, spe: 15, spc: 15 }));
  const made = shinyDvs({ atk: 4, def: 1, spe: 2, spc: 3 });
  assert.ok(isShiny(made));
  assert.equal(hpDv(made), ((made.atk & 1) << 3)); // def, spe and spc of 10 have an even low bit
});

test("Unown's letter: every letter can be reached, and a shiny Unown is I or V", () => {
  assert.equal(unownLetter({ atk: 0, def: 0, spe: 0, spc: 0 }), 'A');
  assert.equal(unownLetter({ atk: 15, def: 15, spe: 15, spc: 15 }), 'Z');
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.equal(unownLetter(dvsForUnownLetter({ atk: 9, def: 4, spe: 1, spc: 12 }, l)), l);
  const letters = new Set<string>();
  for (let atk = 0; atk < 16; atk++) if (isShiny({ atk, def: 10, spe: 10, spc: 10 })) letters.add(unownLetter({ atk, def: 10, spe: 10, spc: 10 }));
  assert.deepEqual([...letters].sort(), ['I', 'V']);
});

test('PP Ups add a fifth of the base PP each, up to 61 for a 40 PP move', () => {
  assert.equal(maxPp(33, 0), 35); // Tackle
  assert.equal(maxPp(33, 3), 56);
  assert.equal(maxPp(0, 3), 0);
});

test('stat formula: Special Attack and Special Defense share the Special DV and stat experience', () => {
  const s = calcStats(181, 50, { atk: 15, def: 15, spe: 15, spc: 15 }, { hp: 0, atk: 0, def: 0, spe: 0, spc: 0 })!;
  // Ampharos: 90 / 75 / 75 / 55 / 115 / 90
  assert.deepEqual(s, { hp: 165, atk: 95, def: 95, spe: 75, spa: 135, spd: 110 });
});

test("the HP bar turns yellow at half and red under 10 of its 48 pixels, Gold and Silver's way", () => {
  assert.equal(hpBarColour(hpBarPixels(50, 100)), 'green');
  assert.equal(hpBarColour(hpBarPixels(49, 100)), 'yellow');
  assert.equal(hpBarColour(hpBarPixels(20, 100)), 'red');
  assert.equal(hpBarPixels(1, 700), 1); // never empty while HP is above 0
  assert.equal(hpBarPixels(0, 100), 0);
});

test('text: names round-trip, and unknown characters are reported', () => {
  assert.equal(decodeText(encodeText("GOLD'S", 11)), "GOLD'S");
  assert.equal(encodeText("'s", 3)[0], 0xd4); // one character
  assert.equal(decodeText(encodeText('Poké{PK}', 11)), 'Poké{PK}');
  assert.deepEqual(nameProblems('ABC~', 7), { unsupported: ['~'], extra: 0 });
  assert.equal(nameProblems('ABCDEFGHIJ', 7).extra, 3);
  // Trainer names are padded with zeros, nicknames with terminators.
  assert.deepEqual([...encodeText('AB', 5, undefined, 0)], [0x80, 0x81, 0x50, 0, 0]);
  assert.deepEqual([...encodeText('AB', 5)], [0x80, 0x81, 0x50, 0x50, 0x50]);
});

// ---------- the save ----------

test('a blank save passes both checksums and round-trips', () => {
  const raw = blankGen2Save('gs', 'GOLD', 'SILVER');
  assert.equal(raw.length, SAVE_SIZE);
  assert.ok(Gen2Save.mainValid(raw));
  assert.equal(mainSum(raw), sum16(raw, 0x2009, 0x2d69));
  assert.equal(backupSum(raw), mainSum(raw));
  const s = new Gen2Save(raw);
  assert.equal(s.trainerName, 'GOLD');
  assert.equal(s.rivalName, 'SILVER');
  assert.equal(s.boxNames[13], 'BOX14');
  assert.deepEqual(s.serialize(), raw);
});

test('the Gold sample opens as Gold / Silver and survives a round trip', async () => {
  const raw = buildSampleSave('gs');
  assert.deepEqual(buildSampleSave('gs'), raw, 'building twice gives the same bytes');
  const found = await openSave(raw);
  assert.equal(found?.module.id, 'pokemon-gen2');
  assert.deepEqual(found!.save.serialize(), raw);
  const s = found!.save as Gen2Save;
  assert.equal(s.party.length, 6);
  assert.ok(s.party[5].isEgg);
  assert.ok(isShiny(s.party[1].dvs));
  assert.equal(s.party[0].item, 0x8a);
  assert.equal(s.boxNames[0], 'JOHTO');
});

test('Gen 1 and Gen 2 saves are told apart', async () => {
  assert.equal((await openSave(buildGen1Sample()))?.module.id, 'pokemon-gen1');
  assert.equal((await openSave(buildSampleSave('gs')))?.module.id, 'pokemon-gen2');
  const broken = buildSampleSave('gs');
  broken[0x2100] ^= 0xff; // the checksum no longer matches
  assert.ok(!Gen2Save.mainValid(broken));
});

test('an edit rewrites the checksum and refreshes the backup copy', () => {
  const raw = buildSampleSave('gs');
  const s = new Gen2Save(raw);
  s.money = 123456;
  s.trainerName = 'KRIS';
  s.party[0].level = 60;
  const out = s.serialize();
  assert.ok(Gen2Save.mainValid(out));
  assert.equal(mainSum(out), sum16(out, 0x2009, 0x2d69));
  assert.equal(backupSum(out), mainSum(out));
  assert.equal((out[0x23db] << 16) | (out[0x23dc] << 8) | out[0x23dd], 123456);
  // The backup holds the same player data (the game's p1 block lands at 0x15C7).
  assert.deepEqual(out.subarray(0x15c7, 0x15c7 + 0x226), out.subarray(0x2009, 0x222f));
  const again = new Gen2Save(out);
  assert.equal(again.trainerName, 'KRIS');
  assert.equal(again.party[0].level, 60);
});

for (const game of ['gs', 'crystal'] as const) {
  test(`${game}: a damaged main copy opens from the backup, and saving repairs it instead of overwriting the backup`, () => {
    const L = GEN2_LAYOUTS[game];
    const raw = buildSampleSave(game);
    const good = new Gen2Save(raw, game);
    const damaged = raw.slice();
    damaged.fill(0x5a, L.gameData + 0x40, L.gameData + 0x80); // garbage across the player data
    assert.ok(!Gen2Save.mainValid(damaged, game));
    assert.ok(Gen2Save.backupValid(damaged, game));
    assert.equal(Gen2Save.detectGame(damaged), game);

    const s = new Gen2Save(damaged, game);
    assert.equal(s.loadedFrom, 'backup');
    assert.ok(s.loadNote());
    assert.equal(s.trainerName, good.trainerName);
    assert.equal(s.money, good.money);

    s.money = 4321;
    const out = s.serialize();
    assert.ok(Gen2Save.mainValid(out, game));
    assert.ok(Gen2Save.backupValid(out, game));
    assert.equal(new Gen2Save(out, game).money, 4321);
    // Untouched, it comes back as the good file.
    assert.deepEqual(new Gen2Save(damaged, game).serialize(), raw);
  });
}

test('a file with neither copy valid says so', () => {
  const raw = buildSampleSave('gs');
  raw.fill(0x5a, 0x2050, 0x2090);
  raw.fill(0x5a, 0x15d0, 0x1610);
  assert.equal(Gen2Save.detectGame(raw), null);
  const s = new Gen2Save(raw, 'gs');
  assert.equal(s.loadedFrom, 'neither');
  assert.ok(s.loadNote());
  assert.equal(new Gen2Save(buildSampleSave('gs')).loadNote(), null);
});

test('the open box lives in its own slot; its copy in the box bank is left as the game left it', () => {
  const raw = buildSampleSave('gs');
  const s = new Gen2Save(raw);
  const bank = Gen2Save.boxOffset(s.currentBoxIndex);
  s.boxes[s.currentBoxIndex].push(newMon(152, 5));
  const n = s.boxes[s.currentBoxIndex].length;
  const out = s.serialize();
  assert.equal(out[0x2d6c], n);
  // The game copies the open box back to the bank only when you change box, so the bank copy stays stale.
  assert.equal(out[bank], raw[bank]);
  assert.equal(new Gen2Save(out).boxes[s.currentBoxIndex].length, n);
});

test('eggs keep the EGG marker in the species list and their egg cycles', () => {
  const s = new Gen2Save(buildSampleSave('gs'));
  const egg = s.party[5];
  assert.equal(egg.species, 175);
  assert.equal(egg.nickname, 'EGG');
  assert.equal(egg.hp, 0);
  const out = s.serialize();
  assert.equal(out[0x288a + 1 + 5], 0xfd);
});

// ---------- moving Pokémon ----------

test('a Pokémon put in a box gets its PP back; one taken out is healed', () => {
  const s = new Gen2Save(buildSampleSave('gs'));
  const quilava = s.party[0];
  quilava.pp = [0, 0, 0, 0];
  assert.equal(moveMon(s, PARTY, 0, 2), null);
  assert.deepEqual(quilava.pp, quilava.moves.map((m) => maxPp(m, 0)));
  quilava.hp = 1; quilava.status = 8;
  assert.equal(moveMon(s, 2, 0, PARTY), null);
  assert.equal(quilava.hp, quilava.maxHp);
  assert.equal(quilava.status, 0);
});

test('a Pokémon holding Mail stays out of the boxes', () => {
  const s = new Gen2Save(buildSampleSave('gs'));
  s.party[0].item = 0xb5; // Flower Mail
  assert.equal(moveMon(s, PARTY, 0, 0), 'mail');
  assert.equal(dropMon(s, { where: PARTY, index: 0 }, { where: 0, index: 0 }), 'mail');
  assert.equal(s.party[0].item, 0xb5);
});

test('the party keeps a Pokémon that can battle: an egg alone is not enough', () => {
  const s = new Gen2Save(buildSampleSave('gs'));
  // Leave just Quilava and the egg.
  for (let i = 0; i < 4; i++) assert.equal(moveMon(s, PARTY, 1, 3), null);
  assert.equal(s.party.length, 2);
  assert.equal(partyLeaveRefusal(s, 0), 'last-healthy');
  assert.equal(moveMon(s, PARTY, 0, 3), 'last-healthy');
  assert.equal(removeMon(s, PARTY, 0), 'last-healthy');
  assert.equal(partyLeaveRefusal(s, 1), null); // the egg can go
  // Swapping Quilava for a box Pokémon that isn't an egg is fine.
  assert.ok(typeof dropMon(s, { where: PARTY, index: 0 }, { where: 3, index: 0 }) === 'object');
});

test('a fainted party is refused too', () => {
  const s = new Gen2Save(buildSampleSave('gs'));
  for (const m of s.party.slice(1)) m.hp = 0;
  assert.equal(moveMon(s, PARTY, 0, 3), 'last-healthy');
});

test('duplicating into a full box spills over to the next one', () => {
  const s = new Gen2Save(buildSampleSave('gs'));
  while (s.boxes[0].length < 20) s.boxes[0].push(newMon(152, 5));
  const r = copyMon(s, 0, 0);
  assert.ok(typeof r === 'object' && r.where === 1);
});

// ---------- the list of changes ----------

test('the review lists Gen 2 changes in words', () => {
  const before = new Gen2Save(buildSampleSave('gs'));
  const after = new Gen2Save(buildSampleSave('gs'));
  after.kantoBadges = 1;
  after.party[3].dvs = shinyDvs(after.party[3].dvs);
  after.party[3].item = 0x92;
  after.boxNames[1] = 'TEAM';
  after.momsMoney = 0;
  const text = after.describeChanges(before).flatMap((g) => [g.title, ...g.lines]).join('\n');
  for (const want of ['Badges earned: Boulder', 'holds Leftovers', 'now shiny', 'TEAM', 'Mom']) assert.ok(text.includes(want), `${want}\n${text}`);
  assert.deepEqual(new Gen2Save(buildSampleSave('gs')).describeChanges(before), []);
});

test('the Gen 2 review shows recalculated party stats and names as saved', () => {
  const before = new Gen2Save(buildSampleSave('gs'));
  const after = new Gen2Save(buildSampleSave('gs'));
  const mon = after.party[0];
  const s = calcStats(mon.species, 60, mon.dvs, mon.evs)!;
  mon.level = 60; mon.maxHp = s.hp; mon.atk = s.atk;
  mon.nickname = 'ABCDEFGHIJKLMNOP';
  after.trainerName = 'LONGERNAME';
  const text = after.describeChanges(before).flatMap((g) => g.lines).join('\n');
  assert.match(text, /stats Max HP \d+ → \d+, Atk \d+ → \d+/);
  assert.match(text, /nickname \S+ → ABCDEFGHIJ,/);
  assert.match(text, /Name: \S+ → LONGERN$/m, 'the player name keeps 7 characters');
  // and the file really does keep 7
  assert.equal(new Gen2Save(after.serialize()).trainerName, 'LONGERN');
  after.trainerName = ' ';
  assert.match(after.describeChanges(before).flatMap((g) => g.lines).join('\n'), /Warning: your name is blank/);
});

// ---------- a real save, if you have one ----------
// Set GEN2_SAV=/path/to/your.sav to check it round-trips. Nothing from it is printed or stored.

const real = process.env.GEN2_SAV;
test('a real Gold or Silver save round-trips byte for byte', { skip: real && existsSync(real) ? false : 'set GEN2_SAV to a real save to run' }, async () => {
  const raw = new Uint8Array(readFileSync(real!));
  const found = await openSave(raw);
  assert.equal(found?.module.id, 'pokemon-gen2');
  assert.deepEqual(found!.save.serialize().subarray(0, SAVE_SIZE), raw.subarray(0, SAVE_SIZE));
});

test('clock reset: Continue asks for the day and time again (sRTCStatusFlags bit 7)', () => {
  for (const game of ['gs', 'crystal'] as const) {
    const raw = buildSampleSave(game);
    raw[0x0c60] = 0x20; // keep the other RTC bits as they are
    const s = new Gen2Save(raw, game);
    assert.equal(s.resetClock, false);
    s.resetClock = true;
    const out = s.serialize();
    assert.equal(out[0x0c60], 0xa0);
    const back = new Gen2Save(out, game);
    assert.equal(back.resetClock, true);
    assert.ok(back.describeChanges(new Gen2Save(raw, game)).flatMap((g) => g.lines).some((l) => l.startsWith('Clock:')));
    back.resetClock = false;
    assert.equal(back.serialize()[0x0c60], 0x20);
  }
});

/** An emulator clock footer: registers, latched registers, then the time the file was written (VBA-M/mGBA format). */
function withRtc(raw: Uint8Array, [sec, min, hr, days]: number[], savedAt: number, long = true): Uint8Array {
  const out = new Uint8Array(raw.length + (long ? 48 : 44));
  out.set(raw);
  const v = new DataView(out.buffer, raw.length);
  [sec, min, hr, days & 0xff, days >> 8].forEach((x, i) => { v.setUint32(i * 4, x, true); v.setUint32(20 + i * 4, x, true); });
  if (long) v.setBigUint64(40, BigInt(savedAt), true); else v.setUint32(40, savedAt, true);
  return out;
}

test('day and time: worked out from the emulator clock footer as the game does', () => {
  const raw = buildSampleSave('crystal');
  assert.equal(new Gen2Save(raw).gameTime(), null, 'no footer, no time');
  const T = 1_700_000_000;
  // Chip at day 3, 10:20:30; the save adds 2 days 5:50:40. Game: day 5 (Friday) 16:11:10.
  const edit = new Gen2Save(withRtc(raw, [30, 20, 10, 3], T));
  edit.startTime = Uint8Array.from([2, 5, 50, 40]);
  const file = edit.serialize();
  const s = new Gen2Save(file);
  assert.deepEqual(s.gameTime(T), { weekday: 5, hour: 16, minute: 11 });
  assert.deepEqual(s.gameTime(T + 3600 * 9), { weekday: 6, hour: 1, minute: 11 }, 'runs on with real time');
  assert.deepEqual(new Gen2Save(withRtc(file.subarray(0, 0x8000), [30, 20, 10, 3], T, false)).gameTime(T), { weekday: 5, hour: 16, minute: 11 }, '44-byte footer');

  // Set it, read it back at the same moment and a minute later, through a save and reload.
  for (const want of [{ weekday: 0, hour: 0, minute: 0 }, { weekday: 2, hour: 9, minute: 5 }, { weekday: 6, hour: 23, minute: 59 }]) {
    s.setGameTime(want, T + 100);
    const back = new Gen2Save(s.serialize());
    assert.deepEqual(back.gameTime(T + 100), want);
    assert.equal(back.serialize().length, file.length, 'the footer is kept');
  }
  assert.ok(s.describeChanges(new Gen2Save(file)).flatMap((g) => g.lines).includes('Clock: set to Saturday 23:59'));
});

test('day and time: a chip past 140 days wraps as the game wraps it', () => {
  const rtc = readRtcFooter(withRtc(buildSampleSave('gs'), [0, 0, 12, 300], 0))!;
  assert.equal(rtc.days, 300);
  const start = Uint8Array.from(startFor(rtc, { weekday: 3, hour: 8, minute: 30 }, 0));
  assert.deepEqual(gameTimeAt(rtc, start, 0), { weekday: 3, hour: 8, minute: 30 });
  assert.ok(start[0] < 140);
});
test('Gen 2 Day-Care: two carers, eggs refused, breeding stops when the pair changes', () => {
  for (const game of ['gs', 'crystal'] as const) {
    const base = GEN2_LAYOUTS[game].dayCare;
    const s = new Gen2Save(buildSampleSave(game), game);
    assert.equal(s.dayCare.length, 0);
    const egg = s.party.findIndex((m) => m.isEgg);
    if (egg >= 0) assert.equal(moveMon(s, PARTY, egg, DAYCARE), 'egg');
    const n = s.party.length;
    const first = s.party.findIndex((m) => !m.isEgg);
    assert.equal(moveMon(s, PARTY, first, DAYCARE), null);
    const second = s.party.findIndex((m) => !m.isEgg);
    assert.equal(moveMon(s, PARTY, second, DAYCARE), null);
    assert.equal(s.party.length, n - 2);
    assert.equal(moveMon(s, 0, 0, DAYCARE), 'full');
    const raw = s.serialize();
    assert.equal(raw[base] & 1, 1, 'the man has one');
    assert.equal(raw[base + 55] & 1, 1, 'the woman has one');
    const back = new Gen2Save(raw, game);
    assert.equal(back.dayCare.length, 2);
    assert.deepEqual(back.serialize(), raw, 'round trip');
    assert.equal(back.canHaveEgg, false, 'no egg was made for this pair');

    // A pair the game started breeding (compatible, egg made): the egg switch works, and a change of pair stops it.
    const bred = raw.slice();
    bred[base] |= 0x20;
    bred[base + 112 + 22] = 172;
    const sum = sum16(bred, GEN2_LAYOUTS[game].gameData, GEN2_LAYOUTS[game].gameDataEnd);
    bred[GEN2_LAYOUTS[game].checksum] = sum & 0xff; bred[GEN2_LAYOUTS[game].checksum + 1] = sum >> 8;
    const b = new Gen2Save(bred, game);
    assert.ok(b.canHaveEgg);
    b.eggWaiting = true;
    const withEgg = b.serialize();
    assert.equal(withEgg[base] & 0x61, 0x41, 'has egg, no longer compatible, still has a Pokémon');
    assert.ok(b.describeChanges(new Gen2Save(bred, game)).flatMap((g) => g.lines).includes('The old man has an egg waiting for you'));
    const c = new Gen2Save(withEgg, game);
    assert.equal(c.eggWaiting, true);
    assert.equal(moveMon(c, DAYCARE, 1, PARTY), null);
    const after = c.serialize();
    assert.equal(after[base] & 0x60, 0, 'taking one back stops breeding');
    assert.equal(after[base] & 1, 1, 'the man keeps his');
    assert.equal(after[base + 55] & 1, 0, 'the woman gave hers back');
    assert.ok(c.party.at(-1)!.maxHp > 0);
  }
});
