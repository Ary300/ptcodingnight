/**
 * The Java profile, modelled on IntelliJ IDEA's defaults for the kind of program a contest asks
 * for: one class, a main method, stdin in and stdout out.
 *
 * The live templates use IntelliJ's own abbreviations and expansions, because a student who types
 * `sout` and presses Tab here should get exactly what they get at home. Completion lists are the
 * classes and methods contest code actually reaches for; the editor does not infer types, so the
 * "*" key offers the common instance methods after any qualifier it does not recognise.
 */

import { JAVA_KEYWORD_TAILS, JAVA_TYPE_MEMBERS, javaImportTargets } from "./java-extras";
import type { CompletionItem, LanguageProfile, LiveTemplate } from "./types";

/**
 * A method entry. `params` is the parameter list as IntelliJ shows it, e.g. "String s". When the
 * method takes arguments the caret lands inside the parentheses; otherwise it lands after them.
 */
function method(name: string, params: string, returns: string): CompletionItem {
  const insertText = `${name}()`;
  return params === ""
    ? { label: `${name}()`, insertText, kind: "method", detail: returns }
    : {
        label: `${name}(${params})`,
        insertText,
        kind: "method",
        detail: returns,
        caretOffset: name.length + 1,
      };
}

function field(name: string, fieldType: string): CompletionItem {
  return { label: name, insertText: name, kind: "field", detail: fieldType };
}

/** Collection classes IntelliJ completes with the diamond after `new`: `new ArrayList<>()`. */
const GENERIC_TYPES: ReadonlySet<string> = new Set([
  "List", "ArrayList", "LinkedList", "Map", "HashMap", "TreeMap", "LinkedHashMap", "Set", "HashSet",
  "TreeSet", "LinkedHashSet", "Deque", "ArrayDeque", "Queue", "PriorityQueue", "Stack", "Comparator",
]);

/** A class, with the import IntelliJ adds when it is accepted (none for java.lang). */
function javaType(name: string, pkg: string): CompletionItem {
  const base: CompletionItem = { label: name, insertText: name, kind: "type", detail: pkg };
  const imported = pkg === "java.lang" ? base : { ...base, importLine: `import ${pkg}.${name};` };
  return GENERIC_TYPES.has(name) ? { ...imported, generic: true } : imported;
}

/**
 * True when the code on the line, ignoring a trailing line comment and trailing spaces, ends with
 * an opening bracket. String and char literals are skipped so `"//"` and `'{'` count as code.
 */
function javaOpensBlock(lineBeforeCaret: string): boolean {
  let code = lineBeforeCaret;
  let quote: string | null = null;
  for (let i = 0; i < lineBeforeCaret.length; i += 1) {
    const ch = lineBeforeCaret[i];
    if (quote !== null) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "/" && lineBeforeCaret[i + 1] === "/") {
      code = lineBeforeCaret.slice(0, i);
      break;
    }
  }
  const trimmed = code.trimEnd();
  // A `case 1:` or `default:` label: its statements sit one level in, as IntelliJ formats them.
  if (SWITCH_LABEL.test(trimmed)) return true;
  const last = trimmed.slice(-1);
  return last === "{" || last === "(" || last === "[";
}

const SWITCH_LABEL = /^\s*(?:case\b.*|default\s*):$/;

const MAIN_BODY = "public static void main(String[] args) {\n    $END$\n}";
// The iterable first, then the element type and name, which is IntelliJ's order. Each is read from
// the nearest array or collection declared above (template-macros.ts), so `iter` beside
// `int[] arr` is `for (int i : arr)`.
const ITERATE = "for (${2:$ELEMENT_TYPE$} ${3:$ELEMENT_NAME$} : ${1:$ITERABLE$}) {\n\t$END$\n}";

/**
 * IntelliJ's postfix templates, typed after an expression and a dot: `x.sout` prints x, `n.fori`
 * counts to n, `list.for` iterates it. $EXPR$ is the expression before the dot.
 */
const POSTFIX: readonly LiveTemplate[] = [
  { abbreviation: "sout", description: "Prints the expression", body: "System.out.println($EXPR$);$END$" },
  {
    abbreviation: "soutv",
    description: "Prints the expression with its name",
    body: 'System.out.println("$EXPR$ = " + $EXPR$);$END$',
  },
  { abbreviation: "serr", description: "Prints the expression to System.err", body: "System.err.println($EXPR$);$END$" },
  { abbreviation: "souf", description: "Prints the expression with a format", body: 'System.out.printf("$END$", $EXPR$);' },
  // An array counts to its length and a collection to its size, as IntelliJ's postfix fori does.
  { abbreviation: "fori", description: "Counts up to the expression", body: "for (int i = 0; i < $EXPR_BOUND$; i++) {\n\t$END$\n}" },
  { abbreviation: "forr", description: "Counts down from the expression", body: "for (int i = $EXPR_BOUND$ - 1; i >= 0; i--) {\n\t$END$\n}" },
  { abbreviation: "for", description: "Iterates over the expression", body: "for (${1:$ELEMENT_TYPE$} ${2:$ELEMENT_NAME$} : $EXPR$) {\n\t$END$\n}" },
  { abbreviation: "iter", description: "Iterates over the expression", body: "for (${1:$ELEMENT_TYPE$} ${2:$ELEMENT_NAME$} : $EXPR$) {\n\t$END$\n}" },
  { abbreviation: "if", description: "Checks the expression", body: "if ($EXPR$) {\n\t$END$\n}" },
  { abbreviation: "else", description: "Checks the expression is false", body: "if (!$EXPR$) {\n\t$END$\n}" },
  { abbreviation: "while", description: "Loops while the expression holds", body: "while ($EXPR$) {\n\t$END$\n}" },
  { abbreviation: "nn", description: "Checks the expression is not null", body: "if ($EXPR$ != null) {\n\t$END$\n}" },
  { abbreviation: "notnull", description: "Checks the expression is not null", body: "if ($EXPR$ != null) {\n\t$END$\n}" },
  { abbreviation: "null", description: "Checks the expression is null", body: "if ($EXPR$ == null) {\n\t$END$\n}" },
  { abbreviation: "not", description: "Negates the expression", body: "!$EXPR$$END$" },
  { abbreviation: "return", description: "Returns the expression", body: "return $EXPR$;$END$" },
  // `sc.nextInt().var` is `int i = sc.nextInt();` with the name selected to rename.
  { abbreviation: "var", description: "Declares a variable holding the expression", body: "$EXPR_TYPE$ ${1:$EXPR_NAME$} = $EXPR$;$END$" },
  { abbreviation: "par", description: "Puts the expression in parentheses", body: "($EXPR$)$END$" },
  { abbreviation: "arg", description: "Passes the expression to a call", body: "${1}($EXPR$)$END$" },
  { abbreviation: "new", description: "Creates an instance of the class", body: "new $EXPR$($END$)" },
  { abbreviation: "cast", description: "Casts the expression", body: "((${1})$EXPR$)$END$" },
  { abbreviation: "switch", description: "Switches on the expression", body: "switch ($EXPR$) {\n\t$END$\n}" },
  { abbreviation: "try", description: "Wraps the statement in try and catch", body: "try {\n\t$EXPR$;\n} catch (Exception e) {\n\t$END$\n}" },
];

const TEMPLATES: readonly LiveTemplate[] = [
  { abbreviation: "sout", description: "Prints a string to System.out", body: "System.out.println($END$);" },
  {
    abbreviation: "souf",
    description: "Prints a formatted string to System.out",
    body: 'System.out.printf("$END$");',
  },
  {
    abbreviation: "soutv",
    description: "Prints a value to System.out",
    // The nearest variable with its name, `System.out.println("total = " + total);`, or an empty
    // string to add to when nothing is declared above.
    body: 'System.out.println("$VAR$ = " + $VAR$);$END$',
    fallback: 'System.out.println("" + $END$);',
  },
  {
    abbreviation: "soutm",
    description: "Prints the class and method name",
    body: 'System.out.println("$CLASS_METHOD$");$END$',
  },
  {
    abbreviation: "soutp",
    description: "Prints the method's parameters",
    body: "System.out.println($PARAMS$);$END$",
  },
  { abbreviation: "serr", description: "Prints a string to System.err", body: "System.err.println($END$);" },
  { abbreviation: "psvm", description: "Declares the main method", body: MAIN_BODY },
  { abbreviation: "main", description: "Declares the main method", body: MAIN_BODY },
  {
    // IntelliJ's order: the index first (written three times, kept equal), then the bound.
    abbreviation: "fori",
    description: "Creates an indexed for loop",
    body: "for (int ${1:i} = 0; ${1:i} < ${2}; ${1:i}++) {\n\t$END$\n}",
  },
  // The iterable first, then the element type and name, which is IntelliJ's order. The editor
  // cannot infer the element type, so it is a field holding `int` that typing `String` replaces.
  { abbreviation: "foreach", description: "Creates a for-each loop", body: ITERATE },
  { abbreviation: "iter", description: "Iterates over an array or a collection", body: ITERATE },
  // The nearest object declared above, `s` in `len(String s)`, so the check compiles as it stands.
  { abbreviation: "ifn", description: "Inserts an if null statement", body: "if (${1:$VAR_REF$} == null) {\n\t$END$\n}" },
  { abbreviation: "inn", description: "Inserts an if not null statement", body: "if (${1:$VAR_REF$} != null) {\n\t$END$\n}" },
  {
    abbreviation: "mn",
    description: "Sets a variable to the smaller of it and a value",
    body: "${1:$VAR_NUM$} = Math.min(${1:$VAR_NUM$}, $END$);",
  },
  {
    abbreviation: "mx",
    description: "Sets a variable to the larger of it and a value",
    body: "${1:$VAR_NUM$} = Math.max(${1:$VAR_NUM$}, $END$);",
  },
  { abbreviation: "lst", description: "Gets the last element of an array", body: "$ARRAY$[$ARRAY$.length - 1]$END$", fallback: "${1}[${1}.length - 1]$END$" },
  {
    abbreviation: "scanner",
    description: "Creates a Scanner that reads standard input",
    body: "Scanner sc = new Scanner(System.in);\n$END$",
  },
  { abbreviation: "St", description: "Inserts String", body: "String$END$" },
  { abbreviation: "thr", description: "Inserts throw new", body: "throw new $END$" },
  { abbreviation: "psf", description: "Inserts public static final", body: "public static final $END$" },
  { abbreviation: "prsf", description: "Inserts private static final", body: "private static final $END$" },
  { abbreviation: "psfi", description: "Inserts public static final int", body: "public static final int $END$" },
  { abbreviation: "psfs", description: "Inserts public static final String", body: "public static final String $END$" },
  {
    abbreviation: "itar",
    description: "Iterates over the elements of an array by index",
    body: "for (int i = 0; i < $ARRAY$.length; i++) {\n\t$ELEMENT_TYPE$ $ELEMENT_NAME_I$ = $ARRAY$[i];\n\t$END$\n}",
    fallback: "for (int i = 0; i < ${1}.length; i++) {\n\t$END$\n}",
  },
  {
    abbreviation: "ritar",
    description: "Iterates over the elements of an array in reverse order",
    body: "for (int i = $ARRAY$.length - 1; i >= 0; i--) {\n\t$ELEMENT_TYPE$ $ELEMENT_NAME_I$ = $ARRAY$[i];\n\t$END$\n}",
    fallback: "for (int i = ${1}.length - 1; i >= 0; i--) {\n\t$END$\n}",
  },
  {
    abbreviation: "itli",
    description: "Iterates over the elements of a list by index",
    body: "for (int i = 0; i < $LIST$.size(); i++) {\n\t$ELEMENT_TYPE$ $ELEMENT_NAME_I$ = $LIST$.get(i);\n\t$END$\n}",
    fallback: "for (int i = 0; i < ${1}.size(); i++) {\n\t$END$\n}",
  },
  {
    abbreviation: "itm",
    description: "Iterates over the entries of a map",
    body: "for (Map.Entry<$KEY_TYPE$, $VALUE_TYPE$> entry : ${1:$MAP$}.entrySet()) {\n\t$END$\n}",
  },
  {
    abbreviation: "ittok",
    description: "Iterates over the tokens of a string",
    body: "for (StringTokenizer st = new StringTokenizer(${1}); st.hasMoreTokens(); ) {\n\tString token = st.nextToken();\n\t$END$\n}",
  },
];

const KEYWORDS: readonly string[] = [
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
  "volatile", "while", "var", "record", "yield", "sealed", "permits",
  "true", "false", "null",
];

const GLOBALS: readonly CompletionItem[] = [
  javaType("String", "java.lang"),
  javaType("Integer", "java.lang"),
  javaType("Long", "java.lang"),
  javaType("Double", "java.lang"),
  javaType("Boolean", "java.lang"),
  javaType("Character", "java.lang"),
  javaType("Math", "java.lang"),
  javaType("System", "java.lang"),
  javaType("StringBuilder", "java.lang"),
  javaType("Arrays", "java.util"),
  javaType("Collections", "java.util"),
  javaType("List", "java.util"),
  javaType("ArrayList", "java.util"),
  javaType("LinkedList", "java.util"),
  javaType("Map", "java.util"),
  javaType("HashMap", "java.util"),
  javaType("TreeMap", "java.util"),
  javaType("Set", "java.util"),
  javaType("HashSet", "java.util"),
  javaType("TreeSet", "java.util"),
  javaType("Deque", "java.util"),
  javaType("ArrayDeque", "java.util"),
  javaType("Queue", "java.util"),
  javaType("PriorityQueue", "java.util"),
  javaType("Comparator", "java.util"),
  javaType("Scanner", "java.util"),
  javaType("StringTokenizer", "java.util"),
  javaType("BufferedReader", "java.io"),
  javaType("InputStreamReader", "java.io"),
  javaType("PrintWriter", "java.io"),
  javaType("IOException", "java.io"),
  javaType("Stack", "java.util"),
  javaType("LinkedHashMap", "java.util"),
];

const PRINT_STREAM: readonly CompletionItem[] = [
  method("println", "String x", "void"),
  method("print", "String x", "void"),
  method("printf", "String format, Object... args", "PrintStream"),
  method("flush", "", "void"),
];

/** Offered after any qualifier without its own entry, since the editor does not infer types. */
const ANY_QUALIFIER: readonly CompletionItem[] = [
  method("length", "", "int"),
  method("charAt", "int index", "char"),
  method("substring", "int beginIndex, int endIndex", "String"),
  method("indexOf", "String str", "int"),
  method("equals", "Object obj", "boolean"),
  method("compareTo", "T o", "int"),
  method("split", "String regex", "String[]"),
  method("trim", "", "String"),
  method("toCharArray", "", "char[]"),
  method("toUpperCase", "", "String"),
  method("toLowerCase", "", "String"),
  method("contains", "Object o", "boolean"),
  method("startsWith", "String prefix", "boolean"),
  method("endsWith", "String suffix", "boolean"),
  method("isEmpty", "", "boolean"),
  method("size", "", "int"),
  method("get", "int index", "E"),
  method("set", "int index, E element", "E"),
  method("add", "E e", "boolean"),
  method("remove", "Object o", "boolean"),
  method("put", "K key, V value", "V"),
  method("getOrDefault", "Object key, V defaultValue", "V"),
  method("containsKey", "Object key", "boolean"),
  method("keySet", "", "Set<K>"),
  method("values", "", "Collection<V>"),
  method("entrySet", "", "Set<Map.Entry<K, V>>"),
  method("getKey", "", "K"),
  method("getValue", "", "V"),
  method("push", "E e", "void"),
  method("pop", "", "E"),
  method("peek", "", "E"),
  method("poll", "", "E"),
  method("offer", "E e", "boolean"),
  method("addFirst", "E e", "void"),
  method("addLast", "E e", "void"),
  method("pollFirst", "", "E"),
  method("pollLast", "", "E"),
  method("peekFirst", "", "E"),
  method("peekLast", "", "E"),
  method("append", "Object obj", "StringBuilder"),
  method("reverse", "", "StringBuilder"),
  method("toString", "", "String"),
  method("readLine", "", "String"),
  method("nextInt", "", "int"),
  method("nextLong", "", "long"),
  method("nextDouble", "", "double"),
  method("next", "", "String"),
  method("nextLine", "", "String"),
  method("hasNext", "", "boolean"),
  method("hasNextInt", "", "boolean"),
  method("hasNextLine", "", "boolean"),
  method("hasMoreTokens", "", "boolean"),
  method("nextToken", "", "String"),
  method("println", "Object x", "void"),
  method("print", "Object x", "void"),
  method("flush", "", "void"),
  method("close", "", "void"),
];

const MEMBERS: Readonly<Record<string, readonly CompletionItem[]>> = {
  System: [
    field("out", "PrintStream"),
    field("in", "InputStream"),
    field("err", "PrintStream"),
    method("currentTimeMillis", "", "long"),
    method("nanoTime", "", "long"),
  ],
  "System.out": PRINT_STREAM,
  "System.err": PRINT_STREAM,
  Math: [
    method("max", "int a, int b", "int"),
    method("min", "int a, int b", "int"),
    method("abs", "int a", "int"),
    method("pow", "double a, double b", "double"),
    method("sqrt", "double a", "double"),
    method("floor", "double a", "double"),
    method("ceil", "double a", "double"),
    method("round", "double a", "long"),
    method("floorMod", "int x, int y", "int"),
    field("PI", "double"),
  ],
  Arrays: [
    method("sort", "int[] a", "void"),
    method("fill", "int[] a, int val", "void"),
    method("asList", "T... a", "List<T>"),
    method("toString", "int[] a", "String"),
    method("stream", "int[] array", "IntStream"),
    method("copyOf", "int[] original, int newLength", "int[]"),
    method("copyOfRange", "int[] original, int from, int to", "int[]"),
    method("equals", "int[] a, int[] a2", "boolean"),
  ],
  Collections: [
    method("sort", "List<T> list", "void"),
    method("reverse", "List<?> list", "void"),
    method("max", "Collection<T> coll", "T"),
    method("min", "Collection<T> coll", "T"),
    method("swap", "List<?> list, int i, int j", "void"),
    method("emptyList", "", "List<T>"),
    method("unmodifiableList", "List<T> list", "List<T>"),
    method("reverseOrder", "", "Comparator<T>"),
  ],
  Integer: [
    method("parseInt", "String s", "int"),
    method("valueOf", "int i", "Integer"),
    field("MAX_VALUE", "int"),
    field("MIN_VALUE", "int"),
    method("toString", "int i", "String"),
    method("toBinaryString", "int i", "String"),
    method("bitCount", "int i", "int"),
    method("compare", "int x, int y", "int"),
  ],
  Long: [
    method("parseLong", "String s", "long"),
    field("MAX_VALUE", "long"),
    field("MIN_VALUE", "long"),
    method("compare", "long x, long y", "int"),
  ],
  Double: [
    method("parseDouble", "String s", "double"),
    field("MAX_VALUE", "double"),
    method("compare", "double d1, double d2", "int"),
  ],
  Character: [
    method("isDigit", "char ch", "boolean"),
    method("isLetter", "char ch", "boolean"),
    method("isUpperCase", "char ch", "boolean"),
    method("isLowerCase", "char ch", "boolean"),
    method("toUpperCase", "char ch", "char"),
    method("toLowerCase", "char ch", "char"),
    method("getNumericValue", "char ch", "int"),
  ],
  String: [
    method("valueOf", "Object obj", "String"),
    method("join", "CharSequence delimiter, CharSequence... elements", "String"),
    method("format", "String format, Object... args", "String"),
  ],
  Comparator: [
    method("comparingInt", "ToIntFunction<T> keyExtractor", "Comparator<T>"),
    method("naturalOrder", "", "Comparator<T>"),
    method("reverseOrder", "", "Comparator<T>"),
  ],
  "*": ANY_QUALIFIER,
};

export const JAVA: LanguageProfile = {
  id: "java",
  lineComment: "//",
  indentUnit: "    ",
  pairs: [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ],
  quotes: ['"', "'"],
  opensBlock: javaOpensBlock,
  dedentOnType: ["}"],
  templates: TEMPLATES,
  postfixTemplates: POSTFIX,
  keywords: KEYWORDS,
  globals: GLOBALS,
  members: MEMBERS,
  keywordTails: JAVA_KEYWORD_TAILS,
  typeMembers: JAVA_TYPE_MEMBERS,
  importTargets: javaImportTargets(GLOBALS),
};
