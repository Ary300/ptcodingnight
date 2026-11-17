/**
 * The Java profile's tables beyond names and templates: what accepting a keyword appends, the
 * members of the types contest code declares (offered when completion can read a variable's type
 * off the text), and what an import statement can name.
 */

import type { CompletionItem } from "./types";

function method(name: string, params: string, returns: string, doc: string): CompletionItem {
  const insertText = `${name}()`;
  const signature = `${returns} ${name}(${params})`;
  return params === ""
    ? { label: `${name}()`, insertText, kind: "method", detail: returns, doc: `${signature}. ${doc}` }
    : {
        label: `${name}(${params})`,
        insertText,
        kind: "method",
        detail: returns,
        caretOffset: name.length + 1,
        doc: `${signature}. ${doc}`,
      };
}

/** IntelliJ appends a space after these, and "()" with the caret inside after the control words. */
export const JAVA_KEYWORD_TAILS: Readonly<Record<string, string>> = {
  return: " ",
  new: " ",
  public: " ",
  private: " ",
  protected: " ",
  static: " ",
  final: " ",
  class: " ",
  interface: " ",
  enum: " ",
  import: " ",
  package: " ",
  else: " ",
  throw: " ",
  throws: " ",
  case: " ",
  extends: " ",
  implements: " ",
  instanceof: " ",
  abstract: " ",
  var: " ",
  if: " (|)",
  for: " (|)",
  while: " (|)",
  switch: " (|)",
  catch: " (|)",
  synchronized: " (|)",
};

const STRING: readonly CompletionItem[] = [
  method("length", "", "int", "The number of characters."),
  method("charAt", "int index", "char", "The character at index, counting from 0."),
  method("substring", "int beginIndex, int endIndex", "String", "The characters from beginIndex up to, not including, endIndex."),
  method("indexOf", "String str", "int", "Where str first appears, or -1."),
  method("lastIndexOf", "String str", "int", "Where str last appears, or -1."),
  method("equals", "Object obj", "boolean", "Whether the two strings hold the same characters. Use this, never ==."),
  method("equalsIgnoreCase", "String other", "boolean", "Whether the strings match, ignoring upper and lower case."),
  method("compareTo", "String other", "int", "Negative, zero or positive by dictionary order."),
  method("split", "String regex", "String[]", "The pieces between matches of regex. Use \"\\\\s+\" for any run of spaces."),
  method("trim", "", "String", "The string without leading and trailing spaces."),
  method("toCharArray", "", "char[]", "The characters as a new array."),
  method("toUpperCase", "", "String", "A copy in upper case."),
  method("toLowerCase", "", "String", "A copy in lower case."),
  method("contains", "CharSequence s", "boolean", "Whether s appears anywhere in the string."),
  method("startsWith", "String prefix", "boolean", "Whether the string begins with prefix."),
  method("endsWith", "String suffix", "boolean", "Whether the string ends with suffix."),
  method("isEmpty", "", "boolean", "Whether the length is 0."),
  method("replace", "CharSequence target, CharSequence replacement", "String", "A copy with every target replaced."),
  method("repeat", "int count", "String", "The string written count times."),
  method("chars", "", "IntStream", "The characters as a stream of ints."),
];

const STRING_BUILDER: readonly CompletionItem[] = [
  method("append", "Object obj", "StringBuilder", "Adds the value to the end and returns the builder."),
  method("reverse", "", "StringBuilder", "Reverses the characters in place."),
  method("toString", "", "String", "The built string."),
  method("length", "", "int", "The number of characters so far."),
  method("charAt", "int index", "char", "The character at index."),
  method("insert", "int offset, Object obj", "StringBuilder", "Inserts the value at offset."),
  method("deleteCharAt", "int index", "StringBuilder", "Removes the character at index."),
  method("setCharAt", "int index, char ch", "void", "Replaces the character at index."),
  method("setLength", "int newLength", "void", "Cuts or pads the builder to newLength."),
];

const SCANNER: readonly CompletionItem[] = [
  method("nextInt", "", "int", "Reads the next whole number. It leaves the line break, so a nextLine() right after returns \"\"."),
  method("nextLong", "", "long", "Reads the next whole number as a long."),
  method("nextDouble", "", "double", "Reads the next decimal number."),
  method("next", "", "String", "Reads the next word, stopping at a space or line break."),
  method("nextLine", "", "String", "Reads the rest of the current line, without the line break."),
  method("hasNext", "", "boolean", "Whether another word is left to read."),
  method("hasNextInt", "", "boolean", "Whether the next word is a whole number."),
  method("hasNextLine", "", "boolean", "Whether another line is left to read."),
  method("close", "", "void", "Closes the scanner and its input."),
];

const BUFFERED_READER: readonly CompletionItem[] = [
  method("readLine", "", "String", "Reads one line, or null at the end of input. Throws IOException."),
  method("read", "", "int", "Reads one character, or -1 at the end. Throws IOException."),
  method("ready", "", "boolean", "Whether input is waiting to be read."),
  method("close", "", "void", "Closes the reader."),
];

const LIST: readonly CompletionItem[] = [
  method("add", "E e", "boolean", "Adds e to the end."),
  method("get", "int index", "E", "The element at index, counting from 0."),
  method("set", "int index, E element", "E", "Replaces the element at index and returns the old one."),
  method("size", "", "int", "The number of elements."),
  method("isEmpty", "", "boolean", "Whether the list has no elements."),
  method("remove", "int index", "E", "Removes the element at index. For an Integer value use remove(Integer.valueOf(x))."),
  method("contains", "Object o", "boolean", "Whether o is in the list."),
  method("indexOf", "Object o", "int", "Where o first appears, or -1."),
  method("clear", "", "void", "Removes every element."),
  method("sort", "Comparator<? super E> c", "void", "Sorts the list; pass null for natural order."),
  method("addAll", "Collection<? extends E> c", "boolean", "Adds every element of c to the end."),
  method("subList", "int fromIndex, int toIndex", "List<E>", "A view of the elements from fromIndex up to toIndex."),
  method("stream", "", "Stream<E>", "The elements as a stream."),
  method("forEach", "Consumer<? super E> action", "void", "Runs action on each element."),
  method("toArray", "", "Object[]", "The elements as an array."),
];

const MAP: readonly CompletionItem[] = [
  method("put", "K key, V value", "V", "Stores value under key and returns the old value or null."),
  method("get", "Object key", "V", "The value for key, or null."),
  method("getOrDefault", "Object key, V defaultValue", "V", "The value for key, or defaultValue when there is none."),
  method("containsKey", "Object key", "boolean", "Whether key has a value."),
  method("containsValue", "Object value", "boolean", "Whether some key maps to value."),
  method("remove", "Object key", "V", "Removes key and returns its value."),
  method("size", "", "int", "The number of keys."),
  method("isEmpty", "", "boolean", "Whether the map has no keys."),
  method("keySet", "", "Set<K>", "The keys."),
  method("values", "", "Collection<V>", "The values."),
  method("entrySet", "", "Set<Map.Entry<K, V>>", "The key and value pairs, for a for-each loop."),
  method("merge", "K key, V value, BiFunction remapping", "V", "Combines value into key's entry. merge(k, 1, Integer::sum) counts."),
  method("putIfAbsent", "K key, V value", "V", "Stores value only when key has none."),
  method("clear", "", "void", "Removes every key."),
];

const SET: readonly CompletionItem[] = [
  method("add", "E e", "boolean", "Adds e; false when it was already there."),
  method("contains", "Object o", "boolean", "Whether o is in the set."),
  method("remove", "Object o", "boolean", "Removes o; false when it was not there."),
  method("size", "", "int", "The number of elements."),
  method("isEmpty", "", "boolean", "Whether the set has no elements."),
  method("clear", "", "void", "Removes every element."),
  method("addAll", "Collection<? extends E> c", "boolean", "Adds every element of c."),
  method("first", "", "E", "The smallest element (TreeSet)."),
  method("last", "", "E", "The largest element (TreeSet)."),
  method("stream", "", "Stream<E>", "The elements as a stream."),
];

const DEQUE: readonly CompletionItem[] = [
  method("offer", "E e", "boolean", "Adds e at the back of the queue."),
  method("poll", "", "E", "Removes and returns the front, or null when empty."),
  method("peek", "", "E", "The front without removing it, or null."),
  method("push", "E e", "void", "Adds e at the front, as a stack does."),
  method("pop", "", "E", "Removes and returns the front, as a stack does."),
  method("add", "E e", "boolean", "Adds e at the back."),
  method("addFirst", "E e", "void", "Adds e at the front."),
  method("addLast", "E e", "void", "Adds e at the back."),
  method("pollFirst", "", "E", "Removes and returns the front, or null."),
  method("pollLast", "", "E", "Removes and returns the back, or null."),
  method("peekFirst", "", "E", "The front, or null."),
  method("peekLast", "", "E", "The back, or null."),
  method("size", "", "int", "The number of elements."),
  method("isEmpty", "", "boolean", "Whether it is empty."),
  method("clear", "", "void", "Removes every element."),
];

const ARRAY: readonly CompletionItem[] = [
  { label: "length", insertText: "length", kind: "field", detail: "int", doc: "int length. The number of elements; a field, so no parentheses.", priority: 1 },
  method("clone", "", "T[]", "A copy of the array."),
];

export const JAVA_TYPE_MEMBERS: Readonly<Record<string, readonly CompletionItem[]>> = {
  String: STRING,
  StringBuilder: STRING_BUILDER,
  Scanner: SCANNER,
  BufferedReader: BUFFERED_READER,
  List: LIST,
  Map: MAP,
  Set: SET,
  Deque: DEQUE,
  array: ARRAY,
};

function pkg(name: string): CompletionItem {
  return { label: name, insertText: name, kind: "variable", detail: "package" };
}

/**
 * What `import ` can name: the packages, then each package's classes, built from the same class
 * list completion offers, so the two never disagree.
 */
export function javaImportTargets(globals: readonly CompletionItem[]): Readonly<Record<string, readonly CompletionItem[]>> {
  const byPackage = new Map<string, CompletionItem[]>();
  for (const item of globals) {
    if (item.kind !== "type" || item.detail === undefined) continue;
    byPackage.set(item.detail, [...(byPackage.get(item.detail) ?? []), { label: item.label, insertText: item.label, kind: "type", detail: item.detail }]);
  }
  return {
    "#packages": [pkg("java")],
    java: [pkg("util"), pkg("io"), pkg("lang"), pkg("math")],
    "java.math": [
      { label: "BigInteger", insertText: "BigInteger", kind: "type", detail: "java.math" },
      { label: "BigDecimal", insertText: "BigDecimal", kind: "type", detail: "java.math" },
    ],
    ...Object.fromEntries(byPackage),
  };
}
