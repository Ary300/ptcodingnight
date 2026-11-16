/**
 * Verify every HAND-WRITTEN starter in `content/problems/<slug>/starters/`.
 *
 *   npx tsx scripts/verify-starters.ts            # every problem with a starters/ folder
 *   npx tsx scripts/verify-starters.ts slug ...   # only these problems
 *
 * A starter is the file a student opens in the editor before writing a line. If it does not
 * compile, the first thing a student sees on the night is a compile error they did not cause; if
 * it hangs or floods stdout on the real inputs, "Run samples" looks broken. So each file is
 * compiled and run in the judge's own image, under the judge's isolation flags
 * (`isolationArgs` in worker/docker.ts: no network, read-only rootfs plus tmpfs, nobody:nogroup,
 * no capabilities, no-new-privileges, pids/memory/cpus/fsize caps), against EVERY `tests/*.in`
 * of its problem.
 *
 * A file PASSES when it compiles, exits 0 within 10 s on every input, and writes no more than
 * `MAX_STDOUT_BYTES` to stdout on any of them. A starter is template code, so it is expected to
 * print a placeholder or nothing; it is not expected to be correct, and nothing here compares
 * output with `.out` files.
 *
 * One container per problem and language, looping over the inputs inside it, because container
 * start is the expensive part on Docker Desktop (seconds, not milliseconds). The compile and run
 * commands are the registry's own (`VARIANTS[...].compileCommand` / `runCommand`), so this cannot
 * drift from what the judge does with the same file.
 *
 * Exit code 0 when everything passes, 1 when anything fails, 2 when Docker or an image is missing.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  HAND_WRITTEN_STARTER_FILES,
  isSafeProblemSlug,
  problemContentRoot,
} from "@/lib/contest/hand-written-starters";
import { LANGUAGE_IDS, RUNTIMES, VARIANTS, type LanguageId } from "@/lib/judge/runtimes";
import { imageExists, isDockerAvailable, isolationArgs } from "@/worker/docker";

const RUN_TIMEOUT_SECONDS = 10;
const COMPILE_TIMEOUT_SECONDS = 120;
const MAX_STDOUT_BYTES = 4 * 1024;

/**
 * The output allowance for one input: the flat floor, or twice the expected answer when that is
 * larger. A starter prints placeholder answers in the problem's own shape, so a problem whose
 * answer is one line per query legitimately prints one placeholder line per query: 200,000 bytes
 * on circular-array-rotation's large inputs. The cap is there to catch a flood, not a correct
 * shape, so it scales with what the problem itself prints.
 */
function outputCapFor(testsDir: string, input: string): number {
  const expected = path.join(testsDir, input.replace(/\.in$/, ".out"));
  const expectedBytes = existsSync(expected) ? statSync(expected).size : 0;
  return Math.max(MAX_STDOUT_BYTES, expectedBytes * 2);
}
const CONCURRENCY = 3;
const CONTAINER_PREFIX = "ptcn-verify-starter-";

interface Job {
  readonly slug: string;
  readonly language: LanguageId;
  readonly fileName: string;
  readonly startersDir: string;
  readonly testsDir: string;
  readonly inputs: readonly string[];
}

interface Outcome {
  readonly job: Job;
  readonly pass: boolean;
  readonly detail: string;
}

/*
  The in-container driver. Compile once, then run every input with coreutils `timeout`, which is
  how the judge bounds a run too. stdout goes to the tmpfs and only its byte count comes back.
  One `@@` line per input keeps the parse trivial and immune to whatever the program prints on
  stderr.
*/
const DRIVER = `
set -u
mkdir -p /tmp/out
if ! sh -c "$COMPILE" >/tmp/out/compile.txt 2>&1; then
  echo "@@COMPILE_FAILED"
  head -c 1500 /tmp/out/compile.txt
  exit 0
fi
for f in /tests/*.in; do
  start=$(date +%s%N)
  timeout -k 1 "$RUN_TIMEOUT" sh -c "$RUN" <"$f" >/tmp/out/stdout 2>/tmp/out/stderr
  rc=$?
  end=$(date +%s%N)
  bytes=$(wc -c </tmp/out/stdout | tr -d ' ')
  echo "@@RUN $(basename "$f") $rc $bytes $(( (end - start) / 1000000 ))"
  if [ "$rc" -ne 0 ]; then
    echo "@@STDERR $(head -c 300 /tmp/out/stderr | tr '\\n' ' ')"
  fi
  # A starter that hangs on one input hangs on the rest; stop rather than spend 10 s on each.
  case "$rc" in 124|137|143) echo "@@STOPPED"; break ;; esac
done
echo "@@DONE"
`;

function discoverJobs(root: string, only: ReadonlySet<string>): Job[] {
  const jobs: Job[] = [];
  for (const slug of readdirSync(root).sort()) {
    if (only.size > 0 && !only.has(slug)) continue;
    const startersDir = path.join(root, slug, "starters");
    if (!existsSync(startersDir) || !statSync(startersDir).isDirectory()) continue;
    if (!isSafeProblemSlug(slug)) {
      console.log(`FAIL  ${slug}  -  directory name is not a valid problem slug`);
      continue;
    }

    const testsDir = path.join(root, slug, "tests");
    const inputs = existsSync(testsDir)
      ? readdirSync(testsDir)
          .filter((name) => name.endsWith(".in"))
          .sort()
      : [];

    for (const language of LANGUAGE_IDS) {
      const fileName = HAND_WRITTEN_STARTER_FILES[language];
      if (fileName === undefined) continue;
      if (!existsSync(path.join(startersDir, fileName))) continue;
      jobs.push({ slug, language, fileName, startersDir, testsDir, inputs });
    }

    const known = new Set(Object.values(HAND_WRITTEN_STARTER_FILES));
    for (const extra of readdirSync(startersDir)) {
      if (!known.has(extra)) {
        console.log(`WARN  ${slug}  ${extra} is not a starter file name and will never be served`);
      }
    }
  }
  return jobs;
}

function dockerArgs(job: Job, name: string): string[] {
  const variant = VARIANTS[job.language];
  const runtime = RUNTIMES[variant.runtime];
  const tmpfsBytes = 64 * 1024 * 1024;
  return [
    "run",
    "--rm",
    `--name=${name}`,
    ...isolationArgs({
      memoryLimitMb: Math.max(runtime.compileMemoryLimitMb, 512),
      cpus: Math.max(runtime.compileCpus, 1),
      pidsLimit: Math.max(runtime.compilePidsLimit, 64),
      tmpfsBytes,
      wallClockKillMs: RUN_TIMEOUT_SECONDS * 1000,
      fsizeBytes: tmpfsBytes,
    }),
    // The build output must be executable (C++), which the noexec /tmp is not. The judge uses a
    // bind-mounted /build for the same reason; a tmpfs here keeps the host clean.
    `--tmpfs=/build:rw,exec,nosuid,mode=1777,size=${String(tmpfsBytes)}`,
    "--workdir=/work",
    `--volume=${job.startersDir}:/work:ro`,
    `--volume=${job.testsDir}:/tests:ro`,
    "--env=HOME=/tmp",
    "--env=TMPDIR=/tmp",
    "--env=PYTHONDONTWRITEBYTECODE=1",
    `--env=COMPILE=${variant.compileCommand}`,
    `--env=RUN=${variant.runCommand}`,
    `--env=RUN_TIMEOUT=${String(RUN_TIMEOUT_SECONDS)}`,
    runtime.image,
    "sh",
    "-c",
    DRIVER,
  ];
}

function runDocker(args: readonly string[], killAfterMs: number): Promise<{ out: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn("docker", [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), killAfterMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ out, code });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ out: error.message, code: null });
    });
  });
}

async function verify(job: Job): Promise<Outcome> {
  if (job.inputs.length === 0) {
    return { job, pass: false, detail: "the problem has no tests/*.in to run against" };
  }

  const name = `${CONTAINER_PREFIX}${randomUUID().slice(0, 8)}`;
  const budgetMs = (COMPILE_TIMEOUT_SECONDS + (RUN_TIMEOUT_SECONDS + 2) * job.inputs.length + 60) * 1000;
  const { out, code } = await runDocker(dockerArgs(job, name), budgetMs);
  if (code !== 0) {
    await runDocker(["rm", "-f", name], 30_000);
  }

  if (out.includes("@@COMPILE_FAILED")) {
    const message = out.split("@@COMPILE_FAILED")[1]?.trim().split("\n").slice(0, 6).join(" | ");
    return { job, pass: false, detail: `does not compile: ${message ?? ""}` };
  }
  if (!out.includes("@@DONE")) {
    return { job, pass: false, detail: `container did not finish (exit ${String(code)}): ${out.slice(-400)}` };
  }

  const problems: string[] = [];
  let slowestMs = 0;
  let largestBytes = 0;
  let ran = 0;
  const lines = out.split("\n");
  for (const [index, line] of lines.entries()) {
    const match = /^@@RUN (\S+) (\d+) (\d+) (\d+)$/.exec(line);
    if (match === null) continue;
    ran += 1;
    const [, input = "", rcText = "", bytesText = "", msText = ""] = match;
    const rc = Number(rcText);
    const bytes = Number(bytesText);
    const ms = Number(msText);
    slowestMs = Math.max(slowestMs, ms);
    largestBytes = Math.max(largestBytes, bytes);
    if (rc === 124 || rc === 137 || rc === 143) {
      problems.push(`${input}: no exit within ${String(RUN_TIMEOUT_SECONDS)} s (exit ${rcText})`);
    } else if (rc !== 0) {
      const stderr = lines[index + 1]?.startsWith("@@STDERR ") ? lines[index + 1]?.slice(9) : "";
      problems.push(`${input}: exit ${rcText} ${stderr ?? ""}`.trim());
    }
    const cap = outputCapFor(job.testsDir, input);
    if (bytes > cap) {
      problems.push(`${input}: wrote ${String(bytes)} bytes (cap ${String(cap)})`);
    }
  }

  if (out.includes("@@STOPPED")) {
    problems.push(`stopped after the first timeout; ${String(job.inputs.length - ran)} inputs not run`);
  } else if (ran !== job.inputs.length) {
    problems.push(`ran ${String(ran)} of ${String(job.inputs.length)} inputs`);
  }

  const summary = `${String(ran)} inputs, slowest ${String(slowestMs)} ms, largest stdout ${String(largestBytes)} B`;
  if (problems.length > 0) {
    const shown = problems.slice(0, 3).join("; ");
    const more = problems.length > 3 ? ` (+${String(problems.length - 3)} more)` : "";
    return { job, pass: false, detail: `${summary}; ${shown}${more}` };
  }
  return { job, pass: true, detail: summary };
}

async function runAll(jobs: readonly Job[]): Promise<Outcome[]> {
  const outcomes: Outcome[] = new Array<Outcome>(jobs.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const index = next;
      next += 1;
      const job = jobs[index];
      if (job === undefined) continue;
      const outcome = await verify(job);
      outcomes[index] = outcome;
      console.log(
        `${outcome.pass ? "PASS" : "FAIL"}  ${job.slug}  ${job.language} (${job.fileName})  ${outcome.detail}`,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()));
  return outcomes;
}

async function main(): Promise<number> {
  const root = problemContentRoot();
  const only = new Set(process.argv.slice(2));
  const jobs = discoverJobs(root, only);

  if (jobs.length === 0) {
    console.log(`No hand-written starters found under ${root}${only.size > 0 ? " for the given slugs" : ""}.`);
    return only.size > 0 ? 1 : 0;
  }

  if (!(await isDockerAvailable())) {
    console.log("Docker is not available. Start Docker and rerun.");
    return 2;
  }
  const images = [...new Set(jobs.map((job) => RUNTIMES[VARIANTS[job.language].runtime].image))];
  const missing: string[] = [];
  for (const image of images) {
    if (!(await imageExists(image))) missing.push(image);
  }
  if (missing.length > 0) {
    console.log(`Missing judge images: ${missing.join(", ")}. Run scripts/build-judge-images.sh --verify.`);
    return 2;
  }

  const started = Date.now();
  const outcomes = await runAll(jobs);
  const failed = outcomes.filter((outcome) => !outcome.pass);
  const problems = new Set(jobs.map((job) => job.slug)).size;
  console.log("");
  console.log(
    `Summary: ${String(outcomes.length - failed.length)}/${String(outcomes.length)} starters pass ` +
      `across ${String(problems)} problems in ${String(Math.round((Date.now() - started) / 1000))} s.`,
  );
  for (const outcome of failed) {
    console.log(`  FAIL ${outcome.job.slug} ${outcome.job.language}`);
  }
  return failed.length === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 2;
  },
);
