"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Select, TextInput } from "@/components/admin/Field";
import { AlertPlate, Panel } from "@/components/admin/Panel";
import {
  ContestDraftSchema,
  SCORING_PRESETS,
  type ContestDraft,
  type DivisionDraft,
  type ScoringPresetId,
} from "@/components/admin/contract";

/**
 * Contest builder — name, window, divisions, scoring preset, join code, freeze time
 * (PRD §9.2).
 *
 * Validation is `ContestDraftSchema`, the same Zod schema the route will parse, so the form
 * cannot drift from the server's idea of a valid contest. The client check is a courtesy;
 * the API is the authority.
 */

const EMPTY_DRAFT: ContestDraft = {
  name: "",
  startsAtLocal: "",
  endsAtLocal: "",
  freezeAtLocal: "",
  scoringPresetId: "classic",
  divisions: [
    { key: "d1", name: "Intermediate" },
    { key: "d2", name: "Advanced" },
  ],
};

type Errors = Readonly<Record<string, string>>;

function toPresetId(value: string): ScoringPresetId {
  const match = SCORING_PRESETS.find((p) => p.id === value);
  return match?.id ?? "classic";
}

function collectErrors(draft: ContestDraft): Errors {
  const parsed = ContestDraftSchema.safeParse(draft);
  if (parsed.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "form";
    // First issue per field wins — a stack of three messages under one input is noise.
    if (errors[key] === undefined) errors[key] = issue.message;
  }
  return errors;
}

export interface ContestBuilderProps {
  initial?: ContestDraft;
}

export function ContestBuilder({ initial = EMPTY_DRAFT }: ContestBuilderProps) {
  const [draft, setDraft] = useState<ContestDraft>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const update = <K extends keyof ContestDraft>(key: K, value: ContestDraft[K]): void => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  };

  const renameDivision = (key: string, name: string): void => {
    update(
      "divisions",
      draft.divisions.map((d) => (d.key === key ? { ...d, name } : d)),
    );
  };

  const addDivision = (): void => {
    const next: DivisionDraft = { key: `d${Date.now()}`, name: "" };
    update("divisions", [...draft.divisions, next]);
  };

  const removeDivision = (key: string): void => {
    update(
      "divisions",
      draft.divisions.filter((d) => d.key !== key),
    );
  };

  /**
   * Create the contest.
   *
   * This used to validate the draft and then set a "saved" flag, next to a comment explaining that
   * there was no route to call. There is one now, and the organizer's first job — the one every
   * other screen depends on — no longer requires running a seed script.
   *
   * `datetime-local` yields wall-clock text with no zone, which is not an instant. `new Date(...)`
   * on that string resolves it in the BROWSER's zone, which is the organizer's, which is the one
   * they typed it in. Converting here rather than sending the raw string is what stops a contest
   * starting an hour early on a server set to UTC.
   */
  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const found = collectErrors(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setSaved(false);
    setFormError(null);
    try {
      const response = await fetch("/api/admin/contests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          startsAt: new Date(draft.startsAtLocal).toISOString(),
          endsAt: new Date(draft.endsAtLocal).toISOString(),
          freezeAt: draft.freezeAtLocal === "" ? null : new Date(draft.freezeAtLocal).toISOString(),
          scoringPresetId: draft.scoringPresetId,
          divisions: draft.divisions.map((d) => d.name),
        }),
      });

      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: { message?: unknown } }).error.message ?? "")
            : "";
        setFormError(message === "" ? "That contest could not be created." : message);
        return;
      }

      const id =
        typeof body === "object" && body !== null && "data" in body
          ? (body as { data: { contestId?: unknown } }).data.contestId
          : null;
      setSaved(true);
      if (typeof id === "string") setCreatedId(id);
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const preset = SCORING_PRESETS.find((p) => p.id === draft.scoringPresetId);
  const divisionError = errors["divisions"];

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-6">
      <Panel
        title="Contest"
        description="The window, the divisions, the preset and the freeze are what nobody wants to be deciding at 6:55pm. Set them now. A contest is created as a DRAFT — students cannot see it until you publish it."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput
            label="Contest name"
            required
            value={draft.name}
            maxLength={120}
            error={errors["name"] ?? null}
            onChange={(e) => update("name", e.target.value)}
          />


          <TextInput
            label="Starts at"
            type="datetime-local"
            required
            numeric
            value={draft.startsAtLocal}
            error={errors["startsAtLocal"] ?? null}
            onChange={(e) => update("startsAtLocal", e.target.value)}
          />

          <TextInput
            label="Ends at"
            type="datetime-local"
            required
            numeric
            value={draft.endsAtLocal}
            error={errors["endsAtLocal"] ?? null}
            onChange={(e) => update("endsAtLocal", e.target.value)}
          />

          <TextInput
            label="Freeze at"
            type="datetime-local"
            numeric
            value={draft.freezeAtLocal}
            error={errors["freezeAtLocal"] ?? null}
            hint="After this the public board stops updating while judging continues. Leave blank for no freeze."
            onChange={(e) => update("freezeAtLocal", e.target.value)}
          />

          <Select
            label="Scoring preset"
            required
            value={draft.scoringPresetId}
            error={errors["scoringPresetId"] ?? null}
            hint={preset?.summary}
            onChange={(e) => update("scoringPresetId", toPresetId(e.target.value))}
          >
            {SCORING_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </Panel>

      <Panel
        title="Divisions"
        description="Divisions rank independently — there is an Intermediate winner and an Advanced winner (PRD §6.1)."
        aside={
          <span className="numeric opacity-70" style={{ fontSize: "var(--text-xs)" }}>
            {draft.divisions.length} division{draft.divisions.length === 1 ? "" : "s"}
          </span>
        }
      >
        <ul className="flex flex-col gap-3">
          {draft.divisions.map((division, index) => (
            <li key={division.key} className="flex items-end gap-2">
              <span
                className="numeric pb-2 opacity-60"
                style={{ fontSize: "var(--text-xs)" }}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="flex-1">
                <TextInput
                  label={`Division ${index + 1} name`}
                  required
                  value={division.name}
                  maxLength={40}
                  error={errors[`divisions.${index}.name`] ?? null}
                  onChange={(e) => renameDivision(division.key, e.target.value)}
                />
              </div>
              <ConfirmButton
                label="Remove"
                confirmLabel="Remove division"
                disabled={draft.divisions.length === 1}
                onConfirm={() => removeDivision(division.key)}
              />
            </li>
          ))}
        </ul>

        {divisionError !== undefined && (
          <p role="alert" className="mt-3 font-semibold text-panther" style={{ fontSize: "var(--text-xs)" }}>
            {divisionError}
          </p>
        )}

        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={addDivision}>
            Add division
          </Button>
        </div>
      </Panel>

      {Object.keys(errors).length > 0 && (
        <AlertPlate tone="alarm" title="This contest will not save yet">
          <ul className="list-disc pl-5">
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </AlertPlate>
      )}

      {formError !== null && (
        <AlertPlate tone="alarm" title="The server refused this contest">
          {formError}
        </AlertPlate>
      )}

      {/*
        The action bar HackerRank puts at the foot of its contest admin: the primary action on the
        right, and what to do NEXT beside it once the thing exists. A "saved" message that only
        says "saved" leaves an organizer on a form with nothing to press, when what they actually
        want is to go and put problems in it.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/12 pt-4">
        <div>
          {saved && (
            <span role="status" className="font-semibold" style={{ fontSize: "var(--text-sm)" }}>
              Created as a <strong>DRAFT</strong>. Students cannot see it yet.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {saved && createdId !== null && (
            <>
              <Link
                href={`/admin/teams?contest=${encodeURIComponent(createdId)}`}
                className="rounded border border-ink/25 px-3 py-2 font-semibold hover:border-ink/50"
                style={{ fontSize: "var(--text-sm)" }}
              >
                Build the roster
              </Link>
              <Link
                href="/admin/problems"
                className="rounded border border-ink/25 px-3 py-2 font-semibold hover:border-ink/50"
                style={{ fontSize: "var(--text-sm)" }}
              >
                Add problems
              </Link>
            </>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create contest"}
          </Button>
        </div>
      </div>
    </form>
  );
}
