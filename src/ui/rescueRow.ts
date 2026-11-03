// "Stuck?": a switch that makes the next Continue start somewhere safe (each save's sendHome says how).

import { h } from './dom.ts';

export function rescueRow(s: { sendHome: boolean; homeName: string }, markDirty: () => void): Node {
  return h('label', { class: 'check-row' },
    h('input', { type: 'checkbox', checked: s.sendHome, onchange: (e: Event) => { s.sendHome = (e.target as HTMLInputElement).checked; markDirty(); } }),
    h('span', {}, 'Stuck? Start in a safe place'),
    h('span', { class: 'muted' }, ` The next Continue starts you in ${s.homeName}.`));
}
