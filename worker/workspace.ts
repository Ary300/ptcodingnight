import { chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { removeAsRoot } from "@/worker/docker";

/**
 * Scratch lives under the repo rather than os.tmpdir().
 *
 * On macOS `os.tmpdir()` is `/var/folders/…`, which Docker Desktop does not share by
 * default — bind-mounting it silently yields an empty directory inside the container and
 * every submission fails with "file not found". The project directory is under /Users,
 * which is shared out of the box.
 *
 * `JUDGE_SCRATCH_ROOT` overrides it, and a containerised worker MUST set it.
 *
 * These directories are bind-mounted into each judge container by the HOST daemon, which
 * resolves the path in the host's namespace. A worker running inside a container therefore
 * hands over a path that means something different — or nothing — on the other side, and the
 * judge container gets an empty mount with no error anywhere. `docker-compose.prod.yml` mounts
 * one host directory at the identical path inside the worker so the two namespaces agree.
 */
export const SCRATCH_ROOT =
  process.env.JUDGE_SCRATCH_ROOT ?? path.join(process.cwd(), ".judge-tmp");

/** One submission's directories: the source, the build output, the inputs and the results. */
export interface Workspace {
  readonly root: string;
  readonly sourceDir: string;
  readonly buildDir: string;
  readonly inputDir: string;
  readonly resultDir: string;
}

/**
 * A fresh workspace under the scratch root. `prefix` names it in the directory listing only:
 * `job-` for one made when a submission arrives, `pool-` for one made ahead of time with its
 * containers (worker/container-pool.ts). Both are made by this function and nothing else, so a
 * pooled container's mounts are exactly the ones an on-demand container would get.
 */
export async function createWorkspace(prefix: string): Promise<Workspace> {
  await mkdir(SCRATCH_ROOT, { recursive: true });
  const root = await mkdtemp(path.join(SCRATCH_ROOT, prefix));

  /**
   * Make the workspace traversable and the RESULT directory writable by the container's uid.
   *
   * `mkdtemp` creates 0700 owned by the worker process. The judge container runs as
   * `--user=65534:65534`, so on Linux it cannot traverse that parent — the driver cannot write
   * `<n>.meta`, every test falls to the retry path, the retry fails identically, and **every
   * submission reports IE**. It is invisible on macOS only because Docker Desktop's file-sharing
   * layer rewrites ownership (SECURITY.md A6).
   *
   * Narrow on purpose. `0o711` on the workspace grants traverse and NOT read, so the container
   * cannot list its siblings; only the results directory below is made writable. The field fix
   * somebody reaches for at 6pm — `chmod 777`, or dropping `--user` — would widen the source and
   * build mounts too and make both the timing-forgery and disk-fill classes strictly worse.
   */
  await chmod(root, 0o711);
  const ws: Workspace = {
    root,
    sourceDir: path.join(root, "src"),
    buildDir: path.join(root, "build"),
    inputDir: path.join(root, "in"),
    resultDir: path.join(root, "res"),
  };
  await mkdir(ws.sourceDir, { recursive: true });
  await mkdir(ws.buildDir, { recursive: true });
  await mkdir(ws.inputDir, { recursive: true });
  await mkdir(ws.resultDir, { recursive: true });
  /**
   * The two directories a container is given write access to, and no others.
   *
   * ## `resultDir` — `/out` on the run container
   *
   * The batch driver writes each test's captured stdout and exit status here, as uid 65534.
   *
   * ## `buildDir` — `/build` on the COMPILE container
   *
   * **This one was missing, and it made every compiled language unjudgeable on real Linux.**
   *
   * The comment that used to sit here said `buildDir` "stays at their default mode and is
   * mounted read-only". That is true of the RUN container, which mounts it via `readonlyDir` so
   * a submission cannot rewrite the binary it is executing between tests. It was never true of
   * the compile container, which mounts the same directory via `writableBuildDir` precisely so
   * the compiler can emit its artifact — into a directory `mkdir` had left owned by the worker
   * at mode 0755, while the container runs as `--user=65534:65534`.
   *
   * So the compiler could traverse and not write:
   *
   *     /usr/bin/ld: cannot open output file /build/prog: Permission denied
   *
   * reported to the student as **CE on correct code**, for jdk21, gcc14 and go123 — every
   * runtime that emits a binary. python312 and node22 passed throughout, because their compile
   * step writes nothing (`python -c compile(...)`, `node --check`), which is exactly why the
   * failure looked language-specific rather than structural.
   *
   * Invisible on Docker Desktop, which rewrites file ownership across its VM boundary
   * (SECURITY.md A6). It appears the moment the judge runs on real Linux — which is every
   * deployment that matters, and none of the machines any gate had ever run on.
   *
   * Still narrow: the workspace above stays 0711 so a container cannot list its siblings, and
   * `sourceDir` and `inputDir` keep their default mode and are mounted read-only. Widening
   * those is what makes the timing-forgery (H2) and hidden-input (H3) classes worse.
   */
  await chmod(ws.resultDir, 0o777);
  await chmod(ws.buildDir, 0o777);
  return ws;
}

/**
 * Remove a job workspace, including anything the container left behind that the worker cannot
 * unlink.
 *
 * `rm -rf` runs as the worker. A container running as uid 65534 can create directories inside the
 * writable mounts, and it creates them with ITS umask and ITS ownership — so the worker ends up
 * unable to write to a directory it needs to empty:
 *
 *     EACCES: permission denied, unlink '.../job-WyNUey/res/hidden/0'
 *
 * A failed cleanup is not cosmetic. Scratch accumulates on a box that also runs Postgres, and a
 * full disk stops the database accepting writes — which takes the contest down rather than one
 * submission.
 *
 * The fallback asks the daemon to delete the tree from a throwaway container running as root.
 * That is the same daemon that created the files, it touches only this job's directory, and it is
 * reached only when the ordinary removal has already failed.
 */
export async function removeWorkspace(workspace: string): Promise<void> {
  try {
    await rm(workspace, { recursive: true, force: true });
    return;
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "judge.workspace.cleanup_fallback",
        workspace,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  const removed = await removeAsRoot(workspace);
  if (!removed) {
    // Reported, never thrown: a workspace that will not delete must not fail a submission that
    // has already been judged.
    console.error(
      JSON.stringify({
        level: "error",
        event: "judge.workspace.leaked",
        workspace,
        detail: "scratch could not be removed; disk will accumulate",
      }),
    );
  }
}

/**
 * Remove every workspace a previous worker left under the scratch root with this prefix. A pooled
 * slot's workspace outlives no worker: its containers are swept by prefix at start, so its
 * directories go too.
 */
export async function removeStaleWorkspaces(prefix: string): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(SCRATCH_ROOT);
  } catch {
    return 0;
  }
  const stale = entries.filter((name) => name.startsWith(prefix));
  for (const name of stale) await removeWorkspace(path.join(SCRATCH_ROOT, name));
  return stale.length;
}
