// Final Fantasy III (Famicom, English fan translation) text: the tiles the name-entry screen offers (string $0121):
// A-Z, a-z, 0-9, space, - ' ! ? and three tiles that each hold two letters, "il", "li" and "ll". Names are six tiles,
// padded with 0xFF.

const DECODE = new Map<number, string>([
  [0xff, ' '], [0xc2, '-'], [0xbf, "'"], [0xc4, '!'], [0xc5, '?'], [0xcd, 'il'], [0xce, 'li'], [0xcf, 'll'],
]);
for (let i = 0; i < 10; i++) DECODE.set(0x80 + i, String(i));
for (let i = 0; i < 26; i++) {
  DECODE.set(0x8a + i, String.fromCharCode(65 + i));
  DECODE.set(0xa4 + i, String.fromCharCode(97 + i));
}

const ENCODE = new Map<string, number>();
for (const [b, c] of DECODE) ENCODE.set(c, b);
ENCODE.set('’', 0xbf);

export const NAME_LENGTH = 6;

/** A name as the game shows it, without its padding. A tile the name screen doesn't have shows as "?". */
export function decodeName(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => DECODE.get(b) ?? '?').join('').trimEnd();
}

/** The tiles for `text`, keeping only what the name screen has. When the letters don't fit in six tiles, the two-letter
 * tiles squeeze them up ("Phillip" fits as P-h-il-li-p). */
function tiles(text: string, pairs: boolean): number[] {
  const chars = [...text].filter((c) => ENCODE.has(c));
  const out: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const two = chars[i] + (chars[i + 1] ?? '');
    if (pairs && two.length === 2 && ENCODE.has(two)) { out.push(ENCODE.get(two)!); i++; }
    else out.push(ENCODE.get(chars[i])!);
  }
  return out;
}

/** Six tiles for `text`. */
export function encodeName(text: string): Uint8Array {
  const plain = tiles(text, false);
  const list = plain.length > NAME_LENGTH ? tiles(text, true) : plain;
  const out = new Uint8Array(NAME_LENGTH).fill(0xff);
  out.set(list.slice(0, NAME_LENGTH));
  return out;
}

/** `text` as the file will hold it. */
export const asSaved = (text: string) => decodeName(encodeName(text));
