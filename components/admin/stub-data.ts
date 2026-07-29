import type { StandingsResponse } from "@/lib/schemas/api";

import type {
  AdminProblemSummary,
  AdminSubmissionRow,
  JudgeHealth,
  ReferenceCaseOutcome,
  ReferenceRunReport,
  TestCaseDraft,
} from "@/components/admin/contract";
import { contradictoryCases } from "@/components/admin/testcases";

/**
 * STUB DATA — nothing here comes from a route.
 *
 * `app/api/**` is `backend-api`'s partition and does not exist in this worktree, so the
 * admin screens render against the contract with fixtures instead. Every export is prefixed
 * `STUB_` so that a real fetch replacing it is a one-line diff and an unreplaced one is
 * obvious in review.
 *
 * The titles are real rows from `data/problems_seed.csv` and the history flags are the real
 * ones, because the picker's whole job is to make those flags legible and a made-up
 * distribution would not exercise it. The statement bodies are written here, not imported:
 * PRD §8 forbids copying HackerRank statements, and that applies to fixtures too.
 */

export const STUB_CONTEST_NAME = "Coding Night 2026";

export const STUB_PROBLEMS: readonly AdminProblemSummary[] = [
  {
    problemId: "p-magic-square",
    slug: "forming-a-magic-square",
    title: "Forming a Magic Square",
    state: "DRAFT",
    type: "algorithm",
    pastStatus: "used-but-zero-points",
    difficulty: "M",
    division: null,
    notes: null,
    hasOriginalStatement: false,
    testCaseCount: 0,
    sampleCaseCount: 0,
    referencePasses: null,
  },
  {
    problemId: "p-queens-attack",
    slug: "queens-attack-ii",
    title: "Queen's Attack II",
    state: "DRAFT",
    type: "algorithm",
    pastStatus: "used-but-zero-points",
    difficulty: "H",
    division: "Advanced",
    notes: null,
    hasOriginalStatement: false,
    testCaseCount: 0,
    sampleCaseCount: 0,
    referencePasses: null,
  },
  {
    problemId: "p-common-child",
    slug: "common-child",
    title: "Common Child",
    state: "DRAFT",
    type: "algorithm",
    pastStatus: "used-but-zero-points",
    difficulty: "H",
    division: null,
    notes: null,
    hasOriginalStatement: false,
    testCaseCount: 0,
    sampleCaseCount: 0,
    referencePasses: null,
  },
  {
    problemId: "p-append-delete",
    slug: "append-and-delete",
    title: "Append and Delete",
    state: "DRAFT",
    type: "algorithm",
    pastStatus: "partially-solved-in-past",
    difficulty: "M",
    division: "Intermediate",
    notes: null,
    hasOriginalStatement: true,
    testCaseCount: 12,
    sampleCaseCount: 2,
    referencePasses: false,
  },
  {
    problemId: "p-save-humanity",
    slug: "save-humanity",
    title: "Save Humanity",
    state: "DRAFT",
    type: "algorithm",
    pastStatus: "partially-solved-in-past",
    difficulty: "H",
    division: "Advanced",
    notes: null,
    hasOriginalStatement: true,
    testCaseCount: 0,
    sampleCaseCount: 0,
    referencePasses: null,
  },
  {
    problemId: "p-solve-me-first",
    slug: "solve-me-first",
    title: "Solve Me First",
    state: "READY",
    type: "algorithm",
    pastStatus: "solved-in-past",
    difficulty: "E",
    division: "Intermediate",
    notes: null,
    hasOriginalStatement: true,
    testCaseCount: 8,
    sampleCaseCount: 2,
    referencePasses: true,
  },
  {
    problemId: "p-very-big-sum",
    slug: "a-very-big-sum",
    title: "A Very Big Sum",
    state: "READY",
    type: "algorithm",
    pastStatus: "solved-in-past",
    difficulty: "E",
    division: "Intermediate",
    notes: null,
    hasOriginalStatement: true,
    testCaseCount: 10,
    sampleCaseCount: 2,
    referencePasses: true,
  },
  {
    problemId: "p-sequence-equation",
    slug: "sequence-equation",
    title: "Sequence Equation",
    state: "READY",
    type: "algorithm",
    pastStatus: "candidate-unused",
    difficulty: "E",
    division: null,
    notes: "hackerrank acceptance rate 97.67%",
    hasOriginalStatement: true,
    testCaseCount: 14,
    sampleCaseCount: 2,
    referencePasses: true,
  },
  {
    problemId: "p-chocolate-feast",
    slug: "chocolate-feast",
    title: "Chocolate Feast",
    state: "DRAFT",
    type: "algorithm",
    pastStatus: "candidate-unused",
    difficulty: "E",
    division: null,
    notes: "hackerrank acceptance rate 92.44%",
    hasOriginalStatement: false,
    testCaseCount: 0,
    sampleCaseCount: 0,
    referencePasses: null,
  },
  {
    problemId: "p-insertion-sort-adv",
    slug: "insertion-sort-advanced-analysis",
    title: "Insertion Sort Advanced Analysis",
    state: "DRAFT",
    type: "group",
    pastStatus: "group-problem",
    difficulty: "H",
    division: null,
    notes: "group round; hints unlocked via CodingBat",
    hasOriginalStatement: false,
    testCaseCount: 4,
    sampleCaseCount: 1,
    referencePasses: null,
  },
  {
    problemId: "p-sum67-python",
    slug: "sum67-python",
    title: "sum67",
    state: "READY",
    type: "codingbat",
    pastStatus: "hint-currency",
    difficulty: "E",
    division: null,
    notes: "Python; warmup",
    hasOriginalStatement: true,
    testCaseCount: 6,
    sampleCaseCount: 1,
    referencePasses: true,
  },
  {
    problemId: "p-signal-tower",
    slug: "signal-tower",
    title: "Signal Tower",
    state: "ARCHIVED",
    type: "algorithm",
    pastStatus: "used-but-zero-points",
    difficulty: "H",
    division: "Advanced",
    notes: null,
    hasOriginalStatement: false,
    testCaseCount: 0,
    sampleCaseCount: 0,
    referencePasses: null,
  },
];

/** An original statement, written for this platform. Never lifted from anywhere. */
export const STUB_STATEMENT_MD = `# Panther Ledger

The Coding Night scorekeeper writes every completed round into a ledger as a single line of
integers. At the end of the night she wants the **largest total** she can build by taking a
contiguous run of rounds.

## Input

The first line contains a single integer \`n\`, the number of rounds.
The second line contains \`n\` space-separated integers, the score of each round.

## Output

Print one integer: the largest sum obtainable from any contiguous run of one or more rounds.

## Constraints

- 1 <= n <= 100000
- -10000 <= score <= 10000

> Scores can be negative. A round where everybody times out really does cost the ledger.
`;

export const STUB_TEST_CASES: readonly TestCaseDraft[] = [
  {
    id: "tc-1",
    ordinal: 0,
    input: "5\n1 -2 3 4 -1",
    expectedOutput: "7",
    isSample: true,
    points: 0,
    group: null,
  },
  {
    id: "tc-2",
    ordinal: 1,
    input: "3\n-4 -2 -9",
    expectedOutput: "-2",
    isSample: true,
    points: 0,
    group: null,
  },
  {
    id: "tc-3",
    ordinal: 2,
    input: "8\n2 2 2 -20 5 5 5 5",
    expectedOutput: "20",
    isSample: false,
    points: 25,
    group: "core",
  },
  {
    id: "tc-4",
    ordinal: 3,
    input: "1\n-10000",
    expectedOutput: "-10000",
    isSample: false,
    points: 25,
    group: "edge",
  },
];

export const STUB_REFERENCE_SOLUTION = `import sys

def main() -> None:
    data = sys.stdin.read().split()
    n = int(data[0])
    values = [int(v) for v in data[1 : 1 + n]]
    best = running = values[0]
    for value in values[1:]:
        running = max(value, running + value)
        best = max(best, running)
    print(best)

main()
`;

/**
 * STUB reference runner.
 *
 * The real one enqueues the reference solution against every case in the judge sandbox and
 * returns the verdicts (`worker/`, `lib/judge/`). That route does not exist in this
 * worktree, so this stands in with the subset of the same checks that can honestly be made
 * without executing anything: an empty expected output, and two cases whose inputs match
 * but whose expected outputs do not — a contradiction no solution can satisfy.
 *
 * It deliberately fails in exactly the cases the real runner would also fail, so the loud
 * failure path is reachable by editing a case rather than by faking a result.
 */
export async function stubReferenceRun(
  cases: readonly TestCaseDraft[],
): Promise<ReferenceRunReport> {
  const contradictions = new Set(contradictoryCases(cases).map((c) => c.id));

  const outcomes: ReferenceCaseOutcome[] = cases.map((testCase, index) => {
    const blank = testCase.expectedOutput.trim().length === 0;
    const contradicted = contradictions.has(testCase.id);

    return {
      ordinal: index,
      isSample: testCase.isSample,
      passed: !blank && !contradicted,
      runtimeMs: blank || contradicted ? null : 40 + index * 3,
      detail: blank
        ? "Expected output is empty, so nothing the reference prints can match it."
        : contradicted
          ? "Another case has the same input but a different expected output. No solution can pass both."
          : null,
    };
  });

  return {
    startedAt: new Date().toISOString(),
    language: "PYTHON",
    cases: outcomes,
    compileError: null,
  };
}

export const STUB_JUDGE_HEALTH: JudgeHealth = {
  queueDepth: 7,
  active: 2,
  failed: 1,
  workersOnline: 2,
  oldestWaitingMs: 4_200,
  lastHeartbeatAgoMs: 1_100,
};

export const STUB_SUBMISSIONS: readonly AdminSubmissionRow[] = [
  {
    submissionId: "s-1041",
    participantId: "u-avery",
    displayName: "Avery Lin",
    divisionName: "Advanced",
    slotLabel: "A3",
    problemTitle: "Save Humanity",
    language: "PYTHON",
    submittedAt: "2026-11-14T19:41:08.000Z",
    verdict: null,
    score: 0,
    runtimeMs: null,
    attempt: 1,
    overriddenReason: null,
  },
  {
    submissionId: "s-1040",
    participantId: "u-jordan",
    displayName: "Jordan Ruiz",
    divisionName: "Intermediate",
    slotLabel: "I2",
    problemTitle: "A Very Big Sum",
    language: "JAVA",
    submittedAt: "2026-11-14T19:40:52.000Z",
    verdict: "IE",
    score: 0,
    runtimeMs: null,
    attempt: 2,
    overriddenReason: null,
  },
  {
    submissionId: "s-1039",
    participantId: "u-sam",
    displayName: "Sam Okafor",
    divisionName: "Advanced",
    slotLabel: "A1",
    problemTitle: "Sequence Equation",
    language: "PYTHON",
    submittedAt: "2026-11-14T19:39:31.000Z",
    verdict: "AC",
    score: 300,
    runtimeMs: 84,
    attempt: 1,
    overriddenReason: null,
  },
  {
    submissionId: "s-1038",
    participantId: "u-jordan",
    displayName: "Jordan Ruiz",
    divisionName: "Intermediate",
    slotLabel: "I2",
    problemTitle: "A Very Big Sum",
    language: "JAVA",
    submittedAt: "2026-11-14T19:37:14.000Z",
    verdict: "TLE",
    score: 0,
    runtimeMs: null,
    attempt: 1,
    overriddenReason: null,
  },
  {
    submissionId: "s-1037",
    participantId: "u-priya",
    displayName: "Priya Anand",
    divisionName: "Intermediate",
    slotLabel: "I1",
    problemTitle: "Solve Me First",
    language: "PYTHON",
    submittedAt: "2026-11-14T19:31:02.000Z",
    verdict: "AC",
    score: 100,
    runtimeMs: 41,
    attempt: 1,
    overriddenReason: null,
  },
  {
    submissionId: "s-1036",
    participantId: "u-avery",
    displayName: "Avery Lin",
    divisionName: "Advanced",
    slotLabel: "A2",
    problemTitle: "Common Child",
    language: "PYTHON",
    submittedAt: "2026-11-14T19:24:47.000Z",
    verdict: "WA",
    score: 120,
    runtimeMs: 233,
    attempt: 1,
    overriddenReason: "Judge host stalled mid-run; rejudged and confirmed by hand.",
  },
];

export const STUB_STANDINGS: StandingsResponse = {
  contestId: "c-2026",
  frozen: false,
  asOf: "2026-11-14T21:00:00.000Z",
  endsAt: "2026-11-14T21:00:00.000Z",
  divisions: [
    {
      divisionId: "d-int",
      name: "Intermediate",
      rows: [
        {
          rank: 1,
          isTied: false,
          participantId: "u-priya",
          displayName: "Priya Anand",
          score: 640,
          penaltyMinutes: 10,
          delta: 2,
        },
        {
          rank: 2,
          isTied: true,
          participantId: "u-jordan",
          displayName: "Jordan Ruiz",
          score: 520,
          penaltyMinutes: 15,
          delta: -1,
        },
        {
          rank: 2,
          isTied: true,
          participantId: "u-mika",
          displayName: "Mika Ortiz",
          score: 520,
          penaltyMinutes: 15,
          delta: 0,
        },
        {
          rank: 4,
          isTied: false,
          participantId: "u-devin",
          displayName: "Devin Shah",
          score: 300,
          penaltyMinutes: 5,
          delta: -2,
        },
      ],
    },
    {
      divisionId: "d-adv",
      name: "Advanced",
      rows: [
        {
          rank: 1,
          isTied: false,
          participantId: "u-sam",
          displayName: "Sam Okafor",
          score: 980,
          penaltyMinutes: 5,
          delta: 1,
        },
        {
          rank: 2,
          isTied: false,
          participantId: "u-avery",
          displayName: "Avery Lin",
          score: 900,
          penaltyMinutes: 20,
          delta: -1,
        },
        {
          rank: 3,
          isTied: false,
          participantId: "u-noor",
          displayName: "Noor Haddad",
          score: 620,
          penaltyMinutes: 0,
          delta: 0,
        },
      ],
    },
  ],
};
