"""Final Fantasy II (Dawn of Souls, GBA): open a save, edit across the tabs, save, and check the file that comes back
(read by the editor's own code, run in Node): the edits are there and File 1's checksum is right."""
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
    fc.value.set_files(f'{SP}/dawn-of-souls-2.sav')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'gba'
    assert page.locator('.ff-member').all_inner_texts()[0].startswith('Firion')
    assert page.locator('.ff-member img.job-sprite.prj[src*="ff2/pr/jobs/"]').count() == 4
    assert page.locator('.ff-member .hp-bar.mp').count() == 4                       # HP and MP bars in the party window
    # Firion: rename, a stat, a weapon skill, a weapon, a spell level, a new spell
    page.fill('input[aria-label="Name"]', 'Kieron')
    page.get_by_role('spinbutton', name='Strength', exact=True).fill('60')
    page.get_by_role('spinbutton', name='Strength', exact=True).press('Tab')
    page.get_by_role('spinbutton', name='Sword', exact=True).fill('12')
    page.get_by_role('spinbutton', name='Sword', exact=True).press('Tab')
    page.select_option('label.field:has-text("Right hand") select', label='Excalibur')
    page.get_by_role('spinbutton', name='Fire', exact=True).fill('9')
    page.get_by_role('spinbutton', name='Fire', exact=True).press('Tab')
    page.select_option('label.field:has-text("Learn a spell") select', label='Ultima')
    # Maria forgets Blizzard
    page.click('.ff-member >> nth=1')
    page.click('button[aria-label="Forget Blizzard"]')
    page.screenshot(path=f'{SP}/ff2gba-party.png', full_page=True)
    page.click('button.tab:has-text("Items")')
    page.locator('label.field:has-text("Gil") input').fill('500000')
    page.locator('label.field:has-text("Gil") input').press('Tab')
    page.locator('label.field:has-text("Elixir") input').fill('7')
    page.locator('label.field:has-text("Elixir") input').press('Tab')
    # key terms: learn Dreadnought, forget Wild Rose
    page.click('.ff-toggle:text-is("Dreadnought")')
    page.click('.ff-toggle:text-is("Wild Rose")')
    assert page.get_attribute('.ff-toggle:text-is("Dreadnought")', 'aria-pressed') == 'true'
    assert page.get_attribute('.ff-toggle:text-is("Wild Rose")', 'aria-pressed') == 'false'
    page.click('button.tab:has-text("Weapons, armor and books")')
    page.locator('label.field:has-text("Holy Tome") input').fill('1')
    page.locator('label.field:has-text("Holy Tome") input').press('Tab')
    page.screenshot(path=f'{SP}/ff2gba-gear.png', full_page=True)
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in ('Name: Firion → Kieron', 'Strength: 24 → 60', 'Sword skill: 5 → 12', 'Right hand: Mythril Sword → Excalibur',
                 'Fire: level 3 → 9', 'Learned Ultima (level 1)', 'Forgot Blizzard', 'Gil: 3,250 → 500,000', 'Elixir: 0 → 7', 'Holy Tome: 0 → 1',
                 'Dreadnought: learned', 'Wild Rose: forgotten'):
        assert line in review, (line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    dl.value.save_as(f'{SP}/ff2gba-edited.sav')
    b.close()

check = """
import { readFileSync } from 'node:fs';
import { FF2, fileOk } from './src/core/ff1gba/layout.ts';
import { Ff2GbaSave } from './src/core/ff2gba/save.ts';
import { ITEMS, SPELLS } from './src/core/ff2gba/tables.ts';
const d = new Uint8Array(readFileSync(process.argv[1]));
const f = new Ff2GbaSave(d).files[0];
const c = f.party[0];
console.log(JSON.stringify({ size: d.length, ok: fileOk(d, FF2, 0), name: c.name, str: c.stat('str'), sword: c.skill(2).level,
  excalibur: c.gear(0) === ITEMS.indexOf('Excalibur'), ultima: c.knows(SPELLS.indexOf('Ultima') + 1),
  blizzard: f.party[1].knows(SPELLS.indexOf('Blizzard') + 1), gil: f.gil, elixir: f.count(ITEMS.indexOf('Elixir')),
  terms: f.keyTerms.learned, count: d[FF2.base + 0x6ff] }));
"""
out = json.loads(subprocess.run(['node', '--input-type=module', '-e', check, f'{SP}/ff2gba-edited.sav'], cwd=REPO,
                                capture_output=True, text=True, check=True).stdout)
assert out['size'] == 32768 and out['ok'], out
assert out['name'] == 'Kieron' and out['str'] == 60 and out['sword'] == 12 and out['excalibur'] and out['ultima'], out
assert not out['blizzard'] and out['gil'] == 500000 and out['elixir'] == 7, out
assert out['terms'] == [3, 2] and out['count'] == 2, out   # Dreadnought first, then Mythril
print('ERRORS:', '; '.join(errors) or 'none')
