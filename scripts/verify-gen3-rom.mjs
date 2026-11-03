// Checks the editor's built-in Gen 3 tables against a Ruby, Sapphire or Emerald ROM you supply:
//
//     node scripts/verify-gen3-rom.mjs path/to/pokemon-emerald.gba
//
// It reads the ROM, compares, and prints what differs. Nothing from the ROM is copied into the repo or written anywhere.
// Each table is found by searching for its first entry (the layouts are pokeruby's and pokeemerald's), so the script
// works on every English release.
import { readFileSync } from 'node:fs';
import {
  ABILITY_NAMES, BASE_TABLE, INTERNAL_TO_DEX, ITEM_TABLE, MOVE_TABLE, SPECIES_NAMES, TMHM_MOVES,
} from '../src/core/gen3/tables.ts';
import { GROWTH_RATES, expForLevel, natureEffect } from '../src/core/gen3/data.ts';

const path = process.argv[2];
if (!path) { console.error('usage: node scripts/verify-gen3-rom.mjs path/to/rom.gba'); process.exit(2); }
const rom = new Uint8Array(readFileSync(path));
const code = String.fromCharCode(...rom.slice(0xac, 0xb0));
const game = { AXVE: 'Ruby', AXPE: 'Sapphire', BPEE: 'Emerald' }[code];
if (!game) { console.error(`not an English Ruby, Sapphire or Emerald ROM (game code ${code})`); process.exit(2); }
const emerald = game === 'Emerald';
console.log(`ROM: ${game} (${code}, revision ${rom[0xbc]}), ${rom.length} bytes`);

const problems = [];
const report = (what, total, bad) => {
  console.log(`${what}: ${total - bad.length}/${total} match`);
  for (const b of bad.slice(0, 12)) problems.push(`${what}: ${b}`);
  if (bad.length > 12) problems.push(`${what}: ...and ${bad.length - 12} more`);
};
const find = (bytes, from = 0) => {
  outer: for (let i = from; i <= rom.length - bytes.length; i++) {
    for (let j = 0; j < bytes.length; j++) if (bytes[j] !== null && rom[i + j] !== bytes[j]) continue outer;
    return i;
  }
  return -1;
};
const u16 = (o) => rom[o] | (rom[o + 1] << 8);
const u32 = (o) => (rom[o] | (rom[o + 1] << 8) | (rom[o + 2] << 16) | (rom[o + 3] << 24)) >>> 0;

// The game's text encoding (charmap.txt) for what names use.
const CHARS = { ' ': 0x00, 'é': 0x1b, '!': 0xab, '?': 0xac, '.': 0xad, '-': 0xae, '…': 0xb0, '“': 0xb1, '”': 0xb2, '‘': 0xb3, "'": 0xb4, '♂': 0xb5, '♀': 0xb6, ',': 0xb8, '/': 0xba };
const encode = (s) => Array.from(s, (c) => (c in CHARS ? CHARS[c] : c >= 'A' && c <= 'Z' ? 0xbb + c.charCodeAt(0) - 65 : c >= 'a' && c <= 'z' ? 0xd5 + c.charCodeAt(0) - 97 : c >= '0' && c <= '9' ? 0xa1 + +c : 0x00));
const decode = (o, len) => {
  let s = '';
  for (let i = 0; i < len; i++) {
    const b = rom[o + i];
    if (b === 0xff) break;
    if (b === 0x55) { s += 'POKéBLOCK'; i += 4; continue; } // the game draws "POKéBLOCK" as one five-tile glyph run
    const rev = Object.entries(CHARS).find(([, v]) => v === b);
    s += rev ? rev[0] : b >= 0xbb && b <= 0xd4 ? String.fromCharCode(65 + b - 0xbb) : b >= 0xd5 && b <= 0xee ? String.fromCharCode(97 + b - 0xd5) : b >= 0xa1 && b <= 0xaa ? String(b - 0xa1) : `<${b.toString(16)}>`;
  }
  return s;
};
// The ROM spells names in capitals and the editor in title case, and the editor writes "Poké" where the ROM has é.
const same = (a, b) => a.toUpperCase() === b.toUpperCase();

const TYPES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', '???', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark'];
const DEX_TO_INTERNAL = [];
INTERNAL_TO_DEX.forEach((dex, id) => { if (dex) DEX_TO_INTERNAL[dex] = id; });

// ---------- base stats (gBaseStats, 28 bytes each, by the game's species number) ----------
{
  const b = BASE_TABLE[0];
  const first = find([b[0], b[1], b[2], b[3], b[4], b[5], TYPES.indexOf(b[6]), TYPES.indexOf(b[7])]);
  if (first < 0) problems.push('base stats: Bulbasaur\'s entry not found');
  else {
    const base = first - 28; // entry 0 is SPECIES_NONE
    const bad = [];
    BASE_TABLE.forEach((row, i) => {
      const dex = i + 1, o = base + 28 * DEX_TO_INTERNAL[dex];
      const [hp, atk, def, spe, spa, spd, t1, t2, gender, growth, eggCycles, a1, a2, friendship] = row;
      const rom_ = [rom[o], rom[o + 1], rom[o + 2], rom[o + 3], rom[o + 4], rom[o + 5], TYPES[rom[o + 6]], TYPES[rom[o + 7]],
        rom[o + 16], rom[o + 19], rom[o + 17], rom[o + 22], rom[o + 23], rom[o + 18]];
      const want = [hp, atk, def, spe, spa, spd, t1, t2, gender, growth, eggCycles, a1, a2, friendship];
      const names = ['hp', 'atk', 'def', 'spe', 'spa', 'spd', 'type1', 'type2', 'gender', 'growth', 'egg cycles', 'ability 1', 'ability 2', 'friendship'];
      const diff = names.filter((_, k) => rom_[k] !== want[k]).map((n) => `${n} ${want[names.indexOf(n)]} vs ROM ${rom_[names.indexOf(n)]}`);
      if (diff.length) bad.push(`#${dex} ${SPECIES_NAMES[i]}: ${diff.join(', ')}`);
    });
    report('base stats, types, gender ratio, growth, egg cycles, abilities, friendship', BASE_TABLE.length, bad);
  }
}

// ---------- species names (gSpeciesNames, 11 bytes each) ----------
{
  const first = find([...encode('BULBASAUR'), 0xff]);
  const base = first - 11;
  if (first < 0 || decode(base, 11) !== '??????????') problems.push('species names: table not found');
  else {
    const bad = [];
    SPECIES_NAMES.forEach((name, i) => {
      const got = decode(base + 11 * DEX_TO_INTERNAL[i + 1], 11);
      if (!same(got, name)) bad.push(`#${i + 1} "${name}" vs ROM "${got}"`);
    });
    report('species names', SPECIES_NAMES.length, bad);
  }
}

// ---------- moves (gBattleMoves, 12 bytes each) and move names (gMoveNames, 13 bytes each) ----------
{
  const first = find([0x00, 40, 0, 100, 35, 0], 0);
  // gBattleMoves[0] is MOVE_NONE (all zero), Pound is entry 1
  let base = -1;
  for (let at = first; at >= 0; at = find([0x00, 40, 0, 100, 35, 0], at + 1)) {
    if (rom.slice(at - 12, at).every((x) => x === 0) && rom[at + 13] === 50 && rom[at + 14] === 1) { base = at - 12; break; }
  }
  if (base < 0) problems.push('moves: table not found');
  else {
    const bad = [];
    MOVE_TABLE.forEach(([name, type, power, acc, pp], i) => {
      const o = base + 12 * (i + 1);
      const got = [TYPES[rom[o + 2]], rom[o + 1], rom[o + 3], rom[o + 4]];
      const want = [type, power, acc, pp];
      if (got.some((g, k) => g !== want[k])) bad.push(`#${i + 1} ${name}: editor ${want.join('/')} vs ROM ${got.join('/')}`);
    });
    report('moves (type, power, accuracy, PP)', MOVE_TABLE.length, bad);
  }
  const nfirst = find([...encode('POUND'), 0xff]);
  const nbase = nfirst - 13;
  if (nfirst < 0 || decode(nbase, 13) !== '-') problems.push('move names: table not found');
  else {
    const bad = [];
    MOVE_TABLE.forEach(([name], i) => {
      const got = decode(nbase + 13 * (i + 1), 13);
      if (!same(got, name)) bad.push(`#${i + 1} "${name}" vs ROM "${got}"`);
    });
    report('move names', MOVE_TABLE.length, bad);
  }
}

// ---------- abilities (gAbilityNames, 13 bytes each) ----------
{
  const first = find([...encode('STENCH'), 0xff]);
  const base = first - 13;
  if (first < 0) problems.push('ability names: table not found');
  else {
    const bad = [];
    ABILITY_NAMES.forEach((name, i) => {
      if (i === 0) return;
      const got = decode(base + 13 * i, 13);
      if (!same(got, name)) bad.push(`#${i} "${name}" vs ROM "${got}"`);
    });
    report('ability names', ABILITY_NAMES.length - 1, bad);
  }
}

// ---------- items (gItems, 44 bytes each: name, id, price, ..., pocket at +26) ----------
{
  const first = find([...encode('MASTER BALL'), 0xff, null, null, 0x01, 0x00]);
  if (first < 0) problems.push('items: table not found');
  else {
    const base = first - 44;
    const POCKETS = [null, 'item', 'ball', 'tmhm', 'berry', 'key'];
    const bad = [];
    const rows = ITEM_TABLE.filter(([, , , rs]) => emerald || rs);
    for (const [id, name, pocket] of rows) {
      const o = base + 44 * id;
      const gotName = decode(o, 14), gotId = u16(o + 14), gotPocket = POCKETS[rom[o + 26]];
      if (gotId !== id || !same(gotName, name) || gotPocket !== pocket) {
        bad.push(`#${id} "${name}" ${pocket} vs ROM #${gotId} "${gotName}" ${gotPocket}`);
      }
    }
    // Items the ROM has that the editor's list leaves out (named, not "????????")
    const known = new Set(rows.map(([id]) => id));
    const missing = [];
    for (let id = 1; id < 400; id++) {
      const o = base + 44 * id;
      if (u16(o + 14) !== id) break;
      const n = decode(o, 14);
      if (n !== '????????' && !known.has(id)) missing.push(`#${id} ${n}`);
    }
    report('items (name, pocket)', rows.length, bad);
    if (missing.length) problems.push(`items the ROM has but the editor doesn't list: ${missing.join(', ')}`);
  }
}

// ---------- TM/HM moves (sTMHMMoves, u16 each) ----------
{
  const at = find(TMHM_MOVES.slice(0, 4).flatMap((m) => [m & 0xff, m >> 8]));
  if (at < 0) problems.push('TM/HM moves: table not found (or TM01-04 differ)');
  else {
    const bad = TMHM_MOVES.map((m, i) => (u16(at + 2 * i) === m ? null : `${i < 50 ? 'TM' + (i + 1) : 'HM' + (i - 49)}: editor ${m} vs ROM ${u16(at + 2 * i)}`)).filter(Boolean);
    report('TM/HM moves', TMHM_MOVES.length, bad);
  }
}

// ---------- nature table (gNatureStatTable, 25 x 5 signed bytes: atk, def, spe, spa, spd) ----------
{
  const NATURE_KEYS = ['atk', 'def', 'spe', 'spa', 'spd'];
  const want = [];
  for (let n = 0; n < 25; n++) {
    const e = natureEffect(n);
    for (const k of NATURE_KEYS) want.push(!e ? 0 : e.up === k ? 1 : e.down === k ? 0xff : 0);
  }
  const at = find(want);
  console.log(`nature stat table: ${at >= 0 ? 'found in the ROM exactly as the editor has it (25/25)' : 'NOT found'}`);
  if (at < 0) problems.push('nature stat table: the editor\'s raise/lower table is not in the ROM');
}

// ---------- experience tables (gExperienceTables, 6 x 101 u32) ----------
{
  const row = (g) => Array.from({ length: 101 }, (_, n) => (n === 0 ? 0 : expForLevel(GROWTH_RATES[g], n)));
  const probe = row(0).slice(0, 4).flatMap((v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24]);
  const at = find(probe);
  if (at < 0) problems.push('experience tables: not found');
  else {
    const bad = [];
    for (let g = 0; g < 6; g++) {
      row(g).forEach((v, n) => {
        if (n === 0) return;
        const got = u32(at + 4 * (101 * g + n));
        if (got !== v && !(n === 1)) bad.push(`${GROWTH_RATES[g]} level ${n}: editor ${v} vs ROM ${got}`);
      });
    }
    report('experience for each level (6 curves x 2-100)', 6 * 99, bad);
  }
}

console.log(problems.length ? `\n${problems.length} problem(s):\n- ${problems.join('\n- ')}` : '\nEverything checked matches.');
process.exit(problems.length ? 1 : 0);
