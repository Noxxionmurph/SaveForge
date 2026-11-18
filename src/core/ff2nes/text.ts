// Final Fantasy II (Famicom, English fan translation by Neo Demiforce) text: the tiles the name-entry screen offers,
// A-Z and a-z. Names are six tiles, padded with 0xFF. Checked against names typed on the game's own name screen.

const DECODE = new Map<number, string>();
for (let i = 0; i < 10; i++) DECODE.set(0x80 + i, String(i));
for (let i = 0; i < 26; i++) {
  DECODE.set(0x8a + i, String.fromCharCode(65 + i));
  DECODE.set(0xa4 + i, String.fromCharCode(97 + i));
}
DECODE.set(0xff, ' ');

const ENCODE = new Map<string, number>();
for (const [b, c] of DECODE) if (/[A-Za-z]/.test(c)) ENCODE.set(c, b);

export const NAME_LENGTH = 6;

/** Tiles the patch draws a name with that hold more than one letter each: Richard's (the game's own record for him,
 * which the editor copies in when he joins; the game shows "Richard"). */
const SQUEEZED: readonly (readonly [readonly number[], string])[] = [[[0xe8, 0xe9, 0xea, 0xeb, 0xec], 'Richar']];

/** A name as the game shows it, without its padding. A tile that isn't a letter or digit shows as "?". */
export function decodeName(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const run = SQUEEZED.find(([tiles]) => tiles.every((t, k) => bytes[i + k] === t));
    if (run) { out += run[1]; i += run[0].length - 1; } else out += DECODE.get(bytes[i]) ?? '?';
  }
  return out.trimEnd();
}

/** Six tiles for `text`, keeping only the letters the name screen has. */
export function encodeName(text: string): Uint8Array {
  const out = new Uint8Array(NAME_LENGTH).fill(0xff);
  [...text].filter((c) => ENCODE.has(c)).slice(0, NAME_LENGTH).forEach((c, i) => { out[i] = ENCODE.get(c)!; });
  return out;
}

/** `text` as the file will hold it. */
export const asSaved = (text: string) => decodeName(encodeName(text));
