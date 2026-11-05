import { detectFf1Nes } from '../core/ff1nes/layout.ts';
import type { Ff1NesSave } from '../core/ff1nes/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff1NesSave>({
  id: 'final-fantasy-nes',
  family: 'Final Fantasy',
  games: ['Final Fantasy'],
  icons: { 'Final Fantasy': 'sprites/ff1/nes/warrior.png' },
  platform: 'NES · English',
  editable: 'Your party’s names, classes, levels, stats, gear and spells; gold and items; the Orbs, ship, canoe, airship, bridge and canal.',
  fileHint: 'Final Fantasy (NES) saves are 8,192 bytes (8 KB).',
  colors: { 'Final Fantasy': '#b3262d' },
  theme: 'nes',
  detect: (data) => {
    const found = detectFf1Nes(data);
    if (found === 'ok') return { confidence: 'certain' };
    return found ? { confidence: 'likely', note: "It looks like a Final Fantasy save, but it fails the game's save check." } : null;
  },
  sample: async () => ({ fileName: 'sample-final-fantasy.sav', data: (await import('../core/ff1nes/sample.ts')).buildFf1NesSample() }),
  load: async (data) => new (await import('../core/ff1nes/save.ts')).Ff1NesSave(data),
  loadEditor: async () => (await import('../ui/editors/ff1nes/index.ts')).mountFf1NesEditor,
});
