// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { VARIANTS, type LanguageId } from "@/lib/judge/runtimes";
import {
  PROBE_LANGUAGES,
  expectedEchoLines,
  languagesWithoutStarter,
  probeFor,
  starterFor,
  traceHarness,
  type HarnessTrace,
  type Signature,
} from "@/lib/judge/starters";
import type { JudgeJob } from "@/lib/schemas/judge";
import { parseProblemManifest, type ProblemManifest } from "@/lib/schemas/seed";
import { isDockerAvailable, sweepJudgeContainers } from "@/worker/docker";
import { judge, type ImageOverrides } from "@/worker/runner";

/**
 * G13 — reference solutions must survive the real judge.
 *
 * Every problem with authored content has its reference solution run through the actual
 * judge, in real containers, against its own test data. It must score `AC` with full marks.
 *
 * ## Why this is a gate and not a one-off script
 *
 * The content agents verified their references with local `python3`, which proves the
 * *algorithm*. It does not prove the problem is **judgeable**. The first run of this check
 * failed 9 of 20 problems that were all algorithmically correct:
 *
 *   - 8 x TLE, because the judge's Python startup budget was smaller than the measured
 *     interpreter startup, so correct solutions ran out of clock before doing any work.
 *   - 1 x WA, because a fixed 1 MiB stdout cap truncated a legitimately 1.29 MB answer,
 *     killed the container, and returned the same verdict a wrong answer gets.
 *
 * Neither was visible from local execution, and neither was caught by G4, whose fixtures all
 * used a problem whose output is a single line. Without this gate, eight problems ship
 * unsolvable and one punishes every correct submission.
 *
 * Container-bound and deliberately SEQUENTIAL. Must not run concurrently with G8, which is
 * also container-bound — competing workloads make both sets of timings meaningless.
 *
 * ## The three passes
 *
 *   A. every reference solution scores AC with full marks through the real judge (above);
 *   B. every declared `signature` reads the problem's own test data exactly (no containers);
 *   C. every starter that signature generates COMPILES AND RUNS, in all six emitted languages.
 *
 * B and C exist because starter code moves a problem's input parsing out of the student's file
 * and into ours. A signature that reads six tokens where the file has five generates a *correct*
 * harness for a *wrong* declaration: every unit test passes, every emitter is blameless, and the
 * error arrives as WA on a student's first submission of the night, in whichever language they
 * picked. B turns that into a gate failure. C turns "this generated Java does not compile" into
 * one too, instead of verdict CE on a file the student has not touched.
 */

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content", "problems");

/**
 * Keyed by RuntimeId, which is what `judge()` looks up.
 *
 * This was `{ python, java }` — keys matching no RuntimeId, so every override was silently
 * ignored and the registry's images were used regardless of what JUDGE_IMAGE_* said. Harmless
 * while the values agreed, and invisible until somebody set one on a host and watched it do
 * nothing. Same bug, same fix, as worker/index.ts.
 */
const IMAGES: ImageOverrides = {
  ...(process.env.JUDGE_IMAGE_PYTHON === undefined
    ? {}
    : { python312: process.env.JUDGE_IMAGE_PYTHON }),
  ...(process.env.JUDGE_IMAGE_JAVA === undefined ? {} : { jdk21: process.env.JUDGE_IMAGE_JAVA }),
};

const REQUIRED_FILES = ["problem.json", "statement.md", "reference.py", "generator.py"] as const;

interface ProblemMeta {
  slug: string;
  manifest: ProblemManifest;
}

interface Incomplete {
  slug: string;
  missing: string[];
}

/**
 * Optional slug filter: `npm run test:content -- slug-a slug-b` verifies only those problems.
 *
 * The gate stays the gate: a FULL no-argument run is what G13 means in the verify table, and
 * nothing about a filtered run may claim otherwise (the summary prints how many were skipped
 * by the filter, so a partial run can never read as a complete one). The filter exists because
 * the bank is growing by the dozen: re-judging four hundred authored problems to check twelve
 * new ones is an hour of container time that measures nothing new, and a single Bash timeout
 * cannot contain it anyway. Naming a slug that has no directory is an error, not a skip, so a
 * typo cannot silently verify nothing.
 */
const SLUG_FILTER = new Set(process.argv.slice(2).filter((arg) => !arg.startsWith("-")));

function discover(): { problems: ProblemMeta[]; incomplete: Incomplete[] } {
  if (!existsSync(CONTENT)) return { problems: [], incomplete: [] };

  const problems: ProblemMeta[] = [];
  const incomplete: Incomplete[] = [];

  if (SLUG_FILTER.size > 0) {
    const known = new Set(readdirSync(CONTENT));
    const unknown = [...SLUG_FILTER].filter((slug) => !known.has(slug));
    if (unknown.length > 0) {
      throw new Error(
        `slug filter names problems that do not exist under ${CONTENT}: ${unknown.join(", ")}`,
      );
    }
  }

  for (const slug of readdirSync(CONTENT).sort()) {
    if (SLUG_FILTER.size > 0 && !SLUG_FILTER.has(slug)) continue;
    const dir = path.join(CONTENT, slug);
    const missing: string[] = REQUIRED_FILES.filter((f) => !existsSync(path.join(dir, f)));

    const testDir = path.join(dir, "tests");
    const inputs = existsSync(testDir)
      ? readdirSync(testDir).filter((f) => f.endsWith(".in"))
      : [];
    if (inputs.length === 0) missing.push("tests/*.in");

    // Every input needs its expected output, or the problem is only partly generated.
    for (const f of inputs) {
      const out = path.join(testDir, f.replace(/\.in$/, ".out"));
      if (!existsSync(out)) missing.push(`tests/${path.basename(out)}`);
    }

    if (missing.length > 0) {
      incomplete.push({ slug, missing });
      continue;
    }

    /**
     * Parsed, not cast.
     *
     * This read `JSON.parse(...) as Partial<ProblemMeta>` and then defaulted every field, so a
     * manifest with `timeLimtMs` judged the reference against 2000 ms while the seeded problem
     * carried whatever the typo left behind, and the two disagreed silently. A throw here is
     * correct: an unparseable manifest is a content failure, which is the thing this gate is for.
     */
    const file = path.join(dir, "problem.json");
    problems.push({
      slug,
      manifest: parseProblemManifest(JSON.parse(readFileSync(file, "utf8")), file),
    });
  }

  return { problems, incomplete };
}

/** Every `.in` file of a problem, sorted, as absolute paths. */
function inputFiles(slug: string): string[] {
  const testDir = path.join(CONTENT, slug, "tests");
  return readdirSync(testDir)
    .filter((f) => f.endsWith(".in"))
    .sort()
    .map((f) => path.join(testDir, f));
}

/** The container ceilings this gate judges under. Shared by the reference and probe passes. */
function limitsFor(manifest: ProblemManifest): JudgeJob["limits"] {
  return {
    timeLimitMs: manifest.timeLimitMs,
    memoryLimitMb: manifest.memoryLimitMb,
    wallClockKillMs: manifest.timeLimitMs * 3,
    pidsLimit: 64,
    tmpfsBytes: 16 * 1024 * 1024,
    cpus: 1,
  };
}

function jobFor(meta: ProblemMeta): JudgeJob {
  const dir = path.join(CONTENT, meta.slug);

  const testCases = inputFiles(meta.slug).map((inputPath, i) => {
    const base = path.basename(inputPath).replace(/\.in$/, "");
    return {
      testCaseId: base,
      ordinal: i + 1,
      inputPath,
      expectedOutputPath: path.join(path.dirname(inputPath), `${base}.out`),
      isSample: i < meta.manifest.sampleCount,
      points: 10,
      group: null,
    };
  });

  return {
    submissionId: `g13-${meta.slug}`,
    language: "PYTHON_312",
    sourceCode: readFileSync(path.join(dir, "reference.py"), "utf8"),
    limits: limitsFor(meta.manifest),
    comparator: { kind: "whitespace" },
    testCases,
    attempt: 1,
  };
}

/* ------------------------------------------------------------------------- */
/* Pass B — a signature must agree with the problem's own test data           */
/* ------------------------------------------------------------------------- */

/**
 * Walk the declared harness over every authored input and require it to consume the file
 * EXACTLY: no token left over, and none missing.
 *
 * Both directions are real bugs and neither is visible from a sample. Reading too few leaves the
 * tail unread, so a `repeat` that is one short answers most of the file correctly and silently
 * drops the last query. Reading too many runs off the end, which is an IndexError in Python, a
 * hang in C++'s `cin >>`, and garbage in C. The reference solution passes in all four cases,
 * because the reference does its own parsing and never sees the generated harness.
 *
 * Runs over EVERY input, not just the samples. A signature that only matches the shape of the
 * first file is exactly the failure this catches.
 */
function checkSignatureAgainstTestData(meta: ProblemMeta): string[] {
  const signature = meta.manifest.signature;
  if (signature === undefined) return [];

  const failures: string[] = [];
  for (const inputPath of inputFiles(meta.slug)) {
    const tokens = readFileSync(inputPath, "utf8").split(/\s+/).filter((t) => t.length > 0);
    const name = path.basename(inputPath);
    try {
      const trace = traceHarness(signature, tokens);
      if (trace.consumed !== tokens.length) {
        failures.push(
          `${name}: the harness reads ${String(trace.consumed)} of ${String(tokens.length)} ` +
            `tokens, leaving ${String(tokens.length - trace.consumed)} unread`,
        );
      }
    } catch (error: unknown) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failures;
}

/**
 * Generating every starter is itself a check: the emitters throw on a declaration they cannot
 * express, and an exception here is far better than an empty editor at 7pm.
 */
function checkStartersEmit(meta: ProblemMeta): string[] {
  const signature = meta.manifest.signature;
  if (signature === undefined) return [];

  const failures: string[] = [];
  for (const language of meta.manifest.allowedLanguages) {
    try {
      const code = starterFor(signature, language);
      if (code.trim().length === 0) failures.push(`${language}: emitted an empty starter`);
    } catch (error: unknown) {
      failures.push(`${language}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failures;
}

/* ------------------------------------------------------------------------- */
/* Pass C — the generated starters must compile and run                      */
/* ------------------------------------------------------------------------- */

/**
 * The line a probe prints for the stub's untouched zero return.
 *
 * `long` is `0L` in the Java source and `0` on stdout. Every array zero is empty, and an empty
 * array joined by anything at all is the empty string, so all four of those print a blank line.
 */
const RESULT_LINE: Readonly<Record<Signature["returns"]["type"], string>> = {
  int: "0",
  long: "0",
  string: "",
  "int[]": "",
  "long[]": "",
  "string[]": "",
};

/**
 * Source files whose harness accumulates every call's result and flushes ONCE at the end, so all
 * the echo lines come out before any result line.
 *
 * The other three (`main.c`, `main.cpp`, `main.go`) print each result as they go, so their lines
 * interleave per call. This is not a detail that can be normalised away and it is not a defect:
 * buffering is what keeps a 100,000-answer solution from paying for a flush per line, and the C
 * harness has no buffer to flush. `lib/judge/starters/java.ts` says so explicitly, addressed to
 * this function: "NOTE for whoever generates the probe golden".
 *
 * If an emitter ever changes which side it is on, this gate fails loudly against a golden that
 * no longer matches — which is the right way round. A missing entry cannot fail silently, because
 * every language is judged.
 */
const FLUSHES_ONCE: ReadonlySet<string> = new Set(["main.py", "Main.java", "main.js"]);

/**
 * What a probe build must print, given what the harness reads.
 *
 * Derived from the signature and the input file rather than captured from one language's run.
 * That is the whole point: six implementations agreeing with each other proves they agree, not
 * that they are right. This is an independent expectation, so a reader that consumes the token
 * stream in the wrong order is a WA against it in every language at once.
 */
function probeGolden(signature: Signature, trace: HarnessTrace, sourceFile: string): string {
  const result = RESULT_LINE[signature.returns.type];
  const lines = FLUSHES_ONCE.has(sourceFile)
    ? [...expectedEchoLines(trace), ...trace.calls.map(() => result)]
    : trace.calls.flatMap((call) => [...call.echoes, result]);
  return `${lines.join("\n")}\n`;
}

/** Where the derived goldens are written. `.judge-tmp/`, never os.tmpdir() — see CLAUDE.md. */
const PROBE_SCRATCH = path.join(
  process.env.JUDGE_SCRATCH_ROOT ?? path.join(ROOT, ".judge-tmp"),
  "g13-probe",
);

interface ProbeFailure {
  slug: string;
  language: LanguageId;
  detail: string;
}

/**
 * Judge one probe build per EMITTER, against the problem's first authored input.
 *
 * Per emitter rather than per language: `CPP_11` and `CPP_17` compile the same generated
 * `main.cpp`, and Java's four levels the same `Main.java`, so judging all ten would buy four more
 * measurements of files that are byte-identical. `PROBE_LANGUAGES` derives the representatives
 * from the registry, so a new variant never needs a line here.
 *
 * One input, not all of them. The probe proves the harness COMPILES and reads in the declared
 * order; pass B already walked every input, in every case, for free.
 */
async function probeProblem(
  meta: ProblemMeta,
): Promise<{ ran: number; failures: ProbeFailure[] }> {
  const signature = meta.manifest.signature;
  if (signature === undefined) return { ran: 0, failures: [] };

  const inputPath = inputFiles(meta.slug)[0];
  if (inputPath === undefined) return { ran: 0, failures: [] };

  const tokens = readFileSync(inputPath, "utf8").split(/\s+/).filter((t) => t.length > 0);
  const trace = traceHarness(signature, tokens);

  const allowed = new Set(meta.manifest.allowedLanguages);
  const failures: ProbeFailure[] = [];
  let ran = 0;

  for (const language of PROBE_LANGUAGES) {
    // A problem may narrow its languages deliberately; there is nothing to prove about an
    // emitter it does not offer. Counted rather than assumed, so the summary line stays true.
    if (!allowed.has(language)) continue;
    ran += 1;

    const sourceFile = VARIANTS[language].sourceFile;
    const goldenPath = path.join(PROBE_SCRATCH, `${meta.slug}.${language}.out`);
    writeFileSync(goldenPath, probeGolden(signature, trace, sourceFile), "utf8");

    const result = await judge(
      {
        submissionId: `g13-probe-${meta.slug}-${language}`,
        language,
        sourceCode: probeFor(signature, language),
        // The probe compiles the whole starter plus a few prints, so a stock time limit is
        // right for running it. The compile budget is the registry's and is not ours to set.
        limits: limitsFor(meta.manifest),
        comparator: { kind: "whitespace" },
        testCases: [
          {
            testCaseId: "probe",
            ordinal: 1,
            inputPath,
            expectedOutputPath: goldenPath,
            // Sample, so a mismatch comes back with a diff snippet to put in the log. There is
            // no hidden data here to leak: the golden is derived from a published sample.
            isSample: true,
            points: 10,
            group: null,
          },
        ],
        attempt: 1,
      },
      IMAGES,
    );

    if (result.verdict === "AC") continue;

    const detail =
      result.compileError !== null
        ? `CE: ${result.compileError.split("\n").slice(0, 3).join(" | ").slice(0, 240)}`
        : `${result.verdict}: ${result.testResults[0]?.diffSnippet ?? "no diff"}`;
    failures.push({ slug: meta.slug, language, detail });
  }

  return { ran, failures };
}

/**
 * A problem that has left DRAFT without being authored has shipped without ever being
 * verified — the thing PRD §8 forbids.
 *
 * The condition is on the CONTENT, not on a filesystem directory. `content/problems/` is the
 * seed route for problems authored ahead of time; the normal route is an organizer typing a
 * statement into the admin UI, which lands in the database and never touches the repo. The
 * first version of this check required a directory and duly flagged the E2E fixture — whose
 * statement lives in the DB exactly as a hand-authored problem's would. That was the check
 * being wrong, not the data.
 *
 * What actually has to hold for a problem to leave DRAFT: a non-empty statement, and at least
 * one test case. Checked only when the database is reachable; when it is not, that is reported
 * rather than silently passed.
 */
async function checkPublishedAreAuthored(): Promise<string[] | null> {
  try {
    const { prisma } = await import("@/lib/db");
    const published = await prisma.problem.findMany({
      where: { state: { not: "DRAFT" } },
      select: { slug: true, statementMd: true, _count: { select: { testCases: true } } },
    });

    return published
      .filter((p) => p.statementMd.trim().length === 0 || p._count.testCases === 0)
      .map((p) =>
        p.statementMd.trim().length === 0
          ? `${p.slug} (no statement)`
          : `${p.slug} (no test cases)`,
      );
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!(await isDockerAvailable())) {
    console.error("G13 FAIL: Docker daemon is not reachable. This is a FAIL, not a skip.");
    process.exit(1);
  }

  const { problems, incomplete } = discover();
  await sweepJudgeContainers();

  let failures = incomplete.length;

  for (const bad of incomplete) {
    console.log(`FAIL  ${bad.slug.padEnd(30)} incomplete content: missing ${bad.missing.join(", ")}`);
  }

  // --- pass B, first because it costs nothing ------------------------------
  // A signature that misreads its own input makes pass C's verdicts meaningless, and this
  // answers that in milliseconds. Ordering the cheap check first is also what lets an author
  // fix a declaration without waiting out twenty containers to hear about it.
  const unserved = languagesWithoutStarter();
  if (unserved.length > 0) {
    failures += 1;
    console.log(
      `\nFAIL  the registry runs ${unserved.join(", ")} but no starter emitter serves them. ` +
        `A student picking one gets an empty editor on a problem whose other languages are ` +
        `pre-filled. See lib/judge/starters/index.ts.`,
    );
  }

  const signed = problems.filter((p) => p.manifest.signature !== undefined);
  console.log(
    `\nchecking ${signed.length} declared signature(s) against their own test data ` +
      `(${problems.length - signed.length} problem(s) declare none, which is a raw stdin problem ` +
      `and stays one)\n`,
  );

  for (const meta of signed) {
    const issues = [...checkSignatureAgainstTestData(meta), ...checkStartersEmit(meta)];
    if (issues.length === 0) {
      const inputs = inputFiles(meta.slug).length;
      console.log(
        `PASS  ${meta.slug.padEnd(30)} ${meta.manifest.signature?.name ?? ""} reads all ` +
          `${String(inputs)} input file(s) exactly`,
      );
      continue;
    }
    failures += 1;
    console.log(`FAIL  ${meta.slug.padEnd(30)} signature disagrees with the authored content:`);
    for (const issue of issues) console.log(`      ${issue}`);
  }

  console.log(`\nverifying ${problems.length} reference solutions through the real judge\n`);

  let totalTests = 0;
  let referenceFailures = 0;
  for (const meta of problems) {
    const job = jobFor(meta);
    const started = Date.now();
    const result = await judge(job, IMAGES);
    const elapsed = Date.now() - started;

    const fullMarks = job.testCases.length * 10;
    const pass = result.verdict === "AC" && result.score === fullMarks;
    totalTests += job.testCases.length;
    if (!pass) {
      failures += 1;
      referenceFailures += 1;
    }

    const slowest = Math.max(0, ...result.testResults.map((r) => r.runtimeMs ?? 0));
    console.log(
      `${pass ? "PASS" : "FAIL"}  ${meta.slug.padEnd(30)} ${result.verdict.padEnd(4)} ` +
        `${String(result.score).padStart(3)}/${fullMarks}  ${job.testCases.length} tests  ` +
        `slowest ${slowest}ms  total ${(elapsed / 1000).toFixed(1)}s`,
    );

    if (!pass) {
      if (result.compileError !== null) {
        console.log(`      compileError: ${result.compileError.slice(0, 200)}`);
      }
      for (const r of result.testResults.filter((t) => t.verdict !== "AC")) {
        console.log(`      ${r.testCaseId}: ${r.verdict} ${r.runtimeMs ?? "?"}ms`);
      }
    }
  }

  // --- pass C, last of the container work ----------------------------------
  // After the reference pass on purpose. Pass A is the one whose TIMINGS are load-bearing (it is
  // where the eight TLEs of the first run showed up), and every container this pass starts is
  // wake that a later measurement would inherit. Pass C reports AC or not-AC, which is a fact
  // about compilation and reading order and does not move with the host's mood.
  let probeRuns = 0;
  if (signed.length > 0) {
    mkdirSync(PROBE_SCRATCH, { recursive: true });
    console.log(
      `\njudging ${String(signed.length)} x ${String(PROBE_LANGUAGES.length)} generated ` +
        `starters: they must compile and echo the arguments the declaration says they were ` +
        `handed\n`,
    );

    for (const meta of signed) {
      const started = Date.now();
      const { ran, failures: bad } = await probeProblem(meta);
      probeRuns += ran;
      const elapsed = (Date.now() - started) / 1000;

      if (bad.length === 0) {
        console.log(
          `PASS  ${meta.slug.padEnd(30)} ${String(ran)} starters compile and read correctly  ` +
            `total ${elapsed.toFixed(1)}s`,
        );
        continue;
      }
      failures += bad.length;
      console.log(`FAIL  ${meta.slug.padEnd(30)} ${String(bad.length)} generated starter(s):`);
      for (const one of bad) console.log(`      ${one.language}: ${one.detail}`);
    }
  }

  const orphans = await checkPublishedAreAuthored();
  if (orphans === null) {
    console.log(
      "\nNOTE: database unreachable — could not confirm that every non-DRAFT problem is " +
        "authored. The judge portion of this gate still ran in full.",
    );
  } else if (orphans.length > 0) {
    failures += orphans.length;
    console.log(`\nFAIL  ${orphans.length} problem(s) left DRAFT without being authored:`);
    for (const slug of orphans) console.log(`      ${slug}`);
  } else {
    console.log("\nevery non-DRAFT problem has a statement and test cases");
  }

  const swept = await sweepJudgeContainers();
  /*
    Counted from the reference pass's OWN failures, not by subtracting everything else out of a
    single total. The old form was `failures - incomplete - orphans`, which was correct only for
    as long as those were the only three things that could fail; adding the signature passes would
    have silently turned it into a wrong number in a summary line, which is the kind of thing
    nobody re-derives once it has printed a plausible figure.
  */
  console.log(
    `\n${String(problems.length - referenceFailures)}/${String(problems.length)} references ` +
      `verified, ${String(totalTests)} test cases executed, ${String(probeRuns)} generated ` +
      `starters judged, ${String(swept)} containers swept`,
  );

  if (failures > 0) {
    console.error(`\nG13 FAIL: ${failures} problem(s) cannot ship.`);
    process.exit(1);
  }
  if (SLUG_FILTER.size > 0) {
    // A filtered run may never impersonate the gate. The verify table's G13 means ALL content.
    console.log(
      `\nG13 PARTIAL PASS: ${String(problems.length)} problem(s) matched the slug filter; ` +
        "the rest were not judged. Run without arguments for the real gate.",
    );
    return;
  }
  console.log("\nG13 PASS");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
