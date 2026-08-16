import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The vanishing-space guard.
 *
 * `/admin/puzzles` shipped the sentence **"6 of 6showing on the students' puzzle page"** from source
 * that has the space right there in it:
 *
 * ```tsx
 * <span className="numeric">{rows.length}</span> showing on the students&rsquo; puzzle page.
 * Hiding one keeps every point it has already paid.
 * ```
 *
 * ## What actually causes it
 *
 * Next builds this repo with SWC, and SWC drops the LEADING whitespace of a JSX text node when that
 * node contains an HTML entity. Measured against the dev server, three variants of the same
 * paragraph:
 *
 * | Source | Rendered |
 * |---|---|
 * | `</span> showing … students&rsquo; puzzle page.` | `6showing` — space gone |
 * | `</span> showing … students puzzle page.` | `6 showing` — space kept |
 * | `</span>{" "}` then `showing … &rsquo; …` | `6 showing` — space kept |
 *
 * So it is the entity, and neither the line wrapping nor the length. The space survives happily in
 * a multi-line text node with no entity in it, which is why this looked like a whitespace-and-
 * newlines problem for a while and was not.
 *
 * ## Why a guard and not a fix
 *
 * Nothing warns. It typechecks, it lints, it passes axe, and every gate stays green, because the
 * defect is one missing space in rendered output and no gate reads rendered prose. It also survives
 * review: the file you are reading is correct, so the reviewer's eye has nothing to catch. The only
 * two things that find it are opening the page and reading `innerText`, or this scanner.
 *
 * The fix at each site is to write the space as `{" "}`, or to move the entity into its own
 * expression. Both put the space somewhere SWC cannot drop it.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Everything a student or an organizer reads is rendered from these two trees. */
const SCANNED_DIRS = ["app", "components"] as const;

const SKIPPED_DIRS = new Set(["node_modules", ".next", "__snapshots__"]);

/** Named (`&rsquo;`), decimal (`&#8217;`) and hex (`&#x2019;`) forms all take the same path. */
const ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#[xX][0-9a-fA-F]+);/;

interface Finding {
  readonly file: string;
  readonly line: number;
  /** The closing tag and the text after it, for a message somebody can act on. */
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
    if (entry.name.endsWith(".tsx")) found.push(join(dir, entry.name));
  }
  return found;
}

/**
 * Every place a text node begins with whitespace right after a closing tag and carries an entity.
 *
 * The text node ends at the next `<` or `{`, which is exactly where JSX ends one: an element, or an
 * expression container. Anything after that is a different node and gets its own leading whitespace
 * decided separately, so the scan must stop there or it reports the space of the following line.
 */
export function vanishingSpaces(source: string): readonly { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  const closingTag = /<\/[A-Za-z][A-Za-z0-9.]*>/g;

  let match: RegExpExecArray | null;
  while ((match = closingTag.exec(source)) !== null) {
    const after = source.slice(match.index + match[0].length);
    const stop = after.search(/[<{]/);
    const text = stop === -1 ? after : after.slice(0, stop);

    // No leading space means there is nothing to lose. A newline first is the ordinary formatted
    // case: JSX drops that whitespace by design, everybody expects it, and the space is written as
    // `{" "}` or is genuinely not wanted.
    if (!/^[ \t]/.test(text)) continue;
    if (!ENTITY.test(text)) continue;

    found.push({
      line: source.slice(0, match.index).split("\n").length,
      text: (match[0] + text).replace(/\s*\n\s*/g, " ").trim().slice(0, 110),
    });
  }

  return found;
}

describe("a space before an entity does not vanish", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));

  it("finds source to scan", () => {
    // A scanner walking an empty tree passes forever. This is the canary, same as the em dash
    // guard's.
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no text node that starts with a space and carries an HTML entity", () => {
    const findings: Finding[] = files.flatMap((file) =>
      vanishingSpaces(readFileSync(file, "utf8")).map((hit) => ({
        file: relative(ROOT, file).split(sep).join("/"),
        line: hit.line,
        text: hit.text,
      })),
    );

    const report = findings
      .map((finding) => `${finding.file}:${finding.line}  ${finding.text}`)
      .join("\n");

    expect(
      report,
      `SWC drops the leading space of a JSX text node that contains an HTML entity, so each line\nbelow renders with two words run together. Write the space as {" "} instead, or move the\nentity into its own expression. Read the result with innerText, not the JSX:\n\n${report}\n`,
    ).toBe("");
  });

  describe("the scanner itself", () => {
    it("catches the shape that shipped", () => {
      const source = `<p>\n  <span>{n}</span> showing on the students&rsquo; puzzle page.\n</p>`;
      const hits = vanishingSpaces(source);
      expect(hits).toHaveLength(1);
      expect(hits[0]?.line).toBe(2);
    });

    it("leaves the same sentence alone once the space is an expression", () => {
      const source = `<p>\n  <span>{n}</span>{" "}\n  showing on the students&rsquo; puzzle page.\n</p>`;
      expect(vanishingSpaces(source)).toEqual([]);
    });

    it("leaves a text node with no entity alone, however it wraps", () => {
      // The space survives here, measured. Reporting it would make the guard noise.
      const source = `<p>\n  <span>{n}</span> showing on the students puzzle page. Hiding one keeps\n  every point.\n</p>`;
      expect(vanishingSpaces(source)).toEqual([]);
    });

    it("leaves an entity that does not follow a space alone", () => {
      expect(vanishingSpaces(`<p><span>{n}</span>&nbsp;showing</p>`)).toEqual([]);
    });

    it("judges each text node separately rather than the whole element", () => {
      /*
        Two text nodes here. The first (" showing ") has the space and no entity; the second
        (", at the students’ desk") has the entity and starts with a comma, so there is no space
        to lose. Neither is a hazard, and a scanner that looked at the paragraph as one string
        would report the first because an entity appears somewhere after it.
      */
      const safe = `<p>\n  <span>{n}</span> showing <strong>now</strong>, at the students&rsquo; desk\n</p>`;
      expect(vanishingSpaces(safe)).toEqual([]);

      // Move the entity into the node that starts with a space and it is a hazard again, at the
      // SECOND closing tag: "nowat the students’ desk".
      const broken = `<p>\n  <span>{n}</span> showing <strong>now</strong> at the students&rsquo; desk\n</p>`;
      expect(vanishingSpaces(broken)).toHaveLength(1);
      expect(vanishingSpaces(broken)[0]?.text).toContain("</strong>");
    });

    it("finds a decimal or hex entity too", () => {
      expect(vanishingSpaces(`<p><span>{n}</span> a&#8217;b</p>`)).toHaveLength(1);
      expect(vanishingSpaces(`<p><span>{n}</span> a&#x2019;b</p>`)).toHaveLength(1);
    });
  });
});
