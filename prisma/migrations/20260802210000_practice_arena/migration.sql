-- The practice arena: one permanent contest anyone signed in can use, and the questions that
-- live only there. Applied with `migrate deploy` (see 20260802180000 for why not `migrate dev`).

ALTER TABLE "Contest" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Problem" ADD COLUMN "practiceOnly" BOOLEAN NOT NULL DEFAULT false;
