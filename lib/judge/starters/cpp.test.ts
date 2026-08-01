import { describe, expect, it } from "vitest";

import {
  CPP_SOURCE_FILE,
  cppArgumentNames,
  cppDocCommentLines,
  cppSignatureLine,
  emitCppProbe,
  emitCpp,
  type Signature,
} from "./cpp";

/**
 * G3 for the C++ emitter.
 *
 * The whole-file assertions below are deliberately INLINE rather than in `fixtures/`, against
 * the usual convention, for one reason: the thing under test is the exact text a student opens,
 * and a reviewer must see every changed character of it in the diff of the change that caused
 * it. `fixtures/starters/<slug>/main.cpp` (spec §6.1) is the project-wide golden set and covers
 * all 20 problems across all six languages; these two are this emitter's own tripwire and stay
 * here so that editing `cpp.ts` and editing its expected output are one reviewable hunk.
 *
 * What this file CANNOT prove is that the emitted text compiles. Only the real `gcc:14` image
 * can, which is G13's probe pass (spec §6.2). Both were run by hand against both standards
 * before this emitter was committed; see the report in the implementing commit.
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

/** Literal array length, plus a field actually named `q` that `repeat` then refers to. */
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

describe("emitCpp", () => {
  it("emits the whole file for a repeat-mode, string-in/string-out problem", () => {
    expect(emitCpp(ENCRYPTION)).toBe(`#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'encryption' function below.
 *
 * The function is expected to return a STRING.
 * The function accepts following parameter(s):
 *  1. STRING key
 *  2. STRING message
 */
string encryption(string key, string message) {
    // Write your code here
    return "";
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    cin >> n;

    for (int t_itr = 0; t_itr < n; t_itr++) {
        string key;
        cin >> key;
        string message;
        cin >> message;

        cout << encryption(key, message) << "\\n";
    }

    return 0;
}
`);
  });

  it("emits the whole file for a single-call problem returning an array", () => {
    expect(emitCpp(CUT_THE_STICKS)).toBe(`#include <bits/stdc++.h>
using namespace std;

/*
 * Complete the 'cutTheSticks' function below.
 *
 * The function is expected to return an INTEGER_ARRAY.
 * The function accepts following parameter(s):
 *  1. INTEGER_ARRAY arr
 */
vector<int> cutTheSticks(vector<int> arr) {
    // Write your code here
    return vector<int>();
}

// ---------------------------------------------------------------------------
// Everything below reads the input and prints the answer.
// You do not need to change anything below this line.
// ---------------------------------------------------------------------------
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    cin >> n;
    vector<int> arr(n);
    for (int i_itr = 0; i_itr < n; i_itr++) cin >> arr[i_itr];

    vector<int> result = cutTheSticks(arr);
    for (int i_itr = 0; i_itr < (int)result.size(); i_itr++) {
        if (i_itr > 0) cout << "\\n";
        cout << result[i_itr];
    }
    cout << "\\n";

    return 0;
}
`);
  });

  it("is pure — the same declaration emits the same bytes every time", () => {
    expect(emitCpp(ENCRYPTION)).toBe(emitCpp(ENCRYPTION));
  });

  it("names the file both C++ variants write", () => {
    expect(CPP_SOURCE_FILE).toBe("main.cpp");
  });
});

describe("the repeat counter never shadows a declared field", () => {
  /**
   * Seven of the twenty authored problems declare `q` and repeat `q` times. The natural
   * `for (int q = 0; q < q; q++)` compiles, runs zero iterations and prints nothing — a
   * silent wrong answer on every submission of those seven problems.
   */
  it("uses t_itr, which a declared name can never be", () => {
    const source = emitCpp(DESIGNER_PDF_VIEWER);
    expect(source).toContain("for (int t_itr = 0; t_itr < q; t_itr++) {");
    expect(source).not.toContain("q < q");
  });

  it("still avoids the collision if a field is somehow named t_itr", () => {
    const source = emitCpp({
      ...DESIGNER_PDF_VIEWER,
      params: [{ name: "t_itr", type: "string" }],
    });
    expect(source).toContain("for (int t_itr_ = 0; t_itr_ < q; t_itr_++) {");
  });

  it("still avoids the collision if a field is somehow named i_itr", () => {
    const source = emitCpp({
      name: "f",
      returns: { type: "int" },
      params: [
        { name: "n", type: "int", passed: false },
        { name: "i_itr", type: "int[]", length: "n" },
      ],
    });
    expect(source).toContain("for (int i_itr_ = 0; i_itr_ < n; i_itr_++) cin >> i_itr[i_itr_];");
  });

  it("still avoids the collision if a field is somehow named result", () => {
    const source = emitCpp({
      name: "f",
      returns: { type: "int[]", join: " " },
      params: [{ name: "result", type: "int" }],
    });
    expect(source).toContain("vector<int> result_ = f(result);");
  });
});

describe("types", () => {
  it("maps long to long long so a 10^17 answer is not truncated", () => {
    expect(cppSignatureLine(A_VERY_BIG_SUM)).toBe("long long aVeryBigSum(vector<long long> ar)");
    expect(emitCpp(A_VERY_BIG_SUM)).toContain("vector<long long> ar(n);");
  });

  it("supports string arrays, which no authored problem uses yet", () => {
    const source = emitCpp({
      name: "sortWords",
      returns: { type: "string[]", join: " " },
      params: [
        { name: "n", type: "int", passed: false },
        { name: "words", type: "string[]", length: "n" },
      ],
    });
    expect(source).toContain("vector<string> sortWords(vector<string> words) {");
    expect(source).toContain("    return vector<string>();");
    expect(source).toContain("vector<string> words(n);");
    expect(source).toContain('if (i_itr > 0) cout << " ";');
  });

  it("separates an array result by newline when the declaration omits `join`", () => {
    // The schema requires `join` on every array return, so this is the emitter refusing to
    // depend on that: a declaration that slipped through still prints one element per line,
    // which is what every array-returning problem in the bank wants.
    const source = emitCpp({
      name: "f",
      returns: { type: "int[]" },
      params: [{ name: "a", type: "int" }],
    });
    expect(source).toContain('if (i_itr > 0) cout << "\\n";');
  });

  it("emits a literal array length verbatim", () => {
    const source = emitCpp(DESIGNER_PDF_VIEWER);
    expect(source).toContain("vector<int> h(26);");
    expect(source).toContain("for (int i_itr = 0; i_itr < 26; i_itr++) cin >> h[i_itr];");
  });

  it("emits the zero return for every declarable return type", () => {
    const zeroFor = (type: Signature["returns"]["type"], join?: string): string => {
      const source = emitCpp({ name: "f", returns: { type, join }, params: [] });
      const line = source.split("\n").find((l) => l.startsWith("    return "));
      return line ?? "";
    };
    expect(zeroFor("int")).toBe("    return 0;");
    expect(zeroFor("long")).toBe("    return 0;");
    expect(zeroFor("string")).toBe('    return "";');
    expect(zeroFor("int[]", "\n")).toBe("    return vector<int>();");
    expect(zeroFor("long[]", "\n")).toBe("    return vector<long long>();");
    expect(zeroFor("string[]", " ")).toBe("    return vector<string>();");
  });
});

describe("the argument list and the doc comment", () => {
  it("reads an unpassed field from stdin but keeps it out of the signature", () => {
    expect(cppArgumentNames(CUT_THE_STICKS)).toEqual(["arr"]);
    const source = emitCpp(CUT_THE_STICKS);
    expect(source).toContain("    cin >> n;");
    expect(source).toContain("cutTheSticks(vector<int> arr)");
  });

  it("orders arguments shared-first, then params, in declaration order", () => {
    expect(cppArgumentNames(DESIGNER_PDF_VIEWER)).toEqual(["h", "word"]);
  });

  it("uses HackerRank's article rule and its type vocabulary", () => {
    const returnLine = (type: Signature["returns"]["type"], join?: string): string | undefined =>
      cppDocCommentLines({ name: "f", returns: { type, join }, params: [] })[2];
    expect(returnLine("int")).toBe("The function is expected to return an INTEGER.");
    expect(returnLine("int[]", "\n")).toBe("The function is expected to return an INTEGER_ARRAY.");
    expect(returnLine("long")).toBe("The function is expected to return a LONG_INTEGER.");
    expect(returnLine("long[]", "\n")).toBe(
      "The function is expected to return a LONG_INTEGER_ARRAY.",
    );
    expect(returnLine("string")).toBe("The function is expected to return a STRING.");
    expect(returnLine("string[]", " ")).toBe("The function is expected to return a STRING_ARRAY.");
  });

  it("keeps HackerRank's 'following parameter(s)' phrasing verbatim", () => {
    expect(cppDocCommentLines(ENCRYPTION)).toEqual([
      "Complete the 'encryption' function below.",
      "",
      "The function is expected to return a STRING.",
      "The function accepts following parameter(s):",
      " 1. STRING key",
      " 2. STRING message",
    ]);
  });

  it("says so plainly when nothing is passed", () => {
    const sig: Signature = {
      name: "constantAnswer",
      returns: { type: "int" },
      shared: [{ name: "t", type: "int", passed: false }],
      repeat: "t",
      params: [],
    };
    expect(cppDocCommentLines(sig)).toContain("The function accepts no parameters.");
    expect(emitCpp(sig)).toContain("int constantAnswer()");
    expect(emitCpp(sig)).toContain(
      "    for (int t_itr = 0; t_itr < t; t_itr++) {\n        cout << constantAnswer() << \"\\n\";\n    }",
    );
  });
});

describe("emitCppProbe", () => {
  /**
   * The probe must echo in exactly the format the other five emitters use, because all six are
   * judged against ONE expected output generated from the Python probe. A format difference
   * here reads as a reading-order bug in G13 and is not one.
   */
  it("inserts echoes after the marker and leaves the stub's zero return in place", () => {
    const probe = emitCppProbe(ENCRYPTION);
    expect(probe).toContain(`string encryption(string key, string message) {
    // Write your code here
    cout << key << "\\n";
    cout << message << "\\n";
    return "";
}`);
  });

  it("echoes an array as its length, a colon, then each element", () => {
    expect(emitCppProbe(A_VERY_BIG_SUM)).toContain(`long long aVeryBigSum(vector<long long> ar) {
    // Write your code here
    cout << ar.size() << ":";
    for (int i_itr = 0; i_itr < (int)ar.size(); i_itr++) cout << " " << ar[i_itr];
    cout << "\\n";
    return 0;
}`);
  });

  it("echoes nothing for a field the function never receives", () => {
    const probe = emitCppProbe(CUT_THE_STICKS);
    expect(probe).not.toContain("cout << n <<");
  });

  it("keeps the harness byte-identical to the starter's", () => {
    const harness = (source: string): string =>
      source.slice(source.indexOf("// ------"));
    expect(harness(emitCppProbe(ENCRYPTION))).toBe(harness(emitCpp(ENCRYPTION)));
  });
});
