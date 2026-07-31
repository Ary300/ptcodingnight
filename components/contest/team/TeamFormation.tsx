"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui";
import { API_ROUTES, TeamViewSchema, type TeamView } from "@/lib/schemas/api";

/**
 * Making and joining a team — the screen that replaces an organizer editing thirty rows by hand.
 *
 * ## Why the code is the whole interaction
 *
 * One person makes the team and reads six characters out; everyone else types them. There is no
 * invite list, no search, and no "request to join" for somebody to approve, because all three add
 * a step that has to happen while thirty people are talking at once.
 *
 * The code is rendered large, spaced, and in the numeric face for the same reason: it is going to
 * be read aloud across a room. `TEAM_CODE` excludes O/0 and I/1 so there is nothing to mishear.
 *
 * ## What this screen refuses to hide
 *
 * **Team size is the divisor in every team score.** So the member count is shown against the limit
 * rather than on its own, a team of one is called out, and the arithmetic is stated in words —
 * a student who can see how the number is reached does not have to trust it.
 */

interface MyTeamResponse {
  team: TeamView | null;
  formationOpen: boolean;
  maxTeamSize: number;
}

function errorFrom(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return "Something went wrong. Try again.";
}

export interface TeamFormationProps {
  contestId: string;
  /** Re-fetched by the parent after any change, so the board and this panel cannot disagree. */
  onChanged?: () => void;
}

export function TeamFormation({ contestId, onChanged }: TeamFormationProps) {
  const [state, setState] = useState<MyTeamResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * Bumped after every mutation to re-read. The fetch lives INSIDE the effect rather than in a
   * `useCallback` the effect calls, because the React Compiler rules reject a `setState` the
   * linter cannot prove is behind an await — the same reason `useResource` is written the way it
   * is, and `useTeamStandings` alongside it.
   */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(API_ROUTES.myTeam(contestId), { cache: "no-store" });
        const body: unknown = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setLoadError(errorFrom(body));
          return;
        }
        const data = (body as { data: MyTeamResponse }).data;
        setState({
          team: data.team === null ? null : TeamViewSchema.parse(data.team),
          formationOpen: data.formationOpen,
          maxTeamSize: data.maxTeamSize,
        });
        setLoadError(null);
      } catch {
        if (cancelled) return;
        setLoadError("Could not reach the server. Retrying will usually fix it.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contestId, attempt]);

  const post = useCallback(
    async (url: string, payload: unknown) => {
      setBusy(true);
      setActionError(null);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          setActionError(errorFrom(body));
          return false;
        }
        setAttempt((n) => n + 1);
        onChanged?.();
        return true;
      } catch {
        setActionError("Could not reach the server. Try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  if (loadError !== null) {
    return (
      <section aria-label="Your team" className="rounded border border-ink/15 p-4">
        <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
          {loadError}
        </p>
      </section>
    );
  }

  if (state === null) {
    return (
      <section aria-label="Your team" className="rounded border border-ink/15 p-4">
        <p className="text-ink/65" style={{ fontSize: "var(--text-sm)" }}>
          Loading your team…
        </p>
      </section>
    );
  }

  // --- on a team -----------------------------------------------------------
  if (state.team !== null) {
    const team = state.team;
    const full = team.members.length >= team.maxTeamSize;

    return (
      <section aria-label="Your team" className="rounded border border-ink/15 p-4">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          {team.name}
        </h2>

        <p className="mt-1 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
          {team.members.length} of {team.maxTeamSize} places used
          {team.members.length === 1 && (
            // Not decoration. Team size is the divisor, so a team of one scores its single
            // member's points undivided — usually a sign somebody has not joined yet.
            <span className="ml-2 text-panther">· you are on your own so far</span>
          )}
        </p>

        {state.formationOpen && (
          <div className="mt-4">
            <p className="text-ink/75" style={{ fontSize: "var(--text-xs)" }}>
              Read this out to your teammates:
            </p>
            <div className="mt-1 flex items-center gap-3">
              {/*
                Large, spaced, and in the numeric face because it is spoken across a room, not
                clicked. `tracking-[0.35em]` is what makes six characters read as six characters.
              */}
              <span
                className="numeric font-bold tracking-[0.35em]"
                style={{ fontSize: "var(--text-lg)" }}
              >
                {team.joinCode}
              </span>
              <Button
                type="button"
                variant="ghost"
                style={{ fontSize: "var(--text-xs)" }}
                onClick={() => {
                  void navigator.clipboard?.writeText(team.joinCode).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
              >
                Copy
              </Button>
              {/* Announced, because a purely visual confirmation is no confirmation. */}
              <span aria-live="polite" className="text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
                {copied ? "Copied" : ""}
              </span>
            </div>
            {full && (
              <p className="mt-2 text-panther" style={{ fontSize: "var(--text-xs)" }}>
                This team is full. Nobody else can join with the code.
              </p>
            )}
          </div>
        )}

        <h3 className="mt-4 font-semibold" style={{ fontSize: "var(--text-sm)" }}>
          Members
        </h3>
        <ul className="mt-1 space-y-1">
          {team.members.map((member) => (
            <li
              key={member.participantId}
              className="text-ink/80"
              style={{ fontSize: "var(--text-xs)" }}
            >
              {member.displayName}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
          Your team&rsquo;s score is everyone&rsquo;s points, group problems included, divided by
          the number of people on the team, plus side activity points. More people is not
          automatically better.
        </p>

        {state.formationOpen ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              style={{ fontSize: "var(--text-xs)" }}
              onClick={() => void post(API_ROUTES.leaveTeam(contestId), {})}
            >
              {busy ? "Working…" : "Leave this team"}
            </Button>
            <p className="mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
              You keep the problem set you were given.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
            Team sign-up has closed. Ask an organizer if you need to change teams.
          </p>
        )}

        {actionError !== null && (
          <p role="alert" className="mt-3 text-panther" style={{ fontSize: "var(--text-xs)" }}>
            {actionError}
          </p>
        )}
      </section>
    );
  }

  // --- not on a team -------------------------------------------------------
  if (!state.formationOpen) {
    return (
      <section aria-label="Your team" className="rounded border border-ink/15 p-4">
        <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
          You are not on a team
        </h2>
        <p role="alert" className="mt-2 text-panther" style={{ fontSize: "var(--text-sm)" }}>
          Team sign-up has closed, and your points are not counted toward any team score. Tell an
          organizer — they can still add you.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Your team" className="rounded border border-ink/15 p-4">
      <h2 className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
        You are not on a team yet
      </h2>
      <p className="mt-1 text-ink/75" style={{ fontSize: "var(--text-xs)" }}>
        Teams can have up to {state.maxTeamSize} people. Until you are on one your points count
        toward no team score.
      </p>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void post(API_ROUTES.joinTeam(contestId), { code });
        }}
      >
        <label
          htmlFor="team-code"
          className="block font-semibold"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Join a team
        </label>
        <p className="mt-1 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
          Type the code a teammate read out.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="team-code"
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            // Uppercase visually; the server normalises anyway, so a student typing lowercase or
            // adding a dash still lands on the right team.
            className="numeric w-40 rounded border border-ink/25 bg-paper px-3 py-2 uppercase tracking-widest"
            style={{ fontSize: "var(--text-sm)" }}
            placeholder="ABC123"
            autoComplete="off"
          />
          <Button type="submit" disabled={busy || code.trim() === ""}>
            {busy ? "Joining…" : "Join team"}
          </Button>
        </div>
      </form>

      <hr className="mt-5 border-ink/10" />

      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          void post(API_ROUTES.createTeam(contestId), { name });
        }}
      >
        <label
          htmlFor="team-name"
          className="block font-semibold"
          style={{ fontSize: "var(--text-sm)" }}
        >
          Or start a new team
        </label>
        <p className="mt-1 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
          You will get a code to read out. You are its first member.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="team-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-64 rounded border border-ink/25 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
            placeholder="Team name"
            maxLength={40}
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" disabled={busy || name.trim() === ""}>
            {busy ? "Creating…" : "Create team"}
          </Button>
        </div>
      </form>

      {actionError !== null && (
        <p role="alert" className="mt-3 text-panther" style={{ fontSize: "var(--text-xs)" }}>
          {actionError}
        </p>
      )}
    </section>
  );
}
