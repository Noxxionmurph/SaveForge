// Legendary and other one-off Pokémon that wait in one spot in the overworld (and the roaming ones in Gen 2). Once one
// has been battled (knocked out, caught, or in some games just run from) the game hides it for good. Each game's
// module lists its own with the flags that do the hiding; bringing one back clears them, so the game shows it again
// the next time you go there.

export interface Legend {
  name: string;
  /** Where it waits. */
  place: string;
  /** National Dex numbers for its icon (two when it's one or the other, like Latias or Latios). */
  dex: readonly number[];
  /** Shown shiny (the red Gyarados). */
  shiny?: boolean;
  /** Something to know before you go back for it (shown under its name). */
  note?: string;
}

/** What a save offers the shared Legendary Pokémon card. */
export interface LegendSave {
  readonly legends: readonly Legend[];
  /** Whether it was gone in the file as opened. */
  legendGone(i: number): boolean;
  /** Per legend, whether saving brings it back. Only ones that are gone can be. */
  bringBack: boolean[];
}

/** The review-dialog lines for the legends being brought back. */
export function legendLines(s: LegendSave): string[] {
  return s.legends.filter((_, i) => s.bringBack[i] && s.legendGone(i)).map((l) => `Bring back ${l.name} (${l.place})`);
}
