import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildFf2PspSample } from '../src/core/ff2psp/sample.ts';
import { buildFf3DsSample } from '../src/core/ff3ds/sample.ts';
import { Ff3DsSave, JOBS, MAX_GIL, itemName, levelFor } from '../src/core/ff3ds/save.ts';
import { ARMOR, ITEMS, SPELLS, WEAPONS } from '../src/core/ff3ds/tables.ts';
import { PSP_NAMES } from '../src/core/ff3ds/text.ts';
import { PLAIN_SIZE, SAVE_FILE_SIZE, openFf3Psp, plausiblePlain } from '../src/core/ff3psp/container.ts';
import { SAMPLE_FOLDER, buildFf3PspPlain, buildFf3PspSample } from '../src/core/ff3psp/sample.ts';
import { Ff3PspSave, PSP_LAYOUT } from '../src/core/ff3psp/save.ts';
import { decryptSavedata } from '../src/core/psp/savedata.ts';
import { sfoFileHash, sfoString } from '../src/core/psp/sfo.ts';
import { detectGames, openSave } from '../src/core/registry.ts';
import { readZip } from '../src/core/unzip.ts';
import { makeZipFiles } from '../src/core/zip.ts';

const KEY = Uint8Array.from(Buffer.from('BE041579E29FC790DF308ACE331AFF6B', 'hex'));
const ALL = [...ITEMS, ...WEAPONS, ...ARMOR, ...SPELLS];
const id = (name: string) => ALL.find((x) => x[1] === name)![0];
const job = (name: string) => JOBS.indexOf(name);
const entry = (zip: Uint8Array, name: string) => readZip(zip)!.find((e) => e.name.endsWith(name))!.data;
const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
/** Where character n's record starts, and where its fields after the name count from. */
const rec = (n: number) => PSP_LAYOUT.party + n * PSP_LAYOUT.stride;
const fields = (n: number) => rec(n) + PSP_LAYOUT.shift;

test('sample: a zip of the save folder that opens as Final Fantasy III (PSP) only and round-trips', async () => {
  const zip = buildFf3PspSample();
  assert.deepEqual(detectGames(zip).map((m) => m.module.id), ['final-fantasy-3-psp']);
  const s = (await openSave(zip))!.save as Ff3PspSave;
  assert.equal(s.wrapper, 'folder');
  assert.equal(s.loadNote(), null);
  assert.equal(s.usedSlots.length, 1);
  assert.deepEqual(s.summary(), [{ label: 'SAVE', value: 'Luneth · L12 · 4,820 gil' }]);
  const slot = s.usedSlots[0];
  assert.deepEqual(slot.party.map((c) => c.name), ['Luneth', 'Arc', 'Refia', 'Ingus']);
  assert.deepEqual(slot.party.map((c) => c.jobName), ['Warrior', 'Black Mage', 'White Mage', 'Monk']);
  assert.deepEqual(slot.party.map((c) => c.hero), [0, 1, 2, 3]);
  assert.equal(slot.gil, 4_820);
  assert.equal(slot.seconds, 3 * 3600 + 25 * 60);
  assert.deepEqual(slot.jobsOpen.map((j) => JOBS[j]), ['Freelancer', 'Warrior', 'Monk', 'White Mage', 'Black Mage', 'Red Mage', 'Thief']);
  assert.equal(slot.count(id('Potion')), 14);
  assert.equal(slot.stored(id('Leather Shield')), 2);
  assert.deepEqual(slot.keyItems.map(itemName), ['Folding Canoe']);
  assert.equal(itemName(slot.party[0].gear(0)), 'Longsword');
  assert.equal(slot.party[1].gear(1), 0, 'an empty hand (FFFF on the PSP)');
  assert.deepEqual(slot.party[1].spells.map(itemName), ['Fire', 'Blizzard', 'Sleep', 'Thunder']);
  for (const c of slot.party) assert.equal(levelFor(c.exp), c.level);
  assert.equal(sfoString(entry(zip, 'PARAM.SFO'), 'SAVEDATA_DIRECTORY'), SAMPLE_FOLDER);
  assert.deepEqual(decryptSavedata(entry(s.serialize(), 'PLAYDATA.BIN'), KEY), buildFf3PspPlain());
});

test('the PSP keeps the DS’s game in its own places: same tables, longer names, -999 for no spell, FFFF for no hand', () => {
  const ds = new Ff3DsSave(buildFf3DsSample()).usedSlots[0];
  const psp = new Ff3PspSave(buildFf3PspPlain()).usedSlots[0];
  // The same made-up game reads the same through both layouts.
  psp.party.forEach((c, i) => {
    const d = ds.party[i];
    assert.deepEqual([c.name, c.job, c.level, c.exp, c.hp, c.maxHp], [d.name, d.job, d.level, d.exp, d.hp, d.maxHp]);
    assert.deepEqual([0, 1, 2, 3, 4].map((g) => c.gear(g)), [0, 1, 2, 3, 4].map((g) => d.gear(g)));
    assert.deepEqual(c.spells, d.spells);
    assert.deepEqual(JOBS.map((_, j) => c.jobLevel(j)), JOBS.map((_, j) => d.jobLevel(j)));
  });
  assert.deepEqual(psp.bag, ds.bag);
  const s = new Ff3PspSave(buildFf3PspPlain());
  const [luneth, arc, refia] = s.usedSlots[0].party;
  luneth.name = 'Kaito 9!Long';
  assert.equal(luneth.name, 'Kaito9!L', 'eight letters on the PSP');
  assert.equal(PSP_NAMES.asSaved('Lé on'), 'Lon');
  refia.forget(id('Cure'));
  luneth.setGear(1, 0);
  luneth.setGear(3, 0);
  arc.setMp(1, 2);
  const out = s.serialize();
  assert.equal(PSP_NAMES.decode(out.subarray(rec(0) + 1, rec(0) + 26)), 'Kaito9!L');
  assert.equal(out[rec(0) + 9], 0, 'NUL after the name');
  assert.equal(u32(out, fields(2) + 0x9c + 4), 0xfffffc19, 'a spell place emptied holds -999');
  assert.equal(u16(out, fields(0) + 0x86 + 4), 0xffff, 'an emptied hand holds FFFF');
  assert.equal(u16(out, fields(0) + 0x86 + 12), 0xff9d, 'emptied armor holds FF9D');
  assert.deepEqual([out[fields(1) + 0x20], out[fields(1) + 0x30]], [2, 2], 'the current MP is kept twice, as the game does');
  // A name someone typed in kana on a PSP keyboard reads as it is.
  const kana = buildFf3PspPlain();
  kana.set([...new TextEncoder().encode('ルーネス'), 0], rec(0) + 1);
  assert.equal(new Ff3PspSave(kana).usedSlots[0].party[0].name, 'ルーネス');
});

test('edits are encrypted back and PARAM.SFO gets the new hash', () => {
  const zip = buildFf3PspSample();
  const s = new Ff3PspSave(zip);
  const slot = s.usedSlots[0];
  const [luneth, arc] = slot.party;
  luneth.name = 'Kieron';
  luneth.level = 99;
  arc.changeJob(job('White Mage'), slot);
  arc.setAilment(0x40, true);
  slot.gil = 99_999_999;
  slot.setJobOpen(job('Ninja'), true);
  slot.setJobOpen(job('Thief'), false);
  slot.add(id('Elixir'), 99);
  const out = s.serialize();
  const plain = decryptSavedata(entry(out, 'PLAYDATA.BIN'), KEY);
  assert.ok(plausiblePlain(plain));
  assert.equal(plain[PSP_LAYOUT.jobs + job('Ninja')], 1);
  assert.equal(plain[PSP_LAYOUT.jobs + job('Thief')], 0);
  assert.equal(plain[fields(1) + 0x43], 0x40, 'the ailments byte, 0x0C after the DS’s');
  assert.equal(u32(plain, PSP_LAYOUT.gil), MAX_GIL);
  const again = new Ff3PspSave(out);
  const a = again.usedSlots[0];
  assert.equal(a.party[0].name, 'Kieron');
  assert.equal(a.party[0].level, 99);
  assert.equal(a.party[1].jobName, 'White Mage');
  assert.equal(a.count(id('Elixir')), 99);
  const changes = again.describeChanges(new Ff3PspSave(zip)).flatMap((g) => g.lines);
  assert.ok(changes.includes('Name: Luneth → Kieron'));
  assert.ok(changes.includes('Now Poison'));
  assert.ok(changes.includes('Job menu: Ninja added'));
  assert.notDeepEqual(sfoFileHash(entry(out, 'PARAM.SFO'), 'PLAYDATA.BIN'), sfoFileHash(entry(zip, 'PARAM.SFO'), 'PLAYDATA.BIN'));
});

test('PLAYDATA.BIN on its own and the decrypted data both open', () => {
  const bin = entry(buildFf3PspSample(), 'PLAYDATA.BIN');
  const s = new Ff3PspSave(bin);
  assert.equal(s.wrapper, 'savefile');
  assert.match(s.loadNote() ?? '', /PPSSPP/);
  s.usedSlots[0].gil = 7;
  const out = s.serialize();
  assert.equal(out.length, SAVE_FILE_SIZE);
  assert.deepEqual(out.subarray(0, 16), bin.subarray(0, 16), 'the file header is kept');
  assert.equal(new Ff3PspSave(out).usedSlots[0].gil, 7);
  const plain = new Ff3PspSave(buildFf3PspPlain());
  assert.equal(plain.wrapper, 'plain');
  assert.equal(plain.serialize().length, PLAIN_SIZE);
});

test('other files are not taken for III PSP, nor it for them', () => {
  assert.equal(openFf3Psp(new Uint8Array(PLAIN_SIZE)), null);
  assert.equal(openFf3Psp(new Uint8Array(SAVE_FILE_SIZE)), null);
  assert.ok(!detectGames(buildFf3DsSample()).some((m) => m.module.id === 'final-fantasy-3-psp'));
  assert.ok(!detectGames(buildFf3PspSample()).some((m) => m.module.id === 'final-fantasy-3-ds'));
  assert.ok(!detectGames(buildFf2PspSample()).some((m) => m.module.id === 'final-fantasy-3-psp'));
  // The same folder under another game's code is not this game's.
  const renamed = readZip(buildFf3PspSample())!.map((e) => ({
    name: e.name,
    data: e.name.endsWith('PARAM.SFO') ? withDir(e.data, 'ULUS1026300') : e.data,
  }));
  assert.equal(openFf3Psp(makeZipFiles(renamed)), null);
});

function withDir(sfo: Uint8Array, dir: string): Uint8Array {
  const out = sfo.slice();
  out.set(new TextEncoder().encode(`${dir}\0`), Buffer.from(out).indexOf(SAMPLE_FOLDER));
  return out;
}

// Real saves are never committed. FF3_PSP_SAVE=<PLAYDATA.BIN or a zip of the save folder> runs this on one.
const real = process.env.FF3_PSP_SAVE;
test('a real save decrypts, opens and re-encrypts to the same bytes', { skip: real && existsSync(real) ? false : 'set FF3_PSP_SAVE to a real save to run' }, () => {
  const d = new Uint8Array(readFileSync(real!));
  const s = new Ff3PspSave(d);
  for (const c of s.usedSlots[0].party) {
    assert.equal(levelFor(c.exp), c.level);
    assert.ok(c.name.length >= 1 && c.name.length <= 8);
    for (let g = 0; g < 5; g++) assert.ok(!c.gear(g) || itemName(c.gear(g)) !== `Item ${c.gear(g)}`);
    for (const sp of c.spells) assert.ok(itemName(sp) !== `Item ${sp}`);
  }
  const out = s.serialize();
  if (s.wrapper !== 'folder') return assert.deepEqual(out, d);
  for (const e of readZip(d)!) {
    if (!e.name.endsWith('PARAM.SFO')) assert.deepEqual(entry(out, e.name), e.data, e.name);
    else assert.deepEqual(sfoFileHash(entry(out, e.name), 'PLAYDATA.BIN'), sfoFileHash(e.data, 'PLAYDATA.BIN'));
  }
});
