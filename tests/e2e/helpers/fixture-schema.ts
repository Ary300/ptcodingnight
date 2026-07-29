import { z } from "zod";

/**
 * The shape of `fixtures/e2e/contest.json`.
 *
 * Parsed, never cast. A fixture file is an input like any other, and a typo in it should stop
 * the suite with a readable message rather than surface three specs later as a missing problem.
 */

export const DifficultySchema = z.enum(["E", "M", "H"]);
export const LanguageSchema = z.enum(["PYTHON", "JAVA"]);
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
  problems: z.array(ProblemFixtureSchema).min(1),
  rivals: z.array(RivalSchema),
});

export type ContestFixture = z.infer<typeof ContestFixtureSchema>;
export type ProblemFixture = z.infer<typeof ProblemFixtureSchema>;
