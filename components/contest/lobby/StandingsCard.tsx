import { Delta, Rail, railStateForDelta } from "@/components/ui";
import type { StandingsResponse } from "@/lib/schemas/api";

/**
 * A compact standings panel for the competitor lobby. The projector owns the monumental
 * version; this is the "where am I" glance.
 *
 * **It is dark because it has to be.** `--rise`, `--fall` and `--gold` all fail AA on
 * `--paper` (docs/DESIGN.md §2), and the rail's resting state is `--paper` at 22% — a rank
 * board on a light background would either be illegible or would have to drop the colour
 * channel entirely. Bringing the `--ink` surface with it keeps the same visual language the
 * room is watching on the projector.
 *
 * Rank movement is glyph (`<Delta>`) plus rail plus position. Remove the colour and it still
 * reads — that is the test in DESIGN.md §3.
 */

export interface StandingsCardProps {
  standings: StandingsResponse;
  /** Highlights "you". Null before joining. */
  participantId: string | null;
}

export function StandingsCard({ standings, participantId }: StandingsCardProps) {
  const divisions = standings.divisions;

  if (divisions.length === 0) {
    return null;
  }

  return (
    <section aria-label="Standings" className="rounded bg-ink p-4 text-paper">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          Standings
        </h2>
        {standings.frozen && (
          <span
            className="px-2 py-0.5 font-bold uppercase"
            style={{
              background: "var(--color-gold)",
              color: "var(--color-ink)",
              fontSize: "var(--text-xs)",
              letterSpacing: "0.08em",
            }}
          >
            Board frozen
          </span>
        )}
      </header>

      {standings.frozen && (
        <p className="mt-2 text-paper/60" style={{ fontSize: "var(--text-xs)" }}>
          Positions are still moving underneath. You will see them at the reveal.
        </p>
      )}

      {divisions.map((division) => (
        <div key={division.divisionId} className="mt-4">
          <h3 className="text-paper/60 uppercase" style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}>
            {division.name}
          </h3>

          <table className="mt-2 w-full border-collapse">
            <caption className="sr-only">
              {division.name} standings{standings.frozen ? ", frozen" : ""}
            </caption>
            <thead>
              <tr className="text-paper/50" style={{ fontSize: "var(--text-xs)" }}>
                <th scope="col" className="w-2" />
                <th scope="col" className="py-1 text-left font-normal">
                  Rank
                </th>
                <th scope="col" className="py-1 text-left font-normal">
                  Name
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Move
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Score
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  Penalty
                </th>
              </tr>
            </thead>
            <tbody>
              {division.rows.map((row) => {
                const isYou = participantId !== null && row.participantId === participantId;
                return (
                  <tr
                    key={row.participantId}
                    className="border-t border-paper/10"
                    style={{ background: isYou ? "color-mix(in srgb, var(--color-paper) 8%, transparent)" : undefined }}
                  >
                    <td className="py-1.5">
                      <span className="flex h-full items-stretch">
                        <Rail state={railStateForDelta(row.delta)} />
                      </span>
                    </td>
                    <td className="numeric py-1.5 pl-2" style={{ fontSize: "var(--text-sm)" }}>
                      {row.rank}
                      {row.isTied && <span className="text-paper/45">=</span>}
                    </td>
                    <td
                      className="py-1.5 pl-2 font-display"
                      style={{ fontSize: "var(--text-sm)" }}
                    >
                      {row.displayName}
                      {isYou && (
                        <span className="ml-2 font-body text-paper/55" style={{ fontSize: "var(--text-xs)" }}>
                          you
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right" style={{ fontSize: "var(--text-sm)" }}>
                      <Delta value={row.delta} />
                    </td>
                    <td className="numeric py-1.5 pl-2 text-right" style={{ fontSize: "var(--text-sm)" }}>
                      {row.score}
                    </td>
                    <td className="numeric py-1.5 pl-2 text-right text-paper/55" style={{ fontSize: "var(--text-sm)" }}>
                      {row.penaltyMinutes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
