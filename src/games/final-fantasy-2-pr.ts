import { openPr } from '../core/ffpr/file.ts';
import type { PrSave } from '../core/ffpr/save.ts';
import { defineGame } from '../core/types.ts';

const FOLDER = String.raw`Documents\My Games\FINAL FANTASY II PR\Steam`;

export default defineGame<PrSave>({
  id: 'final-fantasy-2-pr',
  family: 'Final Fantasy',
  games: ['Final Fantasy II (Pixel Remaster)'],
  icons: { 'Final Fantasy II (Pixel Remaster)': 'sprites/ff2/pr/firion.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy II', // listed on the Dawn of Souls tile
  platform: 'Steam · Pixel Remaster',
  fileHint: `Open a save slot from ${FOLDER}\\ (in the folder of numbers there): the files with long scrambled names.`,
  colors: { 'Final Fantasy II (Pixel Remaster)': '#5a3fb0' },
  theme: 'pr',
  keepFileName: true,
  saveSteps: [
    'Close the game.',
    `Open ${FOLDER}\\ and the folder of numbers in it.`,
    'Copy your old file somewhere safe, then put this one in its place. Its name must stay exactly the same, with no extension.',
    'Start the game. If Steam asks which save to keep, pick the one on this PC.',
  ],
  detect: (data) => (openPr(data)?.game === 'ff2' ? { confidence: 'certain' } : null),
  load: async (data) => {
    const [{ PrSave }, { DATA }] = await Promise.all([import('../core/ffpr/save.ts'), import('../core/ffpr/data-ff2.ts')]);
    return new PrSave(data, DATA);
  },
  loadEditor: async () => (await import('../ui/editors/ffpr/index.ts')).mountPrEditor,
});
