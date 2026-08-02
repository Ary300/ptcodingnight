"use client";

import { useEffect, useState } from "react";

import { TeamStandingsBoard, useTeamStandings } from "@/components/leaderboard";
import { Crumbs } from "@/components/ui";

import { useParticipant } from "../data/participant";
import { SignInRequired } from "../lobby/SignInRequired";

/**
 * "My team" — PRD §9.1.
 *
 * A team score is a mean, so it is not a number a student can verify in their head, and the
 * spreadsheet this replaced got that arithmetic wrong by 31.25 points. This screen exists so a
 * competitor can see every input to their own total: each member's points, the group problems, the
 * divisor, and the side activities. Someone who can check the arithmetic does not have to trust it.
 *
 * The whole board is shown rather than just one team, because a team's rank is only meaningful
 * against the others — and the board is already public on the projector, so nothing here is a new
 * disclosure.
 *
 * ## Contrast
 *
 * Muted text is `text-ink/60`, never lower: `/55` composites to 4.34:1 on `--paper` and fails AA at
 * this size. Wrapper `opacity-*` is not used to mute anything, because it multiplies with child
 * alpha — `opacity-60` over `text-ink/70` lands at 2.84:1. Both rules are docs/DESIGN.md §7.
 */

interface SessionInfo {
  signedIn: boolean;
  contestId: string | null;
  teamId: string | null;
  teamName: string | null;
  displayName: string | null;
}

function readSession(body: unknown): SessionInfo | null {
  const payload =
    typeof body === "object" && body !== null && "data" in body
      ? (body as { data: unknown }).data
      : body;

  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;

  return {
    signedIn: record.signedIn === true,
    contestId: typeof record.contestId === "string" ? record.contestId : null,
    teamId: typeof record.teamId === "string" ? record.teamId : null,
    teamName: typeof record.teamName === "string" ? record.teamName : null,
    displayName: typeof record.displayName === "string" ? record.displayName : null,
  };
}

export function MyTeamView() {
  const participant = useParticipant();
  const scopeKey = participant.status === "joined" ? participant.scopeKey : participant.status;
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        const parsed = readSession(await response.json());
        if (cancelled) return;
        if (parsed === null) {
          // Not "try joining again" — there is no join flow to try. Reloading is the action.
          setSessionError("Could not read your session. Reload the page to try again.");
          return;
        }
        setSessionError(null);
        setSession(parsed);
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setSessionError("Could not reach the server. Retrying will usually fix it.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [scopeKey]);

  const { standings, error } = useTeamStandings(session?.contestId ?? null);

  // The HEADING RENDERS IN EVERY STATE — loading, signed out, errored, loaded.
  //
  // The first version early-returned a bare sentence for the first three, so the page had no
  // heading at all while it was doing anything other than succeeding. That is the same mistake the
  // projector had: a titled page explaining why it is empty is a different thing from an untitled
  // one, both to a student and to a screen reader walking the heading outline.
  // "Join the contest first" is gone from here. It was the route layer's `ForbiddenError` text
  // copied into the client, and it named the join-code flow, which no longer exists — a student
  // reading it went looking for a code to type. Signed out is not an error state and is now the
  // one panel every competitor screen shows; see `SignInRequired`.
  const notice =
    sessionError !== null
      ? { tone: "alert" as const, text: sessionError }
      : session === null
        ? { tone: "status" as const, text: "Loading your team…" }
        : null;

  const signedOut = notice === null && session !== null && !session.signedIn;

  return (
    <div className="flex flex-col gap-group">
      <header>
        <Crumbs
          trail={[
            { href: "/contest", label: "Coding Night" },
            { href: "/team", label: "My team" },
            // The team's own name is the page you are on, so it is text rather than a link. Before
            // the roster is set there is no name, and the trail simply ends at "My team".
            ...(session?.teamName == null ? [] : [{ label: session.teamName }]),
          ]}
        />
        {/* Steps down to --text-lg below `sm` (the pattern ProblemWorkspace set): a flat 40px
            h1 wraps at 360 and spends 120px+ of the first screen before any content. */}
        <h1 className="mt-1 font-display font-bold text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)]">
          {session?.teamName ?? "My team"}
        </h1>

        {notice !== null ? (
          <p
            role={notice.tone}
            className={`mt-2 ${notice.tone === "alert" ? "text-panther" : "text-ink/60"}`}
            style={{ fontSize: "var(--text-sm)" }}
          >
            {notice.text}
          </p>
        ) : signedOut ? (
          <div className="mt-3">
            <SignInRequired what="your team and its score" />
          </div>
        ) : session?.teamId === null ? (
          // Not a warning for its own sake. Team size is the divisor in every team score, so a
          // student with no team is scoring for nobody — and the only way they find out is if the
          // screen says so.
          //
          // The second sentence is worth as much as the first and is load-bearing rather than
          // reassurance: standings are recomputed from the raw submission log every time
          // (`computeTeamStandings` reads the CURRENT roster and each member's whole history), so
          // points scored before the roster catches up are not lost. A student who believes they
          // are stops solving, which is a real cost for a wording problem.
          <div className="mt-2" style={{ fontSize: "var(--text-sm)" }}>
            <p role="alert" className="text-panther">
              You are not on a team yet, so your points are not part of any team score.
            </p>
            <p className="mt-1">
              This page updates automatically when an organizer adds you. Points you earn now will
              move with you to your team.
            </p>
          </div>
        ) : (
          <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
            Your team score is the player pool divided by team size, plus side-activity points.
            Expand a row to see each player&apos;s contribution.
          </p>
        )}
      </header>

      {/*
        There is no team-formation panel here, and its absence is the design.

        Students used to create a team and hand out a six-character code for their friends to
        type. That is gone: TEAM MEMBERSHIP IS DECIDED IN EXACTLY ONE PLACE, the organizer's
        roster at /admin/teams. Team size is the divisor in every team score, so who is on a team
        is a scoring input — and a scoring input that students can edit between submissions is not
        a roster, it is a lever.

        A student with no team is told so, above, and told who fixes it.
      */}

      {notice === null && !signedOut && error !== null && (
        <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {error}
        </p>
      )}

      {notice === null &&
        !signedOut &&
        (standings === null ? (
          <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
            Loading standings…
          </p>
        ) : (
          /*
            Three classes, and every one of them is load-bearing. /team was the only student
            screen that scrolled the document sideways at 360px — measured 569 against a 360
            client width, with the dark header bar and the paper ground both stopping at 360 and
            the rest of the page dragged out over white. It was TWO separate escapes stacked, and
            fixing only the first takes it to 492, which still fails.

            `min-w-0` — the board draws its own scroller (`w-full overflow-x-auto` in
            `TeamStandingsBoard`) and it was being defeated from outside. A flex item defaults to
            `min-width: auto`, which is its CONTENT's intrinsic width, so the ~710px table
            stretched this wrapper instead of being clipped by it.

            `relative overflow-x-clip` — the rest of it, and much less obvious. The board's
            visually-hidden cell labels ("Rank", "5 minutes penalty") are `position: absolute`
            with `clip-path: inset(50%)`, and an absolutely positioned element is NOT clipped by
            an ancestor scrollport when its containing block is an ANCESTOR of that scrollport
            (CSS 2.1 §11.1.1). The board's scroller is `position: static`, so those spans resolve
            against something above it, sit at the table's unclipped x — measured right edges of
            452 and 578 — and drag the document out to 579 while `body.scrollWidth` stays a
            perfectly innocent 360. Making this wrapper both the containing block and the clipper
            is what brings them back inside; `clip` rather than `hidden` so no scroll container is
            created and the board's own sticky header is untouched.

            **The one-word fix is upstream and is not in this file**: `position: relative` on the
            scroller in `TeamStandingsBoard` clips them at source, measured 579 -> 360. That file
            belongs to another pass. Until it lands, the projector and /admin/awards render the
            same escaping spans, so this is a fix for /team and not for the board.

            Any of this matters because the board's own hint — "scroll the table sideways for the
            set, group and side columns" — described something that did not happen: the page moved
            instead, and a student who followed the instruction dragged the layout off screen.
          */
          <div className="relative min-w-0 overflow-x-clip">
            <TeamStandingsBoard
              teams={standings.teams}
              setLabels={standings.setLabels}
              groupPointsInsideMean={standings.groupPointsInsideMean}
              sideActivitiesFlat={standings.sideActivitiesFlat}
              highlightTeamId={session?.teamId ?? null}
            />
          </div>
        ))}
    </div>
  );
}
