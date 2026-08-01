import { describe, expect, it } from "vitest";

import { LANGUAGE_IDS, VARIANTS } from "@/lib/judge/runtimes";
import { ProblemManifestSchema, SignatureSchema } from "@/lib/schemas/seed";

import {
  PROBE_LANGUAGES,
  expectedEchoLines,
  isOrderedSubsequence,
  languagesWithoutStarter,
  probeFor,
  starterFor,
  startersFor,
  traceHarness,
  HarnessTraceError,
  type Signature,
} from "./index";

/**
 * G3 — the dispatcher, the schema that feeds it, and the harness trace G13 checks with.
 *
 * The six emitters have their own suites and are not re-tested here. What is tested is the
 * wiring between them and the data: that every language the judge can run reaches an emitter,
 * that variants of one runtime share one file, and that a declaration which disagrees with an
 * input file is caught before a student ever sees it.
 */

/** Ten queries, an array whose length is an earlier unpassed field, a scalar answer. */
const CIRCULAR: Signature = {
  name: "circularArrayRotation",
  returns: { type: "int" },
  shared: [
    { name: "n", type: "int", passed: false },
    { name: "k", type: "int" },
    { name: "q", type: "int", passed: false },
    { name: "a", type: "int[]", length: "n" },
  ],
  repeat: "q",
  params: [{ name: "j", type: "int" }],
};

/** One call, an array answer, a 64-bit element type. */
const BIG_SUM: Signature = {
  name: "aVeryBigSum",
  returns: { type: "long" },
  params: [
    { name: "n", type: "int", passed: false },
    { name: "t", type: "long[]", length: "n" },
  ],
};

describe("the dispatcher", () => {
  it("serves every language the registry can run", () => {
    expect(languagesWithoutStarter()).toEqual([]);
    for (const language of LANGUAGE_IDS) {
      expect(starterFor(BIG_SUM, language).length).toBeGreaterThan(0);
    }
  });

  /**
   * The invariant the whole file exists for. Ten choices, six emitters: keying on
   * `sourceFile` is what makes "one C++ emission serves both C++ variants" true by
   * construction instead of by two table rows somebody has to keep equal.
   */
  it("emits one identical file for every variant of the same source file", () => {
    const byFile = new Map<string, string>();
    for (const language of LANGUAGE_IDS) {
      const file = VARIANTS[language].sourceFile;
      const code = starterFor(CIRCULAR, language);
      const first = byFile.get(file);
      if (first === undefined) byFile.set(file, code);
      else expect(code).toBe(first);
    }
    expect(byFile.size).toBe(6);
  });

  it("picks exactly one probe language per emitter", () => {
    expect(PROBE_LANGUAGES).toHaveLength(6);
    const files = PROBE_LANGUAGES.map((language) => VARIANTS[language].sourceFile);
    expect(new Set(files).size).toBe(6);
  });

  it("probes contain the starter's stub verbatim", () => {
    for (const language of PROBE_LANGUAGES) {
      const probe = probeFor(CIRCULAR, language);
      // Not a substring test on the whole file — the probe adds lines — but the signature line
      // and the zero return must both survive, or the probe stops being evidence about the
      // starter and becomes evidence about itself.
      expect(probe).toContain("circularArrayRotation");
      expect(probe.length).toBeGreaterThan(starterFor(CIRCULAR, language).length);
    }
  });
});

describe("startersFor", () => {
  it("returns nothing for a problem with no signature, which is most of the bank", () => {
    expect(startersFor(null, LANGUAGE_IDS)).toEqual([]);
    expect(startersFor(undefined, LANGUAGE_IDS)).toEqual([]);
  });

  it("emits only the languages the problem allows", () => {
    const starters = startersFor(BIG_SUM, ["JAVA_21", "PYTHON_312"]);
    expect(starters.map((s) => s.language)).toEqual(["PYTHON_312", "JAVA_21"]);
  });

  /** Registry order, always — a response that reorders itself is a response that cannot be
   * compared byte for byte, which is the bug team standings shipped once already. */
  it("is ordered by the registry, not by the caller's array", () => {
    const forwards = startersFor(BIG_SUM, ["GO_123", "C_17", "PYTHON_312"]);
    const backwards = startersFor(BIG_SUM, ["PYTHON_312", "C_17", "GO_123"]);
    expect(forwards).toEqual(backwards);
    expect(forwards.map((s) => s.language)).toEqual(["PYTHON_312", "C_17", "GO_123"]);
  });
});

describe("traceHarness", () => {
  const tokens = (text: string): string[] => text.split(/\s+/).filter((t) => t.length > 0);

  it("consumes exactly the tokens the declaration describes", () => {
    const trace = traceHarness(CIRCULAR, tokens("5 2 3  4 8 15 16 23  0 2 4"));
    expect(trace.consumed).toBe(11);
    expect(trace.calls).toHaveLength(3);
  });

  it("echoes shared arguments on every call, in declaration order", () => {
    const trace = traceHarness(CIRCULAR, tokens("5 2 2  4 8 15 16 23  0 2"));
    expect(expectedEchoLines(trace)).toEqual([
      "2",
      "5: 4 8 15 16 23",
      "0",
      "2",
      "5: 4 8 15 16 23",
      "2",
    ]);
  });

  /**
   * The reason `long` is not `int`. 10^12 is a normal tooth count in this bank and a normal
   * answer; re-emitting it through a double would be the exact truncation the type exists to
   * prevent, and the golden would then disagree with correct output.
   */
  it("keeps 64-bit values exact", () => {
    const trace = traceHarness(BIG_SUM, tokens("2 1000000000000 999999999999999"));
    expect(expectedEchoLines(trace)).toEqual(["2: 1000000000000 999999999999999"]);
  });

  it("normalises what every target language normalises", () => {
    const trace = traceHarness(BIG_SUM, tokens("2 007 -0"));
    expect(expectedEchoLines(trace)).toEqual(["2: 7 0"]);
  });

  /** Reading past the end is the half a sample never shows: it is an IndexError in Python and
   * garbage in C, and the reference solution passes either way. */
  it("says which field ran off the end of the file", () => {
    expect(() => traceHarness(CIRCULAR, tokens("5 2 3  4 8 15 16 23  0 2"))).toThrow(
      HarnessTraceError,
    );
  });

  it("leaves 'the file has more' to the caller and reports what it read", () => {
    const trace = traceHarness(BIG_SUM, tokens("2 10 20 30 40"));
    expect(trace.consumed).toBe(3);
  });
});

describe("isOrderedSubsequence", () => {
  it("allows result lines between the echoes, in either flush order", () => {
    const echoes = ["1", "2"];
    expect(isOrderedSubsequence(echoes, ["1", "2", "0", "0"])).toBe(true);
    expect(isOrderedSubsequence(echoes, ["1", "0", "2", "0"])).toBe(true);
  });

  it("rejects the wrong order, which is what a misreading harness produces", () => {
    expect(isOrderedSubsequence(["1", "2"], ["2", "1"])).toBe(false);
  });
});

describe("SignatureSchema", () => {
  const base = {
    name: "solveMeFirst",
    returns: { type: "int" },
    params: [{ name: "a", type: "int" }],
  };

  it("accepts every authored declaration shape", () => {
    expect(SignatureSchema.safeParse(CIRCULAR).success).toBe(true);
    expect(SignatureSchema.safeParse(BIG_SUM).success).toBe(true);
  });

  /**
   * The generated harness names its own locals with an underscore, so a declared name that
   * contains one could collide with them. Rejecting the character is what makes the collision
   * impossible rather than unlikely.
   */
  it("rejects an underscore in a name", () => {
    expect(SignatureSchema.safeParse({ ...base, name: "solve_me" }).success).toBe(false);
  });

  /** A reserved word does not produce a bad starter, it produces one that will not compile —
   * verdict CE on a file the student has not touched. */
  it("rejects a name that is a keyword in any of the six languages", () => {
    for (const name of ["int", "class", "func", "range", "std"]) {
      expect(
        SignatureSchema.safeParse({ ...base, params: [{ name, type: "int" }] }).success,
      ).toBe(false);
    }
  });

  it("requires a length on an array and forbids one anywhere else", () => {
    expect(
      SignatureSchema.safeParse({ ...base, params: [{ name: "a", type: "int[]" }] }).success,
    ).toBe(false);
    expect(
      SignatureSchema.safeParse({
        ...base,
        params: [{ name: "a", type: "int", length: 3 }],
      }).success,
    ).toBe(false);
  });

  /** A forward reference emits a loop bound over an uninitialised local: garbage in C, a
   * compile error in Java, a NameError in Python. */
  it("rejects a length that names a field read later", () => {
    expect(
      SignatureSchema.safeParse({
        ...base,
        params: [
          { name: "a", type: "int[]", length: "n" },
          { name: "n", type: "int" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a length that names a non-int", () => {
    expect(
      SignatureSchema.safeParse({
        ...base,
        params: [
          { name: "n", type: "string" },
          { name: "a", type: "int[]", length: "n" },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires a join on an array return and forbids one on a scalar", () => {
    expect(SignatureSchema.safeParse({ ...base, returns: { type: "int[]" } }).success).toBe(false);
    expect(
      SignatureSchema.safeParse({ ...base, returns: { type: "int", join: " " } }).success,
    ).toBe(false);
  });

  /** A count read inside the loop it bounds is re-read every iteration, so the second call
   * onwards reads the wrong tokens — and the first call succeeds, which hides it in a sample. */
  it("requires repeat to name an int in shared", () => {
    expect(
      SignatureSchema.safeParse({ ...base, repeat: "q", params: [{ name: "q", type: "int" }] })
        .success,
    ).toBe(false);
    expect(
      SignatureSchema.safeParse({
        ...base,
        shared: [{ name: "q", type: "string" }],
        repeat: "q",
      }).success,
    ).toBe(false);
  });

  it("rejects a duplicate name across shared and params", () => {
    expect(
      SignatureSchema.safeParse({
        ...base,
        shared: [{ name: "a", type: "int" }],
        params: [{ name: "a", type: "int" }],
      }).success,
    ).toBe(false);
  });

  /** A misspelt key would otherwise be dropped silently and reported as the wrong field. */
  it("rejects an unknown key rather than dropping it", () => {
    expect(SignatureSchema.safeParse({ ...base, parms: [] }).success).toBe(false);
  });
});

describe("ProblemManifestSchema", () => {
  const manifest = {
    slug: "solve-me-first",
    title: "Solve Me First",
    difficulty: "E",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    allowedLanguages: ["PYTHON_312"],
    comparator: { kind: "whitespace" },
    sampleCount: 2,
  };

  /** The whole design of the feature: a problem without a signature keeps working. */
  it("accepts a manifest with no signature", () => {
    const parsed = ProblemManifestSchema.parse(manifest);
    expect(parsed.signature).toBeUndefined();
    expect(startersFor(parsed.signature, parsed.allowedLanguages)).toEqual([]);
  });

  it("rejects a mistyped field instead of defaulting it", () => {
    const mistyped: Record<string, unknown> = { ...manifest, timeLimtMs: 2000 };
    delete mistyped.timeLimitMs;
    expect(ProblemManifestSchema.safeParse(mistyped).success).toBe(false);
  });
});
