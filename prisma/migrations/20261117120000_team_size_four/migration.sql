-- Teams are at most four students (organizer decision, 2026-11-17).
--
-- This reverses 20261116120000_team_size_five, which raised the default to 5 and lifted every
-- DRAFT, SCHEDULED, RUNNING or FROZEN contest from 4 to 5. That migration is applied and is
-- never edited; this one moves forward from it.
--
-- The default returns to 4. A contest that can still form teams moves from 5 back to 4 only when
-- no team in it already holds more than four members. A contest that does have a team of five
-- keeps 5, because lowering the cap under an existing roster would make the reported limit
-- disagree with the teams on the screen, which is the exact bug the previous migration fixed.
-- An organizer moves that fifth student and sets the contest by hand. Finished contests are
-- history and stay as they were.

ALTER TABLE "Contest" ALTER COLUMN "maxTeamSize" SET DEFAULT 4;

UPDATE "Contest" AS c
SET "maxTeamSize" = 4
WHERE c."maxTeamSize" = 5
  AND c."state" IN (
    'DRAFT', 'SCHEDULED', 'RUNNING', 'FROZEN'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Team" AS t
    JOIN "Participant" AS p ON p."teamId" = t."id"
    WHERE t."contestId" = c."id"
    GROUP BY t."id"
    HAVING COUNT(*) > 4
  );
