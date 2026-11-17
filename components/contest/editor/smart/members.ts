/**
 * The members a student's own file defines, for completion after a dot.
 *
 * The editor does not infer types, so after `node.` it cannot know `node` is a Node. What it can
 * know is every name the file already uses as a member (`self.val = 1`, `cur.next`) and every
 * field and method a class or struct in the file declares (`class Node { int val; Node next; }`).
 * Those are offered after any qualifier, ahead of the library's general members, which is how
 * `self.v` means `val` and `node.ne` means `next` the way PyCharm and IntelliJ would have it.
 */

/** A member name and whether the file calls it, so a method completes with its parentheses. */
export interface FileMember {
  readonly name: string;
  readonly isMethod: boolean;
}

const AFTER_DOT = /(?:\.|->)[ \t]*([A-Za-z_$][A-Za-z0-9_$]*)([ \t]*\()?/g;
const AGGREGATE_KEYWORD = /\b(?:class|struct|union|record|interface|enum)\b/;
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const NOT_A_NAME: ReadonlySet<string> = new Set([
  "public", "private", "protected", "static", "final", "const", "int", "long", "void", "return",
  "new", "this", "self", "class", "struct", "if", "for", "while", "switch", "case", "default",
]);

/**
 * Every member name the file uses or declares, in first-seen order, except those that start in
 * [excludeFrom, excludeTo]: the chain being completed and the word being typed, which are not yet
 * facts about the file (`System.out.|` must not offer `out` back).
 */
export function fileMembers(text: string, braces: boolean, excludeFrom: number, excludeTo: number): FileMember[] {
  const found = new Map<string, boolean>();
  const add = (name: string, isMethod: boolean) => {
    if (NOT_A_NAME.has(name) || /^[0-9]/.test(name)) return;
    found.set(name, (found.get(name) ?? false) || isMethod);
  };
  for (const match of text.matchAll(AFTER_DOT)) {
    const name = match[1] ?? "";
    const nameStart = match.index + match[0].indexOf(name, 1);
    if (nameStart >= excludeFrom && nameStart <= excludeTo) continue;
    add(name, match[2] !== undefined);
  }
  if (braces) {
    for (const member of declaredMembers(text)) add(member.name, member.isMethod);
  }
  return [...found].map(([name, isMethod]) => ({ name, isMethod }));
}

/** One brace on the stack: whether it opened a class-like body, and that class's name. */
interface Scope {
  readonly isAggregate: boolean;
  readonly name: string;
}

/**
 * Fields and methods declared directly inside a class, struct, union, record, interface or enum
 * body in Java or C++. A statement at that level ending in ";" declares fields (the last name
 * before "=" or "[" in each comma-separated part); one ending in "{" with a "(" declares a method.
 * Strings and comments are skipped.
 */
export function declaredMembers(text: string): FileMember[] {
  const members: FileMember[] = [];
  let scopes: readonly Scope[] = [];
  let segmentStart = 0;
  let i = 0;
  const top = () => scopes[scopes.length - 1];
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (text.startsWith("//", i)) {
      i = endOfLine(text, i);
      continue;
    }
    if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? text.length : close + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = endOfString(text, i, ch);
      continue;
    }
    if (ch === "{" || ch === ";" || ch === "}") {
      const segment = text.slice(segmentStart, i);
      const scope = top();
      if (scope?.isAggregate === true) {
        if (ch === ";") members.push(...fieldNames(segment));
        if (ch === "{") {
          const method = methodName(segment);
          if (method !== null && method !== scope.name) members.push({ name: method, isMethod: true });
        }
      }
      if (ch === "{") {
        const head = segment.split("(")[0] ?? "";
        const aggregate = AGGREGATE_KEYWORD.exec(head);
        const name = aggregate === null ? "" : (/^\s*([A-Za-z_$][\w$]*)/.exec(head.slice(aggregate.index + aggregate[0].length))?.[1] ?? "");
        scopes = [...scopes, { isAggregate: aggregate !== null, name }];
      } else if (ch === "}") {
        scopes = scopes.slice(0, -1);
      }
      segmentStart = i + 1;
    }
    i += 1;
  }
  return members;
}

/** The names a field declaration statement declares: `int a = 1, b[5]` gives a and b. */
function fieldNames(segment: string): FileMember[] {
  return splitTopLevel(segment).flatMap((part) => {
    const declarator = (part.split("=")[0] ?? "").replace(/\[[^\]]*\]/g, "");
    const names = declarator.match(IDENTIFIER) ?? [];
    const last = names[names.length - 1];
    return last === undefined || names.length === 0 ? [] : [{ name: last, isMethod: false }];
  });
}

/** The name before the first "(" of a method header, or null when the segment has none. */
function methodName(segment: string): string | null {
  const open = segment.indexOf("(");
  if (open === -1) return null;
  return /([A-Za-z_$][\w$]*)\s*$/.exec(segment.slice(0, open))?.[1] ?? null;
}

/** Splits on commas outside (), [], {} and <>, so `Map<K, V> m` stays one declaration. */
function splitTopLevel(segment: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (ch === "(" || ch === "[" || ch === "<" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === ">" || ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(segment.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(segment.slice(start));
  return parts;
}

function endOfLine(text: string, from: number): number {
  const newline = text.indexOf("\n", from);
  return newline === -1 ? text.length : newline;
}

function endOfString(text: string, at: number, quote: string): number {
  let i = at + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") i += 2;
    else if (ch === quote || ch === "\n") return i + 1;
    else i += 1;
  }
  return text.length;
}
