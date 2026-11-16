import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { declineReason, harnessDeclineReason } from "./jvm-harness-eligibility";

/** A stand-in class file: a constant pool is, for this check, the bytes of the names in it. */
const cls = (...names: string[]): Buffer => Buffer.from(`\xca\xfe\xba\xbe${names.join("\u0001")}`, "latin1");

const PLAIN = cls("Main", "java/util/Scanner", "java/io/PrintStream", "println", "nextInt");

describe("declineReason", () => {
  it("lets an ordinary contest program through", () => {
    expect(declineReason([PLAIN])).toBeNull();
    expect(
      declineReason([
        PLAIN,
        cls("Main$FastReader", "java/io/BufferedReader", "java/util/StringTokenizer", "java/io/DataInputStream"),
        cls("java/util/HashMap", "java/util/Arrays", "sort", "printStackTrace", "java/lang/System", "exit"),
      ]),
    ).toBeNull();
  });

  it.each([
    ["java/io/FileDescriptor", "FileDescriptor"],
    ["/dev/stdin", "/dev/stdin"],
    ["/proc/self/fd/0", "file descriptor"],
    ["java/lang/ProcessBuilder", "process"],
    ["java/lang/ProcessHandle", "process"],
    ["setProperty", "property"],
    ["java/util/logging/Logger", "logging"],
    ["addShutdownHook", "shutdown hook"],
    ["getSecurityManager", "security manager"],
    ["getAllStackTraces", "threads"],
    ["getStackTrace", "stack frames"],
    ["StackWalker", "stack frames"],
    ["ofVirtual", "virtual thread"],
    ["identityHashCode", "identity hash"],
    ["freeMemory", "heap"],
    ["java/lang/management/ManagementFactory", "management"],
    ["sun/misc/Unsafe", "internals"],
  ])("declines a submission naming %s", (name, reasonPart) => {
    const reason = declineReason([PLAIN, cls(name)]);
    expect(reason).not.toBeNull();
    expect(reason?.toLowerCase()).toContain(reasonPart.toLowerCase());
  });

  it("needs EVERY token of a two-part rule, in any of the classes", () => {
    expect(declineReason([cls("exec")])).toBeNull();
    expect(declineReason([cls("java/lang/Runtime"), cls("exec")])).toContain("process");
    expect(declineReason([cls("java/util/Locale", "format")])).toBeNull();
    expect(declineReason([cls("java/util/Locale", "setDefault")])).toContain("locale");
  });

  it("does not mistake printStackTrace for getStackTrace", () => {
    expect(declineReason([cls("printStackTrace")])).toBeNull();
  });
});

describe("harnessDeclineReason", () => {
  let dir = "";
  afterEach(() => {
    if (dir !== "") rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  it("reads every class file, nested directories included", async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "elig-"));
    writeFileSync(path.join(dir, "Main.class"), PLAIN);
    mkdirSync(path.join(dir, "pkg"));
    writeFileSync(path.join(dir, "pkg", "Helper.class"), cls("java/io/FileDescriptor"));
    expect(await harnessDeclineReason(dir)).toContain("FileDescriptor");
  });

  const real = (name: string): Buffer =>
    readFileSync(path.join(process.cwd(), "fixtures", "judge", "classfiles", name, "Main.class"));

  it("lets a real non-recursive program through, ignoring files that are not class files", async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "elig-"));
    writeFileSync(path.join(dir, "Main.class"), real("plain"));
    writeFileSync(path.join(dir, "notes.txt"), "java/io/FileDescriptor");
    expect(await harnessDeclineReason(dir)).toBeNull();
  });

  it("lets a program that recurses through: the harness gives main a large stack", async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "elig-"));
    writeFileSync(path.join(dir, "Main.class"), real("direct"));
    expect(await harnessDeclineReason(dir)).toBeNull();
  });

  it("declines when there is nothing to read, or it cannot be parsed, rather than guessing", async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "elig-"));
    expect(await harnessDeclineReason(dir)).toBe("no class files");
    expect(await harnessDeclineReason(path.join(dir, "missing"))).toMatch(/unreadable/);
    writeFileSync(path.join(dir, "Main.class"), PLAIN);
    expect(await harnessDeclineReason(dir)).toMatch(/unreadable/);
  });
});
