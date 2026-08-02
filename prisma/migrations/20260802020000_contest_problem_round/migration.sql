-- A problem's round is a property of its use in one contest, not of the reusable bank row.
-- Without this column the organizer's explicit Group/Individual choice only changed `setId`,
-- while problem visibility and team scoring continued to read `Problem.round`.

ALTER TABLE "ContestProblem"
ADD COLUMN "round" "ProblemRound" NOT NULL DEFAULT 'INDIVIDUAL';

-- Preserve every authored group problem already in a line-up.
UPDATE "ContestProblem" AS cp
SET "round" = 'GROUP'
FROM "Problem" AS p
WHERE cp."problemId" = p."id"
  AND p."round" = 'GROUP';

-- Recover rows saved by the organizer line-up UI after it gained an explicit Group selector but
-- before this column existed. This is a one-time compatibility backfill only; new writes carry an
-- explicit round and never infer meaning from display text.
UPDATE "ContestProblem"
SET "round" = 'GROUP'
WHERE "setId" IS NULL
  AND "slotLabel" ~* '^(group([[:space:]]|$)|g[0-9]+$)';
