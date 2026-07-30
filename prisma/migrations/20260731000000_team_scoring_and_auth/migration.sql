-- Team scoring, three auth providers, and server-side sessions.
--
-- Generated with `prisma migrate diff` and then CORRECTED BY HAND in three places. The generated
-- version would have applied cleanly and been quietly wrong, which is the failure mode worth
-- documenting.
--
-- 1. `Problem.round` needed a BACKFILL. The generated diff adds it with DEFAULT 'INDIVIDUAL',
--    which would have relabelled every existing group problem as individual — and since group
--    problems score differently, that is a silent scoring change on 128 existing rows.
--
-- 2. `User.passwordHash` is added NOT NULL with no default. That is only safe because the User
--    table is empty (verified: 0 rows). On a populated table this statement FAILS, which is the
--    correct outcome — a backfilled placeholder password would be worse than a failed migration.
--
-- 3. `Standing.score` is dropped and replaced by `scoreHundredths`. Also safe only because
--    Standing is empty (verified: 0 rows), and it always is: standings are materialized from the
--    submission log and can be rebuilt at any time. Nothing there is a source of truth.
--
-- Row counts at authoring time: User 0, Standing 0, Problem 128, Participant 47, Contest 2.

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('JOIN_CODE', 'ADMIN_PASSCODE', 'ADMIN_PASSWORD', 'GOOGLE', 'GITHUB');

-- CreateEnum
CREATE TYPE "ProblemRound" AS ENUM ('INDIVIDUAL', 'GROUP');

-- CreateEnum
CREATE TYPE "SetSelection" AS ENUM ('RANDOM_ASSIGNED', 'PLAYER_CHOOSES', 'ONE_SET_PER_TEAM');

-- DropIndex
DROP INDEX "Standing_participantId_divisionId_key";

-- AlterTable
ALTER TABLE "Contest" ADD COLUMN     "allowReadingUnassignedSets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupPointsInsideMean" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "setAssignmentSeed" TEXT,
ADD COLUMN     "setSelection" "SetSelection" NOT NULL DEFAULT 'RANDOM_ASSIGNED',
ADD COLUMN     "sideActivitiesFlat" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ContestProblem" ADD COLUMN     "setId" TEXT;

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "chosenSetId" TEXT;

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "round" "ProblemRound" NOT NULL DEFAULT 'INDIVIDUAL';

-- Backfill round from the boolean it replaces. NOT part of the generated diff, and without it
-- every existing group problem silently becomes an individual one.
--
-- isGroupProblem is deliberately LEFT IN PLACE by this migration even though `round` supersedes
-- it: dropping a column in the same migration that starts reading its replacement leaves no way
-- back if the backfill is wrong. It is dropped in a later migration, once `round` has been
-- observed to be correct.
UPDATE "Problem" SET "round" = 'GROUP' WHERE "isGroupProblem" = true;

-- AlterTable
ALTER TABLE "Standing" DROP COLUMN "score",
ADD COLUMN     "scoreHundredths" INTEGER NOT NULL,
ADD COLUMN     "sideActivityPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "teamSize" INTEGER,
ALTER COLUMN "participantId" DROP NOT NULL,
ALTER COLUMN "divisionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "githubSub" TEXT,
ADD COLUMN     "googleSub" TEXT,
ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "method" "AuthMethod" NOT NULL,
    "participantId" TEXT,
    "contestId" TEXT,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemSet" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ProblemSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamSideActivity" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "enteredBy" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamSideActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_participantId_idx" ON "Session"("participantId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Team_contestId_idx" ON "Team"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_contestId_name_key" ON "Team"("contestId", "name");

-- CreateIndex
CREATE INDEX "ProblemSet_contestId_idx" ON "ProblemSet"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemSet_contestId_label_key" ON "ProblemSet"("contestId", "label");

-- CreateIndex
CREATE INDEX "TeamSideActivity_teamId_idx" ON "TeamSideActivity"("teamId");

-- CreateIndex
CREATE INDEX "ContestProblem_setId_idx" ON "ContestProblem"("setId");

-- CreateIndex
CREATE INDEX "Participant_teamId_idx" ON "Participant"("teamId");

-- CreateIndex
CREATE INDEX "Participant_chosenSetId_idx" ON "Participant"("chosenSetId");

-- CreateIndex
CREATE INDEX "Standing_rank_idx" ON "Standing"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "Standing_teamId_participantId_key" ON "Standing"("teamId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubSub_key" ON "User"("githubSub");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemSet" ADD CONSTRAINT "ProblemSet_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSideActivity" ADD CONSTRAINT "TeamSideActivity_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestProblem" ADD CONSTRAINT "ContestProblem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ProblemSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_chosenSetId_fkey" FOREIGN KEY ("chosenSetId") REFERENCES "ProblemSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

