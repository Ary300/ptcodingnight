/**
 * The server's clock, as well as this browser can tell it.
 *
 * Every countdown on the site subtracted `Date.now()` from the end time. A laptop whose clock is two
 * minutes slow showed two minutes left when submissions had already closed, and the student who
 * submitted "with a minute to spare" was told the contest was over; a projector laptop running fast
 * showed "Finished" to the room early. The server decides the cutoff, so the clocks should count
 * against the server.
 *
 * Every response carries an HTTP `Date` header. It has one-second resolution, so a measured
 * difference under two seconds is noise and is ignored; anything larger is a wrong clock and is
 * corrected. Any fetch may report one; the countdowns read `serverNow()`.
 */

/** Below this the header's own rounding and the network round trip dominate. */
const MIN_SKEW_MS = 2_000;

let skewMs = 0;

/** Record what the server's `Date` header said, at the moment the response arrived. */
export function noteServerDate(header: string | null, receivedAtMs: number = Date.now()): void {
  if (header === null) return;
  const serverMs = Date.parse(header);
  if (Number.isNaN(serverMs)) return;
  // The header truncates to the whole second; the middle of that second is the better estimate.
  const measured = serverMs + 500 - receivedAtMs;
  skewMs = Math.abs(measured) >= MIN_SKEW_MS ? measured : 0;
}

/** `Date.now()`, corrected to the server's clock. */
export function serverNow(): number {
  return Date.now() + skewMs;
}

/** Test seam. */
export function resetServerClock(): void {
  skewMs = 0;
}
