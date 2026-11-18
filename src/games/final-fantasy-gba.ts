import { detectDawnOfSouls } from '../core/ff1gba/layout.ts';
import type { Ff1GbaSave } from '../core/ff1gba/save.ts';
import { defineGame } from '../core/types.ts';

// Dawn of Souls holds both games on one cartridge and one save. This module edits the Final Fantasy I files and
// final-fantasy-2-gba.ts the Final Fantasy II ones; a save with both asks which.
export default defineGame<Ff1GbaSave>({
  id: 'final-fantasy-gba',
  family: 'Final Fantasy',
  games: ['Final Fantasy I'],
  shelf: 'final-fantasy',
  tile: 'Final Fantasy', // listed on the NES tile
  platform: 'Game Boy Advance · US',
  fileHint: 'Dawn of Souls saves are 32,768 bytes (32 KB); 64 KB copies and .sps files open too.',
  colors: { 'Final Fantasy I': '#3b3f9e' },
  icons: { 'Final Fantasy I': 'sprites/ff1/pr/warrior.png' },
  theme: 'gba',
  detect: (data) => {
    const found = detectDawnOfSouls(data, 1);
    if (found === 'ok') return { confidence: 'certain' };
    return found ? { confidence: 'likely', note: 'It looks like a Dawn of Souls save, but none of its files pass the game’s save check.' } : null;
  },
  sampleGame: 'Final Fantasy I · GBA',
  sample: async () => ({ fileName: 'sample-ff-gba.sav', data: (await import('../core/ff1gba/sample.ts')).buildFf1GbaSample() }),
  load: async (data) => new (await import('../core/ff1gba/save.ts')).Ff1GbaSave(data),
  loadEditor: async () => (await import('../ui/editors/ff1gba/index.ts')).mountFf1GbaEditor,
});
