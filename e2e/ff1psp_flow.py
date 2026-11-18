"""Final Fantasy (PSP): open a zipped save folder, edit across the tabs, save, and check the zip that comes back: SAVE.BIN
decrypts (by the editor's own code, run in Node) to the edits, and PARAM.SFO carries SAVE.BIN's new hash."""
import io
import json
import subprocess
import sys
import zipfile
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
    fc.value.set_files(f'{SP}/ULUS10251DATA00.zip')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'psp'
    assert page.locator('.ff-member').all_inner_texts()[0].startswith('Brom')
    # party: rename, level, swap the weapon, teach a spell
    page.fill('input[aria-label="Name"]', 'Kieron')
    page.get_by_role('spinbutton', name='Level', exact=True).fill('40')
    page.get_by_role('spinbutton', name='Level', exact=True).press('Tab')
    page.select_option('label.field:has-text("Weapon") select', label='Excalibur (can’t equip)')
    page.click('.ff-member >> nth=3')
    page.click('.ff-magic-row .ff-toggle:text-is("Fire")')        # forget Fire, then level 1 has room for Focus
    page.click('.ff-magic-row .ff-toggle:text-is("Focus")')
    page.screenshot(path=f'{SP}/ff1psp-party.png', full_page=True)
    # items and gear
    page.click('button.tab:has-text("Items")')
    page.locator('label.field:has-text("Gil") input').fill('500000')
    page.locator('label.field:has-text("Gil") input').press('Tab')
    page.click('.ff-toggle:text-is("Levistone")')
    page.click('.ff-toggle:text-is("Earth Orb")')
    assert page.get_attribute('.ff-toggle:text-is("Earth Orb")', 'aria-pressed') == 'true'
    page.click('button.tab:has-text("Weapons and armor")')
    page.locator('label.field:has-text("Ribbon") input').fill('4')
    page.locator('label.field:has-text("Ribbon") input').press('Tab')
    page.screenshot(path=f'{SP}/ff1psp-gear.png', full_page=True)
    # review and save
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in ('Name: Brom → Kieron', 'Level: 24 → 40', 'Weapon: Flame Sword → Excalibur', 'Forgot Fire', 'Learned Focus',
                 'Gil: 18,420 → 500,000', 'Levistone: added', 'Earth Orb: lit', 'Ribbon: 0 → 4'):
        assert line in review, (line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    assert dl.value.suggested_filename.endswith('.zip'), dl.value.suggested_filename
    dl.value.save_as(f'{SP}/ff1psp-edited.zip')
    b.close()

z = zipfile.ZipFile(f'{SP}/ff1psp-edited.zip')
assert sorted(z.namelist()) == ['ULUS10251DATA00/PARAM.SFO', 'ULUS10251DATA00/SAVE.BIN'], z.namelist()
check = """
import { readFileSync } from 'node:fs';
import { Ff1PspSave, ORB_NAMES } from './src/core/ff1psp/save.ts';
import { encryptSavedata, decryptSavedata } from './src/core/psp/savedata.ts';
import { sfoFileHash } from './src/core/psp/sfo.ts';
import { readZip } from './src/core/unzip.ts';
const zip = new Uint8Array(readFileSync(process.argv[1]));
const f = new Ff1PspSave(zip).files[0];
const entries = readZip(zip);
const bin = entries.find((e) => e.name.endsWith('SAVE.BIN')).data, sfo = entries.find((e) => e.name.endsWith('PARAM.SFO')).data;
const key = Uint8Array.from(Buffer.from('437BEAA762302FB7C8762C17CFF01460', 'hex'));
const { hash } = encryptSavedata(decryptSavedata(bin, key), key, bin.subarray(0, 16));
console.log(JSON.stringify({ name: f.party[0].name, level: f.party[0].level, weapon: f.party[0].gear(0), gil: f.gil,
  levistone: f.hasKeyItem(11), orbs: ORB_NAMES.filter((_, i) => f.orbLit(i)), ribbon: f.count('armor', 52), spells: f.party[3].spells,
  hashOk: Buffer.from(hash).equals(Buffer.from(sfoFileHash(sfo, 'SAVE.BIN'))) }));
"""
out = json.loads(subprocess.run(['node', '--input-type=module', '-e', check, f'{SP}/ff1psp-edited.zip'], cwd=REPO,
                                capture_output=True, text=True, check=True).stdout)
assert out['name'] == 'Kieron' and out['level'] == 40 and out['weapon'] == 39 and out['gil'] == 500000, out
assert out['levistone'] and out['ribbon'] == 4 and out['hashOk'], out
assert out['orbs'] == ['Earth'], out
assert 35 in out['spells'] and 33 not in out['spells'], out   # Focus in, Fire out
print('ERRORS:', '; '.join(errors) or 'none')
