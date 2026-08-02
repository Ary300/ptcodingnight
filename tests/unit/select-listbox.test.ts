import { createElement, Fragment } from "react";
import { describe, expect, it } from "vitest";

import {
  edgeIndex,
  optionsFromChildren,
  pageIndex,
  stepIndex,
  typeAheadIndex,
  type ListboxOption,
} from "@/components/ui/Select";

/**
 * The parts of the dropdown that can be checked without a browser.
 *
 * `components/ui/Select.tsx` replaced an operating-system popup with one we draw, and the
 * argument for doing it was that the OS one could never be executed by any gate. That argument
 * obliges us to actually execute the replacement. The unit suite runs in `node` with no DOM and
 * no React renderer, so what is reachable here is the pure half: reading `<option>` children into
 * an option list, and the movement rules. The half that needs a document (Escape returning focus,
 * the 500ms buffer expiring, the panel closing on an ancestor scroll) is asserted in the browser;
 * see the G7 and G9 requests in the dropdown report.
 *
 * These are not incidental helpers. Every one of them is a rule the audit stated in prose, and
 * prose is exactly where a rule like "arrows do not wrap" goes to quietly stop being true.
 */

/** Ten, because the language picker is ten and that is the list a student opens every night. */
const LANGUAGES: readonly ListboxOption[] = [
  { value: "PY_312", label: "Python 3.12" },
  { value: "JAVA_8", label: "Java 8" },
  { value: "JAVA_11", label: "Java 11" },
  { value: "JAVA_17", label: "Java 17" },
  { value: "JAVA_21", label: "Java 21" },
  { value: "C_GCC14", label: "C (GCC 14)" },
  { value: "CPP_11", label: "C++11" },
  { value: "CPP_17", label: "C++17" },
  { value: "JS_NODE22", label: "JavaScript (Node.js)" },
  { value: "GO_123", label: "Go 1.23" },
];

/** The shape `RosterManager` ships: a disabled sentinel first, then real destinations. */
const ROSTER: readonly ListboxOption[] = [
  { value: "__unchosen__", label: "Choose a team...", disabled: true },
  { value: "", label: "(remove from their team)" },
  { value: "t1", label: "Anchor" },
  { value: "t2", label: "Bishop" },
];

describe("optionsFromChildren", () => {
  it("reads value, label and disabled off plain option children", () => {
    const options = optionsFromChildren([
      createElement("option", { key: "a", value: "a" }, "Alpha"),
      createElement("option", { key: "b", value: "b", disabled: true }, "Beta"),
    ]);

    expect(options).toEqual([
      { value: "a", label: "Alpha", disabled: false },
      { value: "b", label: "Beta", disabled: true },
    ]);
  });

  it("flattens a label built from several expressions", () => {
    // `SideActivityEntry` writes `{team.name} ({team.teamSize} players)`, which reaches the
    // component as an ARRAY of strings and numbers. Reading `props.children` as a string here
    // renders every team in the organizer's list as `[object Object]`.
    const options = optionsFromChildren(
      createElement("option", { value: "t1" }, "Anchor", " (", 4, " players)"),
    );

    expect(options).toEqual([{ value: "t1", label: "Anchor (4 players)", disabled: false }]);
  });

  it("collapses the whitespace JSX leaves between lines", () => {
    const options = optionsFromChildren(
      createElement("option", { value: "x" }, "\n        Choose a team...\n      "),
    );

    expect(options[0]?.label).toBe("Choose a team...");
  });

  it("falls back to the label when an option carries no value, as the DOM does", () => {
    const options = optionsFromChildren(createElement("option", null, "Individual"));

    expect(options).toEqual([{ value: "Individual", label: "Individual", disabled: false }]);
  });

  it("walks through fragments and optgroups rather than treating them as options", () => {
    const options = optionsFromChildren(
      createElement(
        Fragment,
        null,
        createElement("option", { key: "a", value: "a" }, "Alpha"),
        createElement(
          "optgroup",
          { key: "g", label: "Group" },
          createElement("option", { key: "b", value: "b" }, "Beta"),
        ),
      ),
    );

    expect(options.map((option) => option.value)).toEqual(["a", "b"]);
  });

  it("ignores anything that is not an option", () => {
    // A comment node, a `{condition && …}` that evaluated false, a stray span: none of them are
    // choices, and inventing an empty row for each would put unselectable blanks in the list.
    const options = optionsFromChildren([
      false,
      null,
      "loose text",
      createElement("span", { key: "s" }, "not an option"),
      createElement("option", { key: "a", value: "a" }, "Alpha"),
    ]);

    expect(options).toEqual([{ value: "a", label: "Alpha", disabled: false }]);
  });
});

describe("stepIndex", () => {
  it("moves one option at a time", () => {
    expect(stepIndex(LANGUAGES, 0, 1)).toBe(1);
    expect(stepIndex(LANGUAGES, 5, -1)).toBe(4);
  });

  it("does not wrap at either end", () => {
    // Native macOS does not wrap. Wrapping plus type-ahead reads as the cursor jumping backwards
    // for a reason the person cannot see.
    expect(stepIndex(LANGUAGES, LANGUAGES.length - 1, 1)).toBe(LANGUAGES.length - 1);
    expect(stepIndex(LANGUAGES, 0, -1)).toBe(0);
  });

  it("skips a disabled option in both directions", () => {
    expect(stepIndex(ROSTER, 1, -1)).toBe(1);
    expect(stepIndex(ROSTER, 2, -1)).toBe(1);

    const middleDisabled: readonly ListboxOption[] = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta", disabled: true },
      { value: "c", label: "Gamma" },
    ];
    expect(stepIndex(middleDisabled, 0, 1)).toBe(2);
    expect(stepIndex(middleDisabled, 2, -1)).toBe(0);
  });
});

describe("edgeIndex", () => {
  it("finds the first and last option a person can actually choose", () => {
    expect(edgeIndex(LANGUAGES, 1)).toBe(0);
    expect(edgeIndex(LANGUAGES, -1)).toBe(9);
    // Home must not land on the sentinel, which is the one row that cannot be committed.
    expect(edgeIndex(ROSTER, 1)).toBe(1);
    expect(edgeIndex(ROSTER, -1)).toBe(3);
  });

  it("answers -1 when nothing is selectable", () => {
    expect(edgeIndex([{ value: "a", label: "Alpha", disabled: true }], 1)).toBe(-1);
    expect(edgeIndex([], 1)).toBe(-1);
  });
});

describe("pageIndex", () => {
  it("moves ten enabled options and clamps rather than wrapping", () => {
    const twentyFive: readonly ListboxOption[] = Array.from({ length: 25 }, (_, i) => ({
      value: `v${String(i)}`,
      label: `Row ${String(i)}`,
    }));

    expect(pageIndex(twentyFive, 0, 1)).toBe(10);
    expect(pageIndex(twentyFive, 10, 1)).toBe(20);
    expect(pageIndex(twentyFive, 20, 1)).toBe(24);
    expect(pageIndex(twentyFive, 24, -1)).toBe(14);
    expect(pageIndex(twentyFive, 3, -1)).toBe(0);
  });

  it("stops at the ends of a list shorter than a page", () => {
    expect(pageIndex(LANGUAGES, 0, 1)).toBe(9);
    expect(pageIndex(LANGUAGES, 9, -1)).toBe(0);
  });
});

describe("typeAheadIndex", () => {
  it("matches a case-insensitive prefix of the label", () => {
    expect(typeAheadIndex(LANGUAGES, "go", 0)).toBe(9);
    expect(typeAheadIndex(LANGUAGES, "GO", 0)).toBe(9);
    expect(typeAheadIndex(LANGUAGES, "javascript", 0)).toBe(8);
  });

  it("matches the label, not the enum id", () => {
    // A student types what they can see. `JS_NODE22` and `GO_123` are on nobody's screen, and a
    // search that fell back to the value would answer for strings that appear nowhere in the UI.
    expect(typeAheadIndex(LANGUAGES, "js", 0)).toBe(-1);
    expect(typeAheadIndex(LANGUAGES, "javascript", 0)).toBe(8);
    expect(typeAheadIndex(LANGUAGES, "go 1", 0)).toBe(9);
    expect(typeAheadIndex(LANGUAGES, "go_1", 0)).toBe(-1);
  });

  it("cycles through the options sharing an initial when one key is repeated", () => {
    // Java 8, 11, 17, 21 are indices 1..4 and every one of them starts with J, as does
    // JavaScript at 8. Holding J walks them in order and comes back round.
    expect(typeAheadIndex(LANGUAGES, "j", 0)).toBe(1);
    expect(typeAheadIndex(LANGUAGES, "jj", 1)).toBe(2);
    expect(typeAheadIndex(LANGUAGES, "jjj", 2)).toBe(3);
    expect(typeAheadIndex(LANGUAGES, "jjjj", 4)).toBe(8);
    expect(typeAheadIndex(LANGUAGES, "jjjjj", 8)).toBe(1);
  });

  it("keeps a multi-character buffer on the option it already matched", () => {
    // Typing "java 1" must not walk off "Java 11" onto "Java 17" simply because the search
    // started one past the cursor. The search is inclusive once the buffer is a real word.
    expect(typeAheadIndex(LANGUAGES, "java 1", 2)).toBe(2);
    expect(typeAheadIndex(LANGUAGES, "java 17", 2)).toBe(3);
  });

  it("never lands on a disabled option", () => {
    expect(typeAheadIndex(ROSTER, "c", 3)).toBe(-1);
    expect(typeAheadIndex(ROSTER, "a", 0)).toBe(2);
  });

  it("answers -1 on an empty buffer or an empty list", () => {
    expect(typeAheadIndex(LANGUAGES, "", 0)).toBe(-1);
    expect(typeAheadIndex([], "g", 0)).toBe(-1);
    expect(typeAheadIndex(LANGUAGES, "zzz", 0)).toBe(-1);
  });
});
