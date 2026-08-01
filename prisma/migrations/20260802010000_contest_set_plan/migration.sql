-- The set plan: the difficulty recipe a contest's problem sets were built to, how many sets were
-- dealt, and the seed that decided which problem landed in which one.
--
-- WHY THE RECIPE IS STORED RATHER THAN HARDCODED: it has been one Easy, one Medium and one Hard,
-- and it has also been other things. The format has changed between years, so a constant in the
-- code makes last year's contest unreproducible the moment this year's differs, and two contests
-- living in the same database could not disagree about it at all. It is a per-contest fact, so it
-- is a per-contest column.
--
-- JSONB rather than a set of columns because the shape is a LIST of lines ("one Easy", "two
-- Medium"), and a list does not fit in columns without inventing a maximum length. Postgres will
-- not check its contents either way, which is why lib/schemas/api.ts parses it on the way in AND
-- lib/contest/set-build.ts parses it again on the way OUT: a row written by an older build is
-- external data to the build that reads it, so `Json` is a trust boundary in both directions.
--
-- "setPlanSeed" is deliberately NOT "setAssignmentSeed". That one decides which PLAYER holds which
-- set; this one decides which PROBLEMS are in it. Sharing one column would mean re-planning the
-- problems silently re-rolled every student's assignment.
--
-- ALL THREE NULLABLE, no default and no backfill. A contest nobody has planned sets for has none
-- of them, which is the normal starting state and must keep working: every existing contest keeps
-- the line-up it already has, because nothing on the judging, scoring or submission path reads
-- these columns.
ALTER TABLE "Contest" ADD COLUMN "setComposition" JSONB;
ALTER TABLE "Contest" ADD COLUMN "setCount" INTEGER;
ALTER TABLE "Contest" ADD COLUMN "setPlanSeed" TEXT;
