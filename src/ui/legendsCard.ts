// The Legendary Pokémon card shared by every game: each one-off Pokémon, whether it's still waiting or gone, and a
// box to bring back one that's gone (see core/legends.ts).

import type { LegendSave } from '../core/legends.ts';
import { h, type Child } from './dom.ts';
import { pokemonIcon } from './sprites.ts';

export function legendsCard(s: LegendSave, markDirty: () => void,
  wrap: (title: string, ...body: Child[]) => Node = (title, ...body) => h('section', { class: 'card legends' }, h('h3', {}, title), ...body)): Node {
  const boxes: HTMLInputElement[] = [];
  const goneCount = s.legends.filter((_, i) => s.legendGone(i)).length;
  const rows = s.legends.map((l, i) => {
    const gone = s.legendGone(i);
    const box = h('input', {
      type: 'checkbox', checked: s.bringBack[i], disabled: !gone, 'aria-label': `Bring back ${l.name}`,
      onchange: (e: Event) => { s.bringBack[i] = (e.target as HTMLInputElement).checked; markDirty(); },
    }) as HTMLInputElement;
    boxes.push(box);
    return h('label', { class: 'check-row legend' },
      box,
      h('span', { class: 'legend-icons' }, l.dex.map((d) => pokemonIcon(d, '', '', l.shiny))),
      h('span', { class: 'legend-text' },
        h('span', {}, `${l.name}, ${l.place}`),
        h('span', { class: 'muted' }, [gone ? 'Gone: tick to bring it back.' : 'Still there.', gone && l.note ? ` ${l.note}` : ''].join(''))));
  });
  return wrap('Legendary Pokémon',
    h('div', { class: 'legend-list' }, rows),
    goneCount > 1 ? h('div', { class: 'button-row' },
      h('button', { onclick: () => {
        s.legends.forEach((_, i) => { if (s.legendGone(i)) { s.bringBack[i] = true; boxes[i].checked = true; } });
        markDirty();
      } }, 'Bring them all back')) : null);
}
