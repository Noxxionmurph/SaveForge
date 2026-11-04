import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PLAIN_SIZE, SAVE_BIN_SIZE, openFf1Psp, plausiblePlain } from '../src/core/ff1psp/container.ts';
import { buildFf1PspPlain, buildFf1PspSample, buildSfo } from '../src/core/ff1psp/sample.ts';
import { Ff1PspSave, asSaved, canEquipArmor, canEquipWeapon, canLearn, spellLevel } from '../src/core/ff1psp/save.ts';
import { ARMOR, SPELLS, WEAPONS } from '../src/core/ff1psp/tables.ts';
import { decryptSavedata, savedataHash } from '../src/core/psp/savedata.ts';
import { sfoFileHash, sfoString, updateSfoHashes } from '../src/core/psp/sfo.ts';
import { detectGames, openSave } from '../src/core/registry.ts';
import { inflate, readZip } from '../src/core/unzip.ts';
import { deflateRawSync } from 'node:zlib';

const KEY = Uint8Array.from(Buffer.from('437BEAA762302FB7C8762C17CFF01460', 'hex'));
const entry = (zip: Uint8Array, name: string) => readZip(zip)!.find((e) => e.name.endsWith(name))!.data;

test('sample: a zip of the save folder that opens, round-trips and has matching hashes', async () => {
  const zip = buildFf1PspSample();
  assert.deepEqual(detectGames(zip).map((m) => m.module.id), ['final-fantasy-psp']);
  const opened = await openSave(zip);
  assert.ok(opened);
  const s = opened.save as Ff1PspSave;
  assert.equal(s.wrapper, 'folder');
  assert.deepEqual(s.usedFiles.map((f) => f.number), [1]);
  assert.deepEqual(s.files[0].party.map((c) => c.name), ['Brom', 'Wren', 'Ivy', 'Oren']);
  assert.deepEqual(s.serialize(), zip);
  const bin = entry(zip, 'SAVE.BIN');
  assert.equal(bin.length, SAVE_BIN_SIZE);
  assert.deepEqual(decryptSavedata(bin, KEY), buildFf1PspPlain());
});

test('sample: every character can wear their gear and know their spells', () => {
  for (const c of new Ff1PspSave(buildFf1PspPlain()).files[0].party) {
    for (let g = 0; g < 5; g++) if (c.gear(g)) assert.ok(c.canWear(g, c.gear(g)), `${c.name} gear ${g}`);
    for (const sp of c.spells) assert.ok(canLearn(c.cls, sp), `${c.name} ${SPELLS[sp - 1]}`);
    for (let lv = 1; lv <= 8; lv++) assert.ok(c.spells.filter((sp) => spellLevel(sp) === lv).length <= 3, `${c.name} level ${lv}`);
  }
});

test('edits are encrypted back and PARAM.SFO gets the new hashes', () => {
  const s = new Ff1PspSave(buildFf1PspSample());
  const f = s.files[0];
  f.gil = 123_456;
  f.party[0].name = 'Cid';
  f.party[0].level = 50;
  f.party[2].setStat('int', 99);
  f.setCount('item', 1, 99);
  f.setKeyItem(11, true);
  const out = s.serialize();
  const plain = decryptSavedata(entry(out, 'SAVE.BIN'), KEY);
  assert.ok(plausiblePlain(plain));
  const again = new Ff1PspSave(out).files[0];
  assert.equal(again.gil, 123_456);
  assert.equal(again.party[0].name, 'Cid');
  assert.equal(again.party[0].level, 50);
  assert.equal(again.party[2].stat('int'), 99);
  assert.equal(again.count('item', 1), 99);
  assert.ok(again.hasKeyItem(11));
  // The SFO's hash for SAVE.BIN changed with the file, and the SFO hashes were redone over the new SFO.
  const sfo = entry(out, 'PARAM.SFO');
  assert.notDeepEqual(sfoFileHash(sfo, 'SAVE.BIN'), sfoFileHash(entry(buildFf1PspSample(), 'PARAM.SFO'), 'SAVE.BIN'));
  assert.deepEqual(updateSfoHashes(sfo, 'SAVE.BIN', sfoFileHash(sfo, 'SAVE.BIN')!), sfo);
});

test('SAVE.BIN on its own and the decrypted data both open', () => {
  const bin = entry(buildFf1PspSample(), 'SAVE.BIN');
  const fromBin = new Ff1PspSave(bin);
  assert.equal(fromBin.wrapper, 'savebin');
  assert.match(fromBin.loadNote() ?? '', /PPSSPP/);
  fromBin.files[0].gil = 7;
  const out = fromBin.serialize();
  assert.equal(out.length, SAVE_BIN_SIZE);
  assert.equal(new Ff1PspSave(out).files[0].gil, 7);

  const plain = buildFf1PspPlain();
  const s = new Ff1PspSave(plain);
  assert.equal(s.wrapper, 'plain');
  assert.equal(s.serialize().length, PLAIN_SIZE);
});

test('other files are not taken', () => {
  assert.equal(openFf1Psp(new Uint8Array(PLAIN_SIZE)), null);
  assert.equal(openFf1Psp(new Uint8Array(SAVE_BIN_SIZE)), null);
  assert.equal(openFf1Psp(new Uint8Array(8192)), null);
  const bad = buildFf1PspPlain();
  bad[4 + 0x24] = 0; // level 0
  assert.equal(openFf1Psp(bad), null);
});

test('inventory: counts, one stack per item, new items at the end', () => {
  const f = new Ff1PspSave(buildFf1PspPlain()).files[0];
  const before = f.items.length;
  f.setCount('weapon', WEAPONS.indexOf('Excalibur') + 1, 1);
  assert.equal(f.items.length, before + 1);
  assert.deepEqual(f.items.at(-1), { cat: 'weapon', id: WEAPONS.indexOf('Excalibur') + 1, count: 1 });
  f.setCount('item', 1, 0);
  assert.equal(f.count('item', 1), 0);
  assert.equal(f.items.length, before);
  f.setCount('armor', ARMOR.indexOf('Ribbon') + 1, 500);
  assert.equal(f.count('armor', ARMOR.indexOf('Ribbon') + 1), 99);
});

test('magic: three spells per level, kept grouped by level', () => {
  const c = new Ff1PspSave(buildFf1PspPlain()).files[0].party[2]; // White Mage
  assert.equal(c.setKnows(SPELLS.indexOf('Blink') + 1, true), false); // level 1 already has three
  assert.equal(c.setKnows(SPELLS.indexOf('Dia') + 1, false), true);
  assert.equal(c.setKnows(SPELLS.indexOf('Blink') + 1, true), true);
  assert.equal(c.setKnows(SPELLS.indexOf('Curaga') + 1, true), true);
  const levels = c.spells.map(spellLevel);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  assert.equal(spellLevel(SPELLS.indexOf('Flare') + 1), 8);
});

test('names use the name screen letters', () => {
  const c = new Ff1PspSave(buildFf1PspPlain()).files[0].party[0];
  c.name = 'Sarisa';
  assert.equal(c.name, 'Sarisa');
  c.name = 'Too long name';
  assert.equal(c.name, 'Toolon'); // no spaces on the name screen
  assert.equal(asSaved('Zoë'), 'Zo');
});

test('equip and learn tables agree with the game', () => {
  const w = (n: string) => WEAPONS.indexOf(n) + 1, a = (n: string) => ARMOR.indexOf(n) + 1, sp = (n: string) => SPELLS.indexOf(n) + 1;
  assert.equal(canEquipWeapon(6, w('Excalibur')), true); // Knight
  assert.equal(canEquipWeapon(0, w('Excalibur')), false); // Warrior
  assert.equal(canEquipArmor(4, a('Iron Armor')), false); // White Mage
  assert.equal(canEquipArmor(5, a('Ribbon')), true);
  assert.equal(canLearn(6, sp('Cure')), true); // Knights learn low white magic
  assert.equal(canLearn(6, sp('Dia')), false);
  assert.equal(canLearn(7, sp('Fire')), true); // Ninjas learn low black magic
  assert.equal(canLearn(4, sp('Fire')), false);
});

test('diff names what changed', () => {
  const before = new Ff1PspSave(buildFf1PspPlain());
  const s = new Ff1PspSave(buildFf1PspPlain());
  const f = s.files[0];
  f.party[0].level = 30;
  f.party[0].setGear(0, WEAPONS.indexOf('Excalibur') + 1);
  f.gil = 1;
  const groups = s.describeChanges(before);
  assert.deepEqual(groups.map((g) => g.title), ['Brom', 'Items']);
  assert.ok(groups[0].lines.includes('Level: 24 → 30'));
  assert.ok(groups[0].lines.includes('Weapon: Flame Sword → Excalibur'));
  assert.ok(groups[1].lines.includes('Gil: 18,420 → 1'));
});

test('zip reader handles deflated entries', () => {
  const text = new TextEncoder().encode('Final Fantasy '.repeat(200));
  assert.deepEqual(inflate(new Uint8Array(deflateRawSync(text)), text.length), text);
  const sfo = buildSfo();
  assert.equal(sfoString(sfo, 'SAVEDATA_DIRECTORY'), 'ULUS10251DATA00');
  assert.equal(savedataHash(new Uint8Array(32), 1).length, 16);
});

// Real saves are never committed. Point FF1PSP_DIR at an unzipped save folder to check one locally.
const real = process.env.FF1PSP_DIR;
test('a real save folder decrypts, opens and re-encrypts to the same bytes', { skip: !real || !existsSync(`${real}/SAVE.BIN`) }, () => {
  const bin = new Uint8Array(readFileSync(`${real}/SAVE.BIN`));
  const sfo = new Uint8Array(readFileSync(`${real}/PARAM.SFO`));
  const s = new Ff1PspSave(bin);
  assert.ok(s.usedFiles.length > 0);
  assert.deepEqual(s.serialize(), bin);
  // Every character's gear and spells are allowed by the tables.
  for (const f of s.usedFiles) for (const c of f.party) {
    for (let g = 0; g < 5; g++) if (c.gear(g)) assert.ok(c.canWear(g, c.gear(g)), `${c.name} gear ${g}`);
    for (const sp of c.spells) assert.ok(canLearn(c.cls, sp), `${c.name} ${SPELLS[sp - 1]}`);
  }
  assert.ok(sfoFileHash(sfo, 'SAVE.BIN'));
});
