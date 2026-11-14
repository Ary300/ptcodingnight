import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { invalidateScoringInput } from "@/lib/contest/standings";

/**
 * Browser puzzles: decode the binary, finish the sudoku, break the cipher.
 *
 * The organizer asked for something easier than a judged problem, for students who are not
 * fluent in a language yet. These need no compiler, no stdin and no test data, and they pay out
 * as `TeamSideActivity` awards, which is the same currency the physical side activities already
 * use. The scoring engine therefore knows nothing about puzzles and needs no change.
 *
 * ## The rules that keep the points honest
 *
 * - ONE AWARD PER TEAM per puzzle, enforced by a unique index rather than by a check-then-write.
 *   Two teammates racing to submit the same answer is the normal case, not the edge case.
 * - The answer key never crosses the wire. `listPuzzles` is the only student-facing read, and it
 *   returns the prompt, never the key.
 * - A student with no team may still SOLVE, and is told plainly that nothing was awarded.
 *   Refusing them would be worse: on practice, and before an organizer finishes the roster,
 *   there is no team to pay and the puzzle is still worth doing.
 * - ONE PUZZLE PER TEAM MEMBER. The brief asked for a non-programming puzzle for each teammate,
 *   so a puzzle may belong to a SEAT, named by the set letter the teammate already holds under
 *   `RANDOM_ASSIGNED` (teammates hold different letters; the start check enforces it). A student
 *   sees the puzzle for their own letter plus any puzzle open to everyone, and an answer to a
 *   puzzle outside that view is refused as if the puzzle did not exist, so a teammate cannot farm
 *   another seat's puzzle by guessing its slug. `puzzleVisibleTo` is the one definition of the
 *   rule; the list query and the attempt both go through it.
 */

/**
 * May a viewer holding this set label see a puzzle that belongs to that seat?
 *
 * A null `forSetLabel` is a puzzle open to everyone. A null `viewerSetLabel` is a student who has
 * not been given a set yet, and they see only the open ones: there is no seat to show a puzzle
 * for, and showing them all would hand one team four puzzles before sets are dealt. Pure, so it
 * is testable without a database and so the Prisma `where` in `listPuzzles` can be checked
 * against it.
 */
export function puzzleVisibleTo(
  forSetLabel: string | null,
  viewerSetLabel: string | null,
): boolean {
  if (forSetLabel === null) return true;
  return viewerSetLabel !== null && forSetLabel === viewerSetLabel;
}

/**
 * The Prisma filter equivalent of `puzzleVisibleTo`, so the list query asks the database the same
 * question the pure rule answers. Kept next to the rule so the two cannot drift apart unnoticed.
 */
function visibleWhere(viewerSetLabel: string | null): { OR: { forSetLabel: string | null }[] } {
  return viewerSetLabel === null
    ? { OR: [{ forSetLabel: null }] }
    : { OR: [{ forSetLabel: null }, { forSetLabel: viewerSetLabel }] };
}

/**
 * Both sides of a text comparison, flattened the same way.
 *
 * Case, outer whitespace and runs of inner whitespace are all noise a person adds by accident;
 * a puzzle whose answer is "HELLO WORLD" must accept "hello world" and " Hello  World ". The
 * key is stored already normalised so this function is the ONLY definition of equality, applied
 * to both sides.
 */
export function normalizePuzzleAnswer(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The 81 characters of a sudoku grid, digits only, zero or dot for a blank. */
function normalizeGrid(input: string): string {
  return input.replace(/[^0-9.]/g, "").replace(/\./g, "0");
}

/**
 * Is this a legal completion of that sudoku?
 *
 * Checked for VALIDITY against the givens rather than against one stored solution. A published
 * sudoku has a unique solution, so the two agree today; validity is still the better rule,
 * because it cannot be wrong about a puzzle whose uniqueness nobody verified, and it gives the
 * honest reason for a rejection (a repeat in a row, not "that is not the answer I have").
 */
export function checkSudoku(
  givens: string,
  attempt: string,
): { ok: true } | { ok: false; reason: string } {
  const grid = normalizeGrid(attempt);
  const start = normalizeGrid(givens);
  if (grid.length !== 81) {
    return { ok: false, reason: "A finished grid is 81 digits. Fill every square." };
  }
  if (grid.includes("0")) {
    return { ok: false, reason: "Some squares are still empty." };
  }
  for (let index = 0; index < 81; index += 1) {
    if (start[index] !== "0" && start[index] !== grid[index]) {
      return { ok: false, reason: "One of the numbers printed in the puzzle has been changed." };
    }
  }

  const complete = (values: string[]): boolean =>
    new Set(values).size === 9 && values.every((value) => value >= "1" && value <= "9");

  for (let row = 0; row < 9; row += 1) {
    const values = Array.from({ length: 9 }, (_unused, col) => grid[row * 9 + col] ?? "");
    if (!complete(values)) {
      return { ok: false, reason: `Row ${String(row + 1)} repeats a number.` };
    }
  }
  for (let col = 0; col < 9; col += 1) {
    const values = Array.from({ length: 9 }, (_unused, row) => grid[row * 9 + col] ?? "");
    if (!complete(values)) {
      return { ok: false, reason: `Column ${String(col + 1)} repeats a number.` };
    }
  }
  for (let box = 0; box < 9; box += 1) {
    const rowStart = Math.floor(box / 3) * 3;
    const colStart = (box % 3) * 3;
    const values: string[] = [];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        values.push(grid[(rowStart + row) * 9 + colStart + col] ?? "");
      }
    }
    if (!complete(values)) {
      return { ok: false, reason: `One of the three by three boxes repeats a number.` };
    }
  }
  return { ok: true };
}

export interface PuzzleListEntry {
  readonly slug: string;
  readonly title: string;
  readonly topic: string;
  readonly promptMd: string;
  readonly check: "TEXT" | "SUDOKU";
  readonly hint: string | null;
  readonly points: number;
  /** The seat this puzzle is for, or null when every teammate can see it. */
  readonly forSetLabel: string | null;
  /** True when the viewer's team has already been paid for this one. */
  readonly solved: boolean;
  readonly solvedBy: string | null;
}

/**
 * Every active puzzle this viewer may see, with whether their team has already solved it.
 *
 * Visibility is the viewer's own seat plus the puzzles open to everyone (`puzzleVisibleTo`). A
 * viewer with no set yet sees only the open ones.
 *
 * The answer key is not selected, so it cannot be leaked by a serialiser change later. That is
 * deliberate belt and braces: the shape of this function is the guarantee, not a mapping step
 * further down that somebody might edit.
 */
export async function listPuzzles(
  teamId: string | null,
  viewerSetLabel: string | null,
): Promise<PuzzleListEntry[]> {
  const puzzles = await prisma.puzzle.findMany({
    where: { active: true, ...visibleWhere(viewerSetLabel) },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      slug: true,
      title: true,
      topic: true,
      promptMd: true,
      check: true,
      hint: true,
      points: true,
      forSetLabel: true,
      solves:
        teamId === null
          ? false
          : { where: { teamId }, select: { participantId: true }, take: 1 },
    },
  });

  const solverNames = new Map<string, string>();
  if (teamId !== null) {
    const ids = puzzles.flatMap((puzzle) => puzzle.solves.map((solve) => solve.participantId));
    if (ids.length > 0) {
      const people = await prisma.participant.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true },
      });
      for (const person of people) solverNames.set(person.id, person.displayName);
    }
  }

  return puzzles.map((puzzle) => {
    const solve = teamId === null ? undefined : puzzle.solves[0];
    return {
      slug: puzzle.slug,
      title: puzzle.title,
      topic: puzzle.topic,
      promptMd: puzzle.promptMd,
      check: puzzle.check,
      hint: puzzle.hint,
      points: puzzle.points,
      forSetLabel: puzzle.forSetLabel,
      solved: solve !== undefined,
      solvedBy: solve === undefined ? null : (solverNames.get(solve.participantId) ?? null),
    };
  });
}

export interface PuzzleAttemptResult {
  readonly correct: boolean;
  /** What to tell the student. Always present, and always says what to do next. */
  readonly message: string;
  /** Points this attempt awarded. Zero for a wrong answer, a repeat, or a solver with no team. */
  readonly awarded: number;
}

/**
 * Check one answer and, if it is right and unpaid, award the team.
 *
 * The award and the solve row are written in ONE transaction, so a crash cannot leave a team
 * paid with no record of why, or credited with a solve that paid nothing. The unique index on
 * (puzzle, team) is what makes the double submit safe: the second writer loses the race at the
 * database and is told the puzzle is already solved, which is true.
 *
 * A puzzle the viewer cannot see is refused with the same NotFound a hidden or unknown slug gets.
 * The message must not say "that belongs to seat B": a teammate who guessed a slug learns nothing
 * from the refusal, which is what keeps one puzzle per member from becoming four per team.
 */
export async function attemptPuzzle(input: {
  readonly slug: string;
  readonly answer: string;
  readonly participantId: string;
  readonly teamId: string | null;
  readonly viewerSetLabel: string | null;
  readonly contestId: string;
}): Promise<PuzzleAttemptResult> {
  const puzzle = await prisma.puzzle.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      title: true,
      check: true,
      answerKey: true,
      points: true,
      active: true,
      forSetLabel: true,
    },
  });
  if (
    puzzle === null ||
    !puzzle.active ||
    !puzzleVisibleTo(puzzle.forSetLabel, input.viewerSetLabel)
  ) {
    throw new NotFoundError("Puzzle");
  }

  if (puzzle.check === "SUDOKU") {
    const verdict = checkSudoku(puzzle.answerKey, input.answer);
    if (!verdict.ok) return { correct: false, message: verdict.reason, awarded: 0 };
  } else if (normalizePuzzleAnswer(input.answer) !== puzzle.answerKey) {
    return {
      correct: false,
      message: "Not that one. Read it again, and try the hint if you have not.",
      awarded: 0,
    };
  }

  if (input.teamId === null) {
    /*
      Right answer, nobody to pay. This happens in the practice arena and before an organizer
      finishes the roster, and it must not read as a failure: the student solved it.
    */
    return {
      correct: true,
      message:
        "Correct. You are not on a team yet, so there are no points to award. Ask an organizer " +
        "to put you on one and the next puzzle will score.",
      awarded: 0,
    };
  }
  const teamId = input.teamId;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.puzzleSolve.create({
        data: {
          puzzleId: puzzle.id,
          teamId,
          participantId: input.participantId,
          awardedPoints: puzzle.points,
        },
      });
      await tx.teamSideActivity.create({
        data: {
          teamId,
          label: `Puzzle: ${puzzle.title}`,
          points: puzzle.points,
          // Not an organizer, and the log should not pretend otherwise. Every other award names
          // the admin who typed it; this one names the machine that checked it.
          enteredBy: "puzzle",
        },
      });
    });
  } catch (error: unknown) {
    const alreadySolved =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";
    if (!alreadySolved) throw error;
    return {
      correct: true,
      message: "Correct, but your team already solved this one. It only pays once.",
      awarded: 0,
    };
  }

  invalidateScoringInput(input.contestId);
  return {
    correct: true,
    message: `Correct. ${String(puzzle.points)} points to your team.`,
    awarded: puzzle.points,
  };
}

/** The organizer's view: every puzzle, active or not, with how many teams have solved it. */
export async function adminPuzzleList(): Promise<
  readonly {
    slug: string;
    title: string;
    topic: string;
    points: number;
    forSetLabel: string | null;
    active: boolean;
    solveCount: number;
  }[]
> {
  const puzzles = await prisma.puzzle.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      slug: true,
      title: true,
      topic: true,
      points: true,
      forSetLabel: true,
      active: true,
      _count: { select: { solves: true } },
    },
  });
  return puzzles.map((puzzle) => ({
    slug: puzzle.slug,
    title: puzzle.title,
    topic: puzzle.topic,
    points: puzzle.points,
    forSetLabel: puzzle.forSetLabel,
    active: puzzle.active,
    solveCount: puzzle._count.solves,
  }));
}

/** Show or hide one puzzle. Hiding keeps every solve and every award already made. */
export async function setPuzzleActive(slug: string, active: boolean): Promise<void> {
  const puzzle = await prisma.puzzle.findUnique({ where: { slug }, select: { id: true } });
  if (puzzle === null) throw new NotFoundError("Puzzle");
  await prisma.puzzle.update({ where: { id: puzzle.id }, data: { active } });
}

/** Guard for a caller that has no participant at all. Kept here so the message is one string. */
export function requirePuzzleParticipant(participantId: string | null): string {
  if (participantId === null) {
    throw new DomainError("FORBIDDEN", "Sign in with your join code to solve puzzles.");
  }
  return participantId;
}
