"use client";

import { Button, Delta, Rail, TBody, TD, TH, THead, TR, Table, railStateForDelta } from "@/components/ui";
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
 *
 * ## Why the table is the shared primitive now
 *
 * This is the individual board, and the team board next to it is a careful copy of the Codeforces
 * standings page. They were two hand-built `<table>`s with different rules, different row heights
 * and different header treatment — on the same screen, ten seconds apart, describing the same
 * contest. `components/ui/DataTable` is the grammar extracted from the good one, so the two now
 * agree by construction rather than by somebody remembering.
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
    <div className="flex min-w-0 flex-col gap-section">
      {standings.frozen && (
        <p
          role="status"
          className="rounded-chip border border-panther px-3 py-2 font-semibold text-panther"
          style={{ fontSize: "var(--text-sm)" }}
        >
          The board is still frozen. These are the standings as of {standings.asOf}, not the
          final result. Unfreeze in the live console first.
        </p>
      )}

      {standings.divisions.map((division) => (
        <Panel
          key={division.divisionId}
          title={division.name}
          level="bare"
          aside={
            <span className="numeric text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              {division.rows.length} competitors
            </span>
          }
        >
          <Podium rows={division.rows.slice(0, 3)} />

          {/*
            `relative` and `min-w-0` are both load-bearing on a scroller — see the note in
            SubmissionFeed. Without `min-w-0` the box never narrows below its content and the
            scroll never engages; without `relative` the `.sr-only` spans inside the rows take
            their static position outside the clip and drag the document sideways at 360px.
          */}
          <div className="relative mt-group w-full min-w-0 overflow-x-auto">
            {/* A width floor, so a phone scrolls the box rather than wrapping a name to four lines. */}
            <Table caption={`Final standings for ${division.name}`} className="min-w-[34rem]">
              <THead>
                <TR>
                  <TH numeric>Rank</TH>
                  <TH>Name</TH>
                  <TH numeric>Score</TH>
                  <TH numeric>Penalty</TH>
                  <TH>Movement</TH>
                </TR>
              </THead>
              <TBody>
                {division.rows.map((row) => (
                  <TR key={row.participantId}>
                    <TD numeric className="whitespace-nowrap">
                      {row.rank}
                      {row.isTied && (
                        <span className="ml-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                          (tie)
                        </span>
                      )}
                    </TD>
                    <TD style={{ fontFamily: "var(--font-display)" }}>{row.displayName}</TD>
                    <TD numeric>{row.score}</TD>
                    <TD numeric>{row.penaltyMinutes}</TD>
                    <TD>
                      {/* Rail carries the same state as the glyph, never colour alone. */}
                      <span className="inline-flex h-4 items-center gap-2">
                        <Rail state={railStateForDelta(row.delta)} />
                        <Delta value={row.delta} />
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Panel>
      ))}

      <Panel
        title="Export"
        level="framed"
        description="An output, never an input. Nothing in this platform reads a spreadsheet back in — that is the manual reconciliation this replaced."
      >
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button type="button" variant="secondary" onClick={exportXlsx}>
            Export XLSX
          </Button>
        </div>
        <p className="mt-group max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-xs)" }}>
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
            className="rounded-panel bg-ink p-4 text-paper"
            style={{
              borderLeft: `var(--rail-width) solid ${
                champion
                  ? "var(--color-gold)"
                  : "color-mix(in srgb, var(--color-paper) 22%, transparent)"
              }`,
              // The champion's step is physically taller, so the ranking survives greyscale.
              order: index,
            }}
          >
            <p
              className="numeric font-bold"
              style={{
                // The place is the loudest thing on the champion's step, and at 28px against
                // 20px the ranking is legible before any colour is read.
                fontSize: champion ? "var(--text-lg)" : "var(--text-md)",
                color: champion ? "var(--color-gold)" : undefined,
              }}
            >
              {PLACE_LABEL[index] ?? `${index + 1}th`}
              {row.isTied && <span style={{ fontSize: "var(--text-xs)" }}> (tie)</span>}
            </p>
            <p
              className="mt-tight"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: champion ? "var(--text-md)" : "var(--text-sm)",
              }}
            >
              {row.displayName}
            </p>
            {/* `text-paper/80`, not `opacity-80`: a wrapper opacity multiplies with child alpha. */}
            <p className="numeric mt-tight text-paper/80" style={{ fontSize: "var(--text-sm)" }}>
              {row.score} pts · {row.penaltyMinutes} min penalty
            </p>
          </li>
        );
      })}
    </ol>
  );
}
