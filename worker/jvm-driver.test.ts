import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { VARIANTS, LANGUAGE_IDS } from "@/lib/judge/runtimes";

import { BATCH_DRIVER } from "./batch-driver";
import { HARNESS_PROTOCOL, JVM_DRIVER, parseRunMode } from "./jvm-driver";

const HARNESS_DIR = path.join(process.cwd(), "worker", "jvm-harness", "ptcn", "harness");
const harnessSource = (file: string): string => readFileSync(path.join(HARNESS_DIR, file), "utf8");

/**
 * Structural tests for the Java harness driver. Its behaviour is proven in Docker by G4 (every
 * Java fixture), G5 (the handshake-forgery fixture) and scripts/ab-jvm-harness.ts; these pin the
 * properties that a timing race or a quiet edit would otherwise erode without failing those.
 */
describe("the harness and the driver agree", () => {
  it("speak the same protocol version", () => {
    const match = /static final int PROTOCOL = (\d+);/.exec(harnessSource("Harness.java"));
    expect(match?.[1]).toBe(String(HARNESS_PROTOCOL));
  });

  it("only JAVA_21 has a harness, and its run command is still there for the fallback", () => {
    const withHarness = LANGUAGE_IDS.filter((id) => VARIANTS[id].harnessCommand !== undefined);
    expect(withHarness).toEqual(["JAVA_21"]);
    expect(VARIANTS.JAVA_21.runCommand).toContain("-cp /build Main");
  });

  it("starts the harness from the read-only image, never from /build", () => {
    const command = VARIANTS.JAVA_21.harnessCommand ?? "";
    expect(command).toContain("-p /opt/ptcn/harness.jar -m ptcn.harness/ptcn.harness.Harness");
    expect(command).not.toMatch(/-cp \/build|-classpath/);
  });

  it("runs the harness JVM with the same JVM flags as a per-test run", () => {
    const flags = (cmd: string): string =>
      cmd.slice(cmd.indexOf("java ") + 5, cmd.indexOf(" -", cmd.indexOf("Tier4BackEdgeThreshold")));
    expect(flags(VARIANTS.JAVA_21.harnessCommand ?? "")).toBe(flags(VARIANTS.JAVA_21.runCommand));
  });

  it("opens java.lang to the harness module only, never to student code", () => {
    const command = VARIANTS.JAVA_21.harnessCommand ?? "";
    expect(command).toContain("--add-opens java.base/java.lang=ptcn.harness");
    expect(command).not.toContain("ALL-UNNAMED");
  });

  it("gives the harness the same per-test limit as timeout, in seconds", () => {
    expect(VARIANTS.JAVA_21.harnessCommand).toContain('"$PTCN_TIMEOUT"');
    expect(JVM_DRIVER).toContain('timeout -k 1 "$PTCN_TIMEOUT" sh /in/run.sh');
  });

  it("keeps the harness package unexported", () => {
    const moduleInfo = readFileSync(
      path.join(process.cwd(), "worker", "jvm-harness", "module-info.java"),
      "utf8",
    );
    expect(moduleInfo).not.toMatch(/^\s*(exports|opens)\b/m);
    expect(moduleInfo).not.toMatch(/^\s*open\s+module\b/m);
  });
});

describe("the driver's handshake with the host is BATCH_DRIVER's", () => {
  it("waits for the bell naming THIS test, and stops on any other", () => {
    expect(JVM_DRIVER).toContain("if ! read -r bell; then break; fi");
    expect(JVM_DRIVER).toContain('if [ "$bell" != "go $i" ]; then break; fi');
  });

  it("runs a fallback test with BATCH_DRIVER's exact commands", () => {
    for (const line of [
      'timeout -k 1 "$PTCN_TIMEOUT" sh /in/run.sh < "/in/$1.in" > /tmp/ptcn-raw 2> /tmp/ptcn-err',
      "kill -9 -1 2>/dev/null",
    ]) {
      expect(JVM_DRIVER).toContain(line);
      expect(BATCH_DRIVER).toContain(line.replace('"/in/$1.in"', '"/in/$i.in"'));
    }
  });

  it("copies results out exactly as BATCH_DRIVER does, then rings done", () => {
    for (const line of [
      "raw=$(wc -c < /tmp/ptcn-raw 2>/dev/null || echo 0)",
      'head -c "$PTCN_CAP" /tmp/ptcn-raw > "/out/$i.out" 2>/dev/null || : > "/out/$i.out"',
      'head -c 4096 /tmp/ptcn-err > "/out/$i.err" 2>/dev/null || : > "/out/$i.err"',
    ]) {
      expect(JVM_DRIVER).toContain(line);
      expect(BATCH_DRIVER).toContain(line);
    }
    const meta = JVM_DRIVER.indexOf('> "/out/$i.meta"');
    const done = JVM_DRIVER.indexOf("printf 'ptcn-done %s");
    expect(meta).toBeGreaterThan(JVM_DRIVER.indexOf("harness_test \"$i\""));
    expect(done).toBeGreaterThan(meta);
  });
});

describe("the driver believes the harness only when it says something good", () => {
  const harnessTest = JVM_DRIVER.slice(
    JVM_DRIVER.indexOf("harness_test() {"),
    JVM_DRIVER.indexOf("process_test() {"),
  );

  it("bounds every read from the harness with a timeout", () => {
    const reads = harnessTest.match(/read -r[^\n]*-u "\$hin"/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(2);
    for (const read of reads) expect(read).toMatch(/-t "\$PTCN_HARNESS_(BACKSTOP|SETTLE)"/);
    expect(JVM_DRIVER).toMatch(/read -r -t "\$PTCN_HARNESS_START" -u "\$hin" hello/);
  });

  it("times the test on its OWN clock, never from anything the harness says", () => {
    expect(harnessTest).toContain("t0=$EPOCHREALTIME");
    expect(harnessTest).toContain("t1=$EPOCHREALTIME");
    expect(harnessTest).toContain("ms=$(( (${t1//[.,]/} - ${t0//[.,]/}) / 1000 ))");
    // The only things taken from the reply are the ordinal it must match and the exit status.
    expect(harnessTest).not.toMatch(/ms=\$\{?reply/);
  });

  it("starts the clock before asking the harness to run the test", () => {
    expect(harnessTest.indexOf("t0=$EPOCHREALTIME")).toBeLessThan(harnessTest.indexOf("printf 'run %s"));
  });

  it("accepts done only for THIS test and only with a status of 0..255", () => {
    expect(harnessTest).toContain('"done $1 "*)');
    expect(harnessTest).toContain("case \"$code\" in ''|*[!0-9]*) return 1 ;; esac");
    expect(harnessTest).toContain('[ "$code" -le 255 ] || return 1');
  });

  it("records the harness's timeout as timeout's own status, and kills the JVM", () => {
    expect(harnessTest).toContain('"tle $1")\n      code=124');
    const tle = harnessTest.indexOf('if [ "$reply" = "tle $1" ]; then');
    expect(harnessTest.indexOf("harness_stop", tle)).toBeGreaterThan(tle);
  });

  it("falls back on anything else, from the current test onward", () => {
    expect(harnessTest).toMatch(/\*\)\n\s+return 1/);
    expect(JVM_DRIVER).toContain('if [ -n "$hpid" ] && harness_test "$i"; then');
    expect(JVM_DRIVER).toMatch(/else\n\s+harness_stop\n\s+process_test "\$i"/);
  });

  it("keeps the JVM only after ok for this test AND no stray process", () => {
    expect(harnessTest).toContain('[ "$state" != "ok $1" ]');
    expect(harnessTest).toContain("elif stray_processes; then");
  });

  it("gives the harness JVM no real stdin, stdout or stderr", () => {
    expect(JVM_DRIVER).toContain(
      "exec /bin/sh /in/harness.sh 3<&0 4>&1 </dev/null >/dev/null 2>/dev/null",
    );
  });

  it("finds stray processes without forking", () => {
    const stray = JVM_DRIVER.slice(
      JVM_DRIVER.indexOf("stray_processes() {"),
      JVM_DRIVER.indexOf("if [ -f /in/harness.sh ]"),
    );
    expect(stray).toContain("for p in /proc/[0-9]*; do");
    expect(stray).not.toMatch(/\$\(|`|\bps\b|\bpgrep\b/);
  });
});

describe("the harness traps exit without granting anything away", () => {
  it("traps exit and halt in the SecurityManager", () => {
    const guard = harnessSource("Guard.java");
    expect(guard).toContain("public void checkExit(int status)");
    expect(guard).toContain("throw ExitTrap.INSTANCE;");
  });

  it("aborts a test that registers a shutdown hook or replaces the manager", () => {
    const guard = harnessSource("Guard.java");
    expect(guard).toContain('"shutdownHooks".equals(name) || "setSecurityManager".equals(name)');
  });

  it("never synchronizes on anything a student can reach", () => {
    for (const file of readdirSync(HARNESS_DIR)) {
      const source = harnessSource(file);
      expect(source, file).not.toMatch(/synchronized\s*\(\s*(this|System|Thread|guard)\b/);
    }
  });

  it("invokes the student's main inline in Harness.main, so exactly one frame sits beneath it", () => {
    const harness = harnessSource("Harness.java");
    const main = harness.slice(harness.indexOf("public static void main"), harness.indexOf("private static void watch"));
    expect(main).toContain("run.entry.invokeExact(new String[0]);");
  });

  it("loads student classes through a fresh loader whose parent is the platform loader", () => {
    expect(harnessSource("TestRun.java")).toContain(
      "new URLClassLoader(new URL[] {cfg.classDir.toUri().toURL()}, ClassLoader.getPlatformClassLoader())",
    );
  });

  it("does not flush what the program left buffered when a test ends", () => {
    const ending = harnessSource("Ending.java");
    expect(ending).not.toMatch(/\.flush\(\)/);
    expect(harnessSource("TestRun.java")).not.toMatch(/out\.flush\(\)|err\.flush\(\)/);
  });
});

describe("parseRunMode", () => {
  it("reads the driver's fourth field", () => {
    expect(parseRunMode("0 12 34 h\n")).toBe("harness");
    expect(parseRunMode("1 120 0 p")).toBe("process");
  });

  it("is absent for BATCH_DRIVER's three-field lines and for garbage", () => {
    expect(parseRunMode("0 12 34\n")).toBeNull();
    expect(parseRunMode("0 12 34 x")).toBeNull();
    expect(parseRunMode("")).toBeNull();
  });
});
