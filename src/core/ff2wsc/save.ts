// Final Fantasy II (WonderSwan Color) save model. The remake keeps the Famicom game's records with a few numbers
// moved, so the Famicom model (../ff2nes/save.ts) does the work through WSC_FORMAT. Each slot holds nine character
// records of 0x74 bytes from slot + 6, one per character (Firion, Maria, Guy, Minwu, Josef, Gordon, Leila, Ricard,
// Leon); the editor shows the three heroes. Gil is a 32-bit number at slot + 0x422 and the bag 63 single items at
// slot + 0x426 (the 64th place is the menu's bin). Item ids are the Famicom ones. Checked in the game (see README).

import { Ff2NesSave, NES_FORMAT, type Ff2SlotFormat } from '../ff2nes/save.ts';
import { SLOT_COUNT, slotBase, slotOk, writeChecksum } from './layout.ts';
import { NAME_LENGTH, asSaved, decodeName, encodeName } from './text.ts';

/** In the order the save keeps them and the status screen shows them. */
export const WEAPON_SKILLS = ['Unarmed', 'Knife', 'Sword', 'Staff', 'Axe', 'Spear', 'Bow', 'Shield'] as const;
export const RECORD = 0x74;
export const BAG_SIZE = 63;

export const WSC_FORMAT: Ff2SlotFormat = {
  ...NES_FORMAT,
  slotCount: SLOT_COUNT, slotAt: slotBase, slotOk, writeChecksum,
  charCount: 3,
  charAt: (at, i) => [at + 6 + i * RECORD, at + 6 + i * RECORD],
  present: () => true,
  ch: { id: 0x00, name: 0x01, hp: 0x08, maxHp: 0x0a, mp: 0x0c, maxMp: 0x0e, stats: 0x10, worn: 0x20, spells: 0x30,
    right: 0x19, left: 0x1a, head: 0x1b, body: 0x1c, arms: 0x1d },
  ch2: { skills: 0x40, spellLevels: 0x50 },
  levelByte: 1, levelStoredAs: (lv) => lv,
  spellByte: (id) => id, spellId: (v) => (v >= 1 && v <= 40 ? v : 0),
  emptyHandByte: 0x30,
  gil: 0x422, gilBytes: 4, keyItems: null, bag: 0x426, bagSize: BAG_SIZE,
  weaponSkills: WEAPON_SKILLS,
  name: { length: NAME_LENGTH, decode: decodeName, encode: encodeName, asSaved },
};

export class Ff2WscSave extends Ff2NesSave {
  constructor(data: Uint8Array) { super(data, WSC_FORMAT); }
}
