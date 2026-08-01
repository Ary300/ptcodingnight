/**
 * JavaScript starter emitter — the `main.js` half of the function-signature feature.
 *
 * Turns a problem's `signature` declaration into a COMPLETE, COMPILABLE program: the student's
 * stub at the top, and below it a visible stdin -> stdout harness that reads the problem's input,
 * calls the stub, and prints the answer. The student submits the whole file exactly as they
 * submit one today, so nothing in `worker/`, `lib/contest/submissions.ts` or the queue changes.
 *
 * Serves `VARIANTS.JAVASCRIPT_NODE22` (`sourceFile: "main.js"`), whose judge commands are:
 *
 *     compile:  node --check /work/main.js      (a parse, so a syntax error is CE and not RE)
 *     run:      exec node /work/main.js
 *
 * There is no `package.json` beside `/work/main.js`, so Node treats it as CommonJS and `require`
 * is available. Do not switch the harness to `import` — an ESM `main.js` fails at run time with
 * `Cannot use import statement outside a module`, and `node --check` parses it happily, so the
 * failure would surface as RE on every submission rather than as a build error anyone notices.
 *
 * PURE. No I/O, no Date.now(), no randomness — same rule as `lib/scoring/`. The starter is
 * recomputed from the declaration on every read rather than stored, so fixing a bug here fixes
 * every problem without a re-seed.
 */

/* ------------------------------------------------------------------------ */
/* The declaration vocabulary                                               */
/* ------------------------------------------------------------------------ */

/**
 * The closed set of declarable types (spec §1.1).
 *
 * Six, because a declaration was written for all 20 authored problems and none needs `double`,
 * `bool`, a 2-D array or a struct. Widening this is a language-design decision, not a local one.
 */
export type SignatureType = "int" | "long" | "string" | "int[]" | "long[]" | "string[]";

/** One field of the input stream: read in declaration order, optionally passed to the student. */
export interface SignatureField {
  /** `^[a-z][A-Za-z0-9]*$`. Becomes a JavaScript identifier verbatim. */
  readonly name: string;
  readonly type: SignatureType;
  /**
   * Element count, required iff `type` is an array. Either a positive integer literal or the
   * name of an EARLIER `int` field.
   */
  readonly length?: number | string;
  /**
   * `false` = read from stdin but NOT handed to the student's function.
   *
   * This is how a redundant leading count (`n` before `n` values) stays out of a signature that
   * would otherwise read `f(int n, int[] ar)` when `ar.length` already says it.
   */
  readonly passed?: boolean;
}

/** What the student's function hands back. `join` is required iff `type` is an array. */
export interface SignatureReturn {
  readonly type: SignatureType;
  /** Separator between the elements of ONE call's array result. */
  readonly join?: string;
}

/**
 * A problem's function-signature declaration.
 *
 * Structurally identical to `z.infer<typeof SignatureSchema>` from
 * `lib/schemas/problem-content.ts`, which is the validating source of truth and is owned
 * elsewhere. Declared here rather than imported so this emitter has no dependency to break
 * while the schema lands; TypeScript is structural, so the inferred type passes straight in.
 */
export interface Signature {
  /** Function name, lowerCamelCase. */
  readonly name: string;
  readonly returns: SignatureReturn;
  /** Read ONCE, before the repeat loop. Empty or absent when `repeat` is absent. */
  readonly shared?: readonly SignatureField[];
  /** Names an `int` field in `shared`. Absent means the function is called exactly once. */
  readonly repeat?: string;
  /** Read once PER CALL. */
  readonly params: readonly SignatureField[];
}

/* ------------------------------------------------------------------------ */
/* Type tables                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Doc-comment words, verbatim HackerRank vocabulary so a student who has used HackerRank reads
 * this without being told anything.
 */
const TYPE_WORD: Readonly<Record<SignatureType, string>> = {
  int: "INTEGER",
  long: "LONG_INTEGER",
  string: "STRING",
  "int[]": "INTEGER_ARRAY",
  "long[]": "LONG_INTEGER_ARRAY",
  "string[]": "STRING_ARRAY",
};

/**
 * The value the stub returns before the student writes anything.
 *
 * `long` is `0n` and not `0`, and that is not cosmetic. `long` maps to BigInt throughout
 * (see `READER`); a stub returning `0` would typecheck nowhere and would quietly teach the
 * student that the return is a Number, which is exactly the trap this mapping exists to avoid.
 */
const ZERO: Readonly<Record<SignatureType, string>> = {
  int: "0",
  long: "0n",
  string: '""',
  "int[]": "[]",
  "long[]": "[]",
  "string[]": "[]",
};

/**
 * Which harness reader produces a value of each type.
 *
 * **`long` reads through `BigInt`, and this is load-bearing rather than tidy.** A `Number`
 * harness for `a-very-big-sum` was run against that problem's real test data and gave WA on 4
 * of its 14 tests — expected 18701033450631392, produced 18701033450631390 — because its
 * answers exceed 2^53. Do not "simplify" this to Number.
 */
const READER: Readonly<Record<SignatureType, string>> = {
  int: "nextInt",
  long: "nextLong",
  string: "nextToken",
  "int[]": "nextInt",
  "long[]": "nextLong",
  "string[]": "nextToken",
};

const ARRAY_TYPES: ReadonlySet<SignatureType> = new Set<SignatureType>([
  "int[]",
  "long[]",
  "string[]",
]);

function isArrayType(type: SignatureType): boolean {
  return ARRAY_TYPES.has(type);
}

/**
 * Harness-private identifiers carry a leading underscore, which a declared name CANNOT have
 * (`^[a-z][A-Za-z0-9]*$`). That makes "the harness never collides with a student's parameter"
 * true structurally instead of true by a deny-list somebody has to keep complete.
 *
 * This is not hypothetical. `circular-array-rotation` declares a field named `q` AND repeats on
 * it; the obvious `for (let q = 0; q < q; q++)` is legal JavaScript in which the loop variable
 * shadows the count, so the condition reads `0 < 0`, the loop never runs, and every submission
 * prints nothing. `designer-pdf-viewer` is the same shape. A silently empty output is the worst
 * possible failure here because it looks like the student's bug.
 */
const REPEAT_VAR = "_q";
const INDEX_VAR = "_i";

/* ------------------------------------------------------------------------ */
/* Fixed text                                                               */
/* ------------------------------------------------------------------------ */

const RULE = `// ${"-".repeat(75)}`;

/**
 * "do not NEED to", never "must not".
 *
 * The wording is deliberate and load-bearing: a student who wants a helper function, or who
 * needs to `require` something, has to touch the region below, and there are no locked regions
 * to stop them. Tightening this to "must not" makes the file lie about what it enforces.
 */
const BANNER = [
  RULE,
  "// Everything below reads the input and prints the answer.",
  "// You do not need to change anything below this line.",
  RULE,
].join("\n");

/**
 * The reader, identical for every problem.
 *
 * `readFileSync(0, ...)` takes the whole of stdin in one call — the judge always hands us a
 * finite file on stdin, never a stream that stays open.
 *
 * `.filter((t) => t.length > 0)` is REQUIRED, not defensive: `"  1 2".split(/\s+/)` yields a
 * leading `""`, so an input file with any leading whitespace would shift every field by one and
 * the whole submission would be WA for a reason invisible in the student's code.
 *
 * `_TOKENS` is declared BELOW the student's zone, which is safe only because `main()` is called
 * at the very bottom of the file — by then every `const` here has initialised. Hoisting a
 * `const` is a TDZ error, so moving the `main()` call up would break every problem at once.
 */
const HARNESS = `const _TOKENS = require("node:fs")
  .readFileSync(0, "utf8")
  .split(/\\s+/)
  .filter((t) => t.length > 0);
let _pos = 0;

function nextToken() { return _TOKENS[_pos++]; }
function nextInt() { return Number(nextToken()); }
function nextLong() { return BigInt(nextToken()); }`;

/** The line the editor drops the caret on. Also the anchor `generateProbe` inserts after. */
const CURSOR_LINE = "  // Write your code here";

/* ------------------------------------------------------------------------ */
/* Helpers                                                                  */
/* ------------------------------------------------------------------------ */

/** `passed` defaults to true; only an explicit `false` withholds a field from the signature. */
function isPassed(field: SignatureField): boolean {
  return field.passed !== false;
}

/** Read order is shared-then-params; the argument list is the passed subset of the same order. */
function allFields(signature: Signature): readonly SignatureField[] {
  return [...(signature.shared ?? []), ...signature.params];
}

function passedNames(signature: Signature): readonly string[] {
  return allFields(signature).filter(isPassed).map((f) => f.name);
}

/** "an" before a vowel: `an INTEGER`, `an INTEGER_ARRAY`, but `a LONG_INTEGER`, `a STRING`. */
function article(word: string): string {
  return /^[AEIOU]/.test(word) ? "an" : "a";
}

function indent(depth: number, line: string): string {
  return `${" ".repeat(depth)}${line}`;
}

/* ------------------------------------------------------------------------ */
/* Emission                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * The doc comment, in the phrasing of HackerRank's own editor — "following parameter(s)" is
 * their awkward wording and is kept verbatim, because instant recognition is worth more here
 * than grammar.
 */
/**
 * The doc-comment body as plain lines, with no comment markers.
 *
 * Language-neutral: all six emitters say the same words and differ only in how they mark a
 * comment, so the shared dispatcher can build these once and hand them to `emitJavaScript` as
 * its second argument. Exported, and identical in output to the sibling emitters' versions, so
 * that "all six agree" is checkable rather than assumed — six private copies of one sentence is
 * how `components/admin/contract.ts` drifted into describing a response that no longer existed.
 */
export function javaScriptDocLines(signature: Signature): readonly string[] {
  const returnWord = TYPE_WORD[signature.returns.type];
  const lines = [
    `Complete the '${signature.name}' function below.`,
    "",
    `The function is expected to return ${article(returnWord)} ${returnWord}.`,
  ];

  const passed = allFields(signature).filter(isPassed);
  // A zero-parameter function would otherwise get a header introducing an empty list. No
  // authored problem has one, but emitting a dangling colon is a worse default than silence.
  if (passed.length > 0) {
    lines.push("The function accepts following parameter(s):");
    passed.forEach((field, i) => {
      lines.push(` ${i + 1}. ${TYPE_WORD[field.type]} ${field.name}`);
    });
  }

  return lines;
}

/** Wraps a language-neutral doc body in a block comment; a blank line becomes a bare ` *`. */
function docComment(lines: readonly string[]): string {
  const body = lines.map((line) => (line === "" ? " *" : ` * ${line}`)).join("\n");
  return `/*\n${body}\n */`;
}

/** Lines that read one field off the token stream, at the given indent. */
function readLines(field: SignatureField, depth: number): readonly string[] {
  const reader = READER[field.type];

  if (!isArrayType(field.type)) {
    return [indent(depth, `const ${field.name} = ${reader}();`)];
  }

  // `length` is either a literal count or the name of an earlier int field; both are valid
  // JavaScript expressions as written, so no branch is needed to interpolate them.
  const length = String(field.length);
  return [
    indent(depth, `const ${field.name} = [];`),
    indent(
      depth,
      `for (let ${INDEX_VAR} = 0; ${INDEX_VAR} < ${length}; ${INDEX_VAR}++) ` +
        `${field.name}.push(${reader}());`,
    ),
  ];
}

/**
 * The line that calls the student's function and buffers one answer.
 *
 * An array result is joined with the declared separator into ONE buffered entry, so the entry
 * is still followed by exactly one newline — `join: "\n"` and `join: " "` differ only in how
 * that call's own elements are separated, never in how calls are separated.
 *
 * `String(...)` rather than template interpolation because a `long` result is a BigInt, and
 * `String(10n)` is `"10"` with no `n` suffix.
 */
function callLine(signature: Signature, depth: number): string {
  const call = `${signature.name}(${passedNames(signature).join(", ")})`;

  if (isArrayType(signature.returns.type)) {
    return indent(depth, `out.push(${call}.join(${JSON.stringify(signature.returns.join)}));`);
  }
  return indent(depth, `out.push(String(${call}));`);
}

function mainFunction(signature: Signature): string {
  const lines: string[] = ["function main() {", "  const out = [];", ""];

  for (const field of signature.shared ?? []) {
    lines.push(...readLines(field, 2));
  }

  if (signature.repeat === undefined) {
    for (const field of signature.params) {
      lines.push(...readLines(field, 2));
    }
    lines.push("", callLine(signature, 2), "");
  } else {
    lines.push(
      `  for (let ${REPEAT_VAR} = 0; ${REPEAT_VAR} < ${signature.repeat}; ${REPEAT_VAR}++) {`,
    );
    for (const field of signature.params) {
      lines.push(...readLines(field, 4));
    }
    lines.push("", callLine(signature, 4), "  }", "");
  }

  // One write for the whole answer. Buffering matters: `encryption` prints one line per query
  // and a per-line write on a 10^5-query problem is thousands of syscalls against the wall
  // clock the student is judged on.
  lines.push('  process.stdout.write(out.join("\\n") + "\\n");', "}");
  return lines.join("\n");
}

/** Probe echo of one argument: scalars on their own line, arrays as `<len>: e1 e2 ...`. */
function probeEchoLine(field: SignatureField): string {
  if (isArrayType(field.type)) {
    return indent(
      2,
      `process.stdout.write(${field.name}.length + ": " + ${field.name}.join(" ") + "\\n");`,
    );
  }
  return indent(2, `process.stdout.write(String(${field.name}) + "\\n");`);
}

function render(
  signature: Signature,
  docLines: readonly string[] | undefined,
  probeLines: readonly string[],
): string {
  const args = passedNames(signature).join(", ");
  const stub = [
    `function ${signature.name}(${args}) {`,
    CURSOR_LINE,
    ...probeLines,
    `  return ${ZERO[signature.returns.type]};`,
    "}",
  ].join("\n");

  const header = docComment(docLines ?? javaScriptDocLines(signature));
  return `${header}\n${stub}\n\n${BANNER}\n${HARNESS}\n\n${mainFunction(signature)}\n\nmain();\n`;
}

/* ------------------------------------------------------------------------ */
/* Public surface                                                           */
/* ------------------------------------------------------------------------ */

/**
 * The complete `main.js` pre-filled into the editor for a problem that declares `signature`.
 *
 * Layout is imports-free student-zone-first: doc comment, stub, banner, harness, `main`. The
 * cursor lands in the top third of the file, which is better than HackerRank, where the reader
 * comes first and the student scrolls past plumbing to reach their own function.
 *
 * @param signature the problem's declaration, already validated by `SignatureSchema`
 * @param docLines  optional pre-built doc-comment body; defaults to `javaScriptDocLines(...)`
 */
export function emitJavaScript(signature: Signature, docLines?: readonly string[]): string {
  return render(signature, docLines, []);
}

/**
 * The gate's probe: `emitJavaScript` with echo statements inserted immediately after the
 * `// Write your code here` line and the zero return left in place.
 *
 * That construction is what lets one G13 pass prove two separate things. The probe file
 * CONTAINS the starter's stub verbatim, so a probe that compiles proves the starter compiles;
 * and because every language's probe echoes the same arguments in the same order, a reader that
 * consumes the token stream in the wrong order is a WA against the committed golden rather than
 * a bug that only shows up when a student hits it.
 *
 * Removing the echo lines cannot break the JavaScript starter: the stub declares no locals and
 * JavaScript has no unused-anything error.
 */
export function emitJavaScriptProbe(signature: Signature, docLines?: readonly string[]): string {
  return render(signature, docLines, allFields(signature).filter(isPassed).map(probeEchoLine));
}
