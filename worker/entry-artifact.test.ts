import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VARIANTS } from "@/lib/judge/runtimes";

import { declaredPackageMessage, misplacedEntryMessage } from "./entry-artifact";

const ENTRY = { file: "Main.class", nestedMessage: 'Delete the line "package {package};".' };

describe("misplacedEntryMessage", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "entry-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is null when the entry point is at the top of /build", async () => {
    await writeFile(path.join(dir, "Main.class"), "");
    await mkdir(path.join(dir, "util"));
    await writeFile(path.join(dir, "util", "Main.class"), "");
    expect(await misplacedEntryMessage(dir, ENTRY)).toBeNull();
  });

  it("names the package when the entry point is only in a subdirectory", async () => {
    await mkdir(path.join(dir, "com", "example"), { recursive: true });
    await writeFile(path.join(dir, "com", "example", "Main.class"), "");
    expect(await misplacedEntryMessage(dir, ENTRY)).toBe('Delete the line "package com.example;".');
  });

  it("is null when no file of that name was built at all, which stays a run-time failure", async () => {
    await writeFile(path.join(dir, "Solution.class"), "");
    expect(await misplacedEntryMessage(dir, ENTRY)).toBeNull();
  });

  it("is null for a missing directory rather than throwing", async () => {
    expect(await misplacedEntryMessage(path.join(dir, "absent"), ENTRY)).toBeNull();
  });

  it("is declared for every Java variant, with the package placeholder in its message", () => {
    const java = Object.values(VARIANTS).filter((v) => v.sourceFile === "Main.java");
    expect(java.length).toBe(4);
    for (const variant of java) {
      expect(variant.entryArtifact?.file).toBe("Main.class");
      expect(variant.entryArtifact?.nestedMessage).toContain("{package}");
      expect(variant.entryArtifact?.nestedMessage).toContain("public class Main");
    }
  });
});

describe("declaredPackageMessage", () => {
  const java = VARIANTS.JAVA_21.entryArtifact;
  if (java === undefined) throw new Error("JAVA_21 declares no entry artifact");
  const message = (source: string) => declaredPackageMessage(source, java);

  it("finds a package line, after comments and blank lines", () => {
    expect(message("package solution;\npublic class Main {}")).toContain('"package solution;"');
    expect(message("// my solution\n/* header\n */\n\n  package com.example . app ;\nclass Main {}")).toContain(
      '"package com.example.app;"',
    );
  });

  it("ignores a package line that is commented out, or that is not at the top", () => {
    expect(message("// package solution;\npublic class Main {}")).toBeNull();
    expect(message("/* package solution; */\npublic class Main {}")).toBeNull();
    expect(message('public class Main { String s = "package x;"; }')).toBeNull();
    expect(message("import java.util.*;\npackage x;\npublic class Main {}")).toBeNull();
  });

  it("leaves an ordinary program alone", () => {
    expect(message("import java.util.*;\n\npublic class Main {\n  public static void main(String[] a) {}\n}\n")).toBeNull();
  });
});
