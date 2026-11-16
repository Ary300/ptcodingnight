import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { runInContainer } from "@/worker/docker";
import { SCRATCH_ROOT } from "@/worker/workspace";

/**
 * A failure of the container step that is not the program speaking is the judge's, and is
 * reported as such — never as the program's output.
 *
 * Measured before the fix: a container-name conflict made `docker run` fail before our container
 * existed, its client printed "docker: Error response from daemon: Conflict…", and that text
 * reached a student as compiler output under CE.
 */

const occupied = `ptcn-judge-infratest-${String(process.pid)}`;
const limits = {
  memoryLimitMb: 64,
  cpus: 1,
  pidsLimit: 16,
  tmpfsBytes: 1024 * 1024,
  wallClockKillMs: 10_000,
  fsizeBytes: 1024 * 1024,
};

describe("container step failures", () => {
  afterAll(() => {
    execFileSync("docker", ["rm", "-f", occupied], { stdio: "ignore" });
  });

  it("a name already taken is an infrastructure failure, and the other container is left alone", async () => {
    execFileSync("docker", ["run", "-d", "--network=none", `--name=${occupied}`, "alpine:3", "sleep", "300"]);
    await mkdir(SCRATCH_ROOT, { recursive: true });
    const sourceDir = await mkdtemp(path.join(SCRATCH_ROOT, "infratest-"));
    try {
      const result = await runInContainer({
        image: "alpine:3",
        argv: ["sh", "-c", "echo hello"],
        sourceDir,
        limits,
        name: occupied,
      });
      expect(result.infrastructureFailure).toBe(true);
      // The client's complaint is in stderr, which is exactly why it must not be read as output.
      expect(result.stderr).toMatch(/Conflict|already in use/);
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
    }
    const stillThere = execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", occupied], {
      encoding: "utf8",
    }).trim();
    expect(stillThere).toBe("true");
  }, 120_000);

  it("a container that runs to its own exit is not one", async () => {
    await mkdir(SCRATCH_ROOT, { recursive: true });
    const sourceDir = await mkdtemp(path.join(SCRATCH_ROOT, "infratest-"));
    try {
      const result = await runInContainer({
        image: "alpine:3",
        argv: ["sh", "-c", "echo hello; exit 3"],
        sourceDir,
        limits,
        name: `${occupied}-own`,
      });
      expect(result.infrastructureFailure).toBe(false);
      expect(result.exitCode).toBe(3);
      expect(result.stdout.trim()).toBe("hello");
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
    }
  }, 120_000);
});
