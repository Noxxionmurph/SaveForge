// Final Fantasy (WonderSwan Color, Japan, 2000) save layout. The cartridge has 32 KB of battery SRAM.
//
// 0x0010  the text "FF1_SAVE_VER_008FF1DG-SRAM_ID/01" (32 bytes)
// 0x0030  save files 1-8, 0x300 bytes each, then the quick save the menu's ちゅうだん (Suspend) makes, at 0x1830
// 0x1BB2  a u16 checksum per file (files 1-8, then the quick save): the sum of the file's 384 little-endian u16 words
// A used file starts with "F1"; an unused one is all zeros.
// Found by saving in Mednafen's WonderSwan core and comparing, and checked by loading edited saves there.

export const SRAM_SIZE = 0x8000;
export const MAGIC = 'FF1_SAVE_VER_008FF1DG-SRAM_ID/01';
const MAGIC_AT = 0x10;
export const FILE_BASE = 0x30;
export const FILE_SIZE = 0x300;
/** Eight save files and the quick save (index 8). */
export const FILE_COUNT = 9;
export const QUICK_SAVE = 8;
const CHECKSUMS = 0x1bb2;

export const fileBase = (index: number) => FILE_BASE + index * FILE_SIZE;

export function checksum(d: Uint8Array, index: number): number {
  const at = fileBase(index);
  let sum = 0;
  for (let i = 0; i < FILE_SIZE; i += 2) sum += d[at + i] | (d[at + i + 1] << 8);
  return sum & 0xffff;
}
export const storedChecksum = (d: Uint8Array, index: number) => d[CHECKSUMS + index * 2] | (d[CHECKSUMS + index * 2 + 1] << 8);
export function writeChecksum(d: Uint8Array, index: number) {
  const v = checksum(d, index);
  d[CHECKSUMS + index * 2] = v & 0xff;
  d[CHECKSUMS + index * 2 + 1] = v >> 8;
}

/** A file holding a game: it starts with "F1". */
export const fileUsed = (d: Uint8Array, index: number) => d[fileBase(index)] === 0x46 && d[fileBase(index) + 1] === 0x31;
/** A used file whose checksum matches, which the game will load. */
export const fileOk = (d: Uint8Array, index: number) => fileUsed(d, index) && checksum(d, index) === storedChecksum(d, index);

export const hasMagic = (d: Uint8Array) =>
  d.length >= SRAM_SIZE && [...MAGIC].every((c, i) => d[MAGIC_AT + i] === c.charCodeAt(0));
