import { describe, expect, it } from "vitest";

import { completionContext, completionsFor } from "@/components/contest/editor/smart/completion";
import { handleKey } from "@/components/contest/editor/smart/engine";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import {
  declarationsBefore,
  elementNameOf,
  expressionTypeOf,
  resolveMacros,
} from "@/components/contest/editor/smart/template-macros";
import type { EditState, LanguageProfile } from "@/components/contest/editor/smart/types";

/**
 * IntelliJ's template variables and the postfix templates the checkers found missing or wrong:
 * each case is the text before Tab and the text after, the caret written "|", a selection «...».
 */

function at(marked: string): EditState {
  const caret = marked.indexOf("|");
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), selectionStart: caret, selectionEnd: caret };
}

function tab(marked: string, profile: LanguageProfile = JAVA): string {
  const state = at(marked);
  const edit = handleKey(state, { key: "Tab", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isMac: false }, profile);
  if (edit === null) return "(no expansion)";
  const text = state.text.slice(0, edit.from) + edit.insert + state.text.slice(edit.to);
  if (edit.selectionStart === edit.selectionEnd) return `${text.slice(0, edit.selectionStart)}|${text.slice(edit.selectionStart)}`;
  return `${text.slice(0, edit.selectionStart)}«${text.slice(edit.selectionStart, edit.selectionEnd)}»${text.slice(edit.selectionEnd)}`;
}

describe("Java live templates that read the file", () => {
  it("ifn and inn check the nearest object", () => {
    expect(tab("    static int len(String s) {\n        ifn|")).toBe(
      "    static int len(String s) {\n        if («s» == null) {\n            \n        }",
    );
  });

  it("iter and itar loop over the nearest array, with its element", () => {
    expect(tab("        int[] arr = new int[3];\n        iter|")).toBe(
      "        int[] arr = new int[3];\n        for (int i : «arr») {\n            \n        }",
    );
    expect(tab("        int[] arr = new int[3];\n        itar|")).toBe(
      "        int[] arr = new int[3];\n        for (int i = 0; i < arr.length; i++) {\n            int i1 = arr[i];\n            |\n        }",
    );
    expect(tab("        long[] nums = new long[3];\n        ritar|")).toBe(
      "        long[] nums = new long[3];\n        for (int i = nums.length - 1; i >= 0; i--) {\n            long num = nums[i];\n            |\n        }",
    );
  });

  it("itar with no array keeps an empty field to type one into", () => {
    expect(tab("        itar|")).toBe("        for (int i = 0; i < |.length; i++) {\n            \n        }");
  });

  it("soutv prints the nearest variable with its name, soutm the method, soutp its parameters", () => {
    expect(tab("        int total = 3;\n        soutv|")).toBe(
      '        int total = 3;\n        System.out.println("total = " + total);|',
    );
    expect(tab("        soutv|")).toBe('        System.out.println("" + |);');
    expect(tab("class Main {\n    static void solve(int a, int b) {\n        soutm|")).toBe(
      'class Main {\n    static void solve(int a, int b) {\n        System.out.println("Main.solve");|',
    );
    expect(tab("class Main {\n    static void solve(int a, int b) {\n        soutp|")).toBe(
      'class Main {\n    static void solve(int a, int b) {\n        System.out.println("a = " + a + ", " + "b = " + b);|',
    );
  });

  it("mx and mn update the nearest number", () => {
    expect(tab("        int best = 0;\n        mx|")).toBe("        int best = 0;\n        «best» = Math.max(best, );");
  });

  it("psvm is a class-body template, offered neither by Tab nor by the popup inside a method", () => {
    const inMain = "class Main {\n    public static void main(String[] args) {\n        psvm|\n    }\n}";
    expect(tab(inMain)).toBe("(no expansion)");
    const state = at(inMain);
    const ctx = completionContext(state.text, state.selectionStart, "//");
    if (ctx === null) throw new Error("no context");
    expect(completionsFor(ctx, state.text, JAVA).map((item) => item.label)).not.toContain("psvm");
  });
});

describe("Java postfix templates", () => {
  it("arr.fori counts to the array's length and list.fori to the list's size", () => {
    expect(tab("        int[] arr = new int[5];\n        arr.fori|")).toBe(
      "        int[] arr = new int[5];\n        for (int i = 0; i < arr.length; i++) {\n            |\n        }",
    );
    expect(tab("        List<Integer> xs = new ArrayList<>();\n        xs.fori|")).toBe(
      "        List<Integer> xs = new ArrayList<>();\n        for (int i = 0; i < xs.size(); i++) {\n            |\n        }",
    );
  });

  it("takes the whole expression of the statement, a + b.sout", () => {
    expect(tab("        a + b.sout|")).toBe("        System.out.println(a + b);|");
    expect(tab("        x = y.sout|")).toBe("        x = System.out.println(y);|");
  });

  it("var, par, arg, new and the rest of IntelliJ's set expand", () => {
    expect(tab("        sc.nextInt().var|")).toBe("        int «i» = sc.nextInt();");
    expect(tab('        "abc".var|')).toBe('        String «s» = "abc";');
    expect(tab("        a + b.par|")).toBe("        (a + b)|");
    expect(tab("        x.arg|")).toBe("        |(x)");
    expect(tab("        Scanner.new|")).toBe("        new Scanner(|)");
    expect(tab("        n.switch|")).toBe("        switch (n) {\n            |\n        }");
    expect(tab("        x.serr|")).toBe("        System.err.println(x);|");
  });
});

describe("Python postfix templates", () => {
  it("take the whole expression and cover enumerate, parentheses and None checks", () => {
    expect(tab("def f():\n    a + b.return|", PYTHON)).toBe("def f():\n    return a + b|");
    expect(tab("n > 0.if|", PYTHON)).toBe("if n > 0:\n    |");
    expect(tab("x > 0.while|", PYTHON)).toBe("while x > 0:\n    |");
    expect(tab("nums.fore|", PYTHON)).toBe("for «i», x in enumerate(nums):\n    ");
    expect(tab("a + b.par|", PYTHON)).toBe("(a + b)|");
    expect(tab("x.ifnn|", PYTHON)).toBe("if x is not None:\n    |");
  });
});

describe("the variables themselves", () => {
  it("reads declarations, parameters and for-headers", () => {
    const names = declarationsBefore("void f(String s, int[] a) {\n  int n = 0;\n  for (int i = 0; i < n; i++) {", 999).map(
      (declaration) => `${declaration.type} ${declaration.name}`,
    );
    expect(names).toEqual(["String s", "int[] a", "int n", "int i"]);
  });

  it("names an element after its collection or its type", () => {
    expect(elementNameOf("nums", "int", [])).toBe("num");
    expect(elementNameOf("arr", "int", ["i"])).toBe("i1");
    expect(elementNameOf("list", "Integer", [])).toBe("integer");
  });

  it("knows the types contest input calls return", () => {
    expect(expressionTypeOf("sc.nextLine()", "", 0)).toBe("String");
    expect(expressionTypeOf("new StringBuilder()", "", 0)).toBe("StringBuilder");
    expect(expressionTypeOf("foo.bar()", "", 0)).toBe("var");
  });

  it("asks for a fallback when a required variable is missing", () => {
    expect(resolveMacros("$ARRAY$.length", "int n = 1;", 10)).toBeNull();
    expect(resolveMacros("no macros here $END$", "", 0)).toBe("no macros here $END$");
  });
});
