import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { VARIANTS } from "@/lib/judge/runtimes";

import { clampCpus, defaultJudgeConcurrency, hostCpuCount, withHostMaxProcs } from "./host";

const SCRIPT = readFileSync(
  path.join(process.cwd(), "scripts", "build-judge-images.sh"),
  "utf8",
);

/**
 * The verify script and the judge must run the SAME command.
 *
 * They did not, and the way that failed is the reason this file exists. `--verify` carried a
 * hand-copied `go build …` line, so it was proving that a command nobody executes compiles
 * quickly. On the deployment host the real path and the copied path failed differently, and the
 * check reported the wrong one.
 *
 * A comment saying "keep these in step" is what was there before. This is the version that fails.
 */
describe("the verify script runs the judge's own compile command", () => {
  it("does not carry its own copy of a go build line", () => {
    const compileLines = SCRIPT.split("\n").filter(
      (line) =>
        // An INVOCATION, matched by its shape (`go build -o <path>`), not by the words "go
        // build" — which also appear in the trim.txt failure message explaining what breaks.
        // Matching the prose made this test fail on a script that was already correct, which is
        // its own small lesson about assertions that are broader than the thing they protect.
        !line.trimStart().startsWith("#") && /\bgo build\s+-o\b/.test(line),
    );

    expect(
      compileLines,
      "build-judge-images.sh must read the compile command from the registry, not restate it",
    ).toEqual([]);
  });

  it("reads it through the helper that prints the registry's value", () => {
    expect(SCRIPT).toContain("print-compile-command.ts GO_123");
  });

  it("mounts /build, because the registry's command writes its artifact there", () => {
    // The old fixture redirected to /tmp/prog, which is a different filesystem with different
    // permissions — so it could pass while the judge's write to /build failed.
    expect(VARIANTS.GO_123.compileCommand).toContain("/build/prog");
    expect(SCRIPT).toContain('/build:rw');
  });

  it("derives --cpus from the host instead of hardcoding one", () => {
    expect(SCRIPT).not.toMatch(/--cpus=\d/);
    expect(SCRIPT).toContain("nproc");
  });

  it("does not discard stderr from the verification build", () => {
    // `2>/dev/null` on the build turned a refused --cpus and a Go module error into the same
    // opaque "did not compile at all", and cost two rounds of diagnosis on a live deployment.
    expect(SCRIPT).not.toContain('E=$(date +%s%N); echo $(( (E-S)/1000000 ))\' 2>/dev/null');
    expect(SCRIPT).toContain('2>"$go_stderr"');
  });
});

describe("host-derived limits", () => {
  it("never asks for more cpus than the host has", () => {
    expect(clampCpus(4)).toBeLessThanOrEqual(hostCpuCount());
    expect(clampCpus(1024)).toBe(hostCpuCount());
  });

  it("keeps a request the host can satisfy", () => {
    expect(clampCpus(1)).toBe(Math.min(1, hostCpuCount()));
  });

  it("never returns zero or a negative, which Docker also refuses", () => {
    expect(clampCpus(0)).toBeGreaterThan(0);
    expect(clampCpus(-3)).toBeGreaterThan(0);
    expect(clampCpus(Number.NaN)).toBeGreaterThan(0);
  });

  it("rewrites GOMAXPROCS to the host's core count", () => {
    const rewritten = withHostMaxProcs("GOMAXPROCS=4 go build -o /build/prog /work/main.go");
    expect(rewritten).toBe(
      `GOMAXPROCS=${String(hostCpuCount())} go build -o /build/prog /work/main.go`,
    );
  });

  it("leaves a command with no GOMAXPROCS alone", () => {
    expect(withHostMaxProcs("python3 /work/main.py")).toBe("python3 /work/main.py");
  });

  it("derives a concurrency that is at least 1 and never more than 4", () => {
    const n = defaultJudgeConcurrency();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(hostCpuCount());
  });
});

/**
 * The registry's own numbers are still laptop-sized, and that is recorded rather than asserted
 * away: `compileCpus` of 4 is fine now because it is clamped at the container boundary, and the
 * measurement that would let it be lowered honestly has to happen on the droplet (T2).
 */
describe("every compile cpu request survives the clamp", () => {
  it("is runnable on this host after clamping", () => {
    for (const variant of Object.values(VARIANTS)) {
      if (variant.compileCommand === undefined) continue;
      // Nothing here should be able to produce a value Docker would refuse.
      expect(clampCpus(4)).toBeGreaterThan(0);
      expect(clampCpus(4)).toBeLessThanOrEqual(hostCpuCount());
    }
  });
});
