import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { hostLimits } from "@/lib/contest/host";
import { resolveTestDataPath } from "@/lib/contest/judge-job";
import { ValidationError } from "@/lib/errors";
import { startersFor } from "@/lib/judge/starters";
import { LANGUAGE_IDS } from "@/lib/judge/runtimes";
import { SignatureSchema, type Signature, type SignatureType } from "@/lib/schemas/seed";

/**
 * Creating a coding question from the organizer console, the simple way.
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
function buildSignature(authored: AuthoredSignature): Signature {
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

/**
 * Create a coding question: write its test files and its rows, and return it.
 *
 * Validation is strict and first, because a half-written problem is worse than none: it appears in
 * the bank, an organizer slots it, and it fails as `IE` on a student mid-contest. Everything is
 * checked before a single file or row is written.
 */
export async function createAuthoredProblem(input: CreateProblemInput): Promise<CreatedProblem> {
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

  const signature = input.signature != null ? buildSignature(input.signature) : null;

  const slug = await uniqueSlug(slugify(title));

  // Order the cases samples-first, so ordinal order matches the seed convention and the sample
  // rows the student sees are 1, 2, ….
  const ordered = [...input.testCases].sort((a, b) => Number(b.isSample) - Number(a.isSample));

  // Write the test files to disk under TEST_DATA_ROOT, mirroring the seeded layout exactly.
  const root = hostLimits().testDataRoot;
  const testDirRelative = path.posix.join(slug, "tests");
  const testDirAbsolute = resolveTestDataPath(root, testDirRelative);
  await mkdir(testDirAbsolute, { recursive: true });

  const caseRows = await Promise.all(
    ordered.map(async (testCase, index) => {
      const stem = String(index + 1).padStart(2, "0");
      const inputRelative = path.posix.join(slug, "tests", `${stem}.in`);
      const outputRelative = path.posix.join(slug, "tests", `${stem}.out`);
      // A trailing newline, because a program's stdout ends in one and a comparator that trims is
      // not something to rely on for a file the organizer typed without thinking about it.
      await writeFile(resolveTestDataPath(root, inputRelative), ensureTrailingNewline(testCase.input), "utf8");
      await writeFile(
        resolveTestDataPath(root, outputRelative),
        ensureTrailingNewline(testCase.expectedOutput),
        "utf8",
      );
      return {
        ordinal: index + 1,
        inputPath: inputRelative,
        expectedOutputPath: outputRelative,
        isSample: testCase.isSample,
        points: POINTS_PER_CASE,
        group: null,
      };
    }),
  );

  const created = await prisma.problem.create({
    data: {
      slug,
      title,
      statementMd: statement,
      inputSpec: input.inputSpec?.trim() ?? "",
      outputSpec: input.outputSpec?.trim() ?? "",
      constraints: input.constraints?.trim() ?? "",
      difficulty: input.difficulty,
      state: "PUBLISHED",
      type: "ALGORITHM",
      round: "INDIVIDUAL",
      timeLimitMs: input.timeLimitMs ?? 2000,
      memoryLimitMb: input.memoryLimitMb ?? 256,
      // allowedLanguages is omitted so the schema default applies: all six, every variant. That
      // default is the whole point of not asking which languages. createdAt and updatedAt are the
      // database's to set (@default(now()) and @updatedAt), so they are not passed here.
      signature: signature ?? undefined,
      testCases: { create: caseRows },
    },
    select: { id: true, slug: true, title: true },
  });

  return { problemId: created.id, slug: created.slug, title: created.title };
}

/** Add a trailing newline if the text lacks one, leaving an already-terminated file untouched. */
function ensureTrailingNewline(text: string): string {
  if (text === "") return "\n";
  return text.endsWith("\n") ? text : `${text}\n`;
}
