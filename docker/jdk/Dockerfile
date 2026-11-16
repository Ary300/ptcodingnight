# Java judge runtime: eclipse-temurin:21-jdk plus the in-JVM test harness.
#
# The harness (worker/jvm-harness) runs every test of a Java 21 submission inside one JVM, each
# against a fresh class loader, instead of starting a JVM per test. It is compiled HERE, into the
# read-only rootfs at /opt/ptcn/harness.jar, so a submission can neither replace it nor shadow it:
# it is loaded from the module path, never from /build, and its package is not exported.
#
# The build context is worker/jvm-harness. scripts/build-judge-images.sh passes the SHA-256 of that
# source tree as HARNESS_SOURCE_SHA256, and --verify fails unless the image carries the hash of the
# source in the repo today — a harness edited without a rebuild is caught structurally, before any
# submission meets it. If the jar is missing altogether the driver runs every test as its own
# process, which is slower and otherwise identical.
#
# Pinned by digest, the same bytes scripts/build-judge-images.sh pins for eclipse-temurin:21-jdk.
FROM eclipse-temurin:21-jdk@sha256:da9d3a4f7650db39b918fc5a2c3da76556fb8cc8e5f3767cdea0bb409286951a

ARG HARNESS_SOURCE_SHA256

COPY . /opt/ptcn/src/

RUN test -n "$HARNESS_SOURCE_SHA256" \
 && mkdir -p /opt/ptcn/classes \
 && javac --release 21 -Xlint:all,-removal -Werror -d /opt/ptcn/classes \
      /opt/ptcn/src/module-info.java /opt/ptcn/src/ptcn/harness/*.java \
 && jar --create --file /opt/ptcn/harness.jar -C /opt/ptcn/classes . \
 && rm -rf /opt/ptcn/classes /opt/ptcn/src \
 && printf '%s\n' "$HARNESS_SOURCE_SHA256" > /opt/ptcn/harness.sha256 \
 && chmod -R a+rX /opt/ptcn
