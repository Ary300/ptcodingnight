"use client";

import { Button } from "@/components/ui";

/**
 * "Expand all" and "Collapse all" for a board whose teams each open a breakdown.
 *
 * Two buttons rather than one toggle, because each says exactly what it will do and neither
 * changes its name under the pointer. Per-team state stays independent: these only set every team
 * open or every team closed, and a single caret afterwards opens or closes just its own team.
 *
 * Neither is ever disabled. Disabling the button just pressed drops keyboard focus to the page,
 * and pressing either twice is harmless, so both stay live.
 */
export interface ExpandAllControlsProps {
  /** How many teams on this view could be opened. */
  readonly teamCount: number;
  readonly onExpandAll: () => void;
  readonly onCollapseAll: () => void;
  /** The id of the region the breakdowns live in, for `aria-controls`. */
  readonly controls?: string;
}

export function ExpandAllControls({
  teamCount,
  onExpandAll,
  onCollapseAll,
  controls,
}: ExpandAllControlsProps) {
  if (teamCount === 0) return null;
  return (
    <div
      role="group"
      aria-label="Team breakdowns"
      className="flex flex-wrap items-center justify-end gap-2"
      data-expand-all-controls
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-controls={controls}
        onClick={onExpandAll}
      >
        Expand all
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-controls={controls}
        onClick={onCollapseAll}
      >
        Collapse all
      </Button>
    </div>
  );
}
