-- An explicit end to team formation, defaulting to "when the contest starts".
--
-- Nullable, and null means startsAt. Added because the default rule and "the contest is running"
-- are not always the same thing: a rehearsal or a public demo wants formation open while
-- submissions are also being accepted, and without this the only way to get that is to edit the
-- database — the exact problem team management exists to remove.
ALTER TABLE "Contest" ADD COLUMN "teamFormationClosesAt" TIMESTAMP(3);
