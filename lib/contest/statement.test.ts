import { describe, expect, it } from "vitest";

import { statementWithoutConstraints, statementWithoutRepeatedTitle } from "./statement";

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

/**
 * Students are not shown a Constraints section. The section runs from its heading to the next
 * heading of the same or higher rank; anything else in the statement is left byte-for-byte.
 */
describe("statementWithoutConstraints", () => {
  it("drops a Constraints section in the middle, up to the next heading", () => {
    const md = [
      "Intro.",
      "",
      "## Output",
      "",
      "One number.",
      "",
      "## Constraints",
      "",
      "- $1 \\le n \\le 10^5$",
      "",
      "## Example",
      "",
      "```",
      "5",
      "```",
      "",
    ].join("\n");
    expect(statementWithoutConstraints(md)).toBe(
      ["Intro.", "", "## Output", "", "One number.", "", "## Example", "", "```", "5", "```", ""].join("\n"),
    );
  });

  it("drops a Constraints section that is the last thing in the statement", () => {
    const md = "## Input\n\nOne line.\n\n## Constraints\n\n- $n \\le 10$\n- Every value is positive.\n";
    expect(statementWithoutConstraints(md)).toBe("## Input\n\nOne line.\n");
  });

  it("returns a statement without a Constraints section unchanged", () => {
    const md = "## Input\n\nOne line.\n\n## Output\n\nOne number.\n";
    expect(statementWithoutConstraints(md)).toBe(md);
    expect(statementWithoutConstraints("")).toBe("");
  });

  it("keeps a lower-rank heading inside the dropped section out too", () => {
    const md = "## Constraints\n\n### Subtask 1\n\n$n \\le 10$\n\n## Output\n\nA number.";
    expect(statementWithoutConstraints(md)).toBe("## Output\n\nA number.");
  });

  it("matches the heading in any case and with a colon or bold", () => {
    expect(statementWithoutConstraints("Body.\n\n### **constraints:**\n\nx\n")).toBe("Body.\n");
    expect(statementWithoutConstraints("Body.\n\n## CONSTRAINTS\n\nx\n")).toBe("Body.\n");
  });

  it("leaves a heading that only mentions constraints", () => {
    const md = "## Constraints and notes\n\nKeep this.\n";
    expect(statementWithoutConstraints(md)).toBe(md);
  });

  it("does not read a # line inside a code block as a heading", () => {
    const md = "## Constraints\n\n```\n## Example\n```\n\nstill constraints\n\n## Example\n\nshown";
    expect(statementWithoutConstraints(md)).toBe("## Example\n\nshown");
  });

  it("keeps blank lines inside the sections that remain", () => {
    const md = "## Example\n\n```\n1\n\n\n2\n```\n\n## Constraints\n\nx";
    expect(statementWithoutConstraints(md)).toBe("## Example\n\n```\n1\n\n\n2\n```");
  });

  it("strips the real a-very-big-sum statement's Constraints and nothing else", async () => {
    const { readFile } = await import("node:fs/promises");
    const md = await readFile("content/problems/a-very-big-sum/statement.md", "utf8");
    const out = statementWithoutConstraints(md);
    expect(out).not.toMatch(/constraints/i);
    expect(out).toContain("## Input");
    expect(out).toContain("## Output");
    expect(out).toContain("## Example");
    expect(out).toContain("25000000000");
  });
});
