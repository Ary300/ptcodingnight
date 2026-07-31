import { spawn } from "node:child_process";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { clampCpus } from "./host";

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
  /**
   * `RLIMIT_FSIZE` — the largest SINGLE file the submission may create, in bytes.
   *
   * `--memory`, `--pids-limit`, `--cpus` and the tmpfs cap all bound a submission; none of them
   * bounds a write to a bind-mounted host directory. `/out` is mounted read-write so the driver
   * can return results, and the program runs as the same uid, so
   * `open('/out/x','w').write('A' * 10**10)` consumed host disk (T4). On a shared cloud box that
   * takes down the web app, the database and the queue as well as the judge.
   *
   * Sized from the tmpfs, deliberately: a program could never write a file larger than the tmpfs
   * would hold anyway, so a cap at that size cannot fail anything that used to succeed. Sizing it
   * from the *expected output* instead would be tighter and wrong — `cut-the-sticks` legitimately
   * writes 1.29 MB, and a cap set below a legitimate write reports `WA` on correct code, which is
   * a mistake this project has already shipped once.
   *
   * Bounds one file, not the total. `outputDirBudgetBytes` is the other half.
   */
  readonly fsizeBytes: number;
}

export interface ContainerRunOptions {
  readonly image: string;
  /** Command and arguments to run inside the container. */
  readonly argv: readonly string[];
  /** Host directory mounted read-only at /work. Holds the submission source. */
  readonly sourceDir: string;
  /**
   * Optional host directory mounted read-write at /out.
   *
   * Two callers: the Java compile step, which has to put .class files somewhere, and the
   * batch driver, which writes each test's captured stdout and exit status there.
   *
   * Untrusted code CAN write here, and that is acceptable because of what is *not* here:
   * expected outputs are never mounted into a container, so a submission cannot discover the
   * right answer and cannot forge a pass. It can scribble on its own results, and the driver
   * overwrites each file after the test it belongs to actually runs.
   */
  readonly outputDir?: string;
  /**
   * Optional host directory mounted read-only at /in. Carries the test inputs and the batch
   * driver script. Read-only so a submission cannot rewrite a later test's input.
   */
  readonly inputDir?: string;
  /**
   * Optional host directory mounted READ-ONLY at /build. Carries compiled artifacts from the
   * build container into the run container.
   *
   * Read-only on purpose: a submission must not be able to rewrite the binary it is executing
   * between test cases.
   */
  readonly readonlyDir?: string;
  /**
   * Optional host directory mounted READ-WRITE at /build. Only the build container gets this;
   * the run container receives the same directory via `readonlyDir` so a submission cannot
   * rewrite the binary it is executing.
   */
  readonly writableBuildDir?: string;
  readonly stdin?: string;
  readonly limits: ContainerLimits;
  readonly name: string;
  /**
   * Bytes of stdout to capture before treating the submission as a flood and killing it.
   * Defaults to the floor; callers that know the expected output size should pass a cap
   * derived from it.
   */
  readonly outputCapBytes?: number;
  /** Extra environment for the container. Used to parameterise the batch driver. */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Host-side backstop for the WHOLE container, before the startup allowance is added.
   *
   * Defaults to `limits.wallClockKillMs`, which is one test's limit. A container that runs
   * every test for a submission needs the sum, plus its compile — sizing this for a single
   * test killed a three-test TLE fixture partway through the third one, and the retry then
   * reported the truncated test as a runtime error.
   */
  readonly containerKillMs?: number;
  /**
   * Total bytes the submission may leave in the writable `/out` mount before the container is
   * killed. Omitted means unbounded, which is only correct where nothing untrusted runs.
   *
   * `--ulimit fsize` bounds one file; this bounds their sum. Without it,
   * `for i in range(100000): open(f'/out/{i}','w').write('A' * fsize)` still fills the disk, just
   * in more steps — and on a shared cloud box a full disk stops Postgres accepting writes, which
   * takes the contest down rather than one submission.
   */
  readonly outputDirBudgetBytes?: number;
  /**
   * How many files the submission may leave in the writable mount before it is killed.
   *
   * This is not a second opinion on `outputDirBudgetBytes` — it is what makes that check
   * *possible*. The byte total has to be measured by statting the directory's contents, and under
   * a write storm of thousands of files each poll takes longer than the poll interval. Measured:
   * against a fixture writing 1 MB files as fast as it could, **exactly one poll in 5.7 seconds
   * resolved**, by which point 8 GB was on disk. The watchdog was not wrong, it was starved.
   *
   * A `readdir` with no `stat` is cheap and cannot be starved that way, so the count is checked
   * first and the byte total is only computed for a directory small enough to stat quickly.
   *
   * The legitimate contents are known exactly — the driver writes `<n>.out`, `<n>.err` and
   * `<n>.meta` per test plus four fixed files — so this bound is generous rather than a guess.
   */
  readonly outputDirMaxFiles?: number;
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
  /**
   * The submission wrote more into `/out` than `outputDirBudgetBytes` allowed and was killed.
   *
   * Reported rather than swallowed: it is the difference between "this program has a bug" and
   * "this program tried to fill the judge host", and an organizer wants to know which.
   */
  readonly diskExceeded: boolean;
}

/**
 * Grace added to the host-side backstop timer on top of the in-container limit, to cover
 * image start. The real time limit is enforced by `timeout` inside the container.
 */
export const STARTUP_ALLOWANCE_MS = 90_000;

/**
 * How often the disk watchdog looks at the writable mount.
 *
 * This interval IS the exposure. Detection and the kill landing are not instant, so a submission
 * writing at full disk speed keeps writing for roughly one interval plus the kill latency —
 * measured at ~240 MB per container at 250 ms, and ~100 MB at this value. With four judge
 * workers that is the difference between 1 GB and 400 MB of transient host disk.
 *
 * Cheap enough to run this often only because the count check comes first: one `readdir` is
 * ~2 ms on four thousand entries, against a `stat` per file that is not.
 */
const WATCHDOG_POLL_MS = 100;

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
 * - `--ulimit fsize`      no single file may exceed the tmpfs size. The only writable path
 *                         that is NOT a tmpfs is the `/out` bind mount, and without this a
 *                         submission could write host disk until the box died (T4).
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
    /*
      Clamped to the host, and clamped HERE because this is the only place the flag is built —
      both the run path and the compile path come through `isolationArgs`, so one clamp covers
      both and a sixth runtime added later cannot miss it.

      Docker does not clamp `--cpus` itself, it refuses: "range of CPUs is from 0.01 to 2.00, as
      there are only 2 CPUs available". So a value fitted to a developer laptop (go123 compiles at
      4) does not make a two-vCPU box slow, it makes Go unjudgeable — found by deploying, because
      on a machine with enough cores the number is invisible.
    */
    `--cpus=${String(clampCpus(limits.cpus))}`,
    // Soft and hard set to the same value. Leaving the hard limit higher would let the program
    // raise its own soft limit back up, which makes the flag decorative.
    `--ulimit=fsize=${limits.fsizeBytes}:${limits.fsizeBytes}`,
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
  const { image, argv, sourceDir, outputDir, inputDir, readonlyDir, writableBuildDir, stdin,
    limits, name } = options;
  const extraEnv = options.env ?? {};
  const outputCap = options.outputCapBytes ?? OUTPUT_CAP_FLOOR_BYTES;

  const args = [
    "run",
    `--name=${name}`,
    ...isolationArgs(limits),
    "--workdir=/work",
    `--volume=${sourceDir}:/work:ro`,
    ...(outputDir === undefined ? [] : [`--volume=${outputDir}:/out:rw`]),
    ...(inputDir === undefined ? [] : [`--volume=${inputDir}:/in:ro`]),
    ...(readonlyDir === undefined ? [] : [`--volume=${readonlyDir}:/build:ro`]),
    ...(writableBuildDir === undefined ? [] : [`--volume=${writableBuildDir}:/build:rw`]),
    // The root filesystem is read-only, so anything that wants a scratch or home directory
    // must be pointed at the tmpfs. Without these, the JVM and pip fail on startup for
    // reasons that look like a broken submission.
    "--env=HOME=/tmp",
    "--env=TMPDIR=/tmp",
    "--env=PYTHONDONTWRITEBYTECODE=1",
    "--env=PYTHONUNBUFFERED=1",
    ...Object.entries(extraEnv).map(([key, value]) => `--env=${key}=${value}`),
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
    diskExceeded: boolean;
  }>((resolve) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let diskExceeded = false;
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
    }, (options.containerKillMs ?? limits.wallClockKillMs) + STARTUP_ALLOWANCE_MS);

    /**
     * The disk watchdog on the writable bind mount.
     *
     * `--ulimit fsize` stops one enormous file; nothing in the kernel stops many ordinary ones,
     * and this mount is host disk rather than a tmpfs. Polled from the host because the only
     * alternative is asking the container about itself, which a hostile submission can lie about.
     *
     * Whichever writable host directory this container has: the run container gets `/out`, the
     * build container gets `/build`. Watching only the first would leave the compile step as an
     * unbounded write path.
     */
    const watchedDir = outputDir ?? writableBuildDir;
    const watchdog =
      watchedDir === undefined || options.outputDirBudgetBytes === undefined
        ? null
        : setInterval(() => {
            void exceedsWritableBudget(watchedDir, {
              maxBytes: options.outputDirBudgetBytes ?? Number.POSITIVE_INFINITY,
              maxFiles: options.outputDirMaxFiles ?? Number.POSITIVE_INFINITY,
            }).then((exceeded) => {
              if (exceeded && !diskExceeded) {
                diskExceeded = true;
                killContainer();
              }
            });
          }, WATCHDOG_POLL_MS);

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
      if (watchdog !== null) clearInterval(watchdog);
      resolve({ stdout, stderr, code, timedOut, truncated, diskExceeded });
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
    diskExceeded: result.diskExceeded,
  };
}

/**
 * Whether a submission has written more into the writable mount than it is allowed to.
 *
 * **Count first, bytes second, and that order is the whole design.** The obvious implementation —
 * sum `stat().size` over the directory — is correct and useless: against a program creating
 * thousands of files as fast as it can, each poll's `stat` storm takes longer than the poll
 * interval, so the polls pile up unresolved. Measured against the `disk-fill-out` fixture,
 * exactly one poll in 5.7 seconds ever resolved, and 8 GB reached the host disk before it did.
 * The check was not wrong; it was starved by the thing it was watching.
 *
 * `readdir` without `stat` is one directory read regardless of how hostile the contents are. Once
 * the count is known to be small, statting those few files is trivially cheap. So the expensive
 * measurement only ever runs on a directory that is already known to be well behaved.
 *
 * One level deep, deliberately. Recursing would put the poll's cost back under the submission's
 * control — a million empty nested directories would make the watchdog the denial of service.
 *
 * Errors resolve to `false`. The directory is removed under this function's feet at the end of a
 * run, and a watchdog that crashed the judge on an expected `ENOENT` would be a worse bug than
 * the one it exists to prevent.
 */
async function exceedsWritableBudget(
  dir: string,
  limits: { readonly maxBytes: number; readonly maxFiles: number },
): Promise<boolean> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    if (entries.length > limits.maxFiles) return true;

    let total = 0;
    for (const entry of entries) {
      /**
       * A directory here is hostile by definition, and treating it as 0 bytes defeated both
       * halves of this check at once.
       *
       * The count is per top-level ENTRY and the size sum only added `isFile()` entries, so
       * `os.mkdir('/out/d')` followed by writing inside it presents ONE entry contributing ZERO
       * bytes — under both limits, forever. `--ulimit fsize` still caps each individual file,
       * but nothing capped how many there were.
       *
       * Refusing rather than recursing is deliberate: recursing would put the poll's cost back
       * under the submission's control, which is the starvation this check was rewritten to
       * avoid. The batch driver never creates a subdirectory in its output, so there is no
       * legitimate case to preserve.
       */
      if (entry.isDirectory()) return true;

      try {
        const info = await stat(path.join(dir, entry.name));
        if (info.isFile()) total += info.size;
      } catch {
        // Raced with the driver rewriting it. Skipping is right: the next poll sees it.
      }
      if (total > limits.maxBytes) return true;
    }
    return false;
  } catch {
    return false;
  }
}


/**
 * Delete a host directory tree from a throwaway container running as root.
 *
 * The escape hatch for scratch the worker cannot remove itself: a judge container runs as uid
 * 65534 and creates its own subdirectories inside the writable mounts, leaving directories the
 * worker has no write permission on. The daemon that created them can remove them.
 *
 * Deliberately narrow. It mounts ONE directory, deletes that directory's contents, and takes no
 * argument that a submission can influence — the path is composed by the worker from its own
 * scratch root and a `mkdtemp` suffix.
 */
export async function removeAsRoot(directory: string): Promise<boolean> {
  const { code } = await runDocker([
    "run",
    "--rm",
    "--network=none",
    "--user=0:0",
    // The tree is mounted one level in, so the container deletes CONTENTS and the worker removes
    // the now-empty directory itself. A container that could unlink its own mount point would be
    // a stranger thing to reason about.
    "-v",
    `${directory}:/scratch`,
    "alpine:3",
    "sh",
    "-c",
    "rm -rf /scratch/* /scratch/.[!.]* 2>/dev/null; exit 0",
  ]);
  if (code !== 0) return false;

  try {
    await rm(directory, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
