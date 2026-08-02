-- A browser can retry an OAuth callback while the first request is still enrolling the user.
-- Make idempotency a database invariant instead of a read-then-create convention. PostgreSQL
-- treats NULL values as distinct here, so display-name-only fallback participants are unaffected.
CREATE UNIQUE INDEX "Participant_contestId_userId_key"
ON "Participant"("contestId", "userId");
