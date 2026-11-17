import { describe, expect, it } from "vitest";

import { CPP } from "@/components/contest/editor/smart/cpp";
import { handleKey } from "@/components/contest/editor/smart/engine";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import type { Edit, EditState, KeyInput, LanguageProfile } from "@/components/contest/editor/smart/types";

/*
  A class name typed in full and followed by "." added no import: `Arrays.sort(a);` typed straight
  through failed to compile in a file without `import java.util.*`. Accepting the name from the
  completion popup always added it; typing it did not. IntelliJ's "Add unambiguous imports on the
  fly" adds it, as one undo step with the "."; CLion does the same for `std::sort(`.
*/

function at(marked: string): EditState {
  const caret = marked.indexOf("|");
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), selectionStart: caret, selectionEnd: caret };
}

function key(name: string): KeyInput {
  return { key: name, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isMac: false };
}

/** The text after the key, with the caret drawn, or null when the browser types it unaided. */
function type(marked: string, ch: string, profile: LanguageProfile): string | null {
  const state = at(marked);
  const edit: Edit | null = handleKey(state, key(ch), profile);
  if (edit === null) return null;
  const text = state.text.slice(0, edit.from) + edit.insert + state.text.slice(edit.to);
  return `${text.slice(0, edit.selectionStart)}|${text.slice(edit.selectionStart)}`;
}

const MAIN = (body: string): string =>
  `public class Main {\n    public static void main(String[] args) {\n        ${body}\n    }\n}\n`;

describe("Java: '.' after a class typed in full adds its import", () => {
  it("adds import java.util.Arrays at the top, as one edit with the dot", () => {
    expect(type(MAIN("Arrays|"), ".", JAVA)).toBe(`import java.util.Arrays;\n\n${MAIN("Arrays.|")}`);
  });

  it("goes among the existing imports in A to Z order", () => {
    const file = `import java.io.IOException;\nimport java.util.Scanner;\n\n${MAIN("Arrays|")}`;
    expect(type(file, ".", JAVA)).toBe(
      `import java.io.IOException;\nimport java.util.Arrays;\nimport java.util.Scanner;\n\n${MAIN("Arrays.|")}`,
    );
  });

  it("adds nothing when a wildcard or the import itself already covers it", () => {
    expect(type(`import java.util.*;\n\n${MAIN("Arrays|")}`, ".", JAVA)).toBeNull();
    expect(type(`import java.util.Arrays;\n\n${MAIN("Arrays|")}`, ".", JAVA)).toBeNull();
  });

  it("adds nothing for java.lang, a member, a string or a comment", () => {
    expect(type(MAIN("Math|"), ".", JAVA)).toBeNull();
    expect(type(MAIN("x = a.Arrays|"), ".", JAVA)).toBeNull();
    expect(type(MAIN('String s = "Arrays|"'), ".", JAVA)).toBeNull();
    expect(type(MAIN("// Arrays|"), ".", JAVA)).toBeNull();
  });

  it("adds nothing for a class the file declares itself", () => {
    const file = `${MAIN("Arrays|")}class Arrays {\n    static void sort(int[] a) {}\n}\n`;
    expect(type(file, ".", JAVA)).toBeNull();
  });

  it("adds nothing for a name that is not a known class", () => {
    expect(type(MAIN("scanner|"), ".", JAVA)).toBeNull();
  });
});

describe("C++: a std:: name typed in full adds its header", () => {
  it("adds #include <algorithm> on the '(' of std::sort, keeping the pair", () => {
    const file = "#include <iostream>\n\nint main() {\n    std::sort|\n}\n";
    expect(type(file, "(", CPP)).toBe(
      "#include <iostream>\n#include <algorithm>\n\nint main() {\n    std::sort(|)\n}\n",
    );
  });

  it("adds nothing under bits/stdc++.h, or for a member or another namespace", () => {
    expect(type("#include <bits/stdc++.h>\n\nint main() {\n    std::sort|\n}\n", "(", CPP)).toBe(
      "#include <bits/stdc++.h>\n\nint main() {\n    std::sort(|)\n}\n",
    );
    expect(type("#include <iostream>\n\nint main() {\n    v.sort|\n}\n", "(", CPP)).toBe(
      "#include <iostream>\n\nint main() {\n    v.sort(|)\n}\n",
    );
    expect(type("#include <iostream>\n\nint main() {\n    my::sort|\n}\n", "(", CPP)).toBe(
      "#include <iostream>\n\nint main() {\n    my::sort(|)\n}\n",
    );
  });
});

describe("Python is left alone", () => {
  it("never imports on typing", () => {
    expect(type("x = math|", ".", PYTHON)).toBeNull();
  });
});
