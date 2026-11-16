import type { ContainerLimits, ContainerSpec } from "@/worker/docker";
import type { Workspace } from "@/worker/workspace";

/**
 * Everything about a submission's containers that is decided when they are CREATED, and nothing
 * that is decided per submission.
 *
 * Two submissions with equal profiles get containers that `docker create` cannot tell apart:
 * same image, same command, same isolation flags, same mount points. That is what lets a container
 * be made before its submission arrives (worker/container-pool.ts) and be exactly the container
 * an on-demand run would have made. Everything per-submission — the source, the scripts, the
 * test count and time limit — reaches the container through files in its workspace, never through
 * its creation arguments.
 */
export interface SlotProfile {
  readonly image: string;
  /** The build container, for a runtime that emits artifacts; null otherwise. */
  readonly compile: { readonly argv: readonly string[]; readonly limits: ContainerLimits } | null;
  readonly run: { readonly limits: ContainerLimits; readonly mountsBuild: boolean };
}

/**
 * The run container's command, the same for every submission. `/in/start.sh` is written per
 * submission: it exports the driver's parameters and execs the driver, which stays PID 1.
 */
export const RUN_ARGV: readonly string[] = ["/bin/sh", "/in/start.sh"];

export interface SlotNames {
  readonly build: string | null;
  readonly run: string;
}

export function profileKey(profile: SlotProfile): string {
  return JSON.stringify(profile);
}

/**
 * The container specs for a profile, a workspace and two names — the ONE function that turns a
 * profile into creation arguments, used both for containers made ahead of time and for containers
 * made on demand.
 */
export function specsFor(
  profile: SlotProfile,
  ws: Workspace,
  names: SlotNames,
): { readonly compile: ContainerSpec | null; readonly run: ContainerSpec } {
  if ((profile.compile === null) !== (names.build === null)) {
    throw new Error("a build container name is required exactly when the profile compiles");
  }
  const compile =
    profile.compile === null || names.build === null
      ? null
      : {
          image: profile.image,
          argv: profile.compile.argv,
          sourceDir: ws.sourceDir,
          inputDir: ws.inputDir,
          // Writable /build here; the run container gets the same directory read-only.
          writableBuildDir: ws.buildDir,
          limits: profile.compile.limits,
          name: names.build,
        };
  const run: ContainerSpec = {
    image: profile.image,
    argv: RUN_ARGV,
    sourceDir: ws.sourceDir,
    inputDir: ws.inputDir,
    outputDir: ws.resultDir,
    // Compiled artifacts arrive read-only: the program must not be able to rewrite the binary it
    // is running from between tests.
    ...(profile.run.mountsBuild ? { readonlyDir: ws.buildDir } : {}),
    limits: profile.run.limits,
    name: names.run,
  };
  return { compile, run };
}

/**
 * `/in/start.sh`: the driver's parameters, then the driver itself by `exec`, so the driver is
 * PID 1 exactly as when it was the container's own command. Values are digits only — they are
 * written into a script, and anything else is refused rather than quoted.
 */
export function startScript(env: Readonly<Record<string, string>>, driver: readonly string[]): string {
  const lines = Object.entries(env).map(([key, value]) => {
    // Digits, or a decimal (a per-test kill in seconds to the millisecond). Nothing a shell reads
    // as anything but a number.
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || !/^[0-9]+(\.[0-9]+)?$/.test(value)) {
      throw new Error(`refusing to write ${key}=${value} into start.sh`);
    }
    return `export ${key}=${value}`;
  });
  return `${[...lines, `exec ${driver.join(" ")}`].join("\n")}\n`;
}
