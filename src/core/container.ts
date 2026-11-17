// Save files that arrive wrapped in another format. unwrapSave() gives the editor the plain battery save inside, and a
// wrap() that puts an edited save back into the same wrapper, so the file you get back opens where yours came from.

/** What unwrapSave() found: the plain save, and how to put an edited one back. */
export interface Unwrapped {
  data: Uint8Array;
  /** Name of the wrapper, or null for a plain save. */
  format: string | null;
  wrap(save: Uint8Array): Uint8Array;
  /** Set when the edited file can't go back in the wrapper and is saved as a plain save with this extension. */
  saveAs?: string;
}

const plain = (data: Uint8Array): Unwrapped => ({ data, format: null, wrap: (s) => s });

export function unwrapSave(data: Uint8Array): Unwrapped {
  return sharkPort(data) ?? gameSharkGsv(data) ?? desmumeDsv(data) ?? actionReplayDs(data) ?? plain(data);
}

// ---------- SharkPort (.sps) ----------
// The GameShark SP / Action Replay "SharkPort" export, which some emulators and phone apps also write. Layout, as in
// mGBA's src/gba/sharkport.c: length-prefixed "SharkPortSave", a u32 0x000F0000, three length-prefixed strings (game
// title, date, notes), a u32 payload size, then the payload (a 0x1C-byte header naming the cartridge, then the save
// itself), then a u32 checksum over the payload. Every number is little-endian.

const SHARKPORT_MAGIC = 'SharkPortSave';
const SHARKPORT_PLATFORM = 0x000f0000;
const SHARKPORT_HEADER = 0x1c;

/** The SharkPort checksum: each byte, read as signed, shifted left by the running total mod 24 and added. */
export function sharkPortChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (const b of bytes) sum = (sum + (((b << 24) >> 24) << (sum % 24))) >>> 0;
  return sum;
}

function sharkPort(data: Uint8Array): Unwrapped | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u32 = (o: number) => (o + 4 <= data.length ? view.getUint32(o, true) : -1);
  if (u32(0) !== SHARKPORT_MAGIC.length) return null;
  if (String.fromCharCode(...data.subarray(4, 4 + SHARKPORT_MAGIC.length)) !== SHARKPORT_MAGIC) return null;
  let at = 4 + SHARKPORT_MAGIC.length;
  if (u32(at) !== SHARKPORT_PLATFORM) return null;
  at += 4;
  for (let i = 0; i < 3; i++) {
    const n = u32(at);
    if (n < 0 || at + 4 + n > data.length) return null;
    at += 4 + n;
  }
  const sizeAt = at;
  const size = u32(sizeAt);
  const payloadAt = sizeAt + 4;
  if (size < SHARKPORT_HEADER || payloadAt + size + 4 > data.length) return null;
  const saveAt = payloadAt + SHARKPORT_HEADER;
  const head = data.slice(0, saveAt);
  const tail = data.slice(payloadAt + size + 4);
  return {
    data: data.slice(saveAt, payloadAt + size),
    format: 'SharkPort',
    wrap(save) {
      const out = new Uint8Array(head.length + save.length + 4 + tail.length);
      out.set(head);
      out.set(save, head.length);
      const ov = new DataView(out.buffer);
      ov.setUint32(sizeAt, SHARKPORT_HEADER + save.length, true);
      ov.setUint32(head.length + save.length, sharkPortChecksum(out.subarray(payloadAt, head.length + save.length)), true);
      out.set(tail, head.length + save.length + 4);
      return out;
    },
  };
}

// ---------- GameShark Advance SP (.gsv) ----------
// Layout as mGBA reads it (src/gba/sharkport.c): "ADVSAVEG", a u32 checksum, a 12-byte game title, padding, a u32 save
// type, 12 unknown bytes, a 0x400-byte description, the bytes 78 56 34 12, and the save itself at 0x430. Nobody has
// worked out the checksum, so an edited save can't be put back in a .gsv the GameShark would accept: it is saved as a
// plain .sav, which every emulator reads.

const GSV_MAGIC = 'ADVSAVEG';
const GSV_FOOTER_AT = 0x42c;
const GSV_PAYLOAD = 0x430;
/** Save size for each save type number, as mGBA has them. */
const GSV_SIZES: Record<number, number> = { 2: 0x8000, 3: 0x200, 4: 0x2000, 5: 0x10000, 6: 0x20000 };

function gameSharkGsv(data: Uint8Array): Unwrapped | null {
  if (data.length <= GSV_PAYLOAD) return null;
  if (String.fromCharCode(...data.subarray(0, GSV_MAGIC.length)) !== GSV_MAGIC) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(GSV_FOOTER_AT, true) !== 0x12345678) return null;
  const size = GSV_SIZES[view.getUint32(0x1c, true)] ?? data.length - GSV_PAYLOAD;
  if (GSV_PAYLOAD + size > data.length) return null;
  return { data: data.slice(GSV_PAYLOAD, GSV_PAYLOAD + size), format: 'GameShark SP', wrap: (s) => s, saveAs: '.sav' };
}

// ---------- DeSmuME (.dsv) ----------
// DeSmuME keeps a Nintendo DS save as the raw save, then a 122-byte footer: the text "|<--Snip above here to create a
// raw sav by excluding this DeSmuME savedata footer:", six u32 (the save's size, its padded size, the save chip's type,
// address size and memory size, and a version) and "|-DESMUME SAVE-|". The edited save goes back in front of the same
// footer.

const DSV_START = '|<--Snip above here to create a raw sav by excluding this DeSmuME savedata footer:';
const DSV_END = '|-DESMUME SAVE-|';
const DSV_FOOTER = DSV_START.length + 24 + DSV_END.length;

const text = (data: Uint8Array, at: number, n: number) => String.fromCharCode(...data.subarray(at, at + n));

function desmumeDsv(data: Uint8Array): Unwrapped | null {
  const at = data.length - DSV_FOOTER;
  if (at <= 0 || text(data, at, DSV_START.length) !== DSV_START || text(data, data.length - DSV_END.length, DSV_END.length) !== DSV_END) return null;
  const size = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(at + DSV_START.length, true);
  if (!size || size > at) return null;
  const body = data.slice(0, at);
  const footer = data.slice(at);
  return {
    data: data.slice(0, size),
    format: 'DeSmuME',
    wrap(save) {
      const out = new Uint8Array(body.length + footer.length);
      out.set(body);
      out.set(save.subarray(0, body.length));
      out.set(footer, body.length);
      return out;
    },
  };
}

// ---------- Action Replay DS (.duc) ----------
// The Action Replay DS's save backups: a 500-byte header that starts "ARDS000000000001" (the game's name and the
// owner's notes follow), then the raw save. No checksum over the save has turned up, so an edited save is written as a
// plain .sav, which emulators and flash cards read.

const ARDS_MAGIC = 'ARDS000000000001';
const ARDS_HEADER = 500;

function actionReplayDs(data: Uint8Array): Unwrapped | null {
  if (data.length <= ARDS_HEADER || text(data, 0, ARDS_MAGIC.length) !== ARDS_MAGIC) return null;
  return { data: data.slice(ARDS_HEADER), format: 'Action Replay DS', wrap: (s) => s, saveAs: '.sav' };
}
