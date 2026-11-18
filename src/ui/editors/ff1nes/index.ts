// Final Fantasy (NES) editor UI. Loaded lazily by the shell via the game module.

import {
  AILMENTS, CLASS_NAMES, MAX_EXP, MAX_GOLD, MAX_HP, MAX_ITEM, MAX_LEVEL, MAX_MP, MAX_STAT, ORB_NAMES, STAT_KEYS, SUBSTAT_KEYS,
  canEquipArmor, canEquipWeapon, canLearn, levelOpen, usesMagic, type Ff1Char, type Ff1NesSave, type Gear, type StatKey, type SubstatKey,
} from '../../../core/ff1nes/save.ts';
import { ARMOR, CONSUMABLES, KEY_ITEMS, SPELLS, WEAPONS } from '../../../core/ff1nes/tables.ts';
import { NAME_LENGTH, asSaved } from '../../../core/ff1nes/text.ts';
import type { MountEditor } from '../../../core/types.ts';
import { clear, field, h, numberInput, selectInput, textInput } from '../../dom.ts';
import { ff1ClassSprite, statusBadges } from '../../sprites.ts';
import { tabBar, tabPanel } from '../../tabs.ts';
import { classBoard, ffHpBar, statusPicker } from '../ff/menu.ts';

type Tab = 'party' | 'items' | 'world';
const TABS: { id: Tab; label: string }[] = [
  { id: 'party', label: 'Party' },
  { id: 'items', label: 'Items' },
  { id: 'world', label: 'World' },
];

const STAT_LABEL: Record<StatKey, string> = { str: 'Strength', agi: 'Agility', int: 'Intelligence', vit: 'Vitality', luck: 'Luck' };
const SUBSTAT_LABEL: Record<SubstatKey, string> = { damage: 'Damage', hit: 'Hit %', absorb: 'Absorb', evade: 'Evade %', magDef: 'Magic defense' };

export const mountFf1NesEditor: MountEditor<Ff1NesSave> = (container, s, host) => {
  let tab: Tab = 'party';
  let who = 0;
  const markDirty = () => host.markDirty();

  const render = () => {
    clear(container);
    container.append(
      tabBar(TABS, tab, (id) => { tab = id; render(); }),
      tabPanel(TABS, tab, tab === 'party' ? partyTab() : tab === 'items' ? itemsTab() : worldTab()),
    );
  };

  // ---------- party ----------

  /** The four party windows of the game's main menu: name, class, level and HP. Tap one to edit that character. */
  function partyWindow(onPick: () => void): { node: HTMLElement; paint: () => void } {
    const node = h('div', { class: 'lcd ff-party', role: 'group', 'aria-label': 'Party' });
    const paint = () => {
      clear(node);
      node.append(...s.party.map((c, i) => h('button', {
        class: i === who ? 'ff-member on' : 'ff-member', 'aria-pressed': String(i === who),
        'aria-label': `${c.name || `Character ${i + 1}`}, ${CLASS_NAMES[c.cls]}, level ${c.level}. Edit`,
        onclick: () => { who = i; onPick(); },
      },
      ff1ClassSprite(c.cls, 'nes', c.ailment === 1 ? 'fallen' : ''),
      h('span', { class: 'ff-name' }, c.name || '—', ...statusBadges(AILMENTS[c.ailment])),
      h('span', { class: 'ff-class' }, CLASS_NAMES[c.cls]),
      h('span', { class: 'ff-lv' }, `L${c.level}`),
      h('span', { class: 'ff-hp' }, c.ailment ? AILMENTS[c.ailment] : `HP ${c.hp}/${c.maxHp}`, ffHpBar(c.ailment === 1 ? 0 : c.hp, c.maxHp)))));
    };
    paint();
    return { node, paint };
  }

  function partyTab(): Node {
    const sheet = h('div', { class: 'stack' });
    const win = partyWindow(() => { win.paint(); drawSheet(); });
    const drawSheet = () => { clear(sheet); sheet.append(...characterSheet(s.party[who], win.paint).filter((n): n is Node => n !== null)); };
    drawSheet();
    return h('div', { class: 'stack' }, win.node, sheet);
  }

  function characterSheet(c: Ff1Char, repaint: () => void): (Node | null)[] {
    const edited = () => { markDirty(); repaint(); };
    const redraw = () => { edited(); render(); };
    const nameNote = h('span', { class: 'field-hint' });
    const name = textInput(c.name, NAME_LENGTH, (v) => {
      c.name = v;
      nameNote.textContent = asSaved(v) !== v.trimEnd() ? `Saved as “${asSaved(v)}”: the game has letters, numbers and ' , . - ! ? only.` : '';
      edited();
    }, { 'aria-label': 'Name' });
    const exp = numberInput(c.exp, 0, MAX_EXP, (v) => { c.setExp(v); level.value = String(c.level); edited(); });
    const level = numberInput(c.level, 1, MAX_LEVEL, (v) => { c.setLevel(v); exp.value = String(c.exp); edited(); });

    const basics = h('section', { class: 'card' },
      h('h3', { class: 'ff-sheet-title' }, ff1ClassSprite(c.cls, 'nes', c.ailment === 1 ? 'fallen' : ''), h('span', {}, c.name || `Character ${who + 1}`)),
      h('div', { class: 'grid' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name, nameNote),
        field('Level', level, 'Stats stay as they are: the game rolls them at each level up.'),
        field('Exp', exp),
      ),
      h('div', { class: 'grid pair' },
        field('HP', numberInput(c.hp, 0, MAX_HP, (v) => { c.hp = v; edited(); })),
        field('Max HP', numberInput(c.maxHp, 1, MAX_HP, (v) => { c.maxHp = v; edited(); })),
      ),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Stats'),
        h('div', { class: 'grid compact' }, STAT_KEYS.map((k) => field(STAT_LABEL[k], numberInput(c.stat(k), 1, MAX_STAT, (v) => { c.setStat(k, v); markDirty(); }))))),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Battle'),
        h('div', { class: 'grid compact' }, SUBSTAT_KEYS.map((k) => field(SUBSTAT_LABEL[k], numberInput(c.substat(k), 0, 255, (v) => { c.setSubstat(k, v); markDirty(); })))),
        h('p', { class: 'field-hint' }, 'These follow the gear you change below, as they do in the game’s equip menu.')),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Status'),
        statusPicker(AILMENTS.map((label, value) => ({ value, label })), c.ailment, (v) => { c.ailment = v; redraw(); })),
      h('div', { class: 'button-row' },
        h('button', {
          onclick: () => {
            if (c.ailment === 1 || c.ailment === 2) c.ailment = 0;
            c.hp = c.maxHp;
            for (let l = 0; l < 8; l++) c.setMp(l, c.maxMp(l));
            redraw();
          },
        }, 'Restore HP and MP')),
    );
    const classes = h('section', { class: 'card' }, h('h3', {}, 'Class'),
      classBoard(CLASS_NAMES.map((name, id) => ({ id, name })), c.cls, (id) => ff1ClassSprite(id, 'nes'), (id) => { c.cls = id; redraw(); }));
    return [basics, classes, gearCard(c, 'weapon', redraw), gearCard(c, 'armor', redraw), magicCard(c, redraw)];
  }

  function gearCard(c: Ff1Char, kind: 'weapon' | 'armor', redraw: () => void): Node {
    const names = kind === 'weapon' ? WEAPONS : ARMOR;
    const allowed = (id: number) => (kind === 'weapon' ? canEquipWeapon(c.cls, id) : canEquipArmor(c.cls, id));
    const options = [{ value: 0, label: '—' }, ...names.map((n, i) => ({ value: i + 1, label: allowed(i + 1) ? n : `${n} (can’t equip)` }))];
    const rows = [0, 1, 2, 3].map((slot) => {
      const g: Gear = kind === 'weapon' ? c.weapon(slot) : c.armor(slot);
      const label = `${kind === 'weapon' ? 'Weapon' : 'Armor'} ${slot + 1}`;
      const worn = h('input', { type: 'checkbox', checked: g.equipped, disabled: !g.id || (!allowed(g.id) && !g.equipped), 'aria-label': `Wear ${label}` });
      worn.addEventListener('change', () => { c.setGear(kind, slot, { id: g.id, equipped: worn.checked }); redraw(); });
      return h('div', { class: 'ff-gear-row' },
        selectInput(options, g.id, (v) => {
          const id = Number(v);
          c.setGear(kind, slot, { id, equipped: g.equipped && id !== 0 && allowed(id) });
          redraw();
        }, { 'aria-label': label }),
        h('label', { class: 'ff-worn' }, worn, 'Worn'));
    });
    return h('section', { class: 'card' }, h('h3', {}, kind === 'weapon' ? 'Weapons' : 'Armor'), ...rows);
  }

  function magicCard(c: Ff1Char, redraw: () => void): Node | null {
    if (!usesMagic(c.cls) && !Array.from({ length: 24 }, (_, k) => c.spell(k / 3 | 0, k % 3)).some((sp) => sp >= 0)) return null;
    const rows = Array.from({ length: 8 }, (_, lv) => {
      const known = [0, 1, 2].map((slot) => c.spell(lv, slot));
      if (!levelOpen(c.cls, lv) && known.every((sp) => sp < 0) && c.maxMp(lv) === 0) return null;
      const choices = Array.from({ length: 8 }, (_, k) => lv * 8 + k);
      const spellSelect = (slot: number) => {
        const cur = known[slot];
        const opts = [{ value: -1, label: '—' }, ...choices
          .filter((sp) => sp === cur || (canLearn(c.cls, sp) && !known.includes(sp)))
          .map((sp) => ({ value: sp, label: canLearn(c.cls, sp) ? SPELLS[sp] : `${SPELLS[sp]} (can’t learn)` }))];
        return selectInput(opts, cur, (v) => { c.setSpell(lv, slot, Number(v)); redraw(); }, { 'aria-label': `Level ${lv + 1} spell ${slot + 1}` });
      };
      return h('div', { class: 'ff-magic-row' },
        h('span', { class: 'ff-magic-lv' }, `L${lv + 1}`),
        h('div', { class: 'ff-spells' }, [0, 1, 2].map(spellSelect)),
        h('div', { class: 'ff-mp' },
          numberInput(c.mp(lv), 0, MAX_MP, (v) => { c.setMp(lv, v); markDirty(); }, { 'aria-label': `Level ${lv + 1} MP` }),
          h('span', { 'aria-hidden': 'true' }, '/'),
          numberInput(c.maxMp(lv), 0, MAX_MP, (v) => { c.setMaxMp(lv, v); markDirty(); }, { 'aria-label': `Level ${lv + 1} max MP` })));
    }).filter(Boolean);
    return h('section', { class: 'card' },
      h('h3', {}, 'Magic'),
      h('p', { class: 'muted card-note' }, 'Three spells per level. MP is charges per level, up to 9.'),
      ...rows);
  }

  // ---------- items ----------

  function itemsTab(): Node {
    const gold = numberInput(s.gold, 0, MAX_GOLD, (v) => { s.gold = v; markDirty(); });
    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h3', {}, 'Gold and items'),
        h('div', { class: 'grid' }, field('Gold', gold)),
        h('div', { class: 'grid compact' }, CONSUMABLES.map((n, i) => field(n, numberInput(s.count(i), 0, MAX_ITEM, (v) => { s.setCount(i, v); markDirty(); })))),
        h('div', { class: 'button-row' },
          h('button', { onclick: () => { s.gold = MAX_GOLD; CONSUMABLES.forEach((_, i) => s.setCount(i, MAX_ITEM)); markDirty(); render(); } }, 'Max gold and items'))),
      h('section', { class: 'card' },
        h('h3', {}, 'Key items'),
        h('div', { class: 'ff-toggles' }, KEY_ITEMS.map((n, i) => toggle(n, s.hasKeyItem(i + 1), (on) => s.setKeyItem(i + 1, on)))),
        h('p', { class: 'field-hint' }, 'Key items move the story on when you use or hand them over, so adding one can skip ahead or leave a quest stuck.')));
  }

  /** An on/off button: lit up as a game window when you have it, like the badges in the other editors. */
  function toggle(label: string, on: boolean, set: (on: boolean) => void): HTMLElement {
    const btn = h('button', { class: 'ff-toggle', 'aria-pressed': String(on) }, label);
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('aria-pressed') !== 'true';
      set(next);
      btn.setAttribute('aria-pressed', String(next));
      markDirty();
    });
    return btn;
  }

  // ---------- world ----------

  function worldTab(): Node {
    const check = (label: string, on: boolean, set: (on: boolean) => void, note?: string) => {
      const input = h('input', { type: 'checkbox', checked: on });
      input.addEventListener('change', () => { set(input.checked); markDirty(); });
      return h('label', { class: 'check-row' }, input, label, note ? h('span', { class: 'muted' }, note) : null);
    };
    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h3', {}, 'Orbs'),
        h('div', { class: 'ff-toggles' }, ORB_NAMES.map((n, i) => toggle(`${n} Orb`, s.orbLit(i), (on) => s.setOrb(i, on)))),
        h('p', { class: 'field-hint' }, 'Lit Orbs are what open the way to the end of the game.')),
      h('section', { class: 'card' },
        h('h3', {}, 'Getting around'),
        check('Ship', s.ship, (on) => { s.ship = on; }, 'waits where you last left it (Pravoka at first)'),
        check('Canoe', s.canoe, (on) => { s.canoe = on; }, 'lets you paddle rivers'),
        check('Airship raised', s.airship, (on) => { s.airship = on; }, 'waits where you last landed (the desert at first)'),
        check('Bridge north of Coneria built', s.bridge, (on) => { s.bridge = on; }),
        check('Canal dug', s.canalDug, (on) => { s.canalDug = on; })));
  }

  render();
};
