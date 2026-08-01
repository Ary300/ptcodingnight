/**
 * Java starter generation — emits `Main.java`.
 *
 * ONE emission serves JAVA_8, JAVA_11, JAVA_17 and JAVA_21, because all four `VARIANTS` entries
 * write the same `sourceFile` and differ only in `--release`. That is why the caller must dispatch
 * on `VARIANTS[language].sourceFile` and never on the `LanguageId`: four copies of this file kept
 * in sync by hand is the drift failure this project keeps hitting, and adding a fifth Java level
 * would then be a fifth copy instead of a `VARIANTS` line.
 *
 * Because `--release 8` is one of the four, **everything emitted here must be Java 8 clean**: no
 * `var`, no `List.of`, no text blocks, no diamond-on-anonymous-class. The strictest member of the
 * group is the one the gate compiles (SPEC §6.2), so a Java 9+ construct here is a CE on every
 * Java submission of every signatured problem.
 *
 * Pure: no I/O, no `Date.now()`, no randomness — same rule as `lib/scoring/`. The whole point is
 * that a starter is a derivation of (declaration, language), never stored, so an emitter fix reaches
 * every problem without a re-seed.
 */

/* ------------------------------------------------------------------------ */
/* The declaration vocabulary (SPEC §1.1)                                    */
/* ------------------------------------------------------------------------ */

/**
 * The closed set of types a signature may mention.
 *
 * Six, and no more, because all 20 authored problems fit in six (SPEC §1.2). Anything richer is a
 * type system nobody's problem asked for.
 */
export type SignatureType = "int" | "long" | "string" | "int[]" | "long[]" | "string[]";

/** One field of the input stream: either a function parameter or a value read and thrown away. */
export interface SignatureField {
  /** `^[a-z][A-Za-z0-9]*$`. The regex is what makes `_`-prefixed harness locals collision-proof. */
  readonly name: string;
  readonly type: SignatureType;
  /** Required iff `type` is an array: a positive integer literal, or the name of an earlier int. */
  readonly length?: number | string;
  /** `false` = read from stdin but NOT handed to the function. Defaults to true. */
  readonly passed?: boolean;
}

export interface SignatureReturn {
  readonly type: SignatureType;
  /** Required iff `type` is an array: how one call's elements are separated. */
  readonly join?: string;
}

export interface Signature {
  readonly name: string;
  readonly returns: SignatureReturn;
  /** Read ONCE, before the repeat loop. Absent or empty when `repeat` is absent. */
  readonly shared?: readonly SignatureField[];
  /** Names an `int` field in `shared`. Absent means the params are read exactly once. */
  readonly repeat?: string;
  /** Read once PER CALL. */
  readonly params: readonly SignatureField[];
}

/**
 * The file this emitter produces, matching `VARIANTS.JAVA_*.sourceFile`.
 *
 * Exported so the shared dispatcher can key on it rather than re-deriving the string, and so a
 * rename in the registry fails a test here instead of failing a student's compile.
 */
export const JAVA_SOURCE_FILE = "Main.java";

/* ------------------------------------------------------------------------ */
/* Type and literal tables                                                   */
/* ------------------------------------------------------------------------ */

const JAVA_TYPE: Readonly<Record<SignatureType, string>> = {
  int: "int",
  long: "long",
  string: "String",
  "int[]": "int[]",
  "long[]": "long[]",
  "string[]": "String[]",
};

/**
 * What the untouched stub returns.
 *
 * A stub must COMPILE and RUN, not merely parse: a Java method with a declared return type and no
 * `return` is "missing return statement", which is a CE on a starter we shipped — the student sees
 * a compiler error before writing a line.
 */
const JAVA_ZERO: Readonly<Record<SignatureType, string>> = {
  int: "0",
  long: "0L",
  string: '""',
  "int[]": "new int[0]",
  "long[]": "new long[0]",
  "string[]": "new String[0]",
};

/** The doc-comment vocabulary of the reference image, verbatim. */
const DOC_WORD: Readonly<Record<SignatureType, string>> = {
  int: "INTEGER",
  long: "LONG_INTEGER",
  string: "STRING",
  "int[]": "INTEGER_ARRAY",
  "long[]": "LONG_INTEGER_ARRAY",
  "string[]": "STRING_ARRAY",
};

const SCALAR_READER: Readonly<Record<"int" | "long" | "string", string>> = {
  int: "nextInt()",
  long: "nextLong()",
  string: "nextToken()",
};

/**
 * Every identifier the HARNESS introduces inside `main` is `_`-prefixed, and a declared field name
 * can never begin with `_` (SPEC §1.1's `^[a-z][A-Za-z0-9]*$`). Collision is therefore impossible
 * by construction rather than by a deny-list someone has to remember to extend.
 *
 * This is not hypothetical. The spec's illustrative Java harness names the repeat counter `q`, and
 * SEVEN of the twenty declarations name their repeat field `q` — `cats-and-a-mouse`,
 * `circular-array-rotation`, `drawing-book`, `halloween-sale`, `number-line-jumps`,
 * `save-the-prisoner`, `sherlock-and-squares`. Each would emit `int q = nextInt();` followed by
 * `for (int q = 0; q < q; q++)`, which is `variable q is already defined in method main` — CE on
 * seven of twenty problems, in every Java level, for every student. `beautiful-days-at-the-movies`
 * declares a field literally named `i` and would collide with an array-fill index the same way.
 *
 * The static helpers below keep their spec names (`IN`, `TOK`, `line`): they are fields of `Main`
 * or locals of `nextToken`, neither of which shares a scope with a declared field.
 */
const REPEAT_INDEX = "_t";
const ARRAY_INDEX = "_i";
const RESULT_VAR = "_result";
const OUT_VAR = "_out";
const PROBE_INDEX = "_j";
const PROBE_BUF = "_p";

/* ------------------------------------------------------------------------ */
/* Small helpers                                                             */
/* ------------------------------------------------------------------------ */

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
      throw new Error(`elementType called on non-array type ${type}`);
  }
}

/** `an` before INTEGER / INTEGER_ARRAY, `a` otherwise — the reference image's own wording. */
function article(word: string): string {
  return word.startsWith("INTEGER") ? "an" : "a";
}

function isPassed(field: SignatureField): boolean {
  return field.passed !== false;
}

function sharedFields(signature: Signature): readonly SignatureField[] {
  return signature.shared ?? [];
}

/** Reading order: every shared field, then every param. Argument order is the same, minus `passed: false`. */
function allFields(signature: Signature): readonly SignatureField[] {
  return [...sharedFields(signature), ...signature.params];
}

function passedFields(signature: Signature): readonly SignatureField[] {
  return allFields(signature).filter(isPassed);
}

/**
 * A Java source-level string literal.
 *
 * `join` arrives as real characters (`"\n"`, `" "`), and pasting a real newline into a Java string
 * literal is an unterminated-literal CE, so it has to be re-escaped on the way out.
 */
function javaStringLiteral(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/** The array length as Java source: a literal count, or the name of an earlier int field. */
function lengthExpression(field: SignatureField): string {
  if (field.length === undefined) {
    throw new Error(`array field '${field.name}' has no length`);
  }
  return String(field.length);
}

function indent(depth: number, line: string): string {
  return line.length === 0 ? "" : `${" ".repeat(depth)}${line}`;
}

/* ------------------------------------------------------------------------ */
/* The student zone                                                          */
/* ------------------------------------------------------------------------ */

/**
 * The doc comment of the reference image, including its awkward "following parameter(s)".
 *
 * Kept verbatim on purpose — students who have used HackerRank recognise the shape instantly, and a
 * grammatically tidier rewrite would buy nothing and cost that recognition.
 *
 * Returns bare text lines; the caller adds the comment syntax. Duplicated deliberately nowhere: if
 * the shared `generate.ts` grows this builder, this must be deleted and imported instead.
 */
function docLines(signature: Signature): string[] {
  const returnWord = DOC_WORD[signature.returns.type];
  const lines = [
    `Complete the '${signature.name}' function below.`,
    "",
    `The function is expected to return ${article(returnWord)} ${returnWord}.`,
  ];

  const passed = passedFields(signature);
  if (passed.length > 0) {
    lines.push("The function accepts following parameter(s):");
    passed.forEach((field, index) => {
      lines.push(` ${index + 1}. ${DOC_WORD[field.type]} ${field.name}`);
    });
  }

  return lines;
}

function javaParameterList(signature: Signature): string {
  return passedFields(signature)
    .map((field) => `${JAVA_TYPE[field.type]} ${field.name}`)
    .join(", ");
}

/**
 * The `Result` class — everything the student edits, and nothing else.
 *
 * `probeBody` is the echo block Check B inserts immediately after `// Write your code here`. It is
 * threaded through here rather than spliced by a caller so that the probe provably CONTAINS the
 * stub verbatim: a probe that compiles is then evidence the starter compiles (SPEC §6.2).
 */
function resultClass(signature: Signature, probeBody: readonly string[]): string[] {
  const lines: string[] = ["class Result {", ""];

  lines.push(indent(4, "/*"));
  for (const doc of docLines(signature)) {
    lines.push(doc.length === 0 ? indent(4, " *") : indent(4, ` * ${doc}`));
  }
  lines.push(indent(4, " */"));

  lines.push(
    indent(4, `public static ${JAVA_TYPE[signature.returns.type]} ${signature.name}(${javaParameterList(signature)}) {`),
  );
  lines.push(indent(8, "// Write your code here"));
  for (const probe of probeBody) {
    lines.push(probe);
  }
  lines.push(indent(8, `return ${JAVA_ZERO[signature.returns.type]};`));
  lines.push(indent(4, "}"));
  lines.push("}");

  return lines;
}

/* ------------------------------------------------------------------------ */
/* The harness                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The banner says "do not NEED to", not "must not", and the wording is load-bearing (SPEC §4).
 *
 * In Java a student who wants `java.math.BigInteger` has to touch the import block, which is above
 * this line by any drawing of the boundary. Telling them they "must not" edit below it would make
 * the harness a lie the first time someone needs an import.
 */
const BANNER = [
  "// ---------------------------------------------------------------------------",
  "// Everything below reads the input and prints the answer.",
  "// You do not need to change anything below this line.",
  "// ---------------------------------------------------------------------------",
];

/**
 * `BufferedReader` + `StringTokenizer`, refilling per line.
 *
 * Not `split("\\s+")` over the whole stream — leading whitespace yields an empty first element, and
 * some of our test data has it. Not `StreamTokenizer` — it mangles word tokens, and `encryption`
 * ships 2000-character words.
 *
 * All three readers are emitted whether or not a given signature uses them. Unused private methods
 * are legal in Java (unlike an unused import in Go), and emitting unconditionally keeps this
 * emitter branch-free — one less thing that can be computed wrongly.
 */
const READER_BLOCK = [
  "public class Main {",
  "    private static final BufferedReader IN = new BufferedReader(new InputStreamReader(System.in));",
  '    private static StringTokenizer TOK = new StringTokenizer("");',
  "",
  "    private static String nextToken() throws IOException {",
  "        while (!TOK.hasMoreTokens()) {",
  "            String line = IN.readLine();",
  '            if (line == null) return "";',
  "            TOK = new StringTokenizer(line);",
  "        }",
  "        return TOK.nextToken();",
  "    }",
  "",
  "    private static int nextInt() throws IOException { return Integer.parseInt(nextToken()); }",
  "    private static long nextLong() throws IOException { return Long.parseLong(nextToken()); }",
];

/** The statements that read one field off the token stream. */
function readStatements(field: SignatureField, depth: number): string[] {
  if (!isArrayType(field.type)) {
    const scalar = field.type as "int" | "long" | "string";
    return [indent(depth, `${JAVA_TYPE[field.type]} ${field.name} = ${SCALAR_READER[scalar]};`)];
  }

  const element = elementType(field.type);
  const length = lengthExpression(field);
  return [
    indent(depth, `${JAVA_TYPE[field.type]} ${field.name} = new ${JAVA_TYPE[element]}[${length}];`),
    indent(
      depth,
      `for (int ${ARRAY_INDEX} = 0; ${ARRAY_INDEX} < ${length}; ${ARRAY_INDEX}++) ` +
        `${field.name}[${ARRAY_INDEX}] = ${SCALAR_READER[element]};`,
    ),
  ];
}

/** The call, and the printing of whatever came back. One trailing newline per call, always. */
function callStatements(signature: Signature, depth: number): string[] {
  const args = passedFields(signature)
    .map((field) => field.name)
    .join(", ");
  const call = `Result.${signature.name}(${args})`;

  if (!isArrayType(signature.returns.type)) {
    return [indent(depth, `${OUT_VAR}.append(${call}).append('\\n');`)];
  }

  if (signature.returns.join === undefined) {
    throw new Error(`array return of '${signature.name}' has no join`);
  }
  return [
    indent(depth, `${JAVA_TYPE[signature.returns.type]} ${RESULT_VAR} = ${call};`),
    indent(depth, `for (int ${ARRAY_INDEX} = 0; ${ARRAY_INDEX} < ${RESULT_VAR}.length; ${ARRAY_INDEX}++) {`),
    indent(depth + 4, `if (${ARRAY_INDEX} > 0) ${OUT_VAR}.append(${javaStringLiteral(signature.returns.join)});`),
    indent(depth + 4, `${OUT_VAR}.append(${RESULT_VAR}[${ARRAY_INDEX}]);`),
    indent(depth, "}"),
    indent(depth, `${OUT_VAR}.append('\\n');`),
  ];
}

/**
 * `main` — read the shared prefix once, then the params once per call.
 *
 * Output accumulates in a `StringBuilder` and is flushed once. `System.out` is line-buffered
 * through a `PrintStream` that flushes on every newline, and a problem with 100000 answers pays for
 * that flush 100000 times; a correct solution then reports TLE for the harness's I/O rather than
 * the student's algorithm.
 */
function mainMethod(signature: Signature): string[] {
  const lines: string[] = [
    indent(4, "public static void main(String[] _args) throws IOException {"),
    indent(8, `StringBuilder ${OUT_VAR} = new StringBuilder();`),
    "",
  ];

  for (const field of sharedFields(signature)) {
    lines.push(...readStatements(field, 8));
  }

  if (signature.repeat === undefined) {
    for (const field of signature.params) {
      lines.push(...readStatements(field, 8));
    }
    lines.push("");
    lines.push(...callStatements(signature, 8));
  } else {
    lines.push(
      indent(8, `for (int ${REPEAT_INDEX} = 0; ${REPEAT_INDEX} < ${signature.repeat}; ${REPEAT_INDEX}++) {`),
    );
    for (const field of signature.params) {
      lines.push(...readStatements(field, 12));
    }
    lines.push("");
    lines.push(...callStatements(signature, 12));
    lines.push(indent(8, "}"));
  }

  lines.push("");
  lines.push(indent(8, `System.out.print(${OUT_VAR});`));
  lines.push(indent(4, "}"));

  return lines;
}

/* ------------------------------------------------------------------------ */
/* Public surface                                                            */
/* ------------------------------------------------------------------------ */

function assemble(signature: Signature, probeBody: readonly string[]): string {
  const lines = [
    "import java.io.*;",
    "import java.util.*;",
    "",
    ...resultClass(signature, probeBody),
    "",
    ...BANNER,
    ...READER_BLOCK,
    "",
    ...mainMethod(signature),
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * The complete, compilable `Main.java` pre-filled into the editor.
 *
 * `public class Main`, never HackerRank's `public class Solution`: `VARIANTS.JAVA_8.sourceFile` is
 * `Main.java` and `runCommand` is `java -cp /build Main`, so a public `Solution` in `Main.java` is
 * `class Solution is public, should be declared in a file named Solution.java` — CE on every Java
 * submission of every problem. `Result` is package-private in the same file, which `javac` compiles
 * to `Main.class` + `Result.class` in one `/build`.
 */
export function emitJava(signature: Signature): string {
  return assemble(signature, []);
}

/**
 * The Check B probe: the starter with echo statements inserted immediately after
 * `// Write your code here`, the zero `return` left in place.
 *
 * Two things fall out of building it this way. The probe CONTAINS the stub verbatim, so a probe that
 * compiles proves the starter compiles; and removing the echoes cannot break the file, because they
 * declare no locals the stub needs and Java permits unused parameters.
 *
 * Echo format is fixed across all six languages so one golden serves them all: one line per passed
 * argument in declaration order, arrays as `<len>: e1 e2 ...`.
 *
 * NOTE for whoever generates the probe golden: this harness accumulates every call's result and
 * flushes once at the end, so Java emits ALL echo lines and then all (empty) result lines. An
 * emitter that prints each result immediately — the C harness in SPEC §3.3 does — interleaves them
 * instead. The two orderings are not byte-identical and the golden has to account for it.
 */
export function emitJavaProbe(signature: Signature): string {
  const body: string[] = [];

  for (const field of passedFields(signature)) {
    if (!isArrayType(field.type)) {
      body.push(indent(8, `System.out.println(${field.name});`));
      continue;
    }
    body.push(indent(8, "{"));
    body.push(indent(12, `StringBuilder ${PROBE_BUF} = new StringBuilder();`));
    body.push(indent(12, `${PROBE_BUF}.append(${field.name}.length).append(':');`));
    body.push(
      indent(
        12,
        `for (int ${PROBE_INDEX} = 0; ${PROBE_INDEX} < ${field.name}.length; ${PROBE_INDEX}++) ` +
          `${PROBE_BUF}.append(' ').append(${field.name}[${PROBE_INDEX}]);`,
      ),
    );
    body.push(indent(12, `System.out.println(${PROBE_BUF});`));
    body.push(indent(8, "}"));
  }

  return assemble(signature, body);
}

/*
 * The six emitters were written in parallel and landed under two naming conventions —
 * `emitPython` / `emitGo` / `emitC` / `emitJavaScript` against `emitCpp`. These aliases
 * exist only so the shared dispatcher wires up under either, and they are the SAME function object,
 * not a second implementation. Whichever convention `index.ts` settles on, delete the other pair
 * here: two live names for one thing is how a reader ends up unsure which is authoritative.
 */
