#!/usr/bin/env python3
"""Tiny headless libretro frontend for the Mednafen WonderSwan core, used to check Final Fantasy (WonderSwan Color) saves.

Build the core once (git clone https://github.com/libretro/beetle-wswan-libretro && make) and point WSWAN_CORE at
mednafen_wswan_libretro.so. Needs Pillow. Never commit the ROM or the saves.

usage: wsrun.py ROM SRAM_IN|- SCRIPT
script commands separated by ';':
  w N            run N frames
  p BTN[+BTN] N  hold buttons N frames, then release 8 frames
  h BTN N        hold without release gap
  shot FILE      save PNG of the current frame
  dump FILE      write save RAM
  ss FILE / ls FILE  save / load state
  poke OFF VAL   write a save-RAM byte
buttons: up down left right a b start  (X pad)

Loading file 1 from a cold boot: "w 600;p start 6;w 120;p a 6;w 200;p a 6;w 100;p a 6;w 500" (title, Load game, the
file, confirm); then "p start 6;w 60" opens the menu (Items, Magic, Equip, Status, ...). Savestates keep their own copy
of the SRAM, so boot fresh to test a save.
"""
import ctypes as C, os, sys
from PIL import Image

CORE = os.environ.get("WSWAN_CORE", "mednafen_wswan_libretro.so")
lib = C.CDLL(CORE)

ENV = C.CFUNCTYPE(C.c_bool, C.c_uint, C.c_void_p)
VID = C.CFUNCTYPE(None, C.c_void_p, C.c_uint, C.c_uint, C.c_size_t)
AUD = C.CFUNCTYPE(None, C.c_int16, C.c_int16)
AUDB = C.CFUNCTYPE(C.c_size_t, C.c_void_p, C.c_size_t)
POLL = C.CFUNCTYPE(None)
STATE = C.CFUNCTYPE(C.c_int16, C.c_uint, C.c_uint, C.c_uint, C.c_uint)

fmt = [2]  # RGB565 default
frame = [None]
held = set()
IDS = {'b': 0, 'select': 2, 'start': 3, 'up': 4, 'down': 5, 'left': 6, 'right': 7, 'a': 8}
sysdir = C.c_char_p(b'/tmp')  # the core asks for a folder but needs no files

@ENV
def env(cmd, data):
    cmd &= 0xFFFF
    if cmd == 10:  # SET_PIXEL_FORMAT
        fmt[0] = C.cast(data, C.POINTER(C.c_int))[0]
        return True
    if cmd in (9, 31):  # system / save directory
        C.cast(data, C.POINTER(C.c_char_p))[0] = sysdir.value
        return True
    if cmd == 3:  # GET_CAN_DUPE
        C.cast(data, C.POINTER(C.c_bool))[0] = True
        return True
    return False

@VID
def vid(data, w, h, pitch):
    if not data:
        return
    buf = C.string_at(data, pitch * h)
    if fmt[0] == 1:
        img = Image.frombuffer('RGBX', (w, h), buf, 'raw', 'BGRX', pitch, 1).convert('RGB')
    else:
        img = Image.frombuffer('RGB', (w, h), buf, 'raw', 'BGR;16', pitch, 1)
    frame[0] = img

@AUD
def aud(l, r):
    pass

@AUDB
def audb(d, n):
    return n

@POLL
def poll():
    pass

@STATE
def state(port, dev, idx, id_):
    if port != 0:
        return 0
    if id_ == 256:
        m = 0
        for b in held:
            m |= 1 << IDS[b]
        return m
    for b in held:
        if IDS[b] == id_:
            return 1
    return 0

class GameInfo(C.Structure):
    _fields_ = [('path', C.c_char_p), ('data', C.c_void_p), ('size', C.c_size_t), ('meta', C.c_char_p)]

lib.retro_set_environment(env)
lib.retro_set_video_refresh(vid)
lib.retro_set_audio_sample(aud)
lib.retro_set_audio_sample_batch(audb)
lib.retro_set_input_poll(poll)
lib.retro_set_input_state(state)
lib.retro_init()

rom_path, sram_in, script = sys.argv[1], sys.argv[2], sys.argv[3]
rom = open(rom_path, 'rb').read()
rombuf = C.create_string_buffer(rom, len(rom))
gi = GameInfo(rom_path.encode(), C.cast(rombuf, C.c_void_p), len(rom), None)
assert lib.retro_load_game(C.byref(gi)), 'load failed'
lib.retro_get_memory_data.restype = C.c_void_p
lib.retro_get_memory_size.restype = C.c_size_t
lib.retro_serialize_size.restype = C.c_size_t
sram = lib.retro_get_memory_data(0)
ssize = lib.retro_get_memory_size(0)
if sram_in != '-':
    d = open(sram_in, 'rb').read()[:ssize]
    C.memmove(sram, d, len(d))
    lib.retro_reset()

def run(n):
    for _ in range(n):
        lib.retro_run()

for raw in script.split(';'):
    a = raw.split()
    if not a:
        continue
    c = a[0]
    if c == 'w':
        run(int(a[1]))
    elif c in ('p', 'h'):
        held.update(a[1].split('+'))
        run(int(a[2]))
        held.clear()
        if c == 'p':
            run(8)
    elif c == 'shot':
        frame[0].resize((frame[0].width * 2, frame[0].height * 2), Image.NEAREST).save(a[1])
    elif c == 'dump':
        open(a[1], 'wb').write(C.string_at(sram, ssize))
    elif c == 'ss':
        n = lib.retro_serialize_size()
        b = C.create_string_buffer(n)
        assert lib.retro_serialize(b, n)
        open(a[1], 'wb').write(b.raw)
    elif c == 'ls':
        d = open(a[1], 'rb').read()
        assert lib.retro_unserialize(d, len(d))
    elif c == 'poke':
        C.cast(sram, C.POINTER(C.c_uint8))[int(a[1], 0)] = int(a[2], 0)
    else:
        raise SystemExit('bad command ' + c)
print('sram size', ssize)
