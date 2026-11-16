// Standalone tsx entrypoint.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * What each authored test costs the judge, in CPU: the reference solution (`reference.py`) run on
 * every test input inside the Python judge image, under the judge's isolation flags at
 * `--cpus=1`, with the container cgroup's own CPU counter read around each run.
 *
 *     npx tsx scripts/measure-test-cost.ts [--reps 3] [--json out.json] [--all] [slug ...]
 *
 * With no slugs it measures the problems a contest can deal: difficulty E or M, not `practice-*`
 * (`practiceOnly`), not `keepOutOfSets`. `--all` measures every problem.
 *
 * This is a MEASUREMENT tool, not the judge. It mounts all of a problem's inputs at once, which
 * the judge never does (hidden inputs are fed one at a time), and that is fine here because the
 * program it runs is the organizers' own reference. The number it reports per test is CPU time
 * of the whole test as the judge's driver runs it — `timeout`, `sh`, interpreter start, the
 * program — which is what a submission costs the box.
 */

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content", "problems");
const IMAGE = "python:3.12-slim";

interface Manifest {
  readonly difficulty?: string;
  readonly keepOutOfSets?: boolean;
  readonly practiceOnly?: boolean;
  readonly sampleCount?: number;
}

export interface TestCost {
  readonly test: string;
  readonly inputBytes: number;
  readonly cpuMs: number;
  readonly wallMs: number;
}

export interface ProblemCost {
  readonly slug: string;
  readonly difficulty: string;
  readonly sampleCount: number;
  readonly tests: readonly TestCost[];
  readonly totalCpuMs: number;
}

/**
 * The in-container loop. Reads `usage_usec` from the container's own cgroup v2 `cpu.stat` around
 * each run, so the figure is CPU the kernel charged, not wall time on a contended host.
 */
const LOOP = `
set -u
cpu() { while read -r k v; do [ "$k" = usage_usec ] && echo "$v" && return; done < /sys/fs/cgroup/cpu.stat; }
for f in /p/tests/*.in; do
  r=0
  while [ "$r" -lt "$REPS" ]; do
    c0=$(cpu); t0=$(date +%s%N)
    timeout -k 1 10 sh -c 'exec python -I /p/reference.py' < "$f" > /tmp/out 2>/dev/null
    t1=$(date +%s%N); c1=$(cpu)
    echo "$(basename "$f" .in) $(wc -c < "$f") $(( c1 - c0 )) $(( (t1 - t0) / 1000 ))"
    r=$(( r + 1 ))
  done
done
`;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function measureProblem(slug: string, reps: number): ProblemCost {
  const dir = path.join(CONTENT, slug);
  const manifest = JSON.parse(readFileSync(path.join(dir, "problem.json"), "utf8")) as Manifest;
  const out = execFileSync(
    "docker",
    [
      "run", "--rm", "--network=none", "--read-only",
      "--tmpfs=/tmp:rw,noexec,nosuid,size=128m", "--user=65534:65534", "--cap-drop=ALL",
      "--security-opt=no-new-privileges", "--pids-limit=64", "--memory=256m",
      "--memory-swap=256m", "--cpus=1", "--env=HOME=/tmp", "--env=PYTHONDONTWRITEBYTECODE=1",
      `--env=REPS=${String(reps)}`, `--volume=${dir}:/p:ro`, IMAGE, "sh", "-c", LOOP,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );

  const samples = new Map<string, { bytes: number; cpu: number[]; wall: number[] }>();
  for (const line of out.split("\n")) {
    const [test, bytes, cpuUs, wallUs] = line.trim().split(/\s+/);
    if (test === undefined || wallUs === undefined) continue;
    const entry = samples.get(test) ?? { bytes: Number(bytes), cpu: [], wall: [] };
    entry.cpu.push(Number(cpuUs) / 1000);
    entry.wall.push(Number(wallUs) / 1000);
    samples.set(test, entry);
  }

  const tests = [...samples.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([test, s]) => ({ test, inputBytes: s.bytes, cpuMs: median(s.cpu), wallMs: median(s.wall) }));
  return {
    slug,
    difficulty: manifest.difficulty ?? "?",
    sampleCount: manifest.sampleCount ?? 0,
    tests,
    totalCpuMs: tests.reduce((sum, t) => sum + t.cpuMs, 0),
  };
}

function dealable(slug: string): boolean {
  const file = path.join(CONTENT, slug, "problem.json");
  if (!existsSync(file)) return false;
  const m = JSON.parse(readFileSync(file, "utf8")) as Manifest;
  return (m.difficulty === "E" || m.difficulty === "M") && m.keepOutOfSets !== true && m.practiceOnly !== true;
}

function main(): void {
  const argv = process.argv.slice(2);
  let reps = 3;
  let json: string | null = null;
  let all = false;
  const slugs: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--reps") reps = Number(argv[++i] ?? "3");
    else if (arg === "--json") json = argv[++i] ?? null;
    else if (arg === "--all") all = true;
    else slugs.push(arg);
  }
  const chosen =
    slugs.length > 0
      ? slugs
      : readdirSync(CONTENT).sort().filter((slug) => all || dealable(slug));

  const results: ProblemCost[] = [];
  for (const slug of chosen) {
    const cost = measureProblem(slug, reps);
    results.push(cost);
    const top = [...cost.tests].sort((a, b) => b.cpuMs - a.cpuMs).slice(0, 3);
    console.log(
      `${slug.padEnd(42)} ${cost.difficulty} tests=${String(cost.tests.length).padStart(2)} ` +
        `cpu=${cost.totalCpuMs.toFixed(0).padStart(5)}ms  heaviest: ` +
        top.map((t) => `${t.test}=${t.cpuMs.toFixed(0)}ms/${(t.inputBytes / 1024).toFixed(0)}KB`).join(" "),
    );
  }
  if (json !== null) writeFileSync(json, JSON.stringify(results, null, 2));
}

main();
