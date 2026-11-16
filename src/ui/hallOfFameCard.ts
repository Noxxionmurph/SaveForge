// The Hall of Fame card shared by the Pokémon games: each win's team, newest first, read from the file (not editable).
// Only the newest few are shown until the player asks for the rest.

import type { HallOfFame } from '../core/hallOfFame.ts';
import { clear, h, type Child } from './dom.ts';
import { pokemonIcon } from './sprites.ts';

const FIRST = 3;

export function hallOfFameCard(hof: HallOfFame,
  wrap: (title: string, ...body: Child[]) => Node = (title, ...body) => h('section', { class: 'card hof' }, h('h3', {}, title), ...body)): Node {
  const { entries, total } = hof;
  const list = h('ul', { class: 'hof-list' });
  let all = false;
  const draw = () => {
    clear(list);
    for (const e of all ? entries : entries.slice(0, FIRST)) {
      list.append(h('li', { class: 'hof-entry' },
        h('span', { class: 'hof-no' }, `No. ${e.win}`),
        h('div', { class: 'party-strip', role: 'group', 'aria-label': `Hall of Fame No. ${e.win}` }, e.mons.map((m) =>
          h('span', { class: 'party-slot', title: m.name },
            pokemonIcon(m.dex, '', '', m.shiny),
            h('span', { class: 'slot-name' }, m.name),
            h('span', { class: 'lv-tag' }, `Lv ${m.level}`))))));
    }
    more.hidden = all || entries.length <= FIRST;
    more.textContent = `Show all ${entries.length}`;
  };
  const more = h('button', { onclick: () => { all = true; draw(); } }, '');
  draw();
  const wins = total ?? entries.length;
  return wrap('Hall of Fame',
    entries.length
      ? [h('p', { class: 'muted hof-sub' }, `${wins} ${wins === 1 ? 'win' : 'wins'}, newest first.${total !== null && wins > entries.length ? ` The game keeps the latest ${entries.length}.` : ''}`), list, more]
      : h('p', { class: 'muted' }, 'No entries yet. The team goes in after beating the Elite Four and the Champion.'));
}
