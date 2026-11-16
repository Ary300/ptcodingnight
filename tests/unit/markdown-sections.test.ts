import { describe, expect, it } from "vitest";

import {
  collapseSections,
  isExampleHeading,
  parseMarkdown,
  type SectionedBlock,
} from "@/components/contest/markdown/parse";

function shape(blocks: readonly SectionedBlock[]): string[] {
  return blocks.map((block) => {
    if (block.kind === "section") return `section(${String(block.body.length)})`;
    return block.kind;
  });
}

describe("collapseSections with isExampleHeading", () => {
  it("folds an Example section through to the end of the statement", () => {
    const md = "Intro.\n\n## Input\n\nOne line.\n\n## Example\n\nInput:\n\n```\n5\n```\n\nThat is all.";
    const out = collapseSections(parseMarkdown(md), isExampleHeading);
    expect(shape(out)).toEqual(["paragraph", "heading", "paragraph", "section(3)"]);
  });

  it("stops a section at the next heading of the same rank", () => {
    const md = "## Example 1\n\nfirst\n\n## Example 2\n\nsecond\n\n## Notes\n\nafter";
    const out = collapseSections(parseMarkdown(md), isExampleHeading);
    expect(shape(out)).toEqual(["section(1)", "section(1)", "heading", "paragraph"]);
  });

  it("keeps a lower-rank heading inside the section it belongs to", () => {
    const md = "## Example\n\n### Explanation\n\nwhy\n\n## Output\n\nprint";
    const out = collapseSections(parseMarkdown(md), isExampleHeading);
    expect(shape(out)).toEqual(["section(2)", "heading", "paragraph"]);
  });

  it("folds each inner example rather than the Examples wrapper", () => {
    const md = "## Examples\n\n### Example 1\n\na\n\n### Example 2\n\nb";
    const out = collapseSections(parseMarkdown(md), isExampleHeading);
    expect(shape(out)).toEqual(["heading", "section(1)", "section(1)"]);
  });

  it("leaves a statement with no example untouched", () => {
    const blocks = parseMarkdown("## Input\n\nn\n\n## Output\n\nm");
    expect(collapseSections(blocks, isExampleHeading)).toEqual(blocks);
  });

  it("matches the heading by its words, not a substring", () => {
    const [heading] = parseMarkdown("## Counterexample");
    expect(heading !== undefined && isExampleHeading(heading)).toBe(false);
    const [second] = parseMarkdown("## **Example 2:**");
    expect(second !== undefined && isExampleHeading(second)).toBe(true);
  });
});
