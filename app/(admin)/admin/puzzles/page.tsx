import { PuzzleManager } from "@/components/admin/PuzzleManager";
import { adminPuzzleList } from "@/lib/contest/puzzles";

/**
 * `/admin/puzzles` — the browser puzzles, and the switch that shows or hides each one.
 *
 * Top level rather than a tab of a contest, for the same reason the problem bank is: a puzzle has
 * no contest. Decoding binary is decoding binary in any division on any night, and the points it
 * pays reach the board through the contest the solver's team is already in.
 *
 * Built because the API existed and no screen did. Two things in this project have shipped as an
 * organizer screen that could not be reached by clicking, and both times the feature behind it was
 * effectively absent on the night.
 */
export default async function AdminPuzzlesPage() {
  const puzzles = await adminPuzzleList();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-xl)" }}>
          Puzzles
        </h1>
        <p className="mt-1 max-w-[62ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          Binary, ciphers, sudoku. A student solves one in the browser with no code and no compiler,
          and it pays their whole team once, the same way the metal puzzle does. Each teammate gets
          the puzzle for their own set letter, so a team of four works four different puzzles.
          Students find them under <strong>Puzzles</strong> during a contest.
        </p>
      </header>

      <PuzzleManager initial={puzzles} />
    </div>
  );
}
