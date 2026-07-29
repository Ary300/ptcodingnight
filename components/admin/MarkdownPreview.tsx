import { Fragment, type ReactNode } from "react";

import { parseMarkdown, usesMath, type Block, type HeadingLevel, type Inline } from "@/components/admin/markdown";

/**
 * Renders the tree from `markdown.ts` as React elements. No HTML string ever exists, so
 * there is nothing to sanitise and nothing to forget to sanitise.
 */

const HEADING_SIZE: Record<HeadingLevel, string> = {
  1: "var(--text-xl)",
  2: "var(--text-lg)",
  3: "var(--text-md)",
  4: "var(--text-md)",
  5: "var(--text-sm)",
  6: "var(--text-sm)",
};

function renderInline(nodes: readonly Inline[], keyPrefix: string): ReactNode {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case "text":
        return <Fragment key={key}>{node.text}</Fragment>;
      case "code":
        return (
          <code key={key} className="numeric rounded bg-ink/8 px-1 py-0.5 text-[0.9em]">
            {node.text}
          </code>
        );
      case "strong":
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "link":
        return (
          <a
            key={key}
            href={node.href}
            className="text-panther underline underline-offset-2"
            rel="noreferrer noopener"
          >
            {renderInline(node.children, key)}
          </a>
        );
      case "math":
        return (
          <code
            key={key}
            className="numeric rounded border border-panther/40 px-1"
            title="Math is not rendered in the preview yet"
          >
            {node.text}
          </code>
        );
    }
  });
}

function renderBlock(block: Block, key: string): ReactNode {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as "h1";
      return (
        <Tag
          key={key}
          className="mt-6 mb-2 font-semibold first:mt-0"
          style={{ fontFamily: "var(--font-display)", fontSize: HEADING_SIZE[block.level] }}
        >
          {renderInline(block.children, key)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="my-3 leading-relaxed">
          {renderInline(block.children, key)}
        </p>
      );
    case "code":
      return (
        <pre
          key={key}
          className="numeric my-4 overflow-x-auto rounded bg-ink p-4 text-paper"
          style={{ fontSize: "var(--text-xs)" }}
        >
          <code>{block.text}</code>
        </pre>
      );
    case "list":
      return block.ordered ? (
        <ol key={key} className="my-3 list-decimal space-y-1 pl-6">
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="my-3 list-disc space-y-1 pl-6">
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote key={key} className="my-4 border-l-4 border-panther/50 pl-4 italic opacity-90">
          {renderInline(block.children, key)}
        </blockquote>
      );
    case "rule":
      return <hr key={key} className="my-6 border-ink/15" />;
  }
}

export interface MarkdownPreviewProps {
  source: string;
  className?: string;
}

export function MarkdownPreview({ source, className }: MarkdownPreviewProps) {
  const blocks = parseMarkdown(source);

  if (blocks.length === 0) {
    return (
      <p className={`opacity-60 ${className ?? ""}`} style={{ fontSize: "var(--text-sm)" }}>
        Nothing to preview yet. The statement must be written in the organiser&rsquo;s own
        words — never pasted from HackerRank (PRD §8).
      </p>
    );
  }

  return (
    <div className={className}>
      {usesMath(blocks) && (
        <p
          className="mb-4 rounded border border-panther/40 px-3 py-2"
          style={{ fontSize: "var(--text-xs)" }}
        >
          This statement uses <code className="numeric">$…$</code> math. KaTeX is not wired up
          yet, so it is shown as literal monospace here and will render the same way to
          students.
        </p>
      )}
      {/* Measure held at 65–75 characters for statements (DESIGN.md §5). */}
      <div className="max-w-[70ch]" style={{ fontSize: "var(--text-sm)" }}>
        {blocks.map((block, index) => renderBlock(block, `b${index}`))}
      </div>
    </div>
  );
}
