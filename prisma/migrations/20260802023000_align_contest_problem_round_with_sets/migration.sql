-- Before ContestProblem.round existed, the contest line-up stored its round choice in setId:
-- a null set was shared team work and a non-null set was assigned individual work. Problem.round
-- belongs to the reusable bank row, so using it for the first backfill can contradict the way a
-- particular contest actually used that question. Restore the contest-scoped meaning here.

UPDATE "ContestProblem"
SET "round" = CASE
  WHEN "setId" IS NULL THEN 'GROUP'::"ProblemRound"
  ELSE 'INDIVIDUAL'::"ProblemRound"
END;

-- New API writes already enforce this pair. Keep direct SQL, scripts, and future migrations from
-- recreating the old split-brain state where visibility and scoring disagree about the round.
ALTER TABLE "ContestProblem"
ADD CONSTRAINT "ContestProblem_round_set_consistent"
CHECK (
  ("round" = 'GROUP' AND "setId" IS NULL)
  OR
  ("round" = 'INDIVIDUAL' AND "setId" IS NOT NULL)
);
