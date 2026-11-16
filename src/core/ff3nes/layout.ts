// Where Final Fantasy III (Famicom) keeps its saves, and the check the game runs before it offers one. Small on purpose:
// detect() imports only this, so the landing page doesn't download the editor's tables.
//
// The cartridge has 8 KB of battery RAM at $6000. The game plays from a working copy at $6000-$63FF; saving writes $5A at
// $6019, sets $601A so that the 1,024 bytes add up to $FF, and copies the lot to one of three slots at $6400, $6800 and
// $6C00. The load screen offers a slot only if $5A is in place and its bytes add up to $FF. (everything8215's
// disassembly, github.com/everything8215/ff3: 3D/AE5C sets the check byte, 3D/A93D saves, 3D/AE97 checks a slot.)

export const SAVE_SIZE = 0x2000;
export const SLOT_COUNT = 3;
export const SLOT_SIZE = 0x400;
export const VALID = 0x19;
export const VALID_MARK = 0x5a;
export const CHECKSUM = 0x1a;
export const JOB_COUNT = 22;

/** File offset of save slot `n` (0-2). */
export const slotBase = (n: number) => 0x400 + n * SLOT_SIZE;

/** The 8-bit sum of a slot's 1,024 bytes, as the game adds them (clearing the carry each time). */
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

/** Party bytes the game would never write: a job past Ninja, or a level or job level past 99 (they're kept as level - 1). */
function plausible(data: Uint8Array, at: number): boolean {
  for (let i = 0; i < 4; i++) {
    const o = at + 0x100 + i * 0x40;
    if (data[o] >= JOB_COUNT || data[o + 1] > 98 || data[o + 0x10] > 98) return false;
  }
  return true;
}

export type Ff3NesDetection = 'ok' | 'bad-checksum' | null;

/** 'ok' when the game would offer at least one slot, 'bad-checksum' when a slot is laid out right but fails the check. */
export function detectFf3Nes(data: Uint8Array): Ff3NesDetection {
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
