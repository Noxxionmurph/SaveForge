// Where Final Fantasy III (Nintendo DS) keeps its saves, and the check the game runs before it offers one. Small on
// purpose: detect() imports only this, so the landing page doesn't download the editor's tables.
//
// The game card holds 64 KB. The three save slots of the Load screen sit 0x3B10 bytes apart from the start; a fourth
// record after them is the Quicksave, which Continue on the title screen picks up. Each starts "cd1000", NUL,
// "EUReKa", NUL, keeps its own length at +0x20 (0x3B10, or 0x3B30 for the Quicksave) and at +0x1C the sum of the
// little-endian 32-bit words from +0x24 to that length. (Worked out from a real save and checked in the game.)

export const SAVE_SIZE = 0x10000;
export const SLOT_SPACING = 0x3b10;
/** Slots 1-3, then the Quicksave. */
export const SLOT_COUNT = 4;
export const QUICKSAVE = 3;
const MAGIC = [0x63, 0x64, 0x31, 0x30, 0x30, 0x30, 0, 0x45, 0x55, 0x52, 0x65, 0x4b, 0x61, 0]; // "cd1000\0EUReKa\0"
export const CHECKSUM = 0x1c;
export const LENGTH = 0x20;
const SUM_FROM = 0x24;

/** File offset of slot `n` (0-2 the Load screen's slots, 3 the Quicksave). */
export const slotBase = (n: number) => n * SLOT_SPACING;

const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

/** The length a slot says it has, or 0 when it isn't a save record. */
export function slotLength(data: Uint8Array, n: number): number {
  const at = slotBase(n);
  if (at + SUM_FROM > data.length || MAGIC.some((b, i) => data[at + i] !== b)) return 0;
  const len = u32(data, at + LENGTH);
  return len >= 0x3000 && len % 4 === 0 && at + len <= data.length ? len : 0;
}

/** The game's check value of a slot: the 32-bit words after the header, added up. */
export function slotSum(data: Uint8Array, at: number, len: number): number {
  let sum = 0;
  for (let o = at + SUM_FROM; o < at + len; o += 4) sum = (sum + u32(data, o)) >>> 0;
  return sum;
}

/** Would the game offer slot `n`? */
export function slotOk(data: Uint8Array, n: number): boolean {
  const len = slotLength(data, n);
  return len > 0 && u32(data, slotBase(n) + CHECKSUM) === slotSum(data, slotBase(n), len);
}

/** Redo a slot's check value, as the game does when it saves. */
export function writeChecksum(data: Uint8Array, n: number): void {
  const at = slotBase(n);
  const sum = slotSum(data, at, slotLength(data, n));
  for (let i = 0; i < 4; i++) data[at + CHECKSUM + i] = (sum >>> (8 * i)) & 0xff;
}

export type Ff3DsDetection = 'ok' | 'bad-checksum' | null;

/** 'ok' when the game would offer at least one slot, 'bad-checksum' when a slot is there but fails the check. */
export function detectFf3Ds(data: Uint8Array): Ff3DsDetection {
  if (data.length < SAVE_SIZE || data.length > 0x80000) return null;
  let marked = false;
  for (let n = 0; n < SLOT_COUNT; n++) {
    if (!slotLength(data, n)) continue;
    if (slotOk(data, n)) return 'ok';
    marked = true;
  }
  return marked ? 'bad-checksum' : null;
}
