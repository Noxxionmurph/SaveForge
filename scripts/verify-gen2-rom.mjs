// Checks the editor's built-in Gen 2 tables against a Gold, Silver or Crystal ROM you supply:
//
//     node scripts/verify-gen2-rom.mjs path/to/pokemon-crystal.gbc
//
// It reads the ROM, compares, and prints what differs. Nothing from the ROM is copied into the repo or written anywhere.
// Each table is found by searching for its first entry (the layouts are pokegold's and pokecrystal's), so the script
// works on every English release.
import { readFileSync } from 'node:fs';
import { BASE_TABLE, ITEM_TABLE, MOVE_TABLE, SPECIES_NAMES, TMHM_MOVES } from '../src/core/gen2/tables.ts';
import { GROWTH_RATES, expForLevel, itemName, pocketOf } from '../src/core/gen2/data.ts';

const path = process.argv[2];
if (!path) { console.error('usage: node scripts/verify-gen2-rom.mjs path/to/rom.gbc'); process.exit(2); }
const rom = new Uint8Array(readFileSync(path));
const title = String.fromCharCode(...rom.slice(0x134, 0x13f)).replace(/\0/g, '');
const crystal = title.startsWith('PM_CRYSTAL');
if (!crystal && !/^POKEMON_(GLD|SLV)/.test(title)) { console.error(`not a Gold, Silver or Crystal ROM (title ${title})`); process.exit(2); }
console.log(`ROM: ${title}, revision ${rom[0x14c]}, ${rom.length} bytes`);
const set = crystal ? 'crystal' : 'gs';

const problems = [];
const report = (what, total, bad) => {
  console.log(`${what}: ${total - bad.length}/${total} match`);
  for (const b of bad.slice(0, 12)) problems.push(`${what}: ${b}`);
  if (bad.length > 12) problems.push(`${what}: ...and ${bad.length - 12} more`);
};
const find = (bytes, from = 0) => {
  outer: for (let i = from; i <= rom.length - bytes.length; i++) {
    for (let j = 0; j < bytes.length; j++) if (rom[i + j] !== bytes[j]) continue outer;
    return i;
  }
  return -1;
};

// The game's text encoding (charmap.asm) for what names use.
const CHARS = { ' ': 0x7f, '(': 0x9a, ')': 0x9b, "'": 0xe0, '-': 0xe3, '?': 0xe6, '!': 0xe7, '.': 0xe8, '&': 0xe9, 'é': 0xea, '♂': 0xef, '/': 0xf3, ',': 0xf4, '♀': 0xf5 };
const encode = (s) => Array.from(s, (c) => (c in CHARS ? CHARS[c] : c >= 'A' && c <= 'Z' ? 0x80 + c.charCodeAt(0) - 65 : c >= 'a' && c <= 'z' ? 0xa0 + c.charCodeAt(0) - 97 : c >= '0' && c <= '9' ? 0xf6 + +c : 0x50));
const decodeAt = (o, max = 20) => {
  let s = '', i = 0;
  for (; i < max; i++) {
    const b = rom[o + i];
    if (b === 0x50) { i++; break; }
    if (b === 0x54) { s += 'POKé'; continue; } // the game's one-tile "POKé"
    const rev = Object.entries(CHARS).find(([, v]) => v === b);
    s += rev ? rev[0] : b >= 0x80 && b <= 0x99 ? String.fromCharCode(65 + b - 0x80) : b >= 0xa0 && b <= 0xb9 ? String.fromCharCode(97 + b - 0xa0) : b >= 0xf6 ? String(b - 0xf6) : `<${b.toString(16)}>`;
  }
  return { s, next: o + i };
};
// The ROM spells names in capitals and squeezes some to fit ("MR.MIME", "EXP.SHARE"); the editor adds the spaces back.
const same = (a, b) => a.toUpperCase().replace(/ /g, '') === b.toUpperCase().replace(/ /g, '');

const TYPES = { 0: 'Normal', 1: 'Fighting', 2: 'Flying', 3: 'Poison', 4: 'Ground', 5: 'Rock', 7: 'Bug', 8: 'Ghost', 9: 'Steel', 19: '???', 20: 'Fire', 21: 'Water', 22: 'Grass', 23: 'Electric', 24: 'Psychic', 25: 'Ice', 26: 'Dragon', 27: 'Dark' };
const typeId = (name) => +Object.keys(TYPES).find((k) => TYPES[k] === name);

// ---------- base stats (BaseData, 32 bytes each, from dex #1) ----------
{
  const b = BASE_TABLE[0];
  const base = find([1, b[0], b[1], b[2], b[3], b[4], b[5], typeId(b[6]), typeId(b[7])]);
  if (base < 0) problems.push('base stats: Bulbasaur\'s entry not found');
  else {
    const names = ['hp', 'atk', 'def', 'spe', 'spa', 'spd', 'type1', 'type2', 'gender', 'growth', 'catch rate', 'egg cycles'];
    const bad = [];
    BASE_TABLE.forEach((want, i) => {
      const o = base + 32 * i;
      const got = [rom[o + 1], rom[o + 2], rom[o + 3], rom[o + 4], rom[o + 5], rom[o + 6], TYPES[rom[o + 7]], TYPES[rom[o + 8]], rom[o + 13], rom[o + 22], rom[o + 9], rom[o + 15]];
      if (rom[o] !== i + 1) { bad.push(`#${i + 1}: entry holds dex ${rom[o]}`); return; }
      const diff = names.filter((_, k) => got[k] !== want[k]).map((n) => `${n} ${want[names.indexOf(n)]} vs ROM ${got[names.indexOf(n)]}`);
      if (diff.length) bad.push(`#${i + 1} ${SPECIES_NAMES[i]}: ${diff.join(', ')}`);
    });
    report('base stats, types, gender ratio, growth, catch rate, egg cycles', BASE_TABLE.length, bad);
  }
}

// ---------- species names (PokemonNames, 10 bytes each) ----------
{
  const base = find([...encode('BULBASAUR'), 0x50, ...encode('IVYSAUR')]);
  if (base < 0) problems.push('species names: table not found');
  else {
    const bad = [];
    SPECIES_NAMES.forEach((name, i) => {
      const got = decodeAt(base + 10 * i, 10).s;
      if (!same(got, name)) bad.push(`#${i + 1} "${name}" vs ROM "${got}"`);
    });
    report('species names', SPECIES_NAMES.length, bad);
  }
}

// ---------- moves (Moves, 7 bytes each from Pound: animation, effect, power, type, accuracy, PP, effect chance) ----------
{
  const base = find([1, 0, 40, 0, 255, 35, 0, 2]);
  if (base < 0) problems.push('moves: table not found');
  else {
    const bad = [];
    MOVE_TABLE.forEach(([name, type, power, acc, pp], i) => {
      const o = base + 7 * i;
      const got = [TYPES[rom[o + 3]], rom[o + 2], rom[o + 4], rom[o + 5]];
      const want = [type, power, acc, pp];
      if (rom[o] !== i + 1 || got.some((g, k) => g !== want[k])) bad.push(`#${i + 1} ${name}: editor ${want.join('/')} vs ROM ${got.join('/')}`);
    });
    report('moves (type, power, accuracy, PP)', MOVE_TABLE.length, bad);
  }
  let at = find([...encode('POUND'), 0x50, ...encode('KARATE')]);
  if (at < 0) problems.push('move names: table not found');
  else {
    const bad = [];
    MOVE_TABLE.forEach(([name], i) => {
      const r = decodeAt(at); at = r.next;
      if (!same(r.s, name)) bad.push(`#${i + 1} "${name}" vs ROM "${r.s}"`);
    });
    report('move names', MOVE_TABLE.length, bad);
  }
}

// ---------- items (ItemNames, from id 1; ItemAttributes, 7 bytes each with the pocket at +5) ----------
{
  let at = find([...encode('MASTER BALL'), 0x50, ...encode('ULTRA BALL'), 0x50]);
  // ItemAttributes: Master Ball costs 0 and is in the Ball pocket (3); Ultra Ball costs ¥1200 (0x04b0, little-endian).
  const attr = find([0x00, 0x00, 0x00, 0x00, 0x40, 0x03, 0x06, 0xb0, 0x04]) ;
  if (at < 0) problems.push('item names: table not found');
  else {
    const POCKETS = [null, 'item', 'key', 'ball', 'tmhm'];
    const bad = [], badPocket = [];
    let named = 0;
    for (let id = 1; id <= 0xf9; id++) {
      const r = decodeAt(at); at = r.next;
      const editor = itemName(id, set);
      const unnamed = /^Item 0x/.test(editor);
      if (r.s === 'TERU-SAMA' || r.s === '?') { if (!unnamed && !/^(Teru-sama|\?)$/i.test(editor)) bad.push(`#0x${id.toString(16)} "${editor}" vs ROM placeholder "${r.s}"`); continue; }
      named++;
      if (!same(r.s, editor)) bad.push(`#0x${id.toString(16)} "${editor}" vs ROM "${r.s}"`);
      if (attr >= 0) {
        const p = POCKETS[rom[attr + 7 * (id - 1) + 5]];
        if (p !== pocketOf(id, set)) badPocket.push(`#0x${id.toString(16)} ${editor}: editor ${pocketOf(id, set)} vs ROM ${p}`);
      }
    }
    report(`item names (ids 1-0xF9, placeholders skipped)`, named, bad);
    if (attr < 0) problems.push('item pockets: ItemAttributes not found');
    else report('item pockets', named, badPocket);
  }
}

// ---------- TM/HM moves (TMHMMoves, 1 byte each) ----------
{
  const at = find(TMHM_MOVES.slice(0, 6));
  if (at < 0) problems.push('TM/HM moves: table not found (or TM01-06 differ)');
  else {
    const bad = TMHM_MOVES.map((m, i) => (rom[at + i] === m ? null : `${i < 50 ? 'TM' + (i + 1) : 'HM' + (i - 49)}: editor ${m} vs ROM ${rom[at + i]}`)).filter(Boolean);
    report('TM/HM moves', TMHM_MOVES.length, bad);
  }
}

// ---------- growth rates (GrowthRates: a/b nibbles, c (sign in bit 7), d, e; exp = a/b n^3 + c n^2 + d n - e) ----------
{
  // Medium Fast = 1/1, 0, 0, 0; Slightly Fast = 3/4, 10, 0, 30
  const at = find([0x11, 0x00, 0x00, 0x00, 0x34, 0x0a, 0x00, 0x1e]);
  if (at < 0) problems.push('growth rates: table not found');
  else {
    const bad = [];
    for (let g = 0; g < 6; g++) {
      const o = at + 4 * g, a = rom[o] >> 4, b = rom[o] & 15, c = (rom[o + 1] & 0x80 ? -1 : 1) * (rom[o + 1] & 0x7f), d = rom[o + 2], e = rom[o + 3];
      for (let n = 2; n <= 100; n++) {
        // CalcExpAtLevel: the n^3 term is multiplied then divided in integers, the rest added and subtracted
        const want = Math.floor((n ** 3 * a) / b) + c * n * n + d * n - e;
        const got = expForLevel(GROWTH_RATES[g], n);
        if (got !== want) bad.push(`${GROWTH_RATES[g]} level ${n}: editor ${got} vs game ${want}`);
      }
    }
    report('experience for each level (6 curves x 2-100)', 6 * 99, bad);
  }
}

console.log(problems.length ? `\n${problems.length} problem(s):\n- ${problems.join('\n- ')}` : '\nEverything checked matches.');
process.exit(problems.length ? 1 : 0);
