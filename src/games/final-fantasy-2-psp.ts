import { openFf2Psp } from '../core/ff2psp/container.ts';
import type { Ff2PspSave } from '../core/ff2psp/save.ts';
import { defineGame } from '../core/types.ts';

export default defineGame<Ff2PspSave>({
  id: 'final-fantasy-2-psp',
  family: 'Final Fantasy',
  games: ['Final Fantasy II Anniversary Edition'],
  icons: { 'Final Fantasy II Anniversary Edition': 'sprites/ff2/gba/battle/firion.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy II', // listed on the Dawn of Souls tile
  platform: 'PSP · US',
  fileHint: 'Open a zip of the save folder (ULUS1026300, with SAVEDATA.SAV and PARAM.SFO inside), or SAVEDATA.SAV on its own.',
  colors: { 'Final Fantasy II Anniversary Edition': '#6a3b9e' },
  theme: 'psp',
  detect: (data) => (openFf2Psp(data) ? { confidence: 'certain' } : null),
  load: async (data) => new (await import('../core/ff2psp/save.ts')).Ff2PspSave(data),
  loadEditor: async () => (await import('../ui/editors/ff2gba/index.ts')).mountFf2PspEditor,
});
