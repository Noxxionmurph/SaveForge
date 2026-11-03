// Gen 3 save layouts, sector checks and the test that tells a Ruby/Sapphire save from an Emerald one. Kept apart from
// save.ts, which needs the species and move tables, so the landing page can recognise a file without downloading them
// (see games/pokemon-emerald.ts). The format: see save.ts.
import { le } from '../bytes.ts';
import type { Gen3Game } from './data.ts';

const { u16, u32 } = le;

export const SAVE_SIZE = 0x20000;
export const SECTOR = 0x1000;
export const SECTOR_DATA = 3968;
export const SECTORS_PER_SLOT = 14;
export const SIGNATURE = 0x08012025;

export interface Layout {
  /** How many bytes of each block the game saves (and so checksums). */
  sb2Size: number;
  sb1Size: number;
  /** SaveBlock1: the party, money, coins (under the key in Emerald, FireRed and LeafGreen) and the PC's items. */
  partyCount: number; party: number; money: number; coins: number; pcItems: number; pcItemsMax: number;
  items: number; itemsMax: number;
  keyItems: number; keyItemsMax: number;
  balls: number; ballsMax: number;
  tmhm: number; tmhmMax: number;
  berries: number; berriesMax: number;
  /** How many of one item a bag slot holds (the PC holds 999 in every game). */
  itemCap: number; berryCap: number;
  /** The two copies of the Pokédex's "seen" flags kept in SaveBlock1 (the game checks all three agree). */
  seenCopies: [number, number];
  flags: number;
  vars: number;
  /** Event flag numbers: the first badge, FLAG_SYS_GAME_CLEAR, FLAG_SYS_RIBBON_GET and FLAG_SYS_POKEMON_GET (POKéDEX_GET
   * follows it). */
  badgeFlag: number; gameClearFlag: number; ribbonFlag: number; pokemonGetFlag: number;
  /** The National Pokédex: SaveBlock2's magic byte and value, the variable and its value, and the flag, all three set
   * by the game's EnableNationalPokedex (pokeemerald and pokefirered src/event_data.c). */
  national: { magicAt: number; magic: number; varId: number; value: number; flag: number };
  /** SaveBlock1's game stats (see stats.ts). */
  gameStats: number;
  /** SaveBlock1's Pokéblock case (see pokeblocks.ts): Hoenn only. */
  pokeblocks: number | null;
  /** SaveBlock1's decoration lists (see decorations.ts), the bedroom's 12 placed decorations, and the player's secret
   * base (slot 0 of 20, see bases.ts): Hoenn only. */
  decorations: number | null; roomDecor: number | null; secretBase: number | null;
  /** SaveBlock1's roaming Pokémon (struct Roamer): Latios or Latias in Hoenn, Raikou, Entei or Suicune in Kanto. */
  roamer: number;
  /** Where SaveBlock2 keeps the key that money, coins, bag quantities and more are XORed with (null: not encrypted). */
  keyAt: number | null;
}

export const RS: Layout = {
  sb2Size: 0x890, sb1Size: 0x3ac0,
  partyCount: 0x234, party: 0x238, money: 0x490, coins: 0x494, pcItems: 0x498, pcItemsMax: 50,
  items: 0x560, itemsMax: 20, keyItems: 0x5b0, keyItemsMax: 20, balls: 0x600, ballsMax: 16,
  tmhm: 0x640, tmhmMax: 64, berries: 0x740, berriesMax: 46, itemCap: 99, berryCap: 999,
  seenCopies: [0x938, 0x3a8c], flags: 0x1220, vars: 0x1340,
  badgeFlag: 0x807, gameClearFlag: 0x804, ribbonFlag: 0x83b, pokemonGetFlag: 0x800,
  national: { magicAt: 0x1a, magic: 0xda, varId: 0x4046, value: 0x302, flag: 0x836 },
  gameStats: 0x1540, pokeblocks: 0x7f8,
  decorations: 0x26a0, roomDecor: 0x2688, secretBase: 0x1a08, roamer: 0x3144,
  keyAt: null,
};

export const EMERALD: Layout = {
  sb2Size: 0xf2c, sb1Size: 0x3d88,
  partyCount: 0x234, party: 0x238, money: 0x490, coins: 0x494, pcItems: 0x498, pcItemsMax: 50,
  items: 0x560, itemsMax: 30, keyItems: 0x5d8, keyItemsMax: 30, balls: 0x650, ballsMax: 16,
  tmhm: 0x690, tmhmMax: 64, berries: 0x790, berriesMax: 46, itemCap: 99, berryCap: 999,
  seenCopies: [0x988, 0x3b24], flags: 0x1270, vars: 0x139c,
  badgeFlag: 0x867, gameClearFlag: 0x864, ribbonFlag: 0x89b, pokemonGetFlag: 0x860,
  national: { magicAt: 0x1a, magic: 0xda, varId: 0x4046, value: 0x302, flag: 0x896 },
  gameStats: 0x159c, pokeblocks: 0x848,
  decorations: 0x2734, roomDecor: 0x271c, secretBase: 0x1a9c, roamer: 0x31dc,
  keyAt: 0xac,
};

/** FireRed and LeafGreen (pokefirered include/global.h): everything in SaveBlock1 moved, the PC holds 30 items, and
 * every pocket holds up to 999 of an item. The key is at the end of SaveBlock2. */
export const FRLG: Layout = {
  sb2Size: 0xf24, sb1Size: 0x3d68,
  partyCount: 0x34, party: 0x38, money: 0x290, coins: 0x294, pcItems: 0x298, pcItemsMax: 30,
  items: 0x310, itemsMax: 42, keyItems: 0x3b8, keyItemsMax: 30, balls: 0x430, ballsMax: 13,
  tmhm: 0x464, tmhmMax: 58, berries: 0x54c, berriesMax: 43, itemCap: 999, berryCap: 999,
  seenCopies: [0x5f8, 0x3a18], flags: 0xee0, vars: 0x1000,
  badgeFlag: 0x820, gameClearFlag: 0x82c, ribbonFlag: 0x83b, pokemonGetFlag: 0x828,
  national: { magicAt: 0x1b, magic: 0xb9, varId: 0x404e, value: 0x6258, flag: 0x840 },
  gameStats: 0x1200, pokeblocks: null,
  decorations: null, roomDecor: null, secretBase: null, roamer: 0x30d0,
  keyAt: 0xf20,
};

export const GEN3_LAYOUTS: Readonly<Record<Gen3Game, Layout>> = { rs: RS, emerald: EMERALD, frlg: FRLG };

// Shared offsets.
export const SB2 = {
  name: 0x00, gender: 0x08, specialSaveWarp: 0x09, trainerId: 0x0a, playHours: 0x0e, playMinutes: 0x10, playSeconds: 0x11, playFrames: 0x12,
  buttonMode: 0x13, options: 0x14, dexMode: 0x19, dexOwned: 0x28, dexSeen: 0x5c,
  /** FireRed and LeafGreen set this byte to 1 on a new game and never touch it again; Emerald keeps its key here and
   * Ruby and Sapphire their Battle Tower record. */
  frlgMark: 0xac,
};
export const STORAGE = { currentBox: 0, boxes: 4, names: 0x8344, size: 0x83d0 };
export const MONEY_MAX = 999999;

/** The sector checksum (pokeemerald: CalculateChecksum): a 32-bit sum of the words, folded to 16 bits. */
export function sectorChecksum(d: Uint8Array, start: number, size: number): number {
  let sum = 0;
  for (let i = 0; i < size; i += 4) sum = (sum + u32(d, start + i)) >>> 0;
  return ((sum >>> 16) + sum) & 0xffff;
}

/** How many bytes the game saves in sector `id`. */
export function sectorSize(L: Layout, id: number): number {
  if (id === 0) return L.sb2Size;
  if (id <= 4) return Math.min(SECTOR_DATA, L.sb1Size - (id - 1) * SECTOR_DATA);
  return Math.min(SECTOR_DATA, STORAGE.size - (id - 5) * SECTOR_DATA);
}

export interface Slot { slot: number; counter: number; sectorOf: number[] }

/** Each slot that has all 14 sectors with the signature and right checksums, newest first. */
export function validSlots(data: Uint8Array, L: Layout): Slot[] {
  const out: Slot[] = [];
  for (let slot = 0; slot < 2; slot++) {
    const sectorOf: number[] = [];
    let counter = -1;
    let ok = true;
    for (let i = 0; i < SECTORS_PER_SLOT && ok; i++) {
      const o = (slot * SECTORS_PER_SLOT + i) * SECTOR;
      const id = u16(data, o + 0xff4);
      if (u32(data, o + 0xff8) !== SIGNATURE || id >= SECTORS_PER_SLOT || sectorOf[id] !== undefined) { ok = false; break; }
      if (u16(data, o + 0xff6) !== sectorChecksum(data, o, sectorSize(L, id))) { ok = false; break; }
      const c = u32(data, o + 0xffc);
      if (counter >= 0 && c !== counter) ok = false;
      counter = c;
      sectorOf[id] = slot * SECTORS_PER_SLOT + i;
    }
    if (ok && sectorOf.length === SECTORS_PER_SLOT) out.push({ slot, counter, sectorOf });
  }
  // The game picks the higher counter; a counter that wrapped around past 0xFFFFFFFF counts as newer.
  return out.sort((a, b) => (a.counter === 0xffffffff && b.counter === 0 ? 1 : b.counter === 0xffffffff && a.counter === 0 ? -1 : b.counter - a.counter));
}

/**
 * Which game wrote the file. Each game checksums a different length of the first and fifth blocks (Ruby and Sapphire
 * 0x890 and 0xC40, FireRed and LeafGreen 0xF24 and 0xEE8, Emerald 0xF2C and 0xF08), and the game zeroes each sector
 * before writing, so the longer layouts can also fit a shorter game's file. When more than one fits, the bytes say:
 * FireRed and LeafGreen leave 1 at SaveBlock2 0xAC (unkFlag1), where Emerald keeps its money key and Ruby its Battle
 * Tower record.
 */
export function detectGen3(data: Uint8Array): Gen3Game | null {
  if (data.length < SAVE_SIZE) return null;
  const rs = validSlots(data, RS)[0];
  const em = validSlots(data, EMERALD)[0];
  const fr = validSlots(data, FRLG)[0];
  if (!rs) {
    // A real FireRed or LeafGreen file always fits Emerald's layout too (its last 8 bytes are zero), so the mark decides.
    if (fr && (!em || u32(data, fr.sectorOf[0] * SECTOR + SB2.frlgMark) === 1)) return 'frlg';
    return em ? 'emerald' : null;
  }
  // Ruby's layout fits, so the bytes the longer layouts add are all zero, FireRed's random key among them: it's Ruby or
  // Emerald. Tell them apart by Emerald's money key, which Ruby leaves as part of its Battle Tower record. A Ruby file
  // whose money only makes sense without a key is Ruby.
  if (!em) return 'rs';
  const s0 = rs.sectorOf[0] * SECTOR;
  const s1 = rs.sectorOf[1] * SECTOR;
  const key = u32(data, s0 + EMERALD.keyAt!);
  const raw = u32(data, s1 + EMERALD.money);
  return key !== 0 && raw > MONEY_MAX && ((raw ^ key) >>> 0) <= MONEY_MAX ? 'emerald' : 'rs';
}
