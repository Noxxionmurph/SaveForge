// Final Fantasy I, II and III Pixel Remaster (Steam) editor UI, one page for all three: what differs (Final Fantasy I's
// classes, spell charges and Orbs; II's weapon skills, spell levels and key terms; III's jobs) comes from the save's
// game. Loaded lazily by the shell via the game modules.

import {
  ARROW_STACK, FF1_MAX_CHARGES, FF2_SKILLS, FF2_SKILL_MAX, FF2_SPELL_SLOTS, NAME_LENGTH, ORB_NAMES, SLOT_NAMES, SLOT_ORDER, STATS,
  type PrChar, type PrSave,
} from '../../../core/ffpr/save.ts';
import type { MountEditor } from '../../../core/types.ts';
import { clear, field, h, numberInput, selectInput, textInput } from '../../dom.ts';
import { ff1ClassSprite, ff2Portrait, ff3JobSpriteByName, statusBadges, statusIcon } from '../../sprites.ts';
import { tabBar, tabPanel } from '../../tabs.ts';
import { classBoard, ffHpBar, ffMpBar, jobBoard } from '../ff/menu.ts';

type Tab = 'party' | 'items' | 'gear';
const TABS: { id: Tab; label: string }[] = [
  { id: 'party', label: 'Party' },
  { id: 'items', label: 'Items' },
  { id: 'gear', label: 'Weapons and armor' },
];

export const mountPrEditor: MountEditor<PrSave> = (container, s, host) => {
  const d = s.data;
  const game = d.game;
  const gearName = (id: number) => s.gearInfo(id)?.[1] ?? `#${id}`;
  let tab: Tab = 'party';
  let who = Math.max(0, s.party.findIndex((c) => c !== null));
  let notice = '';
  const markDirty = () => host.markDirty();

  const render = () => {
    clear(container);
    container.append(
      tabBar(TABS, tab, (id) => { tab = id; render(); }),
      tabPanel(TABS, tab, tab === 'party' ? partyTab() : tab === 'items' ? itemsTab() : gearTab()),
    );
  };

  /** The character's picture: Final Fantasy I's class, II's character, III's job (the Onion Knight is the hero's own). */
  function sprite(c: PrChar, job = c.job, cls2 = ''): HTMLImageElement {
    if (game === 'ff1') return ff1ClassSprite(job - 1, 'psp', cls2);
    if (game === 'ff3') return ff3JobSpriteByName(d.jobs[job - 1] ?? '', c.statusId - 1, cls2);
    const img = ff2Portrait((d.jobs[job - 1] ?? 'firion').toLowerCase());
    if (cls2) img.classList.add(cls2);
    return img;
  }
  const condName = (id: number) => d.conditions.find(([c]) => c === id)?.[1];
  const label = (c: PrChar, i: number) => c.name || (game === 'ff2' ? c.jobName : `Character ${i + 1}`);

  // ---------- party ----------

  /** The four party windows of the game's main menu. Tap one to edit that character. */
  function partyWindow(onPick: () => void): { node: HTMLElement; paint: () => void } {
    const node = h('div', { class: 'lcd ff-party', role: 'group', 'aria-label': 'Party' });
    const paint = () => {
      clear(node);
      node.append(...s.party.map((c, i) => {
        if (!c) return h('div', { class: 'ff-member empty' }, h('span', { class: 'ff-name' }, 'Empty'));
        const ko = c.fallen;
        return h('button', {
          class: i === who ? 'ff-member on' : 'ff-member', 'aria-pressed': String(i === who),
          'aria-label': `${label(c, i)}${game === 'ff2' ? '' : `, ${c.jobName}, level ${c.level}`}. Edit`,
          onclick: () => { who = i; notice = ''; onPick(); },
        },
        sprite(c, c.job, ko ? 'fallen' : ''),
        h('span', { class: 'ff-name' }, c.name || '—', ...statusBadges(...c.conditions.map(condName))),
        game === 'ff2' ? null : h('span', { class: 'ff-class' }, c.jobName),
        game === 'ff2' ? null : h('span', { class: 'ff-lv' }, `Lv ${c.level}`),
        h('span', { class: 'ff-hp' }, `HP ${c.hp}/${c.maxHp}`, ffHpBar(c.hp, c.maxHp)),
        game === 'ff2' ? h('span', { class: 'ff-hp' }, `MP ${c.mp}/${c.maxMp}`, ffMpBar(c.mp, c.maxMp)) : null);
      }));
    };
    paint();
    return { node, paint };
  }

  function partyTab(): Node {
    if (!s.members.length) return h('section', { class: 'card' }, h('p', {}, 'Nobody is in the party yet.'));
    const sheet = h('div', { class: 'stack' });
    const win = partyWindow(() => { win.paint(); drawSheet(); });
    const drawSheet = () => {
      clear(sheet);
      const c = s.party[who];
      if (c) sheet.append(...characterSheet(c, win.paint, () => { win.paint(); drawSheet(); }));
    };
    drawSheet();
    return h('div', { class: 'stack' }, win.node, sheet);
  }

  function characterSheet(c: PrChar, repaint: () => void, redraw: () => void): Node[] {
    const edited = () => { markDirty(); repaint(); };
    const changed = () => { markDirty(); redraw(); };
    const casts = game === 'ff1' && (d.spells ?? []).some((sp) => sp[4] & (1 << (c.job - 1)));
    const basics = h('section', { class: 'card' },
      h('h3', { class: 'ff-sheet-title' }, sprite(c, c.job, c.fallen ? 'fallen' : ''),
        h('span', {}, game === 'ff3' ? `${label(c, who)} · ${c.jobName}` : label(c, who))),
      h('div', { class: 'grid' },
        field('Name', textInput(c.name, NAME_LENGTH, (v) => { c.name = v; edited(); }, { 'aria-label': 'Name' })),
        game === 'ff2' ? null : field('Level', numberInput(c.level, 1, d.max.level, (v) => { c.level = v; changed(); })),
        game === 'ff2' ? null : field('Exp', numberInput(c.exp, 0, d.max.exp, (v) => { c.exp = v; markDirty(); }), 'Extra Exp turns into level ups after your next battle.'),
        game === 'ff3' ? field('Job', jobSelect(c, changed), notice || undefined) : null),
      h('div', { class: 'grid pair' },
        field('HP', numberInput(c.hp, 0, d.max.hp, (v) => { c.hp = v; changed(); })),
        field('Max HP', numberInput(c.maxHp, c.minMaxHp, d.max.hp, (v) => { c.maxHp = v; changed(); })),
        game === 'ff2' ? field('MP', numberInput(c.mp, 0, d.max.mp, (v) => { c.mp = v; changed(); })) : null,
        game === 'ff2' ? field('Max MP', numberInput(c.maxMp, c.minMaxMp, d.max.mp, (v) => { c.maxMp = v; changed(); })) : null),
      casts ? chargesGroup(c, changed) : null,
      h('div', { class: 'subgroup' },
        h('h4', {}, 'Status'),
        h('div', { class: 'ff-toggles' }, d.conditions.map(([id, name]) => {
          const on = c.hasCondition(id);
          return h('button', {
            class: 'ff-toggle', 'aria-pressed': String(on),
            onclick: () => { c.setCondition(id, !on); changed(); },
          }, statusIcon(name), name);
        }))),
      STATS[game].length ? h('div', { class: 'subgroup' },
        h('h4', {}, 'Stats'),
        h('div', { class: 'grid compact' }, STATS[game].map((st) =>
          field(st.label, numberInput(c.stat(st.key), c.minStat(st.key), d.max.stat, (v) => { c.setStat(st.key, v); markDirty(); }))))) : null,
      h('div', { class: 'button-row' },
        h('button', { onclick: () => { c.restore(); changed(); } }, game === 'ff2' ? 'Restore HP and MP' : 'Restore HP and status')),
    );
    const cards: Node[] = [basics];
    if (game === 'ff1') {
      cards.push(h('section', { class: 'card' }, h('h3', {}, 'Class'),
        classBoard(d.jobOrder.map((id) => ({ id, name: d.jobs[id - 1] })), c.job, (id) => sprite(c, id), (id) => { c.changeJob(id); changed(); })));
    }
    if (game === 'ff3') cards.push(jobLevelsCard(c));
    if (game === 'ff2') cards.push(skillsCard(c), spellsCard(c, changed));
    cards.push(gearCard(c, changed));
    return cards;
  }

  /** Final Fantasy I's spell charges: how many casts of each spell level are left, and the most. */
  function chargesGroup(c: PrChar, changed: () => void): Node {
    return h('div', { class: 'subgroup' },
      h('h4', {}, 'Spell charges'),
      h('div', { class: 'pr-charges' }, Array.from({ length: 8 }, (_, i) => i + 1).map((lv) => h('div', { class: 'field' },
        h('span', { class: 'field-label' }, `Level ${lv}`),
        h('span', { class: 'pr-charge-pair' },
          numberInput(c.charge(lv), 0, FF1_MAX_CHARGES, (v) => { c.setCharge(lv, v); changed(); }, { 'aria-label': `Level ${lv}` }),
          '/',
          numberInput(c.maxCharge(lv), c.minMaxCharge(lv), FF1_MAX_CHARGES, (v) => { c.setMaxCharge(lv, v); changed(); }, { 'aria-label': `Level ${lv} max` }))))),
      h('p', { class: 'field-hint' }, 'Casts left now, and the most.'));
  }

  /** Final Fantasy III's Job menu: the jobs handed out so far. Gear the new job can't use goes to the bag. */
  function jobSelect(c: PrChar, changed: () => void): HTMLSelectElement {
    const options = d.jobOrder.filter((id) => id === c.job || s.jobOpen(id)).map((id) => ({ value: id, label: d.jobs[id - 1] }));
    return selectInput(options, c.job, (v) => {
      const moved = c.changeJob(Number(v));
      notice = moved.length ? `${moved.map(gearName).join(', ')} went to the bag: a ${c.jobName} can’t use ${moved.length > 1 ? 'them' : 'it'}.` : '';
      changed();
    }, { 'aria-label': 'Job' });
  }

  function jobLevelsCard(c: PrChar): Node {
    return h('section', { class: 'card' },
      h('h3', {}, 'Job levels'),
      jobBoard(d.jobOrder.map((id) => ({
        name: d.jobs[id - 1], sprite: sprite(c, id), level: c.jobLevel(id), now: id === c.job,
        locked: id === c.job || s.jobOpen(id) ? '' : 'Locked', setLevel: (v) => { c.setJobLevel(id, v); markDirty(); },
      })), d.max.level));
  }

  function skillsCard(c: PrChar): Node {
    return h('section', { class: 'card' },
      h('h3', {}, 'Weapon skills'),
      h('div', { class: 'grid compact' }, FF2_SKILLS.map((sk) =>
        field(sk.label, numberInput(c.skillLevel(sk.key), 1, FF2_SKILL_MAX, (v) => { c.setSkillLevel(sk.key, v); markDirty(); })))),
      h('p', { class: 'field-hint' }, 'A level starts with no progress towards the next.'));
  }

  function spellsCard(c: PrChar, changed: () => void): Node {
    const groups = d.spellGroups ?? [];
    const known = c.spells;
    const full = known.length >= FF2_SPELL_SLOTS;
    const rows = known.map(([g, lv]) => h('div', { class: 'pr-spell' },
      field(groups[g][2], numberInput(lv, 1, FF2_SKILL_MAX, (v) => { c.setSpell(g, v); markDirty(); })),
      h('button', { 'aria-label': `Forget ${groups[g][2]}`, onclick: () => { c.setSpell(g, 0); changed(); } }, 'Forget')));
    const unknown = groups.map((x, g) => ({ value: g, label: x[2] })).filter((o) => !known.some(([g]) => g === o.value));
    const learn = selectInput([{ value: -1, label: full ? 'All 16 places are used' : 'Learn a spell…' }, ...unknown], -1, (v) => {
      if (Number(v) >= 0 && c.setSpell(Number(v), 1)) changed();
    }, { 'aria-label': 'Learn a spell', disabled: full });
    return h('section', { class: 'card' },
      h('h3', {}, 'Magic'),
      h('p', { class: 'muted card-note' }, `${known.length} of ${FF2_SPELL_SLOTS} places. Each spell’s level is 1-16.`),
      rows.length ? h('div', { class: 'pr-spells' }, rows) : null,
      h('div', { class: 'grid' }, learn));
  }

  function gearCard(c: PrChar, changed: () => void): Node {
    const rows = SLOT_ORDER.flatMap((slot) => {
      const current = c.gear(slot);
      const fits = d.gear.filter((g) => g[3] & (1 << (slot - 1)));
      const options = [{ value: 0, label: '—' },
        ...fits.map((g) => ({ value: g[0], label: c.canWear(g[0]) ? g[1] : `${g[1]} (can’t equip)` }))];
      const name = SLOT_NAMES[game][slot - 1];
      const pick = field(name, selectInput(options, current, (v) => { c.setGear(slot, Number(v)); changed(); }));
      return s.isArrow(current)
        ? [pick, field(`${name}: arrows`, numberInput(c.gearCount(slot), 1, d.max.item, (v) => { c.setGearCount(slot, v); markDirty(); }))]
        : [pick];
    });
    return h('section', { class: 'card' },
      h('h3', {}, 'Equipped'),
      h('div', { class: 'grid' }, rows),
      h('p', { class: 'field-hint' }, game === 'ff3'
        ? `Worn gear isn’t in the bag, so what you take off here is gone. Arrows come ${ARROW_STACK} to a hand.`
        : 'Worn gear isn’t in the bag, so what you take off here is gone. Add it on the Weapons and armor tab if you want to keep it.'));
  }

  // ---------- items ----------

  function itemsTab(): Node {
    const cards: Node[] = [
      h('section', { class: 'card' },
        h('h3', {}, 'Gil and items'),
        h('div', { class: 'grid' }, field('Gil', numberInput(s.gil, 0, d.max.gil, (v) => { s.gil = v; markDirty(); }))),
        countGrid(d.items.map(([id, name]) => [id, name])),
        h('div', { class: 'button-row' },
          h('button', { onclick: () => { s.gil = d.max.gil; d.items.forEach(([id]) => s.setCount(id, d.max.item)); markDirty(); render(); } }, 'Max gil and items'))),
      h('section', { class: 'card' },
        h('h3', {}, 'Key items'),
        h('div', { class: 'ff-toggles' }, d.keyItems.map(([id, name]) => toggle(name, s.hasKeyItem(id), (on) => s.setKeyItem(id, on)))),
        h('p', { class: 'field-hint' }, 'Key items move the story on when you use or hand them over, so adding one can skip ahead or leave a quest stuck.')),
    ];
    if (game === 'ff1') {
      cards.push(h('section', { class: 'card' },
        h('h3', {}, 'Orbs'),
        h('div', { class: 'ff-toggles' }, ORB_NAMES.map((n, i) => toggle(`${n} Orb`, s.orb(i), (on) => s.setOrb(i, on)))),
        h('p', { class: 'field-hint' }, 'Lit Orbs are what open the way to the end of the game.')));
    }
    if (game === 'ff2') {
      cards.push(h('section', { class: 'card' },
        h('h3', {}, 'Key terms'),
        h('div', { class: 'ff-toggles' }, (d.keyTerms ?? []).map(([id, name]) => toggle(name, s.hasKeyTerm(id), (on) => s.setKeyTerm(id, on)))),
        h('p', { class: 'field-hint' }, 'Words to Ask about and Learn. Some open the way on, so learning one early can skip ahead.')));
    }
    if (game === 'ff3') {
      cards.push(h('section', { class: 'card' },
        h('h3', {}, 'Jobs'),
        h('p', { class: 'muted card-note' }, 'What the Job menu offers. The Onion Knight is always there.'),
        h('div', { class: 'ff-toggles' }, d.jobOrder.filter((id) => id !== 1).map((id) => {
          const inUse = s.chars.some((c) => c.job === id);
          const btn = toggle(d.jobs[id - 1], s.jobOpen(id), (on) => s.setJobOpen(id, on));
          if (inUse) { btn.disabled = true; btn.title = 'Someone has this job now'; }
          return btn;
        }))));
    }
    return h('div', { class: 'stack' }, ...cards);
  }

  function gearTab(): Node {
    const of = (kind: 0 | 1) => d.gear.filter((g) => g[2] === kind).map((g) => [g[0], g[1]] as [number, string]);
    return h('div', { class: 'stack' },
      h('section', { class: 'card' }, h('h3', {}, 'Weapons'), countGrid(of(0))),
      h('section', { class: 'card' }, h('h3', {}, 'Armor'), countGrid(of(1))));
  }

  function countGrid(list: [number, string][]): Node {
    return h('div', { class: 'grid compact' }, list.map(([id, name]) =>
      field(name, numberInput(s.count(id), 0, d.max.item, (v) => { s.setCount(id, v); markDirty(); }))));
  }

  /** An on/off button, lit up as a game window when it's on. */
  function toggle(name: string, on: boolean, set: (on: boolean) => void): HTMLButtonElement {
    const btn = h('button', { class: 'ff-toggle', 'aria-pressed': String(on) }, name) as HTMLButtonElement;
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
