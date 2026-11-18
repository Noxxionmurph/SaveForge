"""Final Fantasy I (Dawn of Souls, GBA): open a save, edit across the tabs, save, and check the file that comes back
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
    fc.value.set_files(f'{SP}/dawn-of-souls.sav')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'gba'
    assert page.locator('.ff-member').all_inner_texts()[0].startswith('Brom')
    assert page.locator('.ff-member img.job-sprite.prj[src*="ff1/pr/jobs/"]').count() == 4
    assert page.locator('.ff-member .hp-bar:not(.mp)').count() == 4                 # an HP bar for everyone, MP bars for the casters
    assert page.locator('.ff-member .hp-bar.mp').count() == 2
    assert page.inner_text('.ff-classes .ff-class-tile.now') == 'Warrior'
    # party: rename, level, poison, swap the weapon, teach a spell
    page.fill('input[aria-label="Name"]', 'Kieron')
    page.get_by_role('spinbutton', name='Level', exact=True).fill('40')
    page.get_by_role('spinbutton', name='Level', exact=True).press('Tab')
    page.click('h4:text-is("Ailment") + .ff-toggles button.ff-toggle:text-is("Poison")')
    assert page.locator('h4:text-is("Ailment") + .ff-toggles button[aria-pressed="true"]').all_inner_texts() == ['Poison']
    page.select_option('label.field:has-text("Weapon") select', label='Excalibur (can’t equip)')
    page.click('.ff-member >> nth=3')
    page.click('.ff-magic-row .ff-toggle:text-is("Fire")')        # forget Fire, then level 1 has room for Focus
    page.click('.ff-magic-row .ff-toggle:text-is("Focus")')
    page.screenshot(path=f'{SP}/ff1gba-party.png', full_page=True)
    # items and gear
    page.click('button.tab:has-text("Items")')
    page.locator('label.field:has-text("Gil") input').fill('500000')
    page.locator('label.field:has-text("Gil") input').press('Tab')
    page.click('.ff-toggle:text-is("Levistone")')
    page.click('button.tab:has-text("Weapons and armor")')
    page.locator('label.field:has-text("Ribbon") input').fill('4')
    page.locator('label.field:has-text("Ribbon") input').press('Tab')
    page.screenshot(path=f'{SP}/ff1gba-gear.png', full_page=True)
    # review and save
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in ('Name: Brom → Kieron', 'Level: 24 → 40', 'Ailment: None → Poison', 'Weapon: Flame Sword → Excalibur',
                 'Forgot Fire', 'Learned Focus', 'Gil: 18,420 → 500,000', 'Levistone: added', 'Ribbon: 0 → 4'):
        assert line in review, (line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    dl.value.save_as(f'{SP}/ff1gba-edited.sav')
    b.close()

check = """
import { readFileSync } from 'node:fs';
import { FF1, fileOk } from './src/core/ff1gba/layout.ts';
import { Ff1GbaSave } from './src/core/ff1gba/save.ts';
import { ARMOR, WEAPONS } from './src/core/ff1gba/tables.ts';
const d = new Uint8Array(readFileSync(process.argv[1]));
const f = new Ff1GbaSave(d).files[0];
console.log(JSON.stringify({ size: d.length, ok: fileOk(d, FF1, 0), name: f.party[0].name, level: f.party[0].level,
  ailment: f.party[0].ailment, excalibur: f.party[0].gear(0) === WEAPONS.indexOf('Excalibur') + 1, gil: f.gil,
  levistone: f.hasKeyItem(11), ribbon: f.count('armor', ARMOR.indexOf('Ribbon') + 1), spells: f.party[3].spells }));
"""
out = json.loads(subprocess.run(['node', '--input-type=module', '-e', check, f'{SP}/ff1gba-edited.sav'], cwd=REPO,
                                capture_output=True, text=True, check=True).stdout)
assert out['size'] == 32768 and out['ok'], out
assert out['name'] == 'Kieron' and out['level'] == 40 and out['ailment'] == 4 and out['excalibur'] and out['gil'] == 500000, out
assert out['levistone'] and out['ribbon'] == 4, out
assert 35 in out['spells'] and 33 not in out['spells'], out   # Focus in, Fire out
print('ERRORS:', '; '.join(errors) or 'none')
