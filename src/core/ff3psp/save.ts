// Final Fantasy III (PSP) save model. The PSP version keeps the DS's records (see ../ff3ds/save.ts) in other places, one
// game a save, with no check value of its own (the PSP's savedata hash covers the file); Ff3DsSave does the rest through
// PSP_LAYOUT. Its items, jobs, stats and names are the DS's too: the game's tables are byte for byte the same. Worked out
// from three real saves and checked in the game:
//
//   0xCB0 + 0x2F8 n  character n (0-3): +0x01 name (25 bytes, UTF-8), then the DS's fields 0x0C bytes further on.
//   0x1890           items, as on the DS: the bag (384), key items (64) and the Fat Chocobo (384).
//   0x25B8           gil; 0x25BC play time in seconds; 0xD4 the Job menu is open; 0x435 + j job j is in it.

import { Ff3DsSave, type Ff3Layout } from '../ff3ds/save.ts';
import { PSP_NAMES } from '../ff3ds/text.ts';
import { openFf3Psp, type Opened, type Wrapper } from './container.ts';

export const PSP_LAYOUT: Ff3Layout = {
  slotCount: 1,
  slotAt: () => 0,
  slotOk: () => true,
  slotLabel: () => 'Save',
  writeChecksum: () => {},
  party: 0xcb0, stride: 0x2f8, shift: 0x0c, names: PSP_NAMES,
  items: 0x1890, gil: 0x25b8, seconds: 0x25bc, jobMenu: 0xd4, jobs: 0x435,
  noSpell: 0xfffffc19, noHand: 0xffff,
};

export class Ff3PspSave extends Ff3DsSave {
  private readonly opened: Opened;
  constructor(file: Uint8Array) {
    const opened = openFf3Psp(file);
    if (!opened) throw new Error('This is not a Final Fantasy III (PSP) save.');
    super(opened.plain, PSP_LAYOUT);
    this.opened = opened;
  }
  get wrapper(): Wrapper { return this.opened.wrapper; }
  serialize(): Uint8Array { return this.opened.rebuild(super.serialize()); }
  loadNote(): string | null {
    return this.wrapper === 'savefile'
      ? 'You opened PLAYDATA.BIN on its own. The edited file works in PPSSPP. A real PSP also checks PARAM.SFO, so to play it there, open a zip of the whole save folder instead.'
      : null;
  }
}
