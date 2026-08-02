-- Clean up the OAuth callback race before the following migration adds uniqueness. This lives in
-- its own migration so the already-applied 20260802030000 checksum remains immutable.

CREATE TEMP TABLE "_ParticipantDuplicateMap" AS
SELECT ranked."id" AS "duplicateId", ranked."canonicalId"
FROM (
  SELECT
    participant."id",
    first_value(participant."id") OVER (
      PARTITION BY participant."contestId", participant."userId"
      ORDER BY
        (participant."teamId" IS NOT NULL) DESC,
        (participant."chosenSetId" IS NOT NULL) DESC,
        (participant."divisionId" IS NOT NULL) DESC,
        participant."joinedAt" ASC,
        participant."id" ASC
    ) AS "canonicalId",
    row_number() OVER (
      PARTITION BY participant."contestId", participant."userId"
      ORDER BY
        (participant."teamId" IS NOT NULL) DESC,
        (participant."chosenSetId" IS NOT NULL) DESC,
        (participant."divisionId" IS NOT NULL) DESC,
        participant."joinedAt" ASC,
        participant."id" ASC
    ) AS "rowNumber"
  FROM "Participant" AS participant
  WHERE participant."userId" IS NOT NULL
) AS ranked
WHERE ranked."rowNumber" > 1;

UPDATE "Submission" AS submission
SET "participantId" = duplicates."canonicalId"
FROM "_ParticipantDuplicateMap" AS duplicates
WHERE submission."participantId" = duplicates."duplicateId";

UPDATE "Session" AS session
SET "participantId" = duplicates."canonicalId"
FROM "_ParticipantDuplicateMap" AS duplicates
WHERE session."participantId" = duplicates."duplicateId";

-- Normalize canonical plus duplicate grants first, then rank the whole collision group. This also
-- handles three or more raced participants when the canonical row itself has no copy of a hint.
CREATE TEMP TABLE "_HintGrantMerge" AS
SELECT
  ranked."id",
  ranked."canonicalId",
  ranked."rowNumber"
FROM (
  SELECT
    normalized.*,
    row_number() OVER (
      PARTITION BY
        normalized."canonicalId",
        normalized."contestProblemId",
        normalized."hintIndex"
      ORDER BY
        normalized."isCanonical" DESC,
        normalized."grantedAt" ASC,
        normalized."id" ASC
    ) AS "rowNumber"
  FROM (
    SELECT
      hint_grant."id",
      COALESCE(duplicates."canonicalId", hint_grant."participantId") AS "canonicalId",
      hint_grant."contestProblemId",
      hint_grant."hintIndex",
      hint_grant."grantedAt",
      (duplicates."duplicateId" IS NULL) AS "isCanonical"
    FROM "HintGrant" AS hint_grant
    LEFT JOIN "_ParticipantDuplicateMap" AS duplicates
      ON duplicates."duplicateId" = hint_grant."participantId"
    WHERE duplicates."duplicateId" IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM "_ParticipantDuplicateMap" AS canonical
        WHERE canonical."canonicalId" = hint_grant."participantId"
      )
  ) AS normalized
) AS ranked;

DELETE FROM "HintGrant" AS hint_grant
USING "_HintGrantMerge" AS merge
WHERE hint_grant."id" = merge."id"
  AND merge."rowNumber" > 1;

UPDATE "HintGrant" AS hint_grant
SET "participantId" = merge."canonicalId"
FROM "_HintGrantMerge" AS merge
WHERE hint_grant."id" = merge."id"
  AND merge."rowNumber" = 1;

-- Standings are derived from submissions. Drop only duplicate materialized rows; the canonical
-- row remains and the next standings computation incorporates the submissions moved above.
DELETE FROM "Standing" AS standing
USING "_ParticipantDuplicateMap" AS duplicates
WHERE standing."participantId" = duplicates."duplicateId";

DELETE FROM "Participant" AS participant
USING "_ParticipantDuplicateMap" AS duplicates
WHERE participant."id" = duplicates."duplicateId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Participant"
    WHERE "userId" IS NOT NULL
    GROUP BY "contestId", "userId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate signed-in participants remain; review before adding uniqueness';
  END IF;
END $$;

DROP TABLE "_HintGrantMerge";
DROP TABLE "_ParticipantDuplicateMap";
