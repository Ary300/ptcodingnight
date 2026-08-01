/**
 * Go starter generation — the `main.go` emitter.
 *
 * Turns a problem's function-signature declaration into a COMPLETE, COMPILABLE program: the
 * student's stub plus a visible stdin -> stdout harness that reads the input, calls the stub, and
 * prints the answer. The whole file is what the student submits, so nothing in `worker/` or the
 * queue has to know this exists.
 *
 * Two Go rules drive almost every decision below, and both are hard compile errors rather than
 * warnings — a starter that trips either one reports **CE on code the student never wrote**:
 *
 *   1. An unused IMPORT is an error. So the import block is a fixed four and never conditional,
 *      and all three readers are emitted unconditionally so that every import is used by
 *      construction rather than by a computation this emitter could get wrong.
 *   2. An unused LOCAL is an error. So the stub body never pre-declares a result variable
 *      (`result := 0` in a stub is `declared and not used`), and any input field that is read but
 *      neither passed to the function, nor used as an array length, nor used as the repeat count
 *      gets an explicit `_ = name` discard.
 *
 * An unused PARAMETER and an unused FUNCTION are both legal in Go, which is what lets the probe
 * (§6.2 of the spec) be the starter with echo lines inserted — removing those lines cannot break
 * the build.
 *
 * Pure: no I/O, no Date.now(), no randomness. Same rule as lib/scoring/.
 */

/* -------------------------------------------------------------------------- */
/* The declaration types                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The closed type vocabulary. Six entries, because a declaration written against all 20 authored
 * problems needs exactly these — no doubles, no booleans, no 2-D arrays, no structs.
 *
 * `long` is load-bearing and not decoration: `a-very-big-sum` has a real test whose answer is
 * 10^17, which is above 2^53.
 */
export type SignatureType = "int" | "long" | "string" | "int[]" | "long[]" | "string[]";

/** One field of the input stream — read in declaration order, passed to the function or not. */
export interface SignatureField {
  readonly name: string;
  readonly type: SignatureType;
  /** Required iff `type` is an array: a positive integer literal, or the name of an earlier int field. */
  readonly length?: number | string;
  /** `false` = read from stdin but NOT given to the function. How a redundant count stays out of the signature. */
  readonly passed?: boolean;
}

export interface SignatureReturn {
  readonly type: SignatureType;
  /** Required iff `type` is an array: how one call's elements are separated. */
  readonly join?: string;
}

/**
 * A problem's function-signature declaration.
 *
 * NOTE: this is a structural mirror of the shape `SignatureSchema` validates in
 * `lib/schemas/problem-content.ts`. That file is landing separately; when it exists, replace the
 * four types above with a type-only import from it so there is one definition rather than two.
 * The emitter deliberately does no validation of its own beyond the invariants it cannot emit
 * without (see `StarterEmitError`) — validation belongs at the trust boundary, not here.
 */
export interface Signature {
  readonly name: string;
  readonly returns: SignatureReturn;
  /** Read ONCE, before the repeat loop. */
  readonly shared?: readonly SignatureField[];
  /** Names an int field in `shared`. Absent = the params are read exactly once. */
  readonly repeat?: string;
  /** Read once PER CALL. */
  readonly params: readonly SignatureField[];
}

/** Thrown when a declaration is missing something the emitter cannot invent a default for. */
export class StarterEmitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StarterEmitError";
  }
}

/** The variant `sourceFile` this emitter serves. The shared dispatcher keys on this, not on a LanguageId. */
export const GO_SOURCE_FILE = "main.go";

/* -------------------------------------------------------------------------- */
/* Type, reader and zero-value tables                                          */
/* -------------------------------------------------------------------------- */

const GO_TYPE: Readonly<Record<SignatureType, string>> = {
  int: "int",
  long: "int64",
  string: "string",
  "int[]": "[]int",
  // []int64, never []int. Go's int is 64-bit on the judging host, so []int would be accidentally
  // correct; naming the width makes a-very-big-sum obviously correct instead.
  "long[]": "[]int64",
  "string[]": "[]string",
};

/** Zero value for the stub's `return`. Arrays return nil — a `[]T(nil)` has len 0 and ranges cleanly. */
const GO_ZERO: Readonly<Record<SignatureType, string>> = {
  int: "0",
  long: "0",
  string: '""',
  "int[]": "nil",
  "long[]": "nil",
  "string[]": "nil",
};

/** Reader call per scalar type. All three are always emitted, so all three imports are always used. */
const GO_READER: Readonly<Record<"int" | "long" | "string", string>> = {
  int: "nextInt()",
  long: "nextInt64()",
  string: "nextToken()",
};

/** Doc-comment vocabulary, verbatim HackerRank so a student who has used it recognises the shape. */
const TYPE_WORD: Readonly<Record<SignatureType, string>> = {
  int: "INTEGER",
  long: "LONG_INTEGER",
  string: "STRING",
  "int[]": "INTEGER_ARRAY",
  "long[]": "LONG_INTEGER_ARRAY",
  "string[]": "STRING_ARRAY",
};

/**
 * Harness-local identifiers are underscore-prefixed, and that is a correctness fix rather than a
 * style choice.
 *
 * A field name is `^[a-z][A-Za-z0-9]*$`, so it can never begin with an underscore — which makes
 * these names collision-proof by construction. Using the obvious `i` and `t` instead would shadow
 * a parameter on any problem that declares one: `beautiful-days-at-the-movies` really does have a
 * parameter called `i`, and `circular-array-rotation` really does repeat on a field called `q`.
 * `for q := 0; q < q; q++` compiles and loops zero times.
 */
const LOOP_INDEX = "_i";
const REPEAT_INDEX = "_t";
const RESULT = "_result";
const ELEMENT = "_v";

const TAB = "\t";

function isArrayType(type: SignatureType): boolean {
  return type.endsWith("[]");
}

function elementType(type: SignatureType): "int" | "long" | "string" {
  switch (type) {
    case "int[]":
      return "int";
    case "long[]":
      return "long";
    case "string[]":
      return "string";
    default:
      throw new StarterEmitError(`elementType called on non-array type '${type}'`);
  }
}

function readerFor(type: SignatureType): string {
  if (isArrayType(type)) {
    throw new StarterEmitError(`readerFor called on array type '${type}'`);
  }
  return GO_READER[type as "int" | "long" | "string"];
}

/* -------------------------------------------------------------------------- */
/* Doc comment                                                                 */
/* -------------------------------------------------------------------------- */

/** `an` before INTEGER and INTEGER_ARRAY; `a` before everything else, LONG_INTEGER included. */
function article(word: string): string {
  return word.startsWith("INTEGER") ? "an" : "a";
}

/**
 * The arguments the function actually receives: shared then params, declaration order, skipping
 * every `passed: false` field. This is the one place that ordering is decided.
 */
export function goArgumentFields(signature: Signature): SignatureField[] {
  return [...(signature.shared ?? []), ...signature.params].filter((f) => f.passed !== false);
}

function docComment(signature: Signature): string[] {
  const args = goArgumentFields(signature);
  const returnWord = TYPE_WORD[signature.returns.type];

  const body: string[] = [
    `Complete the '${signature.name}' function below.`,
    "",
    `The function is expected to return ${article(returnWord)} ${returnWord}.`,
  ];

  if (args.length === 0) {
    body.push("The function accepts no parameters.");
  } else {
    body.push("The function accepts following parameter(s):");
    args.forEach((field, index) => {
      body.push(` ${index + 1}. ${TYPE_WORD[field.type]} ${field.name}`);
    });
  }

  // Block comment rather than a run of `//`: it is the shape the reference editor shows, and it
  // survives a student collapsing it in an editor that folds comments.
  return ["/*", ...body.map((line) => (line === "" ? " *" : ` * ${line}`)), " */"];
}

/* -------------------------------------------------------------------------- */
/* The student zone                                                            */
/* -------------------------------------------------------------------------- */

function declaration(signature: Signature): string {
  const params = goArgumentFields(signature)
    .map((field) => `${field.name} ${GO_TYPE[field.type]}`)
    .join(", ");
  return `func ${signature.name}(${params}) ${GO_TYPE[signature.returns.type]} {`;
}

function studentZone(signature: Signature, echo: readonly string[]): string[] {
  return [
    ...docComment(signature),
    declaration(signature),
    `${TAB}// Write your code here`,
    ...echo,
    // The zero return is not optional and must be the ONLY statement after the comment. A stub
    // that pre-declares anything is `declared and not used`, which is CE on a starter we shipped.
    `${TAB}return ${GO_ZERO[signature.returns.type]}`,
    "}",
  ];
}

/* -------------------------------------------------------------------------- */
/* The harness                                                                 */
/* -------------------------------------------------------------------------- */

const PRELUDE = [
  "package main",
  "",
  // Fixed four, never conditional. bufio/os/strconv are used by the always-emitted readers and
  // fmt by the always-emitted print, so "no unused import" is structural.
  "import (",
  `${TAB}"bufio"`,
  `${TAB}"fmt"`,
  `${TAB}"os"`,
  `${TAB}"strconv"`,
  ")",
  "",
];

const BANNER = [
  "// ---------------------------------------------------------------------------",
  "// Everything below reads the input and prints the answer.",
  "// You do not need to change anything below this line.",
  "// ---------------------------------------------------------------------------",
];

const READERS = [
  "var stdin = bufio.NewScanner(os.Stdin)",
  "var stdout = bufio.NewWriter(os.Stdout)",
  "",
  "func nextToken() string {",
  `${TAB}stdin.Scan()`,
  `${TAB}return stdin.Text()`,
  "}",
  "",
  "func nextInt() int {",
  `${TAB}v, _ := strconv.Atoi(nextToken())`,
  `${TAB}return v`,
  "}",
  "",
  "func nextInt64() int64 {",
  `${TAB}v, _ := strconv.ParseInt(nextToken(), 10, 64)`,
  `${TAB}return v`,
  "}",
];

const MAIN_OPEN = [
  "func main() {",
  // Split and Buffer must precede the first Scan. The 1 MB buffer is required: bufio.ScanWords
  // caps a token at 64 KB by default, and `encryption` already ships a 2000-character token.
  `${TAB}stdin.Split(bufio.ScanWords)`,
  `${TAB}stdin.Buffer(make([]byte, 1024*1024), 1024*1024)`,
  `${TAB}defer stdout.Flush()`,
  "",
];

/**
 * Names that are read but never referenced again — not passed, not an array length, not the
 * repeat count. Go rejects those as `declared and not used`, so each gets an explicit discard.
 * Computing this is cheaper than trusting every future declaration to avoid the situation.
 */
function unusedLocals(signature: Signature): ReadonlySet<string> {
  const all = [...(signature.shared ?? []), ...signature.params];
  const used = new Set<string>();

  for (const field of all) {
    if (field.passed !== false) used.add(field.name);
    if (typeof field.length === "string") used.add(field.length);
  }
  if (signature.repeat !== undefined) used.add(signature.repeat);

  return new Set(all.filter((field) => !used.has(field.name)).map((field) => field.name));
}

function lengthExpression(field: SignatureField): string {
  if (field.length === undefined) {
    throw new StarterEmitError(`array field '${field.name}' has no length`);
  }
  return String(field.length);
}

function readField(field: SignatureField, indent: string, unused: ReadonlySet<string>): string[] {
  const lines: string[] = [];

  if (isArrayType(field.type)) {
    const size = lengthExpression(field);
    lines.push(`${indent}${field.name} := make(${GO_TYPE[field.type]}, ${size})`);
    lines.push(`${indent}for ${LOOP_INDEX} := 0; ${LOOP_INDEX} < ${size}; ${LOOP_INDEX}++ {`);
    lines.push(`${indent}${TAB}${field.name}[${LOOP_INDEX}] = ${readerFor(elementType(field.type))}`);
    lines.push(`${indent}}`);
  } else {
    lines.push(`${indent}${field.name} := ${readerFor(field.type)}`);
  }

  if (unused.has(field.name)) {
    lines.push(`${indent}_ = ${field.name}`);
  }
  return lines;
}

function callAndPrint(signature: Signature, indent: string): string[] {
  const call = `${signature.name}(${goArgumentFields(signature)
    .map((field) => field.name)
    .join(", ")})`;

  if (!isArrayType(signature.returns.type)) {
    return [`${indent}fmt.Fprintln(stdout, ${call})`];
  }

  const join = signature.returns.join;
  if (join === undefined) {
    throw new StarterEmitError(`array return of '${signature.name}' has no join separator`);
  }

  // Each call's elements are separated by `join`; every call's result is followed by a newline,
  // so an empty result still prints its line and the line count matches the call count.
  return [
    `${indent}${RESULT} := ${call}`,
    `${indent}for ${LOOP_INDEX}, ${ELEMENT} := range ${RESULT} {`,
    `${indent}${TAB}if ${LOOP_INDEX} > 0 {`,
    `${indent}${TAB}${TAB}fmt.Fprint(stdout, ${JSON.stringify(join)})`,
    `${indent}${TAB}}`,
    `${indent}${TAB}fmt.Fprint(stdout, ${ELEMENT})`,
    `${indent}}`,
    `${indent}fmt.Fprint(stdout, "\\n")`,
  ];
}

function mainBody(signature: Signature): string[] {
  const unused = unusedLocals(signature);
  const lines: string[] = [];

  for (const field of signature.shared ?? []) {
    lines.push(...readField(field, TAB, unused));
  }

  const repeating = signature.repeat !== undefined;
  const inner = repeating ? TAB + TAB : TAB;

  if (repeating) {
    if ((signature.shared ?? []).length > 0) lines.push("");
    lines.push(
      `${TAB}for ${REPEAT_INDEX} := 0; ${REPEAT_INDEX} < ${signature.repeat}; ${REPEAT_INDEX}++ {`,
    );
  } else if (lines.length > 0) {
    lines.push("");
  }

  for (const field of signature.params) {
    lines.push(...readField(field, inner, unused));
  }

  if (signature.params.length > 0) lines.push("");
  lines.push(...callAndPrint(signature, inner));

  if (repeating) lines.push(`${TAB}}`);

  return lines;
}

/* -------------------------------------------------------------------------- */
/* Public surface                                                              */
/* -------------------------------------------------------------------------- */

function assemble(signature: Signature, echo: readonly string[]): string {
  return (
    [
      ...PRELUDE,
      ...studentZone(signature, echo),
      "",
      ...BANNER,
      "",
      ...READERS,
      "",
      ...MAIN_OPEN,
      ...mainBody(signature),
      "}",
    ].join("\n") + "\n"
  );
}

/**
 * The complete `main.go` pre-filled into the editor: doc comment, stub, banner, harness, main.
 *
 * The student's cursor lands on the `Write your code here` line, which is in the first third of
 * the file. Nothing is hidden and nothing is locked — the harness is in the file the compiler
 * sees, so line numbers in a compile error are exact, and a student who needs another import can
 * reach the import block. That is why the banner says "do not NEED to", not "must not".
 */
export function emitGo(signature: Signature): string {
  return assemble(signature, []);
}

/**
 * The G13 probe: `emitGo` with echo statements inserted immediately after the
 * `// Write your code here` line, leaving the zero return in place.
 *
 * One pass proves two things. The probe CONTAINS the stub verbatim, so a probe that compiles
 * proves the starter compiles — removing the echo lines cannot break the build, because Go
 * permits unused parameters and unused functions and the stub declares no locals. And because
 * every language's probe echoes the same arguments in the same order, a reader that consumes the
 * token stream in a different order shows up as WA against the committed golden.
 *
 * Echo goes through the same buffered `stdout` the harness uses, so a probe's own lines and the
 * harness's result lines interleave in exactly source order rather than by flush timing.
 */
export function emitGoProbe(signature: Signature): string {
  const lines: string[] = [];

  for (const field of goArgumentFields(signature)) {
    if (isArrayType(field.type)) {
      // `<len>: e1 e2 ...`
      lines.push(`${TAB}fmt.Fprint(stdout, len(${field.name}))`);
      lines.push(`${TAB}fmt.Fprint(stdout, ":")`);
      lines.push(`${TAB}for _, ${ELEMENT} := range ${field.name} {`);
      lines.push(`${TAB}${TAB}fmt.Fprint(stdout, " ")`);
      lines.push(`${TAB}${TAB}fmt.Fprint(stdout, ${ELEMENT})`);
      lines.push(`${TAB}}`);
      lines.push(`${TAB}fmt.Fprint(stdout, "\\n")`);
    } else {
      lines.push(`${TAB}fmt.Fprintln(stdout, ${field.name})`);
    }
  }

  return assemble(signature, lines);
}
