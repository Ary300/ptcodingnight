/**
 * IntelliJ's template variables, for the Java live and postfix templates that name something in
 * the file: `ifn` checks the nearest object for null, `iter` and `itar` loop over the nearest
 * array, `soutv` prints the nearest variable with its name, `soutp` the method's parameters, and
 * `arr.fori` counts to `arr.length` rather than to `arr`.
 *
 * IntelliJ asks its type checker; this reads declarations lexically (`Type name` followed by `=`,
 * `;`, `,`, `)` or `:`), which is all a contest file needs. A macro that finds nothing becomes an
 * empty field, or, where a template cannot be written without it (`itar` with no array), the
 * caller falls back to the template's plain body.
 */

export interface Declaration {
  readonly type: string;
  readonly name: string;
  readonly at: number;
}

const PRIMITIVES: ReadonlySet<string> = new Set(["int", "long", "double", "float", "char", "boolean", "short", "byte"]);
const NUMERIC: ReadonlySet<string> = new Set(["int", "long", "double", "float", "short", "byte", "Integer", "Long", "Double"]);
const COLLECTIONS =
  /^(?:List|ArrayList|LinkedList|Set|HashSet|TreeSet|LinkedHashSet|Collection|Deque|ArrayDeque|Queue|PriorityQueue|Stack|Vector|Iterable)\b/;
const LISTS = /^(?:List|ArrayList|LinkedList|Vector|Stack)\b/;
const MAPS = /^(?:Map|HashMap|TreeMap|LinkedHashMap)\b/;

const DECLARATION =
  /(?<![\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:<[^;=(){}]*?>)?(?:\s*\[\s*\])*)\s+([A-Za-z_$][\w$]*)\s*(?=[=;,):]|$)/gm;

function baseType(type: string): string {
  return /^[A-Za-z_$][\w$.]*/.exec(type)?.[0].split(".").pop() ?? type;
}

function isTypeName(type: string): boolean {
  const base = baseType(type);
  return PRIMITIVES.has(base) || base === "var" || /^[A-Z]/.test(base);
}

/** The Java declarations before `at`, in order. */
export function declarationsBefore(text: string, at: number): readonly Declaration[] {
  const found: Declaration[] = [];
  for (const match of text.slice(0, at).matchAll(DECLARATION)) {
    const type = (match[1] ?? "").replace(/\s+/g, "");
    const name = match[2] ?? "";
    if (!isTypeName(type) || name === "") continue;
    found.push({ type, name, at: match.index });
  }
  return found;
}

export function isArrayType(type: string): boolean {
  return type.endsWith("]");
}

function isCollectionType(type: string): boolean {
  return COLLECTIONS.test(type);
}

function nearest(text: string, at: number, keep: (declaration: Declaration) => boolean): Declaration | null {
  const all = declarationsBefore(text, at).filter(keep);
  return all[all.length - 1] ?? null;
}

/** `int[]` holds `int`, `List<Integer>` holds `Integer`; anything else is unknown. */
export function elementTypeOf(type: string): string | null {
  if (isArrayType(type)) return type.replace(/\[\]$/, "");
  const generic = /<\s*([^<>,]+(?:<[^<>]*>)?)\s*(?:,|>)/.exec(type);
  return generic === null ? null : (generic[1] ?? "").trim();
}

/** A name for one element: `nums` gives `num`, `int` gives `i`, `Integer` gives `integer`. */
export function elementNameOf(collection: string, elementType: string, taken: readonly string[]): string {
  let name: string;
  if (collection.length > 2 && collection.endsWith("s") && !collection.endsWith("ss")) {
    name = collection.slice(0, -1);
  } else if (PRIMITIVES.has(elementType) || elementType === "String") {
    name = elementType.charAt(0).toLowerCase();
  } else {
    const base = baseType(elementType);
    name = base.charAt(0).toLowerCase() + base.slice(1);
  }
  let candidate = name;
  for (let n = 1; taken.includes(candidate); n += 1) candidate = `${name}${n}`;
  return candidate;
}

/** The enclosing class and method names, and the method's parameter names. */
function enclosingMethod(text: string, at: number): { readonly className: string; readonly method: string; readonly params: readonly Declaration[] } {
  const before = text.slice(0, at);
  const className = [...before.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)].pop()?.[1] ?? "Main";
  const methods = [...before.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*(?:throws\s+[\w$.,\s]+)?\{/g)].filter(
    (match) => !["if", "for", "while", "switch", "catch", "synchronized"].includes(match[1] ?? ""),
  );
  const last = methods[methods.length - 1];
  if (last === undefined) return { className, method: "main", params: [] };
  return { className, method: last[1] ?? "main", params: declarationsBefore(`${last[2] ?? ""})`, (last[2] ?? "").length + 1) };
}

function printed(declaration: Declaration): string {
  const value = isArrayType(declaration.type) ? `java.util.Arrays.toString(${declaration.name})` : declaration.name;
  return `"${declaration.name} = " + ${value}`;
}

/** What a postfix expression's type looks like, from the calls contest code makes most. */
const RETURN_TYPES: Readonly<Record<string, string>> = {
  nextInt: "int",
  nextLong: "long",
  nextDouble: "double",
  nextBoolean: "boolean",
  next: "String",
  nextLine: "String",
  readLine: "String",
  length: "int",
  size: "int",
  charAt: "char",
  parseInt: "int",
  parseLong: "long",
  parseDouble: "double",
  toString: "String",
  substring: "String",
  trim: "String",
  split: "String[]",
  toCharArray: "char[]",
  abs: "int",
  max: "int",
  min: "int",
};

/** The type `var` would infer for a postfix expression, or "var" when it cannot be read. */
export function expressionTypeOf(expression: string, text: string, at: number): string {
  const trimmed = expression.trim();
  if (/^-?\d+$/.test(trimmed)) return "int";
  if (/^-?\d+\.\d*$/.test(trimmed)) return "double";
  if (/^".*"$/.test(trimmed)) return "String";
  if (/^'.*'$/.test(trimmed)) return "char";
  if (trimmed === "true" || trimmed === "false") return "boolean";
  const constructed = /^new\s+([A-Za-z_$][\w$.]*(?:<[^()]*>)?)\s*\(/.exec(trimmed);
  if (constructed !== null) return (constructed[1] ?? "var").replace(/<>$/, "");
  const call = /\.?([A-Za-z_$][\w$]*)\s*\([^()]*\)$/.exec(trimmed);
  if (call !== null) return RETURN_TYPES[call[1] ?? ""] ?? "var";
  const variable = nearest(text, at, (declaration) => declaration.name === trimmed);
  return variable?.type ?? "var";
}

/** A variable name for a value of `type` taken from `expression`. */
export function nameForType(type: string, expression: string): string {
  if (type === "var") {
    const call = /([A-Za-z_$][\w$]*)\s*\([^()]*\)$/.exec(expression.trim())?.[1];
    const word = call?.replace(/^(?:get|next|read|to|parse)/, "") ?? "";
    return word === "" ? "value" : word.charAt(0).toLowerCase() + word.slice(1);
  }
  if (isArrayType(type)) return `${elementNameOf("", elementTypeOf(type) ?? "x", [])}s`;
  if (PRIMITIVES.has(type) || type === "String") return type.charAt(0).toLowerCase();
  const base = baseType(type);
  return base.charAt(0).toLowerCase() + base.slice(1);
}

/**
 * The body with every macro replaced, or null when a REQUIRED one (`$ARRAY$`, `$LIST$`) finds
 * nothing and the template should fall back to its plain body.
 */
export function resolveMacros(body: string, text: string, at: number, expression = ""): string | null {
  if (!body.includes("$") || !/\$[A-Z_]+\$/.test(body.replace(/\$(?:END|EXPR)\$/g, ""))) return body;
  const taken = declarationsBefore(text, at).map((declaration) => declaration.name);

  const array = nearest(text, at, (declaration) => isArrayType(declaration.type));
  const list = nearest(text, at, (declaration) => LISTS.test(declaration.type));
  const iterable = nearest(text, at, (declaration) => isArrayType(declaration.type) || isCollectionType(declaration.type));
  const map = nearest(text, at, (declaration) => MAPS.test(declaration.type));
  if (body.includes("$ARRAY$") && array === null) return null;
  if (body.includes("$LIST$") && list === null) return null;
  if (/\$VAR\$/.test(body) && nearest(text, at, () => true) === null) return null;

  const source = body.includes("$ARRAY$") ? array : body.includes("$LIST$") ? list : iterable;
  const elementType = source === null ? "int" : (elementTypeOf(source.type) ?? "int");
  const sourceName = source?.name ?? "";
  const mapTypes = map === null ? null : /<\s*([^,<>]+(?:<[^<>]*>)?)\s*,\s*([^<>]+(?:<[^<>]*>)?)\s*>/.exec(map.type);
  const method = enclosingMethod(text, at);
  const expressionType = expression === "" ? "var" : expressionTypeOf(expression, text, at);
  const exprDeclaration = nearest(text, at, (declaration) => declaration.name === expression.trim());
  const bound =
    exprDeclaration === null
      ? expression
      : isArrayType(exprDeclaration.type)
        ? `${expression}.length`
        : isCollectionType(exprDeclaration.type)
          ? `${expression}.size()`
          : expression;

  const values: Readonly<Record<string, string>> = {
    VAR: nearest(text, at, () => true)?.name ?? "",
    VAR_REF: nearest(text, at, (declaration) => !PRIMITIVES.has(declaration.type))?.name ?? "",
    VAR_NUM: nearest(text, at, (declaration) => NUMERIC.has(declaration.type))?.name ?? "",
    ARRAY: array?.name ?? "",
    LIST: list?.name ?? "",
    ITERABLE: iterable?.name ?? "",
    MAP: map?.name ?? "",
    ELEMENT_TYPE: elementType,
    ELEMENT_NAME: source === null ? "x" : elementNameOf(sourceName, elementType, taken),
    ELEMENT_NAME_I: elementNameOf(sourceName, elementType, [...taken, "i"]),
    KEY_TYPE: mapTypes?.[1]?.trim() ?? "Integer",
    VALUE_TYPE: mapTypes?.[2]?.trim() ?? "Integer",
    CLASS_METHOD: `${method.className}.${method.method}`,
    PARAMS: method.params.length === 0 ? '""' : method.params.map(printed).join(' + ", " + '),
    EXPR_BOUND: bound,
    EXPR_TYPE: expressionType,
    EXPR_NAME: nameForType(expressionType, expression),
  };
  return body.replace(/\$([A-Z_]+)\$/g, (whole, name: string) => values[name] ?? whole);
}
