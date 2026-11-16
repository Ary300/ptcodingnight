import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * After a successful build: is the entry point where the run command looks for it?
 *
 * Returns null when it is (or when nothing of that name was built at all — that is the program's
 * own business and stays a run-time failure, exactly as before). Returns the CE message when the
 * file exists only in a subdirectory, which for Java means the source declared a package: javac
 * writes `/build/<package path>/Main.class`, and `java -cp /build Main` cannot find it.
 *
 * The walk is bounded in depth and in entries, because the directory tree under /build was laid
 * out by a compiler working on the student's source.
 */
export async function misplacedEntryMessage(
  buildDir: string,
  entry: { readonly file: string; readonly nestedMessage: string },
): Promise<string | null> {
  const top = await readdir(buildDir, { withFileTypes: true }).catch(() => null);
  if (top === null) return null;
  if (top.some((item) => item.isFile() && item.name === entry.file)) return null;

  let budget = MAX_ENTRIES;
  const queue: { readonly dir: string; readonly parts: readonly string[] }[] = top
    .filter((item) => item.isDirectory())
    .map((item) => ({ dir: path.join(buildDir, item.name), parts: [item.name] }));
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    const items = await readdir(next.dir, { withFileTypes: true }).catch(() => []);
    budget -= items.length;
    if (budget < 0) return null;
    if (items.some((item) => item.isFile() && item.name === entry.file)) {
      return entry.nestedMessage.replace("{package}", packageName(next.parts));
    }
    if (next.parts.length >= MAX_DEPTH) continue;
    for (const item of items) {
      if (item.isDirectory()) queue.push({ dir: path.join(next.dir, item.name), parts: [...next.parts, item.name] });
    }
  }
  return null;
}

/**
 * The same finding from the source, before any compile: the CE message when the source declares a
 * package, else null.
 *
 * A package declaration can only be the FIRST thing in a compilation unit — after whitespace,
 * comments and annotations — so this reads tokens from the start and stops at the first token that
 * is none of those. One pass, each character looked at a bounded number of times: a source of
 * nothing but `/*` opens one block comment that runs to the end, and the scan is over. (The regular
 * expression this replaces rescanned to the end from every `/*`, quadratic in the source, and on
 * the worker's event loop.) Annotation arguments are skipped string- and char-aware, so a `)` or a
 * comment marker inside a literal is not taken for structure.
 */
export function declaredPackageMessage(
  source: string,
  entry: { readonly nestedMessage: string; readonly declarationKeyword?: string },
): string | null {
  if (entry.declarationKeyword === undefined) return null;
  const name = leadingDeclaration(source, entry.declarationKeyword);
  return name === null ? null : entry.nestedMessage.replace("{package}", packageName(name));
}

/** The dotted name after `keyword` if it is the first declaration in `source`, else null. */
export function leadingDeclaration(source: string, keyword: string): readonly string[] | null {
  const scan = new Scanner(source);
  scan.skipTrivia();
  // Annotations: `@Name`, `@a.b.Name`, `@Name(...)`.
  while (scan.peek() === "@") {
    scan.advance(1);
    scan.skipTrivia();
    if (scan.qualifiedName() === null) return null;
    scan.skipTrivia();
    if (scan.peek() === "(" && !scan.skipParenthesised()) return null;
    scan.skipTrivia();
  }
  if (scan.identifier() !== keyword) return null;
  scan.skipTrivia();
  const name = scan.qualifiedName();
  scan.skipTrivia();
  return name !== null && scan.peek() === ";" ? name : null;
}

class Scanner {
  private at = 0;

  constructor(private readonly text: string) {}

  peek(): string {
    return this.text.charAt(this.at);
  }

  advance(count: number): void {
    this.at = Math.min(this.text.length, this.at + count);
  }

  /** Whitespace and comments. An unterminated block comment runs to the end. */
  skipTrivia(): void {
    const text = this.text;
    while (this.at < text.length) {
      const c = text.charCodeAt(this.at);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c || c === 0xfeff) {
        this.at += 1;
      } else if (text.startsWith("//", this.at)) {
        const end = text.indexOf("\n", this.at + 2);
        this.at = end === -1 ? text.length : end + 1;
      } else if (text.startsWith("/*", this.at)) {
        const end = text.indexOf("*/", this.at + 2);
        this.at = end === -1 ? text.length : end + 2;
      } else {
        return;
      }
    }
  }

  identifier(): string | null {
    const match = /[A-Za-z_$][\w$]*/y;
    match.lastIndex = this.at;
    const found = match.exec(this.text);
    if (found === null) return null;
    this.at = match.lastIndex;
    return found[0];
  }

  /** `a`, `a.b`, `a . b` — whitespace and comments are allowed around the dots. */
  qualifiedName(): readonly string[] | null {
    const first = this.identifier();
    if (first === null) return null;
    const parts = [first];
    for (;;) {
      const mark = this.at;
      this.skipTrivia();
      if (this.peek() !== ".") {
        this.at = mark;
        return parts;
      }
      this.advance(1);
      this.skipTrivia();
      const next = this.identifier();
      if (next === null) return null;
      parts.push(next);
    }
  }

  /** From `(` to its matching `)`, skipping literals and comments. False if it never closes. */
  skipParenthesised(): boolean {
    const text = this.text;
    let depth = 0;
    while (this.at < text.length) {
      const c = text.charAt(this.at);
      if (c === '"' || c === "'") {
        this.skipLiteral(c);
      } else if (text.startsWith("//", this.at) || text.startsWith("/*", this.at)) {
        this.skipTrivia();
      } else {
        this.at += 1;
        if (c === "(") depth += 1;
        else if (c === ")" && --depth === 0) return true;
      }
    }
    return false;
  }

  /** A string or char literal, including a text block; a backslash escapes the next character. */
  private skipLiteral(quote: string): void {
    const text = this.text;
    if (quote === '"' && text.startsWith('"""', this.at)) {
      const end = text.indexOf('"""', this.at + 3);
      this.at = end === -1 ? text.length : end + 3;
      return;
    }
    this.at += 1;
    while (this.at < text.length) {
      const c = text.charAt(this.at);
      if (c === "\\") this.at += 2;
      else if (c === quote || c === "\n") {
        this.at += 1;
        return;
      } else this.at += 1;
    }
  }
}

const MAX_DEPTH = 8;
const MAX_ENTRIES = 4096;

/** The package as the student wrote it, from its parts. */
function packageName(parts: readonly string[]): string {
  const name = parts.join(".").replace(/[^A-Za-z0-9_$.]/g, "");
  return name.length > 80 ? `${name.slice(0, 80)}…` : name;
}
