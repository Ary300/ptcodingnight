/**
 * The Python profile's tables beyond names and templates: keyword tails, the names PyCharm
 * offers before they are imported (with the import it adds), the members of list, str, dict, set
 * and deque for a variable whose value the text shows, and what an import statement can name.
 */

import type { CompletionItem, CompletionKind } from "./types";

/**
 * A call. PyCharm leaves the caret inside the parentheses whenever the function takes any
 * parameter, optional ones included (`input(|)`, `split(|)`), and after them only when it takes none.
 */
function call(name: string, kind: CompletionKind, detail: string, params: string, doc: string): CompletionItem {
  const insertText = `${name}()`;
  return {
    label: insertText,
    insertText,
    kind,
    detail,
    caretOffset: params === "" ? insertText.length : name.length + 1,
    doc: `${name}(${params}). ${doc}`,
  };
}

/** PyCharm's keyword completion: a space after most, a colon after else, try and finally. */
export const PYTHON_KEYWORD_TAILS: Readonly<Record<string, string>> = {
  def: " ",
  class: " ",
  if: " ",
  elif: " ",
  for: " ",
  while: " ",
  return: " ",
  import: " ",
  from: " ",
  in: " ",
  not: " ",
  and: " ",
  or: " ",
  is: " ",
  as: " ",
  with: " ",
  lambda: " ",
  assert: " ",
  raise: " ",
  del: " ",
  global: " ",
  nonlocal: " ",
  yield: " ",
  except: " ",
  else: ":",
  try: ":",
  finally: ":",
};

function imported(module: string, item: CompletionItem): CompletionItem {
  return { ...item, detail: module, importLine: `from ${module} import ${item.label.replace("()", "")}` };
}

function bare(name: string, kind: CompletionKind, detail: string, doc: string): CompletionItem {
  return { label: name, insertText: name, kind, detail, doc: `${name}. ${doc}` };
}

/** Names offered at the top level that PyCharm imports on accept, as `from module import name`. */
export const PYTHON_IMPORTABLES: readonly CompletionItem[] = [
  imported("collections", bare("deque", "type", "collections", "A double-ended queue: append, appendleft, pop and popleft are all fast.")),
  imported("collections", bare("Counter", "type", "collections", "A dict that counts: Counter(\"abca\")[\"a\"] is 2.")),
  imported("collections", bare("defaultdict", "type", "collections", "A dict that fills a missing key: defaultdict(int), defaultdict(list).")),
  imported("heapq", call("heappush", "function", "heapq", "heap, item", "Adds item to the min-heap list.")),
  imported("heapq", call("heappop", "function", "heapq", "heap", "Removes and returns the smallest item.")),
  imported("heapq", call("heapify", "function", "heapq", "x", "Turns the list into a min-heap in place.")),
  imported("bisect", call("bisect_left", "function", "bisect", "a, x", "The first index where x could go in the sorted list a.")),
  imported("bisect", call("bisect_right", "function", "bisect", "a, x", "The index just past the last x in the sorted list a.")),
  imported("bisect", call("insort", "function", "bisect", "a, x", "Inserts x into the sorted list a, keeping it sorted.")),
  imported("itertools", call("permutations", "function", "itertools", "iterable, r=None", "Every ordering of the items.")),
  imported("itertools", call("combinations", "function", "itertools", "iterable, r", "Every choice of r items, order ignored.")),
  imported("itertools", call("accumulate", "function", "itertools", "iterable", "Running totals.")),
  imported("functools", call("lru_cache", "function", "functools", "maxsize=128", "A decorator that remembers results. Use maxsize=None for memoisation.")),
  imported("functools", call("reduce", "function", "functools", "function, iterable", "Folds the items into one value.")),
];

const MODULE_DOCS: Readonly<Record<string, string>> = {
  sys: "Interpreter access: sys.stdin.readline for fast input, sys.setrecursionlimit.",
  math: "sqrt, gcd, ceil, floor, inf, pi and more.",
  collections: "deque, Counter, defaultdict.",
  itertools: "permutations, combinations, accumulate, product.",
  heapq: "A min-heap on a plain list: heappush, heappop, heapify.",
  bisect: "Binary search on a sorted list: bisect_left, bisect_right, insort.",
  functools: "lru_cache, cache and reduce.",
  string: "Constants such as ascii_lowercase and digits.",
};

/** The module names `import ` offers. Accepting one at the top level imports it. */
export const PYTHON_MODULES: readonly CompletionItem[] = Object.entries(MODULE_DOCS).map(([name, doc]) => ({
  label: name,
  insertText: name,
  kind: "variable",
  detail: "module",
  importLine: `import ${name}`,
  doc: `${name}. ${doc}`,
}));

const LIST: readonly CompletionItem[] = [
  call("append", "method", "None", "object", "Adds object to the end."),
  call("pop", "method", "item", "index=-1", "Removes and returns the item at index, the last by default."),
  call("sort", "method", "None", "key=None, reverse=False", "Sorts the list in place."),
  call("insert", "method", "None", "index, object", "Inserts object before index."),
  call("extend", "method", "None", "iterable", "Adds every item of iterable to the end."),
  call("index", "method", "int", "value", "Where value first appears. Raises ValueError when it does not."),
  call("count", "method", "int", "value", "How many times value appears."),
  call("remove", "method", "None", "value", "Removes the first value."),
  call("reverse", "method", "None", "", "Reverses the list in place."),
  call("copy", "method", "list", "", "A shallow copy."),
  call("clear", "method", "None", "", "Removes every item."),
];

const STR: readonly CompletionItem[] = [
  call("split", "method", "list[str]", "sep=None, maxsplit=-1", "The words, split on any whitespace by default."),
  call("strip", "method", "str", "chars=None", "A copy without leading and trailing whitespace."),
  call("join", "method", "str", "iterable", "The strings of iterable joined with this one between them."),
  call("replace", "method", "str", "old, new", "A copy with every old replaced by new."),
  call("startswith", "method", "bool", "prefix", "Whether the string begins with prefix."),
  call("endswith", "method", "bool", "suffix", "Whether the string ends with suffix."),
  call("find", "method", "int", "sub", "Where sub first appears, or -1."),
  call("count", "method", "int", "sub", "How many times sub appears, without overlaps."),
  call("upper", "method", "str", "", "A copy in upper case."),
  call("lower", "method", "str", "", "A copy in lower case."),
  call("isdigit", "method", "bool", "", "Whether every character is a digit."),
  call("isalpha", "method", "bool", "", "Whether every character is a letter."),
  call("format", "method", "str", "*args, **kwargs", "Fills the {} fields."),
  call("index", "method", "int", "sub", "Where sub first appears. Raises ValueError when it does not."),
];

const DICT: readonly CompletionItem[] = [
  call("get", "method", "value", "key, default=None", "The value for key, or default."),
  call("keys", "method", "keys", "", "The keys."),
  call("values", "method", "values", "", "The values."),
  call("items", "method", "items", "", "The (key, value) pairs, for a for loop."),
  call("pop", "method", "value", "key", "Removes key and returns its value."),
  call("setdefault", "method", "value", "key, default=None", "The value for key, storing default first when missing."),
  call("update", "method", "None", "other", "Copies other's keys in."),
  call("most_common", "method", "list", "n=None", "Counter only: the n most common items with their counts."),
  call("clear", "method", "None", "", "Removes every key."),
];

const SET: readonly CompletionItem[] = [
  call("add", "method", "None", "element", "Adds element."),
  call("remove", "method", "None", "element", "Removes element. Raises KeyError when it is missing."),
  call("discard", "method", "None", "element", "Removes element when present."),
  call("pop", "method", "item", "", "Removes and returns some element."),
  call("union", "method", "set", "*others", "Every element of either set."),
  call("intersection", "method", "set", "*others", "The elements in both."),
  call("clear", "method", "None", "", "Removes every element."),
];

const DEQUE: readonly CompletionItem[] = [
  call("append", "method", "None", "x", "Adds x on the right."),
  call("appendleft", "method", "None", "x", "Adds x on the left."),
  call("pop", "method", "item", "", "Removes and returns the rightmost item."),
  call("popleft", "method", "item", "", "Removes and returns the leftmost item."),
  call("extend", "method", "None", "iterable", "Adds every item on the right."),
  call("clear", "method", "None", "", "Removes every item."),
];

export const PYTHON_TYPE_MEMBERS: Readonly<Record<string, readonly CompletionItem[]>> = {
  list: LIST,
  str: STR,
  dict: DICT,
  set: SET,
  deque: DEQUE,
};

/** `import ` offers modules; `from m import ` offers what m exports. */
export function pythonImportTargets(
  members: Readonly<Record<string, readonly CompletionItem[]>>,
): Readonly<Record<string, readonly CompletionItem[]>> {
  const bareModules = PYTHON_MODULES.map(({ label, insertText, kind, detail }) => ({ label, insertText, kind, detail }));
  const exports = Object.fromEntries(
    Object.keys(MODULE_DOCS).map((module) => [
      module,
      (members[module] ?? []).map((item) => {
        const name = item.label.replace("()", "");
        return { label: name, insertText: name, kind: item.kind, detail: module };
      }),
    ]),
  );
  return { "#modules": bareModules, ...exports };
}
