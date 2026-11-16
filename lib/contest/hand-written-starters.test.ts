import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HAND_WRITTEN_STARTER_FILES,
  STARTER_MAX_BYTES,
  clearHandWrittenStarterCache,
  isSafeProblemSlug,
  problemContentRoot,
  readHandWrittenStarters,
  resolveStarters,
} from "@/lib/contest/hand-written-starters";
import type { LanguageId } from "@/lib/judge/runtimes";
import { ProblemManifestSchema } from "@/lib/schemas/seed";

/*
  These tests build a throwaway content root on disk, because the guards under test (symlinks,
  real paths, sizes) are properties of a filesystem and a mock would only test the mock. The
  root lives in the OS temp dir; nothing is bind-mounted into Docker, so the `.judge-tmp` rule
  does not apply here.
*/

const ALL: readonly LanguageId[] = ["PYTHON_312", "JAVA_21", "CPP_17"];

let root = "";

beforeEach(async () => {
  clearHandWrittenStarterCache();
  root = await mkdtemp(path.join(tmpdir(), "ptcn-starters-"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function place(slug: string, file: string, body: string): Promise<string> {
  const dir = path.join(root, slug, "starters");
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, file);
  await writeFile(target, body);
  return target;
}

describe("isSafeProblemSlug", () => {
  const accepted = ["a-very-big-sum", "sum67", "x", "e2e-starter-1731700000000"];
  const refused = [
    "",
    "..",
    "../a-very-big-sum",
    "a/../../etc",
    "a/b",
    "a\\b",
    "%2e%2e",
    "A-Very-Big-Sum",
    "-leading",
    "trailing-",
    "double--hyphen",
    "has space",
    "nul\u0000byte",
    "a".repeat(121),
  ];

  it.each(accepted)("accepts %j", (slug) => {
    expect(isSafeProblemSlug(slug)).toBe(true);
  });

  it.each(refused)("refuses %j", (slug) => {
    expect(isSafeProblemSlug(slug)).toBe(false);
  });

  it("refuses non-strings", () => {
    expect(isSafeProblemSlug(undefined)).toBe(false);
    expect(isSafeProblemSlug(42)).toBe(false);
  });

  it("agrees with the manifest's slug format on every case above that fits the length cap", () => {
    for (const slug of [...accepted, ...refused].filter((s) => s.length <= 120)) {
      expect(ProblemManifestSchema.shape.slug.safeParse(slug).success, slug).toBe(
        isSafeProblemSlug(slug),
      );
    }
  });
});

describe("resolveStarters", () => {
  const generated = [
    { language: "PYTHON_312" as const, code: "generated py" },
    { language: "JAVA_21" as const, code: "generated java" },
  ];

  it("prefers the hand-written file, then the generated starter, then nothing", () => {
    const handWritten = new Map<LanguageId, string>([["PYTHON_312", "hand py"]]);
    expect(resolveStarters(ALL, handWritten, generated)).toEqual([
      { language: "PYTHON_312", code: "hand py" },
      { language: "JAVA_21", code: "generated java" },
    ]);
  });

  it("serves a hand-written starter for a problem with no signature", () => {
    const handWritten = new Map<LanguageId, string>([["CPP_17", "hand cpp"]]);
    expect(resolveStarters(ALL, handWritten, undefined)).toEqual([
      { language: "CPP_17", code: "hand cpp" },
    ]);
  });

  it("never serves a starter for a language the problem does not allow", () => {
    const handWritten = new Map<LanguageId, string>([
      ["PYTHON_312", "hand py"],
      ["CPP_17", "hand cpp"],
    ]);
    expect(resolveStarters(["JAVA_21"], handWritten, generated)).toEqual([
      { language: "JAVA_21", code: "generated java" },
    ]);
  });

  it("keeps the old absence when nothing resolves", () => {
    expect(resolveStarters(ALL, new Map(), undefined)).toBeUndefined();
    expect(resolveStarters(ALL, new Map(), [])).toEqual([]);
  });

  it("orders by the registry, whatever order allowedLanguages arrives in", () => {
    const handWritten = new Map<LanguageId, string>([
      ["CPP_17", "c"],
      ["PYTHON_312", "p"],
    ]);
    const resolved = resolveStarters(["CPP_17", "JAVA_21", "PYTHON_312"], handWritten, generated);
    expect(resolved?.map((s) => s.language)).toEqual(["PYTHON_312", "JAVA_21", "CPP_17"]);
  });
});

describe("readHandWrittenStarters", () => {
  it("reads each contract file to its language, byte for byte", async () => {
    const python = "import sys\n\n# read n, then the list\nprint(sum(map(int, sys.stdin.read().split()[1:])))\n";
    await place("sum-it", "main.py", python);
    await place("sum-it", "Main.java", "public class Main {}\n");
    await place("sum-it", "main.cpp", "int main() { return 0; }\n");

    const starters = await readHandWrittenStarters("sum-it", root);
    expect(starters.get("PYTHON_312")).toBe(python);
    expect(starters.get("JAVA_21")).toBe("public class Main {}\n");
    expect(starters.get("CPP_17")).toBe("int main() { return 0; }\n");
    expect(Object.values(HAND_WRITTEN_STARTER_FILES)).toEqual(["main.py", "Main.java", "main.cpp"]);
  });

  it("returns nothing for a problem with no starters folder, silently", async () => {
    await mkdir(path.join(root, "plain"), { recursive: true });
    const starters = await readHandWrittenStarters("plain", root);
    expect(starters.size).toBe(0);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("refuses a traversal slug before touching the disk", async () => {
    await place("victim", "main.py", "secret");
    const starters = await readHandWrittenStarters("../" + path.basename(root) + "/victim", root);
    expect(starters.size).toBe(0);
  });

  it("does not follow a symlink from a starter to the reference solution", async () => {
    const reference = path.join(root, "leaky", "reference.py");
    await mkdir(path.dirname(reference), { recursive: true });
    await writeFile(reference, "THE ANSWER");
    await mkdir(path.join(root, "leaky", "starters"), { recursive: true });
    await symlink(reference, path.join(root, "leaky", "starters", "main.py"));

    const starters = await readHandWrittenStarters("leaky", root);
    expect(starters.get("PYTHON_312")).toBeUndefined();
  });

  it("does not follow a starters/ directory symlinked to the tests", async () => {
    const tests = path.join(root, "leaky-dir", "tests");
    await mkdir(tests, { recursive: true });
    await writeFile(path.join(tests, "main.py"), "HIDDEN TEST");
    await symlink(tests, path.join(root, "leaky-dir", "starters"));

    const starters = await readHandWrittenStarters("leaky-dir", root);
    expect(starters.size).toBe(0);
  });

  it("serves nothing but the three contract names", async () => {
    await place("others", "reference.py", "THE ANSWER");
    await place("others", "1.in", "HIDDEN");
    await place("others", "main.c", "int main(){}");
    const starters = await readHandWrittenStarters("others", root);
    expect(starters.size).toBe(0);
  });

  it("refuses a file over the size cap and an empty file, and keeps the rest", async () => {
    await place("big", "main.py", "#".repeat(STARTER_MAX_BYTES + 1));
    await place("big", "Main.java", "   \n");
    await place("big", "main.cpp", "int main() {}\n");
    const starters = await readHandWrittenStarters("big", root);
    expect([...starters.keys()]).toEqual(["CPP_17"]);
  });

  it("accepts a file exactly at the size cap", async () => {
    await place("edge", "main.py", "#".repeat(STARTER_MAX_BYTES));
    const starters = await readHandWrittenStarters("edge", root);
    expect(starters.get("PYTHON_312")?.length).toBe(STARTER_MAX_BYTES);
  });

  it("falls back instead of throwing when a starter is a directory", async () => {
    await mkdir(path.join(root, "weird", "starters", "main.py"), { recursive: true });
    await expect(readHandWrittenStarters("weird", root)).resolves.toEqual(new Map());
  });

  it("caches per slug: a second read does not see a file written after the first", async () => {
    const first = await readHandWrittenStarters("cached", root);
    expect(first.size).toBe(0);
    await place("cached", "main.py", "late");
    const second = await readHandWrittenStarters("cached", root);
    expect(second.size).toBe(0);

    clearHandWrittenStarterCache();
    const third = await readHandWrittenStarters("cached", root);
    expect(third.get("PYTHON_312")).toBe("late");
  });

  it("treats a missing content root as no starters, without throwing", async () => {
    const missingRoot = path.join(root, "not-yet");
    const first = await readHandWrittenStarters("later", missingRoot);
    expect(first.size).toBe(0);

    await mkdir(path.join(missingRoot, "later", "starters"), { recursive: true });
    await writeFile(path.join(missingRoot, "later", "starters", "main.py"), "now");
    // A missing root is ENOENT, which is "absent" and cacheable. Clear to show the read path
    // itself picks the file up once it exists.
    clearHandWrittenStarterCache();
    const second = await readHandWrittenStarters("later", missingRoot);
    expect(second.get("PYTHON_312")).toBe("now");
  });
});

describe("problemContentRoot", () => {
  it("is content/problems under the working directory, which is /app in the images", () => {
    expect(problemContentRoot()).toBe(path.join(process.cwd(), "content", "problems"));
  });
});
