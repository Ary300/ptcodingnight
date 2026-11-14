"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui";
import { API_ROUTES, AdminPuzzleListSchema, type AdminPuzzleRow } from "@/lib/schemas/api";

/**
 * The organizer's control over the browser puzzles: what is open, and what each one has paid.
 *
 * There is one switch per puzzle and nothing else, because there is nothing else to decide. A
 * puzzle's text and its points are authored in `scripts/seed-puzzles.ts` and reviewed there; the
 * only thing that has to be changeable in the middle of a room full of students is whether a
 * puzzle is showing.
 *
 * ## Hiding is not deleting, and the screen says so
 *
 * A team that has already been paid keeps its points. That matters because the reason to hide a
 * puzzle mid-contest is usually that it turned out to be broken or that the answer got shouted
 * across the room — and in both cases the organizer is about to wonder whether the fix just took
 * points away from four teams. It did not, and the copy answers it before it is asked.
 *
 * ## The seat column
 *
 * A puzzle belongs to a seat (a set letter) or to everyone. The brief is one puzzle per team
 * member, so the four lettered puzzles are the default night and the open ones are bonuses an
 * organizer can show. The letter is authored in the seed and shown here read-only, because the
 * decision an organizer makes in the room is still only whether a puzzle is showing.
 */
export function PuzzleManager({ initial }: { initial: readonly AdminPuzzleRow[] }) {
  const [rows, setRows] = useState<readonly AdminPuzzleRow[]>(initial);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async (slug: string, active: boolean): Promise<void> => {
    setBusySlug(slug);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.adminPuzzles, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, active }),
      });
      const payload: unknown = await response.json();
      const data =
        typeof payload === "object" && payload !== null && "data" in payload
          ? (payload as { data: unknown }).data
          : null;
      if (!response.ok) {
        setError("That did not save. The puzzle is still as it was.");
        return;
      }
      // The route answers with the whole list, so the row and its solve count come back from the
      // same read that performed the change rather than from a local guess about the new state.
      setRows(AdminPuzzleListSchema.parse(data).puzzles);
    } catch {
      setError("Could not reach the server. The puzzle is still as it was.");
    } finally {
      setBusySlug(null);
    }
  }, []);

  const open = rows.filter((row) => row.active).length;
  const seatsShowing = rows.filter((row) => row.active && row.forSetLabel !== null).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
        <span className="numeric font-semibold text-ink">{open}</span> of{" "}
        {/*
          The space after this span is written as an expression, not as literal text. A leading
          space on a text node that then wraps to a second source line is compiled away, which
          reads as "6 of 6showing" — a rendering bug with no compiler warning behind it.
        */}
        <span className="numeric">{rows.length}</span>{" "}
        showing on the students&rsquo; puzzle page,{" "}
        <span className="numeric font-semibold text-ink">{seatsShowing}</span>{" "}
        of them for one seat each. A student sees their own seat&rsquo;s puzzle and any open to
        everyone. Hiding one keeps every point it has already paid.
      </p>

      {error !== null && (
        <p role="alert" className="font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}

      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Every puzzle, which seat it belongs to, whether it is showing, and how many teams have
          solved it
        </caption>
        <thead>
          <tr className="border-b border-rule-edge text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Puzzle
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Topic
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              Seat
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-semibold">
              Points
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-semibold">
              Teams solved
            </th>
            <th scope="col" className="py-2 font-semibold">
              Showing
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.slug} className="border-b border-rule-edge/60">
              <th scope="row" className="py-3 pr-4 font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                {row.title}
              </th>
              <td className="py-3 pr-4 text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
                {row.topic}
              </td>
              <td className="py-3 pr-4" style={{ fontSize: "var(--text-sm)" }}>
                {row.forSetLabel === null ? (
                  <span className="text-ink/70">Everyone</span>
                ) : (
                  <span className="numeric font-semibold">{row.forSetLabel}</span>
                )}
              </td>
              <td className="numeric py-3 pr-4 text-right" style={{ fontSize: "var(--text-sm)" }}>
                {row.points}
              </td>
              <td className="numeric py-3 pr-4 text-right" style={{ fontSize: "var(--text-sm)" }}>
                {row.solveCount}
              </td>
              <td className="py-3">
                <Button
                  variant={row.active ? "quiet" : "primary"}
                  disabled={busySlug === row.slug}
                  onClick={() => void toggle(row.slug, !row.active)}
                >
                  {/* The button says what will happen, and it keeps that name in both states. */}
                  {row.active ? "Hide" : "Show"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          No puzzles are loaded. Run <code>npx tsx scripts/seed-puzzles.ts</code> to load them.
        </p>
      )}
    </div>
  );
}
