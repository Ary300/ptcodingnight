import { rankTeamsWithinDivision } from "@/lib/scoring/team";
import type { TeamStanding } from "@/lib/types/scoring";
import type { TeamStandingRow } from "@/lib/schemas/api";

/**
 * The TEAM board's division tabs: which tabs exist, which teams each one shows, what rank each
 * team wears there, and which set columns head the grid.
 *
 * ## Why there is no merged "Teams" view any more
 *
 * A previous pass kept an all-teams tab next to the division tabs. The organizer's correction
 * removed it: each division fields its own teams and answers its own question sets, so a merged
 * board ranks teams that never faced the same questions against each other. A contest WITH
 * divisions therefore shows only division tabs, defaulting to the first; a contest with NO
 * divisions shows no strip at all and the board is exactly the original single table.
 *
 * ## Ranking is not decided here
 *
 * A component that filtered the list and then numbered the survivors itself would be a second
 * scoring site, which the architecture forbids - scoring lives in `lib/scoring/` and nowhere
 * else. So the filter and the re-rank both come from `rankTeamsWithinDivision`, and this module's
 * only real work is translating between the wire row (`TeamStandingRow`) and the engine's type
 * (`TeamStanding`).
 */

/** One division as the payload's `divisions` array carries it. */
export interface DivisionOption {
  readonly divisionId: string;
  readonly name: string;
}

/** One set as the payload's `sets` array carries it: the structured twin of `setLabels`. */
export interface SetFact {
  readonly label: string;
  readonly qualifiedLabel: string;
  readonly divisionId: string | null;
}

/**
 * One column of the standings grid: what the header prints, and the `chosenSetLabel` a player
 * must carry to land in it. On a division tab those differ - the header is the bare "A" while
 * the rows speak the qualified "Intermediate A" - and conflating them is exactly the bug that
 * produced a sprawl of "Advanced A | Intermediate A | Intermediate B" headers on every tab.
 */
export interface SetColumn {
  readonly header: string;
  readonly match: string;
}

/** One entry in the strip. */
export interface TeamTab {
  readonly id: string;
  readonly label: string;
}

/**
 * The Unassigned tab's id. Division ids are database ids and can never spell this; the engine
 * side of it is `null`, which `rankTeamsWithinDivision` already filters by.
 */
export const UNASSIGNED_TAB = "__unassigned__";

/**
 * The strip for this payload. Empty for a contest with no divisions - that contest gets no strip
 * and the untouched original board. The Unassigned tab exists only while a team actually has no
 * division: open teams belong to no division's field, so parking them under the first division
 * would rank them against questions they never had.
 */
export function teamTabsFor(
  divisions: readonly DivisionOption[],
  teams: readonly TeamStandingRow[],
): readonly TeamTab[] {
  if (divisions.length === 0) return [];

  const tabs = divisions.map((division) => ({
    id: division.divisionId,
    label: division.name,
  }));

  return teams.some((team) => team.divisionId === null)
    ? [...tabs, { id: UNASSIGNED_TAB, label: "Unassigned" }]
    : tabs;
}

/**
 * The tab a strip should actually open on. `null` means "no tabs": the single-table contest.
 *
 * A request that names no tab in this strip - a stale `/projector?division=<deleted id>`
 * bookmark, or a division removed mid-night - degrades to the FIRST tab rather than to an empty
 * wall. The request itself is held verbatim by the caller, so a division that reappears on a
 * later poll is honoured again.
 */
export function resolveTabId(
  tabs: readonly TeamTab[],
  requested: string | null,
): string | null {
  const first = tabs[0];
  if (first === undefined) return null;
  if (requested !== null && tabs.some((tab) => tab.id === requested)) {
    return requested;
  }
  return first.id;
}

/**
 * The engine ranks `TeamStanding`, which carries two facts the wire row deliberately does not
 * (`lastScoreIncreaseAt` as a `Date`, and the engine-shaped player list). Neither participates
 * in `rankTeamsWithinDivision` - it filters by `divisionId` and re-ranks by `scoreHundredths`
 * over an already-ranked list - so the adapter supplies inert values for both and the result's
 * rank and tie flags are mapped back onto the original rows untouched.
 */
function toEngineStanding(row: TeamStandingRow): TeamStanding {
  return {
    teamId: row.teamId,
    name: row.name,
    divisionId: row.divisionId,
    teamSize: row.teamSize,
    scoreHundredths: row.scoreHundredths,
    score: row.score,
    playerPoolPoints: row.playerPoolPoints,
    groupPoints: row.groupPoints,
    sideActivityPoints: row.sideActivityPoints,
    penaltyMinutes: row.penaltyMinutes,
    lastScoreIncreaseAt: null,
    rank: row.rank,
    isTied: row.isTied,
    players: [],
  };
}

/**
 * The rows one tab shows: that tab's teams only, re-ranked from 1 with the engine's tie rules.
 * `null` (no tabs) returns the full board exactly as the payload ranked it.
 */
export function teamsForTab(
  teams: readonly TeamStandingRow[],
  tabId: string | null,
): readonly TeamStandingRow[] {
  if (tabId === null) return teams;

  const divisionId = tabId === UNASSIGNED_TAB ? null : tabId;
  const rowById = new Map(teams.map((team) => [team.teamId, team]));
  const reRanked = rankTeamsWithinDivision(teams.map(toEngineStanding), divisionId);

  return reRanked.flatMap((standing) => {
    const row = rowById.get(standing.teamId);
    return row === undefined
      ? []
      : [{ ...row, rank: standing.rank, isTied: standing.isTied }];
  });
}

/**
 * The set columns one tab's grid is headed by.
 *
 * On a division tab: only that division's sets, printed as the bare label ("A") and matched by
 * the qualified label the player rows speak (`qualifiedLabel === chosenSetLabel`; both derive
 * from one map on the server, so they cannot disagree). Division-null sets - there should be
 * none in a divisioned contest - fold into the Unassigned tab rather than vanishing.
 *
 * With no tab (`null`), or on a payload that predates the structured `sets` array, the flat
 * `setLabels` are the columns exactly as the original board drew them.
 */
export function columnsForTab(
  tabId: string | null,
  sets: readonly SetFact[],
  setLabels: readonly string[],
): readonly SetColumn[] {
  if (tabId === null || sets.length === 0) {
    return setLabels.map((label) => ({ header: label, match: label }));
  }

  const divisionId = tabId === UNASSIGNED_TAB ? null : tabId;
  return sets
    .filter((set) => set.divisionId === divisionId)
    .map((set) => ({ header: set.label, match: set.qualifiedLabel }));
}
