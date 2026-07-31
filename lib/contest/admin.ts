import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { DomainError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import type { SubmissionView } from "@/lib/schemas/api";
import type { Verdict } from "@/lib/schemas/judge";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { standingsToCsv, exportFilename } from "@/lib/contest/csv";
import { rankSnapshots } from "@/lib/contest/delta";
import { adminPasscode } from "@/lib/contest/env";
import { credentialBackoff } from "@/lib/contest/rate-limit";
import { getStandings, invalidateScoringInput } from "@/lib/contest/standings";
import { hostLimits } from "@/lib/contest/host";
import { buildJudgeJob } from "@/lib/contest/judge-job";
import { enqueueJudgeJob, removeJob } from "@/lib/contest/queue";
import { getSubmissionView } from "@/lib/contest/submissions";
import type { AdminViewer, Viewer } from "@/lib/contest/viewer";

/**
 * Organizer actions.
 *
 * Two of the three write to `AuditLog`, and the third — export — is an output only, never an
 * input path (docs/PRD.md §9.2). A manual verdict override always carries a reason, because the
 * only reason to override is one you can state.
 */

export const AdminLoginSchema = z.object({
  passcode: z.string().min(1, "Enter the organizer passcode").max(200),
});
export type AdminLogin = z.infer<typeof AdminLoginSchema>;

/**
 * Check the organizer passcode.
 *
 * Constant-time, and rate limited per client so the passcode cannot be walked. A deployment
 * with no passcode configured has no admin login at all — the failure is "no organizer can sign
 * in", which somebody notices, rather than "anyone can", which nobody does.
 */
export async function authenticateAdmin(input: AdminLogin): Promise<void> {
  // Delay rather than refuse. A counter keyed on a spoofable header protected nothing; a counter
  // keyed on one shared bucket would let a student lock the organizer console for five minutes by
  // burning the attempts on purpose, mid-contest. Backoff makes guessing infeasible and never
  // shuts a real organizer out. See CredentialBackoff.
  await credentialBackoff.throttle();

  const expected = adminPasscode();
  if (expected === null) {
    throw new DomainError("UNAUTHORIZED", "Organizer sign-in is not configured on this server");
  }

  const a = Buffer.from(input.passcode, "utf8");
  const b = Buffer.from(expected, "utf8");
  const matches = a.length === b.length && timingSafeEqual(a, b);

  if (!matches) {
    credentialBackoff.recordFailure();
    throw new DomainError("UNAUTHORIZED", "That passcode is not right");
  }

  credentialBackoff.recordSuccess();
}

export interface FreezeResult {
  readonly contestId: string;
  readonly state: string;
  readonly frozen: boolean;
  readonly freezeAt: string | null;
}

/**
 * Freeze and unfreeze the public board.
 *
 * Freezing stamps `freezeAt` with the current instant, which is what the public board is then
 * computed as-of. Unfreezing **clears** it: leaving a past `freezeAt` behind would re-trigger
 * the automatic freeze on the next request and undo the reveal. The old value goes to the audit
 * log, so nothing is actually lost.
 */
export async function setFrozen(
  contestId: string,
  frozen: boolean,
  admin: AdminViewer,
  now: Date,
): Promise<FreezeResult> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { id: true, state: true, endsAt: true, freezeAt: true },
  });
  if (contest === null) throw new NotFoundError("Contest");

  if (frozen && contest.state !== "RUNNING" && contest.state !== "FROZEN") {
    throw new DomainError("CONTEST_NOT_RUNNING", "Only a running contest can be frozen");
  }

  const nextState = frozen ? "FROZEN" : now.getTime() >= contest.endsAt.getTime() ? "ENDED" : "RUNNING";
  const nextFreezeAt = frozen ? now : null;

  const updated = await prisma.contest.update({
    where: { id: contestId },
    data: { state: nextState, freezeAt: nextFreezeAt },
    select: { id: true, state: true, freezeAt: true },
  });

  await writeAudit({
    actor: `admin:${admin.sessionId}`,
    action: frozen ? AUDIT_ACTIONS.contestFreeze : AUDIT_ACTIONS.contestUnfreeze,
    entity: `Contest:${contestId}`,
    before: {
      state: contest.state,
      freezeAt: contest.freezeAt === null ? null : contest.freezeAt.toISOString(),
    },
    after: {
      state: updated.state,
      freezeAt: updated.freezeAt === null ? null : updated.freezeAt.toISOString(),
    },
  });

  invalidateScoringInput(contestId);
  // Drop the movement baseline so the unfreeze reveals real movement rather than a flat board.
  rankSnapshots.forget(`${contestId}:`);

  return {
    contestId,
    state: updated.state,
    frozen,
    freezeAt: updated.freezeAt === null ? null : updated.freezeAt.toISOString(),
  };
}

export interface OverrideInput {
  readonly submissionId: string;
  readonly verdict: Verdict;
  readonly score: number;
  readonly reason: string;
}

/**
 * Manual verdict override.
 *
 * This is the one place a score changes without the judge, so it is the one place an audit row
 * with a human reason is mandatory (PRD §9.2). The submission row itself is still the raw log —
 * standings are recomputed from it, so an override is replayable like everything else.
 */
export async function overrideVerdict(
  input: OverrideInput,
  admin: AdminViewer,
  now: Date,
): Promise<SubmissionView> {
  const before = await prisma.submission.findUnique({
    where: { id: input.submissionId },
    select: {
      id: true,
      verdict: true,
      score: true,
      contestProblem: { select: { contestId: true } },
    },
  });
  if (before === null) throw new NotFoundError("Submission");

  await prisma.submission.update({
    where: { id: input.submissionId },
    data: { verdict: input.verdict, score: input.score, judgedAt: now },
  });

  await writeAudit({
    actor: `admin:${admin.sessionId}`,
    action: AUDIT_ACTIONS.verdictOverride,
    entity: `Submission:${input.submissionId}`,
    before: { verdict: before.verdict, score: before.score },
    after: { verdict: input.verdict, score: input.score },
    reason: input.reason,
  });

  invalidateScoringInput(before.contestProblem.contestId);

  return getSubmissionView(input.submissionId, admin, now);
}

export interface StandingsExport {
  readonly csv: string;
  readonly filename: string;
}

/** The awards-screen export. Admin standings, so never the frozen board. */
export async function exportStandings(
  contestId: string,
  admin: AdminViewer,
  now: Date,
): Promise<StandingsExport> {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { name: true },
  });
  if (contest === null) throw new NotFoundError("Contest");

  const viewer: Viewer = admin;
  const standings = await getStandings(contestId, viewer, now);

  await writeAudit({
    actor: `admin:${admin.sessionId}`,
    action: AUDIT_ACTIONS.standingsExport,
    entity: `Contest:${contestId}`,
    after: { asOf: standings.asOf, divisions: standings.divisions.length },
  });

  return {
    csv: standingsToCsv(standings),
    filename: exportFilename(contest.name, standings.asOf),
  };
}


/**
 * Put a submission back through the judge.
 *
 * ## When this is the right button
 *
 * A verdict of `IE` is ours, never the student's (PRD §7.2) — the worker requeues once by itself,
 * and after that an organizer decides. The other case is a judge that was misconfigured for part
 * of the round: a missing image, a wrong `TEST_DATA_ROOT`, a machine under load. Both produce a
 * verdict nobody believes, and the fix is to run it again rather than to override it by hand.
 *
 * ## Why it is not the competitor submit path
 *
 * `createSubmission` resolves its target through `resolveTarget`, which enforces the contest
 * window, the division and the problem set — correctly, for a student. A rejudge fails every one
 * of those checks: it happens after the round has ended, on somebody else's behalf. It therefore
 * reads the submission's own contest problem directly. Nothing about WHAT is judged changes; only
 * who is allowed to ask.
 *
 * ## The three things that have to happen in order
 *
 * 1. **Remove the old job.** `enqueueJudgeJob` uses the submission id as the job id so that a
 *    double-submitted form produces one job rather than two. That same idempotency means a second
 *    `add` with the same id is silently DROPPED — so without this, "Rejudge" would appear to work
 *    and nothing would ever run.
 * 2. **Clear the verdict.** `reconcile` only writes to a submission that is still unjudged (or
 *    holding an `IE`), which is what keeps a verdict write-once. A rejudge of an `AC` that left
 *    the verdict in place would run the job and then discard its result.
 * 3. **Invalidate the standings.** The score is about to change.
 *
 * The audit row is written BEFORE the enqueue. If the queue is unreachable the organizer gets an
 * error and the trail still records that the attempt was made — the opposite order loses the
 * record of exactly the action that failed.
 */
export async function rejudgeSubmission(
  submissionId: string,
  reason: string,
  admin: AdminViewer,
  now: Date,
): Promise<SubmissionView> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      language: true,
      sourceCode: true,
      verdict: true,
      score: true,
      contestProblem: {
        select: {
          contestId: true,
          problem: {
            select: {
              timeLimitMs: true,
              memoryLimitMb: true,
              testCases: {
                select: {
                  id: true,
                  ordinal: true,
                  inputPath: true,
                  expectedOutputPath: true,
                  isSample: true,
                  points: true,
                  group: true,
                },
                orderBy: { ordinal: "asc" },
              },
            },
          },
        },
      },
    },
  });
  if (submission === null) throw new NotFoundError("Submission");

  const job = buildJudgeJob({
    submissionId: submission.id,
    language: submission.language,
    sourceCode: submission.sourceCode,
    problem: submission.contestProblem.problem,
    testCases: submission.contestProblem.problem.testCases,
    host: hostLimits(),
  });

  await writeAudit({
    actor: `admin:${admin.sessionId}`,
    action: AUDIT_ACTIONS.submissionRejudge,
    entity: `Submission:${submissionId}`,
    before: { verdict: submission.verdict, score: submission.score },
    after: { verdict: null, score: 0 },
    reason,
  });

  await prisma.submission.update({
    where: { id: submissionId },
    data: { verdict: null, score: 0, runtimeMs: null, memoryKb: null, judgedAt: null },
  });

  await removeJob(submissionId);
  await enqueueJudgeJob(job);

  invalidateScoringInput(submission.contestProblem.contestId);

  return getSubmissionView(submissionId, admin, now);
}
