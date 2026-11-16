// The Hall of Fame, as every Pokémon game saves it: one team per time the player beat the Elite Four. Shown on the
// Trainer tab and not editable (a made-up entry would only be a trophy the game never earned).

export interface HofMon {
  /** National Dex number. */
  dex: number;
  level: number;
  /** The nickname the Pokémon had, or its species name when it had none. */
  name: string;
  shiny?: boolean;
}

export interface HofEntry {
  /** Which win this was (the game's "No. 3" on the Hall of Fame record), counting from 1. */
  win: number;
  mons: HofMon[];
}

/** The games keep only the newest few entries: Gen 1 and 3 hold 50 teams, Gen 2 holds 30. */
export interface HallOfFame {
  /** Newest first. */
  entries: HofEntry[];
  /** How many the game has recorded in all (more than `entries` once the oldest have been dropped), when the file says. */
  total: number | null;
}
