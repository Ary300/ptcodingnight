#!/usr/bin/env bash
#
# Can the judge container WRITE where the compiler has to write?
#
# ## The failure this exists to name
#
# The judge stages each job into a scratch directory on the host and bind-mounts parts of it into
# containers that run as `--user=65534:65534`. If the build directory is not writable by that uid,
# the compiler cannot emit its binary:
#
#     /usr/bin/ld: cannot open output file /build/prog: Permission denied
#
# which reaches the student as **CE on correct code** — for Java, C, C++ and Go, and not for
# Python or JavaScript, because their compile step writes nothing. A language-shaped symptom with
# a permissions cause, and a bare "Compile Error" points nowhere near it.
#
# It cannot be caught on Docker Desktop, which rewrites ownership across its VM boundary. It
# appears on real Linux, which is every deployment that matters. So this is a PREFLIGHT rather
# than a gate: it runs before the judging gates, on the host that will do the judging.
#
# Usage: scripts/check-judge-scratch.sh [scratch-root]

set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="${1:-${JUDGE_SCRATCH_ROOT:-$PWD/.judge-tmp}}"
UID_IN_CONTAINER=65534

printf '    %-30s ' "judge scratch writable"

# Pulled BEFORE the probe, and quietly. Docker writes its pull progress to stderr, which the probe
# captures with 2>&1 — so a first run on a clean host mixed "Pulling from library/alpine" into the
# result and reported a failure whose own output said "ok" three lines further down. A check that
# cries wolf about the bug it exists to find is worse than no check.
docker image inspect alpine:3 >/dev/null 2>&1 || docker pull -q alpine:3 >/dev/null 2>&1 || true

mkdir -p "$ROOT"
probe="$(mktemp -d "${ROOT}/preflight-XXXXXX")"
cleanup() {
  # Fall back to a root container: the probe may have left files owned by 65534 that this user
  # cannot unlink, which is the mirror image of the bug being tested for.
  rm -rf "$probe" 2>/dev/null || docker run --rm --user=0:0 -v "$probe:/scratch" alpine:3 \
    sh -c 'rm -rf /scratch/* /scratch/.[!.]* 2>/dev/null; exit 0' >/dev/null 2>&1 || true
  rm -rf "$probe" 2>/dev/null || true
}
trap cleanup EXIT

# The same shape the runner creates: a 0711 workspace with a build directory inside it.
chmod 0711 "$probe"
mkdir -p "$probe/build"
chmod 0777 "$probe/build"

if out="$(docker run --rm --network=none --read-only \
  --tmpfs=/tmp:rw,noexec,nosuid,size=16m \
  --user="${UID_IN_CONTAINER}:${UID_IN_CONTAINER}" --cap-drop=ALL \
  --security-opt=no-new-privileges --pids-limit=64 --memory=256m --memory-swap=256m \
  -v "$probe/build:/build:rw" alpine:3 \
  sh -c 'printf x > /build/probe && echo ok' 2>&1)"; then
  # The LAST line, not the whole capture: anything the daemon prints before the container starts
  # is noise, and the probe's own answer is the final word.
  if [ "$(printf '%s\n' "$out" | tail -1)" = "ok" ]; then
    echo "ok (uid ${UID_IN_CONTAINER} can write /build)"
    exit 0
  fi
fi

echo "FAILED"
mode="$(stat -c '%a %U:%G' "$probe/build" 2>/dev/null || stat -f '%Lp %Su:%Sg' "$probe/build" 2>/dev/null || echo '?')"
cat >&2 <<EOF

FAIL  the judge container cannot write to its build directory.

      scratch root : ${ROOT}
      probe dir    : ${probe}/build
      mode / owner : ${mode}
      container uid: ${UID_IN_CONTAINER}
      docker said  : ${out}

      EVERY COMPILED LANGUAGE WILL REPORT CE ON CORRECT CODE. Java, C, C++ and Go emit a binary
      and cannot; Python and JavaScript will pass, because their compile step writes nothing —
      so this looks like a language problem and is not.

      Usual causes:
        - the scratch root is on a filesystem mounted nosuid/noexec or read-only
        - the root is owned by a user the container uid cannot write under, and the per-job
          directories inherited a restrictive mode from it
        - JUDGE_SCRATCH_ROOT points somewhere the Docker daemon resolves differently than this
          shell does (a containerised worker MUST use a path identical on both sides)

      worker/runner.ts sets the per-job build and result directories to 0777 explicitly for this
      reason; if that is still failing, the parent or the filesystem is the constraint.
EOF
exit 1
