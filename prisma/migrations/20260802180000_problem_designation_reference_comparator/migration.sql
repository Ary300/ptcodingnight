-- The reference validation trail and per-problem comparator, decided in the bank rather than per contest.
--
-- Written by hand and applied with `migrate deploy` rather than `migrate dev`, because the
-- earlier repair migration 20260802035000 joins "_prisma_migrations" in its own SQL, which the
-- shadow database that `migrate dev` builds from scratch does not have at that point in the
-- replay. Deploy applies only what is pending against the real database and never replays
-- history, so it is the correct tool here (and the one production uses anyway).

ALTER TABLE "Problem" ADD COLUMN "referenceLanguage" "Language";
ALTER TABLE "Problem" ADD COLUMN "referenceValidatedAt" TIMESTAMP(3);
ALTER TABLE "Problem" ADD COLUMN "comparator" JSONB;
