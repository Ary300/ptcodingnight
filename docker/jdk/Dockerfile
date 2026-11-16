# Java judge runtime: eclipse-temurin:21-jdk plus two trusted programs of ours.
#
#   /opt/ptcn/harness.jar         the in-JVM test harness (worker/jvm-harness): runs every test of a
#                                 Java 21 submission inside one JVM, each against a fresh class
#                                 loader, instead of starting a JVM per test.
#   /opt/ptcn/javac-service.jar   the warm compiler (worker/javac-service): compiles submission
#                                 after submission through javac's own entry point in one JVM.
#
# Both are compiled HERE, into the read-only rootfs, so a submission can neither replace nor shadow
# them: they load from the module path, never from /build, and neither package is exported.
#
# The build context is worker/. scripts/build-judge-images.sh passes the SHA-256 of both source
# trees as HARNESS_SOURCE_SHA256, and --verify fails unless the image carries the hash of the source
# in the repo today, so either program edited without a rebuild is caught structurally. If either
# jar is missing the worker falls back to what it did without it — a JVM per test, a container per
# compile — which is slower and otherwise identical.
#
# Pinned by digest, the same bytes scripts/build-judge-images.sh pins for eclipse-temurin:21-jdk.
FROM eclipse-temurin:21-jdk@sha256:da9d3a4f7650db39b918fc5a2c3da76556fb8cc8e5f3767cdea0bb409286951a

ARG HARNESS_SOURCE_SHA256

COPY jvm-harness /opt/ptcn/src/harness/
COPY javac-service /opt/ptcn/src/javacsvc/

RUN test -n "$HARNESS_SOURCE_SHA256" \
 && mkdir -p /opt/ptcn/classes/harness /opt/ptcn/classes/javacsvc \
 && javac --release 21 -Xlint:all,-removal -Werror -d /opt/ptcn/classes/harness \
      /opt/ptcn/src/harness/module-info.java /opt/ptcn/src/harness/ptcn/harness/*.java \
 && jar --create --file /opt/ptcn/harness.jar -C /opt/ptcn/classes/harness . \
 && javac --release 21 -Xlint:all -Werror -d /opt/ptcn/classes/javacsvc \
      /opt/ptcn/src/javacsvc/module-info.java /opt/ptcn/src/javacsvc/ptcn/javac/*.java \
 && jar --create --file /opt/ptcn/javac-service.jar -C /opt/ptcn/classes/javacsvc . \
 && rm -rf /opt/ptcn/classes /opt/ptcn/src \
 && printf '%s\n' "$HARNESS_SOURCE_SHA256" > /opt/ptcn/harness.sha256 \
 && chmod -R a+rX /opt/ptcn
