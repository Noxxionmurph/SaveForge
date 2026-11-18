import { detectFf2Nes } from '../core/ff2nes/layout.ts';
import type { Ff2NesSave } from '../core/ff2nes/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff2NesSave>({
  id: 'final-fantasy-2-nes',
  family: 'Final Fantasy',
  games: ['Final Fantasy II (Famicom)'],
  icons: { 'Final Fantasy II (Famicom)': 'sprites/ff2/pr/firion.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy II', // listed on the Dawn of Souls tile
  platform: 'Famicom · English patch',
  fileHint: 'Final Fantasy II (Famicom) saves are 8,192 bytes (8 KB).',
  colors: { 'Final Fantasy II (Famicom)': '#6a3b9e' },
  theme: 'nes',
  detect: (data) => {
    const found = detectFf2Nes(data);
    if (found === 'ok') return { confidence: 'certain' };
    return found ? { confidence: 'likely', note: "It looks like a Final Fantasy II save, but it fails the game's save check." } : null;
  },
  sampleGame: 'Final Fantasy II · Famicom',
  sample: async () => ({ fileName: 'sample-ff-2-nes.sav', data: (await import('../core/ff2nes/sample.ts')).buildFf2NesSample() }),
  load: async (data) => new (await import('../core/ff2nes/save.ts')).Ff2NesSave(data),
  loadEditor: async () => (await import('../ui/editors/ff2nes/index.ts')).mountFf2NesEditor,
});
