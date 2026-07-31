-- Students sign up with Google or GitHub, so a User can now exist with no password.
--
-- The NOT NULL this drops was enforcing "no account is reachable ONLY through an OAuth provider".
-- That reasoning is not equally true of both roles: a competitor locked out by a provider outage
-- is one student for an organizer to sort out, while an admin locked out is a contest that cannot
-- be started, frozen or exported with the room already seated.
--
-- So the guarantee is kept exactly where it carries weight. An OAuth-only ADMIN remains
-- unrepresentable, at the database rather than in application code that a later change could
-- forget to run.

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User"
  ADD CONSTRAINT "User_admin_requires_password"
  CHECK ("role" <> 'ADMIN' OR "passwordHash" IS NOT NULL);
