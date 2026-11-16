import type { ReactNode } from "react";

/**
 * A section of the problem page that folds away behind its own heading: the samples, and the
 * examples inside a statement.
 *
 * Native `<details>`/`<summary>`, so Enter and Space toggle it, the open state is announced, and
 * it works before hydration. The summary carries the section's heading (HTML allows one heading
 * inside a summary), so the page outline still lists "Sample 1" and "Example".
 *
 * `defaultOpen` is read once. React never writes `open` again unless the prop changes, and it
 * never does, so a student's own toggling wins from the first click, the same contract as the
 * verdict panel's diff disclosure.
 *
 * The chevron points right when closed and down when open. It turns on the press duration and
 * not at all under reduced motion, where the glyph's position alone carries the state.
 */

export interface DisclosureProps {
  /** The heading, or any phrasing content, shown in the clickable row. */
  summary: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Extra classes on the `<details>`, for spacing against its neighbours. */
  className?: string;
  /** A stable hook for tests: `data-disclosure="sample"` or `"example"`. */
  kind: "sample" | "example";
}

export function Disclosure({ summary, defaultOpen = false, children, className, kind }: DisclosureProps) {
  return (
    <details
      data-disclosure={kind}
      open={defaultOpen ? true : undefined}
      className={`group rounded-panel border border-rule-edge bg-paper ${className ?? ""}`}
    >
      <summary
        className="flex cursor-pointer list-none items-center gap-2.5 rounded-panel px-3 py-2.5 transition-colors duration-[var(--motion-press)] hover:bg-ink/[0.04] motion-reduce:transition-none [&::-webkit-details-marker]:hidden"
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className="shrink-0 text-panther transition-transform duration-[var(--motion-press)] group-open:rotate-90 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 2l4 4-4 4" />
        </svg>
        {summary}
      </summary>
      <div className="border-t border-rule-hair px-3 pt-3 pb-3">{children}</div>
    </details>
  );
}
