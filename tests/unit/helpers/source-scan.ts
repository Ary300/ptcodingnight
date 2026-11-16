import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The source scanner shared by the copy guards (`no-em-dash`, `no-middle-dot`).
 *
 * Moved here unchanged from `no-em-dash.test.ts` so a second guard does not grow a second comment
 * stripper. Why it is a state machine rather than a regex is explained at length in that file.
 */

const SCANNED_EXTENSIONS = [".ts", ".tsx"] as const;

const SKIPPED_DIRS = new Set(["node_modules", ".next", "__snapshots__"]);

export function sourceFiles(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      found.push(...sourceFiles(join(dir, entry.name)));
      continue;
    }
    if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

/**
 * Blank out every comment, replacing its characters with spaces.
 *
 * Spaces rather than deletion so that line and column numbers still point at the real source
 * position. A finding that names the wrong line costs more time than no finding at all.
 *
 * Four states matter: a string (any of the three quote characters), a line comment, a block
 * comment, and a regular expression literal. The regex case is not optional; see the note above.
 */
export function blankComments(source: string): string {
  const out = source.split("");
  let index = 0;

  /**
   * The last character that was not whitespace and not part of a comment.
   *
   * This is how `/` is told apart from `/`: after a value (an identifier, a literal, `)`, `]`)
   * it is division, and after an operator or an opener it begins a regex. It is a heuristic
   * rather than a parse, which is why the keyword list below exists — `return /x/` is division
   * by this rule and a regex in fact.
   */
  let lastSignificant = "";
  /** The one before that, so `=>` can be recognised as two characters rather than as `>`. */
  let prevSignificant = "";
  /** The run of word characters immediately before the current position, for that keyword test. */
  let lastWord = "";

  /*
    `<` and `>` are deliberately ABSENT from this set, and `}` with them.

    They are the JSX hazard. `</p>` puts a `/` straight after `<`, `<div></div>` puts one after
    `>`, and `<Foo bar={x} />` puts one after `}` — treat any of those as opening a regex and the
    scanner skips to the next `/` on the line, which is precisely how copy gets hidden from a
    guard whose whole job is to find copy. The one construct that genuinely needs `>` is the
    arrow function (`=> /re/`), and that is matched as the two-character sequence below instead.
  */
  const REGEX_PRECEDING_PUNCTUATION = "(,;:=!&|?+-*%~^[{";

  const REGEX_PRECEDING_KEYWORDS = new Set([
    "return",
    "typeof",
    "instanceof",
    "case",
    "in",
    "of",
    "do",
    "else",
    "yield",
    "await",
    "new",
    "delete",
    "void",
    "throw",
  ]);

  const isEscaped = (at: number): boolean => {
    let backslashes = 0;
    for (let scan = at - 1; scan >= 0 && source[scan] === "\\"; scan -= 1) backslashes += 1;
    return backslashes % 2 === 1;
  };

  while (index < source.length) {
    // `?? ""` only to satisfy `noUncheckedIndexedAccess`; the loop condition already guarantees it.
    const char = source[index] ?? "";

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      index += 1;
      while (index < source.length && !(source[index] === quote && !isEscaped(index))) index += 1;
      index += 1;
      prevSignificant = lastSignificant;
      lastSignificant = quote;
      lastWord = "";
      continue;
    }

    // A regex literal, but only where one can legally start. `a / b` must stay division, or the
    // scanner eats everything up to the next `/` in the file.
    if (
      char === "/" &&
      source[index + 1] !== "/" &&
      source[index + 1] !== "*" &&
      (lastSignificant === "" ||
        REGEX_PRECEDING_PUNCTUATION.includes(lastSignificant) ||
        (lastSignificant === ">" && prevSignificant === "=") ||
        REGEX_PRECEDING_KEYWORDS.has(lastWord))
    ) {
      index += 1;
      let inClass = false;
      while (index < source.length) {
        const here = source[index];
        if (isEscaped(index)) {
          index += 1;
          continue;
        }
        if (here === "[") inClass = true;
        else if (here === "]") inClass = false;
        // A newline before the closing slash means this was not a regex after all. Bail out
        // rather than run to the end of the file on a bad guess.
        else if (here === "\n") break;
        else if (here === "/" && !inClass) {
          index += 1;
          break;
        }
        index += 1;
      }
      prevSignificant = lastSignificant;
      lastSignificant = "/";
      lastWord = "";
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") {
        out[index] = " ";
        index += 1;
      }
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        // Newlines are preserved so the line numbering downstream stays honest.
        if (source[index] !== "\n") out[index] = " ";
        index += 1;
      }
      // The closing `*/` itself.
      out[index] = " ";
      out[index + 1] = " ";
      index += 2;
      continue;
    }

    // Ordinary code. Track what came before, so the next `/` can be classified. Whitespace is
    // skipped rather than recorded: `foo\n  / bar` is still division.
    if (!/\s/.test(char)) {
      prevSignificant = lastSignificant;
      lastSignificant = char;
      lastWord = /[A-Za-z0-9_$]/.test(char) ? lastWord + char : "";
    }
    index += 1;
  }

  return out.join("");
}

/** `import … from "…"`, `export … from "…"`, and bare `import "…"`. */
export const IMPORT_LINE = /^\s*(?:import\b|export\b[^;]*\bfrom\b)/;
