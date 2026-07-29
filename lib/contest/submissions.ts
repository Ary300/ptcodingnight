import { randomUUID } from "node:crypto";

import { DomainError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import type { z } from "zod";

import type { PublicTestResult, SubmissionView } from "@/lib/schemas/api";
import type { RunSamplesResponseSchema } from "@/lib/schemas/api";
import type { JudgeResult, Language } from "@/lib/schemas/judge";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { assertCanSubmit, assertProblemIsLive, assertUnlocked } from "@/lib/contest/gate";
import { hostLimits } from "@/lib/contest/host";
import { buildJudgeJob, type TestCaseInput } from "@/lib/contest/judge-job";
import { readCompileError, writeJudgeLog } from "@/lib/contest/judge-log";
import { enqueueJudgeJob, jobOutcome, runJobAndWait } from "@/lib/contest/queue";
import { runSamplesLimiter, submitLimiter } from "@/lib/contest/rate-limit";
import { toPublicTestResult, toSubmissionView, type TestResultRow } from "@/lib/contest/serialize";
import { invalidateScoringInput } from "@/lib/contest/standings";
import { canReadSubmission, type CompetitorViewer, type Viewer } from "@/lib/contest/viewer";

/**
 * Submission intake and verdict readback.
 *
 * `POST /api/submissions` validates, writes one row, enqueues, and returns. It never judges:
 * untrusted code does not run in the web process (docs/PRD.md §7.1).
 *
 * The verdict comes back the other way. The worker returns its result as the job's value and
 * writes nothing to the database, so **reconciliation is a read path** — `reconcile` moves a
 * finished job into `Submission` and `TestResult`, and both the polling GET and the SSE stream
 * call it. That is why polling is a genuine fallback and not a degraded one (PRD §10): the
 * plain GET is what makes the verdict durable, and the stream is a faster way to trigger the
 * same function.
 */

/** How long a submission may sit with no job before we accept that the job is gone. */
const ORPHAN_GRACE_MS = 10 * 60 * 1000;

/** Ceiling on a synchronous "run samples" wait, whatever the problem's limits say. */
const RUN_SAMPLES_TIMEOUT_CEILING_MS = 60_000;

interface SubmissionTarget {
  readonly contestProblemId: string;
  readonly contestId: string;
  readonly slug: string;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly allowedLanguages: readonly Language[];
  readonly testCases: readonly TestCaseInput[];
}

/**
 * Every check a submission has to pass, in one place, so the judged path and the free
 * "run samples" path cannot drift apart on what they allow.
 */
async function resolveTarget(
  contestProblemId: string,
  language: Language,
  viewer: CompetitorViewer,
  now: Date,
): Promise<SubmissionTarget> {
  const contestProblem = await prisma.contestProblem.findUnique({
    where: { id: contestProblemId },
    select: {
      id: true,
      contestId: true,
      divisionId: true,
      unlockAt: true,
      contest: { select: { state: true, startsAt: true, endsAt: true, freezeAt: true } },
      problem: {
        select: {
          slug: true,
          state: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          allowedLanguages: true,
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
  });

  if (contestProblem === null) throw new NotFoundError("Problem");
  if (contestProblem.contestId !== viewer.contestId) {
    throw new ForbiddenError("Your session belongs to a different contest");
  }

  const participant = await prisma.participant.findFirst({
    where: { id: viewer.participantId, contestId: contestProblem.contestId },
    select: { divisionId: true },
  });
  if (participant === null) throw new ForbiddenError("Join the contest first");

  if (contestProblem.divisionId !== null && contestProblem.divisionId !== participant.divisionId) {
    throw new ForbiddenError("That problem belongs to another division");
  }

  assertCanSubmit(contestProblem.contest, now);
  // The DRAFT gate again, on the path that actually awards points.
  assertProblemIsLive(contestProblem.problem.state, contestProblem.problem.slug);
  assertUnlocked(contestProblem.unlockAt, now, contestProblem.problem.slug);

  if (!contestProblem.problem.allowedLanguages.includes(language)) {
    throw new ValidationError(`${language} is not allowed on this problem`);
  }

  return {
    contestProblemId: contestProblem.id,
    contestId: contestProblem.contestId,
    slug: contestProblem.problem.slug,
    timeLimitMs: contestProblem.problem.timeLimitMs,
    memoryLimitMb: contestProblem.problem.memoryLimitMb,
    allowedLanguages: contestProblem.problem.allowedLanguages,
    testCases: contestProblem.problem.testCases,
  };
}

export interface SubmitInput {
  readonly contestProblemId: string;
  readonly language: Language;
  readonly sourceCode: string;
}

export async function createSubmission(
  input: SubmitInput,
  viewer: CompetitorViewer,
  now: Date,
): Promise<SubmissionView> {
  submitLimiter.consumeOrThrow(
    viewer.participantId,
    now,
    "You are submitting very quickly — wait a moment and try again",
  );

  const target = await resolveTarget(input.contestProblemId, input.language, viewer, now);

  const submission = await prisma.submission.create({
    data: {
      participantId: viewer.participantId,
      contestProblemId: target.contestProblemId,
      language: input.language,
      sourceCode: input.sourceCode,
      submittedAt: now,
    },
    select: {
      id: true,
      contestProblemId: true,
      language: true,
      submittedAt: true,
      verdict: true,
      score: true,
      runtimeMs: true,
    },
  });

  try {
    await enqueueJudgeJob(
      buildJudgeJob({
        submissionId: submission.id,
        language: input.language,
        sourceCode: input.sourceCode,
        problem: target,
        testCases: target.testCases,
        host: hostLimits(),
      }),
    );
  } catch (error: unknown) {
    // A row with no job would sit "judging" forever and count as an attempt. Take it back.
    await prisma.submission.delete({ where: { id: submission.id } }).catch(() => undefined);
    throw new DomainError("INTERNAL", "The judge queue is unavailable. Try again in a moment.", {
      cause: error,
    });
  }

  return toSubmissionView(submission, [], null);
}

/**
 * Move a finished job into the database. Safe to call repeatedly and from several requests at
 * once: the update is conditional on the submission still being unjudged, so exactly one caller
 * writes the verdict and exactly one audit row is produced.
 */
export async function reconcile(submissionId: string, now: Date): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, verdict: true, submittedAt: true, contestProblemId: true },
  });
  if (submission === null || submission.verdict !== null) return;

  const outcome = await jobOutcome(submissionId);

  if (outcome.status === "completed") {
    await persistResult(submissionId, outcome.result);
    return;
  }

  if (outcome.status === "failed") {
    await persistInternalError(submissionId, outcome.message);
    return;
  }

  // No job and no verdict. Either it was evicted from Redis after we failed to read it, or the
  // queue lost it. Past the grace period, stop showing the student a spinner forever.
  if (
    outcome.status === "missing" &&
    now.getTime() - submission.submittedAt.getTime() > ORPHAN_GRACE_MS
  ) {
    await persistInternalError(submissionId, "The judge never reported on this submission");
  }
}

async function persistResult(submissionId: string, result: JudgeResult): Promise<void> {
  const judgeLogRef = await writeJudgeLog(result);

  const updated = await prisma.submission.updateMany({
    where: { id: submissionId, verdict: null },
    data: {
      verdict: result.verdict,
      score: result.score,
      runtimeMs: result.runtimeMs,
      memoryKb: result.memoryKb,
      judgedAt: new Date(),
      judgeLogRef,
    },
  });

  // Another request got there first. Its audit row and test rows are already in.
  if (updated.count === 0) return;

  if (result.testResults.length > 0) {
    await prisma.testResult.createMany({
      data: result.testResults.map((test) => ({
        submissionId,
        testCaseId: test.testCaseId,
        verdict: test.verdict,
        runtimeMs: test.runtimeMs,
        memoryKb: test.memoryKb,
        diffSnippet: test.diffSnippet,
      })),
      skipDuplicates: true,
    });
  }

  await writeAudit({
    actor: "judge",
    action: AUDIT_ACTIONS.judgeVerdict,
    entity: `Submission:${submissionId}`,
    before: { verdict: null, score: 0 },
    after: { verdict: result.verdict, score: result.score },
  });

  await invalidateAfterScoreChange(submissionId);
}

/**
 * `IE` is our failure, not the student's, and is never presented as one (PRD §7.2). BullMQ has
 * already spent its one retry by the time we get here, so this row is also the admin alert.
 */
async function persistInternalError(submissionId: string, message: string): Promise<void> {
  const updated = await prisma.submission.updateMany({
    where: { id: submissionId, verdict: null },
    data: { verdict: "IE", score: 0, judgedAt: new Date() },
  });
  if (updated.count === 0) return;

  await writeAudit({
    actor: "judge",
    action: AUDIT_ACTIONS.judgeInternalError,
    entity: `Submission:${submissionId}`,
    after: { verdict: "IE", score: 0 },
    reason: message,
  });

  console.error(
    JSON.stringify({
      level: "error",
      event: "judge.internal_error",
      submissionId,
      message,
    }),
  );
}

async function invalidateAfterScoreChange(submissionId: string): Promise<void> {
  const row = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { contestProblem: { select: { contestId: true } } },
  });
  if (row !== null) invalidateScoringInput(row.contestProblem.contestId);
}

export async function getSubmissionView(
  submissionId: string,
  viewer: Viewer,
  now: Date,
): Promise<SubmissionView> {
  const owner = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { participantId: true },
  });
  if (owner === null) throw new NotFoundError("Submission");

  // Authorization before reconciliation: nobody gets to drive our judge bookkeeping for a
  // submission they cannot read.
  if (!canReadSubmission(viewer, owner.participantId)) {
    throw new NotFoundError("Submission");
  }

  await reconcile(submissionId, now);

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      contestProblemId: true,
      language: true,
      submittedAt: true,
      verdict: true,
      score: true,
      runtimeMs: true,
      judgeLogRef: true,
      testResults: {
        select: {
          verdict: true,
          runtimeMs: true,
          diffSnippet: true,
          testCase: { select: { ordinal: true, isSample: true } },
        },
      },
    },
  });
  if (submission === null) throw new NotFoundError("Submission");

  const rows: TestResultRow[] = submission.testResults.map((test) => ({
    ordinal: test.testCase.ordinal,
    isSample: test.testCase.isSample,
    verdict: test.verdict,
    runtimeMs: test.runtimeMs,
    diffSnippet: test.diffSnippet,
  }));

  const compileError =
    submission.verdict === "CE"
      ? await readCompileError(submission.id, submission.judgeLogRef)
      : null;

  return toSubmissionView(submission, rows, compileError);
}

/** Submissions belonging to one participant, newest first — the "my submissions" feed. */
export async function listMySubmissions(
  viewer: CompetitorViewer,
  now: Date,
  limit = 50,
): Promise<SubmissionView[]> {
  const ids = await prisma.submission.findMany({
    where: { participantId: viewer.participantId },
    select: { id: true },
    orderBy: { submittedAt: "desc" },
    take: limit,
  });

  const views: SubmissionView[] = [];
  for (const { id } of ids) {
    views.push(await getSubmissionView(id, viewer, now));
  }
  return views;
}

/**
 * "Run samples" — free, unjudged, and it creates no `Submission` (PRD §9.1).
 *
 * It runs the same sandbox on the same queue, so nothing about the isolation is weaker; the
 * difference is that the job id is synthetic, nothing is persisted, and the job is removed
 * afterwards. A student can iterate on the samples without spending an attempt or a penalty.
 */
export async function runSamples(
  input: SubmitInput,
  viewer: CompetitorViewer,
  now: Date,
): Promise<z.infer<typeof RunSamplesResponseSchema>> {
  runSamplesLimiter.consumeOrThrow(
    viewer.participantId,
    now,
    "You are running samples very quickly — wait a moment and try again",
  );

  const target = await resolveTarget(input.contestProblemId, input.language, viewer, now);

  const job = buildJudgeJob({
    submissionId: `sample-${randomUUID()}`,
    language: input.language,
    sourceCode: input.sourceCode,
    problem: target,
    testCases: target.testCases,
    host: hostLimits(),
    samplesOnly: true,
  });

  const timeoutMs = Math.min(
    RUN_SAMPLES_TIMEOUT_CEILING_MS,
    job.limits.wallClockKillMs * job.testCases.length + 15_000,
  );
  const result = await runJobAndWait(job, timeoutMs);

  return { results: samplesToPublic(result, job.testCases) };
}

function samplesToPublic(
  result: JudgeResult,
  testCases: readonly { testCaseId: string; ordinal: number; isSample: boolean }[],
): PublicTestResult[] {
  // A compile failure runs no tests, and `RunSamplesResponse` carries only rows — so the
  // compiler's message rides in on one synthetic row rather than vanishing. The text is the
  // compiler talking about the student's own code, so nothing hidden is disclosed (PRD §7.2).
  if (result.verdict === "CE") {
    return [
      toPublicTestResult({
        ordinal: 0,
        isSample: true,
        verdict: "CE",
        runtimeMs: null,
        diffSnippet: result.compileError,
      }),
    ];
  }

  const byId = new Map(testCases.map((t) => [t.testCaseId, t]));

  return result.testResults.map((test) => {
    const testCase = byId.get(test.testCaseId);
    return toPublicTestResult({
      ordinal: testCase?.ordinal ?? 0,
      // Unknown case: treat it as hidden. Guessing "sample" here would publish a diff for a
      // case we cannot prove is one.
      isSample: testCase?.isSample ?? false,
      verdict: test.verdict,
      runtimeMs: test.runtimeMs,
      diffSnippet: test.diffSnippet,
    });
  });
}
