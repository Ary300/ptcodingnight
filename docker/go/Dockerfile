# Go judge runtime with a pre-warmed build cache.
#
# Since Go 1.20 the standard library is NOT shipped pre-compiled; the build cache is
# populated on first build. Every submission gets a fresh container with an empty cache, so
# the plain `golang:1.23-bookworm` image recompiles std from scratch every single time:
# measured 94-127s at --cpus=1, 44s at --cpus=4 on Docker Desktop. Not a judgeable latency.
#
# This image pre-compiles std AND links a representative solution at image-build time, into a
# world-readable cache at /opt/gocache. A submission's build then compiles only the student's
# own package. Measured on this host: 94-127s cold -> ~1s warm.
#
# GOCACHE stays on the READ-ONLY rootfs at run time. Go reads a cache it cannot write to
# without complaint; the one new entry (the student's package) goes to GOTMPDIR in tmpfs.
#
# GOFLAGS must be IDENTICAL here and in worker/runner.ts's compile command. The flags are part
# of the cache key, so a mismatch silently misses every entry and puts the 94s back.
#
# Build with scripts/build-judge-images.sh, ahead of the night, on the machine that will judge —
# not because the room is offline (it is not; PRD §10.1 guarantees internet) but because this
# takes minutes, it is built rather than pulled, and the judging path makes no third-party call.
#
# ## The trim.txt symlink, and why the image ROTS ON A TIMER without it
#
# Go trims its build cache when the timestamp recorded in $GOCACHE/trim.txt is more than 24
# hours old, and a trim REWRITES trim.txt. GOCACHE is on the read-only rootfs on purpose, so
# that write fails with EACCES, `go build` exits 1 — and the runner reads a non-zero exit as CE.
# The binary is built correctly and is sitting in /build; only the exit code is wrong.
#
# So every correct Go submission reports Compile Error, starting exactly 24 hours after this
# image is built and not one minute before. Measured on one unchanged commit: G4 57/57 against a
# fresh image, 52/57 against the same image 25.5 hours later.
#
# Pointing trim.txt into the tmpfs the container already has lets the trim's write land. The
# trim's own deletions still fail on the read-only rootfs and Go ignores those errors, so the
# warm cache stays warm — read-only goes on protecting it, which is why GOCACHE lives here.
#
# Do NOT "fix" this by rebuilding before the night. A rebuild resets the clock for 24 hours: a
# countdown, not a repair. `--verify` asserts this symlink resolves off the rootfs, because a
# rebuild that silently drops it looks perfect for a day and then fails during the contest.
# Pinned by digest, resolved from the image already proven on this host (docker inspect
# RepoDigests), never from a fresh pull. The tag alone floats: a re-pull can land a newer
# toolchain that rejects code the old one accepted, or shifts the std build cache this image
# exists to pre-warm — and contest night is not when to discover either. The tag stays in the
# reference purely as documentation of what the digest is.
FROM golang:1.23-bookworm@sha256:167053a2bb901972bf2c1611f8f52c44d5fe7e762e5cab213708d82c421614db

ENV GOCACHE=/opt/gocache

WORKDIR /warm
COPY warm.go .

RUN go build std \
 && go build -o /dev/null warm.go \
 && rm -rf /warm \
 && chmod -R a+rX /opt/gocache \
 && ln -sf /tmp/gocache-trim.txt /opt/gocache/trim.txt
