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
 * package, else null. C-style comments are removed first, since a commented-out package line is
 * not one; a string cannot come before a package declaration, so no string handling is needed.
 */
export function declaredPackageMessage(
  source: string,
  entry: { readonly nestedMessage: string; readonly declaration?: string },
): string | null {
  if (entry.declaration === undefined) return null;
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");
  const match = new RegExp(entry.declaration).exec(code);
  const name = match?.[1];
  if (name === undefined) return null;
  return entry.nestedMessage.replace("{package}", packageName(name.replace(/\s+/g, "").split(".")));
}

const MAX_DEPTH = 8;
const MAX_ENTRIES = 4096;

/** The package as the student wrote it, from the directories javac made of it. */
function packageName(parts: readonly string[]): string {
  const name = parts.join(".").replace(/[^A-Za-z0-9_$.]/g, "");
  return name.length > 80 ? `${name.slice(0, 80)}…` : name;
}
