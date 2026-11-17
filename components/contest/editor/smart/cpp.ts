/**
 * The C++ profile, modelled on CLion for contest C++17: one file, stdin to stdout, and almost
 * always `#include <bits/stdc++.h>` with `using namespace std;` at the top.
 *
 * Completion after "::" works the same way as after ".": the qualifier is the name before the
 * separator, so `std::vec|` looks up `members.std` and `x.pu|` falls through to `members["*"]`.
 * The qualifier is computed by completion.ts; this file only supplies the tables.
 */

import { C_HEADERS, CPP_HEADERS, CPP_KEYWORD_TAILS, CPP_TYPE_MEMBERS, withInclude } from "./cpp-extras";
import type { CompletionItem, LanguageProfile, LiveTemplate } from "./types";

const OPENERS = new Set(["{", "(", "["]);

/**
 * The line with any trailing `//` comment and any trailing `/* ... *\/` comment removed. Quotes
 * are tracked, so `"http://x"` and `'/'` are not mistaken for the start of a comment.
 */
function withoutTrailingComment(line: string): string {
  let quote: string | null = null;
  let codeEnd = line.length;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") {
      codeEnd = i;
      break;
    }
    if (ch === "/" && line[i + 1] === "*") {
      const close = line.indexOf("*/", i + 2);
      if (close === -1) {
        codeEnd = i;
        break;
      }
      // A block comment that closes on this line only counts as trailing if nothing but
      // whitespace follows it; otherwise it sits mid-line and the code goes on after it.
      if (line.slice(close + 2).trim() === "") {
        codeEnd = i;
        break;
      }
      i = close + 2;
      continue;
    }
    i += 1;
  }
  return line.slice(0, codeEnd);
}

/**
 * CLion indents after a line that ends with an opener, ignoring trailing spaces and comments, and
 * after a label whose statements sit one level in: `case 1:`, `default:`, `public:`.
 */
function opensBlock(lineBeforeCaret: string): boolean {
  const code = withoutTrailingComment(lineBeforeCaret).trimEnd();
  if (LABEL.test(code)) return true;
  return OPENERS.has(code.slice(-1));
}

const LABEL = /^\s*(?:case\b.*|default\s*|public|private|protected)\s*:$/;

const TEMPLATES: readonly LiveTemplate[] = [
  {
    abbreviation: "main",
    description: "int main() with return 0",
    body: "int main() {\n    $END$\n    return 0;\n}",
  },
  {
    abbreviation: "fastio",
    description: "Fast input and output",
    body: "ios::sync_with_stdio(false);\ncin.tie(nullptr);$END$",
  },
  // CLion's names: `for` counts up, `forr` counts down, `foreach` (and the older `iter`) is the
  // range-based loop. `fori` stays as IntelliJ's name for the same loop as `for`, for habit's sake.
  {
    abbreviation: "for",
    description: "Iterate over a range of integers",
    body: "for (int i = 0; i < ${1:n}; ++i) {\n\t$END$\n}",
  },
  {
    abbreviation: "fori",
    description: "Indexed for loop",
    body: "for (int i = 0; i < ${1}; i++) {\n\t$END$\n}",
  },
  {
    abbreviation: "forr",
    description: "Iterate over a range of integers in reverse",
    body: "for (int i = ${1:n} - 1; i >= 0; --i) {\n\t$END$\n}",
  },
  {
    abbreviation: "foreach",
    description: "Range-based for loop",
    body: "for (auto &${2:x} : ${1}) {\n\t$END$\n}",
  },
  {
    abbreviation: "iter",
    description: "Range-based for loop",
    body: "for (auto &${2:x} : ${1}) {\n\t$END$\n}",
  },
  {
    abbreviation: "cout",
    description: "Print a value and a newline",
    body: "cout << $END$ << '\\n';",
  },
  {
    abbreviation: "cin",
    description: "Read a value",
    body: "cin >> $END$;",
  },
  {
    abbreviation: "vi",
    description: "Declare a vector<int>",
    body: "vector<int> $END$;",
  },
  {
    abbreviation: "ll",
    description: "Declare a long long",
    body: "long long $END$;",
  },
  {
    abbreviation: "inc",
    description: "Include a header",
    body: "#include <$END$>",
  },
];

/** CLion's postfix templates, typed after an expression and a dot, plus `cout` for the habit. */
const POSTFIX: readonly LiveTemplate[] = [
  { abbreviation: "fori", description: "Counts up to the expression", body: "for (int i = 0; i < $EXPR$; i++) {\n\t$END$\n}" },
  { abbreviation: "forr", description: "Counts down from the expression", body: "for (int i = $EXPR$ - 1; i >= 0; i--) {\n\t$END$\n}" },
  { abbreviation: "for", description: "Iterates over the expression", body: "for (auto &${1:x} : $EXPR$) {\n\t$END$\n}" },
  { abbreviation: "if", description: "Checks the expression", body: "if ($EXPR$) {\n\t$END$\n}" },
  { abbreviation: "while", description: "Loops while the expression holds", body: "while ($EXPR$) {\n\t$END$\n}" },
  { abbreviation: "not", description: "Negates the expression", body: "!$EXPR$$END$" },
  { abbreviation: "return", description: "Returns the expression", body: "return $EXPR$;$END$" },
  { abbreviation: "cout", description: "Prints the expression", body: "cout << $EXPR$ << '\\n';$END$" },
];

/** C++17 keywords, alternative operator tokens included, as CLion highlights them. */
const KEYWORDS: readonly string[] = [
  "alignas",
  "alignof",
  "and",
  "and_eq",
  "asm",
  "auto",
  "bitand",
  "bitor",
  "bool",
  "break",
  "case",
  "catch",
  "char",
  "char16_t",
  "char32_t",
  "class",
  "compl",
  "const",
  "const_cast",
  "constexpr",
  "continue",
  "decltype",
  "default",
  "delete",
  "do",
  "double",
  "dynamic_cast",
  "else",
  "enum",
  "explicit",
  "export",
  "extern",
  "false",
  "float",
  "for",
  "friend",
  "goto",
  "if",
  "inline",
  "int",
  "long",
  "mutable",
  "namespace",
  "new",
  "noexcept",
  "not",
  "not_eq",
  "nullptr",
  "operator",
  "or",
  "or_eq",
  "private",
  "protected",
  "public",
  "register",
  "reinterpret_cast",
  "return",
  "short",
  "signed",
  "sizeof",
  "static",
  "static_assert",
  "static_cast",
  "struct",
  "switch",
  "template",
  "this",
  "thread_local",
  "throw",
  "true",
  "try",
  "typedef",
  "typeid",
  "typename",
  "union",
  "unsigned",
  "using",
  "virtual",
  "void",
  "volatile",
  "wchar_t",
  "while",
  "xor",
  "xor_eq",
];

/** A call whose caret lands between the parentheses, ready for the first argument. */
function call(name: string, kind: "function" | "method", detail?: string): CompletionItem {
  return { label: `${name}()`, insertText: `${name}()`, kind, detail, caretOffset: name.length + 1 };
}

/** A call that takes no arguments, so the caret goes after the closing parenthesis. */
function nullary(name: string, detail?: string): CompletionItem {
  return { label: `${name}()`, insertText: `${name}()`, kind: "method", detail };
}

function type(name: string, detail: string): CompletionItem {
  return { label: name, insertText: name, kind: "type", detail };
}

function variable(name: string, detail: string): CompletionItem {
  return { label: name, insertText: name, kind: "variable", detail };
}

/** Names that live in namespace std, so they are offered both bare and after `std::`. */
const STD_NAMES: readonly CompletionItem[] = [
  variable("cout", "ostream"),
  variable("cin", "istream"),
  variable("endl", "ostream"),
  type("vector", "<vector>"),
  type("string", "<string>"),
  type("map", "<map>"),
  type("unordered_map", "<unordered_map>"),
  type("set", "<set>"),
  type("unordered_set", "<unordered_set>"),
  type("pair", "<utility>"),
  call("make_pair", "function", "<utility>"),
  type("queue", "<queue>"),
  type("priority_queue", "<queue>"),
  type("stack", "<stack>"),
  type("deque", "<deque>"),
  call("sort", "function", "<algorithm>"),
  call("reverse", "function", "<algorithm>"),
  call("max", "function", "<algorithm>"),
  call("min", "function", "<algorithm>"),
  call("abs", "function", "<cstdlib>"),
  call("swap", "function", "<utility>"),
  call("accumulate", "function", "<numeric>"),
  call("lower_bound", "function", "<algorithm>"),
  call("upper_bound", "function", "<algorithm>"),
  call("getline", "function", "<string>"),
  call("to_string", "function", "<string>"),
  call("stoi", "function", "<string>"),
  call("stoll", "function", "<string>"),
  type("size_t", "<cstddef>"),
  type("greater", "<functional>"),
];

/**
 * Top-level names. `long long`, the limit macros and `std` itself are not members of std, so they
 * appear here and not after `std::`, where offering them would suggest code that does not compile.
 */
/** C's standard input and output, which C++ contest code also reaches for when it wants speed. */
const STDIO: readonly CompletionItem[] = [
  call("printf", "function", "<cstdio>"),
  call("scanf", "function", "<cstdio>"),
  call("puts", "function", "<cstdio>"),
  { ...call("getchar", "function", "<cstdio>"), caretOffset: "getchar()".length },
  call("putchar", "function", "<cstdio>"),
  call("fgets", "function", "<cstdio>"),
];

const LIMITS: readonly CompletionItem[] = [
  type("long long", "64-bit integer"),
  variable("INT_MAX", "<climits>"),
  variable("INT_MIN", "<climits>"),
  variable("LLONG_MAX", "<climits>"),
];

const GLOBALS: readonly CompletionItem[] = [...STD_NAMES, ...STDIO, ...LIMITS, type("std", "namespace")];

/**
 * The calls contest code makes most, ranked above rarer members that match the same letters:
 * `v.pu` and `v.pb` mean push_back, `p.fi` means first. CLion knows from the receiver's type; the
 * editor does not infer types, so it knows from what students write.
 */
const COMMON = 1;

/** Members offered after any `.` or `->`, since the editor does not infer the receiver's type. */
const ANY_MEMBER: readonly CompletionItem[] = [
  nullary("size", "size_t"),
  { ...call("push_back", "method", "void"), priority: COMMON },
  nullary("pop_back", "void"),
  call("emplace_back", "method", "void"),
  nullary("begin", "iterator"),
  nullary("end", "iterator"),
  nullary("rbegin", "iterator"),
  nullary("rend", "iterator"),
  nullary("front", "reference"),
  nullary("back", "reference"),
  nullary("empty", "bool"),
  nullary("clear", "void"),
  call("insert", "method", "iterator"),
  call("erase", "method", "iterator"),
  call("find", "method", "iterator"),
  call("count", "method", "size_t"),
  call("substr", "method", "string"),
  nullary("length", "size_t"),
  { label: "first", insertText: "first", kind: "field", detail: "pair", priority: COMMON },
  { label: "second", insertText: "second", kind: "field", detail: "pair", priority: COMMON },
  nullary("top", "reference"),
  call("push", "method", "void"),
  nullary("pop", "void"),
  call("at", "method", "reference"),
  call("resize", "method", "void"),
  call("assign", "method", "void"),
  nullary("c_str", "const char*"),
];

export const CPP: LanguageProfile = {
  id: "cpp",
  lineComment: "//",
  indentUnit: "    ",
  pairs: [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ],
  quotes: ['"', "'"],
  opensBlock,
  dedentOnType: ["}"],
  templates: TEMPLATES,
  postfixTemplates: POSTFIX,
  keywords: KEYWORDS,
  globals: GLOBALS.map(withInclude),
  members: {
    // `std::vec` brings its #include in as bare `vec` does: GCC's <iostream> does not supply vector.
    std: STD_NAMES.map(withInclude),
    "*": ANY_MEMBER,
  },
  keywordTails: CPP_KEYWORD_TAILS,
  typeMembers: CPP_TYPE_MEMBERS,
  importTargets: { "#include": CPP_HEADERS },
};

/** C17's keywords. None of C++'s: `private`, `class` and `nullptr` do not compile as C. */
const C_KEYWORDS: readonly string[] = [
  "auto", "break", "case", "char", "const", "continue", "default", "do", "double", "else", "enum",
  "extern", "float", "for", "goto", "if", "inline", "int", "long", "register", "restrict",
  "return", "short", "signed", "sizeof", "static", "struct", "switch", "typedef", "union",
  "unsigned", "void", "volatile", "while", "_Bool",
];

const C_GLOBALS: readonly CompletionItem[] = [
  ...STDIO,
  ...LIMITS,
  call("malloc", "function", "<stdlib.h>"),
  call("free", "function", "<stdlib.h>"),
  call("qsort", "function", "<stdlib.h>"),
  call("abs", "function", "<stdlib.h>"),
  call("memset", "function", "<string.h>"),
  call("memcpy", "function", "<string.h>"),
  call("strlen", "function", "<string.h>"),
  call("strcmp", "function", "<string.h>"),
  call("strcpy", "function", "<string.h>"),
  variable("NULL", "<stddef.h>"),
  type("size_t", "<stddef.h>"),
];

/**
 * C gets CLion's editing (braces, comments, Enter, `};` after a struct) with C's own names: stdio
 * instead of iostream, no std::, and no C++ keywords in the list. Its members after "." are the
 * struct fields the file declares, which completion finds on its own.
 */
export const C: LanguageProfile = {
  ...CPP,
  templates: TEMPLATES.filter((template) => ["main", "fori", "inc"].includes(template.abbreviation)),
  postfixTemplates: POSTFIX.filter((template) => template.abbreviation !== "cout" && template.abbreviation !== "for"),
  keywords: C_KEYWORDS,
  globals: C_GLOBALS,
  members: {},
  typeMembers: {},
  importTargets: { "#include": C_HEADERS },
};
