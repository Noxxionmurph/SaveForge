// Final Fantasy II (Famicom) editor UI. Loaded lazily by the shell via the game module.

import {
  EMPTY_HAND, GEAR_CHOICES, GEAR_SLOTS, GUEST_NAMES, ITEMS, KIND, MAX_GIL, MAX_HP, MAX_MP, MAX_SKILL, MAX_STAT,
  SPELLS, SPELL_SLOTS, STAT_KEYS, STAT_LABELS,
  type Ff2NesChar, type Ff2NesSave, type Ff2NesSlot,
} from '../../../core/ff2nes/save.ts';
import type { MountEditor } from '../../../core/types.ts';
import { clear, field, h, numberInput, selectInput, textInput } from '../../dom.ts';
import { ff2NesPortrait, ff2WscPortrait } from '../../sprites.ts';
import { tabBar, tabPanel } from '../../tabs.ts';

type Tab = 'party' | 'items';
const TABS: { id: Tab; label: string }[] = [
  { id: 'party', label: 'Party' },
  { id: 'items', label: 'Items' },
];

/** What can go in the bag, grouped for the pickers. */
const BAG_GROUPS: { label: string; ids: readonly number[] }[] = [
  { label: 'Items', ids: KIND.item },
  { label: 'Weapons', ids: KIND.weapon },
  { label: 'Shields', ids: KIND.shield },
  { label: 'Helmets', ids: KIND.head },
  { label: 'Armor', ids: KIND.body },
  { label: 'Gloves', ids: KIND.arms },
  { label: 'Spell books', ids: KIND.tome },
];
const BAG_OPTIONS = BAG_GROUPS.flatMap((g) => g.ids.filter((id) => ITEMS[id]).map((id) => ({ value: id, label: ITEMS[id] })));

const makeEditor = (portrait: (who: string) => HTMLImageElement): MountEditor<Ff2NesSave> => (container, s, host) => {
  const { weaponSkills: WEAPON_SKILLS, bagSize: BAG_SIZE, name: { length: NAME_LENGTH, asSaved } } = s.format;
  let tab: Tab = 'party';
  let slot: Ff2NesSlot = s.usedSlots[0];
  let who = 0;
  const markDirty = () => host.markDirty();
  const nameOf = (c: Ff2NesChar) => c.name || GUEST_NAMES[c.who] || '—';

  const render = () => {
    clear(container);
    const used = s.usedSlots;
    if (who >= slot.party.length) who = 0;
    container.append(...[
      used.length > 1
        ? h('div', { class: 'grid' }, field('Save slot', selectInput(
          used.map((x) => ({ value: x.number, label: `Slot ${x.number}: ${nameOf(x.party[0])} · ${x.gil.toLocaleString('en-US')} gil` })),
          slot.number, (v) => { slot = s.slots[Number(v) - 1]; render(); })))
        : null,
      tabBar(TABS, tab, (id) => { tab = id; render(); }),
      tabPanel(TABS, tab, tab === 'party' ? partyTab() : itemsTab()),
    ].filter((n): n is HTMLElement => n !== null));
  };

  // ---------- party ----------

  function partyWindow(onPick: () => void): { node: HTMLElement; paint: () => void } {
    const node = h('div', { class: 'lcd ff-party', role: 'group', 'aria-label': 'Party' });
    const paint = () => {
      clear(node);
      node.append(...slot.party.map((c, i) => h('button', {
        class: i === who ? 'ff-member on' : 'ff-member', 'aria-pressed': String(i === who),
        'aria-label': `${nameOf(c)}. Edit`,
        onclick: () => { who = i; onPick(); },
      },
      portrait(c.portrait),
      h('span', { class: 'ff-name' }, nameOf(c)),
      h('span', { class: 'ff-hp' }, `HP ${c.hp}/${c.maxHp}`),
      h('span', { class: 'ff-class' }, `MP ${c.mp}/${c.maxMp}`))));
    };
    paint();
    return { node, paint };
  }

  function partyTab(): Node {
    const sheet = h('div', { class: 'stack' });
    const win = partyWindow(() => { win.paint(); drawSheet(); });
    const drawSheet = () => { clear(sheet); sheet.append(...characterSheet(slot.party[who], win.paint)); };
    drawSheet();
    return h('div', { class: 'stack' }, win.node, sheet);
  }

  function characterSheet(c: Ff2NesChar, repaint: () => void): Node[] {
    const edited = () => { markDirty(); repaint(); };
    const redraw = () => { markDirty(); render(); };
    const nameNote = h('span', { class: 'field-hint' });
    const name = textInput(c.name, NAME_LENGTH, (v) => {
      c.name = v;
      nameNote.textContent = asSaved(v) !== v ? `Saved as “${asSaved(v)}”: the name screen only has the letters A to Z and a to z.` : '';
      edited();
    }, { 'aria-label': 'Name' });

    const basics = h('section', { class: 'card' },
      h('h3', {}, nameOf(c)),
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

  function gearCard(c: Ff2NesChar, redraw: () => void): Node {
    const rows = GEAR_SLOTS.map((label, g) => {
      const current = c.isEmpty(g) ? 0 : c.gear(g);
      const ids = !current || GEAR_CHOICES[g].includes(current) ? GEAR_CHOICES[g] : [current, ...GEAR_CHOICES[g]];
      const options = [{ value: 0, label: '—' }, ...ids.map((id) => ({ value: id, label: ITEMS[id] || `Item ${id}` }))];
      return field(label, selectInput(options, current, (v) => { c.setGear(g, Number(v) || (g < 2 ? EMPTY_HAND : 0)); redraw(); }));
    });
    return h('section', { class: 'card' },
      h('h3', {}, 'Equipped'),
      h('div', { class: 'grid' }, rows),
      h('p', { class: 'field-hint' }, 'Attack and defense on the status screen catch up after the next battle. Worn gear isn’t in the bag, so what you take off here is gone.'));
  }

  function magicCard(c: Ff2NesChar, redraw: () => void): Node {
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
    const bag = slot.bag;
    const places = bag.map((id, i) => {
      if (KIND.key.includes(id)) return field(`Place ${i + 1}`, h('span', { class: 'muted' }, ITEMS[id]));
      const options = [{ value: 0, label: '—' }, ...(id && !BAG_OPTIONS.some((o) => o.value === id) ? [{ value: id, label: ITEMS[id] || `Item ${id}` }] : []), ...BAG_OPTIONS];
      return field(`Place ${i + 1}`, selectInput(options, id, (v) => { slot.setAt(i, Number(v)); markDirty(); render(); }));
    });
    const keys = KIND.key.filter((k) => slot.hasKey(k)).map((k) => ITEMS[k]);
    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h3', {}, 'Gil'),
        h('div', { class: 'grid' }, field('Gil', numberInput(slot.gil, 0, MAX_GIL, (v) => { slot.gil = v; markDirty(); }))),
        h('div', { class: 'button-row' }, h('button', { onclick: () => { slot.gil = MAX_GIL; markDirty(); render(); } }, 'Max gil'))),
      h('section', { class: 'card' },
        h('h3', {}, 'Bag'),
        h('p', { class: 'muted card-note' }, `${BAG_SIZE} places, one thing in each.`),
        h('div', { class: 'grid pair' }, places),
        h('div', { class: 'button-row' },
          h('button', { onclick: () => { while (slot.free && slot.add(0x18)); markDirty(); render(); }, disabled: !slot.free }, 'Fill empty places with Elixirs'))),
      keys.length
        ? h('section', { class: 'card' }, h('h3', {}, 'Key items'), h('p', {}, keys.join(', ')),
          h('p', { class: 'field-hint' }, 'Key items move the story on, so they can’t be changed here.'))
        : h('span'));
  }

  render();
};

export const mountFf2NesEditor = makeEditor(ff2NesPortrait);
export const mountFf2WscEditor = makeEditor(ff2WscPortrait);
