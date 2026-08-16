/**
 * The code wall's layout arithmetic. PURE — no database, no clock, and that is load-bearing.
 *
 * The wall is a client component, so anything it imports is bundled for the browser. The first
 * draft of this file held both the paging math and the Prisma read, and importing it from the
 * component pulled `pg` into the browser bundle and failed with `Can't resolve 'dns'`. The read
 * lives in `lib/contest/join-code.ts` with the rest of the code handling; this half is the part
 * both sides need.
 *
 * ## What the wall is, and what conventions it follows
 *
 * The organizer asked to project the join codes rather than hand out paper, so a room can find its
 * own codes instead of queueing at one desk. How screens like that are usually built:
 *
 * - **A to Z by name, PAGED rather than scrolled.** A room cannot scroll, and every reader is
 *   looking for exactly one row: their own. Alphabetical order plus a stated letter range per page
 *   ("A to E") is the departure-board answer — a student who sees the range knows whether to look
 *   now or wait. Event check-in tools reach for search first for the same reason, and search is
 *   still the right tool at the desk, which is what the roster screen is for.
 * - **Few rows per page.** Digital-signage guidance is to rotate short uncluttered pages rather
 *   than shrink type to fit. Two dozen seats at projector sizes beats a hundred at a size nobody
 *   can read from the back of a classroom.
 * - **A code stops being shown once its seat is IN.** The list shrinks toward zero as the room
 *   fills, so the wall doubles as a "who is still missing" board, and a projected code is readable
 *   for less time. Whoever is already signed in does not need theirs, and an organizer can still
 *   read it off the roster or a printed slip.
 *
 * **The tradeoff, stated plainly: a projected code is a code the whole room can type.** A join code
 * is an identity claim and nothing more, so anybody who reads somebody else's off the wall can sign
 * in as them. That cost is accepted deliberately for a club night where the alternative is forty
 * students queueing at one desk, and it is bounded three ways: codes disappear as seats fill, the
 * screen has a one-key blackout, and any code can be reissued from the roster the moment one is
 * misused.
 */

/**
 * Seats per page.
 *
 * Twenty-four, because it fills BOTH projector resolutions without a page that ends in a gap: the
 * grid is four columns at 1280x720, where 24 is exactly six rows, and five columns at 1920x1080,
 * where it is five rows with a short last one. Measured against the card height at each scale, a
 * sixth row overflows 720p and a fourth wastes half of 1080p.
 *
 * Fixed rather than measured from the viewport: a page count that changes as the browser settles
 * makes the rotation jump, and what the room is reading is position.
 */
export const CODE_WALL_PAGE_SIZE = 24;

/**
 * Split a list into fixed-size pages.
 *
 * An empty list yields NO pages rather than one empty page, because "page 1 of 1" over an empty
 * screen tells the room something false.
 */
export function paginateSeats<T>(
  seats: readonly T[],
  pageSize: number = CODE_WALL_PAGE_SIZE,
): readonly (readonly T[])[] {
  if (pageSize < 1) throw new RangeError("pageSize must be at least 1");
  const pages: T[][] = [];
  for (let index = 0; index < seats.length; index += pageSize) {
    pages.push(seats.slice(index, index + pageSize));
  }
  return pages;
}

/**
 * The letter range a page covers, as a room reads it: `A to E`, or just `A` when it is one letter.
 *
 * This is what makes a rotating board usable rather than a lottery. A student sees that their own
 * initial is two pages away and waits instead of hunting. A name starting with something other than
 * a letter contributes that character, and an empty name contributes nothing rather than a blank
 * that would sort ahead of every person.
 */
export function initialRange(names: readonly string[]): string {
  const initials = names
    .map((name) => name.trim().charAt(0).toUpperCase())
    .filter((initial) => initial !== "");
  if (initials.length === 0) return "";
  const first = initials[0] ?? "";
  const last = initials[initials.length - 1] ?? "";
  return first === last ? first : `${first} to ${last}`;
}

/**
 * A stable A-to-Z comparator for the names on the wall.
 *
 * `localeCompare` with no locale argument follows the machine's, so the same roster could page
 * differently on the projector laptop than on the organizer's. Lower-cased code-unit order with the
 * seat id as the tie-break is boring, deterministic, and identical everywhere.
 */
export function byDisplayName(
  a: { readonly displayName: string; readonly participantId: string },
  b: { readonly displayName: string; readonly participantId: string },
): number {
  const left = a.displayName.toLowerCase();
  const right = b.displayName.toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
}
