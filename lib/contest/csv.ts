import type { StandingsResponse } from "@/lib/schemas/api";

/**
 * CSV export.
 *
 * The spreadsheet is an **output**, never an input (docs/PRD.md §9.2). Nothing reads this
 * format back; it exists so the results can still land in a spreadsheet for anyone who wants
 * one, without the platform ever trusting what comes out of it.
 */

const HEADER = [
  "division",
  "rank",
  "tied",
  "participantId",
  "displayName",
  "score",
  "penaltyMinutes",
] as const;

/**
 * Neutralize a field that a spreadsheet would evaluate as a formula.
 *
 * A display name of `=HYPERLINK(...)` is a real thing a high schooler will try, and Excel runs
 * it on open. Prefixing with an apostrophe is the standard defence and survives the round trip
 * as text.
 */
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeField(value: string | number | boolean): string {
  const raw = typeof value === "string" ? neutralize(value) : String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

function row(fields: readonly (string | number | boolean)[]): string {
  return fields.map(escapeField).join(",");
}

/**
 * Render standings as CSV, divisions in the order the response carries them and rows in rank
 * order. CRLF line endings: Excel is the consumer and it is the one that cares.
 */
export function standingsToCsv(standings: StandingsResponse): string {
  const lines: string[] = [row(HEADER)];

  for (const division of standings.divisions) {
    for (const entry of division.rows) {
      lines.push(
        row([
          division.name,
          entry.rank,
          entry.isTied,
          entry.participantId,
          entry.displayName,
          entry.score,
          entry.penaltyMinutes,
        ]),
      );
    }
  }

  return `${lines.join("\r\n")}\r\n`;
}

/** `park-tudor-standings-2026-07-29T18-30-00Z.csv` — sortable, and safe in a Windows filename. */
export function exportFilename(contestName: string, asOf: string): string {
  const slug = contestName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  const stamp = asOf.replaceAll(":", "-");
  return `${slug === "" ? "contest" : slug}-standings-${stamp}.csv`;
}
