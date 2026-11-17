// Final Fantasy III (Famicom) editor UI. Loaded lazily by the shell via the game module.

import {
  AILMENTS, BAG_SIZE, CRYSTALS, GEAR_SLOTS, ITEMS, ITEM_KINDS, JOBS, KIND, MAX_COUNT, MAX_CP, MAX_EXP, MAX_GIL, MAX_HP,
  MAX_LEVEL, MAX_MP, MAX_STAT, SCHOOLS, SPELLS_PER_LEVEL, STAT_KEYS, STAT_LABELS, Ff3Slot, canEquip, isArrow, minLevel,
  spellLevel, spellsOfLevel, type Ff3Char, type Ff3NesSave,
} from '../../../core/ff3nes/save.ts';
import { NAME_LENGTH, asSaved } from '../../../core/ff3nes/text.ts';
import type { MountEditor } from '../../../core/types.ts';
import { clear, field, h, lazySelect, numberInput, selectInput, textInput } from '../../dom.ts';
import { ff3NesJobSprite } from '../../sprites.ts';
import { tabBar, tabPanel } from '../../tabs.ts';

type Tab = 'party' | 'items';
const TABS: { id: Tab; label: string }[] = [
  { id: 'party', label: 'Party' },
  { id: 'items', label: 'Items' },
];

/** What can go in the bag, in the game's own order (weapons, armor, items, then spells). */
const BAG_OPTIONS = [{ value: 0, label: '—' },
  ...ITEMS.map((n, id) => ({ value: id, label: KIND.spell.includes(id) ? `${n} (${SCHOOLS[ITEM_KINDS[id]]} ${spellLevel(id)})` : n }))
    .filter((o) => o.value && Ff3Slot.bagItem(o.value))];
const itemName = (id: number) => ITEMS[id] || `Item ${id}`;
const listed = (names: string[]) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
/** The crystal whose jobs include `job`. */
const crystalOf = (job: number) => CRYSTALS.find((c) => c.jobs.includes(job))?.name ?? '';

export const mountFf3NesEditor: MountEditor<Ff3NesSave> = (container, s, host) => {
  let tab: Tab = 'party';
  let slot: Ff3Slot = s.usedSlots[0];
  let who = 0;
  /** A line about what the last change did besides the obvious, shown once on the next render. */
  let notice: { where: 'job' | 'gear'; text: string } | null = null;
  const markDirty = () => host.markDirty();
  const nameOf = (c: Ff3Char) => c.name || `Character ${c.index + 1}`;

  const render = () => {
    clear(container);
    const used = s.usedSlots;
    container.append(...[
      used.length > 1
        ? h('div', { class: 'grid' }, field('Save slot', selectInput(
          used.map((x) => ({ value: x.number, label: `Slot ${x.number}: ${x.party[0].name || '—'} · ${x.gil.toLocaleString('en-US')} gil` })),
          slot.number, (v) => { slot = s.slots[Number(v) - 1]; render(); })))
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
      ff3NesJobSprite(c.job, i, c.has(0x80) ? 'fallen' : ''),
      h('span', { class: 'ff-name' }, c.name || '—'),
      h('span', { class: 'ff-class' }, c.jobName),
      h('span', { class: 'ff-lv' }, `L${c.level}`),
      h('span', { class: 'ff-hp' }, c.has(0x80) ? 'KO' : `HP ${c.hp}/${c.maxHp}`))));
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

  function toggle(label: string, on: boolean, set: (on: boolean) => void, after?: () => void): HTMLButtonElement {
    const btn = h('button', { class: 'ff-toggle', 'aria-pressed': String(on) }, label);
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('aria-pressed') !== 'true';
      set(next);
      btn.setAttribute('aria-pressed', String(next));
      markDirty();
      after?.();
    });
    return btn;
  }

  function characterSheet(c: Ff3Char, repaint: () => void): Node[] {
    const edited = () => { markDirty(); repaint(); };
    const redraw = () => { markDirty(); render(); };
    const shown = notice;
    notice = null;
    const nameNote = h('span', { class: 'field-hint' });
    const name = textInput(c.name, NAME_LENGTH, (v) => {
      c.name = v;
      nameNote.textContent = asSaved(v) !== v.trimEnd() ? `Saved as “${asSaved(v)}”: up to six letters, numbers or - ' ! ? fit.` : '';
      edited();
    }, { 'aria-label': 'Name' });
    const backRow = h('input', { type: 'checkbox', checked: c.backRow });
    backRow.addEventListener('change', () => { c.backRow = backRow.checked; markDirty(); });

    const basics = h('section', { class: 'card' },
      h('h3', {}, `${nameOf(c)} · ${c.jobName}`),
      h('div', { class: 'grid' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name, nameNote),
        field('Job', jobSelect(c, redraw), shown?.where === 'job' ? shown.text : undefined)),
      h('div', { class: 'grid pair' },
        field('Level', numberInput(c.level, 1, MAX_LEVEL, (v) => { c.level = v; redraw(); })),
        field('Exp', numberInput(c.exp, 0, MAX_EXP, (v) => { c.exp = v; redraw(); })),
        field('HP', numberInput(c.hp, 0, MAX_HP, (v) => { c.hp = v; redraw(); })),
        field('Max HP', numberInput(c.maxHp, 1, MAX_HP, (v) => { c.maxHp = v; redraw(); })),
      ),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Stats'),
        h('p', { class: 'field-hint' }, 'Without gear. A new job or level sets them the way the game would.'),
        h('div', { class: 'grid compact' },
          STAT_KEYS.map((k) => field(STAT_LABELS[k], numberInput(c.stat(k), 1, MAX_STAT, (v) => { c.setStat(k, v); markDirty(); }))))),
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Status'),
        h('div', { class: 'ff-toggles' }, AILMENTS.map(([bit, n]) => toggle(n, c.has(bit), (on) => c.setAilment(bit, on), redraw)))),
      h('label', { class: 'check-row' }, backRow, 'Back row'),
      h('div', { class: 'button-row' },
        h('button', { onclick: () => { c.restore(); redraw(); } }, 'Restore HP, MP and status')),
    );
    return [basics, jobCard(c), gearCard(c, redraw, shown?.where === 'gear' ? shown.text : ''), magicCard(c, redraw)]
      .filter((n): n is Node => n !== null);
  }

  /** The Job menu's choice: the jobs the crystals have handed out, from the lowest level each asks for. No capacity is
   * spent, and gear the new job can't use goes to the bag. */
  function jobSelect(c: Ff3Char, redraw: () => void): HTMLSelectElement {
    const open = slot.jobsOpen;
    const sel = h('select', {
      'aria-label': 'Job',
      onchange: () => {
        const moved = c.changeJob(Number(sel.value), slot);
        if (moved.length) notice = { where: 'job', text: `${listed(moved.map(itemName))} went to the bag: a ${c.jobName} can’t use ${moved.length > 1 ? 'them' : 'it'}.` };
        redraw();
      },
    }, JOBS.map((n, j) => {
      const why = j === c.job ? '' : !open.includes(j) ? ` (${crystalOf(j)} crystal)` : c.level < minLevel(j) ? ` (level ${minLevel(j)})` : '';
      return h('option', { value: String(j), disabled: j !== c.job && !c.canBecome(j, open) }, n + why);
    }));
    sel.value = String(c.job);
    return sel;
  }

  function jobCard(c: Ff3Char): Node {
    const open = new Set(slot.jobsOpen);
    return h('section', { class: 'card' },
      h('h3', {}, 'Job levels'),
      h('div', { class: 'grid compact' }, JOBS.map((n, j) => field(j === c.job ? `${n} (now)` : open.has(j) ? n : `${n} (locked)`,
        numberInput(c.jobLevel(j), 1, MAX_LEVEL, (v) => { c.setJobLevel(j, v); markDirty(); })))));
  }

  function gearCard(c: Ff3Char, redraw: () => void, gearNotice: string): Node {
    const rows = GEAR_SLOTS.map((label, g) => {
      const current = c.gear(g);
      const ids = c.gearChoices(g);
      const options = [{ value: 0, label: '—' },
        ...(current && !ids.includes(current) ? [{ value: current, label: `${itemName(current)} (can’t equip)` }] : []),
        ...ids.map((id) => ({ value: id, label: itemName(id) }))];
      const pick = field(label, selectInput(options, current, (v) => {
        const other = g < 2 ? c.gear(1 - g) : 0;
        c.setGear(g, Number(v));
        if (other && !c.gear(1 - g)) notice = { where: 'gear', text: `${GEAR_SLOTS[1 - g]} emptied: ${itemName(other)} doesn’t go with ${itemName(Number(v))}.` };
        redraw();
      }));
      return g < 2 && isArrow(current)
        ? [pick, field(`${label}: arrows`, numberInput(c.arrows(g), 1, MAX_COUNT, (v) => { c.setArrows(g, v); markDirty(); }))]
        : [pick];
    }).flat();
    return h('section', { class: 'card' },
      h('h3', {}, 'Equipped'),
      h('div', { class: 'grid' }, rows),
      gearNotice ? h('p', { class: 'field-hint', role: 'status' }, gearNotice) : null,
      h('p', { class: 'field-hint' }, 'Attack and defense on the status screen catch up after the next battle. Worn gear isn’t in the bag, so what you take off here is gone.'));
  }

  function magicCard(c: Ff3Char, redraw: () => void): Node | null {
    const levels = Array.from({ length: 8 }, (_, i) => i + 1).map((lv) => {
      const known = c.spellsAt(lv);
      const learnable = spellsOfLevel(lv).filter((id) => canEquip(c.job, id));
      if (!known.length && !learnable.length && !c.maxMp(lv)) return null;
      const full = known.length >= SPELLS_PER_LEVEL;
      return h('div', { class: 'subgroup' },
        h('h4', {}, `Level ${lv}`),
        h('div', { class: 'grid pair' },
          field('MP', numberInput(c.mp(lv), 0, MAX_MP, (v) => { c.setMp(lv, v); markDirty(); })),
          field('Max MP', numberInput(c.maxMp(lv), 0, MAX_MP, (v) => { c.setMaxMp(lv, v); redraw(); }))),
        h('div', { class: 'ff-toggles' }, spellsOfLevel(lv).filter((id) => c.knows(id) || learnable.includes(id)).map((id) => {
          const on = c.knows(id);
          const btn = toggle(ITEMS[id], on, (yes) => { if (yes) c.learn(id); else c.forget(id); }, redraw);
          if (!on && full) btn.disabled = true;
          return btn;
        })));
    }).filter((n): n is HTMLElement => n !== null);
    if (!levels.length) return null;
    return h('section', { class: 'card' },
      h('h3', {}, 'Magic'),
      h('p', { class: 'muted card-note' }, `Up to ${SPELLS_PER_LEVEL} spells a level, from what a ${c.jobName} can learn.`),
      ...levels);
  }

  // ---------- items ----------

  function itemsTab(): Node {
    const places = slot.bag.map(({ id, qty }, i) => {
      if (KIND.key.includes(id)) return [field(`Place ${i + 1}`, h('span', { class: 'muted' }, itemName(id))), h('span')];
      const options = id && !BAG_OPTIONS.some((o) => o.value === id) ? [{ value: id, label: itemName(id) }, ...BAG_OPTIONS] : BAG_OPTIONS;
      return [
        field(`Place ${i + 1}`, lazySelect(options, id, (v) => { slot.setAt(i, Number(v), qty || 1); markDirty(); render(); })),
        field('Count', numberInput(qty, id ? 1 : 0, id ? MAX_COUNT : 0, (v) => { slot.setAt(i, id, v); markDirty(); }, { disabled: !id })),
      ];
    }).flat();
    const keys = slot.bag.filter((x) => KIND.key.includes(x.id)).map((x) => itemName(x.id));
    const stored = slot.storedIds.map((id) => field(itemName(id), numberInput(slot.stored(id), 0, MAX_COUNT, (v) => { slot.setStored(id, v); markDirty(); if (!v) render(); })));
    const storeOptions = [{ value: 0, label: 'Give the Fat Chocobo…' }, ...BAG_OPTIONS.filter((o) => o.value && !slot.stored(o.value))];
    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h3', {}, 'Gil and capacity'),
        h('div', { class: 'grid pair' },
          field('Gil', numberInput(slot.gil, 0, MAX_GIL, (v) => { slot.gil = v; markDirty(); })),
          field('Capacity', numberInput(slot.cp, 0, MAX_CP, (v) => { slot.cp = v; markDirty(); }), 'Points spent to change jobs.')),
        h('div', { class: 'button-row' },
          h('button', { onclick: () => { slot.gil = MAX_GIL; markDirty(); render(); } }, 'Max gil'),
          h('button', { onclick: () => { slot.cp = MAX_CP; markDirty(); render(); } }, 'Max capacity'))),
      h('section', { class: 'card' },
        h('h3', {}, 'Bag'),
        h('p', { class: 'muted card-note' }, `${BAG_SIZE} places, up to ${MAX_COUNT} of a thing in each.`),
        h('div', { class: 'grid pair' }, places),
        h('div', { class: 'button-row' },
          h('button', { onclick: () => { slot.add(0xa8, MAX_COUNT); markDirty(); render(); }, disabled: !slot.free && !slot.count(0xa8) }, '99 Elixirs'))),
      h('section', { class: 'card' },
        h('h3', {}, 'Fat Chocobo'),
        h('p', { class: 'muted card-note' }, 'What he’s keeping for you.'),
        stored.length ? h('div', { class: 'grid pair' }, stored) : h('p', { class: 'muted' }, 'Nothing yet.'),
        field('Add', lazySelect(storeOptions, 0, (v) => { if (Number(v)) { slot.setStored(Number(v), 1); markDirty(); render(); } }))),
      h('section', { class: 'card' },
        h('h3', {}, 'Jobs'),
        h('p', { class: 'muted card-note' }, 'Each crystal adds jobs to the Job menu, in this order.'),
        h('div', { class: 'ff-toggles' }, CRYSTALS.map((cr, n) => toggle(`${cr.name}: ${cr.jobs.map((j) => JOBS[j]).join(', ')}`,
          slot.crystal(n), (on) => slot.setCrystal(n, on), render)))),
      keys.length
        ? h('section', { class: 'card' }, h('h3', {}, 'Key items'), h('p', {}, keys.join(', ')),
          h('p', { class: 'field-hint' }, 'Key items move the story on, so they can’t be changed here.'))
        : h('span'),
      slot.guest ? h('p', { class: 'muted' }, `Travelling with ${slot.guest}.`) : h('span'));
  }

  render();
};
