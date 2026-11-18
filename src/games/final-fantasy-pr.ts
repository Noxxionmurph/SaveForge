import { openPr } from '../core/ffpr/file.ts';
import type { PrSave } from '../core/ffpr/save.ts';
import { defineGame } from '../core/types.ts';

const FOLDER = String.raw`Documents\My Games\FINAL FANTASY PR\Steam`;

export default defineGame<PrSave>({
  id: 'final-fantasy-pr',
  family: 'Final Fantasy',
  games: ['Final Fantasy (Pixel Remaster)'],
  icons: { 'Final Fantasy (Pixel Remaster)': 'sprites/ff1/pr/warrior.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy', // listed on the NES tile
  platform: 'Steam · Pixel Remaster',
  fileHint: `Open a save slot from ${FOLDER}\\ (in the folder of numbers there; if OneDrive backs up your PC, Documents is in OneDrive): the files with long scrambled names.`,
  colors: { 'Final Fantasy (Pixel Remaster)': '#2c4db4' },
  theme: 'pr',
  keepFileName: true,
  saveSteps: [
    'Close the game.',
    `Open ${FOLDER}\\ (Documents may be in OneDrive) and the folder of numbers in it.`,
    'Copy your old file somewhere safe, then put this one in its place. Its name must stay exactly the same, with no extension.',
    'Start the game. If Steam asks which save to keep, pick the one on this PC.',
  ],
  detect: (data) => (openPr(data)?.game === 'ff1' ? { confidence: 'certain' } : null),
  load: async (data) => {
    const [{ PrSave }, { DATA }] = await Promise.all([import('../core/ffpr/save.ts'), import('../core/ffpr/data-ff1.ts')]);
    return new PrSave(data, DATA);
  },
  loadEditor: async () => (await import('../ui/editors/ffpr/index.ts')).mountPrEditor,
});
