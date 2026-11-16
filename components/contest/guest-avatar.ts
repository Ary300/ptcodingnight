/**
 * The pattern behind a practice guest's avatar: a 5 by 5 grid, mirrored left to right, derived
 * from the guest's participant id.
 *
 * Every guest is called "Guest" on screen (the organizers' call), so an initial in a disc made
 * every guest's picture the same red "G". The pattern gives each guest a mark of their own that
 * survives a reload, because it is a function of the id and nothing else: no randomness, no
 * clock, no storage.
 *
 * Pure and client-safe, so the unit test pins determinism and symmetry directly.
 */

export const GRID_SIZE = 5;

/** The two inks a mark may be drawn in, both on a `--paper` tile. */
export type GuestMarkTone = "panther" | "ink";

export interface GuestMark {
  /** `cells[row][column]`, true where a square is drawn. Always mirror-symmetric. */
  readonly cells: readonly (readonly boolean[])[];
  readonly tone: GuestMarkTone;
}

/** FNV-1a, 32-bit. Small, stable across engines, and spreads short ids well enough for a picture. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Fewer drawn squares than this reads as a broken image rather than a mark. */
const MIN_FILLED_HALF_CELLS = 5;

export function guestMark(seed: string): GuestMark {
  const hash = fnv1a(seed);
  const half = Math.ceil(GRID_SIZE / 2);

  // Fifteen bits pick the left three columns; the right two mirror them.
  let bits = hash & 0x7fff;
  const filled = bits.toString(2).split("").filter((bit) => bit === "1").length;
  // A sparse pattern is inverted instead of rejected, which keeps the mapping a pure function.
  if (filled < MIN_FILLED_HALF_CELLS) bits = ~bits & 0x7fff;

  const cells = Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, column) => {
      const sourceColumn = column < half ? column : GRID_SIZE - 1 - column;
      const bit = row * half + sourceColumn;
      return ((bits >>> bit) & 1) === 1;
    }),
  );

  return { cells, tone: ((hash >>> 15) & 1) === 1 ? "panther" : "ink" };
}
