// The "review your changes" dialog shown before Save: what will differ from the file the user opened.

import type { ChangeGroup, SummaryLine } from '../core/types.ts';
import { h } from './dom.ts';

/**
 * Resolves true if the user chooses to save. `unlisted` means the bytes differ even though the game
 * had nothing to list (for example, checksums that get recalculated). `summary` is shown first, in a framed
 * window like the one the game shows when you save, so it's clear which file is about to be written.
 */
export function askReview(groups: ChangeGroup[], unlisted: boolean, summary: SummaryLine[] = []): Promise<boolean> {
  return new Promise((resolve) => {
    const saveWindow = summary.length
      ? h('dl', { class: 'lcd save-window', 'aria-label': `This save: ${summary.map((l) => `${l.label.toLowerCase()} ${l.value}`).join(', ')}` },
        summary.map((l) => h('div', {}, h('dt', {}, l.label), h('dd', {}, l.value))))
      : null;
    // Warnings come out of the lists: they are not changes, and they should not read like one.
    const warnings: string[] = [];
    const shown = groups.map((g) => ({ ...g, lines: g.lines.filter((l) => { const w = l.startsWith(WARNING); if (w) warnings.push(l.slice(WARNING.length)); return !w; }) }))
      .filter((g) => g.lines.length || g.more);
    const total = shown.reduce((n, g) => n + g.lines.length + (g.more ?? 0), 0);
    const nothing = groups.length === 0 && !unlisted;
    const list = shown.length
      ? h('div', { class: 'lcd review-list', tabIndex: 0, role: 'region', 'aria-label': 'Changes to save' },
        shown.map((g) => h('section', {},
          h('h3', {}, g.title, h('span', { class: 'review-count' }, String(g.lines.length + (g.more ?? 0)))),
          h('ul', {}, g.lines.map((l) => changeLine(l)), g.more ? h('li', { class: 'more' }, `…and ${g.more} more`) : null))))
      : null;
    const callout = warnings.length
      ? h('div', { class: 'review-warn', role: 'group', 'aria-label': warnings.length === 1 ? 'Warning' : 'Warnings' },
        warnings.map((w) => h('p', {}, h('strong', {}, 'Warning '), w)))
      : null;
    const tally = [
      total ? `${total} ${total === 1 ? 'change' : 'changes'}` : '',
      warnings.length ? `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}` : '',
    ].filter(Boolean).join(' · ');

    const dlg = h('dialog', { class: 'review-dialog', 'aria-labelledby': 'review-title' },
      h('div', { class: 'dialog-body' },
        h('h2', { id: 'review-title' }, nothing ? 'No changes yet' : 'Review your changes'),
        h('p', { class: 'muted review-sub' }, nothing
          ? "You haven't edited anything, so saving gives you an identical copy."
          : [tally ? h('strong', { class: 'review-tally' }, `${tally}.`) : null, tally ? ' ' : '', "Saving makes a new file. The one you opened isn't changed."]),
        saveWindow,
        callout,
        list,
        !groups.length && unlisted
          ? h('p', { class: 'review-sub' }, 'Nothing you edited, but the file will be tidied up (for example, checksums are recalculated).')
          : null,
        h('div', { class: 'dialog-foot sticky-foot' },
          h('button', { onclick: () => dlg.close('no') }, nothing ? 'Cancel' : 'Keep editing'),
          h('button', { class: 'primary', onclick: () => dlg.close('yes') }, nothing ? 'Save anyway' : 'Save'))));
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

const WARNING = 'Warning: ';

/**
 * One change as a row: "Label: old → new" shows the old value dimmed and the new one bold, "Added …" and "Removed …"
 * get a plus or minus, and anything else keeps the plain text. The text stays exactly as the game's diff wrote it.
 */
function changeLine(line: string): HTMLElement {
  const m = /^([^→:]{1,40}): ([^→]+) → ([^→]+)$/.exec(line);
  if (m) return h('li', { class: 'change' }, m[1], ': ', h('span', { class: 'was' }, m[2]), ' → ', h('span', { class: 'now' }, m[3]));
  return h('li', { class: line.startsWith('Added ') ? 'change add' : line.startsWith('Removed ') ? 'change remove' : 'change' }, line);
}
