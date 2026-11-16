"""FireRed / LeafGreen: a made-up save (e2e/make-fixtures.ts), the version question, the Kanto badges, no Hoenn extras,
FireRed and LeafGreen's own cards (Fly, Fame Checker, Vs. Seeker), the bag's bigger pockets, and the saved file."""
import struct
import sys
from playwright.sync_api import sync_playwright
from lib import BASE
SP = sys.argv[1]
errors = []

FRLG_SIZES = [0xf24, 3968, 3968, 3968, 0x3d68 - 3 * 3968] + [3968] * 8 + [2000]


def sectors(b, sizes):
    """The newest slot's sectors by id, after checking every signature and checksum."""
    best = None
    for slot in (0, 1):
        found = {}
        for s in range(14):
            at = slot * 0xe000 + s * 0x1000
            sid, chk, sig, cnt = struct.unpack_from('<HHII', b, at + 0xff4)
            if sig != 0x08012025 or sid > 13:
                break
            n = sizes[sid]
            total = sum(struct.unpack_from(f'<{n // 4}I', b, at)) & 0xffffffff
            assert chk == ((total >> 16) + total) & 0xffff, f'sector {sid} checksum'
            found[sid] = at
        if len(found) == 14 and (best is None or cnt > best[0]):
            best = (cnt, found)
    assert best, 'no complete slot'
    return best[1]


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 400, 'height': 860}, accept_downloads=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)

    page.goto(BASE)
    with page.expect_file_chooser() as fc:
        page.click('.slot')
    fc.value.set_files(f'{SP}/firered.sav')
    page.wait_for_selector('.tabs')
    assert page.get_attribute('html', 'data-console') == 'gba'
    assert page.locator('.version-pick button').count() == 2                       # FireRed and LeafGreen look the same inside
    page.click('.version-pick button:has-text("LeafGreen")')
    assert page.inner_text('.game-name') == 'Pokémon LeafGreen'

    # --- trainer: Kanto badges, FireRed's own cards, none of Hoenn's
    assert page.input_value('label.field:has-text("Trainer name") input') == 'LEAF'
    assert page.locator('.tcard-badges .badge-slot.earned').count() == 4
    assert 'badges/frlg/1.png' in page.get_attribute('.tcard-badges img', 'src')
    assert 'Boulder' in page.inner_text('.badge-grid')
    for gone in ['frontier', 'rematches']:
        assert page.locator(f'section.card.{gone}').count() == 0, gone
    assert page.locator('section.card.roamer').count() == 0                          # no beast roaming yet
    vs = page.locator('label.check-row:has-text("Vs. Seeker charged") input')
    assert not vs.is_checked()                                                        # 60 of 100 steps
    vs.check()
    fly = page.locator('section.card.fly')
    fly.locator('details.fold > summary').click()
    assert fly.locator('label.check-row').count() == 20
    assert fly.locator('label.check-row:has-text("Pewter City") input').is_checked()
    fly.locator('label.check-row:has-text("Four Island") input').check()
    fame = page.locator('section.card.fame')
    fame.locator('details.fold > summary').click()
    assert fame.locator('h3 .count').inner_text() == '3/16'                          # Oak, Brock and Misty met
    fame.locator('button:has-text("Everyone, every fact")').click()
    assert fame.locator('h3 .count').inner_text() == '16/16'
    islands = page.locator('section.card.islands')
    islands.locator('details.fold > summary').click()
    assert 'Rainbow Pass' in islands.inner_text()                                     # the Seagallop waits for it
    islands.locator('label.check-row:has-text("Navel Rock") input').check()
    stats = page.locator('section.card.game-stats')
    stats.locator('details.fold > summary').click()
    assert stats.locator('label.field:has-text("Secret Base moves")').count() == 0   # Hoenn only
    frame = page.locator('.opt-row:has(.opt-label:text-is("Frame"))')
    frame.locator('button[aria-label="Previous frame"]').click()                      # from TYPE 1 round to TYPE 10
    assert frame.locator('output').inner_text().split()[-1] == '10'
    page.screenshot(path=f'{SP}/f1-trainer.png', full_page=True)

    # --- bag: 999 of an item, Kanto key items, no Pokéblocks, decorations or secret base
    page.click('button.tab:has-text("Bag")')
    assert page.locator('button.pocket-tab:text-is("Blocks & bases")').count() == 0   # Hoenn only
    assert page.locator('section.pokeblocks, section.decorations, section.secret-base').count() == 0
    page.click('button.pocket-tab:text-is("Key items")')
    keys = page.locator('section.card:has(h3:has-text("Key Items pocket"))')
    assert 'VS Seeker' in keys.inner_text() and 'Tri-Pass' not in keys.inner_text()
    page.click('button.pocket-tab:text-is("Items")')
    items = page.locator('section.card:has(h3:has-text("Items pocket"))').first
    items.locator('.item-row input').first.fill('999')
    items.locator('.item-row input').first.press('Tab')
    page.screenshot(path=f'{SP}/f2-bag.png', full_page=True)

    # --- party: Kanto Pokémon met in Kanto
    page.click('button.tab:has-text("Party")')
    assert page.locator('.mon').count() == 5
    page.locator('.mon-main').nth(0).click()
    page.wait_for_selector('dialog.mon-dialog[open]')
    assert 'Pallet Town' in page.inner_text('dialog.mon-dialog')
    page.screenshot(path=f'{SP}/f3-mon.png')
    page.click('dialog.mon-dialog button.primary')

    # --- review, save, check the bytes
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    text = page.text_content('dialog.review-dialog')
    for want in ['Vs. Seeker: charged', 'Can fly to: Four Island', 'Daisy: Not yet → Met, facts 0 → 6 of 6', 'Navel Rock: the ferry will sail there',
                 'Seagallop only sails there once you have the Rainbow Pass']:
        assert want in text, (want, text)
    page.screenshot(path=f'{SP}/f4-review.png')
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    dl.value.save_as(f'{SP}/f-edited.sav')
    data = open(f'{SP}/f-edited.sav', 'rb').read()
    assert len(data) == 131072
    sec = sectors(data, FRLG_SIZES)
    sb2, s1, s2 = sec[0], sec[1], sec[2]
    key = struct.unpack_from('<I', data, sb2 + 0xf20)[0]
    assert struct.unpack_from('<H', data, s1 + 0x310 + 2)[0] ^ (key & 0xffff) == 999   # the first item, under the key
    assert data[s1 + 0x638] == 100                                                     # the Vs. Seeker's battery
    flag = lambda n: data[s1 + 0xee0 + (n >> 3)] if 0xee0 + (n >> 3) < 3968 else data[s2 + 0xee0 + (n >> 3) - 3968]
    assert flag(0x89e) & (1 << (0x89e & 7))                                            # FLAG_WORLD_MAP_FOUR_ISLAND
    assert (data[sb2 + 0x14] >> 3) & 31 == 9                                           # Frame type 10
    b.close()
print('ERRORS:', errors or 'none')
