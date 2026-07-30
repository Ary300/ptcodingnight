-- Language enum: one value per VARIANT in lib/judge/runtimes.ts.
--
-- Hand-written rather than generated. `prisma migrate diff` renders an enum change as DROP TYPE
-- + CREATE TYPE, which cannot work while Submission.language and Problem.allowedLanguages
-- reference it and would take every existing submission with it. Postgres can rename and add
-- enum values in place, so nothing is dropped and no row is rewritten.

-- The two existing values become their explicit variants. PYTHON was always 3.12 (the pinned
-- image), and JAVA was compiled by a JDK 21 with no --release flag, which is Java 21.
ALTER TYPE "Language" RENAME VALUE 'PYTHON' TO 'PYTHON_312';
ALTER TYPE "Language" RENAME VALUE 'JAVA' TO 'JAVA_21';

-- New variants. Order matters only for display; the registry owns dropdown order.
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'JAVA_8';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'JAVA_11';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'JAVA_17';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'C_17';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'CPP_11';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'CPP_17';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'JAVASCRIPT_NODE22';
ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'GO_123';

-- The column default referenced the old names.
ALTER TABLE "Problem" ALTER COLUMN "allowedLanguages" SET DEFAULT ARRAY['PYTHON_312', 'JAVA_21']::"Language"[];
