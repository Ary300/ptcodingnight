/**
 * Python 3.12 starter generation — the `main.py` half of the function-signature feature.
 *
 * A starter is a COMPLETE, COMPILABLE PROGRAM: the student's stub plus a visible stdin -> stdout
 * harness. The student submits the whole file exactly as they submit today, so nothing in
 * `worker/`, `lib/contest/submissions.ts` or the queue changes. That is the entire reason this is
 * a pre-fill and not a splice: splicing would change what the compiler sees, so the line numbers
 * in a compile error would name lines the student cannot read.
 *
 * ## Rules this file exists to satisfy
 *
 * - **stdin to stdout, never a file.** HackerRank's harness writes to `System.getenv("OUTPUT_PATH")`
 *   and ours must not: `worker/batch-driver.ts` redirects stdin from the test input and captures
 *   stdout. Copying that detail would produce a program that judges as WA on empty output.
 * - **The stub body is never empty.** An empty `def` body is a `SyntaxError`, and
 *   `PYTHON_312.compileCommand` runs `compile(...)` — so an empty stub is verdict **CE** before the
 *   student has typed anything. The stub is always `# Write your code here` followed by a zero
 *   return of the declared type.
 * - **Two readers, not three.** Python has one integer type, so `long` and `int` share
 *   `_next_int()`. The other five emitters need a separate 64-bit reader; this one does not, and
 *   pretending otherwise would be dead code in every generated file.
 * - **Pure.** No I/O, no `Date.now()`, no randomness — the same rule `lib/scoring/` lives under,
 *   for the same reason: the output has to be replayable byte for byte, because
 *   `fixtures/starters/` compares against it.
 *
 * The public surface is `emitPython` and `emitPythonProbe`. The shared dispatcher in
 * `lib/judge/starters/` picks between the six emitters on `VARIANTS[language].sourceFile`, never
 * on the `LanguageId` — that is what keeps "one C++ emission serves C++11 and C++17" true by
 * construction. Python is the one runtime with a 1:1 file-to-variant mapping, so it never sees the
 * difference.
 */

/* ------------------------------------------------------------------------ */
/* The declaration vocabulary                                               */
/* ------------------------------------------------------------------------ */

/**
 * The closed set of types a signature may name.
 *
 * Deliberately six and no more. All 20 authored problems read a flat whitespace-delimited token
 * stream, and every one of them fits this vocabulary. `double`, `bool`, 2-D arrays and structs are
 * absent because no problem needs them, and adding them speculatively would turn a string builder
 * into a type system.
 *
 * These types mirror `SignatureSchema` in `lib/schemas/problem-content.ts`, which is the validator
 * of record. This file re-states them structurally rather than importing so the emitter stays a
 * pure function of plain data with no schema dependency; TypeScript's structural typing makes the
 * two interchangeable at every call site.
 */
export type SignatureType = "int" | "long" | "string" | "int[]" | "long[]" | "string[]";

/** One field read off the token stream, and possibly handed to the student's function. */
export interface SignatureField {
  /** Identifier used verbatim as the Python local and, when passed, the parameter name. */
  readonly name: string;
  readonly type: SignatureType;
  /**
   * Element count. Required iff `type` is an array: either a positive integer literal or the
   * name of an EARLIER `int` field.
   */
  readonly length?: number | string;
  /**
   * `false` means "read from stdin but do not pass to the function". This is how a redundant
   * leading count stays out of the signature the student reads. Defaults to `true`.
   */
  readonly passed?: boolean;
}

/** What the student's function hands back, and how the harness prints it. */
export interface SignatureReturn {
  readonly type: SignatureType;
  /** Separator between elements of one call's result. Required iff `type` is an array. */
  readonly join?: string;
}

/** A problem's whole function-signature declaration. */
export interface Signature {
  /** The function name, lowerCamelCase. */
  readonly name: string;
  readonly returns: SignatureReturn;
  /** Fields read ONCE, before the repeat loop. */
  readonly shared?: readonly SignatureField[];
  /** Names an `int` field in `shared`; the params block is read and called that many times. */
  readonly repeat?: string;
  /** Fields read once PER CALL. */
  readonly params: readonly SignatureField[];
}

/* ------------------------------------------------------------------------ */
/* Per-type tables                                                          */
/* ------------------------------------------------------------------------ */

/**
 * The words the doc comment uses, verbatim from HackerRank.
 *
 * Kept identical on purpose: a student who has used HackerRank recognises `LONG_INTEGER_ARRAY` at
 * a glance, and the point of this whole feature is that the editor looks like the thing they
 * already know.
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
 * The stub's placeholder return.
 *
 * `long` is `0` and not `0L`: Python has a single unbounded `int`, so there is nothing to widen.
 * Arrays are `[]` rather than `None` so a student who runs the untouched stub gets empty output
 * instead of a `TypeError` they did not write.
 */
const ZERO_VALUE: Readonly<Record<SignatureType, string>> = {
  int: "0",
  long: "0",
  string: '""',
  "int[]": "[]",
  "long[]": "[]",
  "string[]": "[]",
};

/** Four-space indent, one level. Python's block structure is the file's structure. */
const IND = "    ";

/**
 * The rule above and below the banner. 75 dashes so the Python (`# ` + rule) and the C-family
 * (`// ` + rule) banners line up at the same visual width in a side-by-side language switch.
 */
const RULE = "-".repeat(75);

/**
 * "do not NEED to", never "must not".
 *
 * The wording is load-bearing and must not be tightened. A student who wants an extra import has
 * to edit the top of the file, which is outside their zone by any reasonable drawing of it — and
 * a submission is one whole file, so there is no mechanism that could stop them anyway. Promising
 * a boundary the system does not enforce is worse than describing the one it has.
 */
const BANNER = [
  "Everything below reads the input and prints the answer.",
  "You do not need to change anything below this line.",
];

/* ------------------------------------------------------------------------ */
/* Small helpers                                                            */
/* ------------------------------------------------------------------------ */

function isArrayType(type: SignatureType): boolean {
  return type.endsWith("[]");
}

/** `true` unless the declaration explicitly says otherwise. */
function isPassed(field: SignatureField): boolean {
  return field.passed !== false;
}

/** Exactly the arguments the student's function receives, in declaration order. */
function argumentFields(signature: Signature): readonly SignatureField[] {
  return [...(signature.shared ?? []), ...signature.params].filter(isPassed);
}

/**
 * The reader call for one scalar value.
 *
 * `long` collapses onto `_next_int()` — see the file header. `string` needs no conversion at all
 * because the token stream is already strings.
 */
function scalarReader(type: SignatureType): string {
  return type === "string" ? "_next_token()" : "_next_int()";
}

/** The reader for one ELEMENT of an array type. */
function elementReader(type: SignatureType): string {
  return type === "string[]" ? "_next_token()" : "_next_int()";
}

/**
 * The Python expression for an array's length: a literal, or an earlier field's name.
 *
 * The schema guarantees one of the two is present; a missing `length` here means the declaration
 * bypassed validation, which is a bug worth failing loudly on rather than emitting `range(undefined)`
 * into a file a student would then be told to debug.
 */
function lengthExpression(field: SignatureField): string {
  if (field.length === undefined) {
    throw new Error(
      `signature field "${field.name}" is of array type "${field.type}" but declares no length`,
    );
  }
  return String(field.length);
}

/**
 * A Python string literal for a separator.
 *
 * Only whitespace separators occur, but escaping is done properly rather than by special-casing
 * `\n`: a separator that reached the emitter unescaped would produce a file that fails to parse,
 * and CE on an untouched starter is the single worst thing this generator can ship.
 */
function pythonStringLiteral(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/* ------------------------------------------------------------------------ */
/* Doc comment                                                              */
/* ------------------------------------------------------------------------ */

/**
 * The doc-comment body, as plain lines with no comment markers.
 *
 * Language-neutral on purpose: all six emitters say the same words and differ only in how they
 * mark a comment. Exported so the shared dispatcher can build these once and hand them down
 * (`emitPython`'s second argument) rather than six emitters each growing their own copy — which is
 * exactly how `components/admin/contract.ts` drifted into describing a server response that no
 * longer existed.
 */
export function signatureDocLines(signature: Signature): readonly string[] {
  const returnWord = TYPE_WORD[signature.returns.type];
  const lines = [
    `Complete the '${signature.name}' function below.`,
    "",
    `The function is expected to return ${article(returnWord)} ${returnWord}.`,
  ];

  const args = argumentFields(signature);
  // A function with no arguments would otherwise announce a parameter list and then show none.
  if (args.length > 0) {
    lines.push("The function accepts following parameter(s):");
    args.forEach((field, index) => {
      lines.push(` ${index + 1}. ${TYPE_WORD[field.type]} ${field.name}`);
    });
  }

  return lines;
}

/** "an INTEGER" and "an INTEGER_ARRAY", but "a LONG_INTEGER" and "a STRING". */
function article(typeWord: string): string {
  return typeWord.startsWith("INTEGER") ? "an" : "a";
}

/* ------------------------------------------------------------------------ */
/* Reading the token stream                                                 */
/* ------------------------------------------------------------------------ */

/**
 * One field's read, at the given indent.
 *
 * Fields with `passed: false` are still read and still bound to a local — they are almost always
 * the count another field's `length` names, and Python does not care about an unused local.
 */
function readField(field: SignatureField, indent: string): string {
  if (isArrayType(field.type)) {
    return `${indent}${field.name} = [${elementReader(field.type)} for _ in range(${lengthExpression(field)})]`;
  }
  return `${indent}${field.name} = ${scalarReader(field.type)}`;
}

/** The `_out.append(...)` line that calls the student's function and formats its result. */
function callAndCollect(signature: Signature, indent: string): string {
  const args = argumentFields(signature)
    .map((field) => field.name)
    .join(", ");
  const call = `${signature.name}(${args})`;

  if (!isArrayType(signature.returns.type)) {
    return `${indent}_out.append(str(${call}))`;
  }

  const join = pythonStringLiteral(signature.returns.join ?? "\n");
  return `${indent}_out.append(${join}.join(str(_e) for _e in ${call}))`;
}

/* ------------------------------------------------------------------------ */
/* The probe                                                                */
/* ------------------------------------------------------------------------ */

/**
 * The echo lines a probe inserts immediately after `# Write your code here`, leaving the zero
 * return in place.
 *
 * G13's probe pass judges one of these per language against a golden generated from THIS one, so
 * the format is a cross-language contract: each argument on its own line, in declaration order,
 * arrays as `<len>: e1 e2 ...`.
 *
 * Echoing from inside the stub is what lets one artifact prove two things at once. The probe
 * CONTAINS the stub verbatim, so a probe that runs proves the starter parses; and because all six
 * languages echo the same bytes, a reader that consumes fields in the wrong order shows up as WA
 * rather than as forty students getting the wrong answer on contest night.
 */
function probeEchoLines(signature: Signature, indent: string): readonly string[] {
  return argumentFields(signature).map((field) =>
    isArrayType(field.type)
      ? `${indent}print(str(len(${field.name})) + ": " + " ".join(str(_e) for _e in ${field.name}))`
      : `${indent}print(${field.name})`,
  );
}

/* ------------------------------------------------------------------------ */
/* The emitter                                                              */
/* ------------------------------------------------------------------------ */

/**
 * The complete `main.py` a student sees pre-filled in the editor.
 *
 * Layout is import -> student zone -> banner -> harness -> `main()`, so the cursor's destination
 * sits in the first third of the file. HackerRank puts its helpers first; this is better.
 *
 * @param signature the problem's declaration, already validated by `SignatureSchema`
 * @param docLines  optional pre-built doc-comment body; defaults to `signatureDocLines(signature)`
 */
export function emitPython(signature: Signature, docLines?: readonly string[]): string {
  return render(signature, docLines, false);
}

/**
 * The same file with argument echoes spliced into the stub — G13's proof that this harness
 * compiles and reads the token stream in the declared order. See `probeEchoLines`.
 */
export function emitPythonProbe(signature: Signature, docLines?: readonly string[]): string {
  return render(signature, docLines, true);
}

function render(
  signature: Signature,
  docLines: readonly string[] | undefined,
  probe: boolean,
): string {
  const lines: string[] = ["import sys", ""];

  // --- student zone ------------------------------------------------------
  const doc = docLines ?? signatureDocLines(signature);
  lines.push("#");
  for (const line of doc) {
    lines.push(line.length > 0 ? `# ${line}` : "#");
  }
  lines.push("#");

  const params = argumentFields(signature)
    .map((field) => field.name)
    .join(", ");
  lines.push(`def ${signature.name}(${params}):`);
  lines.push(`${IND}# Write your code here`);
  if (probe) {
    lines.push(...probeEchoLines(signature, IND));
  }
  // Never an empty body: `compile()` is PYTHON_312's compile step, so a bare `def` is verdict CE.
  lines.push(`${IND}return ${ZERO_VALUE[signature.returns.type]}`);
  lines.push("", "");

  // --- banner ------------------------------------------------------------
  lines.push(`# ${RULE}`);
  for (const line of BANNER) {
    lines.push(`# ${line}`);
  }
  lines.push(`# ${RULE}`);

  // --- harness -----------------------------------------------------------
  // Read once, split once. Every authored problem is a flat whitespace-delimited token stream,
  // and `str.split()` with no argument collapses runs of whitespace and drops leading and
  // trailing whitespace — so no empty first token, which is the trap the JS emitter has to
  // filter around.
  lines.push("_TOKENS = sys.stdin.read().split()");
  lines.push("_POS = 0");
  lines.push("", "");
  lines.push("def _next_token():");
  lines.push(`${IND}global _POS`);
  lines.push(`${IND}token = _TOKENS[_POS]`);
  lines.push(`${IND}_POS += 1`);
  lines.push(`${IND}return token`);
  lines.push("", "");
  // Emitted whether or not the declaration reads an integer. Branch-free beats one fewer unused
  // helper: a conditional emitter is a thing that can be wrong, and an unused function is not.
  lines.push("def _next_int():");
  lines.push(`${IND}return int(_next_token())`);
  lines.push("", "");

  // --- main --------------------------------------------------------------
  lines.push("def main():");
  lines.push(`${IND}_out = []`);
  lines.push("");

  for (const field of signature.shared ?? []) {
    lines.push(readField(field, IND));
  }

  if (signature.repeat === undefined) {
    for (const field of signature.params) {
      lines.push(readField(field, IND));
    }
    lines.push("");
    lines.push(callAndCollect(signature, IND));
  } else {
    const body = `${IND}${IND}`;
    lines.push(`${IND}for _ in range(${signature.repeat}):`);
    for (const field of signature.params) {
      lines.push(readField(field, body));
    }
    // Only when the loop actually read something — a blank line is legal as the first statement
    // of a block, but an empty-looking body reads like a mistake.
    if (signature.params.length > 0) {
      lines.push("");
    }
    lines.push(callAndCollect(signature, body));
  }

  lines.push("");
  // One write, not one print per answer. `print` per line on a 100,000-line answer is measurably
  // slower, and the trailing newline is added exactly once so the output never ends mid-line.
  lines.push(`${IND}sys.stdout.write("\\n".join(_out) + "\\n")`);
  lines.push("", "");
  lines.push("main()");

  return `${lines.join("\n")}\n`;
}
