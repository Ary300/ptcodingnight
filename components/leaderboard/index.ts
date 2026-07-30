/**
 * The projector leaderboard. PRD §9.3, docs/DESIGN.md §5–§6.
 *
 * `app/projector` imports only `ProjectorScreen`; everything else here is internal to the
 * board. Shared primitives (`Delta`, `Rail`, `railStateForDelta`) come from
 * `components/ui`, which this subtree consumes and never duplicates.
 */

export { ProjectorScreen, type ProjectorScreenProps } from "./ProjectorScreen";
export { PROJECTOR_SAMPLE_STANDINGS } from "./sample-standings";

/**
 * The team board. Coding Night ranks teams (PRD §9.3), so this is the one the room reads; the
 * individual board above survives for the ICPC preset and for "my own score".
 */
export { TeamStandingsBoard, type TeamStandingsBoardProps } from "./TeamStandingsBoard";
export { TeamProjectorScreen, type TeamProjectorScreenProps } from "./TeamProjectorScreen";
export { useTeamStandings, type UseTeamStandingsResult } from "./useTeamStandings";
