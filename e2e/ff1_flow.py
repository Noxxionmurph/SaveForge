"""Final Fantasy (NES): open the sample, edit across every tab, save, and check the file the way the game does."""
import sys
from playwright.sync_api import sync_playwright
from lib import BASE
SP = sys.argv[1]
errors = []


def checksum(block):
    """The game's check (VerifyChecksum, bank_0F): add with carry over the 1 KB, a column of four pages at a time."""
    a = c = 0
    for x in range(0x100):
        for page in range(4):
            s = a + block[page * 0x100 + x] + c
            a, c = s & 0xff, s >> 8
    return a


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 390, 'height': 860}, accept_downloads=True)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
    page.goto(BASE)
    page.click('.sample-btn:text-is("Final Fantasy")')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'nes'
    assert page.locator('.ff-member').all_inner_texts()[0].startswith('Brom')
    assert 'null' not in page.inner_text('#tab-panel')
    # party: rename, level up, swap the weapon (Damage follows), teach a spell
    page.fill('input[aria-label="Name"]', 'Kie')
    page.locator('label.field:has-text("Level") input').fill('30')
    page.locator('label.field:has-text("Level") input').press('Tab')
    dmg = int(page.input_value('label.field:has-text("Damage") input'))
    page.select_option('select[aria-label="Weapon 1"]', label='Rapier')
    assert int(page.input_value('label.field:has-text("Damage") input')) == dmg - 20 + 9   # Long Sword off, Rapier on
    page.click('.ff-member >> nth=3')
    page.select_option('select[aria-label="Level 1 spell 3"]', label='LOCK')
    page.screenshot(path=f'{SP}/ff1-party.png', full_page=True)
    # items and world
    page.click('button.tab:has-text("Items")')
    page.click('.ff-toggle:text-is("Floater")')
    page.locator('label.field:has-text("Gold") input').fill('99999')
    page.locator('label.field:has-text("Gold") input').press('Tab')
    page.click('button.tab:has-text("World")')
    page.click('label.check-row:has-text("Airship raised") input')
    page.click('.ff-toggle:text-is("Fire Orb")')
    page.screenshot(path=f'{SP}/ff1-world.png', full_page=True)
    # review and save
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in ('Name: Brom → Kie', 'Level: 14 → 30', 'Learned LOCK', 'Gold: 4,210 → 99,999', 'Added Floater', 'Airship: raised', 'Fire Orb: lit'):
        assert line in review, (line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    dl.value.save_as(f'{SP}/ff1-edited.sav')
    b.close()

data = open(f'{SP}/ff1-edited.sav', 'rb').read()
block = data[0x400:0x800]
assert len(data) == 8192
assert block[0xfe] == 0x55 and block[0xff] == 0xaa and checksum(block) == 0xff
assert block[0x102:0x106] == bytes([0x94, 0xac, 0xa8, 0xff])   # K i e
assert block[0x126] == 29 and int.from_bytes(block[0x1c:0x1f], 'little') == 99999
assert block[0x04] == 0x1f and block[0x20 + 0x0b] == 1 and block[0x20 + 0x12] == 1
print('ERRORS:', errors or 'none')
