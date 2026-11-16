/**
 * A small Markdown parser for problem statements.
 *
 * Why hand-written rather than `react-markdown`: `package.json` is orchestrator-owned
 * (docs/PLAN.md §3) and this scope may not add a dependency. See the report — the request
 * for `react-markdown` + `remark-math` + `rehype-katex` is filed there.
 *
 * The important property is that this produces a **typed AST that renders to React
 * elements**. There is no HTML string anywhere in this pipeline and no
 * `dangerouslySetInnerHTML` downstream, so a statement cannot inject markup no matter what
 * an author writes. That is a stronger position than sanitising HTML after the fact, and it
 * is worth keeping when the real Markdown library lands.
 *
 * Supported, because it is what a problem statement needs: headings, paragraphs, fenced
 * code, ordered and unordered lists, blockquotes, horizontal rules, inline code, bold,
 * italic, links, and `$…$` / `$$…$$` math. Not supported: raw HTML (by design), footnotes,
 * reference links, nested lists.
 */

export type Inline =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "math"; tex: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "heading"; level: 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "code"; language: string | null; value: string }
  | { kind: "mathBlock"; tex: string }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "quote"; children: Inline[] }
  | { kind: "rule" };

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

/**
 * `javascript:`, `data:` and friends never become an href. Anything not on this list is
 * rendered as literal text, so a bad link degrades to visible characters rather than a
 * clickable payload.
 */
function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(value)) return value;
  if (value.startsWith("/") || value.startsWith("#")) return value;
  return null;
}

interface InlineRule {
  readonly re: RegExp;
  readonly build: (match: RegExpExecArray) => Inline;
}

/** Order is precedence. Code and math come first so their contents are never re-parsed. */
const INLINE_RULES: readonly InlineRule[] = [
  { re: /`([^`\n]+)`/, build: (m) => ({ kind: "code", value: m[1] ?? "" }) },
  { re: /\$([^$\n]+)\$/, build: (m) => ({ kind: "math", tex: m[1] ?? "" }) },
  {
    re: /\[([^\]\n]*)\]\(([^)\s]+)\)/,
    build: (m) => {
      const href = safeHref(m[2] ?? "");
      if (href === null) return { kind: "text", value: m[0] };
      return { kind: "link", href, children: parseInline(m[1] ?? "") };
    },
  },
  { re: /\*\*([^*\n]+)\*\*/, build: (m) => ({ kind: "strong", children: parseInline(m[1] ?? "") }) },
  { re: /__([^_\n]+)__/, build: (m) => ({ kind: "strong", children: parseInline(m[1] ?? "") }) },
  { re: /\*([^*\n]+)\*/, build: (m) => ({ kind: "em", children: parseInline(m[1] ?? "") }) },
  { re: /(?:^|\b)_([^_\n]+)_(?:\b|$)/, build: (m) => ({ kind: "em", children: parseInline(m[1] ?? "") }) },
];

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let rest = source;

  // Iterative, not recursive: a long statement should not be able to blow the stack.
  while (rest.length > 0) {
    let bestIndex = Number.POSITIVE_INFINITY;
    let bestMatch: RegExpExecArray | null = null;
    let bestRule: InlineRule | null = null;

    for (const rule of INLINE_RULES) {
      const match = rule.re.exec(rest);
      if (match !== null && match.index < bestIndex) {
        bestIndex = match.index;
        bestMatch = match;
        bestRule = rule;
      }
    }

    if (bestMatch === null || bestRule === null) {
      out.push({ kind: "text", value: rest });
      break;
    }

    if (bestIndex > 0) out.push({ kind: "text", value: rest.slice(0, bestIndex) });
    out.push(bestRule.build(bestMatch));
    rest = rest.slice(bestIndex + bestMatch[0].length);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const FENCE = /^```(\w*)\s*$/;
const MATH_FENCE = /^\$\$\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UNORDERED = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const BLANK = /^\s*$/;

function startsNewBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    MATH_FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    UNORDERED.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line) ||
    BLANK.test(line)
  );
}

function clampLevel(hashes: number): 2 | 3 | 4 | 5 | 6 {
  // `#` maps to `<h2>`: the page already owns the single `<h1>` (the problem title), and a
  // second one breaks the heading outline that screen readers navigate by.
  const level = Math.min(6, hashes + 1);
  return level === 2 || level === 3 || level === 4 || level === 5 || level === 6 ? level : 6;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    const fence = FENCE.exec(line);
    if (fence !== null) {
      const language = (fence[1] ?? "").length > 0 ? (fence[1] ?? null) : null;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ kind: "code", language, value: body.join("\n") });
      continue;
    }

    if (MATH_FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !MATH_FENCE.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "mathBlock", tex: body.join(" ").trim() });
      continue;
    }

    if (BLANK.test(line)) {
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      blocks.push({
        kind: "heading",
        level: clampLevel((heading[1] ?? "#").length),
        children: parseInline(heading[2] ?? ""),
      });
      i += 1;
      continue;
    }

    if (UNORDERED.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line) && !UNORDERED.test(line);
      const pattern = ordered ? ORDERED : UNORDERED;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const match = pattern.exec(lines[i] ?? "");
        if (match === null) break;
        items.push(parseInline(match[1] ?? ""));
        i += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (QUOTE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length) {
        const match = QUOTE.exec(lines[i] ?? "");
        if (match === null) break;
        parts.push(match[1] ?? "");
        i += 1;
      }
      blocks.push({ kind: "quote", children: parseInline(parts.join(" ").trim()) });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && !startsNewBlock(lines[i] ?? "")) {
      paragraph.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ kind: "paragraph", children: parseInline(paragraph.join(" ").trim()) });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Collapsible sections
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Collapsible sections
// ---------------------------------------------------------------------------

type HeadingLevel = 2 | 3 | 4 | 5 | 6;

/**
 * A titled run of blocks folded behind its title: the title, and everything under it up to the
 * next title of the same or higher rank.
 *
 * `level` is the heading rank the title is rendered at inside the disclosure's summary.
 */
export interface CollapsedSection {
  readonly kind: "section";
  readonly title: readonly Inline[];
  readonly level: HeadingLevel;
  readonly body: readonly Block[];
}

export type SectionedBlock = Block | CollapsedSection;

/** The plain text of an inline run, for matching a heading by its words. */
export function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
        case "code":
          return node.value;
        case "math":
          return node.tex;
        case "strong":
        case "em":
        case "link":
          return inlineText(node.children);
      }
    })
    .join("");
}

const EXAMPLE_WORDS = /^examples?\b/i;

/**
 * A block that titles an example: a heading reading "Example", "Examples", "Example 1",
 * "Example 2:", or a paragraph that is nothing but bold "Example N".
 *
 * The paragraph form is how 84 of the 106 authored statements title their examples, under one
 * `## Example` heading, so ignoring it would fold the whole run as one block and leave a student
 * no way to open Example 2 without Example 1.
 */
export function isExampleHeading(block: Block): boolean {
  if (block.kind === "heading") return EXAMPLE_WORDS.test(inlineText(block.children).trim());
  if (block.kind !== "paragraph" || block.children.length !== 1) return false;
  const only = block.children[0];
  return only?.kind === "strong" && EXAMPLE_WORDS.test(inlineText(only.children).trim());
}

/** Rank as a section boundary: a heading's level, a bold pseudo-heading below every heading. */
const PSEUDO_HEADING_RANK = 7;

function rankOf(block: Block, matches: (block: Block) => boolean): number | null {
  if (block.kind === "heading") return block.level;
  return matches(block) ? PSEUDO_HEADING_RANK : null;
}

function sectionEnd(
  blocks: readonly Block[],
  start: number,
  rank: number,
  matches: (block: Block) => boolean,
): number {
  let end = start + 1;
  while (end < blocks.length) {
    const next = blocks[end];
    const nextRank = next === undefined ? null : rankOf(next, matches);
    if (nextRank !== null && nextRank <= rank) break;
    end += 1;
  }
  return end;
}

function titleOf(block: Block): readonly Inline[] {
  if (block.kind === "heading") return block.children;
  if (block.kind === "paragraph") {
    const only = block.children[0];
    return only?.kind === "strong" ? only.children : block.children;
  }
  return [];
}

function clampHeading(level: number): HeadingLevel {
  const clamped = Math.min(6, Math.max(2, level));
  return clamped === 2 || clamped === 3 || clamped === 4 || clamped === 5 ? clamped : 6;
}

/**
 * Fold every section whose title `matches` into one `CollapsedSection`.
 *
 * A matching section that itself contains a matching title ("## Example" over bold "Example 1"
 * and "Example 2") is NOT folded: its heading stays a plain heading and each inner example folds
 * on its own, so a student opens an example with one click rather than opening a fold to find
 * more folds.
 */
export function collapseSections(
  blocks: readonly Block[],
  matches: (block: Block) => boolean,
): SectionedBlock[] {
  const out: SectionedBlock[] = [];
  let lastHeadingLevel = 1;
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block === undefined) break;
    const rank = rankOf(block, matches);
    if (rank === null || !matches(block)) {
      if (block.kind === "heading") lastHeadingLevel = block.level;
      out.push(block);
      i += 1;
      continue;
    }
    const end = sectionEnd(blocks, i, rank, matches);
    const body = blocks.slice(i + 1, end);
    if (body.some(matches)) {
      if (block.kind === "heading") lastHeadingLevel = block.level;
      out.push(block);
      i += 1;
      continue;
    }
    const level = block.kind === "heading" ? block.level : clampHeading(lastHeadingLevel + 1);
    out.push({ kind: "section", title: titleOf(block), level, body });
    i = end;
  }
  return out;
}
