// A searchable list in its own small window, for choices too long to scroll (moves, items).
// `pickOption` resolves with the chosen value, or null when the window is dismissed.
// `pickerButton` is a field-sized button that shows the current choice and opens the window.

import { clear, h } from './dom.ts';

export interface PickOption { value: number; label: string }

const SHOWN = 120;

export function pickOption(title: string, options: PickOption[], current?: number): Promise<number | null> {
  return new Promise((resolve) => {
    let picked: number | null = null;
    const list = h('ul', { class: 'pick-list', role: 'listbox', 'aria-label': title });
    const search = h('input', {
      type: 'search', class: 'pick-search', placeholder: 'Type to search', autocomplete: 'off', spellcheck: false, 'aria-label': `Search ${title.toLowerCase()}`,
    });
    const dlg = h('dialog', { class: 'pick-dialog', 'aria-label': title },
      h('div', { class: 'dialog-body' },
        h('h2', {}, title),
        search,
        list,
        h('div', { class: 'button-row end' }, h('button', { onclick: () => dlg.close() }, 'Cancel'))));
    const choose = (v: number) => { picked = v; dlg.close(); };
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const hits = options.filter((o) => !q || o.label.toLowerCase().includes(q));
      // Names that start with what was typed come first.
      if (q) hits.sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)));
      clear(list);
      for (const o of hits.slice(0, SHOWN)) {
        list.append(h('li', {}, h('button', {
          type: 'button', role: 'option', class: o.value === current ? 'pick-opt on' : 'pick-opt', 'aria-selected': String(o.value === current),
          onclick: () => choose(o.value),
        }, o.label)));
      }
      if (!hits.length) list.append(h('li', { class: 'muted pick-empty' }, 'Nothing matches.'));
      else if (hits.length > SHOWN) list.append(h('li', { class: 'muted pick-empty' }, `${hits.length - SHOWN} more. Keep typing to narrow it down.`));
    };
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      list.querySelector<HTMLButtonElement>('button.pick-opt')?.click();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(picked); });
    draw();
    document.body.append(dlg);
    dlg.showModal();
    search.focus();
  });
}

export function pickerButton(
  title: string, options: PickOption[], value: number, onChange: (v: number) => void, extra: Record<string, unknown> = {},
): HTMLButtonElement {
  const label = options.find((o) => o.value === value)?.label ?? String(value);
  return h('button', {
    type: 'button', class: 'pick-btn', 'aria-haspopup': 'dialog', ...extra,
    onclick: async () => { const v = await pickOption(title, options, value); if (v !== null && v !== value) onChange(v); },
  }, h('span', {}, label), h('span', { class: 'pick-caret', 'aria-hidden': 'true' }, '▾'));
}
