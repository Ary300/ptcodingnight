import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";

import { LANGUAGE_IDS, type LanguageId } from "@/lib/judge/runtimes";
import type { StarterCode } from "@/lib/judge/starters";

/**
 * Hand-written starter code, read from `content/problems/<slug>/starters/`.
 *
 * A problem's author can write the template a student opens instead of letting the emitters in
 * `lib/judge/starters/` generate one from the signature. The order, per allowed language, is the
 * hand-written file when it exists, then the generated starter, then nothing (and the client
 * falls back to the variant's generic template, as it always has).
 *
 * ## What this path may serve, and what it must never serve
 *
 * `content/problems/<slug>/` also holds the hidden tests, the reference solution and the
 * generator. This module can only ever open the three names in `HAND_WRITTEN_STARTER_FILES`,
 * directly inside `<root>/<slug>/starters/`, and it refuses anything else:
 *
 *  - the slug is checked against the manifest's slug format BEFORE it is joined into a path, so
 *    `..`, `/`, `%2e` and the empty string never reach `path.join`;
 *  - the file's real path (every symlink resolved) must equal the path asked for under the real
 *    path of the root, so a `starters/main.py` symlinked to `../reference.py`, or a `starters/`
 *    symlinked to `../tests`, is refused rather than followed;
 *  - it must be a regular file no larger than `STARTER_MAX_BYTES`.
 *
 * The file names are a fixed table, never derived from a request. The slug comes from the
 * `Problem` row, not from the URL, so the cache is bounded by the size of the problem bank.
 *
 * ## Failure is never the page's problem
 *
 * A missing file is the normal case and is silent. Any other failure (unreadable, oversized, a
 * symlink, empty) logs one line and falls back. Nothing here throws: a problem statement must
 * render even when its starter cannot, which is the same rule `readProblemSignature` holds.
 */

/** The contract with content authors. Any subset may exist. */
export const HAND_WRITTEN_STARTER_FILES: Readonly<Partial<Record<LanguageId, string>>> = {
  PYTHON_312: "main.py",
  JAVA_21: "Main.java",
  CPP_17: "main.cpp",
};

export const STARTER_MAX_BYTES = 64 * 1024;

/**
 * The manifest's slug format (`ProblemManifestSchema.slug` in `lib/schemas/seed.ts`), restated
 * with a length cap so the guard does not depend on a schema module. The unit test pins the two
 * to the same answers.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 120;

export function isSafeProblemSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug);
}

/**
 * `content/problems` under the working directory. The cwd is the repo root under `npm run dev`
 * and the Playwright web server, and `/app` in both production images, which copy `content` to
 * `/app/content` (Dockerfile).
 */
export function problemContentRoot(): string {
  return path.join(process.cwd(), "content", "problems");
}

export type HandWrittenStarters = ReadonlyMap<LanguageId, string>;

const EMPTY: HandWrittenStarters = new Map();

interface ReadResult {
  readonly code: string | null;
  /** False when a failure might be transient, so the next request tries again. */
  readonly cacheable: boolean;
}

const cache = new Map<string, Promise<HandWrittenStarters>>();

/** Test hook. The cache is per process, keyed by root and slug. */
export function clearHandWrittenStarterCache(): void {
  cache.clear();
}

/**
 * Every hand-written starter a problem has, keyed by language. Cached in memory per slug, so a
 * room of students opening the same problem reads the disk once. Never rejects.
 */
export function readHandWrittenStarters(
  slug: string,
  root: string = problemContentRoot(),
): Promise<HandWrittenStarters> {
  if (!isSafeProblemSlug(slug)) {
    logStarter("problem.starter_slug_refused", { slug: String(slug).slice(0, 200) });
    return Promise.resolve(EMPTY);
  }

  const key = `${root}\u0000${slug}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const pending = loadAll(slug, root).then(({ starters, cacheable }) => {
    if (!cacheable) cache.delete(key);
    return starters;
  });
  cache.set(key, pending);
  return pending;
}

async function loadAll(
  slug: string,
  root: string,
): Promise<{ starters: HandWrittenStarters; cacheable: boolean }> {
  const results = await Promise.all(
    LANGUAGE_IDS.flatMap((language) => {
      const fileName = HAND_WRITTEN_STARTER_FILES[language];
      if (fileName === undefined) return [];
      return [readOne(root, slug, fileName).then((result) => ({ language, result }))];
    }),
  );

  const starters = new Map<LanguageId, string>();
  for (const { language, result } of results) {
    if (result.code !== null) starters.set(language, result.code);
  }
  return { starters, cacheable: results.every(({ result }) => result.cacheable) };
}

async function readOne(root: string, slug: string, fileName: string): Promise<ReadResult> {
  const requested = path.join(root, slug, "starters", fileName);
  try {
    const realRoot = await realpath(root);
    const expected = path.join(realRoot, slug, "starters", fileName);
    const actual = await realpath(requested);
    if (actual !== expected) {
      logStarter("problem.starter_refused", { slug, fileName, reason: "resolves elsewhere" });
      return { code: null, cacheable: true };
    }

    // O_NOFOLLOW closes the gap between the realpath check and the open on the last component.
    const handle = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) {
        logStarter("problem.starter_refused", { slug, fileName, reason: "not a regular file" });
        return { code: null, cacheable: true };
      }
      if (stats.size > STARTER_MAX_BYTES) {
        logStarter("problem.starter_refused", {
          slug,
          fileName,
          reason: "too large",
          bytes: stats.size,
        });
        return { code: null, cacheable: true };
      }
      const code = await handle.readFile({ encoding: "utf8" });
      if (code.trim() === "") {
        logStarter("problem.starter_refused", { slug, fileName, reason: "empty" });
        return { code: null, cacheable: true };
      }
      return { code, cacheable: true };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (isAbsent(error)) return { code: null, cacheable: true };
    logStarter("problem.starter_unreadable", {
      slug,
      fileName,
      message: error instanceof Error ? error.message : String(error),
    });
    return { code: null, cacheable: false };
  }
}

function isAbsent(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "ENOENT" || error.code === "ENOTDIR";
}

function logStarter(event: string, fields: Record<string, string | number>): void {
  console.error(JSON.stringify({ level: "error", event, ...fields }));
}

/**
 * The resolution order, as a pure function. For each allowed language in registry order (the
 * dropdown order, so the same problem always serialises to the same bytes): the hand-written
 * file, then the generated starter, then nothing.
 *
 * When nothing resolves, the generated value comes back unchanged, so a problem with no signature
 * and no hand-written file still serialises `starters` as absent, exactly as before.
 */
export function resolveStarters(
  allowedLanguages: readonly LanguageId[],
  handWritten: HandWrittenStarters,
  generated: readonly StarterCode[] | undefined,
): StarterCode[] | undefined {
  const allowed = new Set(allowedLanguages);
  const resolved: StarterCode[] = [];
  for (const language of LANGUAGE_IDS) {
    if (!allowed.has(language)) continue;
    const code =
      handWritten.get(language) ??
      generated?.find((starter) => starter.language === language)?.code;
    if (code !== undefined) resolved.push({ language, code });
  }
  if (resolved.length === 0) return generated === undefined ? undefined : [...generated];
  return resolved;
}
