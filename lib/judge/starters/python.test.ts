import { describe, expect, it } from "vitest";

import {
  emitPython,
  emitPythonProbe,
  signatureDocLines,
  type Signature,
} from "./python";

/**
 * G3 — the Python emitter.
 *
 * The first two tests pin WHOLE FILES rather than fragments, and that is the point: a change to
 * the template has to show up as a readable diff in a pull request instead of as a student
 * staring at a starter that no longer compiles. Everything a fragment assertion would prove is
 * already inside these two strings.
 *
 * The remaining tests cover the axes the two whole files do not reach — the other four types,
 * the literal array length, the `join` variants, and the invariants the file's comments claim.
 */

/* ------------------------------------------------------------------------ */
/* Declarations under test                                                  */
/* ------------------------------------------------------------------------ */

/** No repeat, an array whose length is an earlier unpassed field, 64-bit answer. */
const A_VERY_BIG_SUM: Signature = {
  name: "aVeryBigSum",
  returns: { type: "long" },
  params: [
    { name: "n", type: "int", passed: false },
    { name: "ar", type: "long[]", length: "n" },
  ],
};

/** Repeat mode driven by a shared field, two string params, string answer. */
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

/* ------------------------------------------------------------------------ */
/* Whole-file goldens                                                       */
/* ------------------------------------------------------------------------ */

const A_VERY_BIG_SUM_STARTER = `import sys

#
# Complete the 'aVeryBigSum' function below.
#
# The function is expected to return a LONG_INTEGER.
# The function accepts following parameter(s):
#  1. LONG_INTEGER_ARRAY ar
#
def aVeryBigSum(ar):
    # Write your code here
    return 0


# ---------------------------------------------------------------------------
# Everything below reads the input and prints the answer.
# You do not need to change anything below this line.
# ---------------------------------------------------------------------------
_TOKENS = sys.stdin.read().split()
_POS = 0


def _next_token():
    global _POS
    token = _TOKENS[_POS]
    _POS += 1
    return token


def _next_int():
    return int(_next_token())


def main():
    _out = []

    n = _next_int()
    ar = [_next_int() for _ in range(n)]

    _out.append(str(aVeryBigSum(ar)))

    sys.stdout.write("\\n".join(_out) + "\\n")


main()
`;

const ENCRYPTION_STARTER = `import sys

#
# Complete the 'encryption' function below.
#
# The function is expected to return a STRING.
# The function accepts following parameter(s):
#  1. STRING key
#  2. STRING message
#
def encryption(key, message):
    # Write your code here
    return ""


# ---------------------------------------------------------------------------
# Everything below reads the input and prints the answer.
# You do not need to change anything below this line.
# ---------------------------------------------------------------------------
_TOKENS = sys.stdin.read().split()
_POS = 0


def _next_token():
    global _POS
    token = _TOKENS[_POS]
    _POS += 1
    return token


def _next_int():
    return int(_next_token())


def main():
    _out = []

    n = _next_int()
    for _ in range(n):
        key = _next_token()
        message = _next_token()

        _out.append(str(encryption(key, message)))

    sys.stdout.write("\\n".join(_out) + "\\n")


main()
`;

describe("emitPython — whole file", () => {
  it("emits the a-very-big-sum starter byte for byte", () => {
    expect(emitPython(A_VERY_BIG_SUM)).toBe(A_VERY_BIG_SUM_STARTER);
  });

  it("emits the encryption starter byte for byte, repeat loop included", () => {
    expect(emitPython(ENCRYPTION)).toBe(ENCRYPTION_STARTER);
  });

  it("is pure — the same declaration emits the same bytes every call", () => {
    expect(emitPython(ENCRYPTION)).toBe(emitPython(ENCRYPTION));
  });
});

describe("emitPythonProbe", () => {
  it("inserts echoes after the cursor line and leaves the stub otherwise intact", () => {
    // The probe must CONTAIN the starter's stub verbatim, because that is what makes one G13
    // container prove both "the harness reads correctly" and "the starter compiles".
    expect(emitPythonProbe(A_VERY_BIG_SUM)).toBe(
      A_VERY_BIG_SUM_STARTER.replace(
        "    # Write your code here\n",
        '    # Write your code here\n    print(str(len(ar)) + ": " + " ".join(str(_e) for _e in ar))\n',
      ),
    );
  });

  it("echoes one line per argument, in declaration order", () => {
    expect(emitPythonProbe(ENCRYPTION)).toContain(
      [
        "def encryption(key, message):",
        "    # Write your code here",
        "    print(key)",
        "    print(message)",
        '    return ""',
      ].join("\n"),
    );
  });

  it("does not echo a field the declaration withholds from the function", () => {
    // `n` is `passed: false`, so it is read but never an argument — and a probe that echoed it
    // would make the golden disagree with the five emitters that follow the same rule.
    expect(emitPythonProbe(ENCRYPTION)).not.toContain("print(n)");
  });
});

/* ------------------------------------------------------------------------ */
/* Per-type behaviour                                                       */
/* ------------------------------------------------------------------------ */

/** A one-line declaration helper, so each case below reads as the thing it is testing. */
function starterFor(signature: Signature): string {
  return emitPython(signature);
}

describe("types", () => {
  it("returns the right zero for every declarable return type", () => {
    const zeros: ReadonlyArray<readonly [Signature["returns"], string]> = [
      [{ type: "int" }, "    return 0"],
      // Python's int is unbounded, so `long` needs no widening suffix the way Java's 0L does.
      [{ type: "long" }, "    return 0"],
      [{ type: "string" }, '    return ""'],
      [{ type: "int[]", join: "\n" }, "    return []"],
      [{ type: "long[]", join: "\n" }, "    return []"],
      [{ type: "string[]", join: " " }, "    return []"],
    ];

    for (const [returns, expected] of zeros) {
      const source = starterFor({ name: "f", returns, params: [] });
      expect(source.split("\n")).toContain(expected);
    }
  });

  it("reads string arrays with the token reader and numeric arrays with the int reader", () => {
    const source = starterFor({
      name: "f",
      returns: { type: "int" },
      params: [
        { name: "k", type: "int", passed: false },
        { name: "words", type: "string[]", length: "k" },
        { name: "nums", type: "long[]", length: "k" },
      ],
    });

    expect(source).toContain("    words = [_next_token() for _ in range(k)]");
    expect(source).toContain("    nums = [_next_int() for _ in range(k)]");
  });

  it("accepts a literal array length", () => {
    const source = starterFor({
      name: "f",
      returns: { type: "int" },
      params: [{ name: "h", type: "int[]", length: 26 }],
    });

    expect(source).toContain("    h = [_next_int() for _ in range(26)]");
  });

  it("joins an array answer with the declared separator", () => {
    const newline = starterFor({
      name: "f",
      returns: { type: "int[]", join: "\n" },
      params: [{ name: "a", type: "int" }],
    });
    const space = starterFor({
      name: "f",
      returns: { type: "int[]", join: " " },
      params: [{ name: "a", type: "int" }],
    });

    expect(newline).toContain('    _out.append("\\n".join(str(_e) for _e in f(a)))');
    expect(space).toContain('    _out.append(" ".join(str(_e) for _e in f(a)))');
  });

  it("refuses to emit an array field with no length rather than emitting range(undefined)", () => {
    expect(() =>
      starterFor({
        name: "f",
        returns: { type: "int" },
        params: [{ name: "a", type: "int[]" }],
      }),
    ).toThrow(/declares no length/);
  });
});

/* ------------------------------------------------------------------------ */
/* Reading order and the argument list                                      */
/* ------------------------------------------------------------------------ */

describe("reading order", () => {
  it("reads shared fields once and params once per repetition", () => {
    const source = starterFor({
      name: "designerPdfViewer",
      returns: { type: "int" },
      shared: [
        { name: "h", type: "int[]", length: 26 },
        { name: "q", type: "int", passed: false },
      ],
      repeat: "q",
      params: [{ name: "word", type: "string" }],
    });

    expect(source).toContain(
      [
        "    h = [_next_int() for _ in range(26)]",
        "    q = _next_int()",
        "    for _ in range(q):",
        "        word = _next_token()",
        "",
        "        _out.append(str(designerPdfViewer(h, word)))",
      ].join("\n"),
    );
  });

  it("still reads an unpassed field but keeps it out of the signature and the call", () => {
    const source = starterFor(A_VERY_BIG_SUM);

    expect(source).toContain("    n = _next_int()");
    expect(source).toContain("def aVeryBigSum(ar):");
    expect(source).toContain("_out.append(str(aVeryBigSum(ar)))");
    expect(source).not.toContain("aVeryBigSum(n, ar)");
  });

  it("emits no blank line inside a repeat body that reads nothing", () => {
    // A repeat with no per-call fields is legal (every call takes only shared arguments). A
    // stray blank first line would make the loop body look truncated.
    const source = starterFor({
      name: "f",
      returns: { type: "int" },
      shared: [
        { name: "q", type: "int", passed: false },
        { name: "x", type: "int" },
      ],
      repeat: "q",
      params: [],
    });

    expect(source).toContain("    for _ in range(q):\n        _out.append(str(f(x)))");
  });
});

/* ------------------------------------------------------------------------ */
/* Doc comment                                                              */
/* ------------------------------------------------------------------------ */

describe("signatureDocLines", () => {
  it("uses HackerRank's wording, including 'following parameter(s)'", () => {
    expect(signatureDocLines(ENCRYPTION)).toEqual([
      "Complete the 'encryption' function below.",
      "",
      "The function is expected to return a STRING.",
      "The function accepts following parameter(s):",
      " 1. STRING key",
      " 2. STRING message",
    ]);
  });

  it("says 'an' before INTEGER and INTEGER_ARRAY, 'a' before everything else", () => {
    const article = (returns: Signature["returns"]): string | undefined =>
      signatureDocLines({ name: "f", returns, params: [] })[2];

    expect(article({ type: "int" })).toBe("The function is expected to return an INTEGER.");
    expect(article({ type: "int[]", join: "\n" })).toBe(
      "The function is expected to return an INTEGER_ARRAY.",
    );
    expect(article({ type: "long" })).toBe("The function is expected to return a LONG_INTEGER.");
    expect(article({ type: "long[]", join: "\n" })).toBe(
      "The function is expected to return a LONG_INTEGER_ARRAY.",
    );
    expect(article({ type: "string" })).toBe("The function is expected to return a STRING.");
    expect(article({ type: "string[]", join: " " })).toBe(
      "The function is expected to return a STRING_ARRAY.",
    );
  });

  it("omits the parameter list when the function takes no arguments", () => {
    expect(signatureDocLines({ name: "f", returns: { type: "int" }, params: [] })).toEqual([
      "Complete the 'f' function below.",
      "",
      "The function is expected to return an INTEGER.",
    ]);
  });

  it("lets the shared dispatcher supply the doc body instead", () => {
    // The shared generator owns one doc builder for all six languages; this is the seam it uses.
    const source = emitPython(A_VERY_BIG_SUM, ["Only this.", "", "And this."]);

    expect(source).toContain("#\n# Only this.\n#\n# And this.\n#\ndef aVeryBigSum(ar):");
    expect(source).not.toContain("following parameter(s)");
  });
});

/* ------------------------------------------------------------------------ */
/* Invariants the harness depends on                                        */
/* ------------------------------------------------------------------------ */

describe("invariants", () => {
  const everyShape: readonly Signature[] = [
    A_VERY_BIG_SUM,
    ENCRYPTION,
    { name: "f", returns: { type: "int" }, params: [] },
    {
      name: "f",
      returns: { type: "string[]", join: " " },
      shared: [{ name: "t", type: "int", passed: false }],
      repeat: "t",
      params: [
        { name: "c", type: "int", passed: false },
        { name: "w", type: "string[]", length: "c" },
      ],
    },
  ];

  it("never emits an empty function body — an empty def is CE, not a blank canvas", () => {
    for (const signature of everyShape) {
      const source = emitPython(signature);
      const stub = source.slice(source.indexOf("    # Write your code here"));
      expect(stub.split("\n")[1]).toMatch(/^ {4}return /);
    }
  });

  it("writes to stdout and never opens a file — OUTPUT_PATH is HackerRank's detail, not ours", () => {
    for (const signature of everyShape) {
      const source = emitPython(signature);
      expect(source).toContain('sys.stdout.write("\\n".join(_out) + "\\n")');
      expect(source).not.toContain("OUTPUT_PATH");
      expect(source).not.toContain("open(");
    }
  });

  it("ends with exactly one trailing newline after the main() call", () => {
    for (const signature of everyShape) {
      expect(emitPython(signature).endsWith("\n\n\nmain()\n")).toBe(true);
    }
  });

  it("declares the harness helpers below the student zone", () => {
    for (const signature of everyShape) {
      const source = emitPython(signature);
      expect(source.indexOf("# Write your code here")).toBeLessThan(
        source.indexOf("_TOKENS = sys.stdin.read().split()"),
      );
    }
  });
});
