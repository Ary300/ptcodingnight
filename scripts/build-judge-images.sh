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
STOCK_IMAGES=(
  "python:3.12-slim"
  "eclipse-temurin:21-jdk"
  "gcc:14"
  "node:22-slim"
)

# Threshold for --verify, in seconds. A warm build measured 2.5-11.8 s on Docker Desktop; a
# cold one measured 65.8 s. 30 s sits well clear of both, so this fails on a genuinely missed
# cache rather than on a slow host.
GO_WARM_CEILING_S=30

if ! docker ps >/dev/null 2>&1; then
  echo "FAIL  the Docker daemon is not running — start it and re-run" >&2
  exit 1
fi

echo "==> pulling stock runtime images"
for image in "${STOCK_IMAGES[@]}"; do
  printf '    %-26s ' "$image"
  if docker image inspect "$image" >/dev/null 2>&1; then
    echo "present"
  elif docker pull -q "$image" >/dev/null 2>&1; then
    echo "pulled"
  else
    echo "FAILED"
    echo "FAIL  could not pull $image" >&2
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

# Same flags and same GOCACHE the real judge uses. Measuring with anything else would measure
# something other than what students get.
elapsed=$(docker run --rm --network=none --read-only \
  --tmpfs=/tmp:rw,noexec,nosuid,size=256m --user=65534:65534 --cap-drop=ALL \
  --security-opt=no-new-privileges --pids-limit=512 --memory=1024m --memory-swap=1024m --cpus=4 \
  --env=HOME=/tmp --env=TMPDIR=/tmp -v "$work:/work:ro" \
  ptcn-go:1.23 sh -c 'S=$(date +%s%N)
GOCACHE=/opt/gocache GOTMPDIR=/tmp GOPATH=/tmp/gopath GOMAXPROCS=4 go build -o /tmp/prog /work/main.go || exit 1
E=$(date +%s%N); echo $(( (E-S)/1000000 ))' 2>/dev/null) || {
  echo "FAIL  the verification build did not compile at all" >&2
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
