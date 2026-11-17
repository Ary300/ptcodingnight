"use client";

import { useCallback, useEffect, useState } from "react";

import { formatEventTime } from "@/lib/contest/event-time";
import { sameAwardSource } from "@/lib/contest/award-source";
import { API_ROUTES, type SideActivityRowView } from "@/lib/schemas/api";
import { Button } from "@/components/ui";
import { Select, TextInput } from "@/components/admin/Field";
import { Panel } from "@/components/admin/Panel";
import { SideActivityHistory } from "@/components/admin/SideActivityHistory";
import {
  AWARD_SOURCES,
  KAHOOT_HINT,
  composeAwardLabel,
  isKahoot,
  pointsWord,
  seatLabel,
  signedPoints,
  type AwardSource,
} from "@/components/admin/side-activity-format";

/**
 * Admin side-activity entry: the paper puzzles and the Kahoot placing (PRD §9.2).
 *
 * **The only score input with no submission behind it**, so every award says where its points
 * came from. Entry is three choices: what it was for (Sudoku, another puzzle by name, or Kahoot),
 * which team, the points, and optionally which seat or student on the team it was for. Those
 * compose the award's label, "Sudoku, seat A, Avery Brooks", which is what the breakdown on the
 * awards screen, the export and the audit log all show.
 *
 * - A team holds several awards, a puzzle per member plus a Kahoot placing, and each is edited or
 *   removed on its own row below. The server audits both with what the award said before.
 * - The same source twice for one team is the likely mistake (two laptops, one sudoku), so the
 *   form warns while it is being filled in, and the server refuses it until it is confirmed.
 * - Points are added **flat** to the team total, not divided by team size, so a typo is not
 *   diluted the way a problem score would be. The field is bounded and the screen says so.
 *
 * The entry is read back three times: an echo under the points field states the team and signed
 * amount before the button is pressed, the button names the team, and the receipt afterwards
 * restates it with the team's new total.
 *
 * Muted text is `text-ink/60` and never lower (docs/DESIGN.md §7). No wrapper `opacity-*` is used
 * to mute text, because it multiplies with child alpha.
 */

interface TeamOption {
  teamId: string;
  name: string;
  teamSize: number;
  sideActivityPoints: number;
}

interface SeatOption {
  participantId: string;
  displayName: string;
  chosenSetLabel: string | null;
  teamId: string;
}

export interface SideActivityEntryProps {
  contestId: string;
}

/** Matches the API's bound. Stated here so the form can refuse before a round trip. */
const MAX_POINTS = 1000;

/** The "For" choice that means the whole team, which is what Kahoot always is. */
const WHOLE_TEAM = "";

function unwrap(body: unknown): unknown {
  return typeof body === "object" && body !== null && "data" in body
    ? (body as { data: unknown }).data
    : body;
}

function errorMessage(body: unknown, fallback: string): string {
  return typeof body === "object" && body !== null && "error" in body
    ? ((body as { error?: { message?: string } | null }).error?.message ??
        fallback)
    : fallback;
}

export function SideActivityEntry({ contestId }: SideActivityEntryProps) {
  const [teams, setTeams] = useState<readonly TeamOption[]>([]);
  const [seats, setSeats] = useState<readonly SeatOption[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [source, setSource] = useState<AwardSource | null>(null);
  const [activity, setActivity] = useState("");
  const [forWhom, setForWhom] = useState(WHOLE_TEAM);
  const [points, setPoints] = useState("");
  const [activities, setActivities] = useState<readonly SideActivityRowView[]>(
    [],
  );
  const [historyFailed, setHistoryFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateRefusal, setDuplicateRefusal] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  /*
    "Recorded: +60 points to Int Four for Kahoot" belongs to the award just entered. It used to stay
    on screen while the organizer picked the next preset and team, so it read as a description of
    the NEW form. Any edit to the form clears it.
  */
  const clearConfirmation = (): void => setConfirmation(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [pointsError, setPointsError] = useState<string | null>(null);

  const fetchTeams = useCallback(async (): Promise<readonly TeamOption[]> => {
    const response = await fetch(`/api/contests/${contestId}/team-standings`, {
      cache: "no-store",
    });
    const payload = unwrap(await response.json()) as {
      teams?: TeamOption[];
    } | null;
    return payload?.teams ?? [];
  }, [contestId]);

  const fetchSeats = useCallback(async (): Promise<readonly SeatOption[]> => {
    const response = await fetch(API_ROUTES.adminRoster(contestId), {
      cache: "no-store",
    });
    const payload = unwrap(await response.json()) as {
      teams?: { teamId: string; members: Omit<SeatOption, "teamId">[] }[];
    } | null;
    return (payload?.teams ?? []).flatMap((team) =>
      team.members.map((member) => ({ ...member, teamId: team.teamId })),
    );
  }, [contestId]);

  const fetchActivities = useCallback(
    async (id: string): Promise<readonly SideActivityRowView[]> => {
      if (id === "") return [];
      const response = await fetch(API_ROUTES.adminTeamSideActivities(id), {
        cache: "no-store",
      });
      const payload = unwrap(await response.json()) as {
        activities?: SideActivityRowView[];
      } | null;
      return payload?.activities ?? [];
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loadedTeams, loadedSeats] = await Promise.all([
          fetchTeams(),
          fetchSeats(),
        ]);
        if (!cancelled) {
          setTeams(loadedTeams);
          setSeats(loadedSeats);
        }
      } catch {
        if (!cancelled)
          setFormError(
            "Could not load the teams. Check the server is running.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTeams, fetchSeats]);

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
        // Not an alert: the award form still works. It must not pass for an empty history.
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

  /** Re-read the team list and this team's awards after any change; returns the new total. */
  const refresh = useCallback(async (): Promise<number | undefined> => {
    const [refreshedTeams, refreshedActivities] = await Promise.all([
      fetchTeams(),
      fetchActivities(teamId),
    ]);
    setTeams(refreshedTeams);
    setActivities(refreshedActivities);
    return refreshedTeams.find((candidate) => candidate.teamId === teamId)
      ?.sideActivityPoints;
  }, [fetchTeams, fetchActivities, teamId]);

  const label = composeAwardLabel(activity, forWhom);
  const selected = teams.find((team) => team.teamId === teamId);
  const teamSeats = seats
    .filter((seat) => seat.teamId === teamId)
    .sort(
      (a, b) =>
        (a.chosenSetLabel ?? "~").localeCompare(b.chosenSetLabel ?? "~") ||
        a.displayName.localeCompare(b.displayName),
    );
  const alreadyHeld =
    activity.trim() === ""
      ? undefined
      : activities.find((existing) => sameAwardSource(existing.label, label));

  const submit = async (confirmDuplicate: boolean): Promise<void> => {
    setFormError(null);
    setConfirmation(null);
    setTeamError(null);
    setLabelError(null);
    setPointsError(null);
    setDuplicateRefusal(null);

    const parsed = Number(points);
    let refused = false;
    if (teamId === "") {
      setTeamError("Choose a team.");
      refused = true;
    }
    if (activity.trim() === "") {
      setLabelError(
        source === "Another puzzle"
          ? "Type the puzzle's name. It appears on the team's breakdown."
          : "Say what the award is for. It appears on the team's breakdown.",
      );
      refused = true;
    }
    if (
      points.trim() === "" ||
      !Number.isInteger(parsed) ||
      Math.abs(parsed) > MAX_POINTS
    ) {
      setPointsError(
        `Points must be a whole number between -${String(MAX_POINTS)} and ${String(MAX_POINTS)}.`,
      );
      refused = true;
    }
    // Every bad field at once, so a form is not discovered one refusal at a time.
    if (refused) return;

    setBusy(true);
    try {
      const response = await fetch(API_ROUTES.adminTeamSideActivities(teamId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, points: parsed, confirmDuplicate }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 409) {
        // The team already holds this award. Nothing was recorded; the organizer decides.
        setDuplicateRefusal(
          errorMessage(body, "That team already has this award."),
        );
        return;
      }
      if (!response.ok) {
        setFormError(errorMessage(body, "That was refused."));
        return;
      }

      // Set before the refresh: the award is recorded, and a failed refresh must not say
      // otherwise.
      const recorded = `${signedPoints(parsed)} ${pointsWord(parsed)} to ${selected?.name ?? "the team"} for ${label}.`;
      setConfirmation(recorded);
      setForWhom(WHOLE_TEAM);
      setPoints("");
      try {
        const total = await refresh();
        if (total !== undefined) {
          setConfirmation(
            `${recorded} Their puzzle and Kahoot total is now ${String(total)} ${pointsWord(total)}.`,
          );
        }
      } catch {
        // Only the refresh failed; the receipt already says the award is recorded.
      }
    } catch {
      setFormError("Could not reach the server. The award was not recorded.");
    } finally {
      setBusy(false);
    }
  };

  const change = async (
    url: string,
    init: RequestInit,
    fallback: string,
  ): Promise<string | null> => {
    setBusy(true);
    setConfirmation(null);
    try {
      const response = await fetch(url, init);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) return errorMessage(body, fallback);
      try {
        await refresh();
      } catch {
        // The change landed; the table catches up on the next team change.
      }
      return null;
    } catch {
      return "Could not reach the server. Nothing was changed.";
    } finally {
      setBusy(false);
    }
  };

  const parsedPreview = Number(points);
  const previewValue =
    points.trim() !== "" &&
    Number.isInteger(parsedPreview) &&
    Math.abs(parsedPreview) <= MAX_POINTS
      ? parsedPreview
      : null;

  return (
    <div className="flex flex-col gap-section">
      <Panel
        title="Award points"
        level="framed"
        className="max-w-2xl"
        description="Puzzle and Kahoot points are added directly to the team total and recorded in the audit log."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
          className="flex flex-col gap-group"
        >
          {/*
            What it was for, first: the source is the thing an organizer is holding in their hand
            (a sudoku sheet, the Kahoot podium). `aria-pressed` marks the source the field holds,
            and clears the moment the field is edited away from it.
          */}
          <div
            role="group"
            aria-label="What the award is for"
            className="flex flex-wrap gap-2"
          >
            {AWARD_SOURCES.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="secondary"
                size="sm"
                aria-pressed={
                  preset === "Another puzzle"
                    ? source === preset
                    : sameAwardSource(activity, preset)
                }
                onClick={() => {
                  setSource(preset);
                  setActivity(preset === "Another puzzle" ? "" : preset);
                  if (preset === "Kahoot") setForWhom(WHOLE_TEAM);
                  setLabelError(null);
                  setDuplicateRefusal(null);
                  clearConfirmation();
                }}
              >
                {preset}
              </Button>
            ))}
          </div>

          <TextInput
            label={
              source === "Another puzzle" ? "Puzzle name" : "What it was for"
            }
            required
            error={labelError}
            value={activity}
            maxLength={100}
            placeholder={source === "Another puzzle" ? "Cipher" : "Sudoku"}
            hint={isKahoot(activity) ? KAHOOT_HINT : undefined}
            onChange={(event) => {
              setActivity(event.target.value);
              setLabelError(null);
              setDuplicateRefusal(null);
              clearConfirmation();
            }}
          />

          <Select
            label="Team"
            required
            error={teamError}
            value={teamId}
            onChange={(event) => {
              setTeamId(event.target.value);
              setForWhom(WHOLE_TEAM);
              setTeamError(null);
              setDuplicateRefusal(null);
              clearConfirmation();
            }}
          >
            <option value="">Choose a team…</option>
            {teams.map((team) => (
              <option key={team.teamId} value={team.teamId}>
                {team.name} ({team.teamSize}{" "}
                {team.teamSize === 1 ? "player" : "players"})
              </option>
            ))}
          </Select>

          {/*
            Optional: which seat or student the award is for. A team of four can hand in four
            puzzles, and "Sudoku" four times on a breakdown says nothing about which was whose.
          */}
          {selected !== undefined && !isKahoot(activity) && (
            <Select
              label="Seat or student (optional)"
              value={forWhom}
              onChange={(event) => {
                setForWhom(event.target.value);
                setDuplicateRefusal(null);
                clearConfirmation();
              }}
            >
              <option value={WHOLE_TEAM}>(the whole team)</option>
              {teamSeats.map((seat) => {
                const value = seatLabel(seat.chosenSetLabel, seat.displayName);
                return (
                  <option key={seat.participantId} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                );
              })}
            </Select>
          )}

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
            style={{ width: "8rem" }}
            hint={
              <>
                Added <strong>flat</strong> to the team total, not divided by
                team size, so a typo is not softened the way a problem score
                would be. A wrong award can be edited or removed below, and the
                audit log keeps what it said before.
              </>
            }
            onChange={(event) => {
              setPoints(event.target.value);
              setPointsError(null);
              clearConfirmation();
            }}
          />

          {selected !== undefined && (
            <p
              className="motion-swap-in rounded-chip border border-rule-edge bg-ink/[0.02] px-3 py-2"
              style={{ fontSize: "var(--text-sm)" }}
            >
              {previewValue === null ? (
                <>
                  Points entered here go to <strong>{selected.name}</strong> (
                  {selected.teamSize}{" "}
                  {selected.teamSize === 1 ? "player" : "players"}).
                </>
              ) : previewValue < 0 ? (
                <>
                  This will remove{" "}
                  <strong className="numeric">
                    {String(Math.abs(previewValue))}
                  </strong>{" "}
                  {pointsWord(previewValue)} from{" "}
                  <strong>{selected.name}</strong>
                  {activity.trim() === "" ? "." : <> for {label}.</>}
                </>
              ) : (
                <>
                  This will add{" "}
                  <strong className="numeric">
                    {signedPoints(previewValue)}
                  </strong>{" "}
                  {pointsWord(previewValue)} to <strong>{selected.name}</strong>
                  {activity.trim() === "" ? "." : <> for {label}.</>}
                </>
              )}
            </p>
          )}

          {/* The live duplicate warning: shown while the form is filled in, before any refusal. */}
          {selected !== undefined &&
            alreadyHeld !== undefined &&
            duplicateRefusal === null && (
              <p
                className="motion-swap-in rounded-chip border border-rule-firm px-3 py-2 font-semibold"
                style={{ fontSize: "var(--text-sm)" }}
              >
                {selected.name} already has {alreadyHeld.label} for{" "}
                {signedPoints(alreadyHeld.points)}, entered at{" "}
                {formatEventTime(alreadyHeld.enteredAt)}. To change it, use Edit
                in the list below.
              </p>
            )}

          {duplicateRefusal !== null && (
            <div
              role="alert"
              className="motion-swap-in flex flex-col gap-2 rounded-chip border border-rule-firm px-3 py-2"
              style={{ fontSize: "var(--text-sm)" }}
            >
              <p className="font-semibold">Not recorded. {duplicateRefusal}</p>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void submit(true)}
                >
                  Record it as a second award
                </Button>
              </div>
            </div>
          )}

          {formError !== null && (
            <p
              role="alert"
              className="motion-swap-in font-semibold text-panther"
              style={{ fontSize: "var(--text-sm)" }}
            >
              {formError}
            </p>
          )}

          {confirmation !== null && (
            <p
              role="status"
              className="motion-swap-in rounded-chip border border-rule-firm bg-ink/[0.04] px-3 py-2"
              style={{ fontSize: "var(--text-sm)" }}
            >
              <strong>Recorded:</strong> {confirmation}
            </p>
          )}

          <div>
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

      <Panel
        title={
          selected === undefined
            ? "Awarded so far"
            : `${selected.name}: awarded so far`
        }
        level="bare"
        className="max-w-3xl"
        aside={
          selected === undefined ? undefined : (
            <span
              className="text-ink/60"
              style={{ fontSize: "var(--text-sm)" }}
            >
              {selected.sideActivityPoints} points total
            </span>
          )
        }
      >
        {selected === undefined ? (
          <p className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
            Pick a team above to see its awards. Each is listed with what it was
            for, when it was entered and who entered it, and can be edited or
            removed on its own.
          </p>
        ) : activities.length === 0 ? (
          <p className="text-ink/60" style={{ fontSize: "var(--text-sm)" }}>
            {historyFailed
              ? "The awards could not be loaded. The form above still works."
              : "Nothing awarded yet."}
          </p>
        ) : (
          <SideActivityHistory
            key={teamId}
            teamName={selected.name}
            activities={activities}
            busy={busy}
            maxPoints={MAX_POINTS}
            onEdit={(activityId, nextLabel, nextPoints) =>
              change(
                API_ROUTES.adminTeamSideActivity(teamId, activityId),
                {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    label: nextLabel,
                    points: nextPoints,
                  }),
                },
                "That edit was refused.",
              )
            }
            onRemove={(activityId) =>
              change(
                API_ROUTES.adminTeamSideActivity(teamId, activityId),
                { method: "DELETE" },
                "That award could not be removed.",
              )
            }
          />
        )}
      </Panel>
    </div>
  );
}
