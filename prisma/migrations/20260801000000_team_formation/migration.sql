-- Team formation: a code students type to join a team, and a size guardrail.
--
-- Until now a participant could only be put on a team by editing the database. This adds the
-- two columns the join flow needs, and backfills the existing rows so the unique constraint can
-- be applied without dropping anybody's team.

-- --- Contest.maxTeamSize ---------------------------------------------------
-- Defaulted rather than nullable: every contest has a limit, and "no limit" is expressible as a
-- large number. A nullable column would put the "is it set" question at every call site.
ALTER TABLE "Contest" ADD COLUMN "maxTeamSize" INTEGER NOT NULL DEFAULT 4;

-- --- Team.joinCode and Team.createdByParticipantId --------------------------
-- Added NULLABLE first, backfilled, then constrained. Adding a NOT NULL UNIQUE column to a table
-- with existing rows fails outright, and this migration has to survive a database that already
-- has teams in it — the demo contest does.
ALTER TABLE "Team" ADD COLUMN "joinCode" TEXT;
ALTER TABLE "Team" ADD COLUMN "createdByParticipantId" TEXT;

-- Backfill. Six characters from a Crockford-style alphabet with no O/0 or I/1, because these are
-- read aloud across a room. `md5(id)` is deterministic, so re-running this migration on a copy of
-- the database produces the same codes rather than silently reissuing them.
UPDATE "Team"
SET "joinCode" = UPPER(
  TRANSLATE(
    SUBSTRING(MD5("id") FROM 1 FOR 6),
    'ol1i',
    'PQRS'
  )
)
WHERE "joinCode" IS NULL;

-- A collision inside one contest is astronomically unlikely at six hex characters but not
-- impossible, and it would make the unique index below fail mid-migration. Disambiguate by
-- appending a per-contest row number to any duplicate rather than letting the migration abort.
UPDATE "Team" t
SET "joinCode" = SUBSTRING(t."joinCode" FROM 1 FOR 4) || LPAD(d.rn::text, 2, '0')
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "contestId", "joinCode" ORDER BY "id") AS rn
  FROM "Team"
) d
WHERE d."id" = t."id" AND d.rn > 1;

ALTER TABLE "Team" ALTER COLUMN "joinCode" SET NOT NULL;

CREATE UNIQUE INDEX "Team_contestId_joinCode_key" ON "Team"("contestId", "joinCode");
