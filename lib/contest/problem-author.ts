import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hostLimits } from "@/lib/contest/host";
import { resolveTestDataPath } from "@/lib/contest/judge-job";
import { lockContestMutations, lockProblemMutations } from "@/lib/contest/locks";
import { DomainError, NotFoundError, ValidationError } from "@/lib/errors";
import { startersFor } from "@/lib/judge/starters";
import { LANGUAGE_IDS } from "@/lib/judge/runtimes";
import { SignatureSchema, type Signature, type SignatureType } from "@/lib/schemas/seed";

/**
 * Creating, editing and deleting a coding question from the organizer console, the simple way.
 *
 * This is the Park Tudor version of HackerRank's "Create Coding Question" wizard, with the two
 * steps we do not need removed: there is no question TYPE (every question here is a coding
 * question) and no LANGUAGE selection (every question runs in all six, always). What is left is
 * the part that matters: a statement, and test cases that are stdin fed in and stdout expected
 * out.
 *
 * ## Where the test data goes, and why it matches the seed exactly
 *
 * A `TestCase` row stores a path, not a blob (PRD §5), resolved relative to `TEST_DATA_ROOT`.
 * The seeded problems write `content/problems/<slug>/tests/NN.in` and `.out`; an authored problem
 * writes to the identical layout under the same root, so a question an organizer types in is
 * indistinguishable from one that shipped with the app, and the same judge path runs both.
 *
 * ## Why a created question is PUBLISHED, not DRAFT
 *
 * A problem stays DRAFT until it has an original statement AND its own test data (PRD §8), because
 * a DRAFT is refused in a live contest. This flow REQUIRES both before it will save, so the moment
 * it saves the DRAFT gate has nothing left to hold: the question is usable, and making the
 * organizer flip a second switch to say so would be the kind of dead end this project keeps
 * finding. The expected outputs are the organizer's, entered by hand exactly as HackerRank's
 * manual test-case entry works; there is no reference solution to run, and none is claimed.
 *
 * ## Create and edit share one set of rules, deliberately
 *
 * Every check lives in `validateAuthoredCore` and every write goes through `stageTestFiles`, so
 * the edit path cannot accept a question the create path would refuse. Two copies of "at least one
 * sample" is two answers to the same question, and the one that drifts is always the one nobody
 * looks at.
 *
 * ## Why editing is REFUSED after the first submission
 *
 * A verdict is a claim about a specific program against specific test data. Change the test data
 * underneath a submission and its verdict or pending job no longer describes the question the
 * student opened. An ended contest is still history somebody may review or appeal. So the first
 * submission makes the question immutable; corrections become a new question/version. A live
 * contest locks it even before the first submission, because changing the prompt mid-round is
 * equally dishonest.
 *
 * ## Why deletion also removes the files
 *
 * `Problem.slug` is derived from the title, and `uniqueSlug` only avoids slugs that are TAKEN. So
 * deleting "Bill Division" and creating it again reuses `bill-division`, and a leftover
 * `bill-division/tests/07.in` from the old question would be sitting in the directory the new one
 * writes into. The new question would not reference it, but the next organizer to look would find
 * test data that belongs to nothing. Deletion unlinks exactly the files the rows pointed at.
 */

/** HackerRank recommends 3 to 15; we require at least one, and at least one visible to students. */
const MIN_TEST_CASES = 1;
/** Each case scores the same, matching the seed's flat 10 points per case. */
const POINTS_PER_CASE = 10;

export interface AuthoredTestCase {
  readonly input: string;
  readonly expectedOutput: string;
  /** A sample is shown to the student in full; a hidden case reveals only pass/fail and timing. */
  readonly isSample: boolean;
}

export interface AuthoredSignatureParam {
  readonly name: string;
  readonly type: SignatureType;
}

/**
 * The simple signature an organizer fills in for starter code: a function name, a return type, and
 * a flat list of parameters. Array counts are wired automatically (see `buildSignature`), so the
 * organizer never has to describe how the harness reads a length.
 */
export interface AuthoredSignature {
  readonly name: string;
  readonly returns: SignatureType;
  readonly params: readonly AuthoredSignatureParam[];
}

export interface CreateProblemInput {
  readonly title: string;
  readonly statementMd: string;
  readonly inputSpec?: string;
  readonly outputSpec?: string;
  readonly constraints?: string;
  readonly difficulty: "E" | "M" | "H";
  readonly timeLimitMs?: number;
  readonly memoryLimitMb?: number;
  /** Optional. Omit for a blank editor; provide it for HackerRank-style function stubs. */
  readonly signature?: AuthoredSignature | null;
  readonly testCases: readonly AuthoredTestCase[];
}

/**
 * The same fields on the way back out, for an EDIT.
 *
 * `signature` is absent rather than `null` when the caller is not touching it: `null` means "this
 * question no longer has starter code", which is a change, and a form that could not express the
 * difference would silently delete a signature every time it saved.
 */
export interface UpdateProblemInput {
  readonly title: string;
  readonly statementMd: string;
  readonly inputSpec?: string;
  readonly outputSpec?: string;
  readonly constraints?: string;
  readonly difficulty: "E" | "M" | "H";
  readonly timeLimitMs?: number;
  readonly memoryLimitMb?: number;
  /** Absent leaves the stored signature untouched. `null` removes it. */
  readonly signature?: AuthoredSignature | null;
  readonly testCases: readonly AuthoredTestCase[];
}

export interface CreatedProblem {
  readonly problemId: string;
  readonly slug: string;
  readonly title: string;
}

/** Turn a title into a URL-safe slug, the same transform the seed's `slugFor` uses. */
function slugify(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A slug not already taken, suffixing `-2`, `-3`, … until it is free. */
async function uniqueSlug(base: string): Promise<string> {
  const root = base === "" ? "problem" : base;
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? root : `${root}-${String(n)}`;
    const existing = await prisma.problem.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (existing === null) return candidate;
  }
  throw new ValidationError("Could not find a free slug for that title. Try a different name.");
}

/**
 * Build a validated `Signature` from the organizer's flat parameter list, wiring array counts.
 *
 * An array parameter needs a length the harness can read; HackerRank's own template reads a count
 * line and then the array. So for each array param we inject a hidden `int` count field
 * (`passed: false`, never shown to the student) immediately before it and point the array's
 * `length` at that field. A scalar param is passed straight through. The result is validated by
 * `SignatureSchema` and then run through the real generator for all six languages, so a signature
 * that cannot produce a compiling stub is rejected here rather than shipped as CE on a student's
 * untouched file.
 */
export function buildSignature(authored: AuthoredSignature): Signature {
  const fields: {
    name: string;
    type: SignatureType;
    length?: string;
    passed?: boolean;
  }[] = [];

  for (const param of authored.params) {
    if (param.type.endsWith("[]")) {
      const countName = `${param.name}Count`;
      fields.push({ name: countName, type: "int", passed: false });
      fields.push({ name: param.name, type: param.type, length: countName });
    } else {
      fields.push({ name: param.name, type: param.type });
    }
  }

  // The return is an object { type, join? }. An array return needs a join separator; a single
  // space is the near-universal convention for a line of numbers, and matches the seeded problems.
  const returns = authored.returns.endsWith("[]")
    ? { type: authored.returns, join: " " }
    : { type: authored.returns };
  const candidate = { name: authored.name, returns, params: fields };
  const parsed = SignatureSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ValidationError(
      `The starter-code signature is not valid: ${parsed.error.issues[0]?.message ?? "check the names and types"}`,
    );
  }

  // Prove it GENERATES for all six before we agree to store it. A signature that parses can still
  // be one the emitter cannot handle; the only honest check is to run the emitter.
  try {
    startersFor(parsed.data, LANGUAGE_IDS);
  } catch (error) {
    throw new ValidationError(
      `The starter code could not be generated: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  return parsed.data;
}

/** Everything the domain rules have agreed to, ready to write. Never partially applied. */
interface ValidatedCore {
  readonly title: string;
  readonly statementMd: string;
  readonly inputSpec: string;
  readonly outputSpec: string;
  readonly constraints: string;
  readonly difficulty: "E" | "M" | "H";
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  /** Samples first, so ordinal order matches the seed convention and sample 1 is case 1. */
  readonly orderedCases: readonly AuthoredTestCase[];
}

/**
 * The rules a question must satisfy to exist at all, applied identically by create and by edit.
 *
 * Strict and FIRST, because a half-written problem is worse than none: it appears in the bank, an
 * organizer slots it, and it reaches a student as `IE` mid-contest. Nothing is written until this
 * has returned.
 */
function validateAuthoredCore(input: CreateProblemInput | UpdateProblemInput): ValidatedCore {
  const title = input.title.trim();
  if (title === "") throw new ValidationError("Give the question a title.");

  const statement = input.statementMd.trim();
  if (statement === "") {
    throw new ValidationError("Write the problem statement. A question with no statement cannot be published.");
  }

  if (input.testCases.length < MIN_TEST_CASES) {
    throw new ValidationError("Add at least one test case.");
  }
  if (!input.testCases.some((testCase) => testCase.isSample)) {
    throw new ValidationError(
      "Mark at least one test case as a sample, so a student can see an example and self-check.",
    );
  }
  for (const [index, testCase] of input.testCases.entries()) {
    if (testCase.expectedOutput.trim() === "") {
      throw new ValidationError(
        `Test case ${String(index + 1)} has no expected output. Every case needs the output the program must print.`,
      );
    }
  }

  return {
    title,
    statementMd: statement,
    inputSpec: input.inputSpec?.trim() ?? "",
    outputSpec: input.outputSpec?.trim() ?? "",
    constraints: input.constraints?.trim() ?? "",
    difficulty: input.difficulty,
    timeLimitMs: input.timeLimitMs ?? 2000,
    memoryLimitMb: input.memoryLimitMb ?? 256,
    // `Array.prototype.sort` is stable, so cases keep the order the organizer typed them in
    // within each group. Ordinals must be reproducible: they are the file names.
    orderedCases: [...input.testCases].sort((a, b) => Number(b.isSample) - Number(a.isSample)),
  };
}

/** The shape `TestCase.create` wants, computed before anything is written. */
interface PreparedCaseRow {
  readonly ordinal: number;
  readonly inputPath: string;
  readonly expectedOutputPath: string;
  readonly isSample: boolean;
  readonly points: number;
  readonly group: null;
}

interface StagedTestFiles {
  readonly rows: readonly PreparedCaseRow[];
  /** Publish the complete version directory with one atomic rename. */
  readonly commit: () => Promise<void>;
  /** Remove this new version, whether it is still staged or was committed before a DB refusal. */
  readonly discard: () => Promise<void>;
}

/**
 * Write a question's test data under `TEST_DATA_ROOT`, mirroring the seeded layout exactly, and
 * hand back the rows that point at it.
 *
 * ## Why every save gets a version directory
 *
 * An EDIT overwrites files that judged submissions may already have been scored against, and the
 * database write that makes those files correct can still fail: a unique-constraint violation, a
 * dropped connection, a validation error thrown by Prisma. Writing in place and then failing
 * leaves rows describing one set of cases and files containing another, and nothing reports it.
 *
 * The complete case set is written under a private staging directory and published with ONE
 * directory rename. The database then switches all TestCase rows to that immutable version in a
 * transaction. A failed database write removes the new version; a crash can leave an unreferenced
 * directory, but can never leave committed rows pointing at half-renamed files.
 */
async function stageTestFiles(
  slug: string,
  orderedCases: readonly AuthoredTestCase[],
): Promise<StagedTestFiles> {
  const root = hostLimits().testDataRoot;
  const version = randomUUID();
  const testDirRelative = path.posix.join(slug, "tests");
  const stagingDirRelative = path.posix.join(testDirRelative, `.staging-${version}`);
  const versionDirRelative = path.posix.join(testDirRelative, `v-${version}`);
  const stagingDir = resolveTestDataPath(root, stagingDirRelative);
  const versionDir = resolveTestDataPath(root, versionDirRelative);
  await mkdir(stagingDir, { recursive: true });

  const rows: PreparedCaseRow[] = [];

  for (const [index, testCase] of orderedCases.entries()) {
    const stem = String(index + 1).padStart(2, "0");
    const inputRelative = path.posix.join(versionDirRelative, `${stem}.in`);
    const outputRelative = path.posix.join(versionDirRelative, `${stem}.out`);
    const inputAbsolute = path.join(stagingDir, `${stem}.in`);
    const outputAbsolute = path.join(stagingDir, `${stem}.out`);

    // A trailing newline, because a program's stdout ends in one and a comparator that trims is
    // not something to rely on for a file the organizer typed without thinking about it.
    await writeFile(inputAbsolute, ensureTrailingNewline(testCase.input), "utf8");
    await writeFile(
      outputAbsolute,
      ensureTrailingNewline(testCase.expectedOutput),
      "utf8",
    );

    rows.push({
      ordinal: index + 1,
      inputPath: inputRelative,
      expectedOutputPath: outputRelative,
      isSample: testCase.isSample,
      points: POINTS_PER_CASE,
      group: null,
    });
  }

  return {
    rows,
    commit: async () => {
      await rename(stagingDir, versionDir);
    },
    discard: async () => {
      await rm(stagingDir, { force: true, recursive: true });
      await rm(versionDir, { force: true, recursive: true });
    },
  };
}

/**
 * Create a coding question: write its test files and its rows, and return it.
 */
export async function createAuthoredProblem(input: CreateProblemInput): Promise<CreatedProblem> {
  const core = validateAuthoredCore(input);
  const signature = input.signature != null ? buildSignature(input.signature) : null;

  const slug = await uniqueSlug(slugify(core.title));
  const staged = await stageTestFiles(slug, core.orderedCases);

  let created: { id: string; slug: string; title: string };
  try {
    await staged.commit();
    created = await prisma.problem.create({
      data: {
        slug,
        title: core.title,
        statementMd: core.statementMd,
        inputSpec: core.inputSpec,
        outputSpec: core.outputSpec,
        constraints: core.constraints,
        difficulty: core.difficulty,
        state: "PUBLISHED",
        type: "ALGORITHM",
        round: "INDIVIDUAL",
        timeLimitMs: core.timeLimitMs,
        memoryLimitMb: core.memoryLimitMb,
        // allowedLanguages is omitted so the schema default applies: all ten variants. That
        // default is the whole point of not asking which languages. createdAt and updatedAt are
        // the database's to set (@default(now()) and @updatedAt), so they are not passed here.
        signature: signature ?? undefined,
        testCases: { create: [...staged.rows] },
      },
      select: { id: true, slug: true, title: true },
    });
  } catch (error) {
    await staged.discard();
    throw error;
  }

  return { problemId: created.id, slug: created.slug, title: created.title };
}

// ---------------------------------------------------------------------------
// Where a question is used, and what that forbids
// ---------------------------------------------------------------------------

/** Contest states in which a problem's test data is load bearing RIGHT NOW. */
const LOCKED_CONTEST_STATES: ReadonlySet<string> = new Set(["RUNNING", "FROZEN"]);

export interface ProblemContestUse {
  readonly contestId: string;
  readonly contestName: string;
  readonly contestState: string;
  readonly slotLabel: string;
}

export interface ProblemUsage {
  /** Every contest line-up this problem sits in, ordered stably. */
  readonly contests: readonly ProblemContestUse[];
  /** The subset that is RUNNING or FROZEN, which is what locks the question. */
  readonly lockedBy: readonly ProblemContestUse[];
  readonly submissionCount: number;
}

/**
 * Read what depends on this problem before offering to change or remove it.
 *
 * The ordering is explicit rather than left to Postgres. Anything the UI renders as a list has to
 * come out the same way twice, for the same reason the team standings breakdown does.
 */
export async function problemUsage(problemId: string): Promise<ProblemUsage> {
  const [links, submissionCount] = await Promise.all([
    prisma.contestProblem.findMany({
      where: { problemId },
      select: {
        slotLabel: true,
        contest: { select: { id: true, name: true, state: true } },
      },
      orderBy: [{ contest: { name: "asc" } }, { slotLabel: "asc" }, { id: "asc" }],
    }),
    prisma.submission.count({ where: { contestProblem: { problemId } } }),
  ]);

  const contests: ProblemContestUse[] = links.map((link) => ({
    contestId: link.contest.id,
    contestName: link.contest.name,
    contestState: link.contest.state,
    slotLabel: link.slotLabel,
  }));

  return {
    contests,
    lockedBy: contests.filter((use) => LOCKED_CONTEST_STATES.has(use.contestState)),
    submissionCount,
  };
}

/**
 * Re-read usage while holding this problem's advisory lock, and lock every linked contest before
 * trusting its state. `setContestProblems` takes the same problem lock, while lifecycle changes
 * take the contest lock. That closes both sides of the edit/start and edit/line-up races.
 */
async function lockedProblemUsage(
  tx: Prisma.TransactionClient,
  problemId: string,
): Promise<ProblemUsage> {
  const linkedContestIds = await tx.contestProblem.findMany({
    where: { problemId },
    select: { contestId: true },
  });
  const contestIds = [...new Set(linkedContestIds.map((link) => link.contestId))].sort();
  for (const contestId of contestIds) await lockContestMutations(tx, contestId);

  const [links, submissionCount] = await Promise.all([
    tx.contestProblem.findMany({
      where: { problemId },
      select: {
        slotLabel: true,
        contest: { select: { id: true, name: true, state: true } },
      },
      orderBy: [{ contest: { name: "asc" } }, { slotLabel: "asc" }, { id: "asc" }],
    }),
    tx.submission.count({ where: { contestProblem: { problemId } } }),
  ]);
  const contests: ProblemContestUse[] = links.map((link) => ({
    contestId: link.contest.id,
    contestName: link.contest.name,
    contestState: link.contest.state,
    slotLabel: link.slotLabel,
  }));
  return {
    contests,
    lockedBy: contests.filter((use) => LOCKED_CONTEST_STATES.has(use.contestState)),
    submissionCount,
  };
}

/** The sentence naming the contests that hold a question, without a list that runs off the page. */
function namedContests(uses: readonly ProblemContestUse[]): string {
  const names = [...new Set(uses.map((use) => use.contestName))];
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${String(names.length - 2)} more`;
}

/**
 * Refuse to edit a question a live contest or any submission depends on.
 *
 * Thrown as CONFLICT rather than FORBIDDEN: the organizer has every right to this question, and
 * FORBIDDEN would read as "your account cannot do this", which is a different problem with a
 * different fix. A historical question stays locked; the organizer can create a corrected copy.
 */
export function assertEditable(title: string, usage: ProblemUsage): void {
  if (usage.lockedBy.length > 0) {
    throw new DomainError(
      "CONFLICT",
      `"${title}" is in a contest that is live right now (${namedContests(usage.lockedBy)}). ` +
        "Changing it would move the question underneath students, so it is locked.",
    );
  }
  if (usage.submissionCount > 0) {
    throw new DomainError(
      "CONFLICT",
      `"${title}" has ${String(usage.submissionCount)} submission` +
        `${usage.submissionCount === 1 ? "" : "s"} against it. Editing it would rewrite the ` +
        "question those records refer to. Create a new question for the corrected version.",
    );
  }
}

/** The same refusal for deletion, plus the one that only applies to deletion. */
export function assertDeletable(title: string, usage: ProblemUsage): void {
  if (usage.lockedBy.length > 0) {
    throw new DomainError(
      "CONFLICT",
      `"${title}" is in a contest that is live right now (${namedContests(usage.lockedBy)}). ` +
        "It cannot be deleted while a contest is using it.",
    );
  }
  if (usage.submissionCount > 0) {
    throw new DomainError(
      "CONFLICT",
      `"${title}" has ${String(usage.submissionCount)} submission` +
        `${usage.submissionCount === 1 ? "" : "s"} against it. Deleting it would take the record ` +
        "of what those students ran and what the judge said with it, so it cannot be deleted.",
    );
  }
}

// ---------------------------------------------------------------------------
// Reading a question back into the editor
// ---------------------------------------------------------------------------

/**
 * A stored question as the builder needs it, with the test data read back off DISK.
 *
 * The files are the truth. `TestCase` stores a path, not a blob, so an editor populated from the
 * rows alone would show the organizer empty boxes next to a case that has real content, and saving
 * would replace that content with the emptiness on screen. That is the failure this project keeps
 * naming: a screen that responds to every action and describes none of the state.
 */
export interface AuthoredProblemDraft {
  readonly problemId: string;
  readonly slug: string;
  readonly title: string;
  readonly statementMd: string;
  readonly inputSpec: string;
  readonly outputSpec: string;
  readonly constraints: string;
  readonly difficulty: "E" | "M" | "H";
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  /** Null when the question has no starter code, which is the normal case. */
  readonly signature: AuthoredSignature | null;
  /**
   * False when a signature IS stored but this simple form cannot express it exactly. The builder
   * then leaves it alone rather than offering an editor that would silently flatten it.
   */
  readonly signatureEditable: boolean;
  readonly testCases: readonly AuthoredTestCase[];
}

/**
 * Turn a stored `Signature` back into the flat form the organizer filled in, if it round-trips.
 *
 * `buildSignature` injects a hidden `<name>Count` field before every array parameter and wires the
 * array's `length` at it, so undoing that is just dropping the fields marked `passed: false`. But
 * a signature can also arrive from `content/problems/*\/problem.json`, where `shared` and `repeat`
 * are available and the count field may be named anything at all.
 *
 * Rather than guess which of those the stored value is, this rebuilds from the flattened form and
 * compares. Equal means the form can express it and an edit is lossless. Not equal means it
 * cannot, and saying so is the only honest answer: an editor that showed two parameters for a
 * six-field harness would destroy the harness the moment the organizer pressed Save.
 */
function toAuthoredSignature(stored: unknown): {
  signature: AuthoredSignature | null;
  editable: boolean;
} {
  if (stored === null || stored === undefined) return { signature: null, editable: true };

  const parsed = SignatureSchema.safeParse(stored);
  // A signature we cannot even parse is not one to offer an editor for. It is also not a reason to
  // refuse to open the page: everything else about the question is still editable.
  if (!parsed.success) return { signature: null, editable: false };

  const flattened: AuthoredSignature = {
    name: parsed.data.name,
    returns: parsed.data.returns.type,
    params: parsed.data.params
      .filter((field) => field.passed !== false)
      .map((field) => ({ name: field.name, type: field.type })),
  };

  let rebuilt: Signature;
  try {
    rebuilt = buildSignature(flattened);
  } catch {
    return { signature: null, editable: false };
  }

  return sameSignature(rebuilt, parsed.data)
    ? { signature: flattened, editable: true }
    : { signature: null, editable: false };
}

/** Structural equality, field by field. Key order out of a JSON column is not something to trust. */
function sameSignature(a: Signature, b: Signature): boolean {
  if (a.name !== b.name) return false;
  if (a.returns.type !== b.returns.type || a.returns.join !== b.returns.join) return false;
  if ((a.shared ?? []).length !== (b.shared ?? []).length) return false;
  if (a.repeat !== b.repeat) return false;
  if (a.params.length !== b.params.length) return false;
  return a.params.every((field, index) => {
    const other = b.params[index];
    return (
      other !== undefined &&
      field.name === other.name &&
      field.type === other.type &&
      field.length === other.length &&
      field.passed === other.passed
    );
  });
}

/**
 * Load a question for editing, test data included.
 *
 * A missing test file is a hard refusal rather than an empty box. `TEST_DATA_ROOT` pointing
 * somewhere other than where the data lives is a real and previously-shipped failure in this
 * codebase, and its symptom is verdict `IE` on a student's submission. Opening the editor anyway
 * would turn that into permanent data loss on the first Save.
 */
export async function loadAuthoredProblem(slug: string): Promise<AuthoredProblemDraft> {
  const problem = await prisma.problem.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      statementMd: true,
      inputSpec: true,
      outputSpec: true,
      constraints: true,
      difficulty: true,
      timeLimitMs: true,
      memoryLimitMb: true,
      signature: true,
      testCases: {
        select: { ordinal: true, inputPath: true, expectedOutputPath: true, isSample: true },
        orderBy: { ordinal: "asc" },
      },
    },
  });
  if (problem === null) throw new NotFoundError("Problem");

  const root = hostLimits().testDataRoot;
  const testCases = await Promise.all(
    problem.testCases.map(async (testCase) => ({
      input: await readAuthoredFile(root, testCase.inputPath, testCase.ordinal),
      expectedOutput: await readAuthoredFile(root, testCase.expectedOutputPath, testCase.ordinal),
      isSample: testCase.isSample,
    })),
  );

  const { signature, editable } = toAuthoredSignature(problem.signature);

  return {
    problemId: problem.id,
    slug: problem.slug,
    title: problem.title,
    statementMd: problem.statementMd,
    inputSpec: problem.inputSpec,
    outputSpec: problem.outputSpec,
    constraints: problem.constraints,
    // A seeded problem may carry no difficulty at all; the form has to start somewhere, and
    // Easy is the value an organizer is most likely to correct rather than accept by accident.
    difficulty: problem.difficulty ?? "E",
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    signature,
    signatureEditable: editable,
    testCases,
  };
}

/**
 * Read one stored test file, stripping the single trailing newline `ensureTrailingNewline` added.
 *
 * Stripping it makes the round trip byte identical: what comes out of the textarea goes back
 * through `ensureTrailingNewline` and lands as the same file. Leaving it on would grow a blank
 * line onto the end of every case on every save.
 */
async function readAuthoredFile(root: string, storedPath: string, ordinal: number): Promise<string> {
  const absolute = resolveTestDataPath(root, storedPath);
  let contents: string;
  try {
    contents = await readFile(absolute, "utf8");
  } catch (error) {
    throw new ValidationError(
      `Test case ${String(ordinal)} points at "${storedPath}", which could not be read from the ` +
        "test-data root. Fix TEST_DATA_ROOT or restore the file before editing this question, " +
        `because saving now would replace it with an empty case. (${
          error instanceof Error ? error.message : "unknown error"
        })`,
    );
  }
  return contents.endsWith("\n") ? contents.slice(0, -1) : contents;
}

/**
 * Which of a question's test files are actually on this host, right now.
 *
 * This is the one thing about a problem's readiness that a screen CAN check honestly and cheaply,
 * and it is the check whose absence hurts most: `TEST_DATA_ROOT` pointing somewhere other than
 * where the data lives does not fail at seed time, it fails as verdict `IE` on a student's
 * submission, mid-contest, with nothing in any log that names the cause.
 *
 * It is emphatically NOT a claim that the problem is solvable. Only G13 knows that, because only
 * G13 runs a reference solution through the real judge in a real container.
 */
export interface TestDataReport {
  readonly fileCount: number;
  /** Stored paths that could not be opened. Empty is the answer that means "present". */
  readonly missing: readonly string[];
}

export async function checkTestDataPresent(problemId: string): Promise<TestDataReport> {
  const rows = await prisma.testCase.findMany({
    where: { problemId },
    select: { inputPath: true, expectedOutputPath: true },
    orderBy: { ordinal: "asc" },
  });
  const root = hostLimits().testDataRoot;
  const stored = rows.flatMap((row) => [row.inputPath, row.expectedOutputPath]);

  const missing: string[] = [];
  for (const storedPath of stored) {
    try {
      await stat(resolveTestDataPath(root, storedPath));
    } catch {
      missing.push(storedPath);
    }
  }
  return { fileCount: stored.length, missing };
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * Save an edit to an existing question.
 *
 * ## The slug does not move when the title does
 *
 * `Problem.slug` is a URL and a database key. Re-deriving it from a corrected title would orphan
 * every bookmark to the problem page and every row keyed on it, to fix a typo. The same reasoning
 * that keeps a runtime version out of a slug keeps a rename out of one: see `SLUG_LANGUAGE_TOKEN`
 * in `lib/schemas/seed.ts`.
 *
 * ## Every case is rewritten, not diffed
 *
 * Cases are identified by ordinal and ordinal is derived from position, so there is no stable
 * identity to diff against: reordering two cases and editing one are the same edit as far as the
 * form is concerned. Replacing the whole set is the only version of this that cannot silently
 * apply an edit to the wrong case.
 */
export async function updateAuthoredProblem(
  slug: string,
  input: UpdateProblemInput,
): Promise<CreatedProblem> {
  const existing = await prisma.problem.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
    },
  });
  if (existing === null) throw new NotFoundError("Problem");

  assertEditable(existing.title, await problemUsage(existing.id));

  const core = validateAuthoredCore(input);

  // Tri-state, and the middle state is the point: absent means the caller is not touching the
  // signature, so the stored value is left exactly as it is rather than read and rewritten.
  const signatureChange =
    input.signature === undefined
      ? null
      : { value: input.signature === null ? null : buildSignature(input.signature) };

  const staged = await stageTestFiles(slug, core.orderedCases);

  let previousPaths: string[] = [];
  try {
    await staged.commit();
    await prisma.$transaction(async (tx) => {
      await lockProblemMutations(tx, existing.id);
      const current = await tx.problem.findUnique({
        where: { id: existing.id },
        select: {
          title: true,
          state: true,
          testCases: { select: { inputPath: true, expectedOutputPath: true } },
        },
      });
      if (current === null) throw new NotFoundError("Problem");

      assertEditable(current.title, await lockedProblemUsage(tx, existing.id));
      previousPaths = current.testCases.flatMap((testCase) => [
        testCase.inputPath,
        testCase.expectedOutputPath,
      ]);

      // Cascades to TestResult, which is correct: a test result describes a case that no longer
      // exists. `assertEditable` has proved there are no submissions, so no historical result can
      // be lost here.
      await tx.testCase.deleteMany({ where: { problemId: existing.id } });
      await tx.problem.update({
        where: { id: existing.id },
        data: {
          title: core.title,
          statementMd: core.statementMd,
          inputSpec: core.inputSpec,
          outputSpec: core.outputSpec,
          constraints: core.constraints,
          difficulty: core.difficulty,
          timeLimitMs: core.timeLimitMs,
          memoryLimitMb: core.memoryLimitMb,
          // A DRAFT is a problem missing an original statement or its own test data, and
          // `validateAuthoredCore` has just required both. RETIRED is a decision somebody made
          // about this question and is not an editor's to reverse.
          ...(current.state === "DRAFT" ? { state: "PUBLISHED" as const } : {}),
          // A JSON column is cleared with `Prisma.DbNull`; a bare `null` means "JSON null", which
          // is a value the column holds rather than the absence of one, and `startersFor` would
          // then be handed a signature that parses as nothing.
          ...(signatureChange === null
            ? {}
            : { signature: signatureChange.value ?? Prisma.DbNull }),
          testCases: { create: [...staged.rows] },
        },
      });
    });
  } catch (error) {
    await staged.discard();
    throw error;
  }

  // Files the old case set pointed at that the new one does not. Shortening a question from eight
  // cases to three leaves 04..08 on disk, and the next organizer to open the directory finds test
  // data that belongs to nothing.
  const keep = new Set(staged.rows.flatMap((row) => [row.inputPath, row.expectedOutputPath]));
  const orphans = previousPaths.filter((stored) => !keep.has(stored));
  await removeStoredFiles(orphans);

  return { problemId: existing.id, slug, title: core.title };
}

// ---------------------------------------------------------------------------
// Deleting
// ---------------------------------------------------------------------------

export interface DeleteProblemOptions {
  /**
   * The question's title, typed by the organizer. Checked HERE rather than in the screen, so no
   * entry point can delete a question on a single click: the API route needs it too.
   */
  readonly confirmTitle: string;
}

export interface DeletedProblem {
  readonly slug: string;
  readonly title: string;
  /** Line-up entries removed along with it, so the caller can say what else changed. */
  readonly removedFromContests: number;
}

export async function deleteAuthoredProblem(
  slug: string,
  options: DeleteProblemOptions,
): Promise<DeletedProblem> {
  const existing = await prisma.problem.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
    },
  });
  if (existing === null) throw new NotFoundError("Problem");

  const usage = await problemUsage(existing.id);
  assertDeletable(existing.title, usage);

  if (options.confirmTitle.trim() !== existing.title.trim()) {
    throw new ValidationError(
      `To delete this question, type its name exactly: "${existing.title}".`,
    );
  }

  const deleted = await prisma.$transaction(async (tx) => {
    await lockProblemMutations(tx, existing.id);
    const current = await tx.problem.findUnique({
      where: { id: existing.id },
      select: {
        title: true,
        testCases: { select: { inputPath: true, expectedOutputPath: true } },
      },
    });
    if (current === null) throw new NotFoundError("Problem");

    const currentUsage = await lockedProblemUsage(tx, existing.id);
    assertDeletable(current.title, currentUsage);
    if (options.confirmTitle.trim() !== current.title.trim()) {
      throw new ValidationError(
        `To delete this question, type its name exactly: "${current.title}".`,
      );
    }

    // `ContestProblem.problem` is `onDelete: Restrict`, so these have to go first and explicitly.
    // Restrict is the right default: it is what stops a problem vanishing out of a live line-up.
    // Here the line-ups are all DRAFT or SCHEDULED, because `assertDeletable` has said so.
    await tx.contestProblem.deleteMany({ where: { problemId: existing.id } });
    await tx.problem.delete({ where: { id: existing.id } });

    return {
      title: current.title,
      removedFromContests: currentUsage.contests.length,
      stored: current.testCases.flatMap((testCase) => [
        testCase.inputPath,
        testCase.expectedOutputPath,
      ]),
    };
  });

  // Files last, and a failure here does not fail the request. The rows are the source of truth and
  // they are already gone: answering with an error would tell the organizer the deletion did not
  // happen when it did, and they would press it again and get "not found".
  await removeStoredFiles(deleted.stored);
  await removeEmptyTestDirectories(slug);

  return {
    slug,
    title: deleted.title,
    removedFromContests: deleted.removedFromContests,
  };
}

/**
 * Unlink the files a set of `TestCase` rows pointed at.
 *
 * RELATIVE paths only. `resolveTestDataPath` accepts an absolute stored path because the judge
 * fixtures use them, and a fixture's data is not this flow's to delete. Deleting exactly what the
 * rows named, rather than emptying the directory, also means a seeded problem's `problem.json` and
 * reference solution survive: those are repository files under review, not rows.
 */
async function removeStoredFiles(storedPaths: readonly string[]): Promise<void> {
  const root = hostLimits().testDataRoot;
  for (const stored of storedPaths) {
    if (path.isAbsolute(stored)) continue;
    try {
      await rm(resolveTestDataPath(root, stored), { force: true });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "problem.testFileRemoveFailed",
          path: stored,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  // Versioned authoring saves put all files in one immutable directory. Reclaim that directory
  // after its files are gone; `rmdir` refuses any directory that still contains unrelated data.
  const parents = new Set(
    storedPaths.filter((stored) => !path.isAbsolute(stored)).map((stored) => path.posix.dirname(stored)),
  );
  for (const parent of parents) {
    try {
      await rmdir(resolveTestDataPath(root, parent));
    } catch {
      // Still in use, already gone, or a seeded shared tests directory. All are safe to keep.
    }
  }
}

/**
 * Take the question's own directories back if nothing else is in them.
 *
 * `rmdir` without `recursive` is the whole safety property: it refuses on a non-empty directory,
 * so a seeded problem that still holds a statement or a reference solution keeps them.
 */
async function removeEmptyTestDirectories(slug: string): Promise<void> {
  const root = hostLimits().testDataRoot;
  for (const relative of [path.posix.join(slug, "tests"), slug]) {
    try {
      await rmdir(resolveTestDataPath(root, relative));
    } catch {
      // ENOTEMPTY or ENOENT. Both mean there is nothing here to reclaim, which is not a failure.
      return;
    }
  }
}

/** Add a trailing newline if the text lacks one, leaving an already-terminated file untouched. */
function ensureTrailingNewline(text: string): string {
  if (text === "") return "\n";
  return text.endsWith("\n") ? text : `${text}\n`;
}
