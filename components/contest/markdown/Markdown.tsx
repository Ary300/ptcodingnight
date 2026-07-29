import { createElement, type ReactNode } from "react";

import { parseMarkdown, type Block, type Inline } from "./parse";
import { Tex } from "./Tex";

/**
 * Renders a problem statement.
 *
 * Every node becomes a React element. No HTML string is ever constructed, so statement text
 * cannot introduce markup regardless of what an author writes — see `parse.ts` for why that
 * is the design rather than a sanitiser.
 *
 * Measure is capped near 70 characters (docs/DESIGN.md §5): students read these for two
 * hours, and a statement running the full width of a laptop is measurably harder to track
 * line to line.
 */

function renderInline(nodes: readonly Inline[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;

    switch (node.kind) {
      case "text":
        return <span key={key}>{node.value}</span>;

      case "code":
        return (
          <code
            key={key}
            className="rounded bg-ink/10 px-1.5 py-0.5 font-mono text-[0.9em] text-ink"
          >
            {node.value}
          </code>
        );

      case "math":
        return <Tex key={key} tex={node.tex} />;

      case "strong":
        return (
          <strong key={key} className="font-semibold">
            {renderInline(node.children, key)}
          </strong>
        );

      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;

      case "link":
        return (
          <a
            key={key}
            href={node.href}
            className="text-panther underline underline-offset-2 hover:text-panther-deep"
            rel="noopener noreferrer"
          >
            {renderInline(node.children, key)}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, key: string): ReactNode {
  switch (block.kind) {
    case "heading":
      return createElement(
        `h${block.level}`,
        {
          key,
          className: "mt-8 mb-3 font-display font-bold text-ink first:mt-0",
          style: { fontSize: block.level <= 3 ? "var(--text-lg)" : "var(--text-md)" },
        },
        renderInline(block.children, key),
      );

    case "paragraph":
      return (
        <p key={key} className="my-4 leading-relaxed">
          {renderInline(block.children, key)}
        </p>
      );

    case "code":
      return (
        <pre
          key={key}
          className="my-5 overflow-x-auto rounded bg-ink p-4 text-paper"
          // Long sample blocks scroll inside their own box; the page never scrolls sideways.
          tabIndex={0}
          role="region"
          aria-label={block.language === null ? "Code block" : `${block.language} code block`}
        >
          <code className="font-mono text-xs leading-relaxed">{block.value}</code>
        </pre>
      );

    case "mathBlock":
      return <Tex key={key} tex={block.tex} display />;

    case "list": {
      const items = block.items.map((item, index) => (
        <li key={`${key}-${index}`} className="my-1.5">
          {renderInline(item, `${key}-${index}`)}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} className="my-4 list-decimal space-y-1 pl-6">
          {items}
        </ol>
      ) : (
        <ul key={key} className="my-4 list-disc space-y-1 pl-6">
          {items}
        </ul>
      );
    }

    case "quote":
      return (
        <blockquote
          key={key}
          className="my-5 border-l-4 border-panther/50 bg-ink/5 py-2 pl-4 text-ink/80"
        >
          {renderInline(block.children, key)}
        </blockquote>
      );

    case "rule":
      return <hr key={key} className="my-8 border-ink/15" />;
  }
}

export interface MarkdownProps {
  source: string;
  className?: string;
}

export function Markdown({ source, className }: MarkdownProps) {
  const blocks = parseMarkdown(source);

  return (
    <div className={`max-w-[70ch] text-ink ${className ?? ""}`} style={{ fontSize: "var(--text-sm)" }}>
      {blocks.map((block, index) => renderBlock(block, `b-${index}`))}
    </div>
  );
}
