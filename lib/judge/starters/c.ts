/**
 * The C harness emitter — emits `main.c`, the source file of variant `C_17`.
 *
 * A pure function from a problem's `signature` declaration to a COMPLETE, COMPILABLE program:
 * the student's stub at the top, the stdin -> stdout plumbing below it. The student submits the
 * whole file exactly as they submit anything today, so nothing in `worker/` or the queue knows
 * this exists.
 *
 * Built against the registry's verbatim command for `C_17`:
 *
 *     gcc -std=c17 -O2 -o /build/prog /work/main.c -lm
 *
 * No `-Wall`, so an unused `static` helper is silent — which is why all three readers are always
 * emitted rather than selected per signature. Branch-free beats clever here: a reader that is
 * emitted "only when needed" is a computation that can be wrong, and being wrong means CE on a
 * starter we shipped.
 *
 * ## The two rules C forces that no other language does
 *
 * C has no array type that carries its length and no string type, so:
 *
 *  1. **Every array parameter injects a preceding `int <name>_count`.** The declaration's own
 *     count field is frequently `passed: false` (it is redundant to everyone except C), so
 *     without the injected count the student's function cannot know how long the array is.
 *     The count is DERIVED here; it is never something an author writes.
 *  2. **An array return becomes `T *f(..., int *result_count)`.** There is no other way to
 *     return a length.
 *
 * ## Why the harness frees nothing
 *
 * Not an oversight. A student may return the input array, a string literal, or a static buffer;
 * every one of those makes a `free()` in the harness a crash, and a crash is verdict `RE` on an
 * algorithmically correct submission — unfixable from the student's side. The process is
 * per-test and every allocation is bounded by the input size, which the memory limit already
 * bounds. Do not "fix" this.
 *
 * ## Why harness locals all contain an underscore
 *
 * A field name matches `^[a-z][A-Za-z0-9]*$` — it CANNOT contain `_`. So `_i`, `_case`,
 * `_result`, `_result_count`, `next_token` and the injected `<name>_count` parameters are
 * collision-proof against any declaration by construction, rather than by a deny-list that
 * someone has to remember to extend. That matters: a repeat loop written as `for (int t = 0;
 * t < t; t++)` over a shared field named `t` (angry-professor declares exactly that) compiles
 * cleanly, shadows the bound with itself, and runs zero times.
 *
 * Pure: no I/O, no Date.now(), no randomness — same rule as `lib/scoring/`.
 */

/** The closed type vocabulary. Mirrors `SignatureSchema` in `lib/schemas/problem-content.ts`. */
export type SignatureType = ScalarType | ArrayType;

/** A single value. The three things C can print with one conversion specifier. */
type ScalarType = "int" | "long" | "string";

/** A run of values. In C these are the two derived rules — see the file comment. */
type ArrayType = "int[]" | "long[]" | "string[]";

/**
 * One field of the input stream.
 *
 * Structurally identical to the schema's inferred type on purpose: TypeScript is structural, so
 * the shared `generate.ts` can hand us the Zod-inferred `Signature` with no adapter and no cast.
 * Declared here rather than imported so this module compiles and tests standalone while
 * `lib/schemas/problem-content.ts` is being written in parallel.
 */
export interface SignatureField {
  readonly name: string;
  readonly type: SignatureType;
  /** Required iff `type` is an array: a positive integer literal, or the name of an earlier int. */
  readonly length?: number | string;
  /** `false` = read from stdin but NOT given to the function. Defaults to true. */
  readonly passed?: boolean;
}

export interface SignatureReturn {
  readonly type: SignatureType;
  /** Required iff `type` is an array: what separates one call's elements. */
  readonly join?: string;
}

export interface Signature {
  readonly name: string;
  readonly returns: SignatureReturn;
  /** Read ONCE, before the loop. */
  readonly shared?: readonly SignatureField[];
  /** Names an int field in `shared`; the params block is read that many times. */
  readonly repeat?: string;
  /** Read once PER CALL. */
  readonly params: readonly SignatureField[];
}

/** The word the doc comment uses, matching HackerRank's vocabulary exactly. */
const DOC_WORD: Readonly<Record<SignatureType, string>> = {
  int: "INTEGER",
  long: "LONG_INTEGER",
  string: "STRING",
  "int[]": "INTEGER_ARRAY",
  "long[]": "LONG_INTEGER_ARRAY",
  "string[]": "STRING_ARRAY",
};

/**
 * The C spelling of each declared type.
 *
 * `string` is `const char *` because the harness hands over a buffer it still owns; a student
 * who returns a malloc'd `char *` converts to it implicitly, so the const costs them nothing.
 * `string[]` is `char **` and NOT `const char **` — `char **` does not implicitly convert to
 * `const char **` in C, so the const version would reject the obvious student code.
 */
const C_TYPE: Readonly<Record<SignatureType, string>> = {
  int: "int",
  long: "long long",
  string: "const char *",
  "int[]": "int *",
  "long[]": "long long *",
  "string[]": "char **",
};

/** `printf` conversion for a scalar of each element type. */
const C_FORMAT: Readonly<Record<ScalarType, string>> = {
  int: "%d",
  long: "%lld",
  string: "%s",
};

/** The reader that consumes one token of each element type. */
const C_READER: Readonly<Record<ScalarType, string>> = {
  int: "next_int()",
  long: "next_long()",
  string: "next_token()",
};

/** What one element of an array occupies, as a C declaration fragment for `sizeof`. */
const C_ELEMENT_SIZEOF: Readonly<Record<ScalarType, string>> = {
  int: "sizeof(int)",
  long: "sizeof(long long)",
  string: "sizeof(char *)",
};

const INDENT = "    ";

/**
 * A type predicate, not a boolean: every `printf` conversion and every reader in this file is
 * chosen by narrowing on it, so the compiler — rather than a reviewer — is what guarantees an
 * array never reaches the scalar tables.
 */
function isArrayType(type: SignatureType): type is ArrayType {
  return type.endsWith("[]");
}

function elementTypeOf(type: ArrayType): ScalarType {
  return type.slice(0, -2) as ScalarType;
}

/** `int n`, `int *arr`, `const char *key`, `char **words` — pointer types bind to the name. */
function declare(type: SignatureType, name: string): string {
  const spelling = C_TYPE[type];
  return spelling.endsWith("*") ? `${spelling}${name}` : `${spelling} ${name}`;
}

/** "an INTEGER", "a STRING" — the article follows the doc word, not the declared type. */
function article(word: string): string {
  return /^[AEIOU]/.test(word) ? "an" : "a";
}

/** Every field in reading order: shared first, then the per-call params. */
function allFields(sig: Signature): readonly SignatureField[] {
  return [...(sig.shared ?? []), ...sig.params];
}

/** Exactly the fields the function receives, in declaration order. */
function passedFields(sig: Signature): readonly SignatureField[] {
  return allFields(sig).filter((field) => field.passed !== false);
}

/**
 * The C expression for an array's length: a literal, or the name of an earlier int field.
 *
 * Throws rather than emitting something that will not compile. The schema guarantees this is
 * present for array fields; if it ever is not, failing loudly here beats shipping a `main.c`
 * with `malloc((size_t)undefined * sizeof(int))` in it.
 */
function lengthExpr(field: SignatureField): string {
  if (field.length === undefined) {
    throw new Error(`array field "${field.name}" has no length`);
  }
  return String(field.length);
}

/**
 * How many elements to allocate.
 *
 * `malloc(0)` may legitimately return NULL, and a NULL array parameter is a segfault the
 * student cannot explain, so a name-valued length is clamped to at least one. A literal length
 * is already known positive, so it is emitted plainly — the ternary would be noise in a file
 * the student reads.
 */
function allocCountExpr(field: SignatureField): string {
  const length = lengthExpr(field);
  if (typeof field.length === "number") {
    return `(size_t)${length}`;
  }
  return `(size_t)(${length} > 0 ? ${length} : 1)`;
}

/** A C string literal body — join separators are the only strings we ever interpolate. */
function cStringLiteral(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

/**
 * The C parameter list, including the two things C derives and no other language needs: the
 * `<name>_count` before every array, and the `int *result_count` out-parameter for an array
 * return.
 *
 * Exported because it is the one part of this emitter another surface might legitimately want
 * to render (a "Function Description" block, a report), and re-deriving it elsewhere is exactly
 * the drift this file exists to avoid.
 */
export function cParameterList(sig: Signature): string {
  const parts: string[] = [];
  for (const field of passedFields(sig)) {
    if (isArrayType(field.type)) {
      parts.push(`int ${field.name}_count`);
    }
    parts.push(declare(field.type, field.name));
  }
  if (isArrayType(sig.returns.type)) {
    parts.push("int *result_count");
  }
  // `f()` in C means "unspecified arguments"; `f(void)` means none. Only reachable if every
  // field is `passed: false`, which is legal and would otherwise emit a K&R-style declaration.
  return parts.length === 0 ? "void" : parts.join(", ");
}

/** The doc comment: what the function returns, what arrives, and C's two derived extras. */
function docComment(sig: Signature): string[] {
  const returnWord = DOC_WORD[sig.returns.type];
  const lines = [
    "/*",
    ` * Complete the '${sig.name}' function below.`,
    " *",
    ` * The function is expected to return ${article(returnWord)} ${returnWord}.`,
  ];

  const passed = passedFields(sig);
  if (passed.length > 0) {
    lines.push(" * The function accepts following parameter(s):");
    passed.forEach((field, index) => {
      lines.push(` *  ${index + 1}. ${DOC_WORD[field.type]} ${field.name}`);
    });
  }

  // The derived parameters are explained where the student meets them, not in the statement:
  // a `_count` argument that appears in the signature and nowhere in the problem text reads as
  // a platform bug.
  for (const field of passed) {
    if (isArrayType(field.type)) {
      lines.push(` * ${field.name}_count is how many entries ${field.name} has.`);
    }
  }
  if (isArrayType(sig.returns.type)) {
    lines.push(" * Store how many entries you are returning in *result_count.");
  }

  lines.push(" */");
  return lines;
}

const BANNER = [
  "/* -------------------------------------------------------------------------",
  " * Everything below reads the input and prints the answer.",
  " * You do not need to change anything below this line.",
  " * ------------------------------------------------------------------------- */",
];

/**
 * The stub's placeholder return.
 *
 * Every stub returns something. An empty body would compile in C, but a function whose return
 * value is used and never set is undefined behaviour — the student's first run would be garbage
 * rather than an obvious wrong answer.
 */
function zeroReturn(sig: Signature): string[] {
  if (isArrayType(sig.returns.type)) {
    return ["*result_count = 0;", "return NULL;"];
  }
  if (sig.returns.type === "string") {
    return ['return "";'];
  }
  return ["return 0;"];
}

/** The always-emitted readers. Unused ones are silent under the registry's flags (no -Wall). */
const READERS = [
  "/*",
  // No backticks in the emitted text: the golden files these lines end up in are compared as
  // template literals in c.test.ts, and a backtick there is an escaping hazard for no gain.
  " * next_token grows its buffer, so there is no maximum token length. A fixed char buf[N]",
  ' * plus scanf("%s") is a buffer overflow on the first problem with a long word, and this',
  " * codebase already ships a 2000-character token.",
  " */",
  "static char *next_token(void) {",
  `${INDENT}size_t cap = 16;`,
  `${INDENT}size_t len = 0;`,
  `${INDENT}char *s = (char *)malloc(cap);`,
  `${INDENT}int c = getchar();`,
  `${INDENT}while (c != EOF && isspace(c)) c = getchar();`,
  `${INDENT}while (c != EOF && !isspace(c)) {`,
  `${INDENT}${INDENT}if (len + 1 >= cap) { cap *= 2; s = (char *)realloc(s, cap); }`,
  `${INDENT}${INDENT}s[len++] = (char)c;`,
  `${INDENT}${INDENT}c = getchar();`,
  `${INDENT}}`,
  `${INDENT}s[len] = '\\0';`,
  `${INDENT}return s;`,
  "}",
  "",
  "static int next_int(void) {",
  `${INDENT}char *t = next_token();`,
  `${INDENT}int v = (int)strtol(t, NULL, 10);`,
  `${INDENT}free(t);`,
  `${INDENT}return v;`,
  "}",
  "",
  "static long long next_long(void) {",
  `${INDENT}char *t = next_token();`,
  `${INDENT}long long v = strtoll(t, NULL, 10);`,
  `${INDENT}free(t);`,
  `${INDENT}return v;`,
  "}",
];

/** The statements that read one field off the token stream. */
function readField(field: SignatureField): string[] {
  if (!isArrayType(field.type)) {
    return [`${declare(field.type, field.name)} = ${C_READER[field.type]};`];
  }
  const element = elementTypeOf(field.type);
  const length = lengthExpr(field);
  return [
    `${declare(field.type, field.name)} = (${C_TYPE[field.type]})malloc(${allocCountExpr(field)} * ${C_ELEMENT_SIZEOF[element]});`,
    `for (int _i = 0; _i < ${length}; _i++) ${field.name}[_i] = ${C_READER[element]};`,
  ];
}

/** The arguments actually passed, including the derived counts and the out-parameter. */
function callExpression(sig: Signature): string {
  const args: string[] = [];
  for (const field of passedFields(sig)) {
    if (isArrayType(field.type)) {
      args.push(lengthExpr(field));
    }
    args.push(field.name);
  }
  if (isArrayType(sig.returns.type)) {
    args.push("&_result_count");
  }
  return `${sig.name}(${args.join(", ")})`;
}

/**
 * Call the student's function and print the result.
 *
 * The trailing newline is UNCONDITIONAL, including for an empty array result. That is not a
 * cosmetic choice: the Python harness prints one line per call whatever the call returned, and
 * G13's probe pass compares all six harnesses against the Python golden byte for byte. A C
 * harness that prints nothing for an empty result would diverge on exactly one input and be
 * discovered by a student.
 */
function callAndPrint(sig: Signature): string[] {
  const call = callExpression(sig);
  if (!isArrayType(sig.returns.type)) {
    return [`printf("${C_FORMAT[sig.returns.type]}\\n", ${call});`];
  }
  const element = elementTypeOf(sig.returns.type);
  const join = sig.returns.join;
  if (join === undefined) {
    throw new Error(`array return of "${sig.name}" has no join`);
  }
  return [
    "int _result_count = 0;",
    `${declare(sig.returns.type, "_result")} = ${call};`,
    "for (int _i = 0; _i < _result_count; _i++) {",
    `${INDENT}if (_i > 0) printf(${cStringLiteral(join)});`,
    `${INDENT}printf("${C_FORMAT[element]}", _result[_i]);`,
    "}",
    'printf("\\n");',
  ];
}

function indent(lines: readonly string[], depth: number): string[] {
  const pad = INDENT.repeat(depth);
  return lines.map((line) => (line === "" ? "" : `${pad}${line}`));
}

function mainFunction(sig: Signature): string[] {
  const body: string[] = [];

  for (const field of sig.shared ?? []) {
    body.push(...readField(field));
  }

  const perCall: string[] = [];
  for (const field of sig.params) {
    perCall.push(...readField(field));
  }
  if (perCall.length > 0) {
    perCall.push("");
  }
  perCall.push(...callAndPrint(sig));

  // One blank line after the shared reads, whether or not a loop follows. The schema rejects
  // `shared` without `repeat`, so in practice this separates the shared block from the loop.
  if (body.length > 0) {
    body.push("");
  }

  if (sig.repeat === undefined) {
    body.push(...perCall);
  } else {
    body.push(`for (int _case = 0; _case < ${sig.repeat}; _case++) {`);
    body.push(...indent(perCall, 1));
    body.push("}");
  }

  body.push("");
  body.push("return 0;");

  return ["int main(void) {", ...indent(body, 1), "}"];
}

function render(sig: Signature, studentBody: readonly string[]): string {
  const lines = [
    "#include <ctype.h>",
    "#include <stdio.h>",
    "#include <stdlib.h>",
    "#include <string.h>",
    "",
    ...docComment(sig),
    `${declare(sig.returns.type, `${sig.name}(${cParameterList(sig)})`)} {`,
    ...indent(studentBody, 1),
    "}",
    "",
    ...BANNER,
    "",
    ...READERS,
    "",
    ...mainFunction(sig),
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * The complete `main.c` pre-filled into the editor: student stub, then the visible harness.
 */
export function emitC(sig: Signature): string {
  return render(sig, ["/* Write your code here */", ...zeroReturn(sig)]);
}

/**
 * The same file with echo statements inserted immediately after the "Write your code here"
 * line, the zero return left in place.
 *
 * G13's probe pass judges this against a golden generated from the Python probe, which proves
 * two things at once: that the harness compiles (the probe CONTAINS the stub verbatim, and the
 * echo lines declare no locals whose removal could matter), and that C reads the token stream
 * in exactly the order Python does.
 *
 * The array form is `<count>:` followed by a space and an element, per element — so an empty
 * array is `0:` with no trailing space. Every emitter must agree on that or the golden differs
 * on a problem nobody has written yet.
 */
export function emitCProbe(sig: Signature): string {
  const echo: string[] = [];
  for (const field of passedFields(sig)) {
    if (!isArrayType(field.type)) {
      echo.push(`printf("${C_FORMAT[field.type]}\\n", ${field.name});`);
      continue;
    }
    const element = elementTypeOf(field.type);
    echo.push(`printf("%d:", ${field.name}_count);`);
    echo.push(
      `for (int _i = 0; _i < ${field.name}_count; _i++) printf(" ${C_FORMAT[element]}", ${field.name}[_i]);`,
    );
    echo.push('printf("\\n");');
  }
  return render(sig, ["/* Write your code here */", ...echo, ...zeroReturn(sig)]);
}
