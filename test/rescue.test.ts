import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checksum8, Gen1Save } from '../src/core/gen1/save.ts';
import { blankGen1Save } from '../src/core/gen1/sample.ts';
import { Gen2Save } from '../src/core/gen2/save.ts';
import { blankGen2Save } from '../src/core/gen2/sample.ts';
import { Gen3Save } from '../src/core/gen3/save.ts';
import { blankGen3Save } from '../src/core/gen3/sample.ts';

test('Gen 1: send me home puts the player in the bedroom (Red\'s House 2F) on foot, keeping the checksum', () => {
  for (const yellow of [false, true]) {
    const d = blankGen1Save('ASH', 'GARY', yellow);
    d[0x260a] = 0x01; // Viridian City
    d[0x29ac] = 2; // surfing
    d[0x3523] = checksum8(d, 0x2598, 0x3523);
    const s = new Gen1Save(d);
    const before = s.serialize();
    assert.equal(before[0x260a], 0x01);
    s.sendHome = true;
    const out = s.serialize();
    assert.equal(out[0x260a], 0x26, 'wCurMap = REDS_HOUSE_2F');
    assert.equal(out[0x29ac], 0, 'walking');
    assert.ok(Gen1Save.checksumValid(out));
    // The player's own data is untouched.
    assert.deepEqual(out.subarray(0x2598, 0x2607), before.subarray(0x2598, 0x2607));
  }
});

test('Gen 2: send me home sets the spawn-after-Champion warp to New Bark Town and the player on foot', () => {
  for (const game of ['gs', 'crystal'] as const) {
    const s = new Gen2Save(blankGen2Save(game));
    s.sendHome = true;
    const out = s.serialize();
    assert.equal(out[0x2043], 1, 'wSpawnAfterChampion = SPAWN_LANCE');
    assert.equal(out[game === 'gs' ? 0x24ea : 0x24eb], 0, 'wPlayerState = normal');
    assert.ok(new Gen2Save(out));
  }
});

test('Gen 3: send me home copies the last heal location into the continue warp and sets its flag', () => {
  for (const game of ['rs', 'emerald'] as const) {
    const s = new Gen3Save(blankGen3Save(game), game) as any;
    s.sb1.set([3, 5, 0xff, 0, 7, 0, 8, 0], 0x1c);
    const s2 = new Gen3Save(s.serialize(), game) as any;
    s2.sendHome = true;
    const out = new Gen3Save(s2.serialize(), game) as any;
    assert.deepEqual([...out.sb1.subarray(0x0c, 0x14)], [3, 5, 0xff, 0, 7, 0, 8, 0]);
    assert.equal(out.sb2[0x09] & 1, 1);
  }
});
