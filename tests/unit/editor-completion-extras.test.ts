import { describe, expect, it } from "vitest";

import {
  applyCompletion,
  autoPopupSuppressed,
  completionContext,
  completionsFor,
  insertsSingleSuggestion,
} from "@/components/contest/editor/smart/completion";
import { C, CPP } from "@/components/contest/editor/smart/cpp";
import { docFor, quickDocAt, signatureAt, signaturesFor } from "@/components/contest/editor/smart/docs";
import { expandWord, expandWordAnchor } from "@/components/contest/editor/smart/expand-word";
import { importFixFor } from "@/components/contest/editor/smart/imports";
import { inferType } from "@/components/contest/editor/smart/infer";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import type { Edit, EditState, LanguageProfile } from "@/components/contest/editor/smart/types";

/**
 * Completion beyond the popup's ranking: imports added on accept, constructor and keyword tails,
 * import statements and #include, members by a variable's lexically inferred type, Cyclic Expand
 * Word, Parameter Info and Quick Documentation. "|" is the caret.
 */

function state(marked: string): EditState {
  const caret = marked.indexOf("|");
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), selectionStart: caret, selectionEnd: caret };
}

function draw(text: string, edit: Edit): string {
  const after = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  return `${after.slice(0, edit.selectionStart)}|${after.slice(edit.selectionStart)}`;
}

function labels(marked: string, profile: LanguageProfile): string[] {
  const { text, selectionStart } = state(marked);
  const ctx = completionContext(text, selectionStart, profile.lineComment);
  return ctx === null ? [] : completionsFor(ctx, text, profile, 50).map((item) => item.label);
}

/** Accepts the row named `label` (or whose identifier is `label`) and draws the result. */
function accept(marked: string, label: string, profile: LanguageProfile): string {
  const current = state(marked);
  const ctx = completionContext(current.text, current.selectionStart, profile.lineComment);
  if (ctx === null) throw new Error("no completion context");
  const items = completionsFor(ctx, current.text, profile, 200);
  const item =
    items.find((candidate) => candidate.label === label) ??
    items.find((candidate) => /^[A-Za-z0-9_$/.+]+/.exec(candidate.label)?.[0] === label);
  if (item === undefined) throw new Error(`${label} not offered: ${items.map((i) => i.label).join(", ")}`);
  return draw(current.text, applyCompletion(current, ctx, item, profile));
}

const MAIN = (body: string): string =>
  `public class Main {\n    public static void main(String[] args) {\n        ${body}\n    }\n}\n`;

describe("auto-import on accept", () => {
  it("adds a Java import after the last import, in A to Z order", () => {
    const before = `import java.io.IOException;\nimport java.util.Scanner;\n\n${MAIN("Arr|")}`;
    expect(accept(before, "ArrayList", JAVA)).toBe(
      `import java.io.IOException;\nimport java.util.ArrayList;\nimport java.util.Scanner;\n\n${MAIN("ArrayList|")}`,
    );
  });

  it("adds nothing when a wildcard or the same import covers it, or the class is java.lang", () => {
    const star = `import java.util.*;\n\n${MAIN("HashM|")}`;
    expect(accept(star, "HashMap", JAVA)).toBe(`import java.util.*;\n\n${MAIN("HashMap|")}`);
    const same = `import java.util.HashMap;\n\n${MAIN("HashM|")}`;
    expect(accept(same, "HashMap", JAVA)).toBe(`import java.util.HashMap;\n\n${MAIN("HashMap|")}`);
    expect(accept(MAIN("StringB|"), "StringBuilder", JAVA)).toBe(MAIN("StringBuilder|"));
  });

  it("puts a Java import after the package line", () => {
    const before = `package demo;\n\n${MAIN("Scan|")}`;
    expect(accept(before, "Scanner", JAVA)).toBe(`package demo;\n\nimport java.util.Scanner;\n\n${MAIN("Scanner|")}`);
  });

  it("is one replacement, so one undo step", () => {
    const current = state(MAIN("BR|"));
    const ctx = completionContext(current.text, current.selectionStart, "//");
    if (ctx === null) throw new Error("no context");
    const item = completionsFor(ctx, current.text, JAVA).find((row) => row.label === "BufferedReader");
    if (item === undefined) throw new Error("no BufferedReader");
    const edit = applyCompletion(current, ctx, item, JAVA);
    expect(edit.from).toBe(0);
    expect(edit.to).toBe(ctx.replaceTo);
  });

  it("adds a C++ include unless bits/stdc++.h or the header is there", () => {
    expect(accept("int main() {\n    vec|\n}\n", "vector", CPP)).toBe("#include <vector>\n\nint main() {\n    vector|\n}\n");
    expect(accept("#include <iostream>\nusing namespace std;\nint main() {\n    vec|\n}\n", "vector", CPP)).toBe(
      "#include <iostream>\n#include <vector>\nusing namespace std;\nint main() {\n    vector|\n}\n",
    );
    expect(accept("#include <bits/stdc++.h>\nint main() {\n    vec|\n}\n", "vector", CPP)).toBe(
      "#include <bits/stdc++.h>\nint main() {\n    vector|\n}\n",
    );
    expect(accept("#include <vector>\nint main() {\n    co|\n}\n", "cout", CPP)).toBe(
      "#include <vector>\n#include <iostream>\nint main() {\n    cout|\n}\n",
    );
    expect(accept("int main() {\n    INT_M|\n}\n", "INT_MAX", CPP)).toBe("#include <climits>\n\nint main() {\n    INT_MAX|\n}\n");
  });

  it("adds a Python from-import, merges into one that exists, and imports a module by name", () => {
    expect(accept("q = deq|", "deque", PYTHON)).toBe("from collections import deque\n\nq = deque|");
    expect(accept("from collections import Counter\nq = deq|", "deque", PYTHON)).toBe(
      "from collections import Counter, deque\nq = deque|",
    );
    expect(accept("import sys\nheappu|", "heappush", PYTHON)).toBe("import sys\nfrom heapq import heappush\nheappush(|)");
    expect(accept("x = mat|", "math", PYTHON)).toBe("import math\n\nx = math|");
    expect(accept("import math\nx = mat|", "math", PYTHON)).toBe("import math\nx = math|");
    expect(accept("from heapq import *\nheappu|", "heappush", PYTHON)).toBe("from heapq import *\nheappush(|)");
  });
});

describe("Show Context Actions (Alt+Enter)", () => {
  it("imports the known name at the caret", () => {
    const text = MAIN("Array|List<Integer> xs;").replace("|", "");
    const caret = text.indexOf("ArrayList") + 3;
    const actions = importFixFor(text, caret, JAVA);
    expect(actions.map((action) => action.label)).toEqual(["Add import java.util.ArrayList;"]);
    const edit = actions[0]?.edit;
    if (edit === undefined) throw new Error("no edit");
    const after = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
    expect(after.startsWith("import java.util.ArrayList;\n\npublic class Main")).toBe(true);
    expect(edit.selectionStart).toBe(caret + "import java.util.ArrayList;\n\n".length);
  });

  it("offers throws IOException for readLine in a method without it, with the import", () => {
    const text = MAIN("String line = br.readLine();");
    const caret = text.indexOf("readLine");
    const actions = importFixFor(text, caret, JAVA);
    const fix = actions.find((action) => action.label === "Add 'throws IOException' to method signature");
    if (fix === undefined) throw new Error("no throws fix");
    const after = text.slice(0, fix.edit.from) + fix.edit.insert + text.slice(fix.edit.to);
    expect(after).toContain("public static void main(String[] args) throws IOException {");
    expect(after.startsWith("import java.io.IOException;\n\n")).toBe(true);
  });

  it("extends an existing throws clause and stays quiet when it is covered", () => {
    const extend = MAIN("br.readLine();").replace("(String[] args)", "(String[] args) throws InterruptedException");
    const fix = importFixFor(extend, extend.indexOf("readLine"), JAVA)[0];
    if (fix === undefined) throw new Error("no fix");
    expect(extend.slice(0, fix.edit.from) + fix.edit.insert + extend.slice(fix.edit.to)).toContain(
      "throws InterruptedException, IOException {",
    );
    const covered = MAIN("br.readLine();").replace("(String[] args)", "(String[] args) throws Exception");
    expect(importFixFor(covered, covered.indexOf("readLine"), JAVA)).toEqual([]);
  });

  it("offers an include in C++ and a from-import in Python, and nothing for an unknown name", () => {
    expect(importFixFor("vector<int> v;", 2, CPP).map((a) => a.label)).toEqual(["Add #include <vector>"]);
    expect(importFixFor("q = deque()", 6, PYTHON).map((a) => a.label)).toEqual(["Add from collections import deque"]);
    expect(importFixFor("foo = 1", 1, PYTHON)).toEqual([]);
  });
});

describe("constructor and keyword completion", () => {
  it("completes a generic class after new with the diamond and the caret inside the parentheses", () => {
    expect(accept(`import java.util.*;\n${MAIN("List<Integer> xs = new ArrL|")}`, "ArrayList", JAVA)).toBe(
      `import java.util.*;\n${MAIN("List<Integer> xs = new ArrayList<>(|)")}`,
    );
    expect(accept(`import java.util.Scanner;\n${MAIN("Scanner in = new Sc|")}`, "Scanner", JAVA)).toBe(
      `import java.util.Scanner;\n${MAIN("Scanner in = new Scanner(|)")}`,
    );
    expect(accept(MAIN("Map<String, Integer> m = new HashM|"), "HashMap", JAVA)).toBe(
      `import java.util.HashMap;\n\n${MAIN("Map<String, Integer> m = new HashMap<>(|)")}`,
    );
  });

  it("offers only classes after new", () => {
    expect(labels(MAIN("x = new St|"), JAVA)).toEqual(["Stack", "String", "StringBuilder", "StringTokenizer"]);
  });

  it("appends the IDE's tail to a keyword", () => {
    expect(accept(MAIN("ret|"), "return", JAVA)).toBe(MAIN("return |"));
    expect(accept(MAIN("whi|"), "while", JAVA)).toBe(MAIN("while (|)"));
    expect(accept(MAIN("sw|"), "switch", JAVA)).toBe(MAIN("switch (|)"));
    expect(accept("fin|", "finally", PYTHON)).toBe("finally:|");
    expect(accept("eli|", "elif", PYTHON)).toBe("elif |");
    expect(accept("int main() {\n    retu|\n}", "return", CPP)).toBe("int main() {\n    return |\n}");
    expect(accept("int main() {\n    whi|\n}", "while", CPP)).toBe("int main() {\n    while (|)\n}");
    expect(accept(MAIN("tr|"), "true", JAVA)).toBe(MAIN("true|"));
  });
});

describe("import statements and #include", () => {
  it("offers module names after Python's import and from", () => {
    expect(labels("import he|", PYTHON)).toEqual(["heapq"]);
    expect(labels("from coll|", PYTHON)).toEqual(["collections"]);
    expect(accept("import he|", "heapq", PYTHON)).toBe("import heapq|");
  });

  it("offers a module's names after from ... import", () => {
    expect(labels("from collections import de|", PYTHON)).toEqual(["deque", "defaultdict"]);
    expect(labels("from collections import Counter, de|", PYTHON)).toEqual(["deque", "defaultdict"]);
    expect(accept("from math import sq|", "sqrt", PYTHON)).toBe("from math import sqrt|");
  });

  it("offers a Java package's classes after import", () => {
    expect(labels("import java.util.Arr|", JAVA)).toEqual(["Arrays", "ArrayList", "ArrayDeque"]);
    expect(labels("import java.i|", JAVA)).toEqual(["io"]);
    // A class ends the import, so its ";" comes with it.
    expect(accept("import java.util.Arr|", "ArrayList", JAVA)).toBe("import java.util.ArrayList;|");
    expect(accept("import java.util.Arr|;", "ArrayList", JAVA)).toBe("import java.util.ArrayList|;");
  });

  it("offers header names after #include <, closing the bracket when nothing closes it", () => {
    expect(labels("#include <ve|", CPP)).toEqual(["vector"]);
    expect(labels("#include <bits/|", CPP)).toEqual(["bits/stdc++.h"]);
    expect(accept("#include <ve|", "vector", CPP)).toBe("#include <vector>|");
    expect(accept("#include <ve|>", "vector", CPP)).toBe("#include <vector|>");
    expect(labels("#include <std|", C)).toEqual(["stdio.h", "stdlib.h", "stdbool.h", "stdint.h"]);
  });
});

describe("members by the variable's inferred type", () => {
  it("reads the type from a declaration or an assignment", () => {
    expect(inferType("List<Integer> xs = new ArrayList<>();\nxs.", "xs", 40, "java")).toBe("List");
    expect(inferType("int[] a = new int[5];\na.", "a", 30, "java")).toBe("array");
    expect(inferType("var sb = new StringBuilder();\n", "sb", 30, "java")).toBe("StringBuilder");
    expect(inferType("vector<pair<int,int>> v;\n", "v", 30, "cpp")).toBe("vector");
    expect(inferType("std::map<string, int> cnt;\n", "cnt", 30, "cpp")).toBe("map");
    expect(inferType("seen = set()\n", "seen", 20, "python")).toBe("set");
    expect(inferType("d = {}\n", "d", 10, "python")).toBe("dict");
    expect(inferType("s = input()\n", "s", 20, "python")).toBe("str");
    expect(inferType("n = 5\n", "n", 10, "python")).toBeNull();
  });

  it("offers that type's members only", () => {
    expect(labels(MAIN("List<Integer> xs = new ArrayList<>();\n        xs.|"), JAVA)).toContain("add(E e)");
    expect(labels(MAIN("List<Integer> xs = new ArrayList<>();\n        xs.|"), JAVA)).not.toContain("charAt(int index)");
    expect(labels(MAIN("String s = \"\";\n        s.cha|"), JAVA)).toEqual(["chars()", "charAt(int index)"]);
    expect(labels(MAIN("int[] a = new int[3];\n        a.|"), JAVA)).toEqual(["length", "clone()"]);
    expect(labels("pair<int, int> p;\np.|", CPP)).toEqual(["first", "second"]);
    expect(labels("xs = []\nxs.ap|", PYTHON)).toEqual(["append()"]);
    expect(labels("s = 'abc'\ns.sp|", PYTHON)).toEqual(["split()"]);
  });

  it("falls back to every member when the type is not in the text", () => {
    expect(labels(MAIN("foo.cha|"), JAVA)).toEqual(["charAt(int index)"]);
  });
});

describe("functions the file defines complete as calls", () => {
  it("puts the caret inside only when the function takes parameters", () => {
    expect(accept("def solve(n):\n    pass\n\nsol|", "solve", PYTHON)).toBe("def solve(n):\n    pass\n\nsolve(|)");
    expect(accept("class A:\n    def run(self):\n        pass\nru|", "run", PYTHON)).toBe(
      "class A:\n    def run(self):\n        pass\nrun()|",
    );
    expect(accept("static int gcd(int a, int b) {\n}\nint x = gc|", "gcd", JAVA)).toBe(
      "static int gcd(int a, int b) {\n}\nint x = gcd(|)",
    );
  });
});

describe("the auto-popup leaves Enter and Tab alone for a finished name", () => {
  const suppressed = (marked: string, profile: LanguageProfile): boolean => {
    const { text, selectionStart } = state(marked);
    const ctx = completionContext(text, selectionStart, profile.lineComment);
    if (ctx === null) return true;
    return autoPopupSuppressed(ctx, completionsFor(ctx, text, profile));
  };

  it("stays closed for a keyword, variable or class typed in full", () => {
    expect(suppressed("def f(n):\n    return n|", PYTHON)).toBe(true);
    expect(suppressed("def f(n):\n    return|", PYTHON)).toBe(true);
    expect(suppressed(MAIN("String|"), JAVA)).toBe(true);
  });

  it("opens for a partial name and for a call typed in full", () => {
    expect(suppressed("def f(n):\n    ret|", PYTHON)).toBe(false);
    expect(suppressed("pri|", PYTHON)).toBe(false);
    expect(suppressed("print|", PYTHON)).toBe(false);
  });

  it("inserts a single suggestion only when there is exactly one", () => {
    expect(insertsSingleSuggestion([{ label: "a", insertText: "a", kind: "variable" }])).toBe(true);
    expect(insertsSingleSuggestion([])).toBe(false);
  });
});

describe("Cyclic Expand Word", () => {
  const text = "total = 1\ntoken = 2\ntop = 3\nprint(to)\ntoward = 4\n";
  const caret = text.indexOf("to)") + 2;

  it("offers the nearest word above first, then below, then the prefix again", () => {
    const anchor = expandWordAnchor(text, caret);
    if (anchor === null) throw new Error("no anchor");
    let current = text;
    let at = caret;
    const seen: string[] = [];
    for (let press = 0; press < 5; press += 1) {
      const edit = expandWord(current, at, anchor, press);
      if (edit === null) throw new Error("no edit");
      current = current.slice(0, edit.from) + edit.insert + current.slice(edit.to);
      at = edit.selectionStart;
      seen.push(edit.insert);
    }
    expect(seen).toEqual(["top", "token", "total", "toward", "to"]);
  });

  it("searches below first when backward, and gives up without a candidate", () => {
    const anchor = expandWordAnchor(text, caret);
    if (anchor === null) throw new Error("no anchor");
    expect(expandWord(text, caret, anchor, 0, -1)?.insert).toBe("toward");
    const lonely = "zz";
    const only = expandWordAnchor(lonely, 2);
    if (only === null) throw new Error("no anchor");
    expect(expandWord(lonely, 2, only, 0)).toBeNull();
    expect(expandWordAnchor("x = ", 4)).toBeNull();
  });
});

describe("Parameter Info and Quick Documentation", () => {
  it("lists the overloads and the argument the caret is in", () => {
    const text = MAIN("int m = Math.max(a, |);").replace("|", "");
    const caret = text.indexOf(", ") + 2;
    expect(signatureAt(text, caret, JAVA)).toEqual({
      name: "max",
      signatures: ["int max(int a, int b)", "long max(long a, long b)", "double max(double a, double b)"],
      activeParameter: 1,
    });
  });

  it("knows Python and C++ builtins and nested calls", () => {
    expect(signatureAt("print(len(xs), ", 15, PYTHON)?.name).toBe("print");
    expect(signatureAt("print(len(xs), ", 15, PYTHON)?.activeParameter).toBe(1);
    expect(signatureAt("print(len(", 10, PYTHON)?.signatures).toEqual(["len(obj)"]);
    expect(signaturesFor("std", "sort", CPP)[0]).toBe("void sort(RandomIt first, RandomIt last)");
    expect(signaturesFor(null, "sort", CPP)).toHaveLength(2);
    expect(signatureAt("x = 1", 5, PYTHON)).toBeNull();
    expect(signatureAt("foo(", 4, PYTHON)).toBeNull();
  });

  it("gives a signature and one sentence for a common member", () => {
    const text = "Scanner in = new Scanner(System.in);\nint n = in.nextInt();";
    expect(quickDocAt(text, text.indexOf("nextInt") + 2, JAVA)).toMatch(/^int nextInt\(\)\. Reads the next whole number/);
    expect(docFor(null, "heappush", PYTHON)).toBe("heappush(heap, item). Adds item to the min-heap list.");
    expect(docFor("v", "push_back", CPP, "vector<int> v;\n", 15)).toBe("void push_back(const T& value). Adds value at the end.");
    expect(docFor(null, "nothing_here", PYTHON)).toBeNull();
  });
});
