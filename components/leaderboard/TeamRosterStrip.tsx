"use client";

import type { TeamStandingRow } from "@/lib/schemas/api";

import styles from "./leaderboard.module.css";

/**
 * Who added what, for ONE team, on the wall: THE SAME SHEET IN MINIATURE.
 *
 * The organizer asked for the thing the competitor board already has: "there is no drop down menu
 * in that to show what every individual is contributing to the score there". This is that drop
 * down, and the shape of it was asked for just as plainly:
 *
 *   "you know how it looks kind of like an excel sheet where there is a team and then the scores.
 *    for the drop down you should have a smaller version of that for each team member, where in a
 *    box the team member's name is there and then to the right there is the scores and it goes
 *    down, but the boxes are smaller to show it's individual"
 *
 * So: a row per member, the name boxed on the left, the numbers to its right IN THE COLUMNS THE
 * TEAM ROW ALREADY USES, drawn one rung smaller.
 *
 * ## Why these are `<tr>`s and not a nested table
 *
 * This component returns rows of the caller's OWN table rather than a grid inside a spanning cell.
 * That is the whole design and not an implementation detail. Column alignment is what makes the
 * block read as one sheet rather than as a second table that happens to sit underneath the first;
 * a nested grid can be given matching widths and will drift the moment a set is added, a name gets
 * longer, or the browser re-measures. Rows of the same table cannot drift, because there is only
 * one set of columns.
 *
 * The cost is that the caller has to hand over its column list, and that is honest: the miniature
 * is not independent of the board and pretending otherwise is how it would come apart.
 *
 * ## What this replaced, and which parts of that argument survived
 *
 * This was a wrapped horizontal strip of chips, argued for on space grounds. That argument lost:
 * the organizer has looked at the real thing and asked for the grid. What is still true, and still
 * enforced here:
 *
 * - **Payload order, never re-sorted.** The board re-polls every five seconds, so a block sorted by
 *   a live number reshuffles names under the room's eyes, and the same roster would then read in one
 *   order here and another on `/team` and in the admin board. The engine's order is already stable,
 *   which is the property standings depend on (docs/SCORING.md, "replayable means byte-identical"),
 *   so the display inherits it.
 * - **No solve times, no solve counts, no rejections.** All public, all on the competitor board,
 *   none of them an answer to "what did he contribute". Every column they would need is a column
 *   the team row above does not have, so adding them would break the alignment that is the point.
 * - **No red numerals.** `--panther` is the team total on this board, at the largest size on the
 *   row. Making the addends red as well would leave nothing standing out. The label on the pool row
 *   is the one accent here, at full strength: `--panther` measures 5.08:1 on paper and ANY alpha on
 *   it fails AA (DESIGN.md §7).
 * - **Level two never appears.** `TeamPlayerRow.problems` arrives `null` unless the viewer is an
 *   organizer or is asking about their own team, and the projector has no session at all. Rendering
 *   an entitled field here would print "Per-problem detail is shown for your own team." once per
 *   member, on the largest screen in the building. The competitor board keeps that panel; the wall
 *   gets who, which set, and how many points.
 *
 * ## It has to add up, and the pool row is what closes it
 *
 * The reason anybody opens this is to check the number above it. Reading down a set column, the
 * member cells sum to exactly the team's cell in that column. Reading down the `=` column, the
 * member cells plus the group points sum to `playerPoolPoints`, which the pool row states and which
 * the team row's own arithmetic line then divides. Nothing in the chain is left to be inferred.
 *
 * A member's points therefore appear TWICE on their line, once under `=` and once under their set,
 * and they are the same number because a player's whole individual total is scored inside the one
 * set they were assigned. That is a row total meeting a column total, which is what a spreadsheet
 * does and what was asked for. Dropping either half breaks something real: without the set cell the
 * column no longer adds up to the team's cell, which is the only reconciliation a room can do by
 * eye; without the `=` cell a player who has not been assigned a set has no column at all and
 * vanishes from a breakdown that is supposed to account for the divisor. Weight separates them: the
 * `=` cell is the line's own number and is bold, the set cell is where it landed and is not.
 *
 * Group points are on the pool row rather than on any member: a group problem is solved once FOR
 * the team and `lib/scoring/team.ts` excludes it from every individual total. Side activity points
 * are on neither, because they are added AFTER the division and are not in the pool at all: the
 * team row's arithmetic line is where they belong and where they already are.
 */

export interface TeamRosterStripProps {
  team: TeamStandingRow;
  /**
   * The board's set columns, in board order.
   *
   * Passed in rather than re-derived from `team.players`, and that is load-bearing: derived here it
   * would be the sets THIS team happens to be in, which is a shorter list than the board's on any
   * team that is not in every set, and every member cell would land one column left of where it
   * belongs.
   */
  columns: readonly string[];
  /** The viewer's own team, so the rail stays lit down the whole block rather than stopping. */
  mine: boolean;
}

/**
 * How many rows the whole block may occupy, members and the pool row together.
 *
 * **MEASURED, not chosen, and measured on 1280x720, which is the binding canvas.** A projector does
 * not scroll and `.teamBoard` clips rather than overflowing, so a block that is one row too tall
 * does not announce itself: it takes the bottom team off the wall under a footnote still claiming
 * to show it. That is exactly the failure this project has shipped before.
 *
 * Measured on this commit, nine teams and four sets, board box against table box, with the top team
 * open:
 *
 * | canvas    | team row | member row | height the block may have |
 * |-----------|----------|------------|---------------------------|
 * | 1920x1080 | 94px     | 28.9px     | 228.7px  (7.9 rows)       |
 * | 1280x720  | 66px     | 20.1px     | 131.5px  (6.5 rows)       |
 *
 * So six, from the smaller canvas: 120.6px against a 131.5px budget, with 10.9px in hand. Seven
 * would be 140.7px and would clip. The budget itself is what `TEAM_EXPANDED_ROW_COST` buys, and
 * that constant lives in `constants.ts` with the screen that spends it.
 *
 * **Nine members do not fit at 1280x720 and cannot be made to.** Nine plus the pool row is 201px
 * against 131.5px available; it would need the open team to cost four rows of board instead of two,
 * which would leave three teams on the wall out of nine. So the block caps, and the cap is a stated
 * visible rule rather than an overflow: a team with more members than fit gets one summarising row
 * that prints the exact number of players it stands for and their exact points, per set, so every
 * column still reconciles with the team row above.
 */
export const MEMBER_BLOCK_ROWS = 6;

/**
 * How many members get a row of their own, given how many there are.
 *
 * Not a constant, because the remainder row only exists when it has something to say: a five-player
 * team fills the block exactly and never sees one, and reserving its row unconditionally would cost
 * that team a named player for nothing.
 */
export function drawnMemberCount(playerCount: number): number {
  // Every member, plus the pool row.
  if (playerCount <= MEMBER_BLOCK_ROWS - 1) return playerCount;
  // Members, the remainder row, and the pool row.
  return MEMBER_BLOCK_ROWS - 2;
}

/** The rail (DESIGN.md §5) is reserved on every row so no row is a rail-width wider than another. */
function railStyle(mine: boolean): React.CSSProperties {
  return {
    borderLeftWidth: "var(--rail-width)",
    borderLeftStyle: "solid",
    // Gold was the projector's marker while the stage was dark; it measures 1.39:1 on paper.
    borderLeftColor: mine ? "var(--color-panther)" : "transparent",
  };
}

export function TeamRosterStrip({ team, columns, mine }: TeamRosterStripProps) {
  const players = team.players;

  const drawnCount = drawnMemberCount(players.length);
  const drawn = players.slice(0, drawnCount);
  const rest = players.slice(drawnCount);
  const restPoints = rest.reduce((sum, player) => sum + player.score, 0);

  /**
   * Is the group total inside the pool, or beside it?
   *
   * `config.groupPointsInsideMean` decides that in the scoring engine and the payload does not
   * carry the flag, so it is derived from the numbers rather than assumed. Derived, not guessed:
   * when the two agree the pool row says where the group points went, and when they do not it says
   * nothing rather than something confident and wrong.
   */
  const memberPoints = players.reduce((sum, player) => sum + player.score, 0);
  const groupInsidePool =
    team.groupPoints > 0 &&
    team.playerPoolPoints === memberPoints + team.groupPoints;

  /** That player's points under that set, blank elsewhere. A blank is not a dash: see below. */
  const setCells = (
    forSet: (label: string) => number | null,
  ): React.ReactNode[] =>
    columns.map((label) => {
      const value = forSet(label);
      return (
        <td
          key={label}
          className={`numeric ${styles.memberCell} ${styles.memberNumber}`}
        >
          {/*
            EMPTY, not the en dash the team row uses for an empty set cell. On a team row the dash
            means "nobody on this team is in this set", which is a fact about the team. On a member
            row the same glyph would read as a claim about the player, and the true claim is simply
            that this is not their column. Nine dashes across a member row is also nine things to
            read on a wall that has one point to make.
          */}
          {value === null ? "" : value}
        </td>
      );
    });

  return (
    <>
      {drawn.map((player) => (
        <tr key={player.participantId} className={styles.memberRow}>
          <td className={styles.memberCell} style={railStyle(mine)} />

          {/*
            `th scope="row"` rather than a `td`: the name is what every number on this line is
            about, and it is the only thing that lets a screen reader announce "Ada, 280" instead
            of reading a bare number under a column header that says "Team score".
          */}
          <th
            scope="row"
            className={`${styles.memberCell} ${styles.memberNameCell}`}
          >
            <span className={styles.memberBox}>{player.displayName}</span>
            {player.chosenSetLabel === null && (
              // Assignment can legitimately not have happened yet, and such a player still counts
              // in the divisor and can still hold points. Said out loud, because their number
              // otherwise sits in the `=` column under no set column at all and looks misplaced.
              <span className={styles.memberTag}>no set</span>
            )}
          </th>

          <td
            className={`numeric ${styles.memberCell} ${styles.memberTotal}`}
          >
            {player.score}
            <span className={styles.visuallyHidden}> points</span>
          </td>

          {setCells((label) =>
            player.chosenSetLabel === label ? player.score : null,
          )}

          {/* Group and side are team facts. Blank on every member row, stated on the pool row. */}
          <td className={styles.memberCell} />
          <td className={styles.memberCell} />
        </tr>
      ))}

      {rest.length > 0 && (
        <tr className={styles.memberRow}>
          <td className={styles.memberCell} style={railStyle(mine)} />
          <th
            scope="row"
            className={`${styles.memberCell} ${styles.memberNameCell}`}
          >
            <span className={`${styles.memberBox} ${styles.memberBoxRest}`}>
              <span className="numeric">{rest.length}</span> more player
              {rest.length === 1 ? "" : "s"}
            </span>
          </th>
          <td className={`numeric ${styles.memberCell} ${styles.memberTotal}`}>
            {restPoints}
            <span className={styles.visuallyHidden}>
              {" "}
              points between them
            </span>
          </td>
          {/* Their points still land in their own columns, so a capped block still reconciles. */}
          {setCells((label) => {
            const inSet = rest.filter((player) => player.chosenSetLabel === label);
            if (inSet.length === 0) return null;
            return inSet.reduce((sum, player) => sum + player.score, 0);
          })}
          <td className={styles.memberCell} />
          <td className={styles.memberCell} />
        </tr>
      )}

      <tr className={`${styles.memberRow} ${styles.poolRow}`}>
        <td className={styles.memberCell} style={railStyle(mine)} />
        <th
          scope="row"
          className={`${styles.memberCell} ${styles.memberNameCell}`}
        >
          <span className={styles.poolLabel}>Player pool</span>
        </th>
        <td className={`numeric ${styles.memberCell} ${styles.memberTotal}`}>
          {team.playerPoolPoints}
          <span className={styles.visuallyHidden}>
            {" "}
            points, divided by team size on the row above
          </span>
        </td>
        {setCells(() => null)}
        <td className={`numeric ${styles.memberCell} ${styles.memberNumber}`}>
          {groupInsidePool ? team.groupPoints : ""}
        </td>
        <td className={styles.memberCell} />
      </tr>
    </>
  );
}
