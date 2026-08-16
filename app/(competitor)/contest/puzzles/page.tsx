import type { Metadata } from "next";

import { PuzzleBoard } from "@/components/contest/puzzles/PuzzleBoard";

export const metadata: Metadata = {
  title: "Puzzles | Coding Night",
};

/**
 * `/contest/puzzles` — the puzzles anybody can do.
 *
 * Added because the organizer asked for something easier than a judged problem: decoding binary,
 * a cipher, a sudoku. A student who has not written a program yet can still put points on their
 * team's board, which is the whole reason these are here rather than in a corner of the lobby.
 */
export default function PuzzlesPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
          Puzzles
        </h1>
        <p className="mt-1 max-w-[70ch] text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
          No programming. Read the puzzle, type the answer, and your team gets the points.
        </p>
      </header>

      <PuzzleBoard />
    </div>
  );
}
