import type {
  JoinRequest,
  ProblemDetail,
  ProblemSummary,
  PublicTestResult,
  StandingsResponse,
  SubmissionView,
  SubmitRequest,
} from "@/lib/schemas/api";
import type { Verdict } from "@/lib/schemas/judge";

import { ContestApiError, type ContestApi } from "./contest-api";
import type { HintBalance, JoinResponse, RunSamplesResponse } from "./contract";

/**
 * ============================ STUB BACKEND — NOT REAL ============================
 *
 * In-memory fake so the competitor UI can be built and looked at before `app/api/**`
 * exists. It is deliberately the only file in this scope that invents data, it is named so
 * nobody mistakes it for the real thing, and `contestApi.label` is rendered in the UI so a
 * stub session is visibly a stub session.
 *
 * Judging here is a lookup table, not a judge. Nothing in this file proves any end-to-end
 * flow works.
 *
 * The statements below are original text written for this stub. Per CLAUDE.md, no
 * HackerRank statement, editorial, or test data is copied anywhere in this repo.
 * ===============================================================================
 */

const STUB_LATENCY_MS = 180;
/** How long the fake judge "takes" per test case, so the polling fallback has something to
 *  poll for and the verdict panel can be seen filling in. */
const STUB_MS_PER_TEST = 420;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------

interface StubProblem extends ProblemDetail {
  /** How many hidden cases the fake judge runs. */
  hiddenCaseCount: number;
}

const PROBLEMS: readonly StubProblem[] = [
  {
    contestProblemId: "cp-a",
    slug: "locker-parity",
    title: "Locker Parity",
    slotLabel: "A",
    difficulty: "E",
    basePoints: 100,
    isGroupProblem: false,
    bestScore: 100,
    solved: true,
    unlocked: true,
    statementMd: [
      "The hallway has $n$ lockers, numbered $1$ through $n$, and every one of them starts closed.",
      "",
      "A student walks the hallway $n$ times. On pass $k$ they toggle every locker whose number is a multiple of $k$ — a closed locker opens, an open locker closes.",
      "",
      "After all $n$ passes, report how many lockers are left **open**.",
      "",
      "## Worked example",
      "",
      "For $n = 5$ the lockers end as `open closed closed open closed`, so the answer is `2`.",
    ].join("\n"),
    inputSpec: "A single line containing the integer $n$.",
    outputSpec: "A single line containing the number of open lockers.",
    constraints: "$1 \\le n \\le 10^{9}$",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    allowedLanguages: ["PYTHON_312", "JAVA_21"],
    samples: [
      { ordinal: 0, input: "5", expectedOutput: "2" },
      { ordinal: 1, input: "100", expectedOutput: "10" },
    ],
    hintsTaken: 0,
    hintCost: 20,
    hiddenCaseCount: 6,
  },
  {
    contestProblemId: "cp-b",
    slug: "cafeteria-trays",
    title: "Cafeteria Trays",
    slotLabel: "B",
    difficulty: "M",
    basePoints: 200,
    isGroupProblem: false,
    bestScore: 120,
    solved: false,
    unlocked: true,
    statementMd: [
      "Trays come off the dishwasher in a single stack. Tray $i$ has thickness $t_i$.",
      "",
      "You may repeatedly take the top tray and move it to one of two shelves. A shelf can",
      "hold any number of trays, but the *total* thickness on a shelf may never exceed $H$.",
      "",
      "Decide whether every tray can be shelved.",
      "",
      "> Trays must be taken from the top of the stack, in order. You cannot reach into the",
      "> middle of the stack.",
      "",
      "Print `YES` if all trays fit, `NO` otherwise.",
    ].join("\n"),
    inputSpec:
      "The first line contains $n$ and $H$. The second line contains $t_1 \\ldots t_n$.",
    outputSpec: "`YES` or `NO` on a line of its own.",
    constraints: "$1 \\le n \\le 2 \\times 10^{5}$, $1 \\le t_i \\le 10^{4}$, $1 \\le H \\le 10^{9}$",
    timeLimitMs: 3000,
    memoryLimitMb: 256,
    allowedLanguages: ["PYTHON_312", "JAVA_21"],
    samples: [
      { ordinal: 0, input: "4 10\n3 3 4 6", expectedOutput: "YES" },
      { ordinal: 1, input: "3 5\n4 4 4", expectedOutput: "NO" },
    ],
    hintsTaken: 1,
    hintCost: 40,
    hiddenCaseCount: 10,
  },
  {
    contestProblemId: "cp-c",
    slug: "bell-schedule",
    title: "Bell Schedule",
    slotLabel: "C",
    difficulty: "M",
    basePoints: 200,
    isGroupProblem: true,
    bestScore: null,
    solved: false,
    unlocked: true,
    statementMd: [
      "A school day is a sequence of periods. Period $i$ runs from minute $s_i$ to minute",
      "$e_i$, and two periods may overlap because of split lunches.",
      "",
      "Find the largest number of periods running at the same instant.",
      "",
      "## Notes",
      "",
      "- A period that ends at minute $x$ and one that starts at minute $x$ do **not** overlap.",
      "- Periods are given in no particular order.",
      "",
      "```",
      "periods: [0, 50) [45, 90) [60, 120)",
      "answer:  2",
      "```",
    ].join("\n"),
    inputSpec: "The first line contains $n$. Each of the next $n$ lines contains $s_i$ and $e_i$.",
    outputSpec: "The maximum number of simultaneous periods.",
    constraints: "$1 \\le n \\le 10^{5}$, $0 \\le s_i < e_i \\le 10^{9}$",
    timeLimitMs: 3000,
    memoryLimitMb: 256,
    allowedLanguages: ["PYTHON_312", "JAVA_21"],
    samples: [{ ordinal: 0, input: "3\n0 50\n45 90\n60 120", expectedOutput: "2" }],
    hintsTaken: 0,
    hintCost: 40,
    hiddenCaseCount: 8,
  },
  {
    contestProblemId: "cp-d",
    slug: "crest-tiling",
    title: "Crest Tiling",
    slotLabel: "D",
    difficulty: "H",
    basePoints: 350,
    isGroupProblem: false,
    bestScore: null,
    solved: false,
    unlocked: false,
    statementMd: [
      "A banner is a $2 \\times m$ grid. You tile it completely with $1 \\times 2$ pieces,",
      "placed either horizontally or vertically, with no overlaps and no overhang.",
      "",
      "Count the distinct tilings, modulo $10^{9} + 7$.",
      "",
      "Two tilings are distinct if some cell pair is covered by the same piece in one and not",
      "in the other.",
    ].join("\n"),
    inputSpec: "A single line containing $m$.",
    outputSpec: "The number of tilings modulo $10^{9}+7$.",
    constraints: "$1 \\le m \\le 10^{18}$",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    allowedLanguages: ["PYTHON_312", "JAVA_21"],
    samples: [
      { ordinal: 0, input: "3", expectedOutput: "3" },
      { ordinal: 1, input: "6", expectedOutput: "13" },
    ],
    hintsTaken: 0,
    hintCost: 70,
    hiddenCaseCount: 12,
  },
];

function summaryOf(problem: StubProblem): ProblemSummary {
  return {
    contestProblemId: problem.contestProblemId,
    slug: problem.slug,
    title: problem.title,
    slotLabel: problem.slotLabel,
    difficulty: problem.difficulty,
    basePoints: problem.basePoints,
    isGroupProblem: problem.isGroupProblem,
    bestScore: problem.bestScore,
    solved: problem.solved,
    unlocked: problem.unlocked,
  };
}

function findBySlug(slug: string): StubProblem {
  const problem = PROBLEMS.find((candidate) => candidate.slug === slug);
  if (problem === undefined) {
    throw new ContestApiError("NOT_FOUND", "That problem is not part of this contest.");
  }
  return problem;
}

function findById(contestProblemId: string): StubProblem {
  const problem = PROBLEMS.find((c) => c.contestProblemId === contestProblemId);
  if (problem === undefined) {
    throw new ContestApiError("NOT_FOUND", "That problem is not part of this contest.");
  }
  return problem;
}

// ---------------------------------------------------------------------------
// The fake judge
// ---------------------------------------------------------------------------

/**
 * A lookup table dressed as a judge. Deterministic on the source text so the UI behaves
 * the same way twice, which is what makes it useful for looking at states.
 */
function verdictFor(source: string): Verdict {
  const text = source.toLowerCase();
  if (text.trim().length < 8) return "CE";
  if (text.includes("//ie") || text.includes("#ie")) return "IE";
  if (text.includes("while true") || text.includes("while (true)")) return "TLE";
  if (text.includes("todo")) return "WA";
  return "AC";
}

function caseResult(
  ordinal: number,
  isSample: boolean,
  submissionVerdict: Verdict,
  failFrom: number,
): PublicTestResult {
  const passed = submissionVerdict === "AC" || ordinal < failFrom;
  return {
    ordinal,
    isSample,
    verdict: passed ? "AC" : submissionVerdict,
    runtimeMs: submissionVerdict === "CE" ? null : 40 + ordinal * 7,
    // A hidden case NEVER carries a snippet. The contract makes expected output
    // inexpressible; this keeps the one remaining channel closed too.
    diffSnippet: isSample && !passed ? "expected `2`\n     got `3`" : null,
  };
}

function allCases(problem: StubProblem, verdict: Verdict): PublicTestResult[] {
  const sampleCount = problem.samples.length;
  const total = sampleCount + problem.hiddenCaseCount;
  const failFrom = verdict === "AC" ? total : Math.max(1, Math.floor(total / 2));

  return Array.from({ length: total }, (_unused, ordinal) =>
    caseResult(ordinal, ordinal < sampleCount, verdict, failFrom),
  );
}

interface StubSubmission {
  view: SubmissionView;
  startedAt: number;
  finalVerdict: Verdict;
  finalResults: readonly PublicTestResult[];
  problem: StubProblem;
}

const submissions = new Map<string, StubSubmission>();
let submissionCounter = 0;

/** Reveal results as if the judge were working through the cases. */
function progress(record: StubSubmission): SubmissionView {
  if (record.finalVerdict === "CE") {
    return {
      ...record.view,
      verdict: "CE",
      score: 0,
      testResults: [],
      compileError:
        "  File \"solution.py\", line 1\n    <stub compiler output — not a real compiler>\nSyntaxError: unexpected EOF while parsing",
    };
  }

  const elapsed = Date.now() - record.startedAt;
  const revealed = Math.min(
    record.finalResults.length,
    Math.floor(elapsed / STUB_MS_PER_TEST),
  );
  const done = revealed >= record.finalResults.length;
  const shown = record.finalResults.slice(0, revealed);

  const perCase = Math.round(record.problem.basePoints / record.finalResults.length);
  const score = shown.filter((r) => r.verdict === "AC").length * perCase;
  const runtimes = shown.map((r) => r.runtimeMs ?? 0);

  return {
    ...record.view,
    verdict: done ? record.finalVerdict : null,
    score: done ? score : 0,
    runtimeMs: runtimes.length > 0 ? Math.max(...runtimes) : null,
    testResults: [...shown],
    compileError: null,
  };
}

// ---------------------------------------------------------------------------
// Hints and standings
// ---------------------------------------------------------------------------

const hintState = { warmupsSolved: 3, hintsEarned: 3, hintsSpent: 1 };

function balanceFor(problem: StubProblem): HintBalance {
  return {
    warmupsSolved: hintState.warmupsSolved,
    hintsEarned: hintState.hintsEarned,
    hintsSpent: hintState.hintsSpent,
    hintsAvailable: Math.max(0, hintState.hintsEarned - hintState.hintsSpent),
    nextHintCost: problem.hintCost,
  };
}

const CONTEST_MINUTES = 120;
const stubEndsAt = new Date(Date.now() + CONTEST_MINUTES * 60_000).toISOString();

const STUB_STANDINGS: StandingsResponse = {
  contestId: "stub-contest",
  frozen: false,
  asOf: new Date().toISOString(),
  endsAt: stubEndsAt,
  divisions: [
    {
      divisionId: "div-intermediate",
      name: "Intermediate",
      rows: [
        { rank: 1, isTied: false, participantId: "p-1", displayName: "Ada L.", score: 450, penaltyMinutes: 5, delta: 2 },
        { rank: 2, isTied: true, participantId: "p-2", displayName: "Grace H.", score: 300, penaltyMinutes: 0, delta: 0 },
        { rank: 2, isTied: true, participantId: "stub-participant", displayName: "You", score: 300, penaltyMinutes: 5, delta: -1 },
        { rank: 4, isTied: false, participantId: "p-4", displayName: "Alan T.", score: 220, penaltyMinutes: 15, delta: -1 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------

export const stubContestApi: ContestApi = {
  label: "stub data",

  async join(request: JoinRequest): Promise<JoinResponse> {
    await sleep(STUB_LATENCY_MS);
    if (request.joinCode.trim().toUpperCase() === "WRONG") {
      throw new ContestApiError("INVALID_JOIN_CODE", "That join code is not right. Check the board.");
    }
    return {
      participantId: "stub-participant",
      contestId: "stub-contest",
      displayName: request.displayName,
      divisionId: request.divisionId ?? "div-intermediate",
    };
  },

  async listProblems(): Promise<ProblemSummary[]> {
    await sleep(STUB_LATENCY_MS);
    return PROBLEMS.map(summaryOf);
  },

  async getProblem(slug: string): Promise<ProblemDetail> {
    await sleep(STUB_LATENCY_MS);
    // `hiddenCaseCount` is the fake judge's business and is not part of `ProblemDetail`, so
    // it is dropped rather than shipped to the client.
    const { hiddenCaseCount, ...detail } = findBySlug(slug);
    void hiddenCaseCount;
    return detail;
  },

  async runSamples(request: SubmitRequest): Promise<RunSamplesResponse> {
    await sleep(STUB_LATENCY_MS * 3);
    const problem = findById(request.contestProblemId);
    const verdict = verdictFor(request.sourceCode);
    const sampleCount = problem.samples.length;
    const failFrom = verdict === "AC" ? sampleCount : 1;
    return {
      results: Array.from({ length: sampleCount }, (_unused, ordinal) =>
        caseResult(ordinal, true, verdict, failFrom),
      ),
    };
  },

  async submit(request: SubmitRequest): Promise<SubmissionView> {
    await sleep(STUB_LATENCY_MS);
    const problem = findById(request.contestProblemId);
    const verdict = verdictFor(request.sourceCode);

    submissionCounter += 1;
    const submissionId = `stub-sub-${submissionCounter}`;

    const view: SubmissionView = {
      submissionId,
      contestProblemId: problem.contestProblemId,
      language: request.language,
      submittedAt: new Date().toISOString(),
      verdict: null,
      score: 0,
      runtimeMs: null,
      testResults: [],
      compileError: null,
    };

    submissions.set(submissionId, {
      view,
      startedAt: Date.now(),
      finalVerdict: verdict,
      finalResults: allCases(problem, verdict),
      problem,
    });

    return view;
  },

  async getSubmission(submissionId: string): Promise<SubmissionView> {
    await sleep(60);
    const record = submissions.get(submissionId);
    if (record === undefined) {
      throw new ContestApiError("NOT_FOUND", "That submission could not be found.");
    }
    return progress(record);
  },

  async listSubmissions(): Promise<SubmissionView[]> {
    await sleep(STUB_LATENCY_MS);
    return [...submissions.values()]
      .map(progress)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },

  async getStandings(): Promise<StandingsResponse> {
    await sleep(STUB_LATENCY_MS);
    return { ...STUB_STANDINGS, asOf: new Date().toISOString() };
  },

  async getHintBalance(contestProblemId: string): Promise<HintBalance> {
    await sleep(60);
    return balanceFor(findById(contestProblemId));
  },

  async takeHint(contestProblemId: string): Promise<HintBalance> {
    await sleep(STUB_LATENCY_MS);
    const problem = findById(contestProblemId);
    if (hintState.hintsEarned - hintState.hintsSpent <= 0) {
      throw new ContestApiError("NO_HINTS", "You have no hints left. Solve another warmup to earn one.");
    }
    hintState.hintsSpent += 1;
    return balanceFor(problem);
  },

  /** The stub cannot stream, which is exactly why the polling fallback gets exercised. */
  verdictStreamUrl(): null {
    return null;
  },
};
