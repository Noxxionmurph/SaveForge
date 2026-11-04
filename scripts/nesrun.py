"""A headless NES runner for checking edited Final Fantasy saves in the real game (cynes, your own ROM). It loads the ROM
and a save, runs a script of button presses and takes pictures, and never writes the save back unless you ask (dumpsram).

    pip install cynes pillow
    python3 scripts/nesrun.py ff1.nes edited.sav out 'w120; p start 4 60; p start 4 60; p start 4 60; w200; p start 4 60; s menu'

Commands, separated by ';':  wN (run N frames) | p KEY [hold] [after] (KEY: a b start select up down left right) |
s NAME (out/NAME.png, 2x) | m ADDR LEN (print bytes, hex CPU address: $6000 is the working copy, $6400 the save) |
poke ADDR VAL | dumpsram PATH (the 8 KB battery RAM as the game holds it now). Use '-' for the save to start a new game:
then 'w120; p start 4 60' x6, mash 'p a 4 20' ~40 times (Fighter, Thief, Black Belt, Red Mage, all named AAAA) and 'p start 4 30'
~30 times reaches the world map. Checks used for the editor: Continue is START on the title screen (the game starts a new
game instead if the save fails its check); on the world map, 'poke 6036 1' gives a Tent, then START, A (ITEM), move to
TENT, A, A saves. Leaving the WEAPON or ARMOR menu makes the game work out Damage, Hit, Absorb and Evade again."""
import os
import sys
import numpy as np
from PIL import Image
import cynes

rom, sav, outd, cmds = sys.argv[1:5]
os.makedirs(outd, exist_ok=True)
nes = cynes.NES(rom)
if sav != '-':
    for i, b in enumerate(open(sav, 'rb').read()[:0x2000]):
        nes[0x6000 + i] = b
KEYS = {'a': cynes.NES_INPUT_A, 'b': cynes.NES_INPUT_B, 'start': cynes.NES_INPUT_START, 'select': cynes.NES_INPUT_SELECT,
        'up': cynes.NES_INPUT_UP, 'down': cynes.NES_INPUT_DOWN, 'left': cynes.NES_INPUT_LEFT, 'right': cynes.NES_INPUT_RIGHT}
frame = nes.step(1)


def run(n, buttons=0):
    global frame
    nes.controller = buttons
    frame = nes.step(n)


for c in [c.strip() for c in cmds.split(';') if c.strip()]:
    a = c.split()
    if a[0][0] == 'w':
        run(int(a[0][1:]))
    elif a[0] == 'p':
        run(int(a[2]) if len(a) > 2 else 4, KEYS[a[1]])
        run(int(a[3]) if len(a) > 3 else 12)
    elif a[0] == 's':
        Image.fromarray(np.asarray(frame)).resize((512, 480), Image.NEAREST).save(os.path.join(outd, f'{a[1]}.png'))
    elif a[0] == 'm':
        at, n = int(a[1], 16), int(a[2])
        print(a[1], bytes(nes[at + i] for i in range(n)).hex(' '))
    elif a[0] == 'poke':
        nes[int(a[1], 16)] = int(a[2], 16)
    elif a[0] == 'dumpsram':
        open(a[1], 'wb').write(bytes(nes[0x6000 + i] for i in range(0x2000)))
    else:
        sys.exit(f'unknown command: {c}')
