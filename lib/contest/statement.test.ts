import { describe, expect, it } from "vitest";

import { statementWithoutRepeatedTitle } from "./statement";

/**
 * The rule is "drop the heading only when it is the SAME heading" — a blanket strip of the first
 * `#` would silently eat a statement's real opening section, and nobody would notice until a
 * student asked why the problem starts mid-sentence.
 */
describe("statementWithoutRepeatedTitle", () => {
  it("drops a leading H1 that repeats the title", () => {
    expect(statementWithoutRepeatedTitle("# A Very Big Sum\n\nThe team left…", "A Very Big Sum")).toBe(
      "The team left…",
    );
  });

  it("ignores case and surrounding whitespace, because authored files are not uniform", () => {
    expect(statementWithoutRepeatedTitle("\n\n#   a very big SUM  \n\nBody", "A Very Big Sum")).toBe(
      "Body",
    );
  });

  it("KEEPS a leading H1 that says something different", () => {
    const md = "# Background\n\nThe team left…";
    expect(statementWithoutRepeatedTitle(md, "A Very Big Sum")).toBe(md);
  });

  it("keeps a deeper heading even when it matches, because H2 is structure not a title", () => {
    const md = "## A Very Big Sum\n\nBody";
    expect(statementWithoutRepeatedTitle(md, "A Very Big Sum")).toBe(md);
  });

  it("leaves a statement with no heading alone", () => {
    expect(statementWithoutRepeatedTitle("Just prose.", "A Very Big Sum")).toBe("Just prose.");
  });

  it("does not strip a title that merely PREFIXES the heading", () => {
    // "A Very Big Sum, Revisited" is a different problem from "A Very Big Sum".
    const md = "# A Very Big Sum, Revisited\n\nBody";
    expect(statementWithoutRepeatedTitle(md, "A Very Big Sum")).toBe(md);
  });

  it("survives an empty statement rather than throwing on the missing first line", () => {
    expect(statementWithoutRepeatedTitle("", "A Very Big Sum")).toBe("");
  });
});
