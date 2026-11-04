// Final Fantasy (NES, US) text: the font tiles the name-entry screen offers. Names are four tiles, padded with 0xFF.

const DECODE = new Map<number, string>();
for (let i = 0; i < 10; i++) DECODE.set(0x80 + i, String(i));
for (let i = 0; i < 26; i++) {
  DECODE.set(0x8a + i, String.fromCharCode(65 + i));
  DECODE.set(0xa4 + i, String.fromCharCode(97 + i));
}
// The rest of the name-entry screen: ' , . space - … ! ?
for (const [b, c] of [[0xbe, "'"], [0xbf, ','], [0xc0, '.'], [0xc1, ' '], [0xc2, '-'], [0xc3, '…'], [0xc4, '!'], [0xc5, '?'], [0xff, ' ']] as const) DECODE.set(b, c);

const ENCODE = new Map<string, number>();
for (const [b, c] of DECODE) if (b !== 0xc1) ENCODE.set(c, b);

export const NAME_LENGTH = 4;

/** A name as the game shows it, without its padding. A tile the name screen can't make shows as "?". */
export function decodeName(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => DECODE.get(b) ?? '?').join('').trimEnd();
}

/** Four tiles for `text`: characters the game has no tile for become "?", and short names are padded with spaces. */
export function encodeName(text: string): Uint8Array {
  const out = new Uint8Array(NAME_LENGTH).fill(0xff);
  [...text].slice(0, NAME_LENGTH).forEach((c, i) => { out[i] = ENCODE.get(c) ?? ENCODE.get('?')!; });
  return out;
}

/** `text` as the file will hold it, for comparing and for the review list. */
export const asSaved = (text: string) => decodeName(encodeName(text));
