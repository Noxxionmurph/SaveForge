import { detectGen3 } from '../core/gen3/layout.ts';
import type { Gen3Save } from '../core/gen3/save.ts';
import { defineGame } from '../core/types.ts';

const GAMES = ['Pokémon FireRed', 'Pokémon LeafGreen'] as const;

// FireRed and LeafGreen use the Ruby / Sapphire editor, with their own save layout (see GEN3_LAYOUTS in layout.ts).
export default defineGame<Gen3Save>({
  id: 'pokemon-frlg',
  family: 'Pokémon',
  games: GAMES,
  platform: 'Game Boy Advance · English',
  // Shown on Ruby and Sapphire's shelf, under their "you can edit" line.
  shelf: 'pokemon-gen3',
  fileHint: 'Pokémon FireRed and LeafGreen (English) saves are 131,072 bytes (128 KB).',
  colors: { 'Pokémon FireRed': '#d9542b', 'Pokémon LeafGreen': '#4f9d3a' },
  // Each box's mascot: Charizard and Venusaur.
  icons: { 'Pokémon FireRed': 'sprites/pokemon/6.png', 'Pokémon LeafGreen': 'sprites/pokemon/3.png' },
  theme: 'gba',
  detect: (data) => (detectGen3(data) === 'frlg' ? { confidence: 'certain' } : null),
  // FireRed and LeafGreen write their saves the same way, and nothing in the file says which cartridge wrote it.
  identify: () => ({
    names: GAMES,
    note: "FireRed and LeafGreen saves are identical inside, so the file can't say which one yours is. Your choice only changes the name shown here; the editor works the same either way.",
  }),
  load: async (data) => new (await import('../core/gen3/save.ts')).Gen3Save(data, 'frlg'),
  loadEditor: async () => (await import('../ui/editors/gen3/index.ts')).mountGen3Editor,
});
