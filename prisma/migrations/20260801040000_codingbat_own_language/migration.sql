-- A per-language warmup allows exactly its own language.
--
-- WHY: `Problem.language` exists only for CODINGBAT warmups, which are the SAME exercise authored
-- separately for Python and for Java — that is the reason docs/DECISIONS.md D6 keys their slug on
-- (title, language) rather than on title alone. All 60 of them nonetheless carried the old
-- two-language default, so a warmup written for Python accepted a Java submission and vice versa.
--
-- The previous migration deliberately skipped these rows (`language IS NULL`), because widening a
-- per-language problem to all ten would have been the same mistake in the other direction. The
-- correct value is the one language the problem is actually about.
--
-- Left alone on purpose: rows where `language IS NULL`, which the previous migration has already
-- widened, and any problem an author narrowed by hand.

UPDATE "Problem"
SET "allowedLanguages" = ARRAY["language"]::"Language"[]
WHERE "language" IS NOT NULL
  AND "allowedLanguages" @> ARRAY['PYTHON_312','JAVA_21']::"Language"[]
  AND array_length("allowedLanguages", 1) = 2;
