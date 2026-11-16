/**
 * The in-container driver for a runtime with an in-JVM harness (Java 21): every test of a submission
 * inside ONE JVM, falling back to one process per test the moment the harness cannot vouch for a
 * test.
 *
 * It speaks to the HOST exactly as `BATCH_DRIVER` does — `go <n>` in, `ptcn-done <n>` out, one input
 * on disk at a time, `<n>.out`/`<n>.err`/`<n>.meta` written to `/out` before the bell — so
 * `worker/runner.ts` feeds, freezes and reads it with the same code. Only what happens between the
 * bells differs. The per-process branch below is BATCH_DRIVER's loop body, command for command.
 *
 * ## Why the per-test JVM is worth removing
 *
 * A Java submission's judge time was almost all JVM startup, paid once per test (about 17 per
 * problem). The harness (worker/jvm-harness) pays it once per submission and gives every test a
 * fresh class loader, fresh standard streams and a JVM-wide state put back as a fresh process
 * would have it.
 *
 * ## The rule: the harness is believed only when it says something good
 *
 *   - `done <n> <status>`  the test ended (returned, threw, or called System.exit). Its timing is
 *                          the DRIVER's own clock from `run` to `done`, never the harness's.
 *   - `ok <n>`             the JVM is as clean as before the test; the next test may use it.
 *   - `tle <n>`            the harness's watchdog fired at the same limit as `timeout` uses below.
 *                          Recorded as 124, exactly what `timeout` reports, and the JVM is killed.
 *   Anything else — `dirty`, `abort`, garbage, end of file, silence past the backstop — and the JVM
 *   is killed with everything else this uid owns, and the CURRENT test (unless it already has a
 *   result) and every later one run as processes. So a harness that misbehaves costs time, never a
 *   verdict.
 *
 * ## What a hostile program can do here that it could not do before: nothing new
 *
 * Student code runs inside the harness JVM, as the same uid as this driver. It can therefore write
 * forged replies into the harness's pipes, and with sun.misc.Unsafe it can rewrite the harness's
 * memory. The design does not depend on preventing either:
 *
 *   - Inputs are still placed by the HOST one at a time, after the previous test's results were
 *     frozen. A forged `done` makes this driver finish the test EARLY — freezing the program's own
 *     output at that instant, with the clock stopped at that instant — which is the same as the
 *     program returning. The real `done` that follows mismatches the next `run`, and the JVM is
 *     killed. The per-process path has the identical property through `/proc/1/fd/1`.
 *   - A forged `ok` keeps a JVM alive in which a thread of test n survives into test n+1. That
 *     thread is the student's own program, and test n+1's program is too: anything the one can do
 *     with input n+1 the other can. Carrying state FORWARD between tests is already possible on the
 *     per-process path through `/tmp`, which persists for the container's life. Earlier tests'
 *     results are frozen by the host and never read again, so nothing can reach BACKWARDS.
 *   - Timing in `.meta` stays advisory, as it was: the host cross-checks the total against the
 *     daemon's own clock (`selfReportedTimingIsCredible`).
 *
 * Processes are checked here rather than trusted to the harness: after every harness test the
 * driver walks /proc, without forking, and any process that is neither PID 1 nor the harness ends
 * the harness for the rest of the submission.
 *
 * ## The wall-clock kill still lives in the container
 *
 * `read -t` on the harness's reply is bounded by the same per-test `timeout` plus a few seconds. It
 * is a bash builtin in PID 1, so nothing the program does can kill it, which is why this driver is
 * bash: dash, the `/bin/sh` of these images, has no `read -t` and no coprocesses.
 */

/** Must equal `Harness.PROTOCOL` in worker/jvm-harness; worker/jvm-driver.test.ts asserts it. */
export const HARNESS_PROTOCOL = 1;

/** Seconds the driver waits for the harness JVM to start and report `ready`. */
export const HARNESS_START_TIMEOUT_S = 20;

/** Seconds the driver waits for `ok`/`dirty` after `done` — the post-test checks and a full GC. */
export const HARNESS_SETTLE_TIMEOUT_S = 10;

/** Extra seconds past the per-test `timeout` before the driver gives up on the harness. */
export const HARNESS_BACKSTOP_GRACE_S = 5;

export const JVM_DRIVER = `#!/bin/bash
# Environment: PTCN_TESTS, PTCN_TIMEOUT (s per test), PTCN_CAP (bytes), PTCN_FEED_TIMEOUT (50ms polls),
#              PTCN_HARNESS_PROTOCOL, PTCN_HARNESS_START (s), PTCN_HARNESS_SETTLE (s),
#              PTCN_HARNESS_BACKSTOP (s).
# /in/run.sh runs one test as a process. /in/harness.sh starts the harness on fds 3 (in) and 4 (out).
# stdin carries the host's doorbell: one "go <n>" line per test.
set -u

mkdir -p /tmp/build

hpid=""
hin=""
hout=""

# Kill the harness and everything else this uid owns. PID 1 is this driver and is exempt.
harness_stop() {
  if [ -n "$hpid" ]; then
    kill -9 -1 2>/dev/null
    hpid=""
  fi
}

# True if any process exists besides this driver and the harness. No fork: a glob and a builtin.
stray_processes() {
  local p
  for p in /proc/[0-9]*; do
    case "\${p#/proc/}" in
      1|"$hpid") ;;
      *) [ -d "$p" ] && return 0 ;;
    esac
  done
  return 1
}

if [ -f /in/harness.sh ]; then
  coproc PTCN_H { exec /bin/sh /in/harness.sh 3<&0 4>&1 </dev/null >/dev/null 2>/dev/null; }
  hpid="$PTCN_H_PID"
  hin="\${PTCN_H[0]}"
  hout="\${PTCN_H[1]}"
  hello=""
  if ! read -r -t "$PTCN_HARNESS_START" -u "$hin" hello || [ "$hello" != "ready $PTCN_HARNESS_PROTOCOL" ]; then
    harness_stop
  fi
fi

# One test in the harness. Sets code and ms and returns 0 when the harness produced a result;
# returns 1 when it did not, and the caller runs the test as a process.
harness_test() {
  local reply="" state="" t0 t1
  t0=$EPOCHREALTIME
  printf 'run %s\\n' "$1" >&"$hout" 2>/dev/null || return 1
  read -r -t "$PTCN_HARNESS_BACKSTOP" -u "$hin" reply || return 1
  t1=$EPOCHREALTIME
  case "$reply" in
    "done $1 "*)
      code="\${reply#"done $1 "}"
      case "$code" in ''|*[!0-9]*) return 1 ;; esac
      [ "$code" -le 255 ] || return 1
      ;;
    "tle $1")
      code=124
      ;;
    *)
      return 1
      ;;
  esac
  ms=$(( (\${t1//[.,]/} - \${t0//[.,]/}) / 1000 ))
  if [ "$reply" = "tle $1" ]; then
    harness_stop
    return 0
  fi
  if ! read -r -t "$PTCN_HARNESS_SETTLE" -u "$hin" state || [ "$state" != "ok $1" ]; then
    harness_stop
  elif stray_processes; then
    harness_stop
  fi
  return 0
}

# One test as its own process: BATCH_DRIVER's loop body, unchanged.
process_test() {
  start=$(date +%s%N)
  timeout -k 1 "$PTCN_TIMEOUT" sh /in/run.sh < "/in/$1.in" > /tmp/ptcn-raw 2> /tmp/ptcn-err
  code=$?
  end=$(date +%s%N)
  ms=$(( (end - start) / 1000000 ))

  # Nothing the program started survives its test. PID 1 — this driver — is exempt by the kernel.
  kill -9 -1 2>/dev/null
}

i=1
while [ "$i" -le "$PTCN_TESTS" ]; do
  # The host's bell for THIS test, exactly as BATCH_DRIVER waits for it.
  if ! read -r bell; then break; fi
  if [ "$bell" != "go $i" ]; then break; fi

  waited=0
  while [ ! -f "/in/$i.in" ] && [ "$waited" -lt "$PTCN_FEED_TIMEOUT" ]; do
    sleep 0.05
    waited=$(( waited + 1 ))
  done

  mode=p
  if [ -n "$hpid" ] && harness_test "$i"; then
    mode=h
  else
    harness_stop
    process_test "$i"
  fi

  raw=$(wc -c < /tmp/ptcn-raw 2>/dev/null || echo 0)
  head -c "$PTCN_CAP" /tmp/ptcn-raw > "/out/$i.out" 2>/dev/null || : > "/out/$i.out"
  head -c 4096 /tmp/ptcn-err > "/out/$i.err" 2>/dev/null || : > "/out/$i.err"

  # The fourth field says which path judged the test. The host's parser reads the first three.
  printf '%s %s %s %s\\n' "$code" "$ms" "$raw" "$mode" > "/out/$i.meta"

  rm -f /tmp/ptcn-raw /tmp/ptcn-err
  printf 'ptcn-done %s\\n' "$i"
  i=$(( i + 1 ))
done

harness_stop

# Absence of this file tells the host the container died partway, and which tests to re-run
# individually so partial credit survives.
printf 'ok\\n' > /out/complete
`;

/** Which path judged a test, from the optional fourth `.meta` field. */
export type RunMode = "harness" | "process";

export function parseRunMode(metaLine: string): RunMode | null {
  const mode = metaLine.trim().split(/\s+/)[3];
  if (mode === "h") return "harness";
  if (mode === "p") return "process";
  return null;
}
