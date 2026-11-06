// Generates src/core/ff1wsc/tables.ts for Final Fantasy (WonderSwan Color, Japan, 2000).
//
//   node scripts/gen-ff1wsc-data.mjs "<Final Fantasy (Japan).wsc>"
//
// From the ROM (never commit it):
// - The item name table: 256 u16 pointers at 0x3A5E44 into bank 0x3A0000, one per save id. 1-17 key items, 0x20-0x25
//   items, 0x40-0x67 weapons, 0x70-0x97 armor; the rest are blank. Spell names follow at 0x3A6046 (1-32 white, 33-64
//   black). The text uses the game's own character set (see NAME_CHARS in save.ts); a name starts with an 0xFC icon.
//   The script only checks that every id this editor names has a name in the ROM, in the order below.
// - Who can equip what: [base classes, promoted classes] byte pairs, one per weapon at 0x3ABAB2 and one per armor at
//   0x3ABBA2; who can learn each spell at 0x3ABE7D. Bit n of the first byte is class n (0-5), bit n of the second is
//   class 8 + n (the promoted classes are saved as 8-13). Written here as one mask whose bit number is the class.
// The English names are the GBA remake's (the same games in the same order, item for item); the Japanese ROM is checked
// against them by count and category.

import { readFileSync, writeFileSync } from 'node:fs';

const romPath = process.argv[2];
if (!romPath) {
  console.error('usage: node scripts/gen-ff1wsc-data.mjs <rom.wsc>');
  process.exit(1);
}
const rom = readFileSync(romPath);
// The footer: publisher Square (0x28), game 01, 32 Mbit ROM, 256 Kbit SRAM.
const foot = rom.subarray(rom.length - 10);
if (rom.length !== 0x400000 || foot[0] !== 0x28 || foot[2] !== 0x01 || foot[5] !== 0x02) throw new Error('not Final Fantasy (WonderSwan Color)');

const name = (id) => {
  const p = rom.readUInt16LE(0x3a5e44 + id * 2);
  const at = 0x3a0000 + p;
  const end = rom.indexOf(0xff, at);
  return rom.subarray(at, end);
};
const named = (id) => { const n = name(id); return n.length > 1 && n[0] !== 0xef; };

const KEY_ITEMS = ['Lute', 'Crown', 'Crystal Eye', 'Jolt Tonic', 'Mystic Key', 'Nitro Powder', 'Adamantite', 'Rosetta Stone',
  'Star Ruby', 'Earth Rod', 'Levistone', 'Chime', "Rat's Tail", 'Warp Cube', 'Bottled Faerie', 'Oxyale', 'Canoe'];
const CONSUMABLES = ['Sleeping Bag', 'Tent', 'Cottage', 'Potion', 'Antidote', 'Gold Needle'];
const WEAPONS = ['Nunchaku', 'Knife', 'Staff', 'Rapier', 'Hammer', 'Broadsword', 'Battle Axe', 'Scimitar', 'Iron Nunchaku',
  'Dagger', 'Crosier', 'Saber', 'Longsword', 'Great Axe', 'Falchion', 'Mythril Knife', 'Mythril Sword', 'Mythril Hammer',
  'Mythril Axe', 'Flame Sword', 'Ice Brand', 'Wyrmkiller', 'Great Sword', 'Sun Blade', 'Coral Sword', 'Werebuster',
  'Rune Blade', 'Power Staff', 'Light Axe', 'Healing Staff', "Mage's Staff", 'Defender', "Wizard's Staff", 'Vorpal Sword',
  'Cat Claws', "Thor's Hammer", 'Razer', "Sasuke's Blade", 'Excalibur', 'Masamune'];
// slot: 1 body, 2 shield, 3 helmet, 4 gloves (the save's gear bytes after the weapon)
const ARMOR = [
  ...['Clothes', 'Leather Armor', 'Chain Mail', 'Iron Armor', "Knight's Armor", 'Mythril Mail', 'Flame Mail', 'Ice Armor',
    'Diamond Armor', 'Dragon Mail', 'Copper Armlet', 'Silver Armlet', 'Ruby Armlet', 'Diamond Armlet', 'White Robe',
    'Black Robe'].map((n) => [n, 1]),
  ...['Leather Shield', 'Iron Shield', 'Mythril Shield', 'Flame Shield', 'Ice Shield', 'Diamond Shield', 'Aegis Shield',
    'Buckler', 'Protect Cloak'].map((n) => [n, 2]),
  ...['Leather Cap', 'Helm', 'Great Helm', 'Mythril Helm', 'Diamond Helm', 'Healing Helm', 'Ribbon'].map((n) => [n, 3]),
  ...['Leather Gloves', 'Bronze Gloves', 'Steel Gloves', 'Mythril Gloves', 'Gauntlets', "Giant's Gloves", 'Diamond Gloves',
    'Protect Ring'].map((n) => [n, 4]),
];
const SPELLS = ['Cure', 'Dia', 'Protect', 'Blink', 'Blindna', 'Silence', 'NulShock', 'Invis', 'Cura', 'Diara', 'NulBlaze',
  'Heal', 'Poisona', 'Fear', 'NulFrost', 'Vox', 'Curaga', 'Life', 'Diaga', 'Healara', 'Stona', 'Exit', 'Protera',
  'Invisira', 'Curaja', 'Diaja', 'NulDeath', 'Healaga', 'Full-Life', 'Holy', 'NulAll', 'Dispel', 'Fire', 'Sleep', 'Focus',
  'Thunder', 'Blizzard', 'Dark', 'Temper', 'Slow', 'Fira', 'Hold', 'Thundara', 'Focara', 'Sleepra', 'Haste', 'Confuse',
  'Blizzara', 'Firaga', 'Scourge', 'Teleport', 'Slowra', 'Thundaga', 'Death', 'Quake', 'Stun', 'Blizzaga', 'Break', 'Saber',
  'Blind', 'Flare', 'Stop', 'Warp', 'Kill'];

const check = (first, list, icon) => {
  list.forEach((_, i) => {
    if (!named(first + i)) throw new Error(`no ROM name for id 0x${(first + i).toString(16)}`);
    if (icon !== undefined && name(first + i)[1] !== icon) throw new Error(`id 0x${(first + i).toString(16)} is in the wrong category`);
  });
  if (named(first + list.length)) throw new Error(`id 0x${(first + list.length).toString(16)} has a name: the list is longer`);
};
check(0x01, KEY_ITEMS);
check(0x20, CONSUMABLES);
check(0x40, WEAPONS);
check(0x70, ARMOR);
// armor categories by their icon: robes/clothes 0x07, armor 0x08, armlets 0x09, shields 0x0a, helmets 0x0b, gloves 0x0c
const ICON_SLOT = { 0x07: 1, 0x08: 1, 0x09: 1, 0x0a: 2, 0x0b: 3, 0x0c: 4 };
ARMOR.forEach(([n, slot], i) => {
  if (ICON_SLOT[name(0x70 + i)[1]] !== slot) throw new Error(`${n}: slot ${slot} doesn't match the ROM's icon`);
});
let at = 0x3a6046;
for (let i = 0; i < 64; i++) {
  const end = rom.indexOf(0xff, at);
  if (rom[at] !== 0xfc || rom[at + 1] !== (i < 32 ? 0x0d : 0x0e)) throw new Error(`spell ${i + 1} isn't where it should be`);
  at = end + 1;
}

const masks = (from, n) => Array.from({ length: n }, (_, i) => rom[from + i * 2] | (rom[from + i * 2 + 1] << 8));
const WEAPON_JOBS = masks(0x3abab2, 40);
const ARMOR_JOBS = masks(0x3abba2, 40);
const SPELL_JOBS = masks(0x3abe7d, 64);
// sanity: Excalibur is the Knight's alone, Masamune anyone's; the Ribbon anyone's; Cure the white and red mages'
if (WEAPON_JOBS[38] !== 0x100 || WEAPON_JOBS[39] !== 0x3f3f || ARMOR_JOBS[31] !== 0x3f3f || SPELL_JOBS[0] !== 0x1918) {
  throw new Error('equip tables are not where expected');
}

const list = (n, a) => `export const ${n}: readonly string[] = [\n${a.map((s) => `  ${JSON.stringify(s)},`).join('\n')}\n];\n`;
const nums = (n, a) => `export const ${n}: readonly number[] = [${a.join(',')}];\n`;
const out = `// Generated by scripts/gen-ff1wsc-data.mjs from the game's ROM. Do not edit by hand.
// Final Fantasy (WonderSwan Color, Japan): English names by save id, and the game's equip and magic tables.

/** Key items, save id 1-17. */
${list('KEY_ITEMS', KEY_ITEMS)}/** Items, save id 0x20-0x25 (1-6 here). */
${list('CONSUMABLES', CONSUMABLES)}/** Weapons, save id 0x40-0x67 (1-40 here). */
${list('WEAPONS', WEAPONS)}/** Armor, save id 0x70-0x97 (1-40 here). */
${list('ARMOR', ARMOR.map(([n]) => n))}/** Which gear place each armor goes in: 1 body, 2 shield, 3 helmet, 4 gloves. */
${nums('ARMOR_SLOT', ARMOR.map(([, s]) => s))}/** Spells 1-64: 1-32 white, 33-64 black, four a level. */
${list('SPELLS', SPELLS)}
/** Bit n set: class n can equip / learn it (classes 0-5, and 8-13 once promoted). */
${nums('WEAPON_JOBS', WEAPON_JOBS)}${nums('ARMOR_JOBS', ARMOR_JOBS)}${nums('SPELL_JOBS', SPELL_JOBS)}`;
writeFileSync(new URL('../src/core/ff1wsc/tables.ts', import.meta.url), out);
console.log('wrote src/core/ff1wsc/tables.ts');
