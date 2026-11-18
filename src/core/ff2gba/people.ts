// Final Fantasy II's party members by the character id every version keeps: the three heroes, then the people who
// travel with them for a while in the fourth place.

export const GUEST_NAMES = ['Firion', 'Maria', 'Guy', 'Minwu', 'Josef', 'Gordon', 'Leila', 'Ricard', 'Leon'] as const;
/** The character ids of the people who can be in the fourth place (Minwu ... Leon). */
export const GUESTS = [3, 4, 5, 6, 7, 8] as const;
export const isGuest = (id: number) => id >= 3 && id <= 8;
/** For the review list: who is in the fourth place, by character id or null. */
export const guestName = (id: number | null) => (id === null ? 'Nobody' : GUEST_NAMES[id] ?? `Character ${id}`);
