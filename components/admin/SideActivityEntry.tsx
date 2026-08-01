"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Stacked, TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import { Select, TextInput } from "@/components/admin/Field";
import { Panel } from "@/components/admin/Panel";

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
 * ## The history was not a record of anything
 *
 * It claimed to show "who entered each one" in its own `<caption>` and printed `enteredBy`
 * verbatim — which the route sets to `actorLabel()`, i.e. the literal string
 * `admin:cms9k…`. A session id nothing on this screen, in the database, or in the audit log can
 * resolve to a person. And it showed **no time at all**, though `enteredAt` was in the response
 * and had been since the route was written.
 *
 * So the one column that was rendered was the one that could not be read, and the two that could
 * were not. It now leads with the time — which is what an organizer actually asks ("was the
 * puzzle entered before or after the freeze?") — and renders the actor as what it honestly is:
 * an organizer session, with its short reference shown so two different organizers' entries can
 * be told apart, and the full label available to a screen reader and on hover for matching
 * against `AuditLog`. Turning that reference into a NAME needs the route to resolve it and is
 * called out in the report rather than faked here.
 *
 * ## Contrast
 *
 * Muted text is `text-ink/60` and never lower (docs/DESIGN.md §7: `/55` measures 4.34:1 on
 * `--paper` and fails AA). No wrapper `opacity-*` is used to mute text, because it multiplies with
 * child alpha and `tests/a11y/team-screens.spec.ts` fails this surface for it by name.
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

/**
 * Fixed timezone, like the submission feed: two laptops in the same room must not disagree about
 * when something was entered. The heading says UTC out loud rather than letting 23:41 be read as
 * half past eleven at night in Indianapolis.
 */
function enteredAtParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const stamp = d.toISOString();
  return { date: stamp.slice(0, 10), time: stamp.slice(11, 16) };
}

/**
 * `actorLabel()` writes `admin:<sessionId>` or `participant:<id>`. Neither is a name, and this
 * screen cannot make one — so it says what it knows and shows enough of the id to distinguish two
 * organizers, rather than printing a cuid as though it were a person.
 */
function actor(enteredBy: string): { role: string; ref: string } {
  const separator = enteredBy.indexOf(":");
  // No separator means it is not an `actorLabel` at all — "anonymous", or whatever a future
  // caller writes. Print it as-is rather than slicing a string whose shape we guessed wrong.
  if (separator === -1) return { role: enteredBy, ref: "" };
  const kind = enteredBy.slice(0, separator);
  const id = enteredBy.slice(separator + 1);
  const role = kind === "admin" ? "Organizer" : kind === "participant" ? "Competitor" : kind;
  return { role, ref: id.slice(-6) };
}

export function SideActivityEntry({ contestId }: SideActivityEntryProps) {
  const [teams, setTeams] = useState<readonly TeamOption[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [points, setPoints] = useState("");
  const [activities, setActivities] = useState<readonly ActivityRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  /*
    Field-level errors, not one shared string.

    A single `error` meant "name the activity" and "could not reach the server" rendered in the
    same place, so the answer to a blank field appeared nowhere near the field. `Field` wires each
    message to its own control with `aria-describedby`, which is both where the fix is and the
    only way the message is announced at all.
  */
  const [teamError, setTeamError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [pointsError, setPointsError] = useState<string | null>(null);

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
        if (!cancelled) setFormError("Could not load the teams. Check the server is running.");
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

  const submit = useCallback(async () => {
    setFormError(null);
    setConfirmation(null);
    setTeamError(null);
    setLabelError(null);
    setPointsError(null);

    const parsed = Number(points);
    let refused = false;
    if (teamId === "") {
      setTeamError("Choose a team.");
      refused = true;
    }
    if (label.trim() === "") {
      setLabelError("Name the activity. It appears on the team's breakdown.");
      refused = true;
    }
    if (points.trim() === "" || !Number.isInteger(parsed) || Math.abs(parsed) > MAX_POINTS) {
      setPointsError(
        `Points must be a whole number between -${String(MAX_POINTS)} and ${String(MAX_POINTS)}.`,
      );
      refused = true;
    }
    // Every bad field is reported at once. Reporting the first and stopping makes an organizer
    // discover a three-field form one refusal at a time.
    if (refused) return;

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
        setFormError(message);
        return;
      }

      const team = teams.find((candidate) => candidate.teamId === teamId);
      setConfirmation(
        `Awarded ${String(parsed)} ${Math.abs(parsed) === 1 ? "point" : "points"} to ${team?.name ?? "the team"} for ${label.trim()}.`,
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
      setFormError("Could not reach the server. The award was not recorded.");
    } finally {
      setBusy(false);
    }
  }, [teamId, label, points, teams, fetchTeams, fetchActivities]);

  const selected = teams.find((team) => team.teamId === teamId);

  return (
    <div className="flex flex-col gap-section">
      {/*
        Bounded width. A text input is not more usable at 1200px — the eye has to travel the whole
        width to find the caret, and a three-field form spread across a 1440 canvas reads as a
        page rather than as a thing you fill in. The table below is the part that wants the room.
      */}
      <Panel
        title="Award points"
        level="framed"
        className="max-w-2xl"
        description="Added flat to the team total. There is no submission behind these, so this entry is the only record that they happened."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-group"
        >
          <Select
            label="Team"
            required
            error={teamError}
            value={teamId}
            onChange={(event) => {
              setTeamId(event.target.value);
              setTeamError(null);
            }}
          >
            <option value="">Choose a team…</option>
            {teams.map((team) => (
              <option key={team.teamId} value={team.teamId}>
                {team.name} ({team.teamSize} {team.teamSize === 1 ? "player" : "players"})
              </option>
            ))}
          </Select>

          <TextInput
            label="Activity"
            required
            error={labelError}
            value={label}
            maxLength={120}
            placeholder="Metal puzzle"
            onChange={(event) => {
              setLabel(event.target.value);
              setLabelError(null);
            }}
          />

          <TextInput
            label="Points"
            required
            numeric
            error={pointsError}
            type="number"
            inputMode="numeric"
            value={points}
            min={-MAX_POINTS}
            max={MAX_POINTS}
            step={1}
            hint={
              <>
                Added <strong>flat</strong> to the team total, not divided by team size, so a typo
                is not softened the way a problem score would be. Negative values are allowed and
                are how you correct an over-award; nothing is ever edited or deleted.
              </>
            }
            onChange={(event) => {
              setPoints(event.target.value);
              setPointsError(null);
            }}
          />

          {/*
            A refusal from the SERVER, or the network. Field-level problems are answered at their
            field above; this slot is for the ones that belong to the form as a whole.
          */}
          {formError !== null && (
            <p role="alert" className="font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
              {formError}
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
      </Panel>

      {selected !== undefined && (
        <Panel
          title={`${selected.name}: awarded so far`}
          level="bare"
          aside={
            <span className="numeric text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
              {selected.sideActivityPoints} points
            </span>
          }
        >
          {activities.length === 0 ? (
            <p className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
              Nothing awarded yet.
            </p>
          ) : (
            <div className="relative w-full min-w-0 overflow-x-auto">
              {/*
                A modest width floor, like the submission feed's. Four columns squeezed into 360px
                broke "Rubik's cube relay" over three lines and split the actor reference across
                two, so a row about one award looked like three.
              */}
              <Table
                className="min-w-[28rem]"
                caption={`Side activity points awarded to ${selected.name}, in the order they were entered`}
              >
                <THead>
                  <TR>
                    <TH numeric>Entered (UTC)</TH>
                    <TH>Activity</TH>
                    <TH numeric>Points</TH>
                    <TH>By</TH>
                  </TR>
                </THead>
                <TBody>
                  {activities.map((activity) => {
                    const when = enteredAtParts(activity.enteredAt);
                    const who = actor(activity.enteredBy);
                    return (
                      <TR key={activity.id}>
                        <TD numeric className="whitespace-nowrap align-top">
                          <Stacked value={when.time} detail={when.date} className="items-end" />
                        </TD>
                        <TD className="align-top">{activity.label}</TD>
                        <TD numeric className="align-top">
                          {/* The sign is the whole meaning of a correction, so it is never dropped. */}
                          {activity.points > 0 ? `+${String(activity.points)}` : activity.points}
                        </TD>
                        {/*
                          The full `actorLabel` string is what matches this entry to its AuditLog
                          row, so it stays reachable — on hover and announced — rather than being
                          the thing printed where a name belongs.
                        */}
                        <TD className="align-top" title={activity.enteredBy}>
                          <Stacked
                            value={who.role}
                            detail={who.ref === "" ? undefined : `…${who.ref}`}
                          />
                          <span className="sr-only">, session {activity.enteredBy}</span>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
