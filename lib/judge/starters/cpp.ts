/**
 * The C++ starter emitter — `main.cpp`, serving both `CPP_11` and `CPP_17`.
 *
 * Turns a problem's function-signature declaration into a COMPLETE, COMPILABLE program: the
 * student's stub plus a visible stdin -> stdout harness. The student edits the function body
 * and submits the whole file, so nothing in `worker/` or the queue changes — a generated
 * starter is byte-identical *in kind* to what students submit today.
 *
 * ## Why one emission serves two variants
 *
 * `VARIANTS.CPP_11.sourceFile` and `VARIANTS.CPP_17.sourceFile` are both `main.cpp`, so the
 * shared dispatcher keys on the source file rather than on the `LanguageId`. That makes "one
 * C++ harness serves both standards" true by construction instead of by two copies staying in
 * sync, and it is why adding a C++20 variant needs no change to this file.
 *
 * The consequence is a hard constraint: **everything emitted here must be C++11 clean.**
 * That is enforced by the toolchain, not by taste — `CPP_11.compileCommand` carries
 * `-Werror=c++14-extensions -Werror=c++17-extensions -Werror=c++20-extensions
 * -Werror=c++23-extensions -Werror=c++26-extensions`, so a structured binding, an
 * `if constexpr`, an `auto` parameter or a `string_view` is a hard compile error and every
 * student on C++11 sees CE on code they never wrote. `<bits/stdc++.h>` is safe: it is a GCC
 * *header* extension, not a *language* extension, and the `-Werror=c++NN-extensions` flags do
 * not touch it (verified by compiling in the real `gcc:14` image).
 *
 * ## Purity
 *
 * Same rule as `lib/scoring/`: no I/O, no `Date.now()`, no randomness. A starter is a pure
 * function of (declaration, language), which is exactly why the DECLARATION is the thing
 * stored on `Problem` and the generated text never is. Storing the text would be a cached
 * derivation that goes stale the moment this file is fixed.
 */

/**
 * The closed set of declarable types.
 *
 * Six, and no more, because a declaration was written for all 20 authored problems against
 * this grammar and every one fits. `double`, `bool`, 2-D arrays and structs are absent because
 * no problem asks for them, and a type system nobody's problem needs is a compiler we agreed
 * not to build.
 */
export type SignatureTypeName = "int" | "long" | "string" | "int[]" | "long[]" | "string[]";

/** One field of the input stream: read in declaration order, passed to the student iff `passed`. */
export interface SignatureField {
  readonly name: string;
  readonly type: SignatureTypeName;
  /**
   * Required iff `type` is an array. Either a positive integer literal or the name of an
   * EARLIER `int` field.
   */
  readonly length?: number | string;
  /**
   * Defaults to `true`. `false` means "read from stdin but do not hand to the function" —
   * how a redundant count (`n` before an array of `n`) stays out of the student's signature.
   */
  readonly passed?: boolean;
}

/** What the student's function hands back, and how an array of results is separated. */
export interface SignatureReturn {
  readonly type: SignatureTypeName;
  /** Required iff `type` is an array. Every call's result is followed by a newline regardless. */
  readonly join?: string;
}

/**
 * A problem's function-signature declaration.
 *
 * NOTE FOR THE INTEGRATOR: these interfaces are declared here only because
 * `lib/schemas/problem-content.ts` (which owns `SignatureSchema`) had not landed when this
 * emitter was written, and a `lib/judge/starters/**` file that imports a non-existent module
 * fails G1 for everyone. They are structurally identical to the schema in the specification,
 * so `z.infer<typeof SignatureSchema>` assigns straight into `emitCpp` with no
 * change at the call site. **Delete these four declarations and re-export the schema's types
 * the moment that module exists** — two hand-written copies of one shape is precisely the
 * drift that `components/admin/contract.ts` demonstrated.
 */
export interface Signature {
  readonly name: string;
  readonly returns: SignatureReturn;
  /** Read ONCE, before the repeat loop. Absent or empty when `repeat` is absent. */
  readonly shared?: readonly SignatureField[];
  /** Names an `int` field in `shared`. Absent means the function is called exactly once. */
  readonly repeat?: string;
  /** Read once PER CALL. */
  readonly params: readonly SignatureField[];
}

/** The file this emitter produces. The shared dispatcher keys on exactly this string. */
export const CPP_SOURCE_FILE = "main.cpp";

/** Declared type -> C++ type. `long` is `long long` so a 10^17 answer is not silently truncated. */
const CPP_TYPE: Readonly<Record<SignatureTypeName, string>> = {
  int: "int",
  long: "long long",
  string: "string",
  "int[]": "vector<int>",
  "long[]": "vector<long long>",
  "string[]": "vector<string>",
};

/**
 * The value the untouched stub returns.
 *
 * A stub must COMPILE and RUN, not merely parse: a student who hits Submit before writing
 * anything should see WA, never CE. `vector<int>()` rather than `{}` for no reason beyond
 * being explicit about the type the student is expected to build.
 */
const CPP_ZERO: Readonly<Record<SignatureTypeName, string>> = {
  int: "0",
  long: "0",
  string: '""',
  "int[]": "vector<int>()",
  "long[]": "vector<long long>()",
  "string[]": "vector<string>()",
};

/**
 * Declared type -> the word the doc comment uses.
 *
 * HackerRank's vocabulary verbatim, because a student who has used HackerRank should recognise
 * this comment instantly — that recognition is the entire point of the change.
 */
const DOC_TYPE_WORD: Readonly<Record<SignatureTypeName, string>> = {
  int: "INTEGER",
  long: "LONG_INTEGER",
  string: "STRING",
  "int[]": "INTEGER_ARRAY",
  "long[]": "LONG_INTEGER_ARRAY",
  "string[]": "STRING_ARRAY",
};

/** Identical wording in all six languages; only the comment syntax differs. */
const BANNER_RULE = "// ---------------------------------------------------------------------------";
const BANNER_LINES: readonly string[] = [
  BANNER_RULE,
  "// Everything below reads the input and prints the answer.",
  "// You do not need to change anything below this line.",
  BANNER_RULE,
];

/** Where the caret goes on first render, and the only line the student is asked to replace. */
const WRITE_YOUR_CODE_HERE = "// Write your code here";

const isArrayType = (type: SignatureTypeName): boolean => type.endsWith("[]");

/** `an` before INTEGER and INTEGER_ARRAY, `a` before everything else — HackerRank's own article rule. */
const article = (word: string): string => (word.startsWith("INTEGER") ? "an" : "a");

const fields = (signature: Signature): readonly SignatureField[] => [
  ...(signature.shared ?? []),
  ...signature.params,
];

/** Every field is passed unless it says otherwise, so a declaration need not spell out the common case. */
const isPassed = (field: SignatureField): boolean => field.passed !== false;

/** The arguments the student's function receives, in declaration order: shared first, then params. */
export const cppArgumentNames = (signature: Signature): readonly string[] =>
  fields(signature).filter(isPassed).map((field) => field.name);

/**
 * A name for a generated local that cannot collide with anything the declaration named.
 *
 * This is not defensive decoration; it is a correctness fix for a bug the obvious emitter has.
 * Seven of the twenty authored problems declare a field called `q` and then repeat `q` times.
 * Emitting the natural `for (int q = 0; q < q; q++)` shadows the outer `q` inside the loop's own
 * condition, so the comparison is `0 < 0`, the loop body never runs, and the program prints
 * nothing while compiling perfectly. The same shadow exists in C, Java, Go and JS.
 *
 * HackerRank's `t_itr`/`i_itr` convention is collision-free for a structural reason worth
 * stating: a declared name matches `^[a-z][A-Za-z0-9]*$` and therefore can never contain an
 * underscore. The suffix loop below is the belt to that braces — it costs nothing and keeps
 * this emitter correct even if the identifier rule is ever widened.
 */
const uniqueLocal = (preferred: string, taken: ReadonlySet<string>): string => {
  let candidate = preferred;
  while (taken.has(candidate)) candidate += "_";
  return candidate;
};

/** A C++ string literal for a join separator. Only the characters a separator can contain. */
const cppStringLiteral = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\r/g, "\\r")}"`;

/**
 * `long long aVeryBigSum(vector<long long> ar)` — the line the student completes.
 *
 * Parameters are by value. A copy of 100 000 elements is nothing against the memory limit, and
 * `const vector<long long>&` on a warm-up problem is a reference-and-const lesson nobody signed
 * up for tonight.
 */
export const cppSignatureLine = (signature: Signature): string => {
  const declared = fields(signature)
    .filter(isPassed)
    .map((field) => `${CPP_TYPE[field.type]} ${field.name}`)
    .join(", ");
  return `${CPP_TYPE[signature.returns.type]} ${signature.name}(${declared})`;
};

/**
 * The doc comment above the stub: what the function returns, what arrives, in what order.
 *
 * HackerRank's phrasing verbatim, including the ungrammatical "following parameter(s)" — the
 * familiarity is the feature, so do not tidy it.
 *
 * Exported so the shared `generate.ts` can assert this emitter's prose matches the other five
 * rather than each of the six inventing its own wording.
 */
export const cppDocCommentLines = (signature: Signature): readonly string[] => {
  const returnWord = DOC_TYPE_WORD[signature.returns.type];
  const lines: string[] = [
    `Complete the '${signature.name}' function below.`,
    "",
    `The function is expected to return ${article(returnWord)} ${returnWord}.`,
  ];

  const passed = fields(signature).filter(isPassed);
  if (passed.length === 0) {
    lines.push("The function accepts no parameters.");
  } else {
    lines.push("The function accepts following parameter(s):");
    passed.forEach((field, index) => {
      lines.push(` ${index + 1}. ${DOC_TYPE_WORD[field.type]} ${field.name}`);
    });
  }

  return lines;
};

/** Wraps plain prose in the `/* ... *\/` block the stub sits under. */
const blockComment = (lines: readonly string[]): string[] => [
  "/*",
  ...lines.map((line) => (line === "" ? " *" : ` * ${line}`)),
  " */",
];

/** `cin >> x` for a scalar; a sized `vector` plus an extraction loop for an array. */
const readField = (field: SignatureField, indent: string, idxVar: string): string[] => {
  const type = CPP_TYPE[field.type];
  if (!isArrayType(field.type)) {
    // `cin >>` IS the token model: it skips whitespace and stops at whitespace, for `string`
    // exactly as for `int`. That is why every one of the twenty problems reads with one
    // operator and no line handling.
    return [`${indent}${type} ${field.name};`, `${indent}cin >> ${field.name};`];
  }
  const length = String(field.length);
  return [
    `${indent}${type} ${field.name}(${length});`,
    `${indent}for (int ${idxVar} = 0; ${idxVar} < ${length}; ${idxVar}++) cin >> ${field.name}[${idxVar}];`,
  ];
};

/** The call, and the printing of its result. Every call's output ends in a newline. */
const emitCall = (
  signature: Signature,
  indent: string,
  idxVar: string,
  resultVar: string,
): string[] => {
  const args = cppArgumentNames(signature).join(", ");
  const call = `${signature.name}(${args})`;

  if (!isArrayType(signature.returns.type)) {
    return [`${indent}cout << ${call} << "\\n";`];
  }

  const separator = cppStringLiteral(signature.returns.join ?? "\n");
  return [
    `${indent}${CPP_TYPE[signature.returns.type]} ${resultVar} = ${call};`,
    `${indent}for (int ${idxVar} = 0; ${idxVar} < (int)${resultVar}.size(); ${idxVar}++) {`,
    `${indent}    if (${idxVar} > 0) cout << ${separator};`,
    `${indent}    cout << ${resultVar}[${idxVar}];`,
    `${indent}}`,
    `${indent}cout << "\\n";`,
  ];
};

/**
 * Builds the whole file. `bodyExtra` is the only difference between a starter and a probe.
 *
 * Layout, identical in all six languages: includes -> STUDENT ZONE -> banner -> harness. The
 * student's cursor lands in the first third of the file, which is better than HackerRank, where
 * the plumbing comes first.
 */
const build = (signature: Signature, bodyExtra: readonly string[]): string => {
  const declaredNames = new Set<string>([...fields(signature).map((f) => f.name), signature.name]);
  const loopVar = uniqueLocal("t_itr", declaredNames);
  const idxVar = uniqueLocal("i_itr", declaredNames);
  const resultVar = uniqueLocal("result", declaredNames);
  const shared = signature.shared ?? [];

  const lines: string[] = [
    "#include <bits/stdc++.h>",
    "using namespace std;",
    "",
    ...blockComment(cppDocCommentLines(signature)),
    `${cppSignatureLine(signature)} {`,
    `    ${WRITE_YOUR_CODE_HERE}`,
    ...bodyExtra,
    `    return ${CPP_ZERO[signature.returns.type]};`,
    "}",
    "",
    ...BANNER_LINES,
    "int main() {",
    // Untying and unsyncing is worth roughly 2x on the 100 000-token inputs this bank already
    // ships, and it is safe here because the harness never mixes cin/cout with C stdio.
    "    ios::sync_with_stdio(false);",
    "    cin.tie(nullptr);",
    "",
  ];

  for (const field of shared) {
    lines.push(...readField(field, "    ", idxVar));
  }

  if (signature.repeat !== undefined) {
    if (shared.length > 0) lines.push("");
    lines.push(`    for (int ${loopVar} = 0; ${loopVar} < ${signature.repeat}; ${loopVar}++) {`);
    for (const field of signature.params) {
      lines.push(...readField(field, "        ", idxVar));
    }
    if (signature.params.length > 0) lines.push("");
    lines.push(...emitCall(signature, "        ", idxVar, resultVar));
    lines.push("    }");
  } else {
    for (const field of signature.params) {
      lines.push(...readField(field, "    ", idxVar));
    }
    if (signature.params.length > 0) lines.push("");
    lines.push(...emitCall(signature, "    ", idxVar, resultVar));
  }

  lines.push("", "    return 0;", "}", "");
  return lines.join("\n");
};

/**
 * The complete C++ program pre-filled into the editor for a problem that declares `signature`.
 *
 * Serves `CPP_11` and `CPP_17` identically — the two must never diverge, and that identity is
 * asserted structurally in the golden test rather than left to inspection.
 */
export const emitCpp = (signature: Signature): string => build(signature, []);

/**
 * The starter with echo statements inserted immediately after `// Write your code here`, the
 * zero return left in place.
 *
 * One judged pass over this proves two things at once. It proves **the starter compiles**,
 * because the probe contains the stub verbatim and removing the echoes cannot break a C++
 * translation unit (they declare no locals the return depends on). And it proves **this
 * harness reads the token stream in the same order as the other five**, because all six probes
 * are judged against one expected output generated from Python.
 *
 * The format is fixed across all six languages and must not be varied here: one line per
 * argument, in declaration order, once per call; an array as `<len>:` followed by a space and
 * each element. An empty array is `0:` with nothing after it.
 */
export const emitCppProbe = (signature: Signature): string => {
  const declaredNames = new Set<string>([...fields(signature).map((f) => f.name), signature.name]);
  const idxVar = uniqueLocal("i_itr", declaredNames);

  const echo: string[] = [];
  for (const field of fields(signature).filter(isPassed)) {
    if (isArrayType(field.type)) {
      echo.push(
        `    cout << ${field.name}.size() << ":";`,
        `    for (int ${idxVar} = 0; ${idxVar} < (int)${field.name}.size(); ${idxVar}++) cout << " " << ${field.name}[${idxVar}];`,
        `    cout << "\\n";`,
      );
    } else {
      echo.push(`    cout << ${field.name} << "\\n";`);
    }
  }
  return build(signature, echo);
};
