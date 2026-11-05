// Final Fantasy I & II: Dawn of Souls (GBA) save layout shared by both games. The cartridge has 32 KB of SRAM; some
// tools export it padded to 64 KB, and the extra bytes are kept as they are.
//
// 0x0000  header: the Shift-JIS text "ファイナルファンタジーⅠ＆Ⅱです" (32 bytes) and a u32 0x24
// 0x0024  Final Fantasy I files 1-3, 0xD60 bytes each
// 0x4012  Final Fantasy II files 1-3, 0xEB4 bytes each
// Every file starts with the same 32-byte text, then a u16 checksum: the sum of the file's bytes from 0x24 to its end,
// plus the file's size, kept to 16 bits. A file that fails it shows as "Empty" in the game; an unused file is all 0xFF.
// Found by comparing real saves made on the cartridge and in mGBA, and checked by loading edited saves in mGBA.

export const SRAM_SIZE = 0x8000;
export const HEADER_SIZE = 0x24;
export const MAGIC = Uint8Array.from([
  0x83, 0x74, 0x83, 0x40, 0x83, 0x43, 0x83, 0x69, 0x83, 0x8b, 0x83, 0x74, 0x83, 0x40, 0x83, 0x93,
  0x83, 0x5e, 0x83, 0x57, 0x81, 0x5b, 0x87, 0x54, 0x81, 0x95, 0x87, 0x55, 0x82, 0xc5, 0x82, 0xb7,
]);
export const FILE_COUNT = 3;
export const FF1 = { base: 0x24, size: 0xd60 } as const;
export const FF2 = { base: 0x4012, size: 0xeb4 } as const;
const CHECKSUM = 0x20;

export const fileBase = (game: { base: number; size: number }, index: number) => game.base + index * game.size;

const hasMagic = (d: Uint8Array, at: number) => MAGIC.every((b, i) => d[at + i] === b);

export function checksum(d: Uint8Array, at: number, size: number): number {
  let sum = size;
  for (let i = at + 0x24; i < at + size; i++) sum += d[i];
  return sum & 0xffff;
}
export const storedChecksum = (d: Uint8Array, at: number) => d[at + CHECKSUM] | (d[at + CHECKSUM + 1] << 8);
export function writeChecksum(d: Uint8Array, at: number, size: number) {
  const v = checksum(d, at, size);
  d[at + CHECKSUM] = v & 0xff;
  d[at + CHECKSUM + 1] = v >> 8;
}

/** A file the game would load: its text and checksum both match. */
export const fileOk = (d: Uint8Array, game: { base: number; size: number }, index: number) => {
  const at = fileBase(game, index);
  return at + game.size <= d.length && hasMagic(d, at) && checksum(d, at, game.size) === storedChecksum(d, at);
};

export type GbaDetection = 'ok' | 'empty' | null;
const hasFiles = (d: Uint8Array, game: { base: number; size: number }) => [0, 1, 2].some((i) => fileOk(d, game, i));
/**
 * For one of the two games: 'ok' when the header matches and at least one of that game's files loads; 'empty' (for
 * Final Fantasy I only, so a damaged save is offered once) when the header matches but no file of either game does.
 */
export function detectDawnOfSouls(d: Uint8Array, game: 1 | 2 = 1): GbaDetection {
  if (d.length < SRAM_SIZE || !hasMagic(d, 0) || d[0x20] !== HEADER_SIZE || d[0x21] || d[0x22] || d[0x23]) return null;
  if (hasFiles(d, game === 1 ? FF1 : FF2)) return 'ok';
  return game === 1 && !hasFiles(d, FF2) ? 'empty' : null;
}
