// Final Fantasy II (WonderSwan Color, English fan translation 0.10) name letters: a-z are 0x00-0x19, A-Z 0xA1-0xBA,
// and a short name is padded with 0xFF. Names are six letters. Checked by writing names into a save and reading them
// in the game's menus.

const DECODE = new Map<number, string>();
for (let i = 0; i < 26; i++) {
  DECODE.set(i, String.fromCharCode(97 + i));
  DECODE.set(0xa1 + i, String.fromCharCode(65 + i));
}
DECODE.set(0xff, ' ');
const ENCODE = new Map<string, number>();
for (const [b, c] of DECODE) if (c !== ' ') ENCODE.set(c, b);

export const NAME_LENGTH = 6;

/** A name as the game shows it. A byte that isn't a letter shows as "?". */
export function decodeName(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => DECODE.get(b) ?? '?').join('').trimEnd();
}
/** Six bytes for `text`, keeping only A-Z and a-z. */
export function encodeName(text: string): Uint8Array {
  const out = new Uint8Array(NAME_LENGTH).fill(0xff);
  [...text].filter((c) => ENCODE.has(c)).slice(0, NAME_LENGTH).forEach((c, i) => { out[i] = ENCODE.get(c)!; });
  return out;
}
export const asSaved = (text: string) => decodeName(encodeName(text));
