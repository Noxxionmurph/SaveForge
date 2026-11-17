// Final Fantasy I (Dawn of Souls, GBA) editor UI. Loaded lazily by the shell via the game module.

import {
  AILMENTS, CATEGORY_NAMES, CLASS_NAMES, GEAR_SLOTS, MAX_EXP, MAX_GIL, MAX_HP, MAX_ITEM, MAX_LEVEL, MAX_MP, MAX_STAT, NAME_LENGTH,
  SPELLS_PER_LEVEL, STAT_KEYS, STAT_LABELS, armorFor, asSaved, canLearn, formatPlayTime,
  type Category, type Ff1GbaChar, type Ff1GbaFile, type Ff1GbaSave,
} from '../../../core/ff1gba/save.ts';
import { ARMOR, KEY_ITEMS, SPELLS, WEAPONS } from '../../../core/ff1gba/tables.ts';
import type { MountEditor } from '../../../core/types.ts';
import { clear, field, h, numberInput, selectInput, textInput } from '../../dom.ts';
import { ff1ClassSprite, statusBadges } from '../../sprites.ts';
import { tabBar, tabPanel } from '../../tabs.ts';

type Tab = 'party' | 'items' | 'gear';
const TABS: { id: Tab; label: string }[] = [
  { id: 'party', label: 'Party' },
  { id: 'items', label: 'Items' },
  { id: 'gear', label: 'Weapons and armor' },
];

export const mountFf1GbaEditor: MountEditor<Ff1GbaSave> = (container, s, host) => {
  let tab: Tab = 'party';
  let file: Ff1GbaFile = s.usedFiles[0];
  let who = 0;
  const markDirty = () => host.markDirty();

  const render = () => {
    clear(container);
    const used = s.usedFiles;
    container.append(...[
      used.length > 1
        ? h('div', { class: 'grid' }, field('Save file', selectInput(
          used.map((f) => ({ value: f.number, label: `File ${f.number}: ${f.party[0].name || '—'} · ${formatPlayTime(f.playTime)}` })),
          file.number, (v) => { file = s.files[Number(v) - 1]; render(); })))
        : null,
      tabBar(TABS, tab, (id) => { tab = id; render(); }),
      tabPanel(TABS, tab, tab === 'party' ? partyTab() : tab === 'items' ? itemsTab() : gearTab()),
    ].filter((n): n is HTMLElement => n !== null));
  };

  // ---------- party ----------

  /** The four party windows of the game's menu: name, class, level and HP. Tap one to edit that character. */
  function partyWindow(onPick: () => void): { node: HTMLElement; paint: () => void } {
    const node = h('div', { class: 'lcd ff-party', role: 'group', 'aria-label': 'Party' });
    const paint = () => {
      clear(node);
      node.append(...file.party.map((c, i) => h('button', {
        class: i === who ? 'ff-member on' : 'ff-member', 'aria-pressed': String(i === who),
        'aria-label': `${c.name || `Character ${i + 1}`}, ${CLASS_NAMES[c.cls]}, level ${c.level}. Edit`,
        onclick: () => { who = i; onPick(); },
      },
      ff1ClassSprite(c.cls, 'gba', c.ailment === 1 ? 'fallen' : ''),
      h('span', { class: 'ff-name' }, c.name || '—', ...statusBadges(AILMENTS.find((a) => a.bit === c.ailment)?.label)),
      h('span', { class: 'ff-class' }, CLASS_NAMES[c.cls]),
      h('span', { class: 'ff-lv' }, `Lv ${c.level}`),
      h('span', { class: 'ff-hp' }, c.ailment ? AILMENTS.find((a) => a.bit === c.ailment)!.label : `HP ${c.hp}/${c.maxHp}`))));
    };
    paint();
    return { node, paint };
  }

  function partyTab(): Node {
    const sheet = h('div', { class: 'stack' });
    const win = partyWindow(() => { win.paint(); drawSheet(); });
    const drawSheet = () => { clear(sheet); sheet.append(...characterSheet(file.party[who], win.paint)); };
    drawSheet();
    return h('div', { class: 'stack' }, win.node, sheet);
  }

  function characterSheet(c: Ff1GbaChar, repaint: () => void): Node[] {
    const edited = () => { markDirty(); repaint(); };
    const redraw = () => { markDirty(); render(); };
    const nameNote = h('span', { class: 'field-hint' });
    const name = textInput(c.name, NAME_LENGTH, (v) => {
      c.name = v;
      nameNote.textContent = asSaved(v) !== v ? `Saved as “${asSaved(v)}”: the name screen has letters, numbers and some punctuation, but no spaces.` : '';
      edited();
    }, { 'aria-label': 'Name' });

    const basics = h('section', { class: 'card' },
      h('h3', {}, c.name || `Character ${who + 1}`),
      h('div', { class: 'grid' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name, nameNote),
        field('Class', selectInput(CLASS_NAMES.map((n, i) => ({ value: i, label: n })), c.cls, (v) => { c.cls = Number(v); redraw(); })),
      ),
      h('div', { class: 'grid' },
        field('Level', numberInput(c.level, 1, MAX_LEVEL, (v) => { c.level = v; edited(); })),
        field('Exp', numberInput(c.exp, 0, MAX_EXP, (v) => { c.exp = v; markDirty(); }), 'Extra Exp turns into level ups after your next battle.'),
      ),
      h('div', { class: 'grid pair' },
        field('HP', numberInput(c.hp, 0, MAX_HP, (v) => { c.hp = v; edited(); })),
        field('Max HP', numberInput(c.maxHp, 1, MAX_HP, (v) => { c.maxHp = v; edited(); })),
        field('MP', numberInput(c.mp, 0, MAX_MP, (v) => { c.mp = v; markDirty(); })),
        field('Max MP', numberInput(c.maxMp, 0, MAX_MP, (v) => { c.maxMp = v; markDirty(); })),
      ),
      h('div', { class: 'grid' },
        field('Ailment', selectInput(AILMENTS.map((a) => ({ value: a.bit, label: a.label })), c.ailment, (v) => { c.ailment = Number(v); redraw(); }))),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Stats'),
        h('div', { class: 'grid compact' },
          STAT_KEYS.map((k) => field(STAT_LABELS[k], numberInput(c.stat(k), 1, MAX_STAT, (v) => { c.setStat(k, v); markDirty(); }))))),
      h('div', { class: 'button-row' },
        h('button', { onclick: () => { c.restore(); redraw(); } }, 'Restore HP and MP')),
    );
    const cards: Node[] = [basics, gearCard(c, redraw)];
    const magic = magicCard(c, redraw);
    if (magic) cards.push(magic);
    return cards;
  }

  function gearCard(c: Ff1GbaChar, redraw: () => void): Node {
    const rows = GEAR_SLOTS.map((slot, g) => {
      const ids = g === 0 ? WEAPONS.map((_, i) => i + 1) : armorFor(g);
      const names = g === 0 ? WEAPONS : ARMOR;
      const options = [{ value: 0, label: '—' }, ...ids.map((id) => ({ value: id, label: c.canWear(g, id) ? names[id - 1] : `${names[id - 1]} (can’t equip)` }))];
      return field(slot, selectInput(options, c.gear(g), (v) => { c.setGear(g, Number(v)); redraw(); }));
    });
    return h('section', { class: 'card' },
      h('h3', {}, 'Equipped'),
      h('div', { class: 'grid' }, rows),
      h('p', { class: 'field-hint' }, 'Worn gear isn’t in the bag, so what you take off here is gone. Add it on the Weapons and armor tab if you want to keep it.'));
  }

  function magicCard(c: Ff1GbaChar, redraw: () => void): Node | null {
    const known = c.spells;
    const learnable = (sp: number) => canLearn(c.cls, sp);
    if (!known.length && !SPELLS.some((_, i) => learnable(i + 1))) return null;
    const rows = Array.from({ length: 8 }, (_, lv) => {
      const choices = [...[1, 2, 3, 4].map((k) => lv * 4 + k), ...[1, 2, 3, 4].map((k) => 32 + lv * 4 + k)]
        .filter((sp) => learnable(sp) || known.includes(sp));
      if (!choices.length) return null;
      const full = known.filter((sp) => choices.includes(sp)).length >= SPELLS_PER_LEVEL;
      return h('div', { class: 'ff-magic-row' },
        h('span', { class: 'ff-magic-lv' }, `L${lv + 1}`),
        h('div', { class: 'ff-toggles' }, choices.map((sp) => {
          const on = known.includes(sp);
          return h('button', {
            class: 'ff-toggle', 'aria-pressed': String(on), disabled: !on && full,
            onclick: () => { if (c.setKnows(sp, !on)) redraw(); },
          }, learnable(sp) ? SPELLS[sp - 1] : `${SPELLS[sp - 1]} (can’t learn)`);
        })));
    }).filter((n): n is HTMLElement => n !== null);
    return h('section', { class: 'card' },
      h('h3', {}, 'Magic'),
      h('p', { class: 'muted card-note' }, 'Three spells per level.'),
      ...rows);
  }

  // ---------- items ----------

  function itemsTab(): Node {
    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h3', {}, 'Gil and items'),
        h('div', { class: 'grid' }, field('Gil', numberInput(file.gil, 0, MAX_GIL, (v) => { file.gil = v; markDirty(); }))),
        countGrid('item'),
        h('div', { class: 'button-row' },
          h('button', { onclick: () => { file.gil = MAX_GIL; CATEGORY_NAMES.item.forEach((_, i) => file.setCount('item', i + 1, MAX_ITEM)); markDirty(); render(); } }, 'Max gil and items'))),
      h('section', { class: 'card' },
        h('h3', {}, 'Key items'),
        h('div', { class: 'ff-toggles' }, KEY_ITEMS.map((n, i) => toggle(n, file.hasKeyItem(i + 1), (on) => file.setKeyItem(i + 1, on)))),
        h('p', { class: 'field-hint' }, 'Key items move the story on when you use or hand them over, so adding one can skip ahead or leave a quest stuck.')));
  }

  function gearTab(): Node {
    return h('div', { class: 'stack' },
      h('section', { class: 'card' }, h('h3', {}, 'Weapons'), countGrid('weapon')),
      h('section', { class: 'card' }, h('h3', {}, 'Armor'), countGrid('armor')));
  }

  function countGrid(cat: Category): Node {
    return h('div', { class: 'grid compact' }, CATEGORY_NAMES[cat].map((n, i) =>
      field(n, numberInput(file.count(cat, i + 1), 0, MAX_ITEM, (v) => { file.setCount(cat, i + 1, v); markDirty(); }))));
  }

  /** An on/off button, lit up as a game window when you have it. */
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

  render();
};
