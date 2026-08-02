-- Division-scoped problem sets, a group-question count in the recipe, and plan provenance
-- on ContestProblem.
--
-- ProblemSet gains a nullable divisionId: when a contest has divisions the planner deals each
-- division its own columns, so "Intermediate A" and "Advanced A" are two different sets sharing
-- a letter. The unique key must therefore carry the division.
--
-- The unique index is written by hand because it needs NULLS NOT DISTINCT (Postgres 15+; the
-- compose runs postgres:16): Postgres treats NULLs as distinct in ordinary unique constraints,
-- which would let two division-null sets share a label — exactly the (contestId, label)
-- collision the old constraint existed to refuse. The index keeps the name Prisma generates for
-- @@unique([contestId, divisionId, label]) so the schema and the database describe one index.

ALTER TABLE "ProblemSet" ADD COLUMN "divisionId" TEXT;

ALTER TABLE "ProblemSet"
  ADD CONSTRAINT "ProblemSet_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "Division"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "ProblemSet_contestId_label_key";

CREATE UNIQUE INDEX "ProblemSet_contestId_divisionId_label_key"
  ON "ProblemSet"("contestId", "divisionId", "label") NULLS NOT DISTINCT;

CREATE INDEX "ProblemSet_divisionId_idx" ON "ProblemSet"("divisionId");

-- The recipe's team-question count. A separate column rather than a new shape inside
-- setComposition, so recipes stored before this existed keep parsing; absence means zero, which
-- is what those contests were built with.
ALTER TABLE "Contest" ADD COLUMN "setGroupCount" INTEGER NOT NULL DEFAULT 0;

-- Which GROUP rows the planner dealt, as opposed to rows an organizer placed by hand on the
-- Problems tab. A re-plan replaces the first and must not touch the second, and without this
-- column the rows are indistinguishable (round GROUP, setId null, divisionId null).
ALTER TABLE "ContestProblem" ADD COLUMN "dealtByPlan" BOOLEAN NOT NULL DEFAULT false;
