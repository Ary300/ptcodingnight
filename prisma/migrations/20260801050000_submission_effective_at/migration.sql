-- When a submission's CURRENT verdict and score became true.
--
-- WHY: a freeze did not hold. lib/scoring filtered the window on `submittedAt`, which answers
-- "which submissions existed yet" — not "what did the board know". So a submission made BEFORE the
-- freeze whose verdict was overridden or rejudged AFTER it passed straight through carrying its
-- new score, and the public board moved while the banner above it read "students and the projector
-- are seeing the standings as they were at the freeze."
--
-- Measured twice, anonymously: a contest frozen with a student on 0, an override to AC/140, and
-- 18.8s later GET /api/standings returned frozen:true, the SAME asOf, and 140. A rejudge did the
-- reverse and dropped a named student to zero on the wall.
--
-- Kept separate from `judgedAt` on purpose. `judgedAt` is when the JUDGE ran and must not move —
-- an override is not a judge run. `effectiveAt` is when the current answer became true, and moves
-- with every override and rejudge.

ALTER TABLE "Submission" ADD COLUMN "effectiveAt" TIMESTAMP(3);

-- Backfill from judgedAt: for every row written before this migration, the judge's answer IS the
-- current answer — no override could have happened without also having been judged first. An
-- unjudged row stays NULL, which is correct: at any cutoff it contributed nothing.
UPDATE "Submission" SET "effectiveAt" = "judgedAt" WHERE "judgedAt" IS NOT NULL;

CREATE INDEX "Submission_effectiveAt_idx" ON "Submission"("effectiveAt");
