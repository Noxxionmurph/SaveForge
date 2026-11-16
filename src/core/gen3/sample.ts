// A made-up Ruby or Emerald save, built in code, for the browser checks and tests (nothing here comes from a real game):
// a trainer halfway through Hoenn with four badges, a party that shows off what Gen 3 has (natures, abilities, a held
// item, a shiny, an egg, Unown's "!"), a box with a gap in it, every pocket of the bag and a partly filled Pokédex.
// Built the way the game writes a first save: the game picks the slot by save counter % 2 and rotates the sectors by
// the counter, so the first save (counter 1) is the second slot with sector 0 one place in. The rest stays blank.

import { MOVE_NAMES, UNOWN, findPid, maxPp, speciesName, speciesOf, type Gen3Game } from './data.ts';
import {
  BOX_COUNT, GEN3_LAYOUTS, Gen3Save, SAVE_SIZE, depositInBox, newMon, recalcPartyStats, sectorChecksum, type Gen3Mon,
} from './save.ts';
import { FLY_SPOTS } from './kanto.ts';
import { encodeText } from './text.ts';
import { writeGen3HallOfFame } from './hof.ts';

const SECTOR_DATA = 3968;

/** A tiny fixed random number generator, so the sample comes out the same every time. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 24691) >>> 0; return s / 0x100000000; };
}

/**
 * A brand-new save the game loads: the player standing outside their house in Littleroot Town, default options, an
 * empty party, bag and boxes (named BOX1-BOX14), and Emerald's money key.
 */
export function blankGen3Save(game: Gen3Game = 'rs', trainer = 'MAY', female = true, trainerId = 0x1d2a3b4c): Uint8Array {
  const L = GEN3_LAYOUTS[game];
  const sb2 = new Uint8Array(SECTOR_DATA);
  const sb1 = new Uint8Array(SECTOR_DATA * 4);
  const st = new Uint8Array(SECTOR_DATA * 9);
  sb2.set(encodeText(trainer, 8, undefined, 7), 0);
  sb2[8] = female ? 1 : 0;
  sb2.set([trainerId & 0xff, (trainerId >>> 8) & 0xff, (trainerId >>> 16) & 0xff, trainerId >>> 24], 0x0a);
  sb2[0x09] = 1; // Continue warps in (to the continue-game warp below), so the map and the player get set up fresh
  sb2[0x14] = 1; // text speed Mid, frame 1, mono
  const frlg = game === 'frlg';
  if (L.keyAt !== null) sb2.set([0x4d, 0x3c, 0x2b, 0x1a], L.keyAt); // the money key
  if (frlg) sb2[0xac] = 1; // unkFlag1, set by every new FireRed and LeafGreen game
  // Littleroot Town (map group 0, number 9 in Ruby, Sapphire and Emerald) or Pallet Town (group 3, number 0 in FireRed
  // and LeafGreen), just below the door of the player's house, which is also where Continue and blacking out put you.
  const warp = frlg ? [3, 0, 0xff, 0, 6, 0, 8, 0] : [0, 9, 0xff, 0, 5, 0, 9, 0];
  sb1.set(warp.slice(4), 0x00); // pos
  sb1.set(warp, 0x04); // location
  sb1.set(warp, 0x0c); // continue-game warp
  sb1.set(warp, 0x1c); // last heal location
  // FireRed and LeafGreen also keep the map's layout (SaveBlock1 mapLayoutId) and reset on Continue without it:
  // LAYOUT_PALLET_TOWN is 78.
  if (frlg) sb1[0x32] = 78;
  const key = L.keyAt !== null ? 0x1a2b3c4d : 0;
  const k16 = key & 0xffff;
  // Empty pockets still hold quantity 0 under the key.
  for (const [at, n] of [[L.items, L.itemsMax], [L.keyItems, L.keyItemsMax], [L.balls, L.ballsMax], [L.tmhm, L.tmhmMax], [L.berries, L.berriesMax]]) {
    for (let i = 0; i < n; i++) { sb1[at + i * 4 + 2] = k16 & 0xff; sb1[at + i * 4 + 3] = k16 >> 8; }
  }
  for (let i = 0; i < 4; i++) sb1[L.money + i] = (key >>> (i * 8)) & 0xff; // ¥0 under the key
  for (let i = 0; i < 2; i++) sb1[L.coins + i] = (k16 >>> (i * 8)) & 0xff; // no coins
  if (frlg) {
    // FireRed and LeafGreen key their game stats, Berry Powder and Trainer Tower best times too
    // (pokefirered: ApplyNewEncryptionKeyToAllEncryptedData).
    for (let n = 0; n < 64; n++) for (let i = 0; i < 4; i++) sb1[L.gameStats + n * 4 + i] = (key >>> (i * 8)) & 0xff;
    for (let i = 0; i < 4; i++) sb2[0xaf8 + i] = (key >>> (i * 8)) & 0xff;
    for (let t = 0; t < 4; t++) for (let i = 0; i < 4; i++) sb1[0x3d38 + t * 0xc + 4 + i] = (key >>> (i * 8)) & 0xff;
    sb1[0x3a54] = 2; // the Fame Checker starts with Professor Oak (ResetFameChecker)
  }
  if (game === 'emerald') {
    // Emerald also keys its Berry Powder and its 64 game stats (pokeemerald: ApplyNewEncryptionKeyToAllEncryptedData).
    for (let i = 0; i < 4; i++) sb2[0x1f4 + i] = (key >>> (i * 8)) & 0xff;
    for (let n = 0; n < 64; n++) for (let i = 0; i < 4; i++) sb1[0x159c + n * 4 + i] = (key >>> (i * 8)) & 0xff;
    // A roaming Latios (struct Roamer), as the game makes one after the Hall of Fame: level 40, full HP, roaming.
    const roamer = new DataView(sb1.buffer, sb1.byteOffset + 0x31dc, 0x1c);
    roamer.setUint32(0, 20 | (12 << 5) | (25 << 10) | (9 << 15) | (31 << 20) | (17 << 25), true); // IVs
    roamer.setUint32(4, 0x5eed1234, true); // personality
    roamer.setUint16(8, 408, true); // SPECIES_LATIOS
    roamer.setUint16(10, 122, true); // max HP at level 40 with an HP IV of 20
    roamer.setUint8(12, 40);
    roamer.setUint8(19, 1); // active
    // Rose, Andres and Dusty registered in the PokéNav's Match Call (FLAG_REGISTERED_ROSE ...: 0x15C + their rematch id).
    for (const n of [0x15c, 0x15d, 0x15e]) sb1[L.flags + (n >> 3)] |= 1 << (n & 7);
  }
  const sys = L.pokemonGetFlag;
  for (const n of [sys, sys + 1]) sb1[L.flags + (n >> 3)] |= 1 << (n & 7); // FLAG_SYS_POKEMON_GET and _POKEDEX_GET: the start menu has POKéMON and POKéDEX
  for (let i = 0; i < BOX_COUNT; i++) {
    st.set(encodeText(`BOX${i + 1}`, 9, undefined, 8), 0x8344 + i * 9);
    st[0x83c2 + i] = i % 4; // the game's starting wallpapers
  }
  const d = new Uint8Array(SAVE_SIZE).fill(0xff);
  const sectors = [sb2, ...Array.from({ length: 4 }, (_, i) => sb1.subarray(i * SECTOR_DATA, (i + 1) * SECTOR_DATA)),
    ...Array.from({ length: 9 }, (_, i) => st.subarray(i * SECTOR_DATA, (i + 1) * SECTOR_DATA))];
  const sizes = [L.sb2Size, SECTOR_DATA, SECTOR_DATA, SECTOR_DATA, L.sb1Size - 3 * SECTOR_DATA, ...new Array(8).fill(SECTOR_DATA), 0x83d0 - 8 * SECTOR_DATA];
  sectors.forEach((data, id) => {
    const at = (14 + (id + 1) % 14) * 0x1000;
    d.fill(0, at, at + 0x1000);
    d.set(data.subarray(0, sizes[id]), at);
    const footer = new DataView(d.buffer, at + 0xff4, 12);
    footer.setUint16(0, id, true);
    footer.setUint16(2, sectorChecksum(d, at, sizes[id]), true);
    footer.setUint32(4, 0x08012025, true);
    footer.setUint32(8, 1, true); // the first save
  });
  return d;
}

const move = (name: string): number => {
  const id = MOVE_NAMES.indexOf(name);
  if (id < 1) throw new Error(`sample: unknown move ${name}`);
  return id;
};

/** The sample: blank save, then filled in through the editor's own model (so its writer is what makes the file). */
type Wish = Parameters<typeof findPid>[3];

/** Makes the sample's Pokémon: caught by the sample's trainer, with random IVs and somewhere in the game to be met. */
function monMaker(game: Gen3Game, trainer: { name: string; id: number; gender: 'male' | 'female' }, random: () => number, firstPlace: number) {
  return (dex: number, level: number, moves: string[], wish: Wish = {}): Gen3Mon => {
    const pid = findPid(dex, trainer.id, Math.floor(random() * 0x100000000), wish, random);
    const m = newMon(dex, level, trainer, game, pid, speciesName(dex));
    m.moves = [0, 1, 2, 3].map((i) => (moves[i] ? move(moves[i]) : 0)) as Gen3Mon['moves'];
    m.pp = m.moves.map((id) => maxPp(id, 0)) as Gen3Mon['pp'];
    m.ivs = { hp: Math.floor(random() * 32), atk: Math.floor(random() * 32), def: Math.floor(random() * 32), spe: Math.floor(random() * 32), spa: Math.floor(random() * 32), spd: Math.floor(random() * 32) };
    m.metLocation = firstPlace + Math.floor(random() * 20);
    recalcPartyStats(m, true);
    return m;
  };
}

export function buildSampleSave(game: Gen3Game = 'rs'): Uint8Array {
  if (game === 'frlg') return buildKantoSample();
  const trainerId = 0x1d2a3b4c;
  const s = new Gen3Save(blankGen3Save(game, 'MAY', true, trainerId), game);
  const random = seeded(386);
  const trainer = { name: 'MAY', id: trainerId, gender: 'female' as const };
  const mon = monMaker(game, trainer, random, 0x10);

  s.money = 12345;
  s.coins = 50;
  s.playHours = 21; s.playMinutes = 9; s.playSeconds = 30;
  s.badges = 0b1111;

  const blaziken = mon(257, 36, ['Blaze Kick', 'Sky Uppercut', 'Slash', 'Bulk Up'], { nature: 3 }); // Adamant
  blaziken.item = 215; // Charcoal
  blaziken.nickname = 'BLAZE';
  blaziken.metLocation = 0; blaziken.metLevel = 5; // the starter, from Littleroot Town
  const gardevoir = mon(282, 32, ['Psychic', 'Calm Mind', 'Double Team', 'Thunderbolt'], { nature: 15, shiny: true }); // Modest
  const swellow = mon(277, 30, ['Aerial Ace', 'Quick Attack', 'Endeavor', 'Double Team'], { gender: 'female' });
  swellow.abilityBit = 0;
  const egg = mon(360, 5, ['Splash', 'Charm', 'Encore'], {}); // Wynaut
  egg.isEgg = true; egg.nickname = 'EGG'; egg.friendship = 20; egg.metLevel = 0;
  const unown = mon(UNOWN, 25, ['Hidden Power'], { unown: '!' });
  unown.metLocation = 0x52; // Desert Ruins
  const azumarill = mon(184, 28, ['Surf', 'Rollout', 'Defense Curl'], {});
  azumarill.abilityBit = 1; // Huge Power
  s.party = [blaziken, gardevoir, swellow, egg, unown];

  const box = (dex: number, level: number, moves: string[]) => { const m = mon(dex, level, moves); depositInBox(m); return m; };
  s.boxes[0][0] = box(263, 6, ['Tackle', 'Growl']);
  s.boxes[0][1] = box(270, 9, ['Astonish', 'Growl']);
  s.boxes[0][3] = azumarill; // a gap at spot 3, as the game allows
  depositInBox(azumarill);
  s.boxes[0][4] = box(304, 18, ['Tackle', 'Harden', 'Mud-Slap']);
  s.boxes[1][0] = box(25, 15, ['ThunderShock', 'Quick Attack']);
  s.currentBoxIndex = 0;
  s.boxNames[1] = 'FRIENDS';

  s.pockets.item = [{ id: 13, count: 5 }, { id: 22, count: 3 }, { id: 68, count: 2 }, { id: 86, count: 1 }];
  s.pockets.ball = [{ id: 4, count: 10 }, { id: 3, count: 4 }];
  s.pockets.key = [{ id: 259, count: 1 }, { id: 262, count: 1 }, { id: 268, count: 1 }, { id: 273, count: 1 }];
  s.setTmCounts([...new Array(39).fill(0), 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0]);
  s.pockets.berry = [{ id: 139, count: 12 }, { id: 142, count: 3 }];
  s.pcItems = [{ id: 13, count: 1 }];
  s.pokeblocks = [
    { color: 1, spicy: 21, dry: 0, sweet: 0, bitter: 0, sour: 0, feel: 23 },
    { color: 5, spicy: 0, dry: 0, sweet: 0, bitter: 0, sour: 18, feel: 20 },
  ];
  for (let dex = 252; dex <= 300; dex++) s.setSeen(dex, true);
  for (const dex of [257, 282, 277, 263, 270, 304, 25, 184, 201, 360, 255, 256, 280, 281, 276]) s.setOwned(dex, true);
  // Two Hall of Fame entries, oldest first (the game counts wins in game stat 10).
  s.gameStats[10] = 2;
  const out = s.serialize();
  writeGen3HallOfFame(out, trainerId, [
    [{ species: speciesOf(257), level: 50, name: 'BLAZE' }, { species: speciesOf(282), level: 47, name: 'GARDEVOIR', personality: 0x26660000 }, { species: speciesOf(277), level: 46, name: 'SWELLOW' },
      { species: speciesOf(184), level: 44, name: 'AZUMARILL' }, { species: speciesOf(306), level: 43, name: 'AGGRON' }, { species: speciesOf(321), level: 42, name: 'WAILORD' }],
    [{ species: speciesOf(257), level: 62, name: 'BLAZE' }, { species: speciesOf(282), level: 60, name: 'GARDEVOIR', personality: 0x26660000 }, { species: speciesOf(277), level: 58, name: 'SWELLOW' },
      { species: speciesOf(184), level: 57, name: 'AZUMARILL' }],
  ]);
  return out;
}

/** FireRed and LeafGreen's sample: Leaf with four Kanto badges, a party and box from Kanto, a partly charged Vs. Seeker,
 * a few towns to Fly to and two people in the Fame Checker. */
function buildKantoSample(): Uint8Array {
  const game = 'frlg';
  const trainerId = 0x2b3c4d5e;
  const s = new Gen3Save(blankGen3Save(game, 'LEAF', true, trainerId), game);
  const random = seeded(151);
  const mon = monMaker(game, { name: 'LEAF', id: trainerId, gender: 'female' }, random, 0x65);

  s.money = 23456;
  s.coins = 120;
  s.playHours = 14; s.playMinutes = 42; s.playSeconds = 5;
  s.badges = 0b1111;

  const venusaur = mon(3, 34, ['Razor Leaf', 'Sleep Powder', 'Leech Seed', 'Take Down'], { nature: 15 }); // Modest
  venusaur.item = 205; // Miracle Seed
  venusaur.nickname = 'BUD';
  venusaur.metLocation = 0x58; venusaur.metLevel = 5; // the starter, from Pallet Town
  const pikachu = mon(25, 28, ['Thunderbolt', 'Quick Attack', 'Thunder Wave', 'Double Team'], { shiny: true });
  const pidgeotto = mon(17, 27, ['Wing Attack', 'Gust', 'Quick Attack', 'Sand-Attack'], { gender: 'male' });
  const egg = mon(175, 5, ['Growl', 'Charm'], {}); // Togepi
  egg.isEgg = true; egg.nickname = 'EGG'; egg.friendship = 10; egg.metLevel = 0;
  const lapras = mon(131, 25, ['Surf', 'Body Slam', 'Confuse Ray', 'Sing'], {});
  lapras.metLocation = 0x86; // Silph Co.
  s.party = [venusaur, pikachu, pidgeotto, egg, lapras];

  const box = (dex: number, level: number, moves: string[]) => { const m = mon(dex, level, moves); depositInBox(m); return m; };
  s.boxes[0][0] = box(19, 4, ['Tackle', 'Tail Whip']);
  s.boxes[0][1] = box(10, 6, ['Tackle', 'String Shot']);
  s.boxes[0][3] = box(54, 21, ['Scratch', 'Tail Whip', 'Disable', 'Confusion']); // a gap at spot 3, as the game allows
  s.boxes[0][4] = box(74, 12, ['Tackle', 'Defense Curl', 'Mud Sport']);
  s.boxes[1][0] = box(129, 10, ['Splash']);
  s.currentBoxIndex = 0;
  s.boxNames[1] = 'FRIENDS';

  s.pockets.item = [{ id: 13, count: 5 }, { id: 22, count: 3 }, { id: 68, count: 2 }, { id: 86, count: 1 }];
  s.pockets.ball = [{ id: 4, count: 10 }, { id: 3, count: 4 }];
  // Bicycle, Old Rod, Town Map, Vs. Seeker, Fame Checker, TM Case, Berry Pouch.
  s.pockets.key = [361, 360, 262, 362, 363, 364, 365].map((id) => ({ id, count: 1 }));
  s.setTmCounts([...new Array(27).fill(0), 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  s.pockets.berry = [{ id: 139, count: 4 }];
  s.pcItems = [{ id: 13, count: 1 }];
  const k = s.kanto!;
  k.vsSeeker = 60;
  for (const name of ['Pallet Town', 'Viridian City', 'Pewter City', 'Cerulean City', 'Vermilion City', 'Route 4']) k.fly[FLY_SPOTS.findIndex((p) => p.name === name)] = true;
  k.fame[2] = { state: 2, facts: 0b000111 }; // Brock, three facts found
  k.fame[3] = { state: 2, facts: 0b000011 }; // Misty
  k.fame[4] = { state: 1, facts: 0 }; // Lt. Surge, heard of
  for (let dex = 1; dex <= 60; dex++) s.setSeen(dex, true);
  for (const dex of [1, 2, 3, 25, 17, 175, 131, 19, 10, 54, 74, 129, 16, 13, 21]) s.setOwned(dex, true);
  s.gameStats[10] = 1;
  const out = s.serialize();
  writeGen3HallOfFame(out, trainerId, [[
    { species: speciesOf(3), level: 56, name: 'BUD' }, { species: speciesOf(25), level: 52, name: 'PIKACHU' }, { species: speciesOf(17), level: 50, name: 'PIDGEOTTO' },
    { species: speciesOf(131), level: 49, name: 'LAPRAS' },
  ]]);
  return out;
}
