"use client";

import { Button, Delta, Rail, railStateForDelta } from "@/components/ui";
import { Panel } from "@/components/admin/Panel";
import {
  downloadBlob,
  safeFilename,
  standingsToRows,
  toCsv,
  toXlsx,
} from "@/components/admin/export";
import type { StandingsResponse } from "@/lib/schemas/api";

/**
 * Awards screen: final standings per division, a top-3 podium, and one-click export
 * (PRD §9.2).
 *
 * The podium inverts to `--ink` for one reason — `--gold` is the champion colour and it
 * measures 1.39 on `--paper`, which is unreadable. On ink it is 13.44. That is the whole
 * justification for the surface change; it is not decoration (DESIGN.md §2).
 *
 * Ties are shown as ties. PRD §6.1 is explicit that a remaining tie is never broken
 * arbitrarily, so two people can share a step of the podium.
 */

const PLACE_LABEL = ["1st", "2nd", "3rd"] as const;

export interface AwardsBoardProps {
  standings: StandingsResponse;
  contestName: string;
}

export function AwardsBoard({ standings, contestName }: AwardsBoardProps) {
  const rows = standingsToRows(standings);

  const exportCsv = (): void => {
    downloadBlob(safeFilename(contestName, "csv"), toCsv(rows), "text/csv;charset=utf-8");
  };

  const exportXlsx = (): void => {
    downloadBlob(
      safeFilename(contestName, "xlsx"),
      toXlsx(rows),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {standings.frozen && (
        <p role="status" className="rounded border border-panther px-3 py-2 font-semibold text-panther">
          The board is still frozen. These are the standings as of {standings.asOf}, not the
          final result. Unfreeze in the live console first.
        </p>
      )}

      {standings.divisions.map((division) => (
        <Panel
          key={division.divisionId}
          title={division.name}
          aside={
            <span className="numeric opacity-70" style={{ fontSize: "var(--text-xs)" }}>
              {division.rows.length} competitors
            </span>
          }
        >
          <Podium rows={division.rows.slice(0, 3)} />

          <table className="mt-6 w-full border-collapse" style={{ fontSize: "var(--text-sm)" }}>
            <caption className="sr-only">Final standings for {division.name}</caption>
            <thead>
              <tr className="border-b border-ink/20 text-left">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Rank
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Name
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Score
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Penalty
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Movement
                </th>
              </tr>
            </thead>
            <tbody>
              {division.rows.map((row) => (
                <tr key={row.participantId} className="border-b border-ink/10">
                  <td className="numeric py-2 pr-3">
                    {row.rank}
                    {row.isTied && (
                      <span className="ml-1 opacity-70" style={{ fontSize: "var(--text-xs)" }}>
                        (tie)
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3" style={{ fontFamily: "var(--font-display)" }}>
                    {row.displayName}
                  </td>
                  <td className="numeric py-2 pr-3 text-right">{row.score}</td>
                  <td className="numeric py-2 pr-3 text-right">{row.penaltyMinutes}</td>
                  <td className="py-2">
                    {/* Rail carries the same state as the glyph, never colour alone. */}
                    <span className="inline-flex h-4 items-center gap-2">
                      <Rail state={railStateForDelta(row.delta)} />
                      <Delta value={row.delta} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}

      <Panel
        title="Export"
        description="An output, never an input. Nothing in this platform reads a spreadsheet back in - that is the manual reconciliation this replaced."
      >
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button type="button" variant="secondary" onClick={exportXlsx}>
            Export XLSX
          </Button>
        </div>
        <p className="mt-3 max-w-[70ch] opacity-75" style={{ fontSize: "var(--text-xs)" }}>
          Both files are generated in the browser from the standings the scoring engine
          produced. No network call, so this still works with the school Wi-Fi down.
        </p>
      </Panel>
    </div>
  );
}

function Podium({ rows }: { rows: StandingsResponse["divisions"][number]["rows"] }) {
  if (rows.length === 0) return null;

  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {rows.map((row, index) => {
        const champion = index === 0;
        return (
          <li
            key={row.participantId}
            className="rounded bg-ink p-4 text-paper"
            style={{
              borderLeft: `var(--rail-width) solid ${
                champion ? "var(--color-gold)" : "color-mix(in srgb, var(--color-paper) 22%, transparent)"
              }`,
              // The champion's step is physically taller, so the ranking survives greyscale.
              order: index,
            }}
          >
            <p
              className="numeric font-bold"
              style={{
                fontSize: champion ? "var(--text-lg)" : "var(--text-md)",
                color: champion ? "var(--color-gold)" : undefined,
              }}
            >
              {PLACE_LABEL[index] ?? `${index + 1}th`}
              {row.isTied && <span style={{ fontSize: "var(--text-xs)" }}> (tie)</span>}
            </p>
            <p
              className="mt-1"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: champion ? "var(--text-md)" : "var(--text-sm)",
              }}
            >
              {row.displayName}
            </p>
            <p className="numeric mt-1 opacity-80" style={{ fontSize: "var(--text-sm)" }}>
              {row.score} pts · {row.penaltyMinutes} min penalty
            </p>
          </li>
        );
      })}
    </ol>
  );
}
