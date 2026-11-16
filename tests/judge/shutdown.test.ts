import { spawn } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isDockerAvailable } from "@/worker/docker";

/**
 * A worker shutdown must never produce a verdict.
 *
 * Measured before the fix: a SIGTERM to the worker's process group reached the `docker` clients it
 * had spawned, each client forwarded it into its container, and the harness JVM died mid-test. The
 * judge then read what was left as results — one trial recorded a TLE submission as RE.
 *
 * Here a judge process that drains on SIGTERM, as the worker does, has its whole process group
 * signalled every five seconds from inside its first test until it exits, through the harness
 * test and the per-process tests after it, where the measured RE came from. Every
 * test has to come back exactly as it does with no signal, down to which path ran it: the first
 * test in the harness, and — because a spinning thread cannot be stopped inside a JVM — the rest
 * as fresh processes. Measured before the fix, the first test was lost from the harness too
 * (modes process, process, process), which is the signal reaching the sandbox.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE = "java-tle-spin";
const RUN_CONTAINER = `ptcn-judge-signal-${FIXTURE}-run-1`;

async function containerRunning(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["ps", "--filter", `name=^${name}$`, "--filter", "status=running", "-q"]);
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("close", () => resolve(out.trim().length > 0));
    child.on("error", () => resolve(false));
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("worker shutdown mid-judge", () => {
  it("a SIGTERM to the worker's process group leaves a running Java harness untouched", async () => {
    expect(await isDockerAvailable()).toBe(true);

    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(ROOT, "tests/judge/helpers/judge-under-signal.ts"), FIXTURE],
      // Its own process group, so the group signal below reaches it and everything it spawned
      // that stayed in its group, and nothing of this test runner's.
      { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
    const pid = child.pid;
    if (pid === undefined) throw new Error("judge process did not start");

    // Into the first test: the run container is up and the JVM has had time to start.
    const deadline = Date.now() + 120_000;
    while (!(await containerRunning(RUN_CONTAINER))) {
      if (Date.now() > deadline) throw new Error(`run container never started\n${stderr}`);
      await sleep(250);
    }
    await sleep(3_000);
    let done = false;
    const signalling = (async () => {
      while (!done) {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          return; // the group has exited
        }
        await sleep(5_000);
      }
    })();

    const code = await exited;
    done = true;
    await signalling;
    expect(code).toBe(0);
    const result = JSON.parse(stdout.trim()) as {
      verdict: string;
      tests: { verdict: string; runtimeMs: number | null }[];
      modes: string[];
      signals: string[];
    };
    // Into the harness test, and through both per-process tests after it (16 s each).
    expect(result.signals.length).toBeGreaterThanOrEqual(6);
    expect(new Set(result.signals)).toEqual(new Set(["SIGTERM"]));
    expect(result.verdict).toBe("TLE");
    expect(result.tests.map((t) => t.verdict)).toEqual(["TLE", "TLE", "TLE"]);
    expect(result.modes).toEqual(["harness", "process", "process"]);
    expect(stderr).not.toContain("judge.container_lost");
  });

  it("a run container removed from outside mid-judge is IE, never a verdict", async () => {
    // What a sweep from another process on the same daemon did to in-flight containers: before
    // the fix, the wreckage was read as RE.
    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(ROOT, "tests/judge/helpers/judge-under-signal.ts"), FIXTURE],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => child.on("close", resolve));

    const deadline = Date.now() + 120_000;
    while (!(await containerRunning(RUN_CONTAINER))) {
      if (Date.now() > deadline) throw new Error(`run container never started\n${stderr}`);
      await sleep(250);
    }
    await sleep(3_000);
    await new Promise<void>((resolve) => {
      spawn("docker", ["rm", "-f", RUN_CONTAINER]).on("close", () => resolve());
    });

    expect(await exited).toBe(0);
    const result = JSON.parse(stdout.trim()) as { verdict: string; tests: unknown[] };
    expect(result.verdict).toBe("IE");
    expect(result.tests).toEqual([]);
    expect(stderr).toContain('"event":"judge.container_lost"');
  });
});
