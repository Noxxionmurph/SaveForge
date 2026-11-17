import { detectFf3Nes } from '../core/ff3nes/layout.ts';
import type { Ff3NesSave } from '../core/ff3nes/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff3NesSave>({
  id: 'final-fantasy-3-nes',
  family: 'Final Fantasy',
  games: ['Final Fantasy III'],
  icons: { 'Final Fantasy III': 'sprites/ff3/nes/onion-kid.png' }, // Luneth, the first party member, in battle
  shelf: 'final-fantasy',
  platform: 'Famicom · English patch',
  fileHint: 'Final Fantasy III (Famicom) saves are 8,192 bytes (8 KB).',
  colors: { 'Final Fantasy III': '#1f6f8b' },
  theme: 'nes',
  detect: (data) => {
    const found = detectFf3Nes(data);
    if (found === 'ok') return { confidence: 'certain' };
    return found ? { confidence: 'likely', note: "It looks like a Final Fantasy III save, but it fails the game's save check." } : null;
  },
  load: async (data) => new (await import('../core/ff3nes/save.ts')).Ff3NesSave(data),
  loadEditor: async () => (await import('../ui/editors/ff3nes/index.ts')).mountFf3NesEditor,
});
