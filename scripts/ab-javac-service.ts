// Standalone tsx entrypoint — load .env before anything reads process.env.
import "dotenv/config";

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { probeFor } from "@/lib/judge/starters";
import { runtimeFor, VARIANTS, type LanguageId } from "@/lib/judge/runtimes";
import { parseProblemManifest } from "@/lib/schemas/seed";
import { isDockerAvailable, runInContainer, sweepJudgeContainers } from "@/worker/docker";
import { javacArguments, JavacService } from "@/worker/javac-service";
import { slotProfileFor } from "@/worker/runner";
import { specsFor } from "@/worker/slot-profile";
import { createWorkspace, removeWorkspace, SCRATCH_ROOT } from "@/worker/workspace";
import { OUTPUT_CAP_FLOOR_BYTES } from "@/worker/docker";
import type { JudgeJob } from "@/lib/schemas/judge";

/**
 * A/B for the warm javac service: compile the SAME source in the per-submission compile container
 * (the path every Java submission took before) and in the service, and diff
 *
 *   - javac's exit status,
 *   - the message a student sees for a CE — the container's stderr, trimmed, exactly as the runner
 *     stores it — character for character,
 *   - every class file, by name and SHA-256.
 *
 *     npx tsx scripts/ab-javac-service.ts [--sol-dir DIR ...] [--language JAVA_21]
 *
 * Sources: every Java fixture in fixtures/judge and fixtures/sandbox (CE fixtures included), the
 * generated Java starter AND its probe for every problem in content/problems, every correct
 * solution under each --sol-dir, and a set of broken variants of those (each with one line
 * removed) so the CE comparison covers far more than the two CE fixtures. Exits 1 on any
 * difference, or if the service never compiled anything.
 */

const ROOT = process.cwd();

interface Source {
  readonly name: string;
  readonly code: string;
}

function javaSources(solDirs: readonly string[]): Source[] {
  const out: Source[] = [];
  for (const base of ["fixtures/judge/cases", "fixtures/sandbox/cases"]) {
    for (const id of readdirSync(path.join(ROOT, base)).sort()) {
      const file = path.join(ROOT, base, id, "Main.java");
      if (existsSync(file)) out.push({ name: `${base}/${id}`, code: readFileSync(file, "utf8") });
    }
  }
  const content = path.join(ROOT, "content", "problems");
  for (const slug of readdirSync(content).sort()) {
    const file = path.join(content, slug, "problem.json");
    if (!existsSync(file)) continue;
    const manifest = parseProblemManifest(JSON.parse(readFileSync(file, "utf8")), file);
    if (manifest.signature === undefined) continue;
    out.push({ name: `probe/${slug}`, code: probeFor(manifest.signature, "JAVA_21") });
  }
  for (const dir of solDirs) {
    for (const slug of readdirSync(dir).sort()) {
      const file = path.join(dir, slug, "Main.java");
      if (existsSync(file)) out.push({ name: `sol/${path.basename(path.dirname(dir))}/${slug}`, code: readFileSync(file, "utf8") });
    }
  }
  return out;
}

/** Each source with its Nth non-blank line removed: a spread of real compile errors. */
function brokenVariants(sources: readonly Source[]): Source[] {
  const out: Source[] = [];
  for (const source of sources) {
    const lines = source.code.split("\n");
    const candidates = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.trim().length > 0 && l.trim() !== "}");
    for (const pick of [Math.floor(candidates.length / 3), Math.floor((2 * candidates.length) / 3)]) {
      const victim = candidates[pick];
      if (victim === undefined) continue;
      out.push({
        name: `${source.name}#drop${String(victim.i + 1)}`,
        code: lines.filter((_, i) => i !== victim.i).join("\n"),
      });
    }
  }
  return out;
}

function classDigest(dir: string): string {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d).sort()) {
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);
  return files
    .map((f) => `${path.relative(dir, f)}:${createHash("sha256").update(readFileSync(f)).digest("hex")}`)
    .join("\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const solDirs: string[] = [];
  let language: LanguageId = "JAVA_21";
  let image: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--sol-dir") solDirs.push(argv[++i] ?? "");
    else if (argv[i] === "--language") language = (argv[++i] ?? "JAVA_21") as LanguageId;
    else if (argv[i] === "--image") image = argv[++i] ?? null;
  }
  if (!(await isDockerAvailable())) {
    console.error("Docker daemon is not reachable. The A/B is NOT RUN.");
    process.exit(2);
  }
  const variant = VARIANTS[language];
  const runtime = runtimeFor(language);
  if (variant.compileCommand === undefined) throw new Error(`${language} does not compile`);
  const args = javacArguments(variant.compileCommand);

  const service = new JavacService({ lanes: 1, image: image ?? runtime.image, runtime });
  const ready = await service.start();
  if (ready === 0) {
    console.error("The javac service did not start. The A/B is NOT RUN.");
    process.exit(2);
  }

  const seed: JudgeJob = {
    submissionId: "ab-javac",
    language,
    sourceCode: "",
    limits: { timeLimitMs: 1000, memoryLimitMb: 256, wallClockKillMs: 3000, pidsLimit: 64, tmpfsBytes: 16 * 1024 * 1024, cpus: 1 },
    comparator: { kind: "whitespace" },
    testCases: [],
    attempt: 1,
    captureOutput: false,
  };
  const profile = slotProfileFor(seed, undefined, OUTPUT_CAP_FLOOR_BYTES);

  const base = javaSources(solDirs);
  const sources = [...base, ...brokenVariants(base)];
  let diffs = 0;
  let viaService = 0;
  let compiled = 0;
  let errors = 0;
  let retried = 0;
  const only = argv.includes("--only") ? (argv[argv.indexOf("--only") + 1] ?? "").split(",") : [];
  for (const [index, source] of sources.entries()) {
    if (only.length > 0 && !only.some((part) => source.name === part)) continue;
    // The per-submission container: the runner's own compile, unchanged.
    const ws = await createWorkspace("abjavac-");
    const specs = specsFor(profile, ws, { build: `ptcn-judge-abjavac-${String(process.pid)}-${String(index)}-build`, run: "unused" });
    await writeFile(path.join(ws.sourceDir, variant.sourceFile), source.code, "utf8");
    await writeFile(path.join(ws.inputDir, "compile.sh"), `${variant.compileCommand}\n`, "utf8");
    if (specs.compile === null) throw new Error("no compile spec");
    const container = await runInContainer({ ...specs.compile, containerKillMs: runtime.compileTimeoutMs, outputCapBytes: 256 * 1024 });
    const containerStatus = container.exitCode;
    const containerMessage = container.stderr.trim() || "Compilation failed";
    const containerClasses = containerStatus === 0 ? classDigest(ws.buildDir) : "";

    const target = await mkdtemp(path.join(SCRATCH_ROOT, "abjavac-svc-"));
    let svc = await service.compile(source.code, args, runtime.compileTimeoutMs, target);
    if (svc === null) {
      // No answer is not a wrong answer: the judge would compile this submission in its own
      // container. But a lane that was killed underneath us (anything on this host that sweeps
      // `ptcn-judge-` containers does that) restarts in a second, so ask once more and compare
      // whatever it says. A second silence is reported.
      for (let wait = 0; wait < 50 && service.stats().ready === 0; wait += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      retried += 1;
      svc = await service.compile(source.code, args, runtime.compileTimeoutMs, target);
    }
    const problems: string[] = [];
    if (svc === null) {
      problems.push("service gave no answer");
    } else {
      viaService += 1;
      if (svc.status !== (containerStatus === 0 ? 0 : 1)) problems.push(`status ${String(svc.status)} vs ${String(containerStatus)}`);
      const svcMessage = svc.stderr.trim() || "Compilation failed";
      if (containerStatus !== 0 && svcMessage !== containerMessage) {
        problems.push(`message differs:\n--- container\n${containerMessage}\n--- service\n${svcMessage}`);
      }
      if (containerStatus === 0 && classDigest(target) !== containerClasses) problems.push("class files differ");
    }
    if (containerStatus === 0) compiled += 1;
    else errors += 1;
    diffs += problems.length;
    console.log(`${problems.length === 0 ? "same" : "DIFF"} ${source.name} ${containerStatus === 0 ? "compiled" : "CE"}`);
    for (const p of problems) console.log(`       ${p}`);
    await rm(target, { recursive: true, force: true });
    await removeWorkspace(ws.root);
  }
  await service.close();
  await sweepJudgeContainers();
  console.log(
    `\nA/B javac: ${String(compiled + errors)} sources (${String(compiled)} compiled, ${String(errors)} CE), ` +
      `${String(viaService)} answered by the service (${String(retried)} on a second ask), ${String(diffs)} differences`,
  );
  process.exit(diffs === 0 && viaService === compiled + errors ? 0 : 1);
}

void main();
