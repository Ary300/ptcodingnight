import { describe, expect, it } from "vitest";

import type { ContainerSpec } from "@/worker/docker";
import { ContainerPool, type PoolOps } from "@/worker/container-pool";
import { RUN_ARGV, specsFor, startScript, type SlotProfile } from "@/worker/slot-profile";
import type { Workspace } from "@/worker/workspace";

const LIMITS = {
  memoryLimitMb: 256,
  cpus: 1,
  pidsLimit: 64,
  tmpfsBytes: 69206016,
  wallClockKillMs: 0,
  fsizeBytes: 69206016,
};

const JAVA: SlotProfile = {
  image: "ptcn-jdk:21",
  compile: { argv: ["timeout", "-k", "1", "60", "/bin/sh", "/in/compile.sh"], limits: { ...LIMITS, memoryLimitMb: 1024 } },
  run: { limits: LIMITS, mountsBuild: true },
};
const PYTHON: SlotProfile = { image: "python:3.12-slim", compile: null, run: { limits: LIMITS, mountsBuild: false } };

function fakeDocker() {
  const containers = new Set<string>();
  const workspaces = new Set<string>();
  const created: ContainerSpec[] = [];
  const removed: string[] = [];
  let n = 0;
  let failCreate = false;
  const ops: PoolOps = {
    createContainer: (spec) => {
      if (failCreate) return Promise.resolve(false);
      containers.add(spec.name);
      created.push(spec);
      return Promise.resolve(true);
    },
    removeContainer: (name) => {
      containers.delete(name);
      removed.push(name);
      return Promise.resolve();
    },
    createWorkspace: (prefix) => {
      n += 1;
      const root = `/scratch/${prefix}${String(n)}`;
      workspaces.add(root);
      const ws: Workspace = {
        root,
        sourceDir: `${root}/src`,
        buildDir: `${root}/build`,
        inputDir: `${root}/in`,
        resultDir: `${root}/res`,
      };
      return Promise.resolve(ws);
    },
    removeWorkspace: (root) => {
      workspaces.delete(root);
      return Promise.resolve();
    },
  };
  return { ops, containers, workspaces, created, removed, fail: (v: boolean) => { failCreate = v; } };
}

describe("ContainerPool", () => {
  it("hands a slot to exactly one submission and never back", async () => {
    const docker = fakeDocker();
    const pool = new ContainerPool({ target: 4, removalBacklog: 100, isBusy: () => false }, docker.ops);
    await pool.prefill(JAVA, 2);
    const a = pool.take(JAVA);
    const b = pool.take(JAVA);
    const c = pool.take(JAVA);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).toBeNull();
    expect(a?.names.run).not.toBe(b?.names.run);
    expect(a?.workspace.root).not.toBe(b?.workspace.root);
  });

  it("creates each container from the same specs an on-demand run uses", async () => {
    const docker = fakeDocker();
    const pool = new ContainerPool({ target: 4, removalBacklog: 100, isBusy: () => false }, docker.ops);
    await pool.prefill(JAVA, 1);
    const slot = pool.take(JAVA);
    expect(slot).not.toBeNull();
    if (slot === null) return;
    const expected = specsFor(JAVA, slot.workspace, slot.names);
    expect(docker.created).toEqual([expected.compile, expected.run]);
    expect(expected.run.argv).toEqual(RUN_ARGV);
    expect(expected.run.readonlyDir).toBe(slot.workspace.buildDir);
    expect(expected.compile?.writableBuildDir).toBe(slot.workspace.buildDir);
    expect(slot.names.run.startsWith("ptcn-judge-")).toBe(true);
  });

  it("keys slots by profile: a Python slot never serves Java", async () => {
    const docker = fakeDocker();
    const pool = new ContainerPool({ target: 4, removalBacklog: 100, isBusy: () => false }, docker.ops);
    await pool.prefill(PYTHON, 1);
    expect(pool.take(JAVA)).toBeNull();
    expect(pool.take({ ...PYTHON, run: { ...PYTHON.run, limits: { ...LIMITS, memoryLimitMb: 512 } } })).toBeNull();
    expect(pool.take(PYTHON)).not.toBeNull();
  });

  it("defers removal until idle, but never beyond the backlog bound", async () => {
    const docker = fakeDocker();
    let busy = true;
    const pool = new ContainerPool({ target: 0, removalBacklog: 3, isBusy: () => busy }, docker.ops);
    for (const name of ["a", "b", "c"]) pool.retire(name);
    await pool.maintain();
    expect(docker.removed).toEqual([]);
    pool.retire("d");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(docker.removed).toEqual(["a"]);
    busy = false;
    await pool.maintain();
    expect(docker.removed).toEqual(["a", "b", "c", "d"]);
    expect(pool.stats().pendingRemoval).toBe(0);
  });

  it("removes the unused containers of a slot rather than reusing them", async () => {
    const docker = fakeDocker();
    const pool = new ContainerPool({ target: 0, removalBacklog: 100, isBusy: () => false }, docker.ops);
    await pool.prefill(JAVA, 1);
    const slot = pool.take(JAVA);
    if (slot === null) throw new Error("no slot");
    pool.retire(slot.names.build ?? "");
    pool.discardUnused(slot);
    await pool.maintain();
    expect(docker.removed.sort()).toEqual([slot.names.build, slot.names.run].sort());
  });

  it("refills toward the target in proportion to demand, only while idle", async () => {
    const docker = fakeDocker();
    let busy = false;
    const pool = new ContainerPool({ target: 4, removalBacklog: 100, isBusy: () => busy }, docker.ops);
    pool.expect(JAVA, 3);
    pool.expect(PYTHON, 1);
    busy = true;
    await pool.maintain();
    expect(pool.stats().ready).toBe(0);
    busy = false;
    await pool.maintain();
    expect(pool.stats().ready).toBe(4);
    expect(pool.take(JAVA)).not.toBeNull();
    expect(pool.take(PYTHON)).not.toBeNull();
  });

  it("cleans up a slot whose creation failed, and everything on close", async () => {
    const docker = fakeDocker();
    const pool = new ContainerPool({ target: 2, removalBacklog: 100, isBusy: () => false }, docker.ops);
    docker.fail(true);
    expect(await pool.prefill(JAVA, 1)).toBe(0);
    expect(docker.workspaces.size).toBe(0);
    docker.fail(false);
    await pool.prefill(JAVA, 2);
    pool.retire("finished");
    await pool.close();
    expect(docker.containers.size).toBe(0);
    expect(docker.workspaces.size).toBe(0);
    expect(pool.stats()).toEqual({ ready: 0, pendingRemoval: 0 });
    expect(await pool.prefill(JAVA, 1)).toBe(0);
  });
});

describe("startScript", () => {
  it("exports digits only and execs the driver as PID 1", () => {
    expect(startScript({ PTCN_TESTS: "17", PTCN_TIMEOUT: "16" }, ["/bin/sh", "/in/driver.sh"])).toBe(
      "export PTCN_TESTS=17\nexport PTCN_TIMEOUT=16\nexec /bin/sh /in/driver.sh\n",
    );
    expect(() => startScript({ PTCN_TESTS: "1; rm -rf /" }, ["/bin/sh"])).toThrow();
    expect(() => startScript({ "BAD KEY": "1" }, ["/bin/sh"])).toThrow();
  });
});
