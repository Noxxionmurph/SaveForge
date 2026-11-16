"""Draws the SaveForge brand pictures: the avatar mark, the favicon and the link preview.

usage: python3 scripts/make-brand-images.py [--avatar out.png]
writes, at the repo root:
  favicon.svg           the mark as crisp rects (browser tab)
  apple-touch-icon.png  192x192 (home-screen icon)
  og-image.png          1200x630 link preview for Discord, Reddit and the like
--avatar also writes the 480x480 profile picture (GitHub and so on).

The mark is the SaveForge cartridge (the same rects as src/ui/brand.ts, default Game Boy colours) on a magenta
(--button) tile with a dithered pixel glow and four sparkles. It's drawn on a 24x24 grid, one art pixel per cell,
and everything but the background sits inside a circle of radius 11.5 so round avatar crops never clip it.
No game artwork, so it can live in this repository.
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 24

def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

OUTLINE = '#16181e'
CART, SHADE, EDGE, LCD, INK, PIN = '#8b919b', '#6e747e', '#b5bac2', '#aebf6e', '#1f2a12', '#3c424d'
GLOW_DARK, GLOW_MID, GLOW_LIGHT = '#7d1540', '#a8255a', '#c83a72'
GOLD, WHITE = '#ffd23f', '#ffffff'

# brand.ts PIXELS, as (colour, x, y, w, h) in art pixels, placed at (6, 5) on the grid
CART_PIXELS = [
    (CART, 1, 0, 10, 1), (CART, 0, 1, 12, 11), (SHADE, 0, 9, 12, 3), (LCD, 2, 2, 8, 6),
    (INK, 3, 3, 6, 1), (INK, 3, 5, 4, 1),
    (PIN, 2, 12, 1, 2), (PIN, 4, 12, 1, 2), (PIN, 7, 12, 1, 2), (PIN, 9, 12, 1, 2),
    (EDGE, 1, 1, 1, 8), (EDGE, 2, 1, 9, 1),  # light top and left edge
]
CX, CY = 6, 5
SPARKS = [(3, 9), (20, 7)]                     # plus-shaped, gold with a white middle
DOTS = [(3, 15, GOLD), (20, 14, WHITE)]


def mark():
    """The 24x24 mark as a grid of hex colours."""
    g = [[None] * N for _ in range(N)]
    for y in range(N):                              # background and glow
        for x in range(N):
            r = math.hypot(x + .5 - 12, y + .5 - 12)
            odd = (x + y) % 2
            g[y][x] = (GLOW_LIGHT if r < 7.5 else (GLOW_LIGHT if odd else GLOW_MID) if r < 9.5 else
                       GLOW_MID if r < 11 else (GLOW_MID if odd else GLOW_DARK) if r < 12.5 else GLOW_DARK)
    cart = [[None] * N for _ in range(N)]
    for c, x, y, w, h in CART_PIXELS:
        for yy in range(CY + y, CY + y + h):
            for xx in range(CX + x, CX + x + w):
                cart[yy][xx] = c
    for y in range(N):                              # 1px outline, 4-neighbour
        for x in range(N):
            if cart[y][x] is None and any(0 <= x + dx < N and 0 <= y + dy < N and cart[y + dy][x + dx]
                                          for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                g[y][x] = OUTLINE
            elif cart[y][x]:
                g[y][x] = cart[y][x]
    for x, y in SPARKS:
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            g[y + dy][x + dx] = GOLD
        g[y][x] = WHITE
    for x, y, c in DOTS:
        g[y][x] = c
    return g


def to_image(g, scale):
    img = Image.new('RGB', (N, N))
    for y in range(N):
        for x in range(N):
            img.putpixel((x, y), rgb(g[y][x]))
    return img.resize((N * scale, N * scale), Image.NEAREST)


def to_svg(g):
    rects = []
    for y in range(N):                              # one rect per horizontal run of a colour
        x = 0
        while x < N:
            c, start = g[y][x], x
            while x < N and g[y][x] == c:
                x += 1
            rects.append(f'<rect x="{start}" y="{y}" width="{x - start}" height="1" fill="{c}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" shape-rendering="crispEdges">'
            + ''.join(rects) + '</svg>\n')


g = mark()
with open(os.path.join(ROOT, 'favicon.svg'), 'w') as f:
    f.write(to_svg(g))
to_image(g, 8).save(os.path.join(ROOT, 'apple-touch-icon.png'), optimize=True)
if '--avatar' in sys.argv:
    to_image(g, 20).save(sys.argv[sys.argv.index('--avatar') + 1], optimize=True)

# link preview: the mark on the left, wordmark and one line on the right, default Game Boy colours
W, H = 1200, 630
BG, TEXT, MUTED = '#d6d9de', '#1d2129', '#4b5260'
img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)
S, mx, my = 15, 96, (H - N * 15) // 2          # 360px mark, 15 screen pixels per art pixel
d.rectangle((mx, my + 6, mx + N * S - 1, my + N * S + 5), fill='#5e0f30')   # the 6px darker "lip" under the tile
img.paste(to_image(g, S), (mx, my))
pixel = ImageFont.truetype(os.path.join(ROOT, 'fonts', 'pixelify-sans.woff'), 96)
pixel.set_variation_by_axes([700])
sans = ImageFont.truetype(os.path.join(ROOT, 'fonts', 'instrument-sans.woff'), 44)
sans.set_variation_by_axes([500])
tx = mx + N * S + 72
d.text((tx, 200), 'SaveForge', font=pixel, fill=TEXT)
d.text((tx, 335), 'Edit your retro game saves', font=sans, fill=TEXT)
d.text((tx, 393), 'in the browser.', font=sans, fill=MUTED)
img.save(os.path.join(ROOT, 'og-image.png'), optimize=True)
print('wrote favicon.svg, apple-touch-icon.png, og-image.png' + (' and the avatar' if '--avatar' in sys.argv else ''))
