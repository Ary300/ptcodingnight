#!/usr/bin/env bash
#
# Prepare every judge runtime image on this host.
#
# This must run BEFORE the night, on the machine that will judge — not because the room is
# offline (it is not; PRD §10.1 guarantees internet) but because the Go image is built rather
# than pulled and takes minutes. It does two things:
#
#   1. Pulls the stock images the registry names.
#   2. Builds the images we derive ourselves — currently just Go, which needs a pre-warmed
#      build cache to be judgeable at all (see docker/go/Dockerfile).
#
# `--verify` then asserts two DIFFERENT properties, and neither one implies the other:
#
#   a. Structural — $GOCACHE/trim.txt resolves into tmpfs. Go rewrites that file 24 hours after
#      the trim it records, and on the read-only rootfs the write fails, `go build` exits 1, and
#      the judge reports CE on correct code. A behavioural check CANNOT catch this, because any
#      check run just after a build sits inside the 24-hour window where it is invisible.
#   b. Behavioural — the warm cache is actually being hit. A missed cache does not fail loudly
#      either: it turns a 3-second build into a 66-second one and eventually reports CE on a
#      correct program by blowing compileTimeoutMs.
#
# Both failures look identical to the student — CE on a correct program — and neither announces
# itself. Verifying is not optional politeness.
#
# Usage:
#   scripts/build-judge-images.sh            # pull + build
#   scripts/build-judge-images.sh --verify   # pull + build, then prove the Go cache is warm

set -euo pipefail

cd "$(dirname "$0")/.."

# Kept in step with lib/judge/runtimes.ts by the test in worker/runner.test.ts, which reads
# both and fails if an image named in the registry is missing here.
#
# Each entry is <tag>@<digest>, and the digest is the point. A tag floats: a re-pull on a new
# host can land a newer toolchain that rejects code the old one accepted, and contest night is
# not when to discover that. Every digest below was resolved from the LOCAL image that the
# gates were run against (docker image inspect --format '{{.RepoDigests}}'), so a fresh host
# pulls exactly the bytes that were proven to work — never "whatever the tag points at today".
#
# ptcn-go:1.23 is absent from this list on purpose: it is BUILT below, not pulled, so it has no
# registry digest to pin. Its base image is pinned by digest in docker/go/Dockerfile instead.
#
# To re-pin after a deliberate upgrade: pull the new tag, run the full gate suite against it,
# then copy the digest docker reports for the image that passed.
STOCK_IMAGES=(
  "python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de"
  "eclipse-temurin:21-jdk@sha256:da9d3a4f7650db39b918fc5a2c3da76556fb8cc8e5f3767cdea0bb409286951a"
  "gcc:14@sha256:1ea81e094f614fd2ed066316651dbac8eecb4d36add2ddd8a26151374c85c52c"
  "node:22-slim@sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46"
)

# Threshold for --verify, in seconds. A warm build measured 2.5-11.8 s on Docker Desktop; a
# cold one measured 65.8 s. 30 s sits well clear of both, so this fails on a genuinely missed
# cache rather than on a slow host.
GO_WARM_CEILING_S=30

if ! docker ps >/dev/null 2>&1; then
  echo "FAIL  the Docker daemon is not running — start it and re-run" >&2
  exit 1
fi

echo "==> pulling stock runtime images (pinned by digest)"
for pinned in "${STOCK_IMAGES[@]}"; do
  tag="${pinned%%@*}"       # what the registry in lib/judge/runtimes.ts names
  digest="${pinned#*@}"     # the bytes that were proven to work
  repo="${tag%%:*}"
  printf '    %-26s ' "$tag"
  if docker image inspect "$tag" >/dev/null 2>&1; then
    # Present images are checked against the pin rather than trusted: a tag that was re-pulled
    # elsewhere may already have drifted, and a drifted toolchain fails in ways no gate points
    # at. A mismatch WARNS rather than fails — the operator may be mid-upgrade on purpose — but
    # it never passes silently.
    local_digests=$(docker image inspect --format '{{join .RepoDigests ","}}' "$tag" 2>/dev/null || true)
    case "$local_digests" in
      *"$digest"*)
        echo "present (matches pin)"
        ;;
      *)
        echo "present, DIGEST DOES NOT MATCH PIN"
        cat >&2 <<EOF
WARN  local ${tag} is ${local_digests:-<no RepoDigest>}
      but this script pins ${digest}.
      The pin names the exact bytes the gates were run against. If this drift is not a
      deliberate upgrade, re-pull the pinned digest; if it is, re-run the gates against the
      new image and update the pin here.
EOF
        ;;
    esac
  elif docker pull -q "${repo}@${digest}" >/dev/null 2>&1; then
    # A pull by digest fetches exactly the proven bytes but leaves them untagged, so restore
    # the tag the worker will ask for.
    docker tag "${repo}@${digest}" "$tag"
    echo "pulled by digest"
  else
    echo "FAILED"
    echo "FAIL  could not pull ${repo}@${digest}" >&2
    exit 1
  fi
done

echo
echo "==> building ptcn-go:1.23 (pre-warms the Go build cache; takes a few minutes)"
if docker build -q -t ptcn-go:1.23 docker/go/ >/dev/null; then
  size=$(docker run --rm ptcn-go:1.23 du -sh /opt/gocache 2>/dev/null | cut -f1)
  echo "    ptcn-go:1.23               built, warm cache ${size:-unknown}"
else
  echo "FAIL  could not build ptcn-go:1.23" >&2
  exit 1
fi

if [ "${1:-}" != "--verify" ]; then
  echo
  echo "Done. Run with --verify to prove the Go cache is warm before you rely on it."
  exit 0
fi

echo
echo "==> verifying runtime cache state is writable where it has to be"

# ---------------------------------------------------------------------------------------------
# Why this check exists, and why the timing check below cannot replace it.
#
# Go rewrites $GOCACHE/trim.txt when the trim it records is over 24 hours old. GOCACHE sits on
# the read-only rootfs deliberately, so that write fails, `go build` exits 1, and the runner
# reads a non-zero exit as CE — on a correct program whose binary built fine. docker/go/Dockerfile
# symlinks trim.txt into tmpfs so the write lands.
#
# THE TIMING CHECK BELOW CANNOT CATCH THIS. It runs seconds after the image is built, when the
# recorded trim is seconds old and Go therefore skips the trim entirely. Every build-time check
# is inside the 24-hour window where the bug is invisible by construction. So the property has to
# be asserted STRUCTURALLY — trim.txt resolves off the rootfs — rather than observed behaviourally.
#
# A rebuild that drops the symlink would otherwise pass every gate on the day it was built and
# fail during the contest.
# ---------------------------------------------------------------------------------------------

printf '    %-26s ' "go123 trim.txt"
trim_target=$(docker run --rm --entrypoint sh ptcn-go:1.23 -c 'readlink -f /opt/gocache/trim.txt' 2>/dev/null || true)
case "$trim_target" in
  /tmp/*)
    echo "-> ${trim_target} (tmpfs, writable)"
    ;;
  *)
    echo "FAILED"
    cat >&2 <<EOF
FAIL  /opt/gocache/trim.txt resolves to "${trim_target:-<unreadable>}", which is on the
      READ-ONLY rootfs rather than in tmpfs.

      Go rewrites that file when its recorded trim is over 24 hours old. On a read-only rootfs
      the write fails, \`go build\` exits 1, and the judge reports CE on correct code — starting
      exactly 24 hours after this image was built, and not one minute before.

      This image will pass every gate today and fail during the contest.

      Fix: restore the \`ln -sf /tmp/gocache-trim.txt /opt/gocache/trim.txt\` line in
      docker/go/Dockerfile and rebuild. Do not just rebuild — a rebuild alone resets the clock
      for 24 hours, which is a countdown rather than a repair.
EOF
    exit 1
    ;;
esac

# The stock runtimes need no equivalent, and this was checked rather than assumed: none of
# python:3.12-slim, eclipse-temurin:21-jdk, gcc:14 or node:22-slim ships a cache directory or
# sets a cache environment variable, so none of them has state on the rootfs to go stale. Go is
# the only runtime carrying a baked cache — which is the whole reason we build it ourselves.
# If a future runtime arrives with one (a Rust image with a warm registry, say), it needs its own
# clause above, not a note here.
printf '    %-26s %s\n' "stock runtimes" "no runtime cache state on the rootfs — nothing to rot"

echo
echo "==> verifying the Go build cache is warm"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The compile command is READ FROM THE REGISTRY, never retyped here.
#
# This check existed to prove the warm cache is used by the real judge, and it was doing so
# against a hand-copied approximation of the judge's command. That is not a smaller version of
# the same test, it is a different test: whatever this script measured, it was not what students
# get. `scripts/print-compile-command.ts` prints the one string `worker/runner.ts` writes into
# compile.sh, and worker/runtime-sync.test.ts fails if anyone reintroduces a literal `go build`
# here.
GO_COMPILE="$(npx --yes tsx scripts/print-compile-command.ts GO_123 2>/dev/null)" || GO_COMPILE=""
if [ -z "$GO_COMPILE" ]; then
  echo "FAIL  could not read the Go compile command from lib/judge/runtimes.ts" >&2
  echo "      This check must run the judge's own command; it does not carry a copy." >&2
  exit 1
fi

cat > "$work/main.go" <<'GO'
package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	r := bufio.NewReader(os.Stdin)
	var a, b int64
	fmt.Fscan(r, &a, &b)
	fmt.Println(a + b)
}
GO
chmod -R a+rX "$work"

# --cpus follows the HOST. Docker does not clamp this, it refuses: "range of CPUs is from 0.01 to
# 2.00, as there are only 2 CPUs available". A hardcoded 4 meant this script could not run at all
# on the 2-vCPU box the contest is hosted on, and the refusal was reported as "did not compile".
CPUS="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)"
[ "$CPUS" -lt 1 ] 2>/dev/null && CPUS=1

# The judge writes its artifact to /build, so the check mounts one — again, matching the real
# path rather than redirecting the output somewhere more convenient.
mkdir -p "$work/build"
chmod a+rwx "$work/build"

# stderr is CAPTURED, not discarded. `2>/dev/null` here turned two separate real failures — a
# refused --cpus and a Go module error — into the same "did not compile at all" with the cause
# thrown away, which cost two rounds of diagnosis on a live deployment.
go_stderr="$work/stderr.txt"
elapsed=$(docker run --rm --network=none --read-only \
  --tmpfs=/tmp:rw,noexec,nosuid,size=256m --user=65534:65534 --cap-drop=ALL \
  --security-opt=no-new-privileges --pids-limit=512 --memory=1024m --memory-swap=1024m \
  --cpus="$CPUS" \
  --env=HOME=/tmp --env=TMPDIR=/tmp -v "$work:/work:ro" -v "$work/build:/build:rw" \
  ptcn-go:1.23 sh -c "S=\$(date +%s%N)
${GO_COMPILE} || exit 1
E=\$(date +%s%N); echo \$(( (E-S)/1000000 ))" 2>"$go_stderr") || {
  echo "FAIL  the verification build did not compile." >&2
  echo "      Command (from lib/judge/runtimes.ts, GO_123):" >&2
  echo "        ${GO_COMPILE}" >&2
  echo "      Host cpus: ${CPUS}" >&2
  echo "      docker/go stderr:" >&2
  sed 's/^/        /' "$go_stderr" >&2
  echo >&2
  echo "      This is the command the JUDGE runs, so a failure here is a failure students get." >&2
  exit 1
}

echo "    warm Go build: ${elapsed} ms (ceiling ${GO_WARM_CEILING_S}000 ms)"

if [ "$elapsed" -gt $((GO_WARM_CEILING_S * 1000)) ]; then
  cat >&2 <<EOF
FAIL  the Go build cache is NOT being used.

      ${elapsed} ms is in cold-cache territory. Every Go submission will be this slow and some
      will report CE on correct code when they exceed go123.compileTimeoutMs.

      The usual cause is a flag mismatch: build flags are part of Go's cache key, so any flag
      in the registry's compileCommand that docker/go/Dockerfile did not also use misses the
      entire cache. Compare GOFLAGS and the build flags in both.
EOF
  exit 1
fi

echo
echo "PASS  all judge images ready, Go cache warm"
