import { describe, expect, it } from "vitest";

import {
  emitJavaScript,
  emitJavaScriptProbe,
  javaScriptDocLines,
  type Signature,
} from "@/lib/judge/starters/javascript";

/**
 * The expected files are `String.raw` literals, so what is written here is byte-for-byte what
 * the judge receives — `\s` and `\n` inside them are the LITERAL two-character sequences that
 * appear in the emitted JavaScript source, not escapes this test file interprets. Writing them
 * as ordinary template literals would silently turn `/\s+/` into `/s+/`, and the test would
 * then be asserting a harness that does not tokenise.
 *
 * These are whole files rather than substring probes on purpose. A template change has to show
 * up as a diff a reviewer reads, not as a surprise a student finds at 7pm.
 */

/** `a-very-big-sum` — a call once, a long[] parameter, a long return, a withheld count. */
const A_VERY_BIG_SUM: Signature = {
  name: "aVeryBigSum",
  returns: { type: "long" },
  params: [
    { name: "n", type: "int", passed: false },
    { name: "ar", type: "long[]", length: "n" },
  ],
};

/** `encryption` — repeat mode over a shared count, two string parameters, a string return. */
const ENCRYPTION: Signature = {
  name: "encryption",
  returns: { type: "string" },
  shared: [{ name: "n", type: "int", passed: false }],
  repeat: "n",
  params: [
    { name: "key", type: "string" },
    { name: "message", type: "string" },
  ],
};

/** `cut-the-sticks` — an ARRAY return, joined by newline. */
const CUT_THE_STICKS: Signature = {
  name: "cutTheSticks",
  returns: { type: "int[]", join: "\n" },
  params: [
    { name: "n", type: "int", passed: false },
    { name: "arr", type: "int[]", length: "n" },
  ],
};

/**
 * `circular-array-rotation` — declares a field named `q` AND repeats on it.
 *
 * This is the shape that makes the underscore-prefixed loop variables mandatory rather than
 * tidy: `for (let q = 0; q < q; q++)` is valid JavaScript whose loop never runs.
 */
const CIRCULAR_ARRAY_ROTATION: Signature = {
  name: "circularArrayRotation",
  returns: { type: "int" },
  shared: [
    { name: "n", type: "int", passed: false },
    { name: "k", type: "int" },
    { name: "q", type: "int", passed: false },
    { name: "a", type: "int[]", length: "n" },
  ],
  repeat: "q",
  params: [{ name: "m", type: "int" }],
};

/**
 * No authored problem uses `string[]`, a literal array length, or `join: " "` on a string array.
 * A synthetic declaration covers them, because a vocabulary entry that nothing exercises is a
 * vocabulary entry that is broken and nobody knows.
 */
const SYNTHETIC_STRING_ARRAY: Signature = {
  name: "shoutWords",
  returns: { type: "string[]", join: " " },
  shared: [{ name: "t", type: "int", passed: false }],
  repeat: "t",
  params: [
    { name: "c", type: "int", passed: false },
    { name: "words", type: "string[]", length: "c" },
  ],
};

const EXPECTED_A_VERY_BIG_SUM = String.raw`/*
 * Complete the 'aVeryBigSum' function below.
 *
 * The function is expected to return a LONG_INTEGER.
 * The function accepts following parameter(s):
 *  1. LONG_INTEGER_ARRAY ar
 */
function aVeryBigSum(ar) {
  // Write your code here
  return 0n;
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
const _TOKENS = require("node:fs")
  .readFileSync(0, "utf8")
  .split(/\s+/)
  .filter((t) => t.length > 0);
let _pos = 0;

function nextToken() { return _TOKENS[_pos++]; }
function nextInt() { return Number(nextToken()); }
function nextLong() { return BigInt(nextToken()); }

function main() {
  const out = [];

  const n = nextInt();
  const ar = [];
  for (let _i = 0; _i < n; _i++) ar.push(nextLong());

  out.push(String(aVeryBigSum(ar)));

  process.stdout.write(out.join("\n") + "\n");
}

main();
`;

const EXPECTED_ENCRYPTION = String.raw`/*
 * Complete the 'encryption' function below.
 *
 * The function is expected to return a STRING.
 * The function accepts following parameter(s):
 *  1. STRING key
 *  2. STRING message
 */
function encryption(key, message) {
  // Write your code here
  return "";
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
const _TOKENS = require("node:fs")
  .readFileSync(0, "utf8")
  .split(/\s+/)
  .filter((t) => t.length > 0);
let _pos = 0;

function nextToken() { return _TOKENS[_pos++]; }
function nextInt() { return Number(nextToken()); }
function nextLong() { return BigInt(nextToken()); }

function main() {
  const out = [];

  const n = nextInt();
  for (let _q = 0; _q < n; _q++) {
    const key = nextToken();
    const message = nextToken();

    out.push(String(encryption(key, message)));
  }

  process.stdout.write(out.join("\n") + "\n");
}

main();
`;

const EXPECTED_CUT_THE_STICKS = String.raw`/*
 * Complete the 'cutTheSticks' function below.
 *
 * The function is expected to return an INTEGER_ARRAY.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY arr
 */
function cutTheSticks(arr) {
  // Write your code here
  return [];
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
const _TOKENS = require("node:fs")
  .readFileSync(0, "utf8")
  .split(/\s+/)
  .filter((t) => t.length > 0);
let _pos = 0;

function nextToken() { return _TOKENS[_pos++]; }
function nextInt() { return Number(nextToken()); }
function nextLong() { return BigInt(nextToken()); }

function main() {
  const out = [];

  const n = nextInt();
  const arr = [];
  for (let _i = 0; _i < n; _i++) arr.push(nextInt());

  out.push(cutTheSticks(arr).join("\n"));

  process.stdout.write(out.join("\n") + "\n");
}

main();
`;

const EXPECTED_ENCRYPTION_PROBE = String.raw`/*
 * Complete the 'encryption' function below.
 *
 * The function is expected to return a STRING.
 * The function accepts following parameter(s):
 *  1. STRING key
 *  2. STRING message
 */
function encryption(key, message) {
  // Write your code here
  process.stdout.write(String(key) + "\n");
  process.stdout.write(String(message) + "\n");
  return "";
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
const _TOKENS = require("node:fs")
  .readFileSync(0, "utf8")
  .split(/\s+/)
  .filter((t) => t.length > 0);
let _pos = 0;

function nextToken() { return _TOKENS[_pos++]; }
function nextInt() { return Number(nextToken()); }
function nextLong() { return BigInt(nextToken()); }

function main() {
  const out = [];

  const n = nextInt();
  for (let _q = 0; _q < n; _q++) {
    const key = nextToken();
    const message = nextToken();

    out.push(String(encryption(key, message)));
  }

  process.stdout.write(out.join("\n") + "\n");
}

main();
`;

describe("emitJavaScript — whole-file goldens", () => {
  it("emits a-very-big-sum byte for byte", () => {
    expect(emitJavaScript(A_VERY_BIG_SUM)).toBe(EXPECTED_A_VERY_BIG_SUM);
  });

  it("emits encryption byte for byte", () => {
    expect(emitJavaScript(ENCRYPTION)).toBe(EXPECTED_ENCRYPTION);
  });

  it("emits cut-the-sticks byte for byte", () => {
    expect(emitJavaScript(CUT_THE_STICKS)).toBe(EXPECTED_CUT_THE_STICKS);
  });
});

describe("emitJavaScriptProbe — whole-file golden", () => {
  it("emits the encryption probe byte for byte", () => {
    expect(emitJavaScriptProbe(ENCRYPTION)).toBe(EXPECTED_ENCRYPTION_PROBE);
  });

  it("contains the starter's stub verbatim, which is what makes one G13 pass prove two things", () => {
    const starter = emitJavaScript(ENCRYPTION);
    const probe = emitJavaScriptProbe(ENCRYPTION);
    // Everything except the inserted echo lines is identical, so a probe that compiles is
    // proof the starter compiles.
    const echoes = [
      '  process.stdout.write(String(key) + "\\n");\n',
      '  process.stdout.write(String(message) + "\\n");\n',
    ].join("");
    expect(probe.replace(echoes, "")).toBe(starter);
  });

  it("echoes an array argument as `<len>: e1 e2 ...`", () => {
    expect(emitJavaScriptProbe(A_VERY_BIG_SUM)).toContain(
      '  process.stdout.write(ar.length + ": " + ar.join(" ") + "\\n");',
    );
  });

  it("never echoes a field the signature withholds", () => {
    // `n` is `passed: false`, so it is not in scope inside the student's function at all.
    // Echoing it would be a ReferenceError — verdict RE — on every probe.
    expect(emitJavaScriptProbe(A_VERY_BIG_SUM)).not.toContain("String(n)");
  });
});

describe("harness identifiers cannot collide with a declared name", () => {
  it("uses _q for the repeat loop even when a field is named q", () => {
    const source = emitJavaScript(CIRCULAR_ARRAY_ROTATION);
    // The hazard: `for (let q = 0; q < q; q++)` shadows the count and never iterates, so every
    // submission prints nothing and it reads as the student's bug.
    expect(source).toContain("  for (let _q = 0; _q < q; _q++) {");
    expect(source).not.toContain("let q = 0");
  });

  it("uses _i for array loops", () => {
    expect(emitJavaScript(CIRCULAR_ARRAY_ROTATION)).toContain(
      "  for (let _i = 0; _i < n; _i++) a.push(nextInt());",
    );
  });
});

describe("reading order and the argument list", () => {
  it("reads shared fields once, before the repeat loop", () => {
    const source = emitJavaScript(CIRCULAR_ARRAY_ROTATION);
    const shared = source.indexOf("  const k = nextInt();");
    const loop = source.indexOf("for (let _q");
    expect(shared).toBeGreaterThan(-1);
    expect(shared).toBeLessThan(loop);
  });

  it("passes shared-then-params in declaration order, skipping withheld fields", () => {
    expect(emitJavaScript(CIRCULAR_ARRAY_ROTATION)).toContain(
      "function circularArrayRotation(k, a, m) {",
    );
  });

  it("calls the function exactly once when there is no repeat", () => {
    const source = emitJavaScript(A_VERY_BIG_SUM);
    expect(source).not.toContain("for (let _q");
    expect(source).toContain("  out.push(String(aVeryBigSum(ar)));");
  });
});

describe("types", () => {
  const scalar = (type: Signature["returns"]["type"]): string =>
    emitJavaScript({ name: "f", returns: { type }, params: [{ name: "v", type }] });

  it("returns 0n for a long, so the stub agrees with the BigInt harness", () => {
    // A Number harness for a-very-big-sum gave WA on 4 of its 14 real tests; the stub's zero
    // is what tells the student which numeric type they are working in.
    expect(scalar("long")).toContain("  return 0n;");
    expect(scalar("long")).toContain("  const v = nextLong();");
  });

  it("returns 0 for an int and reads it with nextInt", () => {
    expect(scalar("int")).toContain("  return 0;");
    expect(scalar("int")).toContain("  const v = nextInt();");
  });

  it('returns "" for a string and reads it with nextToken', () => {
    expect(scalar("string")).toContain('  return "";');
    expect(scalar("string")).toContain("  const v = nextToken();");
  });

  it("returns [] for every array type", () => {
    for (const type of ["int[]", "long[]", "string[]"] as const) {
      const source = emitJavaScript({
        name: "f",
        returns: { type, join: " " },
        params: [{ name: "v", type, length: 3 }],
      });
      expect(source).toContain("  return [];");
    }
  });

  it("accepts a literal array length as well as a named one", () => {
    const source = emitJavaScript({
      name: "designerPdfViewer",
      returns: { type: "int" },
      shared: [
        { name: "h", type: "int[]", length: 26 },
        { name: "q", type: "int", passed: false },
      ],
      repeat: "q",
      params: [{ name: "word", type: "string" }],
    });
    expect(source).toContain("  for (let _i = 0; _i < 26; _i++) h.push(nextInt());");
  });

  it("joins an array return with the declared separator", () => {
    expect(emitJavaScript(CUT_THE_STICKS)).toContain('out.push(cutTheSticks(arr).join("\\n"));');
    expect(emitJavaScript(SYNTHETIC_STRING_ARRAY)).toContain(
      'out.push(shoutWords(words).join(" "));',
    );
  });

  it("reads a string[] with nextToken", () => {
    expect(emitJavaScript(SYNTHETIC_STRING_ARRAY)).toContain(
      "    for (let _i = 0; _i < c; _i++) words.push(nextToken());",
    );
  });
});

describe("the doc comment", () => {
  it('says "an" before a type word starting with a vowel and "a" otherwise', () => {
    expect(emitJavaScript(CUT_THE_STICKS)).toContain(
      " * The function is expected to return an INTEGER_ARRAY.",
    );
    expect(emitJavaScript(A_VERY_BIG_SUM)).toContain(
      " * The function is expected to return a LONG_INTEGER.",
    );
    expect(emitJavaScript(SYNTHETIC_STRING_ARRAY)).toContain(
      " * The function is expected to return a STRING_ARRAY.",
    );
  });

  it("numbers the parameters in the order they are passed", () => {
    expect(emitJavaScript(CIRCULAR_ARRAY_ROTATION)).toContain(
      [
        " * The function accepts following parameter(s):",
        " *  1. INTEGER k",
        " *  2. INTEGER_ARRAY a",
        " *  3. INTEGER m",
      ].join("\n"),
    );
  });

  it("accepts a pre-built body from the shared dispatcher and marks it up verbatim", () => {
    // The dispatcher builds one language-neutral body for all six emitters; this is the seam
    // that keeps the wording from drifting into six private copies.
    const source = emitJavaScript(ENCRYPTION, ["one", "", "two"]);
    expect(source.startsWith("/*\n * one\n *\n * two\n */\n")).toBe(true);
  });

  it("builds the same body the shared dispatcher would, so the default and the seam agree", () => {
    expect(emitJavaScript(ENCRYPTION, javaScriptDocLines(ENCRYPTION))).toBe(
      emitJavaScript(ENCRYPTION),
    );
    expect(javaScriptDocLines(ENCRYPTION)).toEqual([
      "Complete the 'encryption' function below.",
      "",
      "The function is expected to return a STRING.",
      "The function accepts following parameter(s):",
      " 1. STRING key",
      " 2. STRING message",
    ]);
  });

  it("omits the parameter list rather than dangling a colon when nothing is passed", () => {
    const source = emitJavaScript({
      name: "answer",
      returns: { type: "int" },
      params: [{ name: "n", type: "int", passed: false }],
    });
    expect(source).not.toContain("parameter(s)");
    expect(source).toContain("function answer() {");
  });
});

describe("the student's zone", () => {
  it("puts the cursor line above the banner, so the caret lands in the top third", () => {
    const source = emitJavaScript(ENCRYPTION);
    expect(source.indexOf("  // Write your code here")).toBeLessThan(
      source.indexOf("// Everything below reads the input"),
    );
  });

  it('says "do not need to", never "must not" — there are no locked regions to enforce it', () => {
    const source = emitJavaScript(ENCRYPTION);
    expect(source).toContain("// You do not need to change anything below this line.");
    expect(source).not.toContain("must not");
  });
});

describe("purity", () => {
  it("is a pure function of the declaration", () => {
    expect(emitJavaScript(ENCRYPTION)).toBe(emitJavaScript(ENCRYPTION));
    expect(emitJavaScriptProbe(ENCRYPTION)).toBe(emitJavaScriptProbe(ENCRYPTION));
  });

  it("ends with a trailing newline", () => {
    expect(emitJavaScript(ENCRYPTION).endsWith("main();\n")).toBe(true);
  });
});
