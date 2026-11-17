"use client";

import { useId, type ReactNode } from "react";

/**
 * The Results drawer, docked at the bottom of the editor pane above Run and Submit.
 *
 * HackerRank's test editor keeps its test results in a panel that folds up under the code, so
 * the editor stays the size the student gave it until there is something to read. This is that
 * panel. The workspace opens it when a run or a submit starts; the student can fold it away
 * again, and the header keeps the outcome in words either way.
 *
 * ## It never takes the editor's room
 *
 * Open, the drawer is capped at 45% of the pane and scrolls inside that cap, so a long compile
 * error or a dozen hidden-test rows push nothing off screen: the code above it and the buttons
 * below it stay where they are.
 *
 * ## Announcements
 *
 * The verdict panel inside carries its own live regions, which only speak while the drawer is
 * open. Folded, the summary line takes over as a polite live region, so a screen-reader user
 * who closed the drawer still hears that the run finished.
 */

export interface ResultsDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The outcome in a few words, shown open or folded; `null` before anything has run. */
  readonly summary: string | null;
  readonly children: ReactNode;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-[var(--motion-press)] ${open ? "" : "rotate-180"}`}
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  );
}

export function ResultsDrawer({ open, onOpenChange, summary, children }: ResultsDrawerProps) {
  const bodyId = useId();
  return (
    <section
      aria-label="Results"
      data-results-drawer={open ? "open" : "closed"}
      className={`flex shrink-0 flex-col border-t border-rule-edge bg-paper ${open ? "max-h-[45%] min-h-0" : ""}`}
    >
      <h2 className="shrink-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onOpenChange(!open)}
          className="flex w-full items-center gap-2 bg-ink/[0.03] px-4 py-2 text-left transition-colors duration-[var(--motion-press)] hover:bg-ink/[0.06] focus-visible:outline-offset-[-2px]!"
        >
          <Chevron open={open} />
          <span className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
            Results
          </span>
          <span
            aria-live={open ? "off" : "polite"}
            className="min-w-0 truncate text-ink/70"
            style={{ fontSize: "var(--text-xs)" }}
          >
            {summary ?? ""}
          </span>
        </button>
      </h2>
      <div
        id={bodyId}
        hidden={!open}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-4"
      >
        {children}
      </div>
    </section>
  );
}
