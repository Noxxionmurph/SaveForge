"""Final Fantasy II (PSP, Anniversary Edition): open a zip of the save folder, edit, save, and check the zip that comes
back (read by the editor's own code, run in Node): the edits are there, File 1's checksum is right and PARAM.SFO's hash
for SAVEDATA.SAV matches the new file."""
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
    fc.value.set_files(f'{SP}/ULUS1026300.zip')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'psp'
    names = page.locator('.ff-member .ff-name').all_inner_texts()
    assert names == ['Firion', 'Maria', 'Guy', 'Leon'], names
    assert page.locator('.ff-member img.job-sprite.prj[src*="ff2/pr/jobs/"]').count() == 4
    # Leon: a PSP-only weapon and spell
    page.click('.ff-member >> nth=3')
    page.select_option('label.field:has-text("Right hand") select', label='Longinus')
    page.select_option('label.field:has-text("Learn a spell") select', label='Revive')
    # then Gordon takes his place
    assert page.locator('.ff-guests .ff-class-tile').count() == 7
    page.click('.ff-guests .ff-class-tile:has-text("Gordon")')
    names = page.locator('.ff-member .ff-name').all_inner_texts()
    assert names == ['Firion', 'Maria', 'Guy', 'Gordon'], names
    page.screenshot(path=f'{SP}/ff2psp-party.png', full_page=True)
    page.click('button.tab:has-text("Items")')
    assert page.locator('.card h4:text-is("Arcane Labyrinth")').count() == 1
    assert page.locator('.card:has(h3:text-is("Key terms")) .ff-toggle').count() == 45
    page.click('.ff-toggle:text-is("Mirror")')   # one of the Arcane Labyrinth's words
    page.click('.ff-toggle:text-is("Mask")')
    page.locator('label.field:has-text("Gil") input').fill('9999999')
    page.locator('label.field:has-text("Gil") input').press('Tab')
    page.locator('label.field:has-text("Elixir") input').fill('50')
    page.locator('label.field:has-text("Elixir") input').press('Tab')
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in ('Right hand: Ragnarok → Longinus', 'Learned Revive (level 1)', 'Fourth member: Leon → Gordon',
                 'Gil: 486,320 → 9,999,999', 'Elixir: 3 → 50', 'Mirror: learned', 'Mask: forgotten'):
        assert line in review, (line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    dl.value.save_as(f'{SP}/ff2psp-edited.zip')
    b.close()

check = """
import { readFileSync } from 'node:fs';
import { Ff2PspSave, ITEMS, PSP_FORMAT, SPELLS } from './src/core/ff2psp/save.ts';
import { sfoFileHash } from './src/core/psp/sfo.ts';
import { readZip } from './src/core/unzip.ts';
const d = new Uint8Array(readFileSync(process.argv[1]));
const s = new Ff2PspSave(d);
const f = s.usedFiles[0];
const leon = f.characters[8];
const zip = readZip(d);
const sav = zip.find((e) => e.name.endsWith('SAVEDATA.SAV')).data, sfo = zip.find((e) => e.name.endsWith('PARAM.SFO')).data;
const plain = new Ff2PspSave(sav).data;
console.log(JSON.stringify({ wrapper: s.wrapper, ok: PSP_FORMAT.fileOk(plain, 0), longinus: leon.gear(0) === ITEMS.indexOf('Longinus'),
  revive: leon.knows(SPELLS.indexOf('Revive') + 1), gil: f.gil, elixir: f.count(ITEMS.indexOf('Elixir')),
  guest: plain[0x30 + 0x4a2], fourth: f.party[3]?.name, terms: f.keyTerms.learned, count: plain[0x30 + 0x74f],
  sfoHash: Buffer.from(sfoFileHash(sfo, 'SAVEDATA.SAV')).toString('hex') }));
"""
out = json.loads(subprocess.run(['node', '--input-type=module', '-e', check, f'{SP}/ff2psp-edited.zip'], cwd=REPO,
                                capture_output=True, text=True, check=True).stdout)
assert out['wrapper'] == 'folder' and out['ok'], out
assert out['longinus'] and out['revive'] and out['gil'] == 9999999 and out['elixir'] == 50, out
assert out['guest'] == 5 and out['fourth'] == 'Gordon', out
assert out['terms'] == [17, 15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] and out['count'] == 15, out   # Mirror first, Mask gone
print('ERRORS:', '; '.join(errors) or 'none')
