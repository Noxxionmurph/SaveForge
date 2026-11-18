// Pieces every Final Fantasy page shares, drawn like the games' menus: the HP and MP bars in the party windows, the job
// and class boards, and the status buttons. Their look is in styles.css (the Final Fantasy pages block).

import { h, numberInput } from '../../dom.ts';
import { drawHpBar, type HpBarRules } from '../../hpBar.ts';
import { statusIcon } from '../../sprites.ts';

/** The games' menus show HP and MP as numbers only, so the bars are for the eye: as full as the HP, green above half,
 *  yellow above a quarter, then red. */
const BAR: HpBarRules = {
  HP_BAR_PIXELS: 100,
  hpBarPixels: (hp, max) => (hp > 0 && max > 0 ? Math.min(100, Math.max(1, Math.floor((hp * 100) / max))) : 0),
  hpBarColour: (px) => (px > 50 ? 'green' : px > 25 ? 'yellow' : 'red'),
};

/** The bar under a party member's HP. A picture only: the numbers are written beside it. Null when the maximum is 0. */
export const ffHpBar = (hp: number, maxHp: number): HTMLElement | null => drawHpBar(BAR, hp, maxHp);
/** The bar under a party member's MP, in one colour. */
export const ffMpBar = (mp: number, maxMp: number): HTMLElement | null => drawHpBar(BAR, mp, maxMp, 'mp');

/**
 * A one-at-a-time status (Final Fantasy I keeps a single ailment) as the game's status icons: a button per status, the
 * character's one pressed. Pressing another picks it; pressing the pressed one clears it.
 */
export function statusPicker(statuses: readonly { value: number; label: string }[], current: number, pick: (value: number) => void): HTMLElement {
  let now = current;
  const shown = statuses.filter((st) => st.value !== 0);
  const buttons = shown.map((st) => h('button', {
    class: 'ff-toggle', 'aria-pressed': String(st.value === now),
    onclick: () => {
      now = st.value === now ? 0 : st.value;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(shown[i].value === now)));
      pick(now);
    },
  }, statusIcon(st.label), st.label));
  return h('div', { class: 'ff-toggles' }, buttons);
}

/** An on/off button, lit up as a game window when it's on. `set` gets the new state. */
export function ffToggle(label: string, on: boolean, set: (on: boolean) => void): HTMLButtonElement {
  const btn = h('button', { class: 'ff-toggle', 'aria-pressed': String(on) }, label) as HTMLButtonElement;
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(next));
    set(next);
  });
  return btn;
}

/** A board of tiles, each a sprite over a name: the current one has the menu cursor, and tapping another picks it. */
function tileBoard<T>(label: string, cls: string, tiles: readonly { id: T; name: string; sprite: Node | null }[], current: T,
  pick: (id: T) => void): HTMLElement {
  return h('div', { class: cls, role: 'group', 'aria-label': label }, tiles.map((t) => h('button', {
    class: t.id === current ? 'ff-class-tile now' : 'ff-class-tile', 'aria-pressed': String(t.id === current),
    onclick: () => { if (t.id !== current) pick(t.id); },
  }, t.sprite, h('span', {}, t.name))));
}

/** Every class with its sprite: the character's class has the menu cursor, and tapping another changes to it. */
export const classBoard = (classes: readonly { id: number; name: string }[], current: number, sprite: (id: number) => Node | null,
  pick: (id: number) => void): HTMLElement =>
  tileBoard('Class', 'ff-classes', classes.map((k) => ({ ...k, sprite: sprite(k.id) })), current, pick);

/** Who travels with the heroes in the fourth place (Final Fantasy II): nobody, or one of the guests with their sprite. */
export const guestBoard = (guests: readonly { id: number; name: string; sprite: Node | null }[], current: number | null,
  pick: (id: number | null) => void): HTMLElement =>
  tileBoard<number | null>('Fourth member', 'ff-classes ff-guests',
    [{ id: null, name: 'Nobody', sprite: h('span', { class: 'job-sprite prj ff-nobody', 'aria-hidden': 'true' }) }, ...guests], current, pick);

export interface JobTile {
  name: string;
  sprite: Node | null;
  level: number;
  /** The character's job now. */
  now: boolean;
  /** Why the Job menu doesn't offer it yet ('Locked', or the crystal that hands it out); empty when it does. */
  locked: string;
  setLevel(level: number): void;
}

/** The job board: every job's sprite and the character's level in it. The current job has the menu cursor and locked
 *  jobs are greyed. Each level box keeps the name the old list of boxes had ("Ninja (locked)"). */
export function jobBoard(tiles: JobTile[], maxLevel: number): HTMLElement {
  return h('div', { class: 'ff-jobs' }, tiles.map((t) => h('label', { class: `ff-job${t.now ? ' now' : ''}${t.locked ? ' locked' : ''}` },
    t.sprite,
    h('span', { class: 'ff-job-name' }, t.name, t.now ? h('small', {}, 'Now') : t.locked ? h('small', {}, t.locked) : null),
    numberInput(t.level, 1, maxLevel, t.setLevel, { 'aria-label': t.now ? `${t.name} (now)` : t.locked ? `${t.name} (locked)` : t.name }))));
}
