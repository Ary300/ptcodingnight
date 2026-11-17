import { describe, expect, it } from "vitest";

import { applyCompletion, completionContext, completionsFor } from "@/components/contest/editor/smart/completion";
import { JAVA } from "@/components/contest/editor/smart/java";
import { PYTHON } from "@/components/contest/editor/smart/python";
import type { CompletionItem, Edit, LanguageProfile } from "@/components/contest/editor/smart/types";

/**
 * IntelliJ's postfix templates in the completion list after `expr.`, marked as postfix rows, and
 * accepting one expands it over the expression exactly as `x.sout` + Tab does.
 */

function items(text: string, profile: LanguageProfile): readonly CompletionItem[] {
  const ctx = completionContext(text, text.length, profile.lineComment);
  return ctx === null ? [] : completionsFor(ctx, text, profile);
}

function accept(text: string, label: string, profile: LanguageProfile): { readonly text: string; readonly edit: Edit } {
  const ctx = completionContext(text, text.length, profile.lineComment);
  if (ctx === null) throw new Error("no completion context");
  const item = completionsFor(ctx, text, profile, 50).find((candidate) => candidate.label === label);
  if (item === undefined) throw new Error(`${label} is not offered`);
  const edit = applyCompletion({ text, selectionStart: text.length, selectionEnd: text.length }, ctx, item, profile);
  return { text: text.slice(0, edit.from) + edit.insert + text.slice(edit.to), edit };
}

const BODY = "class Main {\n    void f(int x) {\n        ";

describe("postfix rows after `expr.`", () => {
  it("lists .sout, .if and .fori after `x.`, marked as postfix templates", () => {
    const rows = items(`${BODY}x.`, JAVA);
    const postfix = rows.filter((row) => row.kind === "postfix").map((row) => row.label);
    expect(postfix).toEqual(expect.arrayContaining(["sout", "if", "fori"]));
    expect(rows.find((row) => row.label === "sout")?.detail).toBe("Prints the expression");
  });

  it("filters them by what is typed after the dot", () => {
    const rows = items(`${BODY}x.so`, JAVA).filter((row) => row.kind === "postfix");
    expect(rows.map((row) => row.label)).toContain("sout");
    expect(rows.every((row) => row.label.startsWith("so"))).toBe(true);
  });

  it("offers none after a number, inside a string, or in an import", () => {
    expect(items(`${BODY}3.`, JAVA).filter((row) => row.kind === "postfix")).toEqual([]);
    expect(items(`${BODY}String s = "x.`, JAVA).filter((row) => row.kind === "postfix")).toEqual([]);
    expect(items("import java.", JAVA).filter((row) => row.kind === "postfix")).toEqual([]);
  });
});

describe("accepting a postfix row", () => {
  it("turns x.so + sout into System.out.println(x);", () => {
    const { text, edit } = accept(`${BODY}x.so`, "sout", JAVA);
    expect(text).toBe(`${BODY}System.out.println(x);`);
    expect(edit.selectionStart).toBe(text.length);
  });

  it("turns n.fori into a loop up to n, with the caret in the body", () => {
    const { text } = accept(`${BODY}x.`, "fori", JAVA);
    expect(text).toBe(`${BODY}for (int i = 0; i < x; i++) {\n            \n        }`);
  });

  it("works in Python too", () => {
    const rows = items("n = 3\nn.", PYTHON).filter((row) => row.kind === "postfix");
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0];
    if (first === undefined) return;
    const { text } = accept("n = 3\nn.", first.label, PYTHON);
    expect(text.startsWith("n = 3\n")).toBe(true);
    expect(text).not.toContain(`n.${first.label}`);
  });
});
