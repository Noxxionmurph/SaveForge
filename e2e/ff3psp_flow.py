"""Final Fantasy III (PSP): open a zip of the save folder, edit, save, and check the zip that comes back (read by the
editor's own code, run in Node): the edits are there, PLAYDATA.BIN decrypts to a save the game takes, and PARAM.SFO's
hash for it matches the new file."""
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
    fc.value.set_files(f'{SP}/NPUH10125DATA00.zip')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'psp'
    names = page.locator('.ff-member .ff-name').all_inner_texts()
    assert names == ['Luneth', 'Arc', 'Refia', 'Ingus'], names
    assert page.locator('select[aria-label="Save slot"]').count() == 0, 'one game a PSP save'
    # Eight letters fit on the PSP.
    page.fill('input[aria-label="Name"]', 'Kie ron')
    note = page.inner_text('label.field:has(input[aria-label="Name"]) .field-hint')
    assert note == 'Saved as “Kieron”: eight letters at most, no spaces.', note
    page.fill('input[aria-label="Name"]', 'Kieron12')
    assert page.inner_text('label.field:has(input[aria-label="Name"]) .field-hint') == ''
    page.select_option('label.field:has-text("Left hand") select', label='—')
    # The PSP's menus work attack and defense out again at once, so there's no wait to mention.
    hint = page.inner_text('.card:has(h3:text-is("Equipped")) p.field-hint:last-child')
    assert hint == 'Worn gear isn’t in the bag, so what you take off here is gone.', hint
    page.click('.ff-member >> nth=1')
    page.click('button.ff-toggle:text-is("Poison")')
    page.click('button.ff-toggle:text-is("Thunder")')
    page.screenshot(path=f'{SP}/ff3psp-party.png', full_page=True)
    page.click('button.tab:has-text("Items")')
    page.locator('label.field:has-text("Gil") input').fill('1234567')
    page.locator('label.field:has-text("Gil") input').press('Tab')
    page.click('button.ff-toggle:text-is("Ninja")')
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in ('Name: Luneth → Kieron12', 'Left hand: Leather Shield → None', 'Now Poison', 'Forgot Thunder',
                 'Gil: 4,820 → 1,234,567', 'Job menu: Ninja added'):
        assert line in review, (line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    assert dl.value.suggested_filename.endswith('.zip'), dl.value.suggested_filename
    dl.value.save_as(f'{SP}/ff3psp-edited.zip')
    b.close()

check = """
import { readFileSync } from 'node:fs';
import { plausiblePlain } from './src/core/ff3psp/container.ts';
import { Ff3PspSave } from './src/core/ff3psp/save.ts';
import { encryptSavedata } from './src/core/psp/savedata.ts';
import { sfoFileHash } from './src/core/psp/sfo.ts';
import { readZip } from './src/core/unzip.ts';
const d = new Uint8Array(readFileSync(process.argv[1]));
const s = new Ff3PspSave(d);
const f = s.usedSlots[0];
const zip = readZip(d);
const bin = zip.find((e) => e.name.endsWith('PLAYDATA.BIN')).data, sfo = zip.find((e) => e.name.endsWith('PARAM.SFO')).data;
const plain = new Ff3PspSave(bin).data;
const key = Uint8Array.from(Buffer.from('BE041579E29FC790DF308ACE331AFF6B', 'hex'));
const hash = encryptSavedata(plain, key, bin.slice(0, 16)).hash;
console.log(JSON.stringify({ wrapper: s.wrapper, plain: plausiblePlain(plain), name: f.party[0].name, left: f.party[0].gear(1),
  arc: [f.party[1].status, f.party[1].spells.length], gil: f.gil, ninja: f.jobOpen(22),
  sfo: Buffer.from(sfoFileHash(sfo, 'PLAYDATA.BIN')).equals(Buffer.from(hash)) }));
"""
out = json.loads(subprocess.run(['node', '--input-type=module', '-e', check, f'{SP}/ff3psp-edited.zip'], cwd=REPO,
                                capture_output=True, text=True, check=True).stdout)
assert out['wrapper'] == 'folder' and out['plain'] and out['sfo'], out
assert out['name'] == 'Kieron12' and out['left'] == 0 and out['arc'] == [0x40, 3], out
assert out['gil'] == 1234567 and out['ninja'], out
print('ERRORS:', '; '.join(errors) or 'none')
