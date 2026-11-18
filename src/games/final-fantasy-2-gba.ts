import { detectDawnOfSouls } from '../core/ff1gba/layout.ts';
import type { Ff2GbaSave } from '../core/ff2gba/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff2GbaSave>({
  id: 'final-fantasy-2-gba',
  family: 'Final Fantasy',
  games: ['Final Fantasy II'],
  shelf: 'final-fantasy',
  platform: 'Game Boy Advance · US',
  fileHint: 'Dawn of Souls saves are 32,768 bytes (32 KB); 64 KB copies and .sps files open too.',
  colors: { 'Final Fantasy II': '#6a3b9e' },
  icons: { 'Final Fantasy II': 'sprites/ff2/pr/firion.png' },
  theme: 'gba',
  detect: (data) => (detectDawnOfSouls(data, 2) === 'ok' ? { confidence: 'certain' } : null),
  sampleGame: 'Final Fantasy II · GBA',
  sample: async () => ({ fileName: 'sample-ff-2-gba.sav', data: (await import('../core/ff2gba/sample.ts')).buildFf2GbaSample() }),
  load: async (data) => new (await import('../core/ff2gba/save.ts')).Ff2GbaSave(data),
  loadEditor: async () => (await import('../ui/editors/ff2gba/index.ts')).mountFf2GbaEditor,
});
