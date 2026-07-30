import { z } from "zod";

/**
 * The shape of `fixtures/e2e/contest.json`.
 *
 * Parsed, never cast. A fixture file is an input like any other, and a typo in it should stop
 * the suite with a readable message rather than surface three specs later as a missing problem.
 */

export const DifficultySchema = z.enum(["E", "M", "H"]);
export const LanguageSchema = z.enum(["PYTHON_312", "JAVA_21"]);
export const ProblemRoundSchema = z.enum(["INDIVIDUAL", "GROUP"]);
export const ProblemStateSchema = z.enum(["DRAFT", "PUBLISHED", "RETIRED"]);
export const ProblemTypeSchema = z.enum(["ALGORITHM", "CODINGBAT", "GROUP"]);
export const VerdictSchema = z.enum(["AC", "WA", "TLE", "MLE", "RE", "CE", "IE"]);

const TestCaseFixtureSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  /** Directory under `fixtures/e2e/testcases/`. */
  dir: z.string().min(1),
  /** File stem: `<stem>.in` and `<stem>.out`. */
  stem: z.string().min(1),
  isSample: z.boolean(),
  points: z.number().int().nonnegative(),
});

const ProblemFixtureSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  divisionKey: z.string().min(1),
  /** Which Round 1 set. Null (or absent) for a GROUP problem, which belongs to no set. */
  setKey: z.string().min(1).nullable().default(null),
  round: ProblemRoundSchema.default("INDIVIDUAL"),
  slotLabel: z.string().min(1),
  difficulty: DifficultySchema,
  basePoints: z.number().int().positive(),
  state: ProblemStateSchema,
  type: ProblemTypeSchema,
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  allowedLanguages: z.array(LanguageSchema).min(1),
  statementMd: z.string(),
  inputSpec: z.string(),
  outputSpec: z.string(),
  constraints: z.string(),
  testCases: z.array(TestCaseFixtureSchema),
});

const RivalSubmissionSchema = z.object({
  problemSlug: z.string().min(1),
  /** Minutes after `startsAt` the submission was made. Keeps penalty deterministic. */
  minutesIn: z.number().int().nonnegative(),
  verdict: VerdictSchema,
  score: z.number().int().nonnegative(),
});

const RivalSchema = z.object({
  displayName: z.string().min(1),
  divisionKey: z.string().min(1),
  /** Which team this player competes for. Null exercises the no-team path deliberately. */
  teamKey: z.string().min(1).nullable().default(null),
  /** Which set they were assigned. Null means "not assigned yet". */
  setKey: z.string().min(1).nullable().default(null),
  submissions: z.array(RivalSubmissionSchema),
});

export const ContestFixtureSchema = z.object({
  contest: z.object({
    name: z.string().min(1),
    joinCode: z.string().min(1),
    scoringPresetId: z.string().min(1),
    startsAtOffsetMinutes: z.number().int(),
    endsAtOffsetMinutes: z.number().int(),
  }),
  divisions: z
    .array(z.object({ key: z.string().min(1), name: z.string().min(1), sortOrder: z.number().int() }))
    .min(1),
  /**
   * Teams. **The unit that gets ranked**, and the divisor in every team score, so a fixture with
   * the wrong roster produces the wrong expected numbers rather than a cosmetic difference.
   */
  teams: z
    .array(z.object({ key: z.string().min(1), name: z.string().min(1) }))
    .default([]),
  /** Round 1 parallel sets, labelled "A".."D". */
  problemSets: z
    .array(z.object({ key: z.string().min(1), label: z.string().min(1) }))
    .default([]),
  problems: z.array(ProblemFixtureSchema).min(1),
  rivals: z.array(RivalSchema),
  /** Admin-entered non-coding points. Added flat to the team total (docs/SCORING.md §1). */
  sideActivities: z
    .array(
      z.object({
        teamKey: z.string().min(1),
        label: z.string().min(1),
        points: z.number().int(),
      }),
    )
    .default([]),
});

export type ContestFixture = z.infer<typeof ContestFixtureSchema>;
export type ProblemFixture = z.infer<typeof ProblemFixtureSchema>;
