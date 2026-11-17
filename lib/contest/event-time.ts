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

/**
 * "2026-11-18_19-41-09" in the event zone, for a FILENAME. Sortable, 24-hour, and free of the
 * colons Windows refuses. Exports used to stamp the UTC instant, so a file saved at 7:41 PM in the
 * room read 00-41 the next day.
 */
export function eventFileStamp(value: string | Date): string {
  const date = parse(value);
  if (date === null) return "undated";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}-${get("minute")}-${get("second")}`;
}

/** "2026-11-18 7:41:09 PM ET": a stamp with seconds, for an export column where order matters. */
export function formatEventStampSeconds(value: string | Date): string {
  const date = parse(value);
  if (date === null) return typeof value === "string" ? value : "";
  const day = date.toLocaleDateString("en-CA", { timeZone: EVENT_TIME_ZONE });
  return `${day} ${formatEventTimeSeconds(date)} ET`;
}

/*
  The other direction: an organizer types "7:00 PM" and means 7:00 PM in Indianapolis.

  `new Date("2026-11-18T19:00")` resolves the text in the BROWSER's zone. That is right only on a
  laptop set to Eastern, and Indiana is a state where a laptop set to Central is ordinary, so the
  same form on two organizers' machines created contests an hour apart. These convert in the event
  zone whatever the browser says.
*/

/** The zone's offset from UTC at `instant`, in ms (negative west of Greenwich). */
function eventZoneOffsetMs(instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * "2026-11-18T19:00" read as wall-clock time in the event zone, as an instant. Null when the text
 * is not that shape. A time that does not exist (the spring-forward hour) lands an hour later, the
 * way a wall clock would.
 */
export function eventWallClockToInstant(local: string): Date | null {
  const match = WALL_CLOCK.exec(local);
  if (match === null) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number) as [number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - eventZoneOffsetMs(guess);
  // Read the offset again at the candidate: it differs only when the guess straddled a DST change.
  return new Date(guess - eventZoneOffsetMs(first));
}

/** The inverse, for prefilling a `datetime-local` field: "2026-11-18T19:00". */
export function instantToEventWallClock(value: string | Date): string {
  const date = parse(value);
  if (date === null) return "";
  const shifted = new Date(date.getTime() + eventZoneOffsetMs(date.getTime()));
  return shifted.toISOString().slice(0, 16);
}
