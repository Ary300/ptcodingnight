/**
 * Every clock a person reads on this platform shows the EVENT's timezone, pinned.
 *
 * The contest happens in one room in Indianapolis. Before this module, a timestamp's timezone
 * depended on which code path rendered it: client components used the viewer's browser (usually
 * right, wrong on any misconfigured Chromebook), server components used the box (UTC in
 * production), and two admin screens printed literal UTC with a label arguing that at least it
 * said so. The organizer read 23:41 on a screen at half past seven and overruled the argument:
 * every displayed time is Eastern now.
 *
 * `America/Indiana/Indianapolis` rather than a fixed offset, so DST is the library's problem, and
 * rather than `America/New_York` only for honesty about which city this is; they agree on every
 * date that matters here.
 *
 * Storage is untouched: rows keep UTC instants and the wire keeps ISO-8601. This module is the
 * LAST step before an eyeball, never an input to arithmetic.
 */

export const EVENT_TIME_ZONE = "America/Indiana/Indianapolis";

function parse(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "7:41 PM" - the clock a student glances at. */
export function formatEventTime(value: string | Date): string {
  const date = parse(value);
  if (date === null) return typeof value === "string" ? value : "";
  return date.toLocaleTimeString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "7:41:09 PM" - the console's action log, where seconds order the entries. */
export function formatEventTimeSeconds(value: string | Date): string {
  const date = parse(value);
  if (date === null) return typeof value === "string" ? value : "";
  return date.toLocaleTimeString("en-US", {
    timeZone: EVENT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** { date: "2026-08-02", time: "7:41 PM" } - for tables that column the two apart. */
export function formatEventDateParts(value: string | Date): { date: string; time: string } {
  const date = parse(value);
  if (date === null) {
    return { date: typeof value === "string" ? value : "", time: "" };
  }
  const day = date.toLocaleDateString("en-CA", { timeZone: EVENT_TIME_ZONE });
  return { date: day, time: formatEventTime(date) };
}

/** "2026-08-02 7:41 PM ET" - a stamp for exports and printed sheets. */
export function formatEventStamp(value: string | Date): string {
  const date = parse(value);
  if (date === null) return typeof value === "string" ? value : "";
  const parts = formatEventDateParts(date);
  return `${parts.date} ${parts.time} ET`;
}
