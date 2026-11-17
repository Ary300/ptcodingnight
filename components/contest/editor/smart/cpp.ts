/**
 * The C++ profile, modelled on CLion for contest C++17: one file, stdin to stdout, and almost
 * always `#include <bits/stdc++.h>` with `using namespace std;` at the top.
 *
 * Completion after "::" works the same way as after ".": the qualifier is the name before the
 * separator, so `std::vec|` looks up `members.std` and `x.pu|` falls through to `members["*"]`.
 * The qualifier is computed by completion.ts; this file only supplies the tables.
 */

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

/** CLion indents after a line that ends with an opener, ignoring trailing spaces and comments. */
function opensBlock(lineBeforeCaret: string): boolean {
  const code = withoutTrailingComment(lineBeforeCaret).trimEnd();
  return OPENERS.has(code.slice(-1));
}

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
  {
    abbreviation: "fori",
    description: "Indexed for loop",
    body: "for (int i = 0; i < $END$; i++) {\n}",
  },
  {
    abbreviation: "forr",
    description: "Range-based for loop",
    body: "for (auto &x : $END$) {\n}",
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
const GLOBALS: readonly CompletionItem[] = [
  ...STD_NAMES,
  type("long long", "64-bit integer"),
  variable("INT_MAX", "<climits>"),
  variable("INT_MIN", "<climits>"),
  variable("LLONG_MAX", "<climits>"),
  type("std", "namespace"),
];

/** Members offered after any `.` or `->`, since the editor does not infer the receiver's type. */
const ANY_MEMBER: readonly CompletionItem[] = [
  nullary("size", "size_t"),
  call("push_back", "method", "void"),
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
  { label: "first", insertText: "first", kind: "field", detail: "pair" },
  { label: "second", insertText: "second", kind: "field", detail: "pair" },
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
  keywords: KEYWORDS,
  globals: GLOBALS,
  members: {
    std: STD_NAMES,
    "*": ANY_MEMBER,
  },
};
