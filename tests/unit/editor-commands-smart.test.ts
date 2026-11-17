import { afterEach, describe, expect, it, vi } from "vitest";

import { caretKey, clampFontSize, parseCaretMemory, readCaret, readFontSize, writeCaret, writeFontSize } from "@/components/contest/editor/commands/editor-memory";
import { signatureParts } from "@/components/contest/editor/commands/InfoPopup";
import { expectedText, landed } from "@/components/contest/editor/native-edit";
import { CPP } from "@/components/contest/editor/smart/cpp";
import { docFor } from "@/components/contest/editor/smart/docs";
import { importFixFor } from "@/components/contest/editor/smart/import-fix";
import { JAVA } from "@/components/contest/editor/smart/java";
import { reindentPaste } from "@/components/contest/editor/smart/paste";
import { PYTHON } from "@/components/contest/editor/smart/python";
import { signaturesFor } from "@/components/contest/editor/smart/signatures";
import { surround, surroundChoicesFor } from "@/components/contest/editor/smart/surround";
import type { Edit, EditState } from "@/components/contest/editor/smart/types";

/**
 * The pure halves of the commands: Surround With, Parameter Info, Quick Documentation, paste
 * cleanup, Show Context Actions, the remembered caret and font size, and the insertText check.
 * "▮" marks the caret in a case.
 */

function at(source: string): EditState {
  const caret = source.indexOf("▮");
  return { text: source.replace("▮", ""), selectionStart: caret, selectionEnd: caret };
}

function apply(state: EditState, edit: Edit | null): string {
  if (edit === null) return state.text;
  return state.text.slice(0, edit.from) + edit.insert + state.text.slice(edit.to);
}

describe("surround", () => {
  it("wraps the caret line in an if, indents it, and selects the condition (Java)", () => {
    const state = at("    int x = 1;\n    sum += x;▮\n");
    const edit = surround(state, "if", JAVA);
    expect(apply(state, edit)).toBe("    int x = 1;\n    if (condition) {\n        sum += x;\n    }\n");
    expect(edit === null ? "" : apply(state, edit).slice(edit.selectionStart, edit.selectionEnd)).toBe("condition");
  });

  it("wraps every selected line in a try/catch (Java)", () => {
    const text = "a();\nb();\n";
    const edit = surround({ text, selectionStart: 0, selectionEnd: 9 }, "tryCatch", JAVA);
    expect(apply({ text, selectionStart: 0, selectionEnd: 9 }, edit)).toBe(
      "try {\n    a();\n    b();\n} catch (Exception e) {\n}\n",
    );
  });

  it("uses Python's colon blocks", () => {
    const state = at("print(x)▮");
    expect(apply(state, surround(state, "while", PYTHON))).toBe("while condition:\n    print(x)");
  });

  it("offers each IDE's own list, numbered in order", () => {
    expect(surroundChoicesFor(JAVA).map((choice) => choice.label)[0]).toBe("if");
    expect(surroundChoicesFor(PYTHON).map((choice) => choice.label)).toContain("try / except");
    expect(surroundChoicesFor(CPP).map((choice) => choice.label)).toContain("{ }");
  });

  it("returns null for a kind the language does not have", () => {
    expect(surround(at("x▮"), "doWhile", PYTHON)).toBeNull();
  });
});

describe("signaturesFor", () => {
  it("finds the call the caret is in and counts the argument", () => {
    const help = signaturesFor(at("int m = Math.max(a, ▮"), JAVA);
    expect(help?.name).toBe("max");
    expect(help?.activeParameter).toBe(1);
    expect(help?.signatures.length).toBeGreaterThan(0);
  });

  it("is null outside a call", () => {
    expect(signaturesFor(at("int m = 1;▮"), JAVA)).toBeNull();
  });

  it("splits a signature into its parameters for bolding", () => {
    expect(signatureParts("max(int a, int b)")).toEqual({ head: "max(", params: ["int a", "int b"], tail: ")" });
  });
});

describe("docFor", () => {
  it("describes a known name at the caret", () => {
    const doc = docFor(at("Array▮List<Integer> list;"), JAVA);
    expect(doc?.title).toBe("ArrayList");
    expect(doc?.body).toContain("java.util");
  });

  it("is null for the student's own name", () => {
    expect(docFor(at("int myCount▮ = 0;"), JAVA)).toBeNull();
  });
});

/** What the student sees: the cleaned edit, or the browser pasting the clipboard as it is. */
function pasted(state: EditState, clipboard: string, edit: Edit | null): string {
  if (edit !== null) return apply(state, edit);
  return state.text.slice(0, state.selectionStart) + clipboard + state.text.slice(state.selectionEnd);
}

describe("reindentPaste", () => {
  it("re-bases pasted lines to the caret's indent", () => {
    const state = at("def f():\n    ▮");
    const edit = reindentPaste(state, "if x:\n        y = 1\n    z = 2", PYTHON);
    expect(pasted(state, "if x:\n        y = 1\n    z = 2", edit)).toBe("def f():\n    if x:\n        y = 1\n    z = 2");
  });

  it("moves a Java block copied from deeper code to the caret's level", () => {
    const state = at("    ▮");
    const clipboard = "for (int i = 0; i < n; i++) {\n            a();\n        }";
    expect(pasted(state, clipboard, reindentPaste(state, clipboard, JAVA))).toBe(
      "    for (int i = 0; i < n; i++) {\n        a();\n    }",
    );
  });

  it("turns non-breaking spaces and Windows line ends into plain ones", () => {
    const state = at("▮");
    const edit = reindentPaste(state, "int\u00a0x = 1;\r\nint y = 2;", JAVA);
    expect(apply(state, edit)).toBe("int x = 1;\nint y = 2;");
  });

  it("turns Python tab indents into spaces", () => {
    const state = at("▮");
    expect(pasted(state, "", reindentPaste(state, "if x:\n\ty = 1", PYTHON))).toBe("if x:\n    y = 1");
  });

  it("leaves a clean one-line paste to the browser", () => {
    expect(reindentPaste(at("▮"), "count", JAVA)).toBeNull();
  });
});

describe("importFixFor", () => {
  it("imports a java.util class the file does not import, keeping the caret on the name", () => {
    const state = at("public class Main {\n    ArrayList▮<Integer> a;\n}");
    const actions = importFixFor(state, JAVA);
    expect(actions.map((action) => action.label)).toEqual(["Import java.util.ArrayList"]);
    const edit = actions[0]?.edit ?? null;
    const next = apply(state, edit);
    expect(next.startsWith("import java.util.ArrayList;\n")).toBe(true);
    expect(edit === null ? -1 : next.slice(edit.selectionStart - 9, edit.selectionStart)).toBe("ArrayList");
  });

  it("offers nothing when the class is already imported", () => {
    expect(importFixFor(at("import java.util.*;\nArrayList▮ a;"), JAVA)).toEqual([]);
  });

  it("imports heappush from heapq in Python", () => {
    expect(importFixFor(at("heappush▮(h, 1)"), PYTHON).map((action) => action.label)).toEqual(["Import heappush from heapq"]);
  });

  it("adds the C++ header", () => {
    expect(importFixFor(at("vector▮<int> v;"), CPP).map((action) => action.label)).toEqual(["Add #include <vector>"]);
    expect(importFixFor(at("#include <bits/stdc++.h>\nvector▮<int> v;"), CPP)).toEqual([]);
  });
});

describe("insertText fallback", () => {
  it("knows when execCommand reported success and changed nothing", () => {
    const edit: Edit = { from: 0, to: 0, insert: "x", selectionStart: 1, selectionEnd: 1 };
    expect(expectedText("ab", edit)).toBe("xab");
    expect(landed("xab", "ab", edit)).toBe(true);
    expect(landed("ab", "ab", edit)).toBe(false);
  });
});

describe("editor memory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage(): Map<string, string> {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    });
    return store;
  }

  it("keys the caret by page and language", () => {
    expect(caretKey("/contest/two-sum", "JAVA_21")).not.toBe(caretKey("/contest/two-sum", "PYTHON_312"));
  });

  it("round-trips a caret and rejects anything malformed", () => {
    stubStorage();
    writeCaret("k", { selectionStart: 3, selectionEnd: 5, scrollTop: 40, scrollLeft: 0 });
    expect(readCaret("k")).toEqual({ selectionStart: 3, selectionEnd: 5, scrollTop: 40, scrollLeft: 0 });
    expect(parseCaretMemory("{")).toBeNull();
    expect(parseCaretMemory(JSON.stringify({ selectionStart: -1, selectionEnd: 0, scrollTop: 0, scrollLeft: 0 }))).toBeNull();
    expect(parseCaretMemory(JSON.stringify({ selectionStart: 5, selectionEnd: 2, scrollTop: 0, scrollLeft: 0 }))).toBeNull();
  });

  it("bounds the font size to 12 through 22 px", () => {
    stubStorage();
    expect(clampFontSize(40)).toBe(22);
    expect(clampFontSize(3)).toBe(12);
    writeFontSize(30);
    expect(readFontSize()).toBe(22);
  });

  it("works with blocked storage", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readCaret("k")).toBeNull();
    expect(readFontSize()).toBeNull();
    expect(() => writeCaret("k", { selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollLeft: 0 })).not.toThrow();
  });
});
