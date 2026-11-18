"""Final Fantasy II (WonderSwan Color): open a save, edit across the tabs, save, and check the file that comes back (read by the
editor's own code, run in Node): the edits are there and slot 1 passes the game's check."""
import json
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from lib import BASE
SP = sys.argv[1]
REPO = Path(__file__).resolve().parent.parent
errors = []

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 390, 'height': 860}, accept_downloads=True)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
    page.goto(BASE)
    with page.expect_file_chooser() as fc:
        page.click('.slot')
    fc.value.set_files(f'{SP}/ff2-wonderswan.sav')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'wsc'
    assert page.locator('.ff-member').all_inner_texts()[0].startswith('Firion')
    assert page.locator('.ff-member img.job-sprite.prj[src*="ff2/pr/jobs/"]').count() == 3
    assert page.evaluate("[...document.querySelectorAll('.ff-member img')].every((i) => i.complete && i.naturalWidth === 19)")
    page.fill('input[aria-label="Name"]', 'Kieron')
    page.get_by_role('spinbutton', name='Strength', exact=True).fill('60')
    page.get_by_role('spinbutton', name='Strength', exact=True).press('Tab')
    page.get_by_role('spinbutton', name='Sword', exact=True).fill('12')
    page.get_by_role('spinbutton', name='Sword', exact=True).press('Tab')
    page.select_option('label.field:has-text("Right hand") select', label='Excalibur')
    page.select_option('label.field:has-text("Learn a spell") select', label='Ultima')
    page.click('.ff-member >> nth=1')
    page.click('button[aria-label="Forget Blizzard"]')
    # the fourth member: nobody is along; Gordon joins with his own record
    assert page.get_attribute('.ff-guests .ff-class-tile:has-text("Nobody")', 'aria-pressed') == 'true'
    page.click('.ff-guests .ff-class-tile:has-text("Gordon")')
    assert page.locator('.ff-member').count() == 4
    assert page.locator('.ff-member').all_inner_texts()[3].startswith('Gordon')
    page.screenshot(path=f'{SP}/ff2wsc-party.png', full_page=True)
    page.click('button.tab:has-text("Items")')
    page.locator('label.field:has-text("Gil") input').fill('5000000')
    page.locator('label.field:has-text("Gil") input').press('Tab')
    page.select_option('label.field:has-text("Place 9") select', label='Masamune')
    # key terms: learn Dreadnought, forget Wild Rose
    page.click('.ff-toggle:text-is("Dreadnought")')
    page.click('.ff-toggle:text-is("Wild Rose")')
    assert page.get_attribute('.ff-toggle:text-is("Dreadnought")', 'aria-pressed') == 'true'
    assert page.get_attribute('.ff-toggle:text-is("Mythril")', 'aria-pressed') == 'true'
    assert page.get_attribute('.ff-toggle:text-is("Wild Rose")', 'aria-pressed') == 'false'
    page.screenshot(path=f'{SP}/ff2wsc-items.png', full_page=True)
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in ('Name: Firion → Kieron', 'Strength: 22 → 60', 'Sword skill: 5 → 12', 'Right hand: Mythril Sword → Excalibur',
                 'Learned Ultima (level 1)', 'Forgot Blizzard', 'Gil: 18,350 → 5,000,000', 'Masamune: 0 → 1',
                 'Dreadnought: learned', 'Wild Rose: forgotten', 'Fourth member: Nobody → Gordon'):
        assert line in review, (line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    dl.value.save_as(f'{SP}/ff2wsc-edited.sav')
    b.close()

check = """
import { readFileSync } from 'node:fs';
import { slotOk } from './src/core/ff2wsc/layout.ts';
import { Ff2WscSave } from './src/core/ff2wsc/save.ts';
import { ITEMS, SPELLS } from './src/core/ff2nes/save.ts';
const d = new Uint8Array(readFileSync(process.argv[1]));
const s = new Ff2WscSave(d);
const f = s.slots[0];
const c = f.party[0];
console.log(JSON.stringify({ size: d.length, ok: slotOk(d, 0), name: c.name, str: c.stat('str'), sword: c.skill(s.format.weaponSkills.indexOf('Sword')).level,
  excalibur: c.gear(0) === ITEMS.indexOf('Excalibur'), ultima: c.knows(SPELLS.indexOf('Ultima') + 1),
  blizzard: f.party[1].knows(SPELLS.indexOf('Blizzard') + 1), gil: f.gil, masamune: f.count(ITEMS.indexOf('Masamune')),
  terms: f.keyTerms.learned, guest: f.guest, byte: d[0x20 + 5], fourth: f.party[3]?.name }));
"""
out = json.loads(subprocess.run(['node', '--input-type=module', '-e', check, f'{SP}/ff2wsc-edited.sav'], cwd=REPO,
                                capture_output=True, text=True, check=True).stdout)
assert out['size'] == 32768 and out['ok'], out
assert out['name'] == 'Kieron' and out['str'] == 60 and out['sword'] == 12 and out['excalibur'] and out['ultima'], out
assert not out['blizzard'] and out['gil'] == 5000000 and out['masamune'] == 1, out
assert out['terms'] == [3, 2], out   # Dreadnought first, then Mythril
assert out['guest'] == 5 and out['byte'] == 5 and out['fourth'] == 'Gordon', out
print('ERRORS:', '; '.join(errors) or 'none')
