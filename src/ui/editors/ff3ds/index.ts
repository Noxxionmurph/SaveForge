// Final Fantasy III (Nintendo DS) editor UI. Loaded lazily by the shell via the game module.

import {
  AILMENTS, BAG_SIZE, CHOCOBO_SIZE, GEAR_SLOTS, JOBS, KO, MAX_COUNT, MAX_EXP, MAX_GIL, MAX_HP, MAX_LEVEL, STAT_KEYS, STAT_LABELS,
  STORABLE, SPELLS_PER_LEVEL, canEquip, isArrow, isSpell, itemName, spellLevel, spellSchool, spellsOfLevel,
  type Ff3DsChar, type Ff3DsSave, type Ff3DsSlot,
} from '../../../core/ff3ds/save.ts';
import { NAME_LENGTH, asSaved } from '../../../core/ff3ds/text.ts';
import type { MountEditor } from '../../../core/types.ts';
import { clear, field, h, numberInput, selectInput, textInput } from '../../dom.ts';
import { itemList } from '../../itemList.ts';
import { ff3DsJobSprite } from '../../sprites.ts';
import { tabBar, tabPanel } from '../../tabs.ts';

type Tab = 'party' | 'items';
const TABS: { id: Tab; label: string }[] = [
  { id: 'party', label: 'Party' },
  { id: 'items', label: 'Items' },
];

/** What the bag and the Fat Chocobo can hold, in the game's order (items, weapons, armor, then spells). */
const label = (id: number) => (isSpell(id) ? `${itemName(id)} (${spellSchool(id)} ${spellLevel(id)})` : itemName(id));
const STORE_OPTIONS = STORABLE.map((id) => ({ value: id, label: label(id) }));
const STAT_SHORT = { str: 'Str', vit: 'Vit', agi: 'Agi', int: 'Int', mnd: 'Mnd' } as const;
const listed = (names: string[]) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export const mountFf3DsEditor: MountEditor<Ff3DsSave> = (container, s, host) => {
  let tab: Tab = 'party';
  let slot: Ff3DsSlot = s.usedSlots[0];
  let who = 0;
  /** A line about what the last change did besides the obvious, shown once on the next render. */
  let notice: { where: 'job' | 'gear'; text: string } | null = null;
  const markDirty = () => host.markDirty();
  const nameOf = (c: Ff3DsChar) => c.name || `Character ${c.index + 1}`;

  const render = () => {
    clear(container);
    const used = s.usedSlots;
    container.append(...[
      used.length > 1
        ? h('div', { class: 'grid' }, field('Save slot', selectInput(
          used.map((x) => ({ value: x.index, label: `${x.label}: ${x.party[0].name || '—'} · ${x.gil.toLocaleString('en-US')} gil` })),
          slot.index, (v) => { slot = s.slots[Number(v)]; render(); })))
        : null,
      tabBar(TABS, tab, (id) => { tab = id; render(); }),
      tabPanel(TABS, tab, tab === 'party' ? partyTab() : itemsTab()),
    ].filter((n): n is HTMLElement => n !== null));
  };

  // ---------- party ----------

  /** The four party windows of the game's main menu: name, job, level and HP. Tap one to edit that character. */
  function partyWindow(onPick: () => void): { node: HTMLElement; paint: () => void } {
    const node = h('div', { class: 'lcd ff-party', role: 'group', 'aria-label': 'Party' });
    const paint = () => {
      clear(node);
      node.append(...slot.party.map((c, i) => h('button', {
        class: i === who ? 'ff-member on' : 'ff-member', 'aria-pressed': String(i === who),
        'aria-label': `${nameOf(c)}, ${c.jobName}, level ${c.level}. Edit`,
        onclick: () => { who = i; onPick(); },
      },
      ff3DsJobSprite(c.job, c.hero, c.has(KO) ? 'fallen' : ''),
      h('span', { class: 'ff-name' }, c.name || '—'),
      h('span', { class: 'ff-class' }, c.jobName),
      h('span', { class: 'ff-lv' }, `L${c.level}`),
      h('span', { class: 'ff-hp' }, c.has(KO) ? 'KO' : `HP ${c.hp}/${c.maxHp}`))));
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

  function toggle(text: string, on: boolean, set: (on: boolean) => void, after?: () => void): HTMLButtonElement {
    const btn = h('button', { class: 'ff-toggle', 'aria-pressed': String(on) }, text);
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('aria-pressed') !== 'true';
      set(next);
      btn.setAttribute('aria-pressed', String(next));
      markDirty();
      after?.();
    });
    return btn;
  }

  function characterSheet(c: Ff3DsChar, repaint: () => void): Node[] {
    const edited = () => { markDirty(); repaint(); };
    const redraw = () => { markDirty(); render(); };
    const shown = notice;
    notice = null;
    const nameNote = h('span', { class: 'field-hint' });
    const name = textInput(c.name, NAME_LENGTH, (v) => {
      c.name = v;
      nameNote.textContent = asSaved(v) !== v.trimEnd() ? `Saved as “${asSaved(v)}”: six letters at most, no spaces.` : '';
      edited();
    }, { 'aria-label': 'Name' });
    const locked = JOBS.some((_, j) => !slot.jobOpen(j));

    const basics = h('section', { class: 'card' },
      h('h3', {}, `${nameOf(c)} · ${c.jobName}`),
      h('div', { class: 'grid' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name, nameNote),
        field('Job', jobSelect(c, redraw), shown?.where === 'job' ? shown.text : locked ? 'Locked jobs open on the Items tab.' : undefined)),
      h('div', { class: 'grid pair' },
        field('Level', numberInput(c.level, 1, MAX_LEVEL, (v) => { c.level = v; redraw(); })),
        field('Exp', numberInput(c.exp, 0, MAX_EXP, (v) => { c.exp = v; redraw(); })),
        field('HP', numberInput(c.hp, 0, MAX_HP, (v) => { c.hp = v; redraw(); })),
        field('Max HP', numberInput(c.maxHp, 1, MAX_HP, (v) => { c.maxHp = v; redraw(); })),
      ),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Stats'),
        h('dl', { class: 'lcd stats', 'aria-label': 'Stats with gear' },
          STAT_KEYS.map((k) => h('div', { title: `${STAT_LABELS[k]}: ${c.stat(k)} without gear` }, h('dt', {}, STAT_SHORT[k]), h('dd', {}, String(c.wornStat(k)))))),
        h('p', { class: 'field-hint' }, 'With gear. The game sets them from the job and level.')),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Status'),
        h('div', { class: 'ff-toggles' }, AILMENTS.map(([bit, n]) => toggle(n, c.has(bit), (on) => c.setAilment(bit, on), redraw)))),
      h('div', { class: 'button-row' },
        h('button', { onclick: () => { c.restore(); redraw(); } }, 'Restore HP, MP and status')),
    );
    return [basics, jobCard(c), gearCard(c, redraw, shown?.where === 'gear' ? shown.text : ''), magicCard(c, redraw)]
      .filter((n): n is Node => n !== null);
  }

  /** The Job menu's choice: the jobs it offers. Gear the new job can't use goes to the bag. */
  function jobSelect(c: Ff3DsChar, redraw: () => void): HTMLSelectElement {
    const sel = h('select', {
      'aria-label': 'Job',
      onchange: () => {
        const moved = c.changeJob(Number(sel.value), slot);
        const names = [...new Set(moved.map(itemName))];
        if (moved.length) notice = { where: 'job', text: `${listed(names)} went to the bag: a ${c.jobName} can’t use ${moved.length > 1 ? 'them' : 'it'}.` };
        redraw();
      },
    }, JOBS.map((n, j) => h('option', { value: String(j), disabled: j !== c.job && !slot.jobOpen(j) }, j === c.job || slot.jobOpen(j) ? n : `${n} (locked)`)));
    sel.value = String(c.job);
    return sel;
  }

  function jobCard(c: Ff3DsChar): Node {
    return h('section', { class: 'card' },
      h('h3', {}, 'Job levels'),
      h('div', { class: 'grid compact' }, JOBS.map((n, j) => field(j === c.job ? `${n} (now)` : slot.jobOpen(j) ? n : `${n} (locked)`,
        numberInput(c.jobLevel(j), 1, MAX_LEVEL, (v) => { c.setJobLevel(j, v); markDirty(); })))));
  }

  function gearCard(c: Ff3DsChar, redraw: () => void, gearNotice: string): Node {
    const rows = GEAR_SLOTS.map((name, g) => {
      const current = c.gear(g);
      const ids = c.gearChoices(g);
      const options = [{ value: 0, label: '—' },
        ...(current && !ids.includes(current) ? [{ value: current, label: `${itemName(current)} (can’t equip)` }] : []),
        ...ids.map((id) => ({ value: id, label: itemName(id) }))];
      const pick = field(name, selectInput(options, current, (v) => {
        const other = g < 2 ? c.gear(1 - g) : 0;
        c.setGear(g, Number(v));
        if (other && !c.gear(1 - g)) notice = { where: 'gear', text: `${GEAR_SLOTS[1 - g]} emptied: ${itemName(other)} doesn’t go with ${itemName(Number(v))}.` };
        redraw();
      }));
      return g < 2 && isArrow(current)
        ? [pick, field(`${name}: arrows`, numberInput(c.gearCount(g), 1, MAX_COUNT, (v) => { c.setArrows(g, v); markDirty(); }))]
        : [pick];
    }).flat();
    return h('section', { class: 'card' },
      h('h3', {}, 'Equipped'),
      h('div', { class: 'grid' }, rows),
      gearNotice ? h('p', { class: 'field-hint', role: 'status' }, gearNotice) : null,
      h('p', { class: 'field-hint' }, 'Attack and defense in the game’s menus catch up after the next battle. Worn gear isn’t in the bag, so what you take off here is gone.'));
  }

  function magicCard(c: Ff3DsChar, redraw: () => void): Node | null {
    const levels = Array.from({ length: 8 }, (_, i) => i + 1).map((lv) => {
      const known = c.spellsAt(lv);
      const learnable = spellsOfLevel(lv).filter((id) => canEquip(c.job, id));
      if (!known.length && !learnable.length && !c.maxMp(lv)) return null;
      const full = known.length >= SPELLS_PER_LEVEL;
      return h('div', { class: 'subgroup' },
        h('h4', {}, `Level ${lv}`),
        c.maxMp(lv) ? h('div', { class: 'grid pair' },
          field(`MP (max ${c.maxMp(lv)})`, numberInput(c.mp(lv), 0, c.maxMp(lv), (v) => { c.setMp(lv, v); markDirty(); }))) : null,
        h('div', { class: 'ff-toggles' }, spellsOfLevel(lv).filter((id) => c.knows(id) || learnable.includes(id)).map((id) => {
          const on = c.knows(id);
          const btn = toggle(itemName(id), on, (yes) => { if (yes) c.learn(id); else c.forget(id); }, redraw);
          if (!on && full) btn.disabled = true;
          return btn;
        })));
    }).filter((n): n is HTMLDivElement => n !== null);
    if (!levels.length) return null;
    return h('section', { class: 'card' },
      h('h3', {}, 'Magic'),
      h('p', { class: 'muted card-note' }, `Up to ${SPELLS_PER_LEVEL} spells a level, from what a ${c.jobName} can learn.`),
      ...levels);
  }

  // ---------- items ----------

  function itemsTab(): Node {
    const list = (title: string, items: typeof slot.bag, slots: number) => itemList({
      title, items, slots, maxCount: MAX_COUNT, options: STORE_OPTIONS, nameOf: label, unique: true, markDirty,
    });
    const keys = slot.keyItems.map(itemName);
    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h3', {}, 'Gil'),
        h('div', { class: 'grid pair' }, field('Gil', numberInput(slot.gil, 0, MAX_GIL, (v) => { slot.gil = v; markDirty(); }))),
        h('div', { class: 'button-row' },
          h('button', { onclick: () => { slot.gil = MAX_GIL; markDirty(); render(); } }, 'Max gil'),
          h('button', { onclick: () => { if (slot.maxElixirs()) { markDirty(); render(); } }, disabled: slot.bag.length >= BAG_SIZE && !slot.count(5011) }, '99 Elixirs'))),
      list('Bag', slot.bag, BAG_SIZE),
      list('Fat Chocobo', slot.chocobo, CHOCOBO_SIZE),
      h('section', { class: 'card' },
        h('h3', {}, 'Jobs'),
        h('p', { class: 'muted card-note' }, 'What the Job menu offers. The Freelancer is always there.'),
        h('div', { class: 'ff-toggles' }, JOBS.map((n, j) => (j ? toggle(n, slot.jobOpen(j), (on) => slot.setJobOpen(j, on), render) : null)))),
      keys.length
        ? h('section', { class: 'card' }, h('h3', {}, 'Key items'), h('p', {}, keys.join(', ')),
          h('p', { class: 'field-hint' }, 'Key items move the story on, so they can’t be changed here.'))
        : h('span'));
  }

  render();
};
