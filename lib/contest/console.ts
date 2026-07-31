import { prisma } from "@/lib/db";

import type { AdminConsoleView, AdminSubmissionRow, JudgeHealthView } from "@/lib/schemas/api";
import type { Language, Verdict } from "@/lib/schemas/judge";
import { judgeQueue } from "./queue";

/**
 * What the organizer's live console reads.
 *
 * ## One read, not three
 *
 * The console shows the submission feed, the judge's health and the freeze state, and it polls.
 * Three endpoints would be three round trips per tick and three chances for the screen to
 * disagree with itself — a feed showing a fresh verdict beside a queue depth from two seconds
 * ago. They are gathered here and returned together, so what the organizer sees is one moment.
 *
 * ## The feed is windowed, and says by how much
 *
 * A contest generates hundreds of submissions and the console is a *live* view: what an organizer
 * needs is the recent tail plus everything still unjudged. `total` comes back alongside so the
 * screen can say "most recent 200 of 431" rather than silently truncating — a feed that quietly
 * stops at N reads as "that is all of them", which is how a stuck submission goes unnoticed.
 */

/** Rows returned to the console. Sized for a screen, not for an export — that is `exportStandings`. */
const FEED_LIMIT = 200;

export async function adminConsole(contestId: string): Promise<AdminConsoleView> {
  const [contest, rows, total, health] = await Promise.all([
    prisma.contest.findUnique({
      where: { id: contestId },
      select: { id: true, name: true, state: true },
    }),
    prisma.submission.findMany({
      where: { contestProblem: { contestId } },
      // Newest first: the console is read from the top and the thing an organizer is reacting to
      // is always the most recent. `id` breaks ties, because `submittedAt` has millisecond
      // resolution and a burst can share one — without it the same feed reorders between polls.
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: FEED_LIMIT,
      select: {
        id: true,
        language: true,
        submittedAt: true,
        verdict: true,
        score: true,
        runtimeMs: true,
        participant: {
          select: { id: true, displayName: true, division: { select: { name: true } } },
        },
        contestProblem: {
          select: { slotLabel: true, problem: { select: { title: true } } },
        },
      },
    }),
    prisma.submission.count({ where: { contestProblem: { contestId } } }),
    judgeHealth(),
  ]);

  if (contest === null) {
    return {
      contestId,
      contestName: "",
      frozen: false,
      total: 0,
      submissions: [],
      health,
    };
  }

  return {
    contestId: contest.id,
    contestName: contest.name,
    // The STATE is the truth, not a nullable timestamp. `setFrozen` moves the contest to FROZEN
    // and back to RUNNING/ENDED, and `freezeAt` is the moment it happened — reading the timestamp
    // would report a contest that has since been unfrozen and ended as still frozen.
    frozen: contest.state === "FROZEN",
    total,
    submissions: rows.map(toRow),
    health,
  };
}

function toRow(row: {
  id: string;
  language: Language;
  submittedAt: Date;
  verdict: Verdict | null;
  score: number;
  runtimeMs: number | null;
  participant: { id: string; displayName: string; division: { name: string } | null };
  contestProblem: { slotLabel: string; problem: { title: string } };
}): AdminSubmissionRow {
  return {
    submissionId: row.id,
    participantId: row.participant.id,
    displayName: row.participant.displayName,
    // A participant may have no division — the team format does not require one — and "" here
    // would render as a blank column that looks like a loading failure.
    divisionName: row.participant.division?.name ?? "No division",
    slotLabel: row.contestProblem.slotLabel,
    problemTitle: row.contestProblem.problem.title,
    language: row.language,
    submittedAt: row.submittedAt.toISOString(),
    verdict: row.verdict,
    score: row.score,
    runtimeMs: row.runtimeMs,
  };
}

/**
 * The judge queue's health, as the console draws it.
 *
 * Every number comes from BullMQ rather than from a table we keep in step with it. A queue depth
 * this application maintains itself is a second source of truth about the thing it is supposed to
 * be watching, and it would be wrong in exactly the situation the console exists for.
 *
 * Redis being unreachable is REPORTED, not thrown. "The judge is down" is precisely what an
 * organizer opened this screen to find out; turning it into a failed request would replace the
 * answer with a spinner.
 */
export async function judgeHealth(): Promise<JudgeHealthView> {
  try {
    const queue = judgeQueue();
    const [counts, workers, waiting] = await Promise.all([
      queue.getJobCounts("waiting", "active", "failed", "delayed"),
      queue.getWorkers(),
      queue.getJobs(["waiting"], 0, 0),
    ]);

    const oldest = waiting[0]?.timestamp;

    return {
      reachable: true,
      queueDepth: (counts.waiting ?? 0) + (counts.delayed ?? 0),
      active: counts.active ?? 0,
      failed: counts.failed ?? 0,
      workersOnline: workers.length,
      oldestWaitingMs: oldest === undefined ? null : Math.max(0, Date.now() - oldest),
    };
  } catch {
    return {
      reachable: false,
      queueDepth: 0,
      active: 0,
      failed: 0,
      workersOnline: 0,
      oldestWaitingMs: null,
    };
  }
}
