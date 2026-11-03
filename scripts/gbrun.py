"""A headless Game Boy runner for checking edited Gen 1 and Gen 2 saves in the real game (PyBoy, your own ROM). It loads
the ROM and a save, runs a script of button presses and takes pictures, and never writes the save back.

    pip install pyboy pillow
    python3 scripts/gbrun.py red.gb edited.sav out 'w1500; p start 8 200; p a 8 200; p a 8 300; p a 8 300; w600; s world'

Commands, separated by ';':  wN (run N frames) | p KEY [hold] [after] | mash N gap [KEY] | s NAME (out/NAME.png, 2x) |
m ADDR LEN (print WRAM bytes, hex address) | poke ADDR VAL / or ADDR VAL (write / set bits in WRAM) | ss PATH / ls PATH
(save / load a state) | dumpsram PATH BANKS (cartridge RAM as the game holds it now, e.g. after saving in the game: 4 banks
for Gen 1 and Gen 2). Use '-' for the save to start a new game. Tricks used to check the editor (WRAM addresses are pokered's;
Yellow's are one lower): fly anywhere with `poke d71a <map>; or d732 08` and then open and close the START menu."""
import io
import os
import sys
from pyboy import PyBoy

rom, sav, outd, cmds = sys.argv[1:5]
os.makedirs(outd, exist_ok=True)
ram = io.BytesIO(open(sav, 'rb').read()) if sav != '-' else None
pb = PyBoy(rom, window='null', ram_file=ram, sound_emulated=False)
pb.set_emulation_speed(0)


def wait(n):
    for _ in range(n):
        pb.tick()


for c in [c.strip() for c in cmds.split(';') if c.strip()]:
    a = c.split()
    if a[0][0] == 'w' and a[0][1:].isdigit():
        wait(int(a[0][1:]))
    elif a[0] == 'p':
        pb.button(a[1], int(a[2]) if len(a) > 2 else 8)
        wait(int(a[3]) if len(a) > 3 else 30)
    elif a[0] == 'mash':
        for _ in range(int(a[1])):
            pb.button(a[3] if len(a) > 3 else 'a', 8)
            wait(int(a[2]))
    elif a[0] == 's':
        pb.screen.image.convert('RGB').resize((320, 288)).save(f'{outd}/{a[1]}.png')
    elif a[0] == 'm':
        addr = int(a[1], 16)
        print(a[1], ' '.join(f'{pb.memory[addr + i]:02x}' for i in range(int(a[2]))))
    elif a[0] == 'poke':
        pb.memory[int(a[1], 16)] = int(a[2], 16)
    elif a[0] == 'or':
        x = int(a[1], 16)
        pb.memory[x] = pb.memory[x] | int(a[2], 16)
    elif a[0] == 'ss':
        with open(a[1], 'wb') as f:
            pb.save_state(f)
    elif a[0] == 'ls':
        with open(a[1], 'rb') as f:
            pb.load_state(f)
    elif a[0] == 'dumpsram':
        data = bytearray()
        for b in range(int(a[2])):
            data += bytes(pb.memory[b, 0xA000:0xBFFF]) + bytes([pb.memory[b, 0xBFFF]])
        open(a[1], 'wb').write(data)
        print('sram', len(data))
pb.stop(save=False)
