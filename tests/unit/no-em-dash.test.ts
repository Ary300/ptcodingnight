import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The em dash guard.
 *
 * The organizer asked, in as many words, that no em dash appear in anything a person using this
 * site can read. Page copy, button labels, error messages, headings, captions. The rule is not a
 * style preference we can satisfy once and forget: copy gets added on every screen, and an em dash
 * is the default connector for anyone drafting a sentence quickly, so a one-off sweep decays back
 * to where it started within a few commits. This test is what makes the sweep stick.
 *
 * ## Why it scans source rather than rendering
 *
 * Rendering every screen would need a contest, a session and a database, and it would still miss
 * the strings on branches that did not render. The copy is in the source either way, so the source
 * is where it is cheapest to check and hardest to slip past.
 *
 * ## Why comments are exempt, and why that exemption has to be exact
 *
 * This codebase explains itself in long comments, and rewriting thousands of them would bury every
 * real change in unrelated churn. Nobody using the site reads them. But a guard that reports a
 * comment is a guard people delete, so the comment stripping below is a real state machine over
 * strings and comments rather than a regex: `//` inside `"https://…"` is not a comment, `"` inside
 * a `// note about "quotes"` does not open a string, and a `/* … *\/` block can span any number of
 * lines. Get any of those wrong and the test is noise.
 *
 * Import paths are skipped for the same reason, even though a module path with U+2014 in it is not
 * a thing that happens: the point is that a finding from this test is always real.
 *
 * ## Regular expression literals have to be tracked, and this was found the hard way
 *
 * The first version of this scanner ignored them, on the reasoning that a regex is not copy and a
 * regex containing U+2014 would be reported rather than hidden. Both halves of that were true and
 * the conclusion was still wrong. `components/admin/markdown.ts` opens with
 * `const FENCE = /^\s{0,3}(?:``` |~~~)…/` — three BACKTICKS inside a regex. The scanner read the
 * leading `/` as division, then read the first backtick as the start of a template literal, and
 * consumed the rest of the file in the wrong state. Every JSDoc comment after that line was
 * reported as copy: three findings in one file, all of them comments, exactly the useless noise
 * this test cannot afford to produce.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The two directories that hold everything a student or an organizer reads. */
const SCANNED_DIRS = ["app", "components"] as const;

const SCANNED_EXTENSIONS = [".ts", ".tsx"] as const;

const SKIPPED_DIRS = new Set(["node_modules", ".next", "__snapshots__"]);

const EM_DASH = "—";

/** The HTML entity forms. `&mdash;` renders as U+2014, so banning only the literal is a loophole. */
const ENTITY_FORMS = ["&mdash;", "&#8212;", "&#x2014;", "&#X2014;"] as const;

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

function sourceFiles(dir: string): readonly string[] {
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
function blankComments(source: string): string {
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
const IMPORT_LINE = /^\s*(?:import\b|export\b[^;]*\bfrom\b)/;

function scan(file: string): readonly Finding[] {
  const source = readFileSync(file, "utf8");
  const lines = blankComments(source).split("\n");
  const findings: Finding[] = [];

  lines.forEach((line, offset) => {
    if (IMPORT_LINE.test(line)) return;

    const forms = [EM_DASH, ...ENTITY_FORMS];
    for (const form of forms) {
      let at = line.indexOf(form);
      while (at !== -1) {
        findings.push({
          file: relative(ROOT, file).split(sep).join("/"),
          line: offset + 1,
          column: at + 1,
          text: source.split("\n")[offset]?.trim() ?? "",
        });
        at = line.indexOf(form, at + form.length);
      }
    }
  });

  return findings;
}

describe("no em dash in user-visible copy", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));

  it("finds source to scan", () => {
    // A scanner that silently walks an empty tree passes forever. This is the canary.
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no U+2014 outside comments under app/ and components/", () => {
    const findings = files.flatMap(scan);

    const report = findings
      .map((finding) => `${finding.file}:${finding.line}:${finding.column}  ${finding.text}`)
      .join("\n");

    expect(
      report,
      `Em dash (U+2014) in user-visible text. Replace each with a colon, a full stop, a comma or\nbrackets, whichever the sentence wants. Do not substitute a hyphen. Code comments are exempt\nand this scanner already ignores them, so every line below is copy somebody can read:\n\n${report}\n`,
    ).toBe("");
  });

  describe("the scanner itself", () => {
    // These pin the exemptions. Without them a later "simplification" of blankComments could
    // quietly turn the guard into a scanner that finds nothing, and every gate would stay green.
    it("ignores a line comment", () => {
      expect(blankComments(`const a = 1; // an em dash — here`)).not.toContain(EM_DASH);
    });

    it("ignores a block comment spanning lines", () => {
      const source = `/**\n * an em dash — here\n */\nconst a = 1;\n`;
      expect(blankComments(source)).not.toContain(EM_DASH);
      // Line count is preserved, so reported line numbers stay correct.
      expect(blankComments(source).split("\n")).toHaveLength(source.split("\n").length);
    });

    it("does NOT treat // inside a string as a comment", () => {
      const source = `const url = "https://example.com"; // —\nconst copy = "keep — me";\n`;
      expect(blankComments(source)).toContain(`keep — me`);
    });

    it("does NOT treat a quote inside a comment as opening a string", () => {
      // If it did, the string on the next line would be read as a comment and its copy skipped.
      const source = `// he said "hi\nconst copy = "keep — me";\n`;
      expect(blankComments(source)).toContain(`keep — me`);
    });

    it("keeps an em dash that is in a JSX text node", () => {
      expect(blankComments(`<p>copy — here</p>`)).toContain(EM_DASH);
    });

    it("does not desync on a regex literal containing backticks", () => {
      // The real line from components/admin/markdown.ts, which is what caught this.
      const source = "const FENCE = /^\\s{0,3}(?:```|~~~)\\s*$/;\nconst copy = \"keep — me\";\n";
      expect(blankComments(source)).toContain("keep — me");
    });

    it("does not desync on a regex containing a quote character", () => {
      const source = `const Q = /["']/g;\nconst copy = "keep — me";\n`;
      expect(blankComments(source)).toContain(`keep — me`);
    });

    it("does not treat a JSX closing tag as a regex", () => {
      // `</p>` puts a slash straight after `<`. Read as a regex, the scanner would skip to the
      // next slash on the line and the copy after it would never be checked.
      const source = `<p>a</p><p>copy — here</p>\n`;
      expect(blankComments(source)).toContain(EM_DASH);
    });

    it("does not treat a self-closing JSX tag after an expression as a regex", () => {
      const source = `<Foo bar={x} /> copy — here\n`;
      expect(blankComments(source)).toContain(EM_DASH);
    });

    it("still recognises a regex after an arrow", () => {
      const source = `const f = (s) => /a\\/b/.test(s);\nconst copy = "keep — me";\n`;
      expect(blankComments(source)).toContain(`keep — me`);
    });

    it("leaves division alone", () => {
      const source = `const mean = total / size;\nconst copy = "keep — me";\n`;
      expect(blankComments(source)).toContain(`keep — me`);
    });

    it("survives an escaped quote inside a string", () => {
      const source = `const a = "he said \\"hi\\""; // —\nconst b = "keep — me";\n`;
      expect(blankComments(source)).toContain(`keep — me`);
    });
  });
});
