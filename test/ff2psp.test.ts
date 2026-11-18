import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FILE_BASE, PLAIN_SIZE, SAVE_FILE_SIZE, openFf2Psp, plausiblePlain } from '../src/core/ff2psp/container.ts';
import { buildFf2PspPlain, buildFf2PspSample } from '../src/core/ff2psp/sample.ts';
import { EMPTY_HAND, Ff2PspSave, ITEMS, KIND, MAX_GIL, PSP_FORMAT, SPELLS } from '../src/core/ff2psp/save.ts';
import { decryptSavedata } from '../src/core/psp/savedata.ts';
import { sfoFileHash, sfoString, updateSfoHashes } from '../src/core/psp/sfo.ts';
import { detectGames, openSave } from '../src/core/registry.ts';
import { readZip } from '../src/core/unzip.ts';
import { makeZipFiles } from '../src/core/zip.ts';

const KEY = Uint8Array.from(Buffer.from('4D4158484954504F494E540001000000', 'hex'));
const entry = (zip: Uint8Array, name: string) => readZip(zip)!.find((e) => e.name.endsWith(name))!.data;
const item = (name: string) => ITEMS.indexOf(name);
const spell = (name: string) => SPELLS.indexOf(name) + 1;

test('sample: a zip of the save folder that opens as Final Fantasy II (PSP) only and round-trips', async () => {
  const zip = buildFf2PspSample();
  assert.deepEqual(detectGames(zip).map((m) => m.module.id), ['final-fantasy-2-psp']);
  const s = (await openSave(zip))!.save as Ff2PspSave;
  assert.equal(s.wrapper, 'folder');
  assert.equal(s.usedFiles.length, 1);
  const f = s.usedFiles[0];
  assert.deepEqual(f.party.map((c) => c.name), ['Firion', 'Maria', 'Guy', 'Leon']);
  assert.deepEqual(f.party.map((c) => c.portrait), ['firion', 'maria', 'guy', 'leon']);
  assert.equal(f.gil, 486_320);
  assert.equal(f.party[3].gear(0), item('Ragnarok'));
  assert.equal(sfoString(entry(zip, 'PARAM.SFO'), 'SAVEDATA_DIRECTORY'), 'ULUS1026300');
  assert.deepEqual(decryptSavedata(entry(s.serialize(), 'SAVEDATA.SAV'), KEY), buildFf2PspPlain());
});

test('edits are encrypted back, the file checksum redone and PARAM.SFO gets the new hashes', () => {
  const s = new Ff2PspSave(buildFf2PspSample());
  const f = s.usedFiles[0];
  const [firion, maria, , leon] = f.party;
  firion.name = 'Kaito';
  firion.setStat('str', 99);
  firion.setGear(0, item('Longinus'));
  firion.setGear(1, 0);
  maria.setSkillLevel(7, 16);
  assert.ok(leon.learn(spell('Revive')));
  f.gil = 99_999_999;
  f.setCount(item('Elixir'), 99);
  f.setCount(item('Destroy Tome'), 1);
  const out = s.serialize();
  const plain = decryptSavedata(entry(out, 'SAVEDATA.SAV'), KEY);
  assert.ok(plausiblePlain(plain));
  assert.ok(PSP_FORMAT.fileOk(plain, 0));
  const a = new Ff2PspSave(out).usedFiles[0];
  assert.equal(a.party[0].name, 'Kaito');
  assert.equal(a.party[0].stat('str'), 99);
  assert.equal(a.party[0].gear(0), item('Longinus'));
  assert.equal(a.party[0].gear(1), EMPTY_HAND);
  assert.equal(a.party[1].skill(7).level, 16);
  assert.ok(a.party[3].knows(spell('Revive')));
  assert.equal(a.gil, MAX_GIL);
  assert.equal(a.count(item('Elixir')), 99);
  assert.equal(a.count(item('Destroy Tome')), 1);
  // Leon's record is the ninth; editing him leaves the eighth (Ricard's place) alone.
  assert.equal(plain[FILE_BASE + PSP_FORMAT.chars + 7 * PSP_FORMAT.charStride + 2], 0);
  const sfo = entry(out, 'PARAM.SFO');
  assert.notDeepEqual(sfoFileHash(sfo, 'SAVEDATA.SAV'), sfoFileHash(entry(buildFf2PspSample(), 'PARAM.SFO'), 'SAVEDATA.SAV'));
  assert.deepEqual(updateSfoHashes(sfo, 'SAVEDATA.SAV', sfoFileHash(sfo, 'SAVEDATA.SAV')!), sfo);
});

test('SAVEDATA.SAV on its own and the decrypted data both open', () => {
  const sav = entry(buildFf2PspSample(), 'SAVEDATA.SAV');
  const fromSav = new Ff2PspSave(sav);
  assert.equal(fromSav.wrapper, 'savefile');
  assert.match(fromSav.loadNote() ?? '', /PPSSPP/);
  fromSav.usedFiles[0].gil = 7;
  const out = fromSav.serialize();
  assert.equal(out.length, SAVE_FILE_SIZE);
  assert.equal(new Ff2PspSave(out).usedFiles[0].gil, 7);
  const s = new Ff2PspSave(buildFf2PspPlain());
  assert.equal(s.wrapper, 'plain');
  assert.equal(s.serialize().length, PLAIN_SIZE);
});

test('other files are not taken', () => {
  assert.equal(openFf2Psp(new Uint8Array(PLAIN_SIZE)), null);
  assert.equal(openFf2Psp(new Uint8Array(SAVE_FILE_SIZE)), null);
  // Final Fantasy I's folder name in PARAM.SFO: not this game.
  const zip = buildFf2PspSample();
  const renamed = readZip(zip)!.map((e) => ({ name: e.name, data: e.name.endsWith('PARAM.SFO') ? sfoWithDir(e.data, 'ULUS10251DATA00') : e.data }));
  assert.equal(openFf2Psp(makeZipFiles(renamed)), null);
  // A file that fails its checksum isn't offered; with none left the save doesn't open.
  const bad = buildFf2PspPlain();
  bad[FILE_BASE + 0x100] ^= 1;
  assert.throws(() => new Ff2PspSave(bad));
});

test('the PSP-only gear and spells have names and places', () => {
  for (const name of ['Ragnarok', 'Artemis Bow', 'Gigantaxe', 'Staff of Light', 'Dragon Claws', 'Gungnir', 'Dancing Dagger', "Abel's Lance", 'Longinus']) {
    assert.ok(KIND.weapon.includes(item(name)), name);
  }
  assert.ok(KIND.tome.includes(item('Destroy Tome')) && KIND.tome.includes(item('Revive Tome')));
  assert.equal(ITEMS[0x92], 'Power Sash');
  assert.deepEqual(SPELLS.slice(-2), ['Destroy', 'Revive']);
});

test('the fourth member shows but stays as the save has it (not checked on the PSP yet)', () => {
  const s = new Ff2PspSave(buildFf2PspSample());
  const f = s.usedFiles[0];
  const before = f.guest;
  assert.ok(!f.canPickGuest);
  f.setGuest(before === 4 ? 5 : 4);
  assert.equal(f.guest, before);
});

function sfoWithDir(sfo: Uint8Array, dir: string): Uint8Array {
  const out = sfo.slice();
  const at = Buffer.from(out).indexOf('ULUS1026300');
  out.set(new TextEncoder().encode(`${dir}\0`), at);
  return out;
}

// Real saves are never committed. FF2_PSP_SAVE=<SAVEDATA.SAV or a zip of the folder> runs this on one.
const real = process.env.FF2_PSP_SAVE;
test('a real save decrypts, opens and re-encrypts to the same bytes', { skip: !real || !existsSync(real) }, () => {
  const d = new Uint8Array(readFileSync(real!));
  const s = new Ff2PspSave(d);
  assert.ok(s.usedFiles.length > 0);
  for (const f of s.usedFiles) for (const c of f.characters) for (let g = 0; g < 5; g++) assert.ok(ITEMS[c.gear(g)] !== undefined);
  const out = s.serialize();
  if (s.wrapper !== 'folder') return assert.deepEqual(out, d);
  // A zip is written afresh, but every file in it comes back the same.
  const names = (z: Uint8Array) => readZip(z)!.map((e) => e.name).sort();
  assert.deepEqual(names(out), names(d));
  // PARAM.SFO's own hashes are worked out afresh, so they're left out; the copy we have of a real save had stale ones.
  for (const e of readZip(d)!) {
    if (!e.name.endsWith('PARAM.SFO')) { assert.deepEqual(entry(out, e.name), e.data, e.name); continue; }
    assert.deepEqual(sfoFileHash(entry(out, e.name), 'SAVEDATA.SAV'), sfoFileHash(e.data, 'SAVEDATA.SAV'));
  }
});
