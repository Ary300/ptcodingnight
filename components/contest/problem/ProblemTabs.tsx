"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { PROBLEM_TABS, type ProblemTab } from "./problem-tab";

/**
 * The Problem | My submissions strip over the statement pane: a real tab widget now.
 *
 * It used to be `ui/TabStrip`, a nav of links, and "My submissions" sent the student to the
 * all-problems history page; to get back to their code they had to find the problem again. Both
 * tabs now show inside this page, and only the statement pane changes. The editor beside or below
 * it is never touched, so its draft, caret and undo history survive any number of switches.
 *
 * ## The look is TabStrip's, measured, and the semantics are not
 *
 * The same tinted tray with a hairline border, the active tab lifted out of it on paper with no
 * bottom border, the same padding and type. TabStrip deliberately refuses `role="tablist"`
 * because its tabs navigate; these do not, so they are the APG tabs pattern: one tab in the Tab
 * order (the selected one), Left and Right move and wrap, Home and End jump to the ends, and
 * selection follows focus because showing either panel is instant. `LanguagePicker` is the same
 * pattern one pane over, which keeps the page's two tab rows behaving alike.
 */

export interface ProblemTabsProps {
  readonly active: ProblemTab;
  readonly onSelect: (tab: ProblemTab) => void;
  /** Ids derive from this: `${idBase}-tab-problem`, `${idBase}-panel-problem`, and so on. */
  readonly idBase: string;
  /** The layout toggle, at the tray's right end. Page furniture, so it sits outside the list. */
  readonly trailing?: ReactNode;
}

const LABEL: Record<ProblemTab, string> = {
  problem: "Problem",
  // "My submissions", as the top bar names the all-problems page: the tab is this problem's
  // slice of that same history.
  submissions: "My submissions",
};

export function problemTabId(idBase: string, tab: ProblemTab): string {
  return `${idBase}-tab-${tab}`;
}

export function problemPanelId(idBase: string, tab: ProblemTab): string {
  return `${idBase}-panel-${tab}`;
}

// `pt-2 pb-4` and a border on both states, exactly as TabStrip draws them, so the row never
// resizes on a switch. The focus ring is inset because the row scrolls and would clip it.
const TAB_BASE =
  "inline-block border px-5 pt-2 pb-4 focus-visible:outline-offset-[-4px]! ";
const TAB_ACTIVE = "border-rule-edge border-b-transparent bg-paper font-semibold";
const TAB_IDLE = "border-transparent font-medium text-ink/70 hover:text-ink";

export function ProblemTabs({ active, onSelect, idBase, trailing }: ProblemTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const hasTrailing = trailing !== undefined && trailing !== null;

  function select(index: number) {
    const next = PROBLEM_TABS[index];
    if (next === undefined) return;
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
    if (next !== active) onSelect(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = PROBLEM_TABS.length - 1;
    const target =
      event.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    select(target);
  }

  return (
    <div className="mt-4 border border-rule-edge bg-ink/[0.04]">
      <div className={hasTrailing ? "flex items-stretch" : "contents"}>
        {/* `-mb-px` on the row, as in TabStrip: the active tab's paper covers the tray's
            bottom border whichever tab it is. */}
        <div
          ref={listRef}
          role="tablist"
          aria-label="Problem views"
          aria-orientation="horizontal"
          className={`-mb-px flex overflow-x-auto px-2.5 pt-2.5${hasTrailing ? " min-w-0 flex-1" : ""}`}
        >
          {PROBLEM_TABS.map((tab, index) => {
            const selected = tab === active;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                id={problemTabId(idBase, tab)}
                aria-selected={selected}
                aria-controls={problemPanelId(idBase, tab)}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`shrink-0 ${TAB_BASE}${selected ? TAB_ACTIVE : TAB_IDLE}`}
                style={{ fontSize: "var(--text-sm)" }}
              >
                {LABEL[tab]}
              </button>
            );
          })}
        </div>
        {hasTrailing && <div className="flex shrink-0 items-center px-2.5 pt-2.5">{trailing}</div>}
      </div>
    </div>
  );
}
