import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parseClass } from "./jvm-classfile";

/**
 * Which compiled Java submissions the in-JVM harness may judge, decided on the HOST from the class
 * files before the run container starts.
 *
 * The harness reproduces a fresh JVM for everything a contest program ordinarily touches. A few
 * APIs reach state it cannot give each test afresh, or reach the process's real file descriptors
 * instead of System.in/out. A submission whose class files name any of them is judged exactly as
 * before — one process per test — and pays nothing for having been looked at.
 *
 * The check is a byte search of the class files for the names below. Every class, method and
 * field a class file refers to, and every string literal, is stored in its constant pool as plain
 * bytes, so code that calls one of these APIs directly cannot avoid naming it. A match in an
 * unrelated place (a string literal, a method of the student's own called `exec`) only costs speed.
 * Code that reaches an API through reflection with a computed name is not caught here; it gains
 * nothing a per-process program does not already have (see worker/jvm-driver.ts).
 */

interface DeclineRule {
  /** Every token must appear somewhere in the submission's class files. */
  readonly all: readonly string[];
  readonly reason: string;
}

const RULES: readonly DeclineRule[] = [
  // The real fds 0/1/2 of the harness JVM are /dev/null, so these would read and write nothing.
  { all: ["java/io/FileDescriptor"], reason: "uses FileDescriptor.in/out/err directly" },
  { all: ["/dev/std"], reason: "opens /dev/stdin or /dev/stdout by path" },
  { all: ["/proc/self/fd"], reason: "opens a file descriptor by path" },
  { all: ["/dev/fd/"], reason: "opens a file descriptor by path" },
  { all: ["inheritedChannel"], reason: "uses System.inheritedChannel" },
  // A child process inherits the JVM's own descriptors, and outlives the test.
  { all: ["java/lang/Process"], reason: "starts a process" },
  { all: ["java/lang/Runtime", "exec"], reason: "starts a process" },
  // Read once at class initialization and cached JVM-wide: a property set by the student (the
  // useLegacyMergeSort trick is the common one) acts differently if an earlier test, or the
  // harness, initialized the class first.
  { all: ["setProperty"], reason: "sets a system property" },
  { all: ["setProperties"], reason: "replaces the system properties" },
  { all: ["clearProperty"], reason: "clears a system property" },
  { all: ["java/util/logging"], reason: "uses java.util.logging, whose handlers are JVM-wide" },
  { all: ["java/lang/System$Logger"], reason: "uses System.Logger" },
  { all: ["java/util/Locale", "setDefault"], reason: "changes the default locale" },
  { all: ["java/util/TimeZone", "setDefault"], reason: "changes the default time zone" },
  { all: ["addShutdownHook"], reason: "registers a shutdown hook" },
  // The harness's SecurityManager and its watchdog thread are visible through these.
  { all: ["SecurityManager"], reason: "inspects the security manager" },
  { all: ["getAllStackTraces"], reason: "enumerates threads" },
  { all: ["activeCount"], reason: "enumerates threads" },
  { all: ["enumerate"], reason: "enumerates threads" },
  { all: ["getStackTrace"], reason: "inspects stack frames" },
  { all: ["StackWalker"], reason: "inspects stack frames" },
  { all: ["threadId"], reason: "reads a thread id" },
  { all: ["java/lang/Thread", "getId"], reason: "reads a thread id" },
  // Virtual threads are invisible to Thread.getAllStackTraces, so the harness could not tell
  // whether one outlived its test.
  { all: ["ofVirtual"], reason: "starts a virtual thread" },
  { all: ["startVirtualThread"], reason: "starts a virtual thread" },
  { all: ["VirtualThread"], reason: "starts a virtual thread" },
  { all: ["newThreadPerTaskExecutor"], reason: "starts a virtual thread" },
  // Values that differ between a fresh JVM and a reused one.
  { all: ["identityHashCode"], reason: "reads identity hash codes" },
  { all: ["freeMemory"], reason: "reads heap occupancy" },
  { all: ["totalMemory"], reason: "reads heap occupancy" },
  { all: ["java/lang/management"], reason: "uses JVM management beans" },
  { all: ["sun/misc/"], reason: "uses JDK internals" },
  { all: ["jdk/internal/"], reason: "uses JDK internals" },
];

const ENCODED = RULES.map((rule) => ({
  reason: rule.reason,
  all: rule.all.map((token) => Buffer.from(token, "latin1")),
}));

/** The reason a set of class files must be judged per process, or null if the harness may judge it. */
export function declineReason(classFiles: readonly Buffer[]): string | null {
  for (const rule of ENCODED) {
    const hit = rule.all.every((token) => classFiles.some((bytes) => bytes.includes(token)));
    if (hit) return rule.reason;
  }
  return null;
}

/**
 * Read every `.class` file under the build directory and decide.
 *
 * Any failure to read counts as a decline: the cost of a wrong "no" is speed, the cost of a wrong
 * "yes" could be a verdict.
 */
export async function harnessDeclineReason(buildDir: string): Promise<string | null> {
  try {
    const files = await classFilesUnder(buildDir);
    if (files.length === 0) return "no class files";
    const contents = await Promise.all(files.map((file) => readFile(file)));
    const byName = declineReason(contents);
    if (byName !== null) return byName;
    // Every file must be a well-formed class file; a parse failure lands in the catch below.
    // Recursion is no reason to decline: the student's main runs on a thread with eight times the
    // JVM's default stack (worker/jvm-harness/ptcn/harness/Harness.java).
    for (const bytes of contents) parseClass(bytes);
    return null;
  } catch (error) {
    return `class files unreadable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function classFilesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".class"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}
