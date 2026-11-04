import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK, SAVED, checksum, checksumOk, detectFf1Nes } from '../src/core/ff1nes/layout.ts';
import { blankFf1NesSave, buildFf1NesSample } from '../src/core/ff1nes/sample.ts';
import { Ff1NesSave, canEquipArmor, canEquipWeapon, canLearn, expForLevel } from '../src/core/ff1nes/save.ts';
import { ARMOR, SPELLS, WEAPONS } from '../src/core/ff1nes/tables.ts';
import { asSaved, decodeName, encodeName } from '../src/core/ff1nes/text.ts';
import { detectGames, openSave } from '../src/core/registry.ts';

const block = (file: Uint8Array) => file.subarray(SAVED, SAVED + BLOCK);

test('checksum: the game sums with carry, column by column, to $FF', () => {
  const b = new Uint8Array(BLOCK);
  b[0xfe] = 0x55; b[0xff] = 0xaa;
  // 0x55 + 0xAA = 0xFF with no carry, so an otherwise empty block already passes.
  assert.equal(checksum(b), 0xff);
  // A carry out of one add goes into the next byte's add (page order 0..3 for each column).
  const c = new Uint8Array(BLOCK);
  c[0x000] = 0xff; c[0x100] = 0x02; c[0x200] = 0x00;
  assert.equal(checksum(c), 2); // 0xFF + 0x02 = 0x101: A = 1, carry 1; then + 0 + carry = 2
});

test('sample: detected, opens, and round-trips byte for byte', async () => {
  const data = buildFf1NesSample();
  assert.equal(data.length, 8192);
  assert.equal(detectFf1Nes(data), 'ok');
  assert.ok(checksumOk(block(data)));
  const matches = detectGames(data);
  assert.deepEqual(matches.map((m) => m.module.id), ['final-fantasy-nes']);
  const opened = await openSave(data);
  assert.ok(opened);
  assert.deepEqual(opened.save.serialize(), data);
  const s = opened.save as Ff1NesSave;
  assert.deepEqual(s.party.map((c) => c.name), ['Brom', 'Wren', 'Ivy', 'Oren']);
  assert.equal(s.loadNote(), null);
});

test('blank file and other games are not taken', () => {
  assert.equal(detectFf1Nes(new Uint8Array(8192)), null);
  assert.equal(detectFf1Nes(new Uint8Array(4096)), null);
  const bad = buildFf1NesSample();
  bad[SAVED + 0x1c] ^= 1;
  assert.equal(detectFf1Nes(bad), 'bad-checksum');
  const s = new Ff1NesSave(bad);
  assert.match(s.loadNote() ?? '', /save check/);
  assert.equal(detectFf1Nes(s.serialize()), 'ok');
});

test('trailing bytes (RetroArch .srm etc.) are kept', () => {
  const data = new Uint8Array(8192 + 16);
  data.set(buildFf1NesSample());
  data.fill(7, 8192);
  const s = new Ff1NesSave(data);
  s.gold = 1;
  const out = s.serialize();
  assert.equal(out.length, data.length);
  assert.deepEqual(out.subarray(8192), data.subarray(8192));
  assert.equal(detectFf1Nes(out), 'ok');
});

test('edits land at the disassembly offsets and the checksum is fixed', () => {
  const s = new Ff1NesSave(buildFf1NesSample());
  s.gold = 999_999;
  s.party[1].name = 'Zed';
  s.party[1].cls = 7;
  s.setCount(3, 99);
  s.airship = true;
  s.canoe = true;
  const out = s.serialize();
  const b = block(out);
  assert.ok(checksumOk(b));
  assert.equal(b[0x1c] | (b[0x1d] << 8) | (b[0x1e] << 16), 999_999);
  assert.equal(b[0x140], 7);
  assert.deepEqual([...b.subarray(0x142, 0x146)], [0xa3, 0xa8, 0xa7, 0xff]); // Z e d, padded
  assert.equal(b[0x20 + 0x19], 99); // Heal Potions
  assert.equal(b[0x04], 0x1f);
  assert.equal(b[0x12], 1);
});

test('level and exp stay in step, including the status screen figure', () => {
  const s = new Ff1NesSave(buildFf1NesSample());
  const c = s.party[0];
  c.setLevel(1);
  assert.equal(c.exp, 0);
  assert.equal(c.expToNext, 40);
  c.setLevel(50);
  assert.equal(c.exp, expForLevel(50));
  assert.equal(c.expToNext, 0);
  c.setExp(200);
  assert.equal(c.level, 3); // 196 reaches level 3, 547 level 4
  assert.equal(c.expToNext, 347);
});

test('gear: sub-stats move as the game moves them, and one weapon at a time is worn', () => {
  const s = new Ff1NesSave(buildFf1NesSample());
  const c = s.party[0];
  const before = { dmg: c.substat('damage'), hit: c.substat('hit') };
  const ls = WEAPONS.indexOf('Long Sword') + 1;
  const xc = WEAPONS.indexOf('Xcalber') + 1;
  assert.deepEqual(c.weapon(0), { id: ls, equipped: true });
  c.setGear('weapon', 0, { id: xc, equipped: true });
  // Long Sword is +20 dmg +10 hit; Xcalber +45 dmg +35 hit (bank 0C weapon data).
  assert.equal(c.substat('damage'), before.dmg - 20 + 45);
  assert.equal(c.substat('hit'), before.hit - 10 + 35);
  c.setGear('weapon', 1, { id: ls, equipped: true });
  assert.equal(c.weapon(0).equipped, false);
  assert.equal(c.substat('damage'), before.dmg);
  // Armor: a second helmet replaces the first.
  const ribbon = ARMOR.indexOf('Ribbon') + 1;
  c.setGear('armor', 3, { id: ribbon, equipped: true });
  assert.equal(c.armor(2).equipped, false); // the Iron Helmet came off
  assert.equal(c.armor(3).equipped, true);
});

test('permissions match the game', () => {
  assert.equal(canEquipWeapon(0, WEAPONS.indexOf('Xcalber') + 1), false); // Fighter can't, Knight can
  assert.equal(canEquipWeapon(6, WEAPONS.indexOf('Xcalber') + 1), true);
  assert.equal(canEquipArmor(5, ARMOR.indexOf('Iron Armor') + 1), false);
  assert.equal(canEquipArmor(0, ARMOR.indexOf('Ribbon') + 1), true);
  assert.equal(canLearn(4, SPELLS.indexOf('CURE')), true);
  assert.equal(canLearn(4, SPELLS.indexOf('FIRE')), false);
  assert.equal(canLearn(4, SPELLS.indexOf('LIF2')), false); // only White Wizards
  assert.equal(canLearn(10, SPELLS.indexOf('LIF2')), true);
  assert.equal(canLearn(6, SPELLS.indexOf('CURE')), true); // Knights learn low white magic
});

test('spells and MP', () => {
  const s = new Ff1NesSave(buildFf1NesSample());
  const c = s.party[3];
  assert.equal(SPELLS[c.spell(0, 0)], 'FIRE');
  c.setSpell(7, 0, SPELLS.indexOf('NUKE'));
  c.setMaxMp(7, 12);
  const b = block(s.serialize());
  assert.equal(b[0x3c0 + 7 * 4], 5); // NUKE is the 5th spell of level 8
  assert.equal(b[0x3c0 + 0x28 + 7], 9);
});

test('names', () => {
  assert.equal(decodeName(encodeName('Ab9')), 'Ab9');
  assert.equal(asSaved('Tooolong'), 'Tooo');
  assert.equal(asSaved('é!'), '?!');
});

test('blank save has the new-game tables', () => {
  const b = block(blankFf1NesSave());
  assert.equal(b[0x1c] | (b[0x1d] << 8), 400);
  assert.equal(b[0x0c], 1); // canal not dug
});

test('diff names what changed', () => {
  const before = new Ff1NesSave(buildFf1NesSample());
  const s = new Ff1NesSave(buildFf1NesSample());
  s.party[0].setLevel(20);
  s.gold = 10;
  s.setOrb(0, true);
  const groups = s.describeChanges(before);
  assert.deepEqual(groups.map((g) => g.title), ['Brom', 'Items', 'World']);
  assert.ok(groups[0].lines.includes('Level: 14 → 20'));
  assert.ok(groups[1].lines.includes('Gold: 4,210 → 10'));
  assert.ok(groups[2].lines.includes('Fire Orb: lit'));
});
