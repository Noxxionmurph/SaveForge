import { openFf3Psp } from '../core/ff3psp/container.ts';
import type { Ff3PspSave } from '../core/ff3psp/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff3PspSave>({
  id: 'final-fantasy-3-psp',
  family: 'Final Fantasy',
  games: ['Final Fantasy III (PSP)'],
  icons: { 'Final Fantasy III (PSP)': 'sprites/ff3/nes/onion-kid.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy III', // listed on the Famicom tile
  platform: 'PSP · US',
  fileHint: 'Open a zip of the save folder (NPUH10125DATA02 or similar, with PLAYDATA.BIN and PARAM.SFO inside), or PLAYDATA.BIN on its own.',
  colors: { 'Final Fantasy III (PSP)': '#2f5d8a' },
  theme: 'psp',
  detect: (data) => (openFf3Psp(data) ? { confidence: 'certain' } : null),
  load: async (data) => new (await import('../core/ff3psp/save.ts')).Ff3PspSave(data),
  loadEditor: async () => (await import('../ui/editors/ff3ds/index.ts')).mountFf3PspEditor,
});
