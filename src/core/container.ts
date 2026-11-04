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
  return sharkPort(data) ?? gameSharkGsv(data) ?? plain(data);
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
