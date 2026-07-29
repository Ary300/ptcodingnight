/**
 * The projector leaderboard. PRD §9.3, docs/DESIGN.md §5–§6.
 *
 * `app/projector` imports only `ProjectorScreen`; everything else here is internal to the
 * board. Shared primitives (`Delta`, `Rail`, `railStateForDelta`) come from
 * `components/ui`, which this subtree consumes and never duplicates.
 */

export { ProjectorScreen, type ProjectorScreenProps } from "./ProjectorScreen";
export { PROJECTOR_SAMPLE_STANDINGS } from "./sample-standings";
