// Where Final Fantasy II (WonderSwan Color) keeps its saves. Small on purpose: detect() imports only this.
//
// 32 KB of SRAM. "Final Fantasy2 6" at 0x10, then eight save slots of 0x66C bytes from 0x20, then the quick save at
// 0x3380 (with the map it was made on, so it's larger) and the game's working data. A slot starts with two zero bytes,
// a 16-bit checksum (the 16-bit little-endian words from slot + 6 to the end of the slot, added up) and 01 when it
// holds a save. Found by saving in Mednafen's WonderSwan core and changing saved values; the load screen offers a slot
// only when the sum matches.

export const SAVE_SIZE = 0x8000;
export const SLOT_COUNT = 8;
export const SLOT_SIZE = 0x66c;
export const MAGIC = 'Final Fantasy2 6';

export const slotBase = (n: number) => 0x20 + n * SLOT_SIZE;

export function slotSum(d: Uint8Array, at: number): number {
  let sum = 0;
  for (let i = 6; i < SLOT_SIZE; i += 2) sum += d[at + i] | (d[at + i + 1] << 8);
  return sum & 0xffff;
}
const stored = (d: Uint8Array, at: number) => d[at + 2] | (d[at + 3] << 8);

export const hasMagic = (d: Uint8Array) => d.length >= SAVE_SIZE && [...MAGIC].every((c, i) => d[0x10 + i] === c.charCodeAt(0));
export const slotUsed = (d: Uint8Array, n: number) => d[slotBase(n) + 4] === 1;
export const slotOk = (d: Uint8Array, n: number) => hasMagic(d) && slotUsed(d, n) && slotSum(d, slotBase(n)) === stored(d, slotBase(n));

export function writeChecksum(d: Uint8Array, at: number): void {
  const v = slotSum(d, at);
  d[at + 2] = v & 0xff;
  d[at + 3] = v >> 8;
}

export type Ff2WscDetection = 'ok' | 'bad-checksum' | null;

/** 'ok' when the game would offer at least one slot, 'bad-checksum' when slots are marked used but none adds up. */
export function detectFf2Wsc(d: Uint8Array): Ff2WscDetection {
  if (!hasMagic(d) || d.length > 0x10000) return null;
  let marked = false;
  for (let n = 0; n < SLOT_COUNT; n++) {
    if (!slotUsed(d, n)) continue;
    if (slotOk(d, n)) return 'ok';
    marked = true;
  }
  return marked ? 'bad-checksum' : null;
}
