"""Final Fantasy III (Famicom): open a save, edit across the tabs, save, and check the file that comes back (read by the
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
    fc.value.set_files(f'{SP}/ff3-famicom.sav')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'nes'
    assert page.locator('.ff-member').all_inner_texts()[0].startswith('Luneth')
    page.fill('input[aria-label="Name"]', 'Kieron')
    page.get_by_role('spinbutton', name='Strength', exact=True).fill('60')
    page.get_by_role('spinbutton', name='Strength', exact=True).press('Tab')
    page.get_by_role('spinbutton', name='Ninja (locked)', exact=True).fill('30')
    page.get_by_role('spinbutton', name='Ninja (locked)', exact=True).press('Tab')
    page.select_option('label.field:has-text("Right hand") select', label='Excalibur Sword')
    page.click('.ff-member >> nth=2')
    page.click('button.ff-toggle:has-text("Sleep")')
    page.click('button.ff-toggle:has-text("Flare")')
    page.screenshot(path=f'{SP}/ff3nes-party.png', full_page=True)
    page.click('button.tab:has-text("Items")')
    page.locator('label.field:has-text("Gil") input').fill('5000000')
    page.locator('label.field:has-text("Gil") input').press('Tab')
    page.focus('label.field:has-text("Place 9") select')  # the bag pickers fill their options when touched
    page.select_option('label.field:has-text("Place 9") select', label='Ribbon')
    page.click('button.ff-toggle:has-text("Eureka")')
    page.screenshot(path=f'{SP}/ff3nes-items.png', full_page=True)
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in ('Name: Luneth → Kieron', 'Strength: 17 → 60', 'Ninja job level: 1 → 30', 'Right hand: Long Sword → Excalibur Sword',
                 'Learned Sleep', 'Learned Flare', 'Gil: 4,820 → 5,000,000', 'Ribbon: 0 → 1', 'Eureka crystal jobs: open'):
        assert line in review, (line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    dl.value.save_as(f'{SP}/ff3nes-edited.sav')
    b.close()

check = """
import { readFileSync } from 'node:fs';
import { slotOk } from './src/core/ff3nes/layout.ts';
import { Ff3NesSave, ITEMS } from './src/core/ff3nes/save.ts';
const d = new Uint8Array(readFileSync(process.argv[1]));
const f = new Ff3NesSave(d).slots[0];
const c = f.party[0];
console.log(JSON.stringify({ size: d.length, ok: slotOk(d, 0), name: c.name, str: c.stat('str'), ninja: c.jobLevel(21),
  excalibur: c.gear(0) === ITEMS.indexOf('Excalibur Sword'), flare: f.party[2].knows(ITEMS.indexOf('Flare')),
  sleep: f.party[2].knows(ITEMS.indexOf('Sleep')), gil: f.gil, ribbon: f.count(ITEMS.indexOf('Ribbon')), eureka: f.crystal(4) }));
"""
out = json.loads(subprocess.run(['node', '--input-type=module', '-e', check, f'{SP}/ff3nes-edited.sav'], cwd=REPO,
                                capture_output=True, text=True, check=True).stdout)
assert out['size'] == 8192 and out['ok'], out
assert out['name'] == 'Kieron' and out['str'] == 60 and out['ninja'] == 30 and out['excalibur'], out
assert out['flare'] and out['sleep'] and out['gil'] == 5000000 and out['ribbon'] == 1 and out['eureka'], out
print('ERRORS:', '; '.join(errors) or 'none')
