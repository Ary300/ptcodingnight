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
 * ## The rule: the harness is believed only when it says something good, and the kernel agrees
 *
 *   - `ready <protocol> <tid>`  said before any student code exists, so it is believed: the tid of
 *                          the JVM thread that runs every test, and (from /proc) the JVM's threads.
 *   - `done <n> <status>`  the test ended. The DRIVER then freezes the output itself — copies the
 *                          results to /out — and only then stops its own clock. Whatever the program
 *                          writes after `done` is not in its result; whatever is in its result was
 *                          written inside the time it is charged.
 *   - `ok <n>`             the harness found the JVM clean. Believed only if the kernel agrees: no
 *                          process but PID 1 and the JVM, exactly the threads the JVM had at
 *                          `ready`, and the main thread blocked (state S) and burning no CPU — read
 *                          from /proc, which nothing inside the JVM can forge.
 *   - `tle <n>`            the harness's watchdog fired at the same limit as `timeout` uses below.
 *                          Recorded as 124, exactly what `timeout` reports, and the JVM is killed.
 *   Anything else, or any check above failing — `dirty`, `abort`, garbage, end of file, silence past
 *   the backstop, a busy main thread — and NOTHING the harness said about the test is kept: the JVM
 *   is killed with everything else this uid owns, and the CURRENT test and every later one run as
 *   processes, whose results overwrite whatever was copied. So a harness that misbehaves, or a
 *   program that lies through it, costs time and never changes a verdict.
 *
 * ## What a hostile program can do here
 *
 * Student code runs inside the harness JVM, as the same uid as this driver. It can therefore write
 * forged replies into the harness's pipes, and with sun.misc.Unsafe it can rewrite the harness's
 * memory. The design does not depend on preventing either:
 *
 *   - Inputs are still placed by the HOST one at a time, after the previous test's results were
 *     frozen.
 *   - A forged `done` freezes the program's own output at that instant, with the clock stopped
 *     after the freeze. If the program then keeps running — the attack that would turn a TLE into
 *     an AC — the main thread is not idle, the result is discarded and the test runs as a process,
 *     where it is TLE exactly as before (G5: java-forged-done-busy).
 *   - A program that forges `done` and `ok` and then blocks forever on its main thread is
 *     indistinguishable from an idle harness, and is judged on the output it froze — the same
 *     result it would get by returning at that instant, so it gains nothing by it.
 *   - Carrying state FORWARD between tests is already possible on the per-process path through
 *     `/tmp`, which persists for the container's life. Earlier tests' results are frozen by the
 *     host and never read again, so nothing can reach BACKWARDS.
 *   - Timing in `.meta` stays advisory, as it was: the host cross-checks the total against the
 *     daemon's own clock (`selfReportedTimingIsCredible`).
 *
 * ## The wall-clock kill still lives in the container
 *
 * `read -t` on the harness's reply is bounded by the same per-test `timeout` plus a few seconds. It
 * is a bash builtin in PID 1, so nothing the program does can kill it, which is why this driver is
 * bash: dash, the `/bin/sh` of these images, has no `read -t` and no coprocesses.
 */

/** Must equal `Harness.PROTOCOL` in worker/jvm-harness; worker/jvm-driver.test.ts asserts it. */
export const HARNESS_PROTOCOL = 2;

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
mtid=""
tids=""
baseline=""
copied=0

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

# The harness JVM's threads, as the KERNEL lists them, into $tids. No fork.
list_tids() {
  local t
  tids=""
  for t in /proc/"$hpid"/task/[0-9]*; do
    tids="$tids \${t##*/}"
  done
}

# True if the JVM's main thread is blocked and burning no CPU: back in the harness's own wait, not
# still running the program. Read from /proc, which nothing inside the JVM can forge. A program that
# makes the harness say "done" and keeps computing is caught here and judged as a process instead.
# The 1-3 ms pauses are reads on the harness's reply pipe: the harness says nothing unasked after
# "ok", so a line arriving there is a forgery and fails the check.
main_idle() {
  local i=0 line rest st run1 run2 junk
  while [ "$i" -lt 50 ]; do
    i=$(( i + 1 ))
    read -r line < "/proc/$hpid/task/$mtid/stat" || return 1
    rest="\${line##*) }"
    st="\${rest%% *}"
    if [ "$st" = S ]; then
      read -r run1 junk < "/proc/$hpid/task/$mtid/schedstat" || return 1
      if read -r -t 0.003 -u "$hin" junk; then return 1; fi
      read -r line < "/proc/$hpid/task/$mtid/stat" || return 1
      rest="\${line##*) }"
      st="\${rest%% *}"
      read -r run2 junk < "/proc/$hpid/task/$mtid/schedstat" || return 1
      if [ "$st" = S ] && [ $(( run2 - run1 )) -lt 1000000 ]; then return 0; fi
    elif read -r -t 0.001 -u "$hin" junk; then
      return 1
    fi
  done
  return 1
}

if [ -f /in/harness.sh ]; then
  coproc PTCN_H { exec /bin/sh /in/harness.sh 3<&0 4>&1 </dev/null >/dev/null 2>/dev/null; }
  hpid="$PTCN_H_PID"
  hin="\${PTCN_H[0]}"
  hout="\${PTCN_H[1]}"
  hello=""
  # "ready <protocol> <tid of the JVM's main thread>". Said before any student code exists, so it
  # is the one line from the harness that is believed without corroboration.
  if read -r -t "$PTCN_HARNESS_START" -u "$hin" hello; then
    case "$hello" in
      "ready $PTCN_HARNESS_PROTOCOL "*) mtid="\${hello##* }" ;;
    esac
  fi
  case "$mtid" in
    ''|*[!0-9]*) harness_stop ;;
    *)
      if [ -r "/proc/$hpid/task/$mtid/schedstat" ]; then
        list_tids
        baseline="$tids"
      else
        harness_stop
      fi
      ;;
  esac
fi

# A test's results, from the files its program wrote, into /out — BATCH_DRIVER's three lines.
copy_out() {
  raw=$(wc -c < /tmp/ptcn-raw 2>/dev/null || echo 0)
  head -c "$PTCN_CAP" /tmp/ptcn-raw > "/out/$i.out" 2>/dev/null || : > "/out/$i.out"
  head -c 4096 /tmp/ptcn-err > "/out/$i.err" 2>/dev/null || : > "/out/$i.err"
}

# One test in the harness. Sets code and ms, copies the results out and returns 0 when the harness
# produced a result that every check below corroborates. Returns 1 otherwise, having kept NOTHING:
# the caller kills the JVM and runs the test as a process, whose results overwrite these.
harness_test() {
  local reply="" state="" t0 t1
  t0=$EPOCHREALTIME
  printf 'run %s\\n' "$1" >&"$hout" 2>/dev/null || return 1
  read -r -t "$PTCN_HARNESS_BACKSTOP" -u "$hin" reply || return 1
  case "$reply" in
    "done $1 "*)
      code="\${reply#"done $1 "}"
      case "$code" in ''|*[!0-9]*) return 1 ;; esac
      [ "$code" -le 255 ] || return 1
      # The output is frozen HERE, by this driver, and the clock stops only once it is: whatever
      # the program writes after "done" is not in its result, and whatever is in its result was
      # written inside the time it is charged. A forged "done" freezes the program's own output.
      copy_out
      t1=$EPOCHREALTIME
      ;;
    "tle $1")
      # The harness's watchdog, at the same limit as timeout. Kept: 124 is what timeout reports,
      # and a forged one only costs the program its own test.
      t1=$EPOCHREALTIME
      ms=$(( (\${t1//[.,]/} - \${t0//[.,]/}) / 1000 ))
      code=124
      harness_stop
      return 0
      ;;
    *)
      return 1
      ;;
  esac
  ms=$(( (\${t1//[.,]/} - \${t0//[.,]/}) / 1000 ))

  # Corroboration. Any failure discards the result above.
  read -r -t "$PTCN_HARNESS_SETTLE" -u "$hin" state || return 1
  [ "$state" = "ok $1" ] || return 1
  if stray_processes; then return 1; fi
  list_tids
  [ "$tids" = "$baseline" ] || return 1
  main_idle || return 1
  copied=1
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
  copied=0
  if [ -n "$hpid" ] && harness_test "$i"; then
    mode=h
  else
    harness_stop
    copied=0
    process_test "$i"
  fi
  if [ "$copied" -eq 0 ]; then
    copy_out
  fi

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
