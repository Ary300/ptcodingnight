import { describe, expect, it } from "vitest";

import { buildDiffSnippet, buildErrorSnippet } from "@/lib/judge/diff";
import { DIFF_SNIPPET_MAX_CHARS } from "@/lib/schemas/judge";

describe("buildDiffSnippet", () => {
  it("returns nothing at all for a hidden test", () => {
    // The rule students would exploit first. Not a truncated value, not a length, not an
    // index — each of those is an oracle that can be queried until the case is rebuilt.
    expect(buildDiffSnippet("999", "42", false)).toBeNull();
  });

  it("never lets the expected output appear for a hidden test", () => {
    const secret = "SUPER_SECRET_EXPECTED_VALUE";
    const snippet = buildDiffSnippet("wrong", secret, false);

    expect(snippet).toBeNull();
    expect(JSON.stringify(snippet)).not.toContain(secret);
  });

  it("shows a full diff for a sample test", () => {
    const snippet = buildDiffSnippet("6", "5", true);

    expect(snippet).toContain("expected: 5");
    expect(snippet).toContain("actual:   6");
  });

  it("names the first differing line", () => {
    const snippet = buildDiffSnippet("1\n9\n3", "1\n2\n3", true);
    expect(snippet).toContain("line 2");
  });

  it("caps even a sample diff so a huge output cannot reach the database", () => {
    const snippet = buildDiffSnippet("x".repeat(50_000), "y".repeat(50_000), true);

    expect(snippet).not.toBeNull();
    expect(snippet?.length).toBeLessThanOrEqual(DIFF_SNIPPET_MAX_CHARS);
  });

  it("marks a truncated snippet so it is not mistaken for the whole output", () => {
    const snippet = buildDiffSnippet("x".repeat(50_000), "y".repeat(50_000), true);
    expect(snippet?.endsWith("…")).toBe(true);
  });
});

describe("buildErrorSnippet", () => {
  it("caps stderr", () => {
    const snippet = buildErrorSnippet("boom\n".repeat(10_000));
    expect(snippet.length).toBeLessThanOrEqual(DIFF_SNIPPET_MAX_CHARS);
  });

  it("passes a short stderr through, trimmed", () => {
    expect(buildErrorSnippet("  NullPointerException\n ")).toBe("NullPointerException");
  });
});
