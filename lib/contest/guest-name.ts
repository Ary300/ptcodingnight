/**
 * How a practice guest is named on screen.
 *
 * A guest's participant row needs a unique name ("Guest 6471"), because names are unique per
 * contest, but the organizers asked for the screen to just say "Guest" (2026-11-15). The number
 * stays in the database and drops off here. Pure and client-safe on purpose: the header and the
 * arena board both import it, and `practice-guest.ts` reaches for the database.
 */
const GUEST_PATTERN = /^Guest \d+$/;

export function isGuestName(displayName: string): boolean {
  return GUEST_PATTERN.test(displayName.trim());
}

export function shownName(displayName: string): string {
  return isGuestName(displayName) ? "Guest" : displayName;
}
