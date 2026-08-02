"use client";

import { Fragment, useState } from "react";

import type {
  TeamPlayerProblem,
  TeamPlayerRow,
  TeamStandingRow,
} from "@/lib/schemas/api";

import { TeamRosterStrip } from "./TeamRosterStrip";
import styles from "./leaderboard.module.css";

/**
 * The team board, built on the Codeforces standings table.
 *
 * ## Why that table and not a list of rows
 *
 * Codeforces puts one column per problem and one row per competitor, so the whole contest is a
 * grid you read in either direction: down a column to see how a problem went, across a row to see
 * how someone is doing. A ranked list of totals cannot answer either question. Everything else in
 * this application follows HackerRank; the standings follow Codeforces, because this is the one
 * screen where a dense grid beats a friendly list.
 *
 * Taken from that table, concretely: a centred title over a bordered grid, `#` / who / `=` / one
 * column per problem, a two-line cell with the score over the time, tabular figures so the columns
 * line up, thin rules, a tight row, and the zebra stripe — CF alternates a pale grey with white
 * per competitor, and with 66px rows and eight columns that alternation is what lets an eye track
 * one team across the board from the back of a room. Ours is indexed per TEAM rather than per
 * `<tr>`, so the roster strip's inserted rows cannot flip the stripes beneath an open team. What
 * is NOT taken is at the bottom of this comment.
 *
 * ## What "one column per problem" means for a TEAM contest
 *
 * It cannot be per problem, and that is not a compromise — it is the format. Every player is
 * assigned a different set (PRD §6.2), so a team's members are not attempting the same problems
 * and a per-problem grid would be almost entirely empty. **The sets are the columns.** A cell is
 * one team's player in one set: their points, and — where the preset charges penalties — their
 * time under it, exactly where Codeforces puts the solve time. Read down column A and you can see
 * how the easy set went across the room; read across a row and you see who on that team carried
 * it.
 *
 * ## Why the arithmetic is still on screen
 *
 * A team score is a mean, so it is not a number a student can check in their head — and the thing
 * this platform replaced got that arithmetic *wrong* by 31.25 points (docs/SCORING.md §2.1). The
 * `=` column is the score; the row under the team name is how it was reached; and the expander
 * opens every input. Someone who can see how the number was reached does not have to trust it.
 *
 * That expander has **two levels**. Level one is the roster and the arithmetic, and it is public on
 * every team, because it is the same class of fact the projector already shows. Level two is per
 * player, per problem — `components/leaderboard/TeamPlayerDetail.tsx` — and it is **entitled**: it
 * arrives `null` unless the viewer is an organizer or is asking about their own team. The decision
 * is taken in `getTeamStandings`, not here, because both routes behind this board are
 * unauthenticated and a component gate would leave the data sitting in the network tab.
 *
 * The PROJECTOR has level one and only level one, drawn differently: `TeamRosterStrip` emits MORE
 * ROWS OF THIS TABLE, one per member, in these columns and one rung smaller, so the breakdown is
 * the same sheet in miniature and a member's points sit under the set column they were scored in.
 * It is controlled from `TeamProjectorScreen` because on a wall the open row has to be paid for in
 * rows. Level two never appears there, twice over — the payload sends `null` to an anonymous
 * reader, and the miniature has no column to put it in.
 *
 * This is also where the imitation stops. A CF row is a name and a total, because an individual's
 * score is a sum anyone can add up. A mean is not, so the divisor stays on the row. A board that
 * looked more like Codeforces by dropping it would be a worse board.
 *
 * ## Deliberately not copied ON THE TEAM ROW
 *
 * Two of these were once absolute and are now true only of the row. `TeamPlayerProblem` put
 * `basePoints` and `rejectedCount` into the contract for the level-two panel, so a comment still
 * claiming the contract has no such number would read as a live constraint and be wrong.
 *
 * - **A point value under each column letter.** CF prints what the problem is worth. A *set* still
 *   has no single worth — it is several problems, and different players hold different ones — so
 *   the column keeps its sub-label rather than an invented total. `basePoints` exists per problem
 *   now, and per problem is where it stays.
 * - **The red `−2` failed-attempt count, on a team row.** The count exists now, and it is in the
 *   per-player panel. It is not on this row and must not be: a team row aggregates several players
 *   across a whole set, and a rejection count summed over that means nothing anybody would want.
 *   An unscored cell still shows a real `0` — "in this set, nothing yet".
 * - **Colour as the carrier of meaning.** CF leans on green-for-solved. Here `0` versus `420`,
 *   weight, and the dash for "nobody in this set" each read correctly in greyscale, which they
 *   have to: the board spends part of the night desaturated behind the freeze, and roughly 1 in 12
 *   boys in the room has a colour-vision deficiency (DESIGN.md §3). The projector's team score is
 *   red as of this change, and it is still not colour ALONE: it is the `=` column, in the heaviest
 *   weight on the row, at the largest size on the board.
 *
 * ## Formatting
 *
 * Scores render with `toFixed(2)` because `543.75` and `543.8` are different claims, and a mean is
 * routinely fractional. The value shown is derived from `scoreHundredths`, which is what the engine
 * ranks by; the decimal is never summed or compared here.
 */

export interface TeamStandingsBoardProps {
  teams: readonly TeamStandingRow[];
  /** Contest-configured columns, including currently unassigned sets. */
  setLabels: readonly string[];
  groupPointsInsideMean: boolean;
  sideActivitiesFlat: boolean;
  /** Projector mode: larger type, public roster rows, and externally budgeted expansion. */
  variant?: "interactive" | "projector";
  /** Highlights the viewer's own team. */
  highlightTeamId?: string | null;
  /**
   * Projector only: the roster strips that are open.
   *
   * **Controlled from outside, unlike the interactive expander**, and that asymmetry is the whole
   * design. On a phone an open panel just makes the page taller. On a wall there is no taller: the
   * every strip has to be paid for out of the row budget, so the screen that owns the budget
   * (`TeamProjectorScreen`) has to own this set too. A board that toggled its own state here would
   * expand into rows it had already been told to draw and clip them.
   */
  openTeamIds?: ReadonlySet<string>;
  /** Projector only. Absent means the board is not expandable at all. */
  onToggleTeam?: (teamId: string) => void;
  /**
   * Projector only: rows each open roster strip may occupy, decided by the same screen that owns
   * `openTeamIds` — the strips share one measured height, so each one's share depends on how many
   * are open (`memberBlockBudget` in `projector-rows.ts`). Undefined means the full block.
   */
  memberBlockRows?: number;
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

function timeOfDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface PlayerProblemListProps {
  player: TeamPlayerRow;
}

/** The entitled, problem-by-problem layer that sits below one aligned player row. */
function PlayerProblemList({ player }: PlayerProblemListProps) {
  const problems = player.problems ?? [];

  return (
    <ul
      aria-label={`${player.displayName}: problem by problem`}
      className={styles.playerProblemList}
    >
      {problems.map((problem: TeamPlayerProblem) => {
        const facts: string[] = [];
        if (problem.firstScoredAt !== null) {
          facts.push(`first scored ${timeOfDay(problem.firstScoredAt)}`);
        }
        if (problem.penaltyMinutes > 0) {
          facts.push(`${String(problem.penaltyMinutes)} min penalty`);
        }
        if (problem.hintsTaken > 0) {
          facts.push(
            `${String(problem.hintsTaken)} hint${problem.hintsTaken === 1 ? "" : "s"} (−${String(problem.hintDeduction)})`,
          );
        }
        if (problem.isGroupProblem) facts.push("group score");
        if (problem.score === 0 && !problem.isGroupProblem) {
          facts.push("not scored yet");
        }

        return (
          <li key={problem.contestProblemId} className={styles.playerProblemLine}>
            <span className="numeric font-bold">{problem.slotLabel}</span>
            <span className={styles.playerProblemTitle}>{problem.title}</span>
            {problem.rejectedCount > 0 && (
              <span className="numeric font-bold text-panther">
                <span aria-hidden="true">&minus;{problem.rejectedCount}</span>
                <span className={styles.visuallyHidden}>
                  {player.displayName}: {problem.rejectedCount} rejected submission
                  {problem.rejectedCount === 1 ? "" : "s"}
                </span>
              </span>
            )}
            <span className="numeric text-right font-bold">
              {problem.score}
              <span className={styles.visuallyHidden}> points</span>
            </span>
            {facts.length > 0 && (
              <span className={styles.playerProblemFacts}>{facts.join(" · ")}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "1450 pts ÷ 4 players = 362.50 + 150 side" in the contest's actual scoring mode. */
function arithmeticFor(
  team: TeamStandingRow,
  groupPointsInsideMean: boolean,
  sideActivitiesFlat: boolean,
): string {
  const pool = `${team.playerPoolPoints} pts`;
  const divisor =
    team.teamSize === 0
      ? "no players"
      : `${team.teamSize} player${team.teamSize === 1 ? "" : "s"}`;
  const meanHundredths =
    team.teamSize === 0
      ? 0
      : Math.round((team.playerPoolPoints * 100) / team.teamSize);
  const groupHundredths = groupPointsInsideMean ? 0 : team.groupPoints * 100;
  // Derived from the authoritative total so the UI never reimplements negative half-away rounding.
  const sideHundredths = team.scoreHundredths - meanHundredths - groupHundredths;

  const term = (hundredths: number, label: string): string => {
    if (hundredths === 0) return "";
    const operator = hundredths < 0 ? " - " : " + ";
    return `${operator}${formatScore(Math.abs(hundredths) / 100)} ${label}`;
  };

  const group = term(groupHundredths, "group");
  const side = term(
    sideHundredths,
    sideActivitiesFlat || team.teamSize === 0
      ? "side"
      : `side (${String(team.sideActivityPoints)} pts ÷ ${divisor})`,
  );

  return `${pool} ÷ ${divisor} = ${formatScore(meanHundredths / 100)}${group}${side}`;
}

/** One team's points in one set. Current rosters allow one teammate per set; sums tolerate legacy data. */
interface SetCell {
  readonly points: number;
  readonly penaltyMinutes: number;
}

/**
 * The set labels to use as columns, across every team on the board.
 *
 * Sorted, and derived from the data rather than assumed to be A–D: a contest can be configured
 * with a different number of sets, and a column that exists because a constant said so would be
 * empty on every row without anyone noticing it was wrong.
 */
function cellFor(team: TeamStandingRow, label: string): SetCell | null {
  const players = team.players.filter((p) => p.chosenSetLabel === label);
  if (players.length === 0) return null;

  return {
    points: players.reduce((sum, p) => sum + p.score, 0),
    penaltyMinutes: players.reduce((sum, p) => sum + p.penaltyMinutes, 0),
  };
}

/**
 * Does this board charge penalties at all?
 *
 * Codeforces always prints a time under the score because every CF format is timed. The Coding
 * Night preset is not: `coding-night-classic` awards points and charges nothing, so on that board
 * the second line of every cell would read `0m` on every row — a column of zeroes whose only
 * content is that the column means nothing here.
 *
 * The decision is therefore taken once for the WHOLE board rather than per cell. Per cell, a row
 * with a penalty would be a line taller than a row without one and the grid would comb.
 */
function anyPenalty(teams: readonly TeamStandingRow[]): boolean {
  return teams.some((team) =>
    team.players.some((player: TeamPlayerRow) => player.penaltyMinutes > 0),
  );
}

export function TeamStandingsBoard({
  teams,
  setLabels,
  groupPointsInsideMean,
  sideActivitiesFlat,
  variant = "interactive",
  highlightTeamId = null,
  openTeamIds = new Set(),
  onToggleTeam,
  memberBlockRows,
}: TeamStandingsBoardProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [expandedPlayers, setExpandedPlayers] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const projector = variant === "projector";
  /** A projector board is expandable only when somebody upstream is budgeting for it. */
  const toggleWall = projector ? onToggleTeam : undefined;

  const toggle = (teamId: string): void => {
    setExpanded((current) => {
      // A new Set rather than a mutation: immutable updates are the house rule, and React needs a
      // new reference to re-render anyway.
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const togglePlayer = (playerKey: string): void => {
    setExpandedPlayers((current) => {
      const next = new Set(current);
      if (next.has(playerKey)) next.delete(playerKey);
      else next.add(playerKey);
      return next;
    });
  };

  /**
   * ONE GROUND NOW, so these no longer branch.
   *
   * The projector used to be an `--ink` stage, and DESIGN.md §7 states the contrast floors per
   * ground — 57% for ink on paper, 47% for paper on ink — so the same class was not merely a
   * different colour there, it was a different *measurement*. The stage is paper now (Codeforces
   * uses a white ground and so do we), which collapses the pair.
   *
   * They are kept as named constants rather than inlined for the reason they existed: a new cell
   * cannot pick a tone and forget that it has a floor. And they are kept as VARIABLES rather than
   * folded into the JSX so that the day somebody adds a second ground back, there is one place to
   * branch instead of forty.
   *
   * The projector still differs — in SIZE, through `--text-proj-*`, which is what a room actually
   * needs — so `projector` is still a meaningful prop.
   */
  const muted = "text-ink/70";
  const dim = "text-ink/60";
  /* The rule tokens exist to delete hand-picked border alphas; this was a twelfth (`ink/20`). */
  const grid = "border-rule-edge";
  const headBg = "bg-ink/5";
  /** One accent on one ground. `--color-gold` is 1.39:1 on paper and cannot appear here. */
  const accent = "text-panther";

  /**
   * Codeforces prints a solved cell green and a failed one red. NEITHER is available to us any
   * more, on either surface.
   *
   * This branched on `projector` back when the projector was an `--ink` stage, where `--rise` and
   * `--fall` clear AAA. The stage is paper now, and on paper they measure **2.02** and **1.94** —
   * axe caught the green one at exactly 2.02 against #fbf9f8 and called it serious. The comment
   * above this code already said so; the code had simply not followed it, which is the whole
   * hazard of a colour that is legal on one ground and not the other.
   *
   * So both states are carried by WEIGHT and by `--panther` at 5.08, which is also what was asked
   * for — the numbers are red. The number itself already says which state it is in, so hue was
   * never doing the work here anyway (DESIGN.md §3: colour is never the only channel).
   */
  const scored = "text-ink";
  const unscored = "text-panther";

  /**
   * Every size on the projector comes from the stage's `--fs-*` ladder rather than the raw
   * `--text-proj-*` tokens, so the board takes part in the uniform 1920→1280 degrade instead of
   * staying 1920-sized on a 720-tall canvas and running off the bottom. The fallbacks keep it
   * legible if it is ever rendered outside a `.stage`.
   *
   * `--text-proj-sm` is the floor of the projector scale and it is the floor here too: header
   * labels, the arithmetic line and the cell times all sit exactly on it. They were `--text-xs`
   * — 12.8px, a phone size, on a wall — and unreadable past the second row of desks.
   */
  const size = projector
    ? {
        head: "var(--fs-sm, var(--text-proj-sm))",
        sub: "var(--fs-sm, var(--text-proj-sm))",
        name: "var(--fs-md, var(--text-proj-md))",
        rank: "var(--fs-md, var(--text-proj-md))",
        cell: "var(--fs-md, var(--text-proj-md))",
        total: "var(--fs-lg, var(--text-proj-lg))",
      }
    : {
        head: "var(--text-xs)",
        sub: "var(--text-xs)",
        name: "var(--text-md)",
        rank: "var(--text-md)",
        cell: "var(--text-sm)",
        total: "var(--text-lg)",
      };

  const columns = setLabels;
  const showTimes = anyPenalty(teams);

  if (teams.length === 0) {
    return (
      <p
        role="status"
        className={dim}
        style={{ fontSize: projector ? size.name : "var(--text-sm)" }}
      >
        No teams yet. An organizer creates teams and assigns players before the
        round starts.
      </p>
    );
  }

  /* Codeforces rows are tight, and on the projector the density is also what decides how many
     teams are on the wall at all: every extra pixel of padding is multiplied by the row count and
     comes off the bottom of a canvas that does not scroll. */
  const cellPad = projector ? "px-3 py-1" : "px-2.5 py-1.5";
  const numericCol = { width: "1%", whiteSpace: "nowrap" } as const;

  return (
    /*
      The table scrolls inside its own box, and it is CENTRED with a bound on its width.

      Both halves matter. Without the box, a grid wider than a phone makes the *document* scroll
      sideways, which is a DESIGN.md §7 failure G9 checks for at 360px. Without the bound, the one
      flexible column (`Team`, at `width: 100%`) eats every spare pixel of a 1920 canvas and opens
      a quarter-screen gulf between each team's name and its score — which the eye has to cross on
      every row, from ten metres away.

      On the projector that bound GROWS WITH THE COLUMN COUNT, because a fixed one is wrong at
      both ends: sized for a two-set contest it squeezes a four-set one until the arithmetic line
      wraps and every row becomes three lines tall — which cost five of ten rows off the bottom of
      a 1080 canvas, under a footnote still claiming to show ten.
    */
    <div
      className="mx-auto w-full"
      style={{
        maxWidth: projector
          ? `calc(var(--fs-lg, 2.667rem) * ${String(24 + 4 * columns.length)})`
          : "72rem",
      }}
    >
      {/* `rounded-panel` on the interactive board only: DataTable already frames the app's other
          table that way, and two table treatments in one product is one too many. The projector
          wall keeps square corners — a section radius says "card", and a wall is not a card. */}
      <div
        className={`w-full overflow-x-auto border ${grid} ${projector ? "" : "rounded-panel bg-paper"}`}
      >
        <table
          aria-label="Team standings"
          className="w-full border-collapse"
          style={{ fontSize: projector ? size.cell : "var(--text-sm)" }}
        >
          <thead>
            <tr className={headBg}>
              <th
                scope="col"
                className={`numeric border ${grid} ${cellPad} text-right font-normal ${muted}`}
                style={{ fontSize: size.head, ...numericCol }}
              >
                {/* CF's `#`: drawn as the glyph, read aloud as the word, because "number sign" is
                  not a column heading. */}
                <span aria-hidden="true">#</span>
                <span className={styles.visuallyHidden}>Rank</span>
              </th>
              {/*
              `width: 100%` on the one flexible column, `width: 1%` + nowrap on every other. That
              is the table idiom for "this column takes the slack, the rest are content-sized" —
              without it the leftover space lands on whichever column the browser feels like,
              which here first pushed `Side` off the right edge of a 1280 projector and then, once
              the others were pinned, made the rank column four hundred pixels wide. The wrapper's
              max-width is what stops the slack itself from becoming the next problem.
            */}
              <th
                scope="col"
                className={`border ${grid} ${cellPad} text-left font-normal ${muted}`}
                style={{ fontSize: size.head, width: "100%" }}
              >
                Team
              </th>
              {/*
              Codeforces labels its total column "=". Kept, because it is the same idea and it is
              the narrowest possible label for the column that matters most — but given a real
              accessible name, since "equals" read aloud is not a column heading.
            */}
              <th
                scope="col"
                aria-label="Team score"
                className={`numeric border ${grid} ${cellPad} text-right font-bold`}
                style={{ fontSize: size.head, ...numericCol }}
              >
                =
              </th>

              {columns.map((label) => (
                <th
                  key={label}
                  scope="col"
                  aria-label={`Set ${label}`}
                  /* `font-body`, not `numeric`: tabular figures are for quantities, and a set
                     letter over the word "set" is a label. The mono stays on the digits below. */
                  className={`font-body border ${grid} ${cellPad} text-center font-bold`}
                  style={{ fontSize: size.head, ...numericCol }}
                >
                  {/* CF's column head is the problem letter over what it is worth. The letter is
                    ours too; the line under it says what the column IS, because a set has no
                    single point value and inventing one would put a lie in a very
                    authoritative-looking place. */}
                  <span
                    className={`block ${accent}`}
                    style={{ fontSize: size.cell }}
                  >
                    {label}
                  </span>
                  <span
                    className={`block font-normal ${muted}`}
                    style={{ fontSize: size.sub }}
                  >
                    set
                  </span>
                </th>
              ))}

              <th
                scope="col"
                className={`font-body border ${grid} ${cellPad} text-center font-normal ${muted}`}
                style={{ fontSize: size.head, ...numericCol }}
              >
                Group
              </th>
              <th
                scope="col"
                className={`font-body border ${grid} ${cellPad} text-center font-normal ${muted}`}
                style={{ fontSize: size.head, ...numericCol }}
              >
                Side
              </th>
            </tr>
          </thead>

          {teams.map((team, index) => {
            const isOpen = projector
              ? openTeamIds.has(team.teamId)
              : expanded.has(team.teamId);
            const toggleTeam = projector ? toggleWall : toggle;
            const mine =
              highlightTeamId !== null && team.teamId === highlightTeamId;
            const zebra = index % 2 === 1 ? "bg-ink/[0.03]" : "";
            const rowTint = mine ? "bg-panther/8" : zebra;
            const rosterId = `team-roster-${team.teamId}`;
            const groupInsidePool = groupPointsInsideMean && team.groupPoints > 0;

            const mineTag = mine ? (
              <span
                className={`ml-2 font-body font-normal ${accent}`}
                style={{ fontSize: size.sub }}
              >
                your team
              </span>
            ) : null;

            const activateTeam = (): void => {
              if (!projector && isOpen) {
                const prefix = `${team.teamId}:`;
                setExpandedPlayers((current) => {
                  const next = new Set(
                    [...current].filter((key) => !key.startsWith(prefix)),
                  );
                  return next.size === current.size ? current : next;
                });
              }
              toggleTeam?.(team.teamId);
            };

            return (
              <Fragment key={team.teamId}>
                <tbody>
                  <tr
                    className={`${rowTint} ${toggleTeam === undefined ? "" : styles.teamStandingRow}`}
                    onClick={toggleTeam === undefined ? undefined : activateTeam}
                  >
                    <td
                      className={`numeric border ${grid} ${cellPad} text-right align-top font-display font-bold ${accent}`}
                      style={{
                        fontSize: size.rank,
                        borderLeftWidth: "var(--rail-width)",
                        borderLeftStyle: "solid",
                        borderLeftColor: mine
                          ? "var(--color-panther)"
                          : "transparent",
                      }}
                    >
                      {team.rank}
                      {team.isTied && (
                        <span
                          className={dim}
                          aria-label="tied"
                          style={{ fontSize: size.sub }}
                        >
                          =
                        </span>
                      )}
                    </td>

                    <th
                      scope="row"
                      className={`border ${grid} ${cellPad} text-left align-top`}
                    >
                      <span className={styles.teamNameLine}>
                        {toggleTeam !== undefined && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              activateTeam();
                            }}
                            aria-expanded={isOpen}
                            aria-controls={rosterId}
                            aria-label={
                              isOpen
                                ? `Hide players for ${team.name}`
                                : `Show ${String(team.players.length)} player${team.players.length === 1 ? "" : "s"} for ${team.name}`
                            }
                            className={styles.teamDisclosure}
                          >
                            <svg
                              aria-hidden="true"
                              focusable="false"
                              width={10}
                              height={7}
                              viewBox="0 0 10 6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={isOpen ? "" : "-rotate-90"}
                            >
                              <path d="M1 1L5 5L9 1" />
                            </svg>
                          </button>
                        )}
                        <span
                          className="min-w-0 truncate font-display font-bold"
                          style={{ fontSize: size.name }}
                        >
                          {team.name}
                        </span>
                        {mineTag}
                      </span>
                      <span
                        className={`numeric block ${muted}`}
                        style={{
                          fontSize: size.sub,
                          whiteSpace: projector ? "nowrap" : "normal",
                        }}
                      >
                        {arithmeticFor(
                          team,
                          groupPointsInsideMean,
                          sideActivitiesFlat,
                        )}
                        {team.teamSize === 1 && (
                          <span className={`ml-2 ${accent}`}>
                            · one player only
                          </span>
                        )}
                      </span>
                    </th>

                    <td
                      className={`numeric border ${grid} ${cellPad} text-right align-top font-display font-bold ${projector ? accent : ""}`}
                      style={{ fontSize: size.total }}
                    >
                      {formatScore(team.score)}
                    </td>

                    {columns.map((label) => {
                      const cell = cellFor(team, label);
                      return (
                        <td
                          key={label}
                          className={`numeric border ${grid} ${cellPad} text-center align-top`}
                        >
                          {cell === null ? (
                            <span
                              className={dim}
                              aria-label="no player in this set"
                            >
                              &ndash;
                            </span>
                          ) : (
                            <>
                              <span
                                className={`block font-bold ${cell.points > 0 ? scored : unscored}`}
                                style={{ fontSize: size.cell }}
                              >
                                {cell.points}
                              </span>
                              {showTimes && (
                                <span
                                  className={`block ${dim}`}
                                  style={{ fontSize: size.sub }}
                                >
                                  <span aria-hidden="true">
                                    {cell.penaltyMinutes}m
                                  </span>
                                  <span className={styles.visuallyHidden}>
                                    {cell.penaltyMinutes} minutes penalty
                                  </span>
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}

                    <td
                      className={`numeric border ${grid} ${cellPad} text-center align-top`}
                    >
                      {team.groupPoints === 0 ? (
                        <span className={dim} aria-label="none">
                          &ndash;
                        </span>
                      ) : (
                        <span
                          className={`font-bold ${scored}`}
                          style={{ fontSize: size.cell }}
                        >
                          {team.groupPoints}
                        </span>
                      )}
                    </td>
                    <td
                      className={`numeric border ${grid} ${cellPad} text-center align-top`}
                    >
                      {team.sideActivityPoints === 0 ? (
                        <span
                          className={dim}
                          aria-label="none"
                          title="No side-activity points yet"
                        >
                          &ndash;
                        </span>
                      ) : (
                        <span
                          className={`font-bold ${scored}`}
                          style={{ fontSize: size.cell }}
                        >
                          {team.sideActivityPoints}
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>

                <tbody
                  id={rosterId}
                  aria-hidden={!isOpen}
                  className={`${styles.rosterRows} ${isOpen ? styles.rosterRowsOpen : ""}`}
                >
                  {projector ? (
                    <TeamRosterStrip
                      team={team}
                      columns={columns}
                      mine={mine}
                      groupPointsInsideMean={groupPointsInsideMean}
                      blockRows={memberBlockRows}
                    />
                  ) : (
                    <>
                      {team.players.map((player) => {
                        const playerKey = `${team.teamId}:${player.participantId}`;
                        const playerOpen = expandedPlayers.has(playerKey);
                        const mayOpen =
                          player.problems !== null && player.problems.length > 0;

                        return (
                          <Fragment key={player.participantId}>
                            <tr className={styles.memberRow}>
                              <td
                                className={styles.memberCell}
                                style={{
                                  borderLeftWidth: "var(--rail-width)",
                                  borderLeftStyle: "solid",
                                  borderLeftColor: mine
                                    ? "var(--color-panther)"
                                    : "transparent",
                                }}
                              />
                              <th
                                scope="row"
                                className={`${styles.memberCell} ${styles.memberNameCell}`}
                              >
                                {mayOpen ? (
                                  <button
                                    type="button"
                                    aria-expanded={playerOpen}
                                    aria-controls={`${playerKey}-problems`}
                                    aria-label={`${player.displayName}: problem by problem`}
                                    onClick={() => togglePlayer(playerKey)}
                                    className={styles.playerDisclosure}
                                  >
                                    <svg
                                      aria-hidden="true"
                                      focusable="false"
                                      width={9}
                                      height={6}
                                      viewBox="0 0 10 6"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={1.5}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className={playerOpen ? "" : "-rotate-90"}
                                    >
                                      <path d="M1 1L5 5L9 1" />
                                    </svg>
                                    <span>{player.displayName}</span>
                                  </button>
                                ) : (
                                  <span className={styles.memberName}>
                                    {player.displayName}
                                  </span>
                                )}
                                {player.chosenSetLabel === null && (
                                  <span className={styles.memberTag}>No set</span>
                                )}
                              </th>
                              <td
                                className={`numeric ${styles.memberCell} ${styles.memberTotal}`}
                              >
                                {player.score}
                              </td>
                              {columns.map((label) => (
                                <td
                                  key={label}
                                  className={`numeric ${styles.memberCell} ${styles.memberNumber}`}
                                >
                                  {player.chosenSetLabel === label
                                    ? player.score
                                    : ""}
                                </td>
                              ))}
                              <td className={styles.memberCell} />
                              <td className={styles.memberCell} />
                            </tr>

                            {mayOpen && playerOpen && (
                              <tr
                                id={`${playerKey}-problems`}
                                className={styles.playerProblemRow}
                              >
                                <td className={styles.memberCell} />
                                <td
                                  colSpan={4 + columns.length}
                                  className={styles.playerProblemCell}
                                >
                                  {player.lastScoreIncreaseAt !== null && (
                                    <p className={styles.playerLastScore}>
                                      Last scored at{" "}
                                      {timeOfDay(player.lastScoreIncreaseAt)}
                                    </p>
                                  )}
                                  <PlayerProblemList player={player} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}

                      <tr className={`${styles.memberRow} ${styles.poolRow}`}>
                        <td
                          className={styles.memberCell}
                          style={{
                            borderLeftWidth: "var(--rail-width)",
                            borderLeftStyle: "solid",
                            borderLeftColor: mine
                              ? "var(--color-panther)"
                              : "transparent",
                          }}
                        />
                        <th
                          scope="row"
                          className={`${styles.memberCell} ${styles.memberNameCell}`}
                        >
                          <span className={styles.poolLabel}>Player pool</span>
                        </th>
                        <td
                          className={`numeric ${styles.memberCell} ${styles.memberTotal}`}
                        >
                          {team.playerPoolPoints}
                        </td>
                        {columns.map((label) => (
                          <td key={label} className={styles.memberCell} />
                        ))}
                        <td
                          className={`numeric ${styles.memberCell} ${styles.memberNumber}`}
                        >
                          {groupInsidePool ? team.groupPoints : ""}
                        </td>
                        <td className={styles.memberCell} />
                      </tr>
                    </>
                  )}
                </tbody>
              </Fragment>
            );
          })}
        </table>
      </div>

      {/*
        A phone shows the rank, the team and the total; the set columns are past the right edge of
        a 360px screen and there is nothing on a touch device to say so — the table simply looks
        like it ends. Said out loud below the narrow layout, and hidden once the columns fit.
      */}
      {!projector && (
        <p
          className={`mt-1.5 sm:hidden ${dim}`}
          style={{ fontSize: "var(--text-xs)" }}
        >
          Scroll the table sideways for the set, group and side columns.
        </p>
      )}
      {/* The wall gets no legend: a footnote at `--text-xs` is unreadable from a desk, and the
          projector's footnote budget is already spent on the freeze line. */}
      {!projector && (
        <p className={`mt-1.5 ${dim}`} style={{ fontSize: "var(--text-xs)" }}>
          &ndash; means there is no player in that set or no points in that category yet.
        </p>
      )}
    </div>
  );
}
