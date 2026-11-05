import { detectDawnOfSouls } from '../core/ff1gba/layout.ts';
import type { Ff1GbaSave } from '../core/ff1gba/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff1GbaSave>({
  id: 'final-fantasy-gba',
  family: 'Final Fantasy',
  games: ['Final Fantasy I & II: Dawn of Souls'],
  platform: 'Game Boy Advance · US',
  editable: 'Every Final Fantasy I file’s party: names, classes, levels, stats, ailments, gear and spells; gil, items, weapons, armor and key items.',
  fileHint: 'Dawn of Souls saves are 32,768 bytes (32 KB); 64 KB copies and .sps files open too.',
  colors: { 'Final Fantasy I & II: Dawn of Souls': '#3b3f9e' },
  icons: { 'Final Fantasy I & II: Dawn of Souls': 'sprites/ff1/gba/warrior.png' },
  theme: 'gba',
  detect: (data) => {
    const found = detectDawnOfSouls(data);
    if (found === 'ok') return { confidence: 'certain' };
    return found ? { confidence: 'likely', note: 'It looks like a Dawn of Souls save, but none of its files pass the game’s save check.' } : null;
  },
  load: async (data) => new (await import('../core/ff1gba/save.ts')).Ff1GbaSave(data),
  loadEditor: async () => (await import('../ui/editors/ff1gba/index.ts')).mountFf1GbaEditor,
});
