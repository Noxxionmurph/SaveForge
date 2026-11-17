import { openFf1Psp } from '../core/ff1psp/container.ts';
import type { Ff1PspSave } from '../core/ff1psp/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff1PspSave>({
  id: 'final-fantasy-psp',
  family: 'Final Fantasy',
  games: ['Final Fantasy Anniversary Edition'],
  icons: { 'Final Fantasy Anniversary Edition': 'sprites/ff1/pr/warrior.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy', // listed on the NES tile
  platform: 'PSP · US',
  fileHint: 'Open a zip of the save folder (ULUS10251DATA00, with SAVE.BIN and PARAM.SFO inside), or SAVE.BIN on its own.',
  colors: { 'Final Fantasy Anniversary Edition': '#2a3f9b' },
  theme: 'psp',
  detect: (data) => {
    const opened = openFf1Psp(data);
    return opened ? { confidence: 'certain' } : null;
  },
  load: async (data) => new (await import('../core/ff1psp/save.ts')).Ff1PspSave(data),
  loadEditor: async () => (await import('../ui/editors/ff1psp/index.ts')).mountFf1PspEditor,
});
