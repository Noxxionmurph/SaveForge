// The bag's pocket tabs: one pocket (or the PC's storage) at a time under a row of tabs, in every game, instead of every
// pocket stacked in one long page. Like tabs.ts, picking a tab redraws the editor, so focus is put back on the new tab.
import { h } from './dom.ts';

export interface PocketDef<T extends string> { id: T; label: string }

const pocketId = (id: string) => `pocket-${id}`;

export function pocketTabs<T extends string>(pockets: readonly PocketDef<T>[], current: T, pick: (id: T) => void, content: Node): HTMLElement {
  const go = (id: T) => { pick(id); document.getElementById(pocketId(id))?.focus(); };
  const bar = h('div', { class: 'pocket-tabs', role: 'tablist', 'aria-label': 'Bag pockets' }, pockets.map((p) =>
    h('button', {
      id: pocketId(p.id), role: 'tab', class: p.id === current ? 'pocket-tab active' : 'pocket-tab', 'aria-selected': String(p.id === current),
      'aria-controls': 'pocket-panel', tabIndex: p.id === current ? 0 : -1, onclick: () => go(p.id),
    }, p.label)));
  bar.addEventListener('keydown', (e) => {
    const at = pockets.findIndex((p) => p.id === current);
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: pockets.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(pockets[(to + pockets.length) % pockets.length].id);
  });
  return h('div', { class: 'pockets' }, bar,
    h('div', { class: 'pocket-panel', id: 'pocket-panel', role: 'tabpanel', 'aria-labelledby': pocketId(current) }, content));
}
