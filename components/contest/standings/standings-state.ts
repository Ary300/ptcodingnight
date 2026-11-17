import type { TeamStandingRow, TeamStandingsResponse } from "@/lib/schemas/api";

/**
 * What the student Standings page says about the board it is showing, in words.
 *
 * The projector says the same three things in its subtitle (`TeamProjectorScreen`): frozen, final,
 * or live as of a time. Kept to the same rule, because a student in another room and the wall in
 * the main room must never disagree about whether the board is frozen. The freeze itself is not
 * decided here: the page reads the PUBLIC board, and the server answers it as of the freeze until
 * an organizer presses "Unfreeze and reveal".
 */
export type StandingsState = "frozen" | "final" | "live";

export function standingsState(
  standings: Pick<TeamStandingsResponse, "frozen" | "asOf" | "endsAt" | "isPractice">,
): StandingsState {
  if (standings.frozen) return "frozen";
  // Past the end and not frozen is the revealed board. A practice arena has no reveal.
  if (!standings.isPractice && Date.parse(standings.asOf) >= Date.parse(standings.endsAt)) {
    return "final";
  }
  return "live";
}

/**
 * The viewer's own team, found by the participant id on its roster.
 *
 * The public board carries every team's players, so no second request is needed to tell a student
 * which row is theirs, and nothing about the request has to identify them.
 */
export function teamOfParticipant(
  teams: readonly TeamStandingRow[],
  participantId: string | null,
): string | null {
  if (participantId === null) return null;
  return (
    teams.find((team) => team.players.some((player) => player.participantId === participantId))
      ?.teamId ?? null
  );
}
