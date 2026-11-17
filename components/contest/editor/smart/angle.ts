/**
 * When "<" is a generic or template bracket rather than less-than.
 *
 * IntelliJ and CLion pair "<" with ">" after a type name (`List<`, `Map<`, `vector<`, `pair<`) and
 * after `#include `, and never in an expression such as `a < b` or `i<n`. "<" is deliberately not
 * in any profile's `pairs`, which would pair every comparison.
 */

import { BRACE_LANGUAGES } from "./text";
import type { LanguageProfile } from "./types";

/** C++ names that take a template argument list, as a contest program writes them. */
const CPP_TEMPLATES: ReadonlySet<string> = new Set([
  "vector",
  "map",
  "set",
  "pair",
  "tuple",
  "array",
  "list",
  "queue",
  "stack",
  "deque",
  "priority_queue",
  "unordered_map",
  "unordered_set",
  "multimap",
  "multiset",
  "bitset",
  "greater",
  "less",
  "function",
  "optional",
  "numeric_limits",
  "basic_string",
  "template",
  "static_cast",
  "dynamic_cast",
  "reinterpret_cast",
  "const_cast",
]);

/** A Java type name: capitalised and not a constant (`List`, `ArrayList`; never `N` or `MAX`). */
const JAVA_TYPE = /(?:^|[^A-Za-z0-9_$])([A-Z][A-Za-z0-9_$]*[a-z][A-Za-z0-9_$]*)$/;
const CPP_NAME = /(?:^|[^A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)$/;
const INCLUDE = /^\s*#\s*include\s*$/;

/** Whether a "<" typed after `lineBeforeCaret` opens a type argument list. */
export function opensAngle(lineBeforeCaret: string, profile: LanguageProfile): boolean {
  if (!BRACE_LANGUAGES.has(profile.id)) return false;
  if (profile.id === "java") return JAVA_TYPE.test(lineBeforeCaret);
  if (INCLUDE.test(lineBeforeCaret)) return true;
  const name = CPP_NAME.exec(lineBeforeCaret)?.[1];
  return name !== undefined && CPP_TEMPLATES.has(name);
}

/**
 * Whether the line before the caret holds an angle bracket still open, so a typed ">" steps over
 * the ">" after the caret. Shifts (`<<`, `>>`), `->` and `<=` are operators, never brackets.
 */
export function hasOpenAngle(lineBeforeCaret: string, profile: LanguageProfile): boolean {
  let depth = 0;
  for (let i = 0; i < lineBeforeCaret.length; i += 1) {
    const ch = lineBeforeCaret[i];
    if (ch === "<" && opensAngle(lineBeforeCaret.slice(0, i), profile)) depth += 1;
    else if (ch === ">" && lineBeforeCaret[i - 1] !== "-" && depth > 0) depth -= 1;
  }
  return depth > 0;
}
