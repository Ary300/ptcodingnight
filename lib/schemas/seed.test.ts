import { describe, expect, it } from "vitest";

import { dedupKey, parseSeedRows, slugFor, warmupLanguage, type SeedRow } from "@/lib/schemas/seed";

/**
 * These tests encode docs/DECISIONS.md D6. The dedup key is the one piece of seed logic
 * that is wrong in an invisible way: keying warmups on title alone still produces a
 * plausible-looking import, just with one fewer warmup than the organizers wrote.
 */

const row = (over: Partial<SeedRow> = {}): SeedRow => ({
  title: "Solve Me First",
  type: "algorithm",
  past_status: "solved-in-past",
  division: null,
  difficulty: null,
  notes: null,
  ...over,
});

describe("warmupLanguage", () => {
  it("reads the language from a CodingBat row's notes", () => {
    expect(warmupLanguage(row({ type: "codingbat", notes: "Python; 2 solved = 1 hint" }))).toBe(
      "PYTHON_312",
    );
    expect(warmupLanguage(row({ type: "codingbat", notes: "Java; 2 solved = 1 hint" }))).toBe(
      "JAVA_21",
    );
  });

  it("is null for non-warmups, even when the notes mention a language", () => {
    expect(warmupLanguage(row({ type: "algorithm", notes: "Java Primality test" }))).toBeNull();
  });
});

describe("dedupKey", () => {
  it("separates the Python and Java sum67 warmups", () => {
    const python = dedupKey(row({ title: "sum67", type: "codingbat", notes: "Python; x" }));
    const java = dedupKey(row({ title: "sum67", type: "codingbat", notes: "Java; x" }));

    expect(python).not.toBe(java);
  });

  it("collapses one problem used in two divisions at different difficulties", () => {
    const intermediate = dedupKey(row({ title: "Bill Division", division: "Intermediate", difficulty: "M" }));
    const advanced = dedupKey(row({ title: "Bill Division", division: "Advanced", difficulty: "E" }));

    expect(intermediate).toBe(advanced);
  });

  it("collapses the same title across solved-in-past and used-in-contest", () => {
    const solved = dedupKey(row({ title: "Encryption", past_status: "solved-in-past" }));
    const used = dedupKey(row({ title: "Encryption", past_status: "used-in-contest" }));

    expect(solved).toBe(used);
  });

  it("merges the group-round Fraudulent entry with its used-but-zero-points twin", () => {
    const group = dedupKey(row({ title: "Fraudulent Activity Notifications", type: "group" }));
    const algorithm = dedupKey(
      row({ title: "Fraudulent Activity Notifications", type: "algorithm" }),
    );

    expect(group).toBe(algorithm);
  });

  it("normalizes case and internal whitespace", () => {
    expect(dedupKey(row({ title: "  Magic   Square " }))).toBe(dedupKey(row({ title: "magic square" })));
  });
});

describe("slugFor", () => {
  it("produces a url-safe slug", () => {
    expect(slugFor(row({ title: "Larry's Array" }))).toBe("larry-s-array");
  });

  it("keeps the language in a warmup slug so both sum67 rows survive", () => {
    expect(slugFor(row({ title: "sum67", type: "codingbat", notes: "Python; x" }))).toBe(
      "sum67-python",
    );
    expect(slugFor(row({ title: "sum67", type: "codingbat", notes: "Java; x" }))).toBe("sum67-java");
  });

  it("keeps the runtime's version OUT of the slug", () => {
    // Regression. The language ids became PYTHON_312/JAVA_21 with the runtime registry, and
    // deriving the slug from them produced `sum67-python-312`. A slug is a URL and a database
    // key: bumping to Python 3.13 would then rename every warmup, orphaning its rows and every
    // bookmarked link. The language belongs in the slug; the point release does not.
    // A digits-free title, so what is asserted is the language suffix and not "sum67".
    expect(slugFor(row({ title: "Make Bricks", type: "codingbat", notes: "Python; x" }))).toBe(
      "make-bricks-python",
    );
    expect(slugFor(row({ title: "Make Bricks", type: "codingbat", notes: "Java; x" }))).toBe(
      "make-bricks-java",
    );
  });

  it("does not start or end with a separator", () => {
    const slug = slugFor(row({ title: "!!! sWAP cASE !!!" }));
    expect(slug.startsWith("-")).toBe(false);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("parseSeedRows", () => {
  const validRaw = {
    title: "Solve Me First",
    type: "algorithm",
    past_status: "solved-in-past",
    division: "",
    difficulty: "",
    notes: "",
  };

  it("turns empty optional columns into null", () => {
    const [parsed] = parseSeedRows([validRaw]);
    expect(parsed?.division).toBeNull();
    expect(parsed?.difficulty).toBeNull();
    expect(parsed?.notes).toBeNull();
  });

  it("rejects an unknown type rather than importing it", () => {
    expect(() => parseSeedRows([{ ...validRaw, type: "puzzle" }])).toThrow(/type/);
  });

  it("reports every bad row at once, not just the first", () => {
    let message = "";
    try {
      parseSeedRows([
        { ...validRaw, type: "puzzle" },
        { ...validRaw, past_status: "who-knows" },
      ]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/line 2/);
    expect(message).toMatch(/line 3/);
  });
});
