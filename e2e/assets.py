"""Every picture looks like part of one set: on every page (the landing page, each game's tabs and Pokémon windows) and at
every screen scaling, the pixel art (Pokémon, items, badges, Pikachu) is drawn at a whole number of screen pixels per art
pixel with hard edges, and each kind of picture is one size everywhere: every Pokémon in a list, tile, cell or the
Pokédex the same, every item the same, the Pokémon window and landing page pictures the same (twice the list size),
every type icon 24px, every shiny mark 16px and every ♂/♀ three quarters of a letter high (drawn, so smooth
everywhere). A held item is three quarters of a bag item (as the games' party screens draw it), beside the Pokémon. The badges size themselves to their row (e2e/crisp.py checks that), so
here they only have to be whole multiples. A new game's pages are covered by adding it to GAMES; a new kind of picture
by adding it to KINDS (and to the "one scale for every picture" block in styles.css)."""
import sys
from playwright.sync_api import sync_playwright
from lib import BASE
SP = sys.argv[1]
errors = []

# kind -> (CSS selector, pixel art?, the size it must be: 'list' / 'big' (whole multiples of one shared scale), a fixed
# CSS size, or None for "whole multiple, any size")
KINDS = {
    'Pokémon (lists)': ('img.mon-icon:not(.big)', True, 'list'),
    'Pokémon (window, landing)': ('img.mon-icon.big, img.tile-icon:not(.job-sprite)', True, 'big'),
    'item': ('img.item-icon:not(.held > img)', True, 'list'),
    'held item': ('.held > img.item-icon', False, 24),
    'badge': ('img.badge-icon', True, None),
    'ribbon': ('img.ribbon-icon', True, 'list'),
    'Pokéblock': ('img.pokeblock-icon', True, 'big'),
    'Final Fantasy class': ('img.job-sprite', True, None),
    'status icon': ('img.status-badge', True, None),
    'type icon': ('img.type-icon', False, 24),
    'shiny mark': ('img.shiny-icon', False, 16),
    '♂/♀': ('svg.gender-icon', False, '0.75em'),
}

SCAN = """async (kinds) => {
  const imgs = [...document.querySelectorAll('img')];
  imgs.forEach((i) => { i.loading = 'eager'; });
  await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); }))));
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const out = {};
  for (const [kind, [sel]] of Object.entries(kinds)) {
    out[kind] = [...document.querySelectorAll(sel)].filter((i) => shown(i) && (i.naturalWidth > 0 || i.tagName === 'svg')).map((i) => {
      const r = i.getBoundingClientRect();
      return { src: (i.getAttribute('src') || i.getAttribute('class')).replace(/^.*sprites\\//, ''), w: r.width, h: r.height, nw: i.naturalWidth, nh: i.naturalHeight,
               pixelated: getComputedStyle(i).imageRendering === 'pixelated', em: parseFloat(getComputedStyle(i.parentElement).fontSize) };
    });
  }
  // Pikachu's reactions are background pictures: 40px frames
  out.pikachu = [...document.querySelectorAll('.pika-frame')].filter(shown).map((e) => ({ w: e.getBoundingClientRect().width, pixelated: getComputedStyle(e).imageRendering === 'pixelated' }));
  // a picture's empty edges may run past its tile, but never off the side of the screen
  out.sideways = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  out.unclassed = imgs.filter((i) => shown(i) && !Object.values(kinds).some(([sel]) => i.matches(sel))).map((i) => i.getAttribute('src'));
  return out;
}"""


def whole(v):
    return round(v) >= 1 and abs(v - round(v)) < 0.02


def check(where, out, dpr):
    bad = []
    scale = {}
    for kind, (_, pixel_art, size) in KINDS.items():
        for x in out[kind]:
            if isinstance(size, str) and size.endswith('em'):
                want_px = float(size[:-2]) * x['em']
                if abs(x['w'] - want_px) > 0.05 or abs(x['h'] - want_px) > 0.05:
                    bad.append(f"{kind} is {x['w']:.2f}x{x['h']:.2f}, not {size} ({want_px}px)")
                continue
            sx, sy = x['w'] * dpr / x['nw'], x['h'] * dpr / x['nh']
            if pixel_art:
                if not (whole(sx) and whole(sy) and abs(sx - sy) < 0.02):
                    bad.append(f"{kind} {x['src']} is drawn at {sx:.3f}x{sy:.3f} screen pixels per art pixel, not a whole number")
                if not x['pixelated']:
                    bad.append(f"{kind} {x['src']} is smoothed (no image-rendering: pixelated)")
                if size in ('list', 'big'):
                    scale.setdefault(size, set()).add(round(sx, 2))
            elif abs(x['w'] - size) > 0.05 or abs(x['h'] - size) > 0.05:
                bad.append(f"{kind} {x['src']} is {x['w']:.2f}x{x['h']:.2f}, not {size}px")
    # one scale for lists (Pokémon and items alike) and one for the big pictures, which is about twice it
    for size, seen in scale.items():
        if len(seen) > 1:
            bad.append(f"{size} pictures are drawn at more than one scale: {sorted(seen)}")
    if 'list' in scale and 'big' in scale and len(scale['list']) == 1 and len(scale['big']) == 1:
        lst, big = next(iter(scale['list'])) / dpr, next(iter(scale['big'])) / dpr
        if not 1.4 <= big / lst <= 2.6:
            bad.append(f"big pictures ({big:.2f}px per art pixel) are not about twice the list ones ({lst:.2f})")
    for x in out['pikachu']:
        if not whole(x['w'] * dpr / 40) or not x['pixelated']:
            bad.append(f"Pikachu is drawn at {x['w'] * dpr / 40:.3f} screen pixels per art pixel (pixelated: {x['pixelated']})")
    if out['sideways'] > 0:
        bad.append(f"the page scrolls sideways by {out['sideways']}px")
    if out['unclassed']:
        bad.append(f"pictures this check doesn't know (add them to KINDS): {out['unclassed'][:3]}")
    return [f'{where}: {b}' for b in dict.fromkeys(bad)]


def open_file(page, name):
    with page.expect_file_chooser() as fc:
        page.click('.slot')
    fc.value.set_files(f'{SP}/{name}')


GAMES = [
    ('Yellow', lambda page: page.select_option('.sample-row select >> nth=0', label='Pokémon Yellow')),
    ('Crystal', lambda page: page.select_option('.sample-row select >> nth=0', label='Pokémon Crystal')),
    ('Emerald', lambda page: page.select_option('.sample-row select >> nth=0', label='Pokémon Emerald')),
    ('Red/Blue', lambda page: open_file(page, 'rb.sav')),
    ('Gold', lambda page: open_file(page, 'gold.sav')),
    ('Ruby', lambda page: open_file(page, 'ruby.sav')),
    ('Emerald', lambda page: open_file(page, 'emerald.sav')),
    ('Final Fantasy (NES)', lambda page: page.select_option('.sample-row select >> nth=1', label='Final Fantasy I')),
    ('Final Fantasy (GBA)', lambda page: open_file(page, 'dawn-of-souls.sav')),
    ('Final Fantasy III (Famicom)', lambda page: open_file(page, 'ff3-famicom.sav')),
    ('Final Fantasy III (Nintendo DS)', lambda page: open_file(page, 'ff3-ds.sav')),
    ('Final Fantasy III (PSP)', lambda page: open_file(page, 'NPUH10125DATA00.zip')),
    ('Final Fantasy II (GBA)', lambda page: open_file(page, 'dawn-of-souls-2.sav')),
    ('Final Fantasy (WonderSwan Color)', lambda page: open_file(page, 'ff1-wonderswan.sav')),
    ('Final Fantasy (PSP)', lambda page: open_file(page, 'ULUS10251DATA00.zip')),
]
POKEMON_TABS = ('Trainer', 'Bag', 'Party', 'Boxes', 'Pokédex')

counts = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    # a plain desktop, a phone in desktop mode, 125% and 150% desktops, a 2x laptop, 2.625 and 3x phones and the smallest phone
    for width, dpr, games in ((1280, 1, GAMES), (980, 1.1, GAMES), (1280, 1.25, GAMES[:2] + GAMES[-2:]), (1280, 1.5, GAMES[:2] + GAMES[-2:]),
                              (1280, 2, GAMES[:2] + GAMES[-2:]), (390, 2.625, GAMES), (390, 3, GAMES[:2] + GAMES[-2:]), (320, 2, GAMES[:2] + GAMES[-2:])):
        ctx = b.new_context(viewport={'width': width, 'height': 860}, device_scale_factor=dpr)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
        tag = f'{width}px @{dpr}x'

        def scan(where):
            out = page.evaluate(SCAN, {k: [v[0]] for k, v in KINDS.items()})
            for k, v in out.items():
                if isinstance(v, list) and k != 'unclassed':
                    counts[k] = counts.get(k, 0) + len(v)
            errors.extend(check(f'{tag} {where}', out, dpr))

        page.goto(BASE); page.wait_for_selector('.slot')
        scan('landing page')
        for game, opener in games:
            page.goto(BASE); page.wait_for_selector('.slot')
            opener(page); page.wait_for_selector('.tabs'); page.wait_for_timeout(300)
            if game.startswith('Final Fantasy'):
                for i in range(page.locator('button.tab').count()):
                    page.locator('button.tab').nth(i).click(); page.wait_for_timeout(150)
                    scan(f'{game} tab {i + 1}')
                # poison the first member, for the status icon beside the name (the Status or Ailment buttons)
                page.locator('button.tab').first.click(); page.wait_for_timeout(150)
                poison = page.locator('h4:text-is("Status") + .ff-toggles button.ff-toggle:text-is("Poison"), '
                                      'h4:text-is("Ailment") + .ff-toggles button.ff-toggle:text-is("Poison")')
                if poison.count():
                    poison.first.click()
                else:
                    continue
                page.wait_for_timeout(150)
                scan(f'{game} with a status')
                continue
            for tab in POKEMON_TABS:
                page.click(f'button.tab:has-text("{tab}")'); page.wait_for_timeout(150)
                scan(f'{game} {tab}')
                if tab == 'Bag':   # every pocket under the pocket tabs
                    for i in range(page.locator('button.pocket-tab').count()):
                        page.locator('button.pocket-tab').nth(i).click(); page.wait_for_timeout(100)
                        scan(f'{game} Bag pocket {i + 1}')
                    page.locator('button.pocket-tab').first.click()
            page.click('button.tab:has-text("Party")')
            for i in range(page.locator('.mon-main').count()):   # eggs, shiny and Unown differ
                page.locator('.mon-main').nth(i).click(); page.wait_for_selector('dialog.mon-dialog[open]'); page.wait_for_timeout(100)
                scan(f'{game} Pokémon window {i + 1}')
                page.click('dialog.mon-dialog button.primary'); page.wait_for_selector('dialog.mon-dialog', state='detached')
        ctx.close()
    b.close()

# make sure the sweep really saw each kind of picture (a renamed class would otherwise pass by checking nothing)
missing = [k for k in [*KINDS, 'pikachu'] if not counts.get(k)]
assert not missing, f'never saw: {missing}'
assert not errors, '\n'.join(dict.fromkeys(errors))
print('assets: ok', counts)
