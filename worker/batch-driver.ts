/**
 * The in-container driver: ONE container per submission, compile and all tests inside it.
 *
 * PRD §7.1 specifies "per-submission ephemeral Docker container" — singular. The first
 * implementation spawned one container per *test case* plus one to compile, which is a spec
 * deviation and, on this hardware, the dominant cost: container creation measured 2.4–15.6 s,
 * so a three-test problem paid it four times for perhaps 300 ms of actual work. G8 measured
 * 0.43 containers/sec against the 16/sec its target needs.
 *
 * ## Why a submission cannot cheat this
 *
 * `/in` is read-only, so a submission cannot rewrite a later test's input, the driver, or the
 * compile and run scripts. `/out` is writable and a submission *can* scribble there — which
 * buys it nothing, because **expected outputs are never mounted into the container**.
 * Comparison happens on the host against files the container never sees, so there is no right
 * answer to forge. Each `.meta` is written only after the test it describes has exited, so a
 * pre-written fake status is overwritten by the real one.
 *
 * The commands are shipped as generated scripts rather than interpolated into the driver,
 * so nothing here ever `eval`s a string.
 *
 * Timing in `.meta` is advisory. TLE is enforced by `timeout` inside the loop, which a
 * submission cannot escape, and the host keeps a wall-clock backstop on the whole container.
 *
 * ## Why stdout lands in the tmpfs first
 *
 * Redirecting straight to `/out` would let the 1 GB flood fixture write a gigabyte onto the
 * host. Writing to the size-capped tmpfs first means a flood hits ENOSPC in RAM that dies with
 * the container; the driver then copies out at most `PTCN_CAP` bytes and records the raw byte
 * count so the host can tell truncation from a genuinely short answer.
 */
export const BATCH_DRIVER = `#!/bin/sh
# Environment: PTCN_TESTS, PTCN_TIMEOUT (s per test), PTCN_COMPILE_TIMEOUT (s), PTCN_CAP (bytes).
# Optional: PTCN_ONLY=<n> to run exactly one test (the retry path).
# /in/compile.sh is optional; /in/run.sh is required.
set -u

mkdir -p /tmp/build

if [ -f /in/compile.sh ]; then
  timeout -k 1 "$PTCN_COMPILE_TIMEOUT" sh /in/compile.sh > /out/compile.out 2> /out/compile.err
  ccode=$?
  printf '%s\\n' "$ccode" > /out/compile.meta
  if [ "$ccode" -ne 0 ]; then
    # A compile failure means no test can run. Say so and stop, rather than reporting every
    # test as a runtime error.
    printf 'ok\\n' > /out/complete
    exit 0
  fi
fi

# PTCN_ONLY runs a single test instead of the whole set. The retry path uses it so a test
# whose sibling killed the container gets a fresh container that ALSO compiles — a retry that
# skipped the compile step would run \`java -cp /tmp/build\` against a tmpfs that no longer has
# a build in it and report "class not found" as a runtime error.
first=1
last="$PTCN_TESTS"
if [ "\${PTCN_ONLY:-}" != "" ]; then
  first="$PTCN_ONLY"
  last="$PTCN_ONLY"
fi

i="$first"
while [ "$i" -le "$last" ]; do
  start=$(date +%s%N)
  timeout -k 1 "$PTCN_TIMEOUT" sh /in/run.sh < "/in/$i.in" > /tmp/ptcn-raw 2> /tmp/ptcn-err
  code=$?
  end=$(date +%s%N)
  ms=$(( (end - start) / 1000000 ))

  raw=$(wc -c < /tmp/ptcn-raw 2>/dev/null || echo 0)
  head -c "$PTCN_CAP" /tmp/ptcn-raw > "/out/$i.out" 2>/dev/null || : > "/out/$i.out"
  head -c 4096 /tmp/ptcn-err > "/out/$i.err" 2>/dev/null || : > "/out/$i.err"

  printf '%s %s %s\\n' "$code" "$ms" "$raw" > "/out/$i.meta"

  rm -f /tmp/ptcn-raw /tmp/ptcn-err
  i=$(( i + 1 ))
done

# Absence of this file tells the host the container died partway, and which tests to re-run
# individually so partial credit survives.
printf 'ok\\n' > /out/complete
`;

/** One test's outcome as the driver reports it. */
export interface BatchTestOutcome {
  readonly ordinal: number;
  readonly exitCode: number;
  readonly durationMs: number;
  /** Bytes the program actually wrote, before the cap. Larger than the file means truncated. */
  readonly rawBytes: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Parse one `.meta` line: `<exitCode> <durationMs> <rawBytes>`. */
export function parseMeta(
  line: string,
): { exitCode: number; durationMs: number; rawBytes: number } | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const [exit, ms, raw] = parts;
  const exitCode = Number(exit);
  const durationMs = Number(ms);
  const rawBytes = Number(raw);

  if (!Number.isFinite(exitCode) || !Number.isFinite(durationMs) || !Number.isFinite(rawBytes)) {
    return null;
  }
  return { exitCode, durationMs, rawBytes };
}
