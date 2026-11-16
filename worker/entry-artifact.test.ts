import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VARIANTS } from "@/lib/judge/runtimes";
import { probeFor, starterFor } from "@/lib/judge/starters";
import { SignatureSchema } from "@/lib/schemas/seed";

import { declaredPackageMessage, leadingDeclaration, misplacedEntryMessage } from "./entry-artifact";

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

/**
 * The regular expression the scanner replaced, kept here only as an oracle: on every real Java
 * source in the repository the two must agree. It was quadratic on a source of repeated `/*`.
 */
function regexOracle(source: string): string | null {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");
  const match =
    /^\s*(?:@[\w.$]+(?:\([^)]*\))?\s*)*package\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;/.exec(code);
  return match?.[1]?.replace(/\s+/g, "") ?? null;
}

function javaSources(): { readonly label: string; readonly source: string }[] {
  const root = path.resolve(__dirname, "..");
  const out: { label: string; source: string }[] = [];
  for (const base of ["fixtures/judge/cases", "fixtures/sandbox/cases"]) {
    for (const dir of readdirSync(path.join(root, base))) {
      const file = path.join(root, base, dir, "Main.java");
      if (existsSync(file)) out.push({ label: `${base}/${dir}`, source: readFileSync(file, "utf8") });
    }
  }
  for (const variant of Object.values(VARIANTS)) {
    if (variant.sourceFile === "Main.java" && variant.starter !== undefined) {
      out.push({ label: `starter ${variant.id}`, source: variant.starter });
    }
  }
  const problems = path.join(root, "content", "problems");
  for (const slug of readdirSync(problems)) {
    const file = path.join(problems, slug, "problem.json");
    if (!existsSync(file)) continue;
    const raw = (JSON.parse(readFileSync(file, "utf8")) as { signature?: unknown }).signature;
    if (raw === undefined || raw === null) continue;
    const signature = SignatureSchema.parse(raw);
    for (const id of ["JAVA_8", "JAVA_11", "JAVA_17", "JAVA_21"] as const) {
      out.push({ label: `${slug} ${id} starter`, source: starterFor(signature, id) });
      out.push({ label: `${slug} ${id} probe`, source: probeFor(signature, id) });
    }
  }
  return out;
}

describe("leadingDeclaration", () => {
  it("agrees with the regular expression it replaced on every Java fixture, starter and probe", () => {
    const sources = javaSources();
    expect(sources.length).toBeGreaterThan(100);
    let packages = 0;
    for (const { label, source } of sources) {
      const scanned = leadingDeclaration(source, "package")?.join(".") ?? null;
      expect(scanned, label).toBe(regexOracle(source));
      if (scanned !== null) packages += 1;
    }
    // The package fixture is in there, so agreement is not only on "no package".
    expect(packages).toBeGreaterThan(0);
  });

  it("is linear: a maximum-size source of repeated comment openers takes well under 50 ms", () => {
    const MAX_SOURCE = 200_000; // SubmitRequestSchema's cap
    // The first two took the replaced regular expression 1,255 ms and 1,636 ms on this Mac.
    const hostile = [
      "/* x".repeat(MAX_SOURCE / 4),
      "/*\n".repeat(MAX_SOURCE / 3),
      "/*".repeat(MAX_SOURCE / 2),
      "@a(" + '"/*'.repeat(MAX_SOURCE / 3),
      " ".repeat(MAX_SOURCE - 20) + "package x;",
      "@a" + " @a".repeat(MAX_SOURCE / 3 - 1),
      "@a(" + "(".repeat(MAX_SOURCE - 3),
    ];
    for (const source of hostile) {
      const started = performance.now();
      leadingDeclaration(source, "package");
      expect(performance.now() - started).toBeLessThan(50);
    }
  });

  it("does not take a comment marker inside an annotation's string for structure", () => {
    expect(leadingDeclaration('@Doc("a ) /* b") package p.q;', "package")).toEqual(["p", "q"]);
    expect(leadingDeclaration("@Doc(')') package p;", "package")).toEqual(["p"]);
    expect(leadingDeclaration("/* unterminated package p;", "package")).toBeNull();
  });
});
