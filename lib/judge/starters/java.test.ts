import { describe, expect, it } from "vitest";

import {
  JAVA_SOURCE_FILE,
  emitJavaProbe,
  emitJava,
  type Signature,
} from "./java";

/**
 * G3 for the Java emitter.
 *
 * Two of these assertions are the WHOLE emitted file, byte for byte. That is the point: a change to
 * the template has to show up as a diff a reviewer reads, not as a surprise a student compiles. The
 * spec's §6.1 golden files (`fixtures/starters/<slug>/Main.java`) will supersede these once the
 * shared harness lands — until then they live here so the emitter is not shipping unasserted.
 *
 * What these CANNOT prove is that the output compiles; only a container can, and SPEC §6.2's probe
 * pass is where that lives. Both goldens below were compiled with the registry's own
 * `javac --release 8 -proc:none -nowarn` in `eclipse-temurin:21-jdk` and run against the problems'
 * real test data before being pasted here.
 */

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

const A_VERY_BIG_SUM: Signature = {
  name: "aVeryBigSum",
  returns: { type: "long" },
  params: [
    { name: "n", type: "int", passed: false },
    { name: "ar", type: "long[]", length: "n" },
  ],
};

/** Seven of the twenty declarations name their repeat field `q`. This is the shape that broke. */
const CATS_AND_A_MOUSE: Signature = {
  name: "catAndMouse",
  returns: { type: "string" },
  shared: [{ name: "q", type: "int", passed: false }],
  repeat: "q",
  params: [
    { name: "x", type: "int" },
    { name: "y", type: "int" },
    { name: "z", type: "int" },
  ],
};

/** A literal array length, and a shared array read once ahead of the loop. */
const DESIGNER_PDF_VIEWER: Signature = {
  name: "designerPdfViewer",
  returns: { type: "int" },
  shared: [
    { name: "h", type: "int[]", length: 26 },
    { name: "q", type: "int", passed: false },
  ],
  repeat: "q",
  params: [{ name: "word", type: "string" }],
};

/** No authored problem uses `string[]`, so the vocabulary's last corner is covered synthetically. */
const SYNTHETIC: Signature = {
  name: "synthetic",
  returns: { type: "string[]", join: " " },
  shared: [{ name: "t", type: "int", passed: false }],
  repeat: "t",
  params: [
    { name: "wordCount", type: "int", passed: false },
    { name: "words", type: "string[]", length: "wordCount" },
    { name: "big", type: "long" },
  ],
};

const HARNESS = `// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
public class Main {
    private static final BufferedReader IN = new BufferedReader(new InputStreamReader(System.in));
    private static StringTokenizer TOK = new StringTokenizer("");

    private static String nextToken() throws IOException {
        while (!TOK.hasMoreTokens()) {
            String line = IN.readLine();
            if (line == null) return "";
            TOK = new StringTokenizer(line);
        }
        return TOK.nextToken();
    }

    private static int nextInt() throws IOException { return Integer.parseInt(nextToken()); }
    private static long nextLong() throws IOException { return Long.parseLong(nextToken()); }
`;

describe("emitJava", () => {
  it("emits the whole file for a repeat-mode string problem (encryption)", () => {
    expect(emitJava(ENCRYPTION)).toBe(`import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'encryption' function below.
     *
     * The function is expected to return a STRING.
     * The function accepts following parameter(s):
     *  1. STRING key
     *  2. STRING message
     */
    public static String encryption(String key, String message) {
        // Write your code here
        return "";
    }
}

${HARNESS}
    public static void main(String[] _args) throws IOException {
        StringBuilder _out = new StringBuilder();

        int n = nextInt();
        for (int _t = 0; _t < n; _t++) {
            String key = nextToken();
            String message = nextToken();

            _out.append(Result.encryption(key, message)).append('\\n');
        }

        System.out.print(_out);
    }
}
`);
  });

  it("emits the whole file for an array-return problem (cut-the-sticks)", () => {
    expect(emitJava(CUT_THE_STICKS)).toBe(`import java.io.*;
import java.util.*;

class Result {

    /*
     * Complete the 'cutTheSticks' function below.
     *
     * The function is expected to return an INTEGER_ARRAY.
     * The function accepts following parameter(s):
     *  1. INTEGER_ARRAY arr
     */
    public static int[] cutTheSticks(int[] arr) {
        // Write your code here
        return new int[0];
    }
}

${HARNESS}
    public static void main(String[] _args) throws IOException {
        StringBuilder _out = new StringBuilder();

        int n = nextInt();
        int[] arr = new int[n];
        for (int _i = 0; _i < n; _i++) arr[_i] = nextInt();

        int[] _result = Result.cutTheSticks(arr);
        for (int _i = 0; _i < _result.length; _i++) {
            if (_i > 0) _out.append("\\n");
            _out.append(_result[_i]);
        }
        _out.append('\\n');

        System.out.print(_out);
    }
}
`);
  });

  it("names the file the registry names, so a rename fails here not in a student's compile", () => {
    expect(JAVA_SOURCE_FILE).toBe("Main.java");
  });

  it("declares Main public and Result package-private, never HackerRank's public Solution", () => {
    const source = emitJava(ENCRYPTION);
    expect(source).toContain("public class Main {");
    expect(source).toContain("class Result {");
    expect(source).not.toContain("public class Result");
    expect(source).not.toContain("Solution");
  });

  it("gives the harness's own locals an underscore a field name can never have", () => {
    // `cats-and-a-mouse` reads a field called `q` and repeats `q` times. With the spec's
    // illustrative `for (int q = ...)` this is "variable q is already defined in method main" —
    // CE on seven of the twenty declarations.
    const source = emitJava(CATS_AND_A_MOUSE);
    expect(source).toContain("        int q = nextInt();");
    expect(source).toContain("        for (int _t = 0; _t < q; _t++) {");
    expect(source).not.toContain("for (int q = ");
  });

  it("keeps a field named after the loop index distinct from the index", () => {
    // `beautiful-days-at-the-movies` really does declare a parameter called `i`.
    const source = emitJava({
      name: "beautifulDays",
      returns: { type: "int" },
      params: [
        { name: "i", type: "int" },
        { name: "j", type: "int" },
        { name: "k", type: "int" },
      ],
    });
    expect(source).toContain("        int i = nextInt();");
    expect(source).not.toContain("for (int i = ");
  });

  it("reads shared fields once, ahead of the repeat loop", () => {
    const source = emitJava(DESIGNER_PDF_VIEWER);
    const shared = source.indexOf("int[] h = new int[26];");
    const loop = source.indexOf("for (int _t = 0;");
    expect(shared).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(shared);
    expect(source).toContain("for (int _i = 0; _i < 26; _i++) h[_i] = nextInt();");
    expect(source).toContain("public static int designerPdfViewer(int[] h, String word) {");
  });

  it("omits passed:false fields from the argument list but still reads them", () => {
    const source = emitJava(A_VERY_BIG_SUM);
    expect(source).toContain("public static long aVeryBigSum(long[] ar) {");
    expect(source).toContain("        int n = nextInt();");
    expect(source).toContain("_out.append(Result.aVeryBigSum(ar)).append('\\n');");
    // The doc comment lists the arguments, not the input stream.
    expect(source).toContain(" *  1. LONG_INTEGER_ARRAY ar");
    expect(source).not.toContain("INTEGER n");
  });

  it("maps long to long/0L and its array to long[], so a 10^17 answer is not truncated", () => {
    const source = emitJava(A_VERY_BIG_SUM);
    expect(source).toContain("long[] ar = new long[n];");
    expect(source).toContain("ar[_i] = nextLong();");
    expect(source).toContain("        return 0L;");
  });

  it("covers the whole type vocabulary, including the string[] no problem uses yet", () => {
    const source = emitJava(SYNTHETIC);
    expect(source).toContain("public static String[] synthetic(String[] words, long big) {");
    expect(source).toContain("String[] words = new String[wordCount];");
    expect(source).toContain("for (int _i = 0; _i < wordCount; _i++) words[_i] = nextToken();");
    expect(source).toContain("long big = nextLong();");
    expect(source).toContain("        return new String[0];");
    expect(source).toContain(' *  2. LONG_INTEGER big');
  });

  it("re-escapes the join separator, because a raw newline is an unterminated literal", () => {
    expect(emitJava(CUT_THE_STICKS)).toContain('_out.append("\\n");');
    expect(emitJava(SYNTHETIC)).toContain('_out.append(" ");');
  });

  it("says 'an' before INTEGER and 'a' before everything else", () => {
    expect(emitJava(CUT_THE_STICKS)).toContain("expected to return an INTEGER_ARRAY.");
    expect(emitJava(DESIGNER_PDF_VIEWER)).toContain("expected to return an INTEGER.");
    expect(emitJava(A_VERY_BIG_SUM)).toContain("expected to return a LONG_INTEGER.");
    expect(emitJava(ENCRYPTION)).toContain("expected to return a STRING.");
    expect(emitJava(SYNTHETIC)).toContain("expected to return a STRING_ARRAY.");
  });

  it("puts the student's cursor line above the banner", () => {
    const source = emitJava(ENCRYPTION);
    expect(source.indexOf("// Write your code here")).toBeLessThan(
      source.indexOf("You do not need to change anything below this line"),
    );
  });

  it("says 'do not need to', never 'must not' — a Java student may have to add an import", () => {
    expect(emitJava(ENCRYPTION)).toContain("You do not need to change anything below this line.");
    expect(emitJava(ENCRYPTION)).not.toContain("must not");
  });

  it("drops the parameter list line when nothing is passed", () => {
    const source = emitJava({
      name: "answer",
      returns: { type: "int" },
      params: [{ name: "n", type: "int", passed: false }],
    });
    expect(source).toContain("public static int answer() {");
    expect(source).not.toContain("accepts following parameter(s)");
    expect(source).toContain("_out.append(Result.answer()).append('\\n');");
  });

  it("ends with exactly one trailing newline", () => {
    const source = emitJava(ENCRYPTION);
    expect(source.endsWith("}\n")).toBe(true);
    expect(source.endsWith("}\n\n")).toBe(false);
  });

  it("is pure — same declaration, same bytes", () => {
    expect(emitJava(ENCRYPTION)).toBe(emitJava(ENCRYPTION));
  });

  it("refuses a malformed declaration rather than emitting code that will not compile", () => {
    expect(() =>
      emitJava({
        name: "f",
        returns: { type: "int" },
        params: [{ name: "ar", type: "int[]" }],
      }),
    ).toThrow(/no length/);

    expect(() =>
      emitJava({
        name: "f",
        returns: { type: "int[]" },
        params: [{ name: "a", type: "int" }],
      }),
    ).toThrow(/no join/);
  });
});

describe("emitJavaProbe", () => {
  it("contains the starter's stub verbatim, so compiling the probe proves the starter compiles", () => {
    const starter = emitJava(ENCRYPTION);
    const probe = emitJavaProbe(ENCRYPTION);

    // Everything except the inserted echo block is identical.
    expect(probe.replace(/^ +System\.out\.println\(.+\);\n/gm, "")).toBe(starter);
    expect(probe).toContain("        // Write your code here");
    expect(probe).toContain('        return "";');
  });

  it("echoes every argument in declaration order, one per line", () => {
    const probe = emitJavaProbe(ENCRYPTION);
    const key = probe.indexOf("System.out.println(key);");
    const message = probe.indexOf("System.out.println(message);");
    expect(key).toBeGreaterThan(-1);
    expect(message).toBeGreaterThan(key);
  });

  it("echoes an array as '<len>: e1 e2 ...' in a block of its own", () => {
    const probe = emitJavaProbe(CUT_THE_STICKS);
    expect(probe).toContain(`        {
            StringBuilder _p = new StringBuilder();
            _p.append(arr.length).append(':');
            for (int _j = 0; _j < arr.length; _j++) _p.append(' ').append(arr[_j]);
            System.out.println(_p);
        }`);
  });

  it("gives each array echo its own scope so two arrays do not redeclare the buffer", () => {
    const probe = emitJavaProbe({
      name: "twoArrays",
      returns: { type: "int" },
      params: [
        { name: "m", type: "int", passed: false },
        { name: "a", type: "int[]", length: "m" },
        { name: "b", type: "int[]", length: "m" },
      ],
    });
    expect(probe.match(/StringBuilder _p = new StringBuilder\(\);/g)).toHaveLength(2);
    expect(probe.match(/^ {8}\{$/gm)).toHaveLength(2);
  });

  it("never echoes a passed:false field, which the function does not receive", () => {
    expect(emitJavaProbe(A_VERY_BIG_SUM)).not.toContain("System.out.println(n);");
  });
});
