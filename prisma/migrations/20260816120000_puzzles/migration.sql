-- Browser puzzles: decode the binary, finish the sudoku, break the cipher. They pay out as
-- TeamSideActivity awards, which is why the scoring engine is untouched by this migration.

CREATE TYPE "PuzzleCheck" AS ENUM ('TEXT', 'SUDOKU');

CREATE TABLE "Puzzle" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "promptMd" TEXT NOT NULL,
  "check" "PuzzleCheck" NOT NULL DEFAULT 'TEXT',
  "answerKey" TEXT NOT NULL,
  "hint" TEXT,
  "points" INTEGER NOT NULL DEFAULT 25,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Puzzle_slug_key" ON "Puzzle"("slug");
CREATE INDEX "Puzzle_active_idx" ON "Puzzle"("active");

CREATE TABLE "PuzzleSolve" (
  "id" TEXT NOT NULL,
  "puzzleId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "awardedPoints" INTEGER NOT NULL,
  "solvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PuzzleSolve_pkey" PRIMARY KEY ("id")
);
-- One award per team per puzzle: the whole team is paid once, however many of them type it.
CREATE UNIQUE INDEX "PuzzleSolve_puzzleId_teamId_key" ON "PuzzleSolve"("puzzleId", "teamId");
CREATE INDEX "PuzzleSolve_teamId_idx" ON "PuzzleSolve"("teamId");
ALTER TABLE "PuzzleSolve" ADD CONSTRAINT "PuzzleSolve_puzzleId_fkey"
  FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
