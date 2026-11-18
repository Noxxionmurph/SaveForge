// Final Fantasy II (PSP, Anniversary Edition) save model. The decrypted data holds 20 files laid out like Dawn of
// Souls' (see ../ff2gba/save.ts), with a 0xF40-byte file, character records two bytes shorter (0x7E), Leon's record
// as a ninth, and the PSP's extra gear; Ff2GbaSave does the rest through PSP_FORMAT. The Soul of Rebirth files after the
// 20 main ones aren't opened. Checked against a real save.

import { clamp } from '../bytes.ts';
import { EMPTY_HAND, Ff2GbaSave, KIND as GBA_KIND, PORTRAITS as GBA_PORTRAITS, type Ff2Format } from '../ff2gba/save.ts';
import { ITEMS as GBA_ITEMS, SPELLS as GBA_SPELLS } from '../ff2gba/tables.ts';
import { FILE_BASE, FILE_COUNT, FILE_SIZE, hasMagic, openFf2Psp, type Opened, type Wrapper } from './container.ts';

export const MAX_GIL = 9_999_999;

/** Dawn of Souls' names, the PSP's "Power Sash", then what the PSP added (from the game's BOOT.BIN). */
export const ITEMS: readonly string[] = [
  ...GBA_ITEMS.slice(0, 0xc4).map((n, id) => (id === 0x92 ? 'Power Sash' : n)),
  'Destroy Tome', 'Revive Tome', 'Ragnarok', 'Artemis Bow', 'Gigantaxe', 'Staff of Light', 'Dragon Claws', 'Gungnir',
  'Dancing Dagger', "Abel's Lance", 'Longinus', 'Light of Hope',
];
export const SPELLS: readonly string[] = [...GBA_SPELLS, 'Destroy', 'Revive'];

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const KIND = {
  ...GBA_KIND,
  weapon: [...GBA_KIND.weapon, 0xc1, 0xc2, ...range(0xc6, 0xce)],
  arms: [...GBA_KIND.arms, 0xc3],
  tome: [...GBA_KIND.tome, 0xc4, 0xc5],
} as typeof GBA_KIND;
const GEAR_CHOICES = [[...KIND.weapon, ...KIND.shield], [...KIND.weapon, ...KIND.shield], KIND.head, KIND.body, KIND.arms];

const fileAt = (i: number) => FILE_BASE + i * FILE_SIZE;
function checksum(d: Uint8Array, at: number): number {
  let sum = FILE_SIZE;
  for (let i = at + 0x24; i < at + FILE_SIZE; i++) sum += d[i];
  return sum & 0xffff;
}

export const PSP_FORMAT: Ff2Format = {
  fileCount: FILE_COUNT,
  fileAt,
  fileOk: (d, i) => hasMagic(d, fileAt(i)) && checksum(d, fileAt(i)) === (d[fileAt(i) + 0x20] | (d[fileAt(i) + 0x21] << 8)),
  writeChecksum: (d, at) => { const v = checksum(d, at); d[at + 0x20] = v & 0xff; d[at + 0x21] = v >> 8; },
  chars: 0x22, charStride: 0x7e, charCount: 9, guest: 0x4a2, steps: 0x494, gil: 0x498, playTime: 0x49c, bagIds: 0x4a4, bagCounts: 0x53a,
  // 48 places at +0x6FC with the count at +0x74F, but the PSP has terms 16-45 the other versions don't, and their
  // names aren't known yet.
  keyTerms: null,
  maxGil: MAX_GIL, items: ITEMS, spells: SPELLS, kind: KIND, gearChoices: GEAR_CHOICES, portraits: [...GBA_PORTRAITS, 'leon', '', 'scott'],
  guestNamesFixed: true,
};

export class Ff2PspSave extends Ff2GbaSave {
  private readonly opened: Opened;
  constructor(file: Uint8Array) {
    const opened = openFf2Psp(file);
    if (!opened) throw new Error('This is not a Final Fantasy II (PSP) save.');
    super(opened.plain, PSP_FORMAT);
    this.opened = opened;
  }
  get wrapper(): Wrapper { return this.opened.wrapper; }
  serialize(): Uint8Array { return this.opened.rebuild(super.serialize()); }
  loadNote(): string | null {
    return this.wrapper === 'savefile'
      ? 'You opened SAVEDATA.SAV on its own. The edited file works in PPSSPP. A real PSP also checks PARAM.SFO, so to play it there, open a zip of the whole save folder instead.'
      : null;
  }
}

export { EMPTY_HAND, clamp };
