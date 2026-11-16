"use client";

import { useState } from "react";

import { formatEventDateParts } from "@/lib/contest/event-time";
import type { SideActivityRowView } from "@/lib/schemas/api";
import {
  Button,
  Stacked,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { TextInput } from "@/components/admin/Field";
import {
  actorRole,
  pointsWord,
  signedPoints,
} from "@/components/admin/side-activity-format";

/**
 * One team's typed awards, each with where it came from, its points, who entered it and when,
 * and its own Edit and Remove.
 *
 * Every award is edited or removed on its own row, because a team holds several (a puzzle per
 * member and a Kahoot placing), and a correction that touched the wrong one would be worse than
 * the typo. The server audits both with what the award said before.
 *
 * Muted text is `text-ink/60` and never lower (docs/DESIGN.md §7).
 */

export interface SideActivityHistoryProps {
  teamName: string;
  activities: readonly SideActivityRowView[];
  busy: boolean;
  /** Resolves to an error message, or null when the change landed. */
  onEdit: (
    activityId: string,
    label: string,
    points: number,
  ) => Promise<string | null>;
  onRemove: (activityId: string) => Promise<string | null>;
  maxPoints: number;
}

export function SideActivityHistory({
  teamName,
  activities,
  busy,
  onEdit,
  onRemove,
  maxPoints,
}: SideActivityHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftPoints, setDraftPoints] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);

  const startEdit = (activity: SideActivityRowView): void => {
    setEditingId(activity.id);
    setDraftLabel(activity.label);
    setDraftPoints(String(activity.points));
    setRowError(null);
  };

  const saveEdit = async (activityId: string): Promise<void> => {
    const points = Number(draftPoints);
    if (draftLabel.trim() === "") {
      setRowError("Say what the award was for.");
      return;
    }
    if (
      draftPoints.trim() === "" ||
      !Number.isInteger(points) ||
      Math.abs(points) > maxPoints
    ) {
      setRowError(
        `Points must be a whole number between -${String(maxPoints)} and ${String(maxPoints)}.`,
      );
      return;
    }
    const failure = await onEdit(activityId, draftLabel.trim(), points);
    if (failure === null) {
      setEditingId(null);
      setRowError(null);
    } else {
      setRowError(failure);
    }
  };

  return (
    <div className="relative w-full min-w-0 overflow-x-auto">
      <Table
        className="min-w-[34rem]"
        caption={`Awards to ${teamName}, in the order they were entered, with what each was for`}
      >
        <THead>
          <TR>
            <TH numeric>Entered (ET)</TH>
            <TH>For</TH>
            <TH numeric>Points</TH>
            <TH>By</TH>
            <TH>Change</TH>
          </TR>
        </THead>
        <TBody>
          {activities.map((activity) => {
            const when = formatEventDateParts(activity.enteredAt);
            const who = actorRole(activity.enteredBy);
            // What this row's buttons are named, so a list of "Remove" buttons is never ambiguous.
            const awardName = `${activity.label}, ${signedPoints(activity.points)} ${pointsWord(activity.points)}`;
            const editing = editingId === activity.id;
            return (
              <TR key={activity.id}>
                <TD numeric className="whitespace-nowrap align-top">
                  <Stacked
                    value={when.time}
                    detail={when.date}
                    className="items-end"
                  />
                </TD>
                {editing ? (
                  <TD className="align-top" colSpan={2}>
                    <form
                      className="flex flex-col gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveEdit(activity.id);
                      }}
                    >
                      <TextInput
                        label="For"
                        value={draftLabel}
                        maxLength={120}
                        onChange={(event) => setDraftLabel(event.target.value)}
                      />
                      <TextInput
                        label="Points"
                        numeric
                        type="number"
                        inputMode="numeric"
                        step={1}
                        min={-maxPoints}
                        max={maxPoints}
                        style={{ width: "8rem" }}
                        value={draftPoints}
                        onChange={(event) => setDraftPoints(event.target.value)}
                      />
                      {rowError !== null && (
                        <p
                          role="alert"
                          className="font-semibold text-panther"
                          style={{ fontSize: "var(--text-sm)" }}
                        >
                          {rowError}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" size="sm" disabled={busy}>
                          Save award
                        </Button>
                        <Button
                          type="button"
                          variant="quiet"
                          size="sm"
                          onClick={() => {
                            setEditingId(null);
                            setRowError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </TD>
                ) : (
                  <>
                    <TD className="align-top">{activity.label}</TD>
                    <TD numeric className="align-top">
                      {signedPoints(activity.points)}
                    </TD>
                  </>
                )}
                <TD className="align-top">
                  <Stacked value={who} detail={when.time} />
                </TD>
                <TD className="align-top">
                  {!editing && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        disabled={busy}
                        aria-label={`Edit award: ${awardName}`}
                        onClick={() => startEdit(activity)}
                      >
                        Edit
                      </Button>
                      <ConfirmButton
                        label="Remove"
                        accessibleName={`Remove award: ${awardName}`}
                        confirmLabel={`Remove ${signedPoints(activity.points)}`}
                        confirmAccessibleName={`Confirm removing award: ${awardName}`}
                        variant="quiet"
                        size="sm"
                        disabled={busy}
                        onConfirm={() => {
                          void onRemove(activity.id).then((failure) =>
                            setRowError(failure),
                          );
                        }}
                      />
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {editingId === null && rowError !== null && (
        <p
          role="alert"
          className="mt-2 font-semibold text-panther"
          style={{ fontSize: "var(--text-sm)" }}
        >
          {rowError}
        </p>
      )}
    </div>
  );
}
