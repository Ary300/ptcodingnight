"use client";

import Link from "next/link";

import { TeamStandingsBoard, useTeamStandings } from "@/components/leaderboard";
import { Crumbs } from "@/components/ui";
import { formatEventTime } from "@/lib/contest/event-time";

import { useParticipant } from "../data/participant";
import { BoardFrozenNotice } from "../lobby/BoardFrozenNotice";
import { SignInRequired } from "../lobby/SignInRequired";
import { standingsState, teamOfParticipant } from "./standings-state";

/**
 * `/standings`, the team board on a student's own laptop.
 *
 * On the night the students sit in different rooms, and only one of them has the projector. This
 * is the same board the wall shows, read from the same PUBLIC route the wall reads
 * (`?view=public`, no cookie sent), so it is frozen at the freeze time exactly as the wall is and
 * shows the final standings only after an organizer presses "Unfreeze and reveal". Sending no
 * cookie also keeps the request cheap: the server answers every student from one memoised public
 * board without a session lookup, and an unchanged board comes back as a 304 with no body.
 *
 * It polls on the projector's interval (`POLL_INTERVAL_MS`), one request at a time.
 *
 * The board's own controls do the rest: one tab per division, a caret per team, and Expand all
 * and Collapse all. The viewer's own team is highlighted, and the board opens on its division.
 *
 * "My team" stays as it is. It reads the signed-in board, which carries the viewer's own team's
 * per-problem breakdown; this page shows what the whole room may see and nothing more.
 */
export function StudentStandingsView() {
  const participant = useParticipant();

  return (
    <div className="flex flex-col gap-group">
      <header>
        <Crumbs trail={[{ href: "/", label: "Coding Night" }, { label: "Standings" }]} />
        {/* Steps down to --text-lg below `sm`, as every competitor page heading does. */}
        <h1 className="mt-1 font-display font-bold text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)]">
          Standings
        </h1>
      </header>

      {participant.status === "loading" ? (
        <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
          Loading standings…
        </p>
      ) : participant.status === "anonymous" ? (
        <SignInRequired what="the standings" />
      ) : participant.status === "error" ? (
        <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
          {participant.message}
        </p>
      ) : (
        <ContestBoard
          contestId={participant.participant.contestId}
          participantId={participant.participant.participantId}
        />
      )}
    </div>
  );
}

/**
 * Mounted only once the session has named the contest, so the poll never starts against
 * "whichever contest is running" and then switches.
 */
function ContestBoard({
  contestId,
  participantId,
}: {
  contestId: string;
  participantId: string;
}) {
  const { standings, source, error } = useTeamStandings(contestId, { publicView: true });

  if (standings === null) {
    return source === "error" ? (
      <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
        {error ?? "The standings could not be loaded."} This page keeps trying.
      </p>
    ) : (
      <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
        Loading standings…
      </p>
    );
  }

  if (standings.isPractice) {
    // The arena has no teams. Guests have their own progress card on the problem list.
    return (
      <p className="text-ink/75" style={{ fontSize: "var(--text-sm)" }}>
        The practice arena has no team standings. Your progress is on the{" "}
        <Link href="/contest" className="text-panther underline underline-offset-2">
          problem list
        </Link>
        .
      </p>
    );
  }

  const state = standingsState(standings);
  const asOf = formatEventTime(standings.asOf);

  return (
    <>
      <div className="flex flex-col gap-tight">
        {state === "frozen" && <BoardFrozenNotice />}
        <p
          data-testid="standings-state"
          className="text-ink/60"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {state === "frozen"
            ? `Frozen standings, as of ${asOf}.`
            : state === "final"
              ? "Final standings."
              : `Live standings, updated ${asOf}. This page refreshes every few seconds.`}
        </p>
        {/* A dropped poll keeps the last board on screen and says so quietly. */}
        {error !== null && (
          <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            {error}
          </p>
        )}
      </div>

      {/*
        `relative min-w-0 overflow-x-clip`, as on /team: the board draws its own sideways scroller,
        and without these the table and its visually hidden cell labels widen the page at 360px.
      */}
      <div className="relative min-w-0 overflow-x-clip">
        <TeamStandingsBoard
          teams={standings.teams}
          divisions={standings.divisions}
          setLabels={standings.setLabels}
          sets={standings.sets}
          groupPointsInsideMean={standings.groupPointsInsideMean}
          sideActivitiesFlat={standings.sideActivitiesFlat}
          highlightTeamId={teamOfParticipant(standings.teams, participantId)}
        />
      </div>
    </>
  );
}
