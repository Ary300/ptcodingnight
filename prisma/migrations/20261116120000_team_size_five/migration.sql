-- Teams are up to five students (organizer decision, 2026-11-16).
--
-- The roster API reported maxTeamSize 4 while the organizer roster accepted a fifth member, so
-- the screens said "up to 4" beside teams of five. The default becomes 5, and every contest that
-- can still form teams moves from the old default to the new one. A contest an organizer set to
-- anything other than 4 keeps its setting, and finished contests are history and stay as they were.

ALTER TABLE "Contest" ALTER COLUMN "maxTeamSize" SET DEFAULT 5;

UPDATE "Contest"
SET "maxTeamSize" = 5
WHERE "maxTeamSize" = 4
  AND "state" IN (
    'DRAFT', 'SCHEDULED', 'RUNNING', 'FROZEN'
  );
