// Final Fantasy II (Dawn of Souls, GBA) editor UI. Loaded lazily by the shell via the game module.

import {
  BAG_SIZE, EMPTY_HAND, GEAR_CHOICES, GEAR_SLOTS, KIND, MAX_GIL, MAX_HP, MAX_ITEM, MAX_MP, MAX_SKILL, MAX_STAT, NAME_LENGTH,
  SPELL_SLOTS, STAT_KEYS, STAT_LABELS, WEAPON_SKILLS, asSaved, formatPlayTime,
  type Ff2GbaChar, type Ff2GbaFile, type Ff2GbaSave,
} from '../../../core/ff2gba/save.ts';
import { ITEMS, SPELLS } from '../../../core/ff2gba/tables.ts';
import type { MountEditor } from '../../../core/types.ts';
import { clear, field, h, numberInput, selectInput, textInput } from '../../dom.ts';
import { ff2Portrait } from '../../sprites.ts';
import { tabBar, tabPanel } from '../../tabs.ts';

type Tab = 'party' | 'items' | 'gear';
const TABS: { id: Tab; label: string }[] = [
  { id: 'party', label: 'Party' },
  { id: 'items', label: 'Items' },
  { id: 'gear', label: 'Weapons, armor and books' },
];

export const mountFf2GbaEditor: MountEditor<Ff2GbaSave> = (container, s, host) => {
  let tab: Tab = 'party';
  let file: Ff2GbaFile = s.usedFiles[0];
  let who = 0;
  const markDirty = () => host.markDirty();

  const render = () => {
    clear(container);
    const used = s.usedFiles;
    if (who >= file.party.length) who = 0;
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

  function partyWindow(onPick: () => void): { node: HTMLElement; paint: () => void } {
    const node = h('div', { class: 'lcd ff-party', role: 'group', 'aria-label': 'Party' });
    const paint = () => {
      clear(node);
      node.append(...file.party.map((c, i) => h('button', {
        class: i === who ? 'ff-member on' : 'ff-member', 'aria-pressed': String(i === who),
        'aria-label': `${c.name || `Character ${i + 1}`}. Edit`,
        onclick: () => { who = i; onPick(); },
      },
      ff2Portrait(c.portrait),
      h('span', { class: 'ff-name' }, c.name || '—'),
      h('span', { class: 'ff-hp' }, `HP ${c.hp}/${c.maxHp}`),
      h('span', { class: 'ff-class' }, `MP ${c.mp}/${c.maxMp}`))));
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

  function characterSheet(c: Ff2GbaChar, repaint: () => void): Node[] {
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
      h('div', { class: 'grid' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name, nameNote)),
      h('div', { class: 'grid pair' },
        field('HP', numberInput(c.hp, 0, MAX_HP, (v) => { c.hp = v; edited(); })),
        field('Max HP', numberInput(c.maxHp, 1, MAX_HP, (v) => { c.maxHp = v; edited(); })),
        field('MP', numberInput(c.mp, 0, MAX_MP, (v) => { c.mp = v; edited(); })),
        field('Max MP', numberInput(c.maxMp, 0, MAX_MP, (v) => { c.maxMp = v; edited(); })),
      ),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Stats'),
        h('div', { class: 'grid compact' },
          STAT_KEYS.map((k) => field(STAT_LABELS[k], numberInput(c.stat(k), 1, MAX_STAT, (v) => { c.setStat(k, v); markDirty(); }))))),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Weapon skills'),
        h('div', { class: 'grid compact' },
          WEAPON_SKILLS.map((n, i) => field(n, numberInput(c.skill(i).level, 1, MAX_SKILL, (v) => { c.setSkillLevel(i, v); markDirty(); }))))),
      h('div', { class: 'button-row' },
        h('button', { onclick: () => { c.restore(); redraw(); } }, 'Restore HP and MP')),
    );
    return [basics, gearCard(c, redraw), magicCard(c, redraw)];
  }

  function gearCard(c: Ff2GbaChar, redraw: () => void): Node {
    const rows = GEAR_SLOTS.map((slot, g) => {
      const current = c.gear(g);
      const ids = GEAR_CHOICES[g].includes(current) || c.isEmpty(g) ? GEAR_CHOICES[g] : [current, ...GEAR_CHOICES[g]];
      const options = [{ value: g < 2 ? EMPTY_HAND : 0, label: '—' }, ...ids.map((id) => ({ value: id, label: ITEMS[id] || `Item ${id}` }))];
      return field(slot, selectInput(options, current, (v) => { c.setGear(g, Number(v)); redraw(); }));
    });
    return h('section', { class: 'card' },
      h('h3', {}, 'Equipped'),
      h('div', { class: 'grid' }, rows),
      h('p', { class: 'field-hint' }, 'Worn gear isn’t in the bag, so what you take off here is gone. Add it on the Weapons, armor and books tab if you want to keep it.'));
  }

  function magicCard(c: Ff2GbaChar, redraw: () => void): Node {
    const known = c.spells;
    const rows = known.map((sp) => h('div', { class: 'ff-spell-row' },
      field(SPELLS[sp.id - 1], numberInput(sp.level, 1, MAX_SKILL, (v) => { c.setSpellLevel(sp.id, v); markDirty(); })),
      h('button', { class: 'ff-forget', 'aria-label': `Forget ${SPELLS[sp.id - 1]}`, onclick: () => { c.forget(sp.id); redraw(); } }, 'Forget')));
    const unknown = SPELLS.map((n, i) => ({ value: i + 1, label: n })).filter((o) => !c.knows(o.value));
    const add = known.length < SPELL_SLOTS && unknown.length
      ? field('Learn a spell', selectInput([{ value: 0, label: 'Pick a spell…' }, ...unknown], 0, (v) => { if (Number(v)) { c.learn(Number(v)); redraw(); } }))
      : null;
    return h('section', { class: 'card' },
      h('h3', {}, 'Magic'),
      h('p', { class: 'muted card-note' }, `Up to ${SPELL_SLOTS} spells, each at level 1 to ${MAX_SKILL}.`),
      h('div', { class: 'ff2-spells' }, rows),
      ...(add ? [add] : []));
  }

  // ---------- items ----------

  function itemsTab(): Node {
    const keyItems = file.bag.filter((x) => x.id < KIND.item[0] || x.id >= 0xc0);
    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h3', {}, 'Gil and items'),
        h('div', { class: 'grid' }, field('Gil', numberInput(file.gil, 0, MAX_GIL, (v) => { file.gil = v; markDirty(); }))),
        countGrid(KIND.item),
        h('div', { class: 'button-row' },
          h('button', { onclick: () => { file.gil = MAX_GIL; KIND.item.forEach((id) => { if (ITEMS[id] && (file.count(id) || !file.bagFull)) file.setCount(id, MAX_ITEM); }); markDirty(); render(); } }, 'Max gil and items'))),
      keyItems.length
        ? h('section', { class: 'card' }, h('h3', {}, 'Key items'), h('p', {}, keyItems.map((x) => ITEMS[x.id]).join(', ')),
          h('p', { class: 'field-hint' }, 'Key items move the story on, so they can’t be changed here.'))
        : h('span'));
  }

  function gearTab(): Node {
    return h('div', { class: 'stack' },
      h('section', { class: 'card' }, h('h3', {}, 'Weapons'), countGrid(KIND.weapon)),
      h('section', { class: 'card' }, h('h3', {}, 'Shields and armor'), countGrid([...KIND.shield, ...KIND.head, ...KIND.body, ...KIND.arms])),
      h('section', { class: 'card' }, h('h3', {}, 'Spell books'), countGrid(KIND.tome)));
  }

  function countGrid(ids: readonly number[]): Node {
    const note = h('p', { class: 'field-hint' }, file.bagFull ? `The bag holds ${BAG_SIZE} kinds of thing and is full: set something to 0 to make room.` : '');
    return h('div', {},
      h('div', { class: 'grid compact' }, ids.filter((id) => ITEMS[id]).map((id) =>
        field(ITEMS[id], numberInput(file.count(id), 0, MAX_ITEM, (v) => { file.setCount(id, v); markDirty(); })))),
      note);
  }

  render();
};
