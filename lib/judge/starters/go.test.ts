import { describe, expect, it } from "vitest";

import {
  emitGo,
  emitGoProbe,
  goArgumentFields,
  GO_SOURCE_FILE,
  StarterEmitError,
  type Signature,
} from "@/lib/judge/starters/go";

/**
 * G3 for the Go emitter.
 *
 * The three full-file goldens below are the point of this suite: a change to the harness template
 * shows up as a reviewable diff here rather than as a surprise in front of a student. They are
 * OUTPUTS, not hand-maintained inputs — regenerate them by running the emitter, read the diff, and
 * commit it only if the new bytes are what you meant.
 *
 * Every golden in this file was compiled and run in `ptcn-go:1.23` with the registry's own
 * `compileCommand` and `runCommand` before being committed; the filled versions of the first three
 * scored 14/14, 16/16 and 15/15 against the problems' real test data.
 *
 * `String.raw` is deliberate: the Go source contains `"\n"` as two characters, and an ordinary
 * template literal would turn it into a real newline and make the golden a lie.
 */

const A_VERY_BIG_SUM: Signature = {
  name: "aVeryBigSum",
  returns: { type: "long" },
  params: [
    { name: "n", type: "int", passed: false },
    { name: "ar", type: "long[]", length: "n" },
  ],
};

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

const CUT_THE_STICKS: Signature = {
  name: "cutTheSticks",
  returns: { type: "int[]", join: "\n" },
  params: [
    { name: "n", type: "int", passed: false },
    { name: "arr", type: "int[]", length: "n" },
  ],
};

const A_VERY_BIG_SUM_GO = String.raw`package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
)

/*
 * Complete the 'aVeryBigSum' function below.
 *
 * The function is expected to return a LONG_INTEGER.
 * The function accepts following parameter(s):
 *  1. LONG_INTEGER_ARRAY ar
 */
func aVeryBigSum(ar []int64) int64 {
	// Write your code here
	return 0
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------

var stdin = bufio.NewScanner(os.Stdin)
var stdout = bufio.NewWriter(os.Stdout)

func nextToken() string {
	stdin.Scan()
	return stdin.Text()
}

func nextInt() int {
	v, _ := strconv.Atoi(nextToken())
	return v
}

func nextInt64() int64 {
	v, _ := strconv.ParseInt(nextToken(), 10, 64)
	return v
}

func main() {
	stdin.Split(bufio.ScanWords)
	stdin.Buffer(make([]byte, 1024*1024), 1024*1024)
	defer stdout.Flush()

	n := nextInt()
	ar := make([]int64, n)
	for _i := 0; _i < n; _i++ {
		ar[_i] = nextInt64()
	}

	fmt.Fprintln(stdout, aVeryBigSum(ar))
}
`;

const ENCRYPTION_GO = String.raw`package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
)

/*
 * Complete the 'encryption' function below.
 *
 * The function is expected to return a STRING.
 * The function accepts following parameter(s):
 *  1. STRING key
 *  2. STRING message
 */
func encryption(key string, message string) string {
	// Write your code here
	return ""
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------

var stdin = bufio.NewScanner(os.Stdin)
var stdout = bufio.NewWriter(os.Stdout)

func nextToken() string {
	stdin.Scan()
	return stdin.Text()
}

func nextInt() int {
	v, _ := strconv.Atoi(nextToken())
	return v
}

func nextInt64() int64 {
	v, _ := strconv.ParseInt(nextToken(), 10, 64)
	return v
}

func main() {
	stdin.Split(bufio.ScanWords)
	stdin.Buffer(make([]byte, 1024*1024), 1024*1024)
	defer stdout.Flush()

	n := nextInt()

	for _t := 0; _t < n; _t++ {
		key := nextToken()
		message := nextToken()

		fmt.Fprintln(stdout, encryption(key, message))
	}
}
`;

const CUT_THE_STICKS_GO = String.raw`package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
)

/*
 * Complete the 'cutTheSticks' function below.
 *
 * The function is expected to return an INTEGER_ARRAY.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY arr
 */
func cutTheSticks(arr []int) []int {
	// Write your code here
	return nil
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------

var stdin = bufio.NewScanner(os.Stdin)
var stdout = bufio.NewWriter(os.Stdout)

func nextToken() string {
	stdin.Scan()
	return stdin.Text()
}

func nextInt() int {
	v, _ := strconv.Atoi(nextToken())
	return v
}

func nextInt64() int64 {
	v, _ := strconv.ParseInt(nextToken(), 10, 64)
	return v
}

func main() {
	stdin.Split(bufio.ScanWords)
	stdin.Buffer(make([]byte, 1024*1024), 1024*1024)
	defer stdout.Flush()

	n := nextInt()
	arr := make([]int, n)
	for _i := 0; _i < n; _i++ {
		arr[_i] = nextInt()
	}

	_result := cutTheSticks(arr)
	for _i, _v := range _result {
		if _i > 0 {
			fmt.Fprint(stdout, "\n")
		}
		fmt.Fprint(stdout, _v)
	}
	fmt.Fprint(stdout, "\n")
}
`;

const A_VERY_BIG_SUM_PROBE_GO = String.raw`package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
)

/*
 * Complete the 'aVeryBigSum' function below.
 *
 * The function is expected to return a LONG_INTEGER.
 * The function accepts following parameter(s):
 *  1. LONG_INTEGER_ARRAY ar
 */
func aVeryBigSum(ar []int64) int64 {
	// Write your code here
	fmt.Fprint(stdout, len(ar))
	fmt.Fprint(stdout, ":")
	for _, _v := range ar {
		fmt.Fprint(stdout, " ")
		fmt.Fprint(stdout, _v)
	}
	fmt.Fprint(stdout, "\n")
	return 0
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------

var stdin = bufio.NewScanner(os.Stdin)
var stdout = bufio.NewWriter(os.Stdout)

func nextToken() string {
	stdin.Scan()
	return stdin.Text()
}

func nextInt() int {
	v, _ := strconv.Atoi(nextToken())
	return v
}

func nextInt64() int64 {
	v, _ := strconv.ParseInt(nextToken(), 10, 64)
	return v
}

func main() {
	stdin.Split(bufio.ScanWords)
	stdin.Buffer(make([]byte, 1024*1024), 1024*1024)
	defer stdout.Flush()

	n := nextInt()
	ar := make([]int64, n)
	for _i := 0; _i < n; _i++ {
		ar[_i] = nextInt64()
	}

	fmt.Fprintln(stdout, aVeryBigSum(ar))
}
`;

describe("emitGo — whole-file goldens", () => {
  it("emits a-very-big-sum byte for byte", () => {
    expect(emitGo(A_VERY_BIG_SUM)).toBe(A_VERY_BIG_SUM_GO);
  });

  it("emits encryption byte for byte (repeat loop, string in, string out)", () => {
    expect(emitGo(ENCRYPTION)).toBe(ENCRYPTION_GO);
  });

  it("emits cut-the-sticks byte for byte (array return joined by newline)", () => {
    expect(emitGo(CUT_THE_STICKS)).toBe(CUT_THE_STICKS_GO);
  });

  it("emits the a-very-big-sum probe byte for byte", () => {
    expect(emitGoProbe(A_VERY_BIG_SUM)).toBe(A_VERY_BIG_SUM_PROBE_GO);
  });
});

describe("the probe is the starter plus echo lines", () => {
  // §6.2: a probe that compiles proves the STARTER compiles, and that only holds if the probe
  // contains the stub verbatim. Deleting the echo lines must give back the starter exactly.
  const echoLess = (probe: string): string =>
    probe
      .split("\n")
      .filter((line) => !/^\tfmt\.Fprint(ln)?\(stdout, (len\()?(n|ar|key|message)/.test(line))
      .join("\n");

  it("leaves the zero return in place", () => {
    expect(emitGoProbe(A_VERY_BIG_SUM)).toContain("\t// Write your code here\n");
    expect(emitGoProbe(A_VERY_BIG_SUM)).toContain("\treturn 0\n}");
  });

  it("echoes every argument and nothing that was not passed", () => {
    const probe = emitGoProbe(ENCRYPTION);
    expect(probe).toContain("\tfmt.Fprintln(stdout, key)");
    expect(probe).toContain("\tfmt.Fprintln(stdout, message)");
    // `n` is `passed: false`, so it is read but never handed to the function and never echoed.
    expect(probe).not.toContain("fmt.Fprintln(stdout, n)");
  });

  it("echoes an array as <len>: e1 e2 ...", () => {
    expect(emitGoProbe(A_VERY_BIG_SUM)).toContain("\tfmt.Fprint(stdout, len(ar))");
    expect(emitGoProbe(A_VERY_BIG_SUM)).toContain('\tfmt.Fprint(stdout, ":")');
  });

  it("differs from the starter only by lines the student zone gained", () => {
    expect(echoLess(emitGoProbe(ENCRYPTION))).toBe(emitGo(ENCRYPTION));
  });
});

describe("the two Go rules that are hard compile errors", () => {
  it("emits the same fixed four imports every time, so none can go unused", () => {
    const imports = (source: string): string =>
      source.slice(source.indexOf("import ("), source.indexOf(")\n") + 2);
    const expected = 'import (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strconv"\n)\n';

    expect(imports(emitGo(A_VERY_BIG_SUM))).toBe(expected);
    expect(imports(emitGo(ENCRYPTION))).toBe(expected);
    expect(imports(emitGo(CUT_THE_STICKS))).toBe(expected);
  });

  it("never pre-declares a local in the stub — `result := 0` is `declared and not used`", () => {
    for (const sig of [A_VERY_BIG_SUM, ENCRYPTION, CUT_THE_STICKS]) {
      const afterComment = emitGo(sig).split("// Write your code here\n")[1] ?? "";
      const stub = (afterComment.split("}\n")[0] ?? "").trim();
      expect(stub.split("\n")).toHaveLength(1);
      expect(stub.startsWith("return ")).toBe(true);
    }
  });

  it("discards a field that is read but used for nothing at all", () => {
    const sig: Signature = {
      name: "solveMeFirst",
      returns: { type: "int" },
      shared: [{ name: "ignored", type: "int", passed: false }],
      params: [
        { name: "a", type: "int" },
        { name: "b", type: "int" },
      ],
    };
    // Without the discard this is `ignored declared and not used`: CE on a starter we shipped.
    expect(emitGo(sig)).toContain("\tignored := nextInt()\n\t_ = ignored\n");
  });

  it("does not discard a field that is a length, a repeat count, or an argument", () => {
    expect(emitGo(A_VERY_BIG_SUM)).not.toContain("_ = n"); // length of ar
    expect(emitGo(ENCRYPTION)).not.toContain("_ = n"); // repeat count
    expect(emitGo(ENCRYPTION)).not.toContain("_ = key"); // passed
  });
});

describe("harness identifiers cannot collide with a declared field", () => {
  it("uses _i for array indices, so a parameter called i is safe", () => {
    const sig: Signature = {
      name: "beautifulDays",
      returns: { type: "int" },
      params: [
        { name: "i", type: "int" },
        { name: "n", type: "int", passed: false },
        { name: "a", type: "int[]", length: "n" },
      ],
    };
    const source = emitGo(sig);
    expect(source).toContain("\ti := nextInt()");
    expect(source).toContain("\tfor _i := 0; _i < n; _i++ {");
    expect(source).not.toContain("for i := 0;");
  });

  it("uses _t for the repeat loop, so `for q := 0; q < q; q++` can never be emitted", () => {
    const sig: Signature = {
      name: "squares",
      returns: { type: "int" },
      shared: [{ name: "q", type: "int", passed: false }],
      repeat: "q",
      params: [
        { name: "a", type: "int" },
        { name: "b", type: "int" },
      ],
    };
    expect(emitGo(sig)).toContain("\tfor _t := 0; _t < q; _t++ {");
  });
});

describe("the doc comment", () => {
  it("says an INTEGER and an INTEGER_ARRAY but a LONG_INTEGER", () => {
    expect(emitGo(CUT_THE_STICKS)).toContain(
      " * The function is expected to return an INTEGER_ARRAY.",
    );
    expect(emitGo(A_VERY_BIG_SUM)).toContain(
      " * The function is expected to return a LONG_INTEGER.",
    );
    expect(emitGo(ENCRYPTION)).toContain(" * The function is expected to return a STRING.");
  });

  it("numbers the parameters in argument order, skipping the ones not passed", () => {
    expect(emitGo(A_VERY_BIG_SUM)).toContain(" *  1. LONG_INTEGER_ARRAY ar");
    expect(emitGo(A_VERY_BIG_SUM)).not.toContain("INTEGER n");
  });

  it("says so plainly when the function takes nothing", () => {
    const sig: Signature = {
      name: "answer",
      returns: { type: "int" },
      params: [{ name: "n", type: "int", passed: false }],
    };
    expect(emitGo(sig)).toContain(" * The function accepts no parameters.");
    expect(emitGo(sig)).toContain("func answer() int {");
  });
});

describe("types, zero values and array shapes", () => {
  it("maps long[] to []int64 rather than []int", () => {
    // Go's int is 64-bit on the judging host, so []int would be accidentally correct.
    expect(emitGo(A_VERY_BIG_SUM)).toContain("func aVeryBigSum(ar []int64) int64 {");
    expect(emitGo(A_VERY_BIG_SUM)).toContain("\tar := make([]int64, n)");
  });

  it("accepts a literal array length", () => {
    const sig: Signature = {
      name: "designerPdfViewer",
      returns: { type: "int" },
      shared: [
        { name: "h", type: "int[]", length: 26 },
        { name: "q", type: "int", passed: false },
      ],
      repeat: "q",
      params: [{ name: "word", type: "string" }],
    };
    expect(emitGo(sig)).toContain("\th := make([]int, 26)");
    expect(emitGo(sig)).toContain("\tfor _i := 0; _i < 26; _i++ {");
  });

  it("returns nil for an array stub and \"\" for a string stub", () => {
    expect(emitGo(CUT_THE_STICKS)).toContain("\treturn nil\n}");
    expect(emitGo(ENCRYPTION)).toContain('\treturn ""\n}');
  });

  it("separates a returned array by its join and still ends the call with a newline", () => {
    const spaced: Signature = {
      name: "howManyGames",
      returns: { type: "int[]", join: " " },
      shared: [{ name: "q", type: "int", passed: false }],
      repeat: "q",
      params: [{ name: "p", type: "int" }],
    };
    expect(emitGo(spaced)).toContain('\t\t\tfmt.Fprint(stdout, " ")');
    expect(emitGo(spaced)).toContain('\t\tfmt.Fprint(stdout, "\\n")');
  });

  it("handles the string[] shape no authored problem uses yet", () => {
    const sig: Signature = {
      name: "shout",
      returns: { type: "string[]", join: " " },
      params: [
        { name: "wordCount", type: "int", passed: false },
        { name: "words", type: "string[]", length: "wordCount" },
      ],
    };
    const source = emitGo(sig);
    expect(source).toContain("func shout(words []string) []string {");
    expect(source).toContain("\twords := make([]string, wordCount)");
    expect(source).toContain("\t\twords[_i] = nextToken()");
    expect(source).toContain(" *  1. STRING_ARRAY words");
  });
});

describe("what the emitter refuses to guess", () => {
  it("throws when an array field has no length", () => {
    const sig: Signature = {
      name: "f",
      returns: { type: "int" },
      params: [{ name: "a", type: "int[]" }],
    };
    expect(() => emitGo(sig)).toThrow(StarterEmitError);
    expect(() => emitGo(sig)).toThrow(/array field 'a' has no length/);
  });

  it("throws when an array return has no join", () => {
    const sig: Signature = {
      name: "f",
      returns: { type: "int[]" },
      params: [{ name: "a", type: "int" }],
    };
    expect(() => emitGo(sig)).toThrow(/no join separator/);
  });
});

describe("the surface the shared dispatcher uses", () => {
  it("names the variant source file it serves", () => {
    expect(GO_SOURCE_FILE).toBe("main.go");
  });

  it("orders arguments shared-then-params, skipping the ones not passed", () => {
    const sig: Signature = {
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
    expect(goArgumentFields(sig).map((f) => f.name)).toEqual(["k", "a", "m"]);
    expect(emitGo(sig)).toContain("func circularArrayRotation(k int, a []int, m int) int {");
  });
});

describe("formatting invariants gofmt would otherwise catch", () => {
  const everyShape = [A_VERY_BIG_SUM, ENCRYPTION, CUT_THE_STICKS];

  it("indents with tabs only and leaves no trailing whitespace", () => {
    for (const sig of everyShape) {
      for (const line of emitGo(sig).split("\n")) {
        expect(line).not.toMatch(/[ \t]$/);
        // Block-comment continuations start with " * " by design; code never leads with a space.
        if (line.startsWith(" *") || line === "/*") continue;
        expect(line).not.toMatch(/^\t* /);
      }
    }
  });

  it("ends with exactly one newline", () => {
    for (const sig of everyShape) {
      const source = emitGo(sig);
      expect(source.endsWith("}\n")).toBe(true);
      expect(source.endsWith("}\n\n")).toBe(false);
    }
  });
});
