/**
 * Shared primitives. Orchestrator-owned and frozen during Phase 4b fan-out
 * (docs/PLAN.md §3).
 *
 * If a frontend agent needs a new primitive, it requests one rather than adding a
 * near-duplicate inside its own subtree — three slightly different Buttons is exactly the
 * outcome this directory exists to prevent.
 */

export { Button, type ButtonProps, type ButtonVariant } from "@/components/ui/Button";
export { Delta, type DeltaProps } from "@/components/ui/Delta";
export { Rail, railStateForDelta, type RailProps, type RailState } from "@/components/ui/Rail";
