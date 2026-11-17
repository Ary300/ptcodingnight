import { describe, expect, it } from "vitest";

import { editorShortcutGroups } from "@/components/contest/editor/commands/shortcuts";
import { profileFor } from "@/components/contest/editor/smart";
import { insertTemplateEdit, templateChoices } from "@/components/contest/editor/smart/insert-template";
import type { Edit, LanguageProfile } from "@/components/contest/editor/smart/types";

/**
 * Insert Live Template (Cmd+J / Ctrl+J): the list at the caret and the edit a choice performs.
 */

function java(): LanguageProfile {
  const profile = profileFor("JAVA_21");
  if (profile === null) throw new Error("no Java profile");
  return profile;
}

function apply(text: string, edit: Edit): string {
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}

const METHOD = "class Main {\n    void f() {\n        \n    }\n}";
const INSIDE = METHOD.indexOf("        \n") + 8;

describe("templateChoices", () => {
  it("lists the language's statement templates, with descriptions, on an empty line in a method", () => {
    const choices = templateChoices({ text: METHOD, selectionStart: INSIDE, selectionEnd: INSIDE }, java());
    const names = choices.templates.map((template) => template.abbreviation);
    expect(names).toContain("sout");
    expect(names).toContain("fori");
    expect(choices.templates.every((template) => template.description.length > 0)).toBe(true);
    expect(choices.from).toBe(INSIDE);
    expect(choices.to).toBe(INSIDE);
  });

  it("narrows to the templates the typed word begins, and replaces that word", () => {
    const text = METHOD.slice(0, INSIDE) + "so" + METHOD.slice(INSIDE);
    const caret = INSIDE + 2;
    const choices = templateChoices({ text, selectionStart: caret, selectionEnd: caret }, java());
    expect(choices.templates.length).toBeGreaterThan(0);
    expect(choices.templates.every((template) => template.abbreviation.startsWith("so"))).toBe(true);
    expect(choices.from).toBe(INSIDE);
    expect(choices.to).toBe(caret);
  });

  it("leaves out statement templates where a statement cannot start", () => {
    const text = "class Main {\n    void f() {\n        int x = ;\n    }\n}";
    const caret = text.indexOf("= ;") + 2;
    const choices = templateChoices({ text, selectionStart: caret, selectionEnd: caret }, java());
    expect(choices.templates.map((template) => template.abbreviation)).not.toContain("fori");
  });
});

describe("insertTemplateEdit", () => {
  it("inserts fori with its first field selected and the rest as Tab stops", () => {
    const profile = java();
    const choices = templateChoices({ text: METHOD, selectionStart: INSIDE, selectionEnd: INSIDE }, profile);
    const fori = choices.templates.find((template) => template.abbreviation === "fori");
    expect(fori).toBeDefined();
    if (fori === undefined) return;
    const edit = insertTemplateEdit(METHOD, choices, fori, profile);
    const after = apply(METHOD, edit);
    // The body's continuation lines take the method's indent, one level deeper inside the loop.
    expect(after.slice(INSIDE)).toMatch(/^for \(int i = 0; i < ; i\+\+\) \{\n {12}\n {8}\}/);
    // The caret starts on the loop variable, selected, and Tab moves on to the bound.
    expect(after.slice(edit.selectionStart, edit.selectionEnd)).toBe("i");
    expect(edit.tabStops?.length ?? 0).toBeGreaterThan(0);
  });

  it("replaces a typed prefix with sout and puts the caret inside the call", () => {
    const profile = java();
    const text = METHOD.slice(0, INSIDE) + "so" + METHOD.slice(INSIDE);
    const caret = INSIDE + 2;
    const choices = templateChoices({ text, selectionStart: caret, selectionEnd: caret }, profile);
    const sout = choices.templates.find((template) => template.abbreviation === "sout");
    if (sout === undefined) throw new Error("sout is not offered after 'so'");
    const edit = insertTemplateEdit(text, choices, sout, profile);
    const after = apply(text, edit);
    expect(after.slice(INSIDE, INSIDE + "System.out.println();".length)).toBe("System.out.println();");
    expect(edit.selectionStart).toBe(INSIDE + "System.out.println(".length);
  });
});

describe("the shortcuts popover", () => {
  function rows(isMac: boolean): readonly string[] {
    return editorShortcutGroups({ isMac, smart: true, templateExample: "sout" }).flatMap((group) =>
      group.rows.map((row) => `${row.keys.join(" ")}${row.or === undefined ? "" : ` | ${row.or.join(" ")}`} = ${row.action}`),
    );
  }

  it("lists Insert Live Template on Mod+J and Quick Documentation on F1 or Ctrl+Q", () => {
    expect(rows(true)).toContain("Cmd + J = Insert a live template from the list");
    expect(rows(true)).toContain("F1 = Quick documentation");
    expect(rows(false)).toContain("Ctrl + J = Insert a live template from the list");
    expect(rows(false)).toContain("Ctrl + Q | F1 = Quick documentation");
  });
});
