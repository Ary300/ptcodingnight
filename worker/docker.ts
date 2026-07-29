import { spawn } from "node:child_process";

/**
 * The container boundary. Untrusted student code runs on the other side of this file and
 * nowhere else — never in the web process, never in the worker process, never in a reused
 * container (docs/PRD.md §7, CLAUDE.md).
 *
 * Every flag in `isolationArgs` is load-bearing. If a test fails because of one of them, the
 * test or the surrounding code is wrong — the flag does not get relaxed.
 */

/** Prefix on every container we create, so a leak can be found and swept. */
export const CONTAINER_PREFIX = "ptcn-judge-";

/**
 * Floor for the captured-output cap, used when the expected output size is unknown.
 *
 * A submission that floods stdout must not take the worker down with it — one hostile
 * fixture writes 1 GB (PRD §7.3). But this cap cannot be a fixed number: a *correct*
 * solution to a problem with 200 000 lines of legitimate output blows through 1 MiB and,
 * because exceeding the cap kills the container, gets reported as `WA` — indistinguishable
 * from a wrong answer. That is the single worst failure this judge can produce, and it
 * shipped undetected because every G4 fixture used a problem whose output is one line.
 *
 * The cap is therefore derived per test from the expected output size; see
 * `outputCapFor()` in worker/runner.ts.
 */
export const OUTPUT_CAP_FLOOR_BYTES = 1024 * 1024;

export interface ContainerLimits {
  readonly memoryLimitMb: number;
  readonly cpus: number;
  readonly pidsLimit: number;
  readonly tmpfsBytes: number;
  /** Hard kill, always 3x the problem time limit. */
  readonly wallClockKillMs: number;
}

export interface ContainerRunOptions {
  readonly image: string;
  /** Command and arguments to run inside the container. */
  readonly argv: readonly string[];
  /** Host directory mounted read-only at /work. Holds the submission source. */
  readonly sourceDir: string;
  /**
   * Optional host directory mounted read-write at /out. Used only by the Java compile step,
   * which has to put .class files somewhere. Never mounted for a step that runs student
   * code.
   */
  readonly outputDir?: string;
  readonly stdin?: string;
  readonly limits: ContainerLimits;
  readonly name: string;
  /**
   * Bytes of stdout to capture before treating the submission as a flood and killing it.
   * Defaults to the floor; callers that know the expected output size should pass a cap
   * derived from it.
   */
  readonly outputCapBytes?: number;
}

export interface ContainerRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly oomKilled: boolean;
  /** The host backstop fired. Should be rare — the in-container `timeout` fires first. */
  readonly timedOut: boolean;
  readonly outputTruncated: boolean;
  /**
   * Execution time of the container's main process, from the daemon's own StartedAt and
   * FinishedAt.
   *
   * NOT the duration of the `docker run` command. Container creation on this platform costs
   * anywhere from 2 to 16 seconds and varies run to run, so charging it to the submission
   * would fail every solution against a 2-second limit — measured, not assumed.
   */
  readonly durationMs: number;
  /** Wall time of the whole `docker run`, including startup. Diagnostics only. */
  readonly wallMs: number;
}

/**
 * Grace added to the host-side backstop timer on top of the in-container limit, to cover
 * image start. The real time limit is enforced by `timeout` inside the container.
 */
export const STARTUP_ALLOWANCE_MS = 90_000;

/**
 * The isolation flags, in one place so they can be audited at a glance.
 *
 * - `--network=none`      no outbound anything. Not a firewall rule — no interface at all.
 * - `--read-only`         the root filesystem is immutable; /tmp below is the only writable
 *                         path, and it is a size-capped tmpfs that dies with the container.
 * - `--tmpfs /tmp`        `noexec` so a payload cannot be written there and then run;
 *                         `nosuid` so a setuid binary cannot be staged; `size` so filling
 *                         the disk fills 16 MB of RAM instead of the host volume.
 * - `--user 65534:65534`  nobody:nogroup. Nothing runs as root inside the container.
 * - `--cap-drop=ALL`      no capabilities whatsoever, not even the default set.
 * - `no-new-privileges`   a setuid binary cannot elevate mid-execution.
 * - `--pids-limit`        a fork bomb hits a wall instead of the host's process table.
 * - `--memory`            with `--memory-swap` equal to it, so the limit cannot be dodged
 *                         by swapping. This is what turns a 10 GB allocation into an OOM
 *                         kill we can report as MLE.
 * - `--cpus`              bounded CPU share, so an infinite loop cannot starve the host.
 */
function isolationArgs(limits: ContainerLimits): string[] {
  const memory = `${limits.memoryLimitMb}m`;
  return [
    "--network=none",
    "--read-only",
    `--tmpfs=/tmp:rw,noexec,nosuid,size=${limits.tmpfsBytes}`,
    "--user=65534:65534",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    `--pids-limit=${limits.pidsLimit}`,
    `--memory=${memory}`,
    `--memory-swap=${memory}`,
    `--cpus=${limits.cpus}`,
  ];
}

function runDocker(args: readonly string[]): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn("docker", [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on("data", () => {
      // Diagnostics only; the caller decides what a non-zero exit means.
    });
    child.on("close", (code) => resolve({ stdout, code }));
    child.on("error", () => resolve({ stdout: "", code: null }));
  });
}

/** Force-remove a container, ignoring "no such container". */
export async function removeContainer(name: string): Promise<void> {
  await runDocker(["rm", "-f", name]);
}

/**
 * Remove every container this judge created. Used after a fixture run to prove the host is
 * back at baseline, and on worker startup to clear anything a previous crash left behind.
 */
export async function sweepJudgeContainers(): Promise<number> {
  const { stdout } = await runDocker([
    "ps",
    "-a",
    "--filter",
    `name=${CONTAINER_PREFIX}`,
    "--format",
    "{{.Names}}",
  ]);
  const names = stdout.split("\n").map((n) => n.trim()).filter((n) => n.length > 0);
  for (const name of names) await removeContainer(name);
  return names.length;
}

/** Whether the daemon is reachable. The judge refuses to start without it. */
export async function isDockerAvailable(): Promise<boolean> {
  const { code } = await runDocker(["ps"]);
  return code === 0;
}

/**
 * Run one container to completion.
 *
 * Deliberately does NOT pass `--rm`. We need `docker inspect` afterwards to read the
 * `OOMKilled` flag — the only reliable way to tell a memory kill (MLE) from a wall-clock
 * kill (TLE), since both surface as exit 137. Removal happens explicitly in the `finally`,
 * with `sweepJudgeContainers` as the backstop if this process dies mid-run.
 */
export async function runInContainer(options: ContainerRunOptions): Promise<ContainerRunResult> {
  const { image, argv, sourceDir, outputDir, stdin, limits, name } = options;
  const outputCap = options.outputCapBytes ?? OUTPUT_CAP_FLOOR_BYTES;

  const args = [
    "run",
    `--name=${name}`,
    ...isolationArgs(limits),
    "--workdir=/work",
    `--volume=${sourceDir}:/work:ro`,
    ...(outputDir === undefined ? [] : [`--volume=${outputDir}:/out:rw`]),
    // The root filesystem is read-only, so anything that wants a scratch or home directory
    // must be pointed at the tmpfs. Without these, the JVM and pip fail on startup for
    // reasons that look like a broken submission.
    "--env=HOME=/tmp",
    "--env=TMPDIR=/tmp",
    "--env=PYTHONDONTWRITEBYTECODE=1",
    "--env=PYTHONUNBUFFERED=1",
    "--interactive",
    image,
    ...argv,
  ];

  const startedAt = Date.now();

  const result = await new Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
    timedOut: boolean;
    truncated: boolean;
  }>((resolve) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const killContainer = () => {
      // Kill the container, not just the CLI process. Killing `docker run` alone can leave
      // the container running and detached.
      void runDocker(["kill", name]);
    };

    // Backstop only. The authoritative wall-clock kill runs as `timeout` inside the
    // container, where it measures the program rather than Docker's startup.
    const timer = setTimeout(() => {
      timedOut = true;
      killContainer();
    }, limits.wallClockKillMs + STARTUP_ALLOWANCE_MS);

    const capture = (chunk: Buffer, into: "out" | "err") => {
      const text = chunk.toString();
      if (into === "out") {
        if (stdout.length < outputCap) stdout += text;
        else if (!truncated) {
          truncated = true;
          killContainer();
        }
      } else if (stderr.length < OUTPUT_CAP_FLOOR_BYTES) {
        stderr += text;
      }
    };

    child.stdout.on("data", (c: Buffer) => capture(c, "out"));
    child.stderr.on("data", (c: Buffer) => capture(c, "err"));

    child.stdin.on("error", () => {
      // The container can exit before consuming stdin; an EPIPE here is expected, not a
      // judging failure.
    });
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();

    const settle = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, truncated });
    };

    child.on("close", settle);
    child.on("error", () => settle(null));
  });

  const wallMs = Date.now() - startedAt;

  // Inspect before removing: OOMKilled is the only reliable way to separate a memory kill
  // from a timeout, and StartedAt/FinishedAt are the only honest execution timing available.
  let oomKilled = false;
  let durationMs = wallMs;

  const inspect = await runDocker([
    "inspect",
    name,
    "--format",
    "{{.State.OOMKilled}}|{{.State.StartedAt}}|{{.State.FinishedAt}}",
  ]);

  if (inspect.code === 0) {
    const [oom, started, finished] = inspect.stdout.trim().split("|");
    oomKilled = oom === "true";

    const startedMs = Date.parse(started ?? "");
    const finishedMs = Date.parse(finished ?? "");
    if (Number.isFinite(startedMs) && Number.isFinite(finishedMs) && finishedMs >= startedMs) {
      durationMs = finishedMs - startedMs;
    }
  }

  await removeContainer(name);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.code,
    oomKilled,
    timedOut: result.timedOut,
    outputTruncated: result.truncated,
    durationMs,
    wallMs,
  };
}
