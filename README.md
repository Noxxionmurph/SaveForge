# SaveForge — multi-game save editor (TypeScript, runs in the browser)

One site, many games. Drop a save on the landing page, the game is detected from the file's structure
(size, checksums, layout; never a hash, since saves change on every write), and that game's editor is
lazy-loaded. Currently supported: Pokémon Red / Blue / Yellow, Gold / Silver / Crystal and Ruby / Sapphire / FireRed / LeafGreen / Emerald (English), and Final Fantasy (NES, English; I and II from Dawn of Souls on GBA, US; PSP Anniversary Edition, US).
Everything is a self-contained "game module", so adding Gen 4–5, more Final Fantasy versions, Mega Man Battle Network, etc. never touches the shell.

## Look and feel

[DESIGN.md](DESIGN.md) is the short version: tokens, consoles, fonts, pixel scales and the rules new pages follow.

The page is styled as a handheld: grey plastic shell, olive LCD panels wherever the app shows data (levels, stats,
Pokédex totals, the example change list on the landing page), magenta action buttons. Colours are CSS tokens at the top of `styles.css` with a
light and a dark set. A game module can set `theme: 'gbc'` to restyle the page as a teal Game Boy Color (a pale screen with
a dark bezel, teal shell, dark teal buttons) or `theme: 'gba'` for an indigo Game Boy Advance (a bright white-blue window,
indigo shell and buttons, and the two-line frame and ruled paper of the Gen 3 trainer card on the big readouts): only
the tokens (and that one frame rule) change, in the `data-console` blocks of `styles.css`. No game uses either yet.
`theme: 'nes'` is the NES: grey and black, red buttons, and the deep blue, white-edged windows NES role-playing games
draw their menus in, in place of an LCD. `theme: 'psp'` is the black PSP with silver buttons, its screens drawn as the
PSP remake's blue gradient menu windows. Add `?console=gbc`, `?console=gba`, `?console=nes` or `?console=psp` (or `?console=gb`) to the
address to preview a theme on every screen.
Touches borrowed from the games themselves: HP bars use the game's own length and colour rules (`src/core/gen1/hp.ts`, from
the disassembly in pret/pokered), the review dialog opens with the PLAYER / BADGES / POKÉDEX / TIME window the game shows when you
save, the open tab has the menu cursor, the big readouts have a two-line frame like the in-game text boxes (on Gen 2 and Gen 3 pages, the frame the save's OPTION menu has chosen, in the game's own art, redrawn as you step through FRAME: `src/ui/windowFrame.ts`, `scripts/extract-frames.py`), the Options card is
drawn like the game's OPTION screen (every choice shown, the chosen one marked with the cursor; real radio buttons underneath),
the Pokédex totals are the game's SEEN / OWN window, the trainer card keeps each badge in its own boxed slot (dashed until earned) and the badge picker is one row of eight (on a phone without the names, with a line under it naming the badges you have), and the trainer card types itself in once when a file opens (not for
people who ask for less motion). Fonts (Pixelify Sans, Instrument Sans, JetBrains Mono) are bundled in `fonts/` (SIL Open Font License, Latin only,
~100 KB together), so the page makes no request to Google or any other font host; a character a font lacks falls back to
the system font. `scripts/make-fonts.py` remakes the files from the google/fonts repository.
Every retro window (the trainer card, Options, stats, save and review windows, the Pokédex totals, Pikachu's windows) is set in
Pixelify Sans, uppercase for its small labels; the sans is for reading and the monospace only for typing into number fields.
So that ordinary text and numbers can be set in the pixel font, the shipped copy has two small changes (see the header of
`make-fonts.py`): its 5, which was the same shape as its S, is redrawn with a flat top, and its fi / fl ligatures, which were drawn as an "A", are left out. (The Claude-hosted copy
of the page is the one exception: it still links Google Fonts.) A game can set `colors` on its module to give each title a cartridge-label colour on the landing page.

## Artwork

The pictures (Pokémon box icons for dex #1-251 plus Unown's letters and an egg, item icons, type icons, Kanto and Johto
gym badges and Pikachu's reactions) are **not in
this repository**. They live in [SaveHub-assets](https://github.com/Noxxionmurph/SaveHub-assets), which is served as its
own site (`https://noxxionmurph.github.io/SaveHub-assets/`); the editor loads them from there. The images are
© Nintendo / Creatures Inc. / GAME FREAK Inc. and come from PokéSprite, The Spriters Resource and Serebii (see
[CREDITS.md](CREDITS.md)). Keeping them apart means a request to remove artwork only ever touches that repository, and
the editor carries on without pictures (a picture that can't load hides itself, and the Pikachu preview box is dropped).

- **One place decides where they come from**: `ART_BASE` in `src/ui/art.ts`. Nothing else names a path to the artwork
  (`npm test` checks), so moving or removing it is a one-line change.
- **Working on the code**: `git clone https://github.com/Noxxionmurph/SaveHub-assets assets` inside this folder (it is
  git-ignored), then `npm run dev`. `npm run build:local` does the same build without serving. A plain `npm run build`
  makes the site as it is deployed: no pictures inside it, loaded from the artwork site. Without the checkout the
  tests that read the picture files skip themselves.
- **Updates reach phones straight away**: the deployed build puts a version (a hash of everything that ships) on the
  address of every script and stylesheet (`styles.css?v=...`), so a browser that kept an older copy for GitHub Pages' 10
  minutes can't run it next to newer files; only the page itself can be up to 10 minutes old. `scripts/build.mjs` does it;
  `--local-art` builds don't carry a version.
- **Changing the artwork**: edit it in the `assets` checkout and push that repository; the editor picks it up with no
  rebuild. To refresh from a PokéSprite checkout: `node scripts/import-sprites.mjs <path>`.
- **If the artwork has to come down**: delete the files (or the repository) in SaveHub-assets. The editor keeps working.
  To point at another place, change `ART_BASE`.
- **Every picture looks like part of one set.** Pixel art (Pokémon, items, badges, Pikachu) is drawn at a whole number
  of screen pixels per art pixel, with hard edges, whatever the screen scaling (100%, 125%, a 2.625 phone...); a
  fractional multiple is what makes pixel art look soft and uneven. `src/ui/pixels.ts` publishes the scaling as `--dpr`
  and the stylesheet turns it into `--px1` and `--px2`, the whole-screen-pixel sizes nearest one and two CSS pixels
  (with `round()`; browsers without it get plain 1px and 2px). The "one scale for every picture" block at the end of
  `styles.css` holds the rules. When adding a page or a game, keep to them:
  - Pokémon and items in lists, tiles, cells and bag rows use `--px1`, so they are the same size everywhere. Never size
    them in plain pixels or percentages. A held item is the one exception: 0.75px per art pixel (24px), just past the
    Pokémon's bottom-right corner, as the games' party screens show it (Kieron's call: small, never on the Pokémon).
  - The Pokémon window and the landing page show Pokémon at `--px2`.
  - Badges are as large as their row allows, cut down to a whole multiple (`e2e/crisp.py`).
  - Type icons (smooth artwork) are always 24px, as tall as the Lv box; the shiny mark is always 16px; ♂/♀ are
    drawn (SVG, 0.75em), since the bundled fonts lack them and system fallbacks look choppy.
  - A new kind of picture gets a rule in that block and an entry in `KINDS` in `e2e/assets.py`, which walks every page
    of every game at seven screen scalings and fails on a picture that is blurry, smoothed or a different size from its
    kind elsewhere.
- The box icons are drawn with their feet on a common baseline, so the art sits low in its canvas;
  `scripts/measure-icons.mjs` measures where the visible pixels really are and writes `src/ui/spriteOffsets.ts`, and
  the UI nudges each icon by that much so Pokémon look vertically centred wherever they appear (the import script
  runs it for you, and `npm test` fails if the table is stale, when the artwork is checked out). Which file shows for which
  item is one table per game (`src/ui/editors/gen1/itemSprites.ts`, `src/ui/editors/gen2/itemSprites.ts`), and `npm test`
  checks that every file they name exists. The Johto badges are Gold's own trainer card badges in the game's badge
  palette; `scripts/extract-johto-badges.py` makes them from the pokegold disassembly.

## Not affiliated

SaveForge is an unofficial fan tool, free and non-commercial, with no ads or donation links. It is not affiliated with
or endorsed by Nintendo, Game Freak, Creatures Inc. or Square Enix. The site says so in its footer, with links to this repository, the
issue tracker (the contact address) and the credits.

## Run it

Requires Node 22.18+ (uses Node's built-in TypeScript stripping — **no npm dependencies**).

```
npm run dev          # builds to dist/ (artwork from ./assets/, see Artwork) and serves http://localhost:5173
npm test             # unit tests (data tables, round-trips, checksums)
python3 e2e/run.py    # browser checks in a real Chromium (see e2e/README.md; needs Playwright and the artwork checkout)
node scripts/make-sample.ts sample.sav   # the same made-up Yellow save the "Try a Yellow sample" button opens
node scripts/gen-moves.mjs <pokered checkout>   # regenerates src/core/gen1/moves.ts (type, power, accuracy, PP)
node scripts/verify-against-rom.mjs rom.gb      # checks the Gen 1 tables below against a Red/Blue ROM you own (copies nothing)
node scripts/verify-gen2-rom.mjs rom.gbc        # the same for the Gen 2 tables, against Gold, Silver or Crystal
node scripts/verify-gen3-rom.mjs rom.gba        # the same for the Gen 3 tables, against Ruby, Sapphire or Emerald
python3 scripts/gbrun.py rom.gb edited.sav out 'w1500; p start; ...; s shot'   # plays a Gen 1 or Gen 2 save from a script of button presses (PyBoy)
gcc -O2 scripts/gbarun.c -o gbarun -lmgba       # the same for Gen 3 (mGBA's library; see the file's header)
node scripts/measure-icons.mjs                  # regenerates src/ui/spriteOffsets.ts after changing the Pokémon icons
node scripts/gen-gen2-data.mjs <pokegold checkout>   # regenerates src/core/gen2/tables.ts (species, base stats, moves, items)
node scripts/gen-crystal-data.mjs <pokecrystal checkout>   # regenerates src/core/gen2/crystalTables.ts (Crystal's items and place names)
python3 scripts/boot-gen2-save.py gold.gbc edited.sav out.png   # opens a Gold, Silver or Crystal save in the real game (PyBoy, your own ROM) and takes pictures
node scripts/gen-gen3-data.mjs <pokeemerald checkout> <pokeruby checkout>   # regenerates src/core/gen3/tables.ts (species, base stats, abilities, moves, items, places)
node scripts/import-sprites.mjs <PokéSprite checkout>   # copies the Pokémon, item and type icons into ./assets/ (then commit them in the artwork repository)
python3 scripts/extract-hoenn-badges.py <pokeemerald>/graphics/trainer_card/badges.png   # the Hoenn badges, into ./assets/
python3 scripts/extract-frames.py <pokecrystal> <pokeruby> <pokeemerald>   # the OPTION menu's window frames, into ./assets/
```

Everything runs client-side; saves never leave the browser. **Back up your real .sav before editing.**

Besides plain `.sav` files it opens SharkPort `.sps` exports (the GameShark SP format, which some emulators and phone
apps write): the save inside is edited and Save gives back a `.sps` with the same header and a fresh checksum
(`src/core/container.ts`). GameShark Advance SP `.gsv` files open too, but come back as a plain `.sav`: nobody has worked
out the `.gsv` checksum, so an edited one couldn't be put back in a file the GameShark accepts. Plain saves open under any
name (`.sav`, `.srm`, `.sa1`, ...). Game Boy saves with an emulator's clock footer on the end already open as they are.

## Gen 1 features

- Trainer: name, rival, ID, money, coins, play time, badges; in-game options (text speed, battle animations,
  battle style, and in Yellow the sound: Mono or Earphone 1-3)
- **Pokémon Yellow** is told apart from Red/Blue by the file itself (Yellow writes Pikachu's state into a block
  Red and Blue leave empty). A Yellow save gets a Pikachu card: friendship (0-255, with the game's own wording
  for each range), mood (0-255, 128 is neutral) and whether the game still counts your Pikachu as your starter.
  A live picture at the top shows how Pikachu will react when you talk to it, and stays in view as you move the
  sliders. Whether the game follows your Pikachu depends on its original trainer matching your name and Trainer ID,
  so the editor tags the starter in the party, warns in the review list if an edit would orphan it, and has a
  "Make Pikachu my starter" button. Red and Blue can't be told apart, so those saves ask which one yours is.
- Bag and PC item storage (only items the game can actually put there)
- Party and all 12 boxes. The party has up/down arrows beside each card; boxes are a 4 x 5 grid like the PC, with your
  party in a row above it. **Drag a Pokémon onto another to swap them** (inside a box, between boxes and the party),
  or onto an empty spot to move it to the end; hold a dragged Pokémon over the ‹ › buttons to turn to the next box.
  Tap one for its menu instead: edit it, move it to the party or any box, duplicate it or remove it. The last Pokémon in
  the party can't be moved out or removed (a swap is fine, since the count doesn't change).
- Full Pokémon editor: species, nickname, OT, level, exp (the species' own growth curve), status, moves (with type icons), DVs, EVs,
  battle stats. Each move shows its PP (read-only) and a PP Up stepper (0-3); every PP Up raises the maximum and the
  current PP with it, like the game, and "Max PP" is shown under both. Restore PP refills all four.
- Pokédex: not seen / seen / caught (caught only marks the Pokédex, it doesn't add the Pokémon), with a filter
  (All / Not seen / Seen / Caught) and a search by name or number. Gen 1 and Gen 2 share it (`src/ui/dexTab.ts`).
- **Save** first shows a plain-language list of everything that changed (and "No changes yet" if nothing did)
- "Try a Yellow sample", "Try a Crystal sample" and "Try an Emerald sample" on the landing page open made-up saves, so nothing needs to be uploaded to look around
- All checksums recalculated on export (main + box banks); an unedited save round-trips byte-for-byte
- The Day-Care on Route 5: the Pokémon staying there appears under the party, to edit, take back or leave there with
  Move to…. Checked in Red: the game counts its steps.
- Legendary Pokémon: the two Snorlax, Zapdos, Moltres, Articuno and Mewtwo, each shown as still there or gone (battled),
  with a box to bring back one that's gone. Checked against Red: the flags the editor reads are the ones the game keeps.
- Stuck? Start in a safe place: the next Continue starts you in your bedroom, on foot (for a save left somewhere you
  can't get out of). Checked in Red and Yellow, Pikachu following.
- Boxes 2-12 of a save where the player never changed box are read as empty (the game hasn't set them up, and empties
  them on the first change of box). Putting a Pokémon in one sets them all up and marks them, as that first change does.
- A file opened with "Try opening anyway" after failing its checksum says so above the editor.

## Gen 2 features (Gold / Silver)

- Trainer: name, rival, ID, money, Mom's savings, coins, play time (to 999 hours), all 16 badges (Johto and Kanto, shown
  on the trainer card in the game's own badge art), and every OPTION setting: text speed, battle scene, battle style,
  sound, Game Boy Printer shade, menu account and text box frame.
- Day and time: set the weekday, hour and minute the game shows, when the file carries the emulator's clock data
  (the 44 or 48-byte footer VBA-M, mGBA, BGB and SameBoy write after the save). SaveForge works out what the clock
  chip reads now and sets the offset the game adds to it (wStartDay to wStartSecond), as Prof. Oak's clock setting
  does. Without the footer, a switch makes the game ask for the day and time on the next Continue (sRTCStatusFlags
  bit 7, as its own reset password does). Both checked in Gold and Crystal.
- All four bag pockets (Items, Balls, Key Items, TM/HM with a count for each of the 57, and a switch to hide the ones you already have) and PC item storage. Each picker
  only offers what the game files in that pocket.
- Party and all 14 boxes, with box names. Moving works as in Gen 1 (arrows, drag and drop, the action menu) and follows
  the game's PC rules: a Pokémon holding Mail can't go in a box, the party always keeps one Pokémon that can battle (an
  egg can't), a Pokémon taken out of a box is healed, and one put in has its PP restored.
- The Day-Care on Route 34: the old man's and the old woman's Pokémon appear under the party, to edit, take back or
  leave there with Move to… (no eggs, no Mail, as in the game). When the game itself started a pair breeding (it makes
  the egg then), a switch has the old man waiting outside with it. Changing the pair stops breeding until the game takes
  a Pokémon in again. Checked in Crystal: the two show in the yard and the old man comes out with the egg.
- Legendary Pokémon: Sudowoodo, the red Gyarados, Snorlax, Lugia, Ho-Oh and the roaming dogs, each shown as still
  there or gone, with a box to bring back one that's gone (a dog that was beaten or caught starts roaming again from
  its first route). Checked in Crystal: Sudowoodo is back on Route 36. Crystal's Suicune at Tin Tower can't be brought
  back (it depends on that map's scene, not just flags).
- Stuck? Start in a safe place: the next Continue starts you in New Bark Town, on foot. Checked in Crystal.
- Pokémon editor with what Gen 2 added: held item, friendship, Pokérus, Special Attack and Special Defense, and eggs
  (egg cycles, and hatching one or turning it back into an egg). Gender, shininess and Unown's letter come from the
  DVs in these games, so they're set from the DVs: pick a gender, tap Make shiny, or pick a letter, and the editor
  changes as few DV bits as it can. Shiny Pokémon get a ★ and Unown shows its own letter everywhere.
- Pokédex: all 251 seen / caught.
- Both copies of the save are written (Gold and Silver keep a backup), with both checksums; an unedited save
  round-trips byte for byte. If the main copy is damaged but the backup isn't, the file opens from the backup (as the
  game does) and saving repairs the main copy.

## Crystal

Crystal opens in the same editor, with its own save layout (most addresses moved a few bytes, and the backup copy is
one block in bank 0; see `GEN2_LAYOUTS` in `src/core/gen2/save.ts`). It also has:

- Whether you play as the boy or the girl (kept outside the checksummed data, at 0x3E3D, and read back on Continue).
- Its four new key items: Clear Bell, GS Ball, Blue Card and Egg Ticket.
- Where each Pokémon was caught: the place, the level, the time of day and whether its trainer was a boy or a girl
  (two bytes Gold and Silver leave empty; `src/core/gen2/caught.ts`).

## Gen 3 features (Ruby / Sapphire / FireRed / LeafGreen / Emerald)

Ruby and Sapphire share a save layout and can't be told apart, so those saves ask which one yours is; Emerald's blocks
are longer and it hides money, coins and bag counts under a per-save key, so it is recognised on its own and opens in
the same editor (`GEN3_LAYOUTS` in `src/core/gen3/save.ts`).

- Trainer: name, boy or girl, Trainer ID and secret ID, money, Game Corner coins, play time, the eight Hoenn badges (in
  the games' own trainer card art), the National Pokédex (unlocked the way Professor Birch does it), and every OPTION
  setting: text speed, battle scene, battle style, sound, button mode and the 20 frames. Emerald adds Battle Points,
  Berry Powder, the seven Battle Frontier symbols (none, silver or gold), and every facility's current and record streaks
  for each mode and level (plus Dome championships, Factory rentals and the trainer card's BP won).
- Event islands: the tickets the S.S. Tidal needs (Mystery Gift items in the real games), each given with the flag the
  ferry attendant checks alongside it. Ruby and Sapphire have the Eon Ticket (Southern Island); Emerald adds the
  AuroraTicket (Birth Island), the Old Sea Map (Faraway Island) and the MysticTicket (Navel Rock). The card says whether
  each island's legendary has already been met, and that the ferry only sails after the Hall of Fame. Checked in the
  real games: Emerald's ferry sails to Faraway Island and Ruby's to Southern Island.
- The roaming Latios or Latias (once the game has made it): which one, level, nature, IVs, shininess and whether it still
  roams.
- Emerald's trainer rematches: which registered trainers (and, after the Hall of Fame, gym leaders) are asking for one,
  with the team the game would pick.
- Decorations in the PC: each category's list (desks, chairs, plants, ornaments, mats, posters, dolls, cushions), or one
  of every decoration.
- Your secret base: make it at any of the 75 spots, move it (as in the game, its decorations go back to the PC) or take
  it down, and set out decorations on a picture of the room drawn from the game's own tiles: drag them in from a strip
  of the PC's spare ones (or pick one and tap the room), drag them around (dolls on a desk move with it), and tap one to
  put it away. Placing follows the game's rules (posters on the back wall, dolls and cushions on a large desk or mat, 16 decorations, 14 dolls
  and cushions). Friends' bases from record mixing are left as they are.
- The Pokéblock case: up to 40 Pokéblocks, each with its colour (in the game's own pictures), five flavours and feel.
- Game stats: every counter the game keeps (steps, battles, catches, eggs hatched, trades, contests, link battles and
  the rest) and the first Hall of Fame time shown on the back of the trainer card.
- All five bag pockets (Items, Poké Balls, Key Items, TMs & HMs as a count for each of the 58, Berries) and PC item
  storage, each with the game's slot count and quantity limit.
- Party and all 14 boxes of 30, laid out 6 x 5 like the PC. A box keeps its gaps: drop a Pokémon on an empty spot and it
  goes there, and tap an empty spot to add one there. The PC rules are the game's (Mail, a party that can battle, healed
  on the way out, PP restored on the way in). A Bad Egg can be moved or removed but not edited, and is written back
  untouched.
- The Day-Care on Route 117: its two Pokémon under the party, with the experience they've walked there (added when
  you take one back, as the game does). An egg waiting with the old man for any pair that can breed, worked out as the
  game does (egg groups, genders, Ditto, same trainer or not). Eggs and Pokémon holding Mail stay out, and one that left
  its letter there stays in (take it back in the game to keep the letter). Checked in Ruby and Emerald: the old man hands
  over the egg.
- Legendary Pokémon: the Regis, Rayquaza, Groudon or Kyogre, the Eon Pokémon and (in Emerald) Sudowoodo, Kyogre's and
  Groudon's caves and the event-island Pokémon, each shown as still there or gone, with a box to bring back one that's
  gone. In Ruby and Sapphire that resets the Cave of Origin scene so it can play again. Checked in Ruby and Emerald: Regirock is back in the
  Desert Ruins, and Groudon in the Cave of Origin.
- Stuck? Start in a safe place: the next Continue starts you at the last Pokémon Center (or home) you healed at.
  Checked in Emerald.
- FireRed and LeafGreen (their saves are identical inside, so the file asks which one yours is; told apart from Emerald,
  whose layout a FireRed file also fits, by a word only FireRed and LeafGreen set): the Kanto badges (grey, as the
  game's trainer card shows them), Fly destinations in Kanto and the Sevii Islands, the Fame Checker (who is in it and
  how many facts you've found), a charged Vs. Seeker, and skipping the "Previously on your quest" recap on the next
  Continue. The MysticTicket and AuroraTicket go in the Key Items with their Seagallop flags (the boat only sails there
  once you have the Rainbow Pass), and the legends are Snorlax, the three birds, Mewtwo, Lugia, Ho-Oh and Deoxys.
  The Day-Care is Four Island's. No Pokéblocks, decorations or secret bases (Hoenn only). Checked in LeafGreen.
- Pokémon editor with what Gen 3 changed: nature (the raised and lowered stats marked on the stats), ability, IVs 0-31,
  EVs 0-255 with the 510 total, gender, shininess and Unown's 28 forms (all from the personality value, so changing one
  picks a new value that keeps the rest), Poké Ball, where and at what level it was met and in which game, its language,
  and the original trainer's name, gender, ID and secret ID.
- Ribbons, in the game's own pictures: each contest category's rank (Normal to Master, a rank bringing the ones below
  it), Champion, Winning, Victory, Artist, Effort and the seven event ribbons. Giving one also opens the PokéNav's
  RIBBONS menu, as the game does.
- Pokédex: all 386 seen / caught (the game keeps the seen flags three times over; all three are written).
- Every Pokémon is re-encrypted and re-checksummed, and every sector of the save slot gets a fresh checksum; an unedited
  save round-trips byte for byte.

## Final Fantasy (NES)

`src/core/ff1nes/`. Facts come from Disch's disassembly of the US release (https://github.com/Entroper/FF1Disassembly);
`scripts/gen-ff1-data.mjs` reads names, equipment stats, equip and spell permissions, the Exp table and the new-game
tables straight out of its data banks into `tables.ts`.

- **Format**: an 8 KB battery file. The game plays from a working copy at file offset 0x000 and Save copies it to 0x400,
  with $55 $AA at 0x4FE-0x4FF and a checksum byte at 0x4FD. The checksum is an add-with-carry over the 1 KB block, taken a
  column of four pages at a time, that must come to $FF (`layout.ts`). Continue checks all three and starts a new game if
  any fails, so only the block at 0x400 matters; the editor writes that and leaves everything else in the file as it was.
- **Party**: name (4 letters), class (all 12, so promotion too), status, level and Exp (kept in step, with the status
  screen's "Exp to next level"), HP, the five stats and the battle numbers (Damage, Hit %, Absorb, Evade %, Magic defense).
- **Gear**: four weapons and four armor per character, each worn or not. The game works the battle numbers out only when
  you leave its equip menu, so a change here takes the old gear's bonuses off and puts the new ones on exactly as its
  UnadjustEquipStats / ReadjustEquipStats routines do (Black Belt and Master included). Gear a class can't equip is
  marked and can be carried but not worn; wearing a second weapon, or a second helmet etc., takes the first off.
- **Magic**: three spells per level from the ones the class can learn, and current / max MP (charges) per level.
- **Items**: gold, the six consumables, the 17 key items. **World**: the four Orbs, ship, canoe, airship, the bridge
  north of Coneria and the canal.
- Japanese Famicom saves aren't recognised yet (different text, unchecked layout).

## Final Fantasy I (GBA, Dawn of Souls)

`src/core/ff1gba/`. Names and the equip and magic tables come from the ROM itself (game code BFFE, US);
`scripts/gen-ff1gba-data.mjs <rom>` writes them into `tables.ts`, and its header lists where each table is.

- **Opening**: the cartridge's 32 KB SRAM, a 64 KB padded copy, or a phone's .sps (see `src/core/container.ts`).
- **Format** (`layout.ts`): a 0x24-byte header, three Final Fantasy I files of 0xD60 bytes from 0x24 and three Final
  Fantasy II files of 0xEB4 bytes from 0x4012. Each file starts with the header's text and a 16-bit checksum (the sum of
  its bytes from 0x24, plus its size); a file that fails it shows as Empty in the game. Save redoes it for every file that
  loaded.
- **Party**: name (6 full-width letters or digits), class, level, Exp, HP / MP, ailment (KO, stone, poison), the five
  stats; gear in five slots and spells (three fixed places per spell level, which is how the magic menu lays them out),
  marked when the class can't equip or learn them. The game works out attack, defence and the like again from the gear.
- **Items**: gil, consumables, weapons, armor and the 36 key items, per file. The bag's cells carry a fourth byte that
  belongs to something else; it is never touched.
- A save with files of both games asks which to open (two modules: `final-fantasy-gba.ts` and `final-fantasy-2-gba.ts`).

## Final Fantasy II (GBA, Dawn of Souls)

`src/core/ff2gba/` (the file layout is shared, in `src/core/ff1gba/layout.ts`). Item and spell names come from the ROM:
`scripts/gen-ff2gba-data.mjs <rom>`.

- **Characters**: eight records of 0x80 bytes from file + 0x22 (Firion, Maria, Guy, then Minwu, Josef, Gordon, Leila
  and Ricard). The party is the first three and the record named at file + 0x4B2 (the fourth place).
- **Party**: name, HP / MP, the six stats (the record also keeps them with gear bonuses; that copy moves with them),
  the eight weapon skills (unarmed, knife, sword, staff, axe, spear, bow, shield: level 1-16), 16 spell places (spell and
  level 1-16), and gear in both hands, head, body and arms (an empty hand is the "Hands" item, 0x30).
- **Items**: gil (+0x4A8), and the bag: 150 item ids at +0x4B4 and their counts at +0x54A. Key items are in the bag
  too; they're shown but not changed.
- Portraits in the party window come from the game's own party menu (SaveHub-assets).

## Final Fantasy (PSP, Anniversary Edition)

`src/core/ff1psp/` and `src/core/psp/`. Tables (names, who can equip and learn what) come from the game's own data as
dumped by FF1PSP-Archipelago (https://github.com/1-800-thewolf/FF1PSP-Archipelago), and the name screen's letters from
FM_NAME_SEL in the disc's ff1psp.dpk; `scripts/gen-ff1psp-data.mjs` writes them into `tables.ts`. US release (ULUS10251).

- **Opening**: a zip of the save folder (`ULUS10251DATA00` with PARAM.SFO and SAVE.BIN), as a PSP's memory stick or
  PPSSPP's `PSP/SAVEDATA` holds it. Save gives back the same zip. SAVE.BIN alone also opens and saves, but then PARAM.SFO
  isn't updated, so only PPSSPP (which doesn't check it) will load it.
- **Format**: SAVE.BIN is PSP savedata encryption (`src/core/psp/`: the KIRK AES-CBC steps of the chnnlsv module in
  plain TypeScript, with the game's key). PARAM.SFO holds a hash of SAVE.BIN and hashes of itself; Save redoes them all,
  in the order the PSP firmware does. Decrypted it is a 4-byte header and 20 save files of 0x10A4 bytes, with no checksum.
- **Party**: name (up to 6 letters from the name screen, which has no spaces), class (all 12), level, Exp, HP / MP,
  fallen, the five stats and magic level; gear in five slots and spells (three per level), marked when the class can't
  equip or learn them.
- **Items**: gil, consumables, weapons, armor and the 36 key items, per save file.

## Layout

```
src/core/types.ts          GameModule / EditableSave contracts (the only thing the shell knows about)
src/core/registry.ts       GAMES list + detectGames()
src/core/bytes.ts          byte helpers every game shares (big- and little-endian numbers, Game Boy item lists)
src/games/*.ts             one small descriptor per game: detect, load, lazy editor import
src/core/<game>/           format code per game: data tables, text encoding, parse/serialize, checksums,
                           plus what the shell can ask for: describeChanges (review list) and a sample save
src/ui/main.ts             game-agnostic shell: drop zone, detection, chooser, review dialog, save
src/ui/drag.ts             pointer-event drag and drop (mouse, touch, pen); knows nothing about any game
src/ui/editors/<game>/     editor UI per game (lazy-loaded)
src/ui/tabs.ts, itemList.ts, monMenu.ts, monDialog.ts, hpBar.ts
                           pieces every editor shares: tab bar, bag pockets, the Pokémon action sheet and window, HP bar
scripts/build.mjs          strips types -> dist/ (rewrites .ts imports and import() to .js)
test/                      node:test suite
```

## Adding a game

1. **Format code** in `src/core/<game>/`: a model class with `serialize()` that recalculates every checksum,
   plus data tables. Keep it free of DOM code so it's testable in Node.
2. **Descriptor** in `src/games/<game>.ts`, using `defineGame({ id, family, games, platform, detect, identify?, load, loadEditor })`.
   `detect()` must be cheap, side-effect-free and never throw; return `{ confidence: 'certain' }` only when
   size + checksum + layout all match, otherwise `'likely'` or `null`. Import only a small layout file for
   `detect()` (see `src/core/gen2/layout.ts`) and let `load()` import the save code, so the landing page doesn't
   download every game's tables.
   `games` lists every exact title the module opens (e.g. `Pokémon Red`, `Pokémon Blue`); the site shows the
   exact name as the page headline. If the format records the version (a game code, a layout difference),
   have `identify()` return the single matching name; if it genuinely can't tell (Red vs Blue), return all
   candidates and the site asks the user to confirm which one theirs is.
3. **Editor** in `src/ui/editors/<game>/index.ts` exporting a `MountEditor`; call `host.markDirty()` on edits.
   Build it from the shared pieces above rather than copying another game's editor.
4. **Register** it in the `GAMES` array in `src/core/registry.ts`.
5. Optional, and the shell picks them up when present: `describeChanges(before)` on the save model (a list of
   `ChangeGroup`s for the review dialog) and `sample()` on the descriptor (a made-up save for the "Try a sample
   save" button, built in code so no binary file is shipped).

The landing page's supported-games list, auto-detection, the manual chooser (used when a file matches zero or
several games) and the Save button all pick the new game up automatically.

Tips: write a round-trip test first (unedited save re-serializes byte-for-byte), and when two games share a
file size, make each `detect()` verify its own checksum so only one claims the file.

## Deploying

`npm run build` produces a static site in `dist/`. Host it anywhere static (GitHub Pages, Cloudflare Pages,
Netlify); there's no backend. For more games you may want a bundler later (esbuild/Vite) for minification;
the per-game `import()` already gives you code splitting.

## Deploying to GitHub Pages (auto-updates on every push)

`.github/workflows/pages.yml` runs the tests, builds, and publishes `dist/` to GitHub Pages on each push to
`main`. One-time setup: create the repo, push this folder, then Settings -> Pages -> Source: "GitHub Actions".
The site then lives at `https://<user>.github.io/<repo>/` (all asset paths are relative, so the subpath is fine)
and downloads a plain `.sav`.

## Hosting on a Claude artifact (phone-friendly, updatable)

`node scripts/build.mjs && node scripts/build-artifact.mjs` writes `artifact/index.html` (inline CSS, no
html/head/body wrapper) next to the compiled modules in `dist/`. Publish that file with the Artifact tool,
attaching the `dist/` modules via `files`, and republish the same path to update it in place.
Hosted pages can't start downloads or show `confirm()`, so the app uses the `downloads` capability (the save
is wrapped in a `.zip`, since `.sav` isn't an allowed type) and in-page dialogs. On a normal website a plain
`.sav` download is used instead.

## Performance notes

Measured with Chromium's CPU throttled to 4x (roughly a mid-range phone). The Bag tab used to build about 9,000
elements because every item row carried the full 124-item list; rows now hold only their own item and fill in
the list when touched (`lazySelect` in `ui/dom.ts`), which took the tab from ~850 ms to ~390 ms on the first visit (most of what's left is loading its
69 icons) and ~130 ms after that, and from ~9,000 elements to ~470. Typing in the Trainer tab no longer recreates the badge and party images on every keystroke.
The sprites are already tiny (all 151 Pokémon icons are 54 KB together), and opening and closing the dialogs
leaves no elements or listeners behind.

## Writing the on-screen text

Every screen explains itself in plain words, so keep it that way when you add a feature:

- One name per thing: **Save** (the button and the act), "the file you opened" (the original, which is never changed),
  "your edited copy", **Party** and **Box 1-12**, **slot** (only for a position inside a box), **Duplicate**, **Swap**,
  **Move**, **Caught** / **Seen**. Money is shown as ¥ everywhere, including the review list.
- Assume the reader plays these games. No tab intros or hints for what a Pokémon player already knows (money, text
  speed, nicknames, friendship, ranges the field already enforces). Only the Pokédex tab keeps a line, since tapping
  cycles three states. How-to that needs more (the Boxes tab's dragging tips) sits in a collapsed "How ... works"
  section that stays open across redraws.
- This is a save editor, not a game guide. Say how to use the editor, but don't add reference material about the game:
  no galleries, no tables of rules, no walkthroughs. (A friendship rules table and a chart of every Pikachu reaction
  were tried on the Pikachu card and removed.)
- Explain only the niche or surprising parts, in a one-line note under the heading or field: DVs, stat experience and
  stat calculations, what an edit silently changes (Trainer ID makes Pokémon traded, shiny and gender come from DVs),
  egg cycles, Crystal's caught data. Only state game rules you've checked against the disassembly.
- Say why a control is unavailable ("Party full (6 of 6)", "Full (20 of 20)"), not just grey it out.
- Errors say what happened and what to do next. Warnings in the review list start with "Warning:" and name the fix.
- Sentence case, active voice, plain verbs ("Tap", "Pick", "Drop"). A game can describe itself to the shell with
  `editable` (what the editor can change) and `fileHint` (what a valid file looks like) on its module.

## Known limitations

- Final Fantasy I (GBA) was checked in the real game (US ROM in mGBA, 2026-11-05): two real saves open and save back
  byte for byte; an edited file (a renamed Knight at level 42 with Excalibur and a Ribbon, a poisoned Thief, Holy and
  Flare learned, gil, Potions, key items added and removed) loads with every edit showing in the load screen and menus.
  The level 1 to 8 "magic level" byte and the per-level growth numbers are left alone, and only the US release is
  recognised. There's no sample button: a save the game would start from needs map and story data the editor doesn't
  build. Final Fantasy II was checked the same way with a real save (a renamed Firion with 9,999 HP, 99 Strength, sword
  skill 16 and Excalibur, Fire at 16, Ultima learned in place of Toad, Maria's Ribbon, Josef's MP, gil, Elixirs and a
  Holy Tome all show in its menus). Its key terms, the fourth party member and the record of who has left aren't
  editable, and progress towards the next skill or spell level is left as it is.

- Final Fantasy (PSP): two real saves decrypt, open and encrypt back to the same bytes, and the editor's SFO hashes match
  the game's. Checked in the real game (US disc in PPSSPP's headless build, `scripts/psprun.sh`, 2026-11-05): an edited save
  (a renamed character, HP, a level, gil, Elixirs, Excalibur count) shows the edits on the load screen and in the menus,
  and a save the game then wrote opens in the editor with them intact. PPSSPP doesn't check PARAM.SFO, so a real PSP's
  check of the redone SFO hashes is still untested. Level and Exp aren't kept in step (the Exp table isn't
  known yet, and the game levels up after the next battle), the per-level growth numbers are left alone, Japanese names
  show as "?", and only the US release is recognised.

- Final Fantasy (NES) was checked in the real game (US ROM, which matches the disassembly byte for byte, in the cynes
  emulator, 2026-11-04): a save the game wrote opens and saves back byte for byte; an edited copy (name, level 20, HP,
  Strength, a Long Sword and Iron Armor worn, a Black Belt's nunchuck, a Red Wizard with CURE and FIRE, gold, Heal Potions,
  the Floater, ship, canoe and Fire Orb) loads with Continue, the game's own equip menus work out the same battle numbers
  the editor wrote, and saving again with a Tent changes nothing but the HP the Tent restored.
- Tested against synthetic saves built from documented offsets and against real saves: a Yellow and a Blue from
  emulators, and a Red and a Yellow started in the real games (checked with `scripts/gbrun.py`, 2026-11-03). They load,
  save back byte for byte, and every stored party stat and experience value matches the editor's formulas. An edited
  copy of the new Red save (money, coins, all badges, options, bag, PC items, a full Pokédex, three new party Pokémon
  with DVs, stat experience and PP Ups, and Pokémon in boxes 1 and 5 of a file that had never changed box) loads and
  plays: the game's own PC works out the same stats as the editor for the boxed Pokémon, box 5 shows its Pokémon after
  CHANGE BOX, and the file the game saves afterwards opens in the editor with only the expected changes. An edited copy
  of the Yellow save (Pikachu's friendship and mood, a nickname, an added Pokémon) loads with Pikachu following, and
  talking to it shows the reaction the editor predicts. The Yellow sample loads in your bedroom.
- The built-in tables (base stats, types, growth curves, species ids, every move's type/power/accuracy/PP and name, item
  names) were checked against Pokémon Red, Blue and Yellow ROMs with `scripts/verify-against-rom.mjs`: all match.
  The same script finds the game code behind the rules the editor relies on: which bits of the options byte hold text
  speed, battle style and animation (and Yellow's sound setting), and the PP Up bonus (one fifth of the base PP each,
  at most 7). Against Yellow it also checks Pikachu's reaction table (friendship and mood limits, which reactions
  repeat), the Celadon Mansion granny's table (the friendship limit and wording of each of her six lines) and Melanie's
  Bulbasaur limit. The ROMs aren't in the repo and the script copies nothing from them.
- Gen 1: English only (Japanese uses different offsets and text encoding). Event flags and map position are left untouched.
- Crystal: English only (1.0 and 1.1 save the same way). Tested against one real Crystal 1.1 save: it loads and saves
  back byte for byte, and an edited copy (playing as the girl, money, a held item, a nickname, the GS Ball) loads and
  plays in the real game, as does the Crystal sample. Offsets come from the pokecrystal disassembly's symbol file. The
  Battle Tower, Mobile Adapter data and Mystery Gift are left untouched, as are the things listed for Gold and Silver below.
- Gen 2 tables (base stats, types, gender ratios, growth, catch rates, egg cycles, every move, item names and pockets,
  TM/HM moves, the experience curves) match Gold, Silver and Crystal ROMs (`scripts/verify-gen2-rom.mjs`), and the
  Gold and Crystal samples load and play in Gold, Silver, Crystal 1.0 and Crystal 1.1.
- Gold / Silver: English only. Tested against one real Gold save:
  it loads and saves back byte for byte, and an edited copy (badges, money, a shiny Pokémon holding an item, a renamed
  box, a Pokémon moved out of a box) loads and plays in the real game (checked in an emulator with
  `scripts/boot-gen2-save.py`), as does the sample. Offsets come from the pokegold disassembly's symbol file. Event
  flags (other than the legendary Pokémon's), map position and the Pokégear are left untouched.
- Gen 3 tables (base stats, types, gender ratios, growth, egg cycles, abilities, friendship, species, move, ability and item
  names, item pockets, every move, TM/HM moves, the nature table and the experience tables) match Ruby, Sapphire and
  Emerald ROMs (`scripts/verify-gen3-rom.mjs`). The samples load in Ruby 1.0, Sapphire and Emerald, and the game's PC
  shows the same stats as the editor for six awkward Pokémon (level 1 and 100, Shedinja, raised and lowered natures,
  odd IVs and EVs) in all three.
- Ruby / Sapphire / Emerald: English only. Tested against one real Ruby save and one real Emerald save: both load and
  save back byte for byte. The Ruby and Emerald samples, edited copies of both real saves (a new name, money, a TM
  count, a nickname, nature, shininess, EVs, a box name, a Pokémon added and one moved out of a box), and edited copies
  of the samples (nature, shininess, IVs, EVs, badges, options, the National Pokédex) all load and play in the real
  games (checked in an emulator), as do Emerald's edited Battle Points, Berry Powder, Frontier symbols, BP won, game stats, Pokéblocks and a secret base
  made and decorated in the editor. Offsets come
  from pokeruby and pokeemerald. Event flags (other than badges, the National Pokédex, the event tickets, the legendary
  Pokémon and Emerald's Frontier symbols), map position, the clock, friends' secret bases, records and the rest of the Battle Frontier data
  (Battle Tower opponents, rental Pokémon and so on) are left untouched.
- FireRed / LeafGreen: English only. Offsets come from pokefirered. Tested against one real LeafGreen save: it loads and
  saves back byte for byte, and an edited copy and the sample load and play in LeafGreen 1.0 (checked in an emulator):
  party, trainer card, bag, the Fame Checker, a charged Vs. Seeker, Fly, the skipped recap and a Snorlax brought back.
  The Route 5 Day-Care (one Pokémon), the Union Room, wireless and Trainer Tower data, and the Sevii Islands story are
  left untouched.
- A Pokémon's stats can be a point behind the editor's numbers in a real save: the game only recalculates stats when a
  Pokémon levels up, so stat experience earned since then hasn't counted yet. The editor shows both and leaves the
  stored ones alone unless you change the Pokémon.
- Mail can't be given in the editor (the letter is written in the game's mail screen), but a Pokémon already holding
  Mail keeps its letter, and taking the Mail off throws the letter away.
- Gold and Silver saves are identical inside, so the site asks which one yours is.
- Which bit is which in the options byte, and the PP Up rule, are confirmed in the game code (see above). The save
  offsets themselves come from the pokered and pokeyellow disassemblies and match the two real saves.
- Pikachu's pictures: talking to Pikachu in the real game at friendship and mood values from every row of the reaction
  table (2026-11-03) shows the same pictures as the editor, Jump and Heart included.
- Yellow's Pikachu offsets (friendship at 0x271C, mood at 0x271D) come from the pokeyellow disassembly. The ROM check
  finds the game copying the friendship byte to 0x271C, and the offsets match one real Yellow save.
- Mood only changes how Pikachu reacts when you talk to it (the editor shows which reaction, worked out from the game's
  own friendship and mood tables and tested against them for all 65,536 combinations). It also drifts: every step you
  walk moves it 1 closer to 128, so an edited mood fades, and the card says roughly how many steps that takes. The
  reaction wording is plain English for the game's animation names (AngryBolt, BackTurn, Love, ...). The game only
  uses this table when nothing else applies: Pikachu has a fixed reaction when it is asleep or has a status
  condition, in Pokémon Tower, the Pokémon Fan Club, the Pewter Pokémon Center and Bill's house, and for a short
  while after some events (catching a Pokémon, fishing, a Thunderstone, Thunder and Thunderbolt).
- The reaction pictures are Pokémon Yellow's own, cut from the Serebii sheet by `scripts/extract-pikachu.py` into one
  file (`sprites/pikachu.png` in the artwork repository, so the card costs one request however many reactions you look at) and
  credited in `CREDITS.md`. Which reaction shows comes from the game's own tables, not from Serebii,
  which ranks reactions by friendship alone where the game uses friendship and mood together.
- Red and Blue saves are byte-identical in structure, so the site asks which version yours is.
- Names that use the game's "PK" / "MN" symbols show as `{PK}` / `{MN}` in the editor, and the "TRAINER" text some
  Pokémon carry as their original trainer shows as `{TRAINER}`. Type them the same way to put them back. A name that
  isn't touched is written back byte for byte.
- A name field warns, under the box, when what you typed can't be saved as typed: a character the game has no glyph
  for (it would be saved as "?") or more than 10 characters (the rest is dropped).
- Dragging is for mouse, touch and pen; on a touch screen you press and hold for a moment first, so swiping still scrolls.
  There is no keyboard drag, but the Pokémon menu does everything it does.
- A party Pokémon's level is read from its stats block (the byte the game uses), not the "box level" byte next to its
  species, which a real Blue save leaves at 0. That byte is left alone unless you change the level, or the Pokémon goes to a box.
- Bytes after the 32 KB save (some emulators append a clock footer) are kept as they are.
- A species' growth curve (which sets experience from level) is fixed by the game, so the editor uses a table of all 151
  rather than guessing from the save. A glitch species falls back to a guess.
