/**
 * The C++ profile's tables beyond names and templates: keyword tails, the header each std name
 * needs (CLion adds the #include on accept unless bits/stdc++.h is there), the members of the
 * containers contest code declares, and the header names offered after "#include <".
 */

import type { CompletionItem } from "./types";

/** CLion appends a space after these, and "()" with the caret inside after the control words. */
export const CPP_KEYWORD_TAILS: Readonly<Record<string, string>> = {
  return: " ",
  new: " ",
  delete: " ",
  const: " ",
  auto: " ",
  using: " ",
  namespace: " ",
  struct: " ",
  class: " ",
  else: " ",
  case: " ",
  throw: " ",
  typename: " ",
  static: " ",
  unsigned: " ",
  if: " (|)",
  for: " (|)",
  while: " (|)",
  switch: " (|)",
  catch: " (|)",
};

/** The header CLion includes for each name, where it is not the name's own detail. */
const HEADER_OF: Readonly<Record<string, string>> = {
  cout: "<iostream>",
  cin: "<iostream>",
  endl: "<iostream>",
  INT_MAX: "<climits>",
  INT_MIN: "<climits>",
  LLONG_MAX: "<climits>",
};

/** `item` with the #include it needs, read from HEADER_OF or from a detail written "<header>". */
export function withInclude(item: CompletionItem): CompletionItem {
  const name = /^[A-Za-z0-9_]+/.exec(item.label)?.[0] ?? item.label;
  const header = HEADER_OF[name] ?? (item.detail?.startsWith("<") === true ? item.detail : undefined);
  return header === undefined ? item : { ...item, importLine: `#include ${header}` };
}

function header(name: string): CompletionItem {
  return { label: name, insertText: name, kind: "variable", detail: "header" };
}

/** What "#include <" offers, bits/stdc++.h first because that is what contest code includes. */
export const CPP_HEADERS: readonly CompletionItem[] = [
  "bits/stdc++.h", "iostream", "vector", "string", "algorithm", "map", "set", "unordered_map",
  "unordered_set", "queue", "stack", "deque", "utility", "numeric", "cmath", "climits", "cstdio",
  "cstring", "cstdlib", "functional", "iomanip", "sstream", "array", "bitset", "list", "tuple",
].map(header);

export const C_HEADERS: readonly CompletionItem[] = [
  "stdio.h", "stdlib.h", "string.h", "math.h", "limits.h", "stdbool.h", "ctype.h", "stdint.h",
].map(header);

function call(name: string, params: string, returns: string, doc: string): CompletionItem {
  const insertText = `${name}()`;
  return {
    label: insertText,
    insertText,
    kind: "method",
    detail: returns,
    caretOffset: params === "" ? insertText.length : name.length + 1,
    doc: `${returns} ${name}(${params}). ${doc}`,
  };
}

function field(name: string, fieldType: string, doc: string): CompletionItem {
  return { label: name, insertText: name, kind: "field", detail: fieldType, doc: `${fieldType} ${name}. ${doc}` };
}

const VECTOR: readonly CompletionItem[] = [
  { ...call("push_back", "const T& value", "void", "Adds value at the end."), priority: 1 },
  call("pop_back", "", "void", "Removes the last element."),
  call("emplace_back", "Args&&... args", "reference", "Builds an element at the end from args."),
  call("size", "", "size_t", "The number of elements."),
  call("empty", "", "bool", "Whether there are no elements."),
  call("back", "", "reference", "The last element."),
  call("front", "", "reference", "The first element."),
  call("begin", "", "iterator", "An iterator to the first element, for sort(v.begin(), v.end())."),
  call("end", "", "iterator", "An iterator just past the last element."),
  call("clear", "", "void", "Removes every element."),
  call("resize", "size_t count", "void", "Grows or shrinks to count elements."),
  call("assign", "size_t count, const T& value", "void", "Replaces the contents with count copies of value."),
  call("insert", "iterator pos, const T& value", "iterator", "Inserts value before pos."),
  call("erase", "iterator pos", "iterator", "Removes the element at pos."),
  call("at", "size_t pos", "reference", "The element at pos, checked against the size."),
];

const STRING: readonly CompletionItem[] = [
  call("length", "", "size_t", "The number of characters."),
  call("size", "", "size_t", "The number of characters."),
  call("substr", "size_t pos, size_t count", "string", "count characters starting at pos."),
  call("find", "const string& str", "size_t", "Where str first appears, or string::npos."),
  call("push_back", "char ch", "void", "Adds ch at the end."),
  call("pop_back", "", "void", "Removes the last character."),
  call("empty", "", "bool", "Whether the string is empty."),
  call("back", "", "char&", "The last character."),
  call("begin", "", "iterator", "An iterator to the first character."),
  call("end", "", "iterator", "An iterator just past the last character."),
  call("c_str", "", "const char*", "The characters for a C function such as printf."),
  call("append", "const string& str", "string&", "Adds str at the end."),
  call("insert", "size_t pos, const string& str", "string&", "Inserts str at pos."),
  call("erase", "size_t pos, size_t count", "string&", "Removes count characters from pos."),
  call("clear", "", "void", "Removes every character."),
];

const MAP: readonly CompletionItem[] = [
  call("count", "const Key& key", "size_t", "1 when key is present, 0 when not."),
  call("find", "const Key& key", "iterator", "An iterator to key's entry, or end()."),
  call("insert", "const value_type& value", "pair<iterator, bool>", "Adds the pair unless the key is present."),
  call("erase", "const Key& key", "size_t", "Removes key."),
  call("size", "", "size_t", "The number of keys."),
  call("empty", "", "bool", "Whether there are no keys."),
  call("begin", "", "iterator", "An iterator to the first entry; entries are pairs (first, second)."),
  call("end", "", "iterator", "An iterator just past the last entry."),
  call("clear", "", "void", "Removes every key."),
  call("lower_bound", "const Key& key", "iterator", "The first entry not less than key (map only)."),
  call("upper_bound", "const Key& key", "iterator", "The first entry greater than key (map only)."),
];

const SET: readonly CompletionItem[] = [
  call("insert", "const T& value", "pair<iterator, bool>", "Adds value unless present."),
  call("count", "const T& value", "size_t", "1 when value is present, 0 when not."),
  call("find", "const T& value", "iterator", "An iterator to value, or end()."),
  call("erase", "const T& value", "size_t", "Removes value."),
  call("size", "", "size_t", "The number of elements."),
  call("empty", "", "bool", "Whether there are no elements."),
  call("begin", "", "iterator", "An iterator to the smallest element (set)."),
  call("end", "", "iterator", "An iterator just past the largest element."),
  call("clear", "", "void", "Removes every element."),
  call("lower_bound", "const T& value", "iterator", "The first element not less than value (set only)."),
  call("upper_bound", "const T& value", "iterator", "The first element greater than value (set only)."),
];

const PAIR: readonly CompletionItem[] = [
  field("first", "T1", "The first value."),
  field("second", "T2", "The second value."),
];

const QUEUE: readonly CompletionItem[] = [
  call("push", "const T& value", "void", "Adds value at the back."),
  call("pop", "", "void", "Removes the front element; it does not return it."),
  call("front", "", "reference", "The front element."),
  call("back", "", "reference", "The back element."),
  call("size", "", "size_t", "The number of elements."),
  call("empty", "", "bool", "Whether it is empty."),
];

const STACK: readonly CompletionItem[] = [
  call("push", "const T& value", "void", "Adds value on top."),
  call("pop", "", "void", "Removes the top element; it does not return it."),
  call("top", "", "reference", "The top element."),
  call("size", "", "size_t", "The number of elements."),
  call("empty", "", "bool", "Whether it is empty."),
];

const DEQUE: readonly CompletionItem[] = [
  call("push_back", "const T& value", "void", "Adds value at the back."),
  call("push_front", "const T& value", "void", "Adds value at the front."),
  call("pop_back", "", "void", "Removes the back element."),
  call("pop_front", "", "void", "Removes the front element."),
  call("front", "", "reference", "The front element."),
  call("back", "", "reference", "The back element."),
  call("size", "", "size_t", "The number of elements."),
  call("empty", "", "bool", "Whether it is empty."),
  call("clear", "", "void", "Removes every element."),
];

export const CPP_TYPE_MEMBERS: Readonly<Record<string, readonly CompletionItem[]>> = {
  vector: VECTOR,
  string: STRING,
  map: MAP,
  set: SET,
  pair: PAIR,
  queue: QUEUE,
  stack: STACK,
  priority_queue: STACK,
  deque: DEQUE,
};
