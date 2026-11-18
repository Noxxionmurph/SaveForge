"""Final Fantasy I, II and III Pixel Remaster (Steam): open each game's slot file, edit across the tabs, save, and check the
file that comes back (read by the editor's own code, run in Node): it keeps the slot's exact name, and the edits are there."""
import json
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from lib import BASE
SP = sys.argv[1]
REPO = Path(__file__).resolve().parent.parent
SLOT = 'Rl18osV3e9kPX9SMWQj8mqShFpTUmu1lf6Mb=FVVfqk='
errors = []


def spin(page, name, value):
    box = page.get_by_role('spinbutton', name=name, exact=True)
    box.fill(str(value))
    box.press('Tab')


def save(page, game, lines):
    page.click('.save-btn')
    page.wait_for_selector('dialog.review-dialog[open]')
    review = page.inner_text('dialog.review-dialog')
    for line in lines:
        assert line in review, (game, line, review)
    with page.expect_download() as dl:
        page.click('dialog.review-dialog button.primary')
    assert dl.value.suggested_filename == SLOT, dl.value.suggested_filename
    Path(f'{SP}/pr-out/{game}').mkdir(parents=True, exist_ok=True)
    dl.value.save_as(f'{SP}/pr-out/{game}/{SLOT}')
    steps = page.inner_text('dialog.saved-dialog')
    assert 'My Games' in steps and 'no extension' in steps, steps
    page.click('dialog.saved-dialog button.primary')


def open_slot(page, game):
    page.goto(BASE)
    with page.expect_file_chooser() as fc:
        page.click('.slot')
    fc.value.set_files(f'{SP}/pr/{game}/{SLOT}')
    page.wait_for_selector('.ff-party')
    assert page.get_attribute('html', 'data-console') == 'pr'


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 390, 'height': 860}, accept_downloads=True)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
    page.goto(BASE)
    for tile, ports in (('Final Fantasy', 'NES · GBA · PSP · WonderSwan Color · Steam'), ('Final Fantasy II', 'GBA · Famicom · PSP · WonderSwan Color · Steam'),
                        ('Final Fantasy III', 'Famicom · Nintendo DS · PSP · Steam')):
        got = page.inner_text(f'li.tile:has(.tile-name:text-is("{tile}")) .tile-platform')
        assert got == ports, (tile, got)

    # ---- Final Fantasy I ----
    open_slot(page, 'ff1')
    assert page.inner_text('h1.game-name') == 'Final Fantasy (Pixel Remaster)'
    sprites = page.eval_on_selector_all('.ff-member img.job-sprite', 'l => l.map((i) => i.getAttribute("src").replace(/^.*sprites\\//, ""))')
    assert sprites == ['ff1/pr/jobs/warrior.png', 'ff1/pr/jobs/thief.png', 'ff1/pr/jobs/white-mage.png', 'ff1/pr/jobs/black-mage.png'], sprites
    page.fill('input[aria-label="Name"]', 'Kieron')
    spin(page, 'Level', 30)
    spin(page, 'Max HP', 700)
    spin(page, 'Strength', 60)
    page.click('.ff-class-tile:has-text("Knight")')
    page.select_option('label.field:has-text("Weapon") select', label='Excalibur')
    page.click('.ff-member >> nth=2')
    spin(page, 'Level 1 max', 9)
    page.click('button.ff-toggle:has-text("Poison")')
    page.screenshot(path=f'{SP}/ffpr-ff1-party.png', full_page=True)
    page.click('button.tab:has-text("Items")')
    spin(page, 'Gil', 999999)
    spin(page, 'Elixir', 20)
    page.click('button.ff-toggle:text-is("Levistone")')
    page.click('button.ff-toggle:text-is("Wind Orb")')
    page.click('button.tab:has-text("Weapons and armor")')
    spin(page, 'Masamune', 2)
    save(page, 'ff1', ['Name: Brom → Kieron', 'Class: Warrior → Knight', 'Level: 18 → 30', 'Weapon: Saber → Excalibur', 'Strength: 31 → 60',
                       'Level 1 charges: 4/4 → 4/9', 'Now poison', 'Gil: 18,420 → 999,999', 'Elixir: 0 → 20', 'Masamune: 0 → 2',
                       'Got Levistone', 'Wind Orb lit'])

    # ---- Final Fantasy II ----
    open_slot(page, 'ff2')
    assert page.inner_text('h1.game-name') == 'Final Fantasy II (Pixel Remaster)'
    sprites = page.eval_on_selector_all('.ff-member img.job-sprite', 'l => l.map((i) => i.getAttribute("src").replace(/^.*sprites\\//, ""))')
    assert sprites == ['ff2/pr/jobs/firion.png', 'ff2/pr/jobs/maria.png', 'ff2/pr/jobs/guy.png', 'ff2/pr/jobs/minwu.png'], sprites
    spin(page, 'Sword', 16)
    spin(page, 'Max MP', 300)
    spin(page, 'Fire', 10)
    page.click('button[aria-label="Forget Cure"]')
    page.select_option('select[aria-label="Learn a spell"]', label='Flare')
    page.screenshot(path=f'{SP}/ffpr-ff2-party.png', full_page=True)
    page.click('button.tab:has-text("Items")')
    page.click('button.ff-toggle:text-is("Ultima Tome")')
    save(page, 'ff2', ['Sword: 7 → 16', 'MP: 38/38 → 38/300', 'Fire: Lv 2 → Lv 10', 'Forgot Cure', 'Learned Flare (Lv 1)', 'Learned “Ultima Tome”'])

    # ---- Final Fantasy III ----
    open_slot(page, 'ff3')
    assert page.inner_text('h1.game-name') == 'Final Fantasy III (Pixel Remaster)'
    sprites = page.eval_on_selector_all('.ff-member img.job-sprite', 'l => l.map((i) => i.getAttribute("src").replace(/^.*sprites\\//, ""))')
    assert sprites == ['ff3/pr/jobs/warrior.png', 'ff3/pr/jobs/monk.png', 'ff3/pr/jobs/white-mage.png', 'ff3/pr/jobs/black-mage.png'], sprites
    assert 'KO' in page.eval_on_selector('.ff-member >> nth=3', 'm => [...m.querySelectorAll("img.status-badge")].map((i) => i.alt).join(",")')
    page.select_option('select[aria-label="Job"]', label='Black Mage')
    note = page.inner_text('label.field:has(select[aria-label="Job"]) .field-hint')
    assert 'went to the bag' in note and 'Longsword' in note, note
    spin(page, 'Black Mage (now)', 25)
    page.screenshot(path=f'{SP}/ffpr-ff3-party.png', full_page=True)
    page.click('button.tab:has-text("Items")')
    page.click('button.ff-toggle:text-is("Ninja")')
    page.screenshot(path=f'{SP}/ffpr-ff3-items.png', full_page=True)
    save(page, 'ff3', ['Job: Warrior → Black Mage', 'Black Mage level: 1 → 25', 'Longsword: 0 → 1', 'Ninja handed out'])
    b.close()

check = """
import { readFileSync } from 'node:fs';
import { PrSave } from './src/core/ffpr/save.ts';
const out = {};
for (const g of ['ff1', 'ff2', 'ff3']) {
  const { DATA } = await import(`./src/core/ffpr/data-${g}.ts`);
  const s = new PrSave(new Uint8Array(readFileSync(`${process.argv[1]}/${g}/""" + SLOT + """`)), DATA);
  const c = s.members[0];
  const name = (id) => DATA.gear.find((x) => x[0] === id)?.[1];
  out[g] = { name: c.name, job: c.jobName, level: c.level, maxHp: c.maxHp, gil: s.gil, weapon: name(c.gear(1)),
    sword: c.skillLevel(0), spells: c.spells.map(([i, lv]) => `${DATA.spellGroups?.[i]?.[2]} ${lv}`), bm: c.jobLevel(7) };
}
console.log(JSON.stringify(out));
"""
out = json.loads(subprocess.run(['node', '--input-type=module', '-e', check, f'{SP}/pr-out'], cwd=REPO,
                                capture_output=True, text=True, check=True).stdout)
assert out['ff1']['name'] == 'Kieron' and out['ff1']['job'] == 'Knight' and out['ff1']['level'] == 30 and out['ff1']['maxHp'] == 700, out
assert out['ff1']['gil'] == 999999 and out['ff1']['weapon'] == 'Excalibur', out
assert out['ff2']['sword'] == 16 and out['ff2']['spells'] == ['Fire 10', 'Flare 1'], out
assert out['ff3']['job'] == 'Black Mage' and out['ff3']['bm'] == 25, out
print('ERRORS:', '; '.join(errors) or 'none')
