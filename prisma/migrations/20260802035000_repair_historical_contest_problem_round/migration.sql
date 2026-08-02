-- 20260802023000 was briefly applied with `setId IS NULL => GROUP`. That inference destroyed the
-- only in-row copy of round for line-ups that existed before setId was added. Do not reverse every
-- current GROUP row from Problem.round: round is contest-scoped now, and doing so would corrupt
-- valid organizer overrides in databases that already ran the faulty migration.
--
-- Repair only rows with provenance strong enough to distinguish them:
--   * the contest predates the migration that added setId;
--   * no set exists anywhere in that contest (the old nullable-column shape);
--   * no audited post-migration line-up save superseded that old shape; and
--   * the original backfill would have classified this row as individual.
-- Ambiguous rows are intentionally left untouched for organizer review rather than guessed at.

CREATE TEMP TABLE "_ContestProblemRoundRepair" AS
SELECT cp."id", cp."contestId"
FROM "ContestProblem" AS cp
JOIN "Contest" AS c ON c."id" = cp."contestId"
JOIN "Problem" AS p ON p."id" = cp."problemId"
JOIN "_prisma_migrations" AS migration
  ON migration."migration_name" = '20260731000000_team_scoring_and_auth'
  AND migration."finished_at" IS NOT NULL
  AND migration."rolled_back_at" IS NULL
WHERE cp."round" = 'GROUP'
  AND cp."setId" IS NULL
  AND p."round" = 'INDIVIDUAL'
  AND cp."slotLabel" !~* '^(group([[:space:]]|$)|g[0-9]+$)'
  AND c."createdAt" <= migration."finished_at"
  AND NOT EXISTS (
    SELECT 1
    FROM "ProblemSet" AS existing_set
    WHERE existing_set."contestId" = cp."contestId"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "AuditLog" AS audit
    WHERE audit."action" = 'contest.problems_set'
      AND lower(audit."entity") = lower('contest:' || cp."contestId")
  );

INSERT INTO "ProblemSet" ("id", "contestId", "label")
SELECT
  'migration-legacy-individual-' || md5(repair."contestId"),
  repair."contestId",
  'Migrated individual set'
FROM "_ContestProblemRoundRepair" AS repair
GROUP BY repair."contestId"
ON CONFLICT DO NOTHING;

UPDATE "ContestProblem" AS cp
SET
  "round" = 'INDIVIDUAL',
  "setId" = ps."id"
FROM "_ContestProblemRoundRepair" AS repair
JOIN "ProblemSet" AS ps
  ON ps."contestId" = repair."contestId"
  AND ps."label" = 'Migrated individual set'
WHERE cp."id" = repair."id";

DROP TABLE "_ContestProblemRoundRepair";
