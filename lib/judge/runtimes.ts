/**
 * The language registry — the single place that knows how to build and run each language.
 *
 * Two levels, and the split is the whole design:
 *
 *   RUNTIME  owns the container image, the measured startup budget, and the fixture set.
 *            Five of them, because there are five images and five things to measure.
 *   VARIANT  is a compile-flag entry on top of a runtime. Ten of them, because that is how
 *            many choices a student sees in the dropdown.
 *
 * Java's four language levels share one JDK 21 image and therefore one budget — `--release`
 * selects the level, so measuring four times would be measuring the same JVM four times.
 * C++11, C++17 and C17 share the GCC image and its budget for the same reason.
 *
 * **Adding C++20, Rust, or Kotlin is a line in `VARIANTS` (plus a `RUNTIMES` entry if it needs
 * a new image). It is never a change to `worker/runner.ts`.** If you find yourself editing the
 * runner to add a language, the registry is missing an axis and that is the bug to fix.
 */

/** A container image plus the things measured against it. */
export type RuntimeId = "python312" | "jdk21" | "gcc14" | "node22" | "go123";

/** What a student picks. Persisted on `Problem.allowedLanguages` and `Submission.language`. */
export type LanguageId =
  | "PYTHON_312"
  | "JAVA_8"
  | "JAVA_11"
  | "JAVA_17"
  | "JAVA_21"
  | "CPP_11"
  | "CPP_17"
  | "C_17"
  | "JAVASCRIPT_NODE22"
  | "GO_123";

export interface Runtime {
  readonly id: RuntimeId;
  /**
   * Pinned by digest-able tag, and pulled or built in advance by
   * `scripts/build-judge-images.sh`.
   *
   * Not because the room lacks internet — PRD §10.1 now guarantees it — but because pulling a
   * multi-hundred-megabyte image for the first time while 40 students wait is not a thing to
   * discover at 7pm. `go123` is BUILT rather than pulled and cannot be fetched at all.
   */
  readonly image: string;
  /**
   * Multiplier applied to the problem's stated time limit.
   *
   * Separate from the startup budget because they answer different questions: the multiplier
   * says "this language is inherently slower at the same algorithm", the budget says "this
   * runtime costs a fixed amount before reaching main".
   */
  readonly multiplier: number;
  /**
   * Fixed allowance for interpreter or VM start, in milliseconds.
   *
   * Deliberately generous. A budget below real startup fails correct solutions as TLE; a budget
   * above it lets a slow solution pass. The second is a much cheaper mistake than the first.
   *
   * ## How these were measured, and the mistake not to repeat
   *
   * **Measured through the FULL JUDGE PATH** — `judge()` on a correct three-test solution, under
   * container churn, recording the per-test `durationMs` the runner itself reports. That is the
   * exact quantity compared against `problemLimit * multiplier + startupBudgetMs`, so it is apples
   * to apples by construction. Reproduce with `scripts/measure-startup-budgets.ts`.
   *
   * **This is the third time a budget has been fitted to the wrong baseline.** Each time, correct
   * solutions were failed as TLE:
   *
   *   1. Python at 1000 ms against a measured floor of 1006 ms — lost 8 of 20 reference solutions.
   *   2. Java before the budget was additive at all — intermittent TLE on correct code.
   *   3. All five sized from DIRECT interpreter invocation (`docker run python main.py`) instead of
   *      the judge path. A real test also pays for coreutils `timeout`, a shell, the batch driver,
   *      and bind-mount reads and writes.
   *
   * If you are about to re-measure: **use the judge, not the interpreter.** Anything else measures
   * a thing no student ever experiences.
   *
   * ## What the two methods actually showed
   *
   * | Runtime | direct max | full-path max | worst observed |
   * |---|---|---|---|
   * | python312 | 512 | 929 (1651 via an earlier full-path run) | 1651 |
   * | jdk21 | 7837 | **38473** | **38473** |
   * | gcc14 | 605 | 1182 | 1182 |
   * | node22 | 3636 | 462 | 3636 |
   * | go123 | 845 | 390 | 845 |
   *
   * The direct method did NOT uniformly under-report — node22 and go123 measured *higher* directly.
   * The real lesson is worse than a constant bias: **the two methods disagree by up to 5x in both
   * directions, and the disagreement is dominated by where a sample happened to land relative to
   * host contention rather than by the method.** No single number is stable on this host, so every
   * budget below is a multiple of the WORST value observed by either method, never a fit to a
   * median.
   *
   * ## The Java outlier is real and is why its budget looks absurd
   *
   * One full-path Java sample took **38,473 ms** — eight times the next-highest of 27 samples, on a
   * program that adds two integers. A second run of 18 samples topped out at 4,959 ms and never came
   * close. So it is a tail event, not the norm — roughly 4% of samples — and on a night with 40
   * Java submissions across 3 tests each, a 4% tail lands several times.
   *
   * A budget that ignores it fails correct code, which is exactly the mistake made three times
   * already. So the budget covers it, and the cost is stated plainly: **Java time limits are not
   * meaningfully enforceable on this host.** That is the same Docker Desktop scheduling problem G8
   * measures, and `docs/HOSTING.md` §6 is the fix. §5 is why this is a CORRECTNESS problem and not
   * merely a slow one. On a dedicated Linux host this should fall to
   * roughly 3 s and Java TLE detection becomes real again.
   *
   * **PROVISIONAL AND DOCKER-DESKTOP-SIZED. Re-measure before a contest: `docs/HOSTING.md` §7
   * step 3.**
   */
  readonly startupBudgetMs: number;
  /** Ceiling on the build step. Separate from the run limit: a slow compiler is not a slow algorithm. */
  readonly compileTimeoutMs: number;
  /**
   * Process ceiling for the build step, separate from the run limit.
   *
   * A toolchain forks: `go build` runs the compiler and linker as child processes and the Go
   * runtime wants a thread per core. At the run limit of 64 it dies with
   * "failed to create new OS thread (errno=11)" — a platform failure reported to the student as
   * a compile error. The student's own program still gets the tight limit; a fork bomb is a
   * run-step concern, and the build step runs a known toolchain rather than arbitrary code.
   */
  readonly compilePidsLimit: number;
  /**
   * Scratch space for the build step, in bytes, separate from the run limit.
   *
   * The build writes into the container's tmpfs, and a toolchain's scratch has nothing to do
   * with a problem's memory limit. `go build` populates a module and build cache plus a $WORK
   * tree and dies with "no space left on device" in 32 MB — reported to the student as a
   * compile error for a program that compiles fine.
   */
  readonly compileTmpfsBytes: number;
  /**
   * Memory ceiling for the build step, separate from the run limit.
   *
   * A compiler's working set has nothing to do with the problem's memory limit. `g++` on a
   * template-heavy file and `javac` on a cold JVM both need far more than the 256 MB a problem
   * typically allows, and capping the build at the run limit would report a compiler OOM as the
   * student's MLE.
   */
  readonly compileMemoryLimitMb: number;
  /**
   * CPU allowance for the build step, separate from the run limit.
   *
   * The run container gets one CPU so every student's program is timed against the same
   * machine. The build has no such requirement — it runs a known toolchain, not the
   * submission — and starving it only inflates latency. Measured on `go build`: 94-127 s at
   * one CPU against 44 s at four, for a compile that is not the student's work.
   *
   * A build is not timed and never contributes to a verdict's duration, so giving it more CPU
   * cannot make one submission's result depend on another's.
   */
  readonly compileCpus: number;
}

export interface Variant {
  readonly id: LanguageId;
  readonly runtime: RuntimeId;
  /** Shown in the competitor's language picker. */
  readonly label: string;
  /** File the submission is written to inside the container's source mount. */
  readonly sourceFile: string;
  /**
   * Shell command that builds the submission, or undefined for a language with nothing to
   * check. Runs with the source at /work and writes artifacts to /build.
   */
  readonly compileCommand?: string;
  /**
   * Whether the build emits files the run step needs.
   *
   * This decides how many containers a submission costs, and the reason is memory. A cgroup
   * has ONE memory cap, so a single container cannot both allow `javac` its 1 GB and hold the
   * program to the problem's 256 MB — sized for the compiler, an 800 MB program is never
   * OOM-killed and MLE detection silently stops working.
   *
   *   producesArtifacts: true  -> build in its own container at `compileMemoryLimitMb`,
   *                               artifacts handed to a run container at the problem's limit.
   *                               Two containers. Java, C, C++, Go.
   *   producesArtifacts: false -> the check is a parse that writes nothing, so it runs inside
   *                               the single run container for free. One container.
   *                               Python, JavaScript.
   *
   * PRD §7.1's "per-submission ephemeral container" is about the untrusted program, and that
   * still gets exactly one. The build is a separate risk profile — it runs a compiler over
   * hostile input — and deserves its own limits.
   */
  readonly producesArtifacts: boolean;
  /** Shell command that runs one test, reading the test input on stdin. */
  readonly runCommand: string;
  /**
   * Starter file shown in the editor, so the first thing a student sees is not an empty box.
   *
   * Lives here rather than in the UI for the same reason everything else does: adding a
   * language must be one registry entry, and a template kept in `components/` would make it
   * two places to forget.
   */
  readonly starter: string;
}

/* ------------------------------------------------------------------------ */
/* Runtimes — five images, five measurements                                */
/* ------------------------------------------------------------------------ */

/**
 * ## Where these budgets come from, and which machine they describe
 *
 * **They describe native Linux — the machine that hosts the contest — and nothing else.**
 *
 * Every one of them was re-measured through the full judge path on the deployment host with
 * `scripts/measure-host.sh`. The earlier figures, kept beside each entry, were taken on macOS with
 * Docker Desktop, and the two disagree by between 20x and 168x:
 *
 *     runtime      native Linux      Docker Desktop
 *     python312    51-68 ms          1006-1651 ms
 *     jdk21        117-229 ms        up to 38,473 ms
 *     gcc14        12-26 ms          1182 ms
 *     node22       72-100 ms         462 ms (3636 direct)
 *     go123        8-15 ms           390 ms (845 direct)
 *
 * That gap is not noise and it is not the runtimes. It is Docker Desktop's virtualisation layer,
 * and sizing budgets against it wrote that layer into the contest's rules — see the note on
 * jdk21, where it produced a genuine scoring error rather than merely a slow judge.
 *
 * **What this means for a developer on macOS, measured rather than assumed:** G4's Java fixtures
 * still PASS on Docker Desktop with these budgets — checked, 16/16 of the Java subset. The typical
 * startup there is a few seconds, which a 4000 ms budget plus the problem's own allowance clears.
 *
 * The risk is the TAIL, not the median. The 38,473 ms sample was one outlier in 27, roughly 8x the
 * next highest, and if it recurs that fixture reports TLE. So `JUDGE_STARTUP_BUDGET_SCALE` (see
 * `worker/host.ts`) exists as insurance for a known tail on a virtualised host — not as a routine
 * requirement, and never as a reason to edit these numbers back up.
 */
export const RUNTIMES: Readonly<Record<RuntimeId, Runtime>> = {
  python312: {
    id: "python312",
    image: "python:3.12-slim",
    multiplier: 1,
    // NATIVE LINUX (the judging host): 51-68 ms. Docker Desktop: 1006-1651 ms.
    startupBudgetMs: 4_000,
    compileTimeoutMs: 15_000,
    compilePidsLimit: 64,
    compileTmpfsBytes: 16 * 1024 * 1024,
    compileMemoryLimitMb: 256,
    compileCpus: 1,
  },
  jdk21: {
    id: "jdk21",
    image: "eclipse-temurin:21-jdk",
    // The JVM is genuinely slower per unit of algorithm, not merely slower to start.
    multiplier: 2,
    /*
      NATIVE LINUX (the judging host): 117-229 ms. Docker Desktop: up to 38,473 ms.

      This was 45,000 ms, and that number is the single most instructive measurement in the
      project. It was sized to cover a 38.5-second sample for a program that adds two integers —
      and a 45-second allowance on a 2-second problem does not merely make Java slow to fail, it
      makes Java time limits UNENFORCEABLE. The same quadratic algorithm passed in Java and failed
      in Python, which is a scoring error rather than a performance one (T2).

      On the machine that actually hosts the contest the same measurement is 229 ms. A 168x
      collapse. The 45,000 ms was never measuring the JVM; it was measuring Docker Desktop's
      virtualisation layer, and it silently encoded that layer into the contest's rules.

      4000 ms is 17x the worst native observation, and Java time limits mean something again.
    */
    startupBudgetMs: 4_000,
    // javac on a cold JVM is slow, and it is not the student's fault.
    compileTimeoutMs: 60_000,
    compilePidsLimit: 256,
    compileTmpfsBytes: 256 * 1024 * 1024,
    compileMemoryLimitMb: 1_024,
    compileCpus: 2,
  },
  gcc14: {
    id: "gcc14",
    image: "gcc:14",
    // Compiled C and C++ are the fastest things here at run time.
    multiplier: 1,
    // NATIVE LINUX (the judging host): 12-26 ms. Docker Desktop: 1182 ms.
    startupBudgetMs: 4_000,
    // g++ with optimisation on a template-heavy file is the slowest build of the five.
    compileTimeoutMs: 60_000,
    compilePidsLimit: 256,
    compileTmpfsBytes: 256 * 1024 * 1024,
    compileMemoryLimitMb: 1_024,
    compileCpus: 2,
  },
  node22: {
    id: "node22",
    image: "node:22-slim",
    multiplier: 1,
    // NATIVE LINUX (the judging host): 72-100 ms. Docker Desktop: 462 ms full path, 3636 direct.
    startupBudgetMs: 4_000,
    compileTimeoutMs: 15_000,
    compilePidsLimit: 64,
    compileTmpfsBytes: 16 * 1024 * 1024,
    compileMemoryLimitMb: 256,
    compileCpus: 1,
  },
  go123: {
    id: "go123",
    // NOT the stock `golang:1.23-bookworm`. Built locally from docker/go/Dockerfile by
    // scripts/build-judge-images.sh, which pre-compiles the standard library into a
    // world-readable /opt/gocache.
    //
    // Since Go 1.20 std is not shipped pre-built, and every submission gets a fresh container
    // with an empty cache — so the stock image recompiles std on every single submission.
    // Measured in-container on this host: 65.8 s stock against 2.5-11.8 s warm. The stock image
    // did not fail loudly either; it blew the compile timeout and reported CE on a correct
    // program, which is the worst possible way for this to break.
    image: "ptcn-go:1.23",
    multiplier: 1,
    // NATIVE LINUX (the judging host): 8-15 ms. Docker Desktop: 390 ms full path, 845 direct.
    startupBudgetMs: 4_000,
    // A warm build is 2.5-11.8 s. The ceiling stays generous because the variance here is host
    // I/O, not the compiler: if the warm cache is ever missed the build takes ~66 s, and a
    // ceiling below that would report CE on a correct program rather than surfacing the real
    // problem. scripts/build-judge-images.sh --verify is what catches a missed cache.
    compileTimeoutMs: 90_000,
    compilePidsLimit: 512,
    // Down from 1 GB: the build cache now lives on the read-only rootfs, so tmpfs holds only
    // GOTMPDIR's $WORK tree and the output binary.
    compileTmpfsBytes: 256 * 1024 * 1024,
    compileMemoryLimitMb: 1_024,
    compileCpus: 4,
  },
};

/* ------------------------------------------------------------------------ */
/* Variants — what the dropdown offers                                      */
/* ------------------------------------------------------------------------ */

/**
 * `-static-libgcc -static-libstdc++` is not present, and `-O2` is: students are writing contest
 * solutions, and an unoptimised build makes a correct algorithm look too slow.
 *
 * The `--release` and `-std=` flags are the entire point of the variant level. They are what a
 * Java-8 or C++11 problem means, and a fixture proves each one actually applies — a flag that is
 * silently ignored would let a student use a language feature the problem forbids, and nothing
 * else would notice.
 */

/**
 * **`-std=` alone does NOT enforce a C++ standard, and this was a real hole.**
 *
 * GCC accepts most newer-standard features under an older `-std=` and merely *warns*, under
 * `-Wc++17-extensions` and friends. `variant-cpp17-under-cpp11` — C++17 structured bindings and
 * `if constexpr` compiled with `-std=c++11` — produced a clean **AC**. A student on a C++11
 * problem could have used C++17 freely, which is precisely the thing the variant level claims to
 * prevent. G4 caught it on the first run of the pair; nothing else would have.
 *
 * These promote exactly those "you used a newer standard" diagnostics to errors. Deliberately
 * NOT `-pedantic-errors`, which would also reject GNU extensions that contest C++ leans on
 * heavily — `__int128` above all. Verified: `__int128` still compiles with these flags set.
 *
 * Each variant gets the flags for every standard NEWER than its own. When adding C++20, its
 * entry takes `-Werror=c++23-extensions -Werror=c++26-extensions`, and `CPP_11`/`CPP_17` are
 * already correct because C++20 is newer than both.
 *
 * C needs no equivalent: only one C standard is offered, so there is no older level to enforce
 * against. GCC has no `-Werror=cNN-extensions` in any case.
 */
const NEWER_THAN_CPP11 =
  "-Werror=c++14-extensions -Werror=c++17-extensions -Werror=c++20-extensions " +
  "-Werror=c++23-extensions -Werror=c++26-extensions";

const NEWER_THAN_CPP17 =
  "-Werror=c++20-extensions -Werror=c++23-extensions -Werror=c++26-extensions";
/**
 * ## How a variant's `label` is written
 *
 * These strings are what a student reads in the language dropdown, forty times an hour, and the
 * rule comes from reading all 44 of HackerRank's:
 *
 *   - **A version token appears only where the family has more than one row.** C++11 / C++17 and
 *     Java 8 / 11 / 17 / 21 need one; C, Go and JavaScript do not. `C (C17)` read as a typo.
 *   - **The token is the LANGUAGE STANDARD, never the toolchain.** "C++11", not
 *     "g++ 14 -std=c++11". "Python 3", not "Python 3.12" — the minor version is a fact about our
 *     Docker image, not about the language a student is writing.
 *   - **A parenthesised qualifier names the runtime only where the language name is genuinely
 *     ambiguous.** JavaScript is (browser vs Node vs Deno); Go is not.
 *
 * The exact toolchain version is still here in the registry for the problem's metadata rail. It is
 * deliberately not in the dropdown: a string read that often should be short.
 *
 * This is a LABEL, not a `LanguageId`. Renaming an id has four homes and three of them are data
 * (see CLAUDE.md); renaming a label has one, because `LANGUAGE_LABEL` in
 * components/contest/editor/types.ts derives from here.
 */
export const VARIANTS: Readonly<Record<LanguageId, Variant>> = {
  PYTHON_312: {
    id: "PYTHON_312",
    runtime: "python312",
    label: "Python 3",
    sourceFile: "main.py",
    // No build, but a syntax error is a COMPILE error rather than a runtime one: `RE` would
    // tell a student their algorithm crashed when the file never parsed. `compile()` rather
    // than py_compile, which writes __pycache__ beside a read-only source.
    compileCommand: `python -c "compile(open('/work/main.py').read(), 'main.py', 'exec')"`,
    producesArtifacts: false,
    runCommand: "exec python -I /work/main.py",
    starter: `import sys

def main():
    data = sys.stdin.read().split()
    # your code here

main()
`
  },

  // --- Java: one image, four language levels via --release ---------------
  JAVA_8: {
    id: "JAVA_8",
    runtime: "jdk21",
    label: "Java 8",
    sourceFile: "Main.java",
    compileCommand: "javac --release 8 -proc:none -nowarn -d /build /work/Main.java",
    producesArtifacts: true,
    runCommand: "exec java -XX:MaxRAMPercentage=75 -cp /build Main",
    starter: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        // your code here
    }
}
`
  },
  JAVA_11: {
    id: "JAVA_11",
    runtime: "jdk21",
    label: "Java 11",
    sourceFile: "Main.java",
    compileCommand: "javac --release 11 -proc:none -nowarn -d /build /work/Main.java",
    producesArtifacts: true,
    runCommand: "exec java -XX:MaxRAMPercentage=75 -cp /build Main",
    starter: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        // your code here
    }
}
`
  },
  JAVA_17: {
    id: "JAVA_17",
    runtime: "jdk21",
    label: "Java 17",
    sourceFile: "Main.java",
    compileCommand: "javac --release 17 -proc:none -nowarn -d /build /work/Main.java",
    producesArtifacts: true,
    runCommand: "exec java -XX:MaxRAMPercentage=75 -cp /build Main",
    starter: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        // your code here
    }
}
`
  },
  JAVA_21: {
    id: "JAVA_21",
    runtime: "jdk21",
    label: "Java 21",
    sourceFile: "Main.java",
    compileCommand: "javac --release 21 -proc:none -nowarn -d /build /work/Main.java",
    producesArtifacts: true,
    runCommand: "exec java -XX:MaxRAMPercentage=75 -cp /build Main",
    starter: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        // your code here
    }
}
`
  },

  // --- GCC: one image, three language standards --------------------------
  C_17: {
    id: "C_17",
    runtime: "gcc14",
    label: "C",
    sourceFile: "main.c",
    // -lm because contest C reaches for sqrt and friends often enough that omitting it would
    // read as a platform bug rather than a missing flag.
    compileCommand: "gcc -std=c17 -O2 -o /build/prog /work/main.c -lm",
    producesArtifacts: true,
    runCommand: "exec /build/prog",
    starter: `#include <stdio.h>

int main(void) {
    /* your code here */
    return 0;
}
`
  },
  CPP_11: {
    id: "CPP_11",
    runtime: "gcc14",
    label: "C++11",
    sourceFile: "main.cpp",
    compileCommand: `g++ -std=c++11 -O2 ${NEWER_THAN_CPP11} -o /build/prog /work/main.cpp`,
    producesArtifacts: true,
    runCommand: "exec /build/prog",
    starter: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // your code here
    return 0;
}
`
  },
  CPP_17: {
    id: "CPP_17",
    runtime: "gcc14",
    label: "C++17",
    sourceFile: "main.cpp",
    compileCommand: `g++ -std=c++17 -O2 ${NEWER_THAN_CPP17} -o /build/prog /work/main.cpp`,
    producesArtifacts: true,
    runCommand: "exec /build/prog",
    starter: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // your code here
    return 0;
}
`
  },

  JAVASCRIPT_NODE22: {
    id: "JAVASCRIPT_NODE22",
    runtime: "node22",
    label: "JavaScript (Node.js)",
    sourceFile: "main.js",
    // --check parses without executing, so a syntax error is CE rather than RE.
    compileCommand: "node --check /work/main.js",
    producesArtifacts: false,
    runCommand: "exec node /work/main.js",
    starter: `const data = require("node:fs").readFileSync(0, "utf8").split(/\\s+/);

function main() {
  // your code here
}

main();
`
  },

  GO_123: {
    id: "GO_123",
    runtime: "go123",
    label: "Go",
    sourceFile: "main.go",
    // GOCACHE points at the image's PRE-WARMED cache on the read-only rootfs, not at tmpfs.
    // Go reads a cache it cannot write to without complaint, and the one entry this build
    // actually creates — the student's own package — goes to GOTMPDIR in tmpfs. Pointing
    // GOCACHE at empty tmpfs instead is what made every Go submission recompile the standard
    // library and blow the compile timeout.
    //
    // GOMAXPROCS is bounded because --cpus does not stop the Go runtime asking for a thread
    // per HOST core, and --pids-limit then refuses with errno=11.
    //
    // No GOFLAGS. Build flags are part of the cache key, so any flag here that
    // docker/go/Dockerfile did not also use silently misses the whole warm cache.
    compileCommand:
      "GOCACHE=/opt/gocache GOTMPDIR=/tmp GOPATH=/tmp/gopath GOMAXPROCS=4 go build -o /build/prog /work/main.go",
    producesArtifacts: true,
    // GOMAXPROCS is bounded for the same reason as the build: --cpus=1 does not stop the Go
    // runtime asking for a thread per HOST core, and --pids-limit then refuses.
    runCommand: "exec env GOMAXPROCS=2 /build/prog",
    starter: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	reader := bufio.NewReader(os.Stdin)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()
	_ = reader
	_ = fmt.Sprint
	// your code here
}
`
  },
};

/** Every language a student may pick, in dropdown order. */
export const LANGUAGE_IDS: readonly LanguageId[] = [
  "PYTHON_312",
  "JAVA_8",
  "JAVA_11",
  "JAVA_17",
  "JAVA_21",
  "C_17",
  "CPP_11",
  "CPP_17",
  "JAVASCRIPT_NODE22",
  "GO_123",
];

export function variantFor(language: LanguageId): Variant {
  return VARIANTS[language];
}

export function runtimeFor(language: LanguageId): Runtime {
  return RUNTIMES[VARIANTS[language].runtime];
}

/** Which variants share a runtime — used by the fixture suite to avoid measuring twice. */
export function variantsOfRuntime(runtime: RuntimeId): LanguageId[] {
  return LANGUAGE_IDS.filter((id) => VARIANTS[id].runtime === runtime);
}
