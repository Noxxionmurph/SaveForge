import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Gen1Save } from '../src/core/gen1/save.ts';
import { Gen2Save } from '../src/core/gen2/save.ts';
import { Gen3Save } from '../src/core/gen3/save.ts';
import { buildSampleSave as yellow, blankGen1Save } from '../src/core/gen1/sample.ts';
import { buildSampleSave as gen2, blankGen2Save } from '../src/core/gen2/sample.ts';
import { buildSampleSave as gen3, blankGen3Save } from '../src/core/gen3/sample.ts';
import { writeGen1HallOfFame } from '../src/core/gen1/hof.ts';
import { writeGen2HallOfFame } from '../src/core/gen2/hof.ts';
import { writeGen3HallOfFame } from '../src/core/gen3/hof.ts';
import { speciesOf } from '../src/core/gen3/data.ts';

test('a new game has an empty Hall of Fame in every generation', () => {
  assert.deepEqual(new Gen1Save(blankGen1Save()).hallOfFame.entries, []);
  assert.deepEqual(new Gen2Save(blankGen2Save('crystal'), 'crystal').hallOfFame.entries, []);
  assert.deepEqual(new Gen3Save(blankGen3Save('emerald'), 'emerald').hallOfFame.entries, []);
});

test('Gen 1 reads its teams newest first, and numbers them after the ones the game dropped', () => {
  const s = new Gen1Save(yellow());
  assert.equal(s.hallOfFame.entries.length, 1);
  assert.deepEqual(s.hallOfFame.entries[0].mons[0], { dex: 25, level: 54, name: 'SPARKY' });
  const d = blankGen1Save();
  const teams = Array.from({ length: 52 }, (_, i) => [{ dex: 1 + (i % 150), level: 50 + (i % 10), name: `T${i}` }]);
  writeGen1HallOfFame(d, teams);
  const hof = new Gen1Save(d).hallOfFame;
  assert.equal(hof.entries.length, 50);
  assert.equal(hof.total, 52);
  assert.equal(hof.entries[0].win, 52);
  assert.equal(hof.entries[0].mons[0].name, 'T51');
  assert.equal(hof.entries[49].win, 3);
});

test('Gen 2 reads its teams, with the shiny one marked, in both Crystal and Gold', () => {
  for (const game of ['crystal', 'gs'] as const) {
    const hof = new Gen2Save(gen2(game), game).hallOfFame;
    assert.deepEqual(hof.entries.map((e) => e.win), [2, 1]);
    assert.equal(hof.entries[0].mons.length, 6);
    assert.deepEqual(hof.entries[0].mons.map((m) => !!m.shiny), [false, false, false, false, true, false]);
    assert.equal(hof.entries[1].mons[0].name, 'TYPHLOSION');
  }
});

test('Gen 3 reads its teams in Ruby, Emerald and FireRed, and finds the shiny one', () => {
  for (const game of ['rs', 'emerald', 'frlg'] as const) {
    const hof = new Gen3Save(gen3(game), game).hallOfFame;
    assert.ok(hof.entries.length >= 1, game);
    assert.equal(hof.entries[0].win, hof.total);
  }
  const em = new Gen3Save(gen3('emerald'), 'emerald').hallOfFame;
  assert.deepEqual(em.entries.map((e) => e.win), [2, 1]);
  assert.equal(em.entries[1].mons.length, 6);
  assert.equal(em.entries[0].mons[0].name, 'BLAZE');
  assert.equal(em.entries[0].mons[1].shiny, true);
  assert.equal(em.entries[0].mons[0].shiny, false);
});

test('Gen 3 drops the oldest teams past 50 and keeps counting from the game stat', () => {
  const s = new Gen3Save(blankGen3Save('emerald'), 'emerald');
  s.gameStats[10] = 60;
  const d = s.serialize();
  writeGen3HallOfFame(d, 1, Array.from({ length: 50 }, (_, i) => [{ species: speciesOf(1 + i), level: 5 + i, name: `N${i}` }]));
  const hof = new Gen3Save(d, 'emerald').hallOfFame;
  assert.equal(hof.entries.length, 50);
  assert.equal(hof.entries[0].win, 60);
  assert.equal(hof.entries[49].win, 11);
  assert.equal(hof.entries[0].mons[0].level, 54);
});

test('a Hall of Fame the editor never touches comes back byte for byte', () => {
  for (const [bytes, load] of [
    [yellow(), (b: Uint8Array) => new Gen1Save(b)],
    [gen2('crystal'), (b: Uint8Array) => new Gen2Save(b, 'crystal')],
    [gen3('emerald'), (b: Uint8Array) => new Gen3Save(b, 'emerald')],
  ] as const) {
    assert.deepEqual(load(bytes).serialize(), bytes);
  }
});
