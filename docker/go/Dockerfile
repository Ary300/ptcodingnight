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
# Build with scripts/build-judge-images.sh. The night has no internet (docs/PRD.md §10), so
# this is built ahead of time exactly as every other runtime image is pulled ahead of time.
FROM golang:1.23-bookworm

ENV GOCACHE=/opt/gocache

WORKDIR /warm
COPY warm.go .

RUN go build std \
 && go build -o /dev/null warm.go \
 && rm -rf /warm \
 && chmod -R a+rX /opt/gocache
