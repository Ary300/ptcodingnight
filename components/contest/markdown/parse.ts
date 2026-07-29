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
