# Credits

SaveForge is an unofficial, free, non-commercial fan tool. It is not affiliated with or endorsed by Nintendo,
Game Freak, Creatures Inc. or Square Enix. Pokémon and Final Fantasy, and everything that belongs to them, are theirs.

Final Fantasy (PSP) was checked in [PPSSPP](https://github.com/hrydgard/ppsspp) (`scripts/psprun.sh`), and Final Fantasy I (GBA)
in [mGBA](https://mgba.io/) (`scripts/gbarun.c`). The GBA tables are read from the game's ROM by `scripts/gen-ff1gba-data.mjs` and `scripts/gen-ff2gba-data.mjs`.

Final Fantasy (WonderSwan Color) was checked in Mednafen's WonderSwan core
([beetle-wswan-libretro](https://github.com/libretro/beetle-wswan-libretro), driven by `scripts/wsrun.py`); its equip and
magic tables are read from the game's ROM by `scripts/gen-ff1wsc-data.mjs`.

Final Fantasy II (Famicom) save offsets come from everything8215's disassembly
(https://github.com/everything8215/ff2), and were checked in [cynes](https://github.com/Youlixx/cynes) (`scripts/nesrun.py`).

Final Fantasy III (Famicom) save offsets come from everything8215's disassembly (https://github.com/everything8215/ff3).
Its names, job tables and who can equip what are read from the game's ROM by `scripts/gen-ff3nes-data.mjs`, and edits
were checked in cynes.

Final Fantasy III (Nintendo DS) tables are read from the game's own files by `scripts/gen-ff3ds-data.mjs`, and edits were
checked in [DeSmuME](https://desmume.org/) through [py-desmume](https://github.com/SkyTemple/py-desmume) (`scripts/dsrun.py`).
Final Fantasy III (PSP) uses the same tables, its save key is the one listed in the Apollo Save Tool's database, and edits
were checked in PPSSPP (`scripts/psprun.sh`).

Final Fantasy (NES) names and numbers are read from Disch's disassembly of the game
(https://github.com/Entroper/FF1Disassembly) by `scripts/gen-ff1-data.mjs`.

Final Fantasy (PSP) item, equipment and spell tables come from the game data dumped by
[FF1PSP-Archipelago](https://github.com/1-800-thewolf/FF1PSP-Archipelago), read by `scripts/gen-ff1psp-data.mjs`. The PSP
savedata encryption follows the open implementations in jpcsp and cielavenir's psp-savedata-endecrypter; the game's
save key is the one listed in the Apollo Save Tool's database, and the save layout was cross-checked with the CWCheat
code database. [FireyFly's notes](https://github.com/FireyFly/reversing) on the PSP release's resource files helped read its name-screen font.

The pictures are not part of this code repository. They live in a separate repository,
[SaveForge-assets](https://github.com/Noxxionmurph/SaveForge-assets), and the site loads them from there, so the editor works
the same (without the pictures) if they are ever removed. This is who made them.

## Pokémon, item and type icons

From **PokéSprite** by msikma (https://github.com/msikma/pokesprite), copied unchanged except for renaming the
Pokémon files to their National Dex number (and Unown's other letters to `201-<letter>.png`). PokéSprite's own code is MIT licensed; the artwork is not covered by that
licence.

## Type labels

`sprites/type-labels/<type>.png` (each type's name in its coloured box, 32x16) are Pokémon Emerald's own summary screen
labels, from the pret/pokeemerald disassembly (https://github.com/pret/pokeemerald, `graphics/types/`), in the colours
the game gives them, with the background made transparent and renamed to the editor's type names (`fight` to `fighting`,
`mystery` to `unknown`). Gen 1 and Gen 2 have no coloured type labels of their own. `scripts/extract-type-labels.py`
redoes them.

## Gym badges

The eight Kanto badges are cut from the Red/Blue "Trainer Card" sheet on The Spriters Resource
(https://www.spriters-resource.com/game_boy_gbc/pokemonredblue/asset/8733/, ripped by FrenchOrange), using the Super
Game Boy colour panel. `scripts/extract-badges.py` redoes the cut.

The eight Johto badges are Gold and Silver's own trainer card badges, from the pret/pokegold disassembly
(https://github.com/pret/pokegold, `gfx/trainer_card/badges.png`), in the colours the game gives them on a Game Boy
Color (its badge palette). `scripts/extract-johto-badges.py` redoes them.

## Pikachu's reactions

`sprites/pikachu.png` (two 40x40 frames for each of the 18 ways your Pokémon Yellow starter reacts when you talk to it,
one reaction per row) holds Pokémon Yellow's own pictures in the Super Game Boy colours. They are cut from the
"Pikachu's moods" sheet on Serebii (https://www.serebii.net/yellow/pikachu.shtml), which is built from the game's
graphics. `scripts/extract-pikachu.py` redoes the cut. Frames that also exist in the pret/pokeyellow disassembly
(https://github.com/pret/pokeyellow, `gfx/pikachu/`) are pixel-identical to it, which is how each row was matched to
the game's name for it.

## Fonts

The site's three fonts are bundled in `fonts/`, cut down to Latin characters and the weights the site uses
(`scripts/make-fonts.py`), under the SIL Open Font License 1.1. The licence texts are in `fonts/OFL-*.txt`.

- **Instrument Sans**, © The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans)
- **JetBrains Mono**, © The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)
- **Pixelify Sans**, © The Pixelify Sans Project Authors (https://github.com/eifetx/Pixelify-Sans). The copy in `fonts/` is a modified version: its digit 5 is redrawn (it was the same shape as its S) and its ligatures are removed (see `scripts/make-fonts.py`).

## Game data

Save layouts and tables were worked out with the help of the pret disassemblies
([pokered](https://github.com/pret/pokered), [pokeyellow](https://github.com/pret/pokeyellow)) and checked against
cartridge dumps the author owns (`scripts/verify-against-rom.mjs`; nothing from the ROMs is stored in this repository).

All the pictures are © Nintendo / Creatures Inc. / GAME FREAK Inc.
