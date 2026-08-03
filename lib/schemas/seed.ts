import { z } from "zod";

import { ComparatorSchema, LanguageSchema } from "@/lib/schemas/judge";

/**
 * Parsers for the two files that seed the problem bank, both of them trust boundaries:
 * `data/problems_seed.csv` (titles and history) and `content/problems/<slug>/problem.json`
 * (an authored problem's manifest).
 *
 * The CSV imports TITLES AND HISTORY ONLY. It never carries a problem statement, an
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

/**
 * Version-free slug token for a warmup's language.
 *
 * Deliberately NOT the registry's `LanguageId`. A slug is a URL and a database key, so it must
 * not change when a runtime is upgraded — deriving it from `PYTHON_312` would give
 * `sum67-python-312` and turn a bump to Python 3.13 into a slug migration that orphans every
 * warmup row and every bookmarked link. The language matters to the slug; the point release
 * does not.
 */
const SLUG_LANGUAGE_TOKEN: Readonly<Record<"PYTHON_312" | "JAVA_21", string>> = {
  PYTHON_312: "python",
  JAVA_21: "java",
};

/** URL-safe slug, used as `Problem.slug`. */
export function slugFor(row: SeedRow): string {
  const title = row.title
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const language = warmupLanguage(row);
  return language === null ? title : `${title}-${SLUG_LANGUAGE_TOKEN[language]}`;
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

/* ------------------------------------------------------------------------- */
/* Function signatures — the starter-code declaration                        */
/* ------------------------------------------------------------------------- */

/**
 * The closed type vocabulary a signature may name.
 *
 * Six and no more. Every authored problem reads a flat whitespace-delimited token stream and
 * every one of them fits this. `double`, `bool`, 2-D arrays and structs are absent because no
 * problem needs them, and adding a type speculatively turns six string builders into a type
 * system nobody asked for.
 *
 * This is the validator of record for the six emitters in `lib/judge/starters/`. Each of them
 * re-states this shape structurally rather than importing it, so that an emitter stays a pure
 * function of plain data; TypeScript's structural typing makes the two interchangeable, and
 * `lib/judge/starters/index.ts` fails to compile if they ever stop being.
 */
export const SignatureTypeSchema = z.enum([
  "int",
  "long",
  "string",
  "int[]",
  "long[]",
  "string[]",
]);
export type SignatureType = z.infer<typeof SignatureTypeSchema>;

/**
 * The identifier shape every declared name must match: lowercase first letter, then letters and
 * digits only.
 *
 * **The absence of `_` is load-bearing, not stylistic.** Every generated harness names its own
 * locals with an underscore in them (`_i`, `_case`, `next_token`, and C's injected
 * `<name>_count`), so a declared name can never collide with one — by construction, rather than
 * by a deny-list somebody has to remember to extend. See the file comment in
 * `lib/judge/starters/c.ts`.
 */
const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

const IDENTIFIER_MESSAGE =
  "must start with a lowercase letter and contain only letters and digits (no underscores: " +
  "the generated harness reserves those for its own locals)";

/**
 * Words that are a keyword, a predeclared identifier, or a name the harness itself uses, in at
 * least one of the six target languages.
 *
 * A declared name that lands on one of these does not produce a bad starter, it produces a
 * starter that **does not compile** — verdict CE on a file the student has not touched, which is
 * the single worst thing this feature can ship. The list is the union across all six languages
 * on purpose: a signature is written once and emitted six times, so a name only safe in Python
 * is not safe.
 *
 * Only words that can actually match IDENTIFIER are listed. `_Bool`, `NULL` and friends cannot.
 */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  // Python keywords, plus the builtins the generated harness itself calls.
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
  "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is",
  "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with",
  "yield", "int", "len", "print", "range", "str", "sys", "main",
  // Java.
  "abstract", "boolean", "byte", "case", "catch", "char", "const", "default", "do", "double",
  "enum", "extends", "final", "float", "goto", "implements", "instanceof", "interface",
  "long", "native", "new", "package", "private", "protected", "public", "record", "short",
  "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "var", "void", "volatile",
  // C and C++.
  "auto", "extern", "inline", "operator", "register", "restrict", "signed", "sizeof",
  "struct", "template", "typedef", "typename", "union", "unsigned", "using", "namespace",
  "std", "string", "vector", "cin", "cout", "printf", "scanf", "malloc", "free", "true",
  "false", "bool", "delete",
  // JavaScript.
  "arguments", "console", "debugger", "eval", "export", "function", "let", "null", "process",
  "require", "typeof",
  // Go: keywords and predeclared identifiers.
  "any", "append", "cap", "chan", "clear", "close", "complex", "copy", "defer", "error",
  "fallthrough", "func", "go", "imag", "make", "map", "max", "min", "nil", "panic", "println",
  "real", "recover", "rune", "select", "type", "uint", "uintptr",
]);

function identifier(): z.ZodString {
  return z.string().regex(IDENTIFIER, IDENTIFIER_MESSAGE);
}

/** One field read off the token stream, and possibly handed to the student's function. */
export const SignatureFieldSchema = z.strictObject({
  name: identifier(),
  type: SignatureTypeSchema,
  /**
   * Element count. Required iff `type` is an array: either a positive integer literal, or the
   * name of an EARLIER `int` field.
   */
  length: z.union([z.number().int().positive(), identifier()]).optional(),
  /**
   * `false` means "read from stdin but do not pass to the function" — how a redundant leading
   * count stays out of the signature the student reads. Defaults to `true`.
   */
  passed: z.boolean().optional(),
});
export type SignatureField = z.infer<typeof SignatureFieldSchema>;

/** What the student's function hands back, and how the harness prints it. */
export const SignatureReturnSchema = z.strictObject({
  type: SignatureTypeSchema,
  /** Separator between the elements of one call's result. Required iff `type` is an array. */
  join: z.string().optional(),
});
export type SignatureReturn = z.infer<typeof SignatureReturnSchema>;

/**
 * A problem's whole function-signature declaration.
 *
 * `strictObject`, not the default strip: a misspelt key (`parms`) would otherwise be dropped
 * silently and surface as "params is required", which names the wrong field. A manifest is
 * hand-written, so the typo is the likely failure and it should say so.
 */
export const SignatureSchema = z
  .strictObject({
    /** The function the student completes. lowerCamelCase. */
    name: identifier(),
    returns: SignatureReturnSchema,
    /** Fields read ONCE, before the repeat loop. */
    shared: z.array(SignatureFieldSchema).optional(),
    /** Names an `int` field in `shared`; the params block is read and called that many times. */
    repeat: identifier().optional(),
    /** Fields read once PER CALL. */
    params: z.array(SignatureFieldSchema),
  })
  .superRefine(checkSignature);
export type Signature = z.infer<typeof SignatureSchema>;

function isArrayType(type: SignatureType): boolean {
  return type.endsWith("[]");
}

/**
 * The cross-field rules. Each one exists because breaking it produces a harness that compiles
 * and then misreads the input, which reaches the student as WA on correct code.
 */
function checkSignature(
  signature: {
    name: string;
    returns: SignatureReturn;
    shared?: SignatureField[] | undefined;
    repeat?: string | undefined;
    params: SignatureField[];
  },
  ctx: z.RefinementCtx,
): void {
  const shared = signature.shared ?? [];
  const fail = (message: string, path: (string | number)[]): void => {
    ctx.addIssue({ code: "custom", message, path });
  };

  if (RESERVED_NAMES.has(signature.name)) {
    fail(`"${signature.name}" is a reserved word in one of the six target languages`, ["name"]);
  }

  // A name may repeat neither within a block nor across them: the harness binds every field to
  // one local in one scope, so a duplicate is a redeclaration and the file does not compile.
  const seen = new Map<string, "shared" | "params">();
  const declare = (field: SignatureField, block: "shared" | "params", index: number): void => {
    if (RESERVED_NAMES.has(field.name)) {
      fail(`"${field.name}" is a reserved word in one of the six target languages`, [
        block,
        index,
        "name",
      ]);
    }
    if (field.name === signature.name) {
      fail(`field "${field.name}" has the same name as the function`, [block, index, "name"]);
    }
    const previous = seen.get(field.name);
    if (previous !== undefined) {
      fail(`field "${field.name}" is already declared in ${previous}`, [block, index, "name"]);
    }
    seen.set(field.name, block);
  };

  /**
   * A `length` may only name a field the harness has ALREADY read, and only an `int`.
   *
   * Forward references are the interesting half. `int[] a` with `length: "n"` where `n` is read
   * afterwards emits a loop bound over an uninitialised local: C reads garbage, Java does not
   * compile, and Python raises NameError. Requiring the reference to be earlier makes the whole
   * class impossible.
   */
  const intsSoFar = new Set<string>();
  const checkField = (field: SignatureField, block: "shared" | "params", index: number): void => {
    const path = (leaf: string): (string | number)[] => [block, index, leaf];

    if (isArrayType(field.type)) {
      if (field.length === undefined) {
        fail(`array field "${field.name}" needs a length`, path("length"));
      } else if (typeof field.length === "string" && !intsSoFar.has(field.length)) {
        fail(
          `length "${field.length}" of "${field.name}" must name an int field read earlier`,
          path("length"),
        );
      }
    } else if (field.length !== undefined) {
      fail(`"${field.name}" is not an array, so it must not declare a length`, path("length"));
    }

    if (field.type === "int") intsSoFar.add(field.name);
  };

  shared.forEach((field, index) => {
    declare(field, "shared", index);
    checkField(field, "shared", index);
  });
  signature.params.forEach((field, index) => {
    declare(field, "params", index);
    checkField(field, "params", index);
  });

  if (isArrayType(signature.returns.type)) {
    if (signature.returns.join === undefined) {
      fail("an array return needs a join separator", ["returns", "join"]);
    }
  } else if (signature.returns.join !== undefined) {
    fail("only an array return may declare a join separator", ["returns", "join"]);
  }

  /**
   * `repeat` must name an int in `shared` specifically.
   *
   * A count read inside the loop it bounds is read again on every iteration, so the loop reads
   * the wrong tokens from the second call onwards — and the first call succeeds, which is what
   * makes it hard to spot in a sample.
   */
  if (signature.repeat !== undefined) {
    const bound = shared.find((field) => field.name === signature.repeat);
    if (bound === undefined) {
      fail(`repeat "${signature.repeat}" must name a field in shared`, ["repeat"]);
    } else if (bound.type !== "int") {
      fail(`repeat "${signature.repeat}" names a ${bound.type} field; it must be an int`, [
        "repeat",
      ]);
    }
  }
}

/* ------------------------------------------------------------------------- */
/* content/problems/<slug>/problem.json                                      */
/* ------------------------------------------------------------------------- */

/**
 * An authored problem's manifest.
 *
 * Parsed rather than cast. Both readers (`scripts/seed-demo.ts` and G13's
 * `scripts/verify-problem-content.ts`) used `JSON.parse(...) as ProblemManifest`, which accepts
 * anything: a mistyped `timeLimtMs` became `undefined`, took a default, and shipped a problem
 * with a time limit nobody chose. A manifest is hand-edited, so it is exactly the kind of file
 * that has to be validated at the boundary.
 */
export const ProblemManifestSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase, hyphen-separated slug"),
  title: z.string().trim().min(1),
  difficulty: z.enum(["E", "M", "H"]),
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  allowedLanguages: z.array(LanguageSchema).min(1),
  comparator: ComparatorSchema,
  sampleCount: z.number().int().nonnegative(),
  originAttribution: z.string().optional(),
  /**
   * OPTIONAL, and that is the whole design of the starter-code feature.
   *
   * A problem without a signature keeps working exactly as it did: the student gets an empty
   * editor and writes a raw stdin-to-stdout program, which is what every problem was before
   * this field existed. A problem WITH one additionally gets a pre-filled, compilable harness
   * in each of its allowed languages. Nothing about judging, scoring or submission changes
   * either way — the student still submits one whole file.
   */
  signature: SignatureSchema.optional(),
  /**
   * A try-the-site question that lives only in the practice arena. The seed importer writes it
   * to `Problem.practiceOnly`, and the contest line-up API refuses such problems - practice
   * questions are public all year, so a scored round may not contain one.
   */
  practiceOnly: z.boolean().optional(),
});
export type ProblemManifest = z.infer<typeof ProblemManifestSchema>;

/** Parse a manifest, reporting the file and every failing field rather than the first. */
export function parseProblemManifest(source: unknown, where: string): ProblemManifest {
  const result = ProblemManifestSchema.safeParse(source);
  if (result.success) return result.data;

  const lines = result.error.issues.map(
    (issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
  throw new Error(`${where} failed validation:\n${lines.join("\n")}`);
}
