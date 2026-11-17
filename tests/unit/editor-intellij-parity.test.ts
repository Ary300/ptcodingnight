import { describe, expect, it } from "vitest";

import { applyCompletion, completionContext, completionsFor } from "@/components/contest/editor/smart/completion";
import { C, CPP } from "@/components/contest/editor/smart/cpp";
import { handleKey } from "@/components/contest/editor/smart/engine";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import {
  nextTemplateStop,
  startTemplateSession,
  type TemplateSession,
} from "@/components/contest/editor/smart/template-session";
import type { Edit, EditState, KeyInput, LanguageProfile } from "@/components/contest/editor/smart/types";

/**
 * Regressions found by using the smart editor the way an IntelliJ, PyCharm or CLion user does,
 * against the REAL profiles. Each case is a keystroke sequence a student types and the text it
 * must leave; "▮" is the caret and "«...»" a selection.
 */

const CARET = "▮";

function state(marked: string): EditState {
  const open = marked.indexOf("«");
  if (open !== -1) {
    const close = marked.indexOf("»");
    const text = marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1);
    return { text, selectionStart: open, selectionEnd: close - 1 };
  }
  const caret = marked.indexOf(CARET);
  if (caret === -1) throw new Error(`no caret in ${JSON.stringify(marked)}`);
  return { text: marked.replace(CARET, ""), selectionStart: caret, selectionEnd: caret };
}

function draw(current: EditState): string {
  const { text, selectionStart: a, selectionEnd: b } = current;
  if (a === b) return text.slice(0, a) + CARET + text.slice(a);
  return `${text.slice(0, a)}«${text.slice(a, b)}»${text.slice(b)}`;
}

function apply(current: EditState, edit: Edit): EditState {
  return {
    text: current.text.slice(0, edit.from) + edit.insert + current.text.slice(edit.to),
    selectionStart: edit.selectionStart,
    selectionEnd: edit.selectionEnd,
  };
}

interface KeyOptions {
  readonly shift?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly mac?: boolean;
}

function key(name: string, options: KeyOptions = {}): KeyInput {
  return {
    key: name,
    shiftKey: options.shift ?? false,
    altKey: false,
    ctrlKey: options.ctrl ?? false,
    metaKey: options.meta ?? false,
    isMac: options.mac ?? false,
  };
}

/** What the browser does with a key the engine declines: types the character, or a newline. */
function browserDefault(current: EditState, input: KeyInput): EditState {
  const { text, selectionStart: a, selectionEnd: b } = current;
  if (input.key === "Backspace") {
    if (a !== b) return { text: text.slice(0, a) + text.slice(b), selectionStart: a, selectionEnd: a };
    return { text: text.slice(0, a - 1) + text.slice(a), selectionStart: a - 1, selectionEnd: a - 1 };
  }
  const ch = input.key === "Enter" ? "\n" : input.key === "Tab" ? "\t" : input.key;
  return { text: text.slice(0, a) + ch + text.slice(b), selectionStart: a + 1, selectionEnd: a + 1 };
}

/**
 * Types `keys` the way the surface routes them, minus the popup: an active template takes Tab
 * and Enter first, then the engine, then the browser. A key of more than one character that is
 * not a named key is typed letter by letter.
 */
function typeKeys(marked: string, keys: readonly (string | KeyInput)[], profile: LanguageProfile): string {
  let current = state(marked);
  let session: TemplateSession | null = null;
  const named = new Set(["Enter", "Tab", "Backspace", "Escape"]);
  const inputs = keys.flatMap((entry) =>
    typeof entry !== "string" ? [entry] : named.has(entry) ? [key(entry)] : [...entry].map((ch) => key(ch)),
  );
  for (const input of inputs) {
    if (session !== null && (input.key === "Tab" || input.key === "Enter") && !input.shiftKey) {
      const step = nextTemplateStop(session, current);
      if (step !== null) {
        current = apply(current, step.edit);
        session = step.session;
        continue;
      }
      session = null;
    }
    if (input.key === "Escape") {
      session = null;
      continue;
    }
    const edit = handleKey(current, input, profile);
    if (edit === null) {
      current = browserDefault(current, input);
      continue;
    }
    current = apply(current, edit);
    const started = startTemplateSession(current.text, edit);
    if (started !== null) session = started;
  }
  return draw(current);
}

/** The labels completion offers at the caret, best first. */
function offered(marked: string, profile: LanguageProfile): string[] {
  const { text, selectionStart } = state(marked);
  const ctx = completionContext(text, selectionStart, profile.lineComment);
  if (ctx === null) return [];
  return completionsFor(ctx, text, profile).map((item) => item.label);
}

/** What Enter does with the popup open: accept the top row, unless that changes nothing. */
function enterWithPopup(marked: string, profile: LanguageProfile): string {
  const current = state(marked);
  const ctx = completionContext(current.text, current.selectionStart, profile.lineComment);
  const top = ctx === null ? undefined : completionsFor(ctx, current.text, profile)[0];
  if (ctx !== null && top !== undefined) {
    const edit = applyCompletion(current, ctx, top, profile.indentUnit);
    const unchanged = current.text.slice(edit.from, edit.to) === edit.insert;
    if (!unchanged) return draw(apply(current, edit));
  }
  const enter = handleKey(current, key("Enter"), profile);
  return draw(enter === null ? browserDefault(current, key("Enter")) : apply(current, enter));
}

describe("a name typed in full is never swapped for a keyword", () => {
  it.each([
    ["def f(n):\n    return n▮", "def f(n):\n    return n\n▮"],
    ["a = 1\nb = 2\nans = a + b▮", "a = 1\nb = 2\nans = a + b\n▮"],
    ["for i in range(3):\n    x = i▮", "for i in range(3):\n    x = i\n    ▮"],
    ["def f(n):\n    total = 0\n    for i in range(n):\n        total += i▮", "def f(n):\n    total = 0\n    for i in range(n):\n        total += i\n        ▮"],
    ["result_list = []\nresult = 0\nreturn result▮", "result_list = []\nresult = 0\nreturn result\n▮"],
  ])("Python: Enter after %j keeps the name", (before, after) => {
    expect(enterWithPopup(before, PYTHON)).toBe(after);
  });

  it("puts the declared variable first, ahead of keywords that share its letters", () => {
    expect(offered("n = 1\nreturn n▮", PYTHON)[0]).toBe("n");
    expect(offered("int n = 5;\nint x = n▮", JAVA)[0]).toBe("n");
    expect(offered("long a = 1;\nlong total = a▮", JAVA)[0]).toBe("a");
  });

  it("Java: Enter after `int x = n` with n declared keeps n", () => {
    expect(enterWithPopup("int n = 5;\nint x = n▮", JAVA)).toBe("int n = 5;\nint x = n\n▮");
  });

  it("still completes a prefix that is not yet a whole name", () => {
    expect(enterWithPopup("int total = 0;\nto▮", JAVA)).toBe("int total = 0;\ntotal▮");
  });
});

describe("live templates walk their fields with Tab, as IntelliJ's do", () => {
  it("Java fori: the bound, then the indented line inside the braces", () => {
    expect(typeKeys("    ▮", ["fori", "Tab", "10", "Tab"], JAVA)).toBe(
      "    for (int i = 0; i < 10; i++) {\n        ▮\n    }",
    );
  });

  it("Enter after the field also moves to the body", () => {
    expect(typeKeys("▮", ["fori", "Tab", "n", "Enter"], CPP)).toBe("for (int i = 0; i < n; i++) {\n    ▮\n}");
  });

  it("iter: the iterable first, then the element type it does not force, then the name", () => {
    expect(typeKeys("▮", ["iter", "Tab", "list", "Tab"], JAVA)).toBe("for («int» x : list) {\n    \n}");
    expect(typeKeys("▮", ["iter", "Tab", "list", "Tab", "String", "Tab", "Tab"], JAVA)).toBe(
      "for (String x : list) {\n    ▮\n}",
    );
  });

  it("Python fori and def reach their bodies", () => {
    expect(typeKeys("▮", ["fori", "Tab", "n", "Tab"], PYTHON)).toBe("for i in range(n):\n    ▮");
    expect(typeKeys("▮", ["def", "Tab", "solve", "Tab", "a, b", "Tab"], PYTHON)).toBe("def solve(a, b):\n    ▮");
  });

  it("a template accepted from the popup carries the same fields", () => {
    const current = state("fo▮");
    const ctx = completionContext(current.text, current.selectionStart, "//");
    if (ctx === null) throw new Error("no context");
    const item = completionsFor(ctx, current.text, JAVA).find((candidate) => candidate.label === "fori");
    if (item === undefined) throw new Error("fori not offered");
    const edit = applyCompletion(current, ctx, item, JAVA.indentUnit);
    expect(draw(apply(current, edit))).toBe("for (int i = 0; i < ▮; i++) {\n    \n}");
    expect(edit.tabStops).toEqual([{ from: "for (int i = 0; i < ; i++) {\n    ".length, to: "for (int i = 0; i < ; i++) {\n    ".length }]);
  });
});

describe("postfix templates", () => {
  it.each([
    ["int x = 5;\nx.sout▮", "int x = 5;\nSystem.out.println(x);▮"],
    ["    a[i].sout▮", "    System.out.println(a[i]);▮"],
    ["int n = 3;\nn.fori▮", "int n = 3;\nfor (int i = 0; i < n; i++) {\n    ▮\n}"],
    ["    list.size().fori▮", "    for (int i = 0; i < list.size(); i++) {\n        ▮\n    }"],
    ["ok.if▮", "if (ok) {\n    ▮\n}"],
  ])("Java %j + Tab", (before, after) => {
    expect(typeKeys(before, ["Tab"], JAVA)).toBe(after);
  });

  it("C++ and Python have their own", () => {
    expect(typeKeys("v.size().fori▮", ["Tab"], CPP)).toBe("for (int i = 0; i < v.size(); i++) {\n    ▮\n}");
    expect(typeKeys("ans.print▮", ["Tab"], PYTHON)).toBe("print(ans)▮");
  });

  it("does not treat a number as the expression", () => {
    expect(handleKey(state("3.fori▮"), key("Tab"), JAVA)).toBeNull();
  });
});

describe("Python dedents the way PyCharm does", () => {
  it("snaps else, elif, except and finally back to their opener on the colon", () => {
    expect(typeKeys("if n > 0:\n    print(n)\n    else▮", [":"], PYTHON)).toBe("if n > 0:\n    print(n)\nelse:▮");
    expect(typeKeys("if a:\n    x\n    elif b▮", [":"], PYTHON)).toBe("if a:\n    x\nelif b:▮");
    expect(typeKeys("try:\n    x()\n    except ValueError▮", [":"], PYTHON)).toBe(
      "try:\n    x()\nexcept ValueError:▮",
    );
    expect(typeKeys("try:\n    x()\nexcept:\n    y()\n    finally▮", [":"], PYTHON)).toBe(
      "try:\n    x()\nexcept:\n    y()\nfinally:▮",
    );
  });

  it("goes to the nearest enclosing if, not the outermost", () => {
    expect(typeKeys("if a:\n    if b:\n        x\n        else▮", [":"], PYTHON)).toBe(
      "if a:\n    if b:\n        x\n    else:▮",
    );
  });

  it("leaves an else alone when the line above with less indent cannot take one", () => {
    expect(handleKey(state("def f():\n    return 1\n    else▮"), key(":"), PYTHON)).toBeNull();
  });

  it("drops a level after return, pass, break, continue and raise", () => {
    for (const statement of ["return 1", "pass", "break", "continue", "raise ValueError()"]) {
      expect(typeKeys(`def f():\n    ${statement}▮`, ["Enter"], PYTHON)).toBe(`def f():\n    ${statement}\n▮`);
    }
    // Still inside a bracket, the statement continues, lined up under the first argument (PyCharm).
    expect(typeKeys("def f():\n    return max(a,▮", ["Enter"], PYTHON)).toBe(
      "def f():\n    return max(a,\n               ▮",
    );
  });

  it("Backspace in the indentation removes a whole level", () => {
    expect(typeKeys("if x:\n    ▮", ["Backspace"], PYTHON)).toBe("if x:\n▮");
    expect(typeKeys("        ▮", ["Backspace"], PYTHON)).toBe("    ▮");
    expect(typeKeys("      ▮", ["Backspace"], PYTHON)).toBe("    ▮");
    // Past the indentation it is the browser's one-character Backspace.
    expect(handleKey(state("    x▮"), key("Backspace"), PYTHON)).toBeNull();
  });

  it("a closing bracket on its own line returns to the opener's line", () => {
    expect(typeKeys("xs = [\n    1,\n    2,\n    ▮", ["]"], PYTHON)).toBe("xs = [\n    1,\n    2,\n]▮");
  });
});

describe("member completion", () => {
  it("ranks the contest calls first in C++", () => {
    expect(offered("vector<int> v;\nv.pu▮", CPP)[0]).toBe("push_back()");
    expect(offered("vector<int> v;\nv.pb▮", CPP)[0]).toBe("push_back()");
    expect(offered("pair<int,int> p;\nint a = p.fi▮", CPP)[0]).toBe("first");
  });

  it("offers the file's own fields after a dot", () => {
    expect(offered("class S:\n    def f(self):\n        self.val = 1\n        self.v▮", PYTHON)[0]).toBe("val");
    expect(offered("class Node { int val; Node next; }\nNode node;\nnode.ne▮", JAVA)[0]).toBe("next");
    expect(offered("struct P { int x, y; };\nP p;\np.▮", CPP)).toEqual(expect.arrayContaining(["x", "y"]));
  });

  it("does not offer the qualifier back to itself", () => {
    expect(offered("System.out.▮", JAVA)).not.toContain("out");
  });
});

describe("C has its own names", () => {
  it("offers printf and scanf, and none of C++'s keywords", () => {
    expect(offered("pri▮", C)).toEqual(["printf()"]);
    expect(offered("sca▮", C)).toEqual(["scanf()"]);
    expect(offered("pri▮", CPP)).toContain("printf()");
  });
});

describe("Enter", () => {
  it("writes `};` after a C++ struct, class, union or enum", () => {
    expect(typeKeys("▮", ["struct P {", "Enter"], CPP)).toBe("struct P {\n    ▮\n};");
    expect(typeKeys("class A {▮", ["Enter"], CPP)).toBe("class A {\n    ▮\n};");
    expect(typeKeys("enum class Color {▮}", ["Enter"], CPP)).toBe("enum class Color {\n    ▮\n};");
    // Java and C++ functions keep a bare brace.
    expect(typeKeys("class A {▮}", ["Enter"], JAVA)).toBe("class A {\n    ▮\n}");
    expect(typeKeys("int main() {▮}", ["Enter"], CPP)).toBe("int main() {\n    ▮\n}");
  });

  it("indents the body of a case label, a braceless control statement and an access specifier", () => {
    expect(typeKeys("    case 1:▮", ["Enter"], JAVA)).toBe("    case 1:\n        ▮");
    expect(typeKeys("    default:▮", ["Enter"], JAVA)).toBe("    default:\n        ▮");
    expect(typeKeys("    if (a)▮", ["Enter"], JAVA)).toBe("    if (a)\n        ▮");
    expect(typeKeys("    else▮", ["Enter"], JAVA)).toBe("    else\n        ▮");
    expect(typeKeys("    for (int i = 0; i < n; i++)▮", ["Enter"], CPP)).toBe(
      "    for (int i = 0; i < n; i++)\n        ▮",
    );
    expect(typeKeys("public:▮", ["Enter"], CPP)).toBe("public:\n    ▮");
  });

  it("returns to the header's indent after the one statement under it", () => {
    expect(typeKeys("    if (a)\n        x = 1;▮", ["Enter"], JAVA)).toBe("    if (a)\n        x = 1;\n    ▮");
  });

  it("still splits {} after a /* inside a string or a line comment", () => {
    expect(typeKeys('    String glob = "/*";\n    if (x) {▮}', ["Enter"], JAVA)).toBe(
      '    String glob = "/*";\n    if (x) {\n        ▮\n    }',
    );
    expect(typeKeys("// old /* style\nif (x) {▮}", ["Enter"], CPP)).toBe("// old /* style\nif (x) {\n    ▮\n}");
    // A real open block comment still continues.
    expect(typeKeys("/**▮", ["Enter"], JAVA)).toBe("/**\n * ▮\n */");
  });

  it("keeps tabs on a tab-indented line", () => {
    expect(typeKeys("\tif (x) {▮}", ["Enter"], JAVA)).toBe("\tif (x) {\n\t\t▮\n\t}");
  });
});

describe("Mod+Shift+Enter is Complete Current Statement", () => {
  const completeMac = key("Enter", { meta: true, shift: true, mac: true });
  const completePc = key("Enter", { ctrl: true, shift: true });

  it("adds the missing semicolon and closers", () => {
    expect(typeKeys("System.out.println(x▮)", [completeMac], JAVA)).toBe("System.out.println(x);▮");
    expect(typeKeys("System.out.println(x▮", [completePc], JAVA)).toBe("System.out.println(x);▮");
    expect(typeKeys("    int a = f(g(1▮", [completePc], CPP)).toBe("    int a = f(g(1));▮");
  });

  it("opens the block of a control statement", () => {
    expect(typeKeys("    if (x > 0▮", [completePc], JAVA)).toBe("    if (x > 0) {\n        ▮\n    }");
    expect(typeKeys("struct P▮", [completePc], CPP)).toBe("struct P;▮");
  });

  it("ends a Python header with a colon and starts its body", () => {
    expect(typeKeys("if x > 0▮", [completePc], PYTHON)).toBe("if x > 0:\n    ▮");
    expect(typeKeys("print(x▮", [completePc], PYTHON)).toBe("print(x)▮");
  });

  it("starts a new line when the statement is already complete", () => {
    expect(typeKeys("    int a = 1;▮", [completePc], JAVA)).toBe("    int a = 1;\n    ▮");
  });

  it("is never returned for plain Mod+Enter, which the surface keeps for submit", () => {
    expect(handleKey(state("x▮"), key("Enter", { ctrl: true }), JAVA)).toBeNull();
    expect(handleKey(state("x▮"), key("Enter", { meta: true, mac: true }), JAVA)).toBeNull();
  });
});

describe("Delete Line", () => {
  it("deletes the whole line with Cmd+Backspace on a Mac and Ctrl+Y elsewhere", () => {
    const before = "    int a = 1;\n    int b▮ = 2;\n    int c = 3;";
    const after = "    int a = 1;\n    int c▮ = 3;";
    expect(typeKeys(before, [key("Backspace", { meta: true, mac: true })], JAVA)).toBe(after);
    expect(typeKeys(before, [key("y", { ctrl: true })], JAVA)).toBe(after);
  });

  it("deletes the last line into the one above it", () => {
    expect(typeKeys("a\nb▮", [key("y", { ctrl: true })], JAVA)).toBe("a▮");
  });
});

describe("quotes", () => {
  it("opens a quote in front of a string instead of stepping into it", () => {
    expect(handleKey(state('foo(▮"abc")'), key('"'), JAVA)).toBeNull();
    expect(handleKey(state("foo(▮'abc')"), key("'"), PYTHON)).toBeNull();
  });

  it("still steps over a closing quote", () => {
    expect(typeKeys('"abc▮"', ['"'], JAVA)).toBe('"abc"▮');
    expect(typeKeys('s = "it\'s▮"', ['"'], PYTHON)).toBe('s = "it\'s"▮');
  });
});

describe("a template session", () => {
  it("ends when the caret has left the field, so Tab is Tab again", () => {
    const expanded = handleKey(state("fori▮"), key("Tab"), JAVA);
    if (expanded === null) throw new Error("fori did not expand");
    const after = apply(state("fori▮"), expanded);
    const session = startTemplateSession(after.text, expanded);
    if (session === null) throw new Error("no session");
    // The caret moved to the start of the file: outside the bound field.
    expect(nextTemplateStop(session, { ...after, selectionStart: 0, selectionEnd: 0 })).toBeNull();
    // Inside it, Tab moves on, and the last stop ends the session.
    expect(nextTemplateStop(session, after)?.session).toBeNull();
  });

  it("is not started by an edit with no fields", () => {
    const expanded = handleKey(state("sout▮"), key("Tab"), JAVA);
    if (expanded === null) throw new Error("sout did not expand");
    expect(startTemplateSession(apply(state("sout▮"), expanded).text, expanded)).toBeNull();
  });
});
