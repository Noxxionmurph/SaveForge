"""A headless Nintendo DS runner for checking edited Final Fantasy III saves in the real game (DeSmuME through
py-desmume, your own ROM). It loads the ROM and a save, runs a script of button presses and takes pictures. DeSmuME also
keeps its own copy of the save under ~/.config/desmume/: delete it when you're done if the save holds anything private.

    pip install py-desmume
    SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy python3 -I scripts/dsrun.py ff3.nds edited.sav out \
        'w700; p a 6 250; p a; w120; p down; p down; p a 6 150; p a 6 60; p a 6 500; p x 6 150; s menu'

Commands, separated by ';':  wN (run N frames) | p KEY [hold] [after] (KEY: a b x y l r start select up down left
right) | s NAME (out/NAME.png, both screens) | m ADDR LEN (print bytes, hex address) | poke ADDR VAL (hex) |
export PATH.sav (the save as the game holds it now, raw; DeSmuME writes nothing for other endings).

What the checks used (US ROM): the title menu needs 'w700; p a 6 250; p a; w120'. With a Quicksave it offers CONTINUE
first ('p a 6 150; p a 6 60; p a 6 500' loads it), and LOAD GAME is two downs; without one the cursor starts on LOAD
GAME. The slot list starts on Slot 3. In the field, X opens the menu (Item, Magic, Equipment, Status, Formation, Job...).
The party records sit at 020993D8 + 2EC n in RAM, laid out as in the save; +43 holds the ailments. In the Item menu
the first A picks an item up to move it and a second A on it uses it; B moves up to Use, Sort and Key Items. Quicksave is
seven downs in the menu, then left (the question starts on No) and A."""
import os
import sys
from desmume.emulator import DeSmuME
from desmume.controls import Keys, keymask

rom, sav, outd, cmds = sys.argv[1:5]
os.makedirs(outd, exist_ok=True)
emu = DeSmuME()
emu.open(rom)
emu.backup.import_file(sav)
emu.reset()
emu.volume_set(0)
KEYS = {'a': Keys.KEY_A, 'b': Keys.KEY_B, 'x': Keys.KEY_X, 'y': Keys.KEY_Y, 'l': Keys.KEY_L, 'r': Keys.KEY_R,
        'start': Keys.KEY_START, 'select': Keys.KEY_SELECT, 'up': Keys.KEY_UP, 'down': Keys.KEY_DOWN,
        'left': Keys.KEY_LEFT, 'right': Keys.KEY_RIGHT}


def run(n):
    for _ in range(n):
        emu.cycle(with_joystick=False)


for c in [c.strip() for c in cmds.split(';') if c.strip()]:
    a = c.split()
    if a[0][0] == 'w':
        run(int(a[0][1:]))
    elif a[0] == 'p':
        key = keymask(KEYS[a[1]])
        emu.input.keypad_add_key(key)
        run(int(a[2]) if len(a) > 2 else 6)
        emu.input.keypad_rm_key(key)
        run(int(a[3]) if len(a) > 3 else 30)
    elif a[0] == 's':
        emu.screenshot().save(os.path.join(outd, f'{a[1]}.png'))
    elif a[0] == 'm':
        at, n = int(a[1], 16), int(a[2])
        print(f'{at:08X}', bytes(emu.memory.unsigned[at + k] for k in range(n)).hex(' '))
    elif a[0] == 'poke':
        emu.memory.write_byte(int(a[1], 16), int(a[2], 16))
    elif a[0] == 'export':
        emu.backup.export_file(a[1])
    else:
        raise SystemExit(f'unknown command: {c}')
emu.destroy()
