// Final Fantasy III (Nintendo DS, USA) names: plain ASCII, 13 bytes padded with NUL. The name screen offers six
// letters from A-Z, a-z, 0-9 and ! ' ( ) - = ; + : , . / ? (no space), so those are all the editor writes.

export const NAME_LENGTH = 6;
export const NAME_BYTES = 13;
const ALLOWED = /^[A-Za-z0-9!'()\-=;+:,./?]$/;

/** A name as the game shows it. A byte the game wouldn't show reads as "?". */
export function decodeName(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (!b) break;
    out += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '?';
  }
  return out;
}

/** The 13 bytes for `text`: the letters the name screen has, six at most, then NULs. A curly apostrophe counts as "'". */
export function encodeName(text: string): Uint8Array {
  const chars = [...text.replace(/[‘’]/g, "'")].filter((c) => ALLOWED.test(c)).slice(0, NAME_LENGTH);
  const out = new Uint8Array(NAME_BYTES);
  chars.forEach((c, i) => { out[i] = c.charCodeAt(0); });
  return out;
}

/** `text` as the file will hold it. */
export const asSaved = (text: string) => decodeName(encodeName(text));
