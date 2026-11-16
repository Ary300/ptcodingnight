import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The standings response memo (`lib/contest/standings.ts`).
 *
 * Fifty student pages and a projector poll the same board. The memo exists so they share one
 * computation per scoring input instead of one each. It is only allowed to exist if nobody can
 * tell it is there except by freshness, so every test here compares the memo to what a fresh
 * computation would have said, or proves that an event the room must see drops the memo.
 *
 * The database is a fake held in this file's `db`, so a test can change the rows underneath a
 * cached board and see whether the board notices.
 */

interface FixtureRevision {
  id: number;
  verdict: string;
  score: number;
  effectiveAt: Date;
  submission: { id: string; participantId: string; contestProblemId: string; submittedAt: Date };
}

interface Fixture {
  contest: { state: string; freezeAt: Date | null } & Record<string, unknown>;
  revisions: FixtureRevision[];
  postFreezeRevision: FixtureRevision;
  sideActivities: { teamId: string; label: string; points: number; enteredAt: Date }[];
  instants: { beforeFreeze: Date; afterFreeze: Date };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function loadFixture(): Fixture {
  const file = path.join(process.cwd(), "fixtures", "standings-cache", "contest.json");
  return JSON.parse(readFileSync(file, "utf8"), (_key, value: unknown) =>
    typeof value === "string" && ISO.test(value) ? new Date(value) : value,
  ) as Fixture;
}

const db = vi.hoisted(() => ({
  fixture: null as unknown as Fixture,
  contestReads: 0,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    contest: {
      findUnique: vi.fn(async () => {
        db.contestReads += 1;
        return structuredClone(db.fixture.contest);
      }),
    },
    submission: { findMany: vi.fn(async () => []) },
    submissionScoreRevision: {
      findMany: vi.fn(async () => structuredClone(db.fixture.revisions)),
    },
    hintGrant: { findMany: vi.fn(async () => []) },
    teamSideActivity: {
      findMany: vi.fn(async () => structuredClone(db.fixture.sideActivities)),
    },
  },
}));

vi.mock("@/lib/scoring/team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scoring/team")>();
  return { ...actual, computeTeamStandings: vi.fn(actual.computeTeamStandings) };
});

vi.mock("@/lib/scoring", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scoring")>();
  return { ...actual, computeStandings: vi.fn(actual.computeStandings) };
});

const { computeTeamStandings } = await import("@/lib/scoring/team");
const { computeStandings } = await import("@/lib/scoring");
const {
  getStandings,
  getTeamStandings,
  invalidateScoringInput,
  problemStandingsFor,
  reconcileClockFromBoard,
} = await import("@/lib/contest/standings");
const { rankSnapshots } = await import("@/lib/contest/delta");
type Viewer = import("@/lib/contest/viewer").Viewer;

const CONTEST = "c-cache";
const ANONYMOUS: Viewer = { kind: "anonymous" };
const ORGANIZER: Viewer = { kind: "admin", displayName: "Ritz", sessionId: "s-admin", userId: "u1" };
const competitor = (participantId: string): Viewer => ({
  kind: "competitor",
  participantId,
  contestId: CONTEST,
  displayName: participantId,
  sessionId: `session-${participantId}`,
  userId: null,
});
const ADA = competitor("p-ada"); // team Red
const BO = competitor("p-bo"); // team Red
const CY = competitor("p-cy"); // team Blue

const VIEWERS: readonly [string, Viewer][] = [
  ["anonymous", ANONYMOUS],
  ["organizer", ORGANIZER],
  ["Red member", ADA],
  ["Blue member", CY],
];

/** Every test starts from cold caches and the fixture's rows. */
let clockMs = 0;
function at(instant: Date, offsetMs = 0): Date {
  return new Date(instant.getTime() + offsetMs);
}
function nextColdInstant(): Date {
  // Each test uses its own hour so no input memo from an earlier test is inside its TTL.
  clockMs += 60 * 60 * 1000;
  return new Date(db.fixture.instants.beforeFreeze.getTime() - 24 * 60 * 60 * 1000 + clockMs);
}

beforeEach(() => {
  db.fixture = loadFixture();
  db.contestReads = 0;
  invalidateScoringInput(CONTEST);
  rankSnapshots.forget(`${CONTEST}:`);
  vi.mocked(computeTeamStandings).mockClear();
  vi.mocked(computeStandings).mockClear();
});

/** What the board would say with no memo at all: drop everything, then ask at the same instant. */
async function freshTeam(viewer: Viewer, now: Date): Promise<string> {
  invalidateScoringInput(CONTEST);
  return JSON.stringify(await getTeamStandings(CONTEST, viewer, now));
}

describe("the cached team board is the board a fresh computation would produce", () => {
  it.each(VIEWERS)("byte-identical for the %s view", async (_name, viewer) => {
    const now = db.fixture.instants.beforeFreeze;
    const first = await getTeamStandings(CONTEST, viewer, now);
    const cached = await getTeamStandings(CONTEST, viewer, at(now, 400));

    expect(cached).toBe(first);
    expect(JSON.stringify(cached)).toBe(await freshTeam(viewer, now));
  });

  it("byte-identical for the individual board, public and organizer", async () => {
    const now = db.fixture.instants.beforeFreeze;
    for (const viewer of [ANONYMOUS, ORGANIZER]) {
      const cached = await getStandings(CONTEST, viewer, now);
      expect(await getStandings(CONTEST, viewer, at(now, 300))).toBe(cached);
      invalidateScoringInput(CONTEST);
      expect(JSON.stringify(await getStandings(CONTEST, viewer, now))).toBe(
        JSON.stringify(cached),
      );
    }
  });

  it("gives each viewer the detail that viewer may read, and no one else's", async () => {
    const now = db.fixture.instants.beforeFreeze;
    // Fill the memo from the organizer first: the widest view must not leak into the narrower ones.
    await getTeamStandings(CONTEST, ORGANIZER, now);
    const red = await getTeamStandings(CONTEST, ADA, now);
    const blue = await getTeamStandings(CONTEST, CY, now);
    const anonymous = await getTeamStandings(CONTEST, ANONYMOUS, now);

    const detailFor = (board: typeof red): Record<string, boolean> =>
      Object.fromEntries(
        board.teams.map((team) => [team.name, team.players.every((p) => p.problems !== null)]),
      );
    expect(detailFor(red)).toEqual({ Red: true, Blue: false });
    expect(detailFor(blue)).toEqual({ Red: false, Blue: true });
    expect(anonymous.teams.flatMap((t) => t.players).every((p) => p.problems === null)).toBe(true);

    // Teammates share one answer; the other team does not.
    expect(await getTeamStandings(CONTEST, BO, now)).toBe(red);
    expect(blue).not.toBe(red);
  });
});

describe("concurrent requests share one computation", () => {
  it("fifty simultaneous team-board polls load the rows once and score once", async () => {
    const now = nextColdInstant();
    const boards = await Promise.all(
      Array.from({ length: 50 }, (_, i) => getTeamStandings(CONTEST, ANONYMOUS, at(now, i))),
    );

    expect(db.contestReads).toBe(1);
    expect(vi.mocked(computeTeamStandings)).toHaveBeenCalledTimes(1);
    expect(new Set(boards).size).toBe(1);
  });

  it("a whole room of mixed viewers scores the team board once per cutoff, not per request", async () => {
    const room = [ANONYMOUS, ADA, BO, CY, ORGANIZER, ANONYMOUS, CY];

    // Before the freeze the public board and the organizer's are both live truth: one cutoff.
    const live = nextColdInstant();
    await Promise.all(room.map((viewer) => getTeamStandings(CONTEST, viewer, live)));
    expect(vi.mocked(computeTeamStandings)).toHaveBeenCalledTimes(1);

    // After it, the public board is as of the freeze and the organizer's is live: two cutoffs.
    vi.mocked(computeTeamStandings).mockClear();
    invalidateScoringInput(CONTEST);
    const frozen = db.fixture.instants.afterFreeze;
    await Promise.all(room.map((viewer) => getTeamStandings(CONTEST, viewer, frozen)));
    expect(vi.mocked(computeTeamStandings)).toHaveBeenCalledTimes(2);
  });

  it("the individual board and the problem list share one engine call", async () => {
    const now = nextColdInstant();
    await Promise.all([
      getStandings(CONTEST, ORGANIZER, now),
      problemStandingsFor(CONTEST, "p-ada", now),
      problemStandingsFor(CONTEST, "p-cy", now),
    ]);
    expect(vi.mocked(computeStandings)).toHaveBeenCalledTimes(1);
  });
});

/**
 * Every event the room must see goes through `invalidateScoringInput` (the verdict write in
 * `persistResult`, an override, a rejudge, a side-activity entry, a freeze, a reveal). These tests
 * change the rows the way each event does, call the invalidation, and require the very next
 * request, still inside the TTL, to show the change.
 */
describe("an event that changes the board drops the memo at once", () => {
  async function scoreOf(viewer: Viewer, team: string, now: Date): Promise<number | undefined> {
    const board = await getTeamStandings(CONTEST, viewer, now);
    return board.teams.find((t) => t.name === team)?.scoreHundredths;
  }

  it("a verdict", async () => {
    const now = db.fixture.instants.beforeFreeze;
    const before = await scoreOf(ANONYMOUS, "Red", now);
    db.fixture.revisions.push({
      id: 10,
      verdict: "AC",
      score: 200,
      effectiveAt: at(now, -60_000),
      submission: { id: "s-10", participantId: "p-bo", contestProblemId: "cp-b1", submittedAt: at(now, -70_000) },
    });

    // Without the invalidation the board is allowed to lag, inside the TTL...
    expect(await scoreOf(ANONYMOUS, "Red", at(now, 100))).toBe(before);
    // ...and with it, the next request sees the verdict.
    invalidateScoringInput(CONTEST);
    expect(await scoreOf(ANONYMOUS, "Red", at(now, 200))).toBeGreaterThan(before ?? 0);
  });

  it("an override or a rejudge (a new score revision for an existing submission)", async () => {
    const now = db.fixture.instants.beforeFreeze;
    const before = await scoreOf(ORGANIZER, "Red", now);
    db.fixture.revisions.push({ ...structuredClone(db.fixture.revisions[0]!), id: 11, verdict: "WA", score: 0, effectiveAt: at(now, -1_000) });
    invalidateScoringInput(CONTEST);
    expect(await scoreOf(ORGANIZER, "Red", at(now, 100))).toBeLessThan(before ?? 0);
  });

  it("a side activity (a Kahoot payout or a puzzle solve)", async () => {
    const now = db.fixture.instants.beforeFreeze;
    const before = await scoreOf(ANONYMOUS, "Red", now);
    db.fixture.sideActivities.push({ teamId: "t-red", label: "Kahoot", points: 60, enteredAt: at(now, -1_000) });
    invalidateScoringInput(CONTEST);
    expect(await scoreOf(ANONYMOUS, "Red", at(now, 100))).toBe((before ?? 0) + 6_000);
  });

  it("a freeze, and then the reveal", async () => {
    const now = db.fixture.instants.beforeFreeze;
    db.fixture.contest.freezeAt = null;
    expect((await getTeamStandings(CONTEST, ANONYMOUS, now)).frozen).toBe(false);

    db.fixture.contest.state = "FROZEN";
    db.fixture.contest.freezeAt = at(now, -1_000);
    invalidateScoringInput(CONTEST);
    const frozen = await getTeamStandings(CONTEST, ANONYMOUS, at(now, 100));
    expect(frozen.frozen).toBe(true);
    expect(frozen.asOf).toBe(at(now, -1_000).toISOString());

    db.fixture.contest.state = "ENDED";
    invalidateScoringInput(CONTEST);
    const revealed = await getTeamStandings(CONTEST, ANONYMOUS, at(now, 200));
    expect(revealed.frozen).toBe(false);
  });
});

describe("the frozen public board never shows a post-freeze result through the memo", () => {
  function cyScore(board: Awaited<ReturnType<typeof getTeamStandings>>): number | undefined {
    return board.teams.flatMap((t) => t.players).find((p) => p.participantId === "p-cy")?.score;
  }

  it("with the organizer's live board computed first, from the same input", async () => {
    db.fixture.revisions.push(db.fixture.postFreezeRevision);
    const now = db.fixture.instants.afterFreeze;

    const organizer = await getTeamStandings(CONTEST, ORGANIZER, now);
    const publicBoard = await getTeamStandings(CONTEST, ANONYMOUS, at(now, 10));
    const ownTeam = await getTeamStandings(CONTEST, CY, at(now, 20));
    const individual = await getStandings(CONTEST, ANONYMOUS, at(now, 30));
    const individualOrganizer = await getStandings(CONTEST, ORGANIZER, at(now, 40));

    expect(cyScore(organizer)).toBe(100);
    expect(cyScore(publicBoard)).toBe(0);
    expect(cyScore(ownTeam)).toBe(0);
    expect(publicBoard.frozen).toBe(true);
    expect(ownTeam.frozen).toBe(true);
    expect(organizer.frozen).toBe(false);

    const cyRow = (board: typeof individual) =>
      board.divisions.flatMap((d) => d.rows).find((r) => r.participantId === "p-cy");
    expect(cyRow(individual)?.score).toBe(0);
    expect(cyRow(individualOrganizer)?.score).toBe(100);
  });

  it("with the public board computed first, the organizer still sees live truth", async () => {
    db.fixture.revisions.push(db.fixture.postFreezeRevision);
    const now = db.fixture.instants.afterFreeze;

    expect(cyScore(await getTeamStandings(CONTEST, ANONYMOUS, now))).toBe(0);
    expect(cyScore(await getTeamStandings(CONTEST, ORGANIZER, at(now, 10)))).toBe(100);
  });

  it("a live public board cached just before a scheduled freeze is not served after it", async () => {
    const freezeAt = db.fixture.contest.freezeAt!;
    const live = await getTeamStandings(CONTEST, ANONYMOUS, at(freezeAt, -300));
    // Same input (inside the TTL, nothing invalidated) but the freeze instant has passed.
    const frozen = await getTeamStandings(CONTEST, ANONYMOUS, at(freezeAt, 300));

    expect(live.frozen).toBe(false);
    expect(frozen).not.toBe(live);
    expect(frozen.frozen).toBe(true);
    expect(frozen.asOf).toBe(freezeAt.toISOString());
    expect(db.contestReads).toBe(1);
  });
});

describe("the polled boards check the contest clock against the board's own row", () => {
  it("a poll in the middle of the contest reads the contest once, for the board", async () => {
    const now = db.fixture.instants.beforeFreeze;
    await reconcileClockFromBoard(CONTEST, now);
    await getTeamStandings(CONTEST, ANONYMOUS, now);
    expect(db.contestReads).toBe(1);
  });

  it("a poll after the end time reads the row fresh and lets the real clock decide", async () => {
    db.fixture.contest.freezeAt = null;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await reconcileClockFromBoard(CONTEST, new Date("2026-11-13T20:16:00.000Z"));
    // One read for the board's input, one fresh read by `reconcileContestClockById`.
    expect(db.contestReads).toBe(2);
    errors.mockRestore();
  });
});
