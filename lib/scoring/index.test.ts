import { describe, expect, it } from "vitest";

import { computeStandings } from "@/lib/scoring";
import type {
  ContestConfig,
  HintGrantRecord,
  ParticipantRecord,
  ScoringPresetId,
  SubmissionRecord,
} from "@/lib/types/scoring";
import type { Verdict } from "@/lib/schemas/judge";

const START = new Date("2025-11-14T18:00:00.000Z");

/** Minutes after contest start. Keeps the test bodies readable. */
const at = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

function config(over: Partial<ContestConfig> = {}): ContestConfig {
  return {
    contestId: "c1",
    presetId: "coding-night-classic",
    startsAt: START,
    endsAt: at(120),
    freezeAt: null,
    divisions: [{ divisionId: "d1", name: "Intermediate", sortOrder: 0 }],
    problems: [
      { contestProblemId: "p1", divisionId: "d1", basePoints: 100, setId: null, round: "INDIVIDUAL" as const },
      { contestProblemId: "p2", divisionId: "d1", basePoints: 200, setId: null, round: "INDIVIDUAL" as const },
      { contestProblemId: "g1", divisionId: "d1", basePoints: 300, setId: null, round: "GROUP" as const },
    ],
    groupPointsInsideMean: true,
    sideActivitiesFlat: true,
    ...over,
  };
}

const players: ParticipantRecord[] = [
  { participantId: "u1", displayName: "One", divisionId: "d1", teamId: null, chosenSetId: null },
];

let seq = 0;
function sub(
  over: Partial<SubmissionRecord> & { verdict: Verdict; score: number; submittedAt: Date },
): SubmissionRecord {
  seq += 1;
  return {
    submissionId: `s${String(seq).padStart(3, "0")}`,
    participantId: "u1",
    contestProblemId: "p1",
    // Defaults to submittedAt, so every existing case behaves exactly as it did before
    // `effectiveAt` existed. A case that is ABOUT a late override states it explicitly.
    effectiveAt: over.submittedAt,
    ...over,
  };
}

const only = (
  submissions: SubmissionRecord[],
  hints: HintGrantRecord[] = [],
  cfg: ContestConfig = config(),
  opts?: { upTo?: Date | null },
) => computeStandings(cfg, players, submissions, hints, opts)[0];

describe("partial credit", () => {
  it("keeps the best score, not the most recent one", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "WA", score: 80 }),
      sub({ submittedAt: at(20), verdict: "WA", score: 30 }),
    ]);

    expect(standing?.score).toBe(80);
  });

  it("keeps the best score even when an earlier submission was the winner", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "AC", score: 100 }),
      sub({ submittedAt: at(20), verdict: "WA", score: 10 }),
    ]);

    expect(standing?.score).toBe(100);
  });
});

describe("penalty", () => {
  it("charges 5 minutes per rejection on a problem eventually scored", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(20), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(30), verdict: "AC", score: 100 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(10);
  });

  it("charges nothing for rejections on a problem never scored", () => {
    // The rule most likely to be implemented wrong: penalty is not knowable until the whole
    // log has been replayed, because the condition is on the problem's FINAL score.
    const standing = only([
      sub({ submittedAt: at(10), verdict: "RE", score: 0 }),
      sub({ submittedAt: at(20), verdict: "TLE", score: 0 }),
      sub({ submittedAt: at(30), verdict: "WA", score: 0 }),
    ]);

    expect(standing?.score).toBe(0);
    expect(standing?.penaltyMinutes).toBe(0);
    expect(standing?.problems[0]?.rejectedCount).toBe(3);
  });

  it("never charges for an IE", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "IE", score: 0 }),
      sub({ submittedAt: at(15), verdict: "IE", score: 0 }),
      sub({ submittedAt: at(20), verdict: "AC", score: 100 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(0);
    expect(standing?.problems[0]?.rejectedCount).toBe(0);
  });

  it("charges for a compile error", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "CE", score: 0 }),
      sub({ submittedAt: at(20), verdict: "AC", score: 100 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(5);
  });
});

describe("hints", () => {
  const hint = (index: number, minutes: number): HintGrantRecord => ({
    participantId: "u1",
    contestProblemId: "g1",
    hintIndex: index,
    grantedAt: at(minutes),
  });

  it("deducts 15% of base points per hint", () => {
    const standing = only(
      [sub({ submittedAt: at(30), contestProblemId: "g1", verdict: "AC", score: 300 })],
      [hint(0, 10), hint(1, 20)],
    );

    // round(2 * 0.15 * 300) = 90
    expect(standing?.problems[0]?.hintDeduction).toBe(90);
    expect(standing?.score).toBe(210);
  });

  it("rounds the total once rather than per hint", () => {
    const cfg = config({
      problems: [{ contestProblemId: "g1", divisionId: "d1", basePoints: 250, setId: null, round: "GROUP" as const }],
    });
    const standing = only(
      [sub({ submittedAt: at(30), contestProblemId: "g1", verdict: "AC", score: 250 })],
      [hint(0, 5), hint(1, 6), hint(2, 7)],
      cfg,
    );

    // round(3 * 0.15 * 250) = round(112.5) = 113, not 3 * round(37.5) = 114
    expect(standing?.problems[0]?.hintDeduction).toBe(113);
    expect(standing?.score).toBe(137);
  });

  it("never drives a problem score below zero", () => {
    const standing = only(
      [sub({ submittedAt: at(30), contestProblemId: "g1", verdict: "WA", score: 20 })],
      [hint(0, 5), hint(1, 6), hint(2, 7)],
    );

    expect(standing?.score).toBe(0);
  });

  it("still charges a hint taken on a problem never submitted to", () => {
    const standing = only([], [hint(0, 5)]);

    expect(standing?.score).toBe(0);
    expect(standing?.problems[0]?.hintsTaken).toBe(1);
  });
});

describe("freeze", () => {
  const log = [
    sub({ submittedAt: at(10), verdict: "AC", score: 100 }),
    sub({ submittedAt: at(50), contestProblemId: "p2", verdict: "AC", score: 200 }),
  ];

  it("hides submissions after the freeze from the public board", () => {
    const standing = only(log, [], config(), { upTo: at(30) });

    expect(standing?.score).toBe(100);
  });

  it("shows the admin the live truth", () => {
    const standing = only(log, [], config(), { upTo: null });

    expect(standing?.score).toBe(300);
  });

  it("unfreezing is the same call without a cutoff", () => {
    const frozen = only(log, [], config(), { upTo: at(30) });
    const revealed = only(log, [], config());

    expect(frozen?.score).toBe(100);
    expect(revealed?.score).toBe(300);
  });

  it("hides hints granted after the freeze too", () => {
    const standing = only(
      [sub({ submittedAt: at(10), contestProblemId: "g1", verdict: "AC", score: 300 })],
      [{ participantId: "u1", contestProblemId: "g1", hintIndex: 0, grantedAt: at(40) }],
      config(),
      { upTo: at(30) },
    );

    expect(standing?.score).toBe(300);
  });
});

describe("ICPC preset", () => {
  const icpc = config({ presetId: "icpc" as ScoringPresetId });

  it("scores solve count, not points", () => {
    const standing = only(
      [
        sub({ submittedAt: at(10), verdict: "AC", score: 100 }),
        sub({ submittedAt: at(20), contestProblemId: "p2", verdict: "AC", score: 200 }),
      ],
      [],
      icpc,
    );

    expect(standing?.score).toBe(2);
  });

  it("gives no credit for a partial score", () => {
    const standing = only([sub({ submittedAt: at(10), verdict: "WA", score: 90 })], [], icpc);

    expect(standing?.score).toBe(0);
  });

  it("charges 20 minutes per wrong submission on a solved problem", () => {
    const standing = only(
      [
        sub({ submittedAt: at(10), verdict: "WA", score: 0 }),
        sub({ submittedAt: at(20), verdict: "AC", score: 100 }),
      ],
      [],
      icpc,
    );

    expect(standing?.penaltyMinutes).toBe(20);
  });

  it("charges nothing on an unsolved problem", () => {
    const standing = only(
      [
        sub({ submittedAt: at(10), verdict: "WA", score: 0 }),
        sub({ submittedAt: at(20), verdict: "WA", score: 0 }),
      ],
      [],
      icpc,
    );

    expect(standing?.penaltyMinutes).toBe(0);
  });

  it("does not charge for attempts made after the solve", () => {
    const standing = only(
      [
        sub({ submittedAt: at(10), verdict: "AC", score: 100 }),
        sub({ submittedAt: at(20), verdict: "WA", score: 0 }),
      ],
      [],
      icpc,
    );

    expect(standing?.penaltyMinutes).toBe(0);
  });
});

describe("divisions", () => {
  it("ranks each division independently", () => {
    const cfg = config({
      divisions: [
        { divisionId: "d1", name: "Intermediate", sortOrder: 0 },
        { divisionId: "d2", name: "Advanced", sortOrder: 1 },
      ],
    });
    const people: ParticipantRecord[] = [
      { participantId: "i1", displayName: "Int One", divisionId: "d1", teamId: null, chosenSetId: null },
      { participantId: "a1", displayName: "Adv One", divisionId: "d2", teamId: null, chosenSetId: null },
    ];
    const submissions = [
      sub({ participantId: "i1", submittedAt: at(10), verdict: "AC", score: 100 }),
      sub({ participantId: "a1", submittedAt: at(10), verdict: "WA", score: 5 }),
    ];

    const standings = computeStandings(cfg, people, submissions, []);

    // The Advanced player scores far less but still wins Advanced.
    expect(standings.map((s) => [s.participantId, s.rank])).toEqual([
      ["i1", 1],
      ["a1", 1],
    ]);
  });

  it("emits divisions in configured sort order", () => {
    const cfg = config({
      divisions: [
        { divisionId: "d2", name: "Advanced", sortOrder: 1 },
        { divisionId: "d1", name: "Intermediate", sortOrder: 0 },
      ],
    });
    const people: ParticipantRecord[] = [
      { participantId: "a1", displayName: "Adv", divisionId: "d2", teamId: null, chosenSetId: null },
      { participantId: "i1", displayName: "Int", divisionId: "d1", teamId: null, chosenSetId: null },
    ];

    const standings = computeStandings(cfg, people, [], []);

    expect(standings.map((s) => s.divisionId)).toEqual(["d1", "d2"]);
  });

  it("groups participants with no division rather than dropping them", () => {
    const people: ParticipantRecord[] = [
      { participantId: "u1", displayName: "One", divisionId: null, teamId: null, chosenSetId: null },
    ];

    const standings = computeStandings(config(), people, [], []);

    expect(standings).toHaveLength(1);
    expect(standings[0]?.rank).toBe(1);
  });
});

describe("edge cases", () => {
  it("returns a standing for a participant who never submitted", () => {
    const standing = only([]);

    expect(standing?.score).toBe(0);
    expect(standing?.penaltyMinutes).toBe(0);
    expect(standing?.lastScoreIncreaseAt).toBeNull();
    expect(standing?.problems).toEqual([]);
  });

  it("returns nothing when there are no participants", () => {
    expect(computeStandings(config(), [], [], [])).toEqual([]);
  });

  it("scores zero for a problem missing from config rather than throwing", () => {
    const standing = only([
      sub({ submittedAt: at(10), contestProblemId: "ghost", verdict: "AC", score: 100 }),
    ]);

    expect(standing?.score).toBe(100);
    expect(standing?.problems[0]?.hintDeduction).toBe(0);
  });

  it("records the last score-increasing submission, not the last submission", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "AC", score: 100 }),
      sub({ submittedAt: at(90), contestProblemId: "p2", verdict: "WA", score: 0 }),
    ]);

    expect(standing?.lastScoreIncreaseAt?.toISOString()).toBe(at(10).toISOString());
  });

  it("a frozen board does not move when a pre-freeze submission is overridden after the freeze", () => {
    /*
      THE BUG THIS PINS.

      The window filtered on `submittedAt` alone, which answers "which submissions existed yet" —
      not "what did the board know". So a submission made BEFORE the freeze whose verdict was
      overridden or rejudged AFTER it passed straight through carrying its new score.

      Measured on the running app, anonymously: a contest frozen with a student on 0, an override
      to AC/140, and 18.8 seconds later GET /api/standings returned `frozen: true`, the SAME
      `asOf`, and 140. A rejudge did the reverse and dropped a named student to zero on the wall —
      which is the projector, in front of the room, during the one period the freeze exists to
      protect.
    */
    const freeze = at(10);

    // Submitted before the freeze, and the judge said WA before the freeze too.
    const beforeOverride = only([
      sub({ submittedAt: at(5), effectiveAt: at(5), verdict: "WA", score: 0 }),
    ]);
    expect(beforeOverride?.score).toBe(0);

    // An organizer overrides it to AC AFTER the freeze. Same submission, same submittedAt.
    // `only(submissions, hints, config, options)` — the cutoff is the FOURTH argument.
    const afterOverride = only(
      [sub({ submittedAt: at(5), effectiveAt: at(20), verdict: "AC", score: 100 })],
      [],
      config(),
      { upTo: freeze },
    );
    expect(
      afterOverride?.score,
      "the frozen board moved when a verdict changed after the freeze",
    ).toBe(0);

    // And once unfrozen, it counts — the score is not lost, only held.
    const unfrozen = only([
      sub({ submittedAt: at(5), effectiveAt: at(20), verdict: "AC", score: 100 }),
    ]);
    expect(unfrozen?.score).toBe(100);
  });

  it("replays the pre-freeze answer after a later override or rejudge tombstone", () => {
    const freeze = at(10);
    const original: SubmissionRecord = {
      submissionId: "temporal-answer",
      participantId: "u1",
      contestProblemId: "p1",
      submittedAt: at(4),
      effectiveAt: at(5),
      verdict: "AC",
      score: 100,
      revisionOrder: 1,
    };
    const override: SubmissionRecord = {
      ...original,
      effectiveAt: at(20),
      verdict: "WA",
      score: 40,
      revisionOrder: 2,
    };
    const rejudgeTombstone: SubmissionRecord = {
      ...original,
      effectiveAt: at(30),
      verdict: null,
      score: 0,
      revisionOrder: 3,
    };

    expect(only([original, override, rejudgeTombstone], [], config(), { upTo: freeze })?.score).toBe(
      100,
    );
    expect(only([original, override])?.score).toBe(40);
    expect(only([original, override, rejudgeTombstone])?.score).toBe(0);
  });

  it("orders same-instant submissions by id so replay is stable", () => {
    const sameTime = at(10);
    const a: SubmissionRecord = {
      submissionId: "s-b",
      participantId: "u1",
      contestProblemId: "p1",
      submittedAt: sameTime,
      effectiveAt: sameTime,
      verdict: "AC",
      score: 100,
    };
    const b: SubmissionRecord = { ...a, submissionId: "s-a", verdict: "WA", score: 40 };

    const forward = computeStandings(config(), players, [a, b], []);
    const backward = computeStandings(config(), players, [b, a], []);

    expect(forward[0]?.score).toBe(backward[0]?.score);
    expect(forward[0]?.penaltyMinutes).toBe(backward[0]?.penaltyMinutes);
  });
});
