// A made-up Pokémon Yellow save, built in code, for the "Try a sample save" button and for scripts/tests.
// Nothing here comes from a real game: it's a tidy trainer with a full party led by their starter Pikachu, a
// couple of boxes, a bag, three badges and a partly filled Pokédex, so every tab of the editor has something to show.

import { DEX_TO_INTERNAL, INTERNAL_TO_DEX, MOVE_NAMES, expForLevel, type Growth } from './data.ts';
import { maxPp } from './moves.ts';
import {
  BOXES_PER_BANK, BOX_SIZE, GEN1_OFFSETS, Gen1Save, SAVE_SIZE, checksum8, newMon, recalcPartyStats, type Gen1Mon,
} from './save.ts';
import { encodeText } from './text.ts';

/**
 * A brand-new, empty save that passes every checksum (what the game writes for a fresh file). With
 * `yellow`, Pikachu's block is filled in as a new Yellow game does (friendship 90, neutral mood), which is
 * what marks the file as Pokémon Yellow.
 */
export function blankGen1Save(trainer = 'ASH', rival = 'GARY', yellow = false): Uint8Array {
  const O = GEN1_OFFSETS;
  const d = new Uint8Array(SAVE_SIZE);
  d.set(encodeText(trainer, 11), O.playerName);
  d.set(encodeText(rival, 11), O.rivalName);
  for (const list of [O.bagCount, O.pcItemCount, O.party, O.currentBoxData]) d[list + 1] = 0xff; // empty lists
  const total = BOX_SIZE * BOXES_PER_BANK;
  for (const bank of [O.bank2, O.bank3]) {
    for (let i = 0; i < BOXES_PER_BANK; i++) d[bank + i * BOX_SIZE + 1] = 0xff;
    d[bank + total] = checksum8(d, bank, bank + total);
    for (let i = 0; i < BOXES_PER_BANK; i++) d[bank + total + 1 + i] = checksum8(d, bank + i * BOX_SIZE, bank + (i + 1) * BOX_SIZE);
  }
  if (yellow) { d[O.pikachuFriendship] = 90; d[O.pikachuMood] = 0x80; }
  d[O.checksum] = checksum8(d, O.checksumStart, O.checksumEnd);
  return d;
}

/**
 * Where CONTINUE puts you: upstairs in your house in Pallet Town, on the spot a new game starts. Pokémon Yellow keeps the
 * map you're on in the save, including the ROM addresses of the room's blocks, scripts and tileset, so without these the
 * game draws a garbled or white screen. Values are pokeyellow's (maps/RedsHouse2F, data/tilesets/tileset_headers.asm,
 * the addresses from its symbol file), matching what the game itself writes when you save there. Red and Blue keep
 * these at other ROM addresses, so this spot is for the Yellow sample only.
 */
function placeInBedroom(d: Uint8Array): void {
  d[0x260a] = 0x26; // wCurMap: REDS_HOUSE_2F
  d.set([0x12, 0xc7], 0x260b); // wCurrentTileBlockMapViewPointer, the room's corner in the block buffer
  d.set([6, 3, 0, 1], 0x260d); // wYCoord, wXCoord, wYBlockCoord, wXBlockCoord
  // wCurMapHeader: tileset REDS_HOUSE_2, 4x4 blocks, RedsHouse2F_Blocks, _TextPointers, _Script, no connections
  d.set([0x04, 4, 4, 0x10, 0x40, 0xc7, 0x40, 0xb0, 0x40, 0x00, 0xff], 0x2613);
  // wMapBackgroundTile, then one warp: the stairs at 7,1 to warp 2 of REDS_HOUSE_1F
  d.set([0x0a, 1, 1, 7, 2, 0x25], 0x2659);
  // wTilesetBank and the RedsHouse2 tileset's blocks, graphics and collision; no talk-over tiles, no grass
  d.set([0x19, 0x90, 0x52, 0x00, 0x4e, 0xd6, 0x4a, 0xff, 0xff, 0xff, 0xff], 0x27d7);
}

const move = (name: string): number => {
  const id = MOVE_NAMES.indexOf(name);
  if (id < 1) throw new Error(`sample: unknown move ${name}`);
  return id;
};

const TRAINER_ID = 12345;

interface Spec { dex: number; level: number; growth: Growth; moves: string[]; nickname?: string }

function make(spec: Spec, seed: number): Gen1Mon {
  const mon = newMon(DEX_TO_INTERNAL[spec.dex], spec.level);
  mon.moves = [0, 0, 0, 0];
  spec.moves.slice(0, 4).forEach((m, i) => { mon.moves[i] = move(m); });
  mon.pp = mon.moves.map((m) => maxPp(m, 0)) as Gen1Mon['pp'];
  mon.exp = expForLevel(spec.growth, spec.level);
  mon.otName = 'ASH';
  mon.otId = TRAINER_ID;
  if (spec.nickname) mon.nickname = spec.nickname;
  // Spread of DVs that doesn't look uniform, but is the same every time.
  const r = (n: number) => ((seed * 2654435761 + n * 40503) >>> 7) & 0xf;
  mon.dvs = { atk: r(1), def: r(2), spe: r(3), spc: r(4) };
  recalcPartyStats(mon, true); // full HP; boxed Pokémon keep this HP too
  return mon;
}

const PARTY: Spec[] = [
  { dex: 25, level: 28, growth: 'Medium Fast', moves: ['ThunderShock', 'Quick Attack', 'Thunder Wave', 'Agility'], nickname: 'SPARKY' },
  { dex: 5, level: 30, growth: 'Medium Slow', moves: ['Ember', 'Slash', 'Leer', 'Rage'] },
  { dex: 17, level: 24, growth: 'Medium Slow', moves: ['Gust', 'Sand-Attack', 'Quick Attack', 'Whirlwind'] },
  { dex: 74, level: 20, growth: 'Medium Slow', moves: ['Tackle', 'Defense Curl', 'Rock Throw'] },
  { dex: 7, level: 22, growth: 'Medium Slow', moves: ['Tackle', 'Tail Whip', 'Bubble', 'Water Gun'] },
  { dex: 129, level: 10, growth: 'Slow', moves: ['Splash', 'Tackle'] },
];

const BOX_1: Spec[] = [
  { dex: 19, level: 4, growth: 'Medium Fast', moves: ['Tackle', 'Tail Whip'] },
  { dex: 10, level: 6, growth: 'Medium Fast', moves: ['Tackle', 'String Shot'] },
  { dex: 13, level: 7, growth: 'Medium Fast', moves: ['Poison Sting', 'String Shot'] },
  { dex: 16, level: 5, growth: 'Medium Slow', moves: ['Tackle'] },
  { dex: 56, level: 9, growth: 'Medium Fast', moves: ['Scratch', 'Leer', 'Low Kick'] },
];

const BOX_2: Spec[] = [
  { dex: 63, level: 15, growth: 'Medium Slow', moves: ['Teleport'] },
  { dex: 133, level: 25, growth: 'Medium Fast', moves: ['Tackle', 'Sand-Attack', 'Quick Attack', 'Bite'] },
];

/** The sample save's bytes: a valid file that opens in the editor and in the real game. */
export function buildSampleSave(): Uint8Array {
  const blank = blankGen1Save('ASH', 'GARY', true);
  placeInBedroom(blank);
  const save = new Gen1Save(blank);
  save.pikachuFriendship = 160;
  save.trainerId = TRAINER_ID;
  save.money = 12500;
  save.coins = 250;
  save.badges = 0b0000_0111; // Boulder, Cascade, Thunder
  save.playHours = 12; save.playMinutes = 34; save.playSeconds = 56;
  save.options = { textSpeed: 3, battleStyleSet: false, battleAnimationsOff: false }; // Medium, Shift, animations on

  save.bag = [
    { id: 0x04, count: 10 }, // Poké Ball
    { id: 0x14, count: 5 }, // Potion
    { id: 0x13, count: 3 }, // Super Potion
    { id: 0x0b, count: 2 }, // Antidote
    { id: 0x1d, count: 1 }, // Escape Rope
    { id: 0x28, count: 3 }, // Rare Candy
    { id: 0x05, count: 1 }, // Town Map
    { id: 0x06, count: 1 }, // Bicycle
    { id: 0x45, count: 1 }, // Coin Case
    { id: 0xc9 + 23, count: 1 }, // TM24 Thunderbolt
  ];
  save.pcItems = [{ id: 0x14, count: 10 }, { id: 0x0a, count: 1 }];

  save.party = PARTY.map((s, i) => make(s, i + 1));
  save.boxes[0] = BOX_1.map((s, i) => make(s, i + 20));
  save.boxes[1] = BOX_2.map((s, i) => make(s, i + 40));

  // Everything in the party and boxes is caught; the first 40 dex entries are at least seen.
  for (const m of [...save.party, ...save.boxes.flat()]) save.setOwned(INTERNAL_TO_DEX[m.species], true);
  for (let dex = 1; dex <= 40; dex++) save.setSeen(dex, true);
  return save.serialize();
}
