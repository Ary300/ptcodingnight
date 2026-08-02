-- A mutable Submission row cannot answer "what verdict existed at the freeze instant" after an
-- override or rejudge. Keep the current answer on Submission for ordinary reads, and append every
-- score-bearing state here for temporal standings replay. A NULL verdict is a rejudge tombstone.

CREATE TABLE "SubmissionScoreRevision" (
    "id" SERIAL NOT NULL,
    "submissionId" TEXT NOT NULL,
    "verdict" "Verdict",
    "score" INTEGER NOT NULL DEFAULT 0,
    "effectiveAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionScoreRevision_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SubmissionScoreRevision"
ADD CONSTRAINT "SubmissionScoreRevision_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "SubmissionScoreRevision_submissionId_effectiveAt_id_idx"
ON "SubmissionScoreRevision"("submissionId", "effectiveAt", "id");

CREATE INDEX "SubmissionScoreRevision_effectiveAt_idx"
ON "SubmissionScoreRevision"("effectiveAt");

-- Recover prior score changes from the audit trail where possible. Ordered insertion makes the
-- serial id the same stable event order the application uses for two changes in one millisecond.
INSERT INTO "SubmissionScoreRevision" ("submissionId", "verdict", "score", "effectiveAt")
SELECT
    s."id",
    CASE
      WHEN a."after"->>'verdict' IN ('AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'IE')
        THEN (a."after"->>'verdict')::"Verdict"
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(a."after"->>'score', '') ~ '^[0-9]+$'
        THEN (a."after"->>'score')::INTEGER
      ELSE 0
    END,
    a."at"
FROM "AuditLog" AS a
JOIN "Submission" AS s ON a."entity" = 'Submission:' || s."id"
WHERE a."action" IN (
    'submission.judged',
    'submission.internal_error',
    'submission.override',
    'submission.rejudge'
)
ORDER BY a."at", a."id";

-- The current row is authoritative if old deployments have an incomplete audit trail. Insert it
-- last so its revision id wins live replay; effectiveAt still keeps it out of an earlier freeze.
INSERT INTO "SubmissionScoreRevision" ("submissionId", "verdict", "score", "effectiveAt")
SELECT
    s."id",
    s."verdict",
    s."score",
    COALESCE(s."effectiveAt", s."judgedAt", s."submittedAt")
FROM "Submission" AS s
WHERE s."verdict" IS NOT NULL;
