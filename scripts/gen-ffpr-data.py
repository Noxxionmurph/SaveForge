#!/usr/bin/env python3
"""Generate src/core/ffpr/data-<game>.ts from a Final Fantasy Pixel Remaster (Steam) install.

The games keep their tables as CSV text inside Unity asset bundles (master_assets_all_*.bundle) and their English text
in message_assets_all_*.bundle, both in <game>_Data/StreamingAssets/aa/StandaloneWindows64/. Needs UnityPy:

    pip install UnityPy
    python3 scripts/gen-ffpr-data.py ff1 "<path to FINAL FANTASY PR>"
    python3 scripts/gen-ffpr-data.py ff2 "<path to FINAL FANTASY II PR>"
    python3 scripts/gen-ffpr-data.py ff3 "<path to FINAL FANTASY III PR>"

The game folder may also be a folder holding just the two bundles.
"""
import csv
import glob
import io
import json
import os
import re
import sys

import UnityPy

GAME, ROOT = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'core', 'ffpr', f'data-{GAME}.ts')


def bundle(prefix):
    hits = glob.glob(os.path.join(ROOT, '**', f'{prefix}_assets_all_*.bundle'), recursive=True)
    if not hits:
        sys.exit(f'no {prefix}_assets_all_*.bundle under {ROOT}')
    return hits[0]


def texts(path):
    out = {}
    for name, obj in UnityPy.load(path).container.items():
        if obj.type.name == 'TextAsset':
            data = obj.read().m_Script
            if isinstance(data, bytes):
                data = data.decode('utf-8-sig', 'replace')
            out[name.rsplit('/', 1)[-1]] = data.lstrip('﻿')
    return out


master = texts(bundle('master'))
message = texts(bundle('message'))


def table(name):
    return list(csv.DictReader(io.StringIO(master[f'{name}.csv'])))


MSG = {}
for f in ('system_en.txt', 'etc_text_en.txt', 'story_cha_en.txt'):
    for line in message.get(f, '').splitlines():
        if '\t' in line:
            k, v = line.split('\t', 1)
            MSG.setdefault(k, v)


def text(mes_id):
    s = re.sub(r'<[^>]+>', '', MSG.get(mes_id, ''))
    return s.replace('\\n', ' ').strip()


I = int
content = table('content')
by_type = {}
for r in content:
    by_type.setdefault(r['type_id'], {})[r['type_value']] = r
# content types: 1 item, 2 weapon, 3 armor, 4 ability, 5 gil, 6 key term (FF2)
items = {r['id']: r for r in table('item')}
weapons = {r['id']: r for r in table('weapon')}
armors = {r['id']: r for r in table('armor')}
parts = {r['id']: [k for k in range(1, 7) if r.get(f'equip{k}_possible') == '1'] for r in table('parts_group')}
jobs = table('job')
job_groups = {}
for r in table('job_group'):
    mask = 0
    for k in range(1, 23):
        if r.get(f'job{k}_accept') == '1':
            mask |= 1 << (k - 1)
    job_groups[r['id']] = mask
consts = {r['key_name']: I(r['value1']) for r in table('game_constant_int')}


def name_of(r):
    return text(r['mes_id_name'])


out = {'game': GAME}
out['max'] = {
    'gil': consts.get('MAX_GIL', 999999), 'item': consts.get('MAX_ITEM', 99), 'level': consts.get('MAX_LV', 99),
    'exp': consts.get('MAX_EXP', 9999999), 'hp': consts.get('MAX_HP', 9999), 'mp': consts.get('MAX_MP', 999),
    'stat': consts.get('MAX_STRNGTH', 99),
}
out['jobs'] = [text(j['mes_id_name']) for j in jobs]
# The Job menu lists jobs in the order of their names' message numbers, which isn't id order in Final Fantasy III.
out['jobOrder'] = [I(j['id']) for j in sorted(jobs, key=lambda j: (I(re.sub(r'\D', '', j['mes_id_name']) or 0), I(j['id'])))]

# Consumables and key items (item.csv type 2 = key item), in the game's own sort order.
consumables, key_items = [], []
for tv, c in sorted(by_type.get('1', {}).items(), key=lambda kv: I(items[kv[0]]['sort_id'])):
    n = name_of(c)
    if not n:
        continue
    (key_items if items[tv]['type_id'] == '2' else consumables).append([I(c['id']), n])
out['items'] = consumables
out['keyItems'] = key_items

# Gear. The "Empty"/"None" entries are what the game equips in an empty slot, one per slot.
empty = {}
gear = []
for tv, c in sorted(by_type.get('2', {}).items(), key=lambda kv: I(weapons[kv[0]]['sort_id'])):
    w = weapons[tv]
    slots = parts[w['parts_group_id']]
    if w['category_type'] == '43':
        for s in slots:
            empty.setdefault(s, I(c['id']))
        continue
    gear.append({'id': I(c['id']), 'name': name_of(c), 'kind': 'weapon', 'slots': slots,
                 'jobs': job_groups.get(w['equip_job_group_id'], 0), 'twoHanded': w['two_handed_flag'] == '1'})
for tv, c in sorted(by_type.get('3', {}).items(), key=lambda kv: I(armors[kv[0]]['sort_id'])):
    a = armors[tv]
    slots = parts[a['parts_group_id']]
    n = name_of(c)
    if n == 'None':
        for s in slots:
            if s >= 2 or s not in empty:
                empty.setdefault(s, I(c['id']))
        continue
    gear.append({'id': I(c['id']), 'name': n, 'kind': 'armor', 'slots': slots, 'jobs': job_groups.get(a['equip_job_group_id'], 0)})
out['gear'] = [[g['id'], g['name'], 0 if g['kind'] == 'weapon' else 1, sum(1 << (s - 1) for s in g['slots']), g['jobs'],
                1 if g.get('twoHanded') else 0] for g in gear]
out['empty'] = [empty.get(s, 0) for s in range(1, 6)]

# Starting numbers per character status id; the save stores growth on top of these.
base = {}
for r in table('character_status'):
    base[I(r['id'])] = [I(r[k]) for k in ('hp', 'mp', 'strength', 'vitality', 'agility', 'intelligence', 'spirit', 'magic', 'luck')] + \
                       [I(r[f'magical_times{k}']) for k in range(1, 9)]
out['base'] = base

exp = sorted((r for r in table('exp_table') if r['type_id'] == '1' and r['group_id'] == '1'), key=lambda r: I(r['lv']))
out['exp'] = [I(r['total_exp']) for r in exp]
job_exp = sorted((r for r in table('exp_table') if r['type_id'] == '101' and r['group_id'] == '1'), key=lambda r: I(r['lv']))
if job_exp:
    out['jobExp'] = [I(r['total_exp']) for r in job_exp]

# Lasting ailments (the ones the game keeps after a battle, until_type 3). Unnamed ones are named by their kind; Final
# Fantasy II's poison is kind 204 (it shares the poison icon), and its two other lasting kinds (205, 406) aren't offered.
KIND = {5: 'KO', 6: 'Silence', 9: 'Blind', 10: 'Poison', 204: 'Poison', 11: 'Stone', 401: 'Mini', 402: 'Toad'}
conds = []
for r in table('condition'):
    kind = I(r['condition_type'])
    if r['system_type'] == '1' and r['until_type'] == '3' and kind in KIND:
        conds.append([I(r['id']), KIND[kind]])
out['conditions'] = conds

abilities = {r['id']: r for r in table('ability')}
spells = []
for tv, c in by_type.get('4', {}).items():
    a = abilities.get(tv)
    if not a or a['type_id'] not in ('1', '2') or a['ability_lv'] == '0' and GAME != 'ff2':
        continue
    spells.append([I(tv), I(c['id']), name_of(c), I(a['ability_lv']), job_groups.get(a['use_job_group_id'], 0),
                   1 if a['type_id'] == '1' else 2])
if GAME == 'ff1':
    out['spells'] = sorted(spells, key=lambda s: (s[3], s[5], I(abilities[str(s[0])]['sort_id'])))
if GAME == 'ff2':
    # Each FF2 spell is 16 abilities in a row, one per spell level (use_value = level).
    groups = []
    for tv, c in sorted(by_type.get('4', {}).items(), key=lambda kv: I(kv[0])):
        a = abilities.get(tv)
        if a and a['type_id'] in ('1', '2') and a['use_value'] == '1' and name_of(c):
            groups.append([I(tv), I(c['id']), name_of(c)])
    out['spellGroups'] = groups
    out['keyTerms'] = [[I(c['id']), name_of(c)] for tv, c in sorted(by_type.get('6', {}).items(), key=lambda kv: I(kv[0]))]

header = (f'// Generated by scripts/gen-ffpr-data.py from the Steam game\'s own tables. Do not edit by hand.\n'
          f'// Final Fantasy{"" if GAME == "ff1" else " " + "I" * int(GAME[2])} Pixel Remaster: names, starting stats, level tables.\n\n'
          "import type { PrData } from './data.ts';\n\n")
body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(header + f'export const DATA: PrData = {body};\n')
print('wrote', os.path.relpath(OUT), len(body), 'chars')
