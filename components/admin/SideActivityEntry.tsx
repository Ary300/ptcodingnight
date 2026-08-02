"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEventDateParts } from "@/lib/contest/event-time";

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
 * ## The entry is read back three times
 *
 * A wrong number here silently changes a team score, so the form narrates itself: an echo under
 * the points field states the team and the signed amount BEFORE the button is pressed, the button
 * itself names the team, and the confirmation afterwards restates team, label, signed points and
 * the team's new side-activity total. Points render as signed integers everywhere; a float here
 * would claim a precision hand-entered whole points do not have.
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

/**
 * Awards always render signed and always as integers. The sign is the whole meaning of a
 * correction, and a float here would imply a precision this screen does not have: side-activity
 * points are whole points, entered by hand, added flat.
 */
function signedPoints(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

function pointsWord(value: number): string {
  return Math.abs(value) === 1 ? "point" : "points";
}

function unwrap(body: unknown): unknown {
  return typeof body === "object" && body !== null && "data" in body
    ? (body as { data: unknown }).data
    : body;
}

/**
 * Fixed timezone, like the submission feed: two laptops in the same room must not disagree about
 * when something was entered, in the room's own clock (Eastern), so 7:41 PM reads as
 * half past eleven at night in Indianapolis.
 */
function enteredAtParts(iso: string): { date: string; time: string } {
  return formatEventDateParts(iso);
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
  const [historyFailed, setHistoryFailed] = useState(false);
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
        if (!cancelled) {
          setActivities(loaded);
          setHistoryFailed(false);
        }
      } catch {
        // A failed history load is not worth an alert: the award form still works, and the
        // history is context rather than the task. But it must not masquerade as an empty
        // history — "Nothing awarded yet" beside a nonzero total is a claim, and a wrong one.
        if (!cancelled) {
          setActivities([]);
          setHistoryFailed(true);
        }
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

      /*
        The confirmation names the team, the label and the signed points, because this entry is
        the only record the award happened and the organizer's read-back of this line IS the
        verification step. It is set before the refresh: from here on the award is recorded, and
        a refresh failure must not be reported as "not recorded" (which is what this code used
        to do, with both fetches inside the same try).
      */
      const team = teams.find((candidate) => candidate.teamId === teamId);
      const recorded = `${signedPoints(parsed)} ${pointsWord(parsed)} to ${team?.name ?? "the team"} for ${label.trim()}.`;
      setConfirmation(recorded);
      setLabel("");
      setPoints("");
      try {
        const [refreshedTeams, refreshedActivities] = await Promise.all([
          fetchTeams(),
          fetchActivities(teamId),
        ]);
        setTeams(refreshedTeams);
        setActivities(refreshedActivities);
        const total = refreshedTeams.find(
          (candidate) => candidate.teamId === teamId,
        )?.sideActivityPoints;
        // The new total closes the loop: the organizer can check the arithmetic without
        // finding the history table, and a double-entry shows up as a total that grew twice.
        if (total !== undefined) {
          setConfirmation(
            `${recorded} Their side-activity total is now ${String(total)} ${pointsWord(total)}.`,
          );
        }
      } catch {
        // Only the refresh failed. The award is recorded and the confirmation already says so;
        // the history table will catch up on the next team change.
      }
    } catch {
      setFormError("Could not reach the server. The award was not recorded.");
    } finally {
      setBusy(false);
    }
  }, [teamId, label, points, teams, fetchTeams, fetchActivities]);

  const selected = teams.find((team) => team.teamId === teamId);

  /*
    The live echo under the points field. A wrong number here silently changes a team score, so
    the form reads the entry back in a full sentence BEFORE the button is pressed: which team,
    how many points, which direction. `previewValue` is null until the field holds an integer the
    API would accept, so the echo can never show a float or an out-of-bounds number.
  */
  const parsedPreview = Number(points);
  const previewValue =
    points.trim() !== "" && Number.isInteger(parsedPreview) && Math.abs(parsedPreview) <= MAX_POINTS
      ? parsedPreview
      : null;

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
        description="Side-activity points are added directly to the team total and recorded in the audit log."
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
            // A width the value can fill: this box holds a 5-character signed integer, and at
            // the control column's full width it was the most visible proportion error on the
            // screen. Inline, because TextInput owns className and w-full is in its base.
            style={{ width: "8rem" }}
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
            The team echoed next to the number it will change. Not announced live: it updates on
            every keystroke, and a screen reader user hears the same facts once, from the
            confirmation, after submitting.
          */}
          {selected !== undefined && (
            <p
              className="rounded-chip border border-rule-edge bg-ink/[0.02] px-3 py-2"
              style={{ fontSize: "var(--text-sm)" }}
            >
              {previewValue === null ? (
                <>
                  Points entered here go to <strong>{selected.name}</strong> ({selected.teamSize}{" "}
                  {selected.teamSize === 1 ? "player" : "players"}).
                </>
              ) : previewValue < 0 ? (
                <>
                  This will remove{" "}
                  <strong className="numeric">{String(Math.abs(previewValue))}</strong>{" "}
                  {pointsWord(previewValue)} from <strong>{selected.name}</strong>
                  {label.trim() === "" ? "." : <> for {label.trim()}.</>}
                </>
              ) : (
                <>
                  This will add <strong className="numeric">{signedPoints(previewValue)}</strong>{" "}
                  {pointsWord(previewValue)} to <strong>{selected.name}</strong>
                  {label.trim() === "" ? "." : <> for {label.trim()}.</>}
                </>
              )}
            </p>
          )}

          {/*
            A refusal from the SERVER, or the network. Field-level problems are answered at their
            field above; this slot is for the ones that belong to the form as a whole.
          */}
          {formError !== null && (
            <p role="alert" className="font-semibold text-panther" style={{ fontSize: "var(--text-sm)" }}>
              {formError}
            </p>
          )}

          {/*
            The receipt. Bordered so it cannot be mistaken for a hint, on paper ground so it
            cannot be mistaken for an alarm: `AlertPlate`'s dark plate is for things going wrong,
            and this is the one message on the screen that means everything went right.
          */}
          {confirmation !== null && (
            <p
              role="status"
              className="rounded-chip border border-rule-firm bg-ink/[0.04] px-3 py-2"
              style={{ fontSize: "var(--text-sm)" }}
            >
              <strong>Recorded:</strong> {confirmation}
            </p>
          )}

          <div>
            {/*
              The button repeats the team, so the last thing read before committing is the thing
              a typo here would hurt.
            */}
            <Button type="submit" disabled={busy}>
              {busy
                ? "Recording…"
                : selected === undefined
                  ? "Award points"
                  : `Award points to ${selected.name}`}
            </Button>
          </div>
        </form>
      </Panel>

      {/*
        Always rendered, even before a team is chosen. The whole region used to be behind
        `selected !== undefined`, so on arrival the screen showed no evidence any record is kept
        although the intro copy promises one — and the entries that existed were invisible. The
        history route is per-team, so with no team chosen the panel says what to do rather than
        listing nothing silently. Capped at the form's own width: the table used to run the full
        1240px canvas, putting an activity's name 500px from its points.
      */}
      <Panel
        title={selected === undefined ? "Awarded so far" : `${selected.name}: awarded so far`}
        level="bare"
        className="max-w-2xl"
        aside={
          selected === undefined ? undefined : (
            <span className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
              {selected.sideActivityPoints} points total
            </span>
          )
        }
      >
        {selected === undefined ? (
          <p className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
            Pick a team above to see its entries. Every award is listed with when it was entered
            and who entered it. Nothing is ever edited or deleted.
          </p>
        ) : activities.length === 0 ? (
            <p className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
              {historyFailed
                ? "The history could not be loaded. The award form above still works."
                : "Nothing awarded yet."}
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
                    <TH numeric>Entered (ET)</TH>
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
    </div>
  );
}
