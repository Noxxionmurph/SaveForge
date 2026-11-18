import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { detectGames } from '../src/core/registry.ts';
import { openPrFile } from '../src/core/ffpr/crypto.ts';
import { DATA as FF1 } from '../src/core/ffpr/data-ff1.ts';
import { DATA as FF2 } from '../src/core/ffpr/data-ff2.ts';
import { DATA as FF3 } from '../src/core/ffpr/data-ff3.ts';
import type { PrData } from '../src/core/ffpr/data.ts';
import { openPr } from '../src/core/ffpr/file.ts';
import { buildSample } from '../src/core/ffpr/sample.ts';
import { ORB_NAMES, PrSave, levelFor } from '../src/core/ffpr/save.ts';

const ALL: PrData[] = [FF1, FF2, FF3];
const id = (list: readonly (readonly [number, string, ...unknown[]])[], name: string) => {
  const hit = list.find((x) => x[1] === name);
  assert.ok(hit, `no ${name}`);
  return hit[0];
};
const reopen = (s: PrSave) => new PrSave(s.serialize(), s.data);
/** The slot's JSON, one level of nesting unpacked, for comparing what changed. */
const jsonOf = (file: Uint8Array) => openPrFile(file).json;

test('each sample opens as its own game and nothing else', () => {
  const ids = { ff1: 'final-fantasy-pr', ff2: 'final-fantasy-2-pr', ff3: 'final-fantasy-3-pr' };
  for (const d of ALL) {
    const { data, fileName } = buildSample(d);
    assert.equal(fileName.length, 44);
    assert.deepEqual(detectGames(data).map((m) => m.module.id), [ids[d.game]]);
    const s = new PrSave(data, d);
    assert.equal(s.members.length, 4);
    assert.throws(() => new PrSave(data, ALL.find((x) => x !== d)!), /from Final Fantasy/);
  }
});

test('an untouched save writes back the same JSON, and an edit changes only what it touches', () => {
  for (const d of ALL) {
    const { data } = buildSample(d);
    const json = jsonOf(data);
    assert.equal(jsonOf(new PrSave(data, d).serialize()), json);
    const s = new PrSave(data, d);
    s.gil = 123_456;
    const after = jsonOf(s.serialize());
    const gil = String(new PrSave(data, d).gil);
    assert.equal(after, json.replace(`\\"owendGil\\":${gil},`, '\\"owendGil\\":123456,'));
  }
});

test('Final Fantasy I: class, level, HP, charges, stats, gear, bag, key items and Orbs', () => {
  const s = new PrSave(buildSample(FF1).data, FF1);
  const [brom, , ivy] = s.members;
  brom.level = 30;
  assert.equal(brom.exp, FF1.exp[29], 'Exp moves into the new level');
  brom.exp = FF1.exp[29] + 5;
  brom.maxHp = 650;
  brom.hp = 9999;
  brom.setStat('strength', 55);
  brom.changeJob(7);
  brom.setGear(1, id(FF1.gear, 'Excalibur'));
  brom.setGear(2, 0);
  ivy.setMaxCharge(1, 9);
  ivy.setCharge(1, 7);
  ivy.setCondition(s.koId, true);
  s.setCount(id(FF1.items, 'Potion'), 0);
  s.setCount(id(FF1.items, 'Elixir'), 9);
  s.setCount(id(FF1.gear, 'Masamune'), 1);
  s.setKeyItem(id(FF1.keyItems, 'Lute'), false);
  s.setKeyItem(id(FF1.keyItems, 'Levistone'), true);
  s.setOrb(3, true);
  const r = reopen(s);
  const [b2, , i2] = r.members;
  assert.deepEqual([b2.level, b2.exp, b2.maxHp, b2.hp, b2.stat('strength'), b2.jobName], [30, FF1.exp[29] + 5, 650, 650, 55, 'Knight']);
  assert.deepEqual([b2.gear(1), b2.gear(2)], [id(FF1.gear, 'Excalibur'), 0]);
  assert.deepEqual([i2.maxCharge(1), i2.charge(1), i2.fallen, i2.hp], [9, 7, true, 0]);
  assert.deepEqual([r.count(id(FF1.items, 'Potion')), r.count(id(FF1.items, 'Elixir')), r.count(id(FF1.gear, 'Masamune'))], [0, 9, 1]);
  assert.deepEqual([r.hasKeyItem(id(FF1.keyItems, 'Lute')), r.hasKeyItem(id(FF1.keyItems, 'Levistone'))], [false, true]);
  assert.deepEqual(ORB_NAMES.map((_, i) => r.orb(i)), [true, false, false, true]);
  i2.setCondition(r.koId, false);
  assert.equal(i2.hp, 1, 'brought back with 1 HP');
  const lines = r.describeChanges(new PrSave(buildSample(FF1).data, FF1)).flatMap((g) => g.lines);
  for (const line of ['Class: Warrior → Knight', 'Level: 18 → 30', 'Weapon: Saber → Excalibur', 'Shield: Iron Shield → Nothing',
    'Level 1 charges: 4/4 → 7/9', 'Masamune: 0 → 1', 'Lost Lute', 'Got Levistone', 'Wind Orb lit', 'Strength: 31 → 55']) {
    assert.ok(lines.includes(line), `missing "${line}" in ${JSON.stringify(lines)}`);
  }
});

test('Final Fantasy II: weapon skills, spells kept in step across the save, MP and key terms', () => {
  const s = new PrSave(buildSample(FF2).data, FF2);
  const [firion, maria] = s.members;
  const fire = FF2.spellGroups!.findIndex((g) => g[2] === 'Fire');
  const cure = FF2.spellGroups!.findIndex((g) => g[2] === 'Cure');
  const flare = FF2.spellGroups!.findIndex((g) => g[2] === 'Flare');
  firion.setSkillLevel(0, 16);
  assert.equal(firion.skillLevel(0), 16);
  firion.setSpell(fire, 9);
  firion.setSpell(cure, 0);
  firion.setSpell(flare, 1);
  maria.maxMp = 400;
  maria.mp = 400;
  s.setKeyTerm(id(FF2.keyTerms!, 'Wild Rose'), false);
  s.setKeyTerm(id(FF2.keyTerms!, 'Ultima Tome'), true);
  const r = reopen(s);
  const [f2, m2] = r.members;
  assert.deepEqual(f2.spells, [[fire, 9], [flare, 1]]);
  assert.deepEqual([m2.mp, m2.maxMp], [400, 400]);
  assert.deepEqual([r.hasKeyTerm(id(FF2.keyTerms!, 'Wild Rose')), r.hasKeyTerm(id(FF2.keyTerms!, 'Ultima Tome'))], [false, true]);
  // The spell lives in three places (abilityList, the Magic command's list, the learned order): all of them agree.
  const doc = JSON.parse(jsonOf(r.serialize()));
  const chars = JSON.parse(JSON.parse(doc.userData).ownedCharacterList).target.map((c: string) => JSON.parse(c));
  const c = chars[0];
  const abilities = JSON.parse(c.abilityList).target.map((a: string) => JSON.parse(a));
  const magic = JSON.parse(JSON.parse(c.abilityDictionary).values[0]).target.map((a: string) => JSON.parse(a));
  const order = JSON.parse(c.additionOrderOwnedAbilityIds).target;
  const [fireAbility, fireContent] = FF2.spellGroups![fire];
  const want = [{ abilityId: fireAbility + 8, contentId: fireContent + 8, skillLevel: FF2.exp[8] }, { abilityId: FF2.spellGroups![flare][0], contentId: FF2.spellGroups![flare][1], skillLevel: 0 }];
  assert.deepEqual(abilities, want);
  assert.deepEqual(magic, want);
  assert.deepEqual(order, want.map((w) => w.contentId));
  assert.ok(JSON.parse(JSON.parse(doc.userData).learnedAbilityList).target.includes(fireAbility + 8));
  // A character with no spells gets the Magic command's list made for the first one.
  const lines = r.describeChanges(new PrSave(buildSample(FF2).data, FF2)).flatMap((g) => g.lines);
  for (const line of ['Sword: 7 → 16', 'Fire: Lv 2 → Lv 9', 'Forgot Cure', 'Learned Flare (Lv 1)', 'MP: 74/74 → 400/400', 'Forgot “Wild Rose”', 'Learned “Ultima Tome”']) {
    assert.ok(lines.includes(line), `missing "${line}" in ${JSON.stringify(lines)}`);
  }
});

test('Final Fantasy II: no more than 16 spells', () => {
  const s = new PrSave(buildSample(FF2).data, FF2);
  const c = s.members[2];
  let learned = c.spells.length;
  for (let g = 0; g < FF2.spellGroups!.length; g++) if (!c.spellLevel(g) && c.setSpell(g, 1)) learned++;
  assert.equal(learned, 16);
  assert.equal(reopen(s).members[2].spells.length, 16);
});

test('Final Fantasy III: job change sends gear back to the bag, job levels, jobs handed out, arrows', () => {
  const s = new PrSave(buildSample(FF3).data, FF3);
  const [luneth, arc] = s.members;
  const blackMage = FF3.jobs.indexOf('Black Mage') + 1;
  const ninja = FF3.jobs.indexOf('Ninja') + 1;
  const longsword = id(FF3.gear, 'Longsword');
  const moved = luneth.changeJob(blackMage);
  assert.ok(moved.includes(longsword), 'a Black Mage can’t hold a Longsword');
  assert.equal(s.count(longsword), 1);
  luneth.setJobLevel(blackMage, 40);
  s.setJobOpen(ninja, true);
  s.setJobOpen(FF3.jobs.indexOf('Warrior') + 1, false); // nobody is a Warrior now
  s.setJobOpen(FF3.jobs.indexOf('Monk') + 1, false); // Arc is, so it stays
  arc.setGear(1, id(FF3.gear, 'Bow'));
  arc.setGear(2, id(FF3.gear, 'Iron Arrow'));
  arc.setGearCount(2, 55);
  const r = reopen(s);
  const [l2, a2] = r.members;
  assert.equal(l2.jobName, 'Black Mage');
  assert.equal(l2.jobLevel(blackMage), 40);
  assert.ok(r.jobOpen(ninja) && !r.jobOpen(FF3.jobs.indexOf('Warrior') + 1) && r.jobOpen(FF3.jobs.indexOf('Monk') + 1));
  assert.equal(l2.jobLevel(ninja), 1, 'everyone gets an entry for a job handed out');
  assert.deepEqual([a2.gear(1), a2.gear(2), a2.gearCount(2)], [id(FF3.gear, 'Bow'), id(FF3.gear, 'Iron Arrow'), 55]);
});

test('levelFor reads totals per level', () => {
  assert.equal(levelFor(FF2.exp, 0), 1);
  assert.equal(levelFor(FF2.exp, 19), 1);
  assert.equal(levelFor(FF2.exp, 20), 2);
  assert.equal(levelFor(FF2.exp, 99999), 16);
});

// Real files: set FFPR_DIR to a folder of Pixel Remaster saves (copies). Every Final Fantasy I-III slot opens, and an edit
// to the gil leaves every other part of the file as it was.
const dir = process.env.FFPR_DIR;
test('real Pixel Remaster slots open in the editor and keep what wasn’t edited', { skip: !dir || !existsSync(dir) }, () => {
  const files: string[] = [];
  const walk = (p: string) => { for (const e of readdirSync(p, { withFileTypes: true })) e.isDirectory() ? walk(join(p, e.name)) : files.push(join(p, e.name)); };
  walk(dir!);
  let opened = 0;
  for (const f of files) {
    const data = new Uint8Array(readFileSync(f));
    const game = openPr(data)?.game;
    const d = ALL.find((x) => x.game === game);
    if (!d) continue;
    opened++;
    const s = new PrSave(data, d);
    const json = jsonOf(data);
    assert.equal(jsonOf(s.serialize()), json);
    s.gil = 4321;
    assert.equal(jsonOf(s.serialize()).replace(/\\"owendGil\\":\d+,/, ''), json.replace(/\\"owendGil\\":\d+,/, ''));
  }
  assert.ok(opened > 0);
});
