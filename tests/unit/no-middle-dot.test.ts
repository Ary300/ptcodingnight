import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { blankComments, IMPORT_LINE, sourceFiles } from "./helpers/source-scan";

/**
 * The middle dot guard.
 *
 * A walkthrough of the live site found "Easy · 100 pts" on the problem lists and the same dot
 * between every fact on /submissions. The organizers asked for the middle dot to be gone from
 * everything a student or the projector shows. Items are separated by layout gaps or by plain
 * wording instead. Same scanner and same comment exemption as the em dash guard, for the same
 * reasons: copy is added on every screen, and a one-off sweep decays.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCANNED_DIRS = ["app", "components"] as const;

/** The literal, its HTML entities, and the JS escape, which all render as U+00B7. */
const FORMS = ["·", "&middot;", "&#183;", "&#xB7;", "&#xb7;", "\\u00B7", "\\u00b7"] as const;

function scan(file: string): readonly string[] {
  const source = readFileSync(file, "utf8");
  const original = source.split("\n");
  return blankComments(source)
    .split("\n")
    .flatMap((line, offset) => {
      if (IMPORT_LINE.test(line)) return [];
      if (!FORMS.some((form) => line.includes(form))) return [];
      const where = relative(ROOT, file).split(sep).join("/");
      return [`${where}:${String(offset + 1)}  ${original[offset]?.trim() ?? ""}`];
    });
}

describe("no middle dot in user-visible copy", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));

  it("finds source to scan", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no U+00B7, in any spelling, outside comments under app/ and components/", () => {
    const report = files.flatMap(scan).join("\n");
    expect(
      report,
      `Middle dot in text a student or the projector can read. Separate the items with layout\n(a flex gap) or plain wording instead:\n\n${report}\n`,
    ).toBe("");
  });

  it("would catch the entity form the problem list used", () => {
    expect(blankComments(`<span aria-hidden="true">&#183;</span>`)).toContain("&#183;");
  });

  it("ignores a middle dot in a comment", () => {
    expect(blankComments(`const a = 1; // Easy · 100 pts`)).not.toContain("·");
  });
});
