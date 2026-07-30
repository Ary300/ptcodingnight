"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui";

/**
 * Admin side-activity entry — PRD §9.2.
 *
 * The metal puzzle, train tracks, Connections. **The only score input with no submission behind
 * it**, which makes this screen the only place those points can come from and its audit trail the
 * only record that they happened at all.
 *
 * Two consequences visible in the UI:
 *
 * - Every entry is listed with who entered it and when, and entries are never edited or deleted.
 *   A correction is a NEW entry with negative points, so the original and the correction both stay
 *   on the record.
 * - Points are added **flat** to the team total, not divided by team size, so a typo is not diluted
 *   the way a problem score would be. The field is bounded and the screen says so.
 *
 * ## Contrast
 *
 * Muted text is `text-ink/60` and never lower (docs/DESIGN.md §7: `/55` measures 4.34:1 on
 * `--paper` and fails AA). No wrapper `opacity-*` is used to mute text, because it multiplies with
 * child alpha.
 */

interface TeamOption {
  teamId: string;
  name: string;
  teamSize: number;
  sideActivityPoints: number;
}

interface ActivityRow {
  id: string;
  label: string;
  points: number;
  enteredBy: string;
  enteredAt: string;
}

export interface SideActivityEntryProps {
  contestId: string;
}

/** Matches the API's bound. Stated here so the form can refuse before a round trip. */
const MAX_POINTS = 1000;

function unwrap(body: unknown): unknown {
  return typeof body === "object" && body !== null && "data" in body
    ? (body as { data: unknown }).data
    : body;
}

export function SideActivityEntry({ contestId }: SideActivityEntryProps) {
  const [teams, setTeams] = useState<readonly TeamOption[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [points, setPoints] = useState("");
  const [activities, setActivities] = useState<readonly ActivityRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const fetchTeams = useCallback(async (): Promise<readonly TeamOption[]> => {
    const response = await fetch(`/api/contests/${contestId}/team-standings`, {
      cache: "no-store",
    });
    const payload = unwrap(await response.json()) as { teams?: TeamOption[] } | null;
    return payload?.teams ?? [];
  }, [contestId]);

  const fetchActivities = useCallback(async (id: string): Promise<readonly ActivityRow[]> => {
    if (id === "") return [];
    const response = await fetch(`/api/admin/teams/${id}/side-activities`, { cache: "no-store" });
    const payload = unwrap(await response.json()) as { activities?: ActivityRow[] } | null;
    return payload?.activities ?? [];
  }, []);

  // The fetch lives inside the effect rather than in a callback the effect invokes. Both shapes
  // work; this one carries a `cancelled` flag, so a fast navigation cannot land a setState on an
  // unmounted component — and it is what the react-hooks lint rule is asking for.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await fetchTeams();
        if (!cancelled) setTeams(loaded);
      } catch {
        if (!cancelled) setError("Could not load the teams. Check the server is running.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchTeams]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await fetchActivities(teamId);
        if (!cancelled) setActivities(loaded);
      } catch {
        // A failed history load is not worth an alert: the award form still works, and the
        // history is context rather than the task.
        if (!cancelled) setActivities([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, fetchActivities]);

  const submit = useCallback(
    async () => {
      setError(null);
      setConfirmation(null);

      const parsed = Number(points);
      if (teamId === "") {
        setError("Choose a team.");
        return;
      }
      if (label.trim() === "") {
        setError("Name the activity — it appears on the team's breakdown.");
        return;
      }
      if (!Number.isInteger(parsed) || Math.abs(parsed) > MAX_POINTS) {
        setError(`Points must be a whole number between -${MAX_POINTS} and ${MAX_POINTS}.`);
        return;
      }

      setBusy(true);
      try {
        const response = await fetch(`/api/admin/teams/${teamId}/side-activities`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label: label.trim(), points: parsed }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message =
            typeof body === "object" && body !== null && "error" in body
              ? ((body as { error?: { message?: string } }).error?.message ?? "That was refused.")
              : "That was refused.";
          setError(message);
          return;
        }

        const team = teams.find((candidate) => candidate.teamId === teamId);
        setConfirmation(
          `Awarded ${parsed} ${Math.abs(parsed) === 1 ? "point" : "points"} to ${team?.name ?? "the team"} for ${label.trim()}.`,
        );
        setLabel("");
        setPoints("");
        const [refreshedTeams, refreshedActivities] = await Promise.all([
          fetchTeams(),
          fetchActivities(teamId),
        ]);
        setTeams(refreshedTeams);
        setActivities(refreshedActivities);
      } catch {
        setError("Could not reach the server. The award was not recorded.");
      } finally {
        setBusy(false);
      }
    },
    [teamId, label, points, teams, fetchTeams, fetchActivities],
  );

  const selected = teams.find((team) => team.teamId === teamId);

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="side-team" style={{ fontSize: "var(--text-sm)" }}>
            Team
          </label>
          <select
            id="side-team"
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className="rounded border border-ink/30 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          >
            <option value="">Choose a team…</option>
            {teams.map((team) => (
              <option key={team.teamId} value={team.teamId}>
                {team.name} ({team.teamSize} {team.teamSize === 1 ? "player" : "players"})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="side-label" style={{ fontSize: "var(--text-sm)" }}>
            Activity
          </label>
          <input
            id="side-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Metal puzzle"
            maxLength={120}
            className="rounded border border-ink/30 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="side-points" style={{ fontSize: "var(--text-sm)" }}>
            Points
          </label>
          <input
            id="side-points"
            type="number"
            inputMode="numeric"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            min={-MAX_POINTS}
            max={MAX_POINTS}
            step={1}
            aria-describedby="side-points-help"
            className="numeric rounded border border-ink/30 bg-paper px-3 py-2"
            style={{ fontSize: "var(--text-sm)" }}
          />
          <p id="side-points-help" className="text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Added <strong>flat</strong> to the team total — not divided by team size, so a typo is
            not softened the way a problem score would be. Negative values are allowed and are how
            you correct an over-award; nothing is ever edited or deleted.
          </p>
        </div>

        {error !== null && (
          <p role="alert" className="text-panther" style={{ fontSize: "var(--text-sm)" }}>
            {error}
          </p>
        )}

        {confirmation !== null && (
          <p role="status" style={{ fontSize: "var(--text-sm)" }}>
            {confirmation}
          </p>
        )}

        <div>
          <Button type="submit" disabled={busy}>
            {busy ? "Recording…" : "Award points"}
          </Button>
        </div>
      </form>

      {selected !== undefined && (
        <section aria-labelledby="side-history">
          <h2 id="side-history" className="font-display font-bold" style={{ fontSize: "var(--text-md)" }}>
            {selected.name} — side activities so far
          </h2>
          <p className="numeric mt-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
            Total {selected.sideActivityPoints} points.
          </p>

          {activities.length === 0 ? (
            <p className="mt-2 text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
              Nothing awarded yet.
            </p>
          ) : (
            <table className="mt-3 w-full text-left">
              <caption className="sr-only">
                Side activity points awarded to {selected.name}, with who entered each one
              </caption>
              <thead>
                <tr className="border-b border-ink/15">
                  <th scope="col" className="pb-1 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
                    Activity
                  </th>
                  <th scope="col" className="pb-1 text-right text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
                    Points
                  </th>
                  <th scope="col" className="pb-1 text-ink/65" style={{ fontSize: "var(--text-xs)" }}>
                    Entered by
                  </th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.id} className="border-b border-ink/10">
                    <td className="py-1" style={{ fontSize: "var(--text-sm)" }}>
                      {activity.label}
                    </td>
                    <td className="numeric py-1 text-right" style={{ fontSize: "var(--text-sm)" }}>
                      {activity.points}
                    </td>
                    <td className="py-1 text-ink/60" style={{ fontSize: "var(--text-xs)" }}>
                      {activity.enteredBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
