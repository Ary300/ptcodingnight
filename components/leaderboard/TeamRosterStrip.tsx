"use client";

import type { TeamStandingRow } from "@/lib/schemas/api";

import styles from "./leaderboard.module.css";

/**
 * Who added what, for ONE team, on the wall.
 *
 * The organizer asked for the thing the competitor board already has: "there is no drop down menu
 * in that to show what every individual is contributing to the score there". This is that drop
 * down, rebuilt for a room rather than ported to it.
 *
 * ## Why this is not `TeamPlayerDetail`
 *
 * Three reasons, and each one alone is enough.
 *
 * 1. **It would print a refusal nine times.** Level two of the competitor panel is entitled:
 *    `TeamPlayerRow.problems` arrives `null` unless the viewer is an organizer or is asking about
 *    their own team, and the projector has no session at all. `TeamPlayerLine` renders that state
 *    as the sentence "Per-problem detail is shown for your own team." One line per player, on the
 *    largest screen in the building, saying nothing.
 * 2. **It is a column and this has to be a line.** The competitor panel stacks players vertically,
 *    which is right on a phone. The demo contest already has a nine-player team; nine stacked lines
 *    at the projector's floor size is most of the board.
 * 3. **The questions are different.** The competitor panel answers "how is my teammate DOING" (per
 *    problem, rejections, solve times, who is stuck) for someone sitting 30cm from a phone. A room
 *    reading from ten metres wants the addends of the mean and nothing else: who, which set, how
 *    many points.
 *
 * So: one wrapped line of players, each of them a name, a set and a number. The numbers here add up
 * to the `N pts` on the arithmetic line of the row directly above, which is the whole point of
 * opening it. Someone who can add the strip up has checked the team's score by hand.
 *
 * ## What is deliberately absent
 *
 * - **Solve counts and solve times.** Both are public and both are on the competitor board. Each
 *   costs about a third of a chip's width, which is the difference between a two-line strip and a
 *   four-line one, and neither answers "what did he contribute".
 * - **Colour on the numbers.** The team score is the red numeral on this board (that is what was
 *   asked for). Making every addend red as well would leave nothing standing out. `--panther` is
 *   5.08:1 on paper and is used here only for the strip's own label, at full strength: any alpha on
 *   it fails AA (DESIGN.md §7).
 */

export interface TeamRosterStripProps {
  team: TeamStandingRow;
}

export function TeamRosterStrip({ team }: TeamRosterStripProps) {
  /*
    Payload order, never re-sorted here.

    Sorting by contribution was the obvious idea and it is wrong twice: the board re-polls every
    five seconds, so a strip sorted by a live number reshuffles names under the room's eyes, and
    the same roster would then read in one order here and another on `/team` and in the admin
    board. The engine's order is already stable, which is the property standings depend on
    (docs/SCORING.md, "replayable means byte-identical"), so the display inherits it.
  */
  const players = team.players;

  /*
    Group and side points are TEAM facts. They are in the row's own columns, they are not in any
    player's `score` (lib/scoring/team.ts excludes group problems from the individual total), and
    they are not in this strip. Said out loud when they exist, because the first thing an organizer
    does with a breakdown is add it up, and finding it short of the team total with no explanation
    reads as a scoring bug.
  */
  const teamOnly: string[] = [];
  if (team.groupPoints > 0) teamOnly.push(`group ${String(team.groupPoints)}`);
  if (team.sideActivityPoints > 0) {
    teamOnly.push(`side ${String(team.sideActivityPoints)}`);
  }

  return (
    <div className={styles.roster}>
      <span className={styles.rosterLabel}>Who scored what</span>

      <ul className={styles.rosterList} aria-label={`${team.name}: who scored what`}>
        {players.map((player) => (
          <li key={player.participantId} className={styles.rosterPlayer}>
            <span className={styles.rosterName}>{player.displayName}</span>
            <span className={`numeric ${styles.rosterSet}`}>
              {player.chosenSetLabel === null
                ? "no set"
                : `set ${player.chosenSetLabel}`}
            </span>
            <span className={`numeric ${styles.rosterScore}`}>
              {player.score}
              <span className={styles.visuallyHidden}> points</span>
            </span>
          </li>
        ))}
      </ul>

      {teamOnly.length > 0 && (
        <p className={styles.rosterNote}>
          <span className="numeric">{teamOnly.join(" and ")}</span> count for the
          team, not for any one player
        </p>
      )}
    </div>
  );
}
