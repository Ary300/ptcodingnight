/**
 * A deliberately small Markdown subset, parsed to a typed tree.
 *
 * Two reasons this is hand-rolled rather than a dependency:
 *
 *  1. `package.json` is orchestrator-owned and frozen during fan-out, so the admin UI
 *     cannot add `remark`/`marked` on its own. If a real Markdown pipeline is wanted, that
 *     is a dependency request, not something to smuggle in.
 *  2. The output is a **tree of typed nodes rendered as React elements** — there is no
 *     `dangerouslySetInnerHTML` anywhere in the preview. A statement written by one
 *     organiser is read by another and eventually by every student in the room; an HTML
 *     passthrough here would be a stored-XSS hole in the one screen nobody would think to
 *     audit.
 *
 * Supported: ATX headings, fenced code, blockquotes, bullet/ordered lists, thematic
 * breaks, paragraphs; inline code, bold, italic, links. Deliberately NOT supported: raw
 * HTML (dropped as text), tables, nested lists, reference links, and KaTeX — `$…$` is
 * recognised only so the preview can say plainly that math is not rendered yet, rather
 * than silently showing dollar signs. PRD §5 wants KaTeX; that needs a dependency.
 */

export type Inline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "strong"; readonly children: readonly Inline[] }
  | { readonly kind: "em"; readonly children: readonly Inline[] }
  | { readonly kind: "link"; readonly href: string; readonly children: readonly Inline[] }
  | { readonly kind: "math"; readonly text: string };

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type Block =
  | { readonly kind: "heading"; readonly level: HeadingLevel; readonly children: readonly Inline[] }
  | { readonly kind: "paragraph"; readonly children: readonly Inline[] }
  | { readonly kind: "code"; readonly lang: string | null; readonly text: string }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly (readonly Inline[])[] }
  | { readonly kind: "quote"; readonly children: readonly Inline[] }
  | { readonly kind: "rule" };

const FENCE = /^\s{0,3}(?:```|~~~)\s*([A-Za-z0-9_+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

/**
 * Only these schemes reach an `href`. Everything else — `javascript:`, `data:`, and any
 * scheme we have not thought about — renders as inert text.
 */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href.length === 0) return null;
  if (href.startsWith("/") || href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:[^\s]+@[^\s]+$/i.test(href)) return href;
  return null;
}

const INLINE_SOURCE = [
  "(`+)([\\s\\S]*?)\\1", // 1,2  inline code
  "\\*\\*([\\s\\S]+?)\\*\\*", // 3    bold
  "\\*([^*\\n]+?)\\*", // 4    italic
  "__([\\s\\S]+?)__", // 5    bold
  "_([^_\\n]+?)_", // 6    italic
  "\\[([^\\]]*)\\]\\(([^)\\s]+)\\)", // 7,8  link
  "\\$([^$\\n]+?)\\$", // 9    math (unsupported, shown as such)
].join("|");

function pushText(out: Inline[], text: string): void {
  if (text.length > 0) out.push({ kind: "text", text });
}

export function parseInline(source: string): readonly Inline[] {
  const out: Inline[] = [];
  let cursor = 0;

  // A fresh regex per call, deliberately. `parseInline` recurses into the contents of bold,
  // italic and link nodes; a module-level /g regex shared across those calls has its
  // `lastIndex` reset by the inner call and the outer loop then never terminates. That is
  // not a theoretical hazard — it hung the first render of the authoring screen.
  const pattern = new RegExp(INLINE_SOURCE, "g");
  let match = pattern.exec(source);
  while (match !== null) {
    pushText(out, source.slice(cursor, match.index));

    const full = match[0] ?? "";
    const code = match[2];
    const boldStar = match[3];
    const italStar = match[4];
    const boldUnder = match[5];
    const italUnder = match[6];
    const linkText = match[7];
    const linkHref = match[8];
    const math = match[9];

    if (code !== undefined) {
      out.push({ kind: "code", text: code.trim() });
    } else if (boldStar !== undefined) {
      out.push({ kind: "strong", children: parseInline(boldStar) });
    } else if (boldUnder !== undefined) {
      out.push({ kind: "strong", children: parseInline(boldUnder) });
    } else if (italStar !== undefined) {
      out.push({ kind: "em", children: parseInline(italStar) });
    } else if (italUnder !== undefined) {
      out.push({ kind: "em", children: parseInline(italUnder) });
    } else if (linkText !== undefined && linkHref !== undefined) {
      const href = safeHref(linkHref);
      if (href === null) pushText(out, linkText);
      else out.push({ kind: "link", href, children: parseInline(linkText) });
    } else if (math !== undefined) {
      out.push({ kind: "math", text: math });
    }

    cursor = match.index + full.length;
    // A zero-length match would spin forever; the alternation cannot produce one, but the
    // guard costs nothing and this loop runs on organiser input.
    if (full.length === 0) break;
    match = pattern.exec(source);
  }

  pushText(out, source.slice(cursor));
  return out;
}

/** Strip raw HTML tags rather than rendering them. See the file header. */
function stripTags(line: string): string {
  return line.replace(/<[^>]*>/g, "");
}

export function parseMarkdown(source: string): readonly Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim().length === 0) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence !== null) {
      const rawLang = fence[1] ?? "";
      const lang = rawLang.length > 0 ? rawLang : null;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && FENCE.exec(lines[i] ?? "") === null) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // closing fence, or end of input
      blocks.push({ kind: "code", lang, text: body.join("\n") });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      const level = Math.min(6, (heading[1] ?? "#").length) as HeadingLevel;
      blocks.push({ kind: "heading", level, children: parseInline(stripTags(heading[2] ?? "")) });
      i += 1;
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote !== null) {
      const body: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i] ?? "");
        if (q === null) break;
        body.push(q[1] ?? "");
        i += 1;
      }
      blocks.push({ kind: "quote", children: parseInline(stripTags(body.join(" "))) });
      continue;
    }

    const isOrdered = ORDERED.test(line);
    if (isOrdered || BULLET.test(line)) {
      const pattern = isOrdered ? ORDERED : BULLET;
      const items: (readonly Inline[])[] = [];
      while (i < lines.length) {
        const item = pattern.exec(lines[i] ?? "");
        if (item === null) break;
        items.push(parseInline(stripTags(item[1] ?? "")));
        i += 1;
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (
        current.trim().length === 0 ||
        FENCE.test(current) ||
        HEADING.test(current) ||
        RULE.test(current) ||
        QUOTE.test(current) ||
        BULLET.test(current) ||
        ORDERED.test(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      i += 1;
    }
    blocks.push({ kind: "paragraph", children: parseInline(stripTags(paragraph.join(" "))) });
  }

  return blocks;
}

/** True when the statement uses `$…$`, which the preview cannot render yet. */
export function usesMath(blocks: readonly Block[]): boolean {
  const inInline = (nodes: readonly Inline[]): boolean =>
    nodes.some((n) =>
      n.kind === "math"
        ? true
        : n.kind === "strong" || n.kind === "em" || n.kind === "link"
          ? inInline(n.children)
          : false,
    );

  return blocks.some((b) => {
    if (b.kind === "list") return b.items.some(inInline);
    if (b.kind === "code" || b.kind === "rule") return false;
    return inInline(b.children);
  });
}
