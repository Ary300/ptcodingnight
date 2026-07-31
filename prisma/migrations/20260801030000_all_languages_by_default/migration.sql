-- Every problem allows every runtime the judge can run, unless it was narrowed deliberately.
--
-- WHY: `Problem.allowedLanguages` defaulted to [PYTHON_312, JAVA_21]. The bank is seeded from
-- data/problems_seed.csv, which names no languages, so 122 of 130 problems took that default.
-- The API enforces the column (lib/contest/submissions.ts), so an organizer who built a contest
-- out of the bank produced one in which no student could select C, C++, JavaScript or Go on any
-- problem — while the judge ran all ten variants perfectly well and always had.
--
-- Two parts, and the backfill is the one that matters: changing the default alone would fix only
-- problems created AFTER this migration, and every problem in the bank already exists.

ALTER TABLE "Problem"
  ALTER COLUMN "allowedLanguages"
  SET DEFAULT ARRAY[
    'PYTHON_312','JAVA_8','JAVA_11','JAVA_17','JAVA_21',
    'C_17','CPP_11','CPP_17','JAVASCRIPT_NODE22','GO_123'
  ]::"Language"[];

-- Backfill, but ONLY the rows that still carry the old two-language default.
--
-- Scoped rather than blanket. A CODINGBAT warmup exists per language and carries `language`, and a
-- problem an author deliberately narrowed is a decision this migration has no business reversing.
-- Matching the exact old default is what distinguishes "nobody ever chose" from "somebody chose
-- these two".
UPDATE "Problem"
SET "allowedLanguages" = ARRAY[
      'PYTHON_312','JAVA_8','JAVA_11','JAVA_17','JAVA_21',
      'C_17','CPP_11','CPP_17','JAVASCRIPT_NODE22','GO_123'
    ]::"Language"[]
WHERE "allowedLanguages" @> ARRAY['PYTHON_312','JAVA_21']::"Language"[]
  AND array_length("allowedLanguages", 1) = 2
  AND "language" IS NULL;
