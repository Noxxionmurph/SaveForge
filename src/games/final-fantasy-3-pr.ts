import { openPr } from '../core/ffpr/file.ts';
import type { PrSave } from '../core/ffpr/save.ts';
import { defineGame } from '../core/types.ts';

const FOLDER = String.raw`Documents\My Games\FINAL FANTASY III PR\Steam`;

export default defineGame<PrSave>({
  id: 'final-fantasy-3-pr',
  family: 'Final Fantasy',
  games: ['Final Fantasy III (Pixel Remaster)'],
  icons: { 'Final Fantasy III (Pixel Remaster)': 'sprites/ff3/pr/onion-knight.png' },
  shelf: 'final-fantasy',
  tile: 'Final Fantasy III', // listed on the Famicom tile
  platform: 'Steam · Pixel Remaster',
  fileHint: `Open a save slot from ${FOLDER}\\ (in the folder of numbers there): the files with long scrambled names.`,
  colors: { 'Final Fantasy III (Pixel Remaster)': '#24609e' },
  theme: 'pr',
  keepFileName: true,
  saveSteps: [
    'Close the game.',
    `Open ${FOLDER}\\ and the folder of numbers in it.`,
    'Copy your old file somewhere safe, then put this one in its place. Its name must stay exactly the same, with no extension.',
    'Start the game. If Steam asks which save to keep, pick the one on this PC.',
  ],
  detect: (data) => (openPr(data)?.game === 'ff3' ? { confidence: 'certain' } : null),
  load: async (data) => {
    const [{ PrSave }, { DATA }] = await Promise.all([import('../core/ffpr/save.ts'), import('../core/ffpr/data-ff3.ts')]);
    return new PrSave(data, DATA);
  },
  loadEditor: async () => (await import('../ui/editors/ffpr/index.ts')).mountPrEditor,
});
