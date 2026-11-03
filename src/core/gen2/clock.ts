// The day and time in Gold, Silver and Crystal. The cartridge has a clock chip (MBC3 RTC) that counts days, hours,
// minutes and seconds from when it was started; the save keeps the offset the game adds to it (wStartDay, wStartHour,
// wStartMinute, wStartSecond, set when you tell Prof. Oak the time). The game shows chip + offset (home/time.asm
// FixTime), and the weekday is that day count mod 7, 0 being Sunday.
//
// The chip itself isn't in the save, but emulators keep it in a footer after the 32 KB of save data (the format VBA-M
// started and mGBA, BGB, SameBoy and others share): the five registers, the five latched registers, then the Unix
// time when the file was written, as 4 or 8 bytes. On load they run the chip on by however long has passed since. So
// with that footer we know what the chip reads now, and can set the offset that makes the game show any time.

import { SAVE_SIZE } from './layout.ts';

/** The days the game keeps on the chip before it wraps them (RTC_DAY_CYCLE): 140 is a whole number of weeks. */
const DAY_CYCLE = 140;
/** wStartDay, then the hour, minute and second: the same place in all three games (pret wram.asm). */
export const START_TIME = 0x2044;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface RtcFooter {
  seconds: number;
  minutes: number;
  hours: number;
  /** The 9-bit day counter. */
  days: number;
  /** The chip was stopped, or its day counter overflowed: the game asks for the time again either way. */
  stopped: boolean;
  /** Unix time (seconds) when the emulator wrote the file. */
  savedAt: number;
}

export interface GameTime {
  weekday: number;
  hour: number;
  minute: number;
}

/** The emulator clock footer after the save data, or null when the file has none. */
export function readRtcFooter(data: Uint8Array): RtcFooter | null {
  const extra = data.length - SAVE_SIZE;
  if (extra !== 44 && extra !== 48) return null;
  const v = new DataView(data.buffer, data.byteOffset + SAVE_SIZE, extra);
  const reg = (i: number) => v.getUint32(i * 4, true);
  if (reg(0) > 59 || reg(1) > 59 || reg(2) > 23) return null;
  const savedAt = extra === 48 ? Number(v.getBigUint64(40, true)) : reg(10);
  return {
    seconds: reg(0), minutes: reg(1), hours: reg(2),
    days: reg(3) & 0xff | (reg(4) & 1) << 8,
    stopped: !!(reg(4) & 0xc0),
    savedAt,
  };
}

/** What the chip reads at `now` (Unix seconds), as seconds since it started, with the days already wrapped as the game does. */
function chipSeconds(rtc: RtcFooter, now: number): number {
  const at = rtc.days * 86400 + rtc.hours * 3600 + rtc.minutes * 60 + rtc.seconds;
  const t = at + (rtc.stopped ? 0 : Math.max(0, Math.floor(now - rtc.savedAt)));
  return (Math.floor(t / 86400) % DAY_CYCLE) * 86400 + t % 86400;
}

/** The weekday and time the game shows at `now`, given the save's start offset. */
export function gameTimeAt(rtc: RtcFooter, start: Uint8Array, now: number): GameTime {
  const chip = chipSeconds(rtc, now);
  const t = chip + start[0] * 86400 + start[1] * 3600 + start[2] * 60 + start[3];
  return { weekday: Math.floor(t / 86400) % 7, hour: Math.floor(t / 3600) % 24, minute: Math.floor(t / 60) % 60 };
}

/**
 * The start offset (day, hour, minute, second) that makes the game show `want` at `now`, worked out as the game's own
 * clock setting does (engine/rtc/rtc.asm _InitTime): the wanted time minus the chip, borrowing a 140-day cycle and
 * keeping only the weekday when the day goes below zero.
 */
export function startFor(rtc: RtcFooter, want: GameTime, now: number): [number, number, number, number] {
  const chip = chipSeconds(rtc, now);
  const cs = chip % 60, cm = Math.floor(chip / 60) % 60, ch = Math.floor(chip / 3600) % 24, cd = Math.floor(chip / 86400);
  let borrow = 0;
  const sub = (a: number, b: number, mod: number) => {
    let r = a - b - borrow;
    borrow = r < 0 ? 1 : 0;
    if (r < 0) r += mod;
    return r;
  };
  const s = sub(0, cs, 60);
  const m = sub(want.minute, cm, 60);
  const h = sub(want.hour, ch, 24);
  let d = want.weekday - cd - borrow;
  if (d < 0) d = (d + DAY_CYCLE) % 7;
  return [d, h, m, s];
}
