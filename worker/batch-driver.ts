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
 * compile and run scripts. Expected outputs are never mounted at all: comparison happens on the
 * host against files the container never sees, so there is no right answer to forge.
 *
 * **Two things this comment used to get wrong, both now fixed:**
 *
 * 1. It said scribbling on `/out` "buys it nothing". It bought the timings. `.meta` carries the
 *    exit code and duration the host trusts, a submission runs as the same uid as this driver, and
 *    a detached background loop outlives the program that spawned it — so a slow solution could
 *    rewrite its own `.meta` and be read as fast. The host now cross-checks the total against the
 *    Docker daemon's own clock (`selfReportedTimingIsCredible`), which nothing inside the container
 *    can reach.
 * 2. Inputs used to be written all at once, so a submission could read a HIDDEN test's input and
 *    echo it back through a SAMPLE test's diff snippet, 199 bytes per submission. Inputs now arrive
 *    one at a time and are deleted after use.
 *
 * ## The doorbell, and why the handshake no longer polls
 *
 * The host and this driver hand each test over with a DOORBELL on the container's own stdio rather
 * than by polling files: the host writes `go <n>` to the container's stdin once input n is in
 * place, and the driver prints `ptcn-done <n>` on its stdout once test n's results are written.
 *
 * It replaced a pair of polls — the host checked for `<n>.meta` every 25 ms and the driver checked
 * for `<n>.in` every 50 ms with an external `sleep` — and those cost ~57 ms of idle judge slot PER
 * TEST, measured: about a second of every Python submission and over 60% of its slot time. A `read`
 * on a pipe blocks until the byte lands, so the handover is now as fast as the host can rename a
 * file.
 *
 * ## What a hostile program can and cannot do to the doorbell
 *
 * The program runs as this driver's uid, so it can open `/proc/1/fd/0` and `/proc/1/fd/1` and both
 * read the bells and ring them. Every such trick is self-harm, and none is a disclosure:
 *
 *   - A bell the program fakes (`go 4` while test 3 runs) makes the driver start a test whose input
 *     the host has not placed. That test fails, the next bell mismatches its ordinal, and the
 *     driver STOPS — the remaining tests go to the host's single-test retry path.
 *   - A `ptcn-done` the program fakes makes the host freeze that test's results EARLY, with the
 *     program's own output in them, and move on. The host never reads a frozen test's files again
 *     (see `runner.ts`), so a later test — which might have seen a hidden input — can no longer
 *     rewrite what an earlier sample's diff snippet shows. That rewrite was possible under the old
 *     file handshake, because `/out` is writable by the program and was read only after exit.
 *
 * ## Nothing of the program outlives its test
 *
 * `kill -9 -1` after every test kills every process this uid owns except PID 1, which is this
 * driver: the kernel never delivers a signal from inside a PID namespace to its init. `timeout`
 * waits only for its direct child, so without this a detached background loop survived its test,
 * kept a core busy through every later test (charged to them), and could rewrite `.meta` files to
 * forge timings (H2). It is a builtin — no fork — so it still runs when a fork bomb has used up
 * `--pids-limit`.
 *
 * The commands are shipped as generated scripts rather than interpolated into the driver,
 * so nothing here ever `eval`s a string.
 *
 * Timing in `.meta` is ADVISORY and is treated that way. TLE is enforced by `timeout` inside the
 * loop, which a submission cannot escape; the host keeps a wall-clock backstop on the whole
 * container; and the host discards the self-reported timings entirely if they do not add up
 * against the daemon's clock.
 *
 * ## Why stdout lands in the tmpfs first
 *
 * Redirecting straight to `/out` would let the 1 GB flood fixture write a gigabyte onto the
 * host. Writing to the size-capped tmpfs first means a flood hits ENOSPC in RAM that dies with
 * the container; the driver then copies out at most `PTCN_CAP` bytes and records the raw byte
 * count so the host can tell truncation from a genuinely short answer.
 */
export const BATCH_DRIVER = `#!/bin/sh
# Environment: PTCN_TESTS, PTCN_TIMEOUT (s per test), PTCN_COMPILE_TIMEOUT (s), PTCN_CAP (bytes),
#              PTCN_FEED_TIMEOUT (polls of 50ms to wait for an input that the bell announced).
# Optional: PTCN_ONLY=<n> to run exactly one test (the retry path).
# /in/compile.sh is optional; /in/run.sh is required.
# stdin carries the host's doorbell: one "go <n>" line per test.
set -u

mkdir -p /tmp/build

if [ -f /in/compile.sh ]; then
  # stdin is the doorbell. The compile step must not be able to swallow it.
  timeout -k 1 "$PTCN_COMPILE_TIMEOUT" sh /in/compile.sh < /dev/null > /out/compile.out 2> /out/compile.err
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
  # Wait for the host's bell for THIS test. Inputs arrive ONE AT A TIME and are removed once their
  # test finishes, so a submission cannot read ahead to a hidden test's input and echo it back
  # through a sample's diff snippet. See feedInputs in worker/runner.ts.
  #
  # End of stdin, or a bell for any other test, means the host is gone or the program has been
  # ringing it: stop, and let the host re-run whatever is left individually.
  if ! read -r bell; then break; fi
  if [ "$bell" != "go $i" ]; then break; fi

  # The bell is sent only after the input was renamed into place, so this is normally true at
  # once. Bounded, because a bind mount crossing a VM boundary (Docker Desktop) can surface the
  # name a moment after the bell that announced it.
  waited=0
  while [ ! -f "/in/$i.in" ] && [ "$waited" -lt "$PTCN_FEED_TIMEOUT" ]; do
    sleep 0.05
    waited=$(( waited + 1 ))
  done

  start=$(date +%s%N)
  timeout -k 1 "$PTCN_TIMEOUT" sh /in/run.sh < "/in/$i.in" > /tmp/ptcn-raw 2> /tmp/ptcn-err
  code=$?
  end=$(date +%s%N)
  ms=$(( (end - start) / 1000000 ))

  # Nothing the program started survives its test. PID 1 — this driver — is exempt by the kernel.
  kill -9 -1 2>/dev/null

  raw=$(wc -c < /tmp/ptcn-raw 2>/dev/null || echo 0)
  head -c "$PTCN_CAP" /tmp/ptcn-raw > "/out/$i.out" 2>/dev/null || : > "/out/$i.out"
  head -c 4096 /tmp/ptcn-err > "/out/$i.err" 2>/dev/null || : > "/out/$i.err"

  printf '%s %s %s\\n' "$code" "$ms" "$raw" > "/out/$i.meta"

  rm -f /tmp/ptcn-raw /tmp/ptcn-err
  printf 'ptcn-done %s\\n' "$i"
  i=$(( i + 1 ))
done

# Absence of this file tells the host the container died partway, and which tests to re-run
# individually so partial credit survives.
printf 'ok\\n' > /out/complete
`;

/** The line the driver prints when test `ordinal`'s results are on disk. */
export function parseDoneLine(line: string): number | null {
  const match = /^ptcn-done (\d+)$/.exec(line.trim());
  if (match === null) return null;
  const ordinal = Number(match[1]);
  return Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

/** The bell the host rings once test `ordinal`'s input is in place. */
export function doorbellFor(ordinal: number): string {
  return `go ${String(ordinal)}\n`;
}

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
