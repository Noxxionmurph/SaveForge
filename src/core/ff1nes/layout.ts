// Where Final Fantasy (NES) keeps its save, and the check the game runs before Continue. Small on purpose: detect()
// imports only this, so the landing page doesn't download the editor's tables.
//
// The cartridge has 8 KB of battery RAM at $6000. The game plays from a working copy at $6000-$63FF and Save copies it
// to $6400-$67FF, writes $55 and $AA at $64FE and $64FF and sets $64FD so that the checksum below comes to $FF. On
// Continue it checks all three and copies $6400 back; if any fails it starts a new game. (Disch's disassembly:
// SaveGame in bank_0E.asm, GameStart and VerifyChecksum in bank_0F.asm.)

export const SAVE_SIZE = 0x2000;
/** The saved copy, as a file offset. */
export const SAVED = 0x400;
export const BLOCK = 0x400;
export const CHECKSUM = 0xfd;
export const ASSERT_55 = 0xfe;
export const ASSERT_AA = 0xff;

/**
 * The game's checksum over the 1 KB block: an 8-bit add-with-carry that never clears the carry, taking the four 256-byte
 * pages a column at a time ($6400, $6500, $6600, $6700, then $6401 ...), exactly as the 6502 loop does.
 */
export function checksum(block: Uint8Array): number {
  let a = 0, c = 0;
  for (let x = 0; x < 0x100; x++) {
    for (let page = 0; page < 4; page++) {
      const sum = a + block[page * 0x100 + x] + c;
      a = sum & 0xff;
      c = sum >> 8;
    }
  }
  return a;
}

export const hasMarkers = (block: Uint8Array) => block[ASSERT_55] === 0x55 && block[ASSERT_AA] === 0xaa;
export const checksumOk = (block: Uint8Array) => checksum(block) === 0xff;

/** Party bytes the game would never write: a class past Black Wizard or a level past 50. */
function plausible(block: Uint8Array): boolean {
  for (let i = 0; i < 4; i++) {
    const ch = 0x100 + i * 0x40;
    if (block[ch] > 11 || block[ch + 0x26] > 49) return false;
  }
  return true;
}

export type Ff1Detection = 'ok' | 'bad-checksum' | null;

/** 'ok' when the game would load it, 'bad-checksum' when it is laid out right but the game would start a new game. */
export function detectFf1Nes(data: Uint8Array): Ff1Detection {
  if (data.length < SAVE_SIZE) return null;
  const block = data.subarray(SAVED, SAVED + BLOCK);
  if (!hasMarkers(block) || !plausible(block)) return null;
  return checksumOk(block) ? 'ok' : 'bad-checksum';
}
