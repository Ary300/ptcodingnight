import { describe, expect, it } from "vitest";

import { completionContext, completionsFor } from "@/components/contest/editor/smart/completion";
import { CPP } from "@/components/contest/editor/smart/cpp";
import { handleKey } from "@/components/contest/editor/smart/engine";
import { JAVA } from "@/components/contest/editor/smart/java";
import { reindentPaste } from "@/components/contest/editor/smart/paste";
import type { EditState } from "@/components/contest/editor/smart/types";

/** The third batch: CLion's missing templates and the noise in C++ member lists. */

function at(marked: string): EditState {
  const caret = marked.indexOf("|");
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), selectionStart: caret, selectionEnd: caret };
}

function tab(marked: string): string {
  const state = at(marked);
  const edit = handleKey(state, { key: "Tab", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isMac: false }, CPP);
  if (edit === null) return "(no expansion)";
  const text = state.text.slice(0, edit.from) + edit.insert + state.text.slice(edit.to);
  if (edit.selectionStart === edit.selectionEnd) return `${text.slice(0, edit.selectionStart)}|${text.slice(edit.selectionEnd)}`;
  return `${text.slice(0, edit.selectionStart)}«${text.slice(edit.selectionStart, edit.selectionEnd)}»${text.slice(edit.selectionEnd)}`;
}

function labels(marked: string): readonly string[] {
  const state = at(marked);
  const ctx = completionContext(state.text, state.selectionStart, "//");
  if (ctx === null) throw new Error("no context");
  return completionsFor(ctx, state.text, CPP, 50).map((item) => item.label);
}

describe("CLion's live templates", () => {
  it("expands if, while, switch, do and cerr in a body", () => {
    expect(tab("int main() {\n    if|\n}")).toBe("int main() {\n    if (|) {\n        \n    }\n}");
    expect(tab("int main() {\n    while|\n}")).toBe("int main() {\n    while (|) {\n        \n    }\n}");
    expect(tab("int main() {\n    switch|\n}")).toBe("int main() {\n    switch (|) {\n        \n    }\n}");
    expect(tab("int main() {\n    do|\n}")).toBe("int main() {\n    do {\n        \n    } while (|);\n}");
    expect(tab("int main() {\n    cerr|\n}")).toBe("int main() {\n    cerr << | << '\\n';\n}");
  });

  it("expands struct and class only at the top level", () => {
    expect(tab("struct|")).toBe("struct | {\n    \n};");
    expect(tab("int main() {\n    struct|\n}")).toBe("(no expansion)");
  });

  it("expands else after an if block", () => {
    expect(tab("int main() {\n    if (a) {\n    } else|\n}")).toBe("int main() {\n    if (a) {\n    } else {\n        |\n    }\n}");
  });
});

describe("CLion's postfix templates", () => {
  it("covers else, foreach, var, static_cast, cerr and the begin/end pair", () => {
    expect(tab("int main() {\n    x.else|\n}")).toBe("int main() {\n    if (!x) {\n        |\n    }\n}");
    expect(tab("int main() {\n    v.foreach|\n}")).toBe("int main() {\n    for (auto &«x» : v) {\n        \n    }\n}");
    expect(tab("int main() {\n    a.var|\n}")).toBe("int main() {\n    auto «x» = a;\n}");
    expect(tab("int main() {\n    x.static_cast|\n}")).toBe("int main() {\n    static_cast<|>(x)\n}");
    expect(tab("int main() {\n    sort(v.all|\n}")).toBe("int main() {\n    sort(v.begin(), v.end()|\n}");
  });
});

describe("C++ member lists hold only what the type has", () => {
  it("lists a declared struct's fields and nothing from vector or pair", () => {
    const list = labels("struct P { int x, y; };\nint main() {\n    P p;\n    p.|\n}");
    expect(list).toEqual(expect.arrayContaining(["x", "y"]));
    expect(list).not.toContain("first");
    expect(list).not.toContain("push_back()");
  });

  it("takes no names from an #include line", () => {
    const list = labels("#include <bits/stdc++.h>\nint main() {\n    int s1 = 0;\n    s|\n}");
    expect(list).not.toContain("stdc");
    const members = labels("#include <bits/stdc++.h>\nint main() {\n    vector<vector<int>> g(5);\n    g[0].|\n}");
    expect(members[0]).not.toBe("h");
    expect(members).not.toContain("h");
  });

  it("lists main once", () => {
    const list = labels("int main() {\n    return 0;\n}\nm|");
    expect(list.filter((label) => label === "main")).toHaveLength(1);
  });
});

describe("paste keeps a continuation's place and lands at the body's indent", () => {
  function paste(marked: string, clipboard: string, profile = CPP): string {
    const state = at(marked);
    const edit = reindentPaste(state.text, clipboard, state, profile);
    const text = state.text.slice(0, edit.from) + edit.insert + state.text.slice(edit.to);
    return `${text.slice(0, edit.selectionStart)}|${text.slice(edit.selectionEnd)}`;
  }

  it("keeps the lines after an open call where they were relative to it", () => {
    expect(paste("        int x = |", "foo(1,\n      2);", JAVA)).toBe("        int x = foo(1,\n              2);|");
  });

  it("re-bases a block pasted at column 0 of a blank body line onto the body's indent", () => {
    expect(paste("int main() {\n|\n}", "int best = 0;\nbest++;\n")).toBe(
      "int main() {\n    int best = 0;\n    best++;\n    |\n}",
    );
  });
});
