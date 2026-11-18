import { detectFf3Ds } from '../core/ff3ds/layout.ts';
import type { Ff3DsSave } from '../core/ff3ds/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff3DsSave>({
  id: 'final-fantasy-3-ds',
  family: 'Final Fantasy',
  games: ['Final Fantasy III (Nintendo DS)'],
  icons: { 'Final Fantasy III (Nintendo DS)': 'sprites/ff3/pr/onion-knight.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy III', // listed on the Famicom tile
  platform: 'Nintendo DS',
  fileHint: 'Final Fantasy III (Nintendo DS) saves are 65,536 bytes (64 KB).',
  colors: { 'Final Fantasy III (Nintendo DS)': '#3a4673' },
  theme: 'nds',
  detect: (data) => {
    const found = detectFf3Ds(data);
    if (found === 'ok') return { confidence: 'certain' };
    return found ? { confidence: 'likely', note: "It looks like a Final Fantasy III save, but it fails the game's save check." } : null;
  },
  sampleGame: 'Final Fantasy III · DS',
  sample: async () => ({ fileName: 'sample-ff-3-ds.sav', data: (await import('../core/ff3ds/sample.ts')).buildFf3DsSample() }),
  load: async (data) => new (await import('../core/ff3ds/save.ts')).Ff3DsSave(data),
  loadEditor: async () => (await import('../ui/editors/ff3ds/index.ts')).mountFf3DsEditor,
});
