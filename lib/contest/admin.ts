import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { DomainError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import type { SubmissionView } from "@/lib/schemas/api";
import { ComparatorSchema, type Verdict } from "@/lib/schemas/judge";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { lockContestMutations } from "@/lib/contest/locks";
import { standingsToCsv, exportFilename } from "@/lib/contest/csv";
import { rankSnapshots } from "@/lib/contest/delta";
import { adminPasscode } from "@/lib/contest/env";
import { credentialBackoff } from "@/lib/contest/rate-limit";
import { getStandings, invalidateScoringInput } from "@/lib/contest/standings";
import { hostLimits } from "@/lib/contest/host";
import { buildJudgeJob } from "@/lib/contest/judge-job";
import { enqueueJudgeJob, removeJob } from "@/lib/contest/queue";
import { preserveCurrentScoreRevision } from "@/lib/contest/score-revisions";
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
    throw new DomainError(
      "UNAUTHORIZED",
      "Organizer sign-in is not configured on this server",
    );
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

type Clock = () => Date;

const systemClock: Clock = () => new Date();

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
  clock: Clock = systemClock,
): Promise<FreezeResult> {
  const result = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    // The cutoff belongs to the serialized mutation, not to the HTTP request that may have
    // waited for another score write. Taking the time before this lock lets an older request
    // commit after a newer freeze while still claiming to predate it.
    const now = clock();

    const contest = await tx.contest.findUnique({
      where: { id: contestId },
      select: { id: true, state: true, endsAt: true, freezeAt: true },
    });
    if (contest === null) throw new NotFoundError("Contest");

    const scheduledFreezeIsActive =
      contest.state === "RUNNING" &&
      contest.freezeAt !== null &&
      now.getTime() >= contest.freezeAt.getTime();

    if (frozen) {
      if (contest.state !== "RUNNING" && contest.state !== "FROZEN") {
        throw new DomainError(
          "CONTEST_NOT_RUNNING",
          "Only a running contest can be frozen",
        );
      }

      // HTTP retries and double-clicks must not move the cutoff forward. Once the board is
      // frozen, the original instant is the fact every public replay is computed against.
      if (contest.state === "FROZEN") {
        return {
          contestId,
          state: contest.state,
          frozen: true,
          freezeAt: contest.freezeAt?.toISOString() ?? null,
        };
      }
    } else {
      // Unfreeze is the inverse of freeze, not a second route into RUNNING. Previously a crafted
      // false request changed DRAFT or SCHEDULED straight to RUNNING and skipped every start gate.
      if (contest.state === "RUNNING" && contest.freezeAt === null) {
        return {
          contestId,
          state: contest.state,
          frozen: false,
          freezeAt: null,
        };
      }
      if (contest.state !== "FROZEN" && !scheduledFreezeIsActive) {
        throw new DomainError(
          "CONTEST_NOT_RUNNING",
          "Only a frozen contest can be unfrozen",
        );
      }
    }

    const nextState = frozen
      ? "FROZEN"
      : now.getTime() >= contest.endsAt.getTime()
        ? "ENDED"
        : "RUNNING";
    // A scheduled freeze may already be active while state is still RUNNING. Materialising that
    // state must retain the configured cutoff rather than reveal everything before this click.
    const nextFreezeAt = frozen
      ? scheduledFreezeIsActive
        ? contest.freezeAt
        : now
      : null;

    const updated = await tx.contest.update({
      where: { id: contestId },
      data: { state: nextState, freezeAt: nextFreezeAt },
      select: { state: true, freezeAt: true },
    });

    await writeAudit(
      {
        actor: `admin:${admin.sessionId}`,
        action: frozen
          ? AUDIT_ACTIONS.contestFreeze
          : AUDIT_ACTIONS.contestUnfreeze,
        entity: `Contest:${contestId}`,
        before: {
          state: contest.state,
          freezeAt:
            contest.freezeAt === null ? null : contest.freezeAt.toISOString(),
        },
        after: {
          state: updated.state,
          freezeAt:
            updated.freezeAt === null ? null : updated.freezeAt.toISOString(),
        },
      },
      tx,
    );

    return {
      contestId,
      state: updated.state,
      frozen,
      freezeAt:
        updated.freezeAt === null ? null : updated.freezeAt.toISOString(),
    };
  });

  invalidateScoringInput(contestId);
  // Drop the movement baseline so the unfreeze reveals real movement rather than a flat board.
  rankSnapshots.forget(`${contestId}:`);

  return result;
}

/** The longest freeze an organizer can schedule: half a day, which is longer than any event here. */
export const MAX_FREEZE_MINUTES = 720;

/**
 * When the board stops updating, given the end of the contest and how long before it to stop.
 *
 * Pure, and separate from the write, because this subtraction is the whole feature and it is the
 * part somebody will want to check by hand against a wall clock.
 */
export function freezeAtFromMinutes(endsAt: Date, minutesBeforeEnd: number): Date {
  return new Date(endsAt.getTime() - minutesBeforeEnd * 60_000);
}

/**
 * How many whole minutes before the end a stored `freezeAt` falls, or null when there is none.
 *
 * Rounded to the nearest minute for DISPLAY only. An organizer who typed 30 must read 30 back even
 * if the two timestamps are a few hundred milliseconds off a clean multiple, which they are whenever
 * the contest window itself carries seconds.
 */
export function minutesBeforeEndOf(endsAt: Date, freezeAt: Date | null): number | null {
  if (freezeAt === null) return null;
  return Math.round((endsAt.getTime() - freezeAt.getTime()) / 60_000);
}

export interface FreezeScheduleResult {
  readonly contestId: string;
  readonly freezeAt: string | null;
  readonly minutesBeforeEnd: number | null;
  /** True when the scheduled instant has already passed, so the public board is frozen now. */
  readonly activeNow: boolean;
}

/**
 * Set or clear the freeze CLOCK: "stop the public board this many minutes before the end".
 *
 * This is a different act from `setFrozen`, and keeping them apart is the point. `setFrozen` is an
 * organizer pressing a button while a room watches. This is a decision made days earlier that fires
 * on its own, and it needs no attention on the night — the freeze the organizer asked for happens
 * whether or not anybody remembers it.
 *
 * Nothing new enforces it. A `freezeAt` in the past already means the public board is computed
 * as-of that instant (`setFrozen` calls the same condition `scheduledFreezeIsActive`), and the
 * scoring engine has always taken the freeze as a parameter rather than reading a clock. So this
 * writes one timestamp and the existing rule does the rest.
 *
 * The refusals are all cases where the stored value would be a lie:
 *
 * - A freeze longer than the contest would sit before its own start, which is not a freeze, it is
 *   a board that never updates.
 * - An ENDED or ARCHIVED contest has no board left to stop.
 * - A contest that is FROZEN right now already has `freezeAt` set to the moment it was frozen by
 *   hand. Rewriting that would move the cutoff every public replay is computed against, so the
 *   organizer unfreezes first and the audit log keeps both facts.
 */
export async function setFreezeSchedule(
  contestId: string,
  minutesBeforeEnd: number | null,
  admin: AdminViewer,
  clock: Clock = systemClock,
): Promise<FreezeScheduleResult> {
  if (minutesBeforeEnd !== null) {
    if (!Number.isInteger(minutesBeforeEnd) || minutesBeforeEnd < 1) {
      throw new DomainError("VALIDATION", "Give a whole number of minutes, at least one.");
    }
    if (minutesBeforeEnd > MAX_FREEZE_MINUTES) {
      throw new DomainError(
        "VALIDATION",
        `A freeze can start at most ${String(MAX_FREEZE_MINUTES)} minutes before the end.`,
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    const now = clock();

    const contest = await tx.contest.findUnique({
      where: { id: contestId },
      select: { id: true, state: true, startsAt: true, endsAt: true, freezeAt: true },
    });
    if (contest === null) throw new NotFoundError("Contest");

    if (contest.state === "ENDED" || contest.state === "ARCHIVED") {
      throw new DomainError(
        "CONTEST_NOT_RUNNING",
        "This contest is over, so there is no board left to freeze.",
      );
    }
    if (contest.state === "FROZEN") {
      throw new DomainError(
        "CONTEST_NOT_RUNNING",
        "The board is frozen right now. Unfreeze it first, then set when it should freeze.",
      );
    }

    const freezeAt =
      minutesBeforeEnd === null ? null : freezeAtFromMinutes(contest.endsAt, minutesBeforeEnd);

    if (freezeAt !== null && freezeAt.getTime() <= contest.startsAt.getTime()) {
      throw new DomainError(
        "VALIDATION",
        "That freeze starts before the contest does. Pick a shorter freeze, or a longer contest.",
      );
    }

    const updated = await tx.contest.update({
      where: { id: contestId },
      data: { freezeAt },
      select: { freezeAt: true, endsAt: true },
    });

    await writeAudit(
      {
        actor: `admin:${admin.sessionId}`,
        action: AUDIT_ACTIONS.contestFreezeScheduled,
        entity: `Contest:${contestId}`,
        before: {
          freezeAt: contest.freezeAt === null ? null : contest.freezeAt.toISOString(),
        },
        after: {
          freezeAt: updated.freezeAt === null ? null : updated.freezeAt.toISOString(),
          minutesBeforeEnd,
        },
      },
      tx,
    );

    return {
      contestId,
      freezeAt: updated.freezeAt === null ? null : updated.freezeAt.toISOString(),
      minutesBeforeEnd: minutesBeforeEndOf(updated.endsAt, updated.freezeAt),
      activeNow: updated.freezeAt !== null && now.getTime() >= updated.freezeAt.getTime(),
    };
  });

  // The public board's cutoff just moved, so anything cached against the old one is wrong.
  invalidateScoringInput(contestId);
  return result;
}

/** The longest individual stretch an organizer can set, the same half day the freeze allows. */
export const MAX_GROUP_UNLOCK_MINUTES = 720;

/**
 * When the team questions open, given the start of the contest and how long after it to wait.
 *
 * Pure, and separate from the write, for the same reason `freezeAtFromMinutes` is: this addition
 * is the whole feature and the part somebody will check by hand against the clock on the wall.
 */
export function groupUnlockAtFromMinutes(startsAt: Date, minutesAfterStart: number): Date {
  return new Date(startsAt.getTime() + minutesAfterStart * 60_000);
}

/**
 * How many whole minutes after the start an instant falls, or null when there is none.
 *
 * Rounded to the nearest minute for DISPLAY only, as `minutesBeforeEndOf` is. The column stores
 * the minutes themselves, so this exists for the places that hold an instant and want the sentence.
 */
export function minutesAfterStartOf(startsAt: Date, at: Date | null): number | null {
  if (at === null) return null;
  return Math.round((at.getTime() - startsAt.getTime()) / 60_000);
}

/**
 * The one window rule, pure so it is a unit test: team questions that open at or after the end
 * never open at all, and a stored value that promises otherwise would be a lie.
 */
export function assertGroupUnlockInsideWindow(
  startsAt: Date,
  endsAt: Date,
  minutesAfterStart: number,
): void {
  const opensAt = groupUnlockAtFromMinutes(startsAt, minutesAfterStart);
  if (opensAt.getTime() >= endsAt.getTime()) {
    throw new DomainError(
      "VALIDATION",
      "That opens the team questions after the contest ends. Pick fewer minutes, or a longer contest.",
    );
  }
}

/** The 1..720 bound, pure so a bad number is refused before any lock is taken. */
export function assertGroupUnlockMinutes(minutesAfterStart: number): void {
  if (!Number.isInteger(minutesAfterStart) || minutesAfterStart < 1) {
    throw new DomainError("VALIDATION", "Give a whole number of minutes, at least one.");
  }
  if (minutesAfterStart > MAX_GROUP_UNLOCK_MINUTES) {
    throw new DomainError(
      "VALIDATION",
      `Team questions can open at most ${String(MAX_GROUP_UNLOCK_MINUTES)} minutes after the start.`,
    );
  }
}

export interface GroupUnlockResult {
  readonly contestId: string;
  readonly minutesAfterStart: number | null;
  readonly groupUnlockAt: string | null;
  /** True when the instant has already passed, so the team questions are open now. */
  readonly openNow: boolean;
  /** How many GROUP rows the clock applies to. Zero means the setting is harmless but idle. */
  readonly groupProblemCount: number;
}

/**
 * Set or clear the GROUP-question CLOCK: "team questions open this many minutes after the start".
 *
 * The mirror of `setFreezeSchedule`. The night opens with an individual stretch and the team
 * questions follow, and the organizer's sentence is "thirty minutes in", so the column stores
 * MINUTES and every reader adds them to `startsAt` on the way out (`effectiveUnlockAt` in gate.ts).
 * Starting the contest early or moving its window re-derives the opening; nothing stale is left in
 * any row.
 *
 * Nothing new enforces it. The list, the statement and the submit path already gate on a row's
 * unlock instant; this gives GROUP rows a second clock and the gate takes the later of the two.
 *
 * No `invalidateScoringInput`: when a question opens changes which submissions can exist, never
 * how an existing one scores.
 *
 * Refusals, all cases where the stored value would be a lie:
 *
 * - A number outside 1..720, or a fraction.
 * - An ENDED or ARCHIVED contest has no team questions left to open.
 * - An opening at or after the end is a question that never opens.
 */
export async function setGroupUnlock(
  contestId: string,
  minutesAfterStart: number | null,
  admin: AdminViewer,
  clock: Clock = systemClock,
): Promise<GroupUnlockResult> {
  if (minutesAfterStart !== null) assertGroupUnlockMinutes(minutesAfterStart);

  return prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    const now = clock();

    const contest = await tx.contest.findUnique({
      where: { id: contestId },
      select: { id: true, state: true, startsAt: true, endsAt: true, groupUnlockMinutes: true },
    });
    if (contest === null) throw new NotFoundError("Contest");

    if (contest.state === "ENDED" || contest.state === "ARCHIVED") {
      throw new DomainError(
        "CONTEST_NOT_RUNNING",
        "This contest is over, so there are no team questions left to open.",
      );
    }

    if (minutesAfterStart !== null) {
      assertGroupUnlockInsideWindow(contest.startsAt, contest.endsAt, minutesAfterStart);
    }

    const [updated, groupProblemCount] = await Promise.all([
      tx.contest.update({
        where: { id: contestId },
        data: { groupUnlockMinutes: minutesAfterStart },
        select: { startsAt: true, groupUnlockMinutes: true },
      }),
      tx.contestProblem.count({ where: { contestId, round: "GROUP" } }),
    ]);

    const groupUnlockAt =
      updated.groupUnlockMinutes === null
        ? null
        : groupUnlockAtFromMinutes(updated.startsAt, updated.groupUnlockMinutes);

    await writeAudit(
      {
        actor: `admin:${admin.sessionId}`,
        action: AUDIT_ACTIONS.contestGroupUnlockScheduled,
        entity: `Contest:${contestId}`,
        before: { groupUnlockMinutes: contest.groupUnlockMinutes },
        after: {
          groupUnlockMinutes: updated.groupUnlockMinutes,
          groupUnlockAt: groupUnlockAt === null ? null : groupUnlockAt.toISOString(),
        },
      },
      tx,
    );

    return {
      contestId,
      minutesAfterStart: updated.groupUnlockMinutes,
      groupUnlockAt: groupUnlockAt === null ? null : groupUnlockAt.toISOString(),
      openNow: groupUnlockAt !== null && now.getTime() >= groupUnlockAt.getTime(),
      groupProblemCount,
    };
  });
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
  viewNow: Date,
  clock: Clock = systemClock,
): Promise<SubmissionView> {
  // ContestProblem never moves between contests. Resolve that immutable owner before opening the
  // transaction so the contest lock is the first mutable operation inside it.
  const owner = await prisma.submission.findUnique({
    where: { id: input.submissionId },
    select: { contestProblem: { select: { contestId: true } } },
  });
  if (owner === null) throw new NotFoundError("Submission");
  const contestId = owner.contestProblem.contestId;

  await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    const effectiveAt = clock();

    const before = await tx.submission.findUnique({
      where: { id: input.submissionId },
      select: {
        id: true,
        verdict: true,
        score: true,
        judgedAt: true,
        effectiveAt: true,
        submittedAt: true,
      },
    });
    if (before === null) throw new NotFoundError("Submission");

    /*
      `judgedAt` IS NOT TOUCHED. An override is not a judge run. `Submission` remains the current
      answer, while the appended revision preserves both this answer and every answer before it for
      an as-of freeze replay.
    */
    await preserveCurrentScoreRevision(tx, before);
    await tx.submission.update({
      where: { id: input.submissionId },
      data: { verdict: input.verdict, score: input.score, effectiveAt },
    });
    await tx.submissionScoreRevision.create({
      data: {
        submissionId: input.submissionId,
        verdict: input.verdict,
        score: input.score,
        effectiveAt,
      },
    });

    await writeAudit(
      {
        actor: `admin:${admin.sessionId}`,
        action: AUDIT_ACTIONS.verdictOverride,
        entity: `Submission:${input.submissionId}`,
        before: {
          verdict: before.verdict,
          score: before.score,
          judgedAt:
            before.judgedAt === null ? null : before.judgedAt.toISOString(),
        },
        after: { verdict: input.verdict, score: input.score },
        reason: input.reason,
      },
      tx,
    );
  });

  invalidateScoringInput(contestId);

  return getSubmissionView(input.submissionId, admin, viewNow);
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
  viewNow: Date,
  clock: Clock = systemClock,
): Promise<SubmissionView> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      language: true,
      sourceCode: true,
      contestProblem: {
        select: {
          contestId: true,
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
  if (submission === null) throw new NotFoundError("Submission");

  // The problem's own comparison rule, exactly as `createSubmission` reads it. This was missing,
  // so a rejudge fell back to the whitespace default and could turn an AC on a float problem
  // (plus-minus) into a WA. Parsed rather than cast: the column is Json.
  const storedComparator = ComparatorSchema.safeParse(submission.contestProblem.problem.comparator);
  const job = buildJudgeJob({
    submissionId: submission.id,
    language: submission.language,
    sourceCode: submission.sourceCode,
    problem: submission.contestProblem.problem,
    testCases: submission.contestProblem.problem.testCases,
    host: hostLimits(),
    comparator: storedComparator.success ? storedComparator.data : undefined,
  });

  /*
    The old job goes BEFORE the verdict is cleared. In the other order there is a moment where the
    row is unjudged and the queue still holds the previous run's finished result, and any reader
    that reconciles in that moment (the verdict sweep runs every two seconds) writes the OLD
    verdict back. The rejudge's own result is then refused as a second write.
  */
  await removeJob(submissionId);

  await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, submission.contestProblem.contestId);
    const effectiveAt = clock();
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
    if (before === null) throw new NotFoundError("Submission");

    await preserveCurrentScoreRevision(tx, before);
    await tx.submission.update({
      where: { id: submissionId },
      data: {
        verdict: null,
        score: 0,
        runtimeMs: null,
        memoryKb: null,
        judgedAt: null,
        effectiveAt: null,
      },
    });
    // The previous run's per-test rows go with its verdict. Left in place, the new run's rows were
    // dropped by `skipDuplicates` on (submissionId, testCaseId), so a WA rejudged to AC still showed
    // its old failing tests to the student and the organizer.
    await tx.testResult.deleteMany({ where: { submissionId } });
    // A null revision is a temporal tombstone. Live standings stop using the old answer, while a
    // frozen cutoff before `effectiveAt` still selects the preceding non-null revision.
    await tx.submissionScoreRevision.create({
      data: { submissionId, verdict: null, score: 0, effectiveAt },
    });
    await writeAudit(
      {
        actor: `admin:${admin.sessionId}`,
        action: AUDIT_ACTIONS.submissionRejudge,
        entity: `Submission:${submissionId}`,
        before: { verdict: before.verdict, score: before.score },
        after: { verdict: null, score: 0 },
        reason,
      },
      tx,
    );
  });

  await enqueueJudgeJob(job);

  invalidateScoringInput(submission.contestProblem.contestId);

  return getSubmissionView(submissionId, admin, viewNow);
}
