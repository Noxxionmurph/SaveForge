"""A SharkPort .sps (the GameShark SP export some emulators and phone apps write): it opens as the save inside, and
Save gives back a .sps with the edit in it and a fresh checksum."""
import struct
import sys
from playwright.sync_api import sync_playwright
from lib import BASE
SP = sys.argv[1]
errors = []


def checksum(b):
    s = 0
    for x in b:
        s = (s + (((x ^ 0x80) - 0x80) << (s % 24))) & 0xffffffff
    return s


def wrap(save):
    def s(t):
        return struct.pack('<I', len(t)) + t
    header = (b'POKEMON FIREBPRE' + bytes(12))
    payload = header + save
    return (s(b'SharkPortSave') + struct.pack('<I', 0xf0000) + s(b'POKEMON FIRE') + s(b'9/23/2026 11:08:10 AM') + s(b'')
            + struct.pack('<I', len(payload)) + payload + struct.pack('<I', checksum(payload)))


sav = open(f'{SP}/firered.sav', 'rb').read()
sps = wrap(sav)
assert len(sps) == len(sav) + 102
open(f'{SP}/firered.sps', 'wb').write(sps)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 400, 'height': 860}, accept_downloads=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(BASE)
    with page.expect_file_chooser() as fc:
        page.click('.slot')
    fc.value.set_files(f'{SP}/firered.sps')
    page.wait_for_selector('.tabs')
    assert page.inner_text('.game-name').startswith('Pokémon FireRed'), page.inner_text('.game-name')
    assert page.input_value('label.field:has-text("Trainer name") input') == 'LEAF'
    page.click('.version-pick button:has-text("FireRed")')
    money = page.locator('label.field:has-text("Money") input')
    money.fill('424242')
    money.press('Tab')
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    assert dl.value.suggested_filename == 'firered-edited.sps', dl.value.suggested_filename
    dl.value.save_as(f'{SP}/firered-edited.sps')
    out = open(f'{SP}/firered-edited.sps', 'rb').read()
    assert len(out) == len(sps) and out[:98] == sps[:98], 'same SharkPort header'
    assert out[98:-4] != sav, 'the edit is inside'
    assert struct.unpack('<I', out[-4:])[0] == checksum(out[70:-4]), 'fresh checksum'
    b.close()
print('ERRORS:', errors or 'none')
