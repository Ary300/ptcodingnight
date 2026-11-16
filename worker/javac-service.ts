import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Runtime } from "@/lib/judge/runtimes";
import { CONTAINER_PREFIX, isolationArgs, OUTPUT_CAP_FLOOR_BYTES, removeContainer } from "@/worker/docker";
import { SCRATCH_ROOT } from "@/worker/workspace";

/**
 * Warm Java compilation: a few long-lived, locked-down containers, each running ONE JVM that
 * compiles submission after submission through javac's own entry point (worker/javac-service).
 *
 * The per-submission compile container paid a container start and a cold `javac` — a JVM start
 * plus javac's own class loading and warm-up — for every Java submission. Here both are paid once
 * per lane, when the worker starts.
 *
 * What is the same as the per-submission container, by construction:
 *   - javac, its arguments (read from the registry's compile command, `-J` launcher options
 *     aside), the source path `/work/Main.java` in an otherwise empty `/work`, the output
 *     directory `/build`, and the working directory. So the class files, the messages — paths and
 *     line numbers included — and the exit status are javac's own. scripts/ab-javac-service.ts
 *     proves byte-identical classes and identical messages against the per-submission container.
 *   - The isolation flags: `isolationArgs` at the runtime's COMPILE limits — no network, read-only
 *     rootfs, non-root, no capabilities, no-new-privileges, pids/memory/cpus/tmpfs/fsize caps.
 *     `/work` and `/build` are this container's own tmpfs, emptied before every compile.
 *   - No test data is ever mounted: the only host directory is the lane's exchange directory, which
 *     holds the source on the way in and the class files and messages on the way out.
 *   - No student code runs: `-proc:none` is required by the service, and options come only from
 *     the registry.
 *
 * What falls back to the per-submission container, so it costs what it always did and no verdict
 * can depend on the service: a timeout at the registry's compile timeout, a javac status other than
 * 0 or 1 (javac's own "system error" and "abnormal" codes, which include running out of memory), a
 * crashed or unready lane, every lane busy. A lane that times out or ends abnormally is killed and
 * restarted.
 */

export interface JavacServiceOptions {
  readonly lanes: number;
  readonly image: string;
  readonly runtime: Runtime;
  /** JVM options for the service JVM. They tune how fast javac runs, never what it emits. */
  readonly jvmFlags?: readonly string[];
}

export interface ServiceCompile {
  /** javac's exit status: 0 compiled, 1 compile errors. */
  readonly status: 0 | 1;
  /** Everything javac printed, as the per-submission container's stderr would hold it. */
  readonly stderr: string;
  /** Wall time of the compile inside the service. */
  readonly durationMs: number;
}

interface Pending {
  readonly id: string;
  readonly resolve: (status: number | null) => void;
}

interface Lane {
  readonly index: number;
  readonly name: string;
  readonly dir: string;
  child: ChildProcessWithoutNullStreams | null;
  ready: boolean;
  busy: boolean;
  pending: Pending | null;
  buffered: string;
  failedStarts: number;
}

/**
 * The service JVM's options. They change how fast javac runs, never what it emits.
 *
 * C1 only, as the per-submission `javac` already runs (`JAVAC_FLAGS` in lib/judge/runtimes.ts).
 * Measured on this Mac, in-container CPU per compile after 63 warm-up compiles: 45 ms C1-only
 * against 126 ms with C2 — C2 keeps recompiling javac's hot paths and never stops paying for it —
 * and a much cheaper warm-up (first three compiles 747/452/180 ms against 1560/750/408 ms). The
 * per-submission container's cold javac measures ~340 ms.
 */
export const JAVAC_SERVICE_JVM_FLAGS: readonly string[] = [
  "-XX:TieredStopAtLevel=1",
  "-XX:+UseSerialGC",
  "-XX:-UsePerfData",
];

/** Compiles run on each lane at start, before any submission, so the first ones are not cold. */
const WARM_UP_COMPILES = 8;

/**
 * What the warm-up compiles: the kind of program contest submissions are, touching the JDK
 * classes they touch, so javac's own paths for them are compiled before the first submission.
 * Trusted text of ours; its class files are thrown away.
 */
const WARM_UP_SOURCE = `import java.io.*;
import java.util.*;
import java.util.stream.*;

public class Main {
  record Pair(int a, long b) {}

  static long gcd(long a, long b) { return b == 0 ? a : gcd(b, a % b); }

  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringTokenizer tok = new StringTokenizer(in.readLine());
    int n = Integer.parseInt(tok.nextToken());
    Scanner sc = new Scanner(System.in);
    List<Integer> list = new ArrayList<>();
    Map<String, Integer> counts = new HashMap<>();
    TreeMap<Integer, Long> tree = new TreeMap<>();
    PriorityQueue<Pair> pq = new PriorityQueue<>(Comparator.comparingLong(Pair::b));
    Deque<int[]> dq = new ArrayDeque<>();
    for (int i = 0; i < n; i++) {
      list.add(i);
      counts.merge("k" + (i % 3), 1, Integer::sum);
      tree.put(i, (long) i * i);
      pq.add(new Pair(i, gcd(i, 12)));
      dq.add(new int[] {i, i + 1});
    }
    Collections.sort(list, Collections.reverseOrder());
    long sum = list.stream().mapToLong(Integer::longValue).sum();
    String joined = counts.entrySet().stream().map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining(","));
    int[] arr = new int[n];
    Arrays.fill(arr, 7);
    Arrays.sort(arr);
    char[] cs = joined.toCharArray();
    StringBuilder sb = new StringBuilder();
    switch (cs.length % 3) {
      case 0 -> sb.append("zero");
      case 1 -> sb.append("one");
      default -> sb.append(String.format("%.2f", Math.sqrt(sum)));
    }
    PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));
    out.println(sb + " " + sum + " " + tree.firstKey() + " " + (pq.isEmpty() ? 0 : pq.poll().a()) + " " + dq.size() + " " + sc.hasNext());
    out.flush();
  }
}
`;

/** Lanes that die before saying `ready` this many times in a row stay down. */
const MAX_FAILED_STARTS = 3;
const RESTART_DELAY_MS = 1_000;

/**
 * The javac arguments from a registry compile command: everything after `javac`, without the
 * launcher's `-J` options (which tune the JVM running javac, never its output).
 */
export function javacArguments(compileCommand: string): string[] {
  const words = compileCommand.trim().split(/\s+/);
  if (words[0] !== "javac") throw new Error(`not a javac command: ${compileCommand}`);
  return words.slice(1).filter((word) => !word.startsWith("-J"));
}

export class JavacService {
  private readonly lanes: Lane[];
  private closed = false;

  constructor(private readonly options: JavacServiceOptions) {
    const root = path.join(SCRATCH_ROOT, "javac");
    this.lanes = Array.from({ length: Math.max(0, options.lanes) }, (_, index) => ({
      index,
      name: `${CONTAINER_PREFIX}javac-${String(process.pid)}-${String(index)}`,
      dir: path.join(root, `lane-${String(index)}`),
      child: null,
      ready: false,
      busy: false,
      pending: null,
      buffered: "",
      failedStarts: 0,
    }));
  }

  /** Start every lane; resolves once each has said `ready` or given up. */
  async start(): Promise<number> {
    await Promise.all(this.lanes.map((lane) => this.startLane(lane)));
    return this.lanes.filter((lane) => lane.ready).length;
  }

  /**
   * Compile a contest-shaped program a few times on every ready lane, so the first submissions
   * meet a warm javac. Idle-time work for the worker's start; the class files are discarded.
   */
  async warmUp(compileCommand: string, timeoutMs: number): Promise<void> {
    const args = javacArguments(compileCommand);
    const scratch = path.join(SCRATCH_ROOT, "javac", "warm-up");
    for (let round = 0; round < WARM_UP_COMPILES; round += 1) {
      await Promise.all(
        this.lanes.map(async (_, index) => {
          const target = path.join(scratch, `${String(index)}-${String(round)}`);
          await mkdir(target, { recursive: true });
          await this.compile(WARM_UP_SOURCE, args, timeoutMs, target);
          await rm(target, { recursive: true, force: true });
        }),
      );
    }
  }

  /**
   * Compile one submission, writing its class files into `targetBuildDir`. Null means the service
   * could not give javac's answer for it — the caller compiles it in a fresh container instead.
   */
  async compile(
    source: string,
    javacArgs: readonly string[],
    timeoutMs: number,
    targetBuildDir: string,
  ): Promise<ServiceCompile | null> {
    const lane = this.lanes.find((candidate) => candidate.ready && !candidate.busy);
    if (lane?.child == null) return null;
    lane.busy = true;
    const id = `j${randomBytes(8).toString("hex")}`;
    const jobDir = path.join(lane.dir, id);
    try {
      await mkdir(path.join(jobDir, "build"), { recursive: true });
      await chmod(jobDir, 0o777);
      await chmod(path.join(jobDir, "build"), 0o777);
      await writeFile(path.join(jobDir, "Main.java"), source, "utf8");

      const started = performance.now();
      const status = await this.request(lane, id, javacArgs, timeoutMs);
      const durationMs = performance.now() - started;
      if (status !== 0 && status !== 1) {
        if (status !== null) this.restart(lane);
        return null;
      }
      const raw = await readFile(path.join(jobDir, "stderr"), "utf8");
      // The per-submission container's stderr was captured up to this bound.
      const stderr = raw.length > OUTPUT_CAP_FLOOR_BYTES ? raw.slice(0, OUTPUT_CAP_FLOOR_BYTES) : raw;
      if (status === 0) await cp(path.join(jobDir, "build"), targetBuildDir, { recursive: true });
      return { status, stderr, durationMs };
    } catch {
      this.restart(lane);
      return null;
    } finally {
      await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
      lane.busy = false;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const lane of this.lanes) {
      lane.ready = false;
      lane.child?.stdin.end();
      await removeContainer(lane.name);
    }
  }

  stats(): { readonly ready: number; readonly busy: number } {
    return {
      ready: this.lanes.filter((lane) => lane.ready).length,
      busy: this.lanes.filter((lane) => lane.busy).length,
    };
  }

  private request(lane: Lane, id: string, javacArgs: readonly string[], timeoutMs: number): Promise<number | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        lane.pending = null;
        this.restart(lane);
        resolve(null);
      }, timeoutMs);
      lane.pending = {
        id,
        resolve: (status) => {
          clearTimeout(timer);
          lane.pending = null;
          resolve(status);
        },
      };
      lane.child?.stdin.write(`compile ${id} ${javacArgs.join(" ")}\n`);
    });
  }

  private restart(lane: Lane): void {
    lane.ready = false;
    void removeContainer(lane.name);
  }

  private async startLane(lane: Lane): Promise<void> {
    if (this.closed || lane.failedStarts >= MAX_FAILED_STARTS) return;
    await rm(lane.dir, { recursive: true, force: true });
    await mkdir(lane.dir, { recursive: true });
    await chmod(lane.dir, 0o711);
    await removeContainer(lane.name);

    const runtime = this.options.runtime;
    const limits = {
      memoryLimitMb: runtime.compileMemoryLimitMb,
      cpus: runtime.compileCpus,
      pidsLimit: runtime.compilePidsLimit,
      tmpfsBytes: runtime.compileTmpfsBytes,
      wallClockKillMs: 0,
      fsizeBytes: runtime.compileTmpfsBytes,
    };
    const tmpfs = (mount: string) =>
      `--tmpfs=${mount}:rw,noexec,nosuid,mode=1777,size=${String(runtime.compileTmpfsBytes)}`;
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--interactive",
        // Signals aimed at the worker never reach a lane: not through this client's signal proxy,
        // and not through the worker's process group (`detached` below). See worker/docker.ts.
        "--sig-proxy=false",
        `--name=${lane.name}`,
        ...isolationArgs(limits),
        tmpfs("/work"),
        tmpfs("/build"),
        "--workdir=/work",
        `--volume=${lane.dir}:/jobs:rw`,
        "--env=HOME=/tmp",
        "--env=TMPDIR=/tmp",
        this.options.image,
        "java",
        ...(this.options.jvmFlags ?? JAVAC_SERVICE_JVM_FLAGS),
        "-p",
        "/opt/ptcn/javac-service.jar",
        "-m",
        "ptcn.javacsvc/ptcn.javac.Service",
      ],
      { stdio: ["pipe", "pipe", "pipe"], detached: true },
    );
    lane.child = child;
    lane.buffered = "";
    child.stdin.on("error", () => undefined);
    child.stderr.on("data", () => undefined);

    await new Promise<void>((resolveStarted) => {
      let started = false;
      const settleStart = () => {
        if (!started) {
          started = true;
          resolveStarted();
        }
      };
      const startTimer = setTimeout(() => {
        lane.failedStarts += 1;
        this.restart(lane);
        settleStart();
      }, 60_000);

      child.stdout.on("data", (chunk: Buffer) => {
        lane.buffered += chunk.toString("ascii");
        if (lane.buffered.length > 4096) lane.buffered = lane.buffered.slice(-4096);
        let newline = lane.buffered.indexOf("\n");
        while (newline >= 0) {
          const line = lane.buffered.slice(0, newline).trim();
          lane.buffered = lane.buffered.slice(newline + 1);
          if (line === "ready") {
            lane.ready = true;
            lane.failedStarts = 0;
            clearTimeout(startTimer);
            settleStart();
          } else {
            const match = /^done (\S+) (\d+)$/.exec(line);
            const pending = lane.pending;
            if (pending !== null) {
              if (match !== null && pending.id === match[1]) pending.resolve(Number(match[2]));
              else if (line.startsWith("refused") || line.startsWith("failed")) pending.resolve(null);
            }
          }
          newline = lane.buffered.indexOf("\n");
        }
      });

      child.on("close", () => {
        clearTimeout(startTimer);
        if (!lane.ready) lane.failedStarts += 1;
        lane.ready = false;
        lane.child = null;
        lane.pending?.resolve(null);
        settleStart();
        if (!this.closed) {
          setTimeout(() => void this.startLane(lane), RESTART_DELAY_MS);
        }
      });
    });
  }
}
