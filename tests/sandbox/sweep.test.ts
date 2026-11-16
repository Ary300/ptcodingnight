import { execFileSync } from "node:child_process";

import { afterAll, describe, expect, it } from "vitest";

import {
  INSTANCE_LABEL,
  judgeInstance,
  sweepAbandonedJudgeContainers,
  sweepJudgeContainers,
} from "@/worker/docker";

/**
 * A sweep removes only its own instance's containers.
 *
 * The boot sweep used to remove every `ptcn-judge-` container on the daemon, so a worker starting
 * up — or any gate from another checkout on the same machine — removed other workers' in-flight
 * containers. On the shared Mac one sweep removed 70. Plain `alpine:3` containers stand in for a
 * judge's here: what is tested is which names a sweep picks, not what runs in them.
 */

const tag = String(process.pid);
const own = `ptcn-judge-sweeptest-own-${tag}`;
const foreignRunning = `ptcn-judge-sweeptest-foreign-run-${tag}`;
const foreignCreated = `ptcn-judge-sweeptest-foreign-created-${tag}`;
const foreignExited = `ptcn-judge-sweeptest-foreign-exited-${tag}`;
const OTHER = `${INSTANCE_LABEL}=another-worker-${tag}`;

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

function exists(name: string): boolean {
  return docker("ps", "-a", "--filter", `name=^${name}$`, "-q").length > 0;
}

describe("judge container sweeps", () => {
  afterAll(() => {
    for (const name of [own, foreignRunning, foreignCreated, foreignExited]) {
      execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
    }
  });

  it("removes this instance's containers and leaves another instance's running one alone", async () => {
    docker("run", "-d", "--network=none", `--name=${own}`, `--label=${INSTANCE_LABEL}=${judgeInstance()}`, "alpine:3", "sleep", "300");
    docker("run", "-d", "--network=none", `--name=${foreignRunning}`, `--label=${OTHER}`, "alpine:3", "sleep", "300");

    await sweepJudgeContainers();

    expect(exists(own)).toBe(false);
    expect(exists(foreignRunning)).toBe(true);
  }, 120_000);

  it("removes another instance's container only once it has exited, never a created one", async () => {
    docker("create", "--network=none", `--name=${foreignCreated}`, `--label=${OTHER}`, "alpine:3", "true");
    docker("run", "--network=none", `--name=${foreignExited}`, `--label=${OTHER}`, "alpine:3", "true");

    // The age threshold is ten minutes in the worker; zero here, so "exited" is the only condition.
    await sweepAbandonedJudgeContainers(0);

    expect(exists(foreignExited)).toBe(false);
    expect(exists(foreignCreated)).toBe(true);
    expect(exists(foreignRunning)).toBe(true);

    // And with the worker's own threshold, an exit from seconds ago is not abandoned yet.
    docker("run", "--network=none", `--name=${foreignExited}`, `--label=${OTHER}`, "alpine:3", "true");
    await sweepAbandonedJudgeContainers();
    expect(exists(foreignExited)).toBe(true);
  }, 120_000);
});
