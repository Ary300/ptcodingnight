import type { CompletionItem, CompletionKind, LanguageProfile, LiveTemplate } from "./types";

/**
 * The Python profile, modelled on PyCharm for contest code that reads stdin and writes stdout.
 *
 * Python has no closing brace, so nothing dedents on type. A block opens on a trailing ":" (the
 * header of an if, for, def, class ...) or on a line left hanging on an open bracket, which is how
 * PyCharm decides that Enter should indent one level more.
 */

const OPENERS = "([{";
const CLOSERS = ")]}";

/**
 * The line with any trailing "#" comment removed. A "#" inside a string literal is text, so the
 * scan tracks single- and double-quoted strings, including escapes.
 */
function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line.charAt(i);
    if (quote !== null) {
      if (ch === "\\") {
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Bracket depth at the end of the line, ignoring brackets inside string literals. */
function bracketDepth(code: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code.charAt(i);
    if (quote !== null) {
      if (ch === "\\") {
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (OPENERS.includes(ch)) {
      depth += 1;
    } else if (CLOSERS.includes(ch)) {
      depth = Math.max(0, depth - 1);
    }
  }
  return depth;
}

function opensBlock(lineBeforeCaret: string): boolean {
  const code = stripComment(lineBeforeCaret).trimEnd();
  if (code.length === 0) return false;
  const last = code.charAt(code.length - 1);
  if (OPENERS.includes(last)) return true;
  // A ":" inside brackets is a slice or a dict entry (`a[1:`, `{k:`), never a block header.
  return last === ":" && bracketDepth(code) === 0;
}

const TEMPLATES: readonly LiveTemplate[] = [
  {
    abbreviation: "main",
    description: "The if __name__ == \"__main__\" guard",
    body: 'if __name__ == "__main__":\n    $END$',
  },
  { abbreviation: "for", description: "A for loop over an iterable", body: "for $END$ in :" },
  { abbreviation: "fori", description: "A for loop over range()", body: "for i in range($END$):" },
  { abbreviation: "def", description: "A function definition", body: "def $END$():" },
  { abbreviation: "inp", description: "Read one line from input", body: "input()$END$" },
  {
    abbreviation: "readints",
    description: "Read one line of integers into a list",
    body: "list(map(int, input().split()))$END$",
  },
  {
    abbreviation: "sysin",
    description: "Fast input through sys.stdin.readline",
    body: "import sys\ninput = sys.stdin.readline$END$",
  },
  { abbreviation: "prt", description: "Print a value", body: "print($END$)" },
];

/** Python 3.12's keyword.kwlist, which already includes True, False and None. */
const KEYWORDS: readonly string[] = [
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
];

/**
 * A call-style item. With `takesArgs` the caret lands between the parentheses, as PyCharm leaves
 * it; without, it lands after them, since there is nothing to type inside.
 */
function call(
  name: string,
  kind: CompletionKind,
  detail: string,
  takesArgs = true,
): CompletionItem {
  const insertText = `${name}()`;
  return {
    label: insertText,
    insertText,
    kind,
    detail,
    caretOffset: takesArgs ? name.length + 1 : insertText.length,
  };
}

/** A bare name: a class, a module or a constant. PyCharm inserts these without parentheses. */
function bare(name: string, kind: CompletionKind, detail: string): CompletionItem {
  return { label: name, insertText: name, kind, detail };
}

const BUILTIN_FUNCTIONS: readonly string[] = [
  "print",
  "input",
  "len",
  "range",
  "map",
  "filter",
  "zip",
  "sorted",
  "reversed",
  "sum",
  "min",
  "max",
  "abs",
  "enumerate",
  "any",
  "all",
  "ord",
  "chr",
  "divmod",
  "pow",
  "round",
  "isinstance",
];

/** Builtin classes. Inserted bare, because `map(int, ...)` wants the name as often as a call. */
const BUILTIN_TYPES: readonly string[] = [
  "int",
  "str",
  "float",
  "list",
  "dict",
  "set",
  "tuple",
];

const MODULES: readonly string[] = [
  "sys",
  "math",
  "collections",
  "itertools",
  "heapq",
  "bisect",
  "functools",
  "string",
];

const GLOBALS: readonly CompletionItem[] = [
  ...BUILTIN_FUNCTIONS.map((name) =>
    call(name, "function", "builtins", name !== "input"),
  ),
  ...BUILTIN_TYPES.map((name) => bare(name, "type", "builtins")),
  ...MODULES.map((name) => bare(name, "variable", "module")),
];

const MEMBERS: Readonly<Record<string, readonly CompletionItem[]>> = {
  math: [
    call("sqrt", "function", "float"),
    call("floor", "function", "int"),
    call("ceil", "function", "int"),
    call("gcd", "function", "int"),
    call("lcm", "function", "int"),
    bare("inf", "field", "float"),
    bare("pi", "field", "float"),
    call("isqrt", "function", "int"),
    call("comb", "function", "int"),
    call("perm", "function", "int"),
    call("log", "function", "float"),
    call("log2", "function", "float"),
  ],
  sys: [
    bare("stdin", "field", "TextIO"),
    bare("stdout", "field", "TextIO"),
    call("setrecursionlimit", "function", "None"),
    bare("maxsize", "field", "int"),
  ],
  "sys.stdin": [
    call("readline", "method", "str", false),
    call("read", "method", "str", false),
    call("readlines", "method", "list[str]", false),
  ],
  collections: [
    bare("Counter", "type", "collections"),
    bare("defaultdict", "type", "collections"),
    bare("deque", "type", "collections"),
    bare("OrderedDict", "type", "collections"),
  ],
  heapq: [
    call("heappush", "function", "None"),
    call("heappop", "function", "item"),
    call("heapify", "function", "None"),
    call("nlargest", "function", "list"),
    call("nsmallest", "function", "list"),
  ],
  bisect: [
    call("bisect_left", "function", "int"),
    call("bisect_right", "function", "int"),
    call("insort", "function", "None"),
  ],
  itertools: [
    call("permutations", "function", "iterator"),
    call("combinations", "function", "iterator"),
    call("accumulate", "function", "iterator"),
    call("product", "function", "iterator"),
    call("groupby", "function", "iterator"),
  ],
  functools: [
    call("lru_cache", "function", "decorator"),
    bare("cache", "function", "decorator"),
    call("reduce", "function", "value"),
  ],
  "*": [
    call("split", "method", "list[str]", false),
    call("strip", "method", "str", false),
    call("join", "method", "str"),
    call("append", "method", "None"),
    call("pop", "method", "item", false),
    call("sort", "method", "None", false),
    call("count", "method", "int"),
    call("index", "method", "int"),
    call("insert", "method", "None"),
    call("extend", "method", "None"),
    call("keys", "method", "keys", false),
    call("values", "method", "values", false),
    call("items", "method", "items", false),
    call("get", "method", "value"),
    call("add", "method", "None"),
    call("remove", "method", "None"),
    call("discard", "method", "None"),
    call("upper", "method", "str", false),
    call("lower", "method", "str", false),
    call("replace", "method", "str"),
    call("startswith", "method", "bool"),
    call("endswith", "method", "bool"),
    call("find", "method", "int"),
    call("isdigit", "method", "bool", false),
    call("isalpha", "method", "bool", false),
    call("format", "method", "str"),
    call("appendleft", "method", "None"),
    call("popleft", "method", "item", false),
    call("most_common", "method", "list", false),
  ],
};

export const PYTHON: LanguageProfile = {
  id: "python",
  lineComment: "#",
  indentUnit: "    ",
  pairs: [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ],
  quotes: ['"', "'"],
  opensBlock,
  dedentOnType: [],
  templates: TEMPLATES,
  keywords: KEYWORDS,
  globals: GLOBALS,
  members: MEMBERS,
};
