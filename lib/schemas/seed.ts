import { z } from "zod";

/**
 * Parser for data/problems_seed.csv — a trust boundary like any other file we did not
 * generate.
 *
 * The file imports TITLES AND HISTORY ONLY. It never carries a problem statement, an
 * editorial, or test data, and nothing downstream may invent one from it (docs/PRD.md §8).
 */

export const SeedTypeSchema = z.enum(["algorithm", "codingbat", "group"]);
export type SeedType = z.infer<typeof SeedTypeSchema>;

export const SeedPastStatusSchema = z.enum([
  "hint-currency",
  "used-in-contest",
  "solved-in-past",
  "candidate-unused",
  "used-but-zero-points",
  "group-problem",
  "partially-solved-in-past",
]);
export type SeedPastStatus = z.infer<typeof SeedPastStatusSchema>;

const emptyToNull = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s.length === 0 ? null : s));

export const SeedRowSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  type: SeedTypeSchema,
  past_status: SeedPastStatusSchema,
  division: emptyToNull.pipe(z.enum(["Intermediate", "Advanced"]).nullable()),
  difficulty: emptyToNull.pipe(z.enum(["E", "M", "H"]).nullable()),
  notes: emptyToNull,
});
export type SeedRow = z.infer<typeof SeedRowSchema>;

/**
 * Language of a CodingBat warmup, read from the notes column ("Python; ..." / "Java; ...").
 * Warmups exist per language, so this participates in the dedup key.
 */
export function warmupLanguage(row: SeedRow): "PYTHON_312" | "JAVA_21" | null {
  if (row.type !== "codingbat") return null;
  const notes = row.notes ?? "";
  if (notes.includes("Python")) return "PYTHON_312";
  if (notes.includes("Java")) return "JAVA_21";
  return null;
}

/**
 * The dedup key. 136 rows collapse to 125 distinct problems.
 *
 * CodingBat warmups key on `(title, language)` because `sum67` is a real exercise in BOTH
 * Python and Java; keying on title alone silently merges two genuine warmups into one and
 * quietly shrinks the hint economy. Everything else keys on title, so a problem used in
 * both divisions at different difficulties is one Problem with two ContestProblem rows.
 *
 * See docs/DECISIONS.md D6 and docs/PRD.md §16.1.
 */
export function dedupKey(row: SeedRow): string {
  const title = row.title.trim().replace(/\s+/g, " ").toLowerCase();
  const lang = warmupLanguage(row);
  return lang === null ? title : `${title}::${lang.toLowerCase()}`;
}

/** URL-safe slug derived from the dedup key, used as `Problem.slug`. */
export function slugFor(row: SeedRow): string {
  return dedupKey(row)
    .replace(/::/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Parse every row, collecting all failures rather than stopping at the first — a seed file
 * with three bad rows should report three problems, not one at a time.
 */
export function parseSeedRows(rows: readonly unknown[]): SeedRow[] {
  const parsed: SeedRow[] = [];
  const errors: string[] = [];

  rows.forEach((raw, i) => {
    const result = SeedRowSchema.safeParse(raw);
    if (result.success) {
      parsed.push(result.data);
      return;
    }
    for (const issue of result.error.issues) {
      // +2: one for the header line, one for 1-based line numbers.
      errors.push(`  line ${i + 2}, ${issue.path.join(".") || "(row)"}: ${issue.message}`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`data/problems_seed.csv failed validation:\n${errors.join("\n")}`);
  }
  return parsed;
}
