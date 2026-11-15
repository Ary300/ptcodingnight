import { testDb } from "./seed";

/**
 * Practice closes while any real contest is live (`assertPracticeOpen`), and the e2e database
 * always has one: every spec seeds a RUNNING fixture contest inside its window. The practice specs
 * therefore move every live real contest a day ahead for their duration and put each one back
 * exactly afterwards. SCHEDULED with a future start is a state the clock reconciler leaves alone,
 * so nothing moves them back mid-run.
 */
export interface PausedContest {
  readonly id: string;
  readonly state: "RUNNING" | "FROZEN";
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export async function pauseLiveContests(now: Date = new Date()): Promise<PausedContest[]> {
  const live = await testDb().contest.findMany({
    where: {
      isPractice: false,
      state: { in: ["RUNNING", "FROZEN"] },
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    select: { id: true, state: true, startsAt: true, endsAt: true },
  });
  const dayAhead = now.getTime() + 24 * 60 * 60_000;
  for (const contest of live) {
    const length = contest.endsAt.getTime() - contest.startsAt.getTime();
    await testDb().contest.update({
      where: { id: contest.id },
      data: {
        state: "SCHEDULED",
        startsAt: new Date(dayAhead),
        endsAt: new Date(dayAhead + length),
      },
    });
  }
  return live.map((contest) => ({
    id: contest.id,
    state: contest.state === "FROZEN" ? "FROZEN" : "RUNNING",
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
  }));
}

export async function restoreContests(paused: readonly PausedContest[]): Promise<void> {
  for (const contest of paused) {
    await testDb().contest.update({
      where: { id: contest.id },
      data: { state: contest.state, startsAt: contest.startsAt, endsAt: contest.endsAt },
    });
  }
}
