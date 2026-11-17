import { describe, expect, it } from "vitest";

import {
  mergeStatementExamples,
  sameSampleText,
  statementExamples,
  statementWithoutConstraints,
  statementWithoutRepeatedTitle,
} from "./statement";

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

/**
 * The organizers asked for one Examples section instead of a statement "Example" and a separate
 * "Samples" list. The statement's examples fold into the samples only when every one of them is
 * a sample, matched by its data and never by position, so nothing the author wrote is ever lost.
 */
const TWO_EXAMPLES = [
  "Add two numbers.",
  "",
  "## Example",
  "",
  "**Example 1**",
  "",
  "Input:",
  "```",
  "35 48",
  "```",
  "Output:",
  "```",
  "83",
  "```",
  "",
  "The tables earned $35 + 48 = 83$.",
  "",
  "**Example 2**",
  "",
  "Input:",
  "```",
  "120 -15",
  "```",
  "Output:",
  "```",
  "105",
  "```",
  "",
  "A loss counts too.",
  "",
  "## Notes",
  "",
  "Read carefully.",
  "",
].join("\n");

const TWO_SAMPLES = [
  { ordinal: 1, input: "35 48\n", expectedOutput: "83\n" },
  { ordinal: 2, input: "120 -15\n", expectedOutput: "105\n" },
];

describe("statementExamples", () => {
  it("reads each Example N as input, output and the prose after it", () => {
    expect(statementExamples(TWO_EXAMPLES)).toEqual([
      { input: "35 48", output: "83", explanation: "The tables earned $35 + 48 = 83$." },
      { input: "120 -15", output: "105", explanation: "A loss counts too." },
    ]);
  });

  it("reads examples labelled 'Sample N input:' with no Example markers between them", () => {
    const md = [
      "## Example",
      "Sample 1 input:",
      "```",
      "1",
      "```",
      "Sample 1 output:",
      "```",
      "2",
      "```",
      "Why one.",
      "Sample 2 input:",
      "```",
      "3",
      "```",
      "**Output**",
      "```",
      "4",
      "```",
    ].join("\n");
    expect(statementExamples(md)).toEqual([
      { input: "1", output: "2", explanation: "Why one." },
      { input: "3", output: "4", explanation: "" },
    ]);
  });

  it("does not read a section with prose before its first input", () => {
    const md = "## Example\n\nHere is a case.\n\n```\n1\n```\n```\n2\n```\n";
    expect(statementExamples(md)).toBeNull();
  });

  it("does not read an input that has no output block, the A Very Big Sum shape", () => {
    const md = "## Example\n\n```\n1\n```\n```\n2\n```\n\nA second one:\n\n```\n3\n```\n\noutputs `4`.\n";
    expect(statementExamples(md)).toBeNull();
  });

  it("ignores a heading-like line inside a code block", () => {
    const md = "## Example\n\n```\n## Notes\n```\n```\n1\n```\n";
    expect(statementExamples(md)).toEqual([{ input: "## Notes", output: "1", explanation: "" }]);
  });

  it("reports no examples for a statement without an Example section", () => {
    expect(statementExamples("Just prose.\n\n## Output\n\nA number.")).toEqual([]);
  });
});

describe("sameSampleText", () => {
  it("ignores trailing newlines, trailing spaces and CRLF, which a code block cannot carry", () => {
    expect(sameSampleText("1 2\r\n3 \n\n", "1 2\n3")).toBe(true);
  });

  it("does not ignore anything else", () => {
    expect(sameSampleText("1  2", "1 2")).toBe(false);
    expect(sameSampleText(" 1", "1")).toBe(false);
  });
});

describe("mergeStatementExamples", () => {
  it("removes the statement's Example section and keeps every explanation by sample", () => {
    const merged = mergeStatementExamples(TWO_EXAMPLES, TWO_SAMPLES);
    expect(merged.merged).toBe(true);
    expect(merged.statementMd).not.toContain("## Example");
    expect(merged.statementMd).not.toContain("35 48");
    expect(merged.statementMd).toContain("Add two numbers.");
    expect(merged.statementMd).toContain("## Notes");
    expect(merged.explanations).toEqual({
      1: "The tables earned $35 + 48 = 83$.",
      2: "A loss counts too.",
    });
  });

  it("matches by data, not position, when the samples are in another order", () => {
    const reversed = [
      { ordinal: 1, input: "120 -15\n", expectedOutput: "105\n" },
      { ordinal: 2, input: "35 48\n", expectedOutput: "83\n" },
    ];
    expect(mergeStatementExamples(TWO_EXAMPLES, reversed).explanations).toEqual({
      1: "A loss counts too.",
      2: "The tables earned $35 + 48 = 83$.",
    });
  });

  it("merges when the samples outnumber the examples, and the extra sample has no explanation", () => {
    const three = [...TWO_SAMPLES, { ordinal: 3, input: "1 1\n", expectedOutput: "2\n" }];
    const merged = mergeStatementExamples(TWO_EXAMPLES, three);
    expect(merged.merged).toBe(true);
    expect(merged.explanations[3]).toBeUndefined();
  });

  it("keeps the statement untouched when one example is not a sample", () => {
    const merged = mergeStatementExamples(TWO_EXAMPLES, [TWO_SAMPLES[0]!]);
    expect(merged).toEqual({ statementMd: TWO_EXAMPLES, explanations: {}, merged: false });
  });

  it("keeps the statement untouched when an output differs, even with the same input", () => {
    const wrong = [TWO_SAMPLES[0]!, { ordinal: 2, input: "120 -15\n", expectedOutput: "106\n" }];
    expect(mergeStatementExamples(TWO_EXAMPLES, wrong).merged).toBe(false);
  });

  it("uses each sample once, so two identical examples need two identical samples", () => {
    const md = "## Example\n\n```\n1\n```\n```\n2\n```\n\n```\n1\n```\n```\n2\n```\n";
    const one = [{ ordinal: 1, input: "1", expectedOutput: "2" }];
    expect(mergeStatementExamples(md, one).merged).toBe(false);
  });

  it("keeps the statement untouched when its examples cannot be read", () => {
    const md = "## Example\n\nSee below.\n\n```\n1\n```\n```\n2\n```\n";
    const merged = mergeStatementExamples(md, [{ ordinal: 1, input: "1", expectedOutput: "2" }]);
    expect(merged.statementMd).toBe(md);
    expect(merged.merged).toBe(false);
  });

  it("changes nothing for a statement with no Example section", () => {
    const md = "Prose only.\n";
    expect(mergeStatementExamples(md, TWO_SAMPLES)).toEqual({
      statementMd: md,
      explanations: {},
      merged: false,
    });
  });
});
