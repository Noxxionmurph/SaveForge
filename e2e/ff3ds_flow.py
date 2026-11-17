"""Final Fantasy III (Nintendo DS): open a save in DeSmuME's wrapper, edit across the tabs, save, and check the file
that comes back (read by the editor's own code, run in Node): still in the wrapper, the edits are there and the slot
passes the game's check."""
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
    ports = page.inner_text('li.tile:has(.tile-name:text-is("Final Fantasy III")) .tile-platform')
    assert ports == 'Famicom · Nintendo DS · PSP', ports
    with page.expect_file_chooser() as fc:
        page.click('.slot')
    fc.value.set_files(f'{SP}/ff3-ds.dsv')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'nds'
    assert page.locator('.ff-member').all_inner_texts()[0].startswith('Luneth')
    sprites = page.eval_on_selector_all('.ff-member img.job-sprite', 'l => l.map((i) => i.getAttribute("src").replace(/^.*sprites\\//, ""))')
    assert sprites == ['ff3/pr/jobs/warrior.png', 'ff3/pr/jobs/black-mage.png', 'ff3/pr/jobs/white-mage.png', 'ff3/pr/jobs/monk.png'], sprites
    assert page.locator('dl.stats dd').all_inner_texts() == ['12', '12', '12', '10', '10'], page.locator('dl.stats dd').all_inner_texts()
    page.fill('input[aria-label="Name"]', 'Kie ro')
    note = page.inner_text('label.field:has(input[aria-label="Name"]) .field-hint')
    assert note == 'Saved as “Kiero”: six letters at most, no spaces.', note
    page.fill('input[aria-label="Name"]', 'Kieron')
    page.get_by_role('spinbutton', name='Level', exact=True).fill('20')
    page.get_by_role('spinbutton', name='Level', exact=True).press('Tab')
    page.get_by_role('spinbutton', name='Ninja (locked)', exact=True).fill('30')
    page.get_by_role('spinbutton', name='Ninja (locked)', exact=True).press('Tab')
    page.select_option('label.field:has-text("Right hand") select', label='Mythril Sword')
    page.select_option('label.field:has-text("Right hand") select', label='Bow')
    note = page.inner_text('.card:has(h3:text-is("Equipped")) p[role="status"]')
    assert note == 'Left hand emptied: Leather Shield doesn’t go with Bow.', note
    hint = page.inner_text('.card:has(h3:text-is("Equipped")) p.field-hint:last-child')
    assert 'catch up after the next battle' in hint, hint
    page.click('.ff-member >> nth=2')
    page.click('button.ff-toggle:has-text("Sight")')
    assert page.locator('button.ff-toggle:has-text("Fire")').count() == 0, 'a White Mage is offered black magic'
    page.click('button.ff-toggle:text-is("Poison")')
    page.click('button.ff-toggle:text-is("KO")')
    assert page.inner_text('.ff-member >> nth=2 >> .ff-hp') == 'KO'
    assert page.get_by_role('spinbutton', name='HP', exact=True).input_value() == '0'
    page.get_by_role('spinbutton', name='HP', exact=True).fill('40')
    page.get_by_role('spinbutton', name='HP', exact=True).press('Tab')
    assert page.get_attribute('button.ff-toggle:text-is("KO")', 'aria-pressed') == 'false', 'HP above 0 is up again'
    page.click('.ff-member >> nth=3')
    page.select_option('select[aria-label="Job"]', label='Black Mage')
    note = page.inner_text('label.field:has(select[aria-label="Job"]) .field-hint')
    assert note == 'Bronze Knuckles, Headband and Kenpo Gi went to the bag: a Black Mage can’t use them.', note
    assert page.eval_on_selector('select[aria-label="Job"] option[value="8"]', 'o => o.disabled && o.textContent') == 'Knight (locked)'
    page.screenshot(path=f'{SP}/ff3ds-party.png', full_page=True)
    page.click('button.tab:has-text("Items")')
    page.locator('label.field:has-text("Gil") input').fill('5000000')
    page.locator('label.field:has-text("Gil") input').press('Tab')
    bag = page.locator('section.card:has(h3:has-text("Bag"))')
    rows = bag.locator('.item-row').count()
    assert rows == 10, rows  # the sample's 7, the Monk's 3 kinds of gear
    bag.locator('text=+ Add item').click()
    page.fill('.pick-search', 'ribbon'); page.keyboard.press('Enter')
    page.wait_for_function("document.querySelectorAll('section.card:has(h3) .item-row').length >= 11")
    page.click('button.ff-toggle:text-is("Ninja")')
    page.screenshot(path=f'{SP}/ff3ds-items.png', full_page=True)
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in ('Name: Luneth → Kieron', 'Level: 12 → 20', 'Ninja job level: 1 → 30', 'Right hand: Longsword → Bow',
                 'Left hand: Leather Shield → None', 'Learned Sight', 'Now Poison', 'HP: 104/104 → 40/104', 'Job: Monk → Black Mage', 'Kenpo Gi: 0 → 1',
                 'Bronze Knuckles: 0 → 2', 'Gil: 4,820 → 5,000,000', 'Ribbon: 0 → 1', 'Job menu: Ninja added'):
        assert line in review, (line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    assert dl.value.suggested_filename == 'ff3-ds-edited.dsv', dl.value.suggested_filename
    dl.value.save_as(f'{SP}/ff3ds-edited.dsv')
    b.close()

check = """
import { readFileSync } from 'node:fs';
import { unwrapSave } from './src/core/container.ts';
import { slotOk } from './src/core/ff3ds/layout.ts';
import { Ff3DsSave, itemName } from './src/core/ff3ds/save.ts';
const raw = new Uint8Array(readFileSync(process.argv[1]));
const u = unwrapSave(raw);
const f = new Ff3DsSave(u.data).slots[0];
const c = f.party[0];
const count = (n) => f.bag.filter((x) => itemName(x.id) === n).reduce((a, x) => a + x.count, 0);
console.log(JSON.stringify({ size: raw.length, format: u.format, ok: slotOk(u.data, 0), name: c.name, level: c.level, ninja: c.jobLevel(22),
  right: itemName(c.gear(0)), left: c.gear(1), sight: f.party[2].knows(4003), gil: f.gil, ribbon: count('Ribbon'),
  ninjaOpen: f.jobOpen(22), refia: [f.party[2].hp, f.party[2].status], ingus: f.party[3].jobName, kenpo: count('Kenpo Gi'), knuckles: count('Bronze Knuckles') }));
"""
out = json.loads(subprocess.run(['node', '--input-type=module', '-e', check, f'{SP}/ff3ds-edited.dsv'], cwd=REPO,
                                capture_output=True, text=True, check=True).stdout)
assert out['size'] == 65536 + 122 and out['format'] == 'DeSmuME' and out['ok'], out
assert out['name'] == 'Kieron' and out['level'] == 20 and out['ninja'] == 30 and out['right'] == 'Bow' and out['left'] == 0, out
assert out['sight'] and out['gil'] == 5000000 and out['ribbon'] == 1 and out['ninjaOpen'] and out['refia'] == [40, 0x40], out
assert out['ingus'] == 'Black Mage' and out['kenpo'] == 1 and out['knuckles'] == 2, out
print('ERRORS:', '; '.join(errors) or 'none')
