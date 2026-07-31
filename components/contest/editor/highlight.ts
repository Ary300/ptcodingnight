import type { Language } from "@/lib/schemas/judge";

/**
 * A small, dependency-free syntax tokenizer for the five runtimes this contest judges.
 *
 * ## Why this exists rather than a library
 *
 * PRD §10 asks for Monaco. `monaco-editor` is not installed and `package.json` is
 * orchestrator-owned, so this scope cannot add it — the dependency request is in the report.
 * What a student loses without highlighting is not decoration: an unclosed string or a stray
 * brace is invisible in flat text, and the feedback loop for that mistake becomes a compile
 * error thirty seconds later instead of a colour change as they type.
 *
 * So this is the 90% of the job that does not need 5 MB of editor: comments, strings, numbers
 * and keywords, which is where the useful signal is. It stays a **pure function over a string**
 * so the surface can memoise it and so it can be reasoned about without a DOM.
 *
 * ## It is deliberately not a parser
 *
 * It scans left to right and never looks at structure. A `#` inside a Python string is handled
 * (the string matcher wins because it starts first); a keyword used as a field name is coloured
 * as a keyword, which is wrong and harmless. The failure mode that matters is a token that eats
 * the rest of the file — an unterminated string does exactly that, and it should, because that
 * is precisely what the compiler is about to say.
 */

export type TokenKind = "plain" | "keyword" | "string" | "number" | "comment" | "punctuation";

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
}

interface Grammar {
  /** Longest first, so `//` is tried before `/`. */
  readonly lineComments: readonly string[];
  readonly blockComments: readonly (readonly [string, string])[];
  /** Longest first, so `"""` is tried before `"`. */
  readonly stringDelimiters: readonly string[];
  readonly keywords: ReadonlySet<string>;
}

/**
 * Keyword lists are short on purpose: control flow, declarations, and the literals.
 *
 * A complete list of every reserved word in Java would colour more of the screen without telling
 * a student anything more. What they are scanning for is where a block begins and ends.
 */
const C_LIKE_SHARED = [
  "break", "case", "catch", "char", "class", "const", "continue", "default", "do", "double",
  "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "int", "interface", "long", "namespace", "new", "package", "private", "protected",
  "public", "return", "short", "sizeof", "static", "struct", "switch", "template", "this",
  "throw", "throws", "try", "typedef", "union", "unsigned", "using", "void", "while",
] as const;

const PYTHON: Grammar = {
  lineComments: ["#"],
  blockComments: [],
  // Triple quotes first: `"""` must not be read as an empty `""` followed by a quote.
  stringDelimiters: ['"""', "'''", '"', "'"],
  keywords: new Set([
    "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif",
    "else", "except", "False", "finally", "for", "from", "global", "if", "import", "in", "is",
    "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return", "True", "try", "while",
    "with", "yield",
  ]),
};

const C_FAMILY: Grammar = {
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  stringDelimiters: ['"', "'"],
  keywords: new Set([...C_LIKE_SHARED, "auto", "bool", "false", "inline", "nullptr", "true"]),
};

const JAVA: Grammar = {
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  stringDelimiters: ['"', "'"],
  keywords: new Set([...C_LIKE_SHARED, "abstract", "boolean", "false", "instanceof", "null", "true"]),
};

const JAVASCRIPT: Grammar = {
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  // The backtick is a string delimiter here and nowhere else in this set.
  stringDelimiters: ['"', "'", "`"],
  keywords: new Set([
    "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "delete",
    "do", "else", "export", "extends", "false", "finally", "for", "from", "function", "if",
    "import", "in", "instanceof", "let", "new", "null", "of", "return", "static", "switch", "this",
    "throw", "true", "try", "typeof", "undefined", "var", "void", "while", "yield",
  ]),
};

const GO: Grammar = {
  lineComments: ["//"],
  blockComments: [["/*", "*/"]],
  stringDelimiters: ['"', "`", "'"],
  keywords: new Set([
    "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough",
    "false", "for", "func", "go", "goto", "if", "import", "interface", "map", "nil", "package",
    "range", "return", "select", "struct", "switch", "true", "type", "var",
  ]),
};

/**
 * Runtime id to grammar.
 *
 * Keyed by the shape of the id rather than by an exhaustive `Record<Language, Grammar>`, because
 * this file must not become a second place that has to change when a variant is added to
 * `lib/judge/runtimes.ts` (CLAUDE.md: adding a language is a line in the registry). An unknown id
 * falls back to the C family, which is wrong only in its keyword list.
 */
export function grammarFor(language: Language): Grammar {
  if (language.startsWith("PYTHON")) return PYTHON;
  if (language.startsWith("JAVASCRIPT")) return JAVASCRIPT;
  if (language.startsWith("JAVA")) return JAVA;
  if (language.startsWith("GO")) return GO;
  return C_FAMILY;
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

/** Where a string literal opened at `start` ends, one past its closing delimiter. */
function endOfString(source: string, start: number, delimiter: string): number {
  let index = start + delimiter.length;
  while (index < source.length) {
    // A backslash escapes whatever follows, including the closing quote and a newline.
    if (source[index] === "\\" && delimiter !== "`") {
      index += 2;
      continue;
    }
    if (source.startsWith(delimiter, index)) return index + delimiter.length;
    index += 1;
  }
  // Unterminated: it runs to the end of the file, which is what the compiler will also think.
  return source.length;
}

/**
 * Split `source` into coloured runs. Concatenating every `value` reproduces `source` exactly —
 * that is the invariant the overlay depends on, because a single dropped character shifts every
 * line after it out of alignment with the textarea underneath.
 */
export function tokenize(source: string, language: Language): readonly Token[] {
  const grammar = grammarFor(language);
  const tokens: Token[] = [];
  let pending = "";
  let pendingKind: TokenKind = "plain";

  const flush = (): void => {
    if (pending === "") return;
    tokens.push({ kind: pendingKind, value: pending });
    pending = "";
  };

  const push = (kind: TokenKind, value: string): void => {
    if (value === "") return;
    // Adjacent runs of the same kind merge, so a line of ordinary code is one span and not forty.
    if (kind === pendingKind) {
      pending += value;
      return;
    }
    flush();
    pendingKind = kind;
    pending = value;
  };

  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index, index + 3);

    const block = grammar.blockComments.find((pair) => source.startsWith(pair[0], index));
    if (block !== undefined) {
      const close = source.indexOf(block[1], index + block[0].length);
      const end = close === -1 ? source.length : close + block[1].length;
      push("comment", source.slice(index, end));
      index = end;
      continue;
    }

    const line = grammar.lineComments.find((marker) => source.startsWith(marker, index));
    if (line !== undefined) {
      const newline = source.indexOf("\n", index);
      const end = newline === -1 ? source.length : newline;
      push("comment", source.slice(index, end));
      index = end;
      continue;
    }

    const delimiter = grammar.stringDelimiters.find((quote) => rest.startsWith(quote));
    if (delimiter !== undefined) {
      const end = endOfString(source, index, delimiter);
      push("string", source.slice(index, end));
      index = end;
      continue;
    }

    const char = source[index] ?? "";

    if (isDigit(char)) {
      let end = index;
      // Deliberately greedy: `0x1f`, `1_000`, `3.14e-2f` and `100L` are all one number to a
      // reader, and splitting them into three tokens colours the middle of a literal.
      while (end < source.length && /[0-9a-fA-FxXoObB._]/.test(source[end] ?? "")) end += 1;
      push("number", source.slice(index, end));
      index = end;
      continue;
    }

    if (isIdentifierStart(char)) {
      let end = index;
      while (end < source.length && isIdentifierPart(source[end] ?? "")) end += 1;
      const word = source.slice(index, end);
      push(grammar.keywords.has(word) ? "keyword" : "plain", word);
      index = end;
      continue;
    }

    // Whitespace stays "plain" so it merges with the code around it rather than breaking runs.
    push(/\s/.test(char) ? "plain" : "punctuation", char);
    index += 1;
  }

  flush();
  return tokens;
}
