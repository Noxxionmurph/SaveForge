// Where Final Fantasy II (Famicom) keeps its saves, and the check the game runs before it offers one. Small on purpose:
// detect() imports only this, so the landing page doesn't download the editor's tables.
//
// The cartridge has 8 KB of battery RAM at $6000. The game plays from a working copy at $6000-$62FF; saving writes $5A
// at $62FE, sets $62FF so that the 768 bytes add up to $FF, and copies the lot to one of four slots at $6300, $6600,
// $6900 and $6C00. The load screen offers a slot only if its bytes add up to $FF and $5A is in place. (everything8215's
// disassembly, github.com/everything8215/ff2: 0F/DA8F saves, 0F/DAC1 checks a slot.)

export const SAVE_SIZE = 0x2000;
export const SLOT_COUNT = 4;
export const SLOT_SIZE = 0x300;
export const VALID = 0x2fe;
export const VALID_MARK = 0x5a;
export const CHECKSUM = 0x2ff;

/** File offset of save slot `n` (0-3). */
export const slotBase = (n: number) => 0x300 + n * SLOT_SIZE;

/** The 8-bit sum of a slot's 768 bytes, as the game adds them (clearing the carry each time). */
export function slotSum(data: Uint8Array, at: number): number {
  let a = 0;
  for (let i = 0; i < SLOT_SIZE; i++) a = (a + data[at + i]) & 0xff;
  return a;
}

/** Would the load screen offer slot `n`? */
export const slotOk = (data: Uint8Array, n: number) =>
  data.length >= SAVE_SIZE && data[slotBase(n) + VALID] === VALID_MARK && slotSum(data, slotBase(n)) === 0xff;

/** Set a slot's check byte the way the game does: what makes the sum come to $FF. */
export function writeChecksum(data: Uint8Array, at: number): void {
  data[at + VALID] = VALID_MARK;
  data[at + CHECKSUM] = 0;
  data[at + CHECKSUM] = slotSum(data, at) ^ 0xff;
}

/** Party bytes the game would never write: a hero who isn't Firion, Maria or Guy in the first three places. */
function plausible(data: Uint8Array, at: number): boolean {
  for (let i = 0; i < 3; i++) if ((data[at + 0x100 + i * 0x40] & 0x0f) !== i) return false;
  return true;
}

export type Ff2NesDetection = 'ok' | 'bad-checksum' | null;

/** 'ok' when the game would offer at least one slot, 'bad-checksum' when a slot is laid out right but fails the check. */
export function detectFf2Nes(data: Uint8Array): Ff2NesDetection {
  if (data.length < SAVE_SIZE || data.length > 0x10000) return null;
  let marked = false;
  for (let n = 0; n < SLOT_COUNT; n++) {
    const at = slotBase(n);
    if (data[at + VALID] !== VALID_MARK || !plausible(data, at)) continue;
    if (slotSum(data, at) === 0xff) return 'ok';
    marked = true;
  }
  return marked ? 'bad-checksum' : null;
}
