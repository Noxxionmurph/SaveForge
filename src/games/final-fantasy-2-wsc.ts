import { detectFf2Wsc } from '../core/ff2wsc/layout.ts';
import type { Ff2WscSave } from '../core/ff2wsc/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff2WscSave>({
  id: 'final-fantasy-2-wsc',
  family: 'Final Fantasy',
  games: ['Final Fantasy II (WonderSwan Color)'],
  icons: { 'Final Fantasy II (WonderSwan Color)': 'sprites/ff2/pr/firion.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy II', // listed on the Dawn of Souls tile
  platform: 'WonderSwan Color · English patch',
  fileHint: 'Final Fantasy II (WonderSwan Color) saves are 32,768 bytes (32 KB).',
  colors: { 'Final Fantasy II (WonderSwan Color)': '#6a3b9e' },
  theme: 'wsc',
  detect: (data) => {
    const found = detectFf2Wsc(data);
    if (found === 'ok') return { confidence: 'certain' };
    return found ? { confidence: 'likely', note: "It looks like a Final Fantasy II save, but it fails the game's save check." } : null;
  },
  load: async (data) => new (await import('../core/ff2wsc/save.ts')).Ff2WscSave(data),
  loadEditor: async () => (await import('../ui/editors/ff2nes/index.ts')).mountFf2WscEditor,
});
