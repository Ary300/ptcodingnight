import { randomUUID } from "node:crypto";

import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { prisma } from "@/lib/db";
import type { z } from "zod";

import type { SubmissionView } from "@/lib/schemas/api";
import type { RunSamplesResponseSchema } from "@/lib/schemas/api";
import {
  ComparatorSchema,
  type Comparator,
  type JudgeResult,
  type Language,
} from "@/lib/schemas/judge";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import {
  CONTEST_OVER_MESSAGE,
  assertCanSubmit,
  assertProblemIsLive,
  assertUnlocked,
  effectiveUnlockAt,
} from "@/lib/contest/gate";
import { hostLimits } from "@/lib/contest/host";
import { reconcileContestClockById } from "@/lib/contest/contests";
import { lockContestMutations } from "@/lib/contest/locks";
import { canReadSet } from "@/lib/contest/set-assignment";
import { buildJudgeJob, type TestCaseInput } from "@/lib/contest/judge-job";
import { runtimeFor } from "@/lib/judge/runtimes";
import { readCompileError, writeJudgeLog } from "@/lib/contest/judge-log";
import {
  enqueueJudgeJob,
  jobOutcome,
  queuePositionOf,
  runJobAndWait,
} from "@/lib/contest/queue";
import { runSamplesLimiter, submitLimiter } from "@/lib/contest/rate-limit";
import { assertPracticeOpen } from "@/lib/contest/practice-guest";
import { normalizeJudgeScore } from "@/lib/contest/score-normalization";
import { preserveCurrentScoreRevision } from "@/lib/contest/score-revisions";
import {
  toRunSamplesResponse,
  toSubmissionView,
  type TestResultRow,
} from "@/lib/contest/serialize";
import { invalidateScoringInput } from "@/lib/contest/standings";
import {
  canReadSubmission,
  type CompetitorViewer,
  type Viewer,
} from "@/lib/contest/viewer";

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

/**
 * How long an unjudged submission may have no job in the queue before the queue is taken to have
 * lost it and the job is built again.
 *
 * This used to be ten minutes, after which the submission was written as `IE` and left there. A
 * queue loses jobs in exactly the situations a contest night produces: Redis restarted without its
 * last second of appends, a volume recreated, or a finished job pushed out of `removeOnComplete`
 * before anybody read it. Every one of those students then watched "judging" for ten minutes and
 * got "Rechecking", which never rechecked. The submission row holds everything the job was built
 * from, so the honest repair is to build it again.
 *
 * Fifteen seconds, because `createSubmission` writes the row a moment before it enqueues. A
 * requeue inside that window would race the original `add`, and the two are the same job under
 * the same id, so even losing the race is harmless; the grace only keeps the log quiet.
 */
export const LOST_JOB_GRACE_MS = 15_000;

/** What `reconcile` should do about an unjudged submission whose job the queue does not have. */
export function lostJobAction(submittedAt: Date, now: Date): "wait" | "requeue" {
  return now.getTime() - submittedAt.getTime() > LOST_JOB_GRACE_MS ? "requeue" : "wait";
}

/** Ceiling on a synchronous "run samples" wait, whatever the problem's limits say. */
/**
 * The ceiling on how long "Run samples" may block a request.
 *
 * 150 s, up from 60 s. Go's compile budget alone is 90 s, so a 60 s ceiling could not contain the
 * work the judge was permitted to do — the request gave up while the compile it had asked for was
 * still legitimately running.
 *
 * It is still a ceiling rather than "however long it takes", because this path holds an HTTP
 * request open. A student pressing Run and waiting two and a half minutes has learned something is
 * wrong; one waiting indefinitely has not.
 */
const RUN_SAMPLES_TIMEOUT_CEILING_MS = 150_000;

/**
 * Creating and tearing down a container, on top of compiling and running.
 *
 * Measured at 2.4–15.6 s on the development Mac and charged to nobody's time limit (CLAUDE.md:
 * never time a submission by timing `docker run`). It has to be in the WAIT, though, because the
 * wait is wall-clock and the container creation is part of the wall clock.
 */
const CONTAINER_SLACK_MS = 20_000;

interface SubmissionTarget {
  readonly contestProblemId: string;
  readonly contestId: string;
  readonly slug: string;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly allowedLanguages: readonly Language[];
  /** The problem's own comparison rule; undefined falls back to the judge default, whitespace. */
  readonly comparator: Comparator | undefined;
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
      round: true,
      unlockAt: true,
      setId: true,
      contest: {
        select: {
          state: true,
          isPractice: true,
          startsAt: true,
          endsAt: true,
          freezeAt: true,
          groupUnlockMinutes: true,
          allowReadingUnassignedSets: true,
        },
      },
      problem: {
        select: {
          slug: true,
          state: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          comparator: true,
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
    select: { divisionId: true, chosenSetId: true },
  });
  if (participant === null) throw new ForbiddenError("Join the contest first");

  if (
    contestProblem.divisionId !== null &&
    contestProblem.divisionId !== participant.divisionId
  ) {
    throw new ForbiddenError("That problem belongs to another division");
  }

  // The set gate on the path that awards points. Reading someone else's set is a fairness problem;
  // SCORING on it is a correctness one, so the check belongs here as well as on the read path — and
  // this is the guard both submit and run-samples share.
  if (
    !canReadSet({
      problemSetId: contestProblem.setId,
      participantSetId: participant.chosenSetId,
      allowReadingUnassignedSets:
        contestProblem.contest.allowReadingUnassignedSets,
    })
  ) {
    throw new ForbiddenError("That problem is in a set you were not assigned");
  }

  assertCanSubmit(contestProblem.contest, now);
  // Practice shares the judge with the night's contest, so it pauses while one is live. Both
  // submit and run-samples come through here, which is what makes the pause complete.
  if (contestProblem.contest.isPractice) await assertPracticeOpen(now);
  // The DRAFT gate again, on the path that actually awards points.
  assertProblemIsLive(
    contestProblem.problem.state,
    contestProblem.problem.slug,
  );
  // The same clock the list and the statement are gated on. A team question held shut by the
  // contest's group clock must refuse points too, or the lobby's lock is decoration.
  assertUnlocked(
    effectiveUnlockAt(contestProblem, contestProblem.contest),
    now,
    contestProblem.problem.slug,
  );

  if (!contestProblem.problem.allowedLanguages.includes(language)) {
    throw new ValidationError(`${language} is not allowed on this problem`);
  }

  const storedComparator = ComparatorSchema.safeParse(contestProblem.problem.comparator);

  return {
    contestProblemId: contestProblem.id,
    contestId: contestProblem.contestId,
    slug: contestProblem.problem.slug,
    timeLimitMs: contestProblem.problem.timeLimitMs,
    memoryLimitMb: contestProblem.problem.memoryLimitMb,
    /*
      The problem's own comparison rule, parsed rather than cast because Json is a trust
      boundary in both directions. An unparseable or absent column falls back to undefined,
      which buildJudgeJob turns into the default: whitespace. Without this line the builder's
      comparator setting was a stored opinion the judge never heard.
    */
    comparator: storedComparator.success ? storedComparator.data : undefined,
    allowedLanguages: contestProblem.problem.allowedLanguages,
    testCases: contestProblem.problem.testCases,
  };
}

export interface SubmitInput {
  readonly contestProblemId: string;
  readonly language: Language;
  readonly sourceCode: string;
}

/**
 * How long an identical resubmission is treated as the same submission.
 *
 * A double-click, a second press after "could not reach the server", or a browser retrying a POST
 * whose response was lost all arrive as the same code to the same problem within seconds. Each used
 * to become a second row: a second judge run, and for a wrong answer a second rejection, which adds
 * another five penalty minutes for what the student did once. Thirty seconds covers a retry after a
 * Wi-Fi drop.
 *
 * A repeat of a FINISHED submission that failed for a reason a rerun can change is not folded:
 * internal error, a time or memory limit hit while the box was loaded, a runtime or compile error
 * from a judge fault. A student who presses Submit again on those is asking for a new run and gets
 * one. A repeat of a pending submission, an AC or a WA is still folded, which is the double-click
 * the window exists for.
 */
export const REPEAT_SUBMISSION_WINDOW_MS = 30_000;

/** Finished verdicts a deliberate identical resubmission may legitimately want rerun. */
const RERUNNABLE_VERDICTS: ReadonlySet<string> = new Set(["IE", "TLE", "MLE", "RE", "CE"]);

/** Whether `candidate` is a repeat of `input`. Pure, so the rule is a unit test. */
export function isRepeatSubmission(
  candidate: {
    readonly contestProblemId: string;
    readonly language: Language;
    readonly sourceCode: string;
    readonly submittedAt: Date;
    readonly verdict?: string | null;
  },
  input: SubmitInput,
  now: Date,
  /** After the window has closed every identical row is the one that counts, whatever it scored. */
  windowClosed = false,
): boolean {
  if (
    !windowClosed &&
    candidate.verdict !== undefined &&
    candidate.verdict !== null &&
    RERUNNABLE_VERDICTS.has(candidate.verdict)
  ) {
    return false;
  }
  const age = now.getTime() - candidate.submittedAt.getTime();
  return (
    candidate.contestProblemId === input.contestProblemId &&
    candidate.language === input.language &&
    candidate.sourceCode === input.sourceCode &&
    // Either order: two copies of one POST stamp `now` before either inserts.
    Math.abs(age) <= REPEAT_SUBMISSION_WINDOW_MS
  );
}

type SubmissionReader = Pick<typeof prisma, "submission">;

async function findRepeatSubmission(
  db: SubmissionReader,
  participantId: string,
  input: SubmitInput,
  now: Date,
  windowClosed = false,
): Promise<string | null> {
  const recent = await db.submission.findMany({
    where: {
      participantId,
      contestProblemId: input.contestProblemId,
      language: input.language,
      submittedAt: {
        gte: new Date(now.getTime() - REPEAT_SUBMISSION_WINDOW_MS),
        lte: new Date(now.getTime() + REPEAT_SUBMISSION_WINDOW_MS),
      },
    },
    select: {
      id: true,
      contestProblemId: true,
      language: true,
      sourceCode: true,
      submittedAt: true,
      verdict: true,
    },
    orderBy: { submittedAt: "desc" },
    take: 5,
  });
  return recent.find((row) => isRepeatSubmission(row, input, now, windowClosed))?.id ?? null;
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

  // The clock, before the gate reads the state. A scheduled start used to happen only when some
  // page polled the board, so a student whose submit was the first request after 7:00 was told
  // the contest had not started while the lobby beside them said it had.
  await reconcileContestClockById(viewer.contestId, now);

  let target: SubmissionTarget;
  try {
    target = await resolveTarget(input.contestProblemId, input.language, viewer, now);
  } catch (error: unknown) {
    /*
      A POST that reached the server at 8:14:59 and lost its response on the way back is retried
      at 8:15:03. Refusing the retry tells the student the contest is over while their submission
      counts, so a closed window hands back that submission instead. Only for "over": every other
      refusal (not started, practice paused, a set they were moved off) still answers as it did. Only the
      viewer's own rows are searched.
    */
    if (
      error instanceof DomainError &&
      error.code === "CONTEST_NOT_RUNNING" &&
      error.message === CONTEST_OVER_MESSAGE
    ) {
      const earlier = await findRepeatSubmission(prisma, viewer.participantId, input, now, true);
      if (earlier !== null) return getSubmissionView(earlier, viewer, now);
    }
    throw error;
  }

  // A repeat of the same code is the same submission. Two copies of one POST can arrive together,
  // so the check and the insert happen under one per-student lock: the second waits for the
  // first's row and then finds it.
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('submit'), hashtext(${viewer.participantId}))`;
    const raced = await findRepeatSubmission(tx, viewer.participantId, input, now);
    if (raced !== null) return { kind: "repeat", id: raced } as const;
    const row = await tx.submission.create({
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
    return { kind: "created", submission: row } as const;
  });
  if (created.kind === "repeat") return getSubmissionView(created.id, viewer, now);
  const submission = created.submission;

  try {
    await enqueueJudgeJob(
      buildJudgeJob({
        submissionId: submission.id,
        language: input.language,
        sourceCode: input.sourceCode,
        problem: target,
        testCases: target.testCases,
        host: hostLimits(),
        comparator: target.comparator,
      }),
    );
  } catch (error: unknown) {
    // A row with no job would sit "judging" forever and count as an attempt. Take it back.
    await prisma.submission
      .delete({ where: { id: submission.id } })
      .catch(() => undefined);
    throw new DomainError(
      "INTERNAL",
      "The judge queue is unavailable. Try again in a moment.",
      {
        cause: error,
      },
    );
  }

  // The response a student stares at first. Telling them where the queue put them costs one
  // Redis round trip and is best-effort: `queuePositionOf` never throws, and `null` simply
  // omits the field, so a Redis hiccup here cannot fail a submission that already enqueued.
  const queuePosition = await queuePositionOf(submission.id);

  return toSubmissionView(submission, [], null, queuePosition ?? undefined);
}

/**
 * Move a finished job into the database. Safe to call repeatedly and from several requests at
 * once: the update is conditional on the submission still being unjudged, so exactly one caller
 * writes the verdict and exactly one audit row is produced.
 */
export async function reconcile(
  submissionId: string,
  now: Date,
): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      verdict: true,
      submittedAt: true,
      contestProblemId: true,
    },
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

  // No job and no verdict: the queue lost it. Build the job again from the row, under the same id.
  if (
    outcome.status === "missing" &&
    lostJobAction(submission.submittedAt, now) === "requeue"
  ) {
    await requeueLostSubmission(submissionId);
  }
}

/**
 * Put a submission whose job has vanished back on the queue.
 *
 * Built from the submission's own contest problem, the way a rejudge is, because the student's
 * gates (window, set, division) answered when the submission was accepted; asking them again after
 * the end would refuse a submission that already counts. The id is the job id, so two readers that
 * notice the loss at once enqueue one job.
 *
 * Failure is logged and swallowed. This runs on read paths, and a queue that cannot take the job
 * right now leaves the submission unjudged for the next reader to try, which is the state it was in.
 */
async function requeueLostSubmission(submissionId: string): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      language: true,
      sourceCode: true,
      verdict: true,
      contestProblem: {
        select: {
          problem: {
            select: {
              timeLimitMs: true,
              memoryLimitMb: true,
              comparator: true,
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
  if (submission === null || submission.verdict !== null) return;

  const problem = submission.contestProblem.problem;
  const comparator = ComparatorSchema.safeParse(problem.comparator);
  try {
    await enqueueJudgeJob(
      buildJudgeJob({
        submissionId: submission.id,
        language: submission.language,
        sourceCode: submission.sourceCode,
        problem,
        testCases: problem.testCases,
        host: hostLimits(),
        comparator: comparator.success ? comparator.data : undefined,
      }),
    );
    console.warn(
      JSON.stringify({ level: "warn", event: "judge.job_requeued", submissionId }),
    );
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "judge.job_requeue_failed",
        submissionId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function persistResult(
  submissionId: string,
  result: JudgeResult,
): Promise<void> {
  const judgeLogRef = await writeJudgeLog(result);

  const scoringTarget = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      contestProblem: {
        select: {
          contestId: true,
          basePoints: true,
          problem: { select: { testCases: { select: { points: true } } } },
        },
      },
    },
  });
  if (scoringTarget === null) return;

  const achievablePoints =
    scoringTarget.contestProblem.problem.testCases.reduce(
      (sum, testCase) => sum + Math.max(0, testCase.points),
      0,
    );
  const normalizedScore = normalizeJudgeScore({
    rawScore: result.score,
    achievablePoints,
    basePoints: Math.max(0, scoringTarget.contestProblem.basePoints),
    accepted: result.verdict === "AC",
  });

  const persisted = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, scoringTarget.contestProblem.contestId);
    const judgedAt = new Date();
    const before = await tx.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        verdict: true,
        score: true,
        effectiveAt: true,
        judgedAt: true,
        submittedAt: true,
      },
    });
    if (before === null || (before.verdict !== null && before.verdict !== "IE"))
      return false;

    await preserveCurrentScoreRevision(tx, before);
    const updated = await tx.submission.updateMany({
      // A real verdict also overwrites a provisional `IE`, and that is the point.
      // Every other verdict stays write-once.
      where: { id: submissionId, OR: [{ verdict: null }, { verdict: "IE" }] },
      data: {
        verdict: result.verdict,
        score: normalizedScore,
        effectiveAt: judgedAt,
        runtimeMs: result.runtimeMs,
        memoryKb: result.memoryKb,
        judgedAt,
        judgeLogRef,
        // Stage attribution rides in on the result — the worker writes nothing to Postgres,
        // so THIS is the only write. Absent (a result produced before timings existed, or a
        // fixture-driven judge with no queue in front of it) leaves the column untouched:
        // absence is stored as absence, never as zeros.
        ...(result.timings === undefined || result.timings === null
          ? {}
          : { judgeTimings: result.timings }),
      },
    });

    // Another request got there first. Its audit row and test rows committed together.
    if (updated.count === 0) return false;

    if (result.testResults.length > 0) {
      await tx.testResult.createMany({
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

    await tx.submissionScoreRevision.create({
      data: {
        submissionId,
        verdict: result.verdict,
        score: normalizedScore,
        effectiveAt: judgedAt,
      },
    });

    await writeAudit(
      {
        actor: "judge",
        action: AUDIT_ACTIONS.judgeVerdict,
        entity: `Submission:${submissionId}`,
        before: { verdict: null, score: 0 },
        after: {
          verdict: result.verdict,
          score: normalizedScore,
          rawJudgeScore: result.score,
        },
      },
      tx,
    );
    return true;
  });

  if (!persisted) return;

  invalidateScoringInput(scoringTarget.contestProblem.contestId);
}

/**
 * `IE` is our failure, not the student's, and is never presented as one (PRD §7.2). BullMQ has
 * already spent its one retry by the time we get here, so this row is also the admin alert.
 */
async function persistInternalError(
  submissionId: string,
  message: string,
): Promise<void> {
  const owner = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { contestProblem: { select: { contestId: true } } },
  });
  if (owner === null) return;

  const persisted = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, owner.contestProblem.contestId);
    const effectiveAt = new Date();
    const updated = await tx.submission.updateMany({
      where: { id: submissionId, verdict: null },
      data: { verdict: "IE", score: 0, judgedAt: effectiveAt, effectiveAt },
    });
    if (updated.count === 0) return false;

    await tx.submissionScoreRevision.create({
      data: { submissionId, verdict: "IE", score: 0, effectiveAt },
    });

    await writeAudit(
      {
        actor: "judge",
        action: AUDIT_ACTIONS.judgeInternalError,
        entity: `Submission:${submissionId}`,
        after: { verdict: "IE", score: 0 },
        reason: message,
      },
      tx,
    );
    return true;
  });

  if (!persisted) return;

  console.error(
    JSON.stringify({
      level: "error",
      event: "judge.internal_error",
      submissionId,
      message,
    }),
  );
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

  // Still unjudged after reconciling: say where it stands, so a slow submission looks slow
  // rather than broken. Best-effort - `queuePositionOf` returns null rather than throwing,
  // and null omits the field, so this line can never turn a verdict read into an error.
  const queuePosition =
    submission.verdict === null ? await queuePositionOf(submission.id) : null;

  return toSubmissionView(submission, rows, compileError, queuePosition ?? undefined);
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
  await reconcileContestClockById(viewer.contestId, now);

  const target = await resolveTarget(
    input.contestProblemId,
    input.language,
    viewer,
    now,
  );

  const job = buildJudgeJob({
    submissionId: `sample-${randomUUID()}`,
    language: input.language,
    sourceCode: input.sourceCode,
    problem: target,
    testCases: target.testCases,
    host: hostLimits(),
    comparator: target.comparator,
    samplesOnly: true,
  });

  /*
    THE COMPILE HAS TO BE IN THIS BUDGET, AND IT WAS NOT.

    This used to be `min(60s, wallClockKillMs * tests + 15s)` — run limits only. For a 2,000 ms
    problem with two samples that is 27 s, while `gcc14.compileTimeoutMs` is 60 s and
    `go123.compileTimeoutMs` is 90 s. **The wait was structurally smaller than the compile the
    judge itself permits**, so any compile over about 15 s was a guaranteed 500 no matter how
    healthy the host was, and the student read "The judge is busy right now."

    Measured on a loaded host: Python 4.6 s ok, Java 12.5 s ok, C 20.0 s ok, C++11 28.1 s FAIL,
    C++17 29.6 s FAIL, JavaScript 17.2 s ok, Go 30.2 s FAIL. On a quiet host the same three
    passed — a load-dependent boundary sitting on a formula that was wrong in principle.

    The ceiling rises with it. Capping the total at 60 s while allowing a 90 s compile is the same
    mistake one level up: the cap has to be able to contain what it is capping.
  */
  const compileBudgetMs = runtimeFor(input.language).compileTimeoutMs;
  const runBudgetMs = job.limits.wallClockKillMs * job.testCases.length;
  const timeoutMs = Math.min(
    RUN_SAMPLES_TIMEOUT_CEILING_MS,
    compileBudgetMs + runBudgetMs + CONTAINER_SLACK_MS,
  );
  const result = await runJobAndWait(job, timeoutMs);

  return toRunSamplesResponse(result, job.testCases);
}

