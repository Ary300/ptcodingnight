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

  it("never charges for a compile error (organizer decision, 2026-11-17)", () => {
    // This case cost 5 minutes before 2026-11-17.
    const standing = only([
      sub({ submittedAt: at(10), verdict: "CE", score: 0 }),
      sub({ submittedAt: at(20), verdict: "AC", score: 100 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(0);
    expect(standing?.problems[0]?.rejectedCount).toBe(0);
  });
});

/*
  Organizer decision, 2026-11-17 (docs/SCORING.md §5.1). Penalty counts only the rejections sent
  BEFORE the submission that first reached the problem's final best score. CE never counts.

  The live walkthrough that prompted it: AC for 100, then a wrong Python and two C++ compile errors
  on the same problem, and the student finished with 15 penalty minutes for attempts made after
  they had already solved it.
*/
describe("penalty counts only rejections before the first best submission", () => {
  it("AC, then WA, then CE: 0", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "AC", score: 100 }),
      sub({ submittedAt: at(20), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(30), verdict: "CE", score: 0 }),
    ]);

    expect(standing?.score).toBe(100);
    expect(standing?.penaltyMinutes).toBe(0);
    expect(standing?.problems[0]?.rejectedCount).toBe(0);
  });

  it("the walkthrough: AC, then a WA and two CEs: 0", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "AC", score: 100 }),
      sub({ submittedAt: at(20), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(21), verdict: "CE", score: 0 }),
      sub({ submittedAt: at(22), verdict: "CE", score: 0 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(0);
  });

  it("WA, then AC: 5", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(20), verdict: "AC", score: 100 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(5);
    expect(standing?.problems[0]?.rejectedCount).toBe(1);
  });

  it("CE, then AC: 0", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "CE", score: 0 }),
      sub({ submittedAt: at(20), verdict: "AC", score: 100 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(0);
  });

  it("WA, partial 50, WA, then 100: 3 rejections before the first 100, so 15", () => {
    // The partial is a WA verdict and counts as a rejection, because it was sent before the
    // submission that reached the final best. Its 50 points do not make it a cutoff.
    const standing = only([
      sub({ submittedAt: at(10), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(20), verdict: "WA", score: 50 }),
      sub({ submittedAt: at(30), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(40), verdict: "AC", score: 100 }),
    ]);

    expect(standing?.score).toBe(100);
    expect(standing?.penaltyMinutes).toBe(15);
    expect(standing?.problems[0]?.rejectedCount).toBe(3);
  });

  it("WA, then 100, then WA: 5", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(20), verdict: "AC", score: 100 }),
      sub({ submittedAt: at(30), verdict: "WA", score: 0 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(5);
    expect(standing?.problems[0]?.rejectedCount).toBe(1);
  });

  it("never scored: 0, and every rejection is still reported", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(20), verdict: "TLE", score: 0 }),
      sub({ submittedAt: at(30), verdict: "MLE", score: 0 }),
      sub({ submittedAt: at(40), verdict: "CE", score: 0 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(0);
    expect(standing?.problems[0]?.rejectedCount).toBe(3);
  });

  it("counts WA, TLE, MLE and RE alike before the cutoff", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(11), verdict: "TLE", score: 0 }),
      sub({ submittedAt: at(12), verdict: "MLE", score: 0 }),
      sub({ submittedAt: at(13), verdict: "RE", score: 0 }),
      sub({ submittedAt: at(14), verdict: "IE", score: 0 }),
      sub({ submittedAt: at(15), verdict: "CE", score: 0 }),
      sub({ submittedAt: at(20), verdict: "AC", score: 100 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(20);
  });

  it("a partial-credit WA that is itself the best is not charged for itself", () => {
    // 120 then 80: the 120 is the first submission to reach the final best, and nothing came
    // before it. The 80 came after it. Before 2026-11-17 this cost 10.
    const standing = only([
      sub({ submittedAt: at(10), verdict: "WA", score: 120 }),
      sub({ submittedAt: at(20), verdict: "WA", score: 80 }),
    ]);

    expect(standing?.score).toBe(120);
    expect(standing?.penaltyMinutes).toBe(0);
  });

  it("a later submission that only EQUALS the best does not move the cutoff", () => {
    const standing = only([
      sub({ submittedAt: at(10), verdict: "AC", score: 100 }),
      sub({ submittedAt: at(20), verdict: "WA", score: 0 }),
      sub({ submittedAt: at(30), verdict: "AC", score: 100 }),
    ]);

    expect(standing?.penaltyMinutes).toBe(0);
  });

  it("charges nothing when hints take the problem's score to zero", () => {
    const standing = only(
      [
        sub({ submittedAt: at(10), contestProblemId: "g1", verdict: "WA", score: 0 }),
        sub({ submittedAt: at(20), contestProblemId: "g1", verdict: "WA", score: 30 }),
      ],
      [0, 1, 2, 3, 4, 5, 6].map((index) => ({
        participantId: "u1",
        contestProblemId: "g1",
        hintIndex: index,
        grantedAt: at(5),
      })),
    );

    expect(standing?.score).toBe(0);
    expect(standing?.penaltyMinutes).toBe(0);
  });

  describe("overrides and rejudges replay through the same cutoff", () => {
    const revision = (
      submissionId: string,
      submittedMinutes: number,
      verdict: Verdict | null,
      score: number,
      effectiveMinutes: number,
      revisionOrder: number,
    ): SubmissionRecord => ({
      submissionId,
      participantId: "u1",
      contestProblemId: "p1",
      submittedAt: at(submittedMinutes),
      effectiveAt: at(effectiveMinutes),
      verdict,
      score,
      revisionOrder,
    });

    const log = [
      revision("o1", 10, "WA", 0, 10, 1),
      revision("o2", 20, "WA", 0, 20, 1),
      revision("o3", 30, "WA", 0, 30, 1),
      revision("o4", 40, "AC", 100, 40, 1),
    ];

    it("an override that raises an earlier submission to the best moves the cutoff earlier", () => {
      expect(only(log)?.penaltyMinutes).toBe(15);

      // At 60 an organizer overrides o2 to AC/100. The first submission to reach 100 is now o2,
      // so only o1 came before it.
      const overridden = [...log, revision("o2", 20, "AC", 100, 60, 2)];
      const live = only(overridden);
      expect(live?.penaltyMinutes).toBe(5);
      expect(live?.problems[0]?.rejectedCount).toBe(1);

      // The board frozen at 50 never saw the override, so it still charges 15.
      expect(only(overridden, [], config(), { upTo: at(50) })?.penaltyMinutes).toBe(15);
    });

    it("an override that lowers the cutoff submission moves the cutoff later", () => {
      const solvedEarly = [
        revision("o1", 10, "WA", 0, 10, 1),
        revision("o2", 20, "AC", 100, 20, 1),
        revision("o3", 30, "WA", 0, 30, 1),
        revision("o4", 40, "AC", 100, 40, 1),
      ];
      expect(only(solvedEarly)?.penaltyMinutes).toBe(5);

      // o2 overridden to WA/0: the first 100 is now o4, with o1, o2 and o3 before it.
      const overridden = [...solvedEarly, revision("o2", 20, "WA", 0, 60, 2)];
      expect(only(overridden)?.penaltyMinutes).toBe(15);
    });

    it("a rejudge tombstone removes a rejection from the count until it is re-judged", () => {
      const tombstoned = [...log, revision("o2", 20, null, 0, 60, 2)];
      expect(only(tombstoned)?.penaltyMinutes).toBe(10);

      const rejudgedAsCe = [...tombstoned, revision("o2", 20, "CE", 0, 70, 3)];
      expect(only(rejudgedAsCe)?.penaltyMinutes).toBe(10);
    });
  });

  it("replays byte-identically from any input order", () => {
    const participantsTwo: ParticipantRecord[] = [
      ...players,
      { participantId: "u2", displayName: "Two", divisionId: "d1", teamId: null, chosenSetId: null },
    ];
    const row = (
      submissionId: string,
      participantId: string,
      contestProblemId: string,
      minutes: number,
      verdict: Verdict,
      score: number,
    ): SubmissionRecord => ({
      submissionId,
      participantId,
      contestProblemId,
      submittedAt: at(minutes),
      effectiveAt: at(minutes),
      verdict,
      score,
    });
    const log: SubmissionRecord[] = [
      row("r01", "u1", "p1", 10, "WA", 0),
      row("r02", "u1", "p1", 20, "WA", 50),
      row("r03", "u1", "p1", 30, "WA", 0),
      row("r04", "u1", "p1", 40, "AC", 100),
      row("r05", "u1", "p1", 50, "WA", 0),
      row("r06", "u1", "p2", 15, "CE", 0),
      row("r07", "u1", "p2", 25, "AC", 200),
      // Same instant: the id decides which came first, never the input order.
      row("r08", "u2", "p1", 30, "WA", 0),
      row("r09", "u2", "p1", 30, "AC", 100),
      row("r10", "u2", "p1", 30, "WA", 0),
      row("r11", "u2", "p2", 35, "TLE", 0),
    ];

    const serialize = (submissions: readonly SubmissionRecord[], people: ParticipantRecord[]) =>
      JSON.stringify(computeStandings(config(), people, submissions, []));
    const baseline = serialize(log, participantsTwo);

    // Fixed permutations, not Math.random: a failing order must be reproducible.
    const permutations = [
      [...log].reverse(),
      [...log.slice(5), ...log.slice(0, 5)],
      log.filter((_, i) => i % 2 === 1).concat(log.filter((_, i) => i % 2 === 0)),
      [...log].sort((a, b) => (a.submissionId < b.submissionId ? 1 : -1)),
    ];
    for (const permutation of permutations) {
      expect(serialize(permutation, [...participantsTwo].reverse())).toBe(baseline);
    }
    expect(serialize(log, participantsTwo)).toBe(baseline);

    const [u1, u2] = computeStandings(config(), participantsTwo, log, []);
    // u1: p1 has 3 rejections before r04 (r05 after is free); p2's CE is free.
    expect(u1?.penaltyMinutes).toBe(15);
    // u2: r08 precedes r09 by id, r10 follows it; p2 never scored.
    expect(u2?.penaltyMinutes).toBe(5);
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

/*
  The last seconds of the night. Coding Night ends at 8:15 with the board frozen at 8:00, and the
  judge queue is deep at the end, so a correct answer submitted at 8:14:59.9 is commonly not judged
  until well after 8:15. Its `effectiveAt` is the moment the verdict was written.
*/
describe("a submission accepted before the end and judged after it", () => {
  const freeze = at(105);
  const end = at(120);
  const lastSecond = new Date(end.getTime() - 100);
  const judgedLate = new Date(end.getTime() + 40_000);
  const night = config({ endsAt: end, freezeAt: freeze });

  it("counts on the organizer's board and the final board", () => {
    const standing = only(
      [sub({ submittedAt: lastSecond, effectiveAt: judgedLate, verdict: "AC", score: 100 })],
      [],
      night,
      { upTo: null },
    );
    expect(standing?.score).toBe(100);
    // The tie-break clock is when it was SUBMITTED, never when the judge got round to it.
    expect(standing?.lastScoreIncreaseAt).toEqual(lastSecond);
  });

  it("is absent from the frozen public board", () => {
    const standing = only(
      [sub({ submittedAt: lastSecond, effectiveAt: judgedLate, verdict: "AC", score: 100 })],
      [],
      night,
      { upTo: freeze },
    );
    expect(standing?.score).toBe(0);
  });
});
