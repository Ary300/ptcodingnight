-- Per-person join codes: the organizer builds the roster before the night, and each seat gets a
-- code the student types instead of making an account. Globally unique so the code alone is
-- enough to identify the seat; NULL for everyone who signs in with an account, and Postgres
-- allows many NULLs under a unique index.
--
-- Applied with `migrate deploy` (see 20260802180000 for why not `migrate dev`).

ALTER TABLE "Participant" ADD COLUMN "joinCode" TEXT;
CREATE UNIQUE INDEX "Participant_joinCode_key" ON "Participant"("joinCode");
