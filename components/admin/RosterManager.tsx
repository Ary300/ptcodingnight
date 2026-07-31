"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui";
import { Panel } from "@/components/admin/Panel";
import { API_ROUTES } from "@/lib/schemas/api";

/**
 * The organizer's roster: every team, every member, and everybody on no team at all.
 *
 * ## Why "unassigned" is the first thing on the screen
 *
 * A participant with no team contributes to **no** team score. On the night the question an
 * organizer actually has is "who is not being counted yet", and that is a list — not something to
 * work out by comparing this screen with the leaderboard.
 *
 * ## Why every action asks for a reason
 *
 * **Team size is the divisor.** Moving one person changes TWO team scores: the team they left
 * gets a smaller divisor and the team they joined a larger one, and neither team submitted
 * anything. "Why did our score change" gets asked at 9pm, and the only acceptable answer is the
 * audit row rather than somebody's recollection. The API requires the reason; this form collects
 * it rather than letting the request fail.
 */

interface RosterTeam {
  teamId: string;
  name: string;
  joinCode: string;
  maxTeamSize: number;
  memberCount: number;
  members: { participantId: string; displayName: string }[];
}

interface Roster {
  maxTeamSize: number;
  formationOpen: boolean;
  teams: RosterTeam[];
  unassigned: { participantId: string; displayName: string }[];
}

function errorFrom(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return "Something went wrong.";
}

export interface RosterManagerProps {
  contestId: string;
}

/**
 * "The organizer has not chosen a destination yet."
 *
 * Distinct from `""`, which the submit handler maps to `teamId: null` — a real destination that
 * means REMOVE THEM FROM THEIR TEAM. Those were the same value, so the move dialog opened already
 * showing "— no team —" and doing nothing was a removal.
 */
const UNCHOSEN = "__unchosen__";

export function RosterManager({ contestId }: RosterManagerProps) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newTeamName, setNewTeamName] = useState("");
  const [moving, setMoving] = useState<{ participantId: string; displayName: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(API_ROUTES.adminRoster(contestId), { cache: "no-store" });
        const body: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(errorFrom(body));
          return;
        }
        setRoster((body as { data: Roster }).data);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contestId, attempt]);

  const send = async (url: string, method: string, payload: unknown): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(errorFrom(body));
        return;
      }
      setAttempt((n) => n + 1);
      setMoving(null);
      setReason("");
      setMoveTarget("");
      setNewTeamName("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  if (roster === null) {
    return (
      <Panel title="Teams">
        <p className="text-ink/65" style={{ fontSize: "var(--text-sm)" }}>
          {error ?? "Loading the roster…"}
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Not on a team"
        aside={
          <span className="numeric text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            {roster.unassigned.length}
          </span>
        }
        description={
          <>
            These participants contribute to <strong>no</strong> team score, and their points are
            in nobody&rsquo;s pool. This list is the first thing to empty on the night.
          </>
        }
      >
        {roster.unassigned.length === 0 ? (
          <p className="text-ink/65" style={{ fontSize: "var(--text-sm)" }}>
            Everyone is on a team.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {roster.unassigned.map((person) => (
              <li key={person.participantId}>
                <Button
                  type="button"
                  variant="secondary"
                  style={{ fontSize: "var(--text-xs)" }}
                  disabled={busy}
                  onClick={() => {
                    setMoving(person);
                    // Unassigned already: the sentinel below forces a deliberate choice rather
                    // than letting the form submit the state they are already in.
                    setMoveTarget(UNCHOSEN);
                  }}
                >
                  {person.displayName} → assign
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {moving !== null && (
        <Panel title={`Move ${moving.displayName}`}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              // Refused rather than guessed. `UNCHOSEN` means the organizer never touched the
              // dropdown, and the one thing this form must not do is pick for them.
              if (moveTarget === UNCHOSEN) return;
              void send(API_ROUTES.adminMoveParticipant(contestId), "POST", {
                participantId: moving.participantId,
                teamId: moveTarget === "" ? null : moveTarget,
                reason,
              });
            }}
          >
            <label style={{ fontSize: "var(--text-sm)" }}>
              Team
              <select
                value={moveTarget}
                onChange={(event) => setMoveTarget(event.target.value)}
                className="mt-1 block w-full rounded border border-ink/25 bg-paper px-3 py-2"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {/*
                  A sentinel that is not a valid destination, so "I did not choose" and "remove
                  them from their team" are different answers. They used to be the same value.
                */}
                <option value={UNCHOSEN} disabled>
                  Choose a team…
                </option>
                <option value="">— remove from their team —</option>
                {roster.teams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.name} ({team.memberCount} members)
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: "var(--text-sm)" }}>
              Reason
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 block w-full rounded border border-ink/25 bg-paper px-3 py-2"
                style={{ fontSize: "var(--text-sm)" }}
                placeholder="Why this is being changed"
              />
              <span className="mt-1 block text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
                This moves two divisors at once, so it changes two team scores. The reason goes in
                the audit log.
              </span>
            </label>

            <div className="flex gap-2">
              <Button type="submit" disabled={busy || reason.trim().length < 3}>
                {busy ? "Moving…" : "Move"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setMoving(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Panel
        title="Teams"
        aside={
          <span className="numeric text-ink/70" style={{ fontSize: "var(--text-sm)" }}>
            {roster.teams.length} · max {roster.maxTeamSize}
          </span>
        }
      >
        <form
          className="mb-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send(API_ROUTES.adminTeams(contestId), "POST", { name: newTeamName });
          }}
        >
          <input
            value={newTeamName}
            onChange={(event) => setNewTeamName(event.target.value)}
            className="w-64 rounded border border-ink/25 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
            placeholder="New team name"
            aria-label="New team name"
          />
          <Button type="submit" variant="secondary" disabled={busy || newTeamName.trim() === ""}>
            Create team
          </Button>
        </form>

        {roster.teams.length === 0 ? (
          <p className="text-ink/65" style={{ fontSize: "var(--text-sm)" }}>
            No teams yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {roster.teams.map((team) => (
              <li key={team.teamId} className="rounded border border-ink/12 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
                    {team.name}
                  </span>
                  {/*
                    The team's join code used to sit here. Nothing can be done with it — students
                    sign in with a provider and an organizer builds the roster — so it was a string
                    that looked actionable and was not, on the screen where a wrong action changes
                    two team scores. The size is what matters here: it IS the divisor.
                  */}
                  <span className="numeric text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
                    {team.memberCount}/{team.maxTeamSize} · divisor {team.memberCount}
                  </span>
                </div>

                <ul className="mt-2 flex flex-wrap gap-2">
                  {team.members.map((member) => (
                    <li key={member.participantId}>
                      <Button
                        type="button"
                        variant="ghost"
                        style={{ fontSize: "var(--text-xs)" }}
                        disabled={busy}
                        onClick={() => {
                          /*
                            DEFAULT TO THE TEAM THEY ARE ALREADY ON.

                            This used to set "", which the submit handler maps to `teamId: null` —
                            so the dialog opened showing "— no team —" and an organizer who typed
                            a reason and pressed Move without touching the dropdown REMOVED the
                            player from their team. Team size is the divisor in every team score,
                            so the accidental path was a silent score change for two teams.

                            A destructive action must never be the one that happens when you do
                            nothing.
                          */
                          setMoving(member);
                          setMoveTarget(team.teamId);
                        }}
                      >
                        {member.displayName} → move
                      </Button>
                    </li>
                  ))}
                  {team.members.length === 0 && (
                    <li className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                      No members — this team scores nothing.
                    </li>
                  )}
                </ul>

                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    style={{ fontSize: "var(--text-xs)" }}
                    disabled={busy}
                    onClick={() => {
                      const why = window.prompt(
                        `Dissolve "${team.name}"? Its ${String(team.memberCount)} member(s) become teamless. Reason:`,
                      );
                      if (why === null || why.trim().length < 3) return;
                      void send(API_ROUTES.adminTeam(team.teamId), "DELETE", { reason: why });
                    }}
                  >
                    Dissolve
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    style={{ fontSize: "var(--text-xs)" }}
                    disabled={busy}
                    onClick={() => {
                      const next = window.prompt(`Rename "${team.name}" to:`, team.name);
                      if (next === null || next.trim() === "") return;
                      const why = window.prompt("Reason for the rename:");
                      if (why === null || why.trim().length < 3) return;
                      void send(API_ROUTES.adminTeam(team.teamId), "PATCH", {
                        name: next,
                        reason: why,
                      });
                    }}
                  >
                    Rename
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error !== null && (
          <p role="alert" className="mt-3 text-panther" style={{ fontSize: "var(--text-sm)" }}>
            {error}
          </p>
        )}
      </Panel>
    </div>
  );
}
