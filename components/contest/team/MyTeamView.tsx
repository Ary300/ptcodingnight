"use client";

import { useEffect, useState } from "react";

import { TeamStandingsBoard, useTeamStandings } from "@/components/leaderboard";

import { TeamFormation } from "./TeamFormation";

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
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const parsed = readSession(await response.json());
        if (cancelled) return;
        if (parsed === null) {
          setSessionError("Could not read your session. Try joining again.");
          return;
        }
        setSession(parsed);
      } catch {
        if (cancelled) return;
        setSessionError("Could not reach the server. Retrying will usually fix it.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const { standings, error } = useTeamStandings(session?.contestId ?? null);

  // The HEADING RENDERS IN EVERY STATE — loading, signed out, errored, loaded.
  //
  // The first version early-returned a bare sentence for the first three, so the page had no
  // heading at all while it was doing anything other than succeeding. That is the same mistake the
  // projector had: a titled page explaining why it is empty is a different thing from an untitled
  // one, both to a student and to a screen reader walking the heading outline.
  const notice =
    sessionError !== null
      ? { tone: "alert" as const, text: sessionError }
      : session === null
        ? { tone: "status" as const, text: "Loading your team…" }
        : !session.signedIn
          ? {
              tone: "status" as const,
              text: "Join the contest first, then your team will appear here.",
            }
          : null;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display font-bold" style={{ fontSize: "var(--text-lg)" }}>
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
        ) : session?.teamId === null ? (
          // Not a warning for its own sake. Team size is the divisor in every team score, so a
          // student with no team is scoring for nobody — and the only way they find out is if the
          // screen says so.
          <p role="alert" className="mt-2 text-panther" style={{ fontSize: "var(--text-sm)" }}>
            You are not on a team yet, so your points are not counted toward any team score. Tell an
            organizer — they can add you.
          </p>
        ) : (
          <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
            Your team&apos;s score is every member&apos;s points, group problems included, divided by
            the number of people on the team, plus side activity points. Expand a row to see the
            whole calculation.
          </p>
        )}
      </header>

      {/*
        Formation sits ABOVE the board, because a student with no team came here to fix that and
        the board is context rather than the task. It is only rendered once the session is known:
        the panel is contest-scoped, and rendering it against a null contest would fire a request
        that can only fail.

        No refresh callback: `useTeamStandings` polls, so the board below picks the change up on
        its own. Wiring one would be a second refresh path to keep in step with the first.
      */}
      {notice === null && session?.contestId != null && (
        <TeamFormation contestId={session.contestId} />
      )}

      {notice === null && error !== null && (
        <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
          {error}
        </p>
      )}

      {notice === null &&
        (standings === null ? (
          <p role="status" className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
            Loading standings…
          </p>
        ) : (
          <TeamStandingsBoard teams={standings.teams} highlightTeamId={session?.teamId ?? null} />
        ))}
    </div>
  );
}
