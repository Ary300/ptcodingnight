import { afterEach, describe, expect, it, vi } from "vitest";

import {
  insideStringOrComment,
  isCompletionTrigger,
  isNoOpEdit,
  stepIndex,
  tokenKindAt,
} from "@/components/contest/editor/completion-session";
import { tokenize } from "@/components/contest/editor/highlight";
import { applyNativeEdit } from "@/components/contest/editor/native-edit";
import { completionContext, profileFor } from "@/components/contest/editor/smart";
import { C, CPP } from "@/components/contest/editor/smart/cpp";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import type { CompletionContext, Edit } from "@/components/contest/editor/smart/types";
import { LANGUAGE_IDS } from "@/lib/judge/runtimes";

/**
 * The glue between the smart-editor modules and the textarea: which profile each judge language
 * gets, when the popup may open, and how an edit reaches the DOM. The engine and the profiles have
 * their own suites (editor-engine, editor-java, editor-python, editor-cpp, editor-completion).
 */

describe("profileFor", () => {
  it("gives every Java variant the IntelliJ profile", () => {
    for (const id of ["JAVA_8", "JAVA_11", "JAVA_17", "JAVA_21"] as const) {
      expect(profileFor(id)).toBe(JAVA);
    }
  });

  it("gives Python the PyCharm profile", () => {
    expect(profileFor("PYTHON_312")).toBe(PYTHON);
  });

  it("gives both C++ variants the CLion profile, and C its own C names on CLion's editing", () => {
    for (const id of ["CPP_11", "CPP_17"] as const) {
      expect(profileFor(id)).toBe(CPP);
    }
    expect(profileFor("C_17")).toBe(C);
    expect(C.id).toBe("cpp");
  });

  it("leaves JavaScript and Go on the plain editor", () => {
    expect(profileFor("JAVASCRIPT_NODE22")).toBeNull();
    expect(profileFor("GO_123")).toBeNull();
  });

  it("answers for every language the registry knows", () => {
    for (const id of LANGUAGE_IDS) {
      expect(() => profileFor(id)).not.toThrow();
    }
  });
});

describe("isCompletionTrigger", () => {
  it("refreshes on identifier characters and on the end of a member separator", () => {
    for (const key of ["a", "Z", "7", "_", "$", ".", ":", ">"]) {
      expect(isCompletionTrigger(key), key).toBe(true);
    }
  });

  it("closes on anything else", () => {
    for (const key of [" ", "(", ";", "{", "Enter", "ArrowLeft", "Backspace", ","]) {
      expect(isCompletionTrigger(key), key).toBe(false);
    }
  });
});

describe("tokenKindAt", () => {
  const tokens = tokenize('int x = "hi"; // note', "JAVA_21");

  it("names the token under an offset", () => {
    expect(tokenKindAt(tokens, 0)).toBe("keyword");
    expect(tokenKindAt(tokens, 9)).toBe("string");
    expect(tokenKindAt(tokens, 17)).toBe("comment");
  });

  it("is null outside the text", () => {
    expect(tokenKindAt(tokens, -1)).toBeNull();
    expect(tokenKindAt(tokens, 1000)).toBeNull();
  });
});

describe("insideStringOrComment", () => {
  const contextAt = (text: string): CompletionContext => {
    const ctx = completionContext(text, text.length, "//");
    if (ctx === null) throw new Error(`no context for ${JSON.stringify(text)}`);
    return ctx;
  };

  it("lets plain code complete", () => {
    const text = "int total = Mat";
    expect(insideStringOrComment(tokenize(text, "JAVA_21"), contextAt(text))).toBe(false);
  });

  it("refuses a block comment that opened on an earlier line", () => {
    // One line alone cannot see the "/*", which is why the tokens are consulted.
    const text = "/* the plan:\n   read the inpu";
    expect(insideStringOrComment(tokenize(text, "JAVA_21"), contextAt(text))).toBe(true);
  });

  it("refuses a Python docstring that opened on an earlier line", () => {
    const text = '"""\nReads the inpu';
    const ctx = completionContext(text, text.length, "#");
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    expect(insideStringOrComment(tokenize(text, "PYTHON_312"), ctx)).toBe(true);
  });

  it("checks the separator when nothing follows it yet", () => {
    const code = "System.";
    expect(insideStringOrComment(tokenize(code, "JAVA_21"), contextAt(code))).toBe(false);
  });
});

describe("stepIndex", () => {
  it("moves and wraps at both ends", () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
  });

  it("is 0 for an empty list", () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe("isNoOpEdit", () => {
  it("spots an accept that would retype what is already there", () => {
    const edit: Edit = { from: 7, to: 13, insert: "result", selectionStart: 13, selectionEnd: 13 };
    expect(isNoOpEdit("return result", edit)).toBe(true);
  });

  it("counts a caret move as a change", () => {
    const edit: Edit = { from: 0, to: 9, insert: "println()", selectionStart: 8, selectionEnd: 8 };
    expect(isNoOpEdit("println()", edit)).toBe(false);
  });

  it("counts different text as a change", () => {
    const edit: Edit = { from: 0, to: 3, insert: "println()", selectionStart: 8, selectionEnd: 8 };
    expect(isNoOpEdit("pri", edit)).toBe(false);
  });
});

describe("applyNativeEdit", () => {
  interface FakeTextarea {
    value: string;
    selection: [number, number];
    events: string[];
    setSelectionRange: (start: number, end: number) => void;
    setRangeText: (insert: string, start: number, end: number, mode: string) => void;
    dispatchEvent: (event: Event) => boolean;
  }

  function fakeTextarea(value: string): FakeTextarea {
    const element: FakeTextarea = {
      value,
      selection: [0, 0],
      events: [],
      setSelectionRange(start, end) {
        element.selection = [start, end];
      },
      setRangeText(insert, start, end) {
        element.value = element.value.slice(0, start) + insert + element.value.slice(end);
      },
      dispatchEvent(event) {
        element.events.push(event.type);
        return true;
      },
    };
    return element;
  }

  function stubDocument(execCommand: (command: string, ui: boolean, value?: string) => boolean): void {
    vi.stubGlobal("document", { execCommand });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces the range through insertText so the browser records an undo step", () => {
    const element = fakeTextarea("class A {}");
    const calls: string[] = [];
    stubDocument((command, _ui, value) => {
      calls.push(`${command}:${value ?? ""}`);
      // What the browser does: replace the current selection with the text.
      const [start, end] = element.selection;
      element.value = element.value.slice(0, start) + (value ?? "") + element.value.slice(end);
      return true;
    });
    const edit: Edit = { from: 9, to: 9, insert: "\n    \n", selectionStart: 14, selectionEnd: 14 };

    applyNativeEdit(element as unknown as HTMLTextAreaElement, edit);

    expect(calls).toEqual(["insertText:\n    \n"]);
    expect(element.value).toBe("class A {\n    \n}");
    expect(element.selection).toEqual([14, 14]);
    expect(element.events).toEqual([]);
  });

  it("deletes with the delete command, since an empty insertText is not a delete everywhere", () => {
    const element = fakeTextarea("f()");
    const calls: string[] = [];
    stubDocument((command) => {
      calls.push(command);
      return true;
    });
    applyNativeEdit(element as unknown as HTMLTextAreaElement, {
      from: 1,
      to: 3,
      insert: "",
      selectionStart: 1,
      selectionEnd: 1,
    });
    expect(calls).toEqual(["delete"]);
  });

  it("falls back to setRangeText and an input event when execCommand refuses", () => {
    const element = fakeTextarea("sout");
    stubDocument(() => false);
    applyNativeEdit(element as unknown as HTMLTextAreaElement, {
      from: 0,
      to: 4,
      insert: "System.out.println();",
      selectionStart: 19,
      selectionEnd: 19,
    });
    expect(element.value).toBe("System.out.println();");
    expect(element.events).toEqual(["input"]);
    expect(element.selection).toEqual([19, 19]);
  });

  it("only moves the caret when the text would not change", () => {
    const element = fakeTextarea("f()");
    const calls: string[] = [];
    stubDocument((command) => {
      calls.push(command);
      return true;
    });
    applyNativeEdit(element as unknown as HTMLTextAreaElement, {
      from: 2,
      to: 2,
      insert: "",
      selectionStart: 3,
      selectionEnd: 3,
    });
    expect(calls).toEqual([]);
    expect(element.selection).toEqual([3, 3]);
  });
});
