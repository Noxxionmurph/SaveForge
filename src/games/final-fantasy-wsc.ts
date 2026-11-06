import { fileOk, hasMagic } from '../core/ff1wsc/layout.ts';
import type { Ff1WscSave } from '../core/ff1wsc/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff1WscSave>({
  id: 'final-fantasy-wsc',
  family: 'Final Fantasy',
  games: ['Final Fantasy (WonderSwan Color)'],
  icons: { 'Final Fantasy (WonderSwan Color)': 'sprites/ff1/wsc/warrior.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy', // listed on the NES tile
  platform: 'WonderSwan Color · Japan',
  fileHint: 'Final Fantasy (WonderSwan Color) saves are 32,768 bytes (32 KB).',
  colors: { 'Final Fantasy (WonderSwan Color)': '#31309c' },
  theme: 'wsc',
  detect: (data) => {
    if (!hasMagic(data)) return null;
    const files = Array.from({ length: 9 }, (_, i) => i);
    if (files.some((i) => fileOk(data, i))) return { confidence: 'certain' };
    return { confidence: 'likely', note: 'It looks like a Final Fantasy (WonderSwan Color) save, but none of its files pass the game’s save check.' };
  },
  load: async (data) => new (await import('../core/ff1wsc/save.ts')).Ff1WscSave(data),
  loadEditor: async () => (await import('../ui/editors/ff1wsc/index.ts')).mountFf1WscEditor,
});
