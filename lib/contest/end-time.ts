import type { ContestState } from "@prisma/client";

import { prisma } from "@/lib/db";
import { DomainError, NotFoundError } from "@/lib/errors";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/contest/audit";
import { lockContestMutations } from "@/lib/contest/locks";
import { invalidateScoringInput } from "@/lib/contest/standings";
import type { AdminViewer } from "@/lib/contest/viewer";

/**
 * Moving the end of a contest that already exists.
 *
 * ## Why this exists
 *
 * The end time was written once, by the create form, and nothing could change it afterwards. "Open
 * now" re-anchors the whole window and keeps its length, so an organizer who opened at 6:58 closed
 * submissions at 8:13 with no way to give the room its two minutes back, and a judge outage at 7:40
 * could not be answered with "everybody gets ten more minutes". End contest pulls `endsAt` back to
 * the moment it was pressed and allowed no way out of ENDED, so one confirmed press in the wrong
 * place finished the night and put the final board on the wall. Each of those needed psql.
 *
 * ## The rules
 *
 * - The new end must be after the start, and for a contest that has started it must be in the
 *   future. Finishing now is what End contest is for.
 * - A scheduled freeze keeps its distance from the end, because the organizer set it as "fifteen
 *   minutes before the end" and that is still what they mean. A freeze that has already fired is a
 *   fact the frozen board is computed from, so it stays where it is.
 * - An ENDED contest given a future end runs again. That is the undo for End contest. Its board
 *   goes back to updating live; if it should be frozen, the Setup tab's freeze presets do it.
 */

/** Longest window this screen will set. Longer than any night, short enough to catch a wrong day. */
export const MAX_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface EndTimeContest {
  readonly state: ContestState;
  readonly isPractice: boolean;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly freezeAt: Date | null;
}

export interface EndTimePlan {
  readonly state: ContestState;
  readonly endsAt: Date;
  readonly freezeAt: Date | null;
  readonly resumed: boolean;
}

/** Pure: what the contest row becomes, or the sentence that says why it cannot. */
export function planEndTime(contest: EndTimeContest, nextEnd: Date, now: Date): EndTimePlan {
  if (contest.isPractice) {
    throw new DomainError(
      "VALIDATION",
      "The practice problems stay open all year, so their end time is not set here.",
    );
  }
  if (contest.state === "ARCHIVED") {
    throw new DomainError("CONTEST_NOT_RUNNING", "This contest is archived and cannot change.");
  }
  if (Number.isNaN(nextEnd.getTime())) {
    throw new DomainError("VALIDATION", "Pick an end time.");
  }
  if (nextEnd.getTime() <= contest.startsAt.getTime()) {
    throw new DomainError("VALIDATION", "The end has to come after the start.");
  }
  if (nextEnd.getTime() - contest.startsAt.getTime() > MAX_WINDOW_MS) {
    throw new DomainError(
      "VALIDATION",
      "That makes the contest longer than twelve hours. Check the day and the AM or PM.",
    );
  }
  const started = contest.state !== "DRAFT" && contest.state !== "SCHEDULED";
  if (started && nextEnd.getTime() <= now.getTime()) {
    throw new DomainError(
      "VALIDATION",
      "That time has already passed. To finish the contest now, use End contest.",
    );
  }

  const shift = nextEnd.getTime() - contest.endsAt.getTime();
  let freezeAt = contest.freezeAt;
  // A freeze still ahead slides with the end. One that has fired, or a freeze pressed by hand
  // (state FROZEN), is the cutoff the public board is already showing, and stays.
  if (freezeAt !== null && contest.state !== "FROZEN" && freezeAt.getTime() > now.getTime()) {
    const slid = freezeAt.getTime() + shift;
    // Pulling the end in can slide a future freeze into the past. Freezing retroactively would hide
    // results the room has already seen, so it freezes from now instead.
    freezeAt = new Date(Math.max(slid, now.getTime()));
    if (freezeAt.getTime() <= contest.startsAt.getTime()) freezeAt = null;
  }

  const resumed = contest.state === "ENDED";
  return {
    state: resumed ? "RUNNING" : contest.state,
    endsAt: nextEnd,
    freezeAt,
    resumed,
  };
}

export interface EndTimeResult {
  readonly contestId: string;
  readonly state: string;
  readonly endsAt: string;
  readonly freezeAt: string | null;
  readonly resumed: boolean;
}

export async function setContestEndTime(
  contestId: string,
  nextEnd: Date,
  reason: string,
  admin: AdminViewer,
  clock: () => Date = () => new Date(),
): Promise<EndTimeResult> {
  const result = await prisma.$transaction(async (tx) => {
    await lockContestMutations(tx, contestId);
    const now = clock();
    const contest = await tx.contest.findUnique({
      where: { id: contestId },
      select: { state: true, isPractice: true, startsAt: true, endsAt: true, freezeAt: true },
    });
    if (contest === null) throw new NotFoundError("Contest");

    const plan = planEndTime(contest, nextEnd, now);
    const updated = await tx.contest.update({
      where: { id: contestId },
      data: { state: plan.state, endsAt: plan.endsAt, freezeAt: plan.freezeAt },
      select: { state: true, endsAt: true, freezeAt: true },
    });

    await writeAudit(
      {
        actor: `admin:${admin.sessionId}`,
        action: AUDIT_ACTIONS.contestEndTimeSet,
        entity: `Contest:${contestId}`,
        before: {
          state: contest.state,
          endsAt: contest.endsAt.toISOString(),
          freezeAt: contest.freezeAt?.toISOString() ?? null,
        },
        after: {
          state: updated.state,
          endsAt: updated.endsAt.toISOString(),
          freezeAt: updated.freezeAt?.toISOString() ?? null,
        },
        reason,
      },
      tx,
    );

    return {
      contestId,
      state: updated.state,
      endsAt: updated.endsAt.toISOString(),
      freezeAt: updated.freezeAt?.toISOString() ?? null,
      resumed: plan.resumed,
    };
  });

  // The window is part of every standings payload, and a resumed contest's board is live again.
  invalidateScoringInput(contestId);
  return result;
}
