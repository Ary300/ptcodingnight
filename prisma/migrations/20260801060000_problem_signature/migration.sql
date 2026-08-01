-- The function-signature declaration a problem's starter code is generated from.
--
-- WHY: the organizer asked for template code in the editor, "for every language, just to make it
-- simpler for people not as familiar with BufferedReader or stdout". A starter is generated from
-- a declaration (the function name, what it returns, and the fields read off stdin) by the pure
-- emitters in lib/judge/starters/. The declaration is what has to be stored; the ten files are a
-- pure function of it, so storing them instead would be a second source of truth that goes stale
-- the moment an emitter is corrected.
--
-- NULLABLE, with no default and no backfill, and that is the point. Every one of the 125 problems
-- in the bank keeps working exactly as it does today: NULL means no starter, which means the
-- editor opens empty and the student writes a raw stdin-to-stdout program. Nothing on the judging,
-- scoring or submission path reads this column. The feature is additive or it is wrong.
--
-- Json rather than a set of columns because the shape is nested (a list of fields, each with a
-- type and an optional length) and it is validated at both boundaries by SignatureSchema in
-- lib/schemas/seed.ts. Postgres would not check it either way; a schema that is read on the way
-- out as well as on the way in does.

ALTER TABLE "Problem" ADD COLUMN "signature" JSONB;
