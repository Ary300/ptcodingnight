-- Coding Night prep, per the organizer's brief for the night:
--  * one non-programming puzzle PER TEAM MEMBER, so a puzzle can belong to a seat (set letter);
--  * an individual stretch before team collaboration, so GROUP questions can open N minutes in;
--  * problems that hinge on a data type stay out of the planner's deal.
-- Every column is nullable or defaulted, so existing rows need no backfill.

ALTER TABLE "Puzzle" ADD COLUMN "forSetLabel" TEXT;

ALTER TABLE "Contest" ADD COLUMN "groupUnlockMinutes" INTEGER;

ALTER TABLE "Problem" ADD COLUMN "keepOutOfSets" BOOLEAN NOT NULL DEFAULT false;
