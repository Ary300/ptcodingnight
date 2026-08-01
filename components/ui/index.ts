/**
 * Shared primitives. Orchestrator-owned and frozen during Phase 4b fan-out
 * (docs/PLAN.md §3).
 *
 * If a frontend agent needs a new primitive, it requests one rather than adding a
 * near-duplicate inside its own subtree — three slightly different Buttons is exactly the
 * outcome this directory exists to prevent.
 */

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "@/components/ui/Button";
export {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Stacked,
  type TableProps,
  type TableSectionProps,
  type TRProps,
  type THProps,
  type TDProps,
  type StackedProps,
  type CellAlign,
} from "@/components/ui/DataTable";
export { Delta, type DeltaProps } from "@/components/ui/Delta";
export {
  Select,
  CONTROL_SURFACE,
  CONTROL_PAD,
  CONTROL_LEADING,
  CONTROL_FONT_SIZE,
  type SelectProps,
  type SelectSize,
} from "@/components/ui/Select";
export { TabStrip, Crumbs, type TabStripProps, type TabStripItem, type CrumbsProps } from "@/components/ui/TabStrip";
export { Rail, railStateForDelta, type RailProps, type RailState } from "@/components/ui/Rail";
