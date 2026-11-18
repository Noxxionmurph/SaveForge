// Final Fantasy II's key terms: the words the heroes learn and can ask people about, "Wild Rose" first. Every version
// keeps them as a list, the most recently learned first and zeros after. Learning one moves the others down a place
// and puts it at the front, or moves it to the front if it's already there (the Famicom game's 0E/9597); the remakes
// also keep how many there are. The Famicom, WonderSwan Color and Dawn of Souls games have the same 15 in the same order
// in 16 places (checked in each: a list holding all 15 shows them all in the game's Key Terms menu), so the names are
// Dawn of Souls'. The PSP game has 48 places and 30 more terms, the words that break the Arcane Labyrinth's seals.

export const KEY_TERMS = [
  'Wild Rose', 'Mythril', 'Dreadnought', 'Palamecia', 'Airship', "Goddess's Bell", 'Sunfire', 'Mysidia',
  'Ultima Tome', 'Dragoons', 'Wyverns', 'Cyclone', 'Jade Passage', 'Mask', 'Ekmet Teloess',
] as const;
export const KEY_TERM_PLACES = 16;
/** The PSP game's 45, in its order: its English text (mesdata_US in the disc's ff2_data.bin) lists them one after
 * another, the 15 above and then these. */
export const PSP_KEY_TERMS: readonly string[] = [
  ...KEY_TERMS,
  'Authority', 'Mirror', 'Tracking', 'Desert', 'Cave', 'Dense Fog', 'Darkness', 'Aquifer', 'Greed', 'Iron Bars',
  'Tundra', 'Oasis', 'Soul', 'Fire', 'Thundercloud', 'Woodlands', 'Cauldron', 'Chronicles', 'Giants', 'Candelabra',
  'Wizard', 'Utopia', 'Sorcery', 'Mercy', 'Miasma', 'Wind', 'Oblivion', 'Hope', 'Destruction', 'Guardian',
];

/** Where one version keeps its list, inside a save slot or file. */
export interface KeyTermFormat {
  at: number;
  /** What's added to a term's number (from 1) to store it: 0xF0 on the Famicom, nothing in the remakes. */
  add: number;
  /** Where the remakes keep how many terms are in the list (null on the Famicom, which doesn't). */
  count: number | null;
  /** The terms by number, from 1, when they aren't the 15 every version shares (the PSP's 45). */
  names?: readonly string[];
  /** How many places the list has, when not 16 (the PSP's 48). */
  places?: number;
}

export class KeyTermList {
  private readonly d: Uint8Array;
  private readonly base: number;
  private readonly f: KeyTermFormat;
  /** The terms this version has, by number from 1. */
  readonly names: readonly string[];
  private readonly size: number;
  constructor(d: Uint8Array, base: number, f: KeyTermFormat) {
    this.d = d;
    this.base = base;
    this.f = f;
    this.names = f.names ?? KEY_TERMS;
    this.size = f.places ?? KEY_TERM_PLACES;
  }
  private places(): number[] { return Array.from(this.d.subarray(this.base + this.f.at, this.base + this.f.at + this.size)); }
  /** The term (from 1) a stored byte is, or 0. */
  private termOf(byte: number) {
    const id = (byte - this.f.add) & 0xff;
    return byte && id >= 1 && id <= this.names.length ? id : 0;
  }
  /** The learned terms (numbers from 1), most recent first. */
  get learned(): number[] { return this.places().map((b) => this.termOf(b)).filter(Boolean); }
  knows(id: number) { return this.learned.includes(id); }
  /** Learn a term (at the front of the list, as the game does) or forget one (the rest move up). Anything in the list
   * that isn't one of the terms is kept. */
  set(id: number, on: boolean) {
    if (id < 1 || id > this.names.length || on === this.knows(id)) return;
    const kept = this.places().filter((b) => b && this.termOf(b) !== id);
    const list = (on ? [this.f.add + id, ...kept] : kept).slice(0, this.size);
    const at = this.base + this.f.at;
    this.d.fill(0, at, at + this.size);
    this.d.set(list, at);
    if (this.f.count !== null) this.d[this.base + this.f.count] = list.length;
  }
}
