// Final Fantasy III names. The DS (USA) keeps plain ASCII, 13 bytes padded with NUL; its name screen offers six letters
// from A-Z, a-z, 0-9 and ! ' ( ) - = ; + : , . / ? (no space). The PSP keeps UTF-8, 25 bytes padded with NUL, and asks
// for eight characters at most through the system keyboard. The editor writes the DS's letters on both: the PSP's fonts
// all have them, and they are the same bytes in ASCII and UTF-8.

export interface NameCodec {
  /** Characters a name can have. */
  readonly length: number;
  /** Bytes the save gives a name. */
  readonly bytes: number;
  /** A name as the game shows it. */
  decode(bytes: Uint8Array): string;
  /** The bytes for `text`: the letters the editor allows, `length` at most, then NULs. A curly apostrophe counts as "'". */
  encode(text: string): Uint8Array;
  /** `text` as the file will hold it. */
  asSaved(text: string): string;
}

const ALLOWED = /^[A-Za-z0-9!'()\-=;+:,./?]$/;

function nameCodec(length: number, bytes: number, show: (b: Uint8Array) => string): NameCodec {
  const decode = (b: Uint8Array) => { const end = b.indexOf(0); return show(b.subarray(0, end < 0 ? b.length : end)); };
  const encode = (text: string) => {
    const chars = [...text.replace(/[‘’]/g, "'")].filter((c) => ALLOWED.test(c)).slice(0, length);
    const out = new Uint8Array(bytes);
    chars.forEach((c, i) => { out[i] = c.charCodeAt(0); });
    return out;
  };
  return { length, bytes, decode, encode, asSaved: (text) => decode(encode(text)) };
}

/** A byte the DS wouldn't show reads as "?". */
export const DS_NAMES = nameCodec(6, 13, (b) => String.fromCharCode(...Array.from(b, (x) => (x >= 0x20 && x < 0x7f ? x : 0x3f))));
/** Whatever the PSP keyboard let someone type (kana, accents) shows as it is. */
export const PSP_NAMES = nameCodec(8, 25, (b) => new TextDecoder().decode(b));

export const NAME_LENGTH = DS_NAMES.length;
export const NAME_BYTES = DS_NAMES.bytes;
export const { decode: decodeName, encode: encodeName, asSaved } = DS_NAMES;
