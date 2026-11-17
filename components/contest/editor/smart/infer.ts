/**
 * The type of a variable, read from the text the way a student reads it, for members after a dot.
 *
 * This is lexical inference only, with no type checker behind it: the nearest declaration above
 * the caret (`List<Integer> xs`, `vector<int> v`, `String[] parts`) or the nearest assignment of a
 * literal or a constructor call (`xs = []`, `seen = set()`, `q = deque()`). The answer is a key
 * into the profile's `typeMembers`, or null when the text does not say, in which case completion
 * falls back to the members it offers after anything.
 */

import type { EditorLanguage } from "./types";

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Java declared types that share one member list. */
const JAVA_FAMILY: Readonly<Record<string, string>> = {
  List: "List",
  ArrayList: "List",
  LinkedList: "List",
  Map: "Map",
  HashMap: "Map",
  TreeMap: "Map",
  LinkedHashMap: "Map",
  Set: "Set",
  HashSet: "Set",
  TreeSet: "Set",
  LinkedHashSet: "Set",
  Queue: "Deque",
  Deque: "Deque",
  ArrayDeque: "Deque",
  PriorityQueue: "Deque",
  Stack: "Deque",
  String: "String",
  StringBuilder: "StringBuilder",
  Scanner: "Scanner",
  BufferedReader: "BufferedReader",
};

const CPP_FAMILY: Readonly<Record<string, string>> = {
  vector: "vector",
  string: "string",
  map: "map",
  unordered_map: "map",
  set: "set",
  unordered_set: "set",
  multiset: "set",
  pair: "pair",
  queue: "queue",
  stack: "stack",
  priority_queue: "priority_queue",
  deque: "deque",
};

/** The last match before `before`, so the nearest declaration above the caret wins. */
function lastMatch(text: string, pattern: RegExp, before: number): RegExpExecArray | null {
  let found: RegExpExecArray | null = null;
  for (const match of text.matchAll(pattern)) {
    if (match.index >= before) break;
    found = match as RegExpExecArray;
  }
  return found;
}

function inferJava(text: string, name: string, before: number): string | null {
  const id = escape(name);
  const declared = lastMatch(
    text,
    new RegExp(`\\b([A-Z]\\w*|int|long|double|char|boolean)\\s*(<[^;=()]*>)?\\s*((?:\\[\\s*\\])*)\\s+${id}\\s*[=;,)]`, "g"),
    before,
  );
  if (declared !== null) {
    if ((declared[3] ?? "") !== "") return "array";
    const typeName = declared[1] ?? "";
    if (typeName !== "var") return JAVA_FAMILY[typeName] ?? null;
  }
  const constructed = lastMatch(text, new RegExp(`\\bvar\\s+${id}\\s*=\\s*new\\s+(\\w+)`, "g"), before);
  if (constructed !== null) return JAVA_FAMILY[constructed[1] ?? ""] ?? null;
  return null;
}

function inferCpp(text: string, name: string, before: number): string | null {
  const id = escape(name);
  const declared = lastMatch(
    text,
    new RegExp(`\\b(?:std::)?([a-z_]+)\\s*(?:<[^;=(){}]*>)?\\s*&?\\s*${id}\\s*[=;,({)\\[]`, "g"),
    before,
  );
  if (declared === null) return null;
  return CPP_FAMILY[declared[1] ?? ""] ?? null;
}

/** What a Python right-hand side evaluates to, when its first characters say. */
function pythonValueType(value: string): string | null {
  const rhs = value.trim();
  if (/^(?:\[|list\s*\(|sorted\s*\(|input\s*\(\s*\)\s*\.split\s*\()/.test(rhs)) return "list";
  if (/^(?:[rbf]?["']|str\s*\(|input\s*\()/.test(rhs)) return "str";
  if (/^(?:\{\s*\}|dict\s*\(|\{[^{}]*:)/.test(rhs)) return "dict";
  if (/^(?:set\s*\(|\{)/.test(rhs)) return "set";
  if (/^(?:collections\.)?deque\s*\(/.test(rhs)) return "deque";
  if (/^(?:collections\.)?Counter\s*\(/.test(rhs)) return "dict";
  if (/^(?:collections\.)?defaultdict\s*\(/.test(rhs)) return "dict";
  return null;
}

function inferPython(text: string, name: string, before: number): string | null {
  const id = escape(name);
  const assigned = lastMatch(text, new RegExp(`^[ \\t]*${id}\\s*(?::\\s*[\\w\\[\\], ]+)?=(?!=)([^\\n]*)`, "gm"), before);
  if (assigned === null) return null;
  return pythonValueType(assigned[1] ?? "");
}

/**
 * The member-list key for the variable `name` as the text declares or assigns it above `before`,
 * or null when it cannot be read off the text.
 */
export function inferType(text: string, name: string, before: number, language: EditorLanguage): string | null {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return null;
  if (language === "java") return inferJava(text, name, before);
  if (language === "cpp") return inferCpp(text, name, before);
  return inferPython(text, name, before);
}
